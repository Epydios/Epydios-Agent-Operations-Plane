import { chipClassForStatus, escapeHTML, formatTime } from "../../../views/common.js";

function renderActionAttributes(options = {}) {
  return [
    options.view ? `data-homeops-view="${escapeHTML(options.view)}"` : "",
    options.runId ? `data-homeops-run-id="${escapeHTML(options.runId)}"` : "",
    options.approvalId ? `data-homeops-approval-id="${escapeHTML(options.approvalId)}"` : "",
    options.incidentId ? `data-homeops-incident-id="${escapeHTML(options.incidentId)}"` : "",
    options.checkpointId ? `data-homeops-checkpoint-id="${escapeHTML(options.checkpointId)}"` : "",
    options.gatewayRequestId ? `data-homeops-gateway-request-id="${escapeHTML(options.gatewayRequestId)}"` : "",
    options.sourceClient ? `data-homeops-source-client="${escapeHTML(options.sourceClient)}"` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function renderActionButton(action, label, options = {}) {
  const attrs = renderActionAttributes(options);
  return `
    <button
      class="btn btn-secondary btn-small"
      type="button"
      data-homeops-action="${escapeHTML(action || "open-workbench")}"
      ${attrs}
    >${escapeHTML(label || "Open")}</button>
  `;
}

function shouldRenderDistinctProofAction(item = {}, proof = {}) {
  const itemAction = String(item.action || "").trim();
  const proofAction = String(proof.action || "").trim();
  if (!proofAction) {
    return false;
  }
  if (itemAction !== proofAction) {
    return true;
  }
  return (
    String(item.runId || "").trim() !== String(proof.runId || "").trim() ||
    String(item.approvalId || "").trim() !== String(proof.approvalId || "").trim() ||
    String(item.incidentId || "").trim() !== String(proof.incidentId || "").trim()
  );
}

function renderProofBadge(proof = {}) {
  return `
    <span class="${chipClassForStatus(proof.tone || "warn")} chip-compact">${escapeHTML(
      proof.label || "Proof pending"
    )}</span>
  `;
}

function renderProofSpineAnchor(anchor = {}, key = "") {
  const normalizedKey = String(key || anchor.id || "").trim().toLowerCase() || "anchor";
  return `
    <article class="homeops-proof-spine-anchor" data-homeops-proof-anchor="${escapeHTML(normalizedKey)}">
      <div class="title">${escapeHTML(anchor.title || normalizedKey)}</div>
      <div class="meta">
        <span class="${chipClassForStatus(anchor.tone || "neutral")} chip-compact">${escapeHTML(
          anchor.label || "-"
        )}</span>
      </div>
      <div class="meta">${escapeHTML(anchor.summary || "-")}</div>
      <div class="meta">${escapeHTML(anchor.meta || "-")}</div>
    </article>
  `;
}

function renderProofSpine(spine = {}, options = {}) {
  const anchors = ["decision", "receipt", "proof", "incident"]
    .map((key) => renderProofSpineAnchor(spine?.[key], key))
    .join("");
  return `
    <article class="metric homeops-proof-spine-card" data-homeops-proof-spine>
      <div class="title">${escapeHTML(options.title || "Decision / Receipt / Proof / Incident")}</div>
      <div class="meta">${escapeHTML(
        options.summary || "The governed path stays visible here before you leave Companion for deeper owner-domain review."
      )}</div>
      <div class="homeops-proof-spine-grid">
        ${anchors}
      </div>
    </article>
  `;
}

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

function renderQueueItem(item = {}, index = 0) {
  const proof = item?.proof && typeof item.proof === "object" ? item.proof : {};
  const spine = item?.spine && typeof item.spine === "object" ? item.spine : {};
  const defaultOpen = index === 0 ? " open" : "";
  const detailAction = renderActionButton(item.action, item.actionLabel || "Open Workbench Depth", item);
  const proofAction = shouldRenderDistinctProofAction(item, proof)
    ? renderActionButton(proof.action, proof.actionLabel || "Open Evidence Depth", proof)
    : "";
  return `
    <details
      class="metric homeops-queue-item"
      data-homeops-queue-item
      data-homeops-queue-kind="${escapeHTML(item.queueKind || "attention")}"
      ${item.selectionId ? "data-homeops-live-approval-card" : ""}
      ${defaultOpen}
    >
      <summary class="homeops-queue-summary">
        <div class="homeops-queue-summary-main">
          <div class="homeops-recent-action-header">
            <div class="title">${escapeHTML(item.title || "Needs attention")}</div>
            <div class="meta">
              <span class="${chipClassForStatus(item.tone || "warn")} chip-compact">${escapeHTML(
                String(item.tone || "warn")
              )}</span>
              <span class="chip chip-neutral chip-compact">${escapeHTML(item.kindLabel || "Attention")}</span>
              ${renderProofBadge(proof)}
            </div>
          </div>
          <div class="meta">${escapeHTML(item.summary || "-")}</div>
          <div class="homeops-queue-meta-grid">
            <div class="meta">${escapeHTML(item.primaryMeta || "-")}</div>
            <div class="meta">${escapeHTML(item.secondaryMeta || "-")}</div>
            <div class="meta">time=${escapeHTML(formatTime(item.occurredAt || "-"))}</div>
          </div>
        </div>
      </summary>
      <div class="homeops-queue-detail">
        <div class="homeops-queue-detail-grid">
          <article class="metric homeops-queue-detail-card">
            <div class="title">${escapeHTML(item.selectionId ? "Decision Context" : "Current Context")}</div>
            <div class="meta">${escapeHTML(item.summary || "-")}</div>
            <div class="meta">${escapeHTML(item.primaryMeta || "-")}</div>
            <div class="meta">${escapeHTML(item.secondaryMeta || "-")}</div>
          </article>
          ${renderProofSpine(spine, {
            summary: "Companion keeps the active governed path explicit before deeper review is opened."
          })}
        </div>
        ${
          item.selectionId
            ? `
              <div class="field">
                <span class="label">Decision Reason (Optional)</span>
                <input
                  class="filter-input"
                  type="text"
                  placeholder="optional; add operator context or leave blank to use the default review note"
                  data-homeops-native-decision-reason
                />
              </div>
            `
            : ""
        }
        <div class="homeops-actions">
          ${
            item.selectionId
              ? `
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
              `
              : ""
          }
          ${detailAction}
          ${proofAction}
        </div>
      </div>
    </details>
  `;
}

function renderRecentActionRow(item = {}) {
  const proof = item?.proof && typeof item.proof === "object" ? item.proof : {};
  const spine = item?.spine && typeof item.spine === "object" ? item.spine : {};
  const detailAction = renderActionButton(item.action, item.actionLabel || "Open", item);
  const proofAction = shouldRenderDistinctProofAction(item, proof)
    ? renderActionButton(proof.action, proof.actionLabel || "Open Evidence Depth", proof)
    : "";
  return `
    <article class="metric homeops-recent-action-card" data-homeops-run="${escapeHTML(item.runId || item.id || "")}">
      <div class="homeops-recent-action-header">
        <div class="title">${escapeHTML(item.actionName || "governed action")}</div>
        <div class="meta">
          <span class="${chipClassForStatus(String(item.state || "").trim().toLowerCase() || "unknown")} chip-compact">${escapeHTML(
            item.state || "-"
          )}</span>
          <span class="chip chip-neutral chip-compact">policy=${escapeHTML(item.policyDecision || "-")}</span>
          ${renderProofBadge(proof)}
        </div>
      </div>
      <div class="homeops-recent-action-grid">
        <div class="meta">Client: ${escapeHTML(item.clientLabel || "-")}</div>
        <div class="meta">Target: ${escapeHTML(item.targetSummary || "-")}</div>
        <div class="meta">Run: ${escapeHTML(item.runId || "-")}</div>
        <div class="meta">Time: ${escapeHTML(formatTime(item.occurredAt || "-"))}</div>
      </div>
      ${renderProofSpine(spine, {
        summary: "Recent governed actions keep the same decision, receipt, proof, and incident continuity visible in Companion."
      })}
      <div class="homeops-actions">
        ${detailAction}
        ${proofAction}
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
        ${renderActionButton(item.action, item.actionLabel || "Open AuditOps Depth", item)}
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
        ${renderActionButton(item.action, item.actionLabel || "Open Incident Depth", item)}
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
        ${renderActionButton(item.action, item.actionLabel || "Show Diagnostics", item)}
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

function renderEmptyMessage(message) {
  return `<div class="homeops-empty">${escapeHTML(message)}</div>`;
}

export function renderHomeWorkspace(snapshot = {}) {
  const systemCards = Array.isArray(snapshot?.systemStatus?.cards) ? snapshot.systemStatus.cards : [];
  const systemActions = Array.isArray(snapshot?.systemStatus?.actions) ? snapshot.systemStatus.actions : [];
  const governedRequestQueue = Array.isArray(snapshot?.governedRequestQueue?.items)
    ? snapshot.governedRequestQueue.items
    : [];
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
          <p class="homeops-board-lead">Companion stays the daily governed-work lane. Workbench stays available for deeper investigation, evidence depth, and admin review.</p>
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
      <section class="homeops-board homeops-priority-board" data-homeops-section="needs-attention">
        <div class="homeops-board-header">
          <h3>Needs Attention Now</h3>
          <p class="homeops-board-lead">This is the primary governed-request queue. Review the active item here, decide it here when possible, and open Workbench only for deeper evidence, audit, runtime, or incident depth.</p>
        </div>
        <div class="homeops-queue-list">
          ${
            governedRequestQueue.length
              ? governedRequestQueue.map((item, index) => renderQueueItem(item, index)).join("")
              : renderEmptyMessage("No governed requests, escalations, or blocked items currently need operator action.")
          }
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Recent Governed Actions</h3>
          <p class="homeops-board-lead">Recent governed traffic stays visible in Companion with decision, receipt, proof, and incident continuity. Open depth only when you need fuller runtime, evidence, or governance inspection.</p>
        </div>
        <div class="homeops-recent-action-list">
          ${recentActions.length ? recentActions.map((item) => renderRecentActionRow(item)).join("") : renderEmptyMessage("No recent governed actions are available yet. Submit work through the local gateway to populate this surface.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Live Exceptions And Incidents</h3>
          <p class="homeops-board-lead">Active failures stay visible in Companion, but deeper incident packaging and long-form response remain in IncidentOps.</p>
        </div>
        <div class="homeops-recent-action-list">
          ${incidentEscalations.length ? incidentEscalations.map((item) => renderIncidentEscalationRow(item)).join("") : renderEmptyMessage("No active incidents or escalation candidates are shaping the live governance lane right now.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Recent Audit And Event Stream</h3>
          <p class="homeops-board-lead">Recent live events stay visible in Companion. Use AuditOps depth for export, long-range history, and deeper investigative review.</p>
        </div>
        <div class="homeops-recent-action-list">
          ${liveAuditEvents.length ? liveAuditEvents.map((item) => renderAuditEventRow(item)).join("") : renderEmptyMessage("No recent live audit events are available yet. The next governed decision, approval event, or launcher transition will appear here.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Health And Diagnostics</h3>
          <p class="homeops-board-lead">Practical runtime and launcher truth stays in Companion. Use diagnostics depth only when the daily lane is not enough.</p>
        </div>
        <div class="homeops-command-grid">
          ${runtimeDiagnostics.length ? runtimeDiagnostics.map((item) => renderRuntimeDiagnosticsCard(item)).join("") : renderEmptyMessage("Runtime and launcher links are not available yet. Refresh the local shell to restore Companion service truth.")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Operator Pivots</h3>
          <p class="homeops-board-lead">Fast pivots for the live lane. These stay secondary to the active governed-request queue.</p>
        </div>
        <div class="homeops-pivot-grid">
          ${quickActions.map((action) => renderQuickAction(action)).join("")}
        </div>
      </section>
      <section class="homeops-board">
        <div class="homeops-board-header">
          <h3>Connected Client Context</h3>
          <p class="homeops-board-lead">Signed-in context, active scope, and current traffic posture.</p>
        </div>
        <div class="homeops-summary-grid">
          ${connectedClientCards.map((item) => renderConnectedClientCard(item)).join("")}
        </div>
      </section>
    </div>
  `;
}
