import { escapeHTML } from "../../views/common.js";

function normalizeValue(value, fallback = "-") {
  const text = String(value || "").trim();
  return text || fallback;
}

function describeLauncherState(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "ready":
      return "Launcher ready";
    case "recovering":
      return "Launcher recovering";
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

function describeBridgeHealth(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "healthy":
      return "bridge=healthy";
    case "degraded":
      return "bridge=degraded";
    default:
      return "bridge=unknown";
  }
}

function describeInterpositionStatus(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "on":
      return "Interposition active";
    case "starting":
      return "Interposition starting";
    case "stopping":
      return "Interposition stopping";
    case "warming":
      return "Interposition warming";
    case "blocked_mock_mode":
      return "Live posture required";
    case "blocked_upstream_config":
      return "Upstream config required";
    case "gateway_unavailable":
      return "Gateway not ready";
    case "off":
    default:
      return "Interposition off";
  }
}

function describeInterpositionAuthMode(mode) {
  switch (String(mode || "").trim().toLowerCase()) {
    case "saved_token":
      return "Saved token override";
    case "client_passthrough":
    default:
      return "Client credential passthrough";
  }
}

function interpositionChipClass(state) {
  switch (String(state || "").trim().toLowerCase()) {
    case "on":
      return "chip-success";
    case "starting":
    case "stopping":
    case "warming":
      return "chip-neutral";
    case "blocked_mock_mode":
    case "blocked_upstream_config":
    case "gateway_unavailable":
      return "chip-danger";
    default:
      return "chip-neutral";
  }
}

