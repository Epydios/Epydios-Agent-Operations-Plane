package nativeapp

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	modeMock = "mock"
	modeLive = "live"

	launcherStatePrepared   = "prepared"
	launcherStateRecovering = "recovering"
	launcherStateReady      = "ready"
	launcherStateDegraded   = "degraded"
	launcherStateStopped    = "stopped"

	bootstrapStateLoaded  = "loaded"
	bootstrapStateMissing = "missing"

	bridgeHealthUnknown  = "unknown"
	bridgeHealthHealthy  = "healthy"
	bridgeHealthDegraded = "degraded"
)

type LaunchOptions struct {
	Mode                             string
	RuntimeLocalPort                 int
	GatewayLocalPort                 int
	RuntimeNamespace                 string
	RuntimeService                   string
	RuntimeManagedExternally         bool
	InterpositionEnabled             bool
	InterpositionUpstreamBaseURL     string
	InterpositionUpstreamBearerToken string
	AuthEnabledOverride              *bool
	AuthMockLogin                    bool
	TargetExecutionProfile           string
	AllowRestrictedHost              bool
	BootstrapConfigPath              string
	GatewayServiceOnly               bool
}

type SessionPaths struct {
	ConfigRoot          string `json:"configRoot"`
	CacheRoot           string `json:"cacheRoot"`
	ServiceRoot         string `json:"serviceRoot"`
	GatewayRoot         string `json:"gatewayRoot"`
	RootDir             string `json:"rootDir"`
	WebDir              string `json:"webDir"`
	LogDir              string `json:"logDir"`
	CrashDir            string `json:"crashDir"`
	EventLogPath        string `json:"eventLogPath"`
	UILogPath           string `json:"uiLogPath"`
	RuntimeLogPath      string `json:"runtimeLogPath"`
	ManifestPath        string `json:"manifestPath"`
	ServicePIDPath      string `json:"servicePidPath"`
	ServiceLogPath      string `json:"serviceLogPath"`
	ServiceStatusPath   string `json:"serviceStatusPath"`
	GatewayPIDPath      string `json:"gatewayPidPath"`
	GatewayLogPath      string `json:"gatewayLogPath"`
	GatewayStatusPath   string `json:"gatewayStatusPath"`
	GatewayTokenPath    string `json:"gatewayTokenPath"`
	GatewayRequestsRoot string `json:"gatewayRequestsRoot"`
}

type RuntimeServiceRecord struct {
	State             string `json:"state"`
	Health            string `json:"health"`
	PID               int    `json:"pid,omitempty"`
	RuntimeAPIBaseURL string `json:"runtimeApiBaseUrl"`
	LogPath           string `json:"logPath"`
	PIDPath           string `json:"pidPath"`
	StatusPath        string `json:"statusPath"`
	StartedAtUTC      string `json:"startedAtUtc,omitempty"`
	UpdatedAtUTC      string `json:"updatedAtUtc,omitempty"`
	LastError         string `json:"lastError,omitempty"`
}

type GatewayServiceRecord struct {
	State        string `json:"state"`
	Health       string `json:"health"`
	PID          int    `json:"pid,omitempty"`
	BaseURL      string `json:"baseUrl"`
	LogPath      string `json:"logPath"`
	PIDPath      string `json:"pidPath"`
	StatusPath   string `json:"statusPath"`
	TokenPath    string `json:"tokenPath"`
	RequestsRoot string `json:"requestsRoot"`
	StartedAtUTC string `json:"startedAtUtc,omitempty"`
	UpdatedAtUTC string `json:"updatedAtUtc,omitempty"`
	LastError    string `json:"lastError,omitempty"`
}

type InterpositionRecord struct {
	Enabled                       bool   `json:"enabled"`
	Effective                     bool   `json:"effective"`
	Status                        string `json:"status"`
	Reason                        string `json:"reason,omitempty"`
	Transitioning                 bool   `json:"transitioning,omitempty"`
	DesiredEnabled                bool   `json:"desiredEnabled,omitempty"`
	TransitionStartedAtUTC        string `json:"transitionStartedAtUtc,omitempty"`
	UpstreamBaseURL               string `json:"upstreamBaseUrl,omitempty"`
	UpstreamBearerTokenConfigured bool   `json:"upstreamBearerTokenConfigured"`
	UpstreamAuthMode              string `json:"upstreamAuthMode,omitempty"`
}

