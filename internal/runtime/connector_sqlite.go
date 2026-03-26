package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

const connectorTierReadOnly = 1

func connectorRequestEnabled(req *ConnectorExecutionRequest) bool {
	if req == nil {
		return false
	}
	if req.Enabled {
		return true
	}
	if req.Tier != 0 {
		return true
	}
	if strings.TrimSpace(req.ConnectorID) != "" || strings.TrimSpace(req.Driver) != "" || strings.TrimSpace(req.ToolName) != "" || strings.TrimSpace(req.ApprovalNote) != "" || strings.TrimSpace(req.ApprovalID) != "" || req.HumanApprovalGranted {
		return true
	}
	return len(req.Arguments) > 0
}

func normalizeConnectorTier(tier int) int {
	if tier <= 0 {
		return connectorTierReadOnly
	}
	return tier
}

func deriveConnectorExecutionPlan(req RunCreateRequest, settings connectorIntegrationSettings) (*connectorExecutionPlan, error) {
	if !connectorRequestEnabled(req.Connector) {
		return &connectorExecutionPlan{Enabled: false, Tier: connectorTierReadOnly}, nil
	}

	connectorReq := req.Connector
	tier := normalizeConnectorTier(connectorReq.Tier)
	if tier != connectorTierReadOnly {
		return nil, fmt.Errorf("connector.tier %d is not enabled yet (tier1 only)", tier)
	}

	profileID := firstNonEmpty(strings.TrimSpace(connectorReq.ConnectorID), settings.SelectedConnectorID)
	profile, err := settings.resolveProfile(profileID)
	if err != nil {
		return nil, err
	}
	if !profile.Enabled {
		return nil, fmt.Errorf("connector profile %q is disabled", profile.ID)
	}

	toolName := strings.ToLower(strings.TrimSpace(connectorReq.ToolName))
	if toolName == "" {
		toolName = connectorToolQueryReadOnly
	}
	if !containsConnectorTool(profile.AllowedTools, toolName) {
		return nil, fmt.Errorf("connector profile %q does not allow tool %q", profile.ID, toolName)
	}

	args, classification, err := normalizeAndClassifyConnectorRequest(profile, toolName, cloneJSONObject(connectorReq.Arguments))
	if err != nil {
		return nil, err
	}

	return &connectorExecutionPlan{
		Enabled:              true,
		Tier:                 tier,
		TenantID:             strings.TrimSpace(req.Meta.TenantID),
		ProjectID:            strings.TrimSpace(req.Meta.ProjectID),
		Profile:              profile,
		ToolName:             toolName,
		Arguments:            args,
		ApprovalNote:         strings.TrimSpace(connectorReq.ApprovalNote),
		ApprovalID:           strings.TrimSpace(connectorReq.ApprovalID),
		HumanApprovalGranted: connectorReq.HumanApprovalGranted,
		Classification:       classification,
	}, nil
}

func executeConnectorPlan(ctx context.Context, plan *connectorExecutionPlan) (map[string]interface{}, error) {
	if plan == nil || !plan.Enabled {
		return nil, fmt.Errorf("connector execution plan is not enabled")
	}
	switch plan.Profile.Driver {
	case connectorDriverMCPSQLite:
		return executeMCPSQLiteConnector(ctx, plan)
	case connectorDriverMCPPostgres:
		return executeMCPPostgresConnector(ctx, plan)
	case connectorDriverMCPFilesystem:
		return executeMCPFilesystemConnector(ctx, plan)
	case connectorDriverMCPGitHub:
		return executeMCPGitHubConnector(ctx, plan)
	case connectorDriverMCPBrowser:
		return executeMCPBrowserConnector(ctx, plan)
	default:
		return nil, fmt.Errorf("connector driver %q is not supported", plan.Profile.Driver)
	}
}

func executeMCPSQLiteConnector(ctx context.Context, plan *connectorExecutionPlan) (map[string]interface{}, error) {
	if plan.ToolName != connectorToolQueryReadOnly {
		return nil, fmt.Errorf("connector tool %q is not supported", plan.ToolName)
	}
	query, _ := plan.Arguments["query"].(string)
	query = strings.TrimSpace(query)
	classification := classifySQLiteQuery(query)
	if !classification.ReadOnly {
		return nil, fmt.Errorf("connector mcp_sqlite denied non-read-only SQL: %s", classification.Reason)
	}

	sqliteBinary, err := exec.LookPath("sqlite3")
	if err != nil {
		return nil, fmt.Errorf("locate sqlite3: %w", err)
	}

	cmd := exec.CommandContext(ctx, sqliteBinary, "-readonly", "-json", plan.Profile.DatabasePath, query)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("execute sqlite query: %w: %s", err, strings.TrimSpace(string(output)))
	}

	rows := make([]map[string]interface{}, 0)
	trimmed := strings.TrimSpace(string(output))
	if trimmed != "" {
		if err := json.Unmarshal(output, &rows); err != nil {
			return nil, fmt.Errorf("decode sqlite query output: %w", err)
		}
	}

	result := map[string]interface{}{
		"driver":                 connectorDriverMCPSQLite,
		"toolName":               plan.ToolName,
		"connectorId":            plan.Profile.ID,
		"connectorLabel":         plan.Profile.Label,
		"databaseLabel":          filepath.Base(plan.Profile.DatabasePath),
		"queryClassification":    sqlQueryClassificationMap(classification),
		"rowCount":               len(rows),
		"rowsPreview":            limitConnectorRows(rows, 5),
		"resultPreviewTruncated": len(rows) > 5,
	}
	if note := strings.TrimSpace(plan.ApprovalNote); note != "" {
		result["approvalNote"] = note
	}
	return result, nil
}

func containsConnectorTool(values []string, tool string) bool {
	normalizedTool := strings.ToLower(strings.TrimSpace(tool))
	for _, value := range values {
		if strings.ToLower(strings.TrimSpace(value)) == normalizedTool {
			return true
		}
	}
	return false
}
