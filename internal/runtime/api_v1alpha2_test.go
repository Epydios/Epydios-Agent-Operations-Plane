package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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

func TestRuntimeV1Alpha2GovernedActionProposalDecisionRoutesThroughRunOrchestrator(t *testing.T) {
	store := newMemoryRunStore()
	orchestrator := &Orchestrator{
		Namespace:        "epydios-system",
		Store:            store,
		ProviderRegistry: &fakeGovernedActionProviderClient{},
	}
	server := NewAPIServer(store, orchestrator, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-governed-proposal-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"source": "desktop-ui",
		"title":  "Governed action proposal flow",
		"intent": "Validate managed-worker governed action approvals route into the real run orchestrator.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-governed-proposal-1",
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
			"requestId": "worker-governed-proposal-1",
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
			"requestId": "proposal-generated-governed-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"eventType": "tool_proposal.generated",
		"summary":   "Managed Codex suggested a governed paper-trade request.",
		"payload": map[string]interface{}{
			"proposalId":   "proposal-governed-1",
			"proposalType": governedActionProposalType,
			"workerId":     worker.WorkerID,
			"summary":      "BUY 25 AAPL in paper account paper-main",
			"payload": map[string]interface{}{
				"type":              governedActionProposalType,
				"summary":           "BUY 25 AAPL in paper account paper-main",
				"confidence":        "structured",
				"requestLabel":      "Paper Trade Request: AAPL",
				"requestSummary":    "BUY 25 AAPL in paper account paper-main",
				"demoProfile":       governedActionDemoProfileFinancePaper,
				"actionType":        "trade.execute",
				"actionClass":       "execute",
				"actionVerb":        "execute",
				"actionTarget":      "paper-broker-order",
				"resourceKind":      "broker-order",
				"resourceNamespace": "epydios-system",
				"resourceName":      "paper-order-aapl",
				"resourceId":        "paper-order-aapl",
				"boundaryClass":     "external_actuator",
				"riskTier":          "high",
				"requiredGrants":    []string{"grant.trading.supervisor"},
				"evidenceReadiness": "PARTIAL",
				"handshakeRequired": true,
				"workflowKind":      governedActionWorkflowExternalRequest,
				"financeOrder": map[string]interface{}{
					"symbol":   "AAPL",
					"side":     "buy",
					"quantity": 25,
					"account":  "paper-main",
				},
			},
		},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST generated governed proposal event status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/tool-proposals/proposal-governed-1/decision", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-decision-governed-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"decision": "APPROVE",
		"reason":   "approved for governed policy evaluation",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST governed tool proposal decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	var decisionResp ToolProposalDecisionResponse
	decodeResponseBody(t, rr, &decisionResp)
	if !decisionResp.Applied {
		t.Fatalf("expected governed tool proposal applied=true: %#v", decisionResp)
	}
	if decisionResp.ToolType != governedActionProposalType {
		t.Fatalf("toolType=%q want %q", decisionResp.ToolType, governedActionProposalType)
	}
	if decisionResp.RunID == "" {
		t.Fatalf("missing runId in governed action decision response: %#v", decisionResp)
	}
	if decisionResp.PolicyDecision != "DEFER" {
		t.Fatalf("policyDecision=%q want DEFER", decisionResp.PolicyDecision)
	}
	if decisionResp.SelectedPolicyProvider != "premium-provider-local" {
		t.Fatalf("selectedPolicyProvider=%q want premium-provider-local", decisionResp.SelectedPolicyProvider)
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
	resultPayload := parseRawJSONObject(toolActionList.Items[0].ResultPayload)
	governedRun := extractJSONObjectValue(resultPayload["governedRun"])
	if normalizedInterfaceString(governedRun["runId"]) != decisionResp.RunID {
		t.Fatalf("governed runId=%q want %q", normalizedInterfaceString(governedRun["runId"]), decisionResp.RunID)
	}
	policyResponse := extractJSONObjectValue(governedRun["policyResponse"])
	if normalizedInterfaceString(policyResponse["decision"]) != "DEFER" {
		t.Fatalf("stored governed policy decision=%q want DEFER", normalizedInterfaceString(policyResponse["decision"]))
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/runs/"+decisionResp.RunID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET governed run detail status=%d body=%s", rr.Code, rr.Body.String())
	}
	var runDetail RunRecord
	decodeResponseBody(t, rr, &runDetail)
	if runDetail.SelectedPolicyProvider != "premium-provider-local" {
		t.Fatalf("run selected policy provider=%q want premium-provider-local", runDetail.SelectedPolicyProvider)
	}
	if runDetail.PolicyDecision != "DEFER" {
		t.Fatalf("run policyDecision=%q want DEFER", runDetail.PolicyDecision)
	}
	requestPayload := parseRawJSONObject(runDetail.RequestPayload)
	requestContext := extractJSONObjectValue(requestPayload["context"])
	governedContext := extractJSONObjectValue(requestContext["governed_action"])
	if normalizedInterfaceString(governedContext["origin_surface"]) != governedActionOriginSurfaceManagedChat {
		t.Fatalf("origin_surface=%q want %q", normalizedInterfaceString(governedContext["origin_surface"]), governedActionOriginSurfaceManagedChat)
	}
}

func TestRuntimeV1Alpha2ToolProposalDecisionExecutesTeeWithStdin(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-proposal-tee-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"source": "desktop-ui",
		"title":  "Proposal stdin flow",
		"intent": "Validate stdin-backed governed file creation.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-proposal-tee-1",
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
			"requestId": "worker-proposal-tee-1",
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

	tmpDir := t.TempDir()
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers/"+worker.WorkerID+"/events", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-generated-tee-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"eventType": "tool_proposal.generated",
		"summary":   "Managed Codex suggested tee-based file creation.",
		"payload": map[string]interface{}{
			"proposalId":        "proposal-terminal-tee-1",
			"proposalType":      "terminal_command",
			"command":           "tee agentops_m21_probe.txt",
			"stdin":             "agentops-managed-worker-ok\n",
			"cwd":               tmpDir,
			"timeoutSeconds":    5,
			"readOnlyRequested": false,
			"confidence":        "structured",
		},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST generated proposal event status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/tool-proposals/proposal-terminal-tee-1/decision", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-decision-tee-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"decision": "APPROVE",
		"reason":   "approved for governed file creation",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST tool proposal decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	var decisionResp ToolProposalDecisionResponse
	decodeResponseBody(t, rr, &decisionResp)
	if decisionResp.ActionStatus != ToolActionStatusCompleted {
		t.Fatalf("tool proposal actionStatus=%q want %q", decisionResp.ActionStatus, ToolActionStatusCompleted)
	}

	content, err := os.ReadFile(filepath.Join(tmpDir, "agentops_m21_probe.txt"))
	if err != nil {
		t.Fatalf("read created file: %v", err)
	}
	if string(content) != "agentops-managed-worker-ok\n" {
		t.Fatalf("file content=%q want exact stdin-backed output", string(content))
	}
}

func TestRuntimeV1Alpha2ToolProposalDecisionNormalizesPrintfRedirect(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-proposal-printf-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"source": "desktop-ui.operator_chat",
		"title":  "Managed worker proposal redirect normalization",
		"intent": "Validate governed redirect proposals normalize into deterministic tee execution.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-proposal-printf-1",
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
			"requestId": "worker-proposal-printf-1",
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

	tmpDir := t.TempDir()
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers/"+worker.WorkerID+"/events", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-generated-printf-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"eventType": "tool_proposal.generated",
		"summary":   "Managed Codex suggested redirect-based file creation.",
		"payload": map[string]interface{}{
			"proposalId":        "proposal-terminal-printf-1",
			"proposalType":      "terminal_command",
			"command":           "printf 'agentops-managed-worker-ok\\n' > agentops_m21_probe.txt",
			"cwd":               tmpDir,
			"timeoutSeconds":    5,
			"readOnlyRequested": false,
			"confidence":        "structured",
		},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST generated proposal event status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/tool-proposals/proposal-terminal-printf-1/decision", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-decision-printf-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"decision": "APPROVE",
		"reason":   "approved for normalized redirect execution",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST tool proposal decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	var decisionResp ToolProposalDecisionResponse
	decodeResponseBody(t, rr, &decisionResp)
	if decisionResp.ActionStatus != ToolActionStatusCompleted {
		t.Fatalf("tool proposal actionStatus=%q want %q", decisionResp.ActionStatus, ToolActionStatusCompleted)
	}

	content, err := os.ReadFile(filepath.Join(tmpDir, "agentops_m21_probe.txt"))
	if err != nil {
		t.Fatalf("read created file: %v", err)
	}
	if string(content) != "agentops-managed-worker-ok\n" {
		t.Fatalf("file content=%q want exact normalized output", string(content))
	}
}

func TestRuntimeV1Alpha2ToolProposalDecisionNormalizesPythonWrite(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-proposal-python-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"source": "desktop-ui.operator_chat",
		"title":  "Managed worker proposal python normalization",
		"intent": "Validate governed python file-write proposals normalize into deterministic tee execution.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-proposal-python-1",
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
			"requestId": "worker-proposal-python-1",
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

	tmpDir := t.TempDir()
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/workers/"+worker.WorkerID+"/events", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-generated-python-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"eventType": "tool_proposal.generated",
		"summary":   "Managed Codex suggested python-based file creation.",
		"payload": map[string]interface{}{
			"proposalId":        "proposal-terminal-python-1",
			"proposalType":      "terminal_command",
			"command":           "python3 -c \"open('agentops_m21_probe.txt','w').write('agentops-managed-worker-ok\\n')\"",
			"cwd":               tmpDir,
			"timeoutSeconds":    5,
			"readOnlyRequested": false,
			"confidence":        "structured",
		},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST generated proposal event status=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/tool-proposals/proposal-terminal-python-1/decision", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "proposal-decision-python-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"decision": "APPROVE",
		"reason":   "approved for normalized python-write execution",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST tool proposal decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	var decisionResp ToolProposalDecisionResponse
	decodeResponseBody(t, rr, &decisionResp)
	if decisionResp.ActionStatus != ToolActionStatusCompleted {
		t.Fatalf("tool proposal actionStatus=%q want %q", decisionResp.ActionStatus, ToolActionStatusCompleted)
	}

	content, err := os.ReadFile(filepath.Join(tmpDir, "agentops_m21_probe.txt"))
	if err != nil {
		t.Fatalf("read created file: %v", err)
	}
	if string(content) != "agentops-managed-worker-ok\n" {
		t.Fatalf("file content=%q want exact normalized output", string(content))
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

func TestRuntimeV1Alpha2OrgAdminApprovalPersistsDecisionBindings(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-request-org-admin-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"source": "desktop-ui",
		"title":  "Review delegated admin scope change",
		"intent": "Exercise org-admin approval binding persistence.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-request-org-admin-1",
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

	reqCtx := withRuntimeIdentity(context.Background(), &RuntimeIdentity{
		Subject:    "user://tenant-admin",
		TenantIDs:  []string{"tenant-a"},
		ProjectIDs: []string{"project-a"},
		Roles:      []string{"enterprise.tenant_admin"},
	})
	rr = requestJSONWithContext(t, handler, reqCtx, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/approval-checkpoints", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "approval-request-org-admin-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
			"actor": map[string]interface{}{
				"id": "tenant-admin",
			},
		},
		"reason": "Delegated admin scope review is required before rollout.",
		"annotations": map[string]interface{}{
			"orgAdminDecisionBinding": map[string]interface{}{
				"profileId":             "centralized_enterprise_admin",
				"bindingId":             "centralized_enterprise_admin_delegated_admin_binding",
				"roleBundle":            "enterprise.tenant_admin",
				"directorySyncMappings": []string{"centralized_enterprise_admin_directory_sync_mapping"},
				"inputValues": map[string]interface{}{
					"idp_group":     "grp-agentops-tenant-admins",
					"tenant_id":     "tenant-a",
					"project_id":    "project-a",
					"business_unit": "platform",
					"cost_center":   "CC-20410",
					"environment":   "prod",
					"region":        "us-east",
				},
			},
		},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST org-admin approval checkpoint status=%d body=%s", rr.Code, rr.Body.String())
	}
	var checkpoint ApprovalCheckpointRecord
	decodeResponseBody(t, rr, &checkpoint)
	if checkpoint.Scope != "org_admin_binding" {
		t.Fatalf("checkpoint scope=%q want org_admin_binding", checkpoint.Scope)
	}
	if !containsExactString(checkpoint.RequestedCapabilities, "policy_pack_assignment") {
		t.Fatalf("requested capabilities=%v", checkpoint.RequestedCapabilities)
	}
	if !containsExactString(checkpoint.RequiredVerifierIDs, "runtime_authz") {
		t.Fatalf("required verifier ids=%v", checkpoint.RequiredVerifierIDs)
	}
	var annotationObject map[string]interface{}
	if err := json.Unmarshal(checkpoint.Annotations, &annotationObject); err != nil {
		t.Fatalf("unmarshal checkpoint annotations: %v", err)
	}
	binding := annotationObject["orgAdminDecisionBinding"]
	bindingObject, ok := binding.(map[string]interface{})
	if !ok {
		t.Fatalf("expected org-admin annotation on checkpoint: %s", string(checkpoint.Annotations))
	}
	if got := normalizeStringOrDefault(normalizeInterfaceString(bindingObject["selectedRoleBundle"], ""), ""); got != "enterprise.tenant_admin" {
		t.Fatalf("selected role bundle=%q want enterprise.tenant_admin", got)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/evidence", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET evidence status=%d body=%s", rr.Code, rr.Body.String())
	}
	var evidenceList struct {
		Count int              `json:"count"`
		Items []EvidenceRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &evidenceList)
	foundRequestEvidence := false
	foundCategoryRequestEvidence := false
	for _, item := range evidenceList.Items {
		if item.Kind == "org_admin_binding_request" {
			foundRequestEvidence = true
		}
		if item.Kind == "org_admin_delegated_admin_request" {
			foundCategoryRequestEvidence = true
		}
	}
	if !foundRequestEvidence {
		t.Fatalf("expected org_admin_binding_request evidence: %+v", evidenceList.Items)
	}
	if !foundCategoryRequestEvidence {
		t.Fatalf("expected org_admin_delegated_admin_request evidence: %+v", evidenceList.Items)
	}

	rr = requestJSONWithContext(t, handler, reqCtx, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/approval-checkpoints/"+checkpoint.CheckpointID+"/decision", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "approval-decision-org-admin-1",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
			"actor": map[string]interface{}{
				"id": "tenant-admin",
			},
		},
		"decision": "APPROVE",
		"reason":   "Approved delegated admin scope change for rollout.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST org-admin approval decision status=%d body=%s", rr.Code, rr.Body.String())
	}

	auditItems := ListRuntimeAuditEvents(RuntimeAuditQuery{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Event:     "org_admin.binding",
		Limit:     10,
	})
	foundAuditRequest := false
	foundAuditDecision := false
	for _, item := range auditItems {
		eventName := normalizeStringOrDefault(normalizeInterfaceString(item["event"], ""), "")
		bindingObject, ok := item["orgAdminDecisionBinding"].(map[string]interface{})
		if !ok {
			continue
		}
		if eventName == "runtime.org_admin.binding.requested" {
			foundAuditRequest = true
			if got := normalizeStringOrDefault(normalizeInterfaceString(bindingObject["bindingId"], ""), ""); got != "centralized_enterprise_admin_delegated_admin_binding" {
				t.Fatalf("audit request bindingId=%q", got)
			}
		}
		if eventName == "runtime.org_admin.binding.decision" {
			foundAuditDecision = true
			if got := normalizeStringOrDefault(normalizeInterfaceString(item["decision"], ""), ""); got != "APPROVE" {
				t.Fatalf("audit decision=%q", got)
			}
		}
	}
	if !foundAuditRequest || !foundAuditDecision {
		t.Fatalf("org-admin audit events missing request=%v decision=%v items=%+v", foundAuditRequest, foundAuditDecision, auditItems)
	}
	categoryAuditItems := ListRuntimeAuditEvents(RuntimeAuditQuery{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Event:     "org_admin.delegated_admin",
		Limit:     10,
	})
	foundCategoryAuditRequest := false
	foundCategoryAuditDecision := false
	for _, item := range categoryAuditItems {
		eventName := normalizeStringOrDefault(normalizeInterfaceString(item["event"], ""), "")
		if eventName == "runtime.org_admin.delegated_admin.requested" {
			foundCategoryAuditRequest = true
		}
		if eventName == "runtime.org_admin.delegated_admin.decision" {
			foundCategoryAuditDecision = true
		}
	}
	if !foundCategoryAuditRequest || !foundCategoryAuditDecision {
		t.Fatalf("category org-admin audit events missing request=%v decision=%v items=%+v", foundCategoryAuditRequest, foundCategoryAuditDecision, categoryAuditItems)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/events", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET events status=%d body=%s", rr.Code, rr.Body.String())
	}
	var eventList struct {
		Count int                  `json:"count"`
		Items []SessionEventRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &eventList)
	foundRequestEvent := false
	foundDecisionEvent := false
	foundCategoryRequestEvent := false
	foundCategoryDecisionEvent := false
	for _, item := range eventList.Items {
		if item.EventType == SessionEventType("org_admin.binding.requested") {
			foundRequestEvent = true
		}
		if item.EventType == SessionEventType("org_admin.binding.decision.applied") {
			foundDecisionEvent = true
		}
		if item.EventType == SessionEventType("org_admin.delegated_admin.requested") {
			foundCategoryRequestEvent = true
		}
		if item.EventType == SessionEventType("org_admin.delegated_admin.decision.applied") {
			foundCategoryDecisionEvent = true
		}
	}
	if !foundRequestEvent || !foundDecisionEvent || !foundCategoryRequestEvent || !foundCategoryDecisionEvent {
		t.Fatalf(
			"org-admin events missing bindingRequest=%v bindingDecision=%v categoryRequest=%v categoryDecision=%v items=%+v",
			foundRequestEvent,
			foundDecisionEvent,
			foundCategoryRequestEvent,
			foundCategoryDecisionEvent,
			eventList.Items,
		)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/evidence", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET evidence after decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	decodeResponseBody(t, rr, &evidenceList)
	foundDecisionEvidence := false
	foundCategoryDecisionEvidence := false
	for _, item := range evidenceList.Items {
		if item.Kind == "org_admin_binding_decision" {
			foundDecisionEvidence = true
		}
		if item.Kind == "org_admin_delegated_admin_decision" {
			foundCategoryDecisionEvidence = true
		}
	}
	if !foundDecisionEvidence {
		t.Fatalf("expected org_admin_binding_decision evidence: %+v", evidenceList.Items)
	}
	if !foundCategoryDecisionEvidence {
		t.Fatalf("expected org_admin_delegated_admin_decision evidence: %+v", evidenceList.Items)
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

func TestRuntimeV1Alpha2OrgAdminCategoryBindingsPersistSelectionsAndInputs(t *testing.T) {
	cases := []struct {
		name              string
		role              string
		roleBundle        string
		bindingID         string
		wantCategory      string
		dirMappings       []string
		exceptionProfiles []string
		overlayProfiles   []string
		inputValues       map[string]interface{}
		wantInputKey      string
	}{
		{
			name:         "break glass",
			role:         "enterprise.break_glass_admin",
			roleBundle:   "enterprise.break_glass_admin",
			bindingID:    "centralized_enterprise_admin_break_glass_binding",
			wantCategory: "break_glass",
			inputValues: map[string]interface{}{
				"break_glass_ticket": "BG-1001",
				"break_glass_reason": "prod outage mitigation",
				"break_glass_expiry": time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339),
			},
			wantInputKey: "break_glass_expiry",
		},
		{
			name:         "directory sync",
			role:         "enterprise.org_admin",
			roleBundle:   "enterprise.org_admin",
			bindingID:    "centralized_enterprise_admin_directory_sync_binding",
			wantCategory: "directory_sync",
			dirMappings:  []string{"centralized_enterprise_admin_directory_sync_mapping"},
			inputValues: map[string]interface{}{
				"idp_group":   "grp-agentops-org-admins",
				"tenant_id":   "tenant-a",
				"cost_center": "CC-20410",
				"environment": "prod",
			},
			wantInputKey: "idp_group",
		},
		{
			name:              "residency",
			role:              "enterprise.org_admin",
			roleBundle:        "enterprise.org_admin",
			bindingID:         "centralized_enterprise_admin_residency_exception_binding",
			wantCategory:      "residency",
			exceptionProfiles: []string{"centralized_enterprise_admin_residency_exception"},
			inputValues: map[string]interface{}{
				"region":                     "us-east",
				"jurisdiction":               "us",
				"residency_exception_ticket": "RES-1001",
			},
			wantInputKey: "residency_exception_ticket",
		},
		{
			name:              "legal hold",
			role:              "enterprise.org_admin",
			roleBundle:        "enterprise.org_admin",
			bindingID:         "centralized_enterprise_admin_legal_hold_exception_binding",
			wantCategory:      "legal_hold",
			exceptionProfiles: []string{"centralized_enterprise_admin_legal_hold_exception"},
			inputValues: map[string]interface{}{
				"legal_hold_case_id": "CASE-1001",
				"legal_hold_reason":  "security incident evidence preservation",
				"legal_hold_expiry":  time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339),
			},
			wantInputKey: "legal_hold_case_id",
		},
		{
			name:            "quota",
			role:            "enterprise.org_admin",
			roleBundle:      "enterprise.org_admin",
			bindingID:       "centralized_enterprise_admin_quota_overlay_binding",
			wantCategory:    "quota",
			overlayProfiles: []string{"centralized_enterprise_admin_quota_overlay"},
			inputValues: map[string]interface{}{
				"organization":   "epydios",
				"tenant":         "tenant-a",
				"project":        "project-a",
				"worker_adapter": "codex",
				"provider":       "agentops_gateway",
				"model":          "gpt-5-codex",
				"tenant_id":      "tenant-a",
				"project_id":     "project-a",
				"environment":    "prod",
				"cost_center":    "CC-20410",
			},
			wantInputKey: "project_id",
		},
		{
			name:            "chargeback",
			role:            "enterprise.org_admin",
			roleBundle:      "enterprise.org_admin",
			bindingID:       "centralized_enterprise_admin_chargeback_overlay_binding",
			wantCategory:    "chargeback",
			overlayProfiles: []string{"centralized_enterprise_admin_chargeback_overlay"},
			inputValues: map[string]interface{}{
				"tenant":        "tenant-a",
				"project":       "project-a",
				"cost_center":   "CC-20410",
				"business_unit": "platform",
				"project_id":    "project-a",
				"environment":   "prod",
			},
			wantInputKey: "business_unit",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newMemoryRunStore()
			server := NewAPIServer(store, nil, nil)
			handler := server.Routes()
			session := createV1Alpha2SessionForTest(t, handler, "tenant-a", "project-a")
			reqCtx := withRuntimeIdentity(context.Background(), &RuntimeIdentity{
				Subject:    "user://org-admin",
				TenantIDs:  []string{"tenant-a"},
				ProjectIDs: []string{"project-a"},
				Roles:      []string{tc.role},
			})

			rr := requestJSONWithContext(t, handler, reqCtx, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/approval-checkpoints", map[string]interface{}{
				"meta": map[string]interface{}{
					"requestId": "approval-request-" + strings.ReplaceAll(tc.name, " ", "-"),
					"tenantId":  "tenant-a",
					"projectId": "project-a",
					"actor": map[string]interface{}{
						"id": "org-admin",
					},
				},
				"reason": "Org-admin review required for " + tc.name,
				"annotations": map[string]interface{}{
					"orgAdminDecisionBinding": map[string]interface{}{
						"profileId":             "centralized_enterprise_admin",
						"bindingId":             tc.bindingID,
						"roleBundle":            tc.roleBundle,
						"directorySyncMappings": tc.dirMappings,
						"exceptionProfiles":     tc.exceptionProfiles,
						"overlayProfiles":       tc.overlayProfiles,
						"inputValues":           tc.inputValues,
					},
				},
			})
			if rr.Code != http.StatusCreated {
				t.Fatalf("POST org-admin approval checkpoint status=%d body=%s", rr.Code, rr.Body.String())
			}

			var checkpoint ApprovalCheckpointRecord
			decodeResponseBody(t, rr, &checkpoint)
			var annotationObject map[string]interface{}
			if err := json.Unmarshal(checkpoint.Annotations, &annotationObject); err != nil {
				t.Fatalf("unmarshal checkpoint annotations: %v", err)
			}
			bindingObject, ok := annotationObject["orgAdminDecisionBinding"].(map[string]interface{})
			if !ok {
				t.Fatalf("expected org-admin annotation on checkpoint: %s", string(checkpoint.Annotations))
			}
			if got := normalizeStringOrDefault(normalizeInterfaceString(bindingObject["category"], ""), ""); got != tc.wantCategory {
				t.Fatalf("binding category=%q want %q", got, tc.wantCategory)
			}
			inputValues, ok := bindingObject["inputValues"].(map[string]interface{})
			if !ok {
				t.Fatalf("expected inputValues in binding annotation: %+v", bindingObject)
			}
			if got := normalizeStringOrDefault(normalizeInterfaceString(inputValues[tc.wantInputKey], ""), ""); got == "" {
				t.Fatalf("binding inputValues missing %q: %+v", tc.wantInputKey, inputValues)
			}

			rr = requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/evidence", nil)
			if rr.Code != http.StatusOK {
				t.Fatalf("GET evidence status=%d body=%s", rr.Code, rr.Body.String())
			}
			var evidenceList struct {
				Count int              `json:"count"`
				Items []EvidenceRecord `json:"items"`
			}
			decodeResponseBody(t, rr, &evidenceList)
			foundRequestEvidence := false
			foundCategoryRequestEvidence := false
			for _, item := range evidenceList.Items {
				if item.Kind != "org_admin_binding_request" || item.CheckpointID != checkpoint.CheckpointID {
				} else {
					var metadata map[string]interface{}
					if err := json.Unmarshal(item.Metadata, &metadata); err != nil {
						t.Fatalf("unmarshal evidence metadata: %v", err)
					}
					inputValues, ok := metadata["inputValues"].(map[string]interface{})
					if !ok {
						t.Fatalf("expected inputValues in evidence metadata: %+v", metadata)
					}
					if got := normalizeStringOrDefault(normalizeInterfaceString(inputValues[tc.wantInputKey], ""), ""); got == "" {
						t.Fatalf("evidence inputValues missing %q: %+v", tc.wantInputKey, inputValues)
					}
					foundRequestEvidence = true
				}
				if item.Kind == orgAdminCategoryRequestEvidenceKind(tc.wantCategory) && item.CheckpointID == checkpoint.CheckpointID {
					foundCategoryRequestEvidence = true
				}
			}
			if !foundRequestEvidence {
				t.Fatalf("expected org_admin_binding_request evidence for checkpoint %s: %+v", checkpoint.CheckpointID, evidenceList.Items)
			}
			if !foundCategoryRequestEvidence {
				t.Fatalf("expected %s evidence for checkpoint %s: %+v", orgAdminCategoryRequestEvidenceKind(tc.wantCategory), checkpoint.CheckpointID, evidenceList.Items)
			}
		})
	}
}