type SessionManifest struct {
	AppName                string               `json:"appName"`
	StartedAtUTC           string               `json:"startedAtUtc"`
	Mode                   string               `json:"mode"`
	LauncherState          string               `json:"launcherState"`
	BridgeHealth           string               `json:"bridgeHealth"`
	BridgeRequiredBindings []string             `json:"bridgeRequiredBindings,omitempty"`
	BridgeMissingBindings  []string             `json:"bridgeMissingBindings,omitempty"`
	BridgeCheckedAtUTC     string               `json:"bridgeCheckedAtUtc,omitempty"`
	BridgeReason           string               `json:"bridgeReason,omitempty"`
	RuntimeProcessMode     string               `json:"runtimeProcessMode"`
	RuntimeState           string               `json:"runtimeState"`
	RuntimeAPIBaseURL      string               `json:"runtimeApiBaseUrl"`
	RegistryAPIBaseURL     string               `json:"registryApiBaseUrl"`
	TargetExecutionProfile string               `json:"targetExecutionProfile"`
	AllowRestrictedHost    bool                 `json:"allowRestrictedHost"`
	BootstrapConfigPath    string               `json:"bootstrapConfigPath"`
	BootstrapConfigState   string               `json:"bootstrapConfigState"`
	Interposition          InterpositionRecord  `json:"interposition"`
	StartupError           string               `json:"startupError,omitempty"`
	RuntimeService         RuntimeServiceRecord `json:"runtimeService"`
	GatewayService         GatewayServiceRecord `json:"gatewayService"`
	Paths                  SessionPaths         `json:"paths"`
}

type Session struct {
	Manifest      SessionManifest
	launchOptions LaunchOptions
}

func DefaultLaunchOptions() LaunchOptions {
	return LaunchOptions{
		Mode:                   modeMock,
		RuntimeLocalPort:       8080,
		GatewayLocalPort:       18765,
		RuntimeNamespace:       "epydios-system",
		RuntimeService:         "orchestration-runtime",
		InterpositionEnabled:   false,
		TargetExecutionProfile: "sandbox_vm_autonomous",
		AllowRestrictedHost:    false,
		BootstrapConfigPath:    resolveBootstrapConfigPath(),
	}
}

func ParseLaunchOptions(args []string) (LaunchOptions, error) {
	opts := DefaultLaunchOptions()
	if err := applyBootstrapLaunchOptions(&opts); err != nil {
		return LaunchOptions{}, err
	}
	if err := applyEnvironmentLaunchOptions(&opts); err != nil {
		return LaunchOptions{}, err
	}
	for i := 0; i < len(args); i++ {
		if strings.HasPrefix(args[i], "-psn_") {
			continue
		}
		switch args[i] {
		case "--mode":
			if i+1 >= len(args) {
				return LaunchOptions{}, fmt.Errorf("missing value for --mode")
			}
			opts.Mode = strings.ToLower(strings.TrimSpace(args[i+1]))
			i++
		case "--runtime-port":
			if i+1 >= len(args) {
				return LaunchOptions{}, fmt.Errorf("missing value for --runtime-port")
			}
			port, err := strconv.Atoi(args[i+1])
			if err != nil || port <= 0 {
				return LaunchOptions{}, fmt.Errorf("invalid runtime port %q", args[i+1])
			}
			opts.RuntimeLocalPort = port
			i++
		case "--runtime-namespace":
			if i+1 >= len(args) {
				return LaunchOptions{}, fmt.Errorf("missing value for --runtime-namespace")
			}
			opts.RuntimeNamespace = strings.TrimSpace(args[i+1])
			i++
		case "--runtime-service":
			if i+1 >= len(args) {
				return LaunchOptions{}, fmt.Errorf("missing value for --runtime-service")
			}
			opts.RuntimeService = strings.TrimSpace(args[i+1])
			i++
		case "--gateway-port":
			if i+1 >= len(args) {
				return LaunchOptions{}, fmt.Errorf("missing value for --gateway-port")
			}
			port, err := strconv.Atoi(args[i+1])
			if err != nil || port <= 0 {
				return LaunchOptions{}, fmt.Errorf("invalid gateway port %q", args[i+1])
			}
			opts.GatewayLocalPort = port
			i++
		case "--gateway-service":
			opts.GatewayServiceOnly = true
		case "--interposition-enabled":
			opts.InterpositionEnabled = true
		case "--interposition-disabled":
			opts.InterpositionEnabled = false
		case "--interposition-upstream-base-url":
			if i+1 >= len(args) {
				return LaunchOptions{}, fmt.Errorf("missing value for --interposition-upstream-base-url")
			}
			opts.InterpositionUpstreamBaseURL = strings.TrimSpace(args[i+1])
			i++
		case "--interposition-upstream-bearer-token":
			if i+1 >= len(args) {
				return LaunchOptions{}, fmt.Errorf("missing value for --interposition-upstream-bearer-token")
			}
			opts.InterpositionUpstreamBearerToken = strings.TrimSpace(args[i+1])
			i++
		default:
			return LaunchOptions{}, fmt.Errorf("unknown argument %q", args[i])
		}
	}
	if opts.Mode != modeMock && opts.Mode != modeLive {
		return LaunchOptions{}, fmt.Errorf("invalid mode %q", opts.Mode)
	}
	return opts, nil
}

