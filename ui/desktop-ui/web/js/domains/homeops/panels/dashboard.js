import { chipClassForStatus, escapeHTML, formatTime } from "../../../views/common.js";

function renderStatusCard(card = {}) {
  return `
    <article class="metric homeops-status-card" data-homeops-card="${escapeHTML(card.id || "companion-status")}">
      <div class="title">${escapeHTML(card.title || "Status")}</div>
      <div class="meta">
        <span class="${chipClassForStatus(card.tone || "unknown")} chip-compact">${escapeHTML(
          String(card.tone || "unknown")
        )}</span>
      </div>
      <div class="homeops-status-value">${escapeHTML(card.value || "-")}</div>
      <div class="meta">${escapeHTML(card.summary || "-")}</div>
      <div class="meta">${escapeHTML(card.meta || "-")}</div>
    </article>
  `;
}

function renderAttentionItem(item = {}) {
  return `
    <article class="metric homeops-attention-card">
      <div class="title">${escapeHTML(item.title || "Attention")}</div>
      <div class="meta">
        <span class="${chipClassForStatus(item.tone || "unknown")} chip-compact">${escapeHTML(
          String(item.tone || "unknown")
        )}</span>
      </div>
      <div class="homeops-attention-value">${escapeHTML(item.value || "0")}</div>
      <div class="meta">${escapeHTML(item.detail || "-")}</div>
      <div class="homeops-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-homeops-action="${escapeHTML(item.action || "open-workbench")}"
          ${item.view ? `data-homeops-view="${escapeHTML(item.view)}"` : ""}
          ${item.runId ? `data-homeops-run-id="${escapeHTML(item.runId)}"` : ""}
          ${item.approvalId ? `data-homeops-approval-id="${escapeHTML(item.approvalId)}"` : ""}
          ${item.incidentId ? `data-homeops-incident-id="${escapeHTML(item.incidentId)}"` : ""}
        >${escapeHTML(item.actionLabel || "Open Workbench Depth")}</button>
      </div>
    </article>
  `;
}

function renderRecentActionRow(item = {}) {
  return `
    <article class="metric homeops-recent-action-card" data-homeops-run="${escapeHTML(item.runId || item.id || "")}">
      <div class="homeops-recent-action-header">
        <div class="title">${escapeHTML(item.actionName || "governed action")}</div>
        <div class="meta">
          <span class="${chipClassForStatus(String(item.state || "").trim().toLowerCase() || "unknown")} chip-compact">${escapeHTML(
            item.state || "-"
          )}</span>
          <span class="chip chip-neutral chip-compact">policy=${escapeHTML(item.policyDecision || "-")}</span>
        </div>
      </div>
      <div class="homeops-recent-action-grid">
        <div class="meta">Client: ${escapeHTML(item.clientLabel || "-")}</div>
        <div class="meta">Target: ${escapeHTML(item.targetSummary || "-")}</div>
        <div class="meta">Run: ${escapeHTML(item.runId || "-")}</div>
        <div class="meta">Time: ${escapeHTML(formatTime(item.occurredAt || "-"))}</div>
      </div>
      <div class="homeops-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-homeops-action="${escapeHTML(item.action || "open-run-item")}"
          ${item.runId ? `data-homeops-run-id="${escapeHTML(item.runId)}"` : ""}
          ${item.approvalId ? `data-homeops-approval-id="${escapeHTML(item.approvalId)}"` : ""}
        >${escapeHTML(item.actionLabel || "Open")}</button>
      </div>
    </article>
  `;
}

