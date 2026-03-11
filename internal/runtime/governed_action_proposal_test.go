package runtime

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNormalizeGovernedActionProposalPayloadPreservesExplicitEmptyRequiredGrants(t *testing.T) {
	normalized := normalizeGovernedActionProposalPayload(JSONObject{
		"type":              governedActionProposalType,
		"demoProfile":       governedActionDemoProfileFinancePaper,
		"requestLabel":      "Paper Trade Request: MSFT",
		"requestSummary":    "BUY 10 MSFT in paper account paper-main",
		"actionType":        "trade.execute",
		"actionClass":       "execute",
		"actionVerb":        "execute",
		"actionTarget":      "paper-broker-order",
		"resourceKind":      "broker-order",
		"resourceName":      "paper-order-msft",
		"boundaryClass":     "external_actuator",
		"riskTier":          "low",
		"requiredGrants":    []interface{}{},
		"evidenceReadiness": "READY",
		"environment":       "dev",
	})

	requiredGrants := normalizeGovernedActionStringSlice(normalized["requiredGrants"])
	if len(requiredGrants) != 0 {
		t.Fatalf("requiredGrants=%v want explicit empty slice preserved", requiredGrants)
	}
	if got := normalizedInterfaceString(normalized["riskTier"]); got != "low" {
		t.Fatalf("riskTier=%q want low", got)
	}
}

func TestGovernedActionProposalRequiresOperatorApprovalHonorsExplicitFlag(t *testing.T) {
	proposal := &sessionToolProposal{
		ProposalType: governedActionProposalType,
		Payload: JSONObject{
			"type":                     governedActionProposalType,
			"operatorApprovalRequired": false,
		},
	}
	if governedActionProposalRequiresOperatorApproval(proposal) {
		t.Fatal("operator approval should not be required when the governed proposal explicitly disables it")
	}
}

func TestNormalizeGovernedActionProposalPayloadDefaultsComplianceAdvisoryShape(t *testing.T) {
	normalized := normalizeGovernedActionProposalPayload(JSONObject{
		"type":           governedActionProposalType,
		"requestLabel":   "Compliance Conflict Report",
		"requestSummary": "Request a compliance report on whether holding MSFT creates a conflict if we already hold AAPL.",
		"workflowKind":   governedActionWorkflowAdvisoryRequest,
	})

	if got := normalizedInterfaceString(normalized["demoProfile"]); got != governedActionDemoProfileCompliance {
		t.Fatalf("demoProfile=%q want %q", got, governedActionDemoProfileCompliance)
	}
	if got := normalizedInterfaceString(normalized["actionType"]); got != "compliance.report.request" {
		t.Fatalf("actionType=%q want compliance.report.request", got)
	}
	if got := normalizedInterfaceString(normalized["actionClass"]); got != "read" {
		t.Fatalf("actionClass=%q want read", got)
	}
	if got := normalizedInterfaceString(normalized["actionVerb"]); got != "request" {
		t.Fatalf("actionVerb=%q want request", got)
	}
	if got := normalizedInterfaceString(normalized["boundaryClass"]); got != "model_gateway" {
		t.Fatalf("boundaryClass=%q want model_gateway", got)
	}
	if got := normalizedInterfaceString(normalized["riskTier"]); got != "low" {
		t.Fatalf("riskTier=%q want low", got)
	}
	if got := normalizedInterfaceString(normalized["evidenceReadiness"]); got != "READY" {
		t.Fatalf("evidenceReadiness=%q want READY", got)
	}
	if got := normalizedInterfaceString(normalized["resourceKind"]); got != "compliance-report" {
		t.Fatalf("resourceKind=%q want compliance-report", got)
	}
}

func TestNormalizeGovernedActionProposalPayloadInfersProductionDeleteShape(t *testing.T) {
	normalized := normalizeGovernedActionProposalPayload(JSONObject{
		"type":           governedActionProposalType,
		"requestLabel":   "Delete Production Trading Account Configuration",
		"requestSummary": "Delete the production trading account configuration for the live-main account.",
	})

	if got := normalizedInterfaceString(normalized["actionType"]); got != "external.delete" {
		t.Fatalf("actionType=%q want external.delete", got)
	}
	if got := normalizedInterfaceString(normalized["actionVerb"]); got != "delete" {
		t.Fatalf("actionVerb=%q want delete", got)
	}
	if got := normalizedInterfaceString(normalized["environment"]); got != "prod" {
		t.Fatalf("environment=%q want prod", got)
	}
}

