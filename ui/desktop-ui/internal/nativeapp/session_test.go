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
		session.Manifest.Paths.ServiceRoot,
		session.Manifest.Paths.GatewayRoot,
		session.Manifest.Paths.GatewayRequestsRoot,
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
	service, ok := nativeShell["runtimeService"].(map[string]any)
	if !ok {
		t.Fatal("expected runtimeService block in nativeShell")
	}
	if got := service["state"]; got != runtimeServiceStateMockOnly {
		t.Fatalf("expected runtimeService.state=%q, got %#v", runtimeServiceStateMockOnly, got)
	}
	if got := service["health"]; got != runtimeServiceHealthNotRequired {
		t.Fatalf("expected runtimeService.health=%q, got %#v", runtimeServiceHealthNotRequired, got)
	}
	if got := nativeShell["serviceStatusPath"]; got != session.Manifest.Paths.ServiceStatusPath {
		t.Fatalf("expected serviceStatusPath to match manifest, got %#v", got)
	}
	if got := nativeShell["servicePidPath"]; got != session.Manifest.Paths.ServicePIDPath {
		t.Fatalf("expected servicePidPath to match manifest, got %#v", got)
	}
	if got := nativeShell["serviceLogPath"]; got != session.Manifest.Paths.ServiceLogPath {
		t.Fatalf("expected serviceLogPath to match manifest, got %#v", got)
	}
	gateway, ok := nativeShell["gatewayService"].(map[string]any)
	if !ok {
		t.Fatal("expected gatewayService block in nativeShell")
	}
	if got := gateway["state"]; got != gatewayStateStopped {
		t.Fatalf("expected gatewayService.state=%q, got %#v", gatewayStateStopped, got)
	}
	if got := gateway["statusPath"]; got != session.Manifest.Paths.GatewayStatusPath {
		t.Fatalf("expected gatewayService.statusPath to match manifest, got %#v", got)
	}
	if got := nativeShell["gatewayStatusPath"]; got != session.Manifest.Paths.GatewayStatusPath {
		t.Fatalf("expected gatewayStatusPath to match manifest, got %#v", got)
	}
	if got := nativeShell["gatewayTokenPath"]; got != session.Manifest.Paths.GatewayTokenPath {
		t.Fatalf("expected gatewayTokenPath to match manifest, got %#v", got)
	}
	interposition, ok := nativeShell["interposition"].(map[string]any)
	if !ok {
		t.Fatal("expected interposition block in nativeShell")
	}
	if got := interposition["enabled"]; got != false {
		t.Fatalf("expected interposition.enabled=false, got %#v", got)
	}
	if got := interposition["status"]; got != "off" {
		t.Fatalf("expected interposition.status=off, got %#v", got)
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
	if session.Manifest.RuntimeProcessMode != "background_supervisor" {
		t.Fatalf("expected live runtime process mode background_supervisor, got %q", session.Manifest.RuntimeProcessMode)
	}
	if session.Manifest.BootstrapConfigState != bootstrapStateMissing {
		t.Fatalf("expected missing bootstrap state by default, got %q", session.Manifest.BootstrapConfigState)
	}
	if session.Manifest.RuntimeState != "service_pending" {
		t.Fatalf("expected initial live runtime state service_pending, got %q", session.Manifest.RuntimeState)
	}
	if session.Manifest.RuntimeService.State != runtimeServiceStateStopped {
		t.Fatalf("expected initial runtime service state stopped, got %q", session.Manifest.RuntimeService.State)
	}
}

func TestPrepareSessionAllowsVerifierScopedAuthOverrideForLiveMode(t *testing.T) {
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

	authEnabled := true
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.AuthEnabledOverride = &authEnabled
	opts.AuthMockLogin = true
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare live session with verifier auth override: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(session.Manifest.Paths.WebDir, "config", "runtime-config.json"))
	if err != nil {
		t.Fatalf("read patched live config: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode patched live config: %v", err)
	}
	auth, ok := payload["auth"].(map[string]any)
	if !ok {
		t.Fatal("expected auth block")
	}
	if got := auth["enabled"]; got != true {
		t.Fatalf("expected auth.enabled=true when verifier overrides it, got %#v", got)
	}
	if got := auth["mockLogin"]; got != true {
		t.Fatalf("expected auth.mockLogin=true when verifier enables it, got %#v", got)
	}
}