function renderAuditEventRow(item = {}) {
  return `
    <article class="metric homeops-recent-action-card" data-homeops-audit-event="${escapeHTML(item.id || "")}">
      <div class="homeops-recent-action-header">
        <div class="title">${escapeHTML(item.title || "Audit event")}</div>
        <div class="meta">
          <span class="${chipClassForStatus(item.tone || "unknown")} chip-compact">${escapeHTML(
            String(item.tone || "unknown")
          )}</span>
        </div>
      </div>
      <div class="meta">${escapeHTML(item.summary || "-")}</div>
      <div class="homeops-recent-action-grid">
        <div class="meta">${escapeHTML(item.primaryMeta || "-")}</div>
        <div class="meta">${escapeHTML(item.secondaryMeta || "-")}</div>
        <div class="meta">time=${escapeHTML(formatTime(item.occurredAt || "-"))}</div>
      </div>
      <div class="homeops-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-homeops-action="${escapeHTML(item.action || "open-audit-depth")}"
          ${item.runId ? `data-homeops-run-id="${escapeHTML(item.runId)}"` : ""}
          ${item.approvalId ? `data-homeops-approval-id="${escapeHTML(item.approvalId)}"` : ""}
        >${escapeHTML(item.actionLabel || "Open AuditOps Depth")}</button>
      </div>
    </article>
  `;
}

function renderIncidentEscalationRow(item = {}) {
  return `
    <article class="metric homeops-recent-action-card" data-homeops-incident="${escapeHTML(item.id || "")}">
      <div class="homeops-recent-action-header">
        <div class="title">${escapeHTML(item.title || "Incident context")}</div>
        <div class="meta">
          <span class="${chipClassForStatus(item.tone || "unknown")} chip-compact">${escapeHTML(
            String(item.tone || "unknown")
          )}</span>
        </div>
      </div>
      <div class="meta">${escapeHTML(item.summary || "-")}</div>
      <div class="homeops-recent-action-grid">
        <div class="meta">${escapeHTML(item.primaryMeta || "-")}</div>
        <div class="meta">${escapeHTML(item.secondaryMeta || "-")}</div>
        <div class="meta">time=${escapeHTML(formatTime(item.occurredAt || "-"))}</div>
      </div>
      <div class="homeops-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-homeops-action="${escapeHTML(item.action || "show-diagnostics")}"
          ${item.runId ? `data-homeops-run-id="${escapeHTML(item.runId)}"` : ""}
          ${item.incidentId ? `data-homeops-incident-id="${escapeHTML(item.incidentId)}"` : ""}
        >${escapeHTML(item.actionLabel || "Open Incident Depth")}</button>
      </div>
    </article>
  `;
}

function renderQuickAction(action = {}) {
  return `
    <button
      class="homeops-pivot-button"
      type="button"
      data-homeops-action="${escapeHTML(action.action || "open-workbench")}"
      ${action.view ? `data-homeops-view="${escapeHTML(action.view)}"` : ""}
    >
      <span class="homeops-pivot-label">${escapeHTML(action.label || "Open")}</span>
      <span class="homeops-pivot-summary">${escapeHTML(action.summary || "-")}</span>
    </button>
  `;
}

function renderRuntimeDiagnosticsCard(item = {}) {
  return `
    <article class="metric homeops-summary-card" data-homeops-card="${escapeHTML(item.id || "runtime-diagnostics")}">
      <div class="title">${escapeHTML(item.title || "Runtime diagnostics")}</div>
      <div class="meta">
        <span class="${chipClassForStatus(item.tone || "unknown")} chip-compact">${escapeHTML(
          String(item.tone || "unknown")
        )}</span>
      </div>
      <div class="homeops-summary-value">${escapeHTML(item.value || "-")}</div>
      <div class="meta">${escapeHTML(item.summary || "-")}</div>
      <div class="meta">${escapeHTML(item.meta || "-")}</div>
      <div class="homeops-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-homeops-action="${escapeHTML(item.action || "show-diagnostics")}"
        >${escapeHTML(item.actionLabel || "Show Diagnostics")}</button>
      </div>
    </article>
  `;
}

function renderConnectedClientCard(item = {}) {
  return `
    <article class="metric homeops-summary-card" data-homeops-card="${escapeHTML(item.id || "connected-client")}">
      <div class="title">${escapeHTML(item.title || "Connected Client")}</div>
      <div class="meta">
        <span class="${chipClassForStatus(item.tone || "unknown")} chip-compact">${escapeHTML(
          String(item.tone || "unknown")
        )}</span>
      </div>
      <div class="homeops-summary-value">${escapeHTML(item.value || "-")}</div>
      <div class="meta">${escapeHTML(item.summary || "-")}</div>
      <div class="meta">${escapeHTML(item.meta || "-")}</div>
    </article>
  `;
}

