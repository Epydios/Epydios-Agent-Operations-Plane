import { escapeHTML } from "../../views/common.js";

function renderChainItem(item = {}) {
  const value = String(item?.value || "").trim();
  if (!value) {
    return "";
  }
  const tone = String(item?.tone || "neutral").trim().toLowerCase();
  return `
    <div class="aimxs-spine-chain-item aimxs-spine-chain-item-${escapeHTML(tone)}">
      <div class="aimxs-spine-chain-label">${escapeHTML(String(item?.label || "-"))}</div>
      <div class="aimxs-spine-chain-value${item?.code ? " aimxs-spine-chain-value-code" : ""}">
        ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
      </div>
    </div>
  `;
}

function renderChain(title, items = []) {
  const rendered = (Array.isArray(items) ? items : []).map(renderChainItem).filter(Boolean).join("");
  if (!rendered) {
    return `
      <div class="aimxs-spine-section">
        <div class="aimxs-spine-section-title">${escapeHTML(title)}</div>
        <div class="aimxs-empty">No ${escapeHTML(title.toLowerCase())} anchors are available yet.</div>
      </div>
    `;
  }
  return `
    <div class="aimxs-spine-section">
      <div class="aimxs-spine-section-title">${escapeHTML(title)}</div>
      <div class="aimxs-spine-chain-grid">${rendered}</div>
    </div>
  `;
}

function renderPivotButton(target = {}) {
  const label = String(target?.label || "").trim();
  const view = String(target?.view || "").trim().toLowerCase();
  if (!label || !view) {
    return "";
  }
  return `
    <button
      class="btn btn-secondary btn-small"
      type="button"
      data-aimxs-spine-action="open-workspace"
      data-aimxs-spine-view="${escapeHTML(view)}"
      data-aimxs-spine-run-id="${escapeHTML(String(target?.runId || "").trim())}"
      data-aimxs-spine-incident-entry-id="${escapeHTML(String(target?.incidentEntryId || "").trim())}"
      ${target?.disabled ? "disabled" : ""}
    >${escapeHTML(label)}</button>
  `;
}

export function renderAimxsDecisionBindingSpine(model = {}) {
  if (!model?.available) {
    return "";
  }
  const pivots = (Array.isArray(model?.pivotTargets) ? model.pivotTargets : [])
    .map(renderPivotButton)
    .filter(Boolean)
    .join("");
  return `
    <div class="aimxs-spine-shell" data-aimxs-spine="shared">
      <div class="aimxs-spine-topline">
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(String(model?.sourceLabel || "aimxs"))}</span>
        <span class="chip chip-neutral chip-compact">correlation=${escapeHTML(String(model?.correlationRef || "-"))}</span>
        <span class="chip chip-neutral chip-compact">run=${escapeHTML(String(model?.runId || "-"))}</span>
        <span class="chip chip-neutral chip-compact">approval=${escapeHTML(String(model?.approvalId || "-"))}</span>
      </div>
      <div class="aimxs-spine-grid">
        ${renderChain("Authority Chain", model.authorityChain)}
        ${renderChain("Grant Chain", model.grantChain)}
        ${renderChain("Receipt Chain", model.receiptChain)}
        ${renderChain("Replay Chain", model.replayChain)}
        ${renderChain("Evidence Chain", model.evidenceChain)}
      </div>
      ${model?.summary ? `<div class="aimxs-summary">${escapeHTML(String(model.summary))}</div>` : ""}
      ${pivots ? `<div class="aimxs-spine-pivot-row">${pivots}</div>` : ""}
    </div>
  `;
}
