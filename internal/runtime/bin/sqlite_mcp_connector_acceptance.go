package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func main() {
	repoRoot := mustRepoRoot()
	stamp := stampUTC()
	phaseRoot := filepath.Join(repoRoot, ".epydios", "internal-readiness", "mcp-sqlite-connector-proof")
	runRoot := filepath.Join(phaseRoot, stamp)
	must(os.MkdirAll(runRoot, 0o755))
	must(os.MkdirAll(phaseRoot, 0o755))

	logPath := filepath.Join(runRoot, "verify-mcp-sqlite-connector.log")
	summaryPath := filepath.Join(runRoot, "verify-mcp-sqlite-connector.summary.json")
	checklistPath := filepath.Join(runRoot, "operator-mcp-sqlite-connector-checklist.json")
	latestLogPath := filepath.Join(phaseRoot, "verify-mcp-sqlite-connector-latest.log")
	latestSummaryPath := filepath.Join(phaseRoot, "verify-mcp-sqlite-connector-latest.summary.json")

	logger := newProofLogger(logPath)
	dbPath := filepath.Join(runRoot, "sqlite-proof.sqlite")
	createSQLiteProofDatabase(dbPath, logger.log)

	store := newProofRunStore()
	providers := newProofConnectorProviderClient()
	orchestrator := &runtimeapi.Orchestrator{
		Namespace:             "epydios-system",
		Store:                 store,
		ProviderRegistry:      providers,
		RetentionDefaultClass: "standard",
	}
	handler := runtimeapi.NewAPIServer(store, orchestrator, nil).Routes()

	connectorSettings := map[string]interface{}{
		"selectedConnectorId": "sqlite-proof",
		"profiles": []map[string]interface{}{
			{
				"id":           "sqlite-proof",
				"label":        "SQLite Proof",
				"driver":       "mcp_sqlite",
				"databasePath": dbPath,
				"allowedTools": []string{"query_read_only"},
				"enabled":      true,
			},
		},
	}

	putResp := mustRequestJSON(handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": connectorSettings,
	}, logger.log)
	assert(putResp.Code == http.StatusOK, "expected connector settings PUT 200, got %d body=%s", putResp.Code, putResp.Body.String())
	logger.log("persisted bounded sqlite connector settings")

	getResp := mustRequestJSON(handler, http.MethodGet, "/v1alpha1/runtime/connectors/settings?tenantId=tenant-a&projectId=project-a", nil, logger.log)
	assert(getResp.Code == http.StatusOK, "expected connector settings GET 200, got %d body=%s", getResp.Code, getResp.Body.String())
	var connectorSettingsResp runtimeapi.ConnectorSettingsResponse
	mustDecode(getResp.Body.Bytes(), &connectorSettingsResp)
	assert(connectorSettingsResp.HasSettings, "expected connector settings to be present")
	logger.log("proved connector settings truth through runtime API")

	allowBody := sqliteConnectorRunBody("req-mcp-sqlite-allow", "SELECT id, label FROM proof_items ORDER BY id LIMIT 1")
	allowResp := mustRequestJSON(handler, http.MethodPost, "/v1alpha1/runtime/runs", allowBody, logger.log)
	assert(allowResp.Code == http.StatusCreated, "expected allowed run create 201, got %d body=%s", allowResp.Code, allowResp.Body.String())
	var allowRun runtimeapi.RunRecord
	mustDecode(allowResp.Body.Bytes(), &allowRun)
	assert(string(allowRun.Status) == string(runtimeapi.RunStatusCompleted), "expected allowed run to complete, got %s", allowRun.Status)
	assert(allowRun.PolicyDecision == "ALLOW", "expected allowed run policy ALLOW, got %s", allowRun.PolicyDecision)
	allowPayload := evidencePayloadEcho(allowRun.EvidenceRecordResponse)
	allowConnectorPayload, _ := allowPayload["connector"].(map[string]interface{})
	assert(allowConnectorPayload["state"] == "completed", "expected allowed connector state completed, got %v", allowConnectorPayload["state"])
	allowResult, _ := allowConnectorPayload["result"].(map[string]interface{})
	assert(allowResult["rowCount"] == float64(1), "expected allowed connector rowCount 1, got %v", allowResult["rowCount"])
	logger.log("proved one allowed read-only sqlite connector query through runtime orchestration")

	denyBody := sqliteConnectorRunBody("req-mcp-sqlite-deny", "DELETE FROM proof_items WHERE id = 1")
	denyResp := mustRequestJSON(handler, http.MethodPost, "/v1alpha1/runtime/runs", denyBody, logger.log)
	assert(denyResp.Code == http.StatusCreated, "expected denied run create 201, got %d body=%s", denyResp.Code, denyResp.Body.String())
	var denyRun runtimeapi.RunRecord
	mustDecode(denyResp.Body.Bytes(), &denyRun)
	assert(string(denyRun.Status) == string(runtimeapi.RunStatusCompleted), "expected denied run to complete, got %s", denyRun.Status)
	assert(denyRun.PolicyDecision == "DENY", "expected denied run policy DENY, got %s", denyRun.PolicyDecision)
	denyPayload := evidencePayloadEcho(denyRun.EvidenceRecordResponse)
	denyConnectorPayload, _ := denyPayload["connector"].(map[string]interface{})
	assert(denyConnectorPayload["state"] == "skipped", "expected denied connector state skipped, got %v", denyConnectorPayload["state"])
	assert(denyConnectorPayload["reason"] == "policy_not_allow", "expected denied connector reason policy_not_allow, got %v", denyConnectorPayload["reason"])
	logger.log("proved one denied mutation query was blocked before sqlite execution")

	rows := querySQLiteRows(dbPath, "SELECT id, label FROM proof_items ORDER BY id", logger.log)
	assert(len(rows) == 2, "expected denied mutation to leave 2 rows, got %d", len(rows))
	logger.log("verified bounded sqlite dataset was unchanged after denied mutation")

	checklist := map[string]any{
		"generated_at_utc": stamp,
		"bounded_sqlite_mcp_connector_proof": map[string]any{
			"status": "pass",
			"steps": []string{
				"connector settings were persisted and read back through /v1alpha1/runtime/connectors/settings",
				"one allowed read-only sqlite query completed through the Tier 1 connector path",
				"one mutation sqlite query was denied before connector execution",
				"audit and evidence continuity captured connector payloads for both outcomes",
			},
			"runtime_api_surface": "in_memory_httptest_handler",
			"database_path":       dbPath,
			"log_path":            logPath,
			"summary_path":        summaryPath,
		},
	}
	summary := map[string]any{
		"generated_at_utc":    stamp,
		"status":              "sqlite_mcp_connector_phase1_ready",
		"reason":              "Phase 1 bounded SQLite MCP connector proof accepted one read-only query and denied one mutation query through connector settings, the Tier 1 connector path, and runtime evidence continuity.",
		"runtime_api_surface": "in_memory_httptest_handler",
		"database_path":       dbPath,
		"log_path":            logPath,
		"checklist_path":      checklistPath,
	}

	writeJSON(checklistPath, checklist)
	writeJSON(summaryPath, summary)
	copyFile(logPath, latestLogPath)
	copyFile(summaryPath, latestSummaryPath)
	fmt.Println("SQLite MCP connector verifier passed.")
}

