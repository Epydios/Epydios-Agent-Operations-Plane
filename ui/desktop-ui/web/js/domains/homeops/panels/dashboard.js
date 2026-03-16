import { chipClassForStatus, escapeHTML } from "../../../views/common.js";

function renderCommandCard(card = {}) {
  return `
    <article class="metric homeops-command-card" data-homeops-card="${escapeHTML(card.id || "homeops")}">
      <div class="title">${escapeHTML(card.title || "HomeOps")}</div>
      <div class="meta">
        <span class="${chipClassForStatus(card.tone || "unknown")} chip-compact">${escapeHTML(
          String(card.tone || "unknown")
        )}</span>
      </div>
      <div class="homeops-command-value">${escapeHTML(card.value || "-")}</div>
      <div class="meta">${escapeHTML(card.summary || "-")}</div>
      <div class="meta">${escapeHTML(card.meta || "-")}</div>
      <div class="homeops-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-homeops-action="${escapeHTML(card.action || "open-domain")}"
          ${card.view ? `data-homeops-view="${escapeHTML(card.view)}"` : ""}
        >${escapeHTML(card.actionLabel || "Open")}</button>
      </div>
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
          data-homeops-action="${escapeHTML(item.action || "open-domain")}"
          ${item.view ? `data-homeops-view="${escapeHTML(item.view)}"` : ""}
          ${item.runId ? `data-homeops-run-id="${escapeHTML(item.runId)}"` : ""}
        >${escapeHTML(item.actionLabel || "Open")}</button>
      </div>
    </article>
  `;
}

function renderSnapshotCard(item = {}) {
  return `
    <article class="metric homeops-summary-card" data-homeops-card="${escapeHTML(item.id || "identity-snapshot")}">
      <div class="title">${escapeHTML(item.title || "Snapshot")}</div>
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

function renderDomainPivot(pivot = {}) {
  return `
    <button
      class="homeops-pivot-button"
      type="button"
      data-homeops-action="open-domain"
      data-homeops-view="${escapeHTML(pivot.view || "homeops")}"
    >
      <span class="homeops-pivot-label">${escapeHTML(pivot.label || "HomeOps")}</span>
      <span class="homeops-pivot-summary">${escapeHTML(pivot.summary || "-")}</span>
    </button>
  `;
}

export function renderHomeWorkspace(snapshot = {}) {
  const commandCards = Array.isArray(snapshot?.commandDashboard?.cards)
    ? snapshot.commandDashboard.cards
    : [];
  const identityCards = Array.isArray(snapshot?.identityAndScope?.cards)
    ? snapshot.identityAndScope.cards
    : [];
  const attentionItems = Array.isArray(snapshot?.attentionQueue?.items)
    ? snapshot.attentionQueue.items
    : [];
  const pivots = Array.isArray(snapshot?.domainPivots?.items) ? snapshot.domainPivots.items : [];

  return `
    <div class="homeops-workspace" data-domain-root="homeops">
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Command Dashboard</h3>
          <p class="homeops-board-lead">Bounded current-state posture across the owning domains.</p>
        </div>
        <div class="homeops-command-grid">
          ${commandCards.map((card) => renderCommandCard(card)).join("")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Attention Queue</h3>
          <p class="homeops-board-lead">Next actions that should route into the owning domain surfaces.</p>
        </div>
        <div class="homeops-attention-grid">
          ${attentionItems.map((item) => renderAttentionItem(item)).join("")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Identity And Scope Snapshot</h3>
          <p class="homeops-board-lead">Current acting identity, authority basis, and scope.</p>
        </div>
        <div class="homeops-summary-grid">
          ${identityCards.map((item) => renderSnapshotCard(item)).join("")}
        </div>
        <div class="homeops-actions">
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-homeops-action="open-domain"
            data-homeops-view="${escapeHTML(snapshot?.identityAndScope?.view || "identityops")}"
          >${escapeHTML(snapshot?.identityAndScope?.actionLabel || "Open IdentityOps")}</button>
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Domain Pivot Row</h3>
          <p class="homeops-board-lead">Fast pivots into the already-built workspaces.</p>
        </div>
        <div class="homeops-pivot-grid">
          ${pivots.map((pivot) => renderDomainPivot(pivot)).join("")}
        </div>
      </section>
    </div>
  `;
}
