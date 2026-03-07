package runtime

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func upsertTestIntegrationSettings(t *testing.T, store *memoryRunStore, tenantID, projectID string, settings map[string]interface{}) {
	t.Helper()
	raw, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}
	if err := store.UpsertIntegrationSettings(context.Background(), &IntegrationSettingsRecord{
		TenantID:  tenantID,
		ProjectID: projectID,
		Settings:  raw,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("upsert integration settings: %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func jsonHTTPResponse(status int, payload map[string]interface{}) (*http.Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(string(body))),
	}, nil
}

func newTestAPIServerWithInvoker(t *testing.T, store *memoryRunStore, refValues map[string]interface{}, transport http.RoundTripper) http.Handler {
	t.Helper()
	refJSON, err := json.Marshal(refValues)
	if err != nil {
		t.Fatalf("marshal ref values: %v", err)
	}
	invoker := NewAgentInvoker(store, AgentInvokerConfig{
		RefValuesJSON: string(refJSON),
		HTTPTimeout:   5 * time.Second,
	})
	if transport != nil {
		invoker.httpClient = &http.Client{
			Timeout:   5 * time.Second,
			Transport: transport,
		}
	}
	server := NewAPIServer(store, nil, nil).WithAgentInvoker(invoker)
	return server.Routes()
}

func TestRuntimeIntegrationInvokeOpenAIGateway(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawAuth string
	var sawPath string
	store := newMemoryRunStore()
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://gateways/litellm/openai-compatible":                      "https://gateway.local",
		"ref://projects/project-a/gateways/litellm/bearer-token":       "gateway-token",
		"ref://projects/project-a/providers/openai-compatible/api-key": "unused-direct-key",
	}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		sawAuth = r.Header.Get("Authorization")
		sawPath = r.URL.Path
		return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
			"status":      "completed",
			"output_text": "codex gateway response",
			"usage": map[string]interface{}{
				"output_tokens": 21,
			},
		})
	}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
			"requestId": "req-openai-gateway",
		},
		"agentProfileId":  "codex",
		"prompt":          "Explain the run state.",
		"systemPrompt":    "Be concise.",
		"maxOutputTokens": 128,
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if sawAuth != "Bearer gateway-token" {
		t.Fatalf("Authorization=%q want gateway token", sawAuth)
	}
	if sawPath != "/v1/responses" {
		t.Fatalf("path=%q want /v1/responses", sawPath)
	}

	var response AgentInvokeResponse
	decodeResponseBody(t, rr, &response)
	if response.Route != "gateway" {
		t.Fatalf("route=%q want gateway", response.Route)
	}
	if response.OutputText != "codex gateway response" {
		t.Fatalf("outputText=%q", response.OutputText)
	}
}

func TestRuntimeIntegrationInvokeAnthropicDirect(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawAPIKey string
	var sawPath string
	store := newMemoryRunStore()
	upsertTestIntegrationSettings(t, store, tenantID, projectID, map[string]interface{}{
		"selectedAgentProfileId": "anthropic",
		"modelRouting":           "direct_first",
		"profileTransport":       "messages_api",
		"profileModel":           "claude-sonnet-latest",
		"profileEndpointRef":     "ref://projects/project-a/providers/anthropic/endpoint",
		"profileCredentialRef":   "ref://projects/project-a/providers/anthropic/api-key",
		"profileCredentialScope": "project",
		"profileEnabled":         true,
	})
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/anthropic/endpoint": "https://anthropic.local",
		"ref://projects/project-a/providers/anthropic/api-key":  "anthropic-test-key",
		}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
			sawAPIKey = r.Header.Get("x-api-key")
			sawPath = r.URL.Path
			return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
				"content": []map[string]interface{}{
					{"type": "text", "text": "anthropic direct response"},
				},
				"stop_reason": "end_turn",
			})
		}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"agentProfileId": "anthropic",
		"prompt":         "Summarize the policy result.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if sawAPIKey != "anthropic-test-key" {
		t.Fatalf("x-api-key=%q want anthropic-test-key", sawAPIKey)
	}
	if sawPath != "/v1/messages" {
		t.Fatalf("path=%q want /v1/messages", sawPath)
	}

	var response AgentInvokeResponse
	decodeResponseBody(t, rr, &response)
	if response.Route != "direct" {
		t.Fatalf("route=%q want direct", response.Route)
	}
	if response.OutputText != "anthropic direct response" {
		t.Fatalf("outputText=%q", response.OutputText)
	}
}

