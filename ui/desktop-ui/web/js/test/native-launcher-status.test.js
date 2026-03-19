import test from "node:test";
import assert from "node:assert/strict";

import { renderNativeLauncherStatus } from "../shell/topbar/native-launcher-status.js";

test("native launcher status renders ready mock launcher details", () => {
  const html = renderNativeLauncherStatus({
    launcherState: "ready",
    mode: "mock",
    runtimeState: "mock_active",
    runtimeProcessMode: "mock_only",
    runtimeService: {
      state: "mock_only",
      health: "not_required",
      statusPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-service/runtime-service.json",
      pidPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-service/runtime-service.pid",
      logPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-service/runtime-service.log"
    },
    gatewayService: {
      state: "stopped",
      health: "unknown",
      statusPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-service.json",
      pidPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-service.pid",
      logPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-service.log",
      tokenPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-token",
      requestsRoot: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/requests"
    },
    bootstrapConfigState: "loaded",
    bootstrapConfigPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-bootstrap.json",
    sessionManifestPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/session.json",
    eventLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/session-events.jsonl",
    uiLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/ui-shell.log",
    runtimeLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/runtime-process.log",
    crashDir: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/crashdumps"
  });

  assert.match(html, /Native Launcher/);
  assert.match(html, /Launcher ready/);
  assert.match(html, /mode=mock/);
  assert.match(html, /runtime=mock_active/);
  assert.match(html, /process=mock_only/);
  assert.match(html, /Bootstrap config loaded/);
  assert.match(html, /Session Manifest/);
  assert.match(html, /Runtime Log/);
  assert.match(html, /Background service not required/);
  assert.match(html, /Service Status/);
  assert.match(html, /Gateway stopped/);
  assert.match(html, /Gateway Status/);
  assert.match(html, /Gateway Token/);
});

test("native launcher status renders degraded launcher failure details", () => {
  const html = renderNativeLauncherStatus({
    launcherState: "degraded",
    mode: "live",
    runtimeState: "service_failed",
    runtimeProcessMode: "background_supervisor",
    runtimeService: {
      state: "failed",
      health: "unreachable",
      statusPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-service/runtime-service.json",
      pidPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-service/runtime-service.pid",
      logPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-service/runtime-service.log"
    },
    gatewayService: {
      state: "degraded",
      health: "unreachable",
      statusPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-service.json",
      pidPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-service.pid",
      logPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-service.log",
      tokenPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-token",
      requestsRoot: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/requests"
    },
    bootstrapConfigState: "loaded",
    bootstrapConfigPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-bootstrap.json",
    startupError: "runtime health endpoint did not become ready: http://127.0.0.1:8080/healthz",
    sessionManifestPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/session.json",
    eventLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/session-events.jsonl",
    uiLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/ui-shell.log",
    runtimeLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/runtime-process.log",
    crashDir: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/crashdumps"
  });

  assert.match(html, /Launcher degraded/);
  assert.match(html, /mode=live/);
  assert.match(html, /runtime=service_failed/);
  assert.match(html, /Startup error:/);
  assert.match(html, /runtime health endpoint did not become ready/);
  assert.match(html, /Background service failed/);
  assert.match(html, /health=unreachable/);
  assert.match(html, /Gateway degraded/);
  assert.match(html, /gateway=unreachable/);
});
