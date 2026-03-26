package runtime

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

func connectorSettingsFixture(dbPath string) map[string]interface{} {
	return map[string]interface{}{
		"selectedConnectorId": "sqlite-proof",
		"profiles": []map[string]interface{}{
			{
				"id":           "sqlite-proof",
				"label":        "SQLite Proof",
				"driver":       connectorDriverMCPSQLite,
				"databasePath": dbPath,
				"allowedTools": []string{connectorToolQueryReadOnly},
				"enabled":      true,
			},
		},
	}
}

func postgresConnectorSettingsFixture(connectionURI string) map[string]interface{} {
	return map[string]interface{}{
		"selectedConnectorId": "postgres-proof",
		"profiles": []map[string]interface{}{
			{
				"id":            "postgres-proof",
				"label":         "Postgres Proof",
				"driver":        connectorDriverMCPPostgres,
				"connectionUri": connectionURI,
				"allowedTools":  []string{connectorToolQueryReadOnly},
				"enabled":       true,
			},
		},
	}
}

func filesystemConnectorSettingsFixture(rootPath string) map[string]interface{} {
	return map[string]interface{}{
		"selectedConnectorId": "filesystem-proof",
		"profiles": []map[string]interface{}{
			{
				"id":           "filesystem-proof",
				"label":        "Filesystem Proof",
				"driver":       connectorDriverMCPFilesystem,
				"rootPath":     rootPath,
				"allowedTools": []string{connectorToolReadText, connectorToolListDirectory},
				"enabled":      true,
			},
		},
	}
}

func githubConnectorSettingsFixture(endpointRef, credentialRef string) map[string]interface{} {
	return map[string]interface{}{
		"selectedConnectorId": "github-proof",
		"profiles": []map[string]interface{}{
			{
				"id":            "github-proof",
				"label":         "GitHub Proof",
				"driver":        connectorDriverMCPGitHub,
				"endpointRef":   endpointRef,
				"credentialRef": credentialRef,
				"allowedTools":  []string{connectorToolGetPullRequest},
				"allowedOwners": []string{"epydios"},
				"allowedRepos":  []string{"epydios/epydios-agentops-control-plane"},
				"enabled":       true,
			},
		},
	}
}

func TestRuntimeConnectorSettingsPutGetRoundTrip(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	modelSettings := integrationSettingsFixture()
	if err := store.UpsertIntegrationSettings(context.Background(), &IntegrationSettingsRecord{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Settings:  mustMarshalJSON(modelSettings),
	}); err != nil {
		t.Fatalf("seed integration settings: %v", err)
	}

	dbPath := filepath.Join(t.TempDir(), "connector-proof.sqlite")
	putBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": connectorSettingsFixture(dbPath),
	}
	putResp := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", putBody)
	if putResp.Code != http.StatusOK {
		t.Fatalf("PUT connector settings code=%d body=%s", putResp.Code, putResp.Body.String())
	}

	var putPayload ConnectorSettingsResponse
	decodeResponseBody(t, putResp, &putPayload)
	if !putPayload.HasSettings {
		t.Fatalf("expected hasSettings=true after PUT")
	}

	getResp := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/connectors/settings?tenantId=tenant-a&projectId=project-a", nil)
	if getResp.Code != http.StatusOK {
		t.Fatalf("GET connector settings code=%d body=%s", getResp.Code, getResp.Body.String())
	}

	var getPayload ConnectorSettingsResponse
	decodeResponseBody(t, getResp, &getPayload)
	if !getPayload.HasSettings {
		t.Fatalf("expected connector settings to be present")
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(getPayload.Settings, &settings); err != nil {
		t.Fatalf("decode connector settings: %v", err)
	}
	if got := settings["selectedConnectorId"]; got != "sqlite-proof" {
		t.Fatalf("selectedConnectorId=%v want sqlite-proof", got)
	}
	if getPayload.Source != "connector-store" {
		t.Fatalf("source=%q want connector-store", getPayload.Source)
	}

	record, err := store.GetIntegrationSettings(context.Background(), "tenant-a", "project-a")
	if err != nil {
		t.Fatalf("load merged integration settings: %v", err)
	}
	var merged map[string]interface{}
	if err := json.Unmarshal(record.Settings, &merged); err != nil {
		t.Fatalf("decode merged settings: %v", err)
	}
	if got := merged["modelRouting"]; got != "gateway_first" {
		t.Fatalf("modelRouting=%v want gateway_first", got)
	}
	if _, ok := merged["connectors"]; ok {
		t.Fatalf("expected integration settings to stay free of connector subtree: %+v", merged)
	}

	connectorRecord, err := store.GetConnectorSettings(context.Background(), "tenant-a", "project-a")
	if err != nil {
		t.Fatalf("load dedicated connector settings: %v", err)
	}
	var storedConnectorSettings map[string]interface{}
	if err := json.Unmarshal(connectorRecord.Settings, &storedConnectorSettings); err != nil {
		t.Fatalf("decode dedicated connector settings: %v", err)
	}
	if got := storedConnectorSettings["selectedConnectorId"]; got != "sqlite-proof" {
		t.Fatalf("connector store selectedConnectorId=%v want sqlite-proof", got)
	}
}