type proofRunStore struct {
	mu                  sync.RWMutex
	runs                map[string]*runtimeapi.RunRecord
	integrationSettings map[string]*runtimeapi.IntegrationSettingsRecord
	connectorSettings   map[string]*runtimeapi.ConnectorSettingsRecord
}

func newProofRunStore() *proofRunStore {
	return &proofRunStore{
		runs:                map[string]*runtimeapi.RunRecord{},
		integrationSettings: map[string]*runtimeapi.IntegrationSettingsRecord{},
		connectorSettings:   map[string]*runtimeapi.ConnectorSettingsRecord{},
	}
}

func (s *proofRunStore) Ping(context.Context) error         { return nil }
func (s *proofRunStore) EnsureSchema(context.Context) error { return nil }
func (s *proofRunStore) UpsertTask(context.Context, *runtimeapi.TaskRecord) error {
	return fmt.Errorf("tasks not implemented in proof store")
}
func (s *proofRunStore) GetTask(context.Context, string) (*runtimeapi.TaskRecord, error) {
	return nil, sql.ErrNoRows
}
func (s *proofRunStore) ListTasks(context.Context, runtimeapi.TaskListQuery) ([]runtimeapi.TaskRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertSession(context.Context, *runtimeapi.SessionRecord) error {
	return fmt.Errorf("sessions not implemented in proof store")
}
func (s *proofRunStore) GetSession(context.Context, string) (*runtimeapi.SessionRecord, error) {
	return nil, sql.ErrNoRows
}
func (s *proofRunStore) ListSessions(context.Context, runtimeapi.SessionListQuery) ([]runtimeapi.SessionRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertSessionWorker(context.Context, *runtimeapi.SessionWorkerRecord) error {
	return fmt.Errorf("session workers not implemented in proof store")
}
func (s *proofRunStore) ListSessionWorkers(context.Context, runtimeapi.SessionWorkerListQuery) ([]runtimeapi.SessionWorkerRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertToolAction(context.Context, *runtimeapi.ToolActionRecord) error {
	return fmt.Errorf("tool actions not implemented in proof store")
}
func (s *proofRunStore) ListToolActions(context.Context, runtimeapi.ToolActionListQuery) ([]runtimeapi.ToolActionRecord, error) {
	return nil, nil
}
func (s *proofRunStore) AppendSessionEvent(context.Context, *runtimeapi.SessionEventRecord) error {
	return fmt.Errorf("session events not implemented in proof store")
}
func (s *proofRunStore) ListSessionEvents(context.Context, runtimeapi.SessionEventListQuery) ([]runtimeapi.SessionEventRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertApprovalCheckpoint(context.Context, *runtimeapi.ApprovalCheckpointRecord) error {
	return fmt.Errorf("approval checkpoints not implemented in proof store")
}
func (s *proofRunStore) ListApprovalCheckpoints(context.Context, runtimeapi.ApprovalCheckpointListQuery) ([]runtimeapi.ApprovalCheckpointRecord, error) {
	return nil, nil
}
func (s *proofRunStore) UpsertEvidenceRecord(context.Context, *runtimeapi.EvidenceRecord) error {
	return fmt.Errorf("evidence records not implemented in proof store")
}
func (s *proofRunStore) ListEvidenceRecords(context.Context, runtimeapi.EvidenceRecordListQuery) ([]runtimeapi.EvidenceRecord, error) {
	return nil, nil
}

func (s *proofRunStore) UpsertRun(_ context.Context, record *runtimeapi.RunRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[record.RunID] = cloneRunRecord(record)
	return nil
}

func (s *proofRunStore) GetRun(_ context.Context, runID string) (*runtimeapi.RunRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.runs[strings.TrimSpace(runID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneRunRecord(record), nil
}

func (s *proofRunStore) ListRuns(_ context.Context, _ runtimeapi.RunListQuery) ([]runtimeapi.RunSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]runtimeapi.RunSummary, 0, len(s.runs))
	for _, record := range s.runs {
		items = append(items, runtimeapi.RunSummary{
			RunID:                    record.RunID,
			RequestID:                record.RequestID,
			TenantID:                 record.TenantID,
			ProjectID:                record.ProjectID,
			Environment:              record.Environment,
			RetentionClass:           record.RetentionClass,
			ExpiresAt:                record.ExpiresAt,
			Status:                   record.Status,
			SelectedProfileProvider:  record.SelectedProfileProvider,
			SelectedPolicyProvider:   record.SelectedPolicyProvider,
			SelectedEvidenceProvider: record.SelectedEvidenceProvider,
			SelectedDesktopProvider:  record.SelectedDesktopProvider,
			PolicyDecision:           record.PolicyDecision,
			PolicyBundleID:           record.PolicyBundleID,
			PolicyBundleVersion:      record.PolicyBundleVersion,
			PolicyGrantTokenPresent:  record.PolicyGrantTokenPresent,
			PolicyGrantTokenSHA256:   record.PolicyGrantTokenSHA256,
			CreatedAt:                record.CreatedAt,
			UpdatedAt:                record.UpdatedAt,
		})
	}
	return items, nil
}

func (s *proofRunStore) PruneRuns(_ context.Context, query runtimeapi.RunPruneQuery) (*runtimeapi.RunPruneResult, error) {
	return &runtimeapi.RunPruneResult{
		DryRun:         query.DryRun,
		Before:         query.Before,
		RetentionClass: query.RetentionClass,
		Limit:          query.Limit,
	}, nil
}

func (s *proofRunStore) UpsertIntegrationSettings(_ context.Context, record *runtimeapi.IntegrationSettingsRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.integrationSettings[integrationSettingsKey(record.TenantID, record.ProjectID)] = cloneIntegrationSettingsRecord(record)
	return nil
}

func (s *proofRunStore) GetIntegrationSettings(_ context.Context, tenantID, projectID string) (*runtimeapi.IntegrationSettingsRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.integrationSettings[integrationSettingsKey(tenantID, projectID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneIntegrationSettingsRecord(record), nil
}

func (s *proofRunStore) UpsertConnectorSettings(_ context.Context, record *runtimeapi.ConnectorSettingsRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.connectorSettings[integrationSettingsKey(record.TenantID, record.ProjectID)] = cloneConnectorSettingsRecord(record)
	return nil
}

func (s *proofRunStore) GetConnectorSettings(_ context.Context, tenantID, projectID string) (*runtimeapi.ConnectorSettingsRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	record, ok := s.connectorSettings[integrationSettingsKey(tenantID, projectID)]
	if !ok {
		return nil, sql.ErrNoRows
	}
	return cloneConnectorSettingsRecord(record), nil
}

type proofConnectorProviderClient struct{}

func newProofConnectorProviderClient() *proofConnectorProviderClient {
	return &proofConnectorProviderClient{}
}

func (c *proofConnectorProviderClient) SelectProvider(_ context.Context, _ string, providerType, requiredCapability, _ string, minPriority int64) (*runtimeapi.ProviderTarget, error) {
	targets := map[string]*runtimeapi.ProviderTarget{
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
	}
	target, ok := targets[providerType]
	if !ok || target.Priority < minPriority {
		return nil, fmt.Errorf("no provider found (type=%s capability=%s minPriority=%d)", providerType, requiredCapability, minPriority)
	}
	copyTarget := *target
	return &copyTarget, nil
}

func (c *proofConnectorProviderClient) PostJSON(_ context.Context, target *runtimeapi.ProviderTarget, path string, reqBody interface{}, out interface{}) error {
	switch target.ProviderType {
	case "ProfileResolver":
		return assignJSON(out, map[string]interface{}{
			"profileId":      "connector-sqlite-proof",
			"profileVersion": "v1",
			"source":         "runtime-proof",
		})
	case "PolicyProvider":
		var req map[string]interface{}
		if err := decodeJSON(reqBody, &req); err != nil {
			return err
		}
		contextMap, _ := req["context"].(map[string]interface{})
		connectorMap, _ := contextMap["connector"].(map[string]interface{})
		readOnlyCandidate, _ := connectorMap["readOnlyCandidate"].(bool)
		statementClass, _ := connectorMap["statementClass"].(string)
		decision := "ALLOW"
		if !readOnlyCandidate || strings.EqualFold(statementClass, "mutation") {
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
		return assignJSON(out, resp)
	case "EvidenceProvider":
		switch path {
		case "/v1alpha1/evidence-provider/record":
			var req map[string]interface{}
			if err := decodeJSON(reqBody, &req); err != nil {
				return err
			}
			return assignJSON(out, map[string]interface{}{
				"accepted":    true,
				"evidenceId":  "evidence-sqlite-proof-1",
				"storageUri":  "memory://sqlite-proof/evidence-1",
				"payloadEcho": req["payload"],
			})
		case "/v1alpha1/evidence-provider/finalize-bundle":
			return assignJSON(out, map[string]interface{}{
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

func mustRepoRoot() string {
	_, filePath, _, ok := runtime.Caller(0)
	if !ok {
		panic("unable to resolve sqlite connector proof harness path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filePath), "../../.."))
}

func stampUTC() string {
	return time.Now().UTC().Format("20060102T150405Z")
}

type proofLogger struct {
	logPath string
}

func newProofLogger(logPath string) *proofLogger {
	return &proofLogger{logPath: logPath}
}

func (p *proofLogger) log(line string) {
	entry := fmt.Sprintf("[%s] %s", time.Now().UTC().Format(time.RFC3339), line)
	file, err := os.OpenFile(p.logPath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o644)
	if err == nil {
		_, _ = file.WriteString(entry + "\n")
		_ = file.Close()
	}
}

func sqliteConnectorRunBody(requestID, query string) map[string]interface{} {
	return map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": requestID,
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"subject": map[string]interface{}{
			"type": "connector_request",
		},
		"action": map[string]interface{}{
			"type":  "connector.sqlite.query",
			"class": "connector_read",
			"verb":  "query",
		},
		"resource": map[string]interface{}{
			"kind": "sqlite-database",
			"name": "proof_items",
		},
		"context": map[string]interface{}{
			"source": "sqlite-proof",
		},
		"connector": map[string]interface{}{
			"enabled":      true,
			"tier":         1,
			"connectorId":  "sqlite-proof",
			"toolName":     "query_read_only",
			"approvalNote": "SQLite proof connector request.",
			"arguments": map[string]interface{}{
				"query": query,
			},
		},
	}
}

func createSQLiteProofDatabase(dbPath string, logf func(string)) {
	cmd := exec.Command(
		"sqlite3",
		dbPath,
		"CREATE TABLE proof_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL);"+
			"INSERT INTO proof_items(label) VALUES ('alpha');"+
			"INSERT INTO proof_items(label) VALUES ('beta');",
	)
	logf("$ " + strings.Join(cmd.Args, " "))
	output, err := cmd.CombinedOutput()
	if len(output) > 0 {
		logf(strings.TrimSpace(string(output)))
	}
	if err != nil {
		panic(fmt.Sprintf("create sqlite proof db: %v", err))
	}
}

func querySQLiteRows(dbPath, query string, logf func(string)) []map[string]interface{} {
	cmd := exec.Command("sqlite3", "-readonly", "-json", dbPath, query)
	logf("$ " + strings.Join(cmd.Args, " "))
	output, err := cmd.CombinedOutput()
	if len(output) > 0 {
		logf(strings.TrimSpace(string(output)))
	}
	if err != nil {
		panic(fmt.Sprintf("query sqlite rows: %v", err))
	}
	if len(strings.TrimSpace(string(output))) == 0 {
		return nil
	}
	var rows []map[string]interface{}
	must(json.Unmarshal(output, &rows))
	return rows
}

func mustRequestJSON(handler http.Handler, method, path string, body interface{}, logf func(string)) *httptest.ResponseRecorder {
	var payload []byte
	if body != nil {
		payload = mustJSONBytes(body)
	}
	logf(fmt.Sprintf("$ %s %s", method, path))
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

func evidencePayloadEcho(raw json.RawMessage) map[string]interface{} {
	var payload map[string]interface{}
	must(json.Unmarshal(raw, &payload))
	echo, _ := payload["payloadEcho"].(map[string]interface{})
	if echo == nil {
		panic(fmt.Sprintf("missing payloadEcho: %+v", payload))
	}
	return echo
}

func assignJSON(out interface{}, payload interface{}) error {
	if out == nil {
		return nil
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, out)
}

func decodeJSON(in interface{}, out interface{}) error {
	encoded, err := json.Marshal(in)
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, out)
}

func cloneRunRecord(in *runtimeapi.RunRecord) *runtimeapi.RunRecord {
	if in == nil {
		return nil
	}
	encoded := mustJSONBytes(in)
	var out runtimeapi.RunRecord
	must(json.Unmarshal(encoded, &out))
	return &out
}

func cloneIntegrationSettingsRecord(in *runtimeapi.IntegrationSettingsRecord) *runtimeapi.IntegrationSettingsRecord {
	if in == nil {
		return nil
	}
	encoded := mustJSONBytes(in)
	var out runtimeapi.IntegrationSettingsRecord
	must(json.Unmarshal(encoded, &out))
	return &out
}

func cloneConnectorSettingsRecord(in *runtimeapi.ConnectorSettingsRecord) *runtimeapi.ConnectorSettingsRecord {
	if in == nil {
		return nil
	}
	encoded := mustJSONBytes(in)
	var out runtimeapi.ConnectorSettingsRecord
	must(json.Unmarshal(encoded, &out))
	return &out
}

func integrationSettingsKey(tenantID, projectID string) string {
	return strings.TrimSpace(tenantID) + "::" + strings.TrimSpace(projectID)
}

func mustDecode(raw []byte, out interface{}) {
	must(json.Unmarshal(raw, out))
}

func mustJSONBytes(v interface{}) []byte {
	encoded, err := json.Marshal(v)
	must(err)
	return encoded
}

func writeJSON(path string, v interface{}) {
	must(os.WriteFile(path, mustJSONBytes(v), 0o644))
}

func copyFile(src, dst string) {
	payload, err := os.ReadFile(src)
	must(err)
	must(os.WriteFile(dst, payload, 0o644))
}

func assert(condition bool, format string, args ...interface{}) {
	if condition {
		return
	}
	panic(fmt.Sprintf(format, args...))
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
