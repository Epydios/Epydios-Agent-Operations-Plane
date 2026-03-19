package nativeapp

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	runtimeServiceStateMockOnly = "mock_only"
	runtimeServiceStateStopped  = "stopped"
	runtimeServiceStateStarting = "starting"
	runtimeServiceStateRunning  = "running"
	runtimeServiceStateDegraded = "degraded"
	runtimeServiceStateFailed   = "failed"

	runtimeServiceHealthUnknown     = "unknown"
	runtimeServiceHealthNotRequired = "not_required"
	runtimeServiceHealthStarting    = "starting"
	runtimeServiceHealthHealthy     = "healthy"
	runtimeServiceHealthUnreachable = "unreachable"
)

func EnsureRuntimeService(opts LaunchOptions, session *Session) (RuntimeServiceRecord, error) {
	record, err := SyncRuntimeServiceStatus(opts, session)
	if err != nil {
		return record, err
	}
	if opts.Mode != modeLive {
		return record, nil
	}
	if record.State == runtimeServiceStateRunning && record.Health == runtimeServiceHealthHealthy {
		return record, nil
	}
	return StartRuntimeService(opts, session)
}

func SyncRuntimeServiceStatus(opts LaunchOptions, session *Session) (RuntimeServiceRecord, error) {
	record := defaultRuntimeServiceRecord(opts, session.Manifest.Paths)
	stored, err := readRuntimeServiceRecord(session.Manifest.Paths.ServiceStatusPath)
	if err == nil {
		record = mergeRuntimeServiceRecord(record, stored)
	}

	if opts.Mode != modeLive {
		record.State = runtimeServiceStateMockOnly
		record.Health = runtimeServiceHealthNotRequired
		record.PID = 0
		record.LastError = ""
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		if err := writeRuntimeServiceRecord(record); err != nil {
			return record, err
		}
		return record, session.UpdateRuntimeService(record)
	}

	pid, _ := readRuntimeServicePID(session.Manifest.Paths.ServicePIDPath)
	if pid > 0 {
		record.PID = pid
	}

	if runtimeHealthy(record.RuntimeAPIBaseURL) {
		record.State = runtimeServiceStateRunning
		record.Health = runtimeServiceHealthHealthy
		record.LastError = ""
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		if record.StartedAtUTC == "" {
			record.StartedAtUTC = record.UpdatedAtUTC
		}
		if err := writeRuntimeServiceRecord(record); err != nil {
			return record, err
		}
		return record, session.UpdateRuntimeService(record)
	}

	if record.PID > 0 && processIsRunning(record.PID) {
		record.State = runtimeServiceStateDegraded
		record.Health = runtimeServiceHealthUnreachable
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		if strings.TrimSpace(record.LastError) == "" {
			record.LastError = fmt.Sprintf("runtime health endpoint did not become ready: %s/healthz", strings.TrimRight(record.RuntimeAPIBaseURL, "/"))
		}
		if err := writeRuntimeServiceRecord(record); err != nil {
			return record, err
		}
		return record, session.UpdateRuntimeService(record)
	}

	record.PID = 0
	if strings.TrimSpace(record.StartedAtUTC) == "" {
		record.StartedAtUTC = ""
	}
	if record.State != runtimeServiceStateFailed {
		record.State = runtimeServiceStateStopped
	}
	if record.Health != runtimeServiceHealthHealthy {
		record.Health = runtimeServiceHealthUnknown
	}
	record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
	if err := writeRuntimeServiceRecord(record); err != nil {
		return record, err
	}
	return record, session.UpdateRuntimeService(record)
}

func StartRuntimeService(opts LaunchOptions, session *Session) (RuntimeServiceRecord, error) {
	if opts.Mode != modeLive {
		record := defaultRuntimeServiceRecord(opts, session.Manifest.Paths)
		if err := writeRuntimeServiceRecord(record); err != nil {
			return record, err
		}
		return record, session.UpdateRuntimeService(record)
	}

	record, _ := SyncRuntimeServiceStatus(opts, session)
	if record.PID > 0 {
		_ = stopRuntimeServiceByPID(record.PID)
		_ = os.Remove(session.Manifest.Paths.ServicePIDPath)
	}

	logFile, err := os.OpenFile(session.Manifest.Paths.ServiceLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return record, fmt.Errorf("open runtime service log: %w", err)
	}
	defer logFile.Close()

	cmd := exec.Command(
		"kubectl",
		"-n", opts.RuntimeNamespace,
		"port-forward",
		"svc/"+opts.RuntimeService,
		fmt.Sprintf("%d:8080", opts.RuntimeLocalPort),
	)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	applyDetachedProcessAttributes(cmd)
	if err := cmd.Start(); err != nil {
		record.State = runtimeServiceStateFailed
		record.Health = runtimeServiceHealthUnreachable
		record.LastError = fmt.Sprintf("start runtime service: %v", err)
		record.PID = 0
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		_ = writeRuntimeServiceRecord(record)
		_ = session.UpdateRuntimeService(record)
		return record, fmt.Errorf("start runtime service: %w", err)
	}

	pid := cmd.Process.Pid
	_ = cmd.Process.Release()

	record = defaultRuntimeServiceRecord(opts, session.Manifest.Paths)
	record.State = runtimeServiceStateStarting
	record.Health = runtimeServiceHealthStarting
	record.PID = pid
	record.StartedAtUTC = time.Now().UTC().Format(time.RFC3339)
	record.UpdatedAtUTC = record.StartedAtUTC
	if err := writeRuntimeServicePID(record.PIDPath, pid); err != nil {
		return record, err
	}
	if err := writeRuntimeServiceRecord(record); err != nil {
		return record, err
	}
	if err := session.UpdateRuntimeService(record); err != nil {
		return record, err
	}

	if err := waitForRuntimeHealth(record.RuntimeAPIBaseURL + "/healthz"); err != nil {
		_ = stopRuntimeServiceByPID(pid)
		_ = os.Remove(record.PIDPath)
		record.State = runtimeServiceStateFailed
		record.Health = runtimeServiceHealthUnreachable
		record.PID = 0
		record.LastError = err.Error()
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		if err := writeRuntimeServiceRecord(record); err != nil {
			return record, err
		}
		if err := session.UpdateRuntimeService(record); err != nil {
			return record, err
		}
		return record, err
	}

	record.State = runtimeServiceStateRunning
	record.Health = runtimeServiceHealthHealthy
	record.LastError = ""
	record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
	if err := writeRuntimeServiceRecord(record); err != nil {
		return record, err
	}
	if err := session.UpdateRuntimeService(record); err != nil {
		return record, err
	}
	return record, nil
}