func TestBuildRunCreateRequestFromGovernedActionProposalInjectsAuthorityContext(t *testing.T) {
	session := &SessionRecord{
		SessionID: "session-1",
		TaskID:    "task-1",
		TenantID:  "tenant-a",
		ProjectID: "project-a",
	}
	proposal := &sessionToolProposal{
		ProposalID:   "proposal-1",
		WorkerID:     "worker-1",
		ProposalType: governedActionProposalType,
		Payload: JSONObject{
			"type":                     governedActionProposalType,
			"requestLabel":             "Compliance Conflict Report",
			"requestSummary":           "Request a compliance report on whether holding MSFT creates a conflict if we already hold AAPL.",
			"workflowKind":             governedActionWorkflowAdvisoryRequest,
			"operatorApprovalRequired": false,
		},
	}
	identity := &RuntimeIdentity{
		Subject:    "user-123",
		ClientID:   "desktop-ui",
		Roles:      []string{"compliance.viewer", "runtime.run.create"},
		TenantIDs:  []string{"tenant-a"},
		ProjectIDs: []string{"project-a"},
	}

	runReq, normalized, err := buildRunCreateRequestFromGovernedActionProposal(session, proposal, time.Date(2026, time.March, 10, 15, 4, 5, 0, time.UTC), identity)
	if err != nil {
		t.Fatalf("buildRunCreateRequestFromGovernedActionProposal error: %v", err)
	}
	if got := normalizedInterfaceString(normalized["demoProfile"]); got != governedActionDemoProfileCompliance {
		t.Fatalf("normalized demoProfile=%q want %q", got, governedActionDemoProfileCompliance)
	}
	if got := normalizedInterfaceString(runReq.Subject["id"]); got != "user-123" {
		t.Fatalf("subject id=%q want user-123", got)
	}
	if got := normalizedInterfaceString(runReq.Meta.Actor["subject"]); got != "user-123" {
		t.Fatalf("actor subject=%q want user-123", got)
	}
	contextAuthority := extractJSONObjectValue(runReq.Context["actor_authority"])
	if got := normalizedInterfaceString(contextAuthority["authority_basis"]); got != "runtime_identity" {
		t.Fatalf("authority_basis=%q want runtime_identity", got)
	}
	if roles := normalizeGovernedActionStringSlice(contextAuthority["roles"]); len(roles) != 2 || roles[0] != "compliance.viewer" {
		t.Fatalf("roles=%v want runtime identity roles", roles)
	}
	governedAuthority := extractJSONObjectValue(extractJSONObjectValue(runReq.Context["governed_action"])["authority_context"])
	if got := normalizedInterfaceString(governedAuthority["client_id"]); got != "desktop-ui" {
		t.Fatalf("governed authority client_id=%q want desktop-ui", got)
	}
}

