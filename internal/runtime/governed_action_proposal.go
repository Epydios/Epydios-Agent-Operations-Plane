package runtime

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

const (
	governedActionProposalType             = "governed_action_request"
	governedActionContractID               = "epydios.governed-request.v1"
	governedActionWorkflowExternalRequest  = "governed_request"
	governedActionWorkflowAdvisoryRequest  = "advisory_request"
	governedActionDemoProfileFinancePaper  = "finance_paper_trade"
	governedActionDemoProfileCompliance    = "compliance_report"
	governedActionOriginSurfaceManagedChat = "agent.managed_codex_worker"
)

var nonAlphaNumericProposalPattern = regexp.MustCompile(`[^a-z0-9]+`)

func normalizeGovernedActionBoundaryClass(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "external_actuator", "desktop_action", "model_gateway":
		return strings.TrimSpace(strings.ToLower(value))
	default:
		return "external_actuator"
	}
}

func normalizeGovernedActionRiskTier(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "low", "medium", "high":
		return strings.TrimSpace(strings.ToLower(value))
	default:
		return "high"
	}
}

func normalizeGovernedActionEvidenceReadiness(value string) string {
	switch strings.TrimSpace(strings.ToUpper(value)) {
	case "MISSING", "PARTIAL", "READY":
		return strings.TrimSpace(strings.ToUpper(value))
	default:
		return "PARTIAL"
	}
}

func normalizeGovernedActionEnvironment(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "prod", "production":
		return "prod"
	case "stage", "staging":
		return "staging"
	case "test":
		return "test"
	default:
		return "dev"
	}
}

func normalizeGovernedActionWorkflowKind(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case governedActionWorkflowAdvisoryRequest:
		return governedActionWorkflowAdvisoryRequest
	case governedActionWorkflowExternalRequest:
		return governedActionWorkflowExternalRequest
	default:
		return governedActionWorkflowExternalRequest
	}
}

func normalizeGovernedActionReviewProfileID(value string) string {
	profileID := sanitizeGovernedActionResourceName(value, "governed-request-review")
	if profileID == "governed-action-001" {
		return "governed-request-review"
	}
	return profileID
}

func normalizeGovernedActionRequestLabel(value string, financeOrder JSONObject, workflowKind string, demoProfile string) string {
	label := strings.TrimSpace(value)
	if label != "" {
		return label
	}
	if financeOrder != nil {
		symbol := strings.TrimSpace(strings.ToUpper(normalizedInterfaceString(financeOrder["symbol"])))
		if symbol != "" {
			return fmt.Sprintf("Paper Trade Request: %s", symbol)
		}
	}
	if workflowKind == governedActionWorkflowAdvisoryRequest || demoProfile == governedActionDemoProfileCompliance {
		return "Compliance Report Request"
	}
	return "Governed Action Request"
}

func normalizeGovernedActionRequestSummary(value string, financeOrder JSONObject, workflowKind string, demoProfile string) string {
	summary := strings.TrimSpace(value)
	if summary != "" {
		return summary
	}
	if financeOrder != nil {
		side := strings.TrimSpace(strings.ToUpper(normalizedInterfaceString(financeOrder["side"])))
		if side == "" {
			side = "BUY"
		}
		symbol := strings.TrimSpace(strings.ToUpper(normalizedInterfaceString(financeOrder["symbol"])))
		if symbol == "" {
			symbol = "AAPL"
		}
		quantity := normalizedInterfaceInt(financeOrder["quantity"], 25)
		account := strings.TrimSpace(normalizedInterfaceString(financeOrder["account"]))
		if account == "" {
			account = "paper-main"
		}
		return fmt.Sprintf("%s %d %s in paper account %s", side, quantity, symbol, account)
	}
	if workflowKind == governedActionWorkflowAdvisoryRequest || demoProfile == governedActionDemoProfileCompliance {
		return "Request a compliance advisory report."
	}
	return "Governed request."
}

func normalizeGovernedActionStringSlice(value interface{}) []string {
	switch typed := value.(type) {
	case nil:
		return nil
	case []string:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if normalized := strings.TrimSpace(item); normalized != "" {
				result = append(result, normalized)
			}
		}
		return result
	case []interface{}:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if normalized := strings.TrimSpace(normalizedInterfaceString(item)); normalized != "" {
				result = append(result, normalized)
			}
		}
		return result
	default:
		raw := strings.TrimSpace(normalizedInterfaceString(value))
		if raw == "" {
			return nil
		}
		parts := strings.Split(raw, ",")
		result := make([]string, 0, len(parts))
		for _, item := range parts {
			if normalized := strings.TrimSpace(item); normalized != "" {
				result = append(result, normalized)
			}
		}
		return result
	}
}

