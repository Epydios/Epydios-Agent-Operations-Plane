package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	runtimeclient "github.com/Epydios/Epydios-AgentOps-Control-Plane/clients/internal/runtimeclient"
	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type proofRuntime struct {
	server            *httptest.Server
	state             *chatopsProofState
	token             string
	runtimeAPIBaseURL string
}

type chatopsProofState struct {
	task      *runtimeapi.TaskRecord
	sessions  []runtimeapi.SessionRecord
	timelines map[string]*runtimeapi.SessionTimelineResponse
}

type chatopsIntakeResult struct {
	Task   *runtimeapi.TaskRecord          `json:"task,omitempty"`
	Invoke *runtimeapi.AgentInvokeResponse `json:"invoke,omitempty"`
	Status *chatopsStatusSnapshot          `json:"status,omitempty"`
}

type chatopsStatusSnapshot struct {
	SourceSystem        string                                `json:"sourceSystem,omitempty"`
	ChannelID           string                                `json:"channelId,omitempty"`
	ChannelName         string                                `json:"channelName,omitempty"`
	ThreadID            string                                `json:"threadId,omitempty"`
	TaskID              string                                `json:"taskId,omitempty"`
	LatestSessionID     string                                `json:"latestSessionId,omitempty"`
	OpenApprovals       int                                   `json:"openApprovals,omitempty"`
	PendingProposals    []runtimeclient.ToolProposalReview    `json:"pendingProposals,omitempty"`
	ApprovalCheckpoints []runtimeapi.ApprovalCheckpointRecord `json:"approvalCheckpoints,omitempty"`
	EvidenceRecords     []runtimeapi.EvidenceRecord           `json:"evidenceRecords,omitempty"`
	EvidenceCount       int                                   `json:"evidenceCount,omitempty"`
}

type chatopsApprovalDecisionEnvelope struct {
	Decision *runtimeapi.ApprovalCheckpointDecisionResponse `json:"decision,omitempty"`
}

type chatopsProposalDecisionEnvelope struct {
	Decision *runtimeapi.ToolProposalDecisionResponse `json:"decision,omitempty"`
}

