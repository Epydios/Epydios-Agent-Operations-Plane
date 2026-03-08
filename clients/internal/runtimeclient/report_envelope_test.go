package runtimeclient

import (
	"strings"
	"testing"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestBuildEnterpriseReportEnvelope(t *testing.T) {
	subject := EnterpriseReportSubject{
		ExportProfile:        "security_review",
		Audience:             "security_ops",
		ClientSurface:        "workflow",
		ContextLabel:         "Workflow",
		ContextValue:         "jira | WF-1",
		SubjectLabel:         "Ticket",
		SubjectValue:         "OPS-101",
		TaskID:               "task-1",
		TaskStatus:           "IN_PROGRESS",
		SessionID:            "session-1",
		SessionStatus:        "RUNNING",
		WorkerID:             "worker-1",
		WorkerType:           "managed_agent",
		WorkerAdapterID:      "codex",
		WorkerState:          "RUNNING",
		ExecutionMode:        runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
		OpenApprovals:        1,
		PendingProposalCount: 2,
		ToolActionCount:      3,
		EvidenceCount:        4,
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{
				CheckpointID: "approval-org-admin-1",
				Status:       runtimeapi.ApprovalStatusPending,
				Reason:       "Delegated admin scope review is required before rollout.",
				Annotations: mustJSONRaw(map[string]interface{}{
					"orgAdminDecisionBinding": map[string]interface{}{
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
						"requiredInputs":                []string{"idp_group", "tenant_id"},
						"requestedInputKeys":            []string{"idp_group", "tenant_id"},
						"inputValues": map[string]interface{}{
							"idp_group":     "grp-agentops-tenant-admins",
							"tenant_id":     "tenant-a",
							"cost_center":   "CC-20410",
							"environment":   "prod",
							"business_unit": "platform",
						},
						"decisionActorRoles":   []string{"enterprise.tenant_admin"},
						"decisionSurfaces":     []string{"policy_pack_assignment"},
						"boundaryRequirements": []string{"runtime_authz"},
					},
				}),
			},
		},
		SessionEvents: []runtimeapi.SessionEventRecord{
			{
				EventID:   "event-org-admin-1",
				SessionID: "session-1",
				Sequence:  41,
				EventType: runtimeapi.SessionEventType("org_admin.directory_sync.requested"),
				Payload: mustJSONRaw(map[string]interface{}{
					"bindingLabel":           "Centralized Enterprise Admin Directory Sync Binding",
					"category":               "directory_sync",
					"selectedDirectorySyncs": []string{"centralized_enterprise_admin_directory_sync_mapping"},
					"status":                 "PENDING",
				}),
			},
		},
		EvidenceRecords: []runtimeapi.EvidenceRecord{
			{
				EvidenceID:     "evidence-org-admin-1",
				SessionID:      "session-1",
				Kind:           "org_admin_directory_sync_request",
				RetentionClass: "standard",
				Metadata: mustJSONRaw(map[string]interface{}{
					"bindingLabel": "Centralized Enterprise Admin Directory Sync Binding",
				}),
			},
		},
		Summary:     "Managed worker is awaiting governed approval.",
		Recent:      []string{"Worker Progress: Waiting on approval."},
		ActionHints: []string{"- approvals decide --task-id task-1"},
	}
	policyCatalog := &runtimeapi.PolicyPackCatalogResponse{
		GeneratedAt: time.Now().UTC(),
		Source:      "test",
		Count:       2,
		Items: []runtimeapi.PolicyPackCatalogEntry{
			{PackID: "read_only_review", Label: "Read-Only Review", RoleBundles: []string{"enterprise.reviewer"}, DecisionSurfaces: []string{"review_only"}, ClientSurfaces: []string{"workflow", "chatops"}, ReportingSurfaces: []string{"report"}, BoundaryRequirements: []string{"runtime_authz"}},
			{PackID: "managed_codex_worker_operator", Label: "Managed Codex Worker Operator", RoleBundles: []string{"enterprise.operator", "enterprise.worker_controller"}, DecisionSurfaces: []string{"approval_checkpoint", "tool_proposal"}, ApplicableExecutionModes: []string{runtimeapi.AgentInvokeExecutionModeManagedCodexWorker}, ApplicableWorkerTypes: []string{"managed_agent"}, ApplicableAdapterIDs: []string{"codex"}, ClientSurfaces: []string{"workflow"}, ReportingSurfaces: []string{"report", "delta-update"}, BoundaryRequirements: []string{"agentops_gateway_boundary"}},
		},
	}
	capabilityCatalog := &runtimeapi.WorkerCapabilityCatalogResponse{
		GeneratedAt: time.Now().UTC(),
		Source:      "test",
		Count:       1,
		Items: []runtimeapi.WorkerCapabilityCatalogEntry{
			{Label: "Managed Codex Worker", ExecutionMode: runtimeapi.AgentInvokeExecutionModeManagedCodexWorker, WorkerType: "managed_agent", AdapterID: "codex", Provider: "agentops_gateway", BoundaryRequirements: []string{"governed_tool_execution"}},
		},
	}
	exportProfileCatalog := &runtimeapi.ExportProfileCatalogResponse{
		GeneratedAt: time.Now().UTC(),
		Source:      "test",
		Count:       1,
		Items: []runtimeapi.ExportProfileCatalogEntry{
			{
				ExportProfile:                  "security_review",
				Label:                          "Security Review",
				DefaultAudience:                "security_ops",
				AllowedAudiences:               []string{"security_ops", "security_review"},
				DefaultRetentionClass:          "standard",
				AllowedRetentionClasses:        []string{"standard", "archive"},
				AudienceRetentionClassOverlays: map[string]string{"security_ops": "archive"},
				ClientSurfaces:                 []string{"workflow"},
				ReportTypes:                    []string{"report", "review"},
				DeliveryChannels:               []string{"report", "comment"},
				RedactionMode:                  "structured_and_text",
			},
		},
	}
	orgAdminCatalog := &runtimeapi.OrgAdminCatalogResponse{
		GeneratedAt: time.Now().UTC(),
		Source:      "test",
		Count:       1,
		Items: []runtimeapi.OrgAdminCatalogEntry{
			{
				ProfileID:                 "centralized_enterprise_admin",
				Label:                     "Centralized Enterprise Admin",
				ClientSurfaces:            []string{"workflow", "chatops"},
				AdminRoleBundles:          []string{"enterprise.org_admin", "enterprise.security_admin"},
				DelegationModel:           "central_it_with_tenant_project_delegation",
				DelegatedAdminRoleBundles: []string{"enterprise.tenant_admin"},
				BreakGlassRoleBundles:     []string{"enterprise.break_glass_admin"},
				EnforcementProfiles: []runtimeapi.OrgAdminEnforcementProfile{
					{
						HookID:          "delegated_admin_scope_guard",
						Label:           "Delegated Admin Scope Guard",
						Category:        "delegated_admin",
						EnforcementMode: "scope_guard",
						RoleBundles:     []string{"enterprise.tenant_admin"},
						RequiredInputs:  []string{"idp_group", "tenant_id"},
					},
				},
				DirectorySyncMappings: []runtimeapi.OrgAdminDirectorySyncMapping{
					{
						MappingID:       "centralized_enterprise_admin_directory_sync_mapping",
						Label:           "Centralized Enterprise Admin Directory Sync Mapping",
						MappingMode:     "group_to_role_binding",
						RequiredInputs:  []string{"idp_group", "tenant_id"},
						ScopeDimensions: []string{"tenant_id"},
					},
				},
				DecisionBindings: []runtimeapi.OrgAdminDecisionBinding{
					{
						BindingID:             "centralized_enterprise_admin_delegated_admin_binding",
						Label:                 "Centralized Enterprise Admin Delegated Admin Decision Binding",
						Category:              "delegated_admin",
						BindingMode:           "delegated_admin_scope_review",
						HookIDs:               []string{"delegated_admin_scope_guard"},
						DirectorySyncMappings: []string{"centralized_enterprise_admin_directory_sync_mapping"},
						RoleBundles:           []string{"enterprise.tenant_admin"},
						RequiredInputs:        []string{"idp_group", "tenant_id"},
						DecisionSurfaces:      []string{"policy_pack_assignment"},
						BoundaryRequirements:  []string{"runtime_authz"},
					},
				},
				ExceptionProfiles: []runtimeapi.OrgAdminExceptionProfile{
					{
						ProfileID:      "centralized_enterprise_admin_residency_exception",
						Label:          "Centralized Enterprise Admin Residency Exception",
						Category:       "residency",
						ExceptionMode:  "ticketed_exception_review",
						RequiredInputs: []string{"residency_exception_ticket"},
					},
				},
				OverlayProfiles: []runtimeapi.OrgAdminOverlayProfile{
					{
						OverlayID:        "centralized_enterprise_admin_quota_overlay",
						Label:            "Centralized Enterprise Admin Quota Overlay",
						Category:         "quota",
						OverlayMode:      "quota_override_review",
						TargetDimensions: []string{"organization", "tenant"},
						RequiredInputs:   []string{"tenant_id"},
					},
				},
				DirectorySyncInputs:  []string{"idp_group", "tenant_id"},
				ResidencyProfiles:    []string{"single_region_tenant_pinning"},
				LegalHoldProfiles:    []string{"litigation_hold"},
				QuotaDimensions:      []string{"organization", "tenant"},
				ChargebackDimensions: []string{"cost_center"},
				EnforcementHooks:     []string{"delegated_admin_scope_guard", "break_glass_timebox"},
				ReportingSurfaces:    []string{"admin_report"},
			},
		},
	}

	envelope := BuildEnterpriseReportEnvelope(subject, policyCatalog, capabilityCatalog, exportProfileCatalog, orgAdminCatalog)
	if len(envelope.ApplicablePolicyPacks) != 2 {
		t.Fatalf("policy packs=%v want 2", envelope.ApplicablePolicyPacks)
	}
	if envelope.ExportProfile != "security_review" {
		t.Fatalf("export profile=%q want security_review", envelope.ExportProfile)
	}
	if envelope.Audience != "security_ops" {
		t.Fatalf("audience=%q want security_ops", envelope.Audience)
	}
	if envelope.RetentionClass != "archive" {
		t.Fatalf("retention class=%q want archive", envelope.RetentionClass)
	}
	if !strings.Contains(strings.Join(envelope.ApplicablePolicyPacks, "\n"), "managed_codex_worker_operator") {
		t.Fatalf("policy packs=%v", envelope.ApplicablePolicyPacks)
	}
	if len(envelope.WorkerCapabilityLabels) != 1 || !strings.Contains(envelope.WorkerCapabilityLabels[0], "Managed Codex Worker") {
		t.Fatalf("capabilities=%v", envelope.WorkerCapabilityLabels)
	}
	if len(envelope.RoleBundles) != 3 {
		t.Fatalf("role bundles=%v want 3", envelope.RoleBundles)
	}
	if len(envelope.AdminRoleBundles) != 2 {
		t.Fatalf("admin role bundles=%v want 2", envelope.AdminRoleBundles)
	}
	if len(envelope.ApplicableOrgAdmins) != 1 {
		t.Fatalf("applicable org admins=%v want 1", envelope.ApplicableOrgAdmins)
	}
	if !strings.Contains(strings.Join(envelope.Details, "\n"), "Org-admin decision binding:") {
		t.Fatalf("org-admin review details missing: %+v", envelope.Details)
	}
	if !strings.Contains(strings.Join(envelope.Details, "\n"), "Org-admin input values:") {
		t.Fatalf("org-admin input values missing: %+v", envelope.Details)
	}
	if !strings.Contains(strings.Join(envelope.ActionHints, "\n"), "pending org-admin decision reviews") {
		t.Fatalf("org-admin review hints missing: %+v", envelope.ActionHints)
	}
	if len(envelope.EnforcementHooks) != 2 {
		t.Fatalf("enforcement hooks=%v want 2", envelope.EnforcementHooks)
	}
	if len(envelope.EnforcementProfileLabels) == 0 {
		t.Fatalf("enforcement profile labels missing: %+v", envelope)
	}
	if len(envelope.DirectorySyncMappings) == 0 {
		t.Fatalf("directory sync mappings missing: %+v", envelope)
	}
	if len(envelope.ExceptionProfileLabels) == 0 {
		t.Fatalf("exception profile labels missing: %+v", envelope)
	}
	if len(envelope.OverlayProfileLabels) == 0 {
		t.Fatalf("overlay profile labels missing: %+v", envelope)
	}
	if len(envelope.DecisionBindingLabels) == 0 {
		t.Fatalf("decision binding labels missing: %+v", envelope)
	}
	if envelope.ActiveOrgAdminProfileID != "centralized_enterprise_admin" {
		t.Fatalf("active org-admin profile=%q want centralized_enterprise_admin", envelope.ActiveOrgAdminProfileID)
	}
	if envelope.ActiveOrgAdminRoleBundle != "enterprise.tenant_admin" {
		t.Fatalf("active org-admin role bundle=%q want enterprise.tenant_admin", envelope.ActiveOrgAdminRoleBundle)
	}
	if envelope.ActiveOrgAdminPendingReviews != 1 {
		t.Fatalf("active org-admin pending reviews=%d want 1", envelope.ActiveOrgAdminPendingReviews)
	}
	if len(envelope.ActiveOrgAdminDecisionBindings) == 0 {
		t.Fatalf("active org-admin decision bindings missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminCategories) == 0 {
		t.Fatalf("active org-admin categories missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminDecisionActorRoles) == 0 {
		t.Fatalf("active org-admin decision actor roles missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminDecisionSurfaces) == 0 {
		t.Fatalf("active org-admin decision surfaces missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminBoundaryRequirements) == 0 {
		t.Fatalf("active org-admin boundary requirements missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminInputKeys) == 0 {
		t.Fatalf("active org-admin input keys missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminDirectoryMappings) == 0 {
		t.Fatalf("active org-admin directory mappings missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminExceptionProfiles) == 0 {
		t.Fatalf("active org-admin exception profiles missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminOverlayProfiles) == 0 {
		t.Fatalf("active org-admin overlay profiles missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminInputValues) == 0 {
		t.Fatalf("active org-admin input values missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminArtifactEvents) == 0 {
		t.Fatalf("active org-admin artifact events missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminArtifactEvidence) == 0 {
		t.Fatalf("active org-admin artifact evidence missing: %+v", envelope)
	}
	if len(envelope.ActiveOrgAdminArtifactRetention) == 0 {
		t.Fatalf("active org-admin artifact retention missing: %+v", envelope)
	}
	if len(envelope.DecisionSurfaces) != 3 {
		t.Fatalf("decision surfaces=%v want 3", envelope.DecisionSurfaces)
	}
	if len(envelope.BoundaryRequirements) != 3 {
		t.Fatalf("boundaries=%v want 3", envelope.BoundaryRequirements)
	}
	rendered := RenderEnterpriseReportEnvelope(envelope)
	if !strings.Contains(rendered, "Applicable policy packs:") {
		t.Fatalf("rendered report missing policy section: %s", rendered)
	}
	if !strings.Contains(rendered, "Worker capability coverage:") {
		t.Fatalf("rendered report missing capability section: %s", rendered)
	}
	if !strings.Contains(rendered, "Role bundles:") {
		t.Fatalf("rendered report missing role section: %s", rendered)
	}
	if !strings.Contains(rendered, "Applicable org-admin profiles:") {
		t.Fatalf("rendered report missing org-admin section: %s", rendered)
	}
	if !strings.Contains(rendered, "Enforcement hooks:") {
		t.Fatalf("rendered report missing enforcement hook section: %s", rendered)
	}
	if !strings.Contains(rendered, "Enforcement profile coverage:") {
		t.Fatalf("rendered report missing enforcement profile section: %s", rendered)
	}
	if !strings.Contains(rendered, "Directory-sync mapping coverage:") {
		t.Fatalf("rendered report missing directory-sync mapping section: %s", rendered)
	}
	if !strings.Contains(rendered, "Exception profile coverage:") {
		t.Fatalf("rendered report missing exception profile section: %s", rendered)
	}
	if !strings.Contains(rendered, "Overlay profile coverage:") {
		t.Fatalf("rendered report missing overlay profile section: %s", rendered)
	}
	if !strings.Contains(rendered, "Decision binding coverage:") {
		t.Fatalf("rendered report missing decision binding section: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin profile:") {
		t.Fatalf("rendered report missing active org-admin profile: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin decision bindings:") {
		t.Fatalf("rendered report missing active org-admin decision bindings: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin categories:") {
		t.Fatalf("rendered report missing active org-admin categories: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin decision actor roles:") {
		t.Fatalf("rendered report missing active org-admin decision actor roles: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin decision surfaces:") {
		t.Fatalf("rendered report missing active org-admin decision surfaces: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin boundary requirements:") {
		t.Fatalf("rendered report missing active org-admin boundary requirements: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin input values:") {
		t.Fatalf("rendered report missing active org-admin input values: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin artifact events:") {
		t.Fatalf("rendered report missing active org-admin artifact events: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin evidence kinds:") {
		t.Fatalf("rendered report missing active org-admin artifact evidence: %s", rendered)
	}
	if !strings.Contains(rendered, "Active org-admin artifact retention classes:") {
		t.Fatalf("rendered report missing active org-admin artifact retention: %s", rendered)
	}
	if !strings.Contains(rendered, "Export profile: security_review") {
		t.Fatalf("rendered report missing export profile: %s", rendered)
	}
	if !strings.Contains(rendered, "Audience: security_ops") {
		t.Fatalf("rendered report missing audience: %s", rendered)
	}
	if !strings.Contains(rendered, "Retention class: archive") {
		t.Fatalf("rendered report missing retention class: %s", rendered)
	}
}

func TestExecutionModeForWorker(t *testing.T) {
	if got := ExecutionModeForWorker("managed_agent", "codex"); got != runtimeapi.AgentInvokeExecutionModeManagedCodexWorker {
		t.Fatalf("managed worker mode=%q", got)
	}
	if got := ExecutionModeForWorker("model_invoke", "openai"); got != runtimeapi.AgentInvokeExecutionModeRawModelInvoke {
		t.Fatalf("model invoke mode=%q", got)
	}
}

func TestBuildEnterpriseReportEnvelopeRedactsSecretLikeContent(t *testing.T) {
	envelope := BuildEnterpriseReportEnvelope(EnterpriseReportSubject{
		ClientSurface: "cli",
		Summary:       "Captured transcript token sk-1234567890abcdefghijklmnop",
		Details: []string{
			"Transcript preview: Bearer abcdefghijklmnopqrstuvwxyz012345",
			"Evidence preview: -----BEGIN PRIVATE KEY-----",
		},
	}, &runtimeapi.PolicyPackCatalogResponse{}, &runtimeapi.WorkerCapabilityCatalogResponse{}, &runtimeapi.ExportProfileCatalogResponse{}, &runtimeapi.OrgAdminCatalogResponse{})
	if envelope.RedactionCount != 3 {
		t.Fatalf("redaction count=%d want 3", envelope.RedactionCount)
	}
	rendered := RenderEnterpriseReportEnvelope(envelope)
	if strings.Contains(rendered, "sk-1234567890abcdefghijklmnop") || strings.Contains(rendered, "-----BEGIN PRIVATE KEY-----") {
		t.Fatalf("rendered output leaked secret-like content: %s", rendered)
	}
	if !strings.Contains(rendered, "DLP findings:") {
		t.Fatalf("expected DLP findings in rendered report: %s", rendered)
	}
}

func TestResolveEnterpriseReportDispositionUsesSurfaceDefaults(t *testing.T) {
	tests := []struct {
		name          string
		clientSurface string
		reportType    string
		wantProfile   string
		wantAudience  string
	}{
		{name: "chat review", clientSurface: "chat", reportType: "review", wantProfile: "operator_review", wantAudience: "operator"},
		{name: "cli delta", clientSurface: "cli", reportType: "delta-report", wantProfile: "operator_follow", wantAudience: "operator"},
		{name: "workflow review", clientSurface: "workflow", reportType: "report", wantProfile: "workflow_review", wantAudience: "workflow_operator"},
		{name: "workflow delta", clientSurface: "workflow", reportType: "delta-report", wantProfile: "workflow_follow", wantAudience: "workflow_operator"},
		{name: "chatops review", clientSurface: "chatops", reportType: "report", wantProfile: "conversation_review", wantAudience: "conversation_operator"},
		{name: "chatops delta", clientSurface: "chatops", reportType: "delta-report", wantProfile: "conversation_follow", wantAudience: "conversation_operator"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ResolveEnterpriseReportDisposition(tt.clientSurface, tt.reportType, "", "")
			if got.ExportProfile != tt.wantProfile {
				t.Fatalf("export profile=%q want %q", got.ExportProfile, tt.wantProfile)
			}
			if got.Audience != tt.wantAudience {
				t.Fatalf("audience=%q want %q", got.Audience, tt.wantAudience)
			}
		})
	}
}