function renderLiveApprovalCard(item = {}) {
  return `
    <article
      class="metric homeops-live-approval-card"
      data-homeops-live-approval-card
      data-homeops-selection-id="${escapeHTML(item.selectionId || "")}"
    >
      <div class="homeops-recent-action-header">
        <div class="title">${escapeHTML(item.title || "Pending review")}</div>
        <div class="meta">
          <span class="${chipClassForStatus(item.tone || "warn")} chip-compact">${escapeHTML(
            String(item.tone || "warn")
          )}</span>
          <span class="chip chip-neutral chip-compact">${escapeHTML(item.kindLabel || "Review")}</span>
        </div>
      </div>
      <div class="meta">${escapeHTML(item.summary || "-")}</div>
      <div class="homeops-recent-action-grid">
        <div class="meta">${escapeHTML(item.primaryMeta || "-")}</div>
        <div class="meta">${escapeHTML(item.secondaryMeta || "-")}</div>
        <div class="meta">created=${escapeHTML(item.createdAt || "-")}</div>
        <div class="meta">expires=${escapeHTML(item.expiresAt || "-")}</div>
      </div>
      <div class="field">
        <span class="label">Decision Reason (Optional)</span>
        <input
          class="filter-input"
          type="text"
          placeholder="optional; add operator context or leave blank to use the default review note"
          data-homeops-native-decision-reason
        />
      </div>
      <div class="homeops-actions">
        <button
          class="btn btn-ok btn-small"
          type="button"
          data-homeops-native-decision-action="APPROVE"
          data-homeops-native-selection-id="${escapeHTML(item.selectionId || "")}"
        >Approve</button>
        <button
          class="btn btn-danger btn-small"
          type="button"
          data-homeops-native-decision-action="DENY"
          data-homeops-native-selection-id="${escapeHTML(item.selectionId || "")}"
        >Deny</button>
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-homeops-action="${escapeHTML(item.detailAction || "open-approval-queue")}"
          ${item.runId ? `data-homeops-run-id="${escapeHTML(item.runId)}"` : ""}
        >${escapeHTML(item.detailActionLabel || "Open Workbench Review")}</button>
      </div>
    </article>
  `;
}

function renderEmptyMessage(message) {
  return `<div class="homeops-empty">${escapeHTML(message)}</div>`;
}