func main() {
	repoRoot := mustRepoRoot()
	stamp := stampUTC()
	phaseRoot := filepath.Join(repoRoot, ".epydios", "internal-readiness", "chatops-governed-thread-proof")
	runRoot := filepath.Join(phaseRoot, stamp)
	must(os.MkdirAll(runRoot, 0o755))
	must(os.MkdirAll(phaseRoot, 0o755))

	logPath := filepath.Join(runRoot, "verify-chatops-governed-thread.log")
	summaryPath := filepath.Join(runRoot, "verify-chatops-governed-thread.summary.json")
	checklistPath := filepath.Join(runRoot, "operator-chatops-governed-thread-checklist.json")
	latestLogPath := filepath.Join(phaseRoot, "verify-chatops-governed-thread-latest.log")
	latestSummaryPath := filepath.Join(phaseRoot, "verify-chatops-governed-thread-latest.summary.json")

	logger := newProofLogger(logPath)
	proof := startMockRuntime(logger.log)
	defer proof.server.Close()

	binaryPath := filepath.Join(runRoot, "chatops-agentops-proof")
	buildChatopsBinary(repoRoot, binaryPath, logger.log)

	baseEnv := []string{
		"AGENTOPS_RUNTIME_API_BASE_URL=" + proof.runtimeAPIBaseURL,
		"AGENTOPS_TENANT_ID=tenant-demo",
		"AGENTOPS_PROJECT_ID=project-chatops",
	}

	var connection runtimeclient.ConnectionStatus
	mustJSONCommand(repoRoot, binaryPath, append(baseEnv, "AGENTOPS_AUTH_TOKEN="), &connection, logger.log, "--output", "json", "status", "check")
	assert(connection.State == "auth_required", "expected auth_required chatops status, got %q", connection.State)
	logger.log("proved auth-required chatops status check")

	mustJSONCommand(repoRoot, binaryPath, append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token), &connection, logger.log, "--output", "json", "status", "check")
	assert(connection.State == "connected", "expected connected chatops status, got %q", connection.State)
	logger.log("proved connected chatops status check")

	payloadPath := filepath.Join(runRoot, "chatops-intake.json")
	writeJSON(payloadPath, map[string]any{
		"sourceSystem":    "slack",
		"channelId":       "C123",
		"channelName":     "ops-alerts",
		"threadId":        "1730.55",
		"messageId":       "m-1",
		"messageUrl":      "https://chat.example/messages/m-1",
		"conversationUrl": "https://chat.example/thread/1730.55",
		"title":           "Investigate deployment failure",
		"intent":          "Create a governed conversation that triages the failing deployment and proposes the next safe action.",
		"requestedBy":     map[string]any{"displayName": "On-call Engineer"},
		"labels":          []string{"incident", "sev1"},
		"initialPrompt":   "Review the chat context and propose the next governed verification step.",
		"executionMode":   runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
		"agentProfileId":  "codex",
		"systemPrompt":    "Prefer safe triage and explicit approval points before proposing changes.",
		"maxOutputTokens": 256,
	})

	var intake chatopsIntakeResult
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&intake,
		logger.log,
		"--output", "json",
		"conversations", "intake",
		"--file", payloadPath,
	)
	assert(intake.Task != nil && strings.TrimSpace(intake.Task.TaskID) == "task-chatops-proof-1", "expected created chatops task")
	assert(intake.Invoke != nil && strings.TrimSpace(intake.Invoke.SessionID) == "sess-chatops-proof-1", "expected chatops proof session")
	logger.log("created chatops task and initial governed turn through chatops-agentops")

	var status chatopsStatusSnapshot
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&status,
		logger.log,
		"--output", "json",
		"conversations", "status",
		"--thread-id", "1730.55",
		"--source-system", "slack",
		"--channel-id", "C123",
	)
	assert(status.OpenApprovals == 1, "expected 1 pending approval, got %d", status.OpenApprovals)
	assert(len(status.PendingProposals) == 1, "expected 1 pending proposal, got %d", len(status.PendingProposals))
	logger.log("loaded governed chat thread review state with approval and proposal checkpoints")

	var approval chatopsApprovalDecisionEnvelope
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&approval,
		logger.log,
		"--output", "json",
		"approvals", "decide",
		"--thread-id", "1730.55",
		"--source-system", "slack",
		"--channel-id", "C123",
		"--decision", "APPROVE",
		"--reason", "Chatops bounded proof approval accepted.",
	)
	assert(approval.Decision != nil, "expected chatops approval decision payload")
	assert(strings.EqualFold(string(approval.Decision.Status), string(runtimeapi.ApprovalStatusApproved)), "expected approval approved, got %q", approval.Decision.Status)
	logger.log("resolved chatops approval checkpoint")

	var proposal chatopsProposalDecisionEnvelope
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&proposal,
		logger.log,
		"--output", "json",
		"proposals", "decide",
		"--thread-id", "1730.55",
		"--source-system", "slack",
		"--channel-id", "C123",
		"--decision", "APPROVE",
		"--reason", "Chatops bounded proof proposal accepted.",
	)
	assert(proposal.Decision != nil, "expected chatops proposal decision payload")
	assert(strings.EqualFold(proposal.Decision.Status, "APPROVED"), "expected proposal approved, got %q", proposal.Decision.Status)
	logger.log("resolved chatops proposal")

	followOutput := mustTextCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		logger.log,
		"conversations", "follow",
		"--thread-id", "1730.55",
		"--source-system", "slack",
		"--channel-id", "C123",
		"--once",
		"--render", "delta-update",
	)
	assert(strings.Contains(followOutput, "AgentOps thread update"), "expected chatops follow envelope")
	assert(strings.Contains(followOutput, "Proposal Decision: Chatops bounded proof proposal accepted."), "expected proposal decision in chatops follow")
	assert(strings.Contains(followOutput, "Evidence Recorded: audit_bundle"), "expected evidence event in chatops follow")
	logger.log("followed governed chat thread event stream through chatops-agentops")

	handoffOutput := mustTextCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		logger.log,
		"conversations", "status",
		"--thread-id", "1730.55",
		"--source-system", "slack",
		"--channel-id", "C123",
		"--render", "handoff",
	)
	assert(strings.Contains(handoffOutput, "Type: handoff"), "expected chatops handoff render")
	assert(strings.Contains(handoffOutput, "Approval/proposal linkage: Resolved approvals: approval-chatops-proof-1 (APPROVED)"), "expected approval linkage in chatops handoff")
	assert(strings.Contains(handoffOutput, "Audit/evidence handoff: Evidence package: audit_bundle | evidence-chatops-proof-1 | memory://evidence-chatops-proof-1"), "expected evidence package in chatops output")
	assert(strings.Contains(handoffOutput, "Audit/evidence handoff: Audit continuity: "), "expected audit continuity line in chatops handoff")
	logger.log("proved audit and evidence continuity through explicit chatops handoff output")

	checklist := map[string]any{
		"generated_at_utc": stamp,
		"chatops_governed_thread_beta_proof": map[string]any{
			"status": "pass",
			"steps": []string{
				"connection and auth truth reported auth-required and connected states",
				"chatops intake created a governed task and initial governed turn",
				"chatops review surfaced pending approval and proposal state",
				"approval checkpoint resolved through chatops-agentops",
				"tool proposal resolved through chatops-agentops",
				"live follow consumed governed chat thread event updates",
				"audit and evidence continuity rendered explicitly through chatops handoff output",
			},
			"runtime_api_base_url": proof.runtimeAPIBaseURL,
			"log_path":             logPath,
			"summary_path":         summaryPath,
		},
	}
	summary := map[string]any{
		"generated_at_utc":     stamp,
		"status":               "chatops_governed_thread_proof_ready",
		"reason":               "Chatops bounded proof accepted connection and auth truth, one governed intake and turn, approval and proposal resolution, live follow, and explicit audit and evidence continuity on the shared M16 contract.",
		"runtime_api_base_url": proof.runtimeAPIBaseURL,
		"log_path":             logPath,
		"checklist_path":       checklistPath,
	}
	writeJSON(checklistPath, checklist)
	writeJSON(summaryPath, summary)
	copyFile(logPath, latestLogPath)
	copyFile(summaryPath, latestSummaryPath)
	fmt.Println("Chatops governed thread verifier passed.")
}

