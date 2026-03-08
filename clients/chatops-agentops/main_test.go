package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	runtimeclient "github.com/Epydios/Epydios-AgentOps-Control-Plane/clients/internal/runtimeclient"
	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type chatopsParityFixture struct {
	Expected struct {
		Summary    string   `json:"summary"`
		EventLines []string `json:"eventLines"`
	} `json:"expected"`
}

func loadChatopsParityFixture(t *testing.T) chatopsParityFixture {
	t.Helper()
	payload, err := os.ReadFile(filepath.Join("..", "testdata", "m19-cross-surface-parity.json"))
	if err != nil {
		t.Fatalf("read parity fixture: %v", err)
	}
	var fixture chatopsParityFixture
	if err := json.Unmarshal(payload, &fixture); err != nil {
		t.Fatalf("unmarshal parity fixture: %v", err)
	}
	return fixture
}

func TestBuildChatopsAnnotations(t *testing.T) {
	payload := &chatopsIntakePayload{
		SourceSystem:    "slack",
		ChannelID:       "C123",
		ChannelName:     "ops-alerts",
		ThreadID:        "1730.55",
		ConversationURL: "https://chat.example/thread/1730.55",
		Labels:          []string{"incident", "sev1"},
		Annotations:     map[string]interface{}{"priority": "critical"},
	}
	annotations := buildChatopsAnnotations(payload)
	if annotations["sourceSystem"] != "slack" {
		t.Fatalf("sourceSystem=%v", annotations["sourceSystem"])
	}
	if annotations["threadId"] != "1730.55" {
		t.Fatalf("threadId=%v", annotations["threadId"])
	}
	labels, ok := annotations["labels"].([]string)
	if !ok || len(labels) != 2 {
		t.Fatalf("labels=%T %#v", annotations["labels"], annotations["labels"])
	}
	if annotations["priority"] != "critical" {
		t.Fatalf("priority=%v", annotations["priority"])
	}
}

func TestBuildChatopsStatusReport(t *testing.T) {
	annotations, _ := json.Marshal(map[string]interface{}{
		"sourceSystem": "slack",
		"channelId":    "C123",
		"channelName":  "ops-alerts",
		"threadId":     "1730.55",
	})
	proposalPayload, _ := json.Marshal(map[string]interface{}{
		"proposalId":   "proposal-1",
		"proposalType": "terminal_command",
		"summary":      "Run pwd.",
		"payload": map[string]interface{}{
			"command": "pwd",
		},
	})
	timeline := &runtimeapi.SessionTimelineResponse{
		Session:             runtimeapi.SessionRecord{SessionID: "sess-1", Status: runtimeapi.SessionStatusAwaitingApproval, SelectedWorkerID: "worker-1"},
		Task:                &runtimeapi.TaskRecord{TaskID: "task-1", Title: "Chat task", Status: runtimeapi.TaskStatusInProgress, LatestSessionID: "sess-1", Annotations: annotations},
		SelectedWorker:      &runtimeapi.SessionWorkerRecord{WorkerID: "worker-1", WorkerType: "managed_agent", Status: runtimeapi.WorkerStatusRunning},
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Status: runtimeapi.ApprovalStatusPending},
			{CheckpointID: "approval-2", Status: runtimeapi.ApprovalStatusApproved},
		},
		ToolActions:         []runtimeapi.ToolActionRecord{{ToolActionID: "tool-1", ToolType: "managed_agent_turn"}},
		EvidenceRecords:     []runtimeapi.EvidenceRecord{{EvidenceID: "evidence-1"}},
		Events: []runtimeapi.SessionEventRecord{
			{Sequence: 1, EventType: runtimeapi.SessionEventType("tool_proposal.generated"), Payload: proposalPayload},
			{Sequence: 2, EventType: runtimeapi.SessionEventType("worker.progress"), Payload: mustJSON(map[string]interface{}{"summary": "Worker is waiting for approval."})},
		},
		OpenApprovalCount: 1,
	}
	view := &runtimeclient.ThreadReview{Task: *timeline.Task, Timeline: timeline, ToolProposals: runtimeclient.ListToolProposals(timeline), RecentEvents: runtimeclient.SummarizeRecentEvents(timeline.Events, 5)}
	report := buildChatopsStatusReport(view)
	if report.ThreadID != "1730.55" {
		t.Fatalf("threadId=%q", report.ThreadID)
	}
	if report.OpenApprovals != 1 {
		t.Fatalf("openApprovals=%d", report.OpenApprovals)
	}
	if len(report.ApprovalCheckpoints) != 2 {
		t.Fatalf("approvalCheckpoints=%d", len(report.ApprovalCheckpoints))
	}
	if len(report.PendingApprovals) != 1 {
		t.Fatalf("pendingApprovals=%d", len(report.PendingApprovals))
	}
	if len(report.PendingProposals) != 1 {
		t.Fatalf("pendingProposals=%d", len(report.PendingProposals))
	}
}

