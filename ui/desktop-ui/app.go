//go:build m15native

package main

import (
	"context"

	"github.com/Epydios/Epydios-AgentOps-Control-Plane/ui/desktop-ui/internal/nativeapp"
)

type App struct {
	ctx            context.Context
	session        *nativeapp.Session
	runtimeProcess *nativeapp.RuntimeProcess
}

func NewApp(session *nativeapp.Session, runtimeProcess *nativeapp.RuntimeProcess) *App {
	return &App{
		session:        session,
		runtimeProcess: runtimeProcess,
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
		"webDir":             a.session.Manifest.Paths.WebDir,
		"runtimeProcessMode": a.session.Manifest.RuntimeProcessMode,
		"mode":               a.session.Manifest.Mode,
	})
}

func (a *App) shutdown(ctx context.Context) {
	_ = a.session.RecordEvent("native_window_shutdown", map[string]any{
		"runtimeState": a.session.Manifest.RuntimeState,
	})
	if a.runtimeProcess != nil {
		_ = a.runtimeProcess.Stop()
		_ = a.session.UpdateRuntimeState("port_forward_stopped")
	}
}

func (a *App) NativeSessionSummary() nativeapp.SessionManifest {
	return a.session.Manifest
}
