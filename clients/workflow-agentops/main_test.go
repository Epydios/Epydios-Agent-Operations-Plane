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

type workflowParityFixture struct {
	Expected struct {
		Summary    string   `json:"summary"`
		EventLines []string `json:"eventLines"`
	} `json:"expected"`
}

func loadWorkflowParityFixture(t *testing.T) workflowParityFixture {
	t.Helper()
	payload, err := os.ReadFile(filepath.Join("..", "testdata", "m19-cross-surface-parity.json"))
	if err != nil {
		t.Fatalf("read parity fixture: %v", err)
	}
	var fixture workflowParityFixture
	if err := json.Unmarshal(payload, &fixture); err != nil {
		t.Fatalf("unmarshal parity fixture: %v", err)
	}
	return fixture
}

func TestBuildWorkflowAnnotations(t *testing.T) {
	payload := &workflowIntakePayload{
		SourceSystem: "jira",
		TicketID:     "OPS-101",
		TicketURL:    "https://tickets.example/OPS-101",
		Labels:       []string{"incident", "sev2"},
		Annotations:  map[string]interface{}{"priority": "high"},
	}
	annotations := buildWorkflowAnnotations(payload)
	if annotations["sourceSystem"] != "jira" {
		t.Fatalf("sourceSystem=%v", annotations["sourceSystem"])
	}
	if annotations["ticketId"] != "OPS-101" {
		t.Fatalf("ticketId=%v", annotations["ticketId"])
	}
	labels, ok := annotations["labels"].([]string)
	if !ok || len(labels) != 2 {
		t.Fatalf("labels=%T %#v", annotations["labels"], annotations["labels"])
	}
	if annotations["priority"] != "high" {
		t.Fatalf("priority=%v", annotations["priority"])
	}
}

func TestBuildWorkflowStatusReport(t *testing.T) {
	annotations, _ := json.Marshal(map[string]interface{}{
		"sourceSystem": "jira",
		"ticketId":     "OPS-101",
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
		Session:        runtimeapi.SessionRecord{SessionID: "sess-1", Status: runtimeapi.SessionStatusAwaitingApproval, SelectedWorkerID: "worker-1"},
		Task:           &runtimeapi.TaskRecord{TaskID: "task-1", Title: "Test task", Status: runtimeapi.TaskStatusInProgress, LatestSessionID: "sess-1", Annotations: annotations},
		SelectedWorker: &runtimeapi.SessionWorkerRecord{WorkerID: "worker-1", WorkerType: "managed_agent", Status: runtimeapi.WorkerStatusRunning},
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Status: runtimeapi.ApprovalStatusPending},
			{CheckpointID: "approval-2", Status: runtimeapi.ApprovalStatusApproved},
		},
		ToolActions:     []runtimeapi.ToolActionRecord{{ToolActionID: "tool-1", ToolType: "managed_agent_turn"}},
		EvidenceRecords: []runtimeapi.EvidenceRecord{{EvidenceID: "evidence-1"}},
		Events: []runtimeapi.SessionEventRecord{
			{Sequence: 1, EventType: runtimeapi.SessionEventType("tool_proposal.generated"), Payload: proposalPayload},
			{Sequence: 2, EventType: runtimeapi.SessionEventType("worker.progress"), Payload: mustJSON(map[string]interface{}{"summary": "Worker is waiting for approval."})},
		},
		OpenApprovalCount: 1,
	}
	view := &runtimeclient.ThreadReview{Task: *timeline.Task, Timeline: timeline, ToolProposals: runtimeclient.ListToolProposals(timeline), RecentEvents: runtimeclient.SummarizeRecentEvents(timeline.Events, 5)}
	report := buildWorkflowStatusReport(view)
	if report.TicketID != "OPS-101" {
		t.Fatalf("ticketId=%q", report.TicketID)
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

func TestRenderWorkflowUpdateUsesGovernedEnvelope(t *testing.T) {
	report := &workflowStatusReport{
		SourceSystem:        "jira",
		TicketID:            "OPS-101",
		WorkflowID:          "incident-response",
		TaskID:              "task-1",
		Title:               "Investigate checkout timeouts",
		TaskStatus:          "IN_PROGRESS",
		LatestSessionID:     "sess-1",
		SessionStatus:       "AWAITING_APPROVAL",
		SelectedWorkerID:    "worker-1",
		SelectedWorkerType:  "managed_agent",
		SelectedWorkerState: "RUNNING",
		OpenApprovals:       1,
		PendingApprovals: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply"},
		},
		PendingProposals: []runtimeclient.ToolProposalReview{
			{ProposalID: "proposal-1", Summary: "Run pwd"},
		},
		ToolActionCount:     2,
		EvidenceCount:       1,
		LatestWorkerSummary: "Awaiting operator review.",
		RecentEvents: []runtimeclient.EventSummary{
			{Label: "Worker Progress", Detail: "Worker collected deployment context."},
		},
	}
	update := renderWorkflowUpdate(report)
	if !containsAll(update,
		"AgentOps ticket update",
		"Type: status",
		"Workflow: jira | incident-response",
		"Ticket: OPS-101",
		"Task: task-1 (IN_PROGRESS)",
		"Pending approval: approval-1 (runtime.apply)",
		"Pending proposal: proposal-1 (Run pwd)",
		"Recent activity:",
		"Worker Progress: Worker collected deployment context.",
		"Action hints:",
		"approvals decide --ticket-id OPS-101 --source-system jira --workflow-id incident-response --decision APPROVE|DENY",
		"proposals decide --ticket-id OPS-101 --source-system jira --workflow-id incident-response --decision APPROVE|DENY",
	) {
		t.Fatalf("unexpected workflow update: %s", update)
	}
}

