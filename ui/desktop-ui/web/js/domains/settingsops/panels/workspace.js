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

function renderConnectorProfileInventoryRows(items = []) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => {
      const profileID = String(item?.id || "").trim().toLowerCase();
      if (!profileID) {
        return "";
      }
      const tools = Array.isArray(item?.allowedTools) ? item.allowedTools : [];
      const scopeParts = [
        item?.databasePath && item.databasePath !== "-" ? `db=${item.databasePath}` : "",
        item?.connectionUri && item.connectionUri !== "-" ? `uri=${item.connectionUri}` : "",
        item?.rootPath && item.rootPath !== "-" ? `root=${item.rootPath}` : "",
        Array.isArray(item?.allowedOwners) && item.allowedOwners.length > 0
          ? `owners=${item.allowedOwners.join(", ")}`
          : "",
        Array.isArray(item?.allowedRepos) && item.allowedRepos.length > 0
          ? `repos=${item.allowedRepos.join(", ")}`
          : "",
        Array.isArray(item?.allowedOrigins) && item.allowedOrigins.length > 0
          ? `origins=${item.allowedOrigins.join(", ")}`
          : "",
        item?.endpointRef && item.endpointRef !== "-" ? `endpoint=${item.endpointRef}` : ""
      ]
        .filter(Boolean)
        .join(" | ");
      return `
        <tr data-settings-connector-id="${escapeHTML(profileID)}">
          <td data-label="Profile"><code>${escapeHTML(profileID)}</code></td>
          <td data-label="Label">${escapeHTML(String(item?.label || profileID))}</td>
          <td data-label="Driver">${escapeHTML(String(item?.driverLabel || item?.driver || "-"))}</td>
          <td data-label="Tools">${escapeHTML(tools.join(", ") || "-")}</td>
          <td data-label="Scope">${escapeHTML(scopeParts || "-")}</td>
          <td data-label="State"><span class="${item?.enabled === false ? "chip chip-warn chip-compact" : "chip chip-ok chip-compact"}">${escapeHTML(item?.enabled === false ? "disabled" : "enabled")}</span></td>
        </tr>
      `;
    })
    .filter(Boolean)
    .join("");
  if (!rows) {
    return '<div class="settingsops-empty">No connector profiles loaded.</div>';
  }
  return `
    <div class="table-shell settingsops-endpoint-table">
      <table class="settings-table">
        <thead>
          <tr>
            <th>Profile</th>
            <th>Label</th>
            <th>Driver</th>
            <th>Tools</th>
            <th>Scope</th>
            <th>State</th>
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
        <div class="title">App Preferences</div>
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
            label: "Daily Defaults",
            value: renderValuePills([
              { label: "agent profile", value: board.selectedAgentLabel },
              { label: "agent id", value: board.selectedAgentProfileId, code: true },
              { label: "theme", value: board.themeMode, code: true }
            ])
          },
          {
            label: "Everyday Runtime",
            value: renderValuePills([
              { label: "realtime", value: board.realtimeMode, code: true },
              { label: "poll ms", value: board.pollIntervalMs, code: true },
              { label: "terminal", value: board.terminalMode, code: true },
              { label: "restricted host", value: board.restrictedHostMode, code: true }
            ])
          },
          {
            label: "Quick Changes",
            value: '<span class="settingsops-note">Use the header controls to change theme mode and the active agent profile without leaving the current workspace.</span>'
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
        title: "Secure Refs"
      })}
    </article>
  `;
}

function renderLocalEnvironmentBoard(snapshot) {
  const board = snapshot.localEnvironment;
  return `
    <article class="metric settingsops-card settingsops-card-environment" data-domain-root="settingsops" data-settingsops-panel="local-environment">
      <div class="metric-title-row">
        <div class="title">Local Environment</div>
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
              label: "Current Workspace",
              value: renderValuePills([
                { label: "environment", value: board.environmentId, code: true },
                { label: "platform", value: board.runtimePlatform, code: true }
              ])
            },
            {
              label: "Storage Summary",
              value: renderValuePills([
                { label: "base", value: board.baseDir, code: true },
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
            },
            {
              label: "Advanced Local Details",
              value: `
                <details class="details-shell">
                  <summary>Show endpoints and local paths</summary>
                  <div class="settingsops-kv-list">
                    ${renderKeyValueRows([
                      {
                        label: "Endpoints",
                        value: renderValuePills([
                          { label: "runtime api", value: board.runtimeApiBaseUrl, code: true },
                          { label: "registry api", value: board.registryApiBaseUrl, code: true }
                        ])
                      },
                      {
                        label: "Local Paths",
                        value: renderValuePills([
                          { label: "base", value: board.baseDir, code: true },
                          { label: "logs", value: board.logsDir, code: true },
                          { label: "exports", value: board.exportsDir, code: true }
                        ])
                      }
                    ])}
                  </div>
                </details>
              `
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
        <div class="title">Supported Setup</div>
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
            title: "Setup Status"
          })}
        </div>
        <div class="settingsops-kv-list">
          ${renderKeyValueRows([
            {
              label: "Current Setup",
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
              label: "Connection Status",
              value: renderValuePills([
                { label: "endpoint state", value: board.endpointState, code: true },
                { label: "detail", value: board.endpointDetail },
                { label: "tenant", value: board.scopeTenant, code: true }
              ])
            }
          ])}
        </div>
      </div>
      <details class="details-shell">
        <summary>Show endpoint details</summary>
        <div class="settingsops-kv-list">
          ${renderKeyValueRows([
            {
              label: "Endpoint Inventory",
              value: renderEndpointInventoryRows(board.endpoints)
            }
          ])}
        </div>
      </details>
      <div class="settingsops-region">
        ${renderIntegrationEditor(snapshot.settings, snapshot.editorState, {
          title: "Supported Setup Editor"
        })}
      </div>
    </article>
  `;
}