func mustRepoRoot() string {
	_, filePath, _, ok := runtime.Caller(0)
	if !ok {
		panic("unable to resolve chatops proof harness path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filePath), "../../.."))
}

func stampUTC() string {
	return time.Now().UTC().Format("20060102T150405Z")
}

func isoNow() time.Time {
	return time.Now().UTC()
}

type proofLogger struct {
	logPath string
}

func newProofLogger(logPath string) *proofLogger {
	return &proofLogger{logPath: logPath}
}

func (p *proofLogger) log(line string) {
	entry := fmt.Sprintf("[%s] %s", time.Now().UTC().Format(time.RFC3339), line)
	file, err := os.OpenFile(p.logPath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o644)
	if err == nil {
		_, _ = file.WriteString(entry + "\n")
		_ = file.Close()
	}
}

func buildChatopsBinary(repoRoot, binaryPath string, logf func(string)) {
	cmd := exec.Command("go", "build", "-o", binaryPath, "./clients/chatops-agentops")
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), "GOCACHE="+filepath.Join(repoRoot, ".tmp", "go-build"))
	logf("$ " + strings.Join(cmd.Args, " "))
	output, err := cmd.CombinedOutput()
	if len(output) > 0 {
		logf(strings.TrimSpace(string(output)))
	}
	if err != nil {
		panic(fmt.Sprintf("build chatops binary: %v", err))
	}
}

