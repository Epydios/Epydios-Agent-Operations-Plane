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
	state             *workflowProofState
	token             string
	runtimeAPIBaseURL string
}

type workflowProofState struct {
	task      *runtimeapi.TaskRecord
	sessions  []runtimeapi.SessionRecord
	timelines map[string]*runtimeapi.SessionTimelineResponse
}

type workflowIntakeResult struct {
	Task   *runtimeapi.TaskRecord          `json:"task,omitempty"`
	Invoke *runtimeapi.AgentInvokeResponse `json:"invoke,omitempty"`
	Status *workflowStatusSnapshot         `json:"status,omitempty"`
}

type workflowStatusSnapshot struct {
	SourceSystem        string                                `json:"sourceSystem,omitempty"`
	TicketID            string                                `json:"ticketId,omitempty"`
	WorkflowID          string                                `json:"workflowId,omitempty"`
	TaskID              string                                `json:"taskId,omitempty"`
	LatestSessionID     string                                `json:"latestSessionId,omitempty"`
	OpenApprovals       int                                   `json:"openApprovals,omitempty"`
	PendingProposals    []runtimeclient.ToolProposalReview    `json:"pendingProposals,omitempty"`
	ApprovalCheckpoints []runtimeapi.ApprovalCheckpointRecord `json:"approvalCheckpoints,omitempty"`
	EvidenceRecords     []runtimeapi.EvidenceRecord           `json:"evidenceRecords,omitempty"`
	EvidenceCount       int                                   `json:"evidenceCount,omitempty"`
}

type workflowApprovalDecisionEnvelope struct {
	Decision *runtimeapi.ApprovalCheckpointDecisionResponse `json:"decision,omitempty"`
}

type workflowProposalDecisionEnvelope struct {
	Decision *runtimeapi.ToolProposalDecisionResponse `json:"decision,omitempty"`
}