func PrepareSession(assets fs.FS, opts LaunchOptions) (*Session, error) {
	cacheRoot, err := os.UserCacheDir()
	if err != nil {
		return nil, fmt.Errorf("resolve user cache dir: %w", err)
	}
	configRoot, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("resolve user config dir: %w", err)
	}
	stamp := time.Now().UTC().Format("20060102T150405Z")
	productCacheRoot := filepath.Join(cacheRoot, "EpydiosAgentOpsDesktop")
	productConfigRoot := filepath.Join(configRoot, "EpydiosAgentOpsDesktop")
	if strings.TrimSpace(opts.BootstrapConfigPath) != "" {
		productConfigRoot = resolveProductConfigRoot(opts.BootstrapConfigPath)
	}
	sessionRoot := filepath.Join(productCacheRoot, "native-shell", stamp)
	paths := SessionPaths{
		ConfigRoot:          productConfigRoot,
		CacheRoot:           productCacheRoot,
		ServiceRoot:         filepath.Join(productConfigRoot, "runtime-service"),
		GatewayRoot:         filepath.Join(productConfigRoot, "localhost-gateway"),
		RootDir:             sessionRoot,
		WebDir:              filepath.Join(sessionRoot, "web"),
		LogDir:              filepath.Join(sessionRoot, "logs"),
		CrashDir:            filepath.Join(sessionRoot, "crashdumps"),
		EventLogPath:        filepath.Join(sessionRoot, "logs", "session-events.jsonl"),
		UILogPath:           filepath.Join(sessionRoot, "logs", "ui-shell.log"),
		RuntimeLogPath:      filepath.Join(sessionRoot, "logs", "runtime-process.log"),
		ManifestPath:        filepath.Join(sessionRoot, "session.json"),
		ServicePIDPath:      filepath.Join(productConfigRoot, "runtime-service", "runtime-service.pid"),
		ServiceLogPath:      filepath.Join(productConfigRoot, "runtime-service", "runtime-service.log"),
		ServiceStatusPath:   filepath.Join(productConfigRoot, "runtime-service", "runtime-service.json"),
		GatewayPIDPath:      filepath.Join(productConfigRoot, "localhost-gateway", "gateway-service.pid"),
		GatewayLogPath:      filepath.Join(productConfigRoot, "localhost-gateway", "gateway-service.log"),
		GatewayStatusPath:   filepath.Join(productConfigRoot, "localhost-gateway", "gateway-service.json"),
		GatewayTokenPath:    filepath.Join(productConfigRoot, "localhost-gateway", "gateway-token"),
		GatewayRequestsRoot: filepath.Join(productConfigRoot, "localhost-gateway", "requests"),
	}
	for _, dir := range []string{paths.WebDir, paths.LogDir, paths.CrashDir, paths.ServiceRoot, paths.GatewayRoot, paths.GatewayRequestsRoot} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create session dir %s: %w", dir, err)
		}
	}
	if err := copyFS(fsSub(assets, "web"), paths.WebDir); err != nil {
		return nil, err
	}
	runtimeBase := fmt.Sprintf("http://127.0.0.1:%d", opts.RuntimeLocalPort)
	manifest := SessionManifest{
		AppName:                "EpydiosOps Desktop",
		StartedAtUTC:           time.Now().UTC().Format(time.RFC3339),
		Mode:                   opts.Mode,
		LauncherState:          launcherStatePrepared,
		BridgeHealth:           bridgeHealthUnknown,
		BridgeRequiredBindings: nativeBridgeRequiredBindings(),
		RuntimeProcessMode:     runtimeProcessMode(opts),
		RuntimeState:           runtimeState(opts),
		RuntimeAPIBaseURL:      runtimeBase,
		RegistryAPIBaseURL:     runtimeBase,
		TargetExecutionProfile: opts.TargetExecutionProfile,
		AllowRestrictedHost:    opts.AllowRestrictedHost,
		BootstrapConfigPath:    opts.BootstrapConfigPath,
		BootstrapConfigState:   resolveBootstrapConfigState(opts.BootstrapConfigPath),
		RuntimeService:         defaultRuntimeServiceRecord(opts, paths),
		GatewayService:         defaultGatewayServiceRecord(opts, paths),
		Paths:                  paths,
	}
	manifest.Interposition = buildInterpositionRecord(opts, manifest.GatewayService, InterpositionRecord{})
	if err := patchRuntimeConfig(paths.WebDir, opts, manifest); err != nil {
		return nil, err
	}
	session := &Session{
		Manifest:      manifest,
		launchOptions: opts,
	}
	if err := session.writeManifest(); err != nil {
		return nil, err
	}
	if err := session.RecordEvent("session_prepared", map[string]any{
		"mode":                   manifest.Mode,
		"runtimeProcessMode":     manifest.RuntimeProcessMode,
		"targetExecutionProfile": manifest.TargetExecutionProfile,
		"allowRestrictedHost":    manifest.AllowRestrictedHost,
		"webDir":                 manifest.Paths.WebDir,
	}); err != nil {
		return nil, err
	}
	return session, nil
}

