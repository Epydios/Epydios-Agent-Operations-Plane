package nativeapp

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestDefaultLaunchOptionsSafety(t *testing.T) {
	opts := DefaultLaunchOptions()
	if opts.Mode != modeMock {
		t.Fatalf("expected default mode mock, got %q", opts.Mode)
	}
	if opts.TargetExecutionProfile != "sandbox_vm_autonomous" {
		t.Fatalf("expected sandbox_vm_autonomous default, got %q", opts.TargetExecutionProfile)
	}
	if opts.AllowRestrictedHost {
		t.Fatal("expected restricted host to remain blocked by default")
	}
}

func TestPrepareSessionPatchesMockConfigAndCreatesPaths(t *testing.T) {
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

	session, err := PrepareSession(assets, DefaultLaunchOptions())
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}

	for _, dir := range []string{
		session.Manifest.Paths.RootDir,
		session.Manifest.Paths.WebDir,
		session.Manifest.Paths.LogDir,
		session.Manifest.Paths.CrashDir,
	} {
		if _, err := os.Stat(dir); err != nil {
			t.Fatalf("expected %s to exist: %v", dir, err)
		}
	}

	content, err := os.ReadFile(filepath.Join(session.Manifest.Paths.WebDir, "config", "runtime-config.json"))
	if err != nil {
		t.Fatalf("read patched config: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode patched config: %v", err)
	}
	if got := payload["environment"]; got != "native-mock" {
		t.Fatalf("expected native-mock environment, got %#v", got)
	}
	if got := payload["mockMode"]; got != true {
		t.Fatalf("expected mockMode=true, got %#v", got)
	}
	nativeShell, ok := payload["nativeShell"].(map[string]any)
	if !ok {
		t.Fatal("expected nativeShell block in runtime config")
	}
	if got := nativeShell["launcherState"]; got != launcherStatePrepared {
		t.Fatalf("expected launcherState=%q, got %#v", launcherStatePrepared, got)
	}
	if got := nativeShell["targetExecutionProfile"]; got != "sandbox_vm_autonomous" {
		t.Fatalf("expected sandbox profile in nativeShell block, got %#v", got)
	}
	if got := nativeShell["allowRestrictedHost"]; got != false {
		t.Fatalf("expected allowRestrictedHost=false, got %#v", got)
	}
	if got := nativeShell["bootstrapConfigState"]; got != bootstrapStateMissing {
		t.Fatalf("expected bootstrapConfigState=%q, got %#v", bootstrapStateMissing, got)
	}
	if got := nativeShell["eventLogPath"]; got != session.Manifest.Paths.EventLogPath {
		t.Fatalf("expected eventLogPath to match manifest, got %#v", got)
	}
	if got := nativeShell["uiLogPath"]; got != session.Manifest.Paths.UILogPath {
		t.Fatalf("expected uiLogPath to match manifest, got %#v", got)
	}
	if got := nativeShell["runtimeLogPath"]; got != session.Manifest.Paths.RuntimeLogPath {
		t.Fatalf("expected runtimeLogPath to match manifest, got %#v", got)
	}
	if got := nativeShell["configRoot"]; got != session.Manifest.Paths.ConfigRoot {
		t.Fatalf("expected configRoot to match manifest, got %#v", got)
	}
	if got := nativeShell["cacheRoot"]; got != session.Manifest.Paths.CacheRoot {
		t.Fatalf("expected cacheRoot to match manifest, got %#v", got)
	}
}

func TestPrepareSessionDisablesAuthForLiveMode(t *testing.T) {
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare live session: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(session.Manifest.Paths.WebDir, "config", "runtime-config.json"))
	if err != nil {
		t.Fatalf("read patched live config: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode patched live config: %v", err)
	}
	if got := payload["environment"]; got != "native-live" {
		t.Fatalf("expected native-live environment, got %#v", got)
	}
	if got := payload["mockMode"]; got != false {
		t.Fatalf("expected mockMode=false, got %#v", got)
	}
	auth, ok := payload["auth"].(map[string]any)
	if !ok {
		t.Fatal("expected auth block")
	}
	if got := auth["enabled"]; got != false {
		t.Fatalf("expected auth.enabled=false in live mode, got %#v", got)
	}
	if session.Manifest.RuntimeProcessMode != "kubectl_port_forward" {
		t.Fatalf("expected live runtime process mode kubectl_port_forward, got %q", session.Manifest.RuntimeProcessMode)
	}
	if session.Manifest.BootstrapConfigState != bootstrapStateMissing {
		t.Fatalf("expected missing bootstrap state by default, got %q", session.Manifest.BootstrapConfigState)
	}
}