func normalizeGovernedActionFinanceOrder(value interface{}) JSONObject {
	candidate, ok := value.(map[string]interface{})
	if !ok || len(candidate) == 0 {
		return nil
	}
	symbol := strings.TrimSpace(strings.ToUpper(normalizedInterfaceString(candidate["symbol"])))
	side := strings.TrimSpace(strings.ToLower(normalizedInterfaceString(candidate["side"])))
	if side != "buy" && side != "sell" {
		side = "buy"
	}
	quantity := normalizedInterfaceInt(candidate["quantity"], 25)
	account := strings.TrimSpace(normalizedInterfaceString(candidate["account"]))
	if symbol == "" {
		symbol = "AAPL"
	}
	if account == "" {
		account = "paper-main"
	}
	return JSONObject{
		"symbol":   symbol,
		"side":     side,
		"quantity": quantity,
		"account":  account,
	}
}

func sanitizeGovernedActionResourceName(value string, fallback string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		normalized = strings.ToLower(strings.TrimSpace(fallback))
	}
	if normalized == "" {
		return "governed-action-001"
	}
	normalized = nonAlphaNumericProposalPattern.ReplaceAllString(normalized, "-")
	normalized = strings.Trim(normalized, "-")
	if normalized == "" {
		return "governed-action-001"
	}
	return normalized
}

func governedActionPayloadHasKey(payload JSONObject, key string) bool {
	if payload == nil {
		return false
	}
	_, ok := payload[key]
	return ok
}

func governedActionProfileHints(payload JSONObject, demoProfile, workflowKind string, financeOrder JSONObject) (bool, bool) {
	if demoProfile == governedActionDemoProfileFinancePaper || financeOrder != nil {
		return true, false
	}
	if demoProfile == governedActionDemoProfileCompliance || workflowKind == governedActionWorkflowAdvisoryRequest {
		return false, true
	}
	textHints := strings.ToLower(strings.Join([]string{
		normalizedInterfaceString(payload["actionType"]),
		normalizedInterfaceString(payload["resourceKind"]),
		normalizedInterfaceString(payload["requestLabel"]),
		normalizedInterfaceString(payload["requestSummary"]),
		normalizedInterfaceString(payload["summary"]),
	}, " "))
	return false, strings.Contains(textHints, "compliance") || strings.Contains(textHints, "advisory") || strings.Contains(textHints, "report")
}

func governedActionDeleteAndProductionHints(payload JSONObject) (bool, bool) {
	if payload == nil {
		return false, false
	}
	textHints := strings.ToLower(strings.Join([]string{
		normalizedInterfaceString(payload["actionType"]),
		normalizedInterfaceString(payload["actionVerb"]),
		normalizedInterfaceString(payload["actionTarget"]),
		normalizedInterfaceString(payload["resourceKind"]),
		normalizedInterfaceString(payload["resourceName"]),
		normalizedInterfaceString(payload["resourceId"]),
		normalizedInterfaceString(payload["requestLabel"]),
		normalizedInterfaceString(payload["requestSummary"]),
		normalizedInterfaceString(payload["summary"]),
		normalizedInterfaceString(payload["environment"]),
	}, " "))
	deleteHint := strings.Contains(textHints, "delete") || strings.Contains(textHints, "remove") || strings.Contains(textHints, "destroy")
	productionHint := strings.Contains(textHints, "production") ||
		strings.Contains(textHints, "prod") ||
		strings.Contains(textHints, "live-main") ||
		strings.Contains(textHints, "live account") ||
		strings.Contains(textHints, "live trading")
	return deleteHint, productionHint
}

func managedGovernedActionActor(identity *RuntimeIdentity, session *SessionRecord, proposal *sessionToolProposal) JSONObject {
	actor := JSONObject{
		"type":       "managed_codex_worker",
		"id":         normalizeStringOrDefault(proposal.WorkerID, "managed-codex-worker"),
		"sessionId":  session.SessionID,
		"taskId":     session.TaskID,
		"proposalId": proposal.ProposalID,
	}
	mergeActorIdentityFields(actor, identity)
	if identity != nil {
		actor["authorityBasis"] = "runtime_identity"
	}
	return actor
}