func mustJSONCommand(repoRoot, binaryPath string, env []string, target any, logf func(string), args ...string) {
	output := mustCommand(repoRoot, binaryPath, env, logf, args...)
	if err := json.Unmarshal([]byte(output), target); err != nil {
		panic(fmt.Sprintf("decode %v: %v\n%s", args, err, output))
	}
}

func mustTextCommand(repoRoot, binaryPath string, env []string, logf func(string), args ...string) string {
	return mustCommand(repoRoot, binaryPath, env, logf, args...)
}

func mustCommand(repoRoot, binaryPath string, env []string, logf func(string), args ...string) string {
	cmd := exec.Command(binaryPath, args...)
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), env...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	logf("$ " + strings.Join(append([]string{binaryPath}, args...), " "))
	err := cmd.Run()
	if stdout.Len() > 0 {
		logf("stdout:\n" + strings.TrimSpace(stdout.String()))
	}
	if stderr.Len() > 0 {
		logf("stderr:\n" + strings.TrimSpace(stderr.String()))
	}
	if err != nil {
		panic(fmt.Sprintf("command %v failed: %v", args, err))
	}
	return stdout.String()
}

func startMockRuntime(logf func(string)) *proofRuntime {
	state := &chatopsProofState{timelines: map[string]*runtimeapi.SessionTimelineResponse{}}
	token := "chatops-proof-token"
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimSpace(r.Header.Get("Authorization")) != "Bearer "+token {
			writeJSONResponse(w, http.StatusUnauthorized, map[string]any{"error": "missing or invalid bearer token"})
			return
		}
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1alpha2/runtime/tasks":
			items := make([]runtimeapi.TaskRecord, 0, 1)
			if state.task != nil {
				items = append(items, *state.task)
			}
			writeJSONResponse(w, http.StatusOK, runtimeclient.TaskListResponse{
				Count:  len(items),
				Limit:  maxInt(1, len(items)),
				Offset: 0,
				Items:  items,
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1alpha2/runtime/tasks":
			var req runtimeapi.TaskCreateRequest
			mustDecodeJSON(r, &req)
			now := isoNow()
			task := &runtimeapi.TaskRecord{
				TaskID:      "task-chatops-proof-1",
				RequestID:   req.Meta.RequestID,
				TenantID:    req.Meta.TenantID,
				ProjectID:   req.Meta.ProjectID,
				Source:      req.Source,
				Title:       req.Title,
				Intent:      req.Intent,
				RequestedBy: mustJSON(req.RequestedBy),
				Status:      runtimeapi.TaskStatusInProgress,
				Annotations: mustJSON(req.Annotations),
				CreatedAt:   now,
				UpdatedAt:   now,
			}
			state.task = task
			logf(fmt.Sprintf("created chatops task %s", task.TaskID))
			writeJSONResponse(w, http.StatusOK, task)
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/v1alpha2/runtime/tasks/"):
			taskID := strings.TrimPrefix(r.URL.Path, "/v1alpha2/runtime/tasks/")
			if state.task == nil || strings.TrimSpace(taskID) != state.task.TaskID {
				writeJSONResponse(w, http.StatusNotFound, map[string]any{"error": "task not found"})
				return
			}
			writeJSONResponse(w, http.StatusOK, state.task)
		case r.Method == http.MethodGet && r.URL.Path == "/v1alpha2/runtime/sessions":
			taskID := strings.TrimSpace(r.URL.Query().Get("taskId"))
			items := make([]runtimeapi.SessionRecord, 0, len(state.sessions))
			for _, item := range state.sessions {
				if taskID == "" || item.TaskID == taskID {
					items = append(items, item)
				}
			}
			writeJSONResponse(w, http.StatusOK, runtimeclient.SessionListResponse{
				Count:         len(items),
				Limit:         maxInt(1, len(items)),
				Offset:        0,
				IncludeLegacy: false,
				Items:         items,
			})
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/timeline"):
			sessionID := timelineSessionID(r.URL.Path)
			timeline := state.timelines[sessionID]
			if timeline == nil {
				writeJSONResponse(w, http.StatusNotFound, map[string]any{"error": "session not found"})
				return
			}
			writeJSONResponse(w, http.StatusOK, timeline)
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/events/stream"):
			sessionID := streamSessionID(r.URL.Path)
			timeline := state.timelines[sessionID]
			if timeline == nil {
				writeJSONResponse(w, http.StatusNotFound, map[string]any{"error": "session not found"})
				return
			}
			afterSequence, _ := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("afterSequence")), 10, 64)
			items := make([]runtimeapi.SessionEventRecord, 0)
			for _, item := range timeline.Events {
				if item.Sequence > afterSequence {
					items = append(items, item)
				}
			}
			writeEventStream(w, items)
		case r.Method == http.MethodPost && r.URL.Path == "/v1alpha1/runtime/integrations/invoke":
			var req runtimeapi.AgentInvokeRequest
			mustDecodeJSON(r, &req)
			timeline := ensureChatopsProofSession(state)
			logf(fmt.Sprintf("chatops invoke accepted for task %s", strings.TrimSpace(req.TaskID)))
			writeJSONResponse(w, http.StatusOK, runtimeapi.AgentInvokeResponse{
				Applied:          true,
				RequestID:        req.Meta.RequestID,
				TaskID:           state.task.TaskID,
				SessionID:        timeline.Session.SessionID,
				SelectedWorkerID: timeline.SelectedWorker.WorkerID,
				TenantID:         state.task.TenantID,
				ProjectID:        state.task.ProjectID,
				AgentProfileID:   runtimeclient.NormalizeStringOrDefault(req.AgentProfileID, "codex"),
				ExecutionMode:    runtimeclient.NormalizeStringOrDefault(req.ExecutionMode, runtimeapi.AgentInvokeExecutionModeManagedCodexWorker),
				WorkerType:       "managed_agent",
				WorkerAdapterID:  "codex",
				Provider:         "agentops_gateway",
				Transport:        "chatops_gateway",
				Model:            "gpt-5.4",
				Route:            "managed_worker_gateway_process",
				EndpointRef:      "chatops-proof-endpoint",
				FinishReason:     "approval_required",
			})
		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/approval-checkpoints/") && strings.HasSuffix(r.URL.Path, "/decision"):
			sessionID, checkpointID := approvalDecisionIDs(r.URL.Path)
			timeline := state.timelines[sessionID]
			if timeline == nil {
				writeJSONResponse(w, http.StatusNotFound, map[string]any{"error": "session not found"})
				return
			}
			var req runtimeapi.ApprovalCheckpointDecisionRequest
			mustDecodeJSON(r, &req)
			now := isoNow()
			for idx := range timeline.ApprovalCheckpoints {
				if timeline.ApprovalCheckpoints[idx].CheckpointID == checkpointID {
					timeline.ApprovalCheckpoints[idx].Status = runtimeapi.ApprovalStatusApproved
					timeline.ApprovalCheckpoints[idx].Reason = req.Reason
					timeline.ApprovalCheckpoints[idx].ReviewedAt = &now
					timeline.ApprovalCheckpoints[idx].UpdatedAt = now
				}
			}
			timeline.OpenApprovalCount = 0
			timeline.Session.Status = runtimeapi.SessionStatusRunning
			timeline.Session.UpdatedAt = now
			if timeline.SelectedWorker != nil {
				timeline.SelectedWorker.Status = runtimeapi.WorkerStatusRunning
				timeline.SelectedWorker.UpdatedAt = now
			}
			pushEvent(timeline, "approval.status.changed", map[string]any{
				"checkpointId": checkpointID,
				"decision":     strings.ToUpper(strings.TrimSpace(req.Decision)),
				"status":       runtimeapi.ApprovalStatusApproved,
				"reason":       runtimeclient.NormalizeStringOrDefault(req.Reason, "Chatops bounded proof approval accepted."),
			})
			syncChatopsState(state, timeline)
			writeJSONResponse(w, http.StatusOK, runtimeapi.ApprovalCheckpointDecisionResponse{
				Applied:      true,
				SessionID:    sessionID,
				CheckpointID: checkpointID,
				Decision:     strings.ToUpper(strings.TrimSpace(req.Decision)),
				Status:       runtimeapi.ApprovalStatusApproved,
				Reason:       req.Reason,
				ReviewedAt:   now.Format(time.RFC3339),
			})
		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/tool-proposals/") && strings.HasSuffix(r.URL.Path, "/decision"):
			sessionID, proposalID := proposalDecisionIDs(r.URL.Path)
			timeline := state.timelines[sessionID]
			if timeline == nil {
				writeJSONResponse(w, http.StatusNotFound, map[string]any{"error": "session not found"})
				return
			}
			var req runtimeapi.ToolProposalDecisionRequest
			mustDecodeJSON(r, &req)
			now := isoNow()
			if len(timeline.ToolActions) > 0 {
				timeline.ToolActions[0].Status = runtimeapi.ToolActionStatusCompleted
				timeline.ToolActions[0].UpdatedAt = now
			}
			evidence := runtimeapi.EvidenceRecord{
				EvidenceID:     "evidence-chatops-proof-1",
				SessionID:      sessionID,
				ToolActionID:   "tool-chatops-proof-1",
				CheckpointID:   "approval-chatops-proof-1",
				TenantID:       state.task.TenantID,
				ProjectID:      state.task.ProjectID,
				Kind:           "audit_bundle",
				URI:            "memory://evidence-chatops-proof-1",
				RetentionClass: "standard",
				CreatedAt:      now,
				UpdatedAt:      now,
			}
			timeline.EvidenceRecords = append(timeline.EvidenceRecords, evidence)
			timeline.Session.Status = runtimeapi.SessionStatusCompleted
			timeline.Session.UpdatedAt = now
			timeline.Session.CompletedAt = &now
			if timeline.SelectedWorker != nil {
				timeline.SelectedWorker.Status = runtimeapi.WorkerStatusCompleted
				timeline.SelectedWorker.UpdatedAt = now
			}
			state.task.Status = runtimeapi.TaskStatusCompleted
			pushEvent(timeline, "tool_proposal.decided", map[string]any{
				"proposalId":   proposalID,
				"decision":     strings.ToUpper(strings.TrimSpace(req.Decision)),
				"status":       "APPROVED",
				"reason":       runtimeclient.NormalizeStringOrDefault(req.Reason, "Chatops bounded proof proposal accepted."),
				"toolActionId": "tool-chatops-proof-1",
				"summary":      "Post a safe governed status update into the thread.",
			})
			pushEvent(timeline, "evidence.recorded", map[string]any{
				"kind":       "audit_bundle",
				"evidenceId": evidence.EvidenceID,
				"summary":    "Governed chat thread review bundle ready for downstream review.",
			})
			pushEvent(timeline, "session.status.changed", map[string]any{
				"status":  runtimeapi.SessionStatusCompleted,
				"summary": "Governed chat thread review completed.",
			})
			syncChatopsState(state, timeline)
			writeJSONResponse(w, http.StatusOK, runtimeapi.ToolProposalDecisionResponse{
				Applied:      true,
				SessionID:    sessionID,
				ProposalID:   proposalID,
				Decision:     strings.ToUpper(strings.TrimSpace(req.Decision)),
				Status:       "APPROVED",
				Reason:       req.Reason,
				ToolActionID: "tool-chatops-proof-1",
				ToolType:     "managed_agent_turn",
				ActionStatus: runtimeapi.ToolActionStatusCompleted,
				RunID:        "run-chatops-proof-1",
				ReviewedAt:   now.Format(time.RFC3339),
			})
		default:
			writeJSONResponse(w, http.StatusNotFound, map[string]any{"error": "not found"})
		}
	})
	server := httptest.NewServer(handler)
	return &proofRuntime{
		server:            server,
		state:             state,
		token:             token,
		runtimeAPIBaseURL: server.URL,
	}
}

