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
	emitAuditEvent(context.Background(), "runtime.org_admin.binding.requested", map[string]interface{}{
		"tenantId":     "tenant-audit-export",
		"projectId":    "project-audit-export",
		"sessionId":    "session-audit-export-1",
		"checkpointId": "checkpoint-audit-export-1",
		"status":       "PENDING",
		"orgAdminDecisionBinding": map[string]interface{}{
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
	})

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/audit/events/export?format=json&tenantId=tenant-audit-export&projectId=project-audit-export&audience=compliance_review", nil)
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
	if rr.Header().Get("X-AgentOps-Org-Admin-Organization-Models") != "centralized_enterprise" {
		t.Fatalf("expected org-admin organization-model header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Organization-Models"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Role-Bundles") != "enterprise.break_glass_admin" {
		t.Fatalf("expected org-admin role-bundle header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Role-Bundles"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Decision-Actor-Roles") != "enterprise.break_glass_admin" {
		t.Fatalf("expected org-admin decision-actor-role header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Decision-Actor-Roles"))
	}
	if !strings.Contains(rr.Body.String(), "\"orgAdminProfiles\"") {
		t.Fatalf("audit export missing org-admin profile summary: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"orgAdminInputValues\"") {
		t.Fatalf("audit export missing org-admin input-value summary: %s", rr.Body.String())
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
	checkpoint := &ApprovalCheckpointRecord{
		CheckpointID:           "checkpoint-evidence-export-1",
		SessionID:              session.SessionID,
		RequestID:              task.RequestID,
		TenantID:               task.TenantID,
		ProjectID:              task.ProjectID,
		Scope:                  "session",
		Tier:                   3,
		TargetOS:               "darwin",
		TargetExecutionProfile: "sandbox_vm_autonomous",
		RequestedCapabilities:  []string{"org_admin.delegated_admin"},
		Status:                 ApprovalStatusPending,
		Reason:                 "delegated admin org export review",
		Annotations: mustMarshalJSON(map[string]interface{}{
			orgAdminDecisionBindingAnnotationKey: map[string]interface{}{
				"profileId":                     "centralized_enterprise_admin",
				"profileLabel":                  "Centralized Enterprise Admin",
				"organizationModel":             "centralized_enterprise",
				"bindingId":                     "centralized_enterprise_admin_delegated_admin_binding",
				"bindingLabel":                  "Centralized Enterprise Admin Delegated Admin Decision Binding",
				"category":                      "delegated_admin",
				"bindingMode":                   "delegated_admin_scope_review",
				"selectedRoleBundle":            "enterprise.tenant_admin",
				"selectedDirectorySyncMappings": []string{"centralized_enterprise_admin_directory_sync_mapping"},
				"selectedExceptionProfiles":     []string{"centralized_enterprise_admin_residency_exception"},
				"selectedOverlayProfiles":       []string{"centralized_enterprise_admin_quota_overlay"},
				"requestedInputKeys":            []string{"idp_group", "tenant_id"},
				"decisionActorRoles":            []string{"enterprise.tenant_admin"},
				"inputValues": map[string]interface{}{
					"idp_group":      "grp-agentops-tenant-admins",
					"tenant_id":      "tenant-evidence-export",
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
		t.Fatalf("expected org-admin organization model header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Organization-Models"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Role-Bundles") != "enterprise.tenant_admin" {
		t.Fatalf("expected org-admin role bundle header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Role-Bundles"))
	}
	if rr.Header().Get("X-AgentOps-Org-Admin-Decision-Actor-Roles") != "enterprise.tenant_admin" {
		t.Fatalf("expected org-admin decision actor roles header, got %q", rr.Header().Get("X-AgentOps-Org-Admin-Decision-Actor-Roles"))
	}
	if !strings.Contains(rr.Body.String(), "\"orgAdminProfiles\"") {
		t.Fatalf("expected org-admin metadata in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"orgAdminOrganizationModels\"") {
		t.Fatalf("expected org-admin organization model metadata in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"orgAdminRoleBundles\"") {
		t.Fatalf("expected org-admin role bundle metadata in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"orgAdminDecisionActorRoles\"") {
		t.Fatalf("expected org-admin decision actor roles in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"orgAdminInputValues\"") {
		t.Fatalf("expected org-admin input values in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"Centralized Enterprise Admin\"") {
		t.Fatalf("expected org-admin profile label in response: %s", rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "break_glass_id=Bearer topsecret-token-value-1234567890") {
		t.Fatalf("org-admin export metadata leaked input value: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "\"orgAdminPendingReviewCount\": 1") {
		t.Fatalf("expected org-admin pending review count in response: %s", rr.Body.String())
	}
}