func TestRuntimeConnectorSettingsPutRejectsRelativeDatabasePath(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": connectorSettingsFixture("relative/proof.sqlite"),
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status=%d, got=%d body=%s", http.StatusBadRequest, rr.Code, rr.Body.String())
	}

	var apiErr APIError
	decodeResponseBody(t, rr, &apiErr)
	if apiErr.ErrorCode != "INVALID_SETTINGS" {
		t.Fatalf("errorCode=%q want INVALID_SETTINGS", apiErr.ErrorCode)
	}
	detailsJSON, _ := json.Marshal(apiErr.Details)
	if !strings.Contains(string(detailsJSON), "databasePath must be an absolute path") {
		t.Fatalf("expected absolute path validation error, got details=%s", string(detailsJSON))
	}
}

func TestRuntimeConnectorSettingsPutGetRoundTripPostgres(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	putBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": postgresConnectorSettingsFixture("postgres://postgres:proof-pass@127.0.0.1:54329/proofdb?sslmode=disable"),
	}
	putResp := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", putBody)
	if putResp.Code != http.StatusOK {
		t.Fatalf("PUT postgres connector settings code=%d body=%s", putResp.Code, putResp.Body.String())
	}

	getResp := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/connectors/settings?tenantId=tenant-a&projectId=project-a", nil)
	if getResp.Code != http.StatusOK {
		t.Fatalf("GET postgres connector settings code=%d body=%s", getResp.Code, getResp.Body.String())
	}

	var getPayload ConnectorSettingsResponse
	decodeResponseBody(t, getResp, &getPayload)
	if !getPayload.HasSettings {
		t.Fatalf("expected postgres connector settings to be present")
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(getPayload.Settings, &settings); err != nil {
		t.Fatalf("decode postgres connector settings: %v", err)
	}
	if got := settings["selectedConnectorId"]; got != "postgres-proof" {
		t.Fatalf("selectedConnectorId=%v want postgres-proof", got)
	}
}

func TestRuntimeConnectorSettingsPutRejectsInvalidPostgresConnectionURI(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": postgresConnectorSettingsFixture("mysql://root:password@127.0.0.1:3306/proofdb"),
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status=%d, got=%d body=%s", http.StatusBadRequest, rr.Code, rr.Body.String())
	}

	var apiErr APIError
	decodeResponseBody(t, rr, &apiErr)
	if apiErr.ErrorCode != "INVALID_SETTINGS" {
		t.Fatalf("errorCode=%q want INVALID_SETTINGS", apiErr.ErrorCode)
	}
	detailsJSON, _ := json.Marshal(apiErr.Details)
	if !strings.Contains(string(detailsJSON), "connectionUri must use postgres:// or postgresql:// format") {
		t.Fatalf("expected postgres URI validation error, got details=%s", string(detailsJSON))
	}
}

func TestRuntimeConnectorSettingsPutGetRoundTripGitHub(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	putBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": githubConnectorSettingsFixture("ref://projects/{projectId}/providers/github/endpoint", "ref://projects/{projectId}/providers/github/token"),
	}
	putResp := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", putBody)
	if putResp.Code != http.StatusOK {
		t.Fatalf("PUT github connector settings code=%d body=%s", putResp.Code, putResp.Body.String())
	}

	getResp := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/connectors/settings?tenantId=tenant-a&projectId=project-a", nil)
	if getResp.Code != http.StatusOK {
		t.Fatalf("GET github connector settings code=%d body=%s", getResp.Code, getResp.Body.String())
	}

	var getPayload ConnectorSettingsResponse
	decodeResponseBody(t, getResp, &getPayload)
	if !getPayload.HasSettings {
		t.Fatalf("expected github connector settings to be present")
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(getPayload.Settings, &settings); err != nil {
		t.Fatalf("decode github connector settings: %v", err)
	}
	if got := settings["selectedConnectorId"]; got != "github-proof" {
		t.Fatalf("selectedConnectorId=%v want github-proof", got)
	}
}

