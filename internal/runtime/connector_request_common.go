package runtime

import (
	"fmt"
	"strings"
)

type connectorExecutionPlan struct {
	Enabled              bool
	Tier                 int
	TenantID             string
	ProjectID            string
	Profile              connectorProfileConfig
	ToolName             string
	Arguments            JSONObject
	ApprovalNote         string
	ApprovalID           string
	HumanApprovalGranted bool
	Classification       JSONObject
}

func normalizeAndClassifyConnectorRequest(profile connectorProfileConfig, toolName string, args JSONObject) (JSONObject, JSONObject, error) {
	switch profile.Driver {
	case connectorDriverMCPSQLite, connectorDriverMCPPostgres:
		return normalizeAndClassifySQLConnectorRequest(profile.Driver, toolName, args)
	case connectorDriverMCPFilesystem:
		return normalizeAndClassifyFilesystemConnectorRequest(profile, toolName, args)
	case connectorDriverMCPGitHub:
		return normalizeAndClassifyGitHubConnectorRequest(profile, toolName, args)
	case connectorDriverMCPBrowser:
		return normalizeAndClassifyBrowserConnectorRequest(profile, toolName, args)
	default:
		return nil, nil, fmt.Errorf("connector driver %q is not supported", profile.Driver)
	}
}

func normalizeAndClassifySQLConnectorRequest(driver, toolName string, args JSONObject) (JSONObject, JSONObject, error) {
	if toolName != connectorToolQueryReadOnly {
		return nil, nil, fmt.Errorf("connector tool %q is not supported", toolName)
	}
	out := cloneJSONObject(args)
	query, _ := out["query"].(string)
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil, fmt.Errorf("connector.arguments.query is required")
	}
	out["query"] = query
	classification := classifyConnectorQuery(query, driver)
	return out, JSONObject(sqlQueryClassificationMap(classification)), nil
}

func buildConnectorPlanPolicyContext(plan *connectorExecutionPlan) JSONObject {
	if plan == nil || !plan.Enabled {
		return nil
	}
	summary := JSONObject{
		"enabled":     true,
		"tier":        plan.Tier,
		"connectorId": plan.Profile.ID,
		"driver":      plan.Profile.Driver,
		"toolName":    plan.ToolName,
	}
	if len(plan.Arguments) > 0 {
		summary["arguments"] = cloneJSONObject(plan.Arguments)
	}
	for key, value := range plan.Classification {
		summary[key] = value
	}
	if note := strings.TrimSpace(plan.ApprovalNote); note != "" {
		summary["approvalNote"] = note
	}
	if approvalRequired, _ := plan.Classification["approvalRequired"].(bool); approvalRequired || plan.HumanApprovalGranted {
		summary["humanApprovalGranted"] = plan.HumanApprovalGranted
	}
	if approvalID := strings.TrimSpace(plan.ApprovalID); approvalID != "" {
		summary["approvalId"] = approvalID
	}
	return summary
}

func mergeConnectorPlanIntoContext(base JSONObject, plan *connectorExecutionPlan) JSONObject {
	connectorContext := buildConnectorPlanPolicyContext(plan)
	if len(connectorContext) == 0 {
		return cloneJSONObject(base)
	}
	out := cloneJSONObject(base)
	if len(out) == 0 {
		out = JSONObject{}
	}
	out["connector"] = connectorContext
	return out
}
