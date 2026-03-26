package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type fakeConnectorProviderClient struct {
	mu        sync.Mutex
	providers map[string]*ProviderTarget
	calls     map[string]int
}

func newFakeConnectorProviderClient() *fakeConnectorProviderClient {
	return &fakeConnectorProviderClient{
		providers: map[string]*ProviderTarget{
			"ProfileResolver": {
				Name:         "proof-profile-static",
				Namespace:    "epydios-system",
				ProviderType: "ProfileResolver",
				ProviderID:   "proof-profile-static",
				Priority:     100,
				AuthMode:     "None",
			},
			"PolicyProvider": {
				Name:         "proof-policy-connector",
				Namespace:    "epydios-system",
				ProviderType: "PolicyProvider",
				ProviderID:   "proof-policy-connector",
				Priority:     100,
				AuthMode:     "None",
			},
			"EvidenceProvider": {
				Name:         "proof-evidence-memory",
				Namespace:    "epydios-system",
				ProviderType: "EvidenceProvider",
				ProviderID:   "proof-evidence-memory",
				Priority:     100,
				AuthMode:     "None",
			},
		},
		calls: map[string]int{},
	}
}

func (c *fakeConnectorProviderClient) SelectProvider(_ context.Context, _ string, providerType, requiredCapability, _ string, minPriority int64) (*ProviderTarget, error) {
	provider, ok := c.providers[providerType]
	if !ok || provider == nil {
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}
	if provider.Priority < minPriority {
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}
	copyProvider := *provider
	return &copyProvider, nil
}

func (c *fakeConnectorProviderClient) PostJSON(_ context.Context, target *ProviderTarget, path string, reqBody interface{}, out interface{}) error {
	c.mu.Lock()
	c.calls[path]++
	c.mu.Unlock()

	switch target.ProviderType {
	case "ProfileResolver":
		return assignResponse(out, map[string]interface{}{
			"profileId":      "connector-sqlite-proof",
			"profileVersion": "v1",
			"source":         "runtime-proof",
		})
	case "PolicyProvider":
		var req map[string]interface{}
		if err := decodeRequestBody(reqBody, &req); err != nil {
			return err
		}
		contextMap, _ := req["context"].(map[string]interface{})
		connectorMap, _ := contextMap["connector"].(map[string]interface{})
		readOnlyCandidate, _ := connectorMap["readOnlyCandidate"].(bool)
		humanApprovalGranted, _ := connectorMap["humanApprovalGranted"].(bool)
		statementClass, _ := connectorMap["statementClass"].(string)
		decision := "ALLOW"
		switch {
		case strings.EqualFold(statementClass, "destructive_button_click"):
			if humanApprovalGranted {
				decision = "ALLOW"
			} else {
				decision = "DEFER"
			}
		case !readOnlyCandidate || strings.EqualFold(statementClass, "mutation"):
			decision = "DENY"
		}
		resp := map[string]interface{}{
			"decision": decision,
			"policyBundle": map[string]interface{}{
				"policyId":      "EPYDIOS_CONNECTOR_SQLITE_BOUNDARY",
				"policyVersion": "v1",
			},
		}
		if decision == "ALLOW" {
			resp["grantToken"] = "grant-sqlite-proof"
		}
		return assignResponse(out, resp)
	case "EvidenceProvider":
		switch path {
		case "/v1alpha1/evidence-provider/record":
			var req map[string]interface{}
			if err := decodeRequestBody(reqBody, &req); err != nil {
				return err
			}
			return assignResponse(out, map[string]interface{}{
				"accepted":    true,
				"evidenceId":  "evidence-sqlite-proof-1",
				"storageUri":  "memory://sqlite-proof/evidence-1",
				"payloadEcho": req["payload"],
			})
		case "/v1alpha1/evidence-provider/finalize-bundle":
			return assignResponse(out, map[string]interface{}{
				"bundleId":         "bundle-sqlite-proof-1",
				"manifestUri":      "memory://sqlite-proof/bundle-1",
				"manifestChecksum": "sha256:sqlite-proof",
				"itemCount":        1,
			})
		default:
			return fmt.Errorf("unexpected evidence path %q", path)
		}
	default:
		return fmt.Errorf("unexpected provider type %q", target.ProviderType)
	}
}

