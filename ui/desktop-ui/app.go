//go:build m15native

package main

import (
	"context"

	"github.com/Epydios/Epydios-AgentOps-Control-Plane/ui/desktop-ui/internal/nativeapp"
)

type App struct {
	ctx     context.Context
	session *nativeapp.Session
}

func NewApp(session *nativeapp.Session) *App {
	return &App{
		session: session,
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	_ = a.session.RecordEvent("native_window_started", map[string]any{
		"manifestPath": a.session.Manifest.Paths.ManifestPath,
		"uiLogPath":    a.session.Manifest.Paths.UILogPath,
	})
}

func (a *App) domReady(ctx context.Context) {
	_ = a.session.RecordEvent("native_window_dom_ready", map[string]any{
		"webDir":              a.session.Manifest.Paths.WebDir,
		"runtimeProcessMode":  a.session.Manifest.RuntimeProcessMode,
		"runtimeServiceState": a.session.Manifest.RuntimeService.State,
		"mode":                a.session.Manifest.Mode,
	})
}

func (a *App) shutdown(ctx context.Context) {
	_ = a.session.RecordEvent("native_window_shutdown", map[string]any{
		"runtimeState":        a.session.Manifest.RuntimeState,
		"runtimeServiceState": a.session.Manifest.RuntimeService.State,
	})
	_ = a.session.UpdateLauncherState("stopped")
}

func (a *App) NativeSessionSummary() nativeapp.SessionManifest {
	return a.session.Manifest
}

func (a *App) NativeRuntimeServiceSummary() nativeapp.RuntimeServiceRecord {
	record, err := nativeapp.SyncRuntimeServiceStatus(a.session.LaunchOptions(), a.session)
	if err != nil {
		_ = a.session.RecordEvent("runtime_service_status_failed", map[string]any{"error": err.Error()})
		return a.session.Manifest.RuntimeService
	}
	return record
}

func (a *App) NativeRuntimeServiceStart() nativeapp.RuntimeServiceRecord {
	record, err := nativeapp.StartRuntimeService(a.session.LaunchOptions(), a.session)
	if err != nil {
		_ = a.session.RecordEvent("runtime_service_start_failed", map[string]any{"error": err.Error()})
		_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, err)
		return a.session.Manifest.RuntimeService
	}
	if a.session.LaunchOptions().Mode == "live" {
		if gatewayRecord, gatewayErr := nativeapp.EnsureGatewayService(a.session.LaunchOptions(), a.session); gatewayErr != nil {
			_ = a.session.RecordEvent("gateway_service_start_failed", map[string]any{"error": gatewayErr.Error()})
			_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, gatewayErr)
		} else {
			_ = a.session.RecordEvent("gateway_service_started_from_ui", map[string]any{
				"state":  gatewayRecord.State,
				"health": gatewayRecord.Health,
			})
		}
	}
	_ = a.session.UpdateLauncherState("ready")
	_ = a.session.RecordEvent("runtime_service_started_from_ui", map[string]any{
		"state":  record.State,
		"health": record.Health,
	})
	return record
}

func (a *App) NativeRuntimeServiceStop() nativeapp.RuntimeServiceRecord {
	record, err := nativeapp.StopRuntimeService(a.session.LaunchOptions(), a.session)
	if err != nil {
		_ = a.session.RecordEvent("runtime_service_stop_failed", map[string]any{"error": err.Error()})
		return a.session.Manifest.RuntimeService
	}
	if gatewayRecord, gatewayErr := nativeapp.StopGatewayService(a.session.LaunchOptions(), a.session); gatewayErr != nil {
		_ = a.session.RecordEvent("gateway_service_stop_failed", map[string]any{"error": gatewayErr.Error()})
	} else {
		_ = a.session.RecordEvent("gateway_service_stopped_from_ui", map[string]any{
			"state":  gatewayRecord.State,
			"health": gatewayRecord.Health,
		})
	}
	_ = a.session.RecordEvent("runtime_service_stopped_from_ui", map[string]any{
		"state":  record.State,
		"health": record.Health,
	})
	return record
}

