import { escapeHTML } from "../views/common.js";
import { renderAimxsProbeMetric as renderAimxsProbeMetricInternal } from "./probe.js";
import {
  collectAimxsSecureRefItems,
  describeAimxsSettingsMessage,
  normalizeAimxsActivationSnapshot,
  normalizeAimxsMode,
  resolveAimxsContractProfile
} from "./state.js";

function chipClassForAimxsActivationState(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "active" || state === "ready") {
    return "chip chip-ok chip-compact";
  }
  if (state === "pending" || state === "degraded") {
    return "chip chip-warn chip-compact";
  }
  if (state === "unavailable" || state === "error") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

export function collectAimxsKnownLocalSecureRefs(settings) {
  return collectAimxsSecureRefItems(settings);
}

export function renderAimxsProbeMetric(viewState = {}, activation = {}) {
  return renderAimxsProbeMetricInternal(viewState, activation);
}

export function renderAimxsStatusMetric(settings, chipClassForEndpointState) {
  const aimxs = settings?.aimxs || {};
  const state = String(aimxs.state || "unknown").trim().toLowerCase();
  const providerIDs = Array.isArray(aimxs.providerIds) ? aimxs.providerIds : [];
  return `
    <div class="metric settings-metric settings-metric-aimxs-provider">
      <div class="title">AIMXS Provider Status</div>
      <div class="meta">
        <span class="${chipClassForEndpointState(state)}">${escapeHTML(state)}</span>
      </div>
      <div class="meta">${escapeHTML(aimxs.detail || "-")}</div>
      <div class="meta">providerIds=${escapeHTML(providerIDs.length > 0 ? providerIDs.join(", ") : "-")}</div>
    </div>
  `;
}