func (s *Session) RecordEvent(name string, payload map[string]any) error {
	event := map[string]any{
		"timestampUtc": time.Now().UTC().Format(time.RFC3339),
		"event":        name,
		"payload":      payload,
	}
	f, err := os.OpenFile(s.Manifest.Paths.EventLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return fmt.Errorf("open session event log: %w", err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	return enc.Encode(event)
}

func (s *Session) UpdateRuntimeState(state string) error {
	return s.update(func(manifest *SessionManifest) {
		manifest.RuntimeState = state
	})
}

func (s *Session) UpdateLauncherState(state string) error {
	return s.update(func(manifest *SessionManifest) {
		manifest.LauncherState = state
		if state != launcherStateDegraded {
			manifest.StartupError = ""
		}
	})
}

func (s *Session) RecordStartupFailure(runtimeState string, err error) error {
	if err == nil {
		return nil
	}
	return s.update(func(manifest *SessionManifest) {
		manifest.LauncherState = launcherStateDegraded
		if strings.TrimSpace(runtimeState) != "" {
			manifest.RuntimeState = runtimeState
		}
		manifest.StartupError = err.Error()
	})
}

func (s *Session) LaunchOptions() LaunchOptions {
	return s.launchOptions
}

func (s *Session) UpdateRuntimeService(record RuntimeServiceRecord) error {
	return s.update(func(manifest *SessionManifest) {
		manifest.RuntimeService = record
		manifest.RuntimeState = runtimeStateFromService(manifest.Mode, record)
	})
}

func (s *Session) UpdateGatewayService(record GatewayServiceRecord) error {
	return s.update(func(manifest *SessionManifest) {
		manifest.GatewayService = record
	})
}

func (s *Session) UpdateInterpositionConfig(enabled bool, upstreamBaseURL string, upstreamBearerToken string) error {
	opts := s.launchOptions
	opts.InterpositionEnabled = enabled
	opts.InterpositionUpstreamBaseURL = strings.TrimSpace(upstreamBaseURL)
	switch trimmedBearerToken := strings.TrimSpace(upstreamBearerToken); trimmedBearerToken {
	case "":
		// Preserve any existing saved token unless the UI explicitly requests a clear.
	case "__EPYDIOS_CLEAR_INTERPOSITION_BEARER__":
		opts.InterpositionUpstreamBearerToken = ""
	default:
		opts.InterpositionUpstreamBearerToken = trimmedBearerToken
	}
	if err := writeBootstrapLaunchOptions(opts.BootstrapConfigPath, bootstrapLaunchOptionsFromLaunchOptions(opts)); err != nil {
		return err
	}
	s.launchOptions = opts
	return s.update(func(manifest *SessionManifest) {
		manifest.BootstrapConfigPath = opts.BootstrapConfigPath
		manifest.BootstrapConfigState = resolveBootstrapConfigState(opts.BootstrapConfigPath)
	})
}

func (s *Session) UpdateBridgeHealth(missingBindings []string, reason string) error {
	normalizedMissing := normalizeStringSlice(missingBindings)
	return s.update(func(manifest *SessionManifest) {
		manifest.BridgeRequiredBindings = nativeBridgeRequiredBindings()
		manifest.BridgeMissingBindings = normalizedMissing
		manifest.BridgeCheckedAtUTC = time.Now().UTC().Format(time.RFC3339)
		manifest.BridgeReason = strings.TrimSpace(reason)
		if len(normalizedMissing) == 0 {
			manifest.BridgeHealth = bridgeHealthHealthy
			if strings.HasPrefix(strings.TrimSpace(manifest.StartupError), "Native bridge missing required bindings:") {
				manifest.StartupError = ""
			}
		} else {
			manifest.BridgeHealth = bridgeHealthDegraded
			if strings.TrimSpace(manifest.BridgeReason) == "" {
				manifest.BridgeReason = "Native bridge missing required bindings."
			}
			manifest.StartupError = manifest.BridgeReason
		}
		manifest.LauncherState = recommendedLauncherState(*manifest)
	})
}

func (s *Session) BeginInterpositionTransition(currentEnabled bool, desiredEnabled bool, status string, reason string) error {
	normalizedStatus := strings.TrimSpace(strings.ToLower(status))
	if !isInterpositionTransitionStatus(normalizedStatus) {
		return fmt.Errorf("unsupported interposition transition status %q", status)
	}
	return s.update(func(manifest *SessionManifest) {
		manifest.Interposition.Enabled = currentEnabled || desiredEnabled
		manifest.Interposition.Effective = false
		manifest.Interposition.Status = normalizedStatus
		manifest.Interposition.Reason = strings.TrimSpace(reason)
		manifest.Interposition.Transitioning = true
		manifest.Interposition.DesiredEnabled = desiredEnabled
		manifest.Interposition.TransitionStartedAtUTC = time.Now().UTC().Format(time.RFC3339)
	})
}

func (s *Session) ClearInterpositionTransition() error {
	return s.update(func(manifest *SessionManifest) {
		manifest.Interposition.Transitioning = false
		manifest.Interposition.DesiredEnabled = false
		manifest.Interposition.TransitionStartedAtUTC = ""
	})
}

func (s *Session) update(mutate func(*SessionManifest)) error {
	if mutate != nil {
		mutate(&s.Manifest)
	}
	s.Manifest.Interposition = buildInterpositionRecord(s.launchOptions, s.Manifest.GatewayService, s.Manifest.Interposition)
	if err := patchRuntimeConfig(s.Manifest.Paths.WebDir, s.launchOptions, s.Manifest); err != nil {
		return err
	}
	return s.writeManifest()
}

func (s *Session) writeManifest() error {
	data, err := json.MarshalIndent(s.Manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal session manifest: %w", err)
	}
	return os.WriteFile(s.Manifest.Paths.ManifestPath, append(data, '\n'), 0o644)
}

func waitForRuntimeHealth(url string) error {
	deadline := time.Now().Add(30 * time.Second)
	return waitForRuntimeHealthUntil(url, deadline)
}

func waitForRuntimeHealthUntil(url string, deadline time.Time) error {
	client := &http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return nil
			}
		}
		time.Sleep(time.Second)
	}
	return fmt.Errorf("runtime health endpoint did not become ready: %s", url)
}