func TestPrepareSessionUsesBootstrapScopedConfigRootForLiveMode(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("XDG_CACHE_HOME", filepath.Join(tempHome, ".cache"))
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tempHome, ".config"))

	bootstrapRoot := filepath.Join(tempHome, "verifier-run")
	bootstrapPath := filepath.Join(bootstrapRoot, "runtime-bootstrap.json")
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.BootstrapConfigPath = bootstrapPath
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}

	expectedConfigRoot := bootstrapRoot
	if got := session.Manifest.Paths.ConfigRoot; got != expectedConfigRoot {
		t.Fatalf("expected bootstrap-scoped config root %q, got %q", expectedConfigRoot, got)
	}
	if got := session.Manifest.Paths.GatewayRoot; got != filepath.Join(expectedConfigRoot, "localhost-gateway") {
		t.Fatalf("expected bootstrap-scoped gateway root, got %q", got)
	}
	if got := session.Manifest.Paths.GatewayRequestsRoot; got != filepath.Join(expectedConfigRoot, "localhost-gateway", "requests") {
		t.Fatalf("expected bootstrap-scoped gateway requests root, got %q", got)
	}
	if got := session.Manifest.GatewayService.StatusPath; got != filepath.Join(expectedConfigRoot, "localhost-gateway", "gateway-service.json") {
		t.Fatalf("expected bootstrap-scoped gateway status path, got %q", got)
	}

	content, err := os.ReadFile(filepath.Join(session.Manifest.Paths.WebDir, "config", "runtime-config.json"))
	if err != nil {
		t.Fatalf("read patched runtime config: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode patched runtime config: %v", err)
	}
	nativeShell, ok := payload["nativeShell"].(map[string]any)
	if !ok {
		t.Fatal("expected nativeShell block")
	}
	if got := nativeShell["configRoot"]; got != expectedConfigRoot {
		t.Fatalf("expected nativeShell.configRoot=%q, got %#v", expectedConfigRoot, got)
	}
	if got := nativeShell["gatewayStatusPath"]; got != filepath.Join(expectedConfigRoot, "localhost-gateway", "gateway-service.json") {
		t.Fatalf("expected nativeShell gateway status path to match bootstrap root, got %#v", got)
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
  "gatewayLocalPort": 18777,
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
	if opts.GatewayLocalPort != 18777 {
		t.Fatalf("expected bootstrap gateway port 18777, got %d", opts.GatewayLocalPort)
	}
	if opts.RuntimeNamespace != "epydios-beta" {
		t.Fatalf("expected bootstrap namespace epydios-beta, got %q", opts.RuntimeNamespace)
	}
	if opts.RuntimeService != "runtime-beta" {
		t.Fatalf("expected bootstrap service runtime-beta, got %q", opts.RuntimeService)
	}
	if opts.InterpositionEnabled {
		t.Fatal("expected interposition disabled when not present in bootstrap config")
	}

	overridden, err := ParseLaunchOptions([]string{"--mode", "mock", "--runtime-port", "19090", "--gateway-port", "19091", "--interposition-enabled"})
	if err != nil {
		t.Fatalf("parse launch options with cli overrides: %v", err)
	}
	if overridden.Mode != modeMock {
		t.Fatalf("expected CLI mode override mock, got %q", overridden.Mode)
	}
	if overridden.RuntimeLocalPort != 19090 {
		t.Fatalf("expected CLI port override 19090, got %d", overridden.RuntimeLocalPort)
	}
	if overridden.GatewayLocalPort != 19091 {
		t.Fatalf("expected CLI gateway port override 19091, got %d", overridden.GatewayLocalPort)
	}
	if overridden.RuntimeNamespace != "epydios-beta" {
		t.Fatalf("expected bootstrap namespace to remain when not overridden, got %q", overridden.RuntimeNamespace)
	}
	if !overridden.InterpositionEnabled {
		t.Fatal("expected CLI flag to enable interposition")
	}

	finderLaunched, err := ParseLaunchOptions([]string{"-psn_0_12345", "--mode", "mock"})
	if err != nil {
		t.Fatalf("parse launch options with Finder psn token: %v", err)
	}
	if finderLaunched.Mode != modeMock {
		t.Fatalf("expected Finder-launched parse to preserve CLI mode mock, got %q", finderLaunched.Mode)
	}
}

