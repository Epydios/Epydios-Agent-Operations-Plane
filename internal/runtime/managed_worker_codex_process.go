package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

type codexProcessRequest struct {
	CLIPath      string
	Prompt       string
	SystemPrompt string
	Model        string
	Workdir      string
	SandboxMode  string
	Timeout      time.Duration
	Boundary     *managedWorkerProviderBoundary
}

type codexStructuredProposal struct {
	Type              string `json:"type"`
	Summary           string `json:"summary"`
	Command           string `json:"command"`
	CWD               string `json:"cwd"`
	TimeoutSeconds    int    `json:"timeoutSeconds"`
	ReadOnlyRequested bool   `json:"readOnlyRequested"`
	Confidence        string `json:"confidence"`
}

type codexStructuredTurn struct {
	Message       string                    `json:"message"`
	ToolProposals []codexStructuredProposal `json:"tool_proposals"`
}

type codexProcessEvent struct {
	Type  string          `json:"type"`
	Item  json.RawMessage `json:"item,omitempty"`
	Usage JSONObject      `json:"usage,omitempty"`
	Error JSONObject      `json:"error,omitempty"`
}

type codexProcessItem struct {
	ID               string `json:"id,omitempty"`
	Type             string `json:"type,omitempty"`
	Text             string `json:"text,omitempty"`
	Command          string `json:"command,omitempty"`
	AggregatedOutput string `json:"aggregated_output,omitempty"`
	ExitCode         *int   `json:"exit_code,omitempty"`
	Status           string `json:"status,omitempty"`
}

func (a codexManagedWorkerAdapter) runCodexProcessTurn(ctx context.Context, req AgentInvokeRequest, profile agentProfileConfig, boundary *managedWorkerProviderBoundary) (*managedWorkerTurnResult, error) {
	workdir := strings.TrimSpace(a.workdir)
	if workdir == "" {
		if cwd, err := os.Getwd(); err == nil {
			workdir = cwd
		}
	}
	processReq := codexProcessRequest{
		CLIPath:      strings.TrimSpace(a.cliPath),
		Prompt:       strings.TrimSpace(req.Prompt),
		SystemPrompt: strings.TrimSpace(req.SystemPrompt),
		Model:        strings.TrimSpace(profile.Model),
		Workdir:      workdir,
		SandboxMode:  strings.TrimSpace(a.sandboxMode),
		Timeout:      a.timeout,
		Boundary:     boundary,
	}
	run := a.runProcess
	if run == nil {
		run = runCodexProcess
	}
	transcript, err := run(ctx, processReq)
	if err != nil {
		return nil, err
	}
	return parseCodexProcessTranscript(transcript)
}

func runCodexProcess(parent context.Context, req codexProcessRequest) ([]byte, error) {
	if parent == nil {
		parent = context.Background()
	}
	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	schemaPath, err := writeCodexOutputSchema()
	if err != nil {
		return nil, fmt.Errorf("write codex output schema: %w", err)
	}
	defer os.Remove(schemaPath)

	cliPath := resolveCodexCLIPath(req.CLIPath)
	args := []string{
		"exec",
		"--json",
		"--ephemeral",
		"--skip-git-repo-check",
		"-c", "analytics.enabled=false",
		"-s", normalizeCodexSandboxMode(req.SandboxMode),
	}
	env := os.Environ()
	if req.Boundary != nil {
		for _, item := range buildCodexBoundaryConfigArgs(req.Boundary) {
			args = append(args, "-c", item)
		}
		if envVar := strings.TrimSpace(req.Boundary.TokenEnvVar); envVar != "" && strings.TrimSpace(req.Boundary.TokenValue) != "" {
			env = append(env, envVar+"="+req.Boundary.TokenValue)
		}
	}
	if strings.TrimSpace(req.Workdir) != "" {
		args = append(args, "-C", strings.TrimSpace(req.Workdir))
	}
	if strings.TrimSpace(req.Model) != "" {
		args = append(args, "-m", strings.TrimSpace(req.Model))
	}
	args = append(args, "--output-schema", schemaPath, buildManagedCodexPrompt(req))

	cmd := exec.CommandContext(ctx, cliPath, args...)
	cmd.Env = env
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		combined := strings.TrimSpace(strings.Join([]string{stdout.String(), stderr.String()}, "\n"))
		if combined == "" {
			combined = err.Error()
		}
		return nil, fmt.Errorf("codex exec failed: %s", combined)
	}
	if stderr.Len() == 0 {
		return stdout.Bytes(), nil
	}
	joined := stdout.String()
	if strings.TrimSpace(joined) != "" {
		joined += "\n"
	}
	joined += stderr.String()
	return []byte(joined), nil
}