func orgAdminCategoryRequestEvidenceKind(category string) string {
	switch category {
	case "delegated_admin":
		return "org_admin_delegated_admin_request"
	case "break_glass":
		return "org_admin_break_glass_request"
	case "directory_sync":
		return "org_admin_directory_sync_request"
	case "residency":
		return "org_admin_residency_exception_request"
	case "legal_hold":
		return "org_admin_legal_hold_exception_request"
	case "quota":
		return "org_admin_quota_overlay_request"
	case "chargeback":
		return "org_admin_chargeback_overlay_request"
	default:
		return ""
	}
}

func TestRuntimeV1Alpha2OrgAdminQuotaBindingRequiresOverlaySelection(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()
	session := createV1Alpha2SessionForTest(t, handler, "tenant-a", "project-a")

	reqCtx := withRuntimeIdentity(context.Background(), &RuntimeIdentity{
		Subject:    "user://org-admin",
		TenantIDs:  []string{"tenant-a"},
		ProjectIDs: []string{"project-a"},
		Roles:      []string{"enterprise.org_admin"},
	})
	rr := requestJSONWithContext(t, handler, reqCtx, http.MethodPost, "/v1alpha2/runtime/sessions/"+session.SessionID+"/approval-checkpoints", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "approval-request-org-admin-quota-missing-overlay",
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"annotations": map[string]interface{}{
			"orgAdminDecisionBinding": map[string]interface{}{
				"profileId":  "centralized_enterprise_admin",
				"bindingId":  "centralized_enterprise_admin_quota_overlay_binding",
				"roleBundle": "enterprise.org_admin",
				"inputValues": map[string]interface{}{
					"organization":   "epydios",
					"tenant":         "tenant-a",
					"project":        "project-a",
					"worker_adapter": "codex",
					"provider":       "agentops_gateway",
					"model":          "gpt-5-codex",
					"tenant_id":      "tenant-a",
					"project_id":     "project-a",
					"environment":    "prod",
					"cost_center":    "CC-20410",
				},
			},
		},
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected bad request for missing overlay selection status=%d body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "requires at least one selected overlay profile") {
		t.Fatalf("expected overlay selection error body=%s", rr.Body.String())
	}
}

