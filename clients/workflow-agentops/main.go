package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	runtimeclient "github.com/Epydios/Epydios-AgentOps-Control-Plane/clients/internal/runtimeclient"
	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type workflowIntakePayload struct {
	SourceSystem    string                 `json:"sourceSystem"`
	TicketID        string                 `json:"ticketId,omitempty"`
	TicketURL       string                 `json:"ticketUrl,omitempty"`
	WorkflowID      string                 `json:"workflowId,omitempty"`
	WorkflowURL     string                 `json:"workflowUrl,omitempty"`
	Title           string                 `json:"title"`
	Intent          string                 `json:"intent"`
	RequestedBy     map[string]interface{} `json:"requestedBy,omitempty"`
	Labels          []string               `json:"labels,omitempty"`
	Annotations     map[string]interface{} `json:"annotations,omitempty"`
	InitialPrompt   string                 `json:"initialPrompt,omitempty"`
	ExecutionMode   string                 `json:"executionMode,omitempty"`
	AgentProfileID  string                 `json:"agentProfileId,omitempty"`
	SystemPrompt    string                 `json:"systemPrompt,omitempty"`
	MaxOutputTokens int                    `json:"maxOutputTokens,omitempty"`
}

type workflowIntakeResponse struct {
	Task   *runtimeapi.TaskRecord          `json:"task,omitempty"`
	Invoke *runtimeapi.AgentInvokeResponse `json:"invoke,omitempty"`
	Status *workflowStatusReport           `json:"status,omitempty"`
}

type workflowTurnResponse struct {
	Invoke *runtimeapi.AgentInvokeResponse `json:"invoke,omitempty"`
	Status *workflowStatusReport           `json:"status,omitempty"`
}

type workflowApprovalDecisionResult struct {
	Decision *runtimeapi.ApprovalCheckpointDecisionResponse `json:"decision,omitempty"`
}

type workflowProposalDecisionResult struct {
	Decision *runtimeapi.ToolProposalDecisionResponse `json:"decision,omitempty"`
}

type workflowLookupOptions struct {
	TaskID       string
	SourceSystem string
	TicketID     string
	WorkflowID   string
}

type workflowStatusReport struct {
	SourceSystem            string                                `json:"sourceSystem,omitempty"`
	TicketID                string                                `json:"ticketId,omitempty"`
	WorkflowID              string                                `json:"workflowId,omitempty"`
	TaskID                  string                                `json:"taskId"`
	Title                   string                                `json:"title,omitempty"`
	TaskStatus              string                                `json:"taskStatus,omitempty"`
	LatestSessionID         string                                `json:"latestSessionId,omitempty"`
	SessionStatus           string                                `json:"sessionStatus,omitempty"`
	SelectedWorkerID        string                                `json:"selectedWorkerId,omitempty"`
	SelectedWorkerType      string                                `json:"selectedWorkerType,omitempty"`
	SelectedWorkerAdapterID string                                `json:"selectedWorkerAdapterId,omitempty"`
	SelectedWorkerState     string                                `json:"selectedWorkerStatus,omitempty"`
	SelectedExecutionMode   string                                `json:"selectedExecutionMode,omitempty"`
	OpenApprovals           int                                   `json:"openApprovals,omitempty"`
	PendingApprovals        []runtimeapi.ApprovalCheckpointRecord `json:"pendingApprovals,omitempty"`
	PendingProposals        []runtimeclient.ToolProposalReview    `json:"pendingProposals,omitempty"`
	ToolActionCount         int                                   `json:"toolActionCount,omitempty"`
	EvidenceCount           int                                   `json:"evidenceCount,omitempty"`
	LatestWorkerSummary     string                                `json:"latestWorkerSummary,omitempty"`
	RecentEvents            []runtimeclient.EventSummary          `json:"recentEvents,omitempty"`
}

