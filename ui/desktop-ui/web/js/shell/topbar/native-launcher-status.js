import { escapeHTML } from "../../views/common.js";

function normalizeValue(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function describeLauncherState(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "ready":
      return "Launcher ready";
    case "degraded":
      return "Launcher degraded";
    case "stopped":
      return "Launcher stopped";
    case "prepared":
      return "Launcher prepared";
    default:
      return "Launcher state unknown";
  }
}

function describeBootstrapState(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "loaded":
      return "Bootstrap config loaded";
    case "missing":
      return "Bootstrap config missing; safe defaults are in use.";
    default:
      return "Bootstrap config state unknown";
  }
}

function describeRuntimeServiceState(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "running":
      return "Background service running";
    case "starting":
      return "Background service starting";
    case "degraded":
      return "Background service degraded";
    case "failed":
      return "Background service failed";
    case "stopped":
      return "Background service stopped";
    case "mock_only":
      return "Background service not required";
    default:
      return "Background service state unknown";
  }
}

function describeRuntimeServiceHealth(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "healthy":
      return "health=healthy";
    case "starting":
      return "health=starting";
    case "unreachable":
      return "health=unreachable";
    case "not_required":
      return "health=not_required";
    default:
      return "health=unknown";
  }
}

function describeGatewayServiceState(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "running":
      return "Gateway running";
    case "starting":
      return "Gateway starting";
    case "degraded":
      return "Gateway degraded";
    case "failed":
      return "Gateway failed";
    case "stopped":
      return "Gateway stopped";
    default:
      return "Gateway state unknown";
  }
}

function describeGatewayServiceHealth(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "healthy":
      return "gateway=healthy";
    case "starting":
      return "gateway=starting";
    case "unreachable":
      return "gateway=unreachable";
    default:
      return "gateway=unknown";
  }
}

function renderPathItem(label, value) {
  if (!String(value || "").trim()) {
    return "";
  }
  return `
    <div class="native-launcher-status-path">
      <div class="label">${escapeHTML(label)}</div>
      <code>${escapeHTML(String(value).trim())}</code>
    </div>
  `;
}

export function renderNativeLauncherStatus(shell = null) {
  if (!shell || typeof shell !== "object") {
    return "";
  }

  const launcherState = normalizeValue(shell.launcherState, "unknown").toLowerCase();
  const runtimeState = normalizeValue(shell.runtimeState, "unknown");
  const runtimeProcessMode = normalizeValue(shell.runtimeProcessMode, "unknown");
  const runtimeService = shell.runtimeService && typeof shell.runtimeService === "object"
    ? shell.runtimeService
    : {};
  const gatewayService = shell.gatewayService && typeof shell.gatewayService === "object"
    ? shell.gatewayService
    : {};
  const serviceState = normalizeValue(runtimeService.state, "unknown").toLowerCase();
  const serviceHealth = normalizeValue(runtimeService.health, "unknown").toLowerCase();
  const gatewayState = normalizeValue(gatewayService.state, "unknown").toLowerCase();
  const gatewayHealth = normalizeValue(gatewayService.health, "unknown").toLowerCase();
  const mode = normalizeValue(shell.mode, "unknown");
  const bootstrapState = normalizeValue(shell.bootstrapConfigState, "unknown");
  const startupError = String(shell.startupError || "").trim();
  const copy = startupError
    ? "The native launcher opened in a degraded state. Review the diagnostics below before retrying the live path."
    : mode === "live"
      ? `${describeLauncherState(launcherState)}. ${describeRuntimeServiceState(serviceState)}. ${describeGatewayServiceState(gatewayState)}. ${describeBootstrapState(bootstrapState)}`
      : `${describeLauncherState(launcherState)}. ${describeBootstrapState(bootstrapState)}`;

  return `
    <div class="native-launcher-status-summary">
      <span class="native-launcher-status-badge">Native Launcher</span>
      <span class="chip chip-compact ${launcherState === "degraded" ? "chip-danger" : launcherState === "ready" ? "chip-success" : "chip-neutral"}">${escapeHTML(describeLauncherState(launcherState))}</span>
      <span class="chip chip-neutral chip-compact">mode=${escapeHTML(mode)}</span>
      <span class="chip chip-neutral chip-compact">runtime=${escapeHTML(runtimeState)}</span>
      <span class="chip chip-neutral chip-compact">process=${escapeHTML(runtimeProcessMode)}</span>
      <span class="chip chip-compact ${serviceState === "running" ? "chip-success" : serviceState === "failed" || serviceState === "degraded" ? "chip-danger" : "chip-neutral"}">${escapeHTML(describeRuntimeServiceState(serviceState))}</span>
      <span class="chip chip-neutral chip-compact">${escapeHTML(describeRuntimeServiceHealth(serviceHealth))}</span>
      <span class="chip chip-compact ${gatewayState === "running" ? "chip-success" : gatewayState === "failed" || gatewayState === "degraded" ? "chip-danger" : "chip-neutral"}">${escapeHTML(describeGatewayServiceState(gatewayState))}</span>
      <span class="chip chip-neutral chip-compact">${escapeHTML(describeGatewayServiceHealth(gatewayHealth))}</span>
    </div>
    <div class="native-launcher-status-copy">${escapeHTML(copy)}</div>
    ${
      startupError
        ? `<div class="native-launcher-status-error"><strong>Startup error:</strong> ${escapeHTML(startupError)}</div>`
        : ""
    }
    <div class="native-launcher-status-paths">
      ${renderPathItem("Bootstrap Config", shell.bootstrapConfigPath)}
      ${renderPathItem("Session Manifest", shell.sessionManifestPath)}
      ${renderPathItem("Event Log", shell.eventLogPath)}
      ${renderPathItem("UI Log", shell.uiLogPath)}
      ${renderPathItem("Runtime Log", shell.runtimeLogPath)}
      ${renderPathItem("Service Status", runtimeService.statusPath || shell.serviceStatusPath)}
      ${renderPathItem("Service PID", runtimeService.pidPath || shell.servicePidPath)}
      ${renderPathItem("Service Log", runtimeService.logPath || shell.serviceLogPath)}
      ${renderPathItem("Gateway Status", gatewayService.statusPath || shell.gatewayStatusPath)}
      ${renderPathItem("Gateway PID", gatewayService.pidPath || shell.gatewayPidPath)}
      ${renderPathItem("Gateway Log", gatewayService.logPath || shell.gatewayLogPath)}
      ${renderPathItem("Gateway Token", gatewayService.tokenPath || shell.gatewayTokenPath)}
      ${renderPathItem("Gateway Requests", gatewayService.requestsRoot || shell.gatewayRequestsRoot)}
      ${renderPathItem("Crash Root", shell.crashDir)}
    </div>
  `;
}