func TestBuildRunCreateRequestFromGovernedActionProposalAppliesSessionDemoGovernanceOverlay(t *testing.T) {
	summary, err := json.Marshal(map[string]interface{}{
		"governanceContext": map[string]interface{}{
			"source": "desktop_settings_local_demo",
			"persona": map[string]interface{}{
				"enabled":         true,
				"subjectId":       "demo.compliance.analyst",
				"clientId":        "desktop-demo-local",
				"roles":           []string{"compliance.viewer"},
				"approvedForProd": false,
			},
			"policy": map[string]interface{}{
				"enabled":                  true,
				"reviewMode":               "policy_first",
				"handshakeRequired":        true,
				"advisoryAutoShape":        true,
				"financeSupervisorGrant":   true,
				"financeEvidenceReadiness": "PARTIAL",
				"productionDeleteDeny":     true,
				"policyBucketPrefix":       "desktop-demo",
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal session summary: %v", err)
	}
	session := &SessionRecord{
		SessionID: "session-2",
		TaskID:    "task-2",
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Summary:   summary,
	}
	proposal := &sessionToolProposal{
		ProposalID:   "proposal-2",
		WorkerID:     "worker-2",
		ProposalType: governedActionProposalType,
		Payload: JSONObject{
			"type":           governedActionProposalType,
			"requestLabel":   "Compliance Conflict Report",
			"requestSummary": "Request a compliance report on whether holding MSFT creates a conflict if we already hold AAPL.",
			"workflowKind":   governedActionWorkflowAdvisoryRequest,
		},
	}

	runReq, normalized, err := buildRunCreateRequestFromGovernedActionProposal(session, proposal, time.Date(2026, time.March, 10, 16, 0, 0, 0, time.UTC), nil)
	if err != nil {
		t.Fatalf("buildRunCreateRequestFromGovernedActionProposal error: %v", err)
	}
	if got := normalizedInterfaceString(normalized["subjectId"]); got != "demo.compliance.analyst" {
		t.Fatalf("normalized subjectId=%q want demo.compliance.analyst", got)
	}
	if got := normalizedInterfaceString(normalized["boundaryClass"]); got != "model_gateway" {
		t.Fatalf("normalized boundaryClass=%q want model_gateway", got)
	}
	if got := normalizedInterfaceString(normalized["policyBucketId"]); got != "desktop-demo-compliance-report" {
		t.Fatalf("normalized policyBucketId=%q want desktop-demo-compliance-report", got)
	}
	governedContext := extractJSONObjectValue(runReq.Context["governed_action"])
	demoGovernance := extractJSONObjectValue(governedContext["demo_governance"])
	if got := normalizedInterfaceString(extractJSONObjectValue(demoGovernance["persona"])["subjectId"]); got != "demo.compliance.analyst" {
		t.Fatalf("demo_governance persona subjectId=%q want demo.compliance.analyst", got)
	}
}

func TestBuildRunCreateRequestFromGovernedActionProposalAppliesProductionDeleteDenyOverlay(t *testing.T) {
	summary, err := json.Marshal(map[string]interface{}{
		"governanceContext": map[string]interface{}{
			"policy": map[string]interface{}{
				"enabled":              true,
				"reviewMode":           "policy_first",
				"productionDeleteDeny": true,
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal session summary: %v", err)
	}
	session := &SessionRecord{
		SessionID: "session-delete",
		TaskID:    "task-delete",
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Summary:   summary,
	}
	proposal := &sessionToolProposal{
		ProposalID:   "proposal-delete",
		WorkerID:     "worker-delete",
		ProposalType: governedActionProposalType,
		Payload: JSONObject{
			"type":           governedActionProposalType,
			"requestLabel":   "Delete Production Trading Account Configuration",
			"requestSummary": "Delete the production trading account configuration for the live-main account.",
		},
	}

	runReq, normalized, err := buildRunCreateRequestFromGovernedActionProposal(session, proposal, time.Date(2026, time.March, 10, 17, 0, 0, 0, time.UTC), nil)
	if err != nil {
		t.Fatalf("buildRunCreateRequestFromGovernedActionProposal error: %v", err)
	}
	if got := normalizedInterfaceString(normalized["actionVerb"]); got != "delete" {
		t.Fatalf("normalized actionVerb=%q want delete", got)
	}
	if got := normalizedInterfaceString(normalized["environment"]); got != "prod" {
		t.Fatalf("normalized environment=%q want prod", got)
	}
	if approved := normalizedInterfaceBool(normalized["approvedForProd"]); approved {
		t.Fatal("normalized approvedForProd should be false for production delete deny overlay")
	}
	if got := normalizedInterfaceString(runReq.Action["verb"]); got != "delete" {
		t.Fatalf("run action verb=%q want delete", got)
	}
	if got := normalizedInterfaceString(runReq.Meta.Environment); got != "prod" {
		t.Fatalf("run environment=%q want prod", got)
	}
}

func TestBuildRunCreateRequestFromGovernedActionProposalAppliesFinanceGrantOverlayWithoutExplicitHighRisk(t *testing.T) {
	summary, err := json.Marshal(map[string]interface{}{
		"governanceContext": map[string]interface{}{
			"policy": map[string]interface{}{
				"enabled":                  true,
				"reviewMode":               "policy_first",
				"financeSupervisorGrant":   true,
				"financeEvidenceReadiness": "PARTIAL",
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal session summary: %v", err)
	}
	session := &SessionRecord{
		SessionID: "session-finance",
		TaskID:    "task-finance",
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Summary:   summary,
	}
	proposal := &sessionToolProposal{
		ProposalID:   "proposal-finance",
		WorkerID:     "worker-finance",
		ProposalType: governedActionProposalType,
		Payload: JSONObject{
			"type":           governedActionProposalType,
			"demoProfile":    governedActionDemoProfileFinancePaper,
			"requestLabel":   "Paper Trade Request: AAPL",
			"requestSummary": "BUY 25 AAPL in paper account paper-main",
			"actionType":     "trade.execute",
			"riskTier":       "low",
			"financeOrder": JSONObject{
				"symbol":   "AAPL",
				"side":     "buy",
				"quantity": 25,
				"account":  "paper-main",
			},
		},
	}

	runReq, normalized, err := buildRunCreateRequestFromGovernedActionProposal(session, proposal, time.Date(2026, time.March, 10, 17, 30, 0, 0, time.UTC), nil)
	if err != nil {
		t.Fatalf("buildRunCreateRequestFromGovernedActionProposal error: %v", err)
	}
	if got := normalizedInterfaceString(normalized["riskTier"]); got != "high" {
		t.Fatalf("normalized riskTier=%q want high", got)
	}
	grants := normalizeGovernedActionStringSlice(normalized["requiredGrants"])
	if len(grants) != 1 || grants[0] != "grant.trading.supervisor" {
		t.Fatalf("requiredGrants=%v want grant.trading.supervisor", grants)
	}
	if got := normalizedInterfaceString(normalized["evidenceReadiness"]); got != "PARTIAL" {
		t.Fatalf("evidenceReadiness=%q want PARTIAL", got)
	}
	policyStratification := extractJSONObjectValue(runReq.Context["policy_stratification"])
	if got := normalizedInterfaceString(policyStratification["risk_tier"]); got != "high" {
		t.Fatalf("run risk_tier=%q want high", got)
	}
}