func patchRuntimeConfig(webDir string, opts LaunchOptions, manifest SessionManifest) error {
	configPath := filepath.Join(webDir, "config", "runtime-config.json")
	content, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("read runtime config: %w", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return fmt.Errorf("decode runtime config: %w", err)
	}
	payload["environment"] = map[string]string{
		modeMock: "native-mock",
		modeLive: "native-live",
	}[opts.Mode]
	payload["mockMode"] = opts.Mode == modeMock
	payload["runtimeApiBaseUrl"] = manifest.RuntimeAPIBaseURL
	payload["registryApiBaseUrl"] = manifest.RegistryAPIBaseURL
	authValue, ok := payload["auth"].(map[string]any)
	if !ok {
		authValue = map[string]any{}
	}
	if opts.Mode == modeLive {
		authEnabled := false
		if opts.AuthEnabledOverride != nil {
			authEnabled = *opts.AuthEnabledOverride
		}
		authValue["enabled"] = authEnabled
		if opts.AuthMockLogin {
			authValue["mockLogin"] = true
		} else {
			delete(authValue, "mockLogin")
		}
		payload["auth"] = authValue
	}
	payload["nativeShell"] = map[string]any{
		"launcherState":          manifest.LauncherState,
		"bridgeHealth":           manifest.BridgeHealth,
		"bridgeRequiredBindings": manifest.BridgeRequiredBindings,
		"bridgeMissingBindings":  manifest.BridgeMissingBindings,
		"bridgeCheckedAtUtc":     manifest.BridgeCheckedAtUTC,
		"bridgeReason":           manifest.BridgeReason,
		"mode":                   opts.Mode,
		"runtimeProcessMode":     manifest.RuntimeProcessMode,
		"runtimeState":           manifest.RuntimeState,
		"runtimeService":         manifest.RuntimeService,
		"gatewayService":         manifest.GatewayService,
		"targetExecutionProfile": manifest.TargetExecutionProfile,
		"allowRestrictedHost":    manifest.AllowRestrictedHost,
		"bootstrapConfigPath":    manifest.BootstrapConfigPath,
		"bootstrapConfigState":   manifest.BootstrapConfigState,
		"interposition":          manifest.Interposition,
		"startupError":           manifest.StartupError,
		"configRoot":             manifest.Paths.ConfigRoot,
		"cacheRoot":              manifest.Paths.CacheRoot,
		"logDir":                 manifest.Paths.LogDir,
		"crashDir":               manifest.Paths.CrashDir,
		"eventLogPath":           manifest.Paths.EventLogPath,
		"uiLogPath":              manifest.Paths.UILogPath,
		"runtimeLogPath":         manifest.Paths.RuntimeLogPath,
		"sessionManifestPath":    manifest.Paths.ManifestPath,
		"serviceRoot":            manifest.Paths.ServiceRoot,
		"servicePidPath":         manifest.Paths.ServicePIDPath,
		"serviceLogPath":         manifest.Paths.ServiceLogPath,
		"serviceStatusPath":      manifest.Paths.ServiceStatusPath,
		"gatewayRoot":            manifest.Paths.GatewayRoot,
		"gatewayPidPath":         manifest.Paths.GatewayPIDPath,
		"gatewayLogPath":         manifest.Paths.GatewayLogPath,
		"gatewayStatusPath":      manifest.Paths.GatewayStatusPath,
		"gatewayTokenPath":       manifest.Paths.GatewayTokenPath,
		"gatewayRequestsRoot":    manifest.Paths.GatewayRequestsRoot,
		"diagnostics": map[string]any{
			"bootstrapConfigPath": manifest.BootstrapConfigPath,
			"sessionManifestPath": manifest.Paths.ManifestPath,
			"eventLogPath":        manifest.Paths.EventLogPath,
			"uiLogPath":           manifest.Paths.UILogPath,
			"runtimeLogPath":      manifest.Paths.RuntimeLogPath,
			"servicePidPath":      manifest.Paths.ServicePIDPath,
			"serviceLogPath":      manifest.Paths.ServiceLogPath,
			"serviceStatusPath":   manifest.Paths.ServiceStatusPath,
			"serviceRoot":         manifest.Paths.ServiceRoot,
			"gatewayPidPath":      manifest.Paths.GatewayPIDPath,
			"gatewayLogPath":      manifest.Paths.GatewayLogPath,
			"gatewayStatusPath":   manifest.Paths.GatewayStatusPath,
			"gatewayTokenPath":    manifest.Paths.GatewayTokenPath,
			"gatewayRequestsRoot": manifest.Paths.GatewayRequestsRoot,
			"gatewayRoot":         manifest.Paths.GatewayRoot,
			"crashDir":            manifest.Paths.CrashDir,
			"configRoot":          manifest.Paths.ConfigRoot,
			"cacheRoot":           manifest.Paths.CacheRoot,
		},
	}
	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode runtime config: %w", err)
	}
	return os.WriteFile(configPath, append(encoded, '\n'), 0o644)
}