func main() {
	repoRoot := mustRepoRoot()
	stamp := stampUTC()
	phaseRoot := filepath.Join(repoRoot, ".epydios", "internal-readiness", "workflow-governed-thread-proof")
	runRoot := filepath.Join(phaseRoot, stamp)
	must(os.MkdirAll(runRoot, 0o755))
	must(os.MkdirAll(phaseRoot, 0o755))

	logPath := filepath.Join(runRoot, "verify-workflow-governed-thread.log")
	summaryPath := filepath.Join(runRoot, "verify-workflow-governed-thread.summary.json")
	checklistPath := filepath.Join(runRoot, "operator-workflow-governed-thread-checklist.json")
	latestLogPath := filepath.Join(phaseRoot, "verify-workflow-governed-thread-latest.log")
	latestSummaryPath := filepath.Join(phaseRoot, "verify-workflow-governed-thread-latest.summary.json")

	logger := newProofLogger(logPath)
	proof := startMockRuntime(logger.log)
	defer proof.server.Close()

	binaryPath := filepath.Join(runRoot, "workflow-agentops-proof")
	buildWorkflowBinary(repoRoot, binaryPath, logger.log)

	baseEnv := []string{
		"AGENTOPS_RUNTIME_API_BASE_URL=" + proof.runtimeAPIBaseURL,
		"AGENTOPS_TENANT_ID=tenant-demo",
		"AGENTOPS_PROJECT_ID=project-workflow",
	}

	var connection runtimeclient.ConnectionStatus
	mustJSONCommand(repoRoot, binaryPath, append(baseEnv, "AGENTOPS_AUTH_TOKEN="), &connection, logger.log, "--output", "json", "status", "check")
	assert(connection.State == "auth_required", "expected auth_required workflow status, got %q", connection.State)
	logger.log("proved auth-required workflow status check")

	mustJSONCommand(repoRoot, binaryPath, append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token), &connection, logger.log, "--output", "json", "status", "check")
	assert(connection.State == "connected", "expected connected workflow status, got %q", connection.State)
	logger.log("proved connected workflow status check")

	payloadPath := filepath.Join(runRoot, "workflow-intake.json")
	writeJSON(payloadPath, map[string]any{
		"sourceSystem":    "jira",
		"ticketId":        "OPS-101",
		"ticketUrl":       "https://tickets.example/OPS-101",
		"workflowId":      "incident-response",
		"workflowUrl":     "https://workflow.example/runs/incident-response",
		"title":           "Investigate checkout timeout spike",
		"intent":          "Create a governed workflow task that triages the timeout spike and proposes the next safe action.",
		"requestedBy":     map[string]any{"displayName": "Incident Commander"},
		"labels":          []string{"incident", "sev2"},
		"initialPrompt":   "Summarize the workflow state and propose the next governed verification step.",
		"executionMode":   runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
		"agentProfileId":  "codex",
		"systemPrompt":    "Prefer minimal-risk verification before proposing changes.",
		"maxOutputTokens": 256,
	})

	var intake workflowIntakeResult
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&intake,
		logger.log,
		"--output", "json",
		"tickets", "intake",
		"--file", payloadPath,
	)
	assert(intake.Task != nil && strings.TrimSpace(intake.Task.TaskID) == "task-workflow-proof-1", "expected created workflow task")
	assert(intake.Invoke != nil && strings.TrimSpace(intake.Invoke.SessionID) == "sess-workflow-proof-1", "expected workflow proof session")
	logger.log("created workflow task and initial governed turn through workflow-agentops")

	var status workflowStatusSnapshot
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&status,
		logger.log,
		"--output", "json",
		"tickets", "status",
		"--ticket-id", "OPS-101",
		"--source-system", "jira",
		"--workflow-id", "incident-response",
	)
	assert(status.OpenApprovals == 1, "expected 1 pending approval, got %d", status.OpenApprovals)
	assert(len(status.PendingProposals) == 1, "expected 1 pending proposal, got %d", len(status.PendingProposals))
	logger.log("loaded governed workflow review state with approval and proposal checkpoints")

	var approval workflowApprovalDecisionEnvelope
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&approval,
		logger.log,
		"--output", "json",
		"approvals", "decide",
		"--ticket-id", "OPS-101",
		"--source-system", "jira",
		"--workflow-id", "incident-response",
		"--decision", "APPROVE",
		"--reason", "Workflow bounded proof approval accepted.",
	)
	assert(approval.Decision != nil, "expected workflow approval decision payload")
	assert(strings.EqualFold(string(approval.Decision.Status), string(runtimeapi.ApprovalStatusApproved)), "expected approval approved, got %q", approval.Decision.Status)
	logger.log("resolved workflow approval checkpoint")

	var proposal workflowProposalDecisionEnvelope
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&proposal,
		logger.log,
		"--output", "json",
		"proposals", "decide",
		"--ticket-id", "OPS-101",
		"--source-system", "jira",
		"--workflow-id", "incident-response",
		"--decision", "APPROVE",
		"--reason", "Workflow bounded proof proposal accepted.",
	)
	assert(proposal.Decision != nil, "expected workflow proposal decision payload")
	assert(strings.EqualFold(proposal.Decision.Status, "APPROVED"), "expected proposal approved, got %q", proposal.Decision.Status)
	logger.log("resolved workflow proposal")

	followOutput := mustTextCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		logger.log,
		"tickets", "follow",
		"--ticket-id", "OPS-101",
		"--source-system", "jira",
		"--workflow-id", "incident-response",
		"--once",
		"--render", "delta-update",
	)
	assert(strings.Contains(followOutput, "AgentOps ticket update"), "expected workflow follow envelope")
	assert(strings.Contains(followOutput, "Proposal Decision: Workflow bounded proof proposal accepted."), "expected proposal decision in workflow follow")
	assert(strings.Contains(followOutput, "Evidence Recorded: audit_bundle"), "expected evidence event in workflow follow")
	logger.log("followed governed workflow event stream through workflow-agentops")

	handoffOutput := mustTextCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		logger.log,
		"tickets", "status",
		"--ticket-id", "OPS-101",
		"--source-system", "jira",
		"--workflow-id", "incident-response",
		"--render", "handoff",
	)
	assert(strings.Contains(handoffOutput, "Type: handoff"), "expected workflow handoff render")
	assert(strings.Contains(handoffOutput, "Approval/proposal linkage: Resolved approvals: approval-workflow-proof-1 (APPROVED)"), "expected approval linkage in workflow handoff")
	assert(strings.Contains(handoffOutput, "Audit/evidence handoff: Evidence package: audit_bundle | evidence-workflow-proof-1 | memory://evidence-workflow-proof-1"), "expected evidence package in workflow output")
	assert(strings.Contains(handoffOutput, "Audit/evidence handoff: Audit continuity: "), "expected audit continuity line in workflow handoff")
	logger.log("proved audit and evidence continuity through explicit workflow handoff output")

	checklist := map[string]any{
		"generated_at_utc": stamp,
		"workflow_governed_thread_beta_proof": map[string]any{
			"status": "pass",
			"steps": []string{
				"connection and auth truth reported auth-required and connected states",
				"workflow intake created a governed task and initial governed turn",
				"workflow review surfaced pending approval and proposal state",
				"approval checkpoint resolved through workflow-agentops",
				"tool proposal resolved through workflow-agentops",
				"live follow consumed governed workflow event updates",
				"audit and evidence continuity rendered explicitly through workflow handoff output",
			},
			"runtime_api_base_url": proof.runtimeAPIBaseURL,
			"log_path":             logPath,
			"summary_path":         summaryPath,
		},
	}
	summary := map[string]any{
		"generated_at_utc":     stamp,
		"status":               "workflow_governed_thread_proof_ready",
		"reason":               "Workflow bounded proof accepted connection and auth truth, one governed intake and turn, approval and proposal resolution, live follow, and explicit audit and evidence continuity on the shared M16 contract.",
		"runtime_api_base_url": proof.runtimeAPIBaseURL,
		"log_path":             logPath,
		"checklist_path":       checklistPath,
	}
	writeJSON(checklistPath, checklist)
	writeJSON(summaryPath, summary)
	copyFile(logPath, latestLogPath)
	copyFile(summaryPath, latestSummaryPath)
	fmt.Println("Workflow governed thread verifier passed.")
}

