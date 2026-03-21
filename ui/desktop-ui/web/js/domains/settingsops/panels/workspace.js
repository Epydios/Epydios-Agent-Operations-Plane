import { renderAimxsSettingsMetric } from "../../../aimxs/settings-view.js";
import { escapeHTML } from "../../../views/common.js";
import {
  renderIntegrationEditor,
  renderIntegrationSyncStatus,
  renderLocalSecureRefPanel
} from "../../../views/settings.js";
import { createSettingsWorkspaceSnapshot } from "../state.js";

function chipClassForTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  if (tone === "ok") {
    return "chip chip-ok chip-compact";
  }
  if (tone === "warn" || tone === "error") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
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

function selectedAttr(current, target) {
  return String(current || "").trim().toLowerCase() === String(target || "").trim().toLowerCase()
    ? "selected"
    : "";
}

function renderValuePills(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const value = String(item?.value || "").trim();
      if (!label || !value) {
        return "";
      }
      return `
        <span class="settingsops-value-pill">
          <span class="settingsops-value-key">${escapeHTML(label)}</span>
          <span class="settingsops-value-text${item?.code ? " settingsops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="settingsops-empty">not available</span>';
  }
  return `<div class="settingsops-value-group">${values.join("")}</div>`;
}

function renderKeyValueRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const label = String(row?.label || "").trim();
      const value = String(row?.value || "").trim();
      if (!label) {
        return "";
      }
      return `
        <div class="settingsops-row">
          <div class="settingsops-row-label">${escapeHTML(label)}</div>
          <div class="settingsops-row-value">${value || '<span class="settingsops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function chipClassForEndpointState(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "available" || state === "mock" || state === "ready") {
    return "chip chip-ok chip-compact";
  }
  if (state === "fallback" || state === "unknown") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-danger chip-compact";
}