func main() {
	cfg := runtimeclient.LoadConfigFromEnv()
	root := flag.NewFlagSet("workflow-agentops", flag.ContinueOnError)
	root.SetOutput(os.Stderr)
	root.StringVar(&cfg.RuntimeAPIBaseURL, "runtime-api-base-url", cfg.RuntimeAPIBaseURL, "AgentOps runtime API base URL")
	root.StringVar(&cfg.TenantID, "tenant-id", cfg.TenantID, "tenant scope")
	root.StringVar(&cfg.ProjectID, "project-id", cfg.ProjectID, "project scope")
	root.StringVar(&cfg.AuthToken, "auth-token", cfg.AuthToken, "optional bearer token")
	root.BoolVar(&cfg.IncludeLegacySession, "include-legacy-sessions", cfg.IncludeLegacySession, "include legacy projected sessions")
	root.StringVar(&cfg.OutputFormat, "output", cfg.OutputFormat, "output format: text or json")
	root.IntVar(&cfg.LiveFollowWait, "live-follow-wait-seconds", cfg.LiveFollowWait, "poll wait window for event follow")
	root.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [global flags] <tickets|approvals|proposals> <command> [flags]\n", os.Args[0])
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Global flags:")
		root.PrintDefaults()
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Commands:")
		fmt.Fprintln(os.Stderr, "  tickets intake --file payload.json [--render update|text|json]")
		fmt.Fprintln(os.Stderr, "  tickets status (--task-id <taskId> | --ticket-id <ticketId>) [--workflow-id <workflowId>] [--source-system <source>] [--session-id <sessionId>] [--render comment|update|report|text|json]")
		fmt.Fprintln(os.Stderr, "  tickets follow (--task-id <taskId> | --ticket-id <ticketId>) [--workflow-id <workflowId>] [--source-system <source>] [--session-id <sessionId>] [--render update|delta-update|report|delta-report|text|json]")
		fmt.Fprintln(os.Stderr, "  tickets reply (--task-id <taskId> | --ticket-id <ticketId>) [--workflow-id <workflowId>] [--source-system <source>] --prompt <text> [--render update|text|json]")
		fmt.Fprintln(os.Stderr, "  tickets resume (--task-id <taskId> | --ticket-id <ticketId>) [--workflow-id <workflowId>] [--source-system <source>] --prompt <text> [--render update|text|json]")
		fmt.Fprintln(os.Stderr, "  approvals decide [--session-id <sessionId>] [--checkpoint-id <checkpointId>] (--task-id <taskId> | --ticket-id <ticketId>) [--workflow-id <workflowId>] [--source-system <source>] --decision APPROVE|DENY [--render update|text|json]")
		fmt.Fprintln(os.Stderr, "  proposals decide [--session-id <sessionId>] [--proposal-id <proposalId>] (--task-id <taskId> | --ticket-id <ticketId>) [--workflow-id <workflowId>] [--source-system <source>] --decision APPROVE|DENY [--render update|text|json]")
	}
	if err := root.Parse(os.Args[1:]); err != nil {
		exitUsage(err)
	}
	cfg.OutputFormat = runtimeclient.NormalizeOutputFormat(cfg.OutputFormat)
	args := root.Args()
	if len(args) < 2 {
		root.Usage()
		os.Exit(2)
	}
	client := runtimeclient.NewClient(cfg)
	ctx := context.Background()
	var err error
	switch args[0] {
	case "tickets":
		switch args[1] {
		case "intake":
			err = runTicketIntake(ctx, client, cfg, args[2:])
		case "status":
			err = runTicketStatus(ctx, client, cfg, args[2:])
		case "follow":
			err = runTicketFollow(ctx, client, cfg, args[2:])
		case "reply", "resume":
			err = runTicketReply(ctx, client, cfg, args[2:])
		default:
			err = fmt.Errorf("unknown tickets command %q", args[1])
		}
	case "approvals":
		err = runWorkflowApprovalCommand(ctx, client, cfg, args[1:])
	case "proposals":
		err = runWorkflowProposalCommand(ctx, client, cfg, args[1:])
	default:
		err = fmt.Errorf("unknown resource %q", args[0])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runTicketIntake(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	fs := flag.NewFlagSet("tickets intake", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	filePath := fs.String("file", "", "path to intake payload json")
	sourceSystem := fs.String("source-system", "", "external source system, for example jira or servicenow")
	ticketID := fs.String("ticket-id", "", "external ticket id")
	ticketURL := fs.String("ticket-url", "", "external ticket URL")
	workflowID := fs.String("workflow-id", "", "external workflow id")
	workflowURL := fs.String("workflow-url", "", "external workflow URL")
	title := fs.String("title", "", "task title")
	intent := fs.String("intent", "", "task intent")
	labels := fs.String("labels", "", "comma-separated workflow labels")
	requesterJSON := fs.String("requester-json", "", "optional requestedBy JSON object")
	annotationsJSON := fs.String("annotations-json", "", "optional annotations JSON object")
	initialPrompt := fs.String("initial-prompt", "", "optional first governed prompt")
	executionMode := fs.String("execution-mode", runtimeapi.AgentInvokeExecutionModeRawModelInvoke, "raw_model_invoke or managed_codex_worker")
	agentProfileID := fs.String("agent-profile", "codex", "agent profile id")
	systemPrompt := fs.String("system-prompt", "", "optional system prompt")
	maxOutputTokens := fs.Int("max-output-tokens", 0, "optional max output tokens")
	render := fs.String("render", "text", "render mode: update, text, or json")
	if err := fs.Parse(args); err != nil {
		return err
	}
	payload, err := loadWorkflowIntakePayload(*filePath)
	if err != nil {
		return err
	}
	if payload == nil {
		payload = &workflowIntakePayload{}
	}
	mergeWorkflowFlagOverrides(payload, *sourceSystem, *ticketID, *ticketURL, *workflowID, *workflowURL, *title, *intent, *labels, *initialPrompt, *executionMode, *agentProfileID, *systemPrompt, *maxOutputTokens)
	if strings.TrimSpace(*requesterJSON) != "" {
		requestedBy, err := parseJSONObjectFlag(*requesterJSON, "requester-json")
		if err != nil {
			return err
		}
		payload.RequestedBy = requestedBy
	}
	if strings.TrimSpace(*annotationsJSON) != "" {
		annotations, err := parseJSONObjectFlag(*annotationsJSON, "annotations-json")
		if err != nil {
			return err
		}
		if payload.Annotations == nil {
			payload.Annotations = map[string]interface{}{}
		}
		for key, value := range annotations {
			payload.Annotations[key] = value
		}
	}
	if strings.TrimSpace(payload.Title) == "" || strings.TrimSpace(payload.Intent) == "" {
		return fmt.Errorf("title and intent are required")
	}
	if strings.TrimSpace(payload.SourceSystem) == "" {
		payload.SourceSystem = "workflow"
	}
	taskReq := runtimeapi.TaskCreateRequest{
		Meta: runtimeapi.ObjectMeta{
			TenantID:  client.TenantID(),
			ProjectID: client.ProjectID(),
			RequestID: fmt.Sprintf("workflow-intake-%d", time.Now().UTC().UnixNano()),
		},
		Source:      fmt.Sprintf("ticket_workflow.%s", sanitizeSourceFragment(payload.SourceSystem)),
		Title:       strings.TrimSpace(payload.Title),
		Intent:      strings.TrimSpace(payload.Intent),
		RequestedBy: payload.RequestedBy,
		Annotations: buildWorkflowAnnotations(payload),
	}
	task, err := client.CreateTask(ctx, taskReq)
	if err != nil {
		return err
	}
	response := &workflowIntakeResponse{Task: task}
	if strings.TrimSpace(payload.InitialPrompt) != "" {
		invoke, err := client.InvokeTurn(ctx, task.TaskID, payload.InitialPrompt, payload.ExecutionMode, payload.AgentProfileID, payload.SystemPrompt, payload.MaxOutputTokens)
		if err != nil {
			return err
		}
		response.Invoke = invoke
	}
	selectedSessionID := ""
	if response.Invoke != nil {
		selectedSessionID = strings.TrimSpace(response.Invoke.SessionID)
	}
	report, err := loadWorkflowStatusReport(ctx, client, task, selectedSessionID)
	if err != nil {
		return err
	}
	response.Status = report
	format := strings.ToLower(strings.TrimSpace(*render))
	if cfg.OutputFormat == "json" || format == "json" {
		return printJSON(response)
	}
	if format == "update" || format == "comment" {
		fmt.Print(renderWorkflowIntakeUpdate(payload, response, report))
		return nil
	}
	fmt.Printf("ticket intake created task=%s source=%s\n", task.TaskID, runtimeclient.NormalizeStringOrDefault(payload.SourceSystem, "workflow"))
	if response.Invoke != nil {
		fmt.Printf("initial turn session=%s mode=%s finish=%s\n", runtimeclient.NormalizeStringOrDefault(response.Invoke.SessionID, "-"), runtimeclient.NormalizeStringOrDefault(response.Invoke.ExecutionMode, payload.ExecutionMode), runtimeclient.NormalizeStringOrDefault(response.Invoke.FinishReason, "-"))
	}
	return nil
}

func runTicketStatus(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	fs := flag.NewFlagSet("tickets status", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	sessionID := fs.String("session-id", "", "optional session id override")
	render := fs.String("render", "text", "render mode: text, comment, update, report, or json")
	lookup := bindWorkflowLookupFlags(fs)
	if err := fs.Parse(args); err != nil {
		return err
	}
	task, err := resolveWorkflowTask(ctx, client, *lookup)
	if err != nil {
		return err
	}
	report, err := loadWorkflowStatusReport(ctx, client, task, *sessionID)
	if err != nil {
		return err
	}
	format := strings.ToLower(strings.TrimSpace(*render))
	if cfg.OutputFormat == "json" || format == "json" {
		return printJSON(report)
	}
	if format == "report" {
		rendered, err := renderWorkflowReport(ctx, client, report)
		if err != nil {
			return err
		}
		fmt.Print(rendered)
		return nil
	}
	if format == "comment" || format == "update" {
		fmt.Print(renderWorkflowUpdate(report))
		return nil
	}
	return printWorkflowStatusReport(report)
}

func runTicketFollow(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	fs := flag.NewFlagSet("tickets follow", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	sessionID := fs.String("session-id", "", "optional session id override")
	afterSequence := fs.Int64("after-sequence", 0, "only stream events after this sequence")
	waitSeconds := fs.Int("wait-seconds", cfg.LiveFollowWait, "server wait seconds")
	once := fs.Bool("once", false, "fetch one event-stream window and exit")
	render := fs.String("render", "text", "render mode: update, delta-update, report, delta-report, text, or json")
	lookup := bindWorkflowLookupFlags(fs)
	if err := fs.Parse(args); err != nil {
		return err
	}
	task, err := resolveWorkflowTask(ctx, client, *lookup)
	if err != nil {
		return err
	}
	report, err := loadWorkflowStatusReport(ctx, client, task, *sessionID)
	if err != nil {
		return err
	}
	selectedSessionID := strings.TrimSpace(runtimeclient.NormalizeStringOrDefault(*sessionID, report.LatestSessionID))
	if selectedSessionID == "" {
		return fmt.Errorf("no session available to follow for task %s", runtimeclient.NormalizeStringOrDefault(task.TaskID, "-"))
	}
	lastSequence := *afterSequence
	format := strings.ToLower(strings.TrimSpace(*render))
	for {
		items, err := client.StreamSessionEvents(ctx, selectedSessionID, lastSequence, *waitSeconds, !*once)
		if err != nil {
			return err
		}
		for _, item := range items {
			if item.Sequence > lastSequence {
				lastSequence = item.Sequence
			}
		}
		switch {
		case cfg.OutputFormat == "json" || format == "json":
			if err := printJSON(items); err != nil {
				return err
			}
		case format == "delta-report":
			if len(items) == 0 {
				if *once {
					return nil
				}
				continue
			}
			current, err := loadWorkflowStatusReport(ctx, client, task, selectedSessionID)
			if err != nil {
				return err
			}
			rendered, err := renderWorkflowDeltaReport(ctx, client, current, items)
			if err != nil {
				return err
			}
			fmt.Print(rendered)
		case format == "report":
			current, err := loadWorkflowStatusReport(ctx, client, task, selectedSessionID)
			if err != nil {
				return err
			}
			rendered, err := renderWorkflowReport(ctx, client, current)
			if err != nil {
				return err
			}
			fmt.Print(rendered)
		case format == "delta-update":
			current, err := loadWorkflowStatusReport(ctx, client, task, selectedSessionID)
			if err != nil {
				return err
			}
			fmt.Print(renderWorkflowDeltaUpdate(current, items))
		case format == "update" || format == "comment":
			current, err := loadWorkflowStatusReport(ctx, client, task, selectedSessionID)
			if err != nil {
				return err
			}
			fmt.Print(renderWorkflowUpdate(current))
		default:
			printWorkflowEventStream(items)
		}
		if *once {
			return nil
		}
	}
}

func runTicketReply(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	fs := flag.NewFlagSet("tickets reply", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	prompt := fs.String("prompt", "", "governed follow-up turn prompt")
	executionMode := fs.String("execution-mode", runtimeapi.AgentInvokeExecutionModeRawModelInvoke, "raw_model_invoke or managed_codex_worker")
	agentProfileID := fs.String("agent-profile", "codex", "agent profile id")
	systemPrompt := fs.String("system-prompt", "", "optional system prompt")
	maxOutputTokens := fs.Int("max-output-tokens", 0, "optional max output tokens")
	render := fs.String("render", "text", "render mode: update, text, or json")
	lookup := bindWorkflowLookupFlags(fs)
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*prompt) == "" {
		return fmt.Errorf("--prompt is required")
	}
	task, err := resolveWorkflowTask(ctx, client, *lookup)
	if err != nil {
		return err
	}
	invoke, err := client.InvokeTurn(ctx, task.TaskID, *prompt, *executionMode, *agentProfileID, *systemPrompt, *maxOutputTokens)
	if err != nil {
		return err
	}
	report, err := loadWorkflowStatusReport(ctx, client, task, invoke.SessionID)
	if err != nil {
		return err
	}
	result := &workflowTurnResponse{Invoke: invoke, Status: report}
	format := strings.ToLower(strings.TrimSpace(*render))
	if cfg.OutputFormat == "json" || format == "json" {
		return printJSON(result)
	}
	if format == "update" || format == "comment" {
		fmt.Print(renderWorkflowTurnUpdate(invoke, report))
		return nil
	}
	return printWorkflowTurnResult(invoke, report)
}

func bindWorkflowLookupFlags(fs *flag.FlagSet) *workflowLookupOptions {
	options := &workflowLookupOptions{}
	fs.StringVar(&options.TaskID, "task-id", "", "existing task id")
	fs.StringVar(&options.SourceSystem, "source-system", "", "source system, for example jira or servicenow")
	fs.StringVar(&options.TicketID, "ticket-id", "", "external ticket id")
	fs.StringVar(&options.WorkflowID, "workflow-id", "", "external workflow id")
	return options
}

func runWorkflowApprovalCommand(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	switch args[0] {
	case "decide":
		fs := flag.NewFlagSet("approvals decide", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		sessionID := fs.String("session-id", "", "session id")
		checkpointID := fs.String("checkpoint-id", "", "checkpoint id")
		decision := fs.String("decision", "", "APPROVE or DENY")
		reason := fs.String("reason", "", "optional operator reason")
		render := fs.String("render", "text", "render mode: update, text, or json")
		lookup := bindWorkflowLookupFlags(fs)
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*decision) == "" {
			return fmt.Errorf("--decision is required")
		}
		var task *runtimeapi.TaskRecord
		var err error
		resolvedSessionID := strings.TrimSpace(*sessionID)
		resolvedCheckpointID := strings.TrimSpace(*checkpointID)
		if resolvedSessionID == "" || resolvedCheckpointID == "" {
			task, err = resolveWorkflowTask(ctx, client, *lookup)
			if err != nil {
				return err
			}
			report, err := loadWorkflowStatusReport(ctx, client, task, resolvedSessionID)
			if err != nil {
				return err
			}
			resolvedSessionID, resolvedCheckpointID, err = resolveWorkflowApprovalTarget(report, resolvedSessionID, resolvedCheckpointID)
			if err != nil {
				return err
			}
		}
		if resolvedSessionID == "" || resolvedCheckpointID == "" {
			return fmt.Errorf("unable to resolve approval target")
		}
		response, err := client.SubmitApprovalDecision(ctx, resolvedSessionID, resolvedCheckpointID, *decision, *reason)
		if err != nil {
			return err
		}
		result := &workflowApprovalDecisionResult{Decision: response}
		format := strings.ToLower(strings.TrimSpace(*render))
		if cfg.OutputFormat == "json" || format == "json" {
			return printJSON(result)
		}
		if format == "update" || format == "comment" {
			var report *workflowStatusReport
			if task != nil {
				report, err = loadWorkflowStatusReport(ctx, client, task, resolvedSessionID)
				if err != nil {
					return err
				}
			}
			fmt.Print(renderWorkflowApprovalDecisionUpdate(response, report))
			return nil
		}
		return printWorkflowApprovalDecision(response)
	default:
		return fmt.Errorf("unknown approvals command %q", args[0])
	}
}

func runWorkflowProposalCommand(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	switch args[0] {
	case "decide":
		fs := flag.NewFlagSet("proposals decide", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		sessionID := fs.String("session-id", "", "session id")
		proposalID := fs.String("proposal-id", "", "proposal id")
		decision := fs.String("decision", "", "APPROVE or DENY")
		reason := fs.String("reason", "", "optional operator reason")
		render := fs.String("render", "text", "render mode: update, text, or json")
		lookup := bindWorkflowLookupFlags(fs)
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*decision) == "" {
			return fmt.Errorf("--decision is required")
		}
		var task *runtimeapi.TaskRecord
		var err error
		resolvedSessionID := strings.TrimSpace(*sessionID)
		resolvedProposalID := strings.TrimSpace(*proposalID)
		if resolvedSessionID == "" || resolvedProposalID == "" {
			task, err = resolveWorkflowTask(ctx, client, *lookup)
			if err != nil {
				return err
			}
			report, err := loadWorkflowStatusReport(ctx, client, task, resolvedSessionID)
			if err != nil {
				return err
			}
			resolvedSessionID, resolvedProposalID, err = resolveWorkflowProposalTarget(report, resolvedSessionID, resolvedProposalID)
			if err != nil {
				return err
			}
		}
		if resolvedSessionID == "" || resolvedProposalID == "" {
			return fmt.Errorf("unable to resolve proposal target")
		}
		response, err := client.SubmitToolProposalDecision(ctx, resolvedSessionID, resolvedProposalID, *decision, *reason)
		if err != nil {
			return err
		}
		result := &workflowProposalDecisionResult{Decision: response}
		format := strings.ToLower(strings.TrimSpace(*render))
		if cfg.OutputFormat == "json" || format == "json" {
			return printJSON(result)
		}
		if format == "update" || format == "comment" {
			var report *workflowStatusReport
			if task != nil {
				report, err = loadWorkflowStatusReport(ctx, client, task, resolvedSessionID)
				if err != nil {
					return err
				}
			}
			fmt.Print(renderWorkflowProposalDecisionUpdate(response, report))
			return nil
		}
		return printWorkflowProposalDecision(response)
	default:
		return fmt.Errorf("unknown proposals command %q", args[0])
	}
}

func resolveWorkflowTask(ctx context.Context, client *runtimeclient.Client, lookup workflowLookupOptions) (*runtimeapi.TaskRecord, error) {
	return runtimeclient.ResolveTaskByAnnotationLookup(ctx, client, runtimeclient.TaskAnnotationLookup{
		TaskID: lookup.TaskID,
		RequiredAnnotations: map[string]string{
			"ingressKind":  "ticket_workflow",
			"sourceSystem": lookup.SourceSystem,
			"ticketId":     lookup.TicketID,
			"workflowId":   lookup.WorkflowID,
		},
		CaseInsensitiveKeys: map[string]bool{
			"ingressKind":  true,
			"sourceSystem": true,
		},
		MissingLookupMessage: "either --task-id or one of --ticket-id/--workflow-id is required",
		NotFoundMessage:      "no workflow task matched the provided ticket context",
	})
}

func matchesWorkflowLookup(task runtimeapi.TaskRecord, lookup workflowLookupOptions) bool {
	return runtimeclient.MatchesTaskAnnotationLookup(task, runtimeclient.TaskAnnotationLookup{
		RequiredAnnotations: map[string]string{
			"ingressKind":  "ticket_workflow",
			"sourceSystem": lookup.SourceSystem,
			"ticketId":     lookup.TicketID,
			"workflowId":   lookup.WorkflowID,
		},
		CaseInsensitiveKeys: map[string]bool{
			"ingressKind":  true,
			"sourceSystem": true,
		},
	})
}

func resolveWorkflowApprovalTarget(report *workflowStatusReport, sessionID, checkpointID string) (string, string, error) {
	items := make([]runtimeclient.PendingTargetItem, 0, len(report.PendingApprovals))
	for _, item := range report.PendingApprovals {
		items = append(items, runtimeclient.PendingTargetItem{
			ID:    strings.TrimSpace(item.CheckpointID),
			Label: runtimeclient.NormalizeStringOrDefault(item.Scope, item.CheckpointID),
		})
	}
	return runtimeclient.ResolvePendingTarget(runtimeclient.PendingTargetLookup{
		SessionID:         sessionID,
		FallbackSessionID: reportSessionID(report),
		ExplicitTargetID:  checkpointID,
		TargetSingular:    "approval",
		TargetPlural:      "approvals",
		ContextLabel:      "workflow context",
		ExplicitFlag:      "checkpoint-id",
		Items:             items,
	})
}

func resolveWorkflowProposalTarget(report *workflowStatusReport, sessionID, proposalID string) (string, string, error) {
	items := make([]runtimeclient.PendingTargetItem, 0, len(report.PendingProposals))
	for _, item := range report.PendingProposals {
		items = append(items, runtimeclient.PendingTargetItem{
			ID:    strings.TrimSpace(item.ProposalID),
			Label: runtimeclient.NormalizeStringOrDefault(item.Summary, item.ProposalID),
		})
	}
	return runtimeclient.ResolvePendingTarget(runtimeclient.PendingTargetLookup{
		SessionID:         sessionID,
		FallbackSessionID: reportSessionID(report),
		ExplicitTargetID:  proposalID,
		TargetSingular:    "proposal",
		TargetPlural:      "proposals",
		ContextLabel:      "workflow context",
		ExplicitFlag:      "proposal-id",
		Items:             items,
	})
}

func reportSessionID(report *workflowStatusReport) string {
	if report == nil {
		return ""
	}
	return strings.TrimSpace(report.LatestSessionID)
}

func buildWorkflowAnnotations(payload *workflowIntakePayload) map[string]interface{} {
	annotations := map[string]interface{}{
		"ingressKind":  "ticket_workflow",
		"sourceSystem": strings.TrimSpace(payload.SourceSystem),
	}
	if payload.TicketID != "" {
		annotations["ticketId"] = strings.TrimSpace(payload.TicketID)
	}
	if payload.TicketURL != "" {
		annotations["ticketUrl"] = strings.TrimSpace(payload.TicketURL)
	}
	if payload.WorkflowID != "" {
		annotations["workflowId"] = strings.TrimSpace(payload.WorkflowID)
	}
	if payload.WorkflowURL != "" {
		annotations["workflowUrl"] = strings.TrimSpace(payload.WorkflowURL)
	}
	if len(payload.Labels) > 0 {
		labels := make([]string, 0, len(payload.Labels))
		for _, item := range payload.Labels {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				labels = append(labels, trimmed)
			}
		}
		if len(labels) > 0 {
			annotations["labels"] = labels
		}
	}
	for key, value := range payload.Annotations {
		annotations[key] = value
	}
	return annotations
}

func buildWorkflowStatusReport(view *runtimeclient.ThreadReview) *workflowStatusReport {
	report := &workflowStatusReport{}
	if view == nil {
		return report
	}
	report.TaskID = view.Task.TaskID
	report.Title = view.Task.Title
	report.TaskStatus = string(view.Task.Status)
	report.LatestSessionID = view.Task.LatestSessionID
	if annotations := rawObject(view.Task.Annotations); len(annotations) > 0 {
		report.SourceSystem = normalizeInterfaceString(annotations["sourceSystem"], "")
		report.TicketID = normalizeInterfaceString(annotations["ticketId"], "")
		report.WorkflowID = normalizeInterfaceString(annotations["workflowId"], "")
	}
	if view.Timeline == nil {
		return report
	}
	report.LatestSessionID = view.Timeline.Session.SessionID
	report.SessionStatus = string(view.Timeline.Session.Status)
	report.SelectedWorkerID = runtimeclient.NormalizeStringOrDefault(view.Timeline.Session.SelectedWorkerID, "")
	if view.Timeline.SelectedWorker != nil {
		report.SelectedWorkerType = runtimeclient.NormalizeStringOrDefault(view.Timeline.SelectedWorker.WorkerType, "")
		report.SelectedWorkerAdapterID = runtimeclient.NormalizeStringOrDefault(view.Timeline.SelectedWorker.AdapterID, "")
		report.SelectedWorkerState = runtimeclient.NormalizeStringOrDefault(string(view.Timeline.SelectedWorker.Status), "")
		report.SelectedExecutionMode = runtimeclient.ExecutionModeForWorker(report.SelectedWorkerType, report.SelectedWorkerAdapterID)
	}
	report.OpenApprovals = view.Timeline.OpenApprovalCount
	report.ToolActionCount = len(view.Timeline.ToolActions)
	report.EvidenceCount = len(view.Timeline.EvidenceRecords)
	report.RecentEvents = append([]runtimeclient.EventSummary(nil), view.RecentEvents...)
	pendingApprovals := make([]runtimeapi.ApprovalCheckpointRecord, 0)
	for _, item := range view.Timeline.ApprovalCheckpoints {
		if strings.EqualFold(string(item.Status), string(runtimeapi.ApprovalStatusPending)) {
			pendingApprovals = append(pendingApprovals, item)
		}
	}
	report.PendingApprovals = pendingApprovals
	pendingProposals := make([]runtimeclient.ToolProposalReview, 0)
	for _, item := range view.ToolProposals {
		if strings.EqualFold(strings.TrimSpace(item.Status), "APPROVED") || strings.EqualFold(strings.TrimSpace(item.Status), "DENIED") {
			continue
		}
		pendingProposals = append(pendingProposals, item)
	}
	report.PendingProposals = pendingProposals
	if len(view.RecentEvents) > 0 {
		report.LatestWorkerSummary = view.RecentEvents[len(view.RecentEvents)-1].Detail
	}
	return report
}

func loadWorkflowStatusReport(ctx context.Context, client *runtimeclient.Client, task *runtimeapi.TaskRecord, sessionID string) (*workflowStatusReport, error) {
	if task == nil {
		return nil, fmt.Errorf("task is required")
	}
	sessionsResp, err := client.ListSessions(ctx, task.TaskID, 100, 0, "")
	if err != nil {
		return nil, err
	}
	sessions := append([]runtimeapi.SessionRecord(nil), sessionsResp.Items...)
	sort.SliceStable(sessions, func(i, j int) bool {
		return sessions[j].UpdatedAt.Before(sessions[i].UpdatedAt)
	})
	selectedID := strings.TrimSpace(sessionID)
	if selectedID == "" {
		selectedID = runtimeclient.NormalizeStringOrDefault(task.LatestSessionID, firstSessionID(sessions))
	}
	var timeline *runtimeapi.SessionTimelineResponse
	if selectedID != "" {
		timeline, err = client.GetSessionTimeline(ctx, selectedID)
		if err != nil {
			return nil, err
		}
	}
	view := runtimeclient.BuildThreadReview(task, sessions, selectedID, timeline)
	return buildWorkflowStatusReport(view), nil
}

func renderWorkflowUpdate(report *workflowStatusReport) string {
	if report == nil {
		return ""
	}
	summary := runtimeclient.NormalizeStringOrDefault(report.LatestWorkerSummary, "Governed workflow state refreshed.")
	details := make([]string, 0, 1+len(report.PendingApprovals)+len(report.PendingProposals))
	if report.Title != "" {
		details = append(details, fmt.Sprintf("Title: %s", report.Title))
	}
	for _, item := range report.PendingApprovals {
		details = append(details, fmt.Sprintf("Pending approval: %s (%s)", item.CheckpointID, runtimeclient.NormalizeStringOrDefault(item.Scope, "scope-unspecified")))
	}
	for _, item := range report.PendingProposals {
		details = append(details, fmt.Sprintf("Pending proposal: %s (%s)", item.ProposalID, runtimeclient.NormalizeStringOrDefault(item.Summary, item.Command)))
	}
	return renderWorkflowEnvelope("status", summary, report, details, runtimeclient.RenderEventSummaryLines(report.RecentEvents, 3))
}

func renderWorkflowIntakeUpdate(payload *workflowIntakePayload, response *workflowIntakeResponse, report *workflowStatusReport) string {
	summary := "Governed workflow task created from ticket context."
	details := []string{
		fmt.Sprintf("Source: %s", runtimeclient.NormalizeStringOrDefault(payload.SourceSystem, "workflow")),
	}
	if report != nil && report.Title != "" {
		details = append(details, fmt.Sprintf("Title: %s", report.Title))
	}
	if response != nil && response.Invoke != nil {
		summary = "Governed workflow task created and initial turn started."
		details = append(details,
			fmt.Sprintf("Execution mode: %s", runtimeclient.NormalizeStringOrDefault(response.Invoke.ExecutionMode, payload.ExecutionMode)),
			fmt.Sprintf("Finish: %s", runtimeclient.NormalizeStringOrDefault(response.Invoke.FinishReason, "-")),
		)
	}
	recent := workflowRecentEventLines(report, 3)
	if len(recent) == 0 && report != nil && report.LatestWorkerSummary != "" {
		recent = []string{fmt.Sprintf("Worker activity: %s", report.LatestWorkerSummary)}
	}
	return renderWorkflowEnvelope("intake", summary, report, details, recent)
}

func renderWorkflowTurnUpdate(invoke *runtimeapi.AgentInvokeResponse, report *workflowStatusReport) string {
	summary := fmt.Sprintf("Turn finished with %s.", runtimeclient.NormalizeStringOrDefault(invoke.FinishReason, "unknown status"))
	if strings.TrimSpace(invoke.OutputText) != "" {
		summary = runtimeclient.ClipText(strings.TrimSpace(invoke.OutputText), 220)
	}
	details := []string{
		fmt.Sprintf("Execution mode: %s", runtimeclient.NormalizeStringOrDefault(invoke.ExecutionMode, "-")),
		fmt.Sprintf("Finish: %s", runtimeclient.NormalizeStringOrDefault(invoke.FinishReason, "-")),
	}
	if strings.TrimSpace(invoke.SelectedWorkerID) != "" || strings.TrimSpace(invoke.WorkerType) != "" {
		details = append(details, fmt.Sprintf("Selected worker: %s %s", runtimeclient.NormalizeStringOrDefault(invoke.SelectedWorkerID, "-"), runtimeclient.NormalizeStringOrDefault(invoke.WorkerType, "-")))
	}
	if report != nil && report.Title != "" {
		details = append(details, fmt.Sprintf("Title: %s", report.Title))
	}
	if report != nil && report.LatestWorkerSummary != "" {
		details = append(details, fmt.Sprintf("Latest activity: %s", report.LatestWorkerSummary))
	}
	return renderWorkflowEnvelope("turn", summary, report, details, workflowRecentEventLines(report, 3))
}

func renderWorkflowDeltaUpdate(report *workflowStatusReport, items []runtimeapi.SessionEventRecord) string {
	if len(items) == 0 {
		return ""
	}
	summary := fmt.Sprintf("Observed %d new native event(s).", len(items))
	if len(items) == 1 {
		summary = fmt.Sprintf("Observed 1 new native event: %s", runtimeclient.SummarizeEventDetail(items[0]))
	}
	details := []string{fmt.Sprintf("New events: %d", len(items))}
	return renderWorkflowEnvelope("follow_delta", summary, report, details, runtimeclient.RenderSessionEventLines(items, 4))
}

func renderWorkflowReport(ctx context.Context, client *runtimeclient.Client, report *workflowStatusReport) (string, error) {
	if report == nil {
		return "", nil
	}
	workerCapabilities, err := client.ListWorkerCapabilities(ctx, report.SelectedExecutionMode, report.SelectedWorkerType, report.SelectedWorkerAdapterID)
	if err != nil {
		return "", err
	}
	policyPacks, err := client.ListPolicyPacks(ctx, "", report.SelectedExecutionMode, report.SelectedWorkerType, report.SelectedWorkerAdapterID, "workflow")
	if err != nil {
		return "", err
	}
	envelope := runtimeclient.BuildEnterpriseReportEnvelope(runtimeclient.EnterpriseReportSubject{
		Header:               "AgentOps workflow governance report",
		ReportType:           "report",
		ClientSurface:        "workflow",
		ContextLabel:         "Workflow",
		ContextValue:         buildWorkflowReportContext(report),
		SubjectLabel:         "Ticket",
		SubjectValue:         runtimeclient.NormalizeStringOrDefault(report.TicketID, report.TaskID),
		TaskID:               report.TaskID,
		TaskStatus:           report.TaskStatus,
		SessionID:            report.LatestSessionID,
		SessionStatus:        report.SessionStatus,
		WorkerID:             report.SelectedWorkerID,
		WorkerType:           report.SelectedWorkerType,
		WorkerAdapterID:      report.SelectedWorkerAdapterID,
		WorkerState:          report.SelectedWorkerState,
		ExecutionMode:        report.SelectedExecutionMode,
		OpenApprovals:        report.OpenApprovals,
		PendingProposalCount: len(report.PendingProposals),
		ToolActionCount:      report.ToolActionCount,
		EvidenceCount:        report.EvidenceCount,
		Summary:              runtimeclient.NormalizeStringOrDefault(report.LatestWorkerSummary, "Enterprise workflow posture refreshed."),
		Details:              buildWorkflowReportDetails(report),
		Recent:               workflowRecentEventLines(report, 4),
		ActionHints:          renderWorkflowActionHints(report),
	}, policyPacks, workerCapabilities)
	return runtimeclient.RenderEnterpriseReportEnvelope(envelope), nil
}

func renderWorkflowDeltaReport(ctx context.Context, client *runtimeclient.Client, report *workflowStatusReport, items []runtimeapi.SessionEventRecord) (string, error) {
	if len(items) == 0 {
		return "", nil
	}
	workerCapabilities, err := client.ListWorkerCapabilities(ctx, report.SelectedExecutionMode, report.SelectedWorkerType, report.SelectedWorkerAdapterID)
	if err != nil {
		return "", err
	}
	policyPacks, err := client.ListPolicyPacks(ctx, "", report.SelectedExecutionMode, report.SelectedWorkerType, report.SelectedWorkerAdapterID, "workflow")
	if err != nil {
		return "", err
	}
	summary := runtimeclient.BuildThreadFollowSummary(items)
	envelope := runtimeclient.BuildEnterpriseReportEnvelope(runtimeclient.EnterpriseReportSubject{
		Header:               "AgentOps workflow governance report",
		ReportType:           "delta-report",
		ClientSurface:        "workflow",
		ContextLabel:         "Workflow",
		ContextValue:         buildWorkflowReportContext(report),
		SubjectLabel:         "Ticket",
		SubjectValue:         runtimeclient.NormalizeStringOrDefault(report.TicketID, report.TaskID),
		TaskID:               report.TaskID,
		TaskStatus:           report.TaskStatus,
		SessionID:            report.LatestSessionID,
		SessionStatus:        report.SessionStatus,
		WorkerID:             report.SelectedWorkerID,
		WorkerType:           report.SelectedWorkerType,
		WorkerAdapterID:      report.SelectedWorkerAdapterID,
		WorkerState:          report.SelectedWorkerState,
		ExecutionMode:        report.SelectedExecutionMode,
		OpenApprovals:        report.OpenApprovals,
		PendingProposalCount: len(report.PendingProposals),
		ToolActionCount:      report.ToolActionCount,
		EvidenceCount:        report.EvidenceCount,
		Summary:              summary,
		Details:              runtimeclient.BuildThreadFollowDetails(items),
		Recent:               runtimeclient.RenderSessionEventLines(items, 4),
		ActionHints:          renderWorkflowActionHints(report),
	}, policyPacks, workerCapabilities)
	return runtimeclient.RenderEnterpriseReportEnvelope(envelope), nil
}

func renderWorkflowEnvelope(updateType, summary string, report *workflowStatusReport, details, recent []string) string {
	contextParts := []string{"-"}
	subjectValue := ""
	taskID := ""
	taskStatus := ""
	sessionID := ""
	sessionStatus := ""
	workerID := ""
	workerType := ""
	workerState := ""
	openApprovals := 0
	pendingProposalCount := 0
	toolActionCount := 0
	evidenceCount := 0
	if report != nil {
		contextParts = []string{runtimeclient.NormalizeStringOrDefault(report.SourceSystem, "-")}
		if workflowID := strings.TrimSpace(report.WorkflowID); workflowID != "" {
			contextParts = append(contextParts, workflowID)
		}
		subjectValue = runtimeclient.NormalizeStringOrDefault(report.TicketID, report.TaskID)
		taskID = report.TaskID
		taskStatus = report.TaskStatus
		sessionID = report.LatestSessionID
		sessionStatus = report.SessionStatus
		workerID = report.SelectedWorkerID
		workerType = report.SelectedWorkerType
		workerState = report.SelectedWorkerState
		openApprovals = report.OpenApprovals
		pendingProposalCount = len(report.PendingProposals)
		toolActionCount = report.ToolActionCount
		evidenceCount = report.EvidenceCount
	}
	return runtimeclient.RenderGovernedUpdateEnvelope(runtimeclient.GovernedUpdateEnvelope{
		Header:               "AgentOps ticket update",
		UpdateType:           updateType,
		ContextLabel:         "Workflow",
		ContextValue:         strings.Join(contextParts, " | "),
		SubjectLabel:         "Ticket",
		SubjectValue:         subjectValue,
		TaskID:               taskID,
		TaskStatus:           taskStatus,
		SessionID:            sessionID,
		SessionStatus:        sessionStatus,
		WorkerID:             workerID,
		WorkerType:           workerType,
		WorkerState:          workerState,
		OpenApprovals:        openApprovals,
		PendingProposalCount: pendingProposalCount,
		ToolActionCount:      toolActionCount,
		EvidenceCount:        evidenceCount,
		Summary:              summary,
		Details:              details,
		Recent:               recent,
		ActionHints:          renderWorkflowActionHints(report),
	})
}

func buildWorkflowReportContext(report *workflowStatusReport) string {
	if report == nil {
		return "-"
	}
	parts := []string{runtimeclient.NormalizeStringOrDefault(report.SourceSystem, "-")}
	if workflowID := strings.TrimSpace(report.WorkflowID); workflowID != "" {
		parts = append(parts, workflowID)
	}
	return strings.Join(parts, " | ")
}

func buildWorkflowReportDetails(report *workflowStatusReport) []string {
	if report == nil {
		return nil
	}
	details := make([]string, 0, 2+len(report.PendingApprovals)+len(report.PendingProposals))
	if title := strings.TrimSpace(report.Title); title != "" {
		details = append(details, fmt.Sprintf("Title: %s", title))
	}
	if summary := strings.TrimSpace(report.LatestWorkerSummary); summary != "" {
		details = append(details, fmt.Sprintf("Latest activity: %s", summary))
	}
	for _, item := range report.PendingApprovals {
		details = append(details, fmt.Sprintf("Pending approval: %s (%s)", item.CheckpointID, runtimeclient.NormalizeStringOrDefault(item.Scope, "scope-unspecified")))
	}
	for _, item := range report.PendingProposals {
		details = append(details, fmt.Sprintf("Pending proposal: %s (%s)", item.ProposalID, runtimeclient.NormalizeStringOrDefault(item.Summary, item.Command)))
	}
	return details
}

func workflowRecentEventLines(report *workflowStatusReport, limit int) []string {
	if report == nil || len(report.RecentEvents) == 0 {
		return nil
	}
	return runtimeclient.RenderEventSummaryLines(report.RecentEvents, limit)
}

func renderWorkflowActionHints(report *workflowStatusReport) []string {
	if report == nil {
		return nil
	}
	return runtimeclient.RenderDecisionActionHints(runtimeclient.DecisionActionHints{
		ContextHint: buildWorkflowContextHint(report),
		ApprovalIDs: workflowApprovalIDs(report.PendingApprovals),
		ProposalIDs: workflowProposalIDs(report.PendingProposals),
	})
}

func buildWorkflowContextHint(report *workflowStatusReport) string {
	if report == nil {
		return "--task-id <taskId>"
	}
	return runtimeclient.BuildContextHint(report.TaskID,
		runtimeclient.ContextHintPart{Flag: "ticket-id", Value: report.TicketID},
		runtimeclient.ContextHintPart{Flag: "source-system", Value: report.SourceSystem},
		runtimeclient.ContextHintPart{Flag: "workflow-id", Value: report.WorkflowID},
	)
}

func workflowApprovalIDs(items []runtimeapi.ApprovalCheckpointRecord) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if id := strings.TrimSpace(item.CheckpointID); id != "" {
			out = append(out, id)
		}
	}
	return out
}

func workflowProposalIDs(items []runtimeclient.ToolProposalReview) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if id := strings.TrimSpace(item.ProposalID); id != "" {
			out = append(out, id)
		}
	}
	return out
}

