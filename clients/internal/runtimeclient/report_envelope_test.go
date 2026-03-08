package runtimeclient

import (
	"strings"
	"testing"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestBuildEnterpriseReportEnvelope(t *testing.T) {
	subject := EnterpriseReportSubject{
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
		Summary:              "Managed worker is awaiting governed approval.",
		Recent:               []string{"Worker Progress: Waiting on approval."},
		ActionHints:          []string{"- approvals decide --task-id task-1"},
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

	envelope := BuildEnterpriseReportEnvelope(subject, policyCatalog, capabilityCatalog)
	if len(envelope.ApplicablePolicyPacks) != 2 {
		t.Fatalf("policy packs=%v want 2", envelope.ApplicablePolicyPacks)
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
	}, &runtimeapi.PolicyPackCatalogResponse{}, &runtimeapi.WorkerCapabilityCatalogResponse{})
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
