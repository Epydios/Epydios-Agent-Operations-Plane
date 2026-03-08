package runtimeclient

import (
	"strings"
	"testing"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestBuildThreadGovernedUpdateEnvelopeMatchesParityFixture(t *testing.T) {
	view := buildParityThreadReview(t)
	fixture := loadParityFixture(t)
	envelope := BuildThreadGovernedUpdateEnvelope(view, ThreadEnvelopeOptions{
		Header:       "AgentOps thread update",
		UpdateType:   "review",
		ContextLabel: "Thread",
		ContextValue: view.Task.TaskID,
		SubjectLabel: "Task",
		SubjectValue: view.Task.Title,
		Summary:      fixture.Expected.Summary,
		ActionHints:  BuildThreadDecisionActionHints(view, BuildThreadContextHint(view, view.Task.TaskID), "approvals decide", "proposals decide"),
	})
	if envelope.TaskID != fixture.Task.TaskID {
		t.Fatalf("taskId=%q want %q", envelope.TaskID, fixture.Task.TaskID)
	}
	if envelope.SessionID != fixture.Session.SessionID {
		t.Fatalf("sessionId=%q want %q", envelope.SessionID, fixture.Session.SessionID)
	}
	if envelope.PendingProposalCount != len(fixture.Expected.ProposalIDs) {
		t.Fatalf("pendingProposalCount=%d want %d", envelope.PendingProposalCount, len(fixture.Expected.ProposalIDs))
	}
	if envelope.OpenApprovals != len(fixture.Expected.ApprovalIDs) {
		t.Fatalf("openApprovals=%d want %d", envelope.OpenApprovals, len(fixture.Expected.ApprovalIDs))
	}
	rendered := RenderGovernedUpdateEnvelope(envelope)
	for _, part := range append(fixture.Expected.EventLines, "--checkpoint-id <id>", "--decision APPROVE|DENY") {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}

func TestBuildThreadGovernedUpdateEnvelopeProjectsOrgAdminReviewState(t *testing.T) {
	view := &ThreadReview{
		Task: runtimeapi.TaskRecord{
			TaskID:    "task-org-admin-1",
			Title:     "Org admin review thread",
			Status:    runtimeapi.TaskStatusInProgress,
			TenantID:  "tenant-a",
			ProjectID: "project-a",
		},
		Timeline: &runtimeapi.SessionTimelineResponse{
			Session: runtimeapi.SessionRecord{
				SessionID: "session-org-admin-1",
				TaskID:    "task-org-admin-1",
				Status:    runtimeapi.SessionStatusAwaitingApproval,
			},
			ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
				{
					CheckpointID: "checkpoint-org-admin-1",
					Status:       runtimeapi.ApprovalStatusPending,
					Reason:       "Delegated admin scope review is required.",
					Annotations: mustJSONRaw(map[string]interface{}{
						"orgAdminDecisionBinding": map[string]interface{}{
							"profileId":                     "centralized_enterprise_admin",
							"profileLabel":                  "Centralized Enterprise Admin",
							"organizationModel":             "centralized_enterprise",
							"bindingId":                     "centralized_enterprise_admin_delegated_admin_binding",
							"bindingLabel":                  "Centralized Enterprise Admin Delegated Admin Decision Binding",
							"category":                      "delegated_admin",
							"selectedRoleBundle":            "enterprise.tenant_admin",
							"selectedDirectorySyncMappings": []string{"centralized_enterprise_admin_directory_sync_mapping"},
							"selectedExceptionProfiles":     []string{"centralized_enterprise_admin_residency_exception"},
							"selectedOverlayProfiles":       []string{"centralized_enterprise_admin_quota_overlay"},
							"decisionActorRoles":            []string{"enterprise.tenant_admin"},
							"decisionSurfaces":              []string{"policy_pack_assignment"},
							"boundaryRequirements":          []string{"runtime_authz"},
							"requestedInputKeys":            []string{"idp_group", "tenant_id"},
							"inputValues": map[string]interface{}{
								"idp_group": "grp-agentops-admins",
								"tenant_id": "tenant-a",
							},
						},
					}),
				},
			},
		},
	}

	envelope := BuildThreadGovernedUpdateEnvelope(view, ThreadEnvelopeOptions{
		Header:       "AgentOps thread update",
		UpdateType:   "follow",
		ContextLabel: "Thread",
		ContextValue: "task-org-admin-1",
		SubjectLabel: "Task",
		SubjectValue: "Org admin review thread",
	})

	if envelope.OrgAdminProfileID != "centralized_enterprise_admin" {
		t.Fatalf("orgAdminProfileId=%q want centralized_enterprise_admin", envelope.OrgAdminProfileID)
	}
	if envelope.OrgAdminRoleBundle != "enterprise.tenant_admin" {
		t.Fatalf("orgAdminRoleBundle=%q want enterprise.tenant_admin", envelope.OrgAdminRoleBundle)
	}
	if envelope.OrgAdminPendingReviews != 1 {
		t.Fatalf("orgAdminPendingReviews=%d want 1", envelope.OrgAdminPendingReviews)
	}
	if !strings.Contains(strings.Join(envelope.OrgAdminDecisionBindings, "\n"), "Centralized Enterprise Admin Delegated Admin Decision Binding") {
		t.Fatalf("orgAdminDecisionBindings=%v", envelope.OrgAdminDecisionBindings)
	}
	if !strings.Contains(strings.Join(envelope.OrgAdminInputValues, "\n"), "tenant_id=tenant-a") {
		t.Fatalf("orgAdminInputValues=%v", envelope.OrgAdminInputValues)
	}
	rendered := RenderGovernedUpdateEnvelope(envelope)
	for _, part := range []string{
		"Org-admin profile: Centralized Enterprise Admin (centralized_enterprise_admin)",
		"Org-admin pending reviews: 1",
		"Org-admin decision actor roles:",
		"Org-admin input values:",
	} {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in rendered envelope: %s", part, rendered)
		}
	}
}