func TestParseLaunchOptionsUsesBootstrapDefaultsAndAllowsCliOverride(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tempHome, ".config"))

	defaults := DefaultLaunchOptions()
	if defaults.BootstrapConfigPath == "" {
		t.Fatal("expected bootstrap config path to resolve")
	}
	if err := os.MkdirAll(filepath.Dir(defaults.BootstrapConfigPath), 0o755); err != nil {
		t.Fatalf("create bootstrap dir: %v", err)
	}
	if err := os.WriteFile(defaults.BootstrapConfigPath, []byte(`{
  "mode": "live",
  "runtimeLocalPort": 18080,
  "runtimeNamespace": "epydios-beta",
  "runtimeService": "runtime-beta"
}`), 0o644); err != nil {
		t.Fatalf("write bootstrap config: %v", err)
	}

	opts, err := ParseLaunchOptions(nil)
	if err != nil {
		t.Fatalf("parse launch options with bootstrap: %v", err)
	}
	if opts.Mode != modeLive {
		t.Fatalf("expected bootstrap mode live, got %q", opts.Mode)
	}
	if opts.RuntimeLocalPort != 18080 {
		t.Fatalf("expected bootstrap port 18080, got %d", opts.RuntimeLocalPort)
	}
	if opts.RuntimeNamespace != "epydios-beta" {
		t.Fatalf("expected bootstrap namespace epydios-beta, got %q", opts.RuntimeNamespace)
	}
	if opts.RuntimeService != "runtime-beta" {
		t.Fatalf("expected bootstrap service runtime-beta, got %q", opts.RuntimeService)
	}

	overridden, err := ParseLaunchOptions([]string{"--mode", "mock", "--runtime-port", "19090"})
	if err != nil {
		t.Fatalf("parse launch options with cli overrides: %v", err)
	}
	if overridden.Mode != modeMock {
		t.Fatalf("expected CLI mode override mock, got %q", overridden.Mode)
	}
	if overridden.RuntimeLocalPort != 19090 {
		t.Fatalf("expected CLI port override 19090, got %d", overridden.RuntimeLocalPort)
	}
	if overridden.RuntimeNamespace != "epydios-beta" {
		t.Fatalf("expected bootstrap namespace to remain when not overridden, got %q", overridden.RuntimeNamespace)
	}
}

func TestSessionStateUpdatesRefreshRuntimeConfig(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("XDG_CACHE_HOME", filepath.Join(tempHome, ".cache"))
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tempHome, ".config"))

	bootstrapPath := filepath.Join(tempHome, ".config", "EpydiosAgentOpsDesktop", "runtime-bootstrap.json")
	if err := os.MkdirAll(filepath.Dir(bootstrapPath), 0o755); err != nil {
		t.Fatalf("create bootstrap dir: %v", err)
	}
	if err := os.WriteFile(bootstrapPath, []byte(`{"mode":"live"}`), 0o644); err != nil {
		t.Fatalf("write bootstrap config: %v", err)
	}

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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.BootstrapConfigPath = bootstrapPath
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}
	if err := session.RecordStartupFailure("port_forward_failed", errors.New("runtime health endpoint did not become ready")); err != nil {
		t.Fatalf("record startup failure: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(session.Manifest.Paths.WebDir, "config", "runtime-config.json"))
	if err != nil {
		t.Fatalf("read patched config: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode patched config: %v", err)
	}
	nativeShell, ok := payload["nativeShell"].(map[string]any)
	if !ok {
		t.Fatal("expected nativeShell block")
	}
	if got := nativeShell["launcherState"]; got != launcherStateDegraded {
		t.Fatalf("expected launcherState=%q, got %#v", launcherStateDegraded, got)
	}
	if got := nativeShell["runtimeState"]; got != "port_forward_failed" {
		t.Fatalf("expected runtimeState=port_forward_failed, got %#v", got)
	}
	if got := nativeShell["bootstrapConfigState"]; got != bootstrapStateLoaded {
		t.Fatalf("expected bootstrapConfigState=%q, got %#v", bootstrapStateLoaded, got)
	}
	if got := nativeShell["startupError"]; got == nil || got == "" {
		t.Fatal("expected startupError to be populated")
	}
}