func renderWorkflowComment(report *workflowStatusReport) string {
	return renderWorkflowUpdate(report)
}

func renderWorkflowApprovalDecisionUpdate(response *runtimeapi.ApprovalCheckpointDecisionResponse, report *workflowStatusReport) string {
	summary := fmt.Sprintf("Approval %s is now %s.", runtimeclient.NormalizeStringOrDefault(response.CheckpointID, "checkpoint"), runtimeclient.NormalizeStringOrDefault(string(response.Status), "-"))
	details := []string{
		fmt.Sprintf("Checkpoint: %s", runtimeclient.NormalizeStringOrDefault(response.CheckpointID, "-")),
		fmt.Sprintf("Decision: %s", runtimeclient.NormalizeStringOrDefault(strings.ToUpper(response.Decision), "-")),
		fmt.Sprintf("Status: %s", runtimeclient.NormalizeStringOrDefault(string(response.Status), "-")),
	}
	if strings.TrimSpace(response.Reason) != "" {
		details = append(details, fmt.Sprintf("Reason: %s", response.Reason))
	}
	if strings.TrimSpace(response.ReviewedAt) != "" {
		details = append(details, fmt.Sprintf("Reviewed at: %s", response.ReviewedAt))
	}
	return renderWorkflowEnvelope("approval_decision", summary, report, details, workflowRecentEventLines(report, 3))
}

