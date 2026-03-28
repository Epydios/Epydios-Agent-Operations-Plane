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
	state             *cliProofState
	token             string
	runtimeAPIBaseURL string
}

type cliProofState struct {
	task      runtimeapi.TaskRecord
	sessions  []runtimeapi.SessionRecord
	timelines map[string]*runtimeapi.SessionTimelineResponse
}

func main() {
	repoRoot := mustRepoRoot()
	stamp := stampUTC()
	phaseRoot := filepath.Join(repoRoot, ".epydios", "internal-readiness", "cli-governed-thread-proof")
	runRoot := filepath.Join(phaseRoot, stamp)
	must(os.MkdirAll(runRoot, 0o755))
	must(os.MkdirAll(phaseRoot, 0o755))

	logPath := filepath.Join(runRoot, "verify-cli-governed-thread.log")
	summaryPath := filepath.Join(runRoot, "verify-cli-governed-thread.summary.json")
	checklistPath := filepath.Join(runRoot, "operator-cli-governed-thread-checklist.json")
	latestLogPath := filepath.Join(phaseRoot, "verify-cli-governed-thread-latest.log")
	latestSummaryPath := filepath.Join(phaseRoot, "verify-cli-governed-thread-latest.summary.json")

	logger := newProofLogger(logPath)
	proof := startMockRuntime(logger.log)
	defer proof.server.Close()

	binaryPath := filepath.Join(runRoot, "agentops-cli-proof")
	buildCLIBinary(repoRoot, binaryPath, logger.log)

	baseEnv := []string{
		"AGENTOPS_RUNTIME_API_BASE_URL=" + proof.runtimeAPIBaseURL,
		"AGENTOPS_TENANT_ID=" + proof.state.task.TenantID,
		"AGENTOPS_PROJECT_ID=" + proof.state.task.ProjectID,
	}

	var status runtimeclient.ConnectionStatus
	mustJSONCommand(repoRoot, binaryPath, append(baseEnv, "AGENTOPS_AUTH_TOKEN="), &status, logger.log, "--output", "json", "status", "check")
	assert(status.State == "auth_required", "expected auth_required state, got %q", status.State)
	logger.log("proved auth-required CLI status check")

	mustJSONCommand(repoRoot, binaryPath, append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token), &status, logger.log, "--output", "json", "status", "check")
	assert(status.State == "connected", "expected connected state, got %q", status.State)
	logger.log("proved connected CLI status check")

	var baseline runtimeclient.ThreadReview
	mustJSONCommand(repoRoot, binaryPath, append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token), &baseline, logger.log, "--output", "json", "threads", "show", "--task-id", proof.state.task.TaskID)
	assert(strings.TrimSpace(baseline.Task.TaskID) == proof.state.task.TaskID, "expected baseline task %q, got %q", proof.state.task.TaskID, baseline.Task.TaskID)
	logger.log("loaded baseline governed thread through cli-agentops")

	var invoke runtimeapi.AgentInvokeResponse
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&invoke,
		logger.log,
		"--output", "json",
		"turns", "send",
		"--task-id", proof.state.task.TaskID,
		"--prompt", "Summarize the governed workspace change and stage the next safe command.",
		"--execution-mode", runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
	)
	assert(strings.TrimSpace(invoke.SessionID) == "sess-cli-proof", "expected governed session sess-cli-proof, got %q", invoke.SessionID)
	logger.log("submitted governed CLI turn")

	var review runtimeclient.ThreadReview
	mustJSONCommand(repoRoot, binaryPath, append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token), &review, logger.log, "--output", "json", "threads", "show", "--task-id", proof.state.task.TaskID)
	assert(review.Timeline != nil, "expected review timeline after invoke")
	assert(review.Timeline.OpenApprovalCount == 1, "expected 1 pending approval, got %d", review.Timeline.OpenApprovalCount)
	assert(len(review.ToolProposals) == 1, "expected 1 pending proposal, got %d", len(review.ToolProposals))
	logger.log("loaded governed review state with approval and proposal checkpoints")

	var approval runtimeapi.ApprovalCheckpointDecisionResponse
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&approval,
		logger.log,
		"--output", "json",
		"approvals", "decide",
		"--session-id", "sess-cli-proof",
		"--decision", "APPROVE",
		"--reason", "CLI bounded proof approval accepted.",
	)
	assert(strings.EqualFold(string(approval.Status), string(runtimeapi.ApprovalStatusApproved)), "expected approval status APPROVED, got %q", approval.Status)
	logger.log("resolved approval checkpoint")

	var proposal runtimeapi.ToolProposalDecisionResponse
	mustJSONCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		&proposal,
		logger.log,
		"--output", "json",
		"proposals", "decide",
		"--session-id", "sess-cli-proof",
		"--decision", "APPROVE",
		"--reason", "CLI bounded proof proposal accepted.",
	)
	assert(strings.EqualFold(proposal.Status, "APPROVED"), "expected proposal status APPROVED, got %q", proposal.Status)
	logger.log("resolved tool proposal")

	followOutput := mustTextCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		logger.log,
		"sessions", "follow",
		"--session-id", "sess-cli-proof",
		"--once",
		"--render", "delta-update",
	)
	assert(strings.Contains(followOutput, "EpydiosOps governed thread update"), "expected follow envelope header")
	assert(strings.Contains(followOutput, "Proposal Decision: CLI bounded proof proposal accepted."), "expected proposal decision follow line")
	assert(strings.Contains(followOutput, "Evidence Recorded: audit_bundle"), "expected evidence follow line")
	logger.log("followed governed session event stream through cli-agentops")

	handoffOutput := mustTextCommand(
		repoRoot,
		binaryPath,
		append(baseEnv, "AGENTOPS_AUTH_TOKEN="+proof.token),
		logger.log,
		"threads", "show",
		"--task-id", proof.state.task.TaskID,
		"--render", "handoff",
	)
	assert(strings.Contains(handoffOutput, "Type: handoff"), "expected CLI handoff render")
	assert(strings.Contains(handoffOutput, "Current decision: No pending approval checkpoints or tool proposals remain."), "expected resolved current decision summary in CLI handoff")
	assert(strings.Contains(handoffOutput, "Audit/evidence handoff: Evidence package: audit_bundle | evidence-cli-proof-1 | memory://evidence-cli-proof-1"), "expected evidence package in CLI handoff")
	logger.log("proved audit and evidence handoff through explicit cli-agentops handoff output")

	checklist := map[string]any{
		"generated_at_utc": stamp,
		"supported_path_cli_governed_thread": map[string]any{
			"status": "pass",
			"steps": []string{
				"connection and auth truth reported auth-required and connected states",
				"baseline governed thread loaded through cli-agentops",
				"one governed turn submitted through cli-agentops",
				"approval checkpoint resolved through cli-agentops",
				"tool proposal resolved through cli-agentops",
				"live follow consumed governed session event updates",
				"audit and evidence handoff rendered explicitly through cli-agentops handoff output",
			},
			"runtime_api_base_url": proof.runtimeAPIBaseURL,
			"log_path":             logPath,
			"summary_path":         summaryPath,
		},
	}
	summary := map[string]any{
		"generated_at_utc":     stamp,
		"status":               "cli_governed_thread_proof_ready",
		"reason":               "CLI bounded proof accepted connection and auth truth, one governed turn, approval and proposal resolution, live follow, and audit and evidence handoff on the shared governed-thread runtime contract.",
		"runtime_api_base_url": proof.runtimeAPIBaseURL,
		"log_path":             logPath,
		"checklist_path":       checklistPath,
	}
	writeJSON(checklistPath, checklist)
	writeJSON(summaryPath, summary)
	copyFile(logPath, latestLogPath)
	copyFile(summaryPath, latestSummaryPath)
	fmt.Println("CLI governed thread verifier passed.")
}

