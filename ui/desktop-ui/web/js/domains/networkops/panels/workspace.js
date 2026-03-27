import {
  chipClassForStatus,
  escapeHTML,
  renderPanelStateMetric
} from "../../../views/common.js";
import { renderAimxsRouteBoundaryBlock } from "../../../shared/components/aimxs-route-boundary.js";
import { createNetworkWorkspaceSnapshot } from "../state.js";

function chipClassForTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  if (tone === "ok") {
    return "chip chip-ok chip-compact";
  }
  if (tone === "warn") {
    return "chip chip-warn chip-compact";
  }
  if (tone === "danger" || tone === "error") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function networkAdminStatusChipClass(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "applied") {
    return "chip chip-ok chip-compact";
  }
  if (normalized === "rolled_back") {
    return "chip chip-warn chip-compact";
  }
  if (normalized === "denied") {
    return "chip chip-danger chip-compact";
  }
  if (normalized === "deferred" || normalized === "escalated" || normalized === "routed" || normalized === "simulated") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
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
        <span class="networkops-value-pill">
          <span class="networkops-value-key">${escapeHTML(label)}</span>
          <span class="networkops-value-text${item?.code ? " networkops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="networkops-empty">not available</span>';
  }
  return `<div class="networkops-value-group">${values.join("")}</div>`;
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
        <div class="networkops-row">
          <div class="networkops-row-label">${escapeHTML(label)}</div>
          <div class="networkops-row-value">${value || '<span class="networkops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderSelectOptions(options = [], selectedValue = "", placeholder = "") {
  const values = (Array.isArray(options) ? options : [])
    .map((item) => {
      const value = String(item?.value || "").trim();
      const label = String(item?.label || value).trim();
      if (!value) {
        return "";
      }
      return `<option value="${escapeHTML(value)}"${value === selectedValue ? " selected" : ""}>${escapeHTML(label)}</option>`;
    })
    .filter(Boolean)
    .join("");
  return `${placeholder ? `<option value="">${escapeHTML(placeholder)}</option>` : ""}${values}`;
}

function renderEndpointPills(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const state = String(item?.state || "").trim();
      const path = String(item?.path || "").trim();
      if (!label) {
        return "";
      }
      return `
        <div class="networkops-endpoint-pill">
          <div class="networkops-endpoint-topline">
            <span class="networkops-endpoint-label">${escapeHTML(label)}</span>
            <span class="${chipClassForStatus(state)} chip-compact">${escapeHTML(state)}</span>
          </div>
          <div class="networkops-endpoint-path">${path ? `<code>${escapeHTML(path)}</code>` : '<span class="networkops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="networkops-empty">not available</span>';
  }
  return `<div class="networkops-endpoint-group">${values.join("")}</div>`;
}

function renderTopologyPaths(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      if (!label) {
        return "";
      }
      return `
        <div class="networkops-topology-pill">
          <div class="networkops-topology-label">${escapeHTML(label)}</div>
          <div class="networkops-topology-values">
            ${renderValuePills([
              { label: "route", value: item?.route || "-", code: true },
              { label: "endpoint", value: item?.endpoint || "-", code: true },
              { label: "transport", value: item?.transport || "-", code: true }
            ])}
          </div>
        </div>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="networkops-empty">not available</span>';
  }
  return `<div class="networkops-topology-group">${values.join("")}</div>`;
}

function renderFeedbackPanel(snapshot) {
  const feedback = snapshot?.admin?.feedback;
  if (!feedback?.message) {
    return "";
  }
  const tone = String(feedback.tone || "info").trim().toLowerCase();
  const state =
    tone === "ok"
      ? "success"
      : tone === "error"
        ? "error"
        : tone === "warn"
          ? "warn"
          : "info";
  const title =
    tone === "ok"
      ? "NetworkOps Action Complete"
      : tone === "error"
        ? "NetworkOps Action Failed"
        : tone === "warn"
          ? "NetworkOps Action Needs Review"
          : "NetworkOps Action";
  return `
    <div class="networkops-feedback-panel">
      ${renderPanelStateMetric(state, title, feedback.message)}
    </div>
  `;
}