func governedActionAuthorityContext(identity *RuntimeIdentity) JSONObject {
	if identity == nil {
		return nil
	}
	authority := JSONObject{
		"authority_basis": "runtime_identity",
		"authn":           "oidc-jwt",
		"subject":         strings.TrimSpace(identity.Subject),
		"client_id":       strings.TrimSpace(identity.ClientID),
	}
	if len(identity.Roles) > 0 {
		authority["roles"] = append([]string(nil), identity.Roles...)
	}
	if len(identity.TenantIDs) > 0 {
		authority["tenant_scopes"] = append([]string(nil), identity.TenantIDs...)
	}
	if len(identity.ProjectIDs) > 0 {
		authority["project_scopes"] = append([]string(nil), identity.ProjectIDs...)
	}
	return authority
}

func normalizeGovernedActionProposalPayload(payload JSONObject) JSONObject {
	if payload == nil {
		payload = JSONObject{}
	}
	financeOrder := normalizeGovernedActionFinanceOrder(payload["financeOrder"])
	demoProfile := strings.TrimSpace(normalizedInterfaceString(payload["demoProfile"]))
	if demoProfile == "" && financeOrder != nil {
		demoProfile = governedActionDemoProfileFinancePaper
	}
	workflowKind := normalizeGovernedActionWorkflowKind(normalizedInterfaceString(payload["workflowKind"]))
	isFinanceProfile, isComplianceProfile := governedActionProfileHints(payload, demoProfile, workflowKind, financeOrder)
	hasDeleteHint, hasProductionHint := governedActionDeleteAndProductionHints(payload)
	if demoProfile == "" && isComplianceProfile {
		demoProfile = governedActionDemoProfileCompliance
	}
	riskTier := normalizeGovernedActionRiskTier(normalizedInterfaceString(payload["riskTier"]))
	if !governedActionPayloadHasKey(payload, "riskTier") && isComplianceProfile {
		riskTier = "low"
	}
	requestLabel := normalizeGovernedActionRequestLabel(normalizedInterfaceString(payload["requestLabel"]), financeOrder, workflowKind, demoProfile)
	requestSummary := normalizeGovernedActionRequestSummary(normalizedInterfaceString(payload["requestSummary"]), financeOrder, workflowKind, demoProfile)
	resourceName := strings.TrimSpace(normalizedInterfaceString(payload["resourceName"]))
	if resourceName == "" && financeOrder != nil {
		resourceName = "paper-order-" + strings.ToLower(strings.TrimSpace(normalizedInterfaceString(financeOrder["symbol"])))
	}
	resourceName = sanitizeGovernedActionResourceName(resourceName, requestLabel)
	requiredGrants := normalizeGovernedActionStringSlice(payload["requiredGrants"])
	if !governedActionPayloadHasKey(payload, "requiredGrants") && isFinanceProfile && riskTier == "high" {
		requiredGrants = []string{"grant.trading.supervisor"}
	}
	actionType := strings.TrimSpace(normalizedInterfaceString(payload["actionType"]))
	if actionType == "" {
		if isFinanceProfile {
			actionType = "trade.execute"
		} else if isComplianceProfile {
			actionType = "compliance.report.request"
		} else if hasDeleteHint {
			actionType = "external.delete"
		} else {
			actionType = "external.execute"
		}
	}
	actionTarget := strings.TrimSpace(normalizedInterfaceString(payload["actionTarget"]))
	if actionTarget == "" {
		if isFinanceProfile {
			actionTarget = "paper-broker-order"
		} else if isComplianceProfile {
			actionTarget = "compliance-review"
		} else {
			actionTarget = resourceName
		}
	}
	resourceKind := strings.TrimSpace(normalizedInterfaceString(payload["resourceKind"]))
	if resourceKind == "" {
		if isFinanceProfile {
			resourceKind = "broker-order"
		} else if isComplianceProfile {
			resourceKind = "compliance-report"
		} else {
			resourceKind = "external-action"
		}
	}
	resourceID := strings.TrimSpace(normalizedInterfaceString(payload["resourceId"]))
	if resourceID == "" {
		resourceID = resourceName
	}
	policyBucketID := strings.TrimSpace(normalizedInterfaceString(payload["policyBucketId"]))
	if policyBucketID == "" {
		if isFinanceProfile {
			policyBucketID = "governed-request-finance-review"
		} else if isComplianceProfile {
			policyBucketID = "governed-request-advisory-review"
		} else {
			policyBucketID = "governed-request-review"
		}
	}
	policyBucketID = normalizeGovernedActionReviewProfileID(policyBucketID)
	actionClass := strings.TrimSpace(normalizedInterfaceString(payload["actionClass"]))
	if actionClass == "" {
		if isComplianceProfile {
			actionClass = "read"
		} else {
			actionClass = "execute"
		}
	}
	actionVerb := strings.TrimSpace(normalizedInterfaceString(payload["actionVerb"]))
	if actionVerb == "" {
		if isComplianceProfile {
			actionVerb = "request"
		} else if hasDeleteHint {
			actionVerb = "delete"
		} else {
			actionVerb = "execute"
		}
	}
	boundaryClass := normalizeGovernedActionBoundaryClass(normalizedInterfaceString(payload["boundaryClass"]))
	if !governedActionPayloadHasKey(payload, "boundaryClass") && isComplianceProfile {
		boundaryClass = "model_gateway"
	}
	evidenceReadiness := normalizeGovernedActionEvidenceReadiness(normalizedInterfaceString(payload["evidenceReadiness"]))
	if !governedActionPayloadHasKey(payload, "evidenceReadiness") && isComplianceProfile {
		evidenceReadiness = "READY"
	}
	environment := normalizeGovernedActionEnvironment(normalizedInterfaceString(payload["environment"]))
	if !governedActionPayloadHasKey(payload, "environment") && hasProductionHint {
		environment = "prod"
	}
	normalized := JSONObject{
		"type":                     governedActionProposalType,
		"summary":                  strings.TrimSpace(normalizedInterfaceString(payload["summary"])),
		"confidence":               normalizeStringOrDefault(normalizedInterfaceString(payload["confidence"]), "structured"),
		"requestLabel":             requestLabel,
		"requestSummary":           requestSummary,
		"demoProfile":              demoProfile,
		"subjectType":              normalizeStringOrDefault(normalizedInterfaceString(payload["subjectType"]), "user"),
		"subjectId":                normalizeStringOrDefault(normalizedInterfaceString(payload["subjectId"]), "operator-governed-action"),
		"approvedForProd":          normalizedInterfaceBool(payload["approvedForProd"]),
		"actionType":               actionType,
		"actionClass":              actionClass,
		"actionVerb":               actionVerb,
		"actionTarget":             actionTarget,
		"resourceKind":             resourceKind,
		"resourceNamespace":        normalizeStringOrDefault(normalizedInterfaceString(payload["resourceNamespace"]), "epydios-system"),
		"resourceName":             resourceName,
		"resourceId":               resourceID,
		"boundaryClass":            boundaryClass,
		"riskTier":                 riskTier,
		"requiredGrants":           requiredGrants,
		"evidenceReadiness":        evidenceReadiness,
		"handshakeRequired":        !payloadHasExplicitFalse(payload["handshakeRequired"]),
		"dryRun":                   normalizedInterfaceBool(payload["dryRun"]),
		"environment":              environment,
		"operatorApprovalRequired": normalizedInterfaceBool(payload["operatorApprovalRequired"]),
		"policyBucketId":           policyBucketID,
		"workflowKind":             workflowKind,
	}
	if financeOrder != nil {
		normalized["financeOrder"] = financeOrder
	}
	if strings.TrimSpace(normalizedInterfaceString(normalized["summary"])) == "" {
		normalized["summary"] = requestSummary
	}
	return normalized
}

