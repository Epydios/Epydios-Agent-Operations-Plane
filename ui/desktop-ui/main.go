//go:build m15native

package main

import (
	"embed"
	"fmt"
	"os"

	"github.com/Epydios/Epydios-AgentOps-Control-Plane/ui/desktop-ui/internal/nativeapp"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/logger"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:web
var embeddedWeb embed.FS

func main() {
	opts, err := nativeapp.ParseLaunchOptions(os.Args[1:])
	if err != nil {
		fmt.Fprintf(os.Stderr, "invalid native launch options: %v\n", err)
		os.Exit(1)
	}

	if opts.GatewayServiceOnly {
		if err := nativeapp.RunGatewayService(opts); err != nil {
			fmt.Fprintf(os.Stderr, "run localhost gateway: %v\n", err)
			os.Exit(1)
		}
		return
	}

	session, err := nativeapp.PrepareSession(embeddedWeb, opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "prepare native session: %v\n", err)
		os.Exit(1)
	}

	runtimeService, err := nativeapp.EnsureRuntimeService(opts, session)
	if err != nil {
		_ = session.RecordEvent("runtime_service_start_failed", map[string]any{"error": err.Error()})
		_ = session.RecordStartupFailure(session.Manifest.RuntimeState, err)
	} else if opts.Mode == "live" {
		_ = session.RecordEvent("runtime_service_ready", map[string]any{
			"runtimeApiBaseUrl": runtimeService.RuntimeAPIBaseURL,
			"logPath":           runtimeService.LogPath,
			"statusPath":        runtimeService.StatusPath,
			"state":             runtimeService.State,
			"health":            runtimeService.Health,
		})
	}
	gatewayService, gatewayErr := nativeapp.SyncGatewayServiceStatus(opts, session)
	if gatewayErr != nil {
		_ = session.RecordEvent("gateway_service_status_failed", map[string]any{"error": gatewayErr.Error()})
		_ = session.RecordStartupFailure(session.Manifest.RuntimeState, gatewayErr)
	} else if opts.Mode == "live" && err == nil {
		gatewayService, gatewayErr = nativeapp.EnsureGatewayService(opts, session)
		if gatewayErr != nil {
			_ = session.RecordEvent("gateway_service_start_failed", map[string]any{"error": gatewayErr.Error()})
			_ = session.RecordStartupFailure(session.Manifest.RuntimeState, gatewayErr)
		}
	}
	if gatewayErr == nil {
		_ = session.RecordEvent("gateway_service_ready", map[string]any{
			"gatewayBaseUrl": gatewayService.BaseURL,
			"logPath":        gatewayService.LogPath,
			"statusPath":     gatewayService.StatusPath,
			"tokenPath":      gatewayService.TokenPath,
			"state":          gatewayService.State,
			"health":         gatewayService.Health,
		})
	}
	if session.Manifest.LauncherState != "degraded" {
		_ = session.UpdateLauncherState("ready")
	}

	app := NewApp(session)
	err = wails.Run(&options.App{
		Title:     "EpydiosOps Desktop",
		Width:     1440,
		Height:    960,
		MinWidth:  1180,
		MinHeight: 760,
		AssetServer: &assetserver.Options{
			Assets:  os.DirFS(session.Manifest.Paths.WebDir),
			Handler: nativeapp.NewNativeAssetHandler(session),
		},
		BackgroundColour:   options.NewRGB(248, 246, 240),
		Logger:             logger.NewFileLogger(session.Manifest.Paths.UILogPath),
		LogLevel:           logger.INFO,
		LogLevelProduction: logger.INFO,
		OnStartup:          app.startup,
		OnDomReady:         app.domReady,
		OnShutdown:         app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		_ = session.RecordEvent("wails_run_failed", map[string]any{"error": err.Error()})
		fmt.Fprintf(os.Stderr, "run native shell: %v\n", err)
		os.Exit(1)
	}
}