function renderEndpointInventoryRows(items = []) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => {
      const endpointID = String(item?.id || "").trim().toLowerCase();
      if (!endpointID) {
        return "";
      }
      return `
        <tr data-settings-endpoint-id="${escapeHTML(endpointID)}">
          <td data-label="Endpoint"><code>${escapeHTML(endpointID)}</code></td>
          <td data-label="Label">${escapeHTML(String(item?.label || endpointID))}</td>
          <td data-label="State"><span class="${chipClassForEndpointState(item?.state)}">${escapeHTML(String(item?.state || "unknown"))}</span></td>
          <td data-label="Path">${escapeHTML(String(item?.path || "-"))}</td>
          <td data-label="Detail">${escapeHTML(String(item?.detail || "-"))}</td>
        </tr>
      `;
    })
    .filter(Boolean)
    .join("");
  if (!rows) {
    return '<div class="settingsops-empty">No endpoint inventory loaded.</div>';
  }
  return `
    <div class="table-shell settingsops-endpoint-table">
      <table class="settings-table">
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Label</th>
            <th>State</th>
            <th>Path</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderAppPreferencesBoard(snapshot) {
  const board = snapshot.appPreferences;
  return `
    <article class="metric settingsops-card" data-domain-root="settingsops" data-settingsops-panel="app-preferences">
      <div class="metric-title-row">
        <div class="title">App Preferences Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="settingsops-chip-row">
        <span class="chip chip-neutral chip-compact">agent=${escapeHTML(board.selectedAgentProfileId)}</span>
        <span class="chip chip-neutral chip-compact">theme=${escapeHTML(board.themeMode)}</span>
        <span class="chip chip-neutral chip-compact">routing=${escapeHTML(board.modelRouting)}</span>
      </div>
      <div class="settingsops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Selected Defaults",
            value: renderValuePills([
              { label: "agent profile", value: board.selectedAgentLabel },
              { label: "agent id", value: board.selectedAgentProfileId, code: true },
              { label: "theme", value: board.themeMode, code: true }
            ])
          },
          {
            label: "Runtime Defaults",
            value: renderValuePills([
              { label: "realtime", value: board.realtimeMode, code: true },
              { label: "poll ms", value: board.pollIntervalMs, code: true },
              { label: "terminal", value: board.terminalMode, code: true },
              { label: "restricted host", value: board.restrictedHostMode, code: true }
            ])
          },
          {
            label: "Edit Path",
            value: '<span class="settingsops-note">Use the header controls to change theme mode and the active agent profile without opening another domain.</span>'
          }
        ])}
      </div>
    </article>
  `;
}

function renderSecureRefBoard(snapshot) {
  const board = snapshot.secureRefs;
  return `
    <article class="settingsops-region" data-domain-root="settingsops" data-settingsops-panel="secure-ref">
      <div class="settingsops-inline-summary">
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.available ? "available" : "limited")}</span>
        <span class="chip chip-neutral chip-compact">stored=${escapeHTML(String(board.storedCount))}</span>
        <span class="chip chip-neutral chip-compact">service=${escapeHTML(board.service)}</span>
      </div>
      ${renderLocalSecureRefPanel(snapshot.settings, snapshot.viewState?.localSecureRefEditor || {}, {
        title: "Secure Ref Board"
      })}
    </article>
  `;
}

function renderLocalEnvironmentBoard(snapshot) {
  const board = snapshot.localEnvironment;
  return `
    <article class="metric settingsops-card settingsops-card-environment" data-domain-root="settingsops" data-settingsops-panel="local-environment">
      <div class="metric-title-row">
        <div class="title">Local Environment Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="settingsops-chip-row">
        <span class="chip chip-neutral chip-compact">tenant=${escapeHTML(board.tenantId)}</span>
        <span class="chip chip-neutral chip-compact">project=${escapeHTML(board.projectId)}</span>
        <span class="chip chip-neutral chip-compact">aimxs=${escapeHTML(board.aimxsMode)}</span>
      </div>
      <div class="settingsops-environment-grid">
        <div class="settingsops-kv-list">
          ${renderKeyValueRows([
            {
              label: "Scope And Endpoints",
              value: renderValuePills([
                { label: "environment", value: board.environmentId, code: true },
                { label: "runtime api", value: board.runtimeApiBaseUrl, code: true },
                { label: "registry api", value: board.registryApiBaseUrl, code: true },
                { label: "platform", value: board.runtimePlatform, code: true }
              ])
            },
            {
              label: "Local Paths",
              value: renderValuePills([
                { label: "base", value: board.baseDir, code: true },
                { label: "logs", value: board.logsDir, code: true },
                { label: "exports", value: board.exportsDir, code: true }
              ])
            },
            {
              label: "Retention",
              value: renderValuePills([
                { label: "audit", value: String(board.retention.auditEvents), code: true },
                { label: "incidents", value: String(board.retention.incidentPackages), code: true },
                { label: "terminal", value: String(board.retention.terminalHistory), code: true },
                { label: "runs", value: String(board.retention.runSnapshots), code: true }
              ])
            }
          ])}
        </div>
        <div class="settingsops-aimxs-shell">
          ${renderAimxsSettingsMetric(snapshot.settings, snapshot.viewState || {}, {
            chipClassForEditorStatus,
            selectedAttr
          })}
        </div>
      </div>
    </article>
  `;
}

function renderIntegrationSettingsBoard(snapshot) {
  const board = snapshot.integrationSettings;
  return `
    <article
      id="settingsops-integration-board"
      class="metric settingsops-card settingsops-card-wide"
      data-domain-root="settingsops"
      data-settingsops-panel="integration-settings"
    >
      <div class="metric-title-row">
        <div class="title">Integration Settings Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="settingsops-chip-row">
        <span class="chip chip-neutral chip-compact">project=${escapeHTML(board.projectScope)}</span>
        <span class="chip chip-neutral chip-compact">sync=${escapeHTML(board.syncState)}</span>
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
      </div>
      <div class="settingsops-integration-grid">
        <div class="settingsops-region">
          ${renderIntegrationSyncStatus(snapshot.settings, snapshot.editorState, {
            title: "Integration Sync Summary"
          })}
        </div>
        <div class="settingsops-kv-list">
          ${renderKeyValueRows([
            {
              label: "Selected Integration Defaults",
              value: renderValuePills([
                { label: "agent", value: board.selectedAgentProfileId, code: true },
                { label: "routing", value: board.modelRouting, code: true },
                { label: "gateway", value: board.gatewayProviderId, code: true },
                {
                  label: "direct fallback",
                  value: board.directFallback ? "enabled" : "disabled",
                  code: true
                }
              ])
            },
            {
              label: "Endpoint Posture",
              value: renderValuePills([
                { label: "endpoint state", value: board.endpointState, code: true },
                { label: "detail", value: board.endpointDetail },
                { label: "tenant", value: board.scopeTenant, code: true }
              ])
            }
          ])}
        </div>
      </div>
      <div class="settingsops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Endpoint Inventory",
            value: renderEndpointInventoryRows(board.endpoints)
          }
        ])}
      </div>
      <div class="settingsops-region">
        ${renderIntegrationEditor(snapshot.settings, snapshot.editorState, {
          title: "Project Integration Editor"
        })}
      </div>
    </article>
  `;
}

function renderSettingsWorkflowRecoveryBoard(snapshot) {
  const board = snapshot.workflowRecovery;
  return `
    <article
      class="metric settingsops-card settingsops-card-wide"
      data-domain-root="settingsops"
      data-settingsops-panel="workflow-recovery"
    >
      <div class="metric-title-row">
        <div class="title">Settings Workflow Recovery</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.status)}</span>
      </div>
      <div class="settingsops-chip-row">
        <span class="chip chip-neutral chip-compact">project=${escapeHTML(board.projectScope)}</span>
        <span class="chip chip-neutral chip-compact">sync=${escapeHTML(board.syncState)}</span>
        <span class="chip chip-neutral chip-compact">endpoint=${escapeHTML(board.endpointState)}</span>
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
      </div>
      <div class="settingsops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Current Posture",
            value: `<span class="settingsops-note">${escapeHTML(board.summary)}</span>`
          },
          {
            label: "Recent Checkpoints",
            value: renderValuePills([
              { label: "draft saved", value: board.savedAt, code: true },
              { label: "applied", value: board.appliedAt, code: true }
            ])
          }
        ])}
      </div>
      <ol class="settingsops-recovery-list">
        ${board.steps
          .map(
            (step, index) => `
              <li class="settingsops-recovery-item">
                <span class="chip chip-neutral chip-compact">${escapeHTML(String(index + 1))}</span>
                <span>${escapeHTML(step)}</span>
              </li>
            `
          )
          .join("")}
      </ol>
      <div class="filter-row settingsops-action-row">
        <a class="btn btn-secondary btn-small" href="#settingsops-integration-board">Review Integration Settings Board</a>
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-settings-config-open-audit="1"
          data-settings-config-event=""
          data-settings-config-provider=""
          data-settings-config-decision=""
        >Open Audit Events</button>
      </div>
    </article>
  `;
}

export function renderSettingsWorkspace(context = {}) {
  const snapshot = createSettingsWorkspaceSnapshot(context);
  return `
    <div class="workbench-domain-shell settingsops-workspace" data-domain-root="settingsops">
      <div class="workbench-domain-cluster-grid" data-workbench-cluster-layout="split">
        <section class="workbench-domain-cluster">
          <div class="workbench-domain-cluster-header">
            <h3 class="workbench-domain-cluster-title">App And Local Environment</h3>
            <p class="workbench-domain-cluster-lead">Keep local preferences, secure refs, and the active environment together so SettingsOps still reads as a real local control surface.</p>
          </div>
          <div class="workbench-domain-cluster-body settingsops-board-grid settingsops-cluster-grid">
            ${renderAppPreferencesBoard(snapshot)}
            ${renderSecureRefBoard(snapshot)}
            ${renderLocalEnvironmentBoard(snapshot)}
          </div>
        </section>
        <section class="workbench-domain-cluster">
          <div class="workbench-domain-cluster-header">
            <h3 class="workbench-domain-cluster-title">Integrations And Recovery</h3>
            <p class="workbench-domain-cluster-lead">Review sync posture, edit integration defaults, and keep workflow recovery visible without sending these surfaces back into a generic settings bucket.</p>
          </div>
          <div class="workbench-domain-cluster-body settingsops-board-grid settingsops-cluster-grid">
            ${renderIntegrationSettingsBoard(snapshot)}
            ${renderSettingsWorkflowRecoveryBoard(snapshot)}
          </div>
        </section>
      </div>
    </div>
  `;
}
