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
    interposition: {
      enabled: false,
      effective: false,
      status: "off",
      reason: "Interposition is OFF. Epydios is not governing supported requests.",
      upstreamBaseUrl: "",
      upstreamBearerTokenConfigured: false,
      upstreamAuthMode: "client_passthrough"
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
  assert.match(html, /Technical status/);
  assert.match(html, /mode=mock/);
  assert.match(html, /runtime=mock_active/);
  assert.match(html, /process=mock_only/);
  assert.match(html, /bootstrap=loaded/);
  assert.match(html, /bridge=unknown/);
  assert.match(html, /Bootstrap config loaded/);
  assert.match(html, /Background service not required/);
  assert.match(html, /Gateway stopped/);
  assert.match(html, /Interposition OFF \/ ON/);
  assert.match(html, /Interposition off/);
  assert.match(html, /Client credential passthrough/);
  assert.match(html, /Turn Interposition ON/);
  assert.match(html, /Upstream Base URL/);
  assert.match(html, /Upstream Auth/);
  assert.match(html, /Use credentials already present in the client request/);
  assert.match(html, /native-launcher-status-switch-callout is-off/);
  assert.match(html, /https:\/\/api\.openai\.com\/v1/);
  assert.doesNotMatch(html, /Session Manifest/);
  assert.doesNotMatch(html, /Gateway Token/);
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
    interposition: {
      enabled: true,
      effective: false,
      status: "gateway_unavailable",
      reason: "Interposition is ON, but Epydios is still getting ready.",
      upstreamBaseUrl: "https://api.openai.com",
      upstreamBearerTokenConfigured: true,
      upstreamAuthMode: "saved_token"
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
  assert.match(html, /Technical status/);
  assert.match(html, /mode=live/);
  assert.match(html, /runtime=service_failed/);
  assert.match(html, /Startup error:/);
  assert.match(html, /runtime health endpoint did not become ready/);
  assert.match(html, /Background service failed/);
  assert.match(html, /health=unreachable/);
  assert.match(html, /Gateway degraded/);
  assert.match(html, /gateway=unreachable/);
  assert.match(html, /bridge=unknown/);
  assert.match(html, /Gateway not ready/);
  assert.match(html, /Saved token override/);
  assert.match(html, /Turn Interposition OFF/);
  assert.match(html, /native-launcher-status-switch-callout is-pending/);
  assert.match(html, /https:\/\/api\.openai\.com/);
});

test("native launcher status renders interposition transition feedback", () => {
  const html = renderNativeLauncherStatus({
    launcherState: "recovering",
    bridgeHealth: "healthy",
    mode: "live",
    runtimeState: "service_running",
    runtimeProcessMode: "background_supervisor",
    runtimeService: {
      state: "starting",
      health: "starting"
    },
    gatewayService: {
      state: "starting",
      health: "starting"
    },
    interposition: {
      enabled: true,
      effective: false,
      status: "starting",
      reason: "Turning interposition on. Epydios is getting ready to govern supported requests.",
      upstreamBaseUrl: "https://api.openai.com/v1",
      upstreamBearerTokenConfigured: false,
      upstreamAuthMode: "client_passthrough"
    },
    bootstrapConfigState: "loaded"
  });

  assert.match(html, /Launcher recovering/);
  assert.match(html, /Background service starting/);
  assert.match(html, /Gateway starting/);
  assert.match(html, /Interposition starting/);
  assert.match(html, /bridge=healthy/);
  assert.match(html, /Turning Interposition ON\.\.\./);
  assert.match(html, /native-launcher-status-switch-callout is-pending/);
  assert.match(html, /disabled/);
});

test("native launcher status locks interposition controls when the bridge is degraded", () => {
  const html = renderNativeLauncherStatus({
    launcherState: "degraded",
    bridgeHealth: "degraded",
    bridgeMissingBindings: ["NativeInterpositionConfigure", "NativeRuntimeServiceRestart"],
    mode: "live",
    runtimeState: "service_running",
    runtimeProcessMode: "background_supervisor",
    runtimeService: {
      state: "running",
      health: "healthy"
    },
    gatewayService: {
      state: "running",
      health: "healthy"
    },
    interposition: {
      enabled: true,
      effective: true,
      status: "on",
      reason: "Interposition is ON. Epydios is governing supported requests.",
      upstreamBaseUrl: "https://api.openai.com/v1",
      upstreamBearerTokenConfigured: false,
      upstreamAuthMode: "client_passthrough"
    },
    startupError: "Native bridge missing required bindings: NativeInterpositionConfigure, NativeRuntimeServiceRestart",
    bootstrapConfigState: "loaded"
  });

  assert.match(html, /Launcher degraded/);
  assert.match(html, /Native bridge missing required bindings/);
  assert.match(html, /bridge=degraded/);
  assert.match(html, /Native launcher bindings are degraded: NativeInterpositionConfigure, NativeRuntimeServiceRestart/);
  assert.match(html, /data-native-shell-action="toggle-interposition"/);
  assert.match(html, /data-native-shell-action="save-interposition-config"/);
  assert.match(html, /disabled/);
});
