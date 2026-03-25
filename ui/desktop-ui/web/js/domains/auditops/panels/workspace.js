import {
  chipClassForStatus,
  escapeHTML,
  formatTime,
  renderPanelStateMetric
} from "../../../views/common.js";
import { renderAimxsLegibilityBlock } from "../../../shared/components/aimxs-legibility.js";
import { renderAimxsDecisionBindingSpine } from "../../../shared/components/aimxs-decision-binding-spine.js";
import { createAuditWorkspaceSnapshot } from "../state.js";

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

function renderValuePills(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const value = String(item?.value || "").trim();
      if (!label || !value) {
        return "";
      }
      return `
        <span class="auditops-value-pill">
          <span class="auditops-value-key">${escapeHTML(label)}</span>
          <span class="auditops-value-text${item?.code ? " auditops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="auditops-empty">not available</span>';
  }
  return `<div class="auditops-value-group">${values.join("")}</div>`;
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
        <div class="auditops-row">
          <div class="auditops-row-label">${escapeHTML(label)}</div>
          <div class="auditops-row-value">${value || '<span class="auditops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderRecentEventRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<div class="auditops-empty">No recent events in the current scope.</div>';
  }
  return `
    <div class="auditops-mini-table">
      ${rows
        .map(
          (row) => `
            <div class="auditops-mini-table-row">
              <div class="auditops-mini-time">${escapeHTML(formatTime(row.ts))}</div>
              <div class="auditops-mini-main">
                <div class="auditops-mini-title">${escapeHTML(row.event || "-")}</div>
                <div class="auditops-mini-meta">${escapeHTML(row.providerId || "-")} · ${escapeHTML(`${row.tenantId || "-"}/${row.projectId || "-"}`)}</div>
              </div>
              <div class="auditops-mini-status">
                ${row.decision ? `<span class="${chipClassForStatus(row.decision)} chip-compact">${escapeHTML(row.decision)}</span>` : '<span class="chip chip-neutral chip-compact">none</span>'}
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRecentInvestigationRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<div class="auditops-empty">No investigation packages are currently tracked.</div>';
  }
  return `
    <div class="auditops-mini-table">
      ${rows
        .map(
          (row) => `
            <div class="auditops-mini-table-row">
              <div class="auditops-mini-time">${escapeHTML(formatTime(row.generatedAt || row.filingUpdatedAt))}</div>
              <div class="auditops-mini-main">
                <div class="auditops-mini-title">${escapeHTML(row.packageId || row.id || "-")}</div>
                <div class="auditops-mini-meta">${escapeHTML(row.scope || "-")} · ${escapeHTML(row.fileName || "(unspecified)")}</div>
              </div>
              <div class="auditops-mini-status">
                <span class="${chipClassForStatus(row.filingStatus || "unknown")} chip-compact">${escapeHTML(row.filingStatus || "-")}</span>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderActionButtons(actions = []) {
  const buttons = (Array.isArray(actions) ? actions : [])
    .map((action) => {
      const label = String(action?.label || "").trim();
      const command = String(action?.command || "").trim();
      if (!label || !command) {
        return "";
      }
      return `<button class="btn btn-secondary btn-small" type="button" data-auditops-action="${escapeHTML(command)}"${action?.disabled ? " disabled" : ""}>${escapeHTML(label)}</button>`;
    })
    .filter(Boolean);
  if (buttons.length === 0) {
    return "";
  }
  return `<div class="auditops-action-row">${buttons.join("")}</div>`;
}

function renderHandoffPreview(preview) {
  const text = String(preview || "").trim();
  if (!text) {
    return "";
  }
  return `
    <div class="auditops-subsection">
      <div class="auditops-subtitle">Handoff Preview</div>
      <pre class="auditops-preview">${escapeHTML(text)}</pre>
    </div>
  `;
}

function renderFeedbackPanel(snapshot) {
  if (!snapshot.feedback?.message) {
    return "";
  }
  const tone = String(snapshot.feedback.tone || "info").trim().toLowerCase();
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
      ? "AuditOps Action Complete"
      : tone === "error"
        ? "AuditOps Action Failed"
        : tone === "warn"
          ? "AuditOps Action Needs Review"
          : "AuditOps Action";
  return `
    <div class="auditops-feedback-panel">
      ${renderPanelStateMetric(state, title, snapshot.feedback.message)}
    </div>
  `;
}

function renderAuditEventBoard(snapshot) {
  const board = snapshot.auditEventBoard;
  const rows = [
    {
      label: "Current Scope",
      value: renderValuePills([
        { label: "tenant", value: board.scope.tenant, code: true },
        { label: "project", value: board.scope.project, code: true },
        { label: "provider", value: board.scope.providerId, code: true },
        { label: "time", value: board.scope.timeWindow }
      ])
    },
    {
      label: "Top Events",
      value: renderValuePills(board.topEvents.map((item) => ({ label: item.value, value: String(item.count) })))
    },
    {
      label: "Top Providers",
      value: renderValuePills(board.topProviders.map((item) => ({ label: item.value, value: String(item.count), code: true })))
    },
    {
      label: "Latest Event",
      value: renderValuePills([
        { label: "event", value: board.latestEvent.event },
        { label: "provider", value: board.latestEvent.providerId, code: true },
        { label: "decision", value: board.latestEvent.decision || "-" },
        { label: "at", value: board.latestEvent.ts ? formatTime(board.latestEvent.ts) : "-" }
      ])
    }
  ];
  return `
    <article class="metric auditops-card" data-domain-root="auditops" data-auditops-panel="audit-event-board">
      <div class="metric-title-row">
        <div class="title">Audit Activity</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="auditops-chip-row">
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source || "-")}</span>
        <span class="chip chip-neutral chip-compact">matched=${escapeHTML(String(board.matchedCount))}</span>
        <span class="chip chip-neutral chip-compact">allow=${escapeHTML(String(board.allowCount))}</span>
        <span class="chip chip-neutral chip-compact">deny=${escapeHTML(String(board.denyCount))}</span>
      </div>
      ${board.warning ? `<div class="meta">${escapeHTML(board.warning)}</div>` : ""}
      <div class="auditops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="auditops-subsection">
        <div class="auditops-subtitle">Latest Activity</div>
        ${renderRecentEventRows(board.recentEvents)}
      </div>
    </article>
  `;
}

function renderActorActivityBoard(snapshot) {
  const board = snapshot.actorActivityBoard;
  const rows = [
    {
      label: "Current Actor",
      value: renderValuePills([
        { label: "actor", value: board.actor, code: true },
        { label: "source", value: board.source },
        { label: "matched", value: String(board.matchedCount) }
      ])
    },
    {
      label: "Scope Coverage",
      value: renderValuePills([
        { label: "tenants", value: String(board.tenantCount) },
        { label: "projects", value: String(board.projectCount) },
        { label: "providers", value: String(board.providerCount) }
      ])
    },
    {
      label: "Latest Linked Records",
      value: renderValuePills([
        { label: "run", value: board.latestRun.runId, code: true },
        { label: "run status", value: board.latestRun.status },
        { label: "approval", value: board.latestApproval.approvalId, code: true },
        { label: "approval status", value: board.latestApproval.status }
      ])
    },
    {
      label: "Top Scope Activity",
      value: renderValuePills([
        ...(board.topTenants || []).map((item) => ({ label: item.value, value: String(item.count), code: true })),
        ...(board.topProjects || []).map((item) => ({ label: item.value, value: String(item.count), code: true }))
      ])
    }
  ];
  return `
    <article class="metric auditops-card" data-domain-root="auditops" data-auditops-panel="actor-activity-board">
      <div class="metric-title-row">
        <div class="title">Actor Activity Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="auditops-chip-row">
        <span class="chip chip-neutral chip-compact">actor=${escapeHTML(board.actor || "-")}</span>
        <span class="chip chip-neutral chip-compact">runs=${escapeHTML(board.latestRun.runId ? "linked" : "none")}</span>
        <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(board.latestApproval.approvalId ? "linked" : "none")}</span>
      </div>
      <div class="auditops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="auditops-subsection">
        <div class="auditops-subtitle">Latest Actor-Linked Event</div>
        ${renderValuePills([
          { label: "event", value: board.latestEvent.event },
          { label: "tenant", value: board.latestEvent.tenantId, code: true },
          { label: "project", value: board.latestEvent.projectId, code: true },
          { label: "provider", value: board.latestEvent.providerId, code: true },
          { label: "at", value: board.latestEvent.ts ? formatTime(board.latestEvent.ts) : "-" }
        ])}
      </div>
    </article>
  `;
}

function renderDecisionTraceBoard(snapshot) {
  const board = snapshot.decisionTraceBoard;
  const rows = [
    {
      label: "Latest Decision Event",
      value: renderValuePills([
        { label: "event", value: board.latestDecisionEvent.event },
        { label: "decision", value: board.latestDecisionEvent.decision || "-" },
        { label: "provider", value: board.latestDecisionEvent.providerId, code: true },
        { label: "at", value: board.latestDecisionEvent.ts ? formatTime(board.latestDecisionEvent.ts) : "-" }
      ])
    },
    {
      label: "Run Trace",
      value: renderValuePills([
        { label: "run", value: board.latestRun.runId, code: true },
        { label: "status", value: board.latestRun.status },
        { label: "policy", value: board.latestRun.policyDecision },
        { label: "project", value: board.latestRun.projectId, code: true }
      ])
    },
    {
      label: "Approval Trace",
      value: renderValuePills([
        { label: "approval", value: board.latestApproval.approvalId, code: true },
        { label: "status", value: board.latestApproval.status },
        { label: "run", value: board.latestApproval.runId, code: true },
        { label: "reviewed", value: board.latestApproval.reviewedAt ? formatTime(board.latestApproval.reviewedAt) : "-" }
      ])
    },
    {
      label: "Decision Event Mix",
      value: renderValuePills(board.topDecisionEvents.map((item) => ({ label: item.value, value: String(item.count) })))
    }
  ];
  return `
    <article class="metric auditops-card" data-domain-root="auditops" data-auditops-panel="decision-trace-board">
      <div class="metric-title-row">
        <div class="title">Decision Trace Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="auditops-chip-row">
        <span class="chip chip-neutral chip-compact">decisionEvents=${escapeHTML(String(board.decisionEventCount))}</span>
        <span class="chip chip-neutral chip-compact">allow=${escapeHTML(String(board.allowCount))}</span>
        <span class="chip chip-neutral chip-compact">deny=${escapeHTML(String(board.denyCount))}</span>
        <span class="chip chip-neutral chip-compact">other=${escapeHTML(String(board.otherCount))}</span>
      </div>
      <div class="auditops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderAimxsDecisionBindingSpineBoard(snapshot) {
  const board = snapshot.aimxsDecisionBindingSpine;
  if (!board?.available) {
    return "";
  }
  return `
    <article class="metric auditops-card" data-domain-root="auditops" data-auditops-panel="aimxs-decision-binding-spine">
      <div class="metric-title-row">
        <div class="title">AIMXS Decision-Binding Spine</div>
        <span class="chip chip-neutral chip-compact">correlated</span>
      </div>
      ${renderAimxsDecisionBindingSpine(board)}
    </article>
  `;
}

function renderAdminLifecycleBoard(snapshot) {
  const board = snapshot.adminLifecycleBoard;
  const latest = board.latestItem || {};
  const rows = [
    {
      label: "Coverage",
      value: renderValuePills([
        { label: "queued", value: String(board.totalCount) },
        { label: "simulated", value: String(board.simulatedCount) },
        { label: "decided", value: String(board.decisionCount) },
        { label: "executed", value: String(board.executionCount) },
        { label: "recovered", value: String(board.recoveryCount) }
      ])
    },
    {
      label: "Latest Admin Trace",
      value: renderValuePills([
        { label: "change", value: latest.id, code: true },
        { label: "owner", value: latest.ownerDomain, code: true },
        { label: "action", value: latest.requestedAction },
        { label: "status", value: latest.status }
      ])
    },
    {
      label: "Lifecycle Chain",
      value: renderValuePills([
        { label: "simulated", value: latest.simulatedAt ? formatTime(latest.simulatedAt) : "-" },
        { label: "decision", value: latest.decision?.decisionId, code: true },
        { label: "approval", value: latest.decision?.approvalReceiptId, code: true },
        { label: "execution", value: latest.execution?.executionId, code: true },
        { label: "receipt", value: latest.receipt?.receiptId, code: true },
        { label: "recovery", value: latest.recovery?.recoveryId, code: true }
      ])
    },
    {
      label: "Bounded Scope",
      value: renderValuePills([
        { label: "subject", value: latest.subjectId, code: true },
        { label: "scope", value: latest.targetScope, code: true },
        { label: "reason", value: latest.reason },
        { label: "summary", value: latest.summary }
      ])
    },
    {
      label: "Top Owners",
      value: renderValuePills((board.ownerMix || []).map((item) => ({ label: item.value, value: String(item.count), code: true })))
    }
  ];
  return `
    <article class="metric auditops-card" data-domain-root="auditops" data-auditops-panel="admin-lifecycle-board">
      <div class="metric-title-row">
        <div class="title">Admin Lifecycle Trace</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="auditops-chip-row">
        <span class="chip chip-neutral chip-compact">queued=${escapeHTML(String(board.totalCount))}</span>
        <span class="chip chip-neutral chip-compact">executed=${escapeHTML(String(board.executionCount))}</span>
        <span class="chip chip-neutral chip-compact">recovered=${escapeHTML(String(board.recoveryCount))}</span>
      </div>
      <div class="auditops-kv-list">${renderKeyValueRows(rows)}</div>
      ${renderAimxsLegibilityBlock(board.aimxsLegibility)}
    </article>
  `;
}

function renderExportBoard(snapshot) {
  const board = snapshot.exportBoard;
  const rows = [
    {
      label: "Current Bundle",
      value: renderValuePills([
        { label: "actor", value: board.actor, code: true },
        { label: "source", value: board.source },
        { label: "generated", value: board.generatedAt ? formatTime(board.generatedAt) : "-" },
        { label: "matched", value: String(board.matchedCount) }
      ])
    },
    {
      label: "Export Shapes",
      value: renderValuePills([
        { label: "json rows", value: String(board.matchedCount) },
        { label: "csv lines", value: String(board.csvLineCount) },
        { label: "handoff lines", value: String(board.handoffLineCount) },
        { label: "queue packages", value: String(board.queueCount) }
      ])
    },
    {
      label: "Current Scope",
      value: renderValuePills([
        { label: "tenant", value: board.currentScope.tenant, code: true },
        { label: "project", value: board.currentScope.project, code: true },
        { label: "provider", value: board.currentScope.providerId, code: true },
        { label: "decision", value: board.currentScope.decision },
        { label: "time", value: board.currentScope.timeWindow }
      ])
    },
    {
      label: "Latest Export Anchor",
      value: renderValuePills([
        { label: "package", value: board.latestIncident.packageId, code: true },
        { label: "status", value: board.latestIncident.filingStatus },
        { label: "run", value: board.latestLinkedRun.runId, code: true },
        { label: "file", value: board.latestIncident.fileName }
      ])
    },
    {
      label: "Incident Export Readiness",
      value: renderValuePills([
        { label: "selected run", value: board.selectedRun.runId, code: true },
        { label: "status", value: board.selectedRun.status },
        { label: "policy", value: board.selectedRun.policyDecision }
      ])
    }
  ];
  return `
    <article class="metric auditops-card" data-domain-root="auditops" data-auditops-panel="export-board">
      <div class="metric-title-row">
        <div class="title">Export Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="auditops-chip-row">
        <span class="chip chip-neutral chip-compact">rows=${escapeHTML(String(board.matchedCount))}</span>
        <span class="chip chip-neutral chip-compact">csv=${escapeHTML(String(board.csvLineCount))}</span>
        <span class="chip chip-neutral chip-compact">handoff=${escapeHTML(String(board.handoffLineCount))}</span>
        <span class="chip chip-neutral chip-compact">queue=${escapeHTML(String(board.queueCount))}</span>
      </div>
      ${renderActionButtons([
        { label: "Export Audit JSON", command: "export-json", disabled: !board.canExportJson },
        { label: "Export Audit CSV", command: "export-csv", disabled: !board.canExportCsv },
        { label: "Copy Audit Handoff", command: "copy-handoff", disabled: !board.canCopyHandoff },
        { label: "Export Incident Package", command: "export-incident-package", disabled: !board.canExportIncident }
      ])}
      <div class="auditops-kv-list">${renderKeyValueRows(rows)}</div>
      ${renderHandoffPreview(snapshot.handoffPreview)}
    </article>
  `;
}

function renderInvestigationWorkspace(snapshot) {
  const board = snapshot.investigationWorkspace;
  const rows = [
    {
      label: "Queue Status",
      value: renderValuePills([
        { label: "drafted", value: String(board.draftedCount) },
        { label: "filed", value: String(board.filedCount) },
        { label: "closed", value: String(board.closedCount) },
        { label: "total", value: String(board.totalCount) }
      ])
    },
    {
      label: "Latest Package",
      value: renderValuePills([
        { label: "package", value: board.latestIncident.packageId, code: true },
        { label: "status", value: board.latestIncident.filingStatus },
        { label: "scope", value: board.latestIncident.scope, code: true },
        { label: "generated", value: board.latestIncident.generatedAt ? formatTime(board.latestIncident.generatedAt) : "-" }
      ])
    },
    {
      label: "Linked Trace",
      value: renderValuePills([
        { label: "run", value: board.latestRun.runId, code: true },
        { label: "approval", value: board.latestApproval.approvalId, code: true },
        { label: "approval status", value: board.latestApproval.status },
        { label: "audit source", value: board.latestIncident.auditSource }
      ])
    },
    {
      label: "Scope Mix",
      value: renderValuePills(board.topScopes.map((item) => ({ label: item.value, value: String(item.count), code: true })))
    }
  ];
  return `
    <article class="metric auditops-card" data-domain-root="auditops" data-auditops-panel="investigation-workspace">
      <div class="metric-title-row">
        <div class="title">Investigation Workspace</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="auditops-chip-row">
        <span class="chip chip-neutral chip-compact">drafted=${escapeHTML(String(board.draftedCount))}</span>
        <span class="chip chip-neutral chip-compact">filed=${escapeHTML(String(board.filedCount))}</span>
        <span class="chip chip-neutral chip-compact">closed=${escapeHTML(String(board.closedCount))}</span>
        <span class="chip chip-neutral chip-compact">latest=${escapeHTML(board.latestIncident.packageId || "-")}</span>
      </div>
      ${renderActionButtons([
        { label: "Open IncidentOps", command: "open-incidentops", disabled: !board.canOpenIncidentOps },
        { label: "Copy Latest Handoff", command: "copy-latest-handoff", disabled: !board.canCopyLatestHandoff }
      ])}
      <div class="auditops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="auditops-subsection">
        <div class="auditops-subtitle">Recent Packages</div>
        ${renderRecentInvestigationRows(board.recentInvestigations)}
      </div>
    </article>
  `;
}

export function renderAuditWorkspace(context = {}) {
  const snapshot = createAuditWorkspaceSnapshot(context);
  return `
    <div class="stack auditops-workspace" data-domain-root="auditops">
      ${renderFeedbackPanel(snapshot)}
      ${renderAimxsDecisionBindingSpineBoard(snapshot)}
      ${renderAuditEventBoard(snapshot)}
      ${renderActorActivityBoard(snapshot)}
      ${renderDecisionTraceBoard(snapshot)}
      ${renderAdminLifecycleBoard(snapshot)}
      ${renderExportBoard(snapshot)}
      ${renderInvestigationWorkspace(snapshot)}
    </div>
  `;
}