func renderWorkflowProposalDecisionUpdate(response *runtimeapi.ToolProposalDecisionResponse, report *workflowStatusReport) string {
	summary := fmt.Sprintf("Proposal %s is now %s.", runtimeclient.NormalizeStringOrDefault(response.ProposalID, "proposal"), runtimeclient.NormalizeStringOrDefault(response.Status, "-"))
	details := []string{
		fmt.Sprintf("Proposal: %s", runtimeclient.NormalizeStringOrDefault(response.ProposalID, "-")),
		fmt.Sprintf("Decision: %s", runtimeclient.NormalizeStringOrDefault(strings.ToUpper(response.Decision), "-")),
		fmt.Sprintf("Status: %s", runtimeclient.NormalizeStringOrDefault(response.Status, "-")),
	}
	if strings.TrimSpace(response.ToolActionID) != "" || strings.TrimSpace(string(response.ActionStatus)) != "" {
		details = append(details, fmt.Sprintf("Tool action: %s (%s)", runtimeclient.NormalizeStringOrDefault(response.ToolActionID, "-"), runtimeclient.NormalizeStringOrDefault(string(response.ActionStatus), "-")))
	}
	if strings.TrimSpace(response.Reason) != "" {
		details = append(details, fmt.Sprintf("Reason: %s", response.Reason))
	}
	if strings.TrimSpace(response.ReviewedAt) != "" {
		details = append(details, fmt.Sprintf("Reviewed at: %s", response.ReviewedAt))
	}
	return renderWorkflowEnvelope("proposal_decision", summary, report, details, workflowRecentEventLines(report, 3))
}

