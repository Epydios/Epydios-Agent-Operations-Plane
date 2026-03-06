import { escapeHTML, formatTime } from "./common.js";

function chipClassForEndpointState(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "available" || state === "mock" || state === "ready") {
    return "chip chip-ok";
  }
  if (state === "fallback" || state === "unknown") {
    return "chip chip-warn";
  }
  return "chip chip-danger";
}

function renderEndpointMatrixRows(items) {
  return (items || [])
    .map((item) => {
      const endpointID = String(item?.id || "").trim().toLowerCase();
      const state = String(item?.state || "unknown").trim().toLowerCase() || "unknown";
      const updatedAt = item?.updatedAt ? new Date(item.updatedAt).toISOString() : "-";
      return `
        <tr data-settings-endpoint-id="${escapeHTML(endpointID)}">
          <td>${escapeHTML(item?.label || "-")}</td>
          <td><span class="${chipClassForEndpointState(state)}">${escapeHTML(state)}</span></td>
          <td>${escapeHTML(item?.path || "-")}</td>
          <td>${escapeHTML(item?.detail || "-")}</td>
          <td>${escapeHTML(updatedAt)}</td>
        </tr>
      `;
    })
    .join("");
}

function summarizeDataSource(value) {
  const source = String(value || "unknown").trim().toLowerCase();
  if (source === "runtime-endpoint") {
    return "runtime-endpoint";
  }
  if (source === "derived-runs") {
    return "derived-runs";
  }
  if (source === "mock") {
    return "mock";
  }
  if (source === "endpoint-unavailable") {
    return "endpoint-unavailable";
  }
  return source || "unknown";
}

function chipClassForProviderContractStatus(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "enabled" || state === "active") {
    return "chip chip-ok";
  }
  if (state === "planned" || state === "degraded") {
    return "chip chip-warn";
  }
  return "chip chip-danger";
}