func TestExecuteMCPSQLiteConnectorReadOnly(t *testing.T) {
	dbPath := createSQLiteProofDatabase(t)
	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(connectorSettingsFixture(dbPath)))
	if err != nil {
		t.Fatalf("parse connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "sqlite-proof",
			ToolName:    connectorToolQueryReadOnly,
			Arguments: JSONObject{
				"query": "SELECT id, label FROM proof_items ORDER BY id LIMIT 2",
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}

	result, err := executeConnectorPlan(context.Background(), plan)
	if err != nil {
		t.Fatalf("executeConnectorPlan() error = %v", err)
	}
	if got, want := result["driver"], connectorDriverMCPSQLite; got != want {
		t.Fatalf("driver=%v want %v", got, want)
	}
	if got, want := int(result["rowCount"].(int)), 2; got != want {
		t.Fatalf("rowCount=%d want %d", got, want)
	}
	rowsPreview, _ := result["rowsPreview"].([]map[string]interface{})
	if len(rowsPreview) != 2 {
		t.Fatalf("rowsPreview len=%d want 2", len(rowsPreview))
	}
	if result["databaseLabel"] != filepath.Base(dbPath) {
		t.Fatalf("databaseLabel=%v want %v", result["databaseLabel"], filepath.Base(dbPath))
	}
}

func TestExecuteMCPSQLiteConnectorRejectsMutation(t *testing.T) {
	dbPath := createSQLiteProofDatabase(t)
	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(connectorSettingsFixture(dbPath)))
	if err != nil {
		t.Fatalf("parse connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "sqlite-proof",
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

func TestExecuteRunConnectorSQLiteAllowedAndDenied(t *testing.T) {
	dbPath := createSQLiteProofDatabase(t)
	store := newMemoryRunStore()
	if err := store.UpsertConnectorSettings(context.Background(), &ConnectorSettingsRecord{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Settings:  mustMarshalJSON(connectorSettingsFixture(dbPath)),
	}); err != nil {
		t.Fatalf("seed connector settings: %v", err)
	}

	providers := newFakeConnectorProviderClient()
	orch := &Orchestrator{
		Namespace:             "epydios-system",
		Store:                 store,
		ProviderRegistry:      providers,
		RetentionDefaultClass: "standard",
	}

	allowRun, err := orch.ExecuteRun(context.Background(), sqliteConnectorRunRequest("req-sqlite-allow", "SELECT id, label FROM proof_items ORDER BY id LIMIT 1"))
	if err != nil {
		t.Fatalf("allow ExecuteRun() error = %v", err)
	}
	if allowRun.Status != RunStatusCompleted {
		t.Fatalf("allow run status=%q want %q", allowRun.Status, RunStatusCompleted)
	}
	if allowRun.PolicyDecision != "ALLOW" {
		t.Fatalf("allow run policy=%q want ALLOW", allowRun.PolicyDecision)
	}
	allowPayload := evidencePayloadEcho(t, allowRun.EvidenceRecordResponse)
	connectorPayload, _ := allowPayload["connector"].(map[string]interface{})
	if connectorPayload["state"] != "completed" {
		t.Fatalf("allow connector state=%v want completed", connectorPayload["state"])
	}
	result, _ := connectorPayload["result"].(map[string]interface{})
	if result["rowCount"] != float64(1) {
		t.Fatalf("allow connector rowCount=%v want 1", result["rowCount"])
	}

	denyRun, err := orch.ExecuteRun(context.Background(), sqliteConnectorRunRequest("req-sqlite-deny", "DELETE FROM proof_items WHERE id = 1"))
	if err != nil {
		t.Fatalf("deny ExecuteRun() error = %v", err)
	}
	if denyRun.Status != RunStatusCompleted {
		t.Fatalf("deny run status=%q want %q", denyRun.Status, RunStatusCompleted)
	}
	if denyRun.PolicyDecision != "DENY" {
		t.Fatalf("deny run policy=%q want DENY", denyRun.PolicyDecision)
	}
	denyPayload := evidencePayloadEcho(t, denyRun.EvidenceRecordResponse)
	denyConnectorPayload, _ := denyPayload["connector"].(map[string]interface{})
	if denyConnectorPayload["state"] != "skipped" {
		t.Fatalf("deny connector state=%v want skipped", denyConnectorPayload["state"])
	}
	if denyConnectorPayload["reason"] != "policy_not_allow" {
		t.Fatalf("deny connector reason=%v want policy_not_allow", denyConnectorPayload["reason"])
	}

	rows := querySQLiteRows(t, dbPath, "SELECT id, label FROM proof_items ORDER BY id")
	if len(rows) != 2 {
		t.Fatalf("expected denied mutation to leave 2 rows, got %d", len(rows))
	}
}

func sqliteConnectorRunRequest(requestID, query string) RunCreateRequest {
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
			"type":  "connector.sqlite.query",
			"class": "connector_read",
			"verb":  "query",
		},
		Resource: JSONObject{
			"kind": "sqlite-database",
			"name": "proof_items",
		},
		Context: JSONObject{
			"source": "sqlite-proof",
		},
		Connector: &ConnectorExecutionRequest{
			Enabled:      true,
			Tier:         connectorTierReadOnly,
			ConnectorID:  "sqlite-proof",
			ToolName:     connectorToolQueryReadOnly,
			ApprovalNote: "SQLite proof connector request.",
			Arguments: JSONObject{
				"query": query,
			},
		},
	}
}

func evidencePayloadEcho(t *testing.T, raw json.RawMessage) map[string]interface{} {
	t.Helper()
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode evidence response: %v", err)
	}
	echo, _ := payload["payloadEcho"].(map[string]interface{})
	if echo == nil {
		t.Fatalf("expected payloadEcho in evidence response: %+v", payload)
	}
	return echo
}

func createSQLiteProofDatabase(t *testing.T) string {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "sqlite-proof.sqlite")
	cmd := exec.Command(
		"sqlite3",
		dbPath,
		"CREATE TABLE proof_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL);"+
			"INSERT INTO proof_items(label) VALUES ('alpha');"+
			"INSERT INTO proof_items(label) VALUES ('beta');",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("create sqlite proof db: %v output=%s", err, strings.TrimSpace(string(output)))
	}
	return dbPath
}

func querySQLiteRows(t *testing.T, dbPath, query string) []map[string]interface{} {
	t.Helper()
	cmd := exec.Command("sqlite3", "-readonly", "-json", dbPath, query)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("query sqlite rows: %v output=%s", err, strings.TrimSpace(string(output)))
	}
	if len(strings.TrimSpace(string(output))) == 0 {
		return nil
	}
	var rows []map[string]interface{}
	if err := json.Unmarshal(output, &rows); err != nil {
		t.Fatalf("decode sqlite rows: %v", err)
	}
	return rows
}
