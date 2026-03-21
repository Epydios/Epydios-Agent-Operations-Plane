package nativeapp

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNativeAssetHandlerProxiesRuntimeHealth(t *testing.T) {
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" {
			t.Fatalf("expected /healthz path, got %s", r.URL.Path)
		}
		if got := r.URL.RawQuery; got != "probe=1" {
			t.Fatalf("expected query probe=1, got %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"status":"ok"}`)
	}))
	defer runtime.Close()

	handler := NewNativeAssetHandler(&Session{
		Manifest: SessionManifest{
			Mode:              modeLive,
			RuntimeAPIBaseURL: runtime.URL,
			RuntimeService: RuntimeServiceRecord{
				RuntimeAPIBaseURL: runtime.URL,
			},
		},
	})

	req := httptest.NewRequest(http.MethodGet, "http://desktop.local/healthz?probe=1", nil)
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
	var payload map[string]string
	if err := json.Unmarshal(resp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["status"] != "ok" {
		t.Fatalf("expected status ok payload, got %#v", payload)
	}
}

func TestNativeAssetHandlerProxiesProviderRegistryRoute(t *testing.T) {
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("did not expect runtime server to receive %s", r.URL.Path)
	}))
	defer runtime.Close()

	registry := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1alpha1/providers" {
			t.Fatalf("expected providers path, got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"items":[{"providerId":"oss-policy-opa"}]}`)
	}))
	defer registry.Close()

	handler := NewNativeAssetHandler(&Session{
		Manifest: SessionManifest{
			Mode:               modeLive,
			RuntimeAPIBaseURL:  runtime.URL,
			RegistryAPIBaseURL: registry.URL,
			RuntimeService: RuntimeServiceRecord{
				RuntimeAPIBaseURL: runtime.URL,
			},
		},
	})

	req := httptest.NewRequest(http.MethodGet, "http://desktop.local/v1alpha1/providers", nil)
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
	if !strings.Contains(resp.Body.String(), "oss-policy-opa") {
		t.Fatalf("expected registry payload, got %s", resp.Body.String())
	}
}

func TestNativeAssetHandlerForwardsMethodBodyAndHeaders(t *testing.T) {
	runtime := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer gateway-token" {
			t.Fatalf("expected Authorization header to be forwarded, got %q", auth)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read upstream body: %v", err)
		}
		if string(body) != `{"decision":"approve"}` {
			t.Fatalf("expected request body to be forwarded, got %s", string(body))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"status":"ok"}`)
	}))
	defer runtime.Close()

	handler := NewNativeAssetHandler(&Session{
		Manifest: SessionManifest{
			Mode:              modeLive,
			RuntimeAPIBaseURL: runtime.URL,
			RuntimeService: RuntimeServiceRecord{
				RuntimeAPIBaseURL: runtime.URL,
			},
		},
	})

	req := httptest.NewRequest(
		http.MethodPost,
		"http://desktop.local/v1alpha1/runtime/approvals/approval-1/decision",
		strings.NewReader(`{"decision":"approve"}`),
	)
	req.Header.Set("Authorization", "Bearer gateway-token")
	req.Header.Set("Content-Type", "application/json")

	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.Code)
	}
}

func TestNativeAssetHandlerRejectsProxyOutsideLiveMode(t *testing.T) {
	handler := NewNativeAssetHandler(&Session{
		Manifest: SessionManifest{
			Mode: modeMock,
		},
	})

	req := httptest.NewRequest(http.MethodGet, "http://desktop.local/healthz", nil)
	resp := httptest.NewRecorder()
	handler.ServeHTTP(resp, req)

	if resp.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status 503, got %d", resp.Code)
	}
}
