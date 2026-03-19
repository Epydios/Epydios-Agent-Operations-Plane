package nativeapp

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	modeMock = "mock"
	modeLive = "live"

	launcherStatePrepared = "prepared"
	launcherStateReady    = "ready"
	launcherStateDegraded = "degraded"
	launcherStateStopped  = "stopped"

	bootstrapStateLoaded  = "loaded"
	bootstrapStateMissing = "missing"
)

type LaunchOptions struct {
	Mode                   string
	RuntimeLocalPort       int
	RuntimeNamespace       string
	RuntimeService         string
	TargetExecutionProfile string
	AllowRestrictedHost    bool
	BootstrapConfigPath    string
}

type SessionPaths struct {
	ConfigRoot     string `json:"configRoot"`
	CacheRoot      string `json:"cacheRoot"`
	RootDir        string `json:"rootDir"`
	WebDir         string `json:"webDir"`
	LogDir         string `json:"logDir"`
	CrashDir       string `json:"crashDir"`
	EventLogPath   string `json:"eventLogPath"`
	UILogPath      string `json:"uiLogPath"`
	RuntimeLogPath string `json:"runtimeLogPath"`
	ManifestPath   string `json:"manifestPath"`
}

type SessionManifest struct {
	AppName                string       `json:"appName"`
	StartedAtUTC           string       `json:"startedAtUtc"`
	Mode                   string       `json:"mode"`
	LauncherState          string       `json:"launcherState"`
	RuntimeProcessMode     string       `json:"runtimeProcessMode"`
	RuntimeState           string       `json:"runtimeState"`
	RuntimeAPIBaseURL      string       `json:"runtimeApiBaseUrl"`
	RegistryAPIBaseURL     string       `json:"registryApiBaseUrl"`
	TargetExecutionProfile string       `json:"targetExecutionProfile"`
	AllowRestrictedHost    bool         `json:"allowRestrictedHost"`
	BootstrapConfigPath    string       `json:"bootstrapConfigPath"`
	BootstrapConfigState   string       `json:"bootstrapConfigState"`
	StartupError           string       `json:"startupError,omitempty"`
	Paths                  SessionPaths `json:"paths"`
}

type Session struct {
	Manifest      SessionManifest
	launchOptions LaunchOptions
}

type RuntimeProcess struct {
	cmd      *exec.Cmd
	logFile  *os.File
	manifest *SessionManifest
}

