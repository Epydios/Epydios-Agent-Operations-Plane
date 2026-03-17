import { escapeHTML, formatTime } from "../../views/common.js";

function renderStage(stage = {}) {
  const value = String(stage?.value || "").trim() || "-";
  const note = String(stage?.note || "").trim();
  const stateLabel = String(stage?.stateLabel || "").trim() || "Pending";
  const tone = String(stage?.tone || "neutral").trim().toLowerCase();
  const formattedValue = formatTime(value);
  return `
    <div class="aimxs-stage aimxs-stage-${escapeHTML(tone)}" data-aimxs-stage="${escapeHTML(String(stage?.key || "").trim())}">
      <div class="aimxs-stage-header">
        <div class="aimxs-stage-label">${escapeHTML(String(stage?.label || "-"))}</div>
        <span class="aimxs-stage-state aimxs-stage-state-${escapeHTML(tone)}">${escapeHTML(stateLabel)}</span>
      </div>
      <div class="aimxs-stage-value${stage?.code ? " aimxs-stage-value-code" : ""}">
        ${stage?.code ? `<code>${escapeHTML(formattedValue)}</code>` : escapeHTML(formattedValue)}
      </div>
      ${note ? `<div class="aimxs-stage-note">${escapeHTML(formatTime(note))}</div>` : ""}
    </div>
  `;
}

function renderBindingField(field = {}) {
  const value = String(field?.value || "").trim();
  if (!value) {
    return "";
  }
  return `
    <div class="aimxs-binding-item">
      <div class="aimxs-binding-label">${escapeHTML(String(field?.label || "-"))}</div>
      <div class="aimxs-binding-value${field?.code ? " aimxs-binding-value-code" : ""}">
        ${field?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
      </div>
    </div>
  `;
}

function renderRef(ref = {}) {
  const value = String(ref?.value || "").trim();
  if (!value) {
    return "";
  }
  return `
    <span class="aimxs-ref-pill aimxs-ref-pill-${escapeHTML(String(ref?.kind || "trace").trim().toLowerCase())}">
      <span class="aimxs-ref-label">${escapeHTML(String(ref?.label || "-"))}</span>
      <span class="aimxs-ref-value${ref?.code ? " aimxs-ref-value-code" : ""}">
        ${ref?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
      </span>
    </span>
  `;
}

export function renderAimxsLegibilityBlock(model = {}) {
  if (!model?.available) {
    return "";
  }
  const lifecycle = (Array.isArray(model?.lifecycle) ? model.lifecycle : []).map(renderStage).join("");
  const binding = (Array.isArray(model?.bindingFields) ? model.bindingFields : []).map(renderBindingField).filter(Boolean).join("");
  const refs = (Array.isArray(model?.refs) ? model.refs : []).map(renderRef).filter(Boolean).join("");
  const summary = String(model?.summary || "").trim();
  return `
    <div class="aimxs-legibility-shell" data-aimxs-legibility="shared">
      <div class="aimxs-section">
        <div class="aimxs-section-title">AIMXS Lifecycle Ribbon</div>
        <div class="aimxs-lifecycle-ribbon">${lifecycle}</div>
      </div>
      <div class="aimxs-section">
        <div class="aimxs-section-title">Decision Binding Contract</div>
        ${binding ? `<div class="aimxs-binding-grid">${binding}</div>` : '<div class="aimxs-empty">No decision-binding fields are available yet.</div>'}
      </div>
      <div class="aimxs-section">
        <div class="aimxs-section-title">Stable Or Replay Refs</div>
        ${refs ? `<div class="aimxs-ref-group">${refs}</div>` : '<div class="aimxs-empty">No stable or replay references are available yet.</div>'}
      </div>
      ${summary ? `<div class="aimxs-summary">${escapeHTML(summary)}</div>` : ""}
    </div>
  `;
}
