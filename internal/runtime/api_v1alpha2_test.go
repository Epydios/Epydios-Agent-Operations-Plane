package runtime

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRuntimeV1Alpha2TaskAndSessionFlow(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	createTaskBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-request-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"source": "desktop-ui",
		"title":  "Investigate sandbox alert",
		"intent": "Create a governed operator task that can later attach a worker.",
	}
	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", createTaskBody)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}

	var createdTask TaskRecord
	decodeResponseBody(t, rr, &createdTask)
	if createdTask.TaskID == "" {
		t.Fatalf("created task missing taskId: %+v", createdTask)
	}
	if createdTask.Status != TaskStatusNew {
		t.Fatalf("created task status=%q want %q", createdTask.Status, TaskStatusNew)
	}

	createSessionBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-request-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"sessionType": "operator_request",
		"source":      "desktop-ui",
		"summary": map[string]interface{}{
			"channel": "settings-panel",
		},
	}
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+createdTask.TaskID+"/sessions", createSessionBody)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST session status=%d body=%s", rr.Code, rr.Body.String())
	}

	var createdSession SessionRecord
	decodeResponseBody(t, rr, &createdSession)
	if createdSession.TaskID != createdTask.TaskID {
		t.Fatalf("session taskId=%q want %q", createdSession.TaskID, createdTask.TaskID)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/tasks/"+createdTask.TaskID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var loadedTask TaskRecord
	decodeResponseBody(t, rr, &loadedTask)
	if loadedTask.LatestSessionID != createdSession.SessionID {
		t.Fatalf("task latestSessionId=%q want %q", loadedTask.LatestSessionID, createdSession.SessionID)
	}
	if loadedTask.Status != TaskStatusInProgress {
		t.Fatalf("task status=%q want %q", loadedTask.Status, TaskStatusInProgress)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions?tenantId=tenant-a&projectId=project-a", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET sessions status=%d body=%s", rr.Code, rr.Body.String())
	}
	var sessionList struct {
		Count int             `json:"count"`
		Items []SessionRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &sessionList)
	if sessionList.Count != 1 {
		t.Fatalf("session count=%d want 1", sessionList.Count)
	}
	if sessionList.Items[0].SessionID != createdSession.SessionID {
		t.Fatalf("listed sessionId=%q want %q", sessionList.Items[0].SessionID, createdSession.SessionID)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/events", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session events status=%d body=%s", rr.Code, rr.Body.String())
	}
	var eventList struct {
		Count int                  `json:"count"`
		Items []SessionEventRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &eventList)
	if eventList.Count != 1 {
		t.Fatalf("event count=%d want 1", eventList.Count)
	}
	if eventList.Items[0].EventType != SessionEventType("session.created") {
		t.Fatalf("event type=%q want session.created", eventList.Items[0].EventType)
	}

	attachWorkerBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "worker-request-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"workerType":        "managed_agent",
		"adapterId":         "codex",
		"routing":           "direct_first",
		"agentProfileId":    "codex",
		"provider":          "openai_compatible",
		"transport":         "responses_api",
		"model":             "gpt-5-codex",
		"targetEnvironment": "local-desktop",
		"capabilities":      []string{"plan", "code", "terminal"},
	}
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/workers", attachWorkerBody)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST session worker status=%d body=%s", rr.Code, rr.Body.String())
	}

	var createdWorker SessionWorkerRecord
	decodeResponseBody(t, rr, &createdWorker)
	if createdWorker.SessionID != createdSession.SessionID {
		t.Fatalf("worker sessionId=%q want %q", createdWorker.SessionID, createdSession.SessionID)
	}
	if createdWorker.AdapterID != "codex" {
		t.Fatalf("worker adapterId=%q want codex", createdWorker.AdapterID)
	}
	if createdWorker.Status != WorkerStatusAttached {
		t.Fatalf("worker status=%q want %q", createdWorker.Status, WorkerStatusAttached)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session status=%d body=%s", rr.Code, rr.Body.String())
	}
	var loadedSession SessionRecord
	decodeResponseBody(t, rr, &loadedSession)
	if loadedSession.SelectedWorkerID != createdWorker.WorkerID {
		t.Fatalf("session selectedWorkerId=%q want %q", loadedSession.SelectedWorkerID, createdWorker.WorkerID)
	}
	if loadedSession.Status != SessionStatusReady {
		t.Fatalf("session status=%q want %q", loadedSession.Status, SessionStatusReady)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/workers", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session workers status=%d body=%s", rr.Code, rr.Body.String())
	}
	var workerList struct {
		Count int                   `json:"count"`
		Items []SessionWorkerRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &workerList)
	if workerList.Count != 1 {
		t.Fatalf("worker count=%d want 1", workerList.Count)
	}
	if workerList.Items[0].WorkerID != createdWorker.WorkerID {
		t.Fatalf("listed workerId=%q want %q", workerList.Items[0].WorkerID, createdWorker.WorkerID)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/events", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session events after worker attach status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &eventList)
	if eventList.Count != 4 {
		t.Fatalf("event count after worker attach=%d want 4", eventList.Count)
	}
	if eventList.Items[1].EventType != SessionEventType("worker.attached") {
		t.Fatalf("event[1] type=%q want worker.attached", eventList.Items[1].EventType)
	}
	if eventList.Items[2].EventType != SessionEventType("worker.status.changed") {
		t.Fatalf("event[2] type=%q want worker.status.changed", eventList.Items[2].EventType)
	}
	if eventList.Items[3].EventType != SessionEventType("session.status.changed") {
		t.Fatalf("event[3] type=%q want session.status.changed", eventList.Items[3].EventType)
	}

	workerEventBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "worker-event-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"eventType": "worker.output.delta",
		"status":    "RUNNING",
		"severity":  "info",
		"summary":   "worker emitted a progress update",
		"payload": map[string]interface{}{
			"delta":   "planning the first terminal step",
			"channel": "stdout",
		},
	}
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/workers/"+createdWorker.WorkerID+"/events", workerEventBody)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST worker event status=%d body=%s", rr.Code, rr.Body.String())
	}
	var workerEventResp struct {
		SessionID     string        `json:"sessionId"`
		WorkerID      string        `json:"workerId"`
		EventType     string        `json:"eventType"`
		WorkerStatus  WorkerStatus  `json:"workerStatus"`
		SessionStatus SessionStatus `json:"sessionStatus"`
	}
	decodeResponseBody(t, rr, &workerEventResp)
	if workerEventResp.EventType != "worker.output.delta" {
		t.Fatalf("worker event type=%q want worker.output.delta", workerEventResp.EventType)
	}
	if workerEventResp.WorkerStatus != WorkerStatusRunning {
		t.Fatalf("worker status after worker event=%q want %q", workerEventResp.WorkerStatus, WorkerStatusRunning)
	}
	if workerEventResp.SessionStatus != SessionStatusRunning {
		t.Fatalf("session status after worker event=%q want %q", workerEventResp.SessionStatus, SessionStatusRunning)
	}

	approvalBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "approval-request-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"scope":                  "worker_action",
		"tier":                   3,
		"targetOs":               "linux",
		"targetExecutionProfile": "sandbox_vm_autonomous",
		"requestedCapabilities":  []string{"terminal.exec"},
		"requiredVerifierIds":    []string{"verify-policy"},
		"reason":                 "operator approval required before terminal execution",
		"ttlSeconds":             1200,
	}
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/approval-checkpoints", approvalBody)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST approval checkpoint status=%d body=%s", rr.Code, rr.Body.String())
	}
	var createdCheckpoint ApprovalCheckpointRecord
	decodeResponseBody(t, rr, &createdCheckpoint)
	if createdCheckpoint.SessionID != createdSession.SessionID {
		t.Fatalf("checkpoint sessionId=%q want %q", createdCheckpoint.SessionID, createdSession.SessionID)
	}
	if createdCheckpoint.Status != ApprovalStatusPending {
		t.Fatalf("checkpoint status=%q want %q", createdCheckpoint.Status, ApprovalStatusPending)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/approval-checkpoints", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET approval checkpoints status=%d body=%s", rr.Code, rr.Body.String())
	}
	var approvalList struct {
		Count int                        `json:"count"`
		Items []ApprovalCheckpointRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &approvalList)
	if approvalList.Count != 1 {
		t.Fatalf("approval checkpoint count=%d want 1", approvalList.Count)
	}
	if approvalList.Items[0].CheckpointID != createdCheckpoint.CheckpointID {
		t.Fatalf("listed checkpointId=%q want %q", approvalList.Items[0].CheckpointID, createdCheckpoint.CheckpointID)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session after approval request status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &loadedSession)
	if loadedSession.Status != SessionStatusAwaitingApproval {
		t.Fatalf("session status after approval request=%q want %q", loadedSession.Status, SessionStatusAwaitingApproval)
	}

	streamReq := httptest.NewRequest(http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/events/stream?afterSequence=4", nil)
	streamReq.Header.Set("Accept", "text/event-stream")
	streamRR := httptest.NewRecorder()
	handler.ServeHTTP(streamRR, streamReq)
	if streamRR.Code != http.StatusOK {
		t.Fatalf("GET session event stream status=%d body=%s", streamRR.Code, streamRR.Body.String())
	}
	if got := streamRR.Header().Get("Content-Type"); !strings.Contains(got, "text/event-stream") {
		t.Fatalf("stream content-type=%q want text/event-stream", got)
	}
	if body := streamRR.Body.String(); !strings.Contains(body, "event: approval.requested") || !strings.Contains(body, "event: session.status.changed") {
		t.Fatalf("stream body missing approval/session events: %s", body)
	}

	decisionBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "approval-decision-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"decision": "APPROVE",
		"reason":   "approved for managed worker execution",
	}
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/approval-checkpoints/"+createdCheckpoint.CheckpointID+"/decision", decisionBody)
	if rr.Code != http.StatusOK {
		t.Fatalf("POST approval decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	var decisionResp ApprovalCheckpointDecisionResponse
	decodeResponseBody(t, rr, &decisionResp)
	if !decisionResp.Applied {
		t.Fatalf("expected approval decision applied=true: %#v", decisionResp)
	}
	if decisionResp.Status != ApprovalStatusApproved {
		t.Fatalf("approval decision status=%q want %q", decisionResp.Status, ApprovalStatusApproved)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session after approval decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &loadedSession)
	if loadedSession.Status != SessionStatusReady {
		t.Fatalf("session status after approval decision=%q want %q", loadedSession.Status, SessionStatusReady)
	}

	toolActionBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "tool-action-request-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"workerId": createdWorker.WorkerID,
		"toolType": "terminal_command",
		"status":   "STARTED",
		"requestPayload": map[string]interface{}{
			"command": "echo hi",
		},
		"policyDecision": "ALLOW",
	}
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/tool-actions", toolActionBody)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST tool action status=%d body=%s", rr.Code, rr.Body.String())
	}
	var createdToolAction ToolActionRecord
	decodeResponseBody(t, rr, &createdToolAction)
	if createdToolAction.SessionID != createdSession.SessionID {
		t.Fatalf("tool action sessionId=%q want %q", createdToolAction.SessionID, createdSession.SessionID)
	}
	if createdToolAction.Status != ToolActionStatusStarted {
		t.Fatalf("tool action status=%q want %q", createdToolAction.Status, ToolActionStatusStarted)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/tool-actions", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET tool actions status=%d body=%s", rr.Code, rr.Body.String())
	}
	var toolActionList struct {
		Count int                `json:"count"`
		Items []ToolActionRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &toolActionList)
	if toolActionList.Count != 1 {
		t.Fatalf("tool action count=%d want 1", toolActionList.Count)
	}
	if toolActionList.Items[0].ToolActionID != createdToolAction.ToolActionID {
		t.Fatalf("listed toolActionId=%q want %q", toolActionList.Items[0].ToolActionID, createdToolAction.ToolActionID)
	}

	evidenceBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "evidence-request-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"kind":         "tool_output",
		"toolActionId": createdToolAction.ToolActionID,
		"checksum":     "sha256:test",
		"metadata": map[string]interface{}{
			"status": "ok",
		},
	}
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/evidence", evidenceBody)
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST evidence status=%d body=%s", rr.Code, rr.Body.String())
	}
	var createdEvidence EvidenceRecord
	decodeResponseBody(t, rr, &createdEvidence)
	if createdEvidence.SessionID != createdSession.SessionID {
		t.Fatalf("evidence sessionId=%q want %q", createdEvidence.SessionID, createdSession.SessionID)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/evidence", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET evidence status=%d body=%s", rr.Code, rr.Body.String())
	}
	var evidenceList struct {
		Count int              `json:"count"`
		Items []EvidenceRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &evidenceList)
	if evidenceList.Count != 1 {
		t.Fatalf("evidence count=%d want 1", evidenceList.Count)
	}
	if evidenceList.Items[0].EvidenceID != createdEvidence.EvidenceID {
		t.Fatalf("listed evidenceId=%q want %q", evidenceList.Items[0].EvidenceID, createdEvidence.EvidenceID)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/timeline", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session timeline status=%d body=%s", rr.Code, rr.Body.String())
	}
	var timelineResp SessionTimelineResponse
	decodeResponseBody(t, rr, &timelineResp)
	if timelineResp.Session.SessionID != createdSession.SessionID {
		t.Fatalf("timeline sessionId=%q want %q", timelineResp.Session.SessionID, createdSession.SessionID)
	}
	if timelineResp.Session.Status != SessionStatusRunning {
		t.Fatalf("timeline session status=%q want %q", timelineResp.Session.Status, SessionStatusRunning)
	}
	if timelineResp.SelectedWorker == nil || timelineResp.SelectedWorker.WorkerID != createdWorker.WorkerID {
		t.Fatalf("timeline selected worker mismatch: %+v", timelineResp.SelectedWorker)
	}
	if len(timelineResp.Workers) != 1 {
		t.Fatalf("timeline worker count=%d want 1", len(timelineResp.Workers))
	}
	if len(timelineResp.ApprovalCheckpoints) != 1 {
		t.Fatalf("timeline approval count=%d want 1", len(timelineResp.ApprovalCheckpoints))
	}
	if timelineResp.OpenApprovalCount != 0 {
		t.Fatalf("timeline openApprovalCount=%d want 0", timelineResp.OpenApprovalCount)
	}
	if len(timelineResp.ToolActions) != 1 {
		t.Fatalf("timeline tool action count=%d want 1", len(timelineResp.ToolActions))
	}
	if len(timelineResp.EvidenceRecords) != 1 {
		t.Fatalf("timeline evidence count=%d want 1", len(timelineResp.EvidenceRecords))
	}
	if len(timelineResp.Events) != 14 {
		t.Fatalf("timeline event count=%d want 14", len(timelineResp.Events))
	}
	if timelineResp.LatestEventSequence != 14 {
		t.Fatalf("timeline latestEventSequence=%d want 14", timelineResp.LatestEventSequence)
	}

	closeBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-close-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"status": "COMPLETED",
		"reason": "operator completed workflow",
	}
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/close", closeBody)
	if rr.Code != http.StatusOK {
		t.Fatalf("POST session close status=%d body=%s", rr.Code, rr.Body.String())
	}
	var closedSession SessionRecord
	decodeResponseBody(t, rr, &closedSession)
	if closedSession.Status != SessionStatusCompleted {
		t.Fatalf("closed session status=%q want %q", closedSession.Status, SessionStatusCompleted)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/tasks/"+createdTask.TaskID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET task after close status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &loadedTask)
	if loadedTask.Status != TaskStatusCompleted {
		t.Fatalf("task status after close=%q want %q", loadedTask.Status, TaskStatusCompleted)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+createdSession.SessionID+"/events", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session events after close status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &eventList)
	if eventList.Count != 16 {
		t.Fatalf("event count after worker/approval/tool/evidence/close=%d want 16", eventList.Count)
	}
	if eventList.Items[4].EventType != SessionEventType("worker.output.delta") {
		t.Fatalf("event[4] type=%q want worker.output.delta", eventList.Items[4].EventType)
	}
	if eventList.Items[5].EventType != SessionEventType("worker.status.changed") {
		t.Fatalf("event[5] type=%q want worker.status.changed", eventList.Items[5].EventType)
	}
	if eventList.Items[6].EventType != SessionEventType("session.status.changed") {
		t.Fatalf("event[6] type=%q want session.status.changed", eventList.Items[6].EventType)
	}
	if eventList.Items[7].EventType != SessionEventType("approval.requested") {
		t.Fatalf("event[7] type=%q want approval.requested", eventList.Items[7].EventType)
	}
	if eventList.Items[8].EventType != SessionEventType("session.status.changed") {
		t.Fatalf("event[8] type=%q want session.status.changed", eventList.Items[8].EventType)
	}
	if eventList.Items[9].EventType != SessionEventType("approval.status.changed") {
		t.Fatalf("event[9] type=%q want approval.status.changed", eventList.Items[9].EventType)
	}
	if eventList.Items[10].EventType != SessionEventType("session.status.changed") {
		t.Fatalf("event[10] type=%q want session.status.changed", eventList.Items[10].EventType)
	}
	if eventList.Items[11].EventType != SessionEventType("tool_action.started") {
		t.Fatalf("event[11] type=%q want tool_action.started", eventList.Items[11].EventType)
	}
	if eventList.Items[12].EventType != SessionEventType("session.status.changed") {
		t.Fatalf("event[12] type=%q want session.status.changed", eventList.Items[12].EventType)
	}
	if eventList.Items[13].EventType != SessionEventType("evidence.recorded") {
		t.Fatalf("event[13] type=%q want evidence.recorded", eventList.Items[13].EventType)
	}
	if eventList.Items[14].EventType != SessionEventType("session.status.changed") {
		t.Fatalf("event[14] type=%q want session.status.changed", eventList.Items[14].EventType)
	}
	if eventList.Items[15].EventType != SessionEventType("session.completed") {
		t.Fatalf("event[15] type=%q want session.completed", eventList.Items[15].EventType)
	}
}