func mustRepoRoot() string {
	_, filePath, _, ok := runtime.Caller(0)
	if !ok {
		panic("unable to resolve workflow proof harness path")
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

func buildWorkflowBinary(repoRoot, binaryPath string, logf func(string)) {
	cmd := exec.Command("go", "build", "-o", binaryPath, "./clients/workflow-agentops")
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), "GOCACHE="+filepath.Join(repoRoot, ".tmp", "go-build"))
	logf("$ " + strings.Join(cmd.Args, " "))
	output, err := cmd.CombinedOutput()
	if len(output) > 0 {
		logf(strings.TrimSpace(string(output)))
	}
	if err != nil {
		panic(fmt.Sprintf("build workflow binary: %v", err))
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
	state := &workflowProofState{timelines: map[string]*runtimeapi.SessionTimelineResponse{}}
	token := "workflow-proof-token"
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
				TaskID:      "task-workflow-proof-1",
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
			logf(fmt.Sprintf("created workflow task %s", task.TaskID))
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
			timeline := ensureWorkflowProofSession(state)
			logf(fmt.Sprintf("workflow invoke accepted for task %s", strings.TrimSpace(req.TaskID)))
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
				Transport:        "workflow_gateway",
				Model:            "gpt-5.4",
				Route:            "managed_worker_gateway_process",
				EndpointRef:      "workflow-proof-endpoint",
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
				"reason":       runtimeclient.NormalizeStringOrDefault(req.Reason, "Workflow bounded proof approval accepted."),
			})
			syncWorkflowState(state, timeline)
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
				EvidenceID:     "evidence-workflow-proof-1",
				SessionID:      sessionID,
				ToolActionID:   "tool-workflow-proof-1",
				CheckpointID:   "approval-workflow-proof-1",
				TenantID:       state.task.TenantID,
				ProjectID:      state.task.ProjectID,
				Kind:           "audit_bundle",
				URI:            "memory://evidence-workflow-proof-1",
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
				"reason":       runtimeclient.NormalizeStringOrDefault(req.Reason, "Workflow bounded proof proposal accepted."),
				"toolActionId": "tool-workflow-proof-1",
				"summary":      "Run a safe workflow status summary command.",
			})
			pushEvent(timeline, "evidence.recorded", map[string]any{
				"kind":       "audit_bundle",
				"evidenceId": evidence.EvidenceID,
				"summary":    "Governed workflow review bundle ready for downstream review.",
			})
			pushEvent(timeline, "session.status.changed", map[string]any{
				"status":  runtimeapi.SessionStatusCompleted,
				"summary": "Governed workflow review completed.",
			})
			syncWorkflowState(state, timeline)
			writeJSONResponse(w, http.StatusOK, runtimeapi.ToolProposalDecisionResponse{
				Applied:      true,
				SessionID:    sessionID,
				ProposalID:   proposalID,
				Decision:     strings.ToUpper(strings.TrimSpace(req.Decision)),
				Status:       "APPROVED",
				Reason:       req.Reason,
				ToolActionID: "tool-workflow-proof-1",
				ToolType:     "managed_agent_turn",
				ActionStatus: runtimeapi.ToolActionStatusCompleted,
				RunID:        "run-workflow-proof-1",
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

func ensureWorkflowProofSession(state *workflowProofState) *runtimeapi.SessionTimelineResponse {
	if timeline := state.timelines["sess-workflow-proof-1"]; timeline != nil {
		return timeline
	}
	now := isoNow()
	timeline := &runtimeapi.SessionTimelineResponse{
		Session: runtimeapi.SessionRecord{
			SessionID:        "sess-workflow-proof-1",
			TaskID:           state.task.TaskID,
			TenantID:         state.task.TenantID,
			ProjectID:        state.task.ProjectID,
			SessionType:      "workflow",
			Status:           runtimeapi.SessionStatusAwaitingApproval,
			SelectedWorkerID: "worker-workflow-proof-1",
			CreatedAt:        now,
			StartedAt:        now,
			UpdatedAt:        now,
		},
		Task: state.task,
		SelectedWorker: &runtimeapi.SessionWorkerRecord{
			WorkerID:   "worker-workflow-proof-1",
			SessionID:  "sess-workflow-proof-1",
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
			CheckpointID: "approval-workflow-proof-1",
			SessionID:    "sess-workflow-proof-1",
			TenantID:     state.task.TenantID,
			ProjectID:    state.task.ProjectID,
			Scope:        "workflow.apply",
			Status:       runtimeapi.ApprovalStatusPending,
			Reason:       "Review the first governed workflow turn before execution continues.",
			CreatedAt:    now,
			UpdatedAt:    now,
		}},
		ToolActions: []runtimeapi.ToolActionRecord{{
			ToolActionID:         "tool-workflow-proof-1",
			SessionID:            "sess-workflow-proof-1",
			WorkerID:             "worker-workflow-proof-1",
			TenantID:             state.task.TenantID,
			ProjectID:            state.task.ProjectID,
			ToolType:             "managed_agent_turn",
			Status:               runtimeapi.ToolActionStatusAuthorized,
			ApprovalCheckpointID: "approval-workflow-proof-1",
			ResultPayload: mustJSON(map[string]any{
				"runId":              "run-workflow-proof-1",
				"route":              "managed_worker_gateway_process",
				"boundaryProviderId": "agentops_gateway",
				"endpointRef":        "workflow-proof-endpoint",
				"rawResponse": []map[string]any{{
					"type": "message",
					"text": "Governed workflow turn is awaiting review.",
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
		"summary": "Governed workflow turn submitted for review.",
	})
	pushEvent(timeline, "approval.requested", map[string]any{
		"status": "PENDING",
		"reason": "Review the first governed workflow turn before execution continues.",
		"scope":  "workflow.apply",
	})
	pushEvent(timeline, "tool_proposal.generated", map[string]any{
		"proposalId":   "proposal-workflow-proof-1",
		"proposalType": "terminal_command",
		"summary":      "Run a safe workflow status summary command.",
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

func syncWorkflowState(state *workflowProofState, timeline *runtimeapi.SessionTimelineResponse) {
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
