package nativeapp

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"testing/fstest"
)

func TestStartRuntimeServiceAcceptsVerifierManagedExternalRuntime(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("XDG_CACHE_HOME", filepath.Join(tempHome, ".cache"))

	assets := fstest.MapFS{
		"web/config/runtime-config.json": {
			Data: []byte(`{
  "environment": "local",
  "mockMode": true,
  "runtimeApiBaseUrl": "http://127.0.0.1:8080",
  "registryApiBaseUrl": "http://127.0.0.1:8080",
  "auth": {
    "enabled": true
  }
}`),
		},
		"web/index.html": {Data: []byte("<html></html>")},
	}

	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Skipf("loopback listener unavailable in this environment: %v", err)
	}
	defer listener.Close()

	runtimeServer := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/healthz" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	runtimeServer.Listener = listener
	runtimeServer.Start()
	defer runtimeServer.Close()

	parsed, err := url.Parse(runtimeServer.URL)
	if err != nil {
		t.Fatalf("parse runtime server url: %v", err)
	}
	port := parsed.Port()
	if port == "" {
		t.Fatalf("runtime server missing port in %q", runtimeServer.URL)
	}

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeManagedExternally = true
	opts.RuntimeLocalPort = mustAtoi(t, port)

	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}

	record, err := StartRuntimeService(opts, session)
	if err != nil {
		t.Fatalf("start runtime service: %v", err)
	}
	if record.State != runtimeServiceStateRunning {
		t.Fatalf("runtime service state=%q want %q", record.State, runtimeServiceStateRunning)
	}
	if record.Health != runtimeServiceHealthHealthy {
		t.Fatalf("runtime service health=%q want %q", record.Health, runtimeServiceHealthHealthy)
	}
	if record.PID != 0 {
		t.Fatalf("runtime service pid=%d want 0 for externally managed runtime", record.PID)
	}
	if session.Manifest.RuntimeService.State != runtimeServiceStateRunning {
		t.Fatalf("manifest runtime state=%q want %q", session.Manifest.RuntimeService.State, runtimeServiceStateRunning)
	}
	if session.Manifest.RuntimeService.Health != runtimeServiceHealthHealthy {
		t.Fatalf("manifest runtime health=%q want %q", session.Manifest.RuntimeService.Health, runtimeServiceHealthHealthy)
	}
	if _, err := os.Stat(session.Manifest.Paths.ServiceStatusPath); err != nil {
		t.Fatalf("expected service status path to exist: %v", err)
	}
}

func mustAtoi(t *testing.T, value string) int {
	t.Helper()
	parsed, err := strconv.Atoi(value)
	if err != nil {
		t.Fatalf("atoi %q: %v", value, err)
	}
	return parsed
}