func payloadHasExplicitFalse(value interface{}) bool {
	switch typed := value.(type) {
	case bool:
		return !typed
	case string:
		return strings.EqualFold(strings.TrimSpace(typed), "false")
	default:
		return false
	}
}

func buildGovernedActionReviewSignalsFromProposal(payload JSONObject) JSONObject {
	requiredGrants := normalizeGovernedActionStringSlice(payload["requiredGrants"])
	evidenceReadiness := normalizeGovernedActionEvidenceReadiness(normalizedInterfaceString(payload["evidenceReadiness"]))
	return JSONObject{
		"review_required":           true,
		"approval_signals_required": len(requiredGrants) > 0,
		"evidence_pending":          evidenceReadiness != "READY",
		"handoff_required":          !payloadHasExplicitFalse(payload["handshakeRequired"]),
	}
}

func governedActionSessionGovernanceContext(session *SessionRecord) JSONObject {
	if session == nil {
		return nil
	}
	summary := parseRawJSONObject(session.Summary)
	if len(summary) == 0 {
		return nil
	}
	context := extractJSONObjectValue(summary["governanceContext"])
	if len(context) == 0 {
		return nil
	}
	return context
}

func applySessionGovernanceOverlayToGovernedProposal(normalized JSONObject, session *SessionRecord) JSONObject {
	if len(normalized) == 0 {
		return normalized
	}
	governance := governedActionSessionGovernanceContext(session)
	if len(governance) == 0 {
		return normalized
	}
	out := JSONObject{}
	for key, value := range normalized {
		out[key] = value
	}
	persona := extractJSONObjectValue(governance["persona"])
	if normalizedInterfaceBool(persona["enabled"]) {
		if subjectID := strings.TrimSpace(normalizedInterfaceString(persona["subjectId"])); subjectID != "" {
			out["subjectId"] = subjectID
		}
		out["approvedForProd"] = normalizedInterfaceBool(persona["approvedForProd"])
	}
	policy := extractJSONObjectValue(governance["policy"])
	if normalizedInterfaceBool(policy["enabled"]) {
		reviewMode := normalizeStringOrDefault(normalizedInterfaceString(policy["reviewMode"]), "policy_first")
		out["operatorApprovalRequired"] = reviewMode == "manual_review"
		if _, ok := policy["handshakeRequired"]; ok {
			out["handshakeRequired"] = normalizedInterfaceBool(policy["handshakeRequired"])
		}
		if prefix := strings.TrimSpace(normalizedInterfaceString(policy["policyBucketPrefix"])); prefix != "" {
			profileSuffix := strings.ReplaceAll(strings.TrimSpace(normalizedInterfaceString(out["demoProfile"])), "_", "-")
			if profileSuffix == "" {
				profileSuffix = "governed-action"
			}
			out["policyBucketId"] = sanitizeGovernedActionResourceName(prefix+"-"+profileSuffix, "desktop-demo-governed-action")
		}
		if normalizedInterfaceBool(policy["advisoryAutoShape"]) {
			if strings.EqualFold(normalizedInterfaceString(out["workflowKind"]), governedActionWorkflowAdvisoryRequest) ||
				strings.EqualFold(normalizedInterfaceString(out["demoProfile"]), governedActionDemoProfileCompliance) ||
				strings.EqualFold(normalizedInterfaceString(out["actionType"]), "compliance.report.request") {
				out["actionClass"] = "read"
				out["actionVerb"] = "request"
				out["actionTarget"] = "compliance-review"
				out["resourceKind"] = "compliance-report"
				out["boundaryClass"] = "model_gateway"
				out["riskTier"] = "low"
				out["requiredGrants"] = []string{}
				out["evidenceReadiness"] = "READY"
			}
		}
		if strings.EqualFold(normalizedInterfaceString(out["demoProfile"]), governedActionDemoProfileFinancePaper) &&
			strings.EqualFold(normalizedInterfaceString(out["actionType"]), "trade.execute") &&
			normalizedInterfaceBool(policy["financeSupervisorGrant"]) {
			out["riskTier"] = "high"
			out["requiredGrants"] = []string{"grant.trading.supervisor"}
			out["evidenceReadiness"] = normalizeGovernedActionEvidenceReadiness(normalizedInterfaceString(policy["financeEvidenceReadiness"]))
		}
		if normalizedInterfaceBool(policy["productionDeleteDeny"]) &&
			normalizeGovernedActionEnvironment(normalizedInterfaceString(out["environment"])) == "prod" &&
			strings.EqualFold(normalizedInterfaceString(out["actionVerb"]), "delete") {
			out["approvedForProd"] = false
			out["riskTier"] = "high"
			out["boundaryClass"] = "external_actuator"
		}
	}
	return out
}

