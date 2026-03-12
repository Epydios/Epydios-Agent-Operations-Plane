import { displayAimxsModeLabel, displayPolicyProviderLabel, escapeHTML, formatTime } from "./common.js";
import {
  collectAimxsKnownLocalSecureRefs,
  renderAimxsSettingsMetric,
  renderAimxsStatusMetric
} from "../aimxs/settings-view.js";

function tableCell(label, content, attrs = "") {
  return `<td data-label="${escapeHTML(label)}"${attrs}>${content}</td>`;
}

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
          ${tableCell("Endpoint", escapeHTML(item?.label || "-"))}
          ${tableCell("Status", `<span class="${chipClassForEndpointState(state)}">${escapeHTML(state)}</span>`)}
          ${tableCell("Path", escapeHTML(item?.path || "-"))}
          ${tableCell("Detail", escapeHTML(item?.detail || "-"))}
          ${tableCell("Updated", escapeHTML(updatedAt))}
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
          ${tableCell("Profile", escapeHTML(item?.label || item?.profileId || "-"))}
          ${tableCell("Contract", escapeHTML(item?.provider || "-"))}
          ${tableCell("Transport", escapeHTML(item?.transport || "-"))}
          ${tableCell("Model", escapeHTML(item?.model || "-"))}
          ${tableCell("Endpoint Reference", `<code>${escapeHTML(item?.endpointRef || "-")}</code>`)}
          ${tableCell("Credential Reference", `<code>${escapeHTML(item?.credentialRef || "-")}</code>`)}
          ${tableCell("Scope", escapeHTML(item?.credentialScope || "-"))}
          ${tableCell(
            "Status",
            `
            <span class="${chipClassForProviderContractStatus(item?.status)}">${escapeHTML(item?.status || "unknown")}</span>
            ${selected ? '<span class="chip chip-neutral chip-compact">selected</span>' : ""}
          `
          )}
        </tr>
      `;
    })
    .join("");
}

function chipClassForAuthorityBasis(value) {
  const basis = String(value || "").trim().toLowerCase();
  if (basis === "bearer_token_jwt" || basis === "runtime_context_identity" || basis === "mock_bearer_token_jwt") {
    return "chip chip-ok";
  }
  if (basis === "runtime_auth_disabled" || basis === "endpoint_unavailable" || basis === "unresolved") {
    return "chip chip-warn";
  }
  return "chip chip-neutral";
}

function renderDelimitedCodeList(items = []) {
  const values = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (values.length === 0) {
    return "-";
  }
  return values.map((item) => `<code>${escapeHTML(item)}</code>`).join(", ");
}

function policyProviderLabel(settings = {}) {
  const selectedProviderId = String(settings?.aimxs?.activation?.selectedProviderId || "").trim();
  if (selectedProviderId) {
    return displayPolicyProviderLabel(selectedProviderId);
  }
  const mode = String(settings?.aimxs?.mode || "").trim().toLowerCase();
  if (mode === "oss-only") {
    return "baseline";
  }
  if (mode === "aimxs-full") {
    return displayPolicyProviderLabel("aimxs-full");
  }
  if (mode === "aimxs-https") {
    return displayPolicyProviderLabel("aimxs-policy-primary");
  }
  return "-";
}

function renderPolicyPackRows(items) {
  return (items || [])
    .map((item) => `
      <tr>
        ${tableCell("Pack", `<code>${escapeHTML(item?.packId || "-")}</code>`)}
        ${tableCell("Label", escapeHTML(item?.label || "-"))}
        ${tableCell("Role Bundles", renderDelimitedCodeList(item?.roleBundles || []))}
        ${tableCell("Decision Surfaces", renderDelimitedCodeList(item?.decisionSurfaces || []))}
        ${tableCell("Boundary Requirements", renderDelimitedCodeList(item?.boundaryRequirements || []))}
      </tr>
    `)
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

function chipClassForNativeSessionStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "COMPLETED" || status === "READY") {
    return "chip chip-ok chip-compact";
  }
  if (status === "RUNNING" || status === "AWAITING_APPROVAL" || status === "AWAITING_WORKER") {
    return "chip chip-warn chip-compact";
  }
  if (status === "FAILED" || status === "BLOCKED" || status === "CANCELLED") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function summarizeNativeSessionEvent(item) {
  const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
  if (String(payload.summary || "").trim()) {
    return String(payload.summary || "").trim();
  }
  if (String(payload.reason || "").trim()) {
    return String(payload.reason || "").trim();
  }
  if (String(payload.status || "").trim()) {
    return `status=${String(payload.status || "").trim()}`;
  }
  if (String(payload.decision || "").trim()) {
    return `decision=${String(payload.decision || "").trim()}`;
  }
  if (String(payload.toolType || "").trim()) {
    return `toolType=${String(payload.toolType || "").trim()}`;
  }
  if (String(payload.kind || "").trim()) {
    return `kind=${String(payload.kind || "").trim()}`;
  }
  if (String(item?.eventType || "").trim()) {
    return `event=${String(item.eventType || "").trim()}`;
  }
  return "-";
}

function renderNativeSessionConsumerPanel(invokeState = {}) {
  const sessionView = invokeState?.sessionView || {};
  const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : null;
  const sessionId =
    String(sessionView?.sessionId || invokeState?.response?.sessionId || "").trim();
  const source = String(sessionView?.source || "not-loaded").trim();
  const state = String(sessionView?.status || "idle").trim().toLowerCase();
  const message = String(sessionView?.message || "").trim();
  const sessionStatus = String(timeline?.session?.status || "-").trim().toUpperCase() || "-";
  const selectedWorker = timeline?.selectedWorker || null;
  const latestEventSequence = Number(timeline?.latestEventSequence || 0) || 0;
  const streamItems = Array.isArray(sessionView?.streamItems) ? sessionView.streamItems : [];
  const events = streamItems.length > 0 ? streamItems : Array.isArray(timeline?.events) ? timeline.events.slice(-6) : [];
  const eventRows =
    events.length === 0
      ? `<tr>${tableCell("Status", "No native M16 events have been loaded yet.", ' colspan="4"')}</tr>`
      : events
          .map(
            (item) => `
              <tr>
                ${tableCell("Sequence", escapeHTML(String(item?.sequence || "-")))}
                ${tableCell("Type", escapeHTML(String(item?.eventType || "-")))}
                ${tableCell("Timestamp", escapeHTML(formatTime(item?.timestamp)))}
                ${tableCell("Summary", escapeHTML(summarizeNativeSessionEvent(item)))}
              </tr>
            `
          )
          .join("");
  const rawTimeline = timeline ? JSON.stringify(timeline, null, 2) : "";

  return `
    <div class="metric settings-metric settings-metric-agent-session">
      <div class="metric-title-row">
        <div class="title">Native Session Consumer</div>
        <span class="${chipClassForNativeSessionStatus(sessionStatus)}">${escapeHTML(sessionStatus)}</span>
      </div>
      <div class="meta">source=${escapeHTML(source || "-")}; sessionId=${escapeHTML(sessionId || "-")}; consumerState=${escapeHTML(state || "-")}</div>
      <div class="meta">This panel reads M16 session state directly from <code>/v1alpha2/runtime/sessions/{sessionId}/timeline</code> and <code>/events/stream</code>.</div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary btn-small" type="button" data-settings-agent-test-action="refresh-session" ${sessionId ? "" : "disabled"}>Refresh Native Session</button>
          </div>
        </div>
      </div>
      <div class="stack" role="status" aria-live="polite" aria-atomic="true">
        <div class="meta">${escapeHTML(message || "Invoke a profile first, then this panel will read the native M16 session contract instead of the legacy run compatibility surface.")}</div>
      </div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">openApprovals=${escapeHTML(String(timeline?.openApprovalCount ?? "-"))}</span>
        <span class="chip chip-neutral chip-compact">workers=${escapeHTML(String(Array.isArray(timeline?.workers) ? timeline.workers.length : 0))}</span>
        <span class="chip chip-neutral chip-compact">toolActions=${escapeHTML(String(Array.isArray(timeline?.toolActions) ? timeline.toolActions.length : 0))}</span>
        <span class="chip chip-neutral chip-compact">evidence=${escapeHTML(String(Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords.length : 0))}</span>
        <span class="chip chip-neutral chip-compact">latestEventSequence=${escapeHTML(String(latestEventSequence || "-"))}</span>
        <span class="chip chip-neutral chip-compact">selectedWorker=${escapeHTML(String(selectedWorker?.adapterId || selectedWorker?.workerId || "-"))}</span>
      </div>
      <details class="artifact-panel" data-detail-key="settings.agent_session_events" open>
        <summary>Recent native session events</summary>
        <table class="data-table runs-table">
          <thead>
            <tr>
              <th scope="col">Sequence</th>
              <th scope="col">Type</th>
              <th scope="col">Timestamp</th>
              <th scope="col">Summary</th>
            </tr>
          </thead>
          <tbody>${eventRows}</tbody>
        </table>
      </details>
      ${rawTimeline ? `<details class="details-shell" data-detail-key="settings.agent_session_timeline_json"><summary>Native Timeline JSON</summary><pre class="code-block">${escapeHTML(rawTimeline)}</pre></details>` : ""}
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
    return `<tr>${tableCell(
      "Status",
      "No recent configuration changes are recorded yet. Save or apply a settings change, or open Audit Events to inspect runtime-side configuration activity.",
      ' colspan="7"'
    )}</tr>`;
  }
  return changes
    .map((item) => {
      const eventName = String(item?.event || "").trim();
      const providerId = String(item?.providerId || "").trim();
      const decision = String(item?.decision || "").trim().toUpperCase();
      return `
        <tr>
          ${tableCell("Timestamp", escapeHTML(formatTime(item?.ts)))}
          ${tableCell("Change", escapeHTML(item?.action || "-"))}
          ${tableCell("Scope", escapeHTML(item?.scope || "-"))}
          ${tableCell("Actor", escapeHTML(item?.actor || "-"))}
          ${tableCell("Source", escapeHTML(item?.source || "-"))}
          ${tableCell(
            "Status",
            `<span class="${chipClassForConfigChangeStatus(item?.status)}">${escapeHTML(item?.status || "-")}</span>`
          )}
          ${tableCell(
            "Action",
            `
            <button
              class="btn btn-secondary btn-small"
              type="button"
              data-settings-config-open-audit="1"
              data-settings-config-event="${escapeHTML(eventName)}"
              data-settings-config-provider="${escapeHTML(providerId)}"
              data-settings-config-decision="${escapeHTML(decision)}"
            >Open Audit Events</button>
          `
          )}
        </tr>
      `;
    })
    .join("");
}