func TestRuntimeV1Alpha2ToolProposalDecisionPromotesAuthorizedToolAction(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-proposal-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"source": "desktop-ui",
		"title":  "Proposal decision flow",
		"intent": "Validate chat-native proposal approval.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-proposal-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"sessionType": "managed_agent_turn",
		"source":      "desktop-ui",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST session status=%d body=%s", rr.Code, rr.Body.String())
	}
	var session SessionRecord
	decodeResponseBody(t, rr, &session)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "worker-proposal-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"workerType":        "managed_agent",
		"adapterId":         "codex",
		"agentProfileId":    "codex",
		"targetEnvironment": "codex",
		"capabilities":      []string{"agent_turn", "tool_proposal"},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST worker status=%d body=%s", rr.Code, rr.Body.String())
	}
	var worker SessionWorkerRecord
	decodeResponseBody(t, rr, &worker)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers/"+worker.WorkerID+"/events", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-generated-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"eventType": "tool_proposal.generated",
		"summary":   "Managed Codex suggested a terminal command.",
		"payload": map[string]interface{}{
			"proposalId":        "proposal-terminal-1",
			"proposalType":      "terminal_command",
			"command":           "pwd",
			"cwd":               "",
			"timeoutSeconds":    5,
			"readOnlyRequested": true,
			"confidence":        "structured",
		},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST generated proposal event status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/tool-proposals/proposal-terminal-1/decision", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-decision-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"decision": "APPROVE",
		"reason":   "approved for governed terminal execution",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST tool proposal decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	var decisionResp ToolProposalDecisionResponse
	decodeResponseBody(t, rr, &decisionResp)
	if !decisionResp.Applied {
		t.Fatalf("expected tool proposal decision applied=true: %#v", decisionResp)
	}
	if decisionResp.Status != "APPROVED" {
		t.Fatalf("tool proposal decision status=%q want APPROVED", decisionResp.Status)
	}
	if decisionResp.ActionStatus != ToolActionStatusCompleted {
		t.Fatalf("tool proposal actionStatus=%q want %q", decisionResp.ActionStatus, ToolActionStatusCompleted)
	}
	if decisionResp.ToolActionID == "" {
		t.Fatalf("tool proposal decision missing toolActionId: %#v", decisionResp)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/tool-actions", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET tool actions status=%d body=%s", rr.Code, rr.Body.String())
	}
	var toolActionList struct {
		Count int                `json:"count"`
		Items []ToolActionRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &toolActionList)
	if toolActionList.Count != 1 {
		t.Fatalf("tool action count=%d want 1", toolActionList.Count)
	}
	if toolActionList.Items[0].ToolActionID != decisionResp.ToolActionID {
		t.Fatalf("tool action id=%q want %q", toolActionList.Items[0].ToolActionID, decisionResp.ToolActionID)
	}
	if toolActionList.Items[0].Status != ToolActionStatusCompleted {
		t.Fatalf("tool action status=%q want %q", toolActionList.Items[0].Status, ToolActionStatusCompleted)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/events", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session events status=%d body=%s", rr.Code, rr.Body.String())
	}
	var eventList struct {
		Count int                  `json:"count"`
		Items []SessionEventRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &eventList)
	sawProposalDecision := false
	sawAuthorizedAction := false
	sawStartedAction := false
	sawCompletedAction := false
	for _, item := range eventList.Items {
		if item.EventType == SessionEventType("tool_proposal.decided") {
			sawProposalDecision = true
		}
		if item.EventType == SessionEventType("tool_action.authorized") {
			sawAuthorizedAction = true
		}
		if item.EventType == SessionEventType("tool_action.started") {
			sawStartedAction = true
		}
		if item.EventType == SessionEventType("tool_action.completed") {
			sawCompletedAction = true
		}
	}
	if !sawProposalDecision {
		t.Fatalf("session events missing tool_proposal.decided: %+v", eventList.Items)
	}
	if !sawAuthorizedAction {
		t.Fatalf("session events missing tool_action.authorized: %+v", eventList.Items)
	}
	if !sawStartedAction {
		t.Fatalf("session events missing tool_action.started: %+v", eventList.Items)
	}
	if !sawCompletedAction {
		t.Fatalf("session events missing tool_action.completed: %+v", eventList.Items)
	}
}