func buildCodexBoundaryConfigArgs(boundary *managedWorkerProviderBoundary) []string {
	if boundary == nil {
		return nil
	}
	providerID := normalizeStringOrDefault(boundary.ProviderID, "agentops_gateway")
	items := []string{
		fmt.Sprintf("model_provider=%q", providerID),
		fmt.Sprintf("model_providers.%s.name=%q", providerID, normalizeStringOrDefault(boundary.ProviderName, "AgentOps Gateway")),
		fmt.Sprintf("model_providers.%s.base_url=%q", providerID, strings.TrimSpace(boundary.BaseURL)),
		fmt.Sprintf("model_providers.%s.wire_api=%q", providerID, normalizeStringOrDefault(boundary.WireAPI, "responses")),
	}
	if envVar := strings.TrimSpace(boundary.TokenEnvVar); envVar != "" {
		items = append(items, fmt.Sprintf("model_providers.%s.bearer_token_env_var=%q", providerID, envVar))
	}
	return items
}

func buildManagedCodexProviderBoundary(route *invokeRoute) (*managedWorkerProviderBoundary, error) {
	if route == nil {
		return nil, fmt.Errorf("managed worker boundary route is required")
	}
	if strings.TrimSpace(route.profile.Transport) != "responses_api" {
		return nil, fmt.Errorf("managed Codex process boundary requires responses_api transport, got %q", route.profile.Transport)
	}
	baseURL, err := appendRequestPath(route.endpoint, "/v1")
	if err != nil {
		return nil, fmt.Errorf("build managed Codex boundary URL: %w", err)
	}
	boundary := &managedWorkerProviderBoundary{
		RouteName:     managedWorkerProcessRouteName(route),
		ProviderID:    "agentops_gateway",
		ProviderName:  "AgentOps Gateway",
		BaseURL:       baseURL,
		WireAPI:       "responses",
		EndpointRef:   strings.TrimSpace(route.endpointRef),
		CredentialRef: strings.TrimSpace(route.credentialRef),
	}
	if route.authMode == "bearer" && strings.TrimSpace(route.authValue) != "" {
		boundary.TokenEnvVar = "AGENTOPS_CODEX_GATEWAY_TOKEN"
		boundary.TokenValue = strings.TrimSpace(route.authValue)
	}
	return boundary, nil
}

func managedWorkerProcessRouteName(route *invokeRoute) string {
	if route == nil {
		return "managed_worker_process"
	}
	switch strings.TrimSpace(strings.ToLower(route.name)) {
	case "gateway":
		return "managed_worker_gateway_process"
	case "direct":
		return "managed_worker_provider_process"
	default:
		return "managed_worker_process"
	}
}

func resolveCodexCLIPath(configured string) string {
	if trimmed := strings.TrimSpace(configured); trimmed != "" {
		return trimmed
	}
	if path, err := exec.LookPath("codex"); err == nil {
		return path
	}
	return "/Applications/Codex.app/Contents/Resources/codex"
}

func normalizeCodexSandboxMode(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "workspace-write":
		return "workspace-write"
	case "danger-full-access":
		return "danger-full-access"
	default:
		return "read-only"
	}
}

func writeCodexOutputSchema() (string, error) {
	file, err := os.CreateTemp("", "agentops-codex-output-schema-*.json")
	if err != nil {
		return "", err
	}
	defer file.Close()
	schema := `{"type":"object","properties":{"message":{"type":"string"},"tool_proposals":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string"},"summary":{"type":"string"},"command":{"type":"string"},"cwd":{"type":"string"},"timeoutSeconds":{"type":"integer"},"readOnlyRequested":{"type":"boolean"},"confidence":{"type":"string"}},"required":["type","summary","command","cwd","timeoutSeconds","readOnlyRequested","confidence"],"additionalProperties":false}}},"required":["message","tool_proposals"],"additionalProperties":false}`
	if _, err := file.WriteString(schema); err != nil {
		return "", err
	}
	return file.Name(), nil
}

func buildManagedCodexPrompt(req codexProcessRequest) string {
	sections := make([]string, 0, 3)
	if strings.TrimSpace(req.SystemPrompt) != "" {
		sections = append(sections, "System instructions:\n"+strings.TrimSpace(req.SystemPrompt))
	}
	sections = append(sections, strings.Join([]string{
		"You are the managed Codex worker running under AgentOps.",
		"Return final operator-facing text in the `message` field.",
		"Use `tool_proposals` for terminal commands that should be reviewed before execution.",
		"Never execute mutating or environment-changing commands directly.",
		"If you use shell commands, keep them read-only inspection commands only.",
		"Each terminal proposal must use type=`terminal_command` and include command, cwd, timeoutSeconds, readOnlyRequested, and confidence.",
		"If no tool proposal is needed, return an empty `tool_proposals` array.",
	}, "\n"))
	sections = append(sections, "Operator request:\n"+strings.TrimSpace(req.Prompt))
	return strings.Join(sections, "\n\n")
}

