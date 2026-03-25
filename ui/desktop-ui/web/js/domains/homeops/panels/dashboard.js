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
        >${escapeHTML(item.actionLabel || "Open")}</button>
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

function renderEmptyMessage(message) {
  return `<div class="homeops-empty">${escapeHTML(message)}</div>`;
}

export function renderHomeWorkspace(snapshot = {}) {
  const systemCards = Array.isArray(snapshot?.systemStatus?.cards) ? snapshot.systemStatus.cards : [];
  const systemActions = Array.isArray(snapshot?.systemStatus?.actions) ? snapshot.systemStatus.actions : [];
  const attentionItems = Array.isArray(snapshot?.attentionQueue?.items) ? snapshot.attentionQueue.items : [];
  const recentActions = Array.isArray(snapshot?.recentGovernedActions?.items)
    ? snapshot.recentGovernedActions.items
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
          <h3>System Status</h3>
          <p class="homeops-board-lead">Daily status for Companion, the launcher, the runtime service, and the local gateway.</p>
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
          <p class="homeops-board-lead">Only the items that need operator attention now.</p>
        </div>
        <div class="homeops-attention-grid">
          ${attentionItems.length ? attentionItems.map((item) => renderAttentionItem(item)).join("") : renderEmptyMessage("No immediate approvals, degraded services, failed runs, or incident escalations are waiting for action.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Recent Governed Actions</h3>
          <p class="homeops-board-lead">Latest governed requests with direct handoff into the run or review that needs attention.</p>
        </div>
        <div class="homeops-recent-action-list">
          ${recentActions.length ? recentActions.map((item) => renderRecentActionRow(item)).join("") : renderEmptyMessage("No recent governed actions are available yet. Submit work through the local gateway to populate this surface.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Quick Actions</h3>
          <p class="homeops-board-lead">Common next steps without digging through the full Workbench.</p>
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