func TestRenderChatopsApprovalDecisionUpdate(t *testing.T) {
	response := &runtimeapi.ApprovalCheckpointDecisionResponse{
		Applied:      true,
		SessionID:    "sess-1",
		CheckpointID: "approval-1",
		Decision:     "APPROVE",
		Status:       runtimeapi.ApprovalStatusApproved,
		Reason:       "Safe to continue.",
		ReviewedAt:   "2026-03-07T20:40:00Z",
	}
	update := renderChatopsApprovalDecisionUpdate(response, nil)
	if !containsAll(update, "AgentOps thread update", "approval-1", "APPROVE", "APPROVED", "Safe to continue.") {
		t.Fatalf("unexpected update: %s", update)
	}
}

func TestRenderChatopsProposalDecisionUpdate(t *testing.T) {
	response := &runtimeapi.ToolProposalDecisionResponse{
		Applied:      true,
		SessionID:    "sess-1",
		ProposalID:   "proposal-1",
		Decision:     "DENY",
		Status:       "DENIED",
		Reason:       "Not approved.",
		ToolActionID: "tool-1",
		ActionStatus: runtimeapi.ToolActionStatusPolicyBlocked,
		ReviewedAt:   "2026-03-07T20:41:00Z",
	}
	update := renderChatopsProposalDecisionUpdate(response, nil)
	if !containsAll(update, "AgentOps thread update", "proposal-1", "DENY", "DENIED", "tool-1", "POLICY_BLOCKED") {
		t.Fatalf("unexpected update: %s", update)
	}
}

func TestRenderChatopsTurnUpdate(t *testing.T) {
	invoke := &runtimeapi.AgentInvokeResponse{
		TaskID:           "task-1",
		SessionID:        "sess-2",
		ExecutionMode:    runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
		FinishReason:     "completed",
		SelectedWorkerID: "worker-9",
		WorkerType:       "managed_agent",
		OutputText:       "Reviewed the deployment and proposed the next governed action.",
	}
	report := &chatopsStatusReport{
		ThreadID:            "1730.55",
		TaskID:              "task-1",
		TaskStatus:          "IN_PROGRESS",
		LatestSessionID:     "sess-2",
		OpenApprovals:       1,
		PendingProposals:    []runtimeclient.ToolProposalReview{{ProposalID: "proposal-1"}},
		LatestWorkerSummary: "Awaiting approval.",
	}
	update := renderChatopsTurnUpdate(invoke, report)
	if !containsAll(update, "AgentOps thread update", "1730.55", "sess-2", "managed_codex_worker", "completed", "Awaiting approval.") {
		t.Fatalf("unexpected update: %s", update)
	}
}

func TestRenderChatopsUpdateIncludesRecentActivityAndActionHints(t *testing.T) {
	report := &chatopsStatusReport{
		SourceSystem:        "slack",
		ChannelID:           "C123",
		ChannelName:         "ops-alerts",
		ThreadID:            "1730.55",
		TaskID:              "task-1",
		TaskStatus:          "IN_PROGRESS",
		LatestSessionID:     "sess-1",
		SessionStatus:       "AWAITING_APPROVAL",
		LatestWorkerSummary: "Worker is waiting for operator review.",
		PendingApprovals: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply"},
			{CheckpointID: "approval-2", Scope: "terminal.exec"},
		},
		PendingProposals: []runtimeclient.ToolProposalReview{
			{ProposalID: "proposal-1", Summary: "Run pwd"},
			{ProposalID: "proposal-2", Summary: "Run ls"},
		},
		RecentEvents: []runtimeclient.EventSummary{
			{Label: "Worker Progress", Detail: "Worker collected deployment context."},
			{Label: "Tool Proposal", Detail: "Tool proposal generated for shell execution."},
		},
	}
	update := renderChatopsUpdate(report)
	if !containsAll(update,
		"AgentOps thread update",
		"Recent activity:",
		"Worker Progress: Worker collected deployment context.",
		"Action hints:",
		"--checkpoint-id <id>",
		"approval-1, approval-2",
		"--proposal-id <id>",
		"proposal-1, proposal-2",
	) {
		t.Fatalf("unexpected update: %s", update)
	}
}