export function renderHomeWorkspace(snapshot = {}) {
  const systemCards = Array.isArray(snapshot?.systemStatus?.cards) ? snapshot.systemStatus.cards : [];
  const systemActions = Array.isArray(snapshot?.systemStatus?.actions) ? snapshot.systemStatus.actions : [];
  const attentionItems = Array.isArray(snapshot?.attentionQueue?.items) ? snapshot.attentionQueue.items : [];
  const liveApprovals = Array.isArray(snapshot?.liveApprovals?.items) ? snapshot.liveApprovals.items : [];
  const recentActions = Array.isArray(snapshot?.recentGovernedActions?.items)
    ? snapshot.recentGovernedActions.items
    : [];
  const liveAuditEvents = Array.isArray(snapshot?.liveAuditEvents?.items) ? snapshot.liveAuditEvents.items : [];
  const incidentEscalations = Array.isArray(snapshot?.incidentEscalations?.items)
    ? snapshot.incidentEscalations.items
    : [];
  const runtimeDiagnostics = Array.isArray(snapshot?.runtimeDiagnostics?.items)
    ? snapshot.runtimeDiagnostics.items
    : [];
  const quickActions = Array.isArray(snapshot?.quickActions?.items) ? snapshot.quickActions.items : [];
  const connectedClientCards = Array.isArray(snapshot?.connectedClientContext?.cards)
    ? snapshot.connectedClientContext.cards
    : [];
  const feedback = snapshot?.systemStatus?.feedback && typeof snapshot.systemStatus.feedback === "object"
    ? snapshot.systemStatus.feedback
    : null;

  return `
    <div class="homeops-workspace" data-domain-root="companionops">
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Operator Status</h3>
          <p class="homeops-board-lead">Companion is the default daily governance lane. Workbench stays available for deeper investigation, admin depth, and historical review.</p>
        </div>
        ${
          feedback?.message
            ? `<div class="homeops-feedback ${escapeHTML(feedback.tone || "info")}">${escapeHTML(feedback.message)}</div>`
            : ""
        }
        <div class="homeops-command-grid">
          ${systemCards.map((card) => renderStatusCard(card)).join("")}
        </div>
        <div class="homeops-pivot-grid">
          ${systemActions.map((action) => renderQuickAction(action)).join("")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Attention Queue</h3>
          <p class="homeops-board-lead">Only the items that need operator attention now in the live Companion lane.</p>
        </div>
        <div class="homeops-attention-grid">
          ${attentionItems.length ? attentionItems.map((item) => renderAttentionItem(item)).join("") : renderEmptyMessage("No immediate approvals, degraded services, failed runs, or incident escalations are waiting for action.")}
        </div>
      </section>
      <section class="homeops-board" data-homeops-section="live-approvals">
        <div class="homeops-board-header">
          <h3>Live Approvals</h3>
          <p class="homeops-board-lead">Resolve the normal live approval loop here without leaving Companion. Use Workbench only when you need deeper history or investigation.</p>
        </div>
        <div class="homeops-recent-action-list">
          ${liveApprovals.length ? liveApprovals.map((item) => renderLiveApprovalCard(item)).join("") : renderEmptyMessage("No current-thread approvals or held gateway requests are waiting for direct Companion review.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Recent Governed Actions</h3>
          <p class="homeops-board-lead">Recent governed traffic and live handoff targets. Stay here for the daily lane; open Workbench only when you need deeper run, evidence, or incident review.</p>
        </div>
        <div class="homeops-recent-action-list">
          ${recentActions.length ? recentActions.map((item) => renderRecentActionRow(item)).join("") : renderEmptyMessage("No recent governed actions are available yet. Submit work through the local gateway to populate this surface.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Audit And Event Stream</h3>
          <p class="homeops-board-lead">Recent live events stay visible in Companion. Use AuditOps depth only for export, long-range history, and deeper investigative review.</p>
        </div>
        <div class="homeops-recent-action-list">
          ${liveAuditEvents.length ? liveAuditEvents.map((item) => renderAuditEventRow(item)).join("") : renderEmptyMessage("No recent live audit events are available yet. The next governed decision, approval event, or launcher transition will appear here.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Current Incidents And Escalations</h3>
          <p class="homeops-board-lead">Current escalations stay visible in Companion so the live lane does not lose incident posture. Use IncidentOps depth only for packaging and deeper response work.</p>
        </div>
        <div class="homeops-recent-action-list">
          ${incidentEscalations.length ? incidentEscalations.map((item) => renderIncidentEscalationRow(item)).join("") : renderEmptyMessage("No active incidents or escalation candidates are shaping the live governance lane right now.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Runtime And Diagnostics</h3>
          <p class="homeops-board-lead">Practical runtime and launcher truth stays in Companion. Use diagnostics depth only when the daily lane is not enough.</p>
        </div>
        <div class="homeops-command-grid">
          ${runtimeDiagnostics.length ? runtimeDiagnostics.map((item) => renderRuntimeDiagnosticsCard(item)).join("") : renderEmptyMessage("Runtime and launcher links are not available yet. Refresh the local shell to restore Companion service truth.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Quick Actions</h3>
          <p class="homeops-board-lead">Fast pivots for the daily governance lane. Workbench remains the deep console, not the default path.</p>
        </div>
        <div class="homeops-pivot-grid">
          ${quickActions.map((action) => renderQuickAction(action)).join("")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Connected Client Context</h3>
          <p class="homeops-board-lead">Signed-in context, active scope, and recent request activity.</p>
        </div>
        <div class="homeops-summary-grid">
          ${connectedClientCards.map((item) => renderConnectedClientCard(item)).join("")}
        </div>
      </section>
    </div>
  `;
}