func mustRepoRoot() string {
	_, filePath, _, ok := runtime.Caller(0)
	if !ok {
		panic("unable to resolve cli proof harness path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filePath), "../../.."))
}

func stampUTC() string {
	return time.Now().UTC().Format("20060102T150405Z")
}

func isoNow() time.Time {
	return time.Now().UTC()
}

func newProofLogger(logPath string) *proofLogger {
	return &proofLogger{logPath: logPath}
}

type proofLogger struct {
	logPath string
}

func (p *proofLogger) log(line string) {
	entry := fmt.Sprintf("[%s] %s", time.Now().UTC().Format(time.RFC3339), line)
	file, err := os.OpenFile(p.logPath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o644)
	if err == nil {
		_, _ = file.WriteString(entry + "\n")
		_ = file.Close()
	}
}

func buildCLIBinary(repoRoot, binaryPath string, logf func(string)) {
	cmd := exec.Command("go", "build", "-o", binaryPath, "./clients/cli-agentops")
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), "GOCACHE="+filepath.Join(repoRoot, ".tmp", "go-build"))
	logf("$ " + strings.Join(cmd.Args, " "))
	output, err := cmd.CombinedOutput()
	if len(output) > 0 {
		logf(strings.TrimSpace(string(output)))
	}
	if err != nil {
		panic(fmt.Sprintf("build cli binary: %v", err))
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
	state := newCLIProofState()
	token := "cli-proof-token"
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimSpace(r.Header.Get("Authorization")) != "Bearer "+token {
			if r.URL.Path == "/v1alpha2/runtime/tasks" && r.Method == http.MethodGet {
				writeJSONResponse(w, http.StatusUnauthorized, map[string]any{"error": "missing or invalid bearer token"})
				return
			}
			writeJSONResponse(w, http.StatusUnauthorized, map[string]any{"error": "missing or invalid bearer token"})
			return
		}
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1alpha2/runtime/tasks":
			writeJSONResponse(w, http.StatusOK, runtimeclient.TaskListResponse{
				Count:  1,
				Limit:  1,
				Offset: 0,
				Items:  []runtimeapi.TaskRecord{state.task},
			})
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/v1alpha2/runtime/tasks/"):
			taskID := strings.TrimPrefix(r.URL.Path, "/v1alpha2/runtime/tasks/")
			if strings.TrimSpace(taskID) != state.task.TaskID {
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
				Limit:         len(items),
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
			timeline := ensureCLIProofSession(state)
			logf(fmt.Sprintf("invoke accepted for task %s", strings.TrimSpace(req.TaskID)))
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
				Transport:        "gateway",
				Model:            "gpt-5.4",
				Route:            "managed_worker_gateway_process",
				EndpointRef:      "cli-proof-endpoint",
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
			for idx := range timeline.ApprovalCheckpoints {
				if timeline.ApprovalCheckpoints[idx].CheckpointID == checkpointID {
					reviewedAt := isoNow()
					timeline.ApprovalCheckpoints[idx].Status = runtimeapi.ApprovalStatusApproved
					timeline.ApprovalCheckpoints[idx].Reason = req.Reason
					timeline.ApprovalCheckpoints[idx].ReviewedAt = &reviewedAt
					timeline.ApprovalCheckpoints[idx].UpdatedAt = reviewedAt
					timeline.OpenApprovalCount = 0
				}
			}
			timeline.Session.Status = runtimeapi.SessionStatusRunning
			timeline.Session.UpdatedAt = isoNow()
			if timeline.SelectedWorker != nil {
				timeline.SelectedWorker.Status = runtimeapi.WorkerStatusRunning
				timeline.SelectedWorker.UpdatedAt = timeline.Session.UpdatedAt
			}
			pushEvent(timeline, "approval.status.changed", map[string]any{
				"checkpointId": checkpointID,
				"decision":     strings.ToUpper(strings.TrimSpace(req.Decision)),
				"status":       runtimeapi.ApprovalStatusApproved,
				"reason":       runtimeclient.NormalizeStringOrDefault(req.Reason, "CLI bounded proof approval accepted."),
			})
			syncState(state, timeline)
			writeJSONResponse(w, http.StatusOK, runtimeapi.ApprovalCheckpointDecisionResponse{
				Applied:      true,
				SessionID:    sessionID,
				CheckpointID: checkpointID,
				Decision:     strings.ToUpper(strings.TrimSpace(req.Decision)),
				Status:       runtimeapi.ApprovalStatusApproved,
				Reason:       req.Reason,
				ReviewedAt:   isoNow().Format(time.RFC3339),
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
			if len(timeline.ToolActions) > 0 {
				timeline.ToolActions[0].Status = runtimeapi.ToolActionStatusCompleted
				timeline.ToolActions[0].UpdatedAt = isoNow()
			}
			evidence := runtimeapi.EvidenceRecord{
				EvidenceID:     "evidence-cli-proof-1",
				SessionID:      sessionID,
				ToolActionID:   "tool-cli-proof-1",
				CheckpointID:   "approval-cli-proof-1",
				TenantID:       state.task.TenantID,
				ProjectID:      state.task.ProjectID,
				Kind:           "audit_bundle",
				URI:            "memory://evidence-cli-proof-1",
				RetentionClass: "standard",
				CreatedAt:      isoNow(),
				UpdatedAt:      isoNow(),
			}
			timeline.EvidenceRecords = append(timeline.EvidenceRecords, evidence)
			timeline.Session.Status = runtimeapi.SessionStatusCompleted
			completedAt := isoNow()
			timeline.Session.CompletedAt = &completedAt
			timeline.Session.UpdatedAt = completedAt
			if timeline.SelectedWorker != nil {
				timeline.SelectedWorker.Status = runtimeapi.WorkerStatusCompleted
				timeline.SelectedWorker.UpdatedAt = completedAt
			}
			state.task.Status = runtimeapi.TaskStatusCompleted
			pushEvent(timeline, "tool_proposal.decided", map[string]any{
				"proposalId":   proposalID,
				"decision":     strings.ToUpper(strings.TrimSpace(req.Decision)),
				"status":       "APPROVED",
				"reason":       runtimeclient.NormalizeStringOrDefault(req.Reason, "CLI bounded proof proposal accepted."),
				"toolActionId": "tool-cli-proof-1",
				"summary":      "Run a safe workspace summary command.",
			})
			pushEvent(timeline, "evidence.recorded", map[string]any{
				"kind":       "audit_bundle",
				"evidenceId": evidence.EvidenceID,
				"summary":    "Governed CLI request bundle ready for downstream review.",
			})
			pushEvent(timeline, "session.status.changed", map[string]any{
				"status":  runtimeapi.SessionStatusCompleted,
				"summary": "Governed CLI review completed.",
			})
			syncState(state, timeline)
			writeJSONResponse(w, http.StatusOK, runtimeapi.ToolProposalDecisionResponse{
				Applied:      true,
				SessionID:    sessionID,
				ProposalID:   proposalID,
				Decision:     strings.ToUpper(strings.TrimSpace(req.Decision)),
				Status:       "APPROVED",
				Reason:       req.Reason,
				ToolActionID: "tool-cli-proof-1",
				ToolType:     "managed_agent_turn",
				ActionStatus: runtimeapi.ToolActionStatusCompleted,
				RunID:        "run-cli-proof-1",
				ReviewedAt:   isoNow().Format(time.RFC3339),
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1alpha2/runtime/worker-capabilities":
			writeJSONResponse(w, http.StatusOK, runtimeapi.WorkerCapabilityCatalogResponse{
				Count: 1,
				Items: []runtimeapi.WorkerCapabilityCatalogEntry{{
					Label:                "Managed Codex Worker",
					ExecutionMode:        runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
					WorkerType:           "managed_agent",
					AdapterID:            "codex",
					Provider:             "agentops_gateway",
					BoundaryRequirements: []string{"governed_tool_execution"},
				}},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1alpha2/runtime/policy-packs":
			writeJSONResponse(w, http.StatusOK, runtimeapi.PolicyPackCatalogResponse{
				Count: 1,
				Items: []runtimeapi.PolicyPackCatalogEntry{{
					PackID:                   "managed_codex_worker_operator",
					Label:                    "Managed Codex Worker Operator",
					RoleBundles:              []string{"enterprise.operator", "enterprise.worker_controller"},
					DecisionSurfaces:         []string{"approval_checkpoint", "tool_proposal"},
					ApplicableExecutionModes: []string{runtimeapi.AgentInvokeExecutionModeManagedCodexWorker},
					ApplicableWorkerTypes:    []string{"managed_agent"},
					ApplicableAdapterIDs:     []string{"codex"},
					ClientSurfaces:           []string{"cli"},
					ReportingSurfaces:        []string{"report", "delta-report"},
					BoundaryRequirements:     []string{"agentops_gateway_boundary"},
				}},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1alpha2/runtime/export-profiles":
			reportType := r.URL.Query().Get("reportType")
			writeJSONResponse(w, http.StatusOK, runtimeapi.ExportProfileCatalogResponse{
				Count: 1,
				Items: []runtimeapi.ExportProfileCatalogEntry{{
					ExportProfile:           map[bool]string{true: "operator_follow", false: "operator_review"}[strings.Contains(reportType, "delta")],
					Label:                   map[bool]string{true: "Operator Follow", false: "Operator Review"}[strings.Contains(reportType, "delta")],
					DefaultAudience:         "operator",
					AllowedAudiences:        []string{"operator", "security_review"},
					DefaultRetentionClass:   map[bool]string{true: "short", false: "standard"}[strings.Contains(reportType, "delta")],
					AllowedRetentionClasses: []string{"short", "standard", "archive"},
					ClientSurfaces:          []string{"cli"},
					ReportTypes:             []string{"report", "delta-report"},
					DeliveryChannels:        []string{"report", "stream"},
					RedactionMode:           "structured_and_text",
				}},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1alpha2/runtime/org-admin-profiles":
			writeJSONResponse(w, http.StatusOK, runtimeapi.OrgAdminCatalogResponse{
				Count: 1,
				Items: []runtimeapi.OrgAdminCatalogEntry{{
					ProfileID:            "centralized_enterprise_admin",
					Label:                "Centralized Enterprise Admin",
					OrganizationModel:    "centralized_enterprise",
					BoundaryRequirements: []string{"runtime_authz"},
					ReportingSurfaces:    []string{"admin_report"},
					ClientSurfaces:       []string{"cli"},
				}},
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

func newCLIProofState() *cliProofState {
	now := isoNow()
	task := runtimeapi.TaskRecord{
		TaskID:          "task-cli-proof-1",
		TenantID:        "tenant-demo",
		ProjectID:       "project-payments",
		Source:          "cli",
		Title:           "Review governed CLI request",
		Intent:          "Validate the first bounded CLI governed thread path.",
		Status:          runtimeapi.TaskStatusInProgress,
		CreatedAt:       now,
		UpdatedAt:       now,
		LatestSessionID: "sess-cli-baseline",
	}
	baselineTimeline := &runtimeapi.SessionTimelineResponse{
		Session: runtimeapi.SessionRecord{
			SessionID:        "sess-cli-baseline",
			TaskID:           task.TaskID,
			TenantID:         task.TenantID,
			ProjectID:        task.ProjectID,
			SessionType:      "interactive",
			Status:           runtimeapi.SessionStatusCompleted,
			SelectedWorkerID: "worker-cli-baseline",
			CreatedAt:        now,
			StartedAt:        now,
			UpdatedAt:        now,
		},
		Task: &task,
		SelectedWorker: &runtimeapi.SessionWorkerRecord{
			WorkerID:   "worker-cli-baseline",
			SessionID:  "sess-cli-baseline",
			TaskID:     task.TaskID,
			TenantID:   task.TenantID,
			ProjectID:  task.ProjectID,
			WorkerType: "managed_agent",
			AdapterID:  "codex",
			Status:     runtimeapi.WorkerStatusCompleted,
			CreatedAt:  now,
			UpdatedAt:  now,
		},
		ToolActions: []runtimeapi.ToolActionRecord{{
			ToolActionID: "tool-cli-baseline-1",
			SessionID:    "sess-cli-baseline",
			WorkerID:     "worker-cli-baseline",
			TenantID:     task.TenantID,
			ProjectID:    task.ProjectID,
			ToolType:     "managed_agent_turn",
			Status:       runtimeapi.ToolActionStatusCompleted,
			ResultPayload: mustJSON(map[string]any{
				"runId":              "run-cli-baseline",
				"route":              "managed_worker_gateway_process",
				"boundaryProviderId": "agentops_gateway",
				"endpointRef":        "cli-proof-endpoint",
				"rawResponse": []map[string]any{{
					"type": "message",
					"text": "Baseline governed CLI review ready.",
				}},
			}),
			CreatedAt: now,
			UpdatedAt: now,
		}},
		EvidenceRecords: []runtimeapi.EvidenceRecord{{
			EvidenceID:     "evidence-cli-baseline-1",
			SessionID:      "sess-cli-baseline",
			ToolActionID:   "tool-cli-baseline-1",
			TenantID:       task.TenantID,
			ProjectID:      task.ProjectID,
			Kind:           "audit_bundle",
			URI:            "memory://evidence-cli-baseline-1",
			RetentionClass: "standard",
			CreatedAt:      now,
			UpdatedAt:      now,
		}},
		Events: []runtimeapi.SessionEventRecord{
			{
				EventID:   "evt-cli-baseline-1",
				SessionID: "sess-cli-baseline",
				Sequence:  1,
				EventType: "session.status.changed",
				Payload: mustJSON(map[string]any{
					"status":  runtimeapi.SessionStatusCompleted,
					"summary": "Baseline governed CLI review completed.",
				}),
				Timestamp: now,
			},
			{
				EventID:   "evt-cli-baseline-2",
				SessionID: "sess-cli-baseline",
				Sequence:  2,
				EventType: "evidence.recorded",
				Payload: mustJSON(map[string]any{
					"kind":       "audit_bundle",
					"evidenceId": "evidence-cli-baseline-1",
					"summary":    "Initial governed CLI bundle is available.",
				}),
				Timestamp: now,
			},
		},
		OpenApprovalCount:   0,
		LatestEventSequence: 2,
	}
	return &cliProofState{
		task: task,
		sessions: []runtimeapi.SessionRecord{
			baselineTimeline.Session,
		},
		timelines: map[string]*runtimeapi.SessionTimelineResponse{
			baselineTimeline.Session.SessionID: baselineTimeline,
		},
	}
}

func ensureCLIProofSession(state *cliProofState) *runtimeapi.SessionTimelineResponse {
	if timeline := state.timelines["sess-cli-proof"]; timeline != nil {
		return timeline
	}
	now := isoNow()
	timeline := &runtimeapi.SessionTimelineResponse{
		Session: runtimeapi.SessionRecord{
			SessionID:        "sess-cli-proof",
			TaskID:           state.task.TaskID,
			TenantID:         state.task.TenantID,
			ProjectID:        state.task.ProjectID,
			SessionType:      "interactive",
			Status:           runtimeapi.SessionStatusAwaitingApproval,
			SelectedWorkerID: "worker-cli-proof",
			CreatedAt:        now,
			StartedAt:        now,
			UpdatedAt:        now,
		},
		Task: &state.task,
		SelectedWorker: &runtimeapi.SessionWorkerRecord{
			WorkerID:   "worker-cli-proof",
			SessionID:  "sess-cli-proof",
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
			CheckpointID: "approval-cli-proof-1",
			SessionID:    "sess-cli-proof",
			TenantID:     state.task.TenantID,
			ProjectID:    state.task.ProjectID,
			Scope:        "worker_action",
			Status:       runtimeapi.ApprovalStatusPending,
			Reason:       "Review the first governed CLI turn before execution continues.",
			CreatedAt:    now,
			UpdatedAt:    now,
		}},
		ToolActions: []runtimeapi.ToolActionRecord{{
			ToolActionID:         "tool-cli-proof-1",
			SessionID:            "sess-cli-proof",
			WorkerID:             "worker-cli-proof",
			TenantID:             state.task.TenantID,
			ProjectID:            state.task.ProjectID,
			ToolType:             "managed_agent_turn",
			Status:               runtimeapi.ToolActionStatusAuthorized,
			ApprovalCheckpointID: "approval-cli-proof-1",
			ResultPayload: mustJSON(map[string]any{
				"runId":              "run-cli-proof-1",
				"route":              "managed_worker_gateway_process",
				"boundaryProviderId": "agentops_gateway",
				"endpointRef":        "cli-proof-endpoint",
				"rawResponse": []map[string]any{{
					"type": "message",
					"text": "Governed CLI turn is awaiting review.",
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
		"summary": "Governed CLI turn submitted for review.",
	})
	pushEvent(timeline, "approval.requested", map[string]any{
		"status": "PENDING",
		"reason": "Review the first governed CLI turn before execution continues.",
		"scope":  "worker_action",
	})
	pushEvent(timeline, "tool_proposal.generated", map[string]any{
		"proposalId":   "proposal-cli-proof-1",
		"proposalType": "terminal_command",
		"summary":      "Run a safe workspace summary command.",
		"payload": map[string]any{
			"command": "pwd",
			"cwd":     "/workspace",
		},
	})
	state.timelines[timeline.Session.SessionID] = timeline
	state.sessions = append([]runtimeapi.SessionRecord{timeline.Session}, state.sessions...)
	state.task.LatestSessionID = timeline.Session.SessionID
	state.task.UpdatedAt = isoNow()
	return timeline
}

func syncState(state *cliProofState, timeline *runtimeapi.SessionTimelineResponse) {
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