func fsSub(root fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(root, dir)
	if err != nil {
		return root
	}
	return sub
}

func copyFS(root fs.FS, target string) error {
	return fs.WalkDir(root, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		destPath := filepath.Join(target, path)
		if d.IsDir() {
			return os.MkdirAll(destPath, 0o755)
		}
		src, err := root.Open(path)
		if err != nil {
			return err
		}
		defer src.Close()
		info, err := d.Info()
		if err != nil {
			return err
		}
		mode := info.Mode().Perm()
		if mode == 0 {
			mode = 0o644
		}
		// Embedded assets often resolve to read-only perms; the staged session
		// copy must stay owner-writable so runtime-config rewrites can succeed.
		mode |= 0o200
		dest, err := os.OpenFile(destPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
		if err != nil {
			return err
		}
		defer dest.Close()
		_, err = io.Copy(dest, src)
		return err
	})
}

func runtimeProcessMode(opts LaunchOptions) string {
	if opts.Mode == modeLive {
		return "background_supervisor"
	}
	return "mock_only"
}

func runtimeState(opts LaunchOptions) string {
	if opts.Mode == modeLive {
		return "service_pending"
	}
	return "mock_active"
}

func buildInterpositionRecord(opts LaunchOptions, gateway GatewayServiceRecord, previous InterpositionRecord) InterpositionRecord {
	upstreamBaseURL := strings.TrimSpace(opts.InterpositionUpstreamBaseURL)
	upstreamBearerTokenConfigured := strings.TrimSpace(opts.InterpositionUpstreamBearerToken) != ""
	upstreamAuthMode := "client_passthrough"
	if upstreamBearerTokenConfigured {
		upstreamAuthMode = "saved_token"
	}
	record := InterpositionRecord{
		Enabled:                       opts.InterpositionEnabled,
		Effective:                     false,
		Status:                        "off",
		UpstreamBaseURL:               upstreamBaseURL,
		UpstreamBearerTokenConfigured: upstreamBearerTokenConfigured,
		UpstreamAuthMode:              upstreamAuthMode,
	}
	if previous.Transitioning && isInterpositionTransitionStatus(previous.Status) {
		record.Enabled = previous.Enabled
		record.Effective = false
		record.Status = strings.TrimSpace(strings.ToLower(previous.Status))
		record.Reason = strings.TrimSpace(previous.Reason)
		record.Transitioning = true
		record.DesiredEnabled = previous.DesiredEnabled
		record.TransitionStartedAtUTC = strings.TrimSpace(previous.TransitionStartedAtUTC)
		return record
	}
	switch {
	case !record.Enabled:
		record.Status = "off"
		record.Reason = "Interposition is OFF. Epydios is not governing supported requests."
	case strings.TrimSpace(opts.Mode) != modeLive:
		record.Status = "blocked_mock_mode"
		record.Reason = "Interposition cannot turn on until live mode is ready."
	case record.UpstreamBaseURL == "":
		record.Status = "blocked_upstream_config"
		record.Reason = "Interposition cannot turn on until upstream access is configured."
	case strings.EqualFold(strings.TrimSpace(gateway.State), "running") && strings.EqualFold(strings.TrimSpace(gateway.Health), "healthy"):
		record.Status = "on"
		record.Effective = true
		record.Reason = "Interposition is ON. Epydios is governing supported requests."
	case strings.EqualFold(strings.TrimSpace(gateway.State), "running"):
		record.Status = "warming"
		record.Reason = "Interposition is turning on. Epydios is getting ready."
	default:
		record.Status = "gateway_unavailable"
		record.Reason = "Interposition is ON, but Epydios is still getting ready."
	}
	return record
}

func nativeBridgeRequiredBindings() []string {
	return []string{
		"NativeSessionSummary",
		"NativeShellStatusRefresh",
		"NativeBridgeHealthReport",
		"NativeGatewayHoldList",
		"NativeInterpositionConfigure",
		"NativeRuntimeServiceRestart",
		"NativeOpenPath",
	}
}