func buildManagedCodexContinuationPrompt(req managedWorkerContinuationRequest) string {
	sections := make([]string, 0, 8)
	if strings.TrimSpace(req.SystemPrompt) != "" {
		sections = append(sections, "System instructions:\n"+strings.TrimSpace(req.SystemPrompt))
	}
	sections = append(sections, strings.Join([]string{
		"You are continuing the same managed Codex worker session under AgentOps after a governed tool action.",
		"Use the governed tool execution result below to continue the session from the current state.",
		"Return final operator-facing text in the `message` field.",
		"Use `tool_proposals` only if another governed tool step is strictly required.",
		"Never execute mutating or environment-changing commands directly.",
	}, "\n"))
	if req.Task != nil && strings.TrimSpace(req.Task.Intent) != "" {
		sections = append(sections, "Original task intent:\n"+strings.TrimSpace(req.Task.Intent))
	}
	if strings.TrimSpace(req.PreviousOutputText) != "" {
		sections = append(sections, "Previous managed worker output:\n"+truncateManagedCodexContinuationText(req.PreviousOutputText, 1600))
	}
	if req.Proposal != nil {
		details := []string{
			fmt.Sprintf("- proposalId: %s", strings.TrimSpace(req.Proposal.ProposalID)),
			fmt.Sprintf("- proposalType: %s", strings.TrimSpace(req.Proposal.ProposalType)),
			fmt.Sprintf("- summary: %s", strings.TrimSpace(req.Proposal.Summary)),
			fmt.Sprintf("- command: %s", strings.TrimSpace(req.CommandText)),
		}
		if strings.TrimSpace(req.CommandCWD) != "" {
			details = append(details, fmt.Sprintf("- cwd: %s", strings.TrimSpace(req.CommandCWD)))
		}
		if req.TimeoutSeconds > 0 {
			details = append(details, fmt.Sprintf("- timeoutSeconds: %d", req.TimeoutSeconds))
		}
		sections = append(sections, "Approved governed tool proposal:\n"+strings.Join(details, "\n"))
	}
	resultLines := []string{
		fmt.Sprintf("- status: %s", normalizeStringOrDefault(string(req.ToolAction.Status), "UNKNOWN")),
	}
	if req.ExecutionResult != nil {
		resultLines = append(resultLines,
			fmt.Sprintf("- exitCode: %d", req.ExecutionResult.ExitCode),
			fmt.Sprintf("- timedOut: %t", req.ExecutionResult.TimedOut),
			fmt.Sprintf("- outputTruncated: %t", req.ExecutionResult.Truncated),
		)
		if strings.TrimSpace(req.ExecutionResult.Output) != "" {
			resultLines = append(resultLines, "- output:\n"+truncateManagedCodexContinuationText(req.ExecutionResult.Output, 2400))
		}
	}
	if strings.TrimSpace(req.ExecutionError) != "" {
		resultLines = append(resultLines, fmt.Sprintf("- error: %s", strings.TrimSpace(req.ExecutionError)))
	}
	sections = append(sections, "Governed tool execution result:\n"+strings.Join(resultLines, "\n"))
	sections = append(sections, strings.Join([]string{
		"Continue the session from this point.",
		"If no further governed tool step is required, provide the final operator-facing answer.",
		"If another governed tool step is required, return the minimum necessary next `tool_proposals`.",
	}, "\n"))
	return strings.Join(sections, "\n\n")
}

func buildManagedCodexLegacyContinuationSummary(req managedWorkerContinuationRequest) string {
	summary := "Managed Codex reviewed the governed tool result and is ready for the next operator turn."
	if req.ExecutionResult == nil {
		if strings.TrimSpace(req.ExecutionError) != "" {
			return fmt.Sprintf("Managed Codex reviewed the governed tool failure: %s", strings.TrimSpace(req.ExecutionError))
		}
		return summary
	}
	statusText := "completed"
	if strings.TrimSpace(req.ExecutionError) != "" || req.ToolAction.Status == ToolActionStatusFailed {
		statusText = "failed"
	}
	base := fmt.Sprintf("Managed Codex reviewed the governed tool result (%s, exitCode=%d).", statusText, req.ExecutionResult.ExitCode)
	if strings.TrimSpace(req.ExecutionResult.Output) == "" {
		return base
	}
	return base + "\n" + truncateManagedCodexContinuationText(req.ExecutionResult.Output, 480)
}

