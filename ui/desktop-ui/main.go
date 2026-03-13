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

	session, err := nativeapp.PrepareSession(embeddedWeb, opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "prepare native session: %v\n", err)
		os.Exit(1)
	}

	runtimeProcess, err := nativeapp.StartRuntimeProcess(opts, session)
	if err != nil {
		_ = session.RecordEvent("runtime_start_failed", map[string]any{"error": err.Error()})
		fmt.Fprintf(os.Stderr, "start runtime process: %v\n", err)
		os.Exit(1)
	}
	if runtimeProcess != nil {
		_ = session.UpdateRuntimeState("port_forward_active")
		_ = session.RecordEvent("runtime_started", map[string]any{
			"runtimeApiBaseUrl": session.Manifest.RuntimeAPIBaseURL,
			"logPath":           session.Manifest.Paths.RuntimeLogPath,
		})
	}

	app := NewApp(session, runtimeProcess)
	err = wails.Run(&options.App{
		Title:              "EpydiosOps Desktop",
		Width:              1440,
		Height:             960,
		MinWidth:           1180,
		MinHeight:          760,
		AssetServer:        &assetserver.Options{Assets: os.DirFS(session.Manifest.Paths.WebDir)},
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