func createV1Alpha2SessionForTest(t *testing.T, handler http.Handler, tenantID, projectID string) SessionRecord {
	t.Helper()
	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "task-request-test-" + tenantID + "-" + projectID,
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"source": "test-suite",
		"title":  "Test task",
		"intent": "Create a governed test task.",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST task status=%d body=%s", rr.Code, rr.Body.String())
	}
	var task TaskRecord
	decodeResponseBody(t, rr, &task)
	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/tasks/"+task.TaskID+"/sessions", map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": "session-request-test-" + tenantID + "-" + projectID,
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"sessionType": "operator_request",
		"source":      "test-suite",
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("POST session status=%d body=%s", rr.Code, rr.Body.String())
	}
	var session SessionRecord
	decodeResponseBody(t, rr, &session)
	return session
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

type fakeGovernedActionProviderClient struct{}

func fakeGovernedActionRequestMap(input interface{}) map[string]interface{} {
	var payload map[string]interface{}
	if err := assignRuntimeTestJSON(&payload, input); err != nil {
		return map[string]interface{}{}
	}
	return payload
}

func fakeGovernedActionPolicyDecision(input interface{}) (string, string, map[string]interface{}) {
	payload := fakeGovernedActionRequestMap(input)
	meta := extractJSONObjectValue(payload["meta"])
	subject := extractJSONObjectValue(payload["subject"])
	subjectAttributes := extractJSONObjectValue(subject["attributes"])
	action := extractJSONObjectValue(payload["action"])
	context := extractJSONObjectValue(payload["context"])
	policy := extractJSONObjectValue(context["review_signals"])
	requiredGrants := normalizeGovernedActionStringSlice(policy["required_reviews"])
	evidenceReadiness := strings.ToUpper(strings.TrimSpace(normalizedInterfaceString(policy["readiness_state"])))
	environment := strings.ToLower(strings.TrimSpace(normalizedInterfaceString(meta["environment"])))
	actionVerb := strings.ToLower(strings.TrimSpace(normalizedInterfaceString(action["verb"])))
	approvedForProd := normalizedInterfaceBool(subjectAttributes["approvedForProd"])

	providerPolicy := map[string]interface{}{
		"boundary_class": normalizedInterfaceString(policy["boundary_class"]),
		"review_tier":      normalizedInterfaceString(policy["review_tier"]),
		"required_reviews": requiredGrants,
		"readiness_state":  normalizedInterfaceString(policy["readiness_state"]),
	}

	switch {
	case actionVerb == "delete" || (environment == "prod" && !approvedForProd):
		return "DENY", "Production-destructive governed action is blocked without approvedForProd=true.", providerPolicy
	case len(requiredGrants) > 0 || evidenceReadiness != "" && evidenceReadiness != "READY":
		return "DEFER", "Supervisor trading grant is still required before execution.", providerPolicy
	default:
		return "ALLOW", "Governed request passed local premium-provider policy evaluation.", providerPolicy
	}
}

