package runtime

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type postgresConnectorExecutionResult struct {
	Rows          []map[string]interface{}
	DatabaseLabel string
	EndpointLabel string
}

var executePostgresConnectorQuery = executePostgresConnectorQueryReal

func executeMCPPostgresConnector(ctx context.Context, plan *connectorExecutionPlan) (map[string]interface{}, error) {
	if plan.ToolName != connectorToolQueryReadOnly {
		return nil, fmt.Errorf("connector tool %q is not supported", plan.ToolName)
	}
	query, _ := plan.Arguments["query"].(string)
	query = strings.TrimSpace(query)
	classification := classifyPostgresQuery(query)
	if !classification.ReadOnly {
		return nil, fmt.Errorf("connector mcp_postgres denied non-read-only SQL: %s", classification.Reason)
	}
	if strings.TrimSpace(plan.Profile.ConnectionURI) == "" {
		return nil, fmt.Errorf("connector profile %q is missing connectionUri", plan.Profile.ID)
	}

	execResult, err := executePostgresConnectorQuery(ctx, plan.Profile.ConnectionURI, query)
	if err != nil {
		return nil, err
	}

	result := map[string]interface{}{
		"driver":                 connectorDriverMCPPostgres,
		"toolName":               plan.ToolName,
		"connectorId":            plan.Profile.ID,
		"connectorLabel":         plan.Profile.Label,
		"databaseLabel":          execResult.DatabaseLabel,
		"queryClassification":    sqlQueryClassificationMap(classification),
		"rowCount":               len(execResult.Rows),
		"rowsPreview":            limitConnectorRows(execResult.Rows, 5),
		"resultPreviewTruncated": len(execResult.Rows) > 5,
	}
	if strings.TrimSpace(execResult.EndpointLabel) != "" {
		result["endpointLabel"] = strings.TrimSpace(execResult.EndpointLabel)
	}
	if note := strings.TrimSpace(plan.ApprovalNote); note != "" {
		result["approvalNote"] = note
	}
	return result, nil
}

func executePostgresConnectorQueryReal(ctx context.Context, connectionURI, query string) (postgresConnectorExecutionResult, error) {
	parsed, err := url.Parse(strings.TrimSpace(connectionURI))
	if err != nil {
		return postgresConnectorExecutionResult{}, fmt.Errorf("parse postgres connectionUri: %w", err)
	}

	cfg, err := pgxpool.ParseConfig(connectionURI)
	if err != nil {
		return postgresConnectorExecutionResult{}, fmt.Errorf("parse postgres pool config: %w", err)
	}
	cfg.MaxConns = 1
	cfg.MinConns = 0

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return postgresConnectorExecutionResult{}, fmt.Errorf("build postgres pool: %w", err)
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return postgresConnectorExecutionResult{}, fmt.Errorf("execute postgres query: %w", err)
	}
	defer rows.Close()

	descriptions := rows.FieldDescriptions()
	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return postgresConnectorExecutionResult{}, fmt.Errorf("read postgres row values: %w", err)
		}
		row := make(map[string]interface{}, len(values))
		for i, value := range values {
			columnName := fmt.Sprintf("column_%d", i)
			if i < len(descriptions) && len(descriptions[i].Name) > 0 {
				columnName = string(descriptions[i].Name)
			}
			row[columnName] = normalizePostgresQueryValue(value)
		}
		items = append(items, row)
	}
	if err := rows.Err(); err != nil {
		return postgresConnectorExecutionResult{}, fmt.Errorf("iterate postgres rows: %w", err)
	}

	return postgresConnectorExecutionResult{
		Rows:          items,
		DatabaseLabel: strings.Trim(strings.TrimSpace(parsed.Path), "/"),
		EndpointLabel: strings.TrimSpace(parsed.Host),
	}, nil
}

func normalizePostgresQueryValue(value interface{}) interface{} {
	switch typed := value.(type) {
	case []byte:
		return string(typed)
	default:
		return typed
	}
}