function renderNetworkAdminActionRow(changeId = "") {
  const attrs = changeId ? ` data-networkops-admin-id="${escapeHTML(changeId)}"` : "";
  return `
    <div class="networkops-action-row">
      <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="save-draft"${attrs}>Save Draft</button>
      <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="simulate-draft"${attrs}>Run Dry-Run</button>
      <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="route-draft"${attrs}>Route To Governance</button>
    </div>
  `;
}

function renderAdminChangeQueueBoard(snapshot) {
  const admin = snapshot.admin || {};
  const items = Array.isArray(admin.queueItems) ? admin.queueItems : [];
  const selectedChangeId = String(admin.selectedChangeId || "").trim();
  const queueMarkup =
    items.length > 0
      ? items
          .map((item) => {
            const id = String(item?.id || "").trim();
            if (!id) {
              return "";
            }
            const normalizedStatus = String(item?.status || "").trim().toLowerCase();
            const shouldOpenGovernance =
              normalizedStatus === "routed" ||
              normalizedStatus === "approved" ||
              normalizedStatus === "applied" ||
              normalizedStatus === "denied" ||
              normalizedStatus === "deferred" ||
              normalizedStatus === "escalated";
            return `
              <article class="networkops-queue-card">
                <div class="metric-title-row">
                  <div class="title"><code>${escapeHTML(id)}</code></div>
                  <span class="${networkAdminStatusChipClass(item?.status)}">${escapeHTML(String(item?.status || "draft").trim() || "draft")}</span>
                </div>
                <div class="networkops-chip-row">
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.changeKind || "probe").trim() || "probe")}</span>
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.boundaryPathId || item?.subjectId || "-").trim() || "-")}</span>
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.targetEndpointId || "-").trim() || "-")}</span>
                </div>
                <div class="networkops-kv-list">
                  ${renderKeyValueRows([
                    {
                      label: "Target",
                      value: renderValuePills([
                        { label: item?.subjectLabel || "boundary", value: String(item?.subjectId || "-").trim() || "-", code: true },
                        { label: "endpoint", value: String(item?.targetEndpointId || "-").trim() || "-", code: true },
                        { label: item?.targetLabel || "scope", value: String(item?.targetScope || "-").trim() || "-", code: true },
                        { label: "updated", value: String(item?.updatedAt || "-").trim() || "-" }
                      ])
                    },
                    {
                      label: "Reason",
                      value: escapeHTML(String(item?.reason || "").trim() || "-")
                    },
                    {
                      label: "Dry-Run",
                      value: escapeHTML(String(item?.simulationSummary || "").trim() || "pending")
                    }
                  ])}
                </div>
                <div class="networkops-action-row">
                  <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="select-queue-item" data-networkops-admin-id="${escapeHTML(id)}">Select Proposal</button>
                  <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="simulate-queue-item" data-networkops-admin-id="${escapeHTML(id)}">Refresh Dry-Run</button>
                  <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="${shouldOpenGovernance ? "open-governance" : "route-queue-item"}" data-networkops-admin-id="${escapeHTML(id)}">${shouldOpenGovernance ? "Open GovernanceOps" : "Route To Governance"}</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `
          <div class="networkops-kv-list">
            <div class="networkops-row">
              <div class="networkops-row-label">Status</div>
              <div class="networkops-row-value"><span class="networkops-empty">No bounded network probe proposal is queued yet.</span></div>
            </div>
          </div>
        `;
  return `
    <article class="metric networkops-card networkops-card-wide" data-domain-root="networkops" data-networkops-panel="admin-change-queue">
      <div class="metric-title-row">
        <div class="title">Admin Change Queue</div>
        <span class="chip chip-neutral chip-compact">probe-only</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">queued=${escapeHTML(String(items.length))}</span>
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(selectedChangeId || "none")}</span>
      </div>
      <div class="networkops-queue-grid">${queueMarkup}</div>
    </article>
  `;
}

function renderProbeRequestDraftBoard(snapshot) {
  const admin = snapshot.admin || {};
  const draft = admin.draft || {};
  const currentScope = admin.currentScope || {};
  const selectedChangeId = String(admin.selectedChangeId || "").trim();
  return `
    <article class="metric networkops-card networkops-card-wide" data-domain-root="networkops" data-networkops-panel="probe-request-draft">
      <div class="metric-title-row">
        <div class="title">Probe Request Draft</div>
        <span class="${networkAdminStatusChipClass(admin.selectedQueueItem?.status || "draft")}">${escapeHTML(admin.selectedQueueItem?.status || "draft")}</span>
      </div>
      ${renderNetworkAdminActionRow(selectedChangeId)}
      <div class="networkops-admin-form">
        <label class="field">
          <span class="label">Change Kind</span>
          <input class="filter-input" type="text" value="probe" disabled />
        </label>
        <label class="field">
          <span class="label">Boundary Path</span>
          <select class="filter-input" data-networkops-draft-field="boundaryPathId">
            ${renderSelectOptions(currentScope.boundaryPathOptions, draft.boundaryPathId, "Select a bounded path")}
          </select>
        </label>
        <label class="field">
          <span class="label">Target Endpoint</span>
          <select class="filter-input" data-networkops-draft-field="targetEndpointId">
            ${renderSelectOptions(currentScope.endpointOptions, draft.targetEndpointId, "Select a loaded endpoint")}
          </select>
        </label>
        <label class="field">
          <span class="label">Target Scope</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.targetScope || "")}" data-networkops-draft-field="targetScope" placeholder="bounded environment or workspace scope" />
        </label>
        <label class="field networkops-field-wide">
          <span class="label">Reason</span>
          <textarea class="composer-textarea" rows="3" data-networkops-draft-field="reason">${escapeHTML(draft.reason || "")}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renderBoundaryTargetScopeBoard(snapshot) {
  const admin = snapshot.admin || {};
  const draft = admin.draft || {};
  const currentScope = admin.currentScope || {};
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="boundary-target-scope">
      <div class="metric-title-row">
        <div class="title">Boundary And Target Scope</div>
        <span class="chip chip-neutral chip-compact">bounded target</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Current Boundary",
            value: renderValuePills([
              { label: "path", value: currentScope.currentBoundaryPath || "-", code: true },
              { label: "label", value: currentScope.currentBoundaryLabel || "-" },
              { label: "route", value: currentScope.currentBoundaryRoute || "-", code: true },
              { label: "endpoint", value: currentScope.currentBoundaryEndpoint || "-", code: true }
            ])
          },
          {
            label: "Draft Target",
            value: renderValuePills([
              { label: "change", value: draft.changeKind || "probe" },
              { label: "boundary", value: draft.boundaryPathId || "-", code: true },
              { label: "endpoint", value: draft.targetEndpointId || "-", code: true },
              { label: "scope", value: draft.targetScope || "-", code: true }
            ])
          },
          {
            label: "Endpoint And Provider Posture",
            value: renderValuePills([
              { label: "reachable", value: String(currentScope.reachableEndpointCount || 0) },
              { label: "warn", value: String(currentScope.warnCount || 0) },
              { label: "error", value: String(currentScope.errorCount || 0) },
              { label: "degraded providers", value: String(currentScope.degradedProviderCount || 0) }
            ])
          },
          {
            label: "Transport And Trust Signals",
            value: renderValuePills([
              { label: "transport", value: currentScope.firstTransport || "-", code: true },
              { label: "fallback", value: currentScope.directFallbackState || "-" },
              { label: "trust mode", value: currentScope.secureMode || "-", code: true },
              { label: "trust warnings", value: String(currentScope.trustWarningCount || 0) }
            ])
          },
          {
            label: "Boundary Signals",
            value: renderValuePills([
              { label: "provider", value: currentScope.selectedProviderId || "-", code: true },
              { label: "boundary req", value: currentScope.firstBoundaryRequirement || "-", code: true },
              { label: "policy route", value: currentScope.latestPolicyRoute || "-", code: true },
              { label: "desktop route", value: currentScope.latestDesktopRoute || "-", code: true }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

function renderImpactPreviewBoard(snapshot) {
  const simulation = snapshot?.admin?.latestSimulation;
  const selectedChangeId = String(snapshot?.admin?.selectedChangeId || "").trim();
  if (!simulation) {
    return `
      <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="impact-preview">
        <div class="metric-title-row">
          <div class="title">Impact Preview</div>
          <span class="chip chip-neutral chip-compact">dry-run pending</span>
        </div>
        <div class="networkops-kv-list">
          <div class="networkops-row">
            <div class="networkops-row-label">Preview</div>
            <div class="networkops-row-value"><span class="networkops-empty">Run a bounded dry-run from the active probe draft before routing it to GovernanceOps.</span></div>
          </div>
        </div>
      </article>
    `;
  }
  const findings = Array.isArray(simulation.findings) ? simulation.findings : [];
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="impact-preview">
      <div class="metric-title-row">
        <div class="title">Impact Preview</div>
        <span class="${chipClassForTone(simulation.tone)}">${escapeHTML(simulation.tone || "info")}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(simulation.kind || "network")}</span>
        <span class="chip chip-neutral chip-compact">proposal=${escapeHTML(simulation.changeId || "pending")}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Dry-Run Summary",
            value: escapeHTML(simulation.summary || "-")
          },
          {
            label: "Impact Facts",
            value: renderValuePills(simulation.facts || [])
          },
          {
            label: "Updated",
            value: escapeHTML(String(simulation.updatedAt || "").trim() || "-")
          }
        ])}
      </div>
      <div class="networkops-subsection">
        <div class="networkops-subtitle">Findings</div>
        ${
          findings.length > 0
            ? `<ul class="networkops-findings-list">${findings.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`
            : '<div class="networkops-empty">No bounded findings were produced.</div>'
        }
      </div>
      <div class="networkops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="open-governance"${selectedChangeId ? ` data-networkops-admin-id="${escapeHTML(selectedChangeId)}"` : ""}>Open GovernanceOps</button>
      </div>
    </article>
  `;
}

function renderGovernanceRouteReceiptBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric networkops-card networkops-card-wide" data-domain-root="networkops" data-networkops-panel="governance-route-receipt">
        <div class="metric-title-row">
          <div class="title">Governance Route And Receipt</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="networkops-kv-list">
          <div class="networkops-row">
            <div class="networkops-row-label">Status</div>
            <div class="networkops-row-value"><span class="networkops-empty">Select or queue a bounded network probe request to review governance status, apply posture, and result receipt state.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const decision = item?.decision && typeof item.decision === "object" ? item.decision : null;
  const execution = item?.execution && typeof item.execution === "object" ? item.execution : null;
  const receipt = item?.receipt && typeof item.receipt === "object" ? item.receipt : null;
  const rollback = item?.rollback && typeof item.rollback === "object" ? item.rollback : null;
  const status = String(item?.status || "").trim().toLowerCase() || "draft";
  const canApply = status === "approved" && Boolean(decision?.approvalReceiptId) && !receipt?.receiptId;
  return `
    <article class="metric networkops-card networkops-card-wide" data-domain-root="networkops" data-networkops-panel="governance-route-receipt">
      <div class="metric-title-row">
        <div class="title">Governance Route And Receipt</div>
        <span class="${networkAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(String(item?.id || "").trim() || "-")}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(String(item?.kind || "network").trim() || "network")}</span>
        ${decision?.approvalReceiptId ? '<span class="chip chip-ok chip-compact">approval receipt</span>' : '<span class="chip chip-neutral chip-compact">decision pending</span>'}
        ${receipt?.receiptId ? '<span class="chip chip-ok chip-compact">result receipt</span>' : '<span class="chip chip-neutral chip-compact">apply pending</span>'}
        ${rollback?.rollbackId ? `<span class="${networkAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "rollback")}</span>` : '<span class="chip chip-neutral chip-compact">recovery pending</span>'}
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Route Status",
            value: renderValuePills([
              { label: "routed", value: String(item?.routedAt || "-").trim() || "-" },
              { label: "summary", value: String(item?.summary || "-").trim() || "-" },
              { label: "simulation", value: String(item?.simulationSummary || "-").trim() || "-" }
            ])
          },
          {
            label: "Governance Decision",
            value: renderValuePills([
              { label: "decision", value: String(decision?.status || "-").trim() || "-" },
              { label: "decision id", value: String(decision?.decisionId || "-").trim() || "-", code: true },
              { label: "approval receipt", value: String(decision?.approvalReceiptId || "-").trim() || "-", code: true },
              { label: "decided", value: String(decision?.decidedAt || "-").trim() || "-" }
            ])
          },
          {
            label: "Decision Reason",
            value: escapeHTML(String(decision?.reason || item?.reason || "").trim() || "-")
          },
          {
            label: "Probe Execution",
            value: renderValuePills([
              { label: "execution", value: String(execution?.executionId || "-").trim() || "-", code: true },
              { label: "status", value: String(execution?.status || "-").trim() || "-" },
              { label: "executed", value: String(execution?.executedAt || "-").trim() || "-" },
              { label: "actor", value: String(execution?.actorRef || "-").trim() || "-", code: true }
            ])
          },
          {
            label: "Probe Result Receipt",
            value: renderValuePills([
              { label: "receipt", value: String(receipt?.receiptId || "-").trim() || "-", code: true },
              { label: "issued", value: String(receipt?.issuedAt || "-").trim() || "-" },
              { label: "stable ref", value: String(receipt?.stableRef || "-").trim() || "-", code: true },
              { label: "approval receipt", value: String(receipt?.approvalReceiptId || "-").trim() || "-", code: true }
            ])
          }
        ])}
      </div>
      <div class="networkops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="open-governance" data-networkops-admin-id="${escapeHTML(String(item.id || "").trim())}">Open GovernanceOps</button>
        <button class="btn btn-ok btn-small" type="button" data-networkops-admin-action="apply-approved-change" data-networkops-admin-id="${escapeHTML(String(item.id || "").trim())}"${canApply ? "" : " disabled"}>Apply Approved Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="copy-governance-receipt" data-networkops-admin-id="${escapeHTML(String(item.id || "").trim())}"${decision?.approvalReceiptId ? "" : " disabled"}>Copy Governance Receipt</button>
        <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="copy-result-receipt" data-networkops-admin-id="${escapeHTML(String(item.id || "").trim())}"${receipt?.receiptId ? "" : " disabled"}>Copy Result Receipt</button>
      </div>
    </article>
  `;
}

function renderRollbackHistoryBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric networkops-card networkops-card-wide" data-domain-root="networkops" data-networkops-panel="rollback-history">
        <div class="metric-title-row">
          <div class="title">Rollback And History</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="networkops-kv-list">
          <div class="networkops-row">
            <div class="networkops-row-label">Status</div>
            <div class="networkops-row-value"><span class="networkops-empty">Select an applied network admin proposal to review recovery posture, bounded history, and rollback actions.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const decision = item?.decision && typeof item.decision === "object" ? item.decision : null;
  const execution = item?.execution && typeof item.execution === "object" ? item.execution : null;
  const receipt = item?.receipt && typeof item.receipt === "object" ? item.receipt : null;
  const rollback = item?.rollback && typeof item.rollback === "object" ? item.rollback : null;
  const status = String(item?.status || "").trim().toLowerCase() || "draft";
  const canRollback = status === "applied" && Boolean(receipt?.receiptId) && !rollback?.rollbackId;
  const recoveryReason = String(snapshot?.admin?.recoveryReason || "").trim();
  const historyItems = [
    {
      label: "Proposal",
      at: item?.createdAt || item?.updatedAt,
      summary: item?.summary
    },
    {
      label: "Simulation",
      at: item?.simulatedAt,
      summary: item?.simulationSummary
    },
    {
      label: "Governance Route",
      at: item?.routedAt,
      summary: item?.routedAt ? "Routed to GovernanceOps." : ""
    },
    {
      label: "Governance Decision",
      at: decision?.decidedAt,
      summary: decision?.status ? `${decision.status}: ${decision.reason || "-"}` : ""
    },
    {
      label: "Execution",
      at: execution?.executedAt,
      summary: execution?.summary
    },
    {
      label: "Result Receipt",
      at: receipt?.issuedAt,
      summary: receipt?.stableRef
    },
    {
      label: "Rollback",
      at: rollback?.rolledBackAt,
      summary: rollback?.summary
    }
  ].filter((entry) => entry.at || entry.summary);
  const historyMarkup =
    historyItems.length > 0
      ? `<div class="networkops-history-list">${historyItems
          .map(
            (entry) => `
              <div class="networkops-history-item">
                <div class="networkops-history-stage">${escapeHTML(entry.label)}</div>
                <div class="networkops-history-time">${escapeHTML(entry.at || "-")}</div>
                <div class="networkops-history-summary">${escapeHTML(entry.summary || "-")}</div>
              </div>
            `
          )
          .join("")}</div>`
      : '<div class="networkops-empty">No bounded network admin history is available yet.</div>';

  return `
    <article class="metric networkops-card networkops-card-wide" data-domain-root="networkops" data-networkops-panel="rollback-history">
      <div class="metric-title-row">
        <div class="title">Rollback And History</div>
        <span class="${networkAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(String(item?.id || "").trim() || "-")}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(String(item?.kind || "network").trim() || "network")}</span>
        ${rollback?.rollbackId ? `<span class="${networkAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "rollback")}</span>` : `<span class="chip chip-neutral chip-compact">${escapeHTML(canRollback ? "rollback available" : "recovery pending")}</span>`}
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Recovery Posture",
            value: renderValuePills([
              { label: "state", value: rollback?.status || (canRollback ? "rollback available" : "recovery pending") },
              { label: "action", value: rollback?.action || (canRollback ? "rollback" : "") },
              { label: "record", value: rollback?.rollbackId, code: true },
              { label: "stable ref", value: rollback?.stableRef, code: true }
            ])
          },
          {
            label: "Recovery Reason",
            value: rollback?.reason ? escapeHTML(rollback.reason) : '<span class="networkops-empty">A bounded reason is required before rollback can execute.</span>'
          },
          {
            label: "Stable History",
            value: historyMarkup
          }
        ])}
      </div>
      <label class="field networkops-field-wide">
        <span class="label">Rollback Reason</span>
        <input
          class="filter-input"
          type="text"
          value="${escapeHTML(recoveryReason)}"
          placeholder="required; explain the rollback action"
          data-networkops-admin-recovery-reason
        />
      </label>
      <div class="networkops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="rollback-applied-change" data-networkops-admin-id="${escapeHTML(String(item?.id || "").trim() || "")}"${canRollback ? "" : " disabled"}>Rollback Applied Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-networkops-admin-action="copy-rollback-receipt" data-networkops-admin-id="${escapeHTML(String(item?.id || "").trim() || "")}"${rollback?.rollbackId ? "" : " disabled"}>Copy Rollback Receipt</button>
      </div>
    </article>
  `;
}

function renderNetworkBoundaryBoard(snapshot) {
  const board = snapshot.networkBoundary;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="network-boundary">
      <div class="metric-title-row">
        <div class="title">Network Boundary Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">mode=${escapeHTML(board.activeMode)}</span>
        <span class="chip chip-neutral chip-compact">routes=${escapeHTML(String(board.routeCount))}</span>
        <span class="chip chip-neutral chip-compact">boundaries=${escapeHTML(String(board.boundaryRequirementCount))}</span>
        <span class="chip chip-neutral chip-compact">transports=${escapeHTML(String(board.transportCount))}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Boundary Selection",
            value: renderValuePills([
              { label: "environment", value: board.environment, code: true },
              { label: "provider", value: board.selectedProviderId, code: true },
              { label: "auth", value: board.authMode }
            ])
          },
          {
            label: "Route Posture",
            value: renderValuePills([
              { label: "routing", value: board.modelRouting },
              { label: "gateway", value: board.gatewayProviderId, code: true },
              { label: "fallback", value: board.allowDirectProviderFallback ? "allowed" : "bounded" }
            ])
          },
          {
            label: "Boundary Signals",
            value: renderValuePills([
              { label: "requirements", value: String(board.boundaryRequirementCount) },
              { label: "first boundary", value: board.firstBoundaryRequirement, code: true },
              { label: "first transport", value: board.firstTransport, code: true },
              { label: "contracts", value: String(board.providerContractCount) }
            ])
          },
          {
            label: "Provider Health",
            value: renderValuePills([
              { label: "ready", value: String(board.readyProviderCount) },
              { label: "degraded", value: String(board.degradedProviderCount) },
              { label: "policy route", value: board.latestPolicyRoute, code: true },
              { label: "desktop route", value: board.latestDesktopRoute, code: true }
            ])
          },
          {
            label: "Provider Detail",
            value: renderValuePills([{ label: "detail", value: board.providersDetail }])
          }
        ])}
      </div>
    </article>
  `;
}