func (a *App) NativeRuntimeServiceRestart() nativeapp.RuntimeServiceRecord {
	record, err := nativeapp.RestartRuntimeService(a.session.LaunchOptions(), a.session)
	if err != nil {
		_ = a.session.RecordEvent("runtime_service_restart_failed", map[string]any{"error": err.Error()})
		_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, err)
		return a.session.Manifest.RuntimeService
	}
	if a.session.LaunchOptions().Mode == "live" {
		if gatewayRecord, gatewayErr := nativeapp.EnsureGatewayService(a.session.LaunchOptions(), a.session); gatewayErr != nil {
			_ = a.session.RecordEvent("gateway_service_restart_failed", map[string]any{"error": gatewayErr.Error()})
			_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, gatewayErr)
		} else {
			_ = a.session.RecordEvent("gateway_service_restarted_from_ui", map[string]any{
				"state":  gatewayRecord.State,
				"health": gatewayRecord.Health,
			})
		}
	}
	_ = a.session.UpdateLauncherState("ready")
	_ = a.session.RecordEvent("runtime_service_restarted_from_ui", map[string]any{
		"state":  record.State,
		"health": record.Health,
	})
	return record
}

func (a *App) NativeGatewayServiceSummary() nativeapp.GatewayServiceRecord {
	record, err := nativeapp.SyncGatewayServiceStatus(a.session.LaunchOptions(), a.session)
	if err != nil {
		_ = a.session.RecordEvent("gateway_service_status_failed", map[string]any{"error": err.Error()})
		return a.session.Manifest.GatewayService
	}
	return record
}

func (a *App) NativeGatewayServiceStart() nativeapp.GatewayServiceRecord {
	if a.session.LaunchOptions().Mode == "live" {
		if _, err := nativeapp.EnsureRuntimeService(a.session.LaunchOptions(), a.session); err != nil {
			_ = a.session.RecordEvent("gateway_service_runtime_dependency_failed", map[string]any{"error": err.Error()})
			_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, err)
			return a.session.Manifest.GatewayService
		}
	}
	record, err := nativeapp.StartGatewayService(a.session.LaunchOptions(), a.session)
	if err != nil {
		_ = a.session.RecordEvent("gateway_service_start_failed", map[string]any{"error": err.Error()})
		_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, err)
		return a.session.Manifest.GatewayService
	}
	_ = a.session.UpdateLauncherState("ready")
	_ = a.session.RecordEvent("gateway_service_started_from_ui", map[string]any{
		"state":  record.State,
		"health": record.Health,
	})
	return record
}

func (a *App) NativeGatewayServiceStop() nativeapp.GatewayServiceRecord {
	record, err := nativeapp.StopGatewayService(a.session.LaunchOptions(), a.session)
	if err != nil {
		_ = a.session.RecordEvent("gateway_service_stop_failed", map[string]any{"error": err.Error()})
		return a.session.Manifest.GatewayService
	}
	_ = a.session.RecordEvent("gateway_service_stopped_from_ui", map[string]any{
		"state":  record.State,
		"health": record.Health,
	})
	return record
}

func (a *App) NativeGatewayServiceRestart() nativeapp.GatewayServiceRecord {
	if a.session.LaunchOptions().Mode == "live" {
		if _, err := nativeapp.EnsureRuntimeService(a.session.LaunchOptions(), a.session); err != nil {
			_ = a.session.RecordEvent("gateway_service_runtime_dependency_failed", map[string]any{"error": err.Error()})
			_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, err)
			return a.session.Manifest.GatewayService
		}
	}
	record, err := nativeapp.RestartGatewayService(a.session.LaunchOptions(), a.session)
	if err != nil {
		_ = a.session.RecordEvent("gateway_service_restart_failed", map[string]any{"error": err.Error()})
		_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, err)
		return a.session.Manifest.GatewayService
	}
	_ = a.session.UpdateLauncherState("ready")
	_ = a.session.RecordEvent("gateway_service_restarted_from_ui", map[string]any{
		"state":  record.State,
		"health": record.Health,
	})
	return record
}
