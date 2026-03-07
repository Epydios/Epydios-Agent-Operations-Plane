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
		fmt.Fprintln(os.Stderr, "  threads show --task-id <taskId> [--session-id <sessionId>]")
		fmt.Fprintln(os.Stderr, "  sessions follow --session-id <sessionId> [--after-sequence N] [--wait-seconds N] [--once]")
		fmt.Fprintln(os.Stderr, "  approvals decide --session-id <sessionId> --checkpoint-id <checkpointId> --decision APPROVE|DENY [--reason text]")
		fmt.Fprintln(os.Stderr, "  proposals decide --session-id <sessionId> --proposal-id <proposalId> --decision APPROVE|DENY [--reason text]")
		fmt.Fprintln(os.Stderr, "  turns send --task-id <taskId> --prompt <text> [--execution-mode raw_model_invoke|managed_codex_worker]")
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
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*taskID) == "" {
			return fmt.Errorf("--task-id is required")
		}
		task, err := client.GetTask(ctx, *taskID)
		if err != nil {
			return err
		}
		sessionsResp, err := client.ListSessions(ctx, *taskID, 100, 0, "")
		if err != nil {
			return err
		}
		sessions := append([]runtimeapi.SessionRecord(nil), sessionsResp.Items...)
		sort.SliceStable(sessions, func(i, j int) bool {
			return sessions[j].UpdatedAt.Before(sessions[i].UpdatedAt)
		})
		selectedID := strings.TrimSpace(*sessionID)
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
		sessionID := fs.String("session-id", "", "session id")
		afterSequence := fs.Int64("after-sequence", 0, "only stream events after this sequence")
		waitSeconds := fs.Int("wait-seconds", cfg.LiveFollowWait, "server wait seconds")
		once := fs.Bool("once", false, "fetch one event-stream window and exit")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*sessionID) == "" {
			return fmt.Errorf("--session-id is required")
		}
		lastSequence := *afterSequence
		for {
			items, err := client.StreamSessionEvents(ctx, *sessionID, lastSequence, *waitSeconds, !*once)
			if err != nil {
				return err
			}
			if cfg.OutputFormat == "json" {
				for _, item := range items {
					if err := printJSON(item); err != nil {
						return err
					}
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
		sessionID := fs.String("session-id", "", "session id")
		checkpointID := fs.String("checkpoint-id", "", "checkpoint id")
		decision := fs.String("decision", "", "APPROVE or DENY")
		reason := fs.String("reason", "", "optional operator reason")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*sessionID) == "" || strings.TrimSpace(*checkpointID) == "" || strings.TrimSpace(*decision) == "" {
			return fmt.Errorf("--session-id, --checkpoint-id, and --decision are required")
		}
		response, err := client.SubmitApprovalDecision(ctx, *sessionID, *checkpointID, *decision, *reason)
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
		sessionID := fs.String("session-id", "", "session id")
		proposalID := fs.String("proposal-id", "", "proposal id")
		decision := fs.String("decision", "", "APPROVE or DENY")
		reason := fs.String("reason", "", "optional operator reason")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*sessionID) == "" || strings.TrimSpace(*proposalID) == "" || strings.TrimSpace(*decision) == "" {
			return fmt.Errorf("--session-id, --proposal-id, and --decision are required")
		}
		response, err := client.SubmitToolProposalDecision(ctx, *sessionID, *proposalID, *decision, *reason)
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
		prompt := fs.String("prompt", "", "turn prompt")
		executionMode := fs.String("execution-mode", runtimeapi.AgentInvokeExecutionModeRawModelInvoke, "raw_model_invoke or managed_codex_worker")
		agentProfileID := fs.String("agent-profile", "codex", "agent profile id")
		systemPrompt := fs.String("system-prompt", "", "optional system prompt")
		maxOutputTokens := fs.Int("max-output-tokens", 0, "optional max output tokens")
		if err := fs.Parse(args[1:]); err != nil {
			return err
		}
		if strings.TrimSpace(*taskID) == "" || strings.TrimSpace(*prompt) == "" {
			return fmt.Errorf("--task-id and --prompt are required")
		}
		response, err := client.InvokeTurn(ctx, *taskID, *prompt, *executionMode, *agentProfileID, *systemPrompt, *maxOutputTokens)
		if err != nil {
			return err
		}
		if cfg.OutputFormat == "json" {
			return printJSON(response)
		}
		fmt.Printf("turn submitted: task=%s session=%s mode=%s worker=%s finish=%s\n", runtimeclient.NormalizeStringOrDefault(response.TaskID, *taskID), runtimeclient.NormalizeStringOrDefault(response.SessionID, "-"), runtimeclient.NormalizeStringOrDefault(response.ExecutionMode, *executionMode), runtimeclient.NormalizeStringOrDefault(response.SelectedWorkerID, "-"), runtimeclient.NormalizeStringOrDefault(response.FinishReason, "-"))
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
