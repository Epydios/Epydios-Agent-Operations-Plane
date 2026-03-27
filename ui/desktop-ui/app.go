//go:build m15native

package main

import (
	"context"
	"path/filepath"
	"strings"

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

func (a *App) NativeShellStatusRefresh() (nativeapp.SessionManifest, error) {
	opts := a.session.LaunchOptions()
	if _, err := nativeapp.SyncRuntimeServiceStatus(opts, a.session); err != nil {
		_ = a.session.RecordEvent("native_shell_runtime_status_refresh_failed", map[string]any{"error": err.Error()})
		return a.session.Manifest, err
	}
	if _, err := nativeapp.SyncGatewayServiceStatus(opts, a.session); err != nil {
		_ = a.session.RecordEvent("native_shell_gateway_status_refresh_failed", map[string]any{"error": err.Error()})
		return a.session.Manifest, err
	}
	nextLauncherState := nativeapp.RecommendedLauncherState(a.session.Manifest)
	if nextLauncherState != a.session.Manifest.LauncherState {
		if err := a.session.UpdateLauncherState(nextLauncherState); err != nil {
			_ = a.session.RecordEvent("native_shell_launcher_state_refresh_failed", map[string]any{
				"error":         err.Error(),
				"launcherState": nextLauncherState,
			})
			return a.session.Manifest, err
		}
	}
	return a.session.Manifest, nil
}

func (a *App) NativeBridgeHealthReport(missingBindings []string, reason string) (nativeapp.SessionManifest, error) {
	if err := a.session.UpdateBridgeHealth(missingBindings, reason); err != nil {
		_ = a.session.RecordEvent("native_bridge_health_report_failed", map[string]any{
			"error":           err.Error(),
			"missingBindings": missingBindings,
		})
		return a.session.Manifest, err
	}
	_ = a.session.RecordEvent("native_bridge_health_reported", map[string]any{
		"missingBindings": missingBindings,
		"bridgeHealth":    a.session.Manifest.BridgeHealth,
	})
	return a.session.Manifest, nil
}

func (a *App) NativeOpenPath(path string) error {
	return nativeapp.OpenPath(a.session.Manifest, path)
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
	_ = a.session.UpdateLauncherState("recovering")
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
	_ = a.session.UpdateLauncherState("recovering")
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
	_ = a.session.UpdateLauncherState("recovering")
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
	_ = a.session.UpdateLauncherState("recovering")
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

func (a *App) NativeInterpositionConfigure(enabled bool, upstreamBaseURL string, upstreamBearerToken string) (nativeapp.SessionManifest, error) {
	previousOpts := a.session.LaunchOptions()
	currentEnabled := previousOpts.InterpositionEnabled
	transitioning := currentEnabled != enabled
	transitionStatus := ""
	transitionReason := ""
	if transitioning {
		if enabled {
			transitionStatus = "starting"
			transitionReason = "Turning interposition on. Epydios is getting ready to govern supported requests."
		} else {
			transitionStatus = "stopping"
			transitionReason = "Turning interposition off. Supported requests are returning to their normal client flow."
		}
		if err := a.session.BeginInterpositionTransition(currentEnabled, enabled, transitionStatus, transitionReason); err != nil {
			_ = a.session.RecordEvent("interposition_transition_failed", map[string]any{
				"error":   err.Error(),
				"enabled": enabled,
				"status":  transitionStatus,
			})
			return a.session.Manifest, err
		}
	}
	resetTransition := func() {
		if !transitioning {
			return
		}
		_ = a.session.ClearInterpositionTransition()
	}
	_ = a.session.RecordEvent("interposition_config_apply_started", map[string]any{
		"enabled":                       enabled,
		"upstreamBaseUrl":               strings.TrimSpace(upstreamBaseURL),
		"upstreamBearerTokenConfigured": strings.TrimSpace(upstreamBearerToken) != "" && strings.TrimSpace(upstreamBearerToken) != "__EPYDIOS_CLEAR_INTERPOSITION_BEARER__",
		"transitionStatus":              transitionStatus,
	})
	if err := a.session.UpdateInterpositionConfig(enabled, upstreamBaseURL, upstreamBearerToken); err != nil {
		resetTransition()
		_ = a.session.RecordEvent("interposition_config_update_failed", map[string]any{
			"error":   err.Error(),
			"enabled": enabled,
		})
		return a.session.Manifest, err
	}
	opts := a.session.LaunchOptions()
	configChanged := previousOpts.InterpositionEnabled != opts.InterpositionEnabled ||
		previousOpts.InterpositionUpstreamBaseURL != opts.InterpositionUpstreamBaseURL ||
		previousOpts.InterpositionUpstreamBearerToken != opts.InterpositionUpstreamBearerToken
	if opts.Mode == "live" {
		if _, err := nativeapp.EnsureRuntimeService(opts, a.session); err != nil {
			resetTransition()
			_ = a.session.RecordEvent("interposition_runtime_dependency_failed", map[string]any{
				"error":   err.Error(),
				"enabled": enabled,
			})
			_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, err)
			return a.session.Manifest, err
		}
		if configChanged {
			if _, err := nativeapp.RestartGatewayService(opts, a.session); err != nil {
				resetTransition()
				_ = a.session.RecordEvent("interposition_gateway_restart_failed", map[string]any{
					"error":   err.Error(),
					"enabled": enabled,
				})
				_ = a.session.RecordStartupFailure(a.session.Manifest.RuntimeState, err)
				return a.session.Manifest, err
			}
		} else if _, err := nativeapp.SyncGatewayServiceStatus(opts, a.session); err != nil {
			resetTransition()
			_ = a.session.RecordEvent("interposition_gateway_status_failed", map[string]any{
				"error":   err.Error(),
				"enabled": enabled,
			})
			return a.session.Manifest, err
		}
	}
	if _, err := nativeapp.SyncGatewayServiceStatus(opts, a.session); err != nil {
		resetTransition()
		_ = a.session.RecordEvent("interposition_gateway_status_failed", map[string]any{
			"error":   err.Error(),
			"enabled": enabled,
		})
		return a.session.Manifest, err
	}
	if transitioning {
		if err := a.session.ClearInterpositionTransition(); err != nil {
			_ = a.session.RecordEvent("interposition_transition_clear_failed", map[string]any{
				"error":   err.Error(),
				"enabled": enabled,
			})
			return a.session.Manifest, err
		}
		transitioning = false
	}
	_ = a.session.UpdateLauncherState("ready")
	_ = a.session.RecordEvent("interposition_config_updated", map[string]any{
		"enabled":                       enabled,
		"upstreamBaseUrl":               a.session.LaunchOptions().InterpositionUpstreamBaseURL,
		"upstreamBearerTokenConfigured": strings.TrimSpace(a.session.LaunchOptions().InterpositionUpstreamBearerToken) != "",
		"gatewayState":                  a.session.Manifest.GatewayService.State,
		"gatewayHealth":                 a.session.Manifest.GatewayService.Health,
	})
	return a.session.Manifest, nil
}

func (a *App) NativeGatewayHoldList() []nativeapp.GatewayHoldRecord {
	items, err := nativeapp.ListGatewayHoldRecords(nativeappGatewayHoldsRoot(a.session))
	if err != nil {
		_ = a.session.RecordEvent("gateway_hold_list_failed", map[string]any{"error": err.Error()})
		return []nativeapp.GatewayHoldRecord{}
	}
	return items
}

func (a *App) NativeGatewayHoldResolve(interpositionRequestID string, decision string, reason string) nativeapp.GatewayHoldRecord {
	record, err := nativeapp.ResolveGatewayHoldRecord(
		nativeappGatewayHoldsRoot(a.session),
		a.session.Manifest.Paths.GatewayRequestsRoot,
		interpositionRequestID,
		decision,
		reason,
	)
	if err != nil {
		_ = a.session.RecordEvent("gateway_hold_resolve_failed", map[string]any{
			"error":                  err.Error(),
			"interpositionRequestId": interpositionRequestID,
			"decision":               decision,
		})
		return nativeapp.GatewayHoldRecord{}
	}
	_ = a.session.RecordEvent("gateway_hold_resolved", map[string]any{
		"interpositionRequestId": interpositionRequestID,
		"gatewayRequestId":       record.GatewayRequestID,
		"runId":                  record.RunID,
		"approvalId":             record.ApprovalID,
		"decision":               record.Decision,
		"state":                  record.State,
	})
	return record
}

func nativeappGatewayHoldsRoot(session *nativeapp.Session) string {
	return filepath.Join(session.Manifest.Paths.GatewayRoot, "holds")
}
