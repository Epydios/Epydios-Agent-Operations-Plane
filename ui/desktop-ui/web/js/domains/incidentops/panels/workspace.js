import { escapeHTML, formatTime, renderPanelStateMetric } from "../../../views/common.js";
import {
  renderWorkbenchDomainCluster,
  renderWorkbenchArrivalContext,
  renderWorkbenchDomainShell
} from "../../../shell/layout/workbench-domain.js";
import { renderAimxsDecisionBindingSpine } from "../../../shared/components/aimxs-decision-binding-spine.js";
import { createIncidentOpsWorkspaceSnapshot } from "../state.js";

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
        <span class="incidentops-value-pill">
          <span class="incidentops-value-key">${escapeHTML(label)}</span>
          <span class="incidentops-value-text${item?.code ? " incidentops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="incidentops-empty">not available</span>';
  }
  return `<div class="incidentops-value-group">${values.join("")}</div>`;
}

function renderKeyValueRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const label = String(row?.label || "").trim();
      if (!label) {
        return "";
      }
      const value = String(row?.value || "").trim();
      return `
        <div class="incidentops-row">
          <div class="incidentops-row-label">${escapeHTML(label)}</div>
          <div class="incidentops-row-value">${value || '<span class="incidentops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderActionButtons(actions = []) {
  const buttons = (Array.isArray(actions) ? actions : [])
    .map((action) => {
      const label = String(action?.label || "").trim();
      const command = String(action?.command || "").trim();
      if (!label || !command) {
        return "";
      }
      const entryId = String(action?.entryId || "").trim();
      const nextStatus = String(action?.nextStatus || "").trim();
      return `
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-incidentops-action="${escapeHTML(command)}"
          ${entryId ? `data-incidentops-entry-id="${escapeHTML(entryId)}"` : ""}
          ${nextStatus ? `data-incidentops-next-status="${escapeHTML(nextStatus)}"` : ""}
          ${action?.disabled ? "disabled" : ""}
        >${escapeHTML(label)}</button>
      `;
    })
    .filter(Boolean);
  if (buttons.length === 0) {
    return "";
  }
  return `<div class="incidentops-action-row">${buttons.join("")}</div>`;
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
      ? "IncidentOps Action Complete"
      : tone === "error"
        ? "IncidentOps Action Failed"
        : tone === "warn"
          ? "IncidentOps Action Needs Review"
          : "IncidentOps Action";
  return `
    <div class="incidentops-feedback-panel">
      ${renderPanelStateMetric(state, title, snapshot.feedback.message)}
    </div>
  `;
}

function renderQueueList(items = []) {
  const list = (Array.isArray(items) ? items : [])
    .map((item) => {
      const packageId = String(item?.packageId || "").trim();
      if (!packageId) {
        return "";
      }
      return `
        <li class="incidentops-list-item${item?.isSelected ? " incidentops-list-item-selected" : ""}">
          <div class="incidentops-list-header">
            <span class="incidentops-list-id"><code>${escapeHTML(packageId)}</code></span>
            <span class="${chipClassForTone(item?.severity)}">${escapeHTML(String(item?.severity || "low"))}</span>
          </div>
          <div class="incidentops-list-meta">
            ${renderValuePills([
              { label: "status", value: item?.filingStatus || "-" },
              { label: "run", value: item?.runId || "-", code: true },
              { label: "approval", value: item?.approval?.status || item?.approvalStatus || "-" },
              { label: "scope", value: item?.scope || "-", code: true }
            ])}
          </div>
          ${renderActionButtons([
            {
              label: item?.isSelected ? "Focused" : "Focus Package",
              command: "focus-incident",
              entryId: item?.id || "",
              disabled: Boolean(item?.isSelected)
            },
            {
              label: "Open Governed Run",
              command: "open-linked-run",
              entryId: item?.id || "",
              disabled: !String(item?.runId || "").trim()
            }
          ])}
        </li>
      `;
    })
    .filter(Boolean)
    .join("");
  if (!list) {
    return '<div class="incidentops-empty">No incident continuations are ready yet.</div>';
  }
  return `<ol class="incidentops-list">${list}</ol>`;
}

function renderIncidentQueueBoard(snapshot) {
  const board = snapshot.incidentQueueBoard;
  return `
    <article class="metric incidentops-card" data-incidentops-panel="incident-queue">
      <div class="metric-title-row">
        <div class="title">Incident Continuation Queue</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="incidentops-chip-row">
        <span class="chip chip-neutral chip-compact">packages=${escapeHTML(String(board.totalCount))}</span>
        <span class="chip chip-neutral chip-compact">drafted=${escapeHTML(String(board.draftedCount))}</span>
        <span class="chip chip-neutral chip-compact">filed=${escapeHTML(String(board.filedCount))}</span>
        <span class="chip chip-neutral chip-compact">closed=${escapeHTML(String(board.closedCount))}</span>
      </div>
      <div class="incidentops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Decision And Receipt Flow",
            value: renderValuePills([
              { label: "pending approvals", value: String(board.pendingApprovalCount) },
              { label: "audit sources", value: String(board.auditSourceCount) }
            ])
          },
          {
            label: "Active Scopes",
            value: renderValuePills((board.topScopes || []).map((item) => ({ label: item.value, value: String(item.count), code: true })))
          }
        ])}
      </div>
      <div class="incidentops-subsection">
        <div class="incidentops-subtitle">Recent Continuations</div>
        ${renderQueueList(board.recentItems)}
      </div>
    </article>
  `;
}

function renderAimxsDecisionBindingSpineBoard(snapshot) {
  const board = snapshot.aimxsDecisionBindingSpine;
  if (!board?.available) {
    return "";
  }
  return `
    <article class="metric incidentops-card" data-domain-root="incidentops" data-incidentops-panel="aimxs-decision-binding-spine">
      <div class="metric-title-row">
        <div class="title">Routed Decision Spine</div>
        <span class="chip chip-neutral chip-compact">correlated</span>
      </div>
      ${renderAimxsDecisionBindingSpine(board)}
    </article>
  `;
}

function renderActiveIncidentBoard(snapshot) {
  const board = snapshot.activeIncidentBoard;
  return `
    <article class="metric incidentops-card" data-incidentops-panel="active-incident-board">
      <div class="metric-title-row">
        <div class="title">Current Incident Continuation</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.severity || "low")}</span>
      </div>
      <div class="incidentops-chip-row">
        <span class="chip chip-neutral chip-compact">${escapeHTML(board.selectedLabel || "latest")}</span>
        <span class="chip chip-neutral chip-compact">status=${escapeHTML(board.filingStatus || "drafted")}</span>
        <span class="chip chip-neutral chip-compact">matched=${escapeHTML(String(board.auditMatchedCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">approval=${escapeHTML(board.approvalStatus || "UNAVAILABLE")}</span>
      </div>
      ${renderActionButtons([
        {
          label: "Download Package",
          command: "download-incident-json",
          entryId: board.entryId,
          disabled: !board.hasPayload
        },
        {
          label: "Copy Escalation Summary",
          command: "copy-handoff-summary",
          entryId: board.entryId,
          disabled: !board.hasHandoffText
        },
        {
          label: "Open Governed Run",
          command: "open-linked-run",
          entryId: board.entryId,
          disabled: !board.runId
        },
        {
          label: "Review Audit Trail",
          command: "open-auditops",
          entryId: board.entryId
        },
        {
          label: "Review Proof Continuity",
          command: "open-evidenceops",
          entryId: board.entryId
        }
      ])}
      <div class="incidentops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Incident Record",
            value: renderValuePills([
              { label: "package", value: board.packageId || "-", code: true },
              { label: "file", value: board.fileName || "-", code: true }
            ])
          },
          {
            label: "Linked Run And Review",
            value: renderValuePills([
              { label: "run", value: board.runId || "-", code: true },
              { label: "decision", value: board.decision || "-" },
              { label: "approval", value: board.approvalId || "-", code: true },
              { label: "scope", value: board.scope || "-", code: true }
            ])
          },
          {
            label: "Audit And Incident Timing",
            value: renderValuePills([
              { label: "source", value: board.auditSource || "-", code: true },
              { label: "generated", value: board.generatedAt ? formatTime(board.generatedAt) : "-" },
              { label: "updated", value: board.filingUpdatedAt ? formatTime(board.filingUpdatedAt) : "-" }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

function renderSeverityBoard(snapshot) {
  const board = snapshot.severityBoard;
  return `
    <article class="metric incidentops-card" data-incidentops-panel="severity-board">
      <div class="metric-title-row">
        <div class="title">Incident Priority</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="incidentops-chip-row">
        <span class="chip chip-neutral chip-compact">high=${escapeHTML(String(board.highCount))}</span>
        <span class="chip chip-neutral chip-compact">medium=${escapeHTML(String(board.mediumCount))}</span>
        <span class="chip chip-neutral chip-compact">low=${escapeHTML(String(board.lowCount))}</span>
      </div>
      <div class="incidentops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Decision Mix",
            value: renderValuePills((board.decisionCounts || []).map((item) => ({ label: item.value, value: String(item.count) })))
          },
          {
            label: "Latest Audit Trail",
            value: renderValuePills([
              { label: "event", value: board.latestAudit?.event || "-", code: true },
              { label: "decision", value: board.latestAudit?.decision || "-" },
              { label: "at", value: board.latestAudit?.ts ? formatTime(board.latestAudit.ts) : "-" }
            ])
          },
          {
            label: "Highest Priority Incidents",
            value: renderValuePills((board.highestPackages || []).map((item) => ({ label: item.packageId, value: item.runId || "-", code: true })))
          }
        ])}
      </div>
    </article>
  `;
}

function renderTimelineList(events = []) {
  const items = (Array.isArray(events) ? events : [])
    .map((event) => {
      const kind = String(event?.kind || "").trim();
      const summary = String(event?.summary || "").trim();
      if (!summary) {
        return "";
      }
      const detail = String(event?.detail || "").trim();
      const timestamp = String(event?.ts || "").trim();
      return `
        <li class="incidentops-timeline-item">
          <div class="incidentops-timeline-topline">
            <span class="incidentops-timeline-summary">${escapeHTML(summary)}</span>
            <span class="incidentops-timeline-time">${timestamp ? escapeHTML(formatTime(timestamp)) : "-"}</span>
          </div>
          <div class="incidentops-timeline-meta">
            ${renderValuePills([
              { label: "kind", value: kind || "-" , code: true },
              { label: "detail", value: detail || "-" , code: kind === "audit_anchor" || kind === "run_updated" || kind === "approval_anchor" }
            ])}
          </div>
        </li>
      `;
    })
    .filter(Boolean)
    .join("");
  if (!items) {
    return '<div class="incidentops-empty">No incident timeline is available yet.</div>';
  }
  return `<ol class="incidentops-timeline">${items}</ol>`;
}

function renderResponseTimelineBoard(snapshot) {
  const board = snapshot.responseTimelineBoard;
  return `
    <article class="metric incidentops-card" data-incidentops-panel="response-timeline-board">
      <div class="metric-title-row">
        <div class="title">Incident Continuity Timeline</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="incidentops-chip-row">
        <span class="chip chip-neutral chip-compact">events=${escapeHTML(String(board.eventCount))}</span>
        <span class="chip chip-neutral chip-compact">audit=${escapeHTML(String(board.auditLinkedCount))}</span>
        <span class="chip chip-neutral chip-compact">approval=${escapeHTML(board.approvalLinked ? "linked" : "none")}</span>
        <span class="chip chip-neutral chip-compact">continuity=${escapeHTML(board.handoffReady ? "ready" : "pending")}</span>
      </div>
      <div class="incidentops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Current Incident",
            value: renderValuePills([
              { label: "package", value: board.activePackageId || "-", code: true },
              { label: "run", value: board.activeRunId || "-", code: true },
              { label: "latest", value: board.latestEventAt ? formatTime(board.latestEventAt) : "-" }
            ])
          }
        ])}
      </div>
      <div class="incidentops-subsection">
        <div class="incidentops-subtitle">Incident Continuity Timeline</div>
        ${renderTimelineList(board.events)}
      </div>
    </article>
  `;
}

function renderClosureBoard(snapshot) {
  const board = snapshot.closureBoard;
  return `
    <article class="metric incidentops-card" data-incidentops-panel="closure-board">
      <div class="metric-title-row">
        <div class="title">Closure Readiness</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.closureState)}</span>
      </div>
      <div class="incidentops-chip-row">
        <span class="chip chip-neutral chip-compact">blockers=${escapeHTML(String(board.blockerCount))}</span>
        <span class="chip chip-neutral chip-compact">handoff=${escapeHTML(board.handoffReady ? "ready" : "pending")}</span>
        <span class="chip chip-neutral chip-compact">approval=${escapeHTML(board.approvalCleared ? "cleared" : "pending")}</span>
        <span class="chip chip-neutral chip-compact">audit=${escapeHTML(board.auditLinked ? "linked" : "missing")}</span>
      </div>
      ${renderActionButtons(
        (board.availableTransitions || []).map((item) => ({
          label: item.label,
          command: "transition-incident-status",
          entryId: board.entryId,
          nextStatus: item.toStatus
        }))
      )}
      <div class="incidentops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Closure Continuity",
            value: renderValuePills([
              { label: "package", value: board.packageId || "-", code: true },
              { label: "run", value: board.runId || "-", code: true },
              { label: "decision", value: board.decision || "-" },
              { label: "updated", value: board.updatedAt ? formatTime(board.updatedAt) : "-" }
            ])
          },
          {
            label: "Latest Audit Link",
            value: renderValuePills([
              { label: "event", value: board.latestAuditEvent || "-", code: true },
              { label: "at", value: board.latestAuditAt ? formatTime(board.latestAuditAt) : "-" }
            ])
          },
          {
            label: "What Still Needs Attention",
            value: board.blockers.length
              ? renderValuePills(board.blockers.map((item) => ({ label: "needs", value: item })))
              : '<span class="incidentops-empty">No closure blockers remain.</span>'
          },
          {
            label: "Next Action",
            value: `<span>${escapeHTML(board.nextAction || "-")}</span>`
          }
        ])}
      </div>
    </article>
  `;
}

export function renderIncidentWorkspace(context = {}) {
  const snapshot = createIncidentOpsWorkspaceSnapshot(context);
  return renderWorkbenchDomainShell({
    domainRoot: "incidentops",
    shellClass: "incidentops-workspace",
    title: "IncidentOps",
    lead:
      "Use IncidentOps when Companion hands off a governed item that has moved into escalation, active response, or closure follow-through.",
    layout: "split",
    prelude: `
      ${renderWorkbenchArrivalContext({
        domainRoot: "incidentops",
        handoffContext: context.companionHandoffContext
      })}
      ${renderFeedbackPanel(snapshot)}
      ${renderAimxsDecisionBindingSpineBoard(snapshot)}
    `,
    clusters: [
      renderWorkbenchDomainCluster({
        title: "Incident Continuation",
        lead:
          "Start with the active incident so you can see what is in motion, which governed item it belongs to, and how urgent the response is.",
        bodyClass: "stack",
        body: `
          ${renderIncidentQueueBoard(snapshot)}
          ${renderActiveIncidentBoard(snapshot)}
          ${renderSeverityBoard(snapshot)}
        `
      }),
      renderWorkbenchDomainCluster({
        title: "Response Timeline And Closure",
        lead:
          "Use the timeline and closure lane after the active incident is clear, so the same governed path stays legible through follow-through and closure.",
        bodyClass: "stack",
        body: `
          ${renderResponseTimelineBoard(snapshot)}
          ${renderClosureBoard(snapshot)}
        `
      })
    ]
  });
}