function renderProviderContractRows(items) {
  return (items || [])
    .map((item) => {
      const selected = Boolean(item?.selected);
      return `
        <tr>
          <td>${escapeHTML(item?.label || item?.profileId || "-")}</td>
          <td>${escapeHTML(item?.provider || "-")}</td>
          <td>${escapeHTML(item?.transport || "-")}</td>
          <td>${escapeHTML(item?.model || "-")}</td>
          <td><code>${escapeHTML(item?.endpointRef || "-")}</code></td>
          <td><code>${escapeHTML(item?.credentialRef || "-")}</code></td>
          <td>${escapeHTML(item?.credentialScope || "-")}</td>
          <td>
            <span class="${chipClassForProviderContractStatus(item?.status)}">${escapeHTML(item?.status || "unknown")}</span>
            ${selected ? '<span class="chip chip-neutral chip-compact">selected</span>' : ""}
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderAgentProfileSummary(settings) {
  const integrations = settings?.integrations || {};
  const selected = String(integrations.selectedAgentProfileId || "").trim().toLowerCase();
  const profiles = Array.isArray(integrations.agentProfiles) ? integrations.agentProfiles : [];
  const activeProfile =
    profiles.find((item) => String(item?.id || "").trim().toLowerCase() === selected) || null;

  return {
    id: activeProfile?.id || selected || "-",
    label: activeProfile?.label || selected || "-",
    provider: activeProfile?.provider || "-"
  };
}

function renderAimxsStatus(settings) {
  const aimxs = settings?.aimxs || {};
  const state = String(aimxs.state || "unknown").trim().toLowerCase();
  const providerIDs = Array.isArray(aimxs.providerIds) ? aimxs.providerIds : [];
  return `
    <div class="metric">
      <div class="title">AIMXS Provider Status</div>
      <div class="meta">
        <span class="${chipClassForEndpointState(state)}">${escapeHTML(state)}</span>
      </div>
      <div class="meta">${escapeHTML(aimxs.detail || "-")}</div>
      <div class="meta">providerIds=${escapeHTML(providerIDs.length > 0 ? providerIDs.join(", ") : "-")}</div>
    </div>
  `;
}

function chipClassForConfigChangeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "applied" || status === "saved" || status === "synced") {
    return "chip chip-ok chip-compact";
  }
  if (status === "queued" || status === "draft" || status === "pending") {
    return "chip chip-warn chip-compact";
  }
  if (status === "error" || status === "rejected" || status === "failed") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function renderConfigChangeRows(items) {
  const changes = Array.isArray(items) ? items : [];
  if (changes.length === 0) {
    return '<tr><td colspan="7">No recent configuration changes captured.</td></tr>';
  }
  return changes
    .map((item) => {
      const eventName = String(item?.event || "").trim();
      const providerId = String(item?.providerId || "").trim();
      const decision = String(item?.decision || "").trim().toUpperCase();
      return `
        <tr>
          <td>${escapeHTML(formatTime(item?.ts))}</td>
          <td>${escapeHTML(item?.action || "-")}</td>
          <td>${escapeHTML(item?.scope || "-")}</td>
          <td>${escapeHTML(item?.actor || "-")}</td>
          <td>${escapeHTML(item?.source || "-")}</td>
          <td><span class="${chipClassForConfigChangeStatus(item?.status)}">${escapeHTML(item?.status || "-")}</span></td>
          <td>
            <button
              class="btn btn-secondary btn-small"
              type="button"
              data-settings-config-open-audit="1"
              data-settings-config-event="${escapeHTML(eventName)}"
              data-settings-config-provider="${escapeHTML(providerId)}"
              data-settings-config-decision="${escapeHTML(decision)}"
            >Open Audit</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function detectLocalPlatform() {
  const fromUAData = Array.isArray(navigator?.userAgentData?.platform)
    ? navigator.userAgentData.platform.join(" ")
    : String(navigator?.userAgentData?.platform || "");
  const platformText = `${fromUAData} ${String(navigator?.platform || "")} ${String(navigator?.userAgent || "")}`
    .trim()
    .toLowerCase();
  if (platformText.includes("win")) {
    return "windows";
  }
  if (platformText.includes("mac") || platformText.includes("darwin")) {
    return "macos";
  }
  if (platformText.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

function resolveLocalStoragePaths(platform) {
  if (platform === "windows") {
    const base = "%AppData%\\Epydios\\AgentOpsDesktop";
    return {
      base,
      logs: `${base}\\logs`,
      audits: `${base}\\audit`,
      incidents: `${base}\\incidents`,
      exports: `${base}\\exports`,
      cache: `${base}\\cache`
    };
  }
  if (platform === "macos") {
    const base = "~/Library/Application Support/Epydios/AgentOpsDesktop";
    return {
      base,
      logs: `${base}/logs`,
      audits: `${base}/audit`,
      incidents: `${base}/incidents`,
      exports: `${base}/exports`,
      cache: `${base}/cache`
    };
  }
  const base = "~/.local/share/epydios-agentops-desktop";
  return {
    base,
    logs: `${base}/logs`,
    audits: `${base}/audit`,
    incidents: `${base}/incidents`,
    exports: `${base}/exports`,
    cache: `${base}/cache`
  };
}

function resolveRetentionDays(settings) {
  const storage = settings?.storage || {};
  const retention = storage.retentionDays || {};
  const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    auditEvents: toNumber(retention.auditEvents, 90),
    incidentPackages: toNumber(retention.incidentPackages, 180),
    terminalHistory: toNumber(retention.terminalHistory, 30),
    runSnapshots: toNumber(retention.runSnapshots, 14)
  };
}

function selectedAttr(current, target) {
  return String(current || "").trim().toLowerCase() === String(target || "").trim().toLowerCase()
    ? "selected"
    : "";
}

function checkedAttr(value) {
  return value ? "checked" : "";
}

function editorValue(draft, key, fallback) {
  if (draft && Object.prototype.hasOwnProperty.call(draft, key)) {
    return draft[key];
  }
  return fallback;
}

function editorBool(draft, key, fallback) {
  if (draft && Object.prototype.hasOwnProperty.call(draft, key)) {
    return Boolean(draft[key]);
  }
  return Boolean(fallback);
}

function chipClassForEditorStatus(value) {
  const status = String(value || "clean").trim().toLowerCase();
  if (status === "applied" || status === "saved") {
    return "chip chip-ok";
  }
  if (status === "dirty" || status === "pending_apply") {
    return "chip chip-warn";
  }
  if (status === "invalid" || status === "error") {
    return "chip chip-danger";
  }
  return "chip chip-neutral";
}

function chipClassForSyncState(value) {
  const status = String(value || "unknown").trim().toLowerCase();
  if (status === "loaded" || status === "loaded-empty" || status === "runtime-endpoint") {
    return "chip chip-ok";
  }
  if (
    status === "loading" ||
    status === "fallback" ||
    status === "endpoint-unavailable" ||
    status === "scope-unavailable"
  ) {
    return "chip chip-warn";
  }
  if (status === "error") {
    return "chip chip-danger";
  }
  return "chip chip-neutral";
}

function chipClassForIntegrationSource(value) {
  const source = String(value || "none").trim().toLowerCase();
  if (source === "runtime-endpoint" || source === "mock") {
    return "chip chip-ok";
  }
  if (source === "local-fallback" || source === "none") {
    return "chip chip-warn";
  }
  if (source === "error") {
    return "chip chip-danger";
  }
  return "chip chip-neutral";
}

function renderIntegrationSyncStatus(settings, editorState) {
  const endpoints = Array.isArray(settings?.endpoints) ? settings.endpoints : [];
  const integrationEndpoint =
    endpoints.find((item) => String(item?.id || "").trim().toLowerCase() === "integrationsettings") || {};
  const syncState = String(editorState?.syncState || "unknown").trim().toLowerCase() || "unknown";
  const source = String(editorState?.source || "none").trim().toLowerCase() || "none";
  const endpointState =
    String(integrationEndpoint?.state || "unknown").trim().toLowerCase() || "unknown";
  const endpointUpdatedAt = integrationEndpoint?.updatedAt
    ? new Date(integrationEndpoint.updatedAt).toISOString()
    : "-";
  const scopeTenant = String(editorState?.scopeTenantId || "").trim() || "-";
  const scopeProject = String(editorState?.scopeProjectId || editorState?.projectId || "").trim() || "-";

  return `
    <div class="metric settings-int-sync-status">
      <div class="title">Integration Sync Status</div>
      <div class="meta">
        syncState=<span id="settings-int-sync-state" class="${chipClassForSyncState(syncState)}">${escapeHTML(syncState)}</span>
      </div>
      <div class="meta">
        source=<span id="settings-int-sync-source" class="${chipClassForIntegrationSource(source)}">${escapeHTML(source)}</span>
      </div>
      <div class="meta">scopeTenant=${escapeHTML(scopeTenant)}; scopeProject=${escapeHTML(scopeProject)}</div>
      <div class="meta">
        endpointState=<span id="settings-int-sync-endpoint-state" class="${chipClassForEndpointState(endpointState)}">${escapeHTML(endpointState)}</span>
      </div>
      <div class="meta" id="settings-int-sync-endpoint-detail">${escapeHTML(String(integrationEndpoint?.detail || "-"))}</div>
      <div class="meta">endpointUpdatedAt=${escapeHTML(endpointUpdatedAt)}</div>
    </div>
  `;
}

function renderEditorFeedback(editorState) {
  const errors = Array.isArray(editorState?.errors) ? editorState.errors : [];
  const warnings = Array.isArray(editorState?.warnings) ? editorState.warnings : [];
  const message = String(editorState?.message || "").trim();
  const hasSavedOverride = Boolean(editorState?.hasSavedOverride);
  const applied = Boolean(editorState?.applied);
  const savedAt = String(editorState?.savedAt || "").trim();
  const appliedAt = String(editorState?.appliedAt || "").trim();

  const lines = [];
  if (message) {
    lines.push(`<div class="meta">${escapeHTML(message)}</div>`);
  }
  if (errors.length > 0) {
    lines.push(...errors.map((item) => `<div class="meta settings-editor-error">error: ${escapeHTML(item)}</div>`));
  }
  if (warnings.length > 0) {
    lines.push(...warnings.map((item) => `<div class="meta settings-editor-warn">warn: ${escapeHTML(item)}</div>`));
  }
  lines.push(`<div class="meta">savedOverride=${escapeHTML(String(hasSavedOverride))}; applied=${escapeHTML(String(applied))}</div>`);
  if (savedAt) {
    lines.push(`<div class="meta">savedAt=${escapeHTML(savedAt)}</div>`);
  }
  if (appliedAt) {
    lines.push(`<div class="meta">appliedAt=${escapeHTML(appliedAt)}</div>`);
  }
  return lines.join("");
}

function renderIntegrationEditor(settings, editorState) {
  const integrations = settings?.integrations || {};
  const profiles = Array.isArray(integrations.agentProfiles) ? integrations.agentProfiles : [];
  const contracts = Array.isArray(integrations.providerContracts) ? integrations.providerContracts : [];
  const projectID = String(editorState?.projectId || "project:any").trim() || "project:any";
  const draft = editorState?.draft || null;
  const selectedProfileId = String(
    editorValue(draft, "selectedAgentProfileId", integrations.selectedAgentProfileId || profiles[0]?.id || "")
  )
    .trim()
    .toLowerCase();
  const selectedProfile =
    profiles.find((item) => String(item?.id || "").trim().toLowerCase() === selectedProfileId) ||
    profiles[0] ||
    {};
  const selectedContract =
    contracts.find((item) => String(item?.profileId || "").trim().toLowerCase() === selectedProfileId) ||
    {};

  const modelRouting = String(editorValue(draft, "modelRouting", integrations.modelRouting || "gateway_first"))
    .trim()
    .toLowerCase();
  const gatewayProviderId = String(editorValue(draft, "gatewayProviderId", integrations.gatewayProviderId || "litellm")).trim();
  const gatewayTokenRef = String(editorValue(draft, "gatewayTokenRef", integrations.gatewayTokenRef || "-")).trim();
  const gatewayMtlsCertRef = String(editorValue(draft, "gatewayMtlsCertRef", integrations.gatewayMtlsCertRef || "-")).trim();
  const gatewayMtlsKeyRef = String(editorValue(draft, "gatewayMtlsKeyRef", integrations.gatewayMtlsKeyRef || "-")).trim();
  const allowDirectProviderFallback = editorBool(
    draft,
    "allowDirectProviderFallback",
    Boolean(integrations.allowDirectProviderFallback)
  );

  const profileProvider = String(selectedProfile?.provider || selectedContract?.provider || "-").trim();
  const profileTransport = String(
    editorValue(draft, "profileTransport", selectedProfile?.transport || selectedContract?.transport || "-")
  ).trim();
  const profileModel = String(
    editorValue(draft, "profileModel", selectedProfile?.model || selectedContract?.model || "-")
  ).trim();
  const profileEndpointRef = String(
    editorValue(draft, "profileEndpointRef", selectedProfile?.endpointRef || selectedContract?.endpointRef || "-")
  ).trim();
  const profileCredentialRef = String(
    editorValue(
      draft,
      "profileCredentialRef",
      selectedProfile?.credentialRef || selectedContract?.credentialRef || "-"
    )
  ).trim();
  const profileCredentialScope = String(
    editorValue(
      draft,
      "profileCredentialScope",
      selectedProfile?.credentialScope || selectedContract?.credentialScope || "project"
    )
  )
    .trim()
    .toLowerCase();
  const profileEnabled = editorBool(
    draft,
    "profileEnabled",
    selectedProfile?.enabled ?? selectedContract?.status === "enabled"
  );

  const status = String(editorState?.status || "clean").trim().toLowerCase() || "clean";
  const statusChipClass = chipClassForEditorStatus(status);

  const profileOptions = profiles
    .map((item) => {
      const id = String(item?.id || "").trim().toLowerCase();
      const label = String(item?.label || id || "unknown").trim();
      return `<option value="${escapeHTML(id)}" ${selectedAttr(selectedProfileId, id)}>${escapeHTML(label)}</option>`;
    })
    .join("");

  return `
    <div class="metric" data-settings-int-project-id="${escapeHTML(projectID)}">
      <div class="title">Project Integration Editor</div>
      <div class="meta">projectScope=${escapeHTML(projectID)}; reference-only values only (ref://).</div>
      <div class="settings-editor-grid">
        <label class="field">
          <span class="label">Agent Profile</span>
          <select id="settings-int-selected-profile" class="filter-input" data-settings-int-field="selectedAgentProfileId">
            ${profileOptions}
          </select>
        </label>
        <label class="field">
          <span class="label">Model Routing</span>
          <select id="settings-int-model-routing" class="filter-input" data-settings-int-field="modelRouting">
            <option value="gateway_first" ${selectedAttr(modelRouting, "gateway_first")}>gateway_first</option>
            <option value="direct_first" ${selectedAttr(modelRouting, "direct_first")}>direct_first</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Gateway Provider</span>
          <input id="settings-int-gateway-provider" class="filter-input" type="text" value="${escapeHTML(gatewayProviderId)}" data-settings-int-field="gatewayProviderId" />
        </label>
        <label class="field">
          <span class="label">Gateway Token Ref</span>
          <input id="settings-int-gateway-token-ref" class="filter-input" type="text" value="${escapeHTML(gatewayTokenRef)}" data-settings-int-field="gatewayTokenRef" />
        </label>
        <label class="field">
          <span class="label">Gateway mTLS Cert Ref</span>
          <input id="settings-int-gateway-mtls-cert-ref" class="filter-input" type="text" value="${escapeHTML(gatewayMtlsCertRef)}" data-settings-int-field="gatewayMtlsCertRef" />
        </label>
        <label class="field">
          <span class="label">Gateway mTLS Key Ref</span>
          <input id="settings-int-gateway-mtls-key-ref" class="filter-input" type="text" value="${escapeHTML(gatewayMtlsKeyRef)}" data-settings-int-field="gatewayMtlsKeyRef" />
        </label>
        <label class="field field-checkbox">
          <input id="settings-int-direct-fallback" type="checkbox" ${checkedAttr(allowDirectProviderFallback)} data-settings-int-field="allowDirectProviderFallback" />
          <span>Allow direct provider fallback</span>
        </label>
        <div class="field">
          <span class="label">Profile Contract</span>
          <span class="meta" id="settings-int-profile-provider">${escapeHTML(profileProvider)}</span>
        </div>
        <label class="field">
          <span class="label">Profile Transport</span>
          <input id="settings-int-profile-transport" class="filter-input" type="text" value="${escapeHTML(profileTransport)}" data-settings-int-field="profileTransport" />
        </label>
        <label class="field">
          <span class="label">Profile Model</span>
          <input id="settings-int-profile-model" class="filter-input" type="text" value="${escapeHTML(profileModel)}" data-settings-int-field="profileModel" />
        </label>
        <label class="field">
          <span class="label">Profile Endpoint Ref</span>
          <input id="settings-int-profile-endpoint-ref" class="filter-input" type="text" value="${escapeHTML(profileEndpointRef)}" data-settings-int-field="profileEndpointRef" />
        </label>
        <label class="field">
          <span class="label">Profile Credential Ref</span>
          <input id="settings-int-profile-credential-ref" class="filter-input" type="text" value="${escapeHTML(profileCredentialRef)}" data-settings-int-field="profileCredentialRef" />
        </label>
        <label class="field">
          <span class="label">Credential Scope</span>
          <select id="settings-int-profile-credential-scope" class="filter-input" data-settings-int-field="profileCredentialScope">
            <option value="project" ${selectedAttr(profileCredentialScope, "project")}>project</option>
            <option value="tenant" ${selectedAttr(profileCredentialScope, "tenant")}>tenant</option>
            <option value="workspace" ${selectedAttr(profileCredentialScope, "workspace")}>workspace</option>
          </select>
        </label>
        <label class="field field-checkbox">
          <input id="settings-int-profile-enabled" type="checkbox" ${checkedAttr(profileEnabled)} data-settings-int-field="profileEnabled" />
          <span>Profile enabled</span>
        </label>
      </div>
      <div class="filter-row settings-editor-actions">
        <button class="btn btn-secondary" type="button" data-settings-int-action="save">Save Draft</button>
        <button class="btn btn-primary" type="button" data-settings-int-action="apply">Apply Saved</button>
        <button class="btn btn-secondary" type="button" data-settings-int-action="reset">Reset Project Override</button>
        <span id="settings-int-status-chip" class="${statusChipClass}">${escapeHTML(status)}</span>
      </div>
      <div id="settings-int-feedback" class="stack">${renderEditorFeedback(editorState)}</div>
    </div>
  `;
}

export function renderSettings(ui, settingsPayload, editorState = {}, viewState = {}) {
  if (!ui.settingsContent) {
    return;
  }

  const settings = settingsPayload || {};
  const endpoints = Array.isArray(settings.endpoints) ? settings.endpoints : [];
  const dataSources = settings.dataSources || {};
  const integrations = settings.integrations || {};
  const providerContracts = Array.isArray(integrations.providerContracts)
    ? integrations.providerContracts
    : [];
  const realtime = settings.realtime || {};
  const terminal = settings.terminal || {};
  const theme = settings.theme || {};
  const aimxs = settings.aimxs || {};
  const agent = renderAgentProfileSummary(settings);
  const runtimePlatform = detectLocalPlatform();
  const localPaths = resolveLocalStoragePaths(runtimePlatform);
  const retention = resolveRetentionDays(settings);
  const configChanges = Array.isArray(settings.configChanges) ? settings.configChanges : [];

  const endpointRows = renderEndpointMatrixRows(endpoints);
  const providerContractRows = renderProviderContractRows(providerContracts);
  const integrationEditor = renderIntegrationEditor(settings, editorState);
  const integrationSyncStatus = renderIntegrationSyncStatus(settings, editorState);
  const configChangeRows = renderConfigChangeRows(configChanges);
  const requestedSubview = String(viewState?.subview || "configuration").trim().toLowerCase();
  const selectedSubview = requestedSubview === "diagnostics" ? "diagnostics" : "configuration";
  const configurationClass = selectedSubview === "configuration" ? "is-active" : "";
  const diagnosticsClass = selectedSubview === "diagnostics" ? "is-active" : "";
  const aimxsMode = String(aimxs.mode || "disabled").trim().toLowerCase();
  const aimxsProviderState = String(aimxs.state || "unknown").trim().toLowerCase();
  const aimxsPaymentEntitled = Boolean(aimxs.paymentEntitled);
  const aimxsProviderIds = Array.isArray(aimxs.providerIds) ? aimxs.providerIds : [];
  const aimxsEditor = viewState?.aimxsEditor || {};
  const aimxsEditorStatus = String(aimxsEditor.status || "clean").trim().toLowerCase();
  const aimxsEditorMessage = String(aimxsEditor.message || "").trim();
  const aimxsStatusChipClass = chipClassForEditorStatus(aimxsEditorStatus);
  const aimxsStatusMessage = aimxsEditorMessage
    ? aimxsEditorMessage
    : aimxsPaymentEntitled
      ? "Entitlement is active; HTTPS mode can be applied with valid ref:// credentials."
      : "Entitlement is locked; AIMXS HTTPS mode cannot be enabled yet.";

  ui.settingsContent.innerHTML = `
    <div class="metric">
      <div class="title">Settings Scope</div>
      <div class="meta">Use Configuration for editable controls and Diagnostics for health, traceability, and contract inspection.</div>
      <div class="meta">Project overrides are applied to current workspace context unless explicitly reset.</div>
    </div>
    <div class="settings-subtabs" role="tablist" aria-label="Settings views">
      <button class="settings-subtab ${configurationClass}" type="button" data-settings-subtab="configuration" aria-selected="${selectedSubview === "configuration" ? "true" : "false"}">Configuration</button>
      <button class="settings-subtab ${diagnosticsClass}" type="button" data-settings-subtab="diagnostics" data-advanced-section="settings" aria-selected="${selectedSubview === "diagnostics" ? "true" : "false"}">Diagnostics</button>
    </div>
    <section class="settings-subpanel ${configurationClass}" data-settings-subpanel="configuration">
      <div class="metric">
        <div class="title">Model Routing + Agent Profile</div>
        <div class="meta">modelRouting=${escapeHTML(integrations.modelRouting || "-")}</div>
        <div class="meta">gatewayProviderId=${escapeHTML(integrations.gatewayProviderId || "-")}</div>
        <div class="meta">directProviderFallback=${escapeHTML(String(Boolean(integrations.allowDirectProviderFallback)))}</div>
        <div class="meta">activeAgentProfile=${escapeHTML(agent.label)} (${escapeHTML(agent.id)})</div>
        <div class="meta">profileProviderContract=${escapeHTML(agent.provider)}</div>
      </div>
      ${integrationEditor}
      <div class="metric">
        <div class="title">Gateway Security References</div>
        <div class="meta">gatewayTokenRef=<code>${escapeHTML(integrations.gatewayTokenRef || "-")}</code></div>
        <div class="meta">gatewayMtlsCertRef=<code>${escapeHTML(integrations.gatewayMtlsCertRef || "-")}</code></div>
        <div class="meta">gatewayMtlsKeyRef=<code>${escapeHTML(integrations.gatewayMtlsKeyRef || "-")}</code></div>
      </div>
      <div class="metric">
        <div class="title">AIMXS HTTPS Mode</div>
        <div class="meta">entitlement=${escapeHTML(aimxsPaymentEntitled ? "active" : "locked")}; providerState=${escapeHTML(aimxsProviderState)}; providers=${escapeHTML(aimxsProviderIds.length > 0 ? aimxsProviderIds.join(", ") : "-")}</div>
        <div class="settings-editor-grid">
          <label class="field">
            <span class="label">AIMXS Mode</span>
            <select id="settings-aimxs-mode" class="filter-input" data-settings-aimxs-field="mode">
              <option value="disabled" ${selectedAttr(aimxsMode, "disabled")}>disabled</option>
              <option value="https_external" ${selectedAttr(aimxsMode, "https_external")}>https_external</option>
              <option value="in_stack_reserved" ${selectedAttr(aimxsMode, "in_stack_reserved")}>in_stack_reserved</option>
            </select>
          </label>
          <label class="field">
            <span class="label">AIMXS Endpoint Ref</span>
            <input id="settings-aimxs-endpoint-ref" class="filter-input" type="text" data-settings-aimxs-field="endpointRef" value="${escapeHTML(String(aimxs.endpointRef || "-"))}" />
          </label>
          <label class="field">
            <span class="label">AIMXS Bearer Token Ref</span>
            <input id="settings-aimxs-bearer-token-ref" class="filter-input" type="text" data-settings-aimxs-field="bearerTokenRef" value="${escapeHTML(String(aimxs.bearerTokenRef || "-"))}" />
          </label>
          <label class="field">
            <span class="label">AIMXS mTLS Cert Ref</span>
            <input id="settings-aimxs-mtls-cert-ref" class="filter-input" type="text" data-settings-aimxs-field="mtlsCertRef" value="${escapeHTML(String(aimxs.mtlsCertRef || "-"))}" />
          </label>
          <label class="field">
            <span class="label">AIMXS mTLS Key Ref</span>
            <input id="settings-aimxs-mtls-key-ref" class="filter-input" type="text" data-settings-aimxs-field="mtlsKeyRef" value="${escapeHTML(String(aimxs.mtlsKeyRef || "-"))}" />
          </label>
        </div>
        <div class="filter-row settings-editor-actions">
          <button class="btn btn-primary" type="button" data-settings-aimxs-action="apply">Apply AIMXS Settings</button>
          <span id="settings-aimxs-status-chip" class="${aimxsStatusChipClass}">${escapeHTML(aimxsEditorStatus || "clean")}</span>
        </div>
        <div id="settings-aimxs-feedback" class="stack">
          <div class="meta">${escapeHTML(aimxsStatusMessage)}</div>
          <div class="meta">HTTPS mode requires payment entitlement and valid ref:// credential references.</div>
        </div>
      </div>
      <div class="metric">
        <div class="title">Runtime Defaults + Theme</div>
        <div class="meta">realtime=${escapeHTML(realtime.mode || "-")} / ${escapeHTML(String(realtime.pollIntervalMs || "-"))}ms</div>
        <div class="meta">terminal=${escapeHTML(terminal.mode || "-")}</div>
        <div class="meta">restrictedHostMode=${escapeHTML(terminal.restrictedHostMode || "-")}</div>
        <div class="meta">themeMode=${escapeHTML(theme.mode || "-")}</div>
      </div>
      <div class="metric">
        <div class="title">Local Storage + Retention</div>
        <div class="meta">platform=${escapeHTML(runtimePlatform)}</div>
        <div class="meta">baseDir=<code>${escapeHTML(localPaths.base)}</code></div>
        <div class="meta">logsDir=<code>${escapeHTML(localPaths.logs)}</code></div>
        <div class="meta">auditDir=<code>${escapeHTML(localPaths.audits)}</code></div>
        <div class="meta">incidentsDir=<code>${escapeHTML(localPaths.incidents)}</code></div>
        <div class="meta">exportsDir=<code>${escapeHTML(localPaths.exports)}</code></div>
        <div class="meta">cacheDir=<code>${escapeHTML(localPaths.cache)}</code></div>
        <div class="meta">retention.auditEventsDays=${escapeHTML(String(retention.auditEvents))}</div>
        <div class="meta">retention.incidentPackagesDays=${escapeHTML(String(retention.incidentPackages))}</div>
        <div class="meta">retention.terminalHistoryDays=${escapeHTML(String(retention.terminalHistory))}</div>
        <div class="meta">retention.runSnapshotsDays=${escapeHTML(String(retention.runSnapshots))}</div>
      </div>
    </section>
    <section class="settings-subpanel ${diagnosticsClass}" data-settings-subpanel="diagnostics" data-advanced-section="settings">
      <div class="metric">
        <div class="title">Runtime Data Sources</div>
        <div class="meta">runs=${escapeHTML(summarizeDataSource(dataSources.runs))}</div>
        <div class="meta">approvals=${escapeHTML(summarizeDataSource(dataSources.approvals))}</div>
        <div class="meta">audit=${escapeHTML(summarizeDataSource(dataSources.audit))}</div>
        <div class="meta">runtimeBase=${escapeHTML(settings.runtimeApiBaseUrl || "-")}</div>
        <div class="meta">registryBase=${escapeHTML(settings.registryApiBaseUrl || "-")}</div>
      </div>
      ${integrationSyncStatus}
      <div class="metric">
        <div class="title">Recent Configuration Changes</div>
        <div class="meta">Latest local/runtime settings updates; use Open Audit to view matching events in Incidents.</div>
        <div class="filter-row">
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-settings-config-open-audit="1"
            data-settings-config-event=""
            data-settings-config-provider=""
            data-settings-config-decision=""
          >Open Audit Events</button>
        </div>
        <table class="settings-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Change</th>
              <th>Scope</th>
              <th>Actor</th>
              <th>Source</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${configChangeRows}</tbody>
        </table>
      </div>
      <div class="metric">
        <div class="title">Provider Contract Matrix</div>
        <table class="settings-table">
          <thead>
            <tr>
              <th>Profile</th>
              <th>Contract</th>
              <th>Transport</th>
              <th>Model</th>
              <th>Endpoint Reference</th>
              <th>Credential Reference</th>
              <th>Scope</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${providerContractRows || '<tr><td colspan="8">No provider contracts configured.</td></tr>'}</tbody>
        </table>
      </div>
      ${renderAimxsStatus(settings)}
      <div class="metric">
        <div class="title">Endpoint Contract Matrix</div>
        <table class="settings-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Status</th>
              <th>Path</th>
              <th>Detail</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>${endpointRows || '<tr><td colspan="5">No endpoint status rows available.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}