func normalizeStringSlice(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(items))
	normalized := make([]string, 0, len(items))
	for _, item := range items {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func recommendedLauncherState(manifest SessionManifest) string {
	current := strings.TrimSpace(strings.ToLower(manifest.LauncherState))
	if current == launcherStateStopped {
		return launcherStateStopped
	}
	if strings.TrimSpace(strings.ToLower(manifest.BridgeHealth)) == bridgeHealthDegraded {
		return launcherStateDegraded
	}
	if strings.TrimSpace(manifest.Mode) != modeLive {
		if current == launcherStatePrepared {
			return launcherStatePrepared
		}
		return launcherStateReady
	}
	runtimeState := strings.TrimSpace(strings.ToLower(manifest.RuntimeService.State))
	runtimeHealth := strings.TrimSpace(strings.ToLower(manifest.RuntimeService.Health))
	gatewayState := strings.TrimSpace(strings.ToLower(manifest.GatewayService.State))
	gatewayHealth := strings.TrimSpace(strings.ToLower(manifest.GatewayService.Health))
	switch {
	case runtimeState == runtimeServiceStateStarting || runtimeHealth == runtimeServiceHealthStarting:
		return launcherStateRecovering
	case gatewayState == gatewayStateStarting || gatewayHealth == gatewayHealthStarting:
		return launcherStateRecovering
	case runtimeState == runtimeServiceStateFailed || runtimeState == runtimeServiceStateDegraded:
		return launcherStateDegraded
	case runtimeHealth == runtimeServiceHealthUnreachable:
		return launcherStateDegraded
	case gatewayState == gatewayStateFailed || gatewayState == gatewayStateDegraded:
		return launcherStateDegraded
	case gatewayHealth == gatewayHealthUnreachable:
		return launcherStateDegraded
	case runtimeState == runtimeServiceStateRunning &&
		runtimeHealth == runtimeServiceHealthHealthy &&
		gatewayState == gatewayStateRunning &&
		gatewayHealth == gatewayHealthHealthy:
		return launcherStateReady
	case runtimeState == runtimeServiceStateStopped && gatewayState == gatewayStateStopped:
		return launcherStatePrepared
	case current == launcherStateRecovering || current == launcherStateReady || current == launcherStateDegraded || current == launcherStatePrepared:
		return current
	default:
		return launcherStatePrepared
	}
}

func RecommendedLauncherState(manifest SessionManifest) string {
	return recommendedLauncherState(manifest)
}

func isInterpositionTransitionStatus(status string) bool {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case "starting", "stopping":
		return true
	default:
		return false
	}
}

func runtimeStateFromService(mode string, record RuntimeServiceRecord) string {
	if strings.TrimSpace(mode) != modeLive {
		return "mock_active"
	}
	switch strings.TrimSpace(strings.ToLower(record.State)) {
	case "running":
		return "service_running"
	case "starting":
		return "service_starting"
	case "degraded":
		return "service_degraded"
	case "failed":
		return "service_failed"
	case "stopped":
		return "service_stopped"
	default:
		return "service_pending"
	}
}

func defaultRuntimeServiceRecord(opts LaunchOptions, paths SessionPaths) RuntimeServiceRecord {
	record := RuntimeServiceRecord{
		State:             "stopped",
		Health:            "unknown",
		RuntimeAPIBaseURL: fmt.Sprintf("http://127.0.0.1:%d", opts.RuntimeLocalPort),
		LogPath:           paths.ServiceLogPath,
		PIDPath:           paths.ServicePIDPath,
		StatusPath:        paths.ServiceStatusPath,
	}
	if opts.Mode != modeLive {
		record.State = "mock_only"
		record.Health = "not_required"
	}
	return record
}

func defaultGatewayServiceRecord(opts LaunchOptions, paths SessionPaths) GatewayServiceRecord {
	return GatewayServiceRecord{
		State:        "stopped",
		Health:       "unknown",
		BaseURL:      fmt.Sprintf("http://127.0.0.1:%d", opts.GatewayLocalPort),
		LogPath:      paths.GatewayLogPath,
		PIDPath:      paths.GatewayPIDPath,
		StatusPath:   paths.GatewayStatusPath,
		TokenPath:    paths.GatewayTokenPath,
		RequestsRoot: paths.GatewayRequestsRoot,
	}
}

type bootstrapLaunchOptions struct {
	Mode                             string `json:"mode"`
	RuntimeLocalPort                 int    `json:"runtimeLocalPort"`
	GatewayLocalPort                 int    `json:"gatewayLocalPort"`
	RuntimeNamespace                 string `json:"runtimeNamespace"`
	RuntimeService                   string `json:"runtimeService"`
	InterpositionEnabled             *bool  `json:"interpositionEnabled,omitempty"`
	InterpositionUpstreamBaseURL     string `json:"interpositionUpstreamBaseUrl"`
	InterpositionUpstreamBearerToken string `json:"interpositionUpstreamBearerToken"`
}

func resolveBootstrapConfigPath() string {
	if override := strings.TrimSpace(os.Getenv("EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH")); override != "" {
		return override
	}
	configRoot, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(configRoot, "EpydiosAgentOpsDesktop", "runtime-bootstrap.json")
}

func applyBootstrapLaunchOptions(opts *LaunchOptions) error {
	if strings.TrimSpace(opts.BootstrapConfigPath) == "" {
		return nil
	}
	payload, err := readBootstrapLaunchOptions(opts.BootstrapConfigPath)
	if err != nil {
		return err
	}
	if mode := strings.ToLower(strings.TrimSpace(payload.Mode)); mode != "" {
		opts.Mode = mode
	}
	if payload.RuntimeLocalPort > 0 {
		opts.RuntimeLocalPort = payload.RuntimeLocalPort
	}
	if payload.GatewayLocalPort > 0 {
		opts.GatewayLocalPort = payload.GatewayLocalPort
	}
	if namespace := strings.TrimSpace(payload.RuntimeNamespace); namespace != "" {
		opts.RuntimeNamespace = namespace
	}
	if service := strings.TrimSpace(payload.RuntimeService); service != "" {
		opts.RuntimeService = service
	}
	if payload.InterpositionEnabled != nil {
		opts.InterpositionEnabled = *payload.InterpositionEnabled
	}
	if baseURL := strings.TrimSpace(payload.InterpositionUpstreamBaseURL); baseURL != "" {
		opts.InterpositionUpstreamBaseURL = baseURL
	}
	if bearer := strings.TrimSpace(payload.InterpositionUpstreamBearerToken); bearer != "" {
		opts.InterpositionUpstreamBearerToken = bearer
	}
	return nil
}