func TestRuntimeV1Alpha2WorkerLifecycleUpdatesSessionAndTask(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-lifecycle-1",
			"tenantId":  "tenant-b",
			"projectId": "project-b",
		},
		"source": "desktop-ui.operator_chat",
		"title":  "Managed worker lifecycle",
		"intent": "Validate worker lifecycle state transitions.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-lifecycle-1",
			"tenantId":  "tenant-b",
			"projectId": "project-b",
		},
		"sessionType": "managed_agent_bridge",
		"source":      "desktop-ui.operator_chat.managed_worker",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST session status=%d body=%s", rr.Code, rr.Body.String())
	}
	var session SessionRecord
	decodeResponseBody(t, rr, &session)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "worker-lifecycle-1",
			"tenantId":  "tenant-b",
			"projectId": "project-b",
		},
		"workerType":        "managed_agent",
		"adapterId":         "codex",
		"agentProfileId":    "codex",
		"targetEnvironment": "local-desktop",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST worker status=%d body=%s", rr.Code, rr.Body.String())
	}
	var worker SessionWorkerRecord
	decodeResponseBody(t, rr, &worker)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers/"+worker.WorkerID+"/events", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "worker-lifecycle-running",
			"tenantId":  "tenant-b",
			"projectId": "project-b",
		},
		"eventType": "worker.progress",
		"status":    "RUNNING",
		"summary":   "worker is actively processing the turn",
		"payload": map[string]interface{}{
			"stage":   "planning",
			"percent": 15,
		},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST running worker event status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers/"+worker.WorkerID+"/events", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "worker-lifecycle-heartbeat",
			"tenantId":  "tenant-b",
			"projectId": "project-b",
		},
		"eventType": "worker.heartbeat",
		"summary":   "worker heartbeat from managed Codex bridge",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST heartbeat worker event status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers/"+worker.WorkerID+"/events", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "worker-lifecycle-complete",
			"tenantId":  "tenant-b",
			"projectId": "project-b",
		},
		"eventType": "worker.status.changed",
		"status":    "COMPLETED",
		"summary":   "worker completed the managed task",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST completed worker event status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &session)
	if session.Status != SessionStatusCompleted {
		t.Fatalf("session status=%q want %q", session.Status, SessionStatusCompleted)
	}
	if session.CompletedAt == nil {
		t.Fatalf("expected session completedAt to be set")
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/tasks/"+task.TaskID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET task status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &task)
	if task.Status != TaskStatusCompleted {
		t.Fatalf("task status=%q want %q", task.Status, TaskStatusCompleted)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/events", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session events status=%d body=%s", rr.Code, rr.Body.String())
	}
	var eventList struct {
		Count int                  `json:"count"`
		Items []SessionEventRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &eventList)
	foundHeartbeat := false
	foundSessionCompleted := false
	for _, item := range eventList.Items {
		if item.EventType == SessionEventType("worker.heartbeat") {
			foundHeartbeat = true
		}
		if item.EventType == SessionEventType("session.completed") {
			foundSessionCompleted = true
		}
	}
	if !foundHeartbeat {
		t.Fatalf("expected worker.heartbeat in event list: %+v", eventList.Items)
	}
	if !foundSessionCompleted {
		t.Fatalf("expected session.completed in event list: %+v", eventList.Items)
	}
}

