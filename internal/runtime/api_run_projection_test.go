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

func TestRuntimeRunExportRedactsSecretLikeFields(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	createdAt := time.Date(2026, 3, 7, 6, 15, 0, 0, time.UTC)
	completedAt := createdAt.Add(time.Minute)

	task := &TaskRecord{
		TaskID:      "task-export-redact-1",
		RequestID:   "sk-1234567890abcdefghijklmnop",
		TenantID:    "tenant-redact",
		ProjectID:   "project-redact",
		Title:       "Redaction export test",
		Status:      TaskStatusCompleted,
		CreatedAt:   createdAt,
		UpdatedAt:   completedAt,
		Annotations: mustMarshalJSON(map[string]interface{}{"source": "test"}),
	}
	if err := store.UpsertTask(context.Background(), task); err != nil {
		t.Fatalf("upsert task: %v", err)
	}
	session := &SessionRecord{
		SessionID:        "session-export-redact-1",
		TaskID:           task.TaskID,
		RequestID:        task.RequestID,
		TenantID:         task.TenantID,
		ProjectID:        task.ProjectID,
		SessionType:      "model_invoke",
		Status:           SessionStatusCompleted,
		Source:           "v1alpha1.runtime.integrations.invoke",
		SelectedWorkerID: "worker-export-redact-1",
		Summary:          mustMarshalJSON(map[string]interface{}{"agentProfileId": "openai"}),
		CreatedAt:        createdAt,
		StartedAt:        createdAt,
		UpdatedAt:        completedAt,
		CompletedAt:      &completedAt,
	}
	if err := store.UpsertSession(context.Background(), session); err != nil {
		t.Fatalf("upsert session: %v", err)
	}

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/runs/export?format=jsonl&tenantId=tenant-redact&projectId=project-redact", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET run export status=%d body=%s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "sk-1234567890abcdefghijklmnop") {
		t.Fatalf("jsonl export leaked secret-like request id: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "[REDACTED]") {
		t.Fatalf("jsonl export missing redaction marker: %s", rr.Body.String())
	}
	if rr.Header().Get("X-AgentOps-Export-Redactions") == "" {
		t.Fatalf("expected redaction header on jsonl export")
	}

	rr = requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/runs/export?format=csv&tenantId=tenant-redact&projectId=project-redact", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET csv export status=%d body=%s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "sk-1234567890abcdefghijklmnop") {
		t.Fatalf("csv export leaked secret-like request id: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "[REDACTED]") {
		t.Fatalf("csv export missing redaction marker: %s", rr.Body.String())
	}
}

