package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type managedWorkerTurnResult struct {
	outputText         string
	finishReason       string
	usage              JSONObject
	rawResponse        json.RawMessage
	workerOutputChunks []string
	toolProposals      []JSONObject
}

type managedWorkerProviderBoundary struct {
	RouteName     string
	ProviderID    string
	ProviderName  string
	BaseURL       string
	WireAPI       string
	EndpointRef   string
	CredentialRef string
	TokenEnvVar   string
	TokenValue    string
}

type managedWorkerContinuationRequest struct {
	Meta                ObjectMeta
	Profile             agentProfileConfig
	Task                *TaskRecord
	Session             *SessionRecord
	Worker              *SessionWorkerRecord
	Proposal            *sessionToolProposal
	ToolAction          *ToolActionRecord
	CommandText         string
	CommandCWD          string
	TimeoutSeconds      int
	ExecutionResult     *TerminalExecutionResult
	ExecutionError      string
	GovernedRun         *RunRecord
	SystemPrompt        string
	MaxOutputTokens     int
	PreviousOutputText  string
	PreviousRawResponse json.RawMessage
}

type managedWorkerAdapter interface {
	AdapterID() string
	UsesProviderRoutes() bool
	RunTurn(ctx context.Context, req AgentInvokeRequest, profile agentProfileConfig, boundary *managedWorkerProviderBoundary, fallback *invokeResult) (*managedWorkerTurnResult, error)
	ContinueTurn(ctx context.Context, req managedWorkerContinuationRequest, boundary *managedWorkerProviderBoundary) (*managedWorkerTurnResult, error)
}

type codexManagedWorkerAdapter struct {
	mode        string
	cliPath     string
	homeDir     string
	workdir     string
	sandboxMode string
	timeout     time.Duration
	runProcess  func(context.Context, codexProcessRequest) ([]byte, error)
}

func newCodexManagedWorkerAdapter(cfg AgentInvokerConfig) codexManagedWorkerAdapter {
	mode := strings.ToLower(strings.TrimSpace(cfg.ManagedCodexMode))
	if mode == "" {
		mode = "legacy"
	}
	timeout := cfg.CodexExecTimeout
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	sandboxMode := strings.TrimSpace(cfg.CodexSandboxMode)
	if mode == "process" {
		sandboxMode = "read-only"
	} else if sandboxMode == "" {
		sandboxMode = "read-only"
	}
	return codexManagedWorkerAdapter{
		mode:        mode,
		cliPath:     strings.TrimSpace(cfg.CodexCLIPath),
		homeDir:     strings.TrimSpace(cfg.CodexHome),
		workdir:     strings.TrimSpace(cfg.CodexWorkdir),
		sandboxMode: sandboxMode,
		timeout:     timeout,
	}
}

func (a codexManagedWorkerAdapter) AdapterID() string {
	return "codex"
}

func (a codexManagedWorkerAdapter) UsesProviderRoutes() bool {
	return !strings.EqualFold(strings.TrimSpace(a.mode), "process")
}

func (a codexManagedWorkerAdapter) RunTurn(ctx context.Context, req AgentInvokeRequest, profile agentProfileConfig, boundary *managedWorkerProviderBoundary, fallback *invokeResult) (*managedWorkerTurnResult, error) {
	if !a.UsesProviderRoutes() {
		return a.runCodexProcessTurn(ctx, req, profile, boundary)
	}
	if fallback == nil {
		return nil, fmt.Errorf("fallback invoke result is required for legacy managed Codex mode")
	}
	return &managedWorkerTurnResult{
		outputText:         fallback.outputText,
		finishReason:       fallback.finishReason,
		usage:              fallback.usage,
		rawResponse:        fallback.rawResponse,
		workerOutputChunks: splitManagedCodexOutput(fallback.outputText),
		toolProposals:      detectManagedCodexToolProposals(req.Prompt, fallback.outputText),
	}, nil
}