func TestRuntimeV1Alpha2ApprovalDenyClosesBlockedSession(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-request-deny-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"source": "desktop-ui",
		"title":  "Deny approval flow",
		"intent": "Exercise blocked close-state behavior after an operator denial.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-request-deny-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"sessionType": "operator_request",
		"source":      "desktop-ui",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST session status=%d body=%s", rr.Code, rr.Body.String())
	}
	var session SessionRecord
	decodeResponseBody(t, rr, &session)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/approval-checkpoints", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "approval-request-deny-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"scope":  "session",
		"reason": "Need an operator deny path",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST approval checkpoint status=%d body=%s", rr.Code, rr.Body.String())
	}
	var checkpoint ApprovalCheckpointRecord
	decodeResponseBody(t, rr, &checkpoint)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/approval-checkpoints/"+checkpoint.CheckpointID+"/decision", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "approval-decision-deny-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"decision": "DENY",
		"reason":   "Denied in test",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST approval decision status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET session status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &session)
	if session.Status != SessionStatusBlocked {
		t.Fatalf("session status=%q want %q", session.Status, SessionStatusBlocked)
	}
	if session.CompletedAt == nil || session.CompletedAt.IsZero() {
		t.Fatalf("blocked session should be closed with completedAt set: %+v", session)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/tasks/"+task.TaskID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET task status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &task)
	if task.Status != TaskStatusBlocked {
		t.Fatalf("task status=%q want %q", task.Status, TaskStatusBlocked)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/events", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET events status=%d body=%s", rr.Code, rr.Body.String())
	}
	var events struct {
		Count int                  `json:"count"`
		Items []SessionEventRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &events)
	foundTerminal := false
	for _, item := range events.Items {
		if item.EventType == SessionEventType("session.failed") {
			foundTerminal = true
			break
		}
	}
	if !foundTerminal {
		t.Fatalf("events missing session.failed terminal marker for blocked session: %+v", events.Items)
	}
}