func TestRuntimeIntegrationInvokeGoogleDirect(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawQueryKey string
	var sawPath string
	store := newMemoryRunStore()
	upsertTestIntegrationSettings(t, store, tenantID, projectID, map[string]interface{}{
		"selectedAgentProfileId": "google",
		"modelRouting":           "direct_first",
		"profileTransport":       "gemini_api",
		"profileModel":           "gemini-2.5-pro",
		"profileEndpointRef":     "ref://projects/project-a/providers/google/endpoint",
		"profileCredentialRef":   "ref://projects/project-a/providers/google/api-key",
		"profileCredentialScope": "project",
		"profileEnabled":         true,
	})
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/google/endpoint": "https://google.local",
		"ref://projects/project-a/providers/google/api-key":  "google-test-key",
		}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
			sawQueryKey = r.URL.Query().Get("key")
			sawPath = r.URL.Path
			return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
				"candidates": []map[string]interface{}{
				{
					"finishReason": "STOP",
					"content": map[string]interface{}{
						"parts": []map[string]interface{}{
							{"text": "google direct response"},
						},
					},
					},
				},
			})
		}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"agentProfileId": "google",
		"prompt":         "List the most important events.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if sawQueryKey != "google-test-key" {
		t.Fatalf("query key=%q want google-test-key", sawQueryKey)
	}
	if !strings.HasSuffix(sawPath, "/v1beta/models/gemini-2.5-pro:generateContent") {
		t.Fatalf("path=%q", sawPath)
	}
}

func TestRuntimeIntegrationInvokeAzureDirect(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawAPIKey string
	var sawQueryVersion string
	store := newMemoryRunStore()
	upsertTestIntegrationSettings(t, store, tenantID, projectID, map[string]interface{}{
		"selectedAgentProfileId": "azure_openai",
		"modelRouting":           "direct_first",
		"profileTransport":       "chat_completions_api",
		"profileModel":           "gpt-4.1",
		"profileEndpointRef":     "ref://projects/project-a/providers/azure-openai/endpoint",
		"profileCredentialRef":   "ref://projects/project-a/providers/azure-openai/api-key",
		"profileCredentialScope": "project",
		"profileEnabled":         true,
	})
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/azure-openai/endpoint": "https://azure.local",
		"ref://projects/project-a/providers/azure-openai/api-key":  "azure-test-key",
		}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
			sawAPIKey = r.Header.Get("api-key")
			sawQueryVersion = r.URL.Query().Get("api-version")
			return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
				"choices": []map[string]interface{}{
				{
					"finish_reason": "stop",
					"message": map[string]interface{}{
						"content": "azure direct response",
					},
					},
				},
			})
		}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"agentProfileId": "azure_openai",
		"prompt":         "Summarize desktop verification.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if sawAPIKey != "azure-test-key" {
		t.Fatalf("api-key=%q want azure-test-key", sawAPIKey)
	}
	if sawQueryVersion != defaultAzureOpenAIAPIVersion {
		t.Fatalf("api-version=%q want %q", sawQueryVersion, defaultAzureOpenAIAPIVersion)
	}
}

func TestRuntimeIntegrationInvokeBedrockDirect(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawAuth string
	var sawXAmzDate string
	var sawSecurityToken string
	store := newMemoryRunStore()
	upsertTestIntegrationSettings(t, store, tenantID, projectID, map[string]interface{}{
		"selectedAgentProfileId": "bedrock",
		"modelRouting":           "direct_first",
		"profileTransport":       "bedrock_invoke_model",
		"profileModel":           "anthropic.claude-3-7-sonnet",
		"profileEndpointRef":     "ref://projects/project-a/providers/bedrock/region-endpoint",
		"profileCredentialRef":   "ref://projects/project-a/providers/bedrock/role-arn",
		"profileCredentialScope": "project",
		"profileEnabled":         true,
	})
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/bedrock/region-endpoint": "https://bedrock.local",
		"ref://projects/project-a/providers/bedrock/role-arn": map[string]interface{}{
			"region":          "us-east-1",
			"accessKeyId":     "AKIATESTKEY123456",
			"secretAccessKey": "secret-test-key",
			"sessionToken":    "session-token",
		},
		}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
			sawAuth = r.Header.Get("Authorization")
			sawXAmzDate = r.Header.Get("X-Amz-Date")
			sawSecurityToken = r.Header.Get("X-Amz-Security-Token")
			return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
			"content": []map[string]interface{}{
					{"type": "text", "text": "bedrock direct response"},
				},
				"stop_reason": "end_turn",
			})
		}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"agentProfileId": "bedrock",
		"prompt":         "Explain the evidence bundle.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(sawAuth, "AWS4-HMAC-SHA256") {
		t.Fatalf("Authorization=%q want SigV4", sawAuth)
	}
	if sawXAmzDate == "" {
		t.Fatal("expected X-Amz-Date header")
	}
	if sawSecurityToken != "session-token" {
		t.Fatalf("X-Amz-Security-Token=%q", sawSecurityToken)
	}
}