function interpositionCalloutClass(enabled, status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (["starting", "stopping", "warming"].includes(normalizedStatus)) {
    return "is-pending";
  }
  if (enabled && normalizedStatus === "on") {
    return "is-on";
  }
  if (!enabled || normalizedStatus === "off") {
    return "is-off";
  }
  return "is-pending";
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
  const interposition = shell.interposition && typeof shell.interposition === "object"
    ? shell.interposition
    : {};
  const interpositionEnabled = Boolean(interposition.enabled);
  const interpositionStatus = normalizeValue(
    interposition.status,
    interpositionEnabled ? "warming" : "off"
  ).toLowerCase();
  const interpositionReason = String(interposition.reason || "").trim();
  const interpositionBaseURL = String(interposition.upstreamBaseUrl || "https://api.openai.com/v1").trim();
  const interpositionTokenConfigured = Boolean(interposition.upstreamBearerTokenConfigured);
  const interpositionAuthMode = normalizeValue(
    interposition.upstreamAuthMode,
    interpositionTokenConfigured ? "saved_token" : "client_passthrough"
  ).toLowerCase();
  const bridgeHealth = normalizeValue(shell.bridgeHealth, "unknown").toLowerCase();
  const bridgeMissingBindings = Array.isArray(shell.bridgeMissingBindings)
    ? shell.bridgeMissingBindings.filter((value) => String(value || "").trim())
    : [];
  const interpositionBusy = ["starting", "stopping"].includes(interpositionStatus);
  const bridgeDegraded = bridgeHealth === "degraded";
  const interpositionControlsDisabled = interpositionBusy || bridgeDegraded;
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
      <span class="chip chip-compact ${serviceState === "running" ? "chip-success" : serviceState === "failed" || serviceState === "degraded" ? "chip-danger" : "chip-neutral"}">${escapeHTML(describeRuntimeServiceState(serviceState))}</span>
      <span class="chip chip-compact ${gatewayState === "running" ? "chip-success" : gatewayState === "failed" || gatewayState === "degraded" ? "chip-danger" : "chip-neutral"}">${escapeHTML(describeGatewayServiceState(gatewayState))}</span>
    </div>
    <div class="native-launcher-status-copy">${escapeHTML(copy)}</div>
    ${
      startupError
        ? `<div class="native-launcher-status-error"><strong>Startup error:</strong> ${escapeHTML(startupError)}</div>`
        : ""
    }
    <details class="details-shell native-launcher-status-details">
      <summary>Technical status</summary>
      <div class="native-launcher-status-summary native-launcher-status-summary-detail">
        <span class="chip chip-neutral chip-compact">mode=${escapeHTML(mode)}</span>
        <span class="chip chip-neutral chip-compact">runtime=${escapeHTML(runtimeState)}</span>
        <span class="chip chip-neutral chip-compact">process=${escapeHTML(runtimeProcessMode)}</span>
        <span class="chip chip-neutral chip-compact">bootstrap=${escapeHTML(bootstrapState)}</span>
        <span class="chip chip-neutral chip-compact">${escapeHTML(describeRuntimeServiceHealth(serviceHealth))}</span>
        <span class="chip chip-neutral chip-compact">${escapeHTML(describeGatewayServiceHealth(gatewayHealth))}</span>
        <span class="chip chip-neutral chip-compact">${escapeHTML(describeBridgeHealth(bridgeHealth))}</span>
        <span class="chip chip-neutral chip-compact">${escapeHTML(describeInterpositionAuthMode(interpositionAuthMode))}</span>
      </div>
    </details>
    <div class="native-launcher-status-controls">
      <div class="native-launcher-status-switch">
        <div class="title">Interposition OFF / ON</div>
        <div class="meta">OFF keeps Epydios available without sitting in path. ON routes supported requests through live governance.</div>
        <div class="native-launcher-status-switch-callout ${escapeHTML(interpositionCalloutClass(interpositionEnabled, interpositionStatus))}">
          <div class="native-launcher-status-switch-row">
            <span class="chip chip-compact ${interpositionEnabled ? "chip-success" : "chip-neutral"}">${escapeHTML(
              interpositionEnabled ? "ON" : "OFF"
            )}</span>
            <span class="chip chip-compact ${interpositionChipClass(interpositionStatus)}">${escapeHTML(
              describeInterpositionStatus(interpositionStatus)
            )}</span>
            <span class="chip chip-neutral chip-compact">${escapeHTML(describeInterpositionAuthMode(interpositionAuthMode))}</span>
          </div>
          <button
            class="btn ${interpositionEnabled ? "btn-secondary" : "btn-primary"} btn-small"
            type="button"
            data-native-shell-action="toggle-interposition"
            data-native-shell-next-enabled="${interpositionEnabled ? "false" : "true"}"
            ${interpositionControlsDisabled ? "disabled" : ""}
          >${escapeHTML(
            interpositionStatus === "starting"
              ? "Turning Interposition ON..."
              : interpositionStatus === "stopping"
                ? "Turning Interposition OFF..."
                : interpositionEnabled
                  ? "Turn Interposition OFF"
                  : "Turn Interposition ON"
          )}</button>
        </div>
        ${
          interpositionReason
            ? `<div class="meta native-launcher-status-hint">${escapeHTML(interpositionReason)}</div>`
            : ""
        }
      </div>
      <form class="native-launcher-status-config" data-native-shell-form="interposition-config">
        <label class="field">
          <span class="label">Upstream Base URL</span>
          <input
            class="filter-input"
            type="url"
            value="${escapeHTML(interpositionBaseURL)}"
            placeholder="https://api.openai.com/v1"
            data-native-shell-field="interposition-upstream-base-url"
            ${interpositionControlsDisabled ? "disabled" : ""}
            spellcheck="false"
            autocomplete="off"
          />
        </label>
        <fieldset class="native-launcher-status-auth-options">
          <legend class="label">Upstream Auth</legend>
          <label class="native-launcher-status-auth-option">
            <input
              type="radio"
              name="native-interposition-auth-mode"
              value="client_passthrough"
              data-native-shell-field="interposition-auth-mode"
              ${interpositionAuthMode === "client_passthrough" ? "checked" : ""}
              ${interpositionControlsDisabled ? "disabled" : ""}
            />
            <span>Use credentials already present in the client request</span>
          </label>
          <label class="native-launcher-status-auth-option">
            <input
              type="radio"
              name="native-interposition-auth-mode"
              value="saved_token"
              data-native-shell-field="interposition-auth-mode"
              ${interpositionAuthMode === "saved_token" ? "checked" : ""}
              ${interpositionControlsDisabled ? "disabled" : ""}
            />
            <span>Use a saved upstream bearer token override</span>
          </label>
        </fieldset>
        <label class="field">
          <span class="label">Upstream Bearer Token</span>
          <input
            class="filter-input"
            type="password"
            value=""
            placeholder="${escapeHTML(
              interpositionAuthMode === "saved_token"
                ? interpositionTokenConfigured
                  ? "Saved token is configured. Enter a new token to replace it."
                  : "Paste upstream bearer token"
                : "Client passthrough mode uses the Authorization already present in compatible client requests."
            )}"
            data-native-shell-field="interposition-upstream-bearer-token"
            ${interpositionControlsDisabled || interpositionAuthMode !== "saved_token" ? "disabled" : ""}
            spellcheck="false"
            autocomplete="off"
          />
        </label>
        <div class="native-launcher-status-actions">
          <div class="meta native-launcher-status-hint" data-native-shell-field="interposition-auth-hint">${
            escapeHTML(
              bridgeDegraded
                ? `Native launcher bindings are degraded${bridgeMissingBindings.length ? `: ${bridgeMissingBindings.join(", ")}` : ""}. Relaunch the installed shell before changing interposition controls.`
                : interpositionAuthMode === "saved_token"
                ? "Save a dedicated upstream token here when you want Epydios to override the upstream credentials."
                : "Leave saved-token mode off to forward the Authorization already present in compatible client requests."
            )
          }</div>
          <button class="btn btn-secondary btn-small" type="submit" data-native-shell-action="save-interposition-config" ${interpositionControlsDisabled ? "disabled" : ""}>Save Upstream Config</button>
        </div>
      </form>
    </div>
  `;
}