func truncateManagedCodexContinuationText(value string, maxLen int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || maxLen <= 0 || len(trimmed) <= maxLen {
		return trimmed
	}
	return strings.TrimSpace(trimmed[:maxLen-3]) + "..."
}

func parseCodexProcessTranscript(transcript []byte) (*managedWorkerTurnResult, error) {
	lines := strings.Split(strings.ReplaceAll(string(transcript), "\r\n", "\n"), "\n")
	var (
		events           []JSONObject
		messageChunks    []string
		commandSummaries []string
		structured       codexStructuredTurn
		structuredFound  bool
		usage            JSONObject
	)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || !strings.HasPrefix(trimmed, "{") {
			continue
		}
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(trimmed), &raw); err != nil {
			continue
		}
		events = append(events, JSONObject(raw))
		var event codexProcessEvent
		if err := json.Unmarshal([]byte(trimmed), &event); err != nil {
			continue
		}
		switch strings.TrimSpace(event.Type) {
		case "item.started", "item.completed":
			var item codexProcessItem
			if err := json.Unmarshal(event.Item, &item); err != nil {
				continue
			}
			switch strings.TrimSpace(item.Type) {
			case "agent_message":
				text := strings.TrimSpace(item.Text)
				if text == "" {
					continue
				}
				if parsed, ok := parseStructuredCodexTurn(text); ok {
					structured = parsed
					structuredFound = true
					continue
				}
				messageChunks = append(messageChunks, text)
			case "command_execution":
				if summary := summarizeCodexCommandExecution(item); summary != "" {
					commandSummaries = append(commandSummaries, summary)
				}
			}
		case "turn.completed":
			if len(event.Usage) > 0 {
				usage = event.Usage
			}
		case "error", "turn.failed":
			return nil, fmt.Errorf("codex worker process reported failure: %s", trimmed)
		}
	}
	if !structuredFound {
		return nil, fmt.Errorf("codex worker process did not emit a structured final payload")
	}

	outputText := strings.TrimSpace(structured.Message)
	outputChunks := splitManagedCodexOutput(outputText)
	for _, summary := range commandSummaries {
		if strings.TrimSpace(summary) != "" {
			outputChunks = append(outputChunks, summary)
		}
	}
	if len(outputChunks) == 0 && len(messageChunks) > 0 {
		outputChunks = splitManagedCodexOutput(strings.Join(messageChunks, "\n\n"))
	}
	toolProposals := make([]JSONObject, 0, len(structured.ToolProposals))
	for idx, proposal := range structured.ToolProposals {
		proposalID := fmt.Sprintf("codex-proposal-%d", idx+1)
		toolProposals = append(toolProposals, JSONObject{
			"proposalId":        proposalID,
			"type":              normalizeStringOrDefault(proposal.Type, "terminal_command"),
			"summary":           strings.TrimSpace(proposal.Summary),
			"command":           strings.TrimSpace(proposal.Command),
			"cwd":               strings.TrimSpace(proposal.CWD),
			"timeoutSeconds":    proposal.TimeoutSeconds,
			"readOnlyRequested": proposal.ReadOnlyRequested,
			"confidence":        normalizeStringOrDefault(proposal.Confidence, "structured"),
		})
	}
	rawEvents, _ := json.Marshal(events)
	return &managedWorkerTurnResult{
		outputText:         outputText,
		finishReason:       "managed_worker_process",
		usage:              usage,
		rawResponse:        rawEvents,
		workerOutputChunks: outputChunks,
		toolProposals:      toolProposals,
	}, nil
}

func parseStructuredCodexTurn(text string) (codexStructuredTurn, bool) {
	var payload codexStructuredTurn
	if err := json.Unmarshal([]byte(strings.TrimSpace(text)), &payload); err != nil {
		return codexStructuredTurn{}, false
	}
	return payload, true
}

func summarizeCodexCommandExecution(item codexProcessItem) string {
	command := strings.TrimSpace(item.Command)
	if command == "" {
		return ""
	}
	status := strings.TrimSpace(strings.ToLower(item.Status))
	output := strings.TrimSpace(item.AggregatedOutput)
	base := fmt.Sprintf("Command %s: %s", normalizeStringOrDefault(status, "completed"), command)
	if output == "" {
		return base
	}
	outputLines := splitManagedCodexOutput(output)
	if len(outputLines) == 0 {
		return base
	}
	return base + "\n" + outputLines[0]
}