func ensureChatopsProofSession(state *chatopsProofState) *runtimeapi.SessionTimelineResponse {
	if timeline := state.timelines["sess-chatops-proof-1"]; timeline != nil {
		return timeline
	}
	now := isoNow()
	timeline := &runtimeapi.SessionTimelineResponse{
		Session: runtimeapi.SessionRecord{
			SessionID:        "sess-chatops-proof-1",
			TaskID:           state.task.TaskID,
			TenantID:         state.task.TenantID,
			ProjectID:        state.task.ProjectID,
			SessionType:      "chatops",
			Status:           runtimeapi.SessionStatusAwaitingApproval,
			SelectedWorkerID: "worker-chatops-proof-1",
			CreatedAt:        now,
			StartedAt:        now,
			UpdatedAt:        now,
		},
		Task: state.task,
		SelectedWorker: &runtimeapi.SessionWorkerRecord{
			WorkerID:   "worker-chatops-proof-1",
			SessionID:  "sess-chatops-proof-1",
			TaskID:     state.task.TaskID,
			TenantID:   state.task.TenantID,
			ProjectID:  state.task.ProjectID,
			WorkerType: "managed_agent",
			AdapterID:  "codex",
			Status:     runtimeapi.WorkerStatusWaiting,
			CreatedAt:  now,
			UpdatedAt:  now,
		},
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{{
			CheckpointID: "approval-chatops-proof-1",
			SessionID:    "sess-chatops-proof-1",
			TenantID:     state.task.TenantID,
			ProjectID:    state.task.ProjectID,
			Scope:        "chatops.apply",
			Status:       runtimeapi.ApprovalStatusPending,
			Reason:       "Review the first governed conversation turn before execution continues.",
			CreatedAt:    now,
			UpdatedAt:    now,
		}},
		ToolActions: []runtimeapi.ToolActionRecord{{
			ToolActionID:         "tool-chatops-proof-1",
			SessionID:            "sess-chatops-proof-1",
			WorkerID:             "worker-chatops-proof-1",
			TenantID:             state.task.TenantID,
			ProjectID:            state.task.ProjectID,
			ToolType:             "managed_agent_turn",
			Status:               runtimeapi.ToolActionStatusAuthorized,
			ApprovalCheckpointID: "approval-chatops-proof-1",
			ResultPayload: mustJSON(map[string]any{
				"runId":              "run-chatops-proof-1",
				"route":              "managed_worker_gateway_process",
				"boundaryProviderId": "agentops_gateway",
				"endpointRef":        "chatops-proof-endpoint",
				"rawResponse": []map[string]any{{
					"type": "message",
					"text": "Governed chat thread turn is awaiting review.",
				}},
			}),
			CreatedAt: now,
			UpdatedAt: now,
		}},
		Events:              []runtimeapi.SessionEventRecord{},
		OpenApprovalCount:   1,
		LatestEventSequence: 0,
	}
	pushEvent(timeline, "worker.progress", map[string]any{
		"summary": "Governed chat thread turn submitted for review.",
	})
	pushEvent(timeline, "approval.requested", map[string]any{
		"status": "PENDING",
		"reason": "Review the first governed conversation turn before execution continues.",
		"scope":  "chatops.apply",
	})
	pushEvent(timeline, "tool_proposal.generated", map[string]any{
		"proposalId":   "proposal-chatops-proof-1",
		"proposalType": "terminal_command",
		"summary":      "Post a safe governed status update into the thread.",
		"payload": map[string]any{
			"command": "pwd",
			"cwd":     "/workspace",
		},
	})
	state.timelines[timeline.Session.SessionID] = timeline
	state.sessions = append([]runtimeapi.SessionRecord{timeline.Session}, state.sessions...)
	state.task.LatestSessionID = timeline.Session.SessionID
	state.task.UpdatedAt = now
	return timeline
}