function renderConnectorGovernanceBoard(snapshot) {
  const board = snapshot.connectorGovernance;
  const scopePills = [
    board.selectedDatabasePath !== "-" ? { label: "database", value: board.selectedDatabasePath, code: true } : null,
    board.selectedConnectionUri !== "-" ? { label: "connection", value: board.selectedConnectionUri, code: true } : null,
    board.selectedRootPath !== "-" ? { label: "root", value: board.selectedRootPath, code: true } : null,
    board.selectedEndpointRef !== "-" ? { label: "endpoint ref", value: board.selectedEndpointRef, code: true } : null,
    board.selectedCredentialRef !== "-" ? { label: "credential ref", value: board.selectedCredentialRef, code: true } : null,
    board.selectedAllowedOwners.length > 0
      ? { label: "owners", value: board.selectedAllowedOwners.join(", ") }
      : null,
    board.selectedAllowedRepos.length > 0
      ? { label: "repos", value: board.selectedAllowedRepos.join(", ") }
      : null,
    board.selectedAllowedOrigins.length > 0
      ? { label: "origins", value: board.selectedAllowedOrigins.join(", ") }
      : null
  ].filter(Boolean);
  const driverMix = board.driverLabels.length > 0 ? board.driverLabels.join(", ") : "-";
  return `
    <article
      class="metric settingsops-card settingsops-card-wide"
      data-domain-root="settingsops"
      data-settingsops-panel="connector-governance"
    >
      <div class="metric-title-row">
        <div class="title">Connector Governance</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="settingsops-chip-row">
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(board.selectedConnectorId)}</span>
        <span class="chip chip-neutral chip-compact">driver=${escapeHTML(board.selectedDriverLabel)}</span>
        <span class="chip chip-neutral chip-compact">profiles=${escapeHTML(String(board.profileCount))}</span>
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
      </div>
      <div class="settingsops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Current Connector Lane",
            value: renderValuePills([
              { label: "profile", value: board.selectedConnectorLabel },
              { label: "profile id", value: board.selectedConnectorId, code: true },
              { label: "driver", value: board.selectedDriverLabel, code: true },
              { label: "state", value: board.selectedEnabled ? "enabled" : "disabled" },
              { label: "posture", value: board.approvalPosture }
            ])
          },
          {
            label: "Allowed Tools",
            value:
              board.selectedAllowedTools.length > 0
                ? renderValuePills(
                    board.selectedAllowedTools.map((tool, index) => ({
                      label: index === 0 ? "tool" : "tool+",
                      value: tool,
                      code: true
                    }))
                  )
                : '<span class="settingsops-empty">No connector tools are configured.</span>'
          },
          {
            label: "Bounded Scope",
            value:
              scopePills.length > 0
                ? renderValuePills(scopePills)
                : '<span class="settingsops-empty">No bounded scope details are currently recorded for the selected connector.</span>'
          },
          {
            label: "Profile Coverage",
            value: renderValuePills([
              { label: "enabled", value: String(board.enabledProfileCount) },
              { label: "total", value: String(board.profileCount) },
              { label: "driver mix", value: driverMix },
              { label: "updated", value: board.updatedAt, code: true }
            ])
          }
        ])}
      </div>
      <details class="details-shell">
        <summary>Show connector profile inventory</summary>
        <div class="settingsops-kv-list">
          ${renderKeyValueRows([
            {
              label: "Connector Profiles",
              value: renderConnectorProfileInventoryRows(board.profiles)
            },
            {
              label: "Connector Endpoint",
              value: renderValuePills([
                { label: "state", value: board.endpointState, code: true },
                { label: "detail", value: board.endpointDetail },
                { label: "tenant", value: board.scopeTenant, code: true },
                { label: "project", value: board.projectScope, code: true }
              ])
            }
          ])}
        </div>
      </details>
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
        <div class="title">Setup Recovery</div>
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
        <a class="btn btn-secondary btn-small" href="#settingsops-integration-board">Review Supported Setup</a>
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-settings-config-open-audit="1"
          data-settings-config-event=""
          data-settings-config-provider=""
          data-settings-config-decision=""
        >Review Audit Trail</button>
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
            <h3 class="workbench-domain-cluster-title">Preferences And Local Environment</h3>
            <p class="workbench-domain-cluster-lead">Keep everyday preferences, secure refs, and the active workspace together so setup stays readable without hiding local ownership.</p>
          </div>
          <div class="workbench-domain-cluster-body settingsops-board-grid settingsops-cluster-grid">
            ${renderAppPreferencesBoard(snapshot)}
            ${renderSecureRefBoard(snapshot)}
            ${renderLocalEnvironmentBoard(snapshot)}
          </div>
        </section>
        <section class="workbench-domain-cluster">
          <div class="workbench-domain-cluster-header">
            <h3 class="workbench-domain-cluster-title">Supported Setup And Recovery</h3>
            <p class="workbench-domain-cluster-lead">Edit the supported workspace setup, keep recovery steps visible, and leave deeper diagnostics for the dedicated advanced lane.</p>
          </div>
          <div class="workbench-domain-cluster-body settingsops-board-grid settingsops-cluster-grid">
          ${renderIntegrationSettingsBoard(snapshot)}
          ${renderConnectorGovernanceBoard(snapshot)}
          ${renderSettingsWorkflowRecoveryBoard(snapshot)}
        </div>
      </section>
      </div>
    </div>
  `;
}
