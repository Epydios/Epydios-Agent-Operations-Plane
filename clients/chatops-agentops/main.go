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

type chatopsIntakePayload struct {
	SourceSystem    string                 `json:"sourceSystem"`
	ChannelID       string                 `json:"channelId,omitempty"`
	ChannelName     string                 `json:"channelName,omitempty"`
	ThreadID        string                 `json:"threadId,omitempty"`
	MessageID       string                 `json:"messageId,omitempty"`
	MessageURL      string                 `json:"messageUrl,omitempty"`
	ConversationURL string                 `json:"conversationUrl,omitempty"`
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

type chatopsIntakeResponse struct {
	Task   *runtimeapi.TaskRecord          `json:"task,omitempty"`
	Invoke *runtimeapi.AgentInvokeResponse `json:"invoke,omitempty"`
}

type chatopsStatusReport struct {
	SourceSystem        string                                `json:"sourceSystem,omitempty"`
	ChannelID           string                                `json:"channelId,omitempty"`
	ChannelName         string                                `json:"channelName,omitempty"`
	ThreadID            string                                `json:"threadId,omitempty"`
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
	root := flag.NewFlagSet("chatops-agentops", flag.ContinueOnError)
	root.SetOutput(os.Stderr)
	root.StringVar(&cfg.RuntimeAPIBaseURL, "runtime-api-base-url", cfg.RuntimeAPIBaseURL, "AgentOps runtime API base URL")
	root.StringVar(&cfg.TenantID, "tenant-id", cfg.TenantID, "tenant scope")
	root.StringVar(&cfg.ProjectID, "project-id", cfg.ProjectID, "project scope")
	root.StringVar(&cfg.AuthToken, "auth-token", cfg.AuthToken, "optional bearer token")
	root.BoolVar(&cfg.IncludeLegacySession, "include-legacy-sessions", cfg.IncludeLegacySession, "include legacy projected sessions")
	root.StringVar(&cfg.OutputFormat, "output", cfg.OutputFormat, "output format: text or json")
	root.IntVar(&cfg.LiveFollowWait, "live-follow-wait-seconds", cfg.LiveFollowWait, "poll wait window for event follow")
	root.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [global flags] conversations <intake|status> [flags]\n", os.Args[0])
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Global flags:")
		root.PrintDefaults()
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Commands:")
		fmt.Fprintln(os.Stderr, "  conversations intake --file payload.json")
		fmt.Fprintln(os.Stderr, "  conversations status --task-id <taskId> [--session-id <sessionId>] [--render update|text|json]")
	}
	if err := root.Parse(os.Args[1:]); err != nil {
		exitUsage(err)
	}
	cfg.OutputFormat = runtimeclient.NormalizeOutputFormat(cfg.OutputFormat)
	args := root.Args()
	if len(args) < 2 || args[0] != "conversations" {
		root.Usage()
		os.Exit(2)
	}
	client := runtimeclient.NewClient(cfg)
	ctx := context.Background()
	var err error
	switch args[1] {
	case "intake":
		err = runConversationIntake(ctx, client, cfg, args[2:])
	case "status":
		err = runConversationStatus(ctx, client, cfg, args[2:])
	default:
		err = fmt.Errorf("unknown conversations command %q", args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runConversationIntake(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	fs := flag.NewFlagSet("conversations intake", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	filePath := fs.String("file", "", "path to intake payload json")
	sourceSystem := fs.String("source-system", "", "external source system, for example slack or teams")
	channelID := fs.String("channel-id", "", "external channel id")
	channelName := fs.String("channel-name", "", "external channel name")
	threadID := fs.String("thread-id", "", "external thread id")
	messageID := fs.String("message-id", "", "external message id")
	messageURL := fs.String("message-url", "", "external message URL")
	conversationURL := fs.String("conversation-url", "", "external conversation URL")
	title := fs.String("title", "", "task title")
	intent := fs.String("intent", "", "task intent")
	labels := fs.String("labels", "", "comma-separated chatops labels")
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
	payload, err := loadChatopsIntakePayload(*filePath)
	if err != nil {
		return err
	}
	if payload == nil {
		payload = &chatopsIntakePayload{}
	}
	mergeChatopsFlagOverrides(payload, *sourceSystem, *channelID, *channelName, *threadID, *messageID, *messageURL, *conversationURL, *title, *intent, *labels, *initialPrompt, *executionMode, *agentProfileID, *systemPrompt, *maxOutputTokens)
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
		payload.SourceSystem = "chatops"
	}
	taskReq := runtimeapi.TaskCreateRequest{
		Meta: runtimeapi.ObjectMeta{
			TenantID:  client.TenantID(),
			ProjectID: client.ProjectID(),
			RequestID: fmt.Sprintf("chatops-intake-%d", time.Now().UTC().UnixNano()),
		},
		Source:      fmt.Sprintf("chatops.%s", sanitizeSourceFragment(payload.SourceSystem)),
		Title:       strings.TrimSpace(payload.Title),
		Intent:      strings.TrimSpace(payload.Intent),
		RequestedBy: payload.RequestedBy,
		Annotations: buildChatopsAnnotations(payload),
	}
	task, err := client.CreateTask(ctx, taskReq)
	if err != nil {
		return err
	}
	response := &chatopsIntakeResponse{Task: task}
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
	fmt.Printf("chatops intake created task=%s source=%s\n", task.TaskID, runtimeclient.NormalizeStringOrDefault(payload.SourceSystem, "chatops"))
	if response.Invoke != nil {
		fmt.Printf("initial turn session=%s mode=%s finish=%s\n", runtimeclient.NormalizeStringOrDefault(response.Invoke.SessionID, "-"), runtimeclient.NormalizeStringOrDefault(response.Invoke.ExecutionMode, payload.ExecutionMode), runtimeclient.NormalizeStringOrDefault(response.Invoke.FinishReason, "-"))
	}
	return nil
}

func runConversationStatus(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	fs := flag.NewFlagSet("conversations status", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	taskID := fs.String("task-id", "", "task id")
	sessionID := fs.String("session-id", "", "optional session id override")
	render := fs.String("render", "text", "render mode: update, text, or json")
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
	report := buildChatopsStatusReport(view)
	format := strings.ToLower(strings.TrimSpace(*render))
	if cfg.OutputFormat == "json" || format == "json" {
		return printJSON(report)
	}
	if format == "update" {
		fmt.Print(renderChatopsUpdate(report))
		return nil
	}
	return printChatopsStatusReport(report)
}

func buildChatopsAnnotations(payload *chatopsIntakePayload) map[string]interface{} {
	annotations := map[string]interface{}{
		"ingressKind":  "chatops",
		"sourceSystem": strings.TrimSpace(payload.SourceSystem),
	}
	if payload.ChannelID != "" {
		annotations["channelId"] = strings.TrimSpace(payload.ChannelID)
	}
	if payload.ChannelName != "" {
		annotations["channelName"] = strings.TrimSpace(payload.ChannelName)
	}
	if payload.ThreadID != "" {
		annotations["threadId"] = strings.TrimSpace(payload.ThreadID)
	}
	if payload.MessageID != "" {
		annotations["messageId"] = strings.TrimSpace(payload.MessageID)
	}
	if payload.MessageURL != "" {
		annotations["messageUrl"] = strings.TrimSpace(payload.MessageURL)
	}
	if payload.ConversationURL != "" {
		annotations["conversationUrl"] = strings.TrimSpace(payload.ConversationURL)
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

func buildChatopsStatusReport(view *runtimeclient.ThreadReview) *chatopsStatusReport {
	report := &chatopsStatusReport{}
	if view == nil {
		return report
	}
	report.TaskID = view.Task.TaskID
	report.Title = view.Task.Title
	report.TaskStatus = string(view.Task.Status)
	report.LatestSessionID = view.Task.LatestSessionID
	if annotations := rawObject(view.Task.Annotations); len(annotations) > 0 {
		report.SourceSystem = normalizeInterfaceString(annotations["sourceSystem"], "")
		report.ChannelID = normalizeInterfaceString(annotations["channelId"], "")
		report.ChannelName = normalizeInterfaceString(annotations["channelName"], "")
		report.ThreadID = normalizeInterfaceString(annotations["threadId"], "")
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

func renderChatopsUpdate(report *chatopsStatusReport) string {
	if report == nil {
		return ""
	}
	lines := []string{
		fmt.Sprintf("AgentOps update for %s", runtimeclient.NormalizeStringOrDefault(report.ThreadID, report.TaskID)),
		fmt.Sprintf("Status: %s", runtimeclient.NormalizeStringOrDefault(report.TaskStatus, "-")),
	}
	if report.Title != "" {
		lines = append(lines, fmt.Sprintf("Title: %s", report.Title))
	}
	if report.SessionStatus != "" {
		lines = append(lines, fmt.Sprintf("Session: %s (%s)", runtimeclient.NormalizeStringOrDefault(report.LatestSessionID, "-"), report.SessionStatus))
	}
	if report.SelectedWorkerID != "" || report.SelectedWorkerType != "" {
		lines = append(lines, fmt.Sprintf("Worker: %s %s %s", runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerID, "-"), runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerType, "-"), runtimeclient.NormalizeStringOrDefault(report.SelectedWorkerState, "-")))
	}
	lines = append(lines, fmt.Sprintf("Open approvals: %d", report.OpenApprovals))
	lines = append(lines, fmt.Sprintf("Pending proposals: %d", len(report.PendingProposals)))
	if report.LatestWorkerSummary != "" {
		lines = append(lines, fmt.Sprintf("Latest activity: %s", report.LatestWorkerSummary))
	}
	if len(report.PendingApprovals) > 0 {
		lines = append(lines, "Pending approvals:")
		for _, item := range report.PendingApprovals {
			lines = append(lines, fmt.Sprintf("- %s (%s)", item.CheckpointID, runtimeclient.NormalizeStringOrDefault(item.Scope, "scope-unspecified")))
		}
	}
	if len(report.PendingProposals) > 0 {
		lines = append(lines, "Pending proposals:")
		for _, item := range report.PendingProposals {
			lines = append(lines, fmt.Sprintf("- %s (%s)", item.ProposalID, runtimeclient.NormalizeStringOrDefault(item.Summary, item.Command)))
		}
	}
	return strings.Join(lines, "\n") + "\n"
}

func printChatopsStatusReport(report *chatopsStatusReport) error {
	fmt.Printf("Conversation: %s\n", runtimeclient.NormalizeStringOrDefault(report.ThreadID, "-"))
	fmt.Printf("Channel: %s (%s)\n", runtimeclient.NormalizeStringOrDefault(report.ChannelName, "-"), runtimeclient.NormalizeStringOrDefault(report.ChannelID, "-"))
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

func loadChatopsIntakePayload(path string) (*chatopsIntakePayload, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return &chatopsIntakePayload{}, nil
	}
	payload, err := os.ReadFile(trimmed)
	if err != nil {
		return nil, err
	}
	var result chatopsIntakePayload
	if err := json.Unmarshal(payload, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func mergeChatopsFlagOverrides(payload *chatopsIntakePayload, sourceSystem, channelID, channelName, threadID, messageID, messageURL, conversationURL, title, intent, labels, initialPrompt, executionMode, agentProfileID, systemPrompt string, maxOutputTokens int) {
	payload.SourceSystem = firstNonEmpty(sourceSystem, payload.SourceSystem)
	payload.ChannelID = firstNonEmpty(channelID, payload.ChannelID)
	payload.ChannelName = firstNonEmpty(channelName, payload.ChannelName)
	payload.ThreadID = firstNonEmpty(threadID, payload.ThreadID)
	payload.MessageID = firstNonEmpty(messageID, payload.MessageID)
	payload.MessageURL = firstNonEmpty(messageURL, payload.MessageURL)
	payload.ConversationURL = firstNonEmpty(conversationURL, payload.ConversationURL)
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
		return "chatops"
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