func buildRunCreateRequestFromGovernedActionProposal(session *SessionRecord, proposal *sessionToolProposal, now time.Time, identity *RuntimeIdentity) (RunCreateRequest, JSONObject, error) {
	if session == nil {
		return RunCreateRequest{}, nil, fmt.Errorf("session is required")
	}
	if proposal == nil {
		return RunCreateRequest{}, nil, fmt.Errorf("proposal is required")
	}
	normalized := applySessionGovernanceOverlayToGovernedProposal(normalizeGovernedActionProposalPayload(proposal.Payload), session)
	requestSummary := strings.TrimSpace(normalizedInterfaceString(normalized["requestSummary"]))
	subjectID := normalizedInterfaceString(normalized["subjectId"])
	if identity != nil && (strings.TrimSpace(subjectID) == "" || subjectID == "operator-governed-action") {
		subjectID = normalizeStringOrDefault(identity.Subject, subjectID)
	}
	governedContext := JSONObject{
		"contract_id":                governedActionContractID,
		"workflow_kind":              normalizeStringOrDefault(normalizedInterfaceString(normalized["workflowKind"]), governedActionWorkflowExternalRequest),
		"request_label":              normalizedInterfaceString(normalized["requestLabel"]),
		"demo_profile":               normalizedInterfaceString(normalized["demoProfile"]),
		"origin_surface":             governedActionOriginSurfaceManagedChat,
		"session_id":                 session.SessionID,
		"task_id":                    session.TaskID,
		"proposal_id":                proposal.ProposalID,
		"worker_id":                  proposal.WorkerID,
		"request_summary":            requestSummary,
		"operator_approval_required": normalizedInterfaceBool(normalized["operatorApprovalRequired"]),
	}
	if sessionGovernance := governedActionSessionGovernanceContext(session); len(sessionGovernance) > 0 {
		governedContext["demo_governance"] = sessionGovernance
	}
	if financeOrder, ok := normalized["financeOrder"].(JSONObject); ok && len(financeOrder) > 0 {
		governedContext["finance_order"] = financeOrder
	} else if financeOrderMap, ok := normalized["financeOrder"].(map[string]interface{}); ok && len(financeOrderMap) > 0 {
		governedContext["finance_order"] = financeOrderMap
	}
	if authorityContext := governedActionAuthorityContext(identity); authorityContext != nil {
		governedContext["authority_context"] = authorityContext
	}
	reviewSignals := JSONObject{
		"policy_bucket_id": normalizedInterfaceString(normalized["policyBucketId"]),
		"action_class":     normalizedInterfaceString(normalized["actionClass"]),
		"boundary_class":   normalizedInterfaceString(normalized["boundaryClass"]),
		"review_tier":      normalizedInterfaceString(normalized["riskTier"]),
		"required_reviews": normalizeGovernedActionStringSlice(normalized["requiredGrants"]),
		"readiness_state":  normalizedInterfaceString(normalized["evidenceReadiness"]),
		"gates":            buildGovernedActionReviewSignalsFromProposal(normalized),
	}
	runReq := RunCreateRequest{
		Meta: ObjectMeta{
			RequestID:   fmt.Sprintf("managed-governed-%s-%d", sanitizeIDFragment(normalizeStringOrDefault(proposal.ProposalID, session.SessionID)), now.UnixNano()),
			Timestamp:   &now,
			TenantID:    session.TenantID,
			ProjectID:   session.ProjectID,
			Environment: normalizedInterfaceString(normalized["environment"]),
			Actor:       managedGovernedActionActor(identity, session, proposal),
		},
		Subject: JSONObject{
			"type": normalizedInterfaceString(normalized["subjectType"]),
			"id":   subjectID,
			"attributes": JSONObject{
				"approvedForProd": normalizedInterfaceBool(normalized["approvedForProd"]),
			},
		},
		Action: JSONObject{
			"type":   normalizedInterfaceString(normalized["actionType"]),
			"class":  normalizedInterfaceString(normalized["actionClass"]),
			"verb":   normalizedInterfaceString(normalized["actionVerb"]),
			"target": normalizedInterfaceString(normalized["actionTarget"]),
		},
		Resource: JSONObject{
			"kind":      normalizedInterfaceString(normalized["resourceKind"]),
			"class":     normalizedInterfaceString(normalized["boundaryClass"]),
			"namespace": normalizedInterfaceString(normalized["resourceNamespace"]),
			"name":      normalizedInterfaceString(normalized["resourceName"]),
			"id":        normalizedInterfaceString(normalized["resourceId"]),
		},
		Task: JSONObject{
			"intent":       requestSummary,
			"summary":      requestSummary,
			"requestLabel": normalizedInterfaceString(normalized["requestLabel"]),
			"workflowKind": normalizeStringOrDefault(normalizedInterfaceString(normalized["workflowKind"]), governedActionWorkflowExternalRequest),
			"demoProfile":  normalizedInterfaceString(normalized["demoProfile"]),
		},
		Context: JSONObject{
			"governed_action": governedContext,
			"review_signals":  reviewSignals,
		},
		Mode:   "enforce",
		DryRun: normalizedInterfaceBool(normalized["dryRun"]),
		Annotations: JSONObject{
			"originSurface": governedActionOriginSurfaceManagedChat,
			"governedAction": JSONObject{
				"contractId":               governedActionContractID,
				"demoProfile":              normalizedInterfaceString(normalized["demoProfile"]),
				"proposalId":               proposal.ProposalID,
				"sessionId":                session.SessionID,
				"operatorApprovalRequired": normalizedInterfaceBool(normalized["operatorApprovalRequired"]),
			},
		},
	}
	if authorityContext := governedActionAuthorityContext(identity); authorityContext != nil {
		runReq.Context["actor_authority"] = authorityContext
	}
	if sessionGovernance := governedActionSessionGovernanceContext(session); len(sessionGovernance) > 0 {
		runReq.Context["demo_governance"] = sessionGovernance
	}
	return runReq, normalized, nil
}