func printWorkflowStatusReport(report *workflowStatusReport) error {
	fmt.Printf("Workflow: %s\n", runtimeclient.NormalizeStringOrDefault(report.TicketID, runtimeclient.NormalizeStringOrDefault(report.WorkflowID, "-")))
	fmt.Printf("Task: %s\n", runtimeclient.NormalizeStringOrDefault(report.TaskID, "-"))
	fmt.Printf("Task Status: %s\n", runtimeclient.NormalizeStringOrDefault(report.TaskStatus, "-"))
	fmt.Printf("Latest Session: %s\n", runtimeclient.NormalizeStringOrDefault(report.LatestSessionID, "-"))
	fmt.Printf("Session Status: %s\n", runtimeclient.NormalizeStringOrDefault(report.SessionStatus, "-"))
	fmt.Printf("Worker: %s (%s %s)\n", runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerID, "-"), runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerType, "-"), runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerState, "-"))
	fmt.Printf("Open Approvals: %d\n", report.OpenApprovals)
	fmt.Printf("Pending Proposals: %d\n", len(report.PendingProposals))
	fmt.Printf("Tool Actions: %d\n", report.ToolActionCount)
	fmt.Printf("Evidence Records: %d\n", report.EvidenceCount)
	if report.LatestWorkerSummary != "" {
		fmt.Printf("Latest Activity: %s\n", report.LatestWorkerSummary)
	}
	if recent := workflowRecentEventLines(report, 5); len(recent) > 0 {
		fmt.Println()
		fmt.Println("Recent Activity")
		for _, item := range recent {
			fmt.Println(item)
		}
	}
	if len(report.PendingApprovals) > 0 {
		fmt.Println()
		fmt.Println("Pending Approvals")
		for _, item := range report.PendingApprovals {
			fmt.Printf("- %s | %s | %s\n", item.CheckpointID, runtimeclient.NormalizeStringOrDefault(item.Scope, "-"), runtimeclient.NormalizeStringOrDefault(item.Reason, "-"))
		}
	}
	if len(report.PendingProposals) > 0 {
		fmt.Println()
		fmt.Println("Pending Proposals")
		for _, item := range report.PendingProposals {
			fmt.Printf("- %s | %s | %s\n", item.ProposalID, runtimeclient.NormalizeStringOrDefault(item.ProposalType, "tool_proposal"), runtimeclient.NormalizeStringOrDefault(item.Summary, item.Command))
		}
	}
	if hints := renderWorkflowActionHints(report); len(hints) > 0 {
		fmt.Println()
		fmt.Println("Action Hints")
		for _, item := range hints {
			fmt.Println(item)
		}
	}
	return nil
}