func TestRenderChatopsUpdateSinglePendingUsesDirectHint(t *testing.T) {
	report := &chatopsStatusReport{
		SourceSystem:    "slack",
		ThreadID:        "1730.55",
		ChannelID:       "C123",
		TaskID:          "task-1",
		LatestSessionID: "sess-1",
		PendingApprovals: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply"},
		},
		PendingProposals: []runtimeclient.ToolProposalReview{
			{ProposalID: "proposal-1", Summary: "Run pwd"},
		},
	}
	update := renderChatopsUpdate(report)
	if !containsAll(update,
		"AgentOps thread update",
		"approvals decide --thread-id 1730.55 --source-system slack --channel-id C123 --decision APPROVE|DENY",
		"proposals decide --thread-id 1730.55 --source-system slack --channel-id C123 --decision APPROVE|DENY",
	) {
		t.Fatalf("unexpected direct action hint packaging: %s", update)
	}
}

func TestRenderChatopsUpdateIncludesOrgAdminReviewHints(t *testing.T) {
	report := &chatopsStatusReport{
		SourceSystem:    "slack",
		ChannelID:       "C123",
		ThreadID:        "1730.55",
		TaskID:          "task-1",
		LatestSessionID: "sess-1",
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{
				CheckpointID: "approval-org-1",
				Status:       runtimeapi.ApprovalStatusPending,
				Annotations: mustJSON(map[string]interface{}{
					"orgAdminDecisionBinding": map[string]interface{}{
						"profileId":          "centralized_enterprise_admin",
						"profileLabel":       "Centralized Enterprise Admin",
						"organizationModel":  "centralized_enterprise",
						"bindingId":          "break_glass_timebox",
						"bindingLabel":       "Break-glass timebox",
						"category":           "break_glass",
						"bindingMode":        "enforced",
						"selectedRoleBundle": "enterprise_break_glass_admin",
						"requiredInputs":     []string{"break_glass_expiry", "incident_id"},
						"requestedInputKeys": []string{"break_glass_expiry", "incident_id"},
						"decisionSurfaces":   []string{"chatops", "workflow"},
						"boundaryRequirements": []string{
							"runtime_authz",
						},
						"inputValues": map[string]interface{}{
							"break_glass_expiry": "2026-03-09T00:00:00Z",
							"incident_id":        "INC-9001",
						},
					},
				}),
			},
		},
	}
	update := renderChatopsUpdate(report)
	if !containsAll(update,
		"Org-admin input values: break_glass_expiry=2026-03-09T00:00:00Z, incident_id=INC-9001",
		"Resolve 1 pending org-admin decision reviews before enterprise handoff.",
		"Org-admin decision is restricted to role bundle enterprise_break_glass_admin.",
		"Org-admin review requires input coverage for break_glass_expiry, incident_id.",
	) {
		t.Fatalf("unexpected chatops org-admin update: %s", update)
	}
}

func TestRenderChatopsDeltaUpdate(t *testing.T) {
	report := &chatopsStatusReport{
		SourceSystem: "slack",
		ChannelID:    "C123",
		ThreadID:     "1730.55",
		TaskID:       "task-1",
		TaskStatus:   "IN_PROGRESS",
	}
	items := []runtimeapi.SessionEventRecord{
		{EventType: runtimeapi.SessionEventType("worker.progress"), Payload: mustJSON(map[string]interface{}{"summary": "Worker collected deployment context."})},
		{EventType: runtimeapi.SessionEventType("tool_proposal.generated"), Payload: mustJSON(map[string]interface{}{"summary": "Tool proposal generated for shell execution."})},
	}
	update := renderChatopsDeltaUpdate(report, items)
	if !containsAll(update,
		"AgentOps thread update",
		"Type: follow_delta",
		"Observed 2 new native event(s).",
		"Worker Progress: Worker collected deployment context.",
		"Tool Proposal: Tool proposal generated for shell execution.",
	) {
		t.Fatalf("unexpected delta update: %s", update)
	}
}