func governedActionProposalRequiresOperatorApproval(proposal *sessionToolProposal) bool {
	if proposal == nil {
		return false
	}
	if !strings.EqualFold(resolveToolProposalType(proposal, nil), governedActionProposalType) {
		return true
	}
	return normalizedInterfaceBool(proposalPayloadValue(proposal, "operatorApprovalRequired"))
}

func decodeRawJSONToObject(raw json.RawMessage) interface{} {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return nil
	}
	var decoded interface{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return trimmed
	}
	return decoded
}

func buildGovernedActionRunSnapshot(run *RunRecord) JSONObject {
	if run == nil {
		return JSONObject{}
	}
	snapshot := JSONObject{
		"runId":                    run.RunID,
		"requestId":                run.RequestID,
		"status":                   run.Status,
		"selectedProfileProvider":  run.SelectedProfileProvider,
		"selectedPolicyProvider":   run.SelectedPolicyProvider,
		"selectedEvidenceProvider": run.SelectedEvidenceProvider,
		"policyDecision":           run.PolicyDecision,
		"policyBundleId":           run.PolicyBundleID,
		"policyBundleVersion":      run.PolicyBundleVersion,
		"policyGrantTokenPresent":  run.PolicyGrantTokenPresent,
		"createdAt":                run.CreatedAt.Format(time.RFC3339),
		"updatedAt":                run.UpdatedAt.Format(time.RFC3339),
	}
	if decoded := decodeRawJSONToObject(run.RequestPayload); decoded != nil {
		snapshot["requestPayload"] = decoded
	}
	if decoded := decodeRawJSONToObject(run.ProfileResponse); decoded != nil {
		snapshot["profileResponse"] = decoded
	}
	if decoded := decodeRawJSONToObject(run.PolicyResponse); decoded != nil {
		snapshot["policyResponse"] = decoded
	}
	if decoded := decodeRawJSONToObject(run.EvidenceRecordResponse); decoded != nil {
		snapshot["evidenceRecordResponse"] = decoded
	}
	if decoded := decodeRawJSONToObject(run.EvidenceBundleResponse); decoded != nil {
		snapshot["evidenceBundleResponse"] = decoded
	}
	if strings.TrimSpace(run.ErrorMessage) != "" {
		snapshot["errorMessage"] = run.ErrorMessage
	}
	return snapshot
}

func extractGovernedRunSummaryFromToolAction(action *ToolActionRecord) (string, RunStatus, string, string) {
	if action == nil {
		return "", "", "", ""
	}
	payload := parseRawJSONObject(action.ResultPayload)
	runSnapshot := extractJSONObjectValue(payload["governedRun"])
	if len(runSnapshot) == 0 {
		return "", "", "", ""
	}
	return normalizedInterfaceString(runSnapshot["runId"]),
		RunStatus(normalizedInterfaceString(runSnapshot["status"])),
		normalizedInterfaceString(runSnapshot["policyDecision"]),
		normalizedInterfaceString(runSnapshot["selectedPolicyProvider"])
}
