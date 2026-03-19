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
  const mode = normalizeValue(shell.mode, "unknown");
  const bootstrapState = normalizeValue(shell.bootstrapConfigState, "unknown");
  const startupError = String(shell.startupError || "").trim();
  const copy = startupError
    ? "The native launcher opened in a degraded state. Review the diagnostics below before retrying the live path."
    : `${describeLauncherState(launcherState)}. ${describeBootstrapState(bootstrapState)}`;

  return `
    <div class="native-launcher-status-summary">
      <span class="native-launcher-status-badge">Native Launcher</span>
      <span class="chip chip-compact ${launcherState === "degraded" ? "chip-danger" : launcherState === "ready" ? "chip-success" : "chip-neutral"}">${escapeHTML(describeLauncherState(launcherState))}</span>
      <span class="chip chip-neutral chip-compact">mode=${escapeHTML(mode)}</span>
      <span class="chip chip-neutral chip-compact">runtime=${escapeHTML(runtimeState)}</span>
      <span class="chip chip-neutral chip-compact">process=${escapeHTML(runtimeProcessMode)}</span>
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
      ${renderPathItem("Crash Root", shell.crashDir)}
    </div>
  `;
}