func TestRenderChatopsReport(t *testing.T) {
	client, shutdown := newChatopsCatalogTestClient(t)
	defer shutdown()
	report := &chatopsStatusReport{
		SourceSystem:            "slack",
		ChannelID:               "C123",
		ChannelName:             "ops-alerts",
		ThreadID:                "1730.55",
		TaskID:                  "task-1",
		TaskStatus:              "IN_PROGRESS",
		LatestSessionID:         "sess-1",
		SessionStatus:           "RUNNING",
		SelectedWorkerID:        "worker-1",
		SelectedWorkerType:      "managed_agent",
		SelectedWorkerAdapterID: "codex",
		SelectedWorkerState:     "RUNNING",
		SelectedExecutionMode:   runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
		OpenApprovals:           1,
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{
				CheckpointID: "approval-org-1",
				Status:       runtimeapi.ApprovalStatusPending,
				Annotations: mustJSON(map[string]interface{}{
					"orgAdminDecisionBinding": map[string]interface{}{
						"profileId":          "centralized_enterprise_admin",
						"profileLabel":       "Centralized Enterprise Admin",
						"organizationModel":  "centralized_enterprise",
						"bindingId":          "break_glass_timebox",
						"bindingLabel":       "Break-glass timebox",
						"category":           "break_glass",
						"selectedRoleBundle": "enterprise_break_glass_admin",
						"requiredInputs":     []string{"break_glass_expiry", "incident_id"},
						"requestedInputKeys": []string{"break_glass_expiry", "incident_id"},
						"inputValues": map[string]interface{}{
							"break_glass_expiry": "2026-03-09T00:00:00Z",
							"incident_id":        "INC-9001",
						},
					},
				}),
			},
		},
		PendingProposals:        []runtimeclient.ToolProposalReview{{ProposalID: "proposal-1", Summary: "Run pwd"}},
		ToolActionCount:         2,
		EvidenceCount:           1,
		LatestWorkerSummary:     "Managed worker is awaiting governed approval.",
		RecentEvents:            []runtimeclient.EventSummary{{Label: "Worker Progress", Detail: "Awaiting approval."}},
	}
	rendered, err := renderChatopsReport(context.Background(), client, report, runtimeclient.EnterpriseReportSelection{})
	if err != nil {
		t.Fatalf("render chatops report: %v", err)
	}
	if !containsAll(rendered,
		"AgentOps conversation governance report",
		"Type: report",
		"Applicable policy packs:",
		"Managed Codex Worker Operator (managed_codex_worker_operator)",
		"Worker capability coverage:",
		"Managed Codex Worker | managed_codex_worker | agentops_gateway",
		"Boundary requirements:",
		"Org-admin input values: break_glass_expiry=2026-03-09T00:00:00Z, incident_id=INC-9001",
		"Resolve 1 pending org-admin decision reviews before enterprise handoff.",
	) {
		t.Fatalf("unexpected chatops report: %s", rendered)
	}
}

func TestMatchesChatopsLookupByThreadAndSource(t *testing.T) {
	annotations, _ := json.Marshal(map[string]interface{}{
		"ingressKind":  "chatops",
		"sourceSystem": "slack",
		"channelId":    "C123",
		"channelName":  "ops-alerts",
		"threadId":     "1730.55",
		"messageId":    "m-123",
	})
	task := runtimeapi.TaskRecord{
		TaskID:      "task-1",
		Annotations: annotations,
	}
	lookup := chatopsLookupOptions{
		SourceSystem: "slack",
		ThreadID:     "1730.55",
	}
	if !matchesChatopsLookup(task, lookup) {
		t.Fatalf("expected task to match lookup")
	}
}

func TestMatchesChatopsLookupRejectsNonChatopsTask(t *testing.T) {
	annotations, _ := json.Marshal(map[string]interface{}{
		"ingressKind":  "workflow",
		"sourceSystem": "slack",
		"threadId":     "1730.55",
	})
	task := runtimeapi.TaskRecord{
		TaskID:      "task-1",
		Annotations: annotations,
	}
	lookup := chatopsLookupOptions{ThreadID: "1730.55"}
	if matchesChatopsLookup(task, lookup) {
		t.Fatalf("expected non-chatops task to be rejected")
	}
}

func TestMatchesChatopsLookupRejectsDifferentThread(t *testing.T) {
	annotations, _ := json.Marshal(map[string]interface{}{
		"ingressKind":  "chatops",
		"sourceSystem": "slack",
		"threadId":     "1730.55",
	})
	task := runtimeapi.TaskRecord{
		TaskID:      "task-1",
		Annotations: annotations,
	}
	lookup := chatopsLookupOptions{
		SourceSystem: "slack",
		ThreadID:     "other-thread",
	}
	if matchesChatopsLookup(task, lookup) {
		t.Fatalf("expected mismatched thread lookup to fail")
	}
}

