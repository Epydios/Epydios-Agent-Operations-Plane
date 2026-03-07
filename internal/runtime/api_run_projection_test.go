package runtime

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestRuntimeRunViewsProjectM16SessionState(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	createdAt := time.Date(2026, 3, 7, 4, 30, 0, 0, time.UTC)
	completedAt := createdAt.Add(2 * time.Minute)

	task := &TaskRecord{
		TaskID:      "task-projected-1",
		RequestID:   "req-projected-1",
		TenantID:    "tenant-a",
		ProjectID:   "project-a",
		Title:       "Investigate policy drift",
		Intent:      "Project this session into the legacy run surfaces.",
		Status:      TaskStatusCompleted,
		CreatedAt:   createdAt,
		UpdatedAt:   completedAt,
		Annotations: mustMarshalJSON(map[string]interface{}{"source": "test"}),
	}
	if err := store.UpsertTask(context.Background(), task); err != nil {
		t.Fatalf("upsert task: %v", err)
	}

	session := &SessionRecord{
		SessionID:        "session-projected-1",
		TaskID:           task.TaskID,
		RequestID:        task.RequestID,
		TenantID:         task.TenantID,
		ProjectID:        task.ProjectID,
		SessionType:      "model_invoke",
		Status:           SessionStatusCompleted,
		Source:           "v1alpha1.runtime.integrations.invoke",
		SelectedWorkerID: "worker-projected-1",
		Summary:          mustMarshalJSON(map[string]interface{}{"agentProfileId": "codex"}),
		Annotations:      mustMarshalJSON(map[string]interface{}{"note": "projection-test"}),
		CreatedAt:        createdAt,
		StartedAt:        createdAt,
		UpdatedAt:        completedAt,
		CompletedAt:      &completedAt,
	}
	if err := store.UpsertSession(context.Background(), session); err != nil {
		t.Fatalf("upsert session: %v", err)
	}

	worker := &SessionWorkerRecord{
		WorkerID:          "worker-projected-1",
		SessionID:         session.SessionID,
		TaskID:            task.TaskID,
		TenantID:          task.TenantID,
		ProjectID:         task.ProjectID,
		WorkerType:        "managed_agent",
		AdapterID:         "codex",
		Status:            WorkerStatusCompleted,
		Provider:          "openai_compatible",
		Transport:         "responses_api",
		Model:             "gpt-5-codex",
		TargetEnvironment: "local-desktop",
		Capabilities:      []string{"plan", "code", "terminal"},
		CreatedAt:         createdAt,
		UpdatedAt:         completedAt,
	}
	if err := store.UpsertSessionWorker(context.Background(), worker); err != nil {
		t.Fatalf("upsert session worker: %v", err)
	}

	checkpoint := &ApprovalCheckpointRecord{
		CheckpointID:           "checkpoint-projected-1",
		SessionID:              session.SessionID,
		RequestID:              task.RequestID,
		TenantID:               task.TenantID,
		ProjectID:              task.ProjectID,
		Scope:                  "session",
		Tier:                   3,
		TargetOS:               "linux",
		TargetExecutionProfile: "sandbox_vm_autonomous",
		RequestedCapabilities:  []string{"network.read"},
		RequiredVerifierIDs:    []string{"verify-policy"},
		Status:                 ApprovalStatusApproved,
		Reason:                 "approved in projected-session test",
		CreatedAt:              createdAt,
		ReviewedAt:             &completedAt,
		UpdatedAt:              completedAt,
	}
	if err := store.UpsertApprovalCheckpoint(context.Background(), checkpoint); err != nil {
		t.Fatalf("upsert approval checkpoint: %v", err)
	}

	if err := store.AppendSessionEvent(context.Background(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("tool_action.completed"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"toolType":       "model_invoke",
			"provider":       "openai_compatible",
			"transport":      "responses_api",
			"model":          "gpt-5-codex",
			"finishReason":   "stop",
			"requestId":      task.RequestID,
			"agentProfileId": "codex",
		}),
		Timestamp: completedAt,
	}); err != nil {
		t.Fatalf("append session event: %v", err)
	}
	if err := store.UpsertToolAction(context.Background(), &ToolActionRecord{
		ToolActionID: "tool-projected-1",
		SessionID:    session.SessionID,
		WorkerID:     worker.WorkerID,
		TenantID:     session.TenantID,
		ProjectID:    session.ProjectID,
		ToolType:     "model_invoke",
		Status:       ToolActionStatusCompleted,
		RequestPayload: mustMarshalJSON(map[string]interface{}{
			"requestId": task.RequestID,
		}),
		ResultPayload: mustMarshalJSON(map[string]interface{}{
			"provider": "openai_compatible",
			"model":    "gpt-5-codex",
		}),
		CreatedAt: completedAt,
		UpdatedAt: completedAt,
	}); err != nil {
		t.Fatalf("upsert tool action: %v", err)
	}
	if err := store.UpsertEvidenceRecord(context.Background(), &EvidenceRecord{
		EvidenceID:   "evidence-projected-1",
		SessionID:    session.SessionID,
		ToolActionID: "tool-projected-1",
		TenantID:     session.TenantID,
		ProjectID:    session.ProjectID,
		Kind:         "tool_output",
		Checksum:     "sha256:projection",
		Metadata: mustMarshalJSON(map[string]interface{}{
			"status": "recorded",
		}),
		CreatedAt: completedAt,
		UpdatedAt: completedAt,
	}); err != nil {
		t.Fatalf("upsert evidence: %v", err)
	}

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/runs?tenantId=tenant-a&projectId=project-a", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET runs status=%d body=%s", rr.Code, rr.Body.String())
	}
	var listResp struct {
		Count int          `json:"count"`
		Items []RunSummary `json:"items"`
	}
	decodeResponseBody(t, rr, &listResp)
	if listResp.Count != 1 {
		t.Fatalf("run count=%d want 1", listResp.Count)
	}
	if listResp.Items[0].RunID != session.SessionID {
		t.Fatalf("runId=%q want %q", listResp.Items[0].RunID, session.SessionID)
	}
	if listResp.Items[0].SelectedProfileProvider != "openai_compatible" {
		t.Fatalf("selectedProfileProvider=%q want openai_compatible", listResp.Items[0].SelectedProfileProvider)
	}
	if listResp.Items[0].PolicyDecision != "ALLOW" {
		t.Fatalf("policyDecision=%q want ALLOW", listResp.Items[0].PolicyDecision)
	}
	if listResp.Items[0].Status != RunStatusCompleted {
		t.Fatalf("status=%q want %q", listResp.Items[0].Status, RunStatusCompleted)
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/runs/"+session.SessionID, nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET run detail status=%d body=%s", rr.Code, rr.Body.String())
	}
	var detail RunRecord
	decodeResponseBody(t, rr, &detail)
	if detail.RunID != session.SessionID {
		t.Fatalf("detail runId=%q want %q", detail.RunID, session.SessionID)
	}
	if detail.SelectedProfileProvider != "openai_compatible" {
		t.Fatalf("detail selectedProfileProvider=%q want openai_compatible", detail.SelectedProfileProvider)
	}
	if detail.PolicyGrantTokenPresent != true {
		t.Fatalf("detail policyGrantTokenPresent=%v want true", detail.PolicyGrantTokenPresent)
	}
	var requestPayload map[string]interface{}
	if err := json.Unmarshal(detail.RequestPayload, &requestPayload); err != nil {
		t.Fatalf("unmarshal request payload: %v", err)
	}
	sessionPayload, ok := requestPayload["session"].(map[string]interface{})
	if !ok {
		t.Fatalf("request payload missing session object: %s", string(detail.RequestPayload))
	}
	if sessionPayload["selectedWorkerId"] != "worker-projected-1" {
		t.Fatalf("selectedWorkerId=%v want worker-projected-1", sessionPayload["selectedWorkerId"])
	}
	if _, ok := requestPayload["toolActions"].([]interface{}); !ok {
		t.Fatalf("request payload missing toolActions: %s", string(detail.RequestPayload))
	}
	if !strings.Contains(string(detail.EvidenceRecordResponse), "\"tool_output\"") {
		t.Fatalf("evidence record response missing tool_output: %s", string(detail.EvidenceRecordResponse))
	}
	if !strings.Contains(string(detail.EvidenceBundleResponse), "\"tool_action.completed\"") {
		t.Fatalf("evidence bundle missing session event: %s", string(detail.EvidenceBundleResponse))
	}
	if !strings.Contains(string(detail.EvidenceBundleResponse), "\"evidence-projected-1\"") {
		t.Fatalf("evidence bundle missing projected evidence record: %s", string(detail.EvidenceBundleResponse))
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/runs/export?format=jsonl&tenantId=tenant-a&projectId=project-a", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET run export status=%d body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"runId\":\"session-projected-1\"") {
		t.Fatalf("export missing projected run: %s", rr.Body.String())
	}
}