func syncChatopsState(state *chatopsProofState, timeline *runtimeapi.SessionTimelineResponse) {
	if timeline == nil {
		return
	}
	state.timelines[timeline.Session.SessionID] = timeline
	for idx := range state.sessions {
		if state.sessions[idx].SessionID == timeline.Session.SessionID {
			state.sessions[idx] = timeline.Session
		}
	}
	state.task.LatestSessionID = timeline.Session.SessionID
	state.task.UpdatedAt = isoNow()
}

func pushEvent(timeline *runtimeapi.SessionTimelineResponse, eventType string, payload map[string]any) {
	if timeline == nil {
		return
	}
	next := timeline.LatestEventSequence + 1
	timeline.LatestEventSequence = next
	now := isoNow()
	timeline.Events = append(timeline.Events, runtimeapi.SessionEventRecord{
		EventID:   fmt.Sprintf("evt-%s-%d", timeline.Session.SessionID, next),
		SessionID: timeline.Session.SessionID,
		Sequence:  next,
		EventType: runtimeapi.SessionEventType(eventType),
		Payload:   mustJSON(payload),
		Timestamp: now,
	})
	timeline.Session.UpdatedAt = now
	if timeline.Task != nil {
		timeline.Task.UpdatedAt = now
	}
}

func timelineSessionID(path string) string {
	value := strings.TrimPrefix(path, "/v1alpha2/runtime/sessions/")
	value = strings.TrimSuffix(value, "/timeline")
	return strings.Trim(value, "/")
}

