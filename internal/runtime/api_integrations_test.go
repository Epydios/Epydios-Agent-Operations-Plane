package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func integrationSettingsFixture() map[string]interface{} {
	return map[string]interface{}{
		"modelRouting":                "gateway_first",
		"gatewayProviderId":           "litellm",
		"gatewayTokenRef":             "ref://projects/project-a/gateways/litellm/bearer-token",
		"gatewayMtlsCertRef":          "ref://projects/project-a/gateways/litellm/mtls-cert",
		"gatewayMtlsKeyRef":           "ref://projects/project-a/gateways/litellm/mtls-key",
		"allowDirectProviderFallback": true,
		"selectedAgentProfileId":      "codex",
		"profileTransport":            "responses_api",
		"profileModel":                "gpt-5-codex",
		"profileEndpointRef":          "ref://gateways/litellm/openai-compatible",
		"profileCredentialRef":        "ref://projects/project-a/providers/openai-compatible/api-key",
		"profileCredentialScope":      "project",
		"profileEnabled":              true,
		"agentProfiles": []map[string]interface{}{
			{
				"id":              "codex",
				"endpointRef":     "ref://gateways/litellm/openai-compatible",
				"credentialRef":   "ref://projects/project-a/providers/openai-compatible/api-key",
				"credentialScope": "project",
				"enabled":         true,
			},
		},
	}
}

func requestJSONWithContext(t *testing.T, handler http.Handler, ctx context.Context, method, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	if ctx != nil {
		req = req.WithContext(ctx)
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

func TestRuntimeIntegrationSettingsPutGetRoundTrip(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	putBody := map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": integrationSettingsFixture(),
	}
	putResp := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/integrations/settings", putBody)
	if putResp.Code != http.StatusOK {
		t.Fatalf("PUT integration settings code=%d body=%s", putResp.Code, putResp.Body.String())
	}

	var putPayload IntegrationSettingsResponse
	decodeResponseBody(t, putResp, &putPayload)
	if !putPayload.HasSettings {
		t.Fatalf("expected hasSettings=true after PUT")
	}
	if putPayload.TenantID != "tenant-a" || putPayload.ProjectID != "project-a" {
		t.Fatalf("unexpected scope in PUT response: tenant=%q project=%q", putPayload.TenantID, putPayload.ProjectID)
	}

	getResp := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/integrations/settings?tenantId=tenant-a&projectId=project-a", nil)
	if getResp.Code != http.StatusOK {
		t.Fatalf("GET integration settings code=%d body=%s", getResp.Code, getResp.Body.String())
	}

	var getPayload IntegrationSettingsResponse
	decodeResponseBody(t, getResp, &getPayload)
	if !getPayload.HasSettings {
		t.Fatalf("expected hasSettings=true on GET")
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(getPayload.Settings, &settings); err != nil {
		t.Fatalf("decode settings payload: %v", err)
	}
	if got, want := settings["modelRouting"], "gateway_first"; got != want {
		t.Fatalf("modelRouting=%v want %v", got, want)
	}
	if got, want := settings["selectedAgentProfileId"], "codex"; got != want {
		t.Fatalf("selectedAgentProfileId=%v want %v", got, want)
	}
	if got := settings["profileCredentialRef"]; got != "ref://projects/project-a/providers/openai-compatible/api-key" {
		t.Fatalf("profileCredentialRef=%v", got)
	}
}

func TestRuntimeIntegrationSettingsPutRejectsInvalidReference(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	settings := integrationSettingsFixture()
	settings["gatewayTokenRef"] = "https://token.example.com/raw"

	rr := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/integrations/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": settings,
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
	if !strings.Contains(string(detailsJSON), "must use ref:// format") {
		t.Fatalf("expected ref format validation error, got details=%s", string(detailsJSON))
	}
}

func TestRuntimeIntegrationSettingsPutRejectsRawSecretLikeValues(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	settings := integrationSettingsFixture()
	settings["gatewayTokenRef"] = "sk-1234567890abcdefghijklmnop"

	rr := requestJSON(t, handler, http.MethodPut, "/v1alpha1/runtime/integrations/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"settings": settings,
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
	if !strings.Contains(string(detailsJSON), "raw secret material") {
		t.Fatalf("expected raw secret validation error, got details=%s", string(detailsJSON))
	}
}

func TestRuntimeIntegrationSettingsPutScopeMismatchDenied(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	identity := &RuntimeIdentity{
		Subject:    "user-scope-test",
		TenantIDs:  []string{"tenant-a"},
		ProjectIDs: []string{"project-a"},
	}
	reqCtx := withRuntimeIdentity(context.Background(), identity)

	rr := requestJSONWithContext(t, handler, reqCtx, http.MethodPut, "/v1alpha1/runtime/integrations/settings", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-b",
			"projectId": "project-a",
		},
		"settings": integrationSettingsFixture(),
	})
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status=%d, got=%d body=%s", http.StatusForbidden, rr.Code, rr.Body.String())
	}

	var apiErr APIError
	decodeResponseBody(t, rr, &apiErr)
	if apiErr.ErrorCode != "FORBIDDEN" {
		t.Fatalf("errorCode=%q want FORBIDDEN", apiErr.ErrorCode)
	}
}

func TestRuntimeIntegrationSettingsGetRequiresScope(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/integrations/settings?tenantId=tenant-a", nil)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected status=%d, got=%d body=%s", http.StatusBadRequest, rr.Code, rr.Body.String())
	}

	var apiErr APIError
	decodeResponseBody(t, rr, &apiErr)
	if apiErr.ErrorCode != "INVALID_SCOPE" {
		t.Fatalf("errorCode=%q want INVALID_SCOPE", apiErr.ErrorCode)
	}
}