func (a codexManagedWorkerAdapter) ContinueTurn(ctx context.Context, req managedWorkerContinuationRequest, boundary *managedWorkerProviderBoundary) (*managedWorkerTurnResult, error) {
	if !a.UsesProviderRoutes() {
		profile := req.Profile
		if strings.TrimSpace(profile.ID) == "" {
			profile.ID = normalizeStringOrDefault(req.Worker.AgentProfileID, "codex")
		}
		if strings.TrimSpace(profile.Model) == "" {
			profile.Model = normalizeStringOrDefault(req.Worker.Model, "gpt-5-codex")
		}
		return a.runCodexProcessTurn(ctx, AgentInvokeRequest{
			Meta:            req.Meta,
			AgentProfileID:  normalizeStringOrDefault(profile.ID, "codex"),
			ExecutionMode:   AgentInvokeExecutionModeManagedCodexWorker,
			Prompt:          buildManagedCodexContinuationPrompt(req),
			SystemPrompt:    strings.TrimSpace(req.SystemPrompt),
			MaxOutputTokens: req.MaxOutputTokens,
		}, profile, boundary)
	}
	summary := buildManagedCodexLegacyContinuationSummary(req)
	return &managedWorkerTurnResult{
		outputText:         summary,
		finishReason:       "managed_worker_legacy_continuation",
		workerOutputChunks: splitManagedCodexOutput(summary),
		toolProposals:      nil,
	}, nil
}

func splitManagedCodexOutput(text string) []string {
	normalized := strings.TrimSpace(strings.ReplaceAll(text, "\r\n", "\n"))
	if normalized == "" {
		return nil
	}
	paragraphs := strings.Split(normalized, "\n\n")
	chunks := make([]string, 0, len(paragraphs))
	for _, paragraph := range paragraphs {
		trimmed := strings.TrimSpace(paragraph)
		if trimmed == "" {
			continue
		}
		if len(trimmed) <= 280 {
			chunks = append(chunks, trimmed)
			continue
		}
		lines := strings.Split(trimmed, "\n")
		var current strings.Builder
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if current.Len() > 0 && current.Len()+1+len(line) > 280 {
				chunks = append(chunks, current.String())
				current.Reset()
			}
			if current.Len() > 0 {
				current.WriteByte('\n')
			}
			current.WriteString(line)
		}
		if current.Len() > 0 {
			chunks = append(chunks, current.String())
		}
	}
	if len(chunks) == 0 {
		return []string{normalized}
	}
	if len(chunks) > 8 {
		return chunks[:8]
	}
	return chunks
}

func detectManagedCodexToolProposals(prompt, output string) []JSONObject {
	_ = prompt
	normalized := strings.ReplaceAll(output, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	proposals := make([]JSONObject, 0, 4)
	for idx := 0; idx < len(lines); idx++ {
		line := strings.TrimSpace(lines[idx])
		switch {
		case strings.HasPrefix(line, "```bash"), strings.HasPrefix(line, "```sh"), strings.HasPrefix(line, "```shell"), strings.HasPrefix(line, "```zsh"):
			block := make([]string, 0, 8)
			for idx = idx + 1; idx < len(lines); idx++ {
				next := strings.TrimSpace(lines[idx])
				if strings.HasPrefix(next, "```") {
					break
				}
				if next != "" {
					block = append(block, next)
				}
			}
			command := strings.TrimSpace(strings.Join(block, "\n"))
			if command != "" {
				proposals = append(proposals, JSONObject{
					"proposalId": fmt.Sprintf("proposal-terminal-%d", len(proposals)+1),
					"type":       "terminal_command",
					"summary":    "Managed Codex suggested a terminal command block.",
					"command":    command,
					"confidence": "heuristic",
				})
			}
		case strings.HasPrefix(line, "$ "):
			proposals = append(proposals, JSONObject{
				"proposalId": fmt.Sprintf("proposal-terminal-%d", len(proposals)+1),
				"type":       "terminal_command",
				"summary":    "Managed Codex suggested a terminal command.",
				"command":    strings.TrimSpace(strings.TrimPrefix(line, "$ ")),
				"confidence": "heuristic",
			})
		}
		if len(proposals) >= 4 {
			break
		}
	}
	return proposals
}