func TestRuntimeConnectorSettingsPutRejectsGitHubRawCredential(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": githubConnectorSettingsFixture("ref://projects/{projectId}/providers/github/endpoint", "ghp_super_secret_token_value"),
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status=%d, got=%d body=%s", http.StatusBadRequest, rr.Code, rr.Body.String())
	}

	var apiErr APIError
	decodeResponseBody(t, rr, &apiErr)
	if apiErr.ErrorCode != "INVALID_SETTINGS" {
		t.Fatalf("errorCode=%q want INVALID_SETTINGS", apiErr.ErrorCode)
	}
	detailsJSON, _ := json.Marshal(apiErr.Details)
	if !strings.Contains(string(detailsJSON), "credentialRef") || !strings.Contains(string(detailsJSON), "ref://") {
		t.Fatalf("expected github credential ref validation error, got details=%s", string(detailsJSON))
	}
}

func TestRuntimeConnectorSettingsGetFallsBackToLegacyIntegrationSubtree(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	dbPath := filepath.Join(t.TempDir(), "connector-proof.sqlite")
	legacySettings := map[string]interface{}{
		"modelRouting": "gateway_first",
		"connectors":   connectorSettingsFixture(dbPath),
	}
	if err := store.UpsertIntegrationSettings(context.Background(), &IntegrationSettingsRecord{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Settings:  mustMarshalJSON(legacySettings),
	}); err != nil {
		t.Fatalf("seed legacy integration settings: %v", err)
	}

	getResp := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/connectors/settings?tenantId=tenant-a&projectId=project-a", nil)
	if getResp.Code != http.StatusOK {
		t.Fatalf("GET connector settings code=%d body=%s", getResp.Code, getResp.Body.String())
	}

	var getPayload ConnectorSettingsResponse
	decodeResponseBody(t, getResp, &getPayload)
	if !getPayload.HasSettings {
		t.Fatalf("expected connector settings fallback to be present")
	}
	if getPayload.Source != "integration-store-compat" {
		t.Fatalf("source=%q want integration-store-compat", getPayload.Source)
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(getPayload.Settings, &settings); err != nil {
		t.Fatalf("decode fallback connector settings: %v", err)
	}
	if got := settings["selectedConnectorId"]; got != "sqlite-proof" {
		t.Fatalf("selectedConnectorId=%v want sqlite-proof", got)
	}
}

func TestRuntimeConnectorSettingsPutGetRoundTripFilesystem(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rootPath := t.TempDir()
	putBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": filesystemConnectorSettingsFixture(rootPath),
	}
	putResp := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", putBody)
	if putResp.Code != http.StatusOK {
		t.Fatalf("PUT filesystem connector settings code=%d body=%s", putResp.Code, putResp.Body.String())
	}

	getResp := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/connectors/settings?tenantId=tenant-a&projectId=project-a", nil)
	if getResp.Code != http.StatusOK {
		t.Fatalf("GET filesystem connector settings code=%d body=%s", getResp.Code, getResp.Body.String())
	}

	var getPayload ConnectorSettingsResponse
	decodeResponseBody(t, getResp, &getPayload)
	if !getPayload.HasSettings {
		t.Fatalf("expected filesystem connector settings to be present")
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(getPayload.Settings, &settings); err != nil {
		t.Fatalf("decode filesystem connector settings: %v", err)
	}
	if got := settings["selectedConnectorId"]; got != "filesystem-proof" {
		t.Fatalf("selectedConnectorId=%v want filesystem-proof", got)
	}
}

func TestRuntimeConnectorSettingsPutRejectsRelativeFilesystemRootPath(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/connectors/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": filesystemConnectorSettingsFixture("relative/proof-root"),
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status=%d, got=%d body=%s", http.StatusBadRequest, rr.Code, rr.Body.String())
	}

	var apiErr APIError
	decodeResponseBody(t, rr, &apiErr)
	if apiErr.ErrorCode != "INVALID_SETTINGS" {
		t.Fatalf("errorCode=%q want INVALID_SETTINGS", apiErr.ErrorCode)
	}
	detailsJSON, _ := json.Marshal(apiErr.Details)
	if !strings.Contains(string(detailsJSON), "rootPath must be an absolute path") {
		t.Fatalf("expected filesystem rootPath validation error, got details=%s", string(detailsJSON))
	}
}
