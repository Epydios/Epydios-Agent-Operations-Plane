package nativeapp

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestSyncGatewayServiceStatusUsesReadyzForLiveTruth(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("XDG_CACHE_HOME", filepath.Join(tempHome, ".cache"))
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tempHome, ".config"))

	assets := fstest.MapFS{
		"web/config/runtime-config.json": {
			Data: []byte(`{
  "environment": "local",
  "mockMode": false,
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

	gatewayServer := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/healthz":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"ok","health":"healthy"}`))
		case "/readyz":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"not_ready","reason":"runtime service is not healthy"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	gatewayServer.Listener = listener
	gatewayServer.Start()
	defer gatewayServer.Close()

	parsed, err := url.Parse(gatewayServer.URL)
	if err != nil {
		t.Fatalf("parse gateway server url: %v", err)
	}
	port := parsed.Port()
	if port == "" {
		t.Fatalf("gateway server missing port in %q", gatewayServer.URL)
	}

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.GatewayLocalPort = mustAtoi(t, port)

	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}

	record, err := SyncGatewayServiceStatus(opts, session)
	if err != nil {
		t.Fatalf("sync gateway service status: %v", err)
	}
	if record.State != gatewayStateDegraded {
		t.Fatalf("gateway state=%q want %q", record.State, gatewayStateDegraded)
	}
	if record.Health != gatewayHealthUnreachable {
		t.Fatalf("gateway health=%q want %q", record.Health, gatewayHealthUnreachable)
	}
	if record.LastError != "runtime service is not healthy" {
		t.Fatalf("gateway lastError=%q want runtime readiness reason", record.LastError)
	}
	if session.Manifest.GatewayService.State != gatewayStateDegraded {
		t.Fatalf("manifest gateway state=%q want %q", session.Manifest.GatewayService.State, gatewayStateDegraded)
	}
}