export function renderAimxsSettingsMetric(
  settings,
  viewState = {},
  { chipClassForEditorStatus, selectedAttr } = {}
) {
  const aimxs = settings?.aimxs || {};
  const aimxsMode = normalizeAimxsMode(aimxs.mode, "oss-only");
  const contract = resolveAimxsContractProfile(aimxs);
  const activation = normalizeAimxsActivationSnapshot(aimxs.activation);
  const aimxsProviderState = String(aimxs.state || "unknown").trim().toLowerCase();
  const aimxsPaymentEntitled = Boolean(aimxs.paymentEntitled);
  const aimxsProviderIds = Array.isArray(aimxs.providerIds) ? aimxs.providerIds : [];
  const aimxsEditor = viewState?.aimxsEditor || {};
  const aimxsEditorStatus = String(aimxsEditor.status || "clean").trim().toLowerCase();
  const aimxsStatusChipClass =
    typeof chipClassForEditorStatus === "function"
      ? chipClassForEditorStatus(aimxsEditorStatus)
      : "";
  const aimxsStatusMessage = describeAimxsSettingsMessage(aimxs, aimxsEditor.message);
  const activationCapabilities =
    activation.capabilities.length > 0 ? activation.capabilities.join(", ") : "-";
  const activationEnabledProviders =
    activation.enabledProviders.length > 0
      ? activation.enabledProviders
          .map((item) => `${item.mode}:${item.providerId || item.name}@${item.priority}`)
          .join(", ")
      : "-";
  const activationWarnings =
    activation.warnings.length > 0
      ? activation.warnings
          .map((item) => `<div class="meta settings-editor-warn">${escapeHTML(item)}</div>`)
          .join("")
      : "";
  const activationMode = activation.activeMode === "unknown" ? "-" : activation.activeMode;
  const activationSelectedProvider = activation.selectedProviderId || activation.selectedProviderName || "-";
  const activationSecretsSummary =
    aimxsMode === "aimxs-full"
      ? "clusterSecrets=not required for aimxs-full"
      : aimxsMode === "oss-only"
        ? "clusterSecrets=not required in oss-only"
        : `clusterSecrets=bearer:${activation.secrets.bearerTokenSecret.present ? "present" : "missing"}; clientTLS:${activation.secrets.clientTlsSecret.present ? "present" : "missing"}; providerCA:${activation.secrets.caSecret.present ? "present" : "missing"}`;

  return `
    <div class="metric settings-metric settings-metric-aimxs-config">
      <div class="title">AIMXS Deployment Contract</div>
      <div class="meta">mode=${escapeHTML(contract.deploymentLabel)}; entitlement=${escapeHTML(aimxsPaymentEntitled ? "active" : "locked")}; providerState=${escapeHTML(aimxsProviderState)}; providers=${escapeHTML(aimxsProviderIds.length > 0 ? aimxsProviderIds.join(", ") : "-")}</div>
      <div class="meta">providerId=${escapeHTML(contract.providerId)}; authMode=${escapeHTML(contract.authMode)}; contractVersion=${escapeHTML(contract.contractVersion)}; healthPath=${escapeHTML(contract.healthPath)}; capabilitiesPath=${escapeHTML(contract.capabilitiesPath)}</div>
      <div class="meta">${escapeHTML(contract.summary)}</div>
      <div class="meta">
        <span class="${chipClassForAimxsActivationState(activation.state)}">${escapeHTML(activation.state || "unknown")}</span>
        clusterMode=${escapeHTML(activationMode)};
        selectedPolicyProvider=${escapeHTML(activationSelectedProvider)};
        namespace=${escapeHTML(activation.namespace || "-")}
      </div>
      <div class="meta">activationCapabilities=${escapeHTML(activationCapabilities)}; enabledProviders=${escapeHTML(activationEnabledProviders)}</div>
      <div class="meta">${escapeHTML(activationSecretsSummary)}</div>
      <div class="settings-editor-grid">
        <label class="field">
          <span class="label">Deployment Mode</span>
          <select id="settings-aimxs-mode" class="filter-input" data-settings-aimxs-field="mode">
            <option value="oss-only" ${typeof selectedAttr === "function" ? selectedAttr(aimxsMode, "oss-only") : ""}>oss-only</option>
            <option value="aimxs-full" ${typeof selectedAttr === "function" ? selectedAttr(aimxsMode, "aimxs-full") : ""}>aimxs-full</option>
            <option value="aimxs-https" ${typeof selectedAttr === "function" ? selectedAttr(aimxsMode, "aimxs-https") : ""}>aimxs-https</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Endpoint Ref</span>
          <input id="settings-aimxs-endpoint-ref" class="filter-input" type="text" data-settings-aimxs-field="endpointRef" value="${escapeHTML(String(aimxs.endpointRef || "-"))}" />
        </label>
        <label class="field">
          <span class="label">Bearer Token Ref</span>
          <input id="settings-aimxs-bearer-token-ref" class="filter-input" type="text" data-settings-aimxs-field="bearerTokenRef" value="${escapeHTML(String(aimxs.bearerTokenRef || "-"))}" />
        </label>
        <label class="field">
          <span class="label">Controller Client TLS Cert Ref</span>
          <input id="settings-aimxs-client-tls-cert-ref" class="filter-input" type="text" data-settings-aimxs-field="clientTlsCertRef" value="${escapeHTML(String(aimxs.clientTlsCertRef || aimxs.mtlsCertRef || "-"))}" />
        </label>
        <label class="field">
          <span class="label">Controller Client TLS Key Ref</span>
          <input id="settings-aimxs-client-tls-key-ref" class="filter-input" type="text" data-settings-aimxs-field="clientTlsKeyRef" value="${escapeHTML(String(aimxs.clientTlsKeyRef || aimxs.mtlsKeyRef || "-"))}" />
        </label>
        <label class="field">
          <span class="label">Provider CA Ref</span>
          <input id="settings-aimxs-ca-cert-ref" class="filter-input" type="text" data-settings-aimxs-field="caCertRef" value="${escapeHTML(String(aimxs.caCertRef || aimxs.caBundleRef || "-"))}" />
        </label>
      </div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary" type="button" data-settings-aimxs-action="apply">Apply AIMXS Settings</button>
          </div>
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary" type="button" data-settings-aimxs-action="activate">Activate AIMXS Mode</button>
            <button class="btn btn-secondary btn-small" type="button" data-settings-aimxs-action="refresh-activation">Refresh Activation Status</button>
          </div>
        </div>
        <span id="settings-aimxs-status-chip" class="${aimxsStatusChipClass}">${escapeHTML(aimxsEditorStatus || "clean")}</span>
      </div>
      <div id="settings-aimxs-feedback" class="stack" role="status" aria-live="polite" aria-atomic="true">
        <div class="meta">${escapeHTML(aimxsStatusMessage)}</div>
        <div class="meta">Apply AIMXS Settings saves the Desktop contract draft only. Activate AIMXS Mode switches the live desktop/runtime policy-provider path.</div>
        <div class="meta"><code>aimxs-https</code> requires endpoint, bearer token, controller client TLS cert/key, and provider CA refs.</div>
        <div class="meta"><code>aimxs-full</code> uses the live launcher AIMXS provider shim with no HTTPS or mTLS requirement.</div>
        <div class="meta">${escapeHTML(activation.message || "Run Activate AIMXS Mode to apply the current contract to the live provider selection boundary.")}</div>
        ${activationWarnings}
      </div>
    </div>
  `;
}
