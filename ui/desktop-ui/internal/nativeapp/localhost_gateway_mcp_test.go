package nativeapp

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"testing"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

func TestGatewayMCPToolsListReturnsConfiguredSQLiteTool(t *testing.T) {
	requestsRoot := t.TempDir()
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			if tenantID != "tenant-a" || projectID != "project-a" {
				t.Fatalf("unexpected scope tenant=%q project=%q", tenantID, projectID)
			}
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "sqlite-proof",
					"profiles": []map[string]interface{}{
						{
							"id":           "sqlite-proof",
							"label":        "SQLite Proof",
							"driver":       "mcp_sqlite",
							"allowedTools": []string{"query_read_only"},
							"enabled":      true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, gatewayMCPProxyToolsPath+"?tenantId=tenant-a&projectId=project-a", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	state.handleMCPTools(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	var resp gatewayMCPToolsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools response: %v", err)
	}
	if len(resp.Tools) != 1 {
		t.Fatalf("expected one tool, got %d", len(resp.Tools))
	}
	if resp.Tools[0].Name != gatewayMCPToolQueryReadOnly {
		t.Fatalf("tool name=%q want %q", resp.Tools[0].Name, gatewayMCPToolQueryReadOnly)
	}
}

func TestGatewayMCPToolCallCreatesConnectorRunAndPersistsRecord(t *testing.T) {
	requestsRoot := t.TempDir()
	var captured runtimeapi.RunCreateRequest
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "sqlite-proof",
					"profiles": []map[string]interface{}{
						{
							"id":           "sqlite-proof",
							"label":        "SQLite Proof",
							"driver":       "mcp_sqlite",
							"allowedTools": []string{"query_read_only"},
							"enabled":      true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			captured = req
			return &runtimeapi.RunRecord{
				RunID:          "run-mcp-allow",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusCompleted,
				PolicyDecision: "ALLOW",
				EvidenceRecordResponse: mustGatewayJSONBytes(t, map[string]interface{}{
					"payloadEcho": map[string]interface{}{
						"connector": map[string]interface{}{
							"state": "completed",
							"connector": map[string]interface{}{
								"id":    "sqlite-proof",
								"label": "SQLite Proof",
							},
							"classification": map[string]interface{}{
								"statementClass": "read",
								"reason":         "read-only query",
							},
							"result": map[string]interface{}{
								"rowCount": 1,
							},
						},
					},
				}),
			}, http.StatusCreated, nil
		},
	}

	body := bytes.NewBuffer(mustGatewayJSONBytes(t, map[string]interface{}{
		"tenantId":      "tenant-a",
		"projectId":     "project-a",
		"environmentId": "local",
		"connectorId":   "sqlite-proof",
		"toolName":      "query_read_only",
		"arguments": map[string]interface{}{
			"query": "SELECT id FROM proof_items LIMIT 1",
		},
		"sessionId":        "session-1",
		"protocolVersion":  "2025-03-26",
		"jsonrpcRequestId": 7,
		"client": map[string]interface{}{
			"id":   "client-mcp",
			"name": "Phase2 Test Shim",
		},
	}))
	req := httptest.NewRequest(http.MethodPost, gatewayMCPProxyToolCallPath, body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleMCPToolCall(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	if captured.Connector == nil {
		t.Fatalf("expected connector request to be populated")
	}
	if captured.Connector.ConnectorID != "sqlite-proof" {
		t.Fatalf("connectorId=%q want sqlite-proof", captured.Connector.ConnectorID)
	}
	if captured.Connector.Driver != "mcp_sqlite" {
		t.Fatalf("driver=%q want mcp_sqlite", captured.Connector.Driver)
	}
	connectorMCP, _ := captured.Context["connector_mcp"].(runtimeapi.JSONObject)
	if got := connectorMCP["method"]; got != "tools/call" {
		t.Fatalf("connector_mcp.method=%v want tools/call", got)
	}
	if got := captured.Annotations["connectorProtocol"]; got != "mcp" {
		t.Fatalf("connectorProtocol annotation=%v want mcp", got)
	}

	var resp gatewayMCPToolCallResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools/call response: %v", err)
	}
	if resp.ToolResult.IsError {
		t.Fatalf("expected successful tool result, got error response %+v", resp.ToolResult)
	}

	record, err := readGatewayRequestRecord(requestsRoot, resp.GatewayRequestID)
	if err != nil {
		t.Fatalf("read gateway request record: %v", err)
	}
	if record.Interposition.ClientSurface != "mcp" {
		t.Fatalf("clientSurface=%q want mcp", record.Interposition.ClientSurface)
	}
	if record.Interposition.Upstream.Path != gatewayMCPProxyToolCallPath {
		t.Fatalf("upstream path=%q want %s", record.Interposition.Upstream.Path, gatewayMCPProxyToolCallPath)
	}
	if record.Interposition.Upstream.Protocol != "mcp_stdio" {
		t.Fatalf("upstream protocol=%q want mcp_stdio", record.Interposition.Upstream.Protocol)
	}
}

func TestGatewayMCPToolsListReturnsConfiguredPostgresTool(t *testing.T) {
	requestsRoot := t.TempDir()
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			if tenantID != "tenant-a" || projectID != "project-a" {
				t.Fatalf("unexpected scope tenant=%q project=%q", tenantID, projectID)
			}
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "postgres-proof",
					"profiles": []map[string]interface{}{
						{
							"id":            "postgres-proof",
							"label":         "Postgres Proof",
							"driver":        "mcp_postgres",
							"connectionUri": "postgres://postgres:proof-pass@127.0.0.1:54329/proofdb?sslmode=disable",
							"allowedTools":  []string{"query_read_only"},
							"enabled":       true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, gatewayMCPProxyToolsPath+"?tenantId=tenant-a&projectId=project-a", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	state.handleMCPTools(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	var resp gatewayMCPToolsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools response: %v", err)
	}
	if len(resp.Tools) != 1 {
		t.Fatalf("expected one tool, got %d", len(resp.Tools))
	}
	if resp.Tools[0].Name != gatewayMCPToolQueryReadOnly {
		t.Fatalf("tool name=%q want %q", resp.Tools[0].Name, gatewayMCPToolQueryReadOnly)
	}
}

func TestGatewayMCPToolCallCreatesPostgresConnectorRunAndPersistsRecord(t *testing.T) {
	requestsRoot := t.TempDir()
	var captured runtimeapi.RunCreateRequest
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "postgres-proof",
					"profiles": []map[string]interface{}{
						{
							"id":            "postgres-proof",
							"label":         "Postgres Proof",
							"driver":        "mcp_postgres",
							"connectionUri": "postgres://postgres:proof-pass@127.0.0.1:54329/proofdb?sslmode=disable",
							"allowedTools":  []string{"query_read_only"},
							"enabled":       true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			captured = req
			return &runtimeapi.RunRecord{
				RunID:          "run-mcp-postgres-allow",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusCompleted,
				PolicyDecision: "ALLOW",
				EvidenceRecordResponse: mustGatewayJSONBytes(t, map[string]interface{}{
					"payloadEcho": map[string]interface{}{
						"connector": map[string]interface{}{
							"state": "completed",
							"connector": map[string]interface{}{
								"id":            "postgres-proof",
								"label":         "Postgres Proof",
								"databaseLabel": "proofdb",
								"endpointLabel": "127.0.0.1:54329",
							},
							"classification": map[string]interface{}{
								"statementClass": "read",
								"reason":         "read-only query",
							},
							"result": map[string]interface{}{
								"rowCount": 1,
							},
						},
					},
				}),
			}, http.StatusCreated, nil
		},
	}

	body := bytes.NewBuffer(mustGatewayJSONBytes(t, map[string]interface{}{
		"tenantId":      "tenant-a",
		"projectId":     "project-a",
		"environmentId": "local",
		"connectorId":   "postgres-proof",
		"toolName":      "query_read_only",
		"arguments": map[string]interface{}{
			"query": "SELECT id FROM proof_items LIMIT 1",
		},
		"sessionId":        "session-1",
		"protocolVersion":  "2025-03-26",
		"jsonrpcRequestId": 8,
		"client": map[string]interface{}{
			"id":   "client-mcp",
			"name": "Phase2 Test Shim",
		},
	}))
	req := httptest.NewRequest(http.MethodPost, gatewayMCPProxyToolCallPath, body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleMCPToolCall(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	if captured.Connector == nil {
		t.Fatalf("expected connector request to be populated")
	}
	if captured.Connector.Driver != "mcp_postgres" {
		t.Fatalf("driver=%q want mcp_postgres", captured.Connector.Driver)
	}
	if got := captured.Action["type"]; got != "connector.postgres.query" {
		t.Fatalf("action.type=%v want connector.postgres.query", got)
	}
	if got := captured.Resource["kind"]; got != "postgres-database" {
		t.Fatalf("resource.kind=%v want postgres-database", got)
	}
}

func TestGatewayMCPToolsListReturnsConfiguredFilesystemTools(t *testing.T) {
	requestsRoot := t.TempDir()
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "filesystem-proof",
					"profiles": []map[string]interface{}{
						{
							"id":           "filesystem-proof",
							"label":        "Filesystem Proof",
							"driver":       "mcp_filesystem",
							"rootPath":     "/tmp/filesystem-proof",
							"allowedTools": []string{"read_text", "list_directory"},
							"enabled":      true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, gatewayMCPProxyToolsPath+"?tenantId=tenant-a&projectId=project-a", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	state.handleMCPTools(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	var resp gatewayMCPToolsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools response: %v", err)
	}
	if len(resp.Tools) != 2 {
		t.Fatalf("expected two tools, got %d", len(resp.Tools))
	}
	names := []string{resp.Tools[0].Name, resp.Tools[1].Name}
	sort.Strings(names)
	if names[0] != gatewayMCPToolListDirectory || names[1] != gatewayMCPToolReadText {
		t.Fatalf("tool names=%v want [list_directory read_text]", names)
	}
}

func TestGatewayMCPToolCallCreatesFilesystemConnectorRunAndPersistsRecord(t *testing.T) {
	requestsRoot := t.TempDir()
	var captured runtimeapi.RunCreateRequest
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "filesystem-proof",
					"profiles": []map[string]interface{}{
						{
							"id":           "filesystem-proof",
							"label":        "Filesystem Proof",
							"driver":       "mcp_filesystem",
							"rootPath":     "/tmp/filesystem-proof",
							"allowedTools": []string{"read_text", "list_directory"},
							"enabled":      true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			captured = req
			return &runtimeapi.RunRecord{
				RunID:          "run-mcp-fs-allow",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusCompleted,
				PolicyDecision: "ALLOW",
				EvidenceRecordResponse: mustGatewayJSONBytes(t, map[string]interface{}{
					"payloadEcho": map[string]interface{}{
						"connector": map[string]interface{}{
							"state": "completed",
							"connector": map[string]interface{}{
								"id":        "filesystem-proof",
								"label":     "Filesystem Proof",
								"rootLabel": "filesystem-proof",
							},
							"classification": map[string]interface{}{
								"statementClass": "file_read",
								"reason":         "read-only file inside configured filesystem root",
							},
							"result": map[string]interface{}{
								"bytesRead":    19,
								"relativePath": "notes/alpha.txt",
							},
						},
					},
				}),
			}, http.StatusCreated, nil
		},
	}

	body := bytes.NewBuffer(mustGatewayJSONBytes(t, map[string]interface{}{
		"tenantId":      "tenant-a",
		"projectId":     "project-a",
		"environmentId": "local",
		"connectorId":   "filesystem-proof",
		"toolName":      "read_text",
		"arguments": map[string]interface{}{
			"path": "notes/alpha.txt",
		},
		"sessionId":        "session-1",
		"protocolVersion":  "2025-03-26",
		"jsonrpcRequestId": 9,
		"client": map[string]interface{}{
			"id":   "client-mcp",
			"name": "Phase2 Test Shim",
		},
	}))
	req := httptest.NewRequest(http.MethodPost, gatewayMCPProxyToolCallPath, body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleMCPToolCall(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	if captured.Connector == nil {
		t.Fatalf("expected connector request to be populated")
	}
	if captured.Connector.Driver != "mcp_filesystem" {
		t.Fatalf("driver=%q want mcp_filesystem", captured.Connector.Driver)
	}
	if got := captured.Action["type"]; got != "connector.filesystem.read_text" {
		t.Fatalf("action.type=%v want connector.filesystem.read_text", got)
	}
	if got := captured.Resource["kind"]; got != "filesystem-file" {
		t.Fatalf("resource.kind=%v want filesystem-file", got)
	}

	var resp gatewayMCPToolCallResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools/call response: %v", err)
	}
	if resp.ToolResult.IsError {
		t.Fatalf("expected successful tool result, got error response %+v", resp.ToolResult)
	}

	record, err := readGatewayRequestRecord(requestsRoot, resp.GatewayRequestID)
	if err != nil {
		t.Fatalf("read gateway request record: %v", err)
	}
	if record.Interposition.ClientSurface != "mcp" {
		t.Fatalf("clientSurface=%q want mcp", record.Interposition.ClientSurface)
	}
	if record.Interposition.Upstream.Path != gatewayMCPProxyToolCallPath {
		t.Fatalf("upstream path=%q want %s", record.Interposition.Upstream.Path, gatewayMCPProxyToolCallPath)
	}
}

func TestGatewayMCPToolsListReturnsConfiguredGitHubTool(t *testing.T) {
	requestsRoot := t.TempDir()
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			if tenantID != "tenant-a" || projectID != "project-a" {
				t.Fatalf("unexpected scope tenant=%q project=%q", tenantID, projectID)
			}
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "github-proof",
					"profiles": []map[string]interface{}{
						{
							"id":            "github-proof",
							"label":         "GitHub Proof",
							"driver":        "mcp_github",
							"endpointRef":   "ref://projects/project-a/providers/github/endpoint",
							"credentialRef": "ref://projects/project-a/providers/github/token",
							"allowedTools":  []string{"get_pull_request"},
							"allowedOwners": []string{"epydios"},
							"enabled":       true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, gatewayMCPProxyToolsPath+"?tenantId=tenant-a&projectId=project-a", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	state.handleMCPTools(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	var resp gatewayMCPToolsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools response: %v", err)
	}
	if len(resp.Tools) != 1 {
		t.Fatalf("expected one tool, got %d", len(resp.Tools))
	}
	if resp.Tools[0].Name != gatewayMCPToolGetPullRequest {
		t.Fatalf("tool name=%q want %q", resp.Tools[0].Name, gatewayMCPToolGetPullRequest)
	}
}

func TestGatewayMCPToolCallCreatesGitHubConnectorRunAndPersistsRecord(t *testing.T) {
	requestsRoot := t.TempDir()
	var captured runtimeapi.RunCreateRequest
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "github-proof",
					"profiles": []map[string]interface{}{
						{
							"id":            "github-proof",
							"label":         "GitHub Proof",
							"driver":        "mcp_github",
							"endpointRef":   "ref://projects/project-a/providers/github/endpoint",
							"credentialRef": "ref://projects/project-a/providers/github/token",
							"allowedTools":  []string{"get_pull_request"},
							"allowedOwners": []string{"epydios"},
							"enabled":       true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			captured = req
			return &runtimeapi.RunRecord{
				RunID:          "run-mcp-github-allow",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusCompleted,
				PolicyDecision: "ALLOW",
				EvidenceRecordResponse: mustGatewayJSONBytes(t, map[string]interface{}{
					"payloadEcho": map[string]interface{}{
						"connector": map[string]interface{}{
							"state": "completed",
							"connector": map[string]interface{}{
								"id":            "github-proof",
								"label":         "GitHub Proof",
								"driver":        "mcp_github",
								"endpointRef":   "ref://projects/project-a/providers/github/endpoint",
								"credentialRef": "ref://projects/project-a/providers/github/token",
							},
							"classification": map[string]interface{}{
								"statementClass": "api_read",
								"reason":         "owner is allowed by the bounded GitHub connector profile",
							},
							"result": map[string]interface{}{
								"owner":      "epydios",
								"repo":       "epydios-agentops-control-plane",
								"pullNumber": 21,
								"pullTitle":  "Bounded GitHub proof",
							},
						},
					},
				}),
			}, http.StatusCreated, nil
		},
	}

	body := bytes.NewBuffer(mustGatewayJSONBytes(t, map[string]interface{}{
		"tenantId":      "tenant-a",
		"projectId":     "project-a",
		"environmentId": "local",
		"connectorId":   "github-proof",
		"toolName":      "get_pull_request",
		"arguments": map[string]interface{}{
			"owner":       "epydios",
			"repo":        "epydios-agentops-control-plane",
			"pull_number": 21,
		},
		"sessionId":        "session-1",
		"protocolVersion":  "2025-03-26",
		"jsonrpcRequestId": 10,
		"client": map[string]interface{}{
			"id":   "client-mcp",
			"name": "Phase2 Test Shim",
		},
	}))
	req := httptest.NewRequest(http.MethodPost, gatewayMCPProxyToolCallPath, body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleMCPToolCall(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	if captured.Connector == nil {
		t.Fatalf("expected connector request to be populated")
	}
	if captured.Connector.Driver != "mcp_github" {
		t.Fatalf("driver=%q want mcp_github", captured.Connector.Driver)
	}
	if got := captured.Action["type"]; got != "connector.github.get_pull_request" {
		t.Fatalf("action.type=%v want connector.github.get_pull_request", got)
	}
	if got := captured.Resource["kind"]; got != "github-pull-request" {
		t.Fatalf("resource.kind=%v want github-pull-request", got)
	}

	var resp gatewayMCPToolCallResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools/call response: %v", err)
	}
	if resp.ToolResult.IsError {
		t.Fatalf("expected successful tool result, got error response %+v", resp.ToolResult)
	}

	record, err := readGatewayRequestRecord(requestsRoot, resp.GatewayRequestID)
	if err != nil {
		t.Fatalf("read gateway request record: %v", err)
	}
	if record.Interposition.ClientSurface != "mcp" {
		t.Fatalf("clientSurface=%q want mcp", record.Interposition.ClientSurface)
	}
	if record.Interposition.Upstream.Path != gatewayMCPProxyToolCallPath {
		t.Fatalf("upstream path=%q want %s", record.Interposition.Upstream.Path, gatewayMCPProxyToolCallPath)
	}
}

func TestGatewayMCPToolsListReturnsConfiguredBrowserTools(t *testing.T) {
	requestsRoot := t.TempDir()
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "browser-proof",
					"profiles": []map[string]interface{}{
						{
							"id":             "browser-proof",
							"label":          "Browser Proof",
							"driver":         "mcp_browser",
							"allowedTools":   []string{"get_page_metadata", "extract_text", "click_destructive_button"},
							"allowedOrigins": []string{"http://127.0.0.1:18888"},
							"enabled":        true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
	}

	req := httptest.NewRequest(http.MethodGet, gatewayMCPProxyToolsPath+"?tenantId=tenant-a&projectId=project-a", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	rec := httptest.NewRecorder()
	state.handleMCPTools(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	var resp gatewayMCPToolsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools response: %v", err)
	}
	if len(resp.Tools) != 3 {
		t.Fatalf("expected three tools, got %d", len(resp.Tools))
	}
	names := []string{resp.Tools[0].Name, resp.Tools[1].Name, resp.Tools[2].Name}
	sort.Strings(names)
	if names[0] != gatewayMCPToolClickDestructiveButton || names[1] != gatewayMCPToolExtractText || names[2] != gatewayMCPToolGetPageMetadata {
		t.Fatalf("tool names=%v want [click_destructive_button extract_text get_page_metadata]", names)
	}
}

func TestGatewayMCPToolCallCreatesBrowserConnectorRunAndPersistsRecord(t *testing.T) {
	requestsRoot := t.TempDir()
	var captured runtimeapi.RunCreateRequest
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "browser-proof",
					"profiles": []map[string]interface{}{
						{
							"id":             "browser-proof",
							"label":          "Browser Proof",
							"driver":         "mcp_browser",
							"allowedTools":   []string{"get_page_metadata", "extract_text", "click_destructive_button"},
							"allowedOrigins": []string{"http://127.0.0.1:18888"},
							"enabled":        true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			captured = req
			return &runtimeapi.RunRecord{
				RunID:          "run-mcp-browser-allow",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusCompleted,
				PolicyDecision: "ALLOW",
				EvidenceRecordResponse: mustGatewayJSONBytes(t, map[string]interface{}{
					"payloadEcho": map[string]interface{}{
						"connector": map[string]interface{}{
							"state": "completed",
							"connector": map[string]interface{}{
								"id":    "browser-proof",
								"label": "Browser Proof",
							},
							"classification": map[string]interface{}{
								"statementClass": "page_metadata_read",
								"reason":         "browser page is inside the bounded browser connector allowlist",
							},
							"result": map[string]interface{}{
								"pageTitle": "Bounded Browser Proof",
								"finalUrl":  "http://127.0.0.1:18888/articles/proof",
							},
						},
					},
				}),
			}, http.StatusCreated, nil
		},
	}

	body := bytes.NewBuffer(mustGatewayJSONBytes(t, map[string]interface{}{
		"tenantId":      "tenant-a",
		"projectId":     "project-a",
		"environmentId": "local",
		"connectorId":   "browser-proof",
		"toolName":      "get_page_metadata",
		"arguments": map[string]interface{}{
			"url": "http://127.0.0.1:18888/articles/proof",
		},
		"sessionId":        "session-1",
		"protocolVersion":  "2025-03-26",
		"jsonrpcRequestId": 11,
		"client": map[string]interface{}{
			"id":   "client-mcp",
			"name": "Phase2 Test Shim",
		},
	}))
	req := httptest.NewRequest(http.MethodPost, gatewayMCPProxyToolCallPath, body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleMCPToolCall(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	if captured.Connector == nil {
		t.Fatalf("expected connector request to be populated")
	}
	if captured.Connector.Driver != "mcp_browser" {
		t.Fatalf("driver=%q want mcp_browser", captured.Connector.Driver)
	}
	if got := captured.Action["type"]; got != "connector.browser.get_page_metadata" {
		t.Fatalf("action.type=%v want connector.browser.get_page_metadata", got)
	}
	if got := captured.Resource["kind"]; got != "browser-page" {
		t.Fatalf("resource.kind=%v want browser-page", got)
	}

	var resp gatewayMCPToolCallResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools/call response: %v", err)
	}
	if resp.ToolResult.IsError {
		t.Fatalf("expected successful tool result, got error response %+v", resp.ToolResult)
	}

	record, err := readGatewayRequestRecord(requestsRoot, resp.GatewayRequestID)
	if err != nil {
		t.Fatalf("read gateway request record: %v", err)
	}
	if record.Interposition.ClientSurface != "mcp" {
		t.Fatalf("clientSurface=%q want mcp", record.Interposition.ClientSurface)
	}
	if record.Interposition.Upstream.Path != gatewayMCPProxyToolCallPath {
		t.Fatalf("upstream path=%q want %s", record.Interposition.Upstream.Path, gatewayMCPProxyToolCallPath)
	}
}

func TestGatewayMCPToolCallDefersBrowserDestructiveClickAndPersistsHold(t *testing.T) {
	requestsRoot := filepath.Join(t.TempDir(), "requests")
	var captured runtimeapi.RunCreateRequest
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "browser-proof",
					"profiles": []map[string]interface{}{
						{
							"id":             "browser-proof",
							"label":          "Browser Proof",
							"driver":         "mcp_browser",
							"allowedTools":   []string{"get_page_metadata", "extract_text", "click_destructive_button"},
							"allowedOrigins": []string{"http://127.0.0.1:18888"},
							"enabled":        true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			captured = req
			return &runtimeapi.RunRecord{
				RunID:          "run-mcp-browser-defer",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPolicyEvaluated,
				PolicyDecision: "DEFER",
				ErrorMessage:   "operator approval required before destructive browser click",
				EvidenceRecordResponse: mustGatewayJSONBytes(t, map[string]interface{}{
					"payloadEcho": map[string]interface{}{
						"connector": map[string]interface{}{
							"state": "skipped",
							"connector": map[string]interface{}{
								"id":    "browser-proof",
								"label": "Browser Proof",
							},
							"classification": map[string]interface{}{
								"statementClass": "destructive_button_click",
								"reason":         "destructive browser control requires operator approval",
							},
						},
					},
				}),
			}, http.StatusCreated, nil
		},
	}

	body := bytes.NewBuffer(mustGatewayJSONBytes(t, map[string]interface{}{
		"tenantId":      "tenant-a",
		"projectId":     "project-a",
		"environmentId": "local",
		"connectorId":   "browser-proof",
		"toolName":      "click_destructive_button",
		"arguments": map[string]interface{}{
			"url":            "http://127.0.0.1:18888/articles/proof",
			"selector":       "#delete-button",
			"expected_label": "Delete draft",
		},
		"sessionId":        "session-1",
		"protocolVersion":  "2025-03-26",
		"jsonrpcRequestId": 12,
		"client": map[string]interface{}{
			"id":   "client-mcp",
			"name": "Phase2 Test Shim",
		},
	}))
	req := httptest.NewRequest(http.MethodPost, gatewayMCPProxyToolCallPath, body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleMCPToolCall(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	if captured.Connector == nil {
		t.Fatalf("expected connector request to be populated")
	}
	if captured.Connector.HumanApprovalGranted {
		t.Fatalf("humanApprovalGranted=%v want false", captured.Connector.HumanApprovalGranted)
	}

	var resp gatewayMCPToolCallResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode tools/call response: %v", err)
	}
	if !resp.ApprovalRequired {
		t.Fatalf("approvalRequired=%v want true", resp.ApprovalRequired)
	}
	if !resp.ToolResult.IsError {
		t.Fatalf("expected deferred tool result to surface as error")
	}
	holdRoot := gatewayHoldRecordsRoot(requestsRoot)
	hold, err := readGatewayHoldRecord(holdRoot, resp.InterpositionRequestID)
	if err != nil {
		t.Fatalf("read hold record: %v", err)
	}
	if hold.State != "held_pending_approval" {
		t.Fatalf("hold state=%q want held_pending_approval", hold.State)
	}
}

func TestGatewayMCPToolCallUsesApprovedBrowserDestructiveRetry(t *testing.T) {
	requestsRoot := filepath.Join(t.TempDir(), "requests")
	var captured runtimeapi.RunCreateRequest
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  DefaultLaunchOptions(),
		fetchConnectorSettingsHook: func(_ context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
			return &runtimeapi.ConnectorSettingsResponse{
				TenantID:    tenantID,
				ProjectID:   projectID,
				HasSettings: true,
				Settings: mustGatewayJSONBytes(t, map[string]interface{}{
					"selectedConnectorId": "browser-proof",
					"profiles": []map[string]interface{}{
						{
							"id":             "browser-proof",
							"label":          "Browser Proof",
							"driver":         "mcp_browser",
							"allowedTools":   []string{"get_page_metadata", "extract_text", "click_destructive_button"},
							"allowedOrigins": []string{"http://127.0.0.1:18888"},
							"enabled":        true,
						},
					},
				}),
			}, http.StatusOK, nil
		},
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			captured = req
			return &runtimeapi.RunRecord{
				RunID:          "run-mcp-browser-allow",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusCompleted,
				PolicyDecision: "ALLOW",
				EvidenceRecordResponse: mustGatewayJSONBytes(t, map[string]interface{}{
					"payloadEcho": map[string]interface{}{
						"connector": map[string]interface{}{
							"state": "completed",
							"connector": map[string]interface{}{
								"id":    "browser-proof",
								"label": "Browser Proof",
							},
							"classification": map[string]interface{}{
								"statementClass": "destructive_button_click",
								"reason":         "destructive browser control requires operator approval",
							},
							"result": map[string]interface{}{
								"clicked":           true,
								"resolvedLabel":     "Delete draft",
								"postClickFinalUrl": "http://127.0.0.1:18888/articles/deleted",
							},
						},
					},
				}),
			}, http.StatusCreated, nil
		},
	}

	originalBody := mustGatewayJSONBytes(t, map[string]interface{}{
		"tenantId":      "tenant-a",
		"projectId":     "project-a",
		"environmentId": "local",
		"connectorId":   "browser-proof",
		"toolName":      "click_destructive_button",
		"arguments": map[string]interface{}{
			"url":            "http://127.0.0.1:18888/articles/proof",
			"selector":       "#delete-button",
			"expected_label": "Delete draft",
		},
		"sessionId":        "session-1",
		"protocolVersion":  "2025-03-26",
		"jsonrpcRequestId": 13,
		"client": map[string]interface{}{
			"id":   "client-mcp",
			"name": "Phase2 Test Shim",
		},
	})
	interposition := gatewayInterpositionEnvelope{
		InterpositionRequestID: "interposition-approved",
		State:                  "approval_granted",
		IdempotencyKey:         "13",
		Upstream: gatewayUpstreamDescriptor{
			BodySHA256: gatewayBodySHA256(originalBody),
		},
	}
	if err := writeGatewayRequestRecord(requestsRoot, gatewayRequestRecord{
		GatewayRequestID: "gateway-approved",
		TenantID:         "tenant-a",
		ProjectID:        "project-a",
		EnvironmentID:    "local",
		Interposition:    interposition,
		Request: gatewayGovernedActionRequest{
			TenantID:      "tenant-a",
			ProjectID:     "project-a",
			EnvironmentID: "local",
			ActionType:    "connector.browser.click_destructive_button",
			TargetRef:     "browser-proof",
		},
		Result: gatewayGovernedActionResult{
			ApprovalID:     "approval-run-browser",
			State:          "deferred",
			PolicyDecision: "ALLOW",
		},
	}); err != nil {
		t.Fatalf("seed request record: %v", err)
	}
	holdRoot := gatewayHoldRecordsRoot(requestsRoot)
	if err := writeGatewayHoldRecord(holdRoot, GatewayHoldRecord{
		InterpositionRequestID: "interposition-approved",
		GatewayRequestID:       "gateway-approved",
		RunID:                  "run-browser-defer",
		ApprovalID:             "approval-run-browser",
		State:                  "approval_granted",
		CreatedAtUTC:           "2026-03-26T00:00:00Z",
		UpdatedAtUTC:           "2026-03-26T00:00:00Z",
	}); err != nil {
		t.Fatalf("seed hold record: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, gatewayMCPProxyToolCallPath, bytes.NewBuffer(originalBody))
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleMCPToolCall(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	if captured.Connector == nil {
		t.Fatalf("expected connector request to be populated")
	}
	if !captured.Connector.HumanApprovalGranted {
		t.Fatalf("humanApprovalGranted=%v want true", captured.Connector.HumanApprovalGranted)
	}
	if captured.Connector.ApprovalID != "approval-run-browser" {
		t.Fatalf("approvalId=%q want approval-run-browser", captured.Connector.ApprovalID)
	}

	updatedHold, err := readGatewayHoldRecord(holdRoot, "interposition-approved")
	if err != nil {
		t.Fatalf("read updated hold: %v", err)
	}
	if updatedHold.State != "approval_consumed" {
		t.Fatalf("hold state=%q want approval_consumed", updatedHold.State)
	}
}

func mustGatewayJSONBytes(t *testing.T, value interface{}) []byte {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return encoded
}