func StopRuntimeService(opts LaunchOptions, session *Session) (RuntimeServiceRecord, error) {
	record := defaultRuntimeServiceRecord(opts, session.Manifest.Paths)
	if opts.Mode != modeLive {
		if err := writeRuntimeServiceRecord(record); err != nil {
			return record, err
		}
		return record, session.UpdateRuntimeService(record)
	}

	current, _ := readRuntimeServiceRecord(session.Manifest.Paths.ServiceStatusPath)
	record = mergeRuntimeServiceRecord(record, current)
	pid, _ := readRuntimeServicePID(session.Manifest.Paths.ServicePIDPath)
	if pid > 0 {
		record.PID = pid
	}
	if record.PID > 0 {
		if err := stopRuntimeServiceByPID(record.PID); err != nil {
			record.State = runtimeServiceStateDegraded
			record.Health = runtimeServiceHealthUnreachable
			record.LastError = err.Error()
			record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
			_ = writeRuntimeServiceRecord(record)
			_ = session.UpdateRuntimeService(record)
			return record, err
		}
	}
	_ = os.Remove(session.Manifest.Paths.ServicePIDPath)
	record.PID = 0
	record.State = runtimeServiceStateStopped
	record.Health = runtimeServiceHealthUnknown
	record.LastError = ""
	record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
	if err := writeRuntimeServiceRecord(record); err != nil {
		return record, err
	}
	if err := session.UpdateRuntimeService(record); err != nil {
		return record, err
	}
	return record, nil
}

func RestartRuntimeService(opts LaunchOptions, session *Session) (RuntimeServiceRecord, error) {
	if _, err := StopRuntimeService(opts, session); err != nil {
		return session.Manifest.RuntimeService, err
	}
	return StartRuntimeService(opts, session)
}

func mergeRuntimeServiceRecord(base RuntimeServiceRecord, override RuntimeServiceRecord) RuntimeServiceRecord {
	record := base
	if strings.TrimSpace(override.State) != "" {
		record.State = override.State
	}
	if strings.TrimSpace(override.Health) != "" {
		record.Health = override.Health
	}
	if override.PID > 0 {
		record.PID = override.PID
	}
	if strings.TrimSpace(override.RuntimeAPIBaseURL) != "" {
		record.RuntimeAPIBaseURL = override.RuntimeAPIBaseURL
	}
	if strings.TrimSpace(override.LogPath) != "" {
		record.LogPath = override.LogPath
	}
	if strings.TrimSpace(override.PIDPath) != "" {
		record.PIDPath = override.PIDPath
	}
	if strings.TrimSpace(override.StatusPath) != "" {
		record.StatusPath = override.StatusPath
	}
	if strings.TrimSpace(override.StartedAtUTC) != "" {
		record.StartedAtUTC = override.StartedAtUTC
	}
	if strings.TrimSpace(override.UpdatedAtUTC) != "" {
		record.UpdatedAtUTC = override.UpdatedAtUTC
	}
	if strings.TrimSpace(override.LastError) != "" {
		record.LastError = override.LastError
	}
	return record
}

func readRuntimeServiceRecord(path string) (RuntimeServiceRecord, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return RuntimeServiceRecord{}, err
	}
	var record RuntimeServiceRecord
	if err := json.Unmarshal(content, &record); err != nil {
		return RuntimeServiceRecord{}, fmt.Errorf("decode runtime service status: %w", err)
	}
	return record, nil
}

func writeRuntimeServiceRecord(record RuntimeServiceRecord) error {
	if err := os.MkdirAll(filepath.Dir(record.StatusPath), 0o755); err != nil {
		return fmt.Errorf("create runtime service status dir: %w", err)
	}
	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal runtime service status: %w", err)
	}
	return os.WriteFile(record.StatusPath, append(data, '\n'), 0o644)
}

func readRuntimeServicePID(path string) (int, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(content)))
	if err != nil {
		return 0, fmt.Errorf("decode runtime service pid: %w", err)
	}
	return pid, nil
}

func writeRuntimeServicePID(path string, pid int) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create runtime service pid dir: %w", err)
	}
	return os.WriteFile(path, []byte(strconv.Itoa(pid)+"\n"), 0o644)
}

func runtimeHealthy(baseURL string) bool {
	base := strings.TrimSpace(baseURL)
	if base == "" {
		return false
	}
	client := time.Now().Add(1500 * time.Millisecond)
	return waitForRuntimeHealthUntil(strings.TrimRight(base, "/")+"/healthz", client) == nil
}