func TestRuntimeV1Alpha2LegacyRunProjection(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	expiredAt := time.Now().UTC().Add(10 * time.Minute)
	seedApprovalRun(t, store, approvalSeed{
		RunID:              "run-legacy-1",
		Tier:               3,
		PolicyDecision:     "ALLOW",
		PolicyGrantPresent: false,
		Status:             RunStatusFailed,
		ExpiresAt:          &expiredAt,
		TenantID:           "tenant-a",
		ProjectID:          "project-a",
	})

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions?tenantId=tenant-a&projectId=project-a&includeLegacy=true", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET sessions status=%d body=%s", rr.Code, rr.Body.String())
	}
	var sessionList struct {
		Count int             `json:"count"`
		Items []SessionRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &sessionList)
	if sessionList.Count != 1 {
		t.Fatalf("legacy projected session count=%d want 1", sessionList.Count)
	}
	if sessionList.Items[0].SessionID != "run-legacy-1" {
		t.Fatalf("projected sessionId=%q want run-legacy-1", sessionList.Items[0].SessionID)
	}
	if sessionList.Items[0].LegacyRunID != "run-legacy-1" {
		t.Fatalf("projected legacyRunId=%q want run-legacy-1", sessionList.Items[0].LegacyRunID)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/run-legacy-1/events", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET legacy events status=%d body=%s", rr.Code, rr.Body.String())
	}
	var eventList struct {
		Count int                  `json:"count"`
		Items []SessionEventRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &eventList)
	if eventList.Count != 2 {
		t.Fatalf("legacy event count=%d want 2", eventList.Count)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/run-legacy-1/approvals", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET legacy approvals status=%d body=%s", rr.Code, rr.Body.String())
	}
	var approvalList struct {
		Count int                        `json:"count"`
		Items []ApprovalCheckpointRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &approvalList)
	if approvalList.Count != 1 {
		t.Fatalf("legacy approval count=%d want 1", approvalList.Count)
	}
	if approvalList.Items[0].CheckpointID != "approval-run-legacy-1" {
		t.Fatalf("checkpointId=%q want approval-run-legacy-1", approvalList.Items[0].CheckpointID)
	}
	if approvalList.Items[0].Status != ApprovalStatusPending {
		t.Fatalf("checkpoint status=%q want %q", approvalList.Items[0].Status, ApprovalStatusPending)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/run-legacy-1/timeline", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET legacy timeline status=%d body=%s", rr.Code, rr.Body.String())
	}
	var timelineResp SessionTimelineResponse
	decodeResponseBody(t, rr, &timelineResp)
	if timelineResp.Session.SessionID != "run-legacy-1" {
		t.Fatalf("legacy timeline sessionId=%q want run-legacy-1", timelineResp.Session.SessionID)
	}
	if len(timelineResp.Events) != 2 {
		t.Fatalf("legacy timeline events=%d want 2", len(timelineResp.Events))
	}
	if len(timelineResp.ApprovalCheckpoints) != 1 {
		t.Fatalf("legacy timeline approvals=%d want 1", len(timelineResp.ApprovalCheckpoints))
	}
	if timelineResp.OpenApprovalCount != 1 {
		t.Fatalf("legacy timeline openApprovalCount=%d want 1", timelineResp.OpenApprovalCount)
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/run-legacy-1/workers", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "legacy-worker-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"workerType": "managed_agent",
		"adapterId":  "codex",
	})
	if rr.Code != http.StatusConflict {
		t.Fatalf("POST legacy session worker status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/run-legacy-1/approval-checkpoints", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "legacy-approval-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"scope": "session",
	})
	if rr.Code != http.StatusConflict {
		t.Fatalf("POST legacy session approval checkpoint status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestMemoryRunStoreImplementsM16Methods(t *testing.T) {
	store := newMemoryRunStore()
	now := time.Now().UTC()
	task := &TaskRecord{
		TaskID:    "task-1",
		RequestID: "req-1",
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Title:     "title",
		Intent:    "intent",
		Status:    TaskStatusReady,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := store.UpsertTask(context.Background(), task); err != nil {
		t.Fatalf("upsert task: %v", err)
	}
	session := &SessionRecord{
		SessionID:   "session-1",
		TaskID:      task.TaskID,
		RequestID:   task.RequestID,
		TenantID:    task.TenantID,
		ProjectID:   task.ProjectID,
		SessionType: "operator_request",
		Status:      SessionStatusReady,
		CreatedAt:   now,
		StartedAt:   now,
		UpdatedAt:   now,
	}
	if err := store.UpsertSession(context.Background(), session); err != nil {
		t.Fatalf("upsert session: %v", err)
	}
	if err := store.AppendSessionEvent(context.Background(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("session.created"),
		Timestamp: now,
	}); err != nil {
		t.Fatalf("append session event: %v", err)
	}
	if err := store.UpsertApprovalCheckpoint(context.Background(), &ApprovalCheckpointRecord{
		CheckpointID: "checkpoint-1",
		SessionID:    session.SessionID,
		TenantID:     session.TenantID,
		ProjectID:    session.ProjectID,
		Status:       ApprovalStatusPending,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatalf("upsert checkpoint: %v", err)
	}

	if _, err := store.GetTask(context.Background(), task.TaskID); err != nil {
		t.Fatalf("get task: %v", err)
	}
	if _, err := store.GetSession(context.Background(), session.SessionID); err != nil {
		t.Fatalf("get session: %v", err)
	}
	if items, err := store.ListSessionEvents(context.Background(), SessionEventListQuery{SessionID: session.SessionID}); err != nil || len(items) != 1 {
		t.Fatalf("list session events items=%d err=%v", len(items), err)
	}
	if items, err := store.ListApprovalCheckpoints(context.Background(), ApprovalCheckpointListQuery{SessionID: session.SessionID}); err != nil || len(items) != 1 {
		t.Fatalf("list approval checkpoints items=%d err=%v", len(items), err)
	}
	if items, err := store.ListApprovalCheckpoints(context.Background(), ApprovalCheckpointListQuery{CheckpointID: "checkpoint-1"}); err != nil || len(items) != 1 {
		t.Fatalf("list approval checkpoints by id items=%d err=%v", len(items), err)
	}
	if err := store.UpsertSessionWorker(context.Background(), &SessionWorkerRecord{
		WorkerID:   "worker-1",
		SessionID:  session.SessionID,
		TaskID:     task.TaskID,
		TenantID:   session.TenantID,
		ProjectID:  session.ProjectID,
		WorkerType: "managed_agent",
		AdapterID:  "codex",
		Status:     WorkerStatusAttached,
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert session worker: %v", err)
	}
	if items, err := store.ListSessionWorkers(context.Background(), SessionWorkerListQuery{SessionID: session.SessionID}); err != nil || len(items) != 1 {
		t.Fatalf("list session workers items=%d err=%v", len(items), err)
	}
	if err := store.UpsertToolAction(context.Background(), &ToolActionRecord{
		ToolActionID: "tool-1",
		SessionID:    session.SessionID,
		TenantID:     session.TenantID,
		ProjectID:    session.ProjectID,
		ToolType:     "terminal_command",
		Status:       ToolActionStatusRequested,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); err != nil {
		t.Fatalf("upsert tool action: %v", err)
	}
	if items, err := store.ListToolActions(context.Background(), ToolActionListQuery{SessionID: session.SessionID}); err != nil || len(items) != 1 {
		t.Fatalf("list tool actions items=%d err=%v", len(items), err)
	}
	if err := store.UpsertEvidenceRecord(context.Background(), &EvidenceRecord{
		EvidenceID: "evidence-1",
		SessionID:  session.SessionID,
		TenantID:   session.TenantID,
		ProjectID:  session.ProjectID,
		Kind:       "tool_output",
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("upsert evidence record: %v", err)
	}
	if items, err := store.ListEvidenceRecords(context.Background(), EvidenceRecordListQuery{SessionID: session.SessionID}); err != nil || len(items) != 1 {
		t.Fatalf("list evidence records items=%d err=%v", len(items), err)
	}
}