func streamSessionID(path string) string {
	value := strings.TrimPrefix(path, "/v1alpha2/runtime/sessions/")
	value = strings.TrimSuffix(value, "/events/stream")
	return strings.Trim(value, "/")
}

func approvalDecisionIDs(path string) (string, string) {
	value := strings.TrimPrefix(path, "/v1alpha2/runtime/sessions/")
	value = strings.TrimSuffix(value, "/decision")
	parts := strings.Split(strings.Trim(value, "/"), "/")
	return parts[0], parts[2]
}

func proposalDecisionIDs(path string) (string, string) {
	value := strings.TrimPrefix(path, "/v1alpha2/runtime/sessions/")
	value = strings.TrimSuffix(value, "/decision")
	parts := strings.Split(strings.Trim(value, "/"), "/")
	return parts[0], parts[2]
}

func writeEventStream(w http.ResponseWriter, items []runtimeapi.SessionEventRecord) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	var builder strings.Builder
	for _, item := range items {
		payload, _ := json.Marshal(item)
		builder.WriteString("event: message\n")
		builder.WriteString("data: ")
		builder.Write(payload)
		builder.WriteString("\n\n")
	}
	_, _ = w.Write([]byte(builder.String()))
}

func writeJSONResponse(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func mustDecodeJSON(r *http.Request, target any) {
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		panic(err)
	}
}

func writeJSON(path string, value any) {
	payload, err := json.MarshalIndent(value, "", "  ")
	must(err)
	must(os.WriteFile(path, payload, 0o644))
}

func copyFile(src, dst string) {
	payload, err := os.ReadFile(src)
	must(err)
	must(os.WriteFile(dst, payload, 0o644))
}

func mustJSON(value any) json.RawMessage {
	payload, err := json.Marshal(value)
	must(err)
	return payload
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func assert(condition bool, format string, args ...any) {
	if !condition {
		panic(fmt.Sprintf(format, args...))
	}
}