function renderEndpointReachabilityBoard(snapshot) {
  const board = snapshot.endpointReachability;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="endpoint-reachability">
      <div class="metric-title-row">
        <div class="title">Endpoint Reachability Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">ok=${escapeHTML(String(board.okCount))}</span>
        <span class="chip chip-neutral chip-compact">warn=${escapeHTML(String(board.warnCount))}</span>
        <span class="chip chip-neutral chip-compact">error=${escapeHTML(String(board.errorCount))}</span>
        <span class="chip chip-neutral chip-compact">contracts=${escapeHTML(String(board.contractEndpointCount))}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Control Plane Paths",
            value: renderValuePills([
              { label: "runtime", value: board.runtimeApiBaseUrl, code: true },
              { label: "registry", value: board.registryApiBaseUrl, code: true }
            ])
          },
          {
            label: "Endpoint Summary",
            value: renderValuePills([
              { label: "total", value: String(board.totalCount) },
              { label: "ok", value: String(board.okCount) },
              { label: "warn", value: String(board.warnCount) },
              { label: "error", value: String(board.errorCount) },
              { label: "unknown", value: String(board.unknownCount) }
            ])
          },
          {
            label: "Contract Endpoints",
            value: renderValuePills([
              { label: "selected profile", value: board.selectedAgentProfileId, code: true },
              { label: "transport", value: board.selectedProfileTransport, code: true },
              { label: "profile endpoint", value: board.selectedProfileEndpointRef, code: true },
              { label: "aimxs endpoint", value: board.aimxsEndpointRef, code: true }
            ])
          },
          {
            label: "Primary Endpoints",
            value: renderEndpointPills(board.endpointSample)
          }
        ])}
      </div>
    </article>
  `;
}

function renderTrustAndCertificateBoard(snapshot) {
  const board = snapshot.trustAndCertificate;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="trust-certificate">
      <div class="metric-title-row">
        <div class="title">Trust And Certificate Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">mode=${escapeHTML(board.activeMode)}</span>
        <span class="chip chip-neutral chip-compact">state=${escapeHTML(board.activationState)}</span>
        <span class="chip chip-neutral chip-compact">refs=${escapeHTML(String(board.secureRefConfiguredCount))}/${escapeHTML(String(board.secureRefCount))}</span>
        <span class="chip chip-neutral chip-compact">secrets missing=${escapeHTML(String(board.secureSecretMissingCount))}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Trust Contract",
            value: renderValuePills([
              { label: "provider", value: board.selectedProviderId, code: true },
              { label: "auth", value: board.authMode },
              { label: "summary", value: board.summary }
            ])
          },
          {
            label: "AIMXS Trust Material",
            value: renderValuePills([
              { label: "endpoint", value: board.aimxsEndpointRef, code: true },
              { label: "bearer", value: board.bearerTokenRef, code: true },
              { label: "client cert", value: board.clientTlsCertRef, code: true },
              { label: "client key", value: board.clientTlsKeyRef, code: true },
              { label: "provider ca", value: board.caCertRef, code: true }
            ])
          },
          {
            label: "Gateway Trust Material",
            value: renderValuePills([
              { label: "gateway cert", value: board.gatewayMtlsCertRef, code: true },
              { label: "gateway key", value: board.gatewayMtlsKeyRef, code: true },
              { label: "gateway refs", value: String(board.gatewayRefConfiguredCount) }
            ])
          },
          {
            label: "Secret And Warning Posture",
            value: renderValuePills([
              { label: "secrets present", value: String(board.secureSecretPresentCount) },
              { label: "secrets missing", value: String(board.secureSecretMissingCount) },
              { label: "warnings", value: String(board.warningCount) },
              { label: "first warning", value: board.firstWarning }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

function renderIngressEgressBoard(snapshot) {
  const board = snapshot.ingressEgressPosture;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="ingress-egress-posture">
      <div class="metric-title-row">
        <div class="title">Egress And Ingress Posture Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">ingress=${escapeHTML(String(board.ingressRequirementCount))}</span>
        <span class="chip chip-neutral chip-compact">egress=${escapeHTML(String(board.egressRequirementCount))}</span>
        <span class="chip chip-neutral chip-compact">transports=${escapeHTML(String(board.transportCount))}</span>
        <span class="chip chip-neutral chip-compact">fallback=${escapeHTML(board.directFallbackState)}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Boundary Requirements",
            value: renderValuePills([
              { label: "all", value: String(board.allRequirementCount) },
              { label: "first ingress", value: board.firstIngressRequirement, code: true },
              { label: "first egress", value: board.firstEgressRequirement, code: true }
            ])
          },
          {
            label: "Transport Posture",
            value: renderValuePills([
              { label: "selected transport", value: board.selectedProfileTransport, code: true },
              { label: "first transport", value: board.firstTransport, code: true },
              { label: "auth", value: board.authMode },
              { label: "security", value: board.secureMode }
            ])
          },
          {
            label: "Bounded Route Posture",
            value: renderValuePills([
              { label: "policy", value: board.latestPolicyRoute, code: true },
              { label: "evidence", value: board.latestEvidenceRoute, code: true },
              { label: "desktop", value: board.latestDesktopRoute, code: true },
              { label: "warnings", value: String(board.warningCount) }
            ])
          },
          {
            label: "Provider Detail",
            value: renderValuePills([{ label: "detail", value: board.providersDetail }])
          }
        ])}
      </div>
    </article>
  `;
}