func TestResolveChatopsApprovalTargetSinglePending(t *testing.T) {
	report := &chatopsStatusReport{
		LatestSessionID: "sess-1",
		PendingApprovals: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply"},
		},
	}
	sessionID, checkpointID, err := resolveChatopsApprovalTarget(report, "", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sessionID != "sess-1" || checkpointID != "approval-1" {
		t.Fatalf("resolved=(%q,%q)", sessionID, checkpointID)
	}
}

func TestResolveChatopsApprovalTargetRequiresCheckpointWhenMultiple(t *testing.T) {
	report := &chatopsStatusReport{
		LatestSessionID: "sess-1",
		PendingApprovals: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply"},
			{CheckpointID: "approval-2", Scope: "terminal.exec"},
		},
	}
	_, _, err := resolveChatopsApprovalTarget(report, "", "")
	if err == nil || !strings.Contains(err.Error(), "--checkpoint-id") {
		t.Fatalf("expected checkpoint selection error, got %v", err)
	}
}

func TestResolveChatopsProposalTargetSinglePending(t *testing.T) {
	report := &chatopsStatusReport{
		LatestSessionID: "sess-1",
		PendingProposals: []runtimeclient.ToolProposalReview{
			{ProposalID: "proposal-1", Summary: "Run pwd"},
		},
	}
	sessionID, proposalID, err := resolveChatopsProposalTarget(report, "", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sessionID != "sess-1" || proposalID != "proposal-1" {
		t.Fatalf("resolved=(%q,%q)", sessionID, proposalID)
	}
}

func TestResolveChatopsProposalTargetRequiresProposalWhenMultiple(t *testing.T) {
	report := &chatopsStatusReport{
		LatestSessionID: "sess-1",
		PendingProposals: []runtimeclient.ToolProposalReview{
			{ProposalID: "proposal-1", Summary: "Run pwd"},
			{ProposalID: "proposal-2", Summary: "Run ls"},
		},
	}
	_, _, err := resolveChatopsProposalTarget(report, "", "")
	if err == nil || !strings.Contains(err.Error(), "--proposal-id") {
		t.Fatalf("expected proposal selection error, got %v", err)
	}
}

func TestRenderChatopsParityFixtureIncludesSharedGuidance(t *testing.T) {
	fixture := loadChatopsParityFixture(t)
	report := &chatopsStatusReport{
		SourceSystem:        "slack",
		ChannelID:           "C123",
		ChannelName:         "ops-alerts",
		ThreadID:            "1730.55",
		TaskID:              "task-parity-1",
		TaskStatus:          "IN_PROGRESS",
		LatestSessionID:     "sess-parity-1",
		SessionStatus:       "AWAITING_APPROVAL",
		SelectedWorkerID:    "worker-parity-1",
		SelectedWorkerType:  "managed_agent",
		SelectedWorkerState: "RUNNING",
		OpenApprovals:       2,
		PendingApprovals: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply", Status: runtimeapi.ApprovalStatusPending},
			{CheckpointID: "approval-2", Scope: "terminal.exec", Status: runtimeapi.ApprovalStatusPending},
		},
		PendingProposals: []runtimeclient.ToolProposalReview{
			{ProposalID: "proposal-1", Summary: "Tool proposal generated for shell execution."},
		},
		ToolActionCount:     1,
		EvidenceCount:       1,
		LatestWorkerSummary: fixture.Expected.Summary,
		RecentEvents: []runtimeclient.EventSummary{
			{Label: "Worker Progress", Detail: "Worker collected deployment context."},
			{Label: "Tool Proposal", Detail: "Tool proposal generated for shell execution."},
		},
	}
	rendered := renderChatopsUpdate(report)
	for _, part := range append(fixture.Expected.EventLines, "Action hints:", "--checkpoint-id <id>", fixture.Expected.Summary) {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}

func containsAll(text string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(text, part) {
			return false
		}
	}
	return true
}

func mustJSON(value interface{}) json.RawMessage {
	payload, _ := json.Marshal(value)
	return payload
}