func printWorkflowEventStream(items []runtimeapi.SessionEventRecord) {
	for _, item := range items {
		fmt.Printf("#%d %s %s | %s\n", item.Sequence, item.Timestamp.UTC().Format(time.RFC3339), runtimeclient.SummarizeEventLabel(string(item.EventType)), runtimeclient.SummarizeEventDetail(item))
	}
}

func printWorkflowTurnResult(invoke *runtimeapi.AgentInvokeResponse, report *workflowStatusReport) error {
	fmt.Printf("Task: %s\n", runtimeclient.NormalizeStringOrDefault(invoke.TaskID, runtimeclient.NormalizeStringOrDefault(report.TaskID, "-")))
	fmt.Printf("Session: %s\n", runtimeclient.NormalizeStringOrDefault(invoke.SessionID, runtimeclient.NormalizeStringOrDefault(report.LatestSessionID, "-")))
	fmt.Printf("Execution Mode: %s\n", runtimeclient.NormalizeStringOrDefault(invoke.ExecutionMode, "-"))
	fmt.Printf("Finish: %s\n", runtimeclient.NormalizeStringOrDefault(invoke.FinishReason, "-"))
	fmt.Printf("Selected Worker: %s\n", runtimeclient.NormalizeStringOrDefault(invoke.SelectedWorkerID, "-"))
	fmt.Printf("Worker Type: %s\n", runtimeclient.NormalizeStringOrDefault(invoke.WorkerType, "-"))
	if strings.TrimSpace(invoke.OutputText) != "" {
		fmt.Println()
		fmt.Println(invoke.OutputText)
	}
	if report != nil {
		fmt.Println()
		return printWorkflowStatusReport(report)
	}
	return nil
}

