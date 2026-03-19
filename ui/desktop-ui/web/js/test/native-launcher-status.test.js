import test from "node:test";
import assert from "node:assert/strict";

import { renderNativeLauncherStatus } from "../shell/topbar/native-launcher-status.js";

test("native launcher status renders ready mock launcher details", () => {
  const html = renderNativeLauncherStatus({
    launcherState: "ready",
    mode: "mock",
    runtimeState: "mock_active",
    runtimeProcessMode: "mock_only",
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
});

test("native launcher status renders degraded launcher failure details", () => {
  const html = renderNativeLauncherStatus({
    launcherState: "degraded",
    mode: "live",
    runtimeState: "port_forward_failed",
    runtimeProcessMode: "kubectl_port_forward",
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
  assert.match(html, /runtime=port_forward_failed/);
  assert.match(html, /Startup error:/);
  assert.match(html, /runtime health endpoint did not become ready/);
});