func (c *fakeGovernedActionProviderClient) SelectProvider(_ context.Context, _ string, providerType, requiredCapability, targetOS string, minPriority int64) (*ProviderTarget, error) {
	switch providerType {
	case "ProfileResolver":
		return &ProviderTarget{
			Name:         "mock-profile-resolver",
			ProviderID:   "mock-profile-resolver",
			ProviderType: "ProfileResolver",
			Priority:     maxInt64(minPriority, 100),
		}, nil
	case "PolicyProvider":
		return &ProviderTarget{
			Name:         "premium-provider-local",
			ProviderID:   "premium-provider-local",
			ProviderType: "PolicyProvider",
			Priority:     maxInt64(minPriority, 100),
		}, nil
	case "EvidenceProvider":
		return &ProviderTarget{
			Name:         "mock-evidence-provider",
			ProviderID:   "mock-evidence-provider",
			ProviderType: "EvidenceProvider",
			Priority:     maxInt64(minPriority, 100),
		}, nil
	default:
		return nil, fmt.Errorf("no provider found (type=%s capability=%s targetOS=%s minPriority=%d)", providerType, requiredCapability, targetOS, minPriority)
	}
}

func (c *fakeGovernedActionProviderClient) PostJSON(_ context.Context, target *ProviderTarget, path string, input interface{}, out interface{}) error {
	switch target.ProviderType {
	case "ProfileResolver":
		if path != "/v1alpha1/profile-resolver/resolve" {
			return fmt.Errorf("unexpected profile path %q", path)
		}
		return assignRuntimeTestJSON(out, map[string]interface{}{
			"profileId":      "finance-paper-trade",
			"profileVersion": "v1",
			"source":         "fake-governed-action-test",
		})
	case "PolicyProvider":
		if path != "/v1alpha1/policy-provider/evaluate" {
			return fmt.Errorf("unexpected policy path %q", path)
		}
		decision, message, providerPolicy := fakeGovernedActionPolicyDecision(input)
		output := map[string]interface{}{
			"premiumProvider": map[string]interface{}{
				"providerId": "premium-provider-local",
				"providerMeta": map[string]interface{}{
					"baak_engaged":   true,
					"decision_path":  map[string]string{"ALLOW": "finance_governed_allow", "DEFER": "finance_governed_defer", "DENY": "finance_governed_deny"}[decision],
					"review_signals": providerPolicy,
				},
				"evidence": map[string]interface{}{
					"evidence_hash": "sha256:governed-action-test",
				},
			},
		}
		if decision == "ALLOW" {
			output["premiumProviderGrantToken"] = "premium-provider-grant-test"
		}
		return assignRuntimeTestJSON(out, map[string]interface{}{
			"decision": decision,
			"source":   "premium-provider-local",
			"policyBundle": map[string]interface{}{
				"policyId":      "PREMIUM_FINANCE_DEMO",
				"policyVersion": "v1",
			},
			"reasons": []map[string]interface{}{
				{
					"code":    map[string]string{"ALLOW": "policy_allow", "DEFER": "grant_required", "DENY": "policy_blocked"}[decision],
					"message": message,
				},
			},
			"evidenceRefs":      []string{"evidence://mock-governed-1"},
			"grantTokenPresent": decision == "ALLOW",
			"output":            output,
		})
	case "EvidenceProvider":
		switch path {
		case "/v1alpha1/evidence-provider/record":
			return assignRuntimeTestJSON(out, map[string]interface{}{
				"evidenceId": "evidence-governed-action-test",
				"checksum":   "sha256:governed-action-test",
				"storageUri": "memory://governed-action-test/evidence-governed-action-test",
			})
		case "/v1alpha1/evidence-provider/finalize-bundle":
			return assignRuntimeTestJSON(out, map[string]interface{}{
				"bundleId":         "bundle-governed-action-test",
				"manifestUri":      "memory://governed-action-test/bundle-governed-action-test",
				"manifestChecksum": "sha256:governed-action-test",
				"itemCount":        1,
			})
		default:
			return fmt.Errorf("unexpected evidence path %q", path)
		}
	default:
		return fmt.Errorf("unexpected provider type %q", target.ProviderType)
	}
}

func assignRuntimeTestJSON(out interface{}, value interface{}) error {
	encoded, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, out)
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