func DefaultLaunchOptions() LaunchOptions {
	return LaunchOptions{
		Mode:                   modeMock,
		RuntimeLocalPort:       8080,
		RuntimeNamespace:       "epydios-system",
		RuntimeService:         "orchestration-runtime",
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
	for i := 0; i < len(args); i++ {
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
	sessionRoot := filepath.Join(productCacheRoot, "native-shell", stamp)
	paths := SessionPaths{
		ConfigRoot:     productConfigRoot,
		CacheRoot:      productCacheRoot,
		RootDir:        sessionRoot,
		WebDir:         filepath.Join(sessionRoot, "web"),
		LogDir:         filepath.Join(sessionRoot, "logs"),
		CrashDir:       filepath.Join(sessionRoot, "crashdumps"),
		EventLogPath:   filepath.Join(sessionRoot, "logs", "session-events.jsonl"),
		UILogPath:      filepath.Join(sessionRoot, "logs", "ui-shell.log"),
		RuntimeLogPath: filepath.Join(sessionRoot, "logs", "runtime-process.log"),
		ManifestPath:   filepath.Join(sessionRoot, "session.json"),
	}
	for _, dir := range []string{paths.WebDir, paths.LogDir, paths.CrashDir} {
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
		RuntimeProcessMode:     runtimeProcessMode(opts),
		RuntimeState:           runtimeState(opts),
		RuntimeAPIBaseURL:      runtimeBase,
		RegistryAPIBaseURL:     runtimeBase,
		TargetExecutionProfile: opts.TargetExecutionProfile,
		AllowRestrictedHost:    opts.AllowRestrictedHost,
		BootstrapConfigPath:    opts.BootstrapConfigPath,
		BootstrapConfigState:   resolveBootstrapConfigState(opts.BootstrapConfigPath),
		Paths:                  paths,
	}
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

func (s *Session) update(mutate func(*SessionManifest)) error {
	if mutate != nil {
		mutate(&s.Manifest)
	}
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

func StartRuntimeProcess(opts LaunchOptions, session *Session) (*RuntimeProcess, error) {
	if opts.Mode != modeLive {
		return nil, nil
	}
	logFile, err := os.OpenFile(session.Manifest.Paths.RuntimeLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open runtime log: %w", err)
	}
	cmd := exec.Command(
		"kubectl",
		"-n", opts.RuntimeNamespace,
		"port-forward",
		"svc/"+opts.RuntimeService,
		fmt.Sprintf("%d:8080", opts.RuntimeLocalPort),
	)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("start runtime process: %w", err)
	}
	process := &RuntimeProcess{cmd: cmd, logFile: logFile, manifest: &session.Manifest}
	if err := waitForRuntimeHealth(session.Manifest.RuntimeAPIBaseURL + "/healthz"); err != nil {
		_ = process.Stop()
		return nil, err
	}
	return process, nil
}

func (p *RuntimeProcess) Stop() error {
	if p == nil {
		return nil
	}
	var stopErr error
	if p.cmd != nil && p.cmd.Process != nil {
		stopErr = p.cmd.Process.Kill()
		_, _ = p.cmd.Process.Wait()
	}
	if p.logFile != nil {
		_ = p.logFile.Close()
	}
	return stopErr
}

func waitForRuntimeHealth(url string) error {
	deadline := time.Now().Add(30 * time.Second)
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
	if ok && opts.Mode == modeLive {
		authValue["enabled"] = false
		payload["auth"] = authValue
	}
	payload["nativeShell"] = map[string]any{
		"launcherState":          manifest.LauncherState,
		"mode":                   opts.Mode,
		"runtimeProcessMode":     manifest.RuntimeProcessMode,
		"runtimeState":           manifest.RuntimeState,
		"targetExecutionProfile": manifest.TargetExecutionProfile,
		"allowRestrictedHost":    manifest.AllowRestrictedHost,
		"bootstrapConfigPath":    manifest.BootstrapConfigPath,
		"bootstrapConfigState":   manifest.BootstrapConfigState,
		"startupError":           manifest.StartupError,
		"configRoot":             manifest.Paths.ConfigRoot,
		"cacheRoot":              manifest.Paths.CacheRoot,
		"logDir":                 manifest.Paths.LogDir,
		"crashDir":               manifest.Paths.CrashDir,
		"eventLogPath":           manifest.Paths.EventLogPath,
		"uiLogPath":              manifest.Paths.UILogPath,
		"runtimeLogPath":         manifest.Paths.RuntimeLogPath,
		"sessionManifestPath":    manifest.Paths.ManifestPath,
		"diagnostics": map[string]any{
			"bootstrapConfigPath": manifest.BootstrapConfigPath,
			"sessionManifestPath": manifest.Paths.ManifestPath,
			"eventLogPath":        manifest.Paths.EventLogPath,
			"uiLogPath":           manifest.Paths.UILogPath,
			"runtimeLogPath":      manifest.Paths.RuntimeLogPath,
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
		return "kubectl_port_forward"
	}
	return "mock_only"
}

func runtimeState(opts LaunchOptions) string {
	if opts.Mode == modeLive {
		return "port_forward_pending"
	}
	return "mock_active"
}

type bootstrapLaunchOptions struct {
	Mode             string `json:"mode"`
	RuntimeLocalPort int    `json:"runtimeLocalPort"`
	RuntimeNamespace string `json:"runtimeNamespace"`
	RuntimeService   string `json:"runtimeService"`
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
	content, err := os.ReadFile(opts.BootstrapConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read bootstrap config: %w", err)
	}
	var payload bootstrapLaunchOptions
	if err := json.Unmarshal(content, &payload); err != nil {
		return fmt.Errorf("decode bootstrap config: %w", err)
	}
	if mode := strings.ToLower(strings.TrimSpace(payload.Mode)); mode != "" {
		opts.Mode = mode
	}
	if payload.RuntimeLocalPort > 0 {
		opts.RuntimeLocalPort = payload.RuntimeLocalPort
	}
	if namespace := strings.TrimSpace(payload.RuntimeNamespace); namespace != "" {
		opts.RuntimeNamespace = namespace
	}
	if service := strings.TrimSpace(payload.RuntimeService); service != "" {
		opts.RuntimeService = service
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