func TestRenderWorkflowUpdateIncludesOrgAdminReviewHints(t *testing.T) {
	report := &workflowStatusReport{
		SourceSystem:    "jira",
		TicketID:        "OPS-101",
		WorkflowID:      "incident-response",
		TaskID:          "task-1",
		TaskStatus:      "IN_PROGRESS",
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
						"decisionSurfaces":   []string{"workflow", "chat"},
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
	update := renderWorkflowUpdate(report)
	if !containsAll(update,
		"Org-admin input values: break_glass_expiry=2026-03-09T00:00:00Z, incident_id=INC-9001",
		"Resolve 1 pending org-admin decision reviews before enterprise handoff.",
		"Org-admin decision is restricted to role bundle enterprise_break_glass_admin.",
		"Org-admin review requires input coverage for break_glass_expiry, incident_id.",
	) {
		t.Fatalf("unexpected workflow org-admin update: %s", update)
	}
}

func TestRenderWorkflowIntakeUpdate(t *testing.T) {
	payload := &workflowIntakePayload{
		SourceSystem:  "jira",
		ExecutionMode: runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
	}
	response := &workflowIntakeResponse{
		Task: &runtimeapi.TaskRecord{TaskID: "task-1"},
		Invoke: &runtimeapi.AgentInvokeResponse{
			TaskID:        "task-1",
			SessionID:     "sess-1",
			ExecutionMode: runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
			FinishReason:  "completed",
		},
	}
	report := &workflowStatusReport{
		SourceSystem:        "jira",
		TicketID:            "OPS-101",
		WorkflowID:          "incident-response",
		TaskID:              "task-1",
		Title:               "Investigate checkout timeouts",
		TaskStatus:          "IN_PROGRESS",
		LatestSessionID:     "sess-1",
		SessionStatus:       "RUNNING",
		LatestWorkerSummary: "Initial review started.",
	}
	update := renderWorkflowIntakeUpdate(payload, response, report)
	if !containsAll(update,
		"AgentOps ticket update",
		"Type: intake",
		"Workflow: jira | incident-response",
		"Ticket: OPS-101",
		"Task: task-1 (IN_PROGRESS)",
		"Summary: Governed workflow task created and initial turn started.",
		"Source: jira",
		"Title: Investigate checkout timeouts",
		"Execution mode: managed_codex_worker",
		"Finish: completed",
		"Recent activity:",
		"Initial review started.",
	) {
		t.Fatalf("unexpected workflow intake update: %s", update)
	}
}

func TestRenderWorkflowTurnUpdate(t *testing.T) {
	invoke := &runtimeapi.AgentInvokeResponse{
		TaskID:           "task-1",
		SessionID:        "sess-2",
		ExecutionMode:    runtimeapi.AgentInvokeExecutionModeManagedCodexWorker,
		FinishReason:     "completed",
		SelectedWorkerID: "worker-9",
		WorkerType:       "managed_agent",
		OutputText:       "Reviewed the incident and proposed the next governed action.",
	}
	report := &workflowStatusReport{
		SourceSystem:        "jira",
		TicketID:            "OPS-101",
		WorkflowID:          "incident-response",
		TaskID:              "task-1",
		TaskStatus:          "IN_PROGRESS",
		LatestSessionID:     "sess-2",
		OpenApprovals:       1,
		PendingProposals:    []runtimeclient.ToolProposalReview{{ProposalID: "proposal-1"}},
		LatestWorkerSummary: "Awaiting approval.",
	}
	update := renderWorkflowTurnUpdate(invoke, report)
	if !containsAll(update,
		"AgentOps ticket update",
		"Type: turn",
		"Workflow: jira | incident-response",
		"Ticket: OPS-101",
		"sess-2",
		"managed_codex_worker",
		"completed",
		"Awaiting approval.",
	) {
		t.Fatalf("unexpected workflow turn update: %s", update)
	}
}

func TestRenderConnectionStatus(t *testing.T) {
	rendered := renderConnectionStatus(&runtimeclient.ConnectionStatus{
		State:             "connected",
		RuntimeAPIBaseURL: "http://127.0.0.1:18080",
		ScopeLabel:        "tenant-local / project-local",
		AuthMode:          "bearer_token",
		AuthReady:         true,
		Message:           "Runtime reachable. Scope and auth are ready.",
	})
	if !containsAll(rendered,
		"State: connected",
		"Runtime API: http://127.0.0.1:18080",
		"Scope: tenant-local / project-local",
		"Auth: bearer token configured",
		"Message: Runtime reachable. Scope and auth are ready.",
	) {
		t.Fatalf("unexpected connection status: %s", rendered)
	}
}

func TestRenderWorkflowDeltaUpdate(t *testing.T) {
	report := &workflowStatusReport{
		SourceSystem: "jira",
		TicketID:     "OPS-101",
		WorkflowID:   "incident-response",
		TaskID:       "task-1",
		TaskStatus:   "IN_PROGRESS",
	}
	items := []runtimeapi.SessionEventRecord{
		{EventType: runtimeapi.SessionEventType("worker.progress"), Payload: mustJSON(map[string]interface{}{"summary": "Worker collected deployment context."})},
		{EventType: runtimeapi.SessionEventType("tool_proposal.generated"), Payload: mustJSON(map[string]interface{}{"summary": "Tool proposal generated for shell execution."})},
	}
	update := renderWorkflowDeltaUpdate(report, items)
	if !containsAll(update,
		"AgentOps ticket update",
		"Type: follow_delta",
		"Observed 2 new native event(s).",
		"Worker Progress: Worker collected deployment context.",
		"Tool Proposal: Tool proposal generated for shell execution.",
	) {
		t.Fatalf("unexpected workflow delta update: %s", update)
	}
}

func TestRenderWorkflowHandoff(t *testing.T) {
	report := &workflowStatusReport{
		SourceSystem:        "jira",
		TicketID:            "OPS-101",
		WorkflowID:          "incident-response",
		TaskID:              "task-1",
		Title:               "Investigate checkout timeouts",
		TaskStatus:          "IN_PROGRESS",
		LatestSessionID:     "sess-1",
		SessionStatus:       "RUNNING",
		SelectedWorkerID:    "worker-1",
		SelectedWorkerType:  "managed_agent",
		SelectedWorkerState: "RUNNING",
		OpenApprovals:       0,
		ApprovalCheckpoints: []runtimeapi.ApprovalCheckpointRecord{
			{CheckpointID: "approval-1", Scope: "runtime.apply", Status: runtimeapi.ApprovalStatusApproved},
		},
		SessionEvents: []runtimeapi.SessionEventRecord{
			{Sequence: 1, EventType: runtimeapi.SessionEventType("worker.progress"), Payload: mustJSON(map[string]interface{}{"summary": "Worker collected deployment context."})},
			{Sequence: 2, EventType: runtimeapi.SessionEventType("evidence.recorded"), Payload: mustJSON(map[string]interface{}{"kind": "audit_bundle"})},
		},
		EvidenceRecords: []runtimeapi.EvidenceRecord{
			{EvidenceID: "evidence-1", Kind: "audit_bundle", URI: "memory://evidence-1", CheckpointID: "approval-1", ToolActionID: "tool-1"},
		},
		EvidenceCount:       1,
		LatestWorkerSummary: "Ready for incident review.",
		RecentEvents: []runtimeclient.EventSummary{
			{Label: "Worker Progress", Detail: "Worker collected deployment context."},
			{Label: "Evidence Recorded", Detail: "audit_bundle"},
		},
	}
	rendered := renderWorkflowHandoff(report)
	if !containsAll(rendered,
		"AgentOps ticket update",
		"Type: handoff",
		"Workflow: jira | incident-response",
		"Ticket: OPS-101",
		"Summary: Workflow handoff package is ready for review or escalation.",
		"Audit continuity: 2 session event(s) captured for sess-1.",
		"Approval linkage: approval-1 | runtime.apply | APPROVED",
		"Evidence handoff: audit_bundle | evidence-1 | memory://evidence-1 | checkpoint=approval-1 | toolAction=tool-1",
	) {
		t.Fatalf("unexpected workflow handoff: %s", rendered)
	}
}

func TestRenderWorkflowReport(t *testing.T) {
	client, shutdown := newWorkflowCatalogTestClient(t)
	defer shutdown()
	report := &workflowStatusReport{
		SourceSystem:            "jira",
		TicketID:                "OPS-101",
		WorkflowID:              "incident-response",
		TaskID:                  "task-1",
		Title:                   "Investigate checkout timeouts",
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
		PendingProposals:    []runtimeclient.ToolProposalReview{{ProposalID: "proposal-1", Summary: "Run pwd"}},
		ToolActionCount:     2,
		EvidenceCount:       1,
		LatestWorkerSummary: "Managed worker is awaiting governed approval.",
		RecentEvents:        []runtimeclient.EventSummary{{Label: "Worker Progress", Detail: "Awaiting approval."}},
	}
	rendered, err := renderWorkflowReport(context.Background(), client, report, runtimeclient.EnterpriseReportSelection{})
	if err != nil {
		t.Fatalf("render workflow report: %v", err)
	}
	if !containsAll(rendered,
		"AgentOps workflow governance report",
		"Type: report",
		"Applicable policy packs:",
		"Managed Codex Worker Operator (managed_codex_worker_operator)",
		"Worker capability coverage:",
		"Managed Codex Worker | managed_codex_worker | agentops_gateway",
		"Boundary requirements:",
		"Org-admin input values: break_glass_expiry=2026-03-09T00:00:00Z, incident_id=INC-9001",
		"Resolve 1 pending org-admin decision reviews before enterprise handoff.",
	) {
		t.Fatalf("unexpected workflow report: %s", rendered)
	}
}

func TestRenderWorkflowDeltaUpdateEmptySuppressesOutput(t *testing.T) {
	report := &workflowStatusReport{
		SourceSystem: "jira",
		TicketID:     "OPS-101",
		WorkflowID:   "incident-response",
		TaskID:       "task-1",
		TaskStatus:   "IN_PROGRESS",
	}
	if update := renderWorkflowDeltaUpdate(report, nil); update != "" {
		t.Fatalf("expected empty delta update, got: %s", update)
	}
}

func TestRenderWorkflowApprovalDecisionUpdate(t *testing.T) {
	response := &runtimeapi.ApprovalCheckpointDecisionResponse{
		Applied:      true,
		SessionID:    "sess-1",
		CheckpointID: "approval-1",
		Decision:     "APPROVE",
		Status:       runtimeapi.ApprovalStatusApproved,
		Reason:       "Safe to continue.",
		ReviewedAt:   "2026-03-07T21:40:00Z",
	}
	update := renderWorkflowApprovalDecisionUpdate(response, nil)
	if !containsAll(update, "AgentOps ticket update", "approval-1", "APPROVE", "APPROVED", "Safe to continue.") {
		t.Fatalf("unexpected approval update: %s", update)
	}
}

func TestRenderWorkflowProposalDecisionUpdate(t *testing.T) {
	response := &runtimeapi.ToolProposalDecisionResponse{
		Applied:      true,
		SessionID:    "sess-1",
		ProposalID:   "proposal-1",
		Decision:     "DENY",
		Status:       "DENIED",
		Reason:       "Not approved.",
		ToolActionID: "tool-1",
		ActionStatus: runtimeapi.ToolActionStatusPolicyBlocked,
		ReviewedAt:   "2026-03-07T21:41:00Z",
	}
	update := renderWorkflowProposalDecisionUpdate(response, nil)
	if !containsAll(update, "AgentOps ticket update", "proposal-1", "DENY", "DENIED", "tool-1", "POLICY_BLOCKED") {
		t.Fatalf("unexpected proposal update: %s", update)
	}
}

func TestMatchesWorkflowLookup(t *testing.T) {
	annotations, _ := json.Marshal(map[string]interface{}{
		"ingressKind":  "ticket_workflow",
		"sourceSystem": "jira",
		"ticketId":     "OPS-101",
		"workflowId":   "incident-response",
	})
	task := runtimeapi.TaskRecord{
		TaskID:      "task-1",
		Annotations: annotations,
	}
	lookup := workflowLookupOptions{
		SourceSystem: "jira",
		TicketID:     "OPS-101",
		WorkflowID:   "incident-response",
	}
	if !matchesWorkflowLookup(task, lookup) {
		t.Fatalf("expected workflow lookup match")
	}
}

func TestRenderWorkflowParityFixtureIncludesSharedGuidance(t *testing.T) {
	fixture := loadWorkflowParityFixture(t)
	report := &workflowStatusReport{
		SourceSystem:        "jira",
		TicketID:            "OPS-101",
		WorkflowID:          "incident-response",
		TaskID:              "task-parity-1",
		Title:               "Investigate checkout timeouts",
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
	rendered := renderWorkflowUpdate(report)
	for _, part := range append(fixture.Expected.EventLines, "Action hints:", "--checkpoint-id <id>", fixture.Expected.Summary) {
		if !strings.Contains(rendered, part) {
			t.Fatalf("missing %q in %s", part, rendered)
		}
	}
}

func mustJSON(value interface{}) json.RawMessage {
	payload, _ := json.Marshal(value)
	return payload
}

func newWorkflowCatalogTestClient(t *testing.T) (*runtimeclient.Client, func()) {
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
					ClientSurfaces:           []string{"workflow"},
					ReportingSurfaces:        []string{"report"},
					BoundaryRequirements:     []string{"agentops_gateway_boundary"},
				}},
			}
		case "/v1alpha2/runtime/export-profiles":
			reportType := req.URL.Query().Get("reportType")
			payload = runtimeapi.ExportProfileCatalogResponse{
				Count: 1,
				Items: []runtimeapi.ExportProfileCatalogEntry{{
					ExportProfile:           map[bool]string{true: "workflow_follow", false: "workflow_review"}[strings.Contains(reportType, "delta")],
					Label:                   map[bool]string{true: "Workflow Follow", false: "Workflow Review"}[strings.Contains(reportType, "delta")],
					DefaultAudience:         "workflow_operator",
					AllowedAudiences:        []string{"workflow_operator", "ticket_reviewer", "security_review"},
					DefaultRetentionClass:   map[bool]string{true: "short", false: "standard"}[strings.Contains(reportType, "delta")],
					AllowedRetentionClasses: []string{"short", "standard", "archive"},
					ClientSurfaces:          []string{"workflow"},
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
					ClientSurfaces:            []string{"workflow"},
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

func containsAll(value string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(value, part) {
			return false
		}
	}
	return true
}
