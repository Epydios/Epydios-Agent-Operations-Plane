package runtime

import (
	"context"
	"strings"
	"testing"
)

func TestExecuteMCPPostgresConnectorReadOnly(t *testing.T) {
	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(postgresConnectorSettingsFixture("postgres://postgres:proof-pass@127.0.0.1:54329/proofdb?sslmode=disable")))
	if err != nil {
		t.Fatalf("parse postgres connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "postgres-proof",
			Driver:      connectorDriverMCPPostgres,
			ToolName:    connectorToolQueryReadOnly,
			Arguments: JSONObject{
				"query": "SELECT id, label FROM proof_items ORDER BY id LIMIT 2",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}

	restore := stubPostgresConnectorQueryExecutor(func(_ context.Context, connectionURI, query string) (postgresConnectorExecutionResult, error) {
		if !strings.Contains(connectionURI, "proofdb") {
			t.Fatalf("unexpected connectionURI=%q", connectionURI)
		}
		if !strings.Contains(query, "SELECT id, label") {
			t.Fatalf("unexpected query=%q", query)
		}
		return postgresConnectorExecutionResult{
			DatabaseLabel: "proofdb",
			EndpointLabel: "127.0.0.1:54329",
			Rows: []map[string]interface{}{
				{"id": int32(1), "label": "alpha"},
				{"id": int32(2), "label": "beta"},
			},
		}, nil
	})
	defer restore()

	result, err := executeConnectorPlan(context.Background(), plan)
	if err != nil {
		t.Fatalf("executeConnectorPlan() error = %v", err)
	}
	if got, want := result["driver"], connectorDriverMCPPostgres; got != want {
		t.Fatalf("driver=%v want %v", got, want)
	}
	if got, want := result["databaseLabel"], "proofdb"; got != want {
		t.Fatalf("databaseLabel=%v want %v", got, want)
	}
	if got, want := result["endpointLabel"], "127.0.0.1:54329"; got != want {
		t.Fatalf("endpointLabel=%v want %v", got, want)
	}
	if got, want := result["rowCount"].(int), 2; got != want {
		t.Fatalf("rowCount=%d want %d", got, want)
	}
}

func TestExecuteMCPPostgresConnectorRejectsMutation(t *testing.T) {
	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(postgresConnectorSettingsFixture("postgres://postgres:proof-pass@127.0.0.1:54329/proofdb?sslmode=disable")))
	if err != nil {
		t.Fatalf("parse postgres connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "postgres-proof",
			Driver:      connectorDriverMCPPostgres,
			ToolName:    connectorToolQueryReadOnly,
			Arguments: JSONObject{
				"query": "DELETE FROM proof_items WHERE id = 1",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}

	if _, err := executeConnectorPlan(context.Background(), plan); err == nil || !strings.Contains(strings.ToLower(err.Error()), "non-read-only sql") {
		t.Fatalf("expected non-read-only denial, got err=%v", err)
	}
}

func TestExecuteRunConnectorPostgresAllowedAndDenied(t *testing.T) {
	store := newMemoryRunStore()
	if err := store.UpsertConnectorSettings(context.Background(), &ConnectorSettingsRecord{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Settings:  mustMarshalJSON(postgresConnectorSettingsFixture("postgres://postgres:proof-pass@127.0.0.1:54329/proofdb?sslmode=disable")),
	}); err != nil {
		t.Fatalf("seed connector settings: %v", err)
	}

	restore := stubPostgresConnectorQueryExecutor(func(_ context.Context, connectionURI, query string) (postgresConnectorExecutionResult, error) {
		if !strings.Contains(connectionURI, "proofdb") {
			t.Fatalf("unexpected connectionURI=%q", connectionURI)
		}
		return postgresConnectorExecutionResult{
			DatabaseLabel: "proofdb",
			EndpointLabel: "127.0.0.1:54329",
			Rows: []map[string]interface{}{
				{"id": int32(1), "label": "alpha"},
			},
		}, nil
	})
	defer restore()

	providers := newFakeConnectorProviderClient()
	orch := &Orchestrator{
		Namespace:             "epydios-system",
		Store:                 store,
		ProviderRegistry:      providers,
		RetentionDefaultClass: "standard",
	}

	allowRun, err := orch.ExecuteRun(context.Background(), postgresConnectorRunRequest("req-postgres-allow", "SELECT id, label FROM proof_items ORDER BY id LIMIT 1"))
	if err != nil {
		t.Fatalf("allow ExecuteRun() error = %v", err)
	}
	if allowRun.PolicyDecision != "ALLOW" {
		t.Fatalf("allow run policy=%q want ALLOW", allowRun.PolicyDecision)
	}
	allowPayload := evidencePayloadEcho(t, allowRun.EvidenceRecordResponse)
	allowConnectorPayload, _ := allowPayload["connector"].(map[string]interface{})
	if allowConnectorPayload["state"] != "completed" {
		t.Fatalf("allow connector state=%v want completed", allowConnectorPayload["state"])
	}
	allowResult, _ := allowConnectorPayload["result"].(map[string]interface{})
	if allowResult["rowCount"] != float64(1) {
		t.Fatalf("allow connector rowCount=%v want 1", allowResult["rowCount"])
	}

	denyRun, err := orch.ExecuteRun(context.Background(), postgresConnectorRunRequest("req-postgres-deny", "DELETE FROM proof_items WHERE id = 1"))
	if err != nil {
		t.Fatalf("deny ExecuteRun() error = %v", err)
	}
	if denyRun.PolicyDecision != "DENY" {
		t.Fatalf("deny run policy=%q want DENY", denyRun.PolicyDecision)
	}
	denyPayload := evidencePayloadEcho(t, denyRun.EvidenceRecordResponse)
	denyConnectorPayload, _ := denyPayload["connector"].(map[string]interface{})
	if denyConnectorPayload["state"] != "skipped" {
		t.Fatalf("deny connector state=%v want skipped", denyConnectorPayload["state"])
	}
	classification, _ := denyConnectorPayload["classification"].(map[string]interface{})
	if classification["statementClass"] != "mutation" {
		t.Fatalf("deny connector classification=%v want mutation", classification["statementClass"])
	}
}

func postgresConnectorRunRequest(requestID, query string) RunCreateRequest {
	return RunCreateRequest{
		Meta: ObjectMeta{
			RequestID: requestID,
			TenantID:  "tenant-a",
			ProjectID: "project-a",
		},
		Subject: JSONObject{
			"type": "connector_request",
		},
		Action: JSONObject{
			"type":  "connector.postgres.query",
			"class": "connector_read",
			"verb":  "query",
		},
		Resource: JSONObject{
			"kind": "postgres-database",
			"name": "proofdb",
		},
		Context: JSONObject{
			"source": "postgres-proof",
		},
		Connector: &ConnectorExecutionRequest{
			Enabled:      true,
			Tier:         connectorTierReadOnly,
			ConnectorID:  "postgres-proof",
			Driver:       connectorDriverMCPPostgres,
			ToolName:     connectorToolQueryReadOnly,
			ApprovalNote: "Postgres proof connector request.",
			Arguments: JSONObject{
				"query": query,
			},
		},
	}
}

func stubPostgresConnectorQueryExecutor(fn func(context.Context, string, string) (postgresConnectorExecutionResult, error)) func() {
	previous := executePostgresConnectorQuery
	executePostgresConnectorQuery = fn
	return func() {
		executePostgresConnectorQuery = previous
	}
}