func printWorkflowApprovalDecision(response *runtimeapi.ApprovalCheckpointDecisionResponse) error {
	fmt.Printf("Session: %s\n", runtimeclient.NormalizeStringOrDefault(response.SessionID, "-"))
	fmt.Printf("Checkpoint: %s\n", runtimeclient.NormalizeStringOrDefault(response.CheckpointID, "-"))
	fmt.Printf("Decision: %s\n", runtimeclient.NormalizeStringOrDefault(strings.ToUpper(response.Decision), "-"))
	fmt.Printf("Status: %s\n", runtimeclient.NormalizeStringOrDefault(string(response.Status), "-"))
	fmt.Printf("Applied: %t\n", response.Applied)
	if strings.TrimSpace(response.Reason) != "" {
		fmt.Printf("Reason: %s\n", response.Reason)
	}
	if strings.TrimSpace(response.ReviewedAt) != "" {
		fmt.Printf("Reviewed At: %s\n", response.ReviewedAt)
	}
	return nil
}

func printWorkflowProposalDecision(response *runtimeapi.ToolProposalDecisionResponse) error {
	fmt.Printf("Session: %s\n", runtimeclient.NormalizeStringOrDefault(response.SessionID, "-"))
	fmt.Printf("Proposal: %s\n", runtimeclient.NormalizeStringOrDefault(response.ProposalID, "-"))
	fmt.Printf("Decision: %s\n", runtimeclient.NormalizeStringOrDefault(strings.ToUpper(response.Decision), "-"))
	fmt.Printf("Status: %s\n", runtimeclient.NormalizeStringOrDefault(response.Status, "-"))
	fmt.Printf("Applied: %t\n", response.Applied)
	if strings.TrimSpace(response.ToolActionID) != "" || strings.TrimSpace(string(response.ActionStatus)) != "" {
		fmt.Printf("Tool Action: %s (%s)\n", runtimeclient.NormalizeStringOrDefault(response.ToolActionID, "-"), runtimeclient.NormalizeStringOrDefault(string(response.ActionStatus), "-"))
	}
	if strings.TrimSpace(response.Reason) != "" {
		fmt.Printf("Reason: %s\n", response.Reason)
	}
	if strings.TrimSpace(response.ReviewedAt) != "" {
		fmt.Printf("Reviewed At: %s\n", response.ReviewedAt)
	}
	return nil
}