func newChatopsCatalogTestClient(t *testing.T) (*runtimeclient.Client, func()) {
	t.Helper()
	httpClient := &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		var payload interface{}
		switch req.URL.Path {
		case "/v1alpha2/runtime/worker-capabilities":
			payload = runtimeapi.WorkerCapabilityCatalogResponse{
				Count: 1,
				Items: []runtimeapi.WorkerCapabilityCatalogEntry{{
					Label:                "Managed Codex Worker",
					ExecutionMode:        runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
					WorkerType:           "managed_agent",
					AdapterID:            "codex",
					Provider:             "agentops_gateway",
					BoundaryRequirements: []string{"governed_tool_execution"},
				}},
			}
		case "/v1alpha2/runtime/policy-packs":
			payload = runtimeapi.PolicyPackCatalogResponse{
				Count: 1,
				Items: []runtimeapi.PolicyPackCatalogEntry{{
					PackID:                   "managed_codex_worker_operator",
					Label:                    "Managed Codex Worker Operator",
					ApplicableExecutionModes: []string{runtimeapi.AgentInvokeExecutionModeManagedCodexWorker},
					ApplicableWorkerTypes:    []string{"managed_agent"},
					ApplicableAdapterIDs:     []string{"codex"},
					ClientSurfaces:           []string{"chatops"},
					ReportingSurfaces:        []string{"report"},
					BoundaryRequirements:     []string{"agentops_gateway_boundary"},
				}},
			}
		case "/v1alpha2/runtime/export-profiles":
			reportType := req.URL.Query().Get("reportType")
			payload = runtimeapi.ExportProfileCatalogResponse{
				Count: 1,
				Items: []runtimeapi.ExportProfileCatalogEntry{{
					ExportProfile:           map[bool]string{true: "conversation_follow", false: "conversation_review"}[strings.Contains(reportType, "delta")],
					Label:                   map[bool]string{true: "Conversation Follow", false: "Conversation Review"}[strings.Contains(reportType, "delta")],
					DefaultAudience:         "conversation_operator",
					AllowedAudiences:        []string{"conversation_operator", "channel_reviewer", "security_review"},
					DefaultRetentionClass:   map[bool]string{true: "short", false: "standard"}[strings.Contains(reportType, "delta")],
					AllowedRetentionClasses: []string{"short", "standard", "archive"},
					ClientSurfaces:          []string{"chatops"},
					ReportTypes:             []string{"report", "delta-report"},
					DeliveryChannels:        []string{"report", "update", "stream"},
					RedactionMode:           "structured_and_text",
				}},
			}
		case "/v1alpha2/runtime/org-admin-profiles":
			payload = runtimeapi.OrgAdminCatalogResponse{
				Count: 1,
				Items: []runtimeapi.OrgAdminCatalogEntry{{
					ProfileID:                 "centralized_enterprise_admin",
					Label:                     "Centralized Enterprise Admin",
					OrganizationModel:         "centralized_enterprise",
					DelegationModel:           "central_it_with_tenant_project_delegation",
					AdminRoleBundles:          []string{"enterprise.org_admin"},
					DelegatedAdminRoleBundles: []string{"enterprise.tenant_admin"},
					BreakGlassRoleBundles:     []string{"enterprise.break_glass_admin"},
					DirectorySyncInputs:       []string{"idp_group", "tenant_id"},
					ResidencyProfiles:         []string{"single_region_tenant_pinning"},
					ResidencyExceptionInputs:  []string{"residency_exception_ticket"},
					LegalHoldProfiles:         []string{"litigation_hold"},
					LegalHoldExceptionInputs:  []string{"legal_hold_case_id"},
					NetworkBoundaryProfiles:   []string{"enterprise_proxy_required"},
					FleetRolloutProfiles:      []string{"mdm_managed_desktop_ring"},
					QuotaDimensions:           []string{"organization", "tenant"},
					QuotaOverlayInputs:        []string{"tenant_id"},
					ChargebackDimensions:      []string{"cost_center"},
					ChargebackOverlayInputs:   []string{"cost_center"},
					EnforcementHooks:          []string{"delegated_admin_scope_guard"},
					BoundaryRequirements:      []string{"runtime_authz"},
					ReportingSurfaces:         []string{"admin_report"},
					ClientSurfaces:            []string{"chatops"},
				}},
			}
		default:
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader("not found")),
				Request:    req,
			}, nil
		}
		body, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(string(body))),
			Request:    req,
		}, nil
	})}
	cfg := runtimeclient.Config{RuntimeAPIBaseURL: "http://runtime.test", TenantID: "tenant-local", ProjectID: "project-local"}
	return runtimeclient.NewClientWithHTTPClient(cfg, httpClient), func() {}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}