function renderTopologyBoard(snapshot) {
  const board = snapshot.connectivityTopology;
  return `
    <article class="metric networkops-card" data-domain-root="networkops" data-networkops-panel="connectivity-topology">
      <div class="metric-title-row">
        <div class="title">Connectivity Topology Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="networkops-chip-row">
        <span class="chip chip-neutral chip-compact">endpoints=${escapeHTML(String(board.endpointCount))}</span>
        <span class="chip chip-neutral chip-compact">providers=${escapeHTML(String(board.providerCount))}</span>
        <span class="chip chip-neutral chip-compact">routes=${escapeHTML(String(board.routeCount))}</span>
        <span class="chip chip-neutral chip-compact">contracts=${escapeHTML(String(board.contractCount))}</span>
      </div>
      <div class="networkops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Topology Summary",
            value: renderValuePills([
              { label: "reachable endpoints", value: String(board.reachableEndpointCount) },
              { label: "ready providers", value: String(board.readyProviderCount) },
              { label: "degraded providers", value: String(board.degradedProviderCount) },
              { label: "transports", value: String(board.transportCount) }
            ])
          },
          {
            label: "Bounded Paths",
            value: renderTopologyPaths(board.topologyPaths)
          }
        ])}
      </div>
    </article>
  `;
}

function renderAimxsRouteBoundaryBoard(snapshot) {
  const aimxsPremiumVisible = Boolean(snapshot?.aimxsPremiumVisible);
  return `
    <article class="metric networkops-card networkops-card-wide" data-domain-root="networkops" data-networkops-panel="aimxs-route-boundary">
      <div class="metric-title-row">
        <div class="title">${aimxsPremiumVisible ? "AIMXS Route And Boundary" : "Route And Boundary"}</div>
        <span class="chip chip-neutral chip-compact">primary</span>
      </div>
      ${renderAimxsRouteBoundaryBlock(snapshot.aimxsRouteBoundary)}
    </article>
  `;
}

export function renderNetworkWorkspace(context = {}) {
  const snapshot = createNetworkWorkspaceSnapshot(context);
  return `
    <section class="networkops-workspace stack" data-domain-root="networkops">
      ${renderFeedbackPanel(snapshot)}
      <div class="networkops-admin-grid">
        ${renderAdminChangeQueueBoard(snapshot)}
        ${renderProbeRequestDraftBoard(snapshot)}
        ${renderBoundaryTargetScopeBoard(snapshot)}
        ${renderImpactPreviewBoard(snapshot)}
        ${renderGovernanceRouteReceiptBoard(snapshot)}
        ${renderRollbackHistoryBoard(snapshot)}
      </div>
      <div class="networkops-primary-grid">
        ${renderNetworkBoundaryBoard(snapshot)}
        ${renderEndpointReachabilityBoard(snapshot)}
        ${renderTrustAndCertificateBoard(snapshot)}
      </div>
      <div class="networkops-secondary-grid">
        ${renderAimxsRouteBoundaryBoard(snapshot)}
        ${renderIngressEgressBoard(snapshot)}
        ${renderTopologyBoard(snapshot)}
      </div>
    </section>
  `;
}
