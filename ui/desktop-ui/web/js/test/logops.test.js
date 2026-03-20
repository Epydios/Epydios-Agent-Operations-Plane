import test from "node:test";
import assert from "node:assert/strict";

import { createLogOpsSnapshot } from "../domains/logops/state.js";
import { renderLogOpsWorkspace } from "../domains/logops/panels/workspace.js";

test("logops snapshot keeps only the relevant native logs and session artifacts", () => {
  const snapshot = createLogOpsSnapshot({
    nativeShell: {
      mode: "live",
      launcherState: "ready",
      runtimeState: "service_running",
      startupError: "",
      eventLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/session-events.jsonl",
      uiLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/ui-shell.log",
      runtimeLogPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/logs/runtime-process.log",
      sessionManifestPath: "/Users/demo/Library/Caches/EpydiosAgentOpsDesktop/native-shell/session.json",
      runtimeService: {
        state: "running",
        logPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-service/runtime-service.log"
      },
      gatewayService: {
        state: "running",
        logPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-service.log"
      },
      bootstrapConfigPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/runtime-bootstrap.json",
      gatewayTokenPath: "/Users/demo/Library/Application Support/EpydiosAgentOpsDesktop/localhost-gateway/gateway-token"
    }
  });

  assert.equal(snapshot.entries.length, 6);
  assert.deepEqual(
    snapshot.entries.map((entry) => entry.id),
    [
      "session-events",
      "ui-shell",
      "runtime-process",
      "runtime-service",
      "gateway-service",
      "session-manifest"
    ]
  );
});

test("logops workspace renders open actions for relevant artifacts only", () => {
  const html = renderLogOpsWorkspace({
    mode: "mock",
    launcherState: "ready",
    runtimeState: "mock_active",
    runtimeServiceState: "mock_only",
    gatewayServiceState: "stopped",
    entries: [
      {
        id: "session-events",
        title: "Session Event Log",
        purpose: "Lifecycle events",
        path: "/tmp/session-events.jsonl"
      },
      {
        id: "gateway-service",
        title: "Gateway Service Log",
        purpose: "Gateway traffic",
        path: "/tmp/gateway.log"
      }
    ]
  });

  assert.match(html, /Native Logs And Session Artifacts/);
  assert.match(html, /Relevant Paths/);
  assert.match(html, /data-logops-action="open-path"/);
  assert.match(html, /Session Event Log/);
  assert.match(html, /Gateway Service Log/);
  assert.doesNotMatch(html, /Gateway Token/);
  assert.doesNotMatch(html, /Bootstrap Config/);
});
