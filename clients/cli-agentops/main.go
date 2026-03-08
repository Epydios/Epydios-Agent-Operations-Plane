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
	"text/tabwriter"
	"time"

	runtimeclient "github.com/Epydios/Epydios-AgentOps-Control-Plane/clients/internal/runtimeclient"
	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func main() {
	cfg := runtimeclient.LoadConfigFromEnv()
	root := flag.NewFlagSet("agentops-cli", flag.ContinueOnError)
	root.SetOutput(os.Stderr)
	root.StringVar(&cfg.RuntimeAPIBaseURL, "runtime-api-base-url", cfg.RuntimeAPIBaseURL, "AgentOps runtime API base URL")
	root.StringVar(&cfg.TenantID, "tenant-id", cfg.TenantID, "tenant scope")
	root.StringVar(&cfg.ProjectID, "project-id", cfg.ProjectID, "project scope")
	root.StringVar(&cfg.AuthToken, "auth-token", cfg.AuthToken, "optional bearer token")
	root.BoolVar(&cfg.IncludeLegacySession, "include-legacy-sessions", cfg.IncludeLegacySession, "include legacy projected sessions")
	root.StringVar(&cfg.OutputFormat, "output", cfg.OutputFormat, "output format: text or json")
	root.IntVar(&cfg.LiveFollowWait, "live-follow-wait-seconds", cfg.LiveFollowWait, "poll wait window for event follow")
	root.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [global flags] <threads|sessions|approvals|proposals|turns> <command> [flags]\n", os.Args[0])
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Global flags:")
		root.PrintDefaults()
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Commands:")
		fmt.Fprintln(os.Stderr, "  threads list")
		fmt.Fprintln(os.Stderr, "  threads show (--task-id <taskId> | --session-id <sessionId>) [--render text|update|report]")
		fmt.Fprintln(os.Stderr, "  sessions follow (--session-id <sessionId> | --task-id <taskId>) [--after-sequence N] [--wait-seconds N] [--once] [--render text|update|delta-update|report|delta-report]")
		fmt.Fprintln(os.Stderr, "  approvals decide [--session-id <sessionId>] [--checkpoint-id <checkpointId>] [--task-id <taskId>] --decision APPROVE|DENY [--reason text]")
		fmt.Fprintln(os.Stderr, "  proposals decide [--session-id <sessionId>] [--proposal-id <proposalId>] [--task-id <taskId>] --decision APPROVE|DENY [--reason text]")
		fmt.Fprintln(os.Stderr, "  turns send (--task-id <taskId> | --session-id <sessionId>) --prompt <text> [--execution-mode raw_model_invoke|managed_codex_worker]")
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
	case "threads":
		err = runThreadsCommand(ctx, client, cfg, args[1:])
	case "sessions":
		err = runSessionsCommand(ctx, client, cfg, args[1:])
	case "approvals":
		err = runApprovalsCommand(ctx, client, cfg, args[1:])
	case "proposals":
		err = runProposalsCommand(ctx, client, cfg, args[1:])
	case "turns":
		err = runTurnsCommand(ctx, client, cfg, args[1:])
	default:
		err = fmt.Errorf("unknown resource %q", args[0])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runThreadsCommand(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	switch args[0] {
	case "list":
		fs := flag.NewFlagSet("threads list", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		limit := fs.Int("limit", 25, "max tasks")
		offset := fs.Int("offset", 0, "offset")
		status := fs.String("status", "", "task status filter")
		search := fs.String("search", "", "search taskId, title, intent")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		response, err := client.ListTasks(ctx, *limit, *offset, *status, *search)
		if err != nil {
			return err
		}
		if cfg.OutputFormat == "json" {
			return printJSON(response)
		}
		return printTaskList(response)
	case "show":
		fs := flag.NewFlagSet("threads show", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		taskID := fs.String("task-id", "", "task id")
		sessionID := fs.String("session-id", "", "specific session id")
		render := fs.String("render", "text", "render mode: text, update, or report")
		reportSelection := runtimeclient.BindEnterpriseReportSelectionFlags(fs)
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		resolvedTaskID := strings.TrimSpace(*taskID)
		selectedID := strings.TrimSpace(*sessionID)
		if resolvedTaskID == "" && selectedID == "" {
			return fmt.Errorf("--task-id or --session-id is required")
		}
		if resolvedTaskID == "" {
			timeline, err := client.GetSessionTimeline(ctx, selectedID)
			if err != nil {
				return err
			}
			resolvedTaskID = normalizedTaskIDFromTimeline(timeline)
			if resolvedTaskID == "" {
				return fmt.Errorf("session %s is not linked to a task", selectedID)
			}
		}
		task, err := client.GetTask(ctx, resolvedTaskID)
		if err != nil {
			return err
		}
		sessionsResp, err := client.ListSessions(ctx, resolvedTaskID, 100, 0, "")
		if err != nil {
			return err
		}
		sessions := append([]runtimeapi.SessionRecord(nil), sessionsResp.Items...)
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[j].UpdatedAt.Before(sessions[i].UpdatedAt)
		})
		if selectedID == "" {
			selectedID = runtimeclient.NormalizeStringOrDefault(task.LatestSessionID, runtimeclient.NormalizeStringOrDefault(firstSessionID(sessions), ""))
		}
		var timeline *runtimeapi.SessionTimelineResponse
		if selectedID != "" {
			timeline, err = client.GetSessionTimeline(ctx, selectedID)
			if err != nil {
				return err
			}
		}
		view := runtimeclient.BuildThreadReview(task, sessions, selectedID, timeline)
		if cfg.OutputFormat == "json" {
			return printJSON(view)
		}
		switch strings.ToLower(strings.TrimSpace(*render)) {
		case "update":
			fmt.Print(renderCLIThreadEnvelope(view))
			return nil
		case "report":
			rendered, err := renderCLIReport(ctx, client, view, *reportSelection)
			if err != nil {
				return err
			}
			fmt.Print(rendered)
			return nil
		}
		return printThreadReview(view)
	default:
		return fmt.Errorf("unknown threads command %q", args[0])
	}
}

func runSessionsCommand(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	switch args[0] {
	case "follow":
		fs := flag.NewFlagSet("sessions follow", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		taskID := fs.String("task-id", "", "task id")
		sessionID := fs.String("session-id", "", "session id")
		afterSequence := fs.Int64("after-sequence", 0, "only stream events after this sequence")
		waitSeconds := fs.Int("wait-seconds", cfg.LiveFollowWait, "server wait seconds")
		once := fs.Bool("once", false, "fetch one event-stream window and exit")
		render := fs.String("render", "text", "render mode: text, update, delta-update, report, or delta-report")
		reportSelection := runtimeclient.BindEnterpriseReportSelectionFlags(fs)
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		resolvedSessionID := strings.TrimSpace(*sessionID)
		if resolvedSessionID == "" {
			if strings.TrimSpace(*taskID) == "" {
				return fmt.Errorf("--session-id or --task-id is required")
			}
			var err error
			resolvedSessionID, err = resolveLatestSessionIDForTask(ctx, client, *taskID)
			if err != nil {
				return err
			}
		}
		lastSequence := *afterSequence
		for {
			items, err := client.StreamSessionEvents(ctx, resolvedSessionID, lastSequence, *waitSeconds, !*once)
			if err != nil {
				return err
			}
			if cfg.OutputFormat == "json" {
				for _, item := range items {
					if err := printJSON(item); err != nil {
						return err
					}
				}
			} else if strings.EqualFold(strings.TrimSpace(*render), "update") || strings.EqualFold(strings.TrimSpace(*render), "delta-update") {
				if len(items) == 0 && (!*once || strings.EqualFold(strings.TrimSpace(*render), "delta-update")) {
					if *once {
						return nil
					}
				} else {
					timeline, err := client.GetSessionTimeline(ctx, resolvedSessionID)
					if err != nil {
						return err
					}
					fmt.Print(renderCLIFollowEnvelope(timeline, items, strings.EqualFold(strings.TrimSpace(*render), "delta-update")))
				}
			} else if strings.EqualFold(strings.TrimSpace(*render), "report") || strings.EqualFold(strings.TrimSpace(*render), "delta-report") {
				if len(items) == 0 && strings.EqualFold(strings.TrimSpace(*render), "delta-report") {
					if *once {
						return nil
					}
				} else {
					timeline, err := client.GetSessionTimeline(ctx, resolvedSessionID)
					if err != nil {
						return err
					}
					rendered, err := renderCLIFollowReport(ctx, client, timeline, items, strings.EqualFold(strings.TrimSpace(*render), "delta-report"), *reportSelection)
					if err != nil {
						return err
					}
					fmt.Print(rendered)
				}
			} else {
				printEventStream(items)
			}
			for _, item := range items {
				if item.Sequence > lastSequence {
					lastSequence = item.Sequence
				}
			}
			if *once {
				return nil
			}
		}
	default:
		return fmt.Errorf("unknown sessions command %q", args[0])
	}
}

func runApprovalsCommand(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	switch args[0] {
	case "decide":
		fs := flag.NewFlagSet("approvals decide", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		taskID := fs.String("task-id", "", "task id")
		sessionID := fs.String("session-id", "", "session id")
		checkpointID := fs.String("checkpoint-id", "", "checkpoint id")
		decision := fs.String("decision", "", "APPROVE or DENY")
		reason := fs.String("reason", "", "optional operator reason")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*decision) == "" {
			return fmt.Errorf("--decision is required")
		}
		resolvedSessionID, resolvedCheckpointID, err := resolveApprovalDecisionTarget(ctx, client, *taskID, *sessionID, *checkpointID)
		if err != nil {
			return err
		}
		response, err := client.SubmitApprovalDecision(ctx, resolvedSessionID, resolvedCheckpointID, *decision, *reason)
		if err != nil {
			return err
		}
		if cfg.OutputFormat == "json" {
			return printJSON(response)
		}
		fmt.Printf("approval %s %s -> %s (%s)\n", response.CheckpointID, strings.ToUpper(response.Decision), response.Status, runtimeclient.NormalizeStringOrDefault(response.Reason, "no reason"))
		return nil
	default:
		return fmt.Errorf("unknown approvals command %q", args[0])
	}
}

func runProposalsCommand(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	switch args[0] {
	case "decide":
		fs := flag.NewFlagSet("proposals decide", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		taskID := fs.String("task-id", "", "task id")
		sessionID := fs.String("session-id", "", "session id")
		proposalID := fs.String("proposal-id", "", "proposal id")
		decision := fs.String("decision", "", "APPROVE or DENY")
		reason := fs.String("reason", "", "optional operator reason")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*decision) == "" {
			return fmt.Errorf("--decision is required")
		}
		resolvedSessionID, resolvedProposalID, err := resolveProposalDecisionTarget(ctx, client, *taskID, *sessionID, *proposalID)
		if err != nil {
			return err
		}
		response, err := client.SubmitToolProposalDecision(ctx, resolvedSessionID, resolvedProposalID, *decision, *reason)
		if err != nil {
			return err
		}
		if cfg.OutputFormat == "json" {
			return printJSON(response)
		}
		fmt.Printf("proposal %s %s -> %s (toolAction=%s, actionStatus=%s)\n", response.ProposalID, strings.ToUpper(response.Decision), response.Status, runtimeclient.NormalizeStringOrDefault(response.ToolActionID, "-"), runtimeclient.NormalizeStringOrDefault(string(response.ActionStatus), "-"))
		return nil
	default:
		return fmt.Errorf("unknown proposals command %q", args[0])
	}
}

func runTurnsCommand(ctx context.Context, client *runtimeclient.Client, cfg runtimeclient.Config, args []string) error {
	switch args[0] {
	case "send":
		fs := flag.NewFlagSet("turns send", flag.ContinueOnError)
		fs.SetOutput(os.Stderr)
		taskID := fs.String("task-id", "", "task id")
		sessionID := fs.String("session-id", "", "session id")
		prompt := fs.String("prompt", "", "turn prompt")
		executionMode := fs.String("execution-mode", runtimeapi.AgentInvokeExecutionModeRawModelInvoke, "raw_model_invoke or managed_codex_worker")
		agentProfileID := fs.String("agent-profile", "codex", "agent profile id")
		systemPrompt := fs.String("system-prompt", "", "optional system prompt")
		maxOutputTokens := fs.Int("max-output-tokens", 0, "optional max output tokens")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		resolvedTaskID := strings.TrimSpace(*taskID)
		if resolvedTaskID == "" && strings.TrimSpace(*sessionID) != "" {
			timeline, err := client.GetSessionTimeline(ctx, *sessionID)
			if err != nil {
				return err
			}
			resolvedTaskID = normalizedTaskIDFromTimeline(timeline)
		}
		if resolvedTaskID == "" || strings.TrimSpace(*prompt) == "" {
			return fmt.Errorf("--prompt and either --task-id or --session-id are required")
		}
		response, err := client.InvokeTurn(ctx, resolvedTaskID, *prompt, *executionMode, *agentProfileID, *systemPrompt, *maxOutputTokens)
		if err != nil {
			return err
		}
		if cfg.OutputFormat == "json" {
			return printJSON(response)
		}
		fmt.Printf("turn submitted: task=%s session=%s mode=%s worker=%s finish=%s\n", runtimeclient.NormalizeStringOrDefault(response.TaskID, resolvedTaskID), runtimeclient.NormalizeStringOrDefault(response.SessionID, "-"), runtimeclient.NormalizeStringOrDefault(response.ExecutionMode, *executionMode), runtimeclient.NormalizeStringOrDefault(response.SelectedWorkerID, "-"), runtimeclient.NormalizeStringOrDefault(response.FinishReason, "-"))
		if strings.TrimSpace(response.OutputText) != "" {
			fmt.Println()
			fmt.Println(response.OutputText)
		}
		return nil
	default:
		return fmt.Errorf("unknown turns command %q", args[0])
	}
}

func printTaskList(response *runtimeclient.TaskListResponse) error {
	if response == nil {
		return nil
	}
	w := tabwriter.NewWriter(os.Stdout, 0, 8, 2, ' ', 0)
	fmt.Fprintln(w, "TASK ID\tSTATUS\tLATEST SESSION\tUPDATED\tTITLE")
	for _, item := range response.Items {
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
			item.TaskID,
			item.Status,
			runtimeclient.NormalizeStringOrDefault(item.LatestSessionID, "-"),
			item.UpdatedAt.UTC().Format(time.RFC3339),
			runtimeclient.ClipText(item.Title, 72),
		)
	}
	return w.Flush()
}

func printThreadReview(view *runtimeclient.ThreadReview) error {
	if view == nil {
		return nil
	}
	fmt.Printf("Task: %s\n", view.Task.TaskID)
	fmt.Printf("Title: %s\n", runtimeclient.NormalizeStringOrDefault(view.Task.Title, "-"))
	fmt.Printf("Status: %s\n", view.Task.Status)
	fmt.Printf("Intent: %s\n", runtimeclient.NormalizeStringOrDefault(view.Task.Intent, "-"))
	fmt.Printf("Latest Session: %s\n", runtimeclient.NormalizeStringOrDefault(view.Task.LatestSessionID, "-"))
	fmt.Println()
	fmt.Println("Sessions")
	w := tabwriter.NewWriter(os.Stdout, 0, 8, 2, ' ', 0)
	fmt.Fprintln(w, "SESSION ID\tSTATUS\tTYPE\tWORKER\tUPDATED")
	for _, item := range view.Sessions {
		selected := ""
		if view.SelectedSession != nil && item.SessionID == view.SelectedSession.SessionID {
			selected = "*"
		}
		fmt.Fprintf(w, "%s%s\t%s\t%s\t%s\t%s\n",
			selected,
			item.SessionID,
			item.Status,
			runtimeclient.NormalizeStringOrDefault(item.SessionType, "-"),
			runtimeclient.NormalizeStringOrDefault(item.SelectedWorkerID, "-"),
			item.UpdatedAt.UTC().Format(time.RFC3339),
		)
	}
	if err := w.Flush(); err != nil {
		return err
	}
	if view.Timeline == nil {
		return nil
	}
	fmt.Println()
	fmt.Println("Selected Session")
	fmt.Printf("Session ID: %s\n", view.Timeline.Session.SessionID)
	fmt.Printf("Status: %s\n", view.Timeline.Session.Status)
	fmt.Printf("Selected Worker: %s\n", runtimeclient.NormalizeStringOrDefault(view.Timeline.Session.SelectedWorkerID, "-"))
	if view.Timeline.SelectedWorker != nil {
		fmt.Printf("Worker Adapter: %s (%s)\n", runtimeclient.NormalizeStringOrDefault(view.Timeline.SelectedWorker.AdapterID, "-"), runtimeclient.NormalizeStringOrDefault(view.Timeline.SelectedWorker.WorkerType, "-"))
	}
	fmt.Printf("Open Approvals: %d\n", view.Timeline.OpenApprovalCount)
	fmt.Printf("Tool Actions: %d\n", len(view.Timeline.ToolActions))
	fmt.Printf("Evidence Records: %d\n", len(view.Timeline.EvidenceRecords))
	fmt.Printf("Events: %d\n", len(view.Timeline.Events))

	pendingApprovals := make([]runtimeapi.ApprovalCheckpointRecord, 0)
	for _, item := range view.Timeline.ApprovalCheckpoints {
		if strings.EqualFold(string(item.Status), string(runtimeapi.ApprovalStatusPending)) {
			pendingApprovals = append(pendingApprovals, item)
		}
	}
	if len(pendingApprovals) > 0 {
		fmt.Println()
		fmt.Println("Pending Approvals")
		for _, item := range pendingApprovals {
			fmt.Printf("- %s | scope=%s | status=%s | reason=%s\n", item.CheckpointID, runtimeclient.NormalizeStringOrDefault(item.Scope, "-"), item.Status, runtimeclient.NormalizeStringOrDefault(item.Reason, "-"))
		}
	}
	if len(view.ToolProposals) > 0 {
		fmt.Println()
		fmt.Println("Tool Proposals")
		for _, item := range view.ToolProposals {
			fmt.Printf("- %s | %s | %s | %s\n", item.ProposalID, runtimeclient.NormalizeStringOrDefault(item.Status, "PENDING"), runtimeclient.NormalizeStringOrDefault(item.ProposalType, "tool_proposal"), runtimeclient.NormalizeStringOrDefault(item.Summary, "-"))
			if item.Command != "" {
				fmt.Printf("  command: %s\n", item.Command)
			}
			if item.CWD != "" {
				fmt.Printf("  cwd: %s\n", item.CWD)
			}
			if item.ToolActionID != "" || item.ActionStatus != "" {
				fmt.Printf("  toolAction: %s (%s)\n", runtimeclient.NormalizeStringOrDefault(item.ToolActionID, "-"), runtimeclient.NormalizeStringOrDefault(string(item.ActionStatus), "-"))
			}
		}
	}
	if len(view.RecentEvents) > 0 {
		fmt.Println()
		fmt.Println("Recent Events")
		for _, item := range view.RecentEvents {
			fmt.Printf("- #%d %s %s | %s\n", item.Sequence, item.Timestamp, item.Label, item.Detail)
		}
	}
	if view.Transcript != nil && strings.TrimSpace(view.Transcript.Pretty) != "" {
		fmt.Println()
		fmt.Printf("Managed Transcript (%s)\n", view.Transcript.ToolActionID)
		fmt.Println(view.Transcript.Pretty)
	}
	if hints := renderCLIActionHints(view); len(hints) > 0 {
		fmt.Println()
		fmt.Println("Action Hints")
		for _, hint := range hints {
			fmt.Println(hint)
		}
	}
	return nil
}

func printEventStream(items []runtimeapi.SessionEventRecord) {
	for _, item := range items {
		fmt.Printf("#%d %s %s | %s\n", item.Sequence, item.Timestamp.UTC().Format(time.RFC3339), runtimeclient.SummarizeEventLabel(string(item.EventType)), runtimeclient.SummarizeEventDetail(item))
	}
}

func printJSON(value interface{}) error {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	_, err = fmt.Println(string(payload))
	return err
}

func firstSessionID(items []runtimeapi.SessionRecord) string {
	if len(items) == 0 {
		return ""
	}
	return strings.TrimSpace(items[0].SessionID)
}

func normalizedTaskIDFromTimeline(timeline *runtimeapi.SessionTimelineResponse) string {
	if timeline == nil {
		return ""
	}
	return runtimeclient.NormalizeStringOrDefault(
		runtimeclient.NormalizeStringOrDefault(timeline.Task.TaskID, timeline.Session.TaskID),
		"",
	)
}

func resolveLatestSessionIDForTask(ctx context.Context, client *runtimeclient.Client, taskID string) (string, error) {
	sessionsResp, err := client.ListSessions(ctx, strings.TrimSpace(taskID), 100, 0, "")
	if err != nil {
		return "", err
	}
	sessions := append([]runtimeapi.SessionRecord(nil), sessionsResp.Items...)
	sort.SliceStable(sessions, func(i, j int) bool {
		return sessions[j].UpdatedAt.Before(sessions[i].UpdatedAt)
	})
	resolved := runtimeclient.NormalizeStringOrDefault(firstSessionID(sessions), "")
	if resolved == "" {
		task, err := client.GetTask(ctx, taskID)
		if err != nil {
			return "", err
		}
		resolved = runtimeclient.NormalizeStringOrDefault(task.LatestSessionID, "")
	}
	if resolved == "" {
		return "", fmt.Errorf("no session available for task %s", strings.TrimSpace(taskID))
	}
	return resolved, nil
}

func resolveSessionTimeline(ctx context.Context, client *runtimeclient.Client, taskID, sessionID string) (string, *runtimeapi.SessionTimelineResponse, error) {
	resolvedSessionID := strings.TrimSpace(sessionID)
	if resolvedSessionID == "" {
		if strings.TrimSpace(taskID) == "" {
			return "", nil, fmt.Errorf("--task-id or --session-id is required")
		}
		var err error
		resolvedSessionID, err = resolveLatestSessionIDForTask(ctx, client, taskID)
		if err != nil {
			return "", nil, err
		}
	}
	timeline, err := client.GetSessionTimeline(ctx, resolvedSessionID)
	if err != nil {
		return "", nil, err
	}
	return resolvedSessionID, timeline, nil
}

func pendingApprovalItems(timeline *runtimeapi.SessionTimelineResponse) []runtimeclient.PendingTargetItem {
	if timeline == nil {
		return nil
	}
	items := make([]runtimeclient.PendingTargetItem, 0)
	for _, item := range timeline.ApprovalCheckpoints {
		if strings.EqualFold(string(item.Status), string(runtimeapi.ApprovalStatusPending)) {
			items = append(items, runtimeclient.PendingTargetItem{
				ID:    strings.TrimSpace(item.CheckpointID),
				Label: runtimeclient.NormalizeStringOrDefault(item.CheckpointID, item.Scope),
			})
		}
	}
	return items
}

func pendingProposalItems(timeline *runtimeapi.SessionTimelineResponse) []runtimeclient.PendingTargetItem {
	if timeline == nil {
		return nil
	}
	items := make([]runtimeclient.PendingTargetItem, 0)
	for _, item := range runtimeclient.ListToolProposals(timeline) {
		status := runtimeclient.NormalizeStringOrDefault(item.Status, "PENDING")
		if strings.EqualFold(status, "PENDING") {
			items = append(items, runtimeclient.PendingTargetItem{
				ID:    strings.TrimSpace(item.ProposalID),
				Label: runtimeclient.NormalizeStringOrDefault(item.ProposalID, item.Summary),
			})
		}
	}
	return items
}

func resolveApprovalDecisionTarget(ctx context.Context, client *runtimeclient.Client, taskID, sessionID, checkpointID string) (string, string, error) {
	resolvedSessionID, timeline, err := resolveSessionTimeline(ctx, client, taskID, sessionID)
	if err != nil {
		return "", "", err
	}
	return runtimeclient.ResolvePendingTarget(runtimeclient.PendingTargetLookup{
		SessionID:         resolvedSessionID,
		ExplicitTargetID:  strings.TrimSpace(checkpointID),
		TargetSingular:    "approval",
		TargetPlural:      "approvals",
		ContextLabel:      "thread context",
		ExplicitFlag:      "checkpoint-id",
		Items:             pendingApprovalItems(timeline),
		FallbackSessionID: resolvedSessionID,
	})
}

func resolveProposalDecisionTarget(ctx context.Context, client *runtimeclient.Client, taskID, sessionID, proposalID string) (string, string, error) {
	resolvedSessionID, timeline, err := resolveSessionTimeline(ctx, client, taskID, sessionID)
	if err != nil {
		return "", "", err
	}
	return runtimeclient.ResolvePendingTarget(runtimeclient.PendingTargetLookup{
		SessionID:         resolvedSessionID,
		ExplicitTargetID:  strings.TrimSpace(proposalID),
		TargetSingular:    "proposal",
		TargetPlural:      "proposals",
		ContextLabel:      "thread context",
		ExplicitFlag:      "proposal-id",
		Items:             pendingProposalItems(timeline),
		FallbackSessionID: resolvedSessionID,
	})
}

func renderCLIActionHints(view *runtimeclient.ThreadReview) []string {
	return runtimeclient.BuildThreadDecisionActionHints(
		view,
		runtimeclient.BuildThreadContextHint(view, view.Task.TaskID),
		"approvals decide",
		"proposals decide",
	)
}

func renderCLIThreadEnvelope(view *runtimeclient.ThreadReview) string {
	if view == nil {
		return runtimeclient.RenderGovernedUpdateEnvelope(runtimeclient.GovernedUpdateEnvelope{
			Header:     "AgentOps thread update",
			UpdateType: "review",
			Summary:    "Governed thread state refreshed.",
		})
	}
	details := make([]string, 0, 4)
	if view != nil && view.SelectedSession != nil {
		details = append(details, fmt.Sprintf("Selected session: %s", runtimeclient.NormalizeStringOrDefault(view.SelectedSession.SessionID, "-")))
	}
	if view != nil && view.Timeline != nil && view.Timeline.SelectedWorker != nil {
		details = append(details, fmt.Sprintf("Worker adapter: %s (%s)", runtimeclient.NormalizeStringOrDefault(view.Timeline.SelectedWorker.AdapterID, "-"), runtimeclient.NormalizeStringOrDefault(view.Timeline.SelectedWorker.WorkerType, "-")))
	}
	if view != nil && view.Transcript != nil && strings.TrimSpace(view.Transcript.ToolActionID) != "" {
		details = append(details, fmt.Sprintf("Managed transcript: %s", view.Transcript.ToolActionID))
	}
	if len(runtimeclient.PendingApprovalIDsFromThreadReview(view)) > 0 {
		details = append(details, fmt.Sprintf("Pending approvals: %d", len(runtimeclient.PendingApprovalIDsFromThreadReview(view))))
	}
	if len(runtimeclient.PendingProposalIDsFromThreadReview(view)) > 0 {
		details = append(details, fmt.Sprintf("Pending proposals: %d", len(runtimeclient.PendingProposalIDsFromThreadReview(view))))
	}
	summary := "Governed thread state refreshed."
	if view != nil && len(view.RecentEvents) > 0 {
		summary = runtimeclient.NormalizeStringOrDefault(view.RecentEvents[len(view.RecentEvents)-1].Detail, summary)
	}
	envelope := runtimeclient.BuildThreadGovernedUpdateEnvelope(view, runtimeclient.ThreadEnvelopeOptions{
		Header:       "AgentOps thread update",
		UpdateType:   "review",
		ContextLabel: "Thread",
		ContextValue: runtimeclient.NormalizeStringOrDefault(view.Task.TaskID, "-"),
		SubjectLabel: "Task",
		SubjectValue: runtimeclient.NormalizeStringOrDefault(view.Task.Title, view.Task.TaskID),
		Summary:      summary,
		Details:      details,
		ActionHints:  renderCLIActionHints(view),
	})
	return runtimeclient.RenderGovernedUpdateEnvelope(envelope)
}

func renderCLIReport(ctx context.Context, client *runtimeclient.Client, view *runtimeclient.ThreadReview, selection runtimeclient.EnterpriseReportSelection) (string, error) {
	if view == nil {
		return "", nil
	}
	workerType, workerAdapterID, workerState, workerID, executionMode := cliSelectedWorkerContext(view)
	workerCapabilities, err := client.ListWorkerCapabilities(ctx, executionMode, workerType, workerAdapterID)
	if err != nil {
		return "", err
	}
	policyPacks, err := client.ListPolicyPacks(ctx, "", executionMode, workerType, workerAdapterID, "cli")
	if err != nil {
		return "", err
	}
	exportProfiles, disposition, err := runtimeclient.LoadEnterpriseReportSelectionCatalog(ctx, client, "report", "cli", selection)
	if err != nil {
		return "", err
	}
	orgAdminProfiles, err := client.ListOrgAdminProfiles(ctx, "", "", "", "cli")
	if err != nil {
		return "", err
	}
	envelope := runtimeclient.BuildEnterpriseReportEnvelope(runtimeclient.EnterpriseReportSubject{
		Header:               "AgentOps CLI governance report",
		ReportType:           "report",
		ExportProfile:        disposition.ExportProfile,
		Audience:             disposition.Audience,
		RetentionClass:       disposition.RetentionClass,
		ClientSurface:        "cli",
		ContextLabel:         "Thread",
		ContextValue:         runtimeclient.NormalizeStringOrDefault(view.Task.TaskID, "-"),
		SubjectLabel:         "Task",
		SubjectValue:         runtimeclient.NormalizeStringOrDefault(view.Task.Title, view.Task.TaskID),
		TaskID:               view.Task.TaskID,
		TaskStatus:           string(view.Task.Status),
		SessionID:            cliSelectedSessionID(view),
		SessionStatus:        cliSelectedSessionStatus(view),
		WorkerID:             workerID,
		WorkerType:           workerType,
		WorkerAdapterID:      workerAdapterID,
		WorkerState:          workerState,
		ExecutionMode:        executionMode,
		OpenApprovals:        cliOpenApprovalCount(view),
		PendingProposalCount: len(runtimeclient.PendingProposalIDsFromThreadReview(view)),
		ToolActionCount:      cliToolActionCount(view),
		EvidenceCount:        cliEvidenceCount(view),
		ApprovalCheckpoints:  cliApprovalCheckpoints(view),
		SessionEvents:        append([]runtimeapi.SessionEventRecord(nil), view.Timeline.Events...),
		EvidenceRecords:      append([]runtimeapi.EvidenceRecord(nil), view.Timeline.EvidenceRecords...),
		Summary:              cliThreadSummary(view),
		Details:              buildCLIReportDetails(view),
		Recent:               runtimeclient.RenderEventSummaryLines(view.RecentEvents, 4),
		ActionHints:          renderCLIActionHints(view),
	}, policyPacks, workerCapabilities, exportProfiles, orgAdminProfiles)
	return runtimeclient.RenderEnterpriseReportEnvelope(envelope), nil
}

func renderCLIFollowReport(ctx context.Context, client *runtimeclient.Client, timeline *runtimeapi.SessionTimelineResponse, items []runtimeapi.SessionEventRecord, deltaOnly bool, selection runtimeclient.EnterpriseReportSelection) (string, error) {
	if timeline == nil {
		return "", nil
	}
	task := timeline.Task
	if task == nil {
		task = &runtimeapi.TaskRecord{TaskID: runtimeclient.NormalizeStringOrDefault(timeline.Session.TaskID, "")}
	}
	view := runtimeclient.BuildThreadReview(task, nil, timeline.Session.SessionID, timeline)
	workerType, workerAdapterID, workerState, workerID, executionMode := cliSelectedWorkerContext(view)
	workerCapabilities, err := client.ListWorkerCapabilities(ctx, executionMode, workerType, workerAdapterID)
	if err != nil {
		return "", err
	}
	policyPacks, err := client.ListPolicyPacks(ctx, "", executionMode, workerType, workerAdapterID, "cli")
	if err != nil {
		return "", err
	}
	reportType := "report"
	if deltaOnly {
		reportType = "delta-report"
	}
	exportProfiles, disposition, err := runtimeclient.LoadEnterpriseReportSelectionCatalog(ctx, client, reportType, "cli", selection)
	if err != nil {
		return "", err
	}
	orgAdminProfiles, err := client.ListOrgAdminProfiles(ctx, "", "", "", "cli")
	if err != nil {
		return "", err
	}
	envelope := runtimeclient.BuildEnterpriseReportEnvelope(runtimeclient.EnterpriseReportSubject{
		Header:               "AgentOps CLI governance report",
		ReportType:           reportType,
		ExportProfile:        disposition.ExportProfile,
		Audience:             disposition.Audience,
		RetentionClass:       disposition.RetentionClass,
		ClientSurface:        "cli",
		ContextLabel:         "Thread",
		ContextValue:         runtimeclient.NormalizeStringOrDefault(task.TaskID, "-"),
		SubjectLabel:         "Task",
		SubjectValue:         runtimeclient.NormalizeStringOrDefault(task.Title, task.TaskID),
		TaskID:               task.TaskID,
		TaskStatus:           string(task.Status),
		SessionID:            timeline.Session.SessionID,
		SessionStatus:        string(timeline.Session.Status),
		WorkerID:             workerID,
		WorkerType:           workerType,
		WorkerAdapterID:      workerAdapterID,
		WorkerState:          workerState,
		ExecutionMode:        executionMode,
		OpenApprovals:        timeline.OpenApprovalCount,
		PendingProposalCount: len(runtimeclient.PendingProposalIDsFromThreadReview(view)),
		ToolActionCount:      len(timeline.ToolActions),
		EvidenceCount:        len(timeline.EvidenceRecords),
		ApprovalCheckpoints:  append([]runtimeapi.ApprovalCheckpointRecord(nil), timeline.ApprovalCheckpoints...),
		SessionEvents:        append([]runtimeapi.SessionEventRecord(nil), timeline.Events...),
		EvidenceRecords:      append([]runtimeapi.EvidenceRecord(nil), timeline.EvidenceRecords...),
		Summary:              runtimeclient.BuildThreadFollowSummary(items),
		Details:              append(runtimeclient.BuildThreadFollowDetails(items), buildCLITranscriptAndEvidenceDetails(view)...),
		Recent:               runtimeclient.RenderSessionEventLines(items, 4),
		ActionHints:          renderCLIActionHints(view),
	}, policyPacks, workerCapabilities, exportProfiles, orgAdminProfiles)
	return runtimeclient.RenderEnterpriseReportEnvelope(envelope), nil
}

func renderCLIFollowEnvelope(timeline *runtimeapi.SessionTimelineResponse, items []runtimeapi.SessionEventRecord, deltaOnly bool) string {
	if timeline == nil {
		return runtimeclient.RenderGovernedUpdateEnvelope(runtimeclient.GovernedUpdateEnvelope{
			Header:     "AgentOps thread update",
			UpdateType: "follow",
			Summary:    runtimeclient.BuildThreadFollowSummary(items),
			Details:    runtimeclient.BuildThreadFollowDetails(items),
			Recent:     runtimeclient.RenderSessionEventLines(items, 4),
		})
	}
	task := timeline.Task
	if task == nil {
		task = &runtimeapi.TaskRecord{TaskID: runtimeclient.NormalizeStringOrDefault(timeline.Session.TaskID, "")}
	}
	view := runtimeclient.BuildThreadReview(task, nil, timeline.Session.SessionID, timeline)
	options := runtimeclient.ThreadEnvelopeOptions{
		Header:       "AgentOps thread update",
		UpdateType:   "follow",
		ContextLabel: "Thread",
		ContextValue: runtimeclient.NormalizeStringOrDefault(task.TaskID, "-"),
		SubjectLabel: "Task",
		SubjectValue: runtimeclient.NormalizeStringOrDefault(task.Title, task.TaskID),
		Summary:      runtimeclient.BuildThreadFollowSummary(items),
		Details:      runtimeclient.BuildThreadFollowDetails(items),
		ActionHints:  renderCLIActionHints(view),
	}
	if deltaOnly {
		options.UpdateType = "follow_delta"
		options.Recent = runtimeclient.RenderSessionEventLines(items, 4)
	}
	envelope := runtimeclient.BuildThreadGovernedUpdateEnvelope(view, options)
	return runtimeclient.RenderGovernedUpdateEnvelope(envelope)
}

func buildCLIReportDetails(view *runtimeclient.ThreadReview) []string {
	details := make([]string, 0, 8)
	if view == nil {
		return details
	}
	if view.SelectedSession != nil {
		details = append(details, fmt.Sprintf("Selected session: %s", runtimeclient.NormalizeStringOrDefault(view.SelectedSession.SessionID, "-")))
	}
	if worker := cliSelectedWorker(view); worker != nil {
		details = append(details, fmt.Sprintf("Worker adapter: %s (%s)", runtimeclient.NormalizeStringOrDefault(worker.AdapterID, "-"), runtimeclient.NormalizeStringOrDefault(worker.WorkerType, "-")))
	}
	if len(runtimeclient.PendingApprovalIDsFromThreadReview(view)) > 0 {
		details = append(details, fmt.Sprintf("Pending approvals: %d", len(runtimeclient.PendingApprovalIDsFromThreadReview(view))))
	}
	if len(runtimeclient.PendingProposalIDsFromThreadReview(view)) > 0 {
		details = append(details, fmt.Sprintf("Pending proposals: %d", len(runtimeclient.PendingProposalIDsFromThreadReview(view))))
	}
	return append(details, buildCLITranscriptAndEvidenceDetails(view)...)
}

func buildCLITranscriptAndEvidenceDetails(view *runtimeclient.ThreadReview) []string {
	details := make([]string, 0, 4)
	if view == nil {
		return details
	}
	if view.Transcript != nil {
		preview := strings.Join(strings.Fields(view.Transcript.Pretty), " ")
		if len(preview) > 180 {
			preview = preview[:180] + "..."
		}
		details = append(details, fmt.Sprintf("Transcript preview: %s", preview))
	}
	if view.Timeline != nil {
		limit := len(view.Timeline.EvidenceRecords)
		if limit > 3 {
			limit = 3
		}
		for idx := 0; idx < limit; idx++ {
			item := view.Timeline.EvidenceRecords[idx]
			details = append(details, fmt.Sprintf("Evidence preview: %s | %s | %s", runtimeclient.NormalizeStringOrDefault(item.Kind, "-"), runtimeclient.NormalizeStringOrDefault(item.EvidenceID, "-"), runtimeclient.NormalizeStringOrDefault(item.URI, "-")))
		}
	}
	return details
}

func cliSelectedWorker(view *runtimeclient.ThreadReview) *runtimeapi.SessionWorkerRecord {
	if view == nil || view.Timeline == nil {
		return nil
	}
	return view.Timeline.SelectedWorker
}

func cliSelectedWorkerContext(view *runtimeclient.ThreadReview) (workerType, adapterID, workerState, workerID, executionMode string) {
	if worker := cliSelectedWorker(view); worker != nil {
		workerType = strings.TrimSpace(worker.WorkerType)
		adapterID = strings.TrimSpace(worker.AdapterID)
		workerState = string(worker.Status)
		workerID = strings.TrimSpace(worker.WorkerID)
		executionMode = runtimeclient.ExecutionModeForWorker(workerType, adapterID)
	}
	return workerType, adapterID, workerState, workerID, executionMode
}

func cliSelectedSessionID(view *runtimeclient.ThreadReview) string {
	if view != nil && view.SelectedSession != nil {
		return view.SelectedSession.SessionID
	}
	if view != nil && view.Timeline != nil {
		return view.Timeline.Session.SessionID
	}
	return ""
}

func cliSelectedSessionStatus(view *runtimeclient.ThreadReview) string {
	if view != nil && view.SelectedSession != nil {
		return string(view.SelectedSession.Status)
	}
	if view != nil && view.Timeline != nil {
		return string(view.Timeline.Session.Status)
	}
	return ""
}

func cliOpenApprovalCount(view *runtimeclient.ThreadReview) int {
	if view != nil && view.Timeline != nil {
		return view.Timeline.OpenApprovalCount
	}
	return 0
}

func cliApprovalCheckpoints(view *runtimeclient.ThreadReview) []runtimeapi.ApprovalCheckpointRecord {
	if view != nil && view.Timeline != nil {
		return append([]runtimeapi.ApprovalCheckpointRecord(nil), view.Timeline.ApprovalCheckpoints...)
	}
	return nil
}

func cliToolActionCount(view *runtimeclient.ThreadReview) int {
	if view != nil && view.Timeline != nil {
		return len(view.Timeline.ToolActions)
	}
	return 0
}

func cliEvidenceCount(view *runtimeclient.ThreadReview) int {
	if view != nil && view.Timeline != nil {
		return len(view.Timeline.EvidenceRecords)
	}
	return 0
}

func cliThreadSummary(view *runtimeclient.ThreadReview) string {
	summary := "Enterprise review posture refreshed."
	if view != nil && len(view.RecentEvents) > 0 {
		summary = runtimeclient.NormalizeStringOrDefault(view.RecentEvents[len(view.RecentEvents)-1].Detail, summary)
	}
	return summary
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
