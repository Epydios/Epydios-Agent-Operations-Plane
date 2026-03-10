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
	governedActionContractID               = "epydios.governed-action.v1"
	governedActionWorkflowExternalRequest  = "external_action_request"
	governedActionDemoProfileFinancePaper  = "finance_paper_trade"
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

func normalizeGovernedActionRequestLabel(value string, financeOrder JSONObject) string {
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
	return "Governed Action Request"
}

func normalizeGovernedActionRequestSummary(value string, financeOrder JSONObject) string {
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
	return "External governed action request."
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

func normalizeGovernedActionProposalPayload(payload JSONObject) JSONObject {
	if payload == nil {
		payload = JSONObject{}
	}
	financeOrder := normalizeGovernedActionFinanceOrder(payload["financeOrder"])
	demoProfile := strings.TrimSpace(normalizedInterfaceString(payload["demoProfile"]))
	if demoProfile == "" && financeOrder != nil {
		demoProfile = governedActionDemoProfileFinancePaper
	}
	requestLabel := normalizeGovernedActionRequestLabel(normalizedInterfaceString(payload["requestLabel"]), financeOrder)
	requestSummary := normalizeGovernedActionRequestSummary(normalizedInterfaceString(payload["requestSummary"]), financeOrder)
	resourceName := strings.TrimSpace(normalizedInterfaceString(payload["resourceName"]))
	if resourceName == "" && financeOrder != nil {
		resourceName = "paper-order-" + strings.ToLower(strings.TrimSpace(normalizedInterfaceString(financeOrder["symbol"])))
	}
	resourceName = sanitizeGovernedActionResourceName(resourceName, requestLabel)
	requiredGrants := normalizeGovernedActionStringSlice(payload["requiredGrants"])
	if len(requiredGrants) == 0 && demoProfile == governedActionDemoProfileFinancePaper {
		requiredGrants = []string{"grant.trading.supervisor"}
	}
	actionType := strings.TrimSpace(normalizedInterfaceString(payload["actionType"]))
	if actionType == "" {
		if demoProfile == governedActionDemoProfileFinancePaper {
			actionType = "trade.execute"
		} else {
			actionType = "external.execute"
		}
	}
	actionTarget := strings.TrimSpace(normalizedInterfaceString(payload["actionTarget"]))
	if actionTarget == "" {
		if demoProfile == governedActionDemoProfileFinancePaper {
			actionTarget = "paper-broker-order"
		} else {
			actionTarget = resourceName
		}
	}
	resourceKind := strings.TrimSpace(normalizedInterfaceString(payload["resourceKind"]))
	if resourceKind == "" {
		if demoProfile == governedActionDemoProfileFinancePaper {
			resourceKind = "broker-order"
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
		if demoProfile == governedActionDemoProfileFinancePaper {
			policyBucketID = "managed-worker-finance-governed-action"
		} else {
			policyBucketID = "managed-worker-governed-action"
		}
	}
	normalized := JSONObject{
		"type":              governedActionProposalType,
		"summary":           strings.TrimSpace(normalizedInterfaceString(payload["summary"])),
		"confidence":        normalizeStringOrDefault(normalizedInterfaceString(payload["confidence"]), "structured"),
		"requestLabel":      requestLabel,
		"requestSummary":    requestSummary,
		"demoProfile":       demoProfile,
		"subjectType":       normalizeStringOrDefault(normalizedInterfaceString(payload["subjectType"]), "user"),
		"subjectId":         normalizeStringOrDefault(normalizedInterfaceString(payload["subjectId"]), "operator-governed-action"),
		"approvedForProd":   normalizedInterfaceBool(payload["approvedForProd"]),
		"actionType":        actionType,
		"actionClass":       normalizeStringOrDefault(normalizedInterfaceString(payload["actionClass"]), "execute"),
		"actionVerb":        normalizeStringOrDefault(normalizedInterfaceString(payload["actionVerb"]), "execute"),
		"actionTarget":      actionTarget,
		"resourceKind":      resourceKind,
		"resourceNamespace": normalizeStringOrDefault(normalizedInterfaceString(payload["resourceNamespace"]), "epydios-system"),
		"resourceName":      resourceName,
		"resourceId":        resourceID,
		"boundaryClass":     normalizeGovernedActionBoundaryClass(normalizedInterfaceString(payload["boundaryClass"])),
		"riskTier":          normalizeGovernedActionRiskTier(normalizedInterfaceString(payload["riskTier"])),
		"requiredGrants":    requiredGrants,
		"evidenceReadiness": normalizeGovernedActionEvidenceReadiness(normalizedInterfaceString(payload["evidenceReadiness"])),
		"handshakeRequired": !payloadHasExplicitFalse(payload["handshakeRequired"]),
		"dryRun":            normalizedInterfaceBool(payload["dryRun"]),
		"policyBucketId":    policyBucketID,
		"workflowKind":      normalizeStringOrDefault(normalizedInterfaceString(payload["workflowKind"]), governedActionWorkflowExternalRequest),
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

func buildGovernedActionPolicyGatesFromProposal(payload JSONObject) JSONObject {
	requiredGrants := normalizeGovernedActionStringSlice(payload["requiredGrants"])
	evidenceReadiness := normalizeGovernedActionEvidenceReadiness(normalizedInterfaceString(payload["evidenceReadiness"]))
	return JSONObject{
		"core09.gates.default_off":                 true,
		"core09.gates.required_grants_enforced":    len(requiredGrants) > 0,
		"core09.gates.evidence_readiness_enforced": evidenceReadiness != "READY",
		"core14.adapter_present.enforce_handshake": !payloadHasExplicitFalse(payload["handshakeRequired"]),
	}
}

func buildRunCreateRequestFromGovernedActionProposal(session *SessionRecord, proposal *sessionToolProposal, now time.Time) (RunCreateRequest, JSONObject, error) {
	if session == nil {
		return RunCreateRequest{}, nil, fmt.Errorf("session is required")
	}
	if proposal == nil {
		return RunCreateRequest{}, nil, fmt.Errorf("proposal is required")
	}
	normalized := normalizeGovernedActionProposalPayload(proposal.Payload)
	requestSummary := strings.TrimSpace(normalizedInterfaceString(normalized["requestSummary"]))
	governedContext := JSONObject{
		"contract_id":     governedActionContractID,
		"workflow_kind":   normalizeStringOrDefault(normalizedInterfaceString(normalized["workflowKind"]), governedActionWorkflowExternalRequest),
		"request_label":   normalizedInterfaceString(normalized["requestLabel"]),
		"demo_profile":    normalizedInterfaceString(normalized["demoProfile"]),
		"origin_surface":  governedActionOriginSurfaceManagedChat,
		"session_id":      session.SessionID,
		"task_id":         session.TaskID,
		"proposal_id":     proposal.ProposalID,
		"worker_id":       proposal.WorkerID,
		"request_summary": requestSummary,
	}
	if financeOrder, ok := normalized["financeOrder"].(JSONObject); ok && len(financeOrder) > 0 {
		governedContext["finance_order"] = financeOrder
	} else if financeOrderMap, ok := normalized["financeOrder"].(map[string]interface{}); ok && len(financeOrderMap) > 0 {
		governedContext["finance_order"] = financeOrderMap
	}
	policyStratification := JSONObject{
		"policy_bucket_id":   normalizedInterfaceString(normalized["policyBucketId"]),
		"action_class":       normalizedInterfaceString(normalized["actionClass"]),
		"boundary_class":     normalizedInterfaceString(normalized["boundaryClass"]),
		"risk_tier":          normalizedInterfaceString(normalized["riskTier"]),
		"required_grants":    normalizeGovernedActionStringSlice(normalized["requiredGrants"]),
		"evidence_readiness": normalizedInterfaceString(normalized["evidenceReadiness"]),
		"gates":              buildGovernedActionPolicyGatesFromProposal(normalized),
	}
	runReq := RunCreateRequest{
		Meta: ObjectMeta{
			RequestID: fmt.Sprintf("managed-governed-%s-%d", sanitizeIDFragment(normalizeStringOrDefault(proposal.ProposalID, session.SessionID)), now.UnixNano()),
			Timestamp: &now,
			TenantID:  session.TenantID,
			ProjectID: session.ProjectID,
			Actor: JSONObject{
				"type":       "managed_codex_worker",
				"id":         normalizeStringOrDefault(proposal.WorkerID, "managed-codex-worker"),
				"sessionId":  session.SessionID,
				"taskId":     session.TaskID,
				"proposalId": proposal.ProposalID,
			},
		},
		Subject: JSONObject{
			"type": normalizedInterfaceString(normalized["subjectType"]),
			"id":   normalizedInterfaceString(normalized["subjectId"]),
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
			"governed_action":       governedContext,
			"policy_stratification": policyStratification,
		},
		Mode:   "enforce",
		DryRun: normalizedInterfaceBool(normalized["dryRun"]),
		Annotations: JSONObject{
			"originSurface": governedActionOriginSurfaceManagedChat,
			"governedAction": JSONObject{
				"contractId":  governedActionContractID,
				"demoProfile": normalizedInterfaceString(normalized["demoProfile"]),
				"proposalId":  proposal.ProposalID,
				"sessionId":   session.SessionID,
			},
		},
	}
	return runReq, normalized, nil
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
