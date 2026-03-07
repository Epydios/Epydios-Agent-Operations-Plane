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
}

type workflowStatusReport struct {
	SourceSystem        string                                `json:"sourceSystem,omitempty"`
	TicketID            string                                `json:"ticketId,omitempty"`
	WorkflowID          string                                `json:"workflowId,omitempty"`
	TaskID              string                                `json:"taskId"`
	Title               string                                `json:"title,omitempty"`
	TaskStatus          string                                `json:"taskStatus,omitempty"`
	LatestSessionID     string                                `json:"latestSessionId,omitempty"`
	SessionStatus       string                                `json:"sessionStatus,omitempty"`
	SelectedWorkerID    string                                `json:"selectedWorkerId,omitempty"`
	SelectedWorkerType  string                                `json:"selectedWorkerType,omitempty"`
	SelectedWorkerState string                                `json:"selectedWorkerStatus,omitempty"`
	OpenApprovals       int                                   `json:"openApprovals,omitempty"`
	PendingApprovals    []runtimeapi.ApprovalCheckpointRecord `json:"pendingApprovals,omitempty"`
	PendingProposals    []runtimeclient.ToolProposalReview    `json:"pendingProposals,omitempty"`
	ToolActionCount     int                                   `json:"toolActionCount,omitempty"`
	EvidenceCount       int                                   `json:"evidenceCount,omitempty"`
	LatestWorkerSummary string                                `json:"latestWorkerSummary,omitempty"`
	RecentEvents        []runtimeclient.EventSummary          `json:"recentEvents,omitempty"`
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
		fmt.Fprintf(os.Stderr, "Usage: %s [global flags] tickets <intake|status> [flags]\n", os.Args[0])
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Global flags:")
		root.PrintDefaults()
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Commands:")
		fmt.Fprintln(os.Stderr, "  tickets intake --file payload.json")
		fmt.Fprintln(os.Stderr, "  tickets status --task-id <taskId> [--session-id <sessionId>] [--render comment|text|json]")
	}
	if err := root.Parse(os.Args[1:]); err != nil {
		exitUsage(err)
	}
	cfg.OutputFormat = runtimeclient.NormalizeOutputFormat(cfg.OutputFormat)
	args := root.Args()
	if len(args) < 2 || args[0] != "tickets" {
		root.Usage()
		os.Exit(2)
	}
	client := runtimeclient.NewClient(cfg)
	ctx := context.Background()
	var err error
	switch args[1] {
	case "intake":
		err = runTicketIntake(ctx, client, cfg, args[2:])
	case "status":
		err = runTicketStatus(ctx, client, cfg, args[2:])
	default:
		err = fmt.Errorf("unknown tickets command %q", args[1])
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
	if cfg.OutputFormat == "json" {
		return printJSON(response)
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
	taskID := fs.String("task-id", "", "task id")
	sessionID := fs.String("session-id", "", "optional session id override")
	render := fs.String("render", "text", "render mode: text, comment, or json")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*taskID) == "" {
		return fmt.Errorf("--task-id is required")
	}
	task, err := client.GetTask(ctx, *taskID)
	if err != nil {
		return err
	}
	sessionsResp, err := client.ListSessions(ctx, task.TaskID, 100, 0, "")
	if err != nil {
		return err
	}
	sessions := append([]runtimeapi.SessionRecord(nil), sessionsResp.Items...)
	sort.SliceStable(sessions, func(i, j int) bool {
		return sessions[j].UpdatedAt.Before(sessions[i].UpdatedAt)
	})
	selectedID := strings.TrimSpace(*sessionID)
	if selectedID == "" {
		selectedID = runtimeclient.NormalizeStringOrDefault(task.LatestSessionID, firstSessionID(sessions))
	}
	var timeline *runtimeapi.SessionTimelineResponse
	if selectedID != "" {
		timeline, err = client.GetSessionTimeline(ctx, selectedID)
		if err != nil {
			return err
		}
	}
	view := runtimeclient.BuildThreadReview(task, sessions, selectedID, timeline)
	report := buildWorkflowStatusReport(view)
	format := strings.ToLower(strings.TrimSpace(*render))
	if cfg.OutputFormat == "json" || format == "json" {
		return printJSON(report)
	}
	if format == "comment" {
		fmt.Print(renderWorkflowComment(report))
		return nil
	}
	return printWorkflowStatusReport(report)
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
		report.SelectedWorkerState = runtimeclient.NormalizeStringOrDefault(string(view.Timeline.SelectedWorker.Status), "")
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

func renderWorkflowComment(report *workflowStatusReport) string {
	if report == nil {
		return ""
	}
	lines := []string{
		fmt.Sprintf("AgentOps update for %s", runtimeclient.NormalizeStringOrDefault(report.TicketID, report.TaskID)),
		fmt.Sprintf("- Task: %s (%s)", runtimeclient.NormalizeStringOrDefault(report.TaskID, "-"), runtimeclient.NormalizeStringOrDefault(report.TaskStatus, "-")),
	}
	if report.Title != "" {
		lines = append(lines, fmt.Sprintf("- Title: %s", report.Title))
	}
	if report.SessionStatus != "" {
		lines = append(lines, fmt.Sprintf("- Session: %s (%s)", runtimeclient.NormalizeStringOrDefault(report.LatestSessionID, "-"), report.SessionStatus))
	}
	if report.SelectedWorkerID != "" || report.SelectedWorkerType != "" {
		lines = append(lines, fmt.Sprintf("- Worker: %s %s %s", runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerID, "-"), runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerType, "-"), runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerState, "-")))
	}
	lines = append(lines, fmt.Sprintf("- Open approvals: %d", report.OpenApprovals))
	lines = append(lines, fmt.Sprintf("- Pending proposals: %d", len(report.PendingProposals)))
	if report.LatestWorkerSummary != "" {
		lines = append(lines, fmt.Sprintf("- Latest activity: %s", report.LatestWorkerSummary))
	}
	if len(report.PendingApprovals) > 0 {
		lines = append(lines, "- Pending approval IDs:")
		for _, item := range report.PendingApprovals {
			lines = append(lines, fmt.Sprintf("  - %s (%s)", item.CheckpointID, runtimeclient.NormalizeStringOrDefault(item.Scope, "scope-unspecified")))
		}
	}
	if len(report.PendingProposals) > 0 {
		lines = append(lines, "- Pending proposal IDs:")
		for _, item := range report.PendingProposals {
			lines = append(lines, fmt.Sprintf("  - %s (%s)", item.ProposalID, runtimeclient.NormalizeStringOrDefault(item.Summary, item.Command)))
		}
	}
	return strings.Join(lines, "\n") + "\n"
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