func applyEnvironmentLaunchOptions(opts *LaunchOptions) error {
	if opts == nil {
		return nil
	}
	if runtimeManagedRaw, ok := os.LookupEnv("EPYDIOS_NATIVEAPP_RUNTIME_MANAGED_EXTERNALLY"); ok {
		runtimeManaged, err := parseLaunchBool(runtimeManagedRaw)
		if err != nil {
			return fmt.Errorf("decode runtime managed externally override: %w", err)
		}
		opts.RuntimeManagedExternally = runtimeManaged
	}
	if authEnabledRaw, ok := os.LookupEnv("EPYDIOS_NATIVEAPP_AUTH_ENABLED"); ok {
		authEnabled, err := parseLaunchBool(authEnabledRaw)
		if err != nil {
			return fmt.Errorf("decode auth enabled override: %w", err)
		}
		opts.AuthEnabledOverride = &authEnabled
	}
	if authMockLoginRaw, ok := os.LookupEnv("EPYDIOS_NATIVEAPP_AUTH_MOCK_LOGIN"); ok {
		authMockLogin, err := parseLaunchBool(authMockLoginRaw)
		if err != nil {
			return fmt.Errorf("decode auth mock login override: %w", err)
		}
		opts.AuthMockLogin = authMockLogin
	}
	if enabledRaw, ok := os.LookupEnv("EPYDIOS_NATIVEAPP_INTERPOSITION_ENABLED"); ok {
		enabled, err := parseLaunchBool(enabledRaw)
		if err != nil {
			return fmt.Errorf("decode interposition enabled override: %w", err)
		}
		opts.InterpositionEnabled = enabled
	}
	if baseURL, ok := os.LookupEnv("EPYDIOS_NATIVEAPP_INTERPOSITION_UPSTREAM_BASE_URL"); ok {
		opts.InterpositionUpstreamBaseURL = strings.TrimSpace(baseURL)
	}
	if token, ok := os.LookupEnv("EPYDIOS_NATIVEAPP_INTERPOSITION_UPSTREAM_BEARER_TOKEN"); ok {
		opts.InterpositionUpstreamBearerToken = strings.TrimSpace(token)
	}
	return nil
}

func parseLaunchBool(raw string) (bool, error) {
	value := strings.TrimSpace(strings.ToLower(raw))
	switch value {
	case "1", "true", "t", "yes", "y", "on":
		return true, nil
	case "0", "false", "f", "no", "n", "off", "":
		return false, nil
	default:
		return false, fmt.Errorf("invalid boolean value %q", raw)
	}
}

func readBootstrapLaunchOptions(path string) (bootstrapLaunchOptions, error) {
	if strings.TrimSpace(path) == "" {
		return bootstrapLaunchOptions{}, nil
	}
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return bootstrapLaunchOptions{}, nil
		}
		return bootstrapLaunchOptions{}, fmt.Errorf("read bootstrap config: %w", err)
	}
	var payload bootstrapLaunchOptions
	if err := json.Unmarshal(content, &payload); err != nil {
		return bootstrapLaunchOptions{}, fmt.Errorf("decode bootstrap config: %w", err)
	}
	return payload, nil
}

func bootstrapLaunchOptionsFromLaunchOptions(opts LaunchOptions) bootstrapLaunchOptions {
	enabled := opts.InterpositionEnabled
	return bootstrapLaunchOptions{
		Mode:                             opts.Mode,
		RuntimeLocalPort:                 opts.RuntimeLocalPort,
		GatewayLocalPort:                 opts.GatewayLocalPort,
		RuntimeNamespace:                 opts.RuntimeNamespace,
		RuntimeService:                   opts.RuntimeService,
		InterpositionEnabled:             &enabled,
		InterpositionUpstreamBaseURL:     strings.TrimSpace(opts.InterpositionUpstreamBaseURL),
		InterpositionUpstreamBearerToken: strings.TrimSpace(opts.InterpositionUpstreamBearerToken),
	}
}

func writeBootstrapLaunchOptions(path string, payload bootstrapLaunchOptions) error {
	if strings.TrimSpace(path) == "" {
		return fmt.Errorf("bootstrap config path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create bootstrap config dir: %w", err)
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode bootstrap config: %w", err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write bootstrap config: %w", err)
	}
	return nil
}

func resolveBootstrapConfigState(path string) string {
	if strings.TrimSpace(path) == "" {
		return bootstrapStateMissing
	}
	if _, err := os.Stat(path); err == nil {
		return bootstrapStateLoaded
	}
	return bootstrapStateMissing
}