func loadWorkflowIntakePayload(path string) (*workflowIntakePayload, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return &workflowIntakePayload{}, nil
	}
	payload, err := os.ReadFile(trimmed)
	if err != nil {
		return nil, err
	}
	var result workflowIntakePayload
	if err := json.Unmarshal(payload, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func mergeWorkflowFlagOverrides(payload *workflowIntakePayload, sourceSystem, ticketID, ticketURL, workflowID, workflowURL, title, intent, labels, initialPrompt, executionMode, agentProfileID, systemPrompt string, maxOutputTokens int) {
	payload.SourceSystem = firstNonEmpty(sourceSystem, payload.SourceSystem)
	payload.TicketID = firstNonEmpty(ticketID, payload.TicketID)
	payload.TicketURL = firstNonEmpty(ticketURL, payload.TicketURL)
	payload.WorkflowID = firstNonEmpty(workflowID, payload.WorkflowID)
	payload.WorkflowURL = firstNonEmpty(workflowURL, payload.WorkflowURL)
	payload.Title = firstNonEmpty(title, payload.Title)
	payload.Intent = firstNonEmpty(intent, payload.Intent)
	payload.InitialPrompt = firstNonEmpty(initialPrompt, payload.InitialPrompt)
	payload.ExecutionMode = firstNonEmpty(executionMode, payload.ExecutionMode)
	payload.AgentProfileID = firstNonEmpty(agentProfileID, payload.AgentProfileID)
	payload.SystemPrompt = firstNonEmpty(systemPrompt, payload.SystemPrompt)
	if maxOutputTokens > 0 {
		payload.MaxOutputTokens = maxOutputTokens
	}
	if strings.TrimSpace(labels) != "" {
		payload.Labels = splitCommaValues(labels)
	}
}

func parseJSONObjectFlag(raw, label string) (map[string]interface{}, error) {
	var result map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return nil, fmt.Errorf("invalid %s: %w", label, err)
	}
	return result, nil
}

func sanitizeSourceFragment(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.ReplaceAll(value, " ", "_")
	value = strings.ReplaceAll(value, "/", "_")
	if value == "" {
		return "workflow"
	}
	return value
}

func splitCommaValues(raw string) []string {
	items := strings.Split(raw, ",")
	out := make([]string, 0, len(items))
	for _, item := range items {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func rawObject(raw json.RawMessage) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var out map[string]interface{}
	if err := json.Unmarshal(raw, &out); err != nil || out == nil {
		return map[string]interface{}{}
	}
	return out
}

func normalizeInterfaceString(value interface{}, fallback string) string {
	text := strings.TrimSpace(fmt.Sprintf("%v", value))
	if text == "" || text == "<nil>" {
		return strings.TrimSpace(fallback)
	}
	return text
}

func firstSessionID(items []runtimeapi.SessionRecord) string {
	if len(items) == 0 {
		return ""
	}
	return strings.TrimSpace(items[0].SessionID)
}

func printJSON(value interface{}) error {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	_, err = fmt.Println(string(payload))
	return err
}

func exitUsage(err error) {
	if err == nil {
		os.Exit(2)
	}
	if errors.Is(err, flag.ErrHelp) {
		os.Exit(0)
	}
	fmt.Fprintln(os.Stderr, err)
	os.Exit(2)
}
