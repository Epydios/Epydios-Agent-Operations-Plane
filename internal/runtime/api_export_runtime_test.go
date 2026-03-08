package runtime

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestRuntimeAuditExportRedactsSensitiveFields(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	emitAuditEvent(context.Background(), "runtime.test.secret_export", map[string]interface{}{
		"tenantId":  "tenant-audit-export",
		"projectId": "project-audit-export",
		"message":   "Bearer topsecret-token-value-1234567890",
		"nested": map[string]interface{}{
			"apiKey": "sk-1234567890abcdefghijklmnop",
		},
	})

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/audit/events/export?format=json&tenantId=tenant-audit-export&projectId=project-audit-export&event=secret_export&audience=compliance_review", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET audit export status=%d body=%s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "topsecret-token-value-1234567890") {
		t.Fatalf("audit export leaked bearer token: %s", rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "sk-1234567890abcdefghijklmnop") {
		t.Fatalf("audit export leaked API key: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "[REDACTED]") {
		t.Fatalf("audit export missing redaction marker: %s", rr.Body.String())
	}
	if rr.Header().Get("X-AgentOps-Export-Profile") != "audit_export" {
		t.Fatalf("audit export profile=%q want audit_export", rr.Header().Get("X-AgentOps-Export-Profile"))
	}
	if rr.Header().Get("X-AgentOps-Export-Audience") != "compliance_review" {
		t.Fatalf("audit export audience=%q want compliance_review", rr.Header().Get("X-AgentOps-Export-Audience"))
	}
	if rr.Header().Get("X-AgentOps-Export-Retention-Class") != "archive" {
		t.Fatalf("audit export retention=%q want archive", rr.Header().Get("X-AgentOps-Export-Retention-Class"))
	}
	if rr.Header().Get("X-AgentOps-Export-Redactions") == "" {
		t.Fatalf("expected audit export redaction header")
	}
}

func TestRuntimeSessionEvidenceExportRedactsSensitiveFields(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	createdAt := time.Date(2026, 3, 7, 23, 0, 0, 0, time.UTC)
	task := &TaskRecord{
		TaskID:      "task-evidence-export-1",
		RequestID:   "request-evidence-export-1",
		TenantID:    "tenant-evidence-export",
		ProjectID:   "project-evidence-export",
		Source:      "test",
		Title:       "Evidence export test",
		Intent:      "verify redaction",
		Status:      TaskStatusCompleted,
		CreatedAt:   createdAt,
		UpdatedAt:   createdAt,
		Annotations: mustMarshalJSON(map[string]interface{}{"source": "test"}),
	}
	if err := store.UpsertTask(context.Background(), task); err != nil {
		t.Fatalf("upsert task: %v", err)
	}
	session := &SessionRecord{
		SessionID:   "session-evidence-export-1",
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
	record := &EvidenceRecord{
		EvidenceID:     "evidence-export-1",
		SessionID:      session.SessionID,
		TenantID:       session.TenantID,
		ProjectID:      session.ProjectID,
		Kind:           "managed_worker_output",
		URI:            "file:///tmp/evidence?token=Bearer topsecret-token-value-1234567890",
		Checksum:       "sk-1234567890abcdefghijklmnop",
		Metadata:       mustMarshalJSON(map[string]interface{}{"token": "Bearer topsecret-token-value-1234567890", "nested": map[string]interface{}{"apiKey": "sk-1234567890abcdefghijklmnop"}}),
		RetentionClass: "archive",
		CreatedAt:      createdAt,
		UpdatedAt:      createdAt,
	}
	if err := store.UpsertEvidenceRecord(context.Background(), record); err != nil {
		t.Fatalf("upsert evidence: %v", err)
	}

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha2/runtime/sessions/"+session.SessionID+"/evidence/export?format=json&audience=compliance_review", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET evidence export status=%d body=%s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "topsecret-token-value-1234567890") {
		t.Fatalf("evidence export leaked bearer token: %s", rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "sk-1234567890abcdefghijklmnop") {
		t.Fatalf("evidence export leaked API key: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "[REDACTED]") {
		t.Fatalf("evidence export missing redaction marker: %s", rr.Body.String())
	}
	if rr.Header().Get("X-AgentOps-Export-Profile") != "evidence_export" {
		t.Fatalf("evidence export profile=%q want evidence_export", rr.Header().Get("X-AgentOps-Export-Profile"))
	}
	if rr.Header().Get("X-AgentOps-Export-Audience") != "compliance_review" {
		t.Fatalf("evidence export audience=%q want compliance_review", rr.Header().Get("X-AgentOps-Export-Audience"))
	}
	if rr.Header().Get("X-AgentOps-Export-Retention-Class") != "archive" {
		t.Fatalf("evidence export retention=%q want archive", rr.Header().Get("X-AgentOps-Export-Retention-Class"))
	}
	if rr.Header().Get("X-AgentOps-Export-Redactions") == "" {
		t.Fatalf("expected evidence export redaction header")
	}
}