func TestParseLaunchOptionsAppliesEnvironmentInterpositionOverrides(t *testing.T) {
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
  "interpositionEnabled": false,
  "interpositionUpstreamBaseUrl": "https://bootstrap.example.com",
  "interpositionUpstreamBearerToken": "bootstrap-token"
}`), 0o644); err != nil {
		t.Fatalf("write bootstrap config: %v", err)
	}

	t.Setenv("EPYDIOS_NATIVEAPP_INTERPOSITION_ENABLED", "true")
	t.Setenv("EPYDIOS_NATIVEAPP_INTERPOSITION_UPSTREAM_BASE_URL", "https://env.example.com")
	t.Setenv("EPYDIOS_NATIVEAPP_INTERPOSITION_UPSTREAM_BEARER_TOKEN", "env-token")

	opts, err := ParseLaunchOptions(nil)
	if err != nil {
		t.Fatalf("parse launch options with env overrides: %v", err)
	}
	if !opts.InterpositionEnabled {
		t.Fatal("expected environment override to enable interposition")
	}
	if opts.InterpositionUpstreamBaseURL != "https://env.example.com" {
		t.Fatalf("expected environment upstream base URL, got %q", opts.InterpositionUpstreamBaseURL)
	}
	if opts.InterpositionUpstreamBearerToken != "env-token" {
		t.Fatalf("expected environment upstream bearer token, got %q", opts.InterpositionUpstreamBearerToken)
	}
}

func TestParseLaunchOptionsAppliesVerifierScopedRuntimeAndAuthOverrides(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tempHome, ".config"))

	t.Setenv("EPYDIOS_NATIVEAPP_RUNTIME_MANAGED_EXTERNALLY", "true")
	t.Setenv("EPYDIOS_NATIVEAPP_AUTH_ENABLED", "true")
	t.Setenv("EPYDIOS_NATIVEAPP_AUTH_MOCK_LOGIN", "true")

	opts, err := ParseLaunchOptions(nil)
	if err != nil {
		t.Fatalf("parse launch options with verifier overrides: %v", err)
	}
	if !opts.RuntimeManagedExternally {
		t.Fatal("expected runtime managed externally override to be applied")
	}
	if opts.AuthEnabledOverride == nil || !*opts.AuthEnabledOverride {
		t.Fatalf("expected auth enabled override to be applied, got %#v", opts.AuthEnabledOverride)
	}
	if !opts.AuthMockLogin {
		t.Fatal("expected auth mock login override to be applied")
	}
}

func TestUpdateInterpositionConfigPersistsBootstrapAndManifest(t *testing.T) {
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}
	if err := session.UpdateInterpositionConfig(true, "https://api.openai.com", "token-123"); err != nil {
		t.Fatalf("update interposition config: %v", err)
	}

	if !session.LaunchOptions().InterpositionEnabled {
		t.Fatal("expected interposition enabled in launch options")
	}
	if session.Manifest.Interposition.Status != "gateway_unavailable" {
		t.Fatalf("expected gateway_unavailable status before gateway start, got %q", session.Manifest.Interposition.Status)
	}
	if session.Manifest.BootstrapConfigState != bootstrapStateLoaded {
		t.Fatalf("expected bootstrap config state loaded, got %q", session.Manifest.BootstrapConfigState)
	}

	payload, err := readBootstrapLaunchOptions(session.LaunchOptions().BootstrapConfigPath)
	if err != nil {
		t.Fatalf("read bootstrap payload: %v", err)
	}
	if payload.InterpositionEnabled == nil || !*payload.InterpositionEnabled {
		t.Fatalf("expected persisted interpositionEnabled=true, got %#v", payload.InterpositionEnabled)
	}
	if payload.InterpositionUpstreamBaseURL != "https://api.openai.com" {
		t.Fatalf("expected persisted upstream base URL, got %q", payload.InterpositionUpstreamBaseURL)
	}
	if payload.InterpositionUpstreamBearerToken != "token-123" {
		t.Fatalf("expected persisted bearer token, got %q", payload.InterpositionUpstreamBearerToken)
	}
}

func TestUpdateInterpositionConfigAllowsPassthroughModeWithoutSavedToken(t *testing.T) {
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}
	if err := session.UpdateInterpositionConfig(true, "https://api.openai.com", ""); err != nil {
		t.Fatalf("update interposition config: %v", err)
	}

	if session.Manifest.Interposition.Status != "gateway_unavailable" {
		t.Fatalf("expected gateway_unavailable status before gateway start, got %q", session.Manifest.Interposition.Status)
	}
	if session.Manifest.Interposition.UpstreamAuthMode != "client_passthrough" {
		t.Fatalf("upstream auth mode=%q want client_passthrough", session.Manifest.Interposition.UpstreamAuthMode)
	}
	if session.Manifest.Interposition.UpstreamBearerTokenConfigured {
		t.Fatal("expected interposition manifest to report no saved upstream token")
	}

	payload, err := readBootstrapLaunchOptions(session.LaunchOptions().BootstrapConfigPath)
	if err != nil {
		t.Fatalf("read bootstrap payload: %v", err)
	}
	if payload.InterpositionUpstreamBearerToken != "" {
		t.Fatalf("expected persisted upstream bearer token to remain empty, got %q", payload.InterpositionUpstreamBearerToken)
	}
}

func TestUpdateInterpositionConfigCanClearSavedBearerToken(t *testing.T) {
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.InterpositionUpstreamBearerToken = "existing-token"
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}
	if err := session.UpdateInterpositionConfig(true, "https://api.openai.com", "__EPYDIOS_CLEAR_INTERPOSITION_BEARER__"); err != nil {
		t.Fatalf("clear interposition config token: %v", err)
	}

	if session.Manifest.Interposition.UpstreamAuthMode != "client_passthrough" {
		t.Fatalf("upstream auth mode=%q want client_passthrough", session.Manifest.Interposition.UpstreamAuthMode)
	}
	if session.Manifest.Interposition.UpstreamBearerTokenConfigured {
		t.Fatal("expected saved upstream token to be cleared")
	}

	payload, err := readBootstrapLaunchOptions(session.LaunchOptions().BootstrapConfigPath)
	if err != nil {
		t.Fatalf("read bootstrap payload: %v", err)
	}
	if payload.InterpositionUpstreamBearerToken != "" {
		t.Fatalf("expected persisted upstream bearer token to be cleared, got %q", payload.InterpositionUpstreamBearerToken)
	}
}

func TestInterpositionTransitionPersistsUntilExplicitlyCleared(t *testing.T) {
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}
	if err := session.UpdateInterpositionConfig(true, "https://api.openai.com", ""); err != nil {
		t.Fatalf("update interposition config: %v", err)
	}
	if err := session.BeginInterpositionTransition(false, true, "starting", "Turning interposition on. Epydios is getting ready to govern supported requests."); err != nil {
		t.Fatalf("begin interposition transition: %v", err)
	}

	record := session.Manifest.GatewayService
	record.State = gatewayStateRunning
	record.Health = gatewayHealthHealthy
	record.PID = 5252
	record.UpdatedAtUTC = "2026-03-26T00:00:00Z"
	record.StartedAtUTC = "2026-03-26T00:00:00Z"
	if err := session.UpdateGatewayService(record); err != nil {
		t.Fatalf("update gateway service: %v", err)
	}

	if session.Manifest.Interposition.Status != "starting" {
		t.Fatalf("expected interposition status starting during transition, got %q", session.Manifest.Interposition.Status)
	}
	if !session.Manifest.Interposition.Transitioning {
		t.Fatal("expected interposition transition to remain marked while pending")
	}
	if !session.Manifest.Interposition.Enabled {
		t.Fatal("expected interposition enabled chip to stay on during transition")
	}
	if !session.Manifest.Interposition.DesiredEnabled {
		t.Fatal("expected desired enabled state to remain true during transition")
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
	interposition, ok := nativeShell["interposition"].(map[string]any)
	if !ok {
		t.Fatal("expected interposition block in runtime config")
	}
	if got := interposition["status"]; got != "starting" {
		t.Fatalf("expected runtime config interposition.status=starting, got %#v", got)
	}
	if got := interposition["transitioning"]; got != true {
		t.Fatalf("expected runtime config interposition.transitioning=true, got %#v", got)
	}

	if err := session.ClearInterpositionTransition(); err != nil {
		t.Fatalf("clear interposition transition: %v", err)
	}
	if session.Manifest.Interposition.Status != "on" {
		t.Fatalf("expected interposition status on after clearing transition, got %q", session.Manifest.Interposition.Status)
	}
	if !session.Manifest.Interposition.Effective {
		t.Fatal("expected interposition to become effective after clearing transition")
	}
	if session.Manifest.Interposition.Transitioning {
		t.Fatal("expected interposition transition to clear")
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
	if got := nativeShell["gatewayStatusPath"]; got != session.Manifest.Paths.GatewayStatusPath {
		t.Fatalf("expected gatewayStatusPath to match manifest, got %#v", got)
	}
	interposition, ok := nativeShell["interposition"].(map[string]any)
	if !ok {
		t.Fatal("expected interposition block in runtime config")
	}
	if got := interposition["status"]; got != "off" {
		t.Fatalf("expected interposition.status=off, got %#v", got)
	}
}

func TestUpdateRuntimeServiceRefreshesRuntimeConfig(t *testing.T) {
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}

	record := session.Manifest.RuntimeService
	record.State = runtimeServiceStateRunning
	record.Health = runtimeServiceHealthHealthy
	record.PID = 4242
	record.UpdatedAtUTC = "2026-03-19T00:00:00Z"
	record.StartedAtUTC = "2026-03-19T00:00:00Z"
	if err := session.UpdateRuntimeService(record); err != nil {
		t.Fatalf("update runtime service: %v", err)
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
	service, ok := nativeShell["runtimeService"].(map[string]any)
	if !ok {
		t.Fatal("expected runtimeService block")
	}
	if got := service["state"]; got != runtimeServiceStateRunning {
		t.Fatalf("expected runtimeService.state=%q, got %#v", runtimeServiceStateRunning, got)
	}
	if got := service["health"]; got != runtimeServiceHealthHealthy {
		t.Fatalf("expected runtimeService.health=%q, got %#v", runtimeServiceHealthHealthy, got)
	}
	if got := nativeShell["runtimeState"]; got != "service_running" {
		t.Fatalf("expected runtimeState=service_running, got %#v", got)
	}
}

func TestUpdateGatewayServiceRefreshesRuntimeConfig(t *testing.T) {
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}

	record := session.Manifest.GatewayService
	record.State = gatewayStateRunning
	record.Health = gatewayHealthHealthy
	record.PID = 5252
	record.UpdatedAtUTC = "2026-03-19T00:00:00Z"
	record.StartedAtUTC = "2026-03-19T00:00:00Z"
	if err := session.UpdateGatewayService(record); err != nil {
		t.Fatalf("update gateway service: %v", err)
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
	gateway, ok := nativeShell["gatewayService"].(map[string]any)
	if !ok {
		t.Fatal("expected gatewayService block")
	}
	if got := gateway["state"]; got != gatewayStateRunning {
		t.Fatalf("expected gatewayService.state=%q, got %#v", gatewayStateRunning, got)
	}
	if got := gateway["health"]; got != gatewayHealthHealthy {
		t.Fatalf("expected gatewayService.health=%q, got %#v", gatewayHealthHealthy, got)
	}
}

func TestUpdateBridgeHealthRefreshesRuntimeConfigAndLauncherState(t *testing.T) {
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

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	session, err := PrepareSession(assets, opts)
	if err != nil {
		t.Fatalf("prepare session: %v", err)
	}

	runtimeRecord := session.Manifest.RuntimeService
	runtimeRecord.State = runtimeServiceStateRunning
	runtimeRecord.Health = runtimeServiceHealthHealthy
	runtimeRecord.PID = 4242
	runtimeRecord.UpdatedAtUTC = "2026-03-26T00:00:00Z"
	runtimeRecord.StartedAtUTC = "2026-03-26T00:00:00Z"
	if err := session.UpdateRuntimeService(runtimeRecord); err != nil {
		t.Fatalf("update runtime service: %v", err)
	}

	gatewayRecord := session.Manifest.GatewayService
	gatewayRecord.State = gatewayStateRunning
	gatewayRecord.Health = gatewayHealthHealthy
	gatewayRecord.PID = 5252
	gatewayRecord.UpdatedAtUTC = "2026-03-26T00:00:00Z"
	gatewayRecord.StartedAtUTC = "2026-03-26T00:00:00Z"
	if err := session.UpdateGatewayService(gatewayRecord); err != nil {
		t.Fatalf("update gateway service: %v", err)
	}
	if err := session.UpdateLauncherState(launcherStateReady); err != nil {
		t.Fatalf("update launcher state: %v", err)
	}

	reason := "Native bridge missing required bindings: NativeShellStatusRefresh"
	if err := session.UpdateBridgeHealth([]string{"NativeShellStatusRefresh"}, reason); err != nil {
		t.Fatalf("update bridge health degraded: %v", err)
	}
	if session.Manifest.BridgeHealth != bridgeHealthDegraded {
		t.Fatalf("expected bridgeHealth=%q, got %q", bridgeHealthDegraded, session.Manifest.BridgeHealth)
	}
	if session.Manifest.LauncherState != launcherStateDegraded {
		t.Fatalf("expected launcherState=%q, got %q", launcherStateDegraded, session.Manifest.LauncherState)
	}
	if session.Manifest.StartupError != reason {
		t.Fatalf("expected startupError=%q, got %q", reason, session.Manifest.StartupError)
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
	if got := nativeShell["bridgeHealth"]; got != bridgeHealthDegraded {
		t.Fatalf("expected bridgeHealth=%q, got %#v", bridgeHealthDegraded, got)
	}
	missing, ok := nativeShell["bridgeMissingBindings"].([]any)
	if !ok || len(missing) != 1 || missing[0] != "NativeShellStatusRefresh" {
		t.Fatalf("expected bridgeMissingBindings to contain NativeShellStatusRefresh, got %#v", nativeShell["bridgeMissingBindings"])
	}
	if got := nativeShell["launcherState"]; got != launcherStateDegraded {
		t.Fatalf("expected launcherState=%q, got %#v", launcherStateDegraded, got)
	}

	if err := session.UpdateBridgeHealth(nil, ""); err != nil {
		t.Fatalf("update bridge health healthy: %v", err)
	}
	if session.Manifest.BridgeHealth != bridgeHealthHealthy {
		t.Fatalf("expected bridgeHealth=%q, got %q", bridgeHealthHealthy, session.Manifest.BridgeHealth)
	}
	if session.Manifest.LauncherState != launcherStateReady {
		t.Fatalf("expected launcherState=%q after recovery, got %q", launcherStateReady, session.Manifest.LauncherState)
	}
	if session.Manifest.StartupError != "" {
		t.Fatalf("expected startupError to clear after bridge recovery, got %q", session.Manifest.StartupError)
	}
}