func TestRuntimeRunExportIncludesGovernedDispositionAndOrgAdminHeaders(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	createdAt := time.Date(2026, 3, 8, 1, 15, 0, 0, time.UTC)
	task := &TaskRecord{
		TaskID:      "task-run-export-org-admin-1",
		RequestID:   "req-run-export-org-admin-1",
		TenantID:    "tenant-run-export",
		ProjectID:   "project-run-export",
		Title:       "Run export org-admin coverage",
		Status:      TaskStatusCompleted,
		CreatedAt:   createdAt,
		UpdatedAt:   createdAt,
		Annotations: mustMarshalJSON(map[string]interface{}{"source": "test"}),
	}
	if err := store.UpsertTask(context.Background(), task); err != nil {
		t.Fatalf("upsert task: %v", err)
	}

	session := &SessionRecord{
		SessionID:   "session-run-export-org-admin-1",
		TaskID:      task.TaskID,
		RequestID:   task.RequestID,
		TenantID:    task.TenantID,
		ProjectID:   task.ProjectID,
		SessionType: "managed_worker",
		Status:      SessionStatusCompleted,
		Source:      "test",
		Summary:     mustMarshalJSON(map[string]interface{}{"worker": "codex"}),
		CreatedAt:   createdAt,
		UpdatedAt:   createdAt,
	}
	if err := store.UpsertSession(context.Background(), session); err != nil {
		t.Fatalf("upsert session: %v", err)
	}

	checkpoint := &ApprovalCheckpointRecord{
		CheckpointID:           "checkpoint-run-export-org-admin-1",
		SessionID:              session.SessionID,
		RequestID:              task.RequestID,
		TenantID:               task.TenantID,
		ProjectID:              task.ProjectID,
		Scope:                  "org_admin_binding",
		Tier:                   4,
		TargetOS:               "linux",
		TargetExecutionProfile: "sandbox_vm_autonomous",
		RequestedCapabilities:  []string{"org_admin.break_glass"},
		Status:                 ApprovalStatusPending,
		Reason:                 "break-glass review pending",
		Annotations: mustMarshalJSON(map[string]interface{}{
			orgAdminDecisionBindingAnnotationKey: map[string]interface{}{
				"profileId":                     "centralized_enterprise_admin",
				"profileLabel":                  "Centralized enterprise admin",
				"organizationModel":             "centralized_enterprise",
				"bindingId":                     "centralized_enterprise_admin_break_glass_binding",
				"bindingLabel":                  "Break-glass binding",
				"category":                      "break_glass",
				"selectedRoleBundle":            "enterprise.break_glass_admin",
				"selectedDirectorySyncMappings": []string{"centralized_enterprise_admin_directory_sync_mapping"},
				"selectedExceptionProfiles":     []string{"centralized_enterprise_admin_residency_exception"},
				"selectedOverlayProfiles":       []string{"centralized_enterprise_admin_quota_overlay"},
				"requestedInputKeys":            []string{"break_glass_id"},
				"decisionActorRoles":            []string{"enterprise.break_glass_admin"},
				"inputValues": map[string]interface{}{
					"break_glass_id": "Bearer topsecret-token-value-1234567890",
				},
			},
		}),
		CreatedAt: createdAt,
		UpdatedAt: createdAt,
	}
	if err := store.UpsertApprovalCheckpoint(context.Background(), checkpoint); err != nil {
		t.Fatalf("upsert approval checkpoint: %v", err)
	}

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/runs/export?format=jsonl&tenantId=tenant-run-export&projectId=project-run-export&audience=compliance_review", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET run export status=%d body=%s", rr.Code, rr.Body.String())
	}
	if rr.Header().Get("X-AgentOps-Export-Profile") != "run_export" {
		t.Fatalf("run export profile=%q want run_export", rr.Header().Get("X-AgentOps-Export-Profile"))
	}
	if rr.Header().Get("X-AgentOps-Export-Audience") != "compliance_review" {
		t.Fatalf("run export audience=%q want compliance_review", rr.Header().Get("X-AgentOps-Export-Audience"))
	}
	if rr.Header().Get("X-AgentOps-Export-Retention-Class") != "archive" {
		t.Fatalf("run export retention=%q want archive", rr.Header().Get("X-AgentOps-Export-Retention-Class"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Profiles") != "1" {
		t.Fatalf("expected org-admin profile header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Profiles"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Bindings") != "1" {
		t.Fatalf("expected org-admin binding header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Bindings"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Pending-Reviews") != "1" {
		t.Fatalf("expected org-admin pending header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Pending-Reviews"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Organization-Models") != "centralized_enterprise" {
		t.Fatalf("expected org-admin organization-model header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Organization-Models"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Role-Bundles") != "enterprise.break_glass_admin" {
		t.Fatalf("expected org-admin role-bundle header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Role-Bundles"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Decision-Actor-Roles") != "enterprise.break_glass_admin" {
		t.Fatalf("expected org-admin actor-role header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Decision-Actor-Roles"))
	}
	if rr.Header().Get("X-AgentOps-Export-Redactions") == "" {
		t.Fatalf("expected redaction header on run export")
	}
	if strings.Contains(rr.Body.String(), "topsecret-token-value-1234567890") {
		t.Fatalf("run export leaked secret-like org-admin input: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"runId\":\"session-run-export-org-admin-1\"") {
		t.Fatalf("run export missing projected run: %s", rr.Body.String())
	}
}