function chipClassForWorkflowState(value) {
  const state = String(value || "pending").trim().toLowerCase();
  if (state === "active" || state === "complete") {
    return "chip chip-ok chip-compact";
  }
  if (state === "attention" || state === "blocked") {
    return "chip chip-danger chip-compact";
  }
  if (state === "ready") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function workflowStateLabel(value) {
  const state = String(value || "pending").trim().toLowerCase();
  if (state === "active") {
    return "Active";
  }
  if (state === "complete") {
    return "Complete";
  }
  if (state === "attention") {
    return "Attention";
  }
  if (state === "ready") {
    return "Ready";
  }
  return "Pending";
}

function renderSettingsRecoveryGuide(syncState, endpointState, projectScope, selectedSubview) {
  const normalizedSync = String(syncState || "unknown").trim().toLowerCase();
  const normalizedEndpoint = String(endpointState || "unknown").trim().toLowerCase();
  const needsScopeRecovery = normalizedSync === "scope-unavailable";
  const needsEndpointRecovery =
    normalizedSync === "endpoint-unavailable" ||
    normalizedEndpoint === "error" ||
    normalizedEndpoint === "unknown";

  if (!needsScopeRecovery && !needsEndpointRecovery) {
    return "";
  }

  const title = needsScopeRecovery ? "Settings Scope Recovery" : "Settings Endpoint Recovery";
  const chipClass = needsScopeRecovery ? "chip chip-danger chip-compact" : "chip chip-warn chip-compact";
  const chipLabel = needsScopeRecovery ? "scope required" : "retry after diagnostics";
  const summary = needsScopeRecovery
    ? "Project scope is not pinned, so saved settings cannot be verified against a concrete runtime target yet."
    : "The runtime integration settings endpoint is not ready, so local fallback can diverge from the live runtime until diagnostics pass again.";
  const diagnosticsInstruction =
    selectedSubview === "diagnostics"
      ? "Diagnostics is already open. Inspect the Integration Sync Status card and the endpoint matrix before retrying."
      : "Open Diagnostics first, then inspect the Integration Sync Status card and the endpoint matrix before retrying.";
  const steps = needsScopeRecovery
    ? [
        "Choose the intended project from the workspace context bar so the editor is operating on a real tenant/project scope.",
        "Return to Configuration and re-check the selected agent profile, routing mode, and endpoint references for that scope.",
        "Save Draft again, then run Apply Saved only after the scope chip shows the intended project identifier.",
        "Open Diagnostics and Audit Events to confirm the new scope and resulting control-plane trail."
      ]
    : [
        diagnosticsInstruction,
        "Verify that the integrationSettings endpoint row is available or ready, and confirm the endpoint detail text is no longer reporting fallback-only conditions.",
        "Retry Apply Saved or Reset Project Override only after endpoint health is restored; otherwise treat the current result as local fallback only.",
        `Before closing the workflow, confirm the recorded change for ${projectScope} in Audit Events so fallback state and runtime state are not confused.`
      ];

  return `
    <div class="settings-recovery-guide">
      <div class="metric-title-row">
        <div class="title">${escapeHTML(title)}</div>
        <span class="${chipClass}">${escapeHTML(chipLabel)}</span>
      </div>
      <div class="meta">${escapeHTML(summary)}</div>
      <ol class="settings-recovery-list">
        ${steps.map((step) => `<li>${escapeHTML(step)}</li>`).join("")}
      </ol>
    </div>
  `;
}

function renderSettingsWorkflowPanel(settings, editorState, selectedSubview) {
  const endpoints = Array.isArray(settings?.endpoints) ? settings.endpoints : [];
  const integrationEndpoint =
    endpoints.find((item) => String(item?.id || "").trim().toLowerCase() === "integrationsettings") || {};
  const endpointState =
    String(integrationEndpoint?.state || "unknown").trim().toLowerCase() || "unknown";
  const syncState = String(editorState?.syncState || "unknown").trim().toLowerCase() || "unknown";
  const source = String(editorState?.source || "none").trim().toLowerCase() || "none";
  const editorStatus = String(editorState?.status || "clean").trim().toLowerCase() || "clean";
  const projectScope = String(editorState?.projectId || "project:any").trim() || "project:any";
  const savedAt = String(editorState?.savedAt || "").trim();
  const appliedAt = String(editorState?.appliedAt || "").trim();
  const recoveryGuide = renderSettingsRecoveryGuide(syncState, endpointState, projectScope, selectedSubview);

  const workflowSteps = [
    {
      label: "Inspect current scope",
      state: selectedSubview === "configuration" ? "active" : "ready",
      detail:
        selectedSubview === "configuration"
          ? "Configuration is open. Confirm routing, profile contract, and current project scope before editing."
          : "Open Configuration to inspect editable routing and profile defaults for the active scope."
    },
    {
      label: "Edit draft values",
      state: editorStatus === "dirty" || editorStatus === "invalid" ? "attention" : editorStatus === "clean" ? "pending" : "complete",
      detail:
        editorStatus === "invalid"
          ? "Draft contains blocked values. Correct the invalid fields before saving or applying."
          : editorStatus === "dirty"
            ? "Draft has unapplied edits. Save Draft when the current values are ready for review."
            : "Editor is aligned with the last saved or applied values."
    },
    {
      label: "Save draft",
      state: editorState?.hasSavedOverride ? "complete" : editorStatus === "dirty" ? "ready" : "pending",
      detail: editorState?.hasSavedOverride
        ? "A project-scoped draft is saved and available for apply."
        : "No saved project draft exists yet. Use Save Draft to create a recoverable checkpoint before apply."
    },
    {
      label: "Apply saved values",
      state:
        editorState?.applied
          ? "active"
          : syncState === "scope-unavailable" || syncState === "endpoint-unavailable" || endpointState === "error"
            ? "attention"
            : editorState?.hasSavedOverride
              ? "ready"
              : "pending",
      detail: editorState?.applied
        ? "Saved values are active for this project scope. Open Diagnostics and Audit Events before closing the workflow."
        : syncState === "scope-unavailable"
          ? "Tenant/project scope is unavailable. Re-establish scope from the context bar, then save and apply again."
        : syncState === "endpoint-unavailable"
          ? "Runtime endpoint is unavailable, so Apply Saved updates local fallback state only. Open Diagnostics, verify endpoint health, then retry before relying on the change."
          : endpointState === "error" || endpointState === "unknown"
            ? "Endpoint health is not ready for verification. Use Diagnostics first, then retry Apply Saved after the endpoint row returns to a ready state."
          : "Apply Saved promotes the last saved draft into active runtime choices for this project scope."
    },
    {
      label: "Verify diagnostics and audit trail",
      state: selectedSubview === "diagnostics" ? "active" : "ready",
      detail:
        selectedSubview === "diagnostics"
          ? "Diagnostics is open. Review endpoint state, recent changes, and contract matrices, then open Audit Events if you need the runtime trail."
          : "Open Diagnostics to verify endpoint health and recent changes, then open Audit Events for the matching runtime trail."
    }
  ];

  return `
    <div class="metric settings-workflow-panel">
      <div class="metric-title-row">
        <div class="title focus-anchor" tabindex="-1" data-focus-anchor="settings-workflow">Settings Workflow Status</div>
        <span class="${chipClassForEditorStatus(editorStatus)} chip-compact">editor=${escapeHTML(editorStatus)}</span>
        <span class="${chipClassForSyncState(syncState)} chip-compact">sync=${escapeHTML(syncState)}</span>
      </div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">projectScope=${escapeHTML(projectScope)}</span>
        <span class="${chipClassForEndpointState(endpointState)}">endpoint=${escapeHTML(endpointState)}</span>
        <span class="${chipClassForIntegrationSource(source)}">source=${escapeHTML(source)}</span>
        <span class="chip chip-neutral chip-compact">view=${escapeHTML(selectedSubview)}</span>
      </div>
      <div class="meta">Use Configuration to edit and checkpoint project-scoped settings. Use Diagnostics and Audit Events to confirm endpoint health and the resulting control-plane trail.</div>
      ${savedAt ? `<div class="meta">draftSavedAt=${escapeHTML(savedAt)}</div>` : ""}
      ${appliedAt ? `<div class="meta">appliedAt=${escapeHTML(appliedAt)}</div>` : ""}
      ${recoveryGuide}
      <ol class="settings-workflow-list">
        ${workflowSteps
          .map(
            (step, index) => `
              <li class="settings-workflow-item">
                <span class="${chipClassForWorkflowState(step.state)}">${escapeHTML(workflowStateLabel(step.state))}</span>
                <div class="settings-workflow-copy">
                  <strong>${escapeHTML(`${index + 1}. ${step.label}`)}</strong>
                  <span class="meta">${escapeHTML(step.detail)}</span>
                </div>
              </li>
            `
          )
          .join("")}
      </ol>
      <div class="filter-row settings-workflow-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary btn-small" type="button" data-settings-subtab="configuration">Open Configuration</button>
          </div>
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary btn-small" type="button" data-settings-subtab="diagnostics" data-advanced-section="settings">Open Diagnostics</button>
            <button class="btn btn-secondary btn-small" type="button" data-settings-config-open-audit="1" data-settings-config-event="" data-settings-config-provider="" data-settings-config-decision="">Open Audit Events</button>
          </div>
        </div>
      </div>
    </div>
  `;
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
  if (status === "dirty" || status === "pending_apply" || status === "warn") {
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
  const recoveryDetail =
    syncState === "scope-unavailable"
      ? "Recovery: choose a project from the workspace context bar, then reopen Configuration and retry save/apply."
      : syncState === "endpoint-unavailable" || endpointState === "error" || endpointState === "unknown"
        ? "Recovery: verify the integrationSettings endpoint row below, then retry the change and confirm the resulting Audit Events record."
        : "";

  return `
    <div class="metric settings-metric settings-metric-sync settings-int-sync-status">
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
      ${recoveryDetail ? `<div class="meta settings-editor-warn">${escapeHTML(recoveryDetail)}</div>` : ""}
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
    lines.push(...errors.map((item) => `<div class="meta settings-editor-error">Blocked: ${escapeHTML(item)}</div>`));
  }
  if (warnings.length > 0) {
    lines.push(...warnings.map((item) => `<div class="meta settings-editor-warn">Review before apply: ${escapeHTML(item)}</div>`));
  }
  if (!message && errors.length === 0 && warnings.length === 0) {
    lines.push("<div class=\"meta\">Next step: edit the draft, then Save Draft for a checkpoint or Apply Saved for the current project scope.</div>");
  }
  lines.push(`<div class="meta">draftSaved=${escapeHTML(String(hasSavedOverride))}; applied=${escapeHTML(String(applied))}</div>`);
  if (savedAt) {
    lines.push(`<div class="meta">draftSavedAt=${escapeHTML(savedAt)}</div>`);
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
    <div class="metric settings-metric settings-metric-editor" data-settings-int-project-id="${escapeHTML(projectID)}">
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
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary" type="button" data-settings-int-action="apply">Apply Saved</button>
          </div>
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary" type="button" data-settings-int-action="save">Save Draft</button>
          </div>
          <div class="action-group action-group-destructive">
            <button class="btn btn-danger" type="button" data-settings-int-action="reset">Reset Project Override</button>
          </div>
        </div>
        <span id="settings-int-status-chip" class="${statusChipClass}">${escapeHTML(status)}</span>
      </div>
      <div id="settings-int-feedback" class="stack" role="status" aria-live="polite" aria-atomic="true">${renderEditorFeedback(editorState)}</div>
    </div>
  `;
}

function renderIntegrationInvokePanel(settings, invokeState = {}) {
  const integrations = settings?.integrations || {};
  const profiles = Array.isArray(integrations.agentProfiles) ? integrations.agentProfiles : [];
  const selectedProfileId = String(
    invokeState.agentProfileId || integrations.selectedAgentProfileId || profiles[0]?.id || ""
  )
    .trim()
    .toLowerCase();
  const selectedProfile =
    profiles.find((item) => String(item?.id || "").trim().toLowerCase() === selectedProfileId) ||
    profiles[0] ||
    {};
  const profileOptions = profiles
    .map((item) => {
      const id = String(item?.id || "").trim().toLowerCase();
      const label = String(item?.label || id || "unknown").trim() || "unknown";
      return `<option value="${escapeHTML(id)}" ${selectedAttr(selectedProfileId, id)}>${escapeHTML(label)}</option>`;
    })
    .join("");
  const prompt = String(invokeState.prompt || "").trim();
  const systemPrompt = String(invokeState.systemPrompt || "").trim();
  const maxOutputTokens = Number.isFinite(Number(invokeState.maxOutputTokens))
    ? Number(invokeState.maxOutputTokens)
    : 1024;
  const status = String(invokeState.status || "clean").trim().toLowerCase() || "clean";
  const statusChipClass = chipClassForEditorStatus(status === "success" ? "applied" : status === "running" ? "dirty" : status);
  const message = String(invokeState.message || "").trim();
  const warning = String(invokeState.response?.warning || "").trim();
  const outputText = String(invokeState.response?.outputText || "").trim();
  const rawResponse = invokeState.response?.rawResponse ? JSON.stringify(invokeState.response.rawResponse, null, 2) : "";
  const route = String(invokeState.response?.route || "").trim();
  const boundaryProviderId = String(invokeState.response?.boundaryProviderId || "").trim();
  const provider = String(selectedProfile?.provider || invokeState.response?.provider || "-").trim() || "-";
  const transport = String(selectedProfile?.transport || invokeState.response?.transport || "-").trim() || "-";
  const model = String(selectedProfile?.model || invokeState.response?.model || "-").trim() || "-";
  const nativeSessionPanel = renderNativeSessionConsumerPanel(invokeState);

  const feedbackLines = [];
  if (message) {
    feedbackLines.push(`<div class="meta">${escapeHTML(message)}</div>`);
  }
  if (warning) {
    feedbackLines.push(`<div class="meta settings-editor-warn">Fallback: ${escapeHTML(warning)}</div>`);
  }
  if (!message && !warning) {
    feedbackLines.push(
      "<div class=\"meta\">Use this panel to verify ref resolution, routing, and provider transport behavior with the selected profile.</div>"
    );
  }

  return `
    <div class="metric settings-metric settings-metric-agent-test">
      <div class="title">Agent Invocation Test</div>
      <div class="meta">provider=${escapeHTML(provider)}; transport=${escapeHTML(transport)}; model=${escapeHTML(model)}</div>
      <div class="meta">This test uses the runtime integration invoke endpoint and the same ref:// contract as the project integration editor.</div>
      <div class="settings-editor-grid">
        <label class="field">
          <span class="label">Invoke Profile</span>
          <select id="settings-agent-test-profile" class="filter-input" data-settings-agent-test-field="agentProfileId">
            ${profileOptions}
          </select>
        </label>
        <label class="field">
          <span class="label">Max Output Tokens</span>
          <input id="settings-agent-test-max-output-tokens" class="filter-input" type="number" min="1" step="1" value="${escapeHTML(String(maxOutputTokens))}" data-settings-agent-test-field="maxOutputTokens" />
        </label>
        <label class="field field-wide">
          <span class="label">System Instructions</span>
          <span class="meta">Use this for durable behavior constraints and role guidance that should apply to the whole invoke.</span>
          <textarea id="settings-agent-test-system-prompt" class="filter-input settings-agent-test-textarea" rows="3" data-settings-agent-test-field="systemPrompt">${escapeHTML(systemPrompt)}</textarea>
        </label>
        <label class="field field-wide">
          <span class="label">Turn Prompt</span>
          <span class="meta">Use this for the actual one-off request you want the model to answer right now.</span>
          <textarea id="settings-agent-test-prompt" class="filter-input settings-agent-test-textarea" rows="5" data-settings-agent-test-field="prompt">${escapeHTML(prompt)}</textarea>
        </label>
      </div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary" type="button" data-settings-agent-test-action="invoke">Invoke Selected Agent</button>
          </div>
        </div>
        <span id="settings-agent-test-status-chip" class="${statusChipClass}">${escapeHTML(status)}</span>
      </div>
      <div id="settings-agent-test-feedback" class="stack" role="status" aria-live="polite" aria-atomic="true">
        ${feedbackLines.join("")}
      </div>
      <div class="settings-agent-test-output">
        <div class="meta">route=${escapeHTML(route || "-")}; boundary=${escapeHTML(boundaryProviderId || "-")}; finishReason=${escapeHTML(String(invokeState.response?.finishReason || "-"))}</div>
        <pre class="code-block">${escapeHTML(outputText || "No response yet.")}</pre>
        ${rawResponse ? `<details class="details-shell" data-detail-key="settings.agent_test.raw_response"><summary>Raw Response</summary><pre class="code-block">${escapeHTML(rawResponse)}</pre></details>` : ""}
      </div>
      ${nativeSessionPanel}
    </div>
  `;
}

function collectKnownLocalSecureRefs(settings) {
  const items = [];
  const seen = new Set();
  const pushItem = (ref, label, kind) => {
    const normalizedRef = String(ref || "").trim();
    if (!normalizedRef || seen.has(normalizedRef)) {
      return;
    }
    seen.add(normalizedRef);
    items.push({
      ref: normalizedRef,
      label: String(label || "Stored ref").trim() || "Stored ref",
      kind: String(kind || "value").trim() || "value"
    });
  };

  const integrations = settings?.integrations || {};
  pushItem(integrations.gatewayTokenRef, "Gateway bearer token", "credential");
  pushItem(integrations.gatewayMtlsCertRef, "Gateway mTLS cert", "credential");
  pushItem(integrations.gatewayMtlsKeyRef, "Gateway mTLS key", "credential");

  const profiles = Array.isArray(integrations.agentProfiles) ? integrations.agentProfiles : [];
  profiles.forEach((profile) => {
    const label = String(profile?.label || profile?.id || "Profile").trim() || "Profile";
    pushItem(profile?.endpointRef, `${label} endpoint`, "endpoint");
    pushItem(profile?.credentialRef, `${label} credential`, "credential");
  });

  collectAimxsKnownLocalSecureRefs(settings).forEach((item) => {
    pushItem(item.ref, item.label, item.kind);
  });
  return items;
}

function renderLocalSecureRefPanel(settings, editorState = {}) {
  const vault = settings?.localSecureRefs || {};
  const storedEntries = Array.isArray(vault.entries) ? vault.entries : [];
  const storedByRef = new Map(
    storedEntries.map((item) => [String(item?.ref || "").trim(), item]).filter(([ref]) => Boolean(ref))
  );
  const knownItems = collectKnownLocalSecureRefs(settings);
  const knownRefs = new Set(knownItems.map((item) => item.ref));
  const combinedItems = [
    ...knownItems.map((item) => ({
      ...item,
      present: Boolean(storedByRef.get(item.ref)?.present),
      updatedAt: String(storedByRef.get(item.ref)?.updatedAt || "").trim()
    })),
    ...storedEntries
      .filter((item) => !knownRefs.has(String(item?.ref || "").trim()))
      .map((item) => ({
        ref: String(item?.ref || "").trim(),
        label: "Stored extra ref",
        kind: "value",
        present: Boolean(item?.present),
        updatedAt: String(item?.updatedAt || "").trim()
      }))
  ];
  const selectedRef = String(editorState?.selectedRef || "").trim();
  const customRef = String(editorState?.customRef || "").trim();
  const secretValue = String(editorState?.secretValue || "");
  const status = String(editorState?.status || (vault.available ? "clean" : "warn")).trim().toLowerCase() || "clean";
  const statusChipClass = chipClassForEditorStatus(status);
  const statusMessage = String(editorState?.message || vault.message || "").trim() || "Store concrete local values here; project settings continue to save only ref:// pointers.";
  const helperDisabled = vault.available ? "" : "disabled";
  const optionRows = knownItems
    .map(
      (item) =>
        `<option value="${escapeHTML(item.ref)}" ${selectedAttr(selectedRef, item.ref)}>${escapeHTML(item.label)}</option>`
    )
    .join("");
  const tableRows =
    combinedItems.length > 0
      ? combinedItems
          .map((item) => {
            const updatedAt = item.updatedAt ? new Date(item.updatedAt).toISOString() : "-";
            return `
              <tr>
                ${tableCell("Purpose", escapeHTML(item.label))}
                ${tableCell("Type", escapeHTML(item.kind))}
                ${tableCell("Ref", `<code>${escapeHTML(item.ref)}</code>`)}
                ${tableCell(
                  "Stored",
                  `<span class="${item.present ? "chip chip-ok chip-compact" : "chip chip-warn chip-compact"}">${escapeHTML(item.present ? "stored" : "missing")}</span>`
                )}
                ${tableCell("Updated", escapeHTML(updatedAt))}
              </tr>
            `;
          })
          .join("")
      : `<tr>${tableCell("Status", "No local ref bindings are recorded yet. Save one below to seed the local secure store.", ' colspan="5"')}</tr>`;

  return `
    <div class="metric settings-metric settings-metric-local-secure-refs">
      <div class="title">Secure Local Credential Capture</div>
      <div class="meta">Concrete values stay outside the repo and outside the project settings draft. Use this only for the local Mac operator path.</div>
      <div class="meta">Restart terminal 1 after changes if you need the local runtime to pick up updated ref resolution.</div>
      <div class="settings-editor-grid">
        <label class="field">
          <span class="label">Known Ref</span>
          <select id="settings-local-ref-select" class="filter-input" data-settings-local-ref-field="selectedRef">
            <option value="">Select a known ref</option>
            ${optionRows}
          </select>
        </label>
        <label class="field field-wide">
          <span class="label">Custom Ref Override</span>
          <span class="meta">Optional. Use this when you need to bind a ref that is not already listed above.</span>
          <input id="settings-local-ref-custom" class="filter-input" type="text" value="${escapeHTML(customRef)}" data-settings-local-ref-field="customRef" placeholder="ref://projects/{projectId}/providers/example/api-key" />
        </label>
        <label class="field field-wide">
          <span class="label">Concrete Local Value</span>
          <span class="meta">Saved into the local secure store. The UI never writes this raw value into the ref:// settings draft.</span>
          <textarea id="settings-local-ref-value" class="filter-input settings-secret-textarea" rows="5" data-settings-local-ref-field="secretValue" ${vault.available ? "" : "disabled"}>${escapeHTML(secretValue)}</textarea>
        </label>
      </div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary" type="button" data-settings-local-ref-action="save" ${helperDisabled}>Save Secure Value</button>
          </div>
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary" type="button" data-settings-local-ref-action="delete" ${helperDisabled}>Remove Stored Value</button>
            <button class="btn btn-secondary" type="button" data-settings-local-ref-action="export" ${helperDisabled}>Export Runtime JSON</button>
            <button class="btn btn-secondary" type="button" data-settings-local-ref-action="refresh">Refresh Status</button>
          </div>
        </div>
        <span id="settings-local-ref-status-chip" class="${statusChipClass}">${escapeHTML(status)}</span>
      </div>
      <div id="settings-local-ref-feedback" class="stack" role="status" aria-live="polite" aria-atomic="true">
        <div class="meta">${escapeHTML(statusMessage)}</div>
        <div class="meta">storedCount=${escapeHTML(String(vault.storedCount || 0))}; keychainService=${escapeHTML(vault.service || "-")}</div>
        <div class="meta">indexPath=<code>${escapeHTML(vault.indexPath || "-")}</code></div>
        <div class="meta">exportPath=<code>${escapeHTML(vault.exportPath || "-")}</code></div>
        ${vault.lastExportedAt ? `<div class="meta">lastExportedAt=${escapeHTML(String(vault.lastExportedAt))}</div>` : ""}
      </div>
      <table class="data-table settings-table">
        <caption class="sr-only">Known and stored local secure ref bindings for the current settings contract.</caption>
        <thead>
          <tr>
            <th scope="col">Purpose</th>
            <th scope="col">Type</th>
            <th scope="col">Ref</th>
            <th scope="col">Stored</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function renderDemoGovernancePanel(runtimeIdentity = {}, editorState = {}) {
  const overlay = editorState?.overlay && typeof editorState.overlay === "object" ? editorState.overlay : {};
  const persona = overlay?.persona && typeof overlay.persona === "object" ? overlay.persona : {};
  const policy = overlay?.policy && typeof overlay.policy === "object" ? overlay.policy : {};
  const status = String(editorState?.status || "clean").trim().toLowerCase() || "clean";
  const statusChipClass = chipClassForEditorStatus(status);
  const feedbackLines = [];
  const message = String(editorState?.message || "").trim();
  if (message) {
    feedbackLines.push(`<div class="meta">${escapeHTML(message)}</div>`);
  }
  const errors = Array.isArray(editorState?.errors) ? editorState.errors : [];
  const warnings = Array.isArray(editorState?.warnings) ? editorState.warnings : [];
  feedbackLines.push(
    `<div class="meta">Runtime identity above remains authoritative. This overlay is local demo configuration only and does not overwrite auth-derived identity.</div>`
  );
  errors.forEach((item) => {
    feedbackLines.push(`<div class="meta settings-editor-error">Blocked: ${escapeHTML(item)}</div>`);
  });
  warnings.forEach((item) => {
    feedbackLines.push(`<div class="meta settings-editor-warn">Review before save: ${escapeHTML(item)}</div>`);
  });
  if (!message && errors.length === 0 && warnings.length === 0) {
    feedbackLines.push(
      "<div class=\"meta\">Set a local demo persona or policy overlay here when you want repeatable governed-action demos without pretending this is production identity management.</div>"
    );
  }
  feedbackLines.push(
    `<div class="meta">runtimeSubject=<code>${escapeHTML(runtimeIdentity?.identity?.subject || "-")}</code>; runtimeClientId=<code>${escapeHTML(runtimeIdentity?.identity?.clientId || "-")}</code></div>`
  );

  return `
    <div class="metric settings-metric settings-metric-demo-governance">
      <div class="metric-title-row">
        <div class="title">Local Demo Identity + Policy Overlay</div>
        <span id="settings-demo-governance-status-chip" class="${statusChipClass}">${escapeHTML(status)}</span>
      </div>
      <div class="meta">Use this only for local demo shaping on the governed-action boundary. It is not a production identity or policy editor.</div>
      <div class="settings-editor-grid">
        <label class="field field-wide">
          <span class="label">Enable Demo Persona</span>
          <input id="settings-demo-persona-enabled" type="checkbox" ${checkedAttr(Boolean(persona.enabled))} data-settings-demo-governance-field="personaEnabled" />
        </label>
        <label class="field">
          <span class="label">Persona Label</span>
          <input id="settings-demo-persona-label" class="filter-input" type="text" value="${escapeHTML(String(persona.label || "Local Demo Persona"))}" data-settings-demo-governance-field="personaLabel" />
        </label>
        <label class="field">
          <span class="label">Persona Subject ID</span>
          <input id="settings-demo-persona-subject-id" class="filter-input" type="text" value="${escapeHTML(String(persona.subjectId || ""))}" data-settings-demo-governance-field="personaSubjectId" placeholder="demo.operator.local" />
        </label>
        <label class="field">
          <span class="label">Persona Client ID</span>
          <input id="settings-demo-persona-client-id" class="filter-input" type="text" value="${escapeHTML(String(persona.clientId || ""))}" data-settings-demo-governance-field="personaClientId" placeholder="desktop-local-demo" />
        </label>
        <label class="field field-wide">
          <span class="label">Persona Roles (CSV)</span>
          <input id="settings-demo-persona-roles" class="filter-input" type="text" value="${escapeHTML(String(persona.rolesText || ""))}" data-settings-demo-governance-field="personaRolesText" placeholder="compliance.viewer, runtime.run.create" />
        </label>
        <label class="field">
          <span class="label">Tenant Scope Override</span>
          <input id="settings-demo-persona-tenant-scope" class="filter-input" type="text" value="${escapeHTML(String(persona.tenantScope || ""))}" data-settings-demo-governance-field="personaTenantScope" placeholder="tenant-local" />
        </label>
        <label class="field">
          <span class="label">Project Scope Override</span>
          <input id="settings-demo-persona-project-scope" class="filter-input" type="text" value="${escapeHTML(String(persona.projectScope || ""))}" data-settings-demo-governance-field="personaProjectScope" placeholder="project-local" />
        </label>
        <label class="field field-wide">
          <span class="label">Persona Approved For Prod</span>
          <input id="settings-demo-persona-approved-for-prod" type="checkbox" ${checkedAttr(Boolean(persona.approvedForProd))} data-settings-demo-governance-field="personaApprovedForProd" />
        </label>
      </div>
      <div class="settings-editor-grid">
        <label class="field field-wide">
          <span class="label">Enable Demo Policy Overlay</span>
          <input id="settings-demo-policy-enabled" type="checkbox" ${checkedAttr(Boolean(policy.enabled))} data-settings-demo-governance-field="policyEnabled" />
        </label>
        <label class="field">
          <span class="label">Review Mode</span>
          <select id="settings-demo-policy-review-mode" class="filter-input" data-settings-demo-governance-field="policyReviewMode">
            <option value="policy_first" ${selectedAttr(String(policy.reviewMode || ""), "policy_first")}>Policy First</option>
            <option value="manual_review" ${selectedAttr(String(policy.reviewMode || ""), "manual_review")}>Manual Review</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Policy Bucket Prefix</span>
          <input id="settings-demo-policy-bucket-prefix" class="filter-input" type="text" value="${escapeHTML(String(policy.policyBucketPrefix || "desktop-demo"))}" data-settings-demo-governance-field="policyBucketPrefix" />
        </label>
        <label class="field">
          <span class="label">Handshake Required</span>
          <input id="settings-demo-policy-handshake-required" type="checkbox" ${checkedAttr(policy.handshakeRequired !== false)} data-settings-demo-governance-field="policyHandshakeRequired" />
        </label>
        <label class="field">
          <span class="label">Advisory Auto-Shape</span>
          <input id="settings-demo-policy-advisory-auto-shape" type="checkbox" ${checkedAttr(policy.advisoryAutoShape !== false)} data-settings-demo-governance-field="policyAdvisoryAutoShape" />
        </label>
        <label class="field">
          <span class="label">Finance Supervisor Grant</span>
          <input id="settings-demo-policy-finance-supervisor-grant" type="checkbox" ${checkedAttr(policy.financeSupervisorGrant !== false)} data-settings-demo-governance-field="policyFinanceSupervisorGrant" />
        </label>
        <label class="field">
          <span class="label">Finance Evidence Readiness</span>
          <select id="settings-demo-policy-finance-evidence-readiness" class="filter-input" data-settings-demo-governance-field="policyFinanceEvidenceReadiness">
            <option value="READY" ${selectedAttr(String(policy.financeEvidenceReadiness || ""), "READY")}>READY</option>
            <option value="PARTIAL" ${selectedAttr(String(policy.financeEvidenceReadiness || ""), "PARTIAL")}>PARTIAL</option>
            <option value="MISSING" ${selectedAttr(String(policy.financeEvidenceReadiness || ""), "MISSING")}>MISSING</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Deny Prod Destructive Actions</span>
          <input id="settings-demo-policy-production-delete-deny" type="checkbox" ${checkedAttr(policy.productionDeleteDeny !== false)} data-settings-demo-governance-field="policyProductionDeleteDeny" />
        </label>
      </div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary" type="button" data-settings-demo-governance-action="save">Save Demo Overlay</button>
          </div>
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary" type="button" data-settings-demo-governance-action="reset">Reset Unsaved</button>
            <button class="btn btn-secondary" type="button" data-settings-demo-governance-action="clear">Clear Overlay</button>
          </div>
        </div>
      </div>
      <div id="settings-demo-governance-feedback" class="stack" role="status" aria-live="polite" aria-atomic="true">
        ${feedbackLines.join("")}
      </div>
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
  const agent = renderAgentProfileSummary(settings);
  const runtimePlatform = detectLocalPlatform();
  const localPaths = resolveLocalStoragePaths(runtimePlatform);
  const retention = resolveRetentionDays(settings);
  const configChanges = Array.isArray(settings.configChanges) ? settings.configChanges : [];
  const runtimeIdentity = settings?.identity && typeof settings.identity === "object" ? settings.identity : {};
  const identitySummary =
    runtimeIdentity?.identity && typeof runtimeIdentity.identity === "object"
      ? runtimeIdentity.identity
      : {};
  const policyCatalog = settings?.policyCatalog && typeof settings.policyCatalog === "object" ? settings.policyCatalog : {};
  const policyCatalogItems = Array.isArray(policyCatalog.items) ? policyCatalog.items : [];
  const policyPackRows = renderPolicyPackRows(policyCatalogItems);
  const authorityChipClass = chipClassForAuthorityBasis(runtimeIdentity?.authorityBasis);

  const endpointRows = renderEndpointMatrixRows(endpoints);
  const providerContractRows = renderProviderContractRows(providerContracts);
  const integrationEditor = renderIntegrationEditor(settings, editorState);
  const localSecureRefPanel = renderLocalSecureRefPanel(settings, viewState?.localSecureRefEditor || {});
  const integrationInvokePanel = renderIntegrationInvokePanel(settings, viewState?.agentTest || {});
  const demoGovernancePanel = renderDemoGovernancePanel(runtimeIdentity, viewState?.demoGovernance || {});
  const integrationSyncStatus = renderIntegrationSyncStatus(settings, editorState);
  const configChangeRows = renderConfigChangeRows(configChanges);
  const requestedSubview = String(viewState?.subview || "configuration").trim().toLowerCase();
  const selectedSubview = requestedSubview === "diagnostics" ? "diagnostics" : "configuration";
  const configurationClass = selectedSubview === "configuration" ? "is-active" : "";
  const diagnosticsClass = selectedSubview === "diagnostics" ? "is-active" : "";
  const settingsWorkflowPanel = renderSettingsWorkflowPanel(settings, editorState, selectedSubview);
  const aimxsSettingsMetric = renderAimxsSettingsMetric(settings, viewState, {
    chipClassForEditorStatus,
    selectedAttr
  });

  ui.settingsContent.innerHTML = `
    <div class="metric settings-metric settings-metric-scope">
      <div class="title">Settings Scope</div>
      <div class="meta">Use Configuration for editable controls and Diagnostics for health, traceability, and contract inspection.</div>
      <div class="meta">Project overrides are applied to current workspace context unless explicitly reset.</div>
    </div>
    ${settingsWorkflowPanel}
    <div class="settings-subtabs" role="tablist" aria-label="Settings views" aria-orientation="horizontal">
      <button class="settings-subtab ${configurationClass}" id="settings-subtab-configuration" role="tab" type="button" data-settings-subtab="configuration" aria-controls="settings-subpanel-configuration" aria-selected="${selectedSubview === "configuration" ? "true" : "false"}" tabindex="${selectedSubview === "configuration" ? "0" : "-1"}">Configuration</button>
      <button class="settings-subtab ${diagnosticsClass}" id="settings-subtab-diagnostics" role="tab" type="button" data-settings-subtab="diagnostics" data-advanced-section="settings" aria-controls="settings-subpanel-diagnostics" aria-selected="${selectedSubview === "diagnostics" ? "true" : "false"}" tabindex="${selectedSubview === "diagnostics" ? "0" : "-1"}">Diagnostics</button>
    </div>
    <section class="settings-subpanel settings-subpanel-configuration ${configurationClass}" id="settings-subpanel-configuration" role="tabpanel" aria-labelledby="settings-subtab-configuration" data-settings-subpanel="configuration" ${selectedSubview === "configuration" ? "" : "hidden"}>
      <div class="metric settings-metric settings-metric-routing">
        <div class="title">Model Routing + Agent Profile</div>
        <div class="meta">modelRouting=${escapeHTML(integrations.modelRouting || "-")}</div>
        <div class="meta">gatewayProviderId=${escapeHTML(integrations.gatewayProviderId || "-")}</div>
        <div class="meta">directProviderFallback=${escapeHTML(String(Boolean(integrations.allowDirectProviderFallback)))}</div>
        <div class="meta">activeAgentProfile=${escapeHTML(agent.label)} (${escapeHTML(agent.id)})</div>
        <div class="meta">profileProviderContract=${escapeHTML(agent.provider)}</div>
      </div>
      <div class="metric settings-metric settings-metric-identity-authority">
        <div class="metric-title-row">
          <div class="title">Current Identity + Authority</div>
          <span class="${authorityChipClass}">${escapeHTML(runtimeIdentity?.authorityBasis || "unknown")}</span>
        </div>
        <div class="meta">authEnabled=${escapeHTML(String(Boolean(runtimeIdentity?.authEnabled)))}; authenticated=${escapeHTML(String(Boolean(runtimeIdentity?.authenticated)))}</div>
        <div class="meta">subject=<code>${escapeHTML(identitySummary?.subject || "-")}</code>; clientId=<code>${escapeHTML(identitySummary?.clientId || "-")}</code></div>
        <div class="meta">roles=${renderDelimitedCodeList(identitySummary?.roles || [])}</div>
        <div class="meta">tenantScopes=${renderDelimitedCodeList(identitySummary?.tenantIds || [])}</div>
        <div class="meta">projectScopes=${renderDelimitedCodeList(identitySummary?.projectIds || [])}</div>
        <div class="meta">effectivePermissions=${renderDelimitedCodeList(identitySummary?.effectivePermissions || [])}</div>
      </div>
      <div class="metric settings-metric settings-metric-policy-contract">
        <div class="title">Current Policy Contract</div>
        <div class="meta">mode=${escapeHTML(displayAimxsModeLabel(settings?.aimxs?.mode || "-"))}; provider=${escapeHTML(policyProviderLabel(settings))}</div>
        <div class="meta">policyCatalogSource=${escapeHTML(summarizeDataSource(policyCatalog?.source || "unknown"))}; packCount=${escapeHTML(String(policyCatalog?.count || policyCatalogItems.length || 0))}</div>
        <div class="meta">policyMatrixRequired=${escapeHTML(String(Boolean(runtimeIdentity?.policyMatrixRequired)))}; policyRuleCount=${escapeHTML(String(runtimeIdentity?.policyRuleCount || 0))}</div>
        <div class="meta">availablePacks=${renderDelimitedCodeList(policyCatalogItems.map((item) => item?.packId || ""))}</div>
      </div>
      ${demoGovernancePanel}
      ${integrationEditor}
      ${localSecureRefPanel}
      ${integrationInvokePanel}
      <div class="metric settings-metric settings-metric-gateway">
        <div class="title">Gateway Security References</div>
        <div class="meta">gatewayTokenRef=<code>${escapeHTML(integrations.gatewayTokenRef || "-")}</code></div>
        <div class="meta">gatewayMtlsCertRef=<code>${escapeHTML(integrations.gatewayMtlsCertRef || "-")}</code></div>
        <div class="meta">gatewayMtlsKeyRef=<code>${escapeHTML(integrations.gatewayMtlsKeyRef || "-")}</code></div>
      </div>
      ${aimxsSettingsMetric}
      <div class="metric settings-metric settings-metric-runtime-defaults">
        <div class="title">Runtime Defaults + Theme</div>
        <div class="meta">realtime=${escapeHTML(realtime.mode || "-")} / ${escapeHTML(String(realtime.pollIntervalMs || "-"))}ms</div>
        <div class="meta">terminal=${escapeHTML(terminal.mode || "-")}</div>
        <div class="meta">restrictedHostMode=${escapeHTML(terminal.restrictedHostMode || "-")}</div>
        <div class="meta">themeMode=${escapeHTML(theme.mode || "-")}</div>
      </div>
      <div class="metric settings-metric settings-metric-storage">
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
    <section class="settings-subpanel settings-subpanel-diagnostics ${diagnosticsClass}" id="settings-subpanel-diagnostics" role="tabpanel" aria-labelledby="settings-subtab-diagnostics" data-settings-subpanel="diagnostics" data-advanced-section="settings" ${selectedSubview === "diagnostics" ? "" : "hidden"}>
      <div class="metric settings-metric settings-metric-data-sources">
        <div class="title">Runtime Data Sources</div>
        <div class="meta">runs=${escapeHTML(summarizeDataSource(dataSources.runs))}</div>
        <div class="meta">approvals=${escapeHTML(summarizeDataSource(dataSources.approvals))}</div>
        <div class="meta">audit=${escapeHTML(summarizeDataSource(dataSources.audit))}</div>
        <div class="meta">runtimeBase=${escapeHTML(settings.runtimeApiBaseUrl || "-")}</div>
        <div class="meta">registryBase=${escapeHTML(settings.registryApiBaseUrl || "-")}</div>
      </div>
      ${integrationSyncStatus}
      <div class="metric settings-metric settings-metric-config-changes">
        <div class="title">Recent Configuration Changes</div>
        <div class="meta">Latest local and runtime-observed settings activity for this scope. Open Audit Events to confirm the recorded runtime trail.</div>
        <div class="filter-row">
          <div class="action-hierarchy">
            <div class="action-group action-group-primary">
              <button
                class="btn btn-primary btn-small"
                type="button"
                data-settings-config-open-audit="1"
                data-settings-config-event=""
                data-settings-config-provider=""
                data-settings-config-decision=""
              >Open Audit Events</button>
            </div>
          </div>
        </div>
        <table class="data-table settings-table">
          <caption class="sr-only">Recent configuration changes for the current settings scope, including timestamp, change, scope, actor, source, status, and audit action.</caption>
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Change</th>
              <th scope="col">Scope</th>
              <th scope="col">Actor</th>
              <th scope="col">Source</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>${configChangeRows}</tbody>
        </table>
      </div>
      <div class="metric settings-metric settings-metric-provider-contracts">
        <div class="title">Provider Contract Matrix</div>
        <table class="data-table settings-table">
          <caption class="sr-only">Provider contract matrix for the current scope, including profile, contract, transport, model, references, scope, and status.</caption>
          <thead>
            <tr>
              <th scope="col">Profile</th>
              <th scope="col">Contract</th>
              <th scope="col">Transport</th>
              <th scope="col">Model</th>
              <th scope="col">Endpoint Reference</th>
              <th scope="col">Credential Reference</th>
              <th scope="col">Scope</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>${providerContractRows || `<tr>${tableCell("Status", "No provider contracts are populated for the current scope. Select an agent profile or apply integration settings, then reopen Diagnostics.", ' colspan="8"')}</tr>`}</tbody>
        </table>
      </div>
      <div class="metric settings-metric settings-metric-runtime-identity">
        <div class="title">Runtime Identity Contract</div>
        <div class="meta">source=${escapeHTML(runtimeIdentity?.source || "-")}; authEnabled=${escapeHTML(String(Boolean(runtimeIdentity?.authEnabled)))}; authenticated=${escapeHTML(String(Boolean(runtimeIdentity?.authenticated)))}</div>
        <div class="meta">authorityBasis=${escapeHTML(runtimeIdentity?.authorityBasis || "-")}; roleClaim=${escapeHTML(runtimeIdentity?.roleClaim || "-")}; clientIdClaim=${escapeHTML(runtimeIdentity?.clientIdClaim || "-")}</div>
        <div class="meta">tenantClaim=${escapeHTML(runtimeIdentity?.tenantClaim || "-")}; projectClaim=${escapeHTML(runtimeIdentity?.projectClaim || "-")}</div>
        <div class="meta">claimKeys=${renderDelimitedCodeList(identitySummary?.claimKeys || [])}</div>
      </div>
      <div class="metric settings-metric settings-metric-policy-packs">
        <div class="title">Policy Pack Catalog</div>
        <div class="meta">Selected provider and policy mode are shown above; this table shows the runtime-native pack catalog currently exposed to the desktop surface.</div>
        <table class="data-table settings-table">
          <caption class="sr-only">Policy pack catalog for the current desktop surface, including pack id, label, role bundles, decision surfaces, and boundary requirements.</caption>
          <thead>
            <tr>
              <th scope="col">Pack</th>
              <th scope="col">Label</th>
              <th scope="col">Role Bundles</th>
              <th scope="col">Decision Surfaces</th>
              <th scope="col">Boundary Requirements</th>
            </tr>
          </thead>
          <tbody>${policyPackRows || `<tr>${tableCell("Status", "No policy packs are loaded for the current desktop surface. Refresh Diagnostics, then verify the runtime policy-pack endpoint and current scope.", ' colspan="5"')}</tr>`}</tbody>
        </table>
      </div>
      ${renderAimxsStatusMetric(settings, chipClassForEndpointState)}
      <div class="metric settings-metric settings-metric-endpoints">
        <div class="title">Endpoint Contract Matrix</div>
        <table class="data-table settings-table">
          <caption class="sr-only">Endpoint contract matrix for the current scope, including endpoint, status, path, detail, and update time.</caption>
          <thead>
            <tr>
              <th scope="col">Endpoint</th>
              <th scope="col">Status</th>
              <th scope="col">Path</th>
              <th scope="col">Detail</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>${endpointRows || `<tr>${tableCell("Status", "No endpoint status rows are available for the current scope. Refresh the workspace, then verify provider readiness and runtime endpoint health.", ' colspan="5"')}</tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}
