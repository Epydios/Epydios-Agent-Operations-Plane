import { escapeHTML, formatTime } from "../../views/common.js";

function renderField(field = {}) {
  const value = String(field?.value || "").trim();
  if (!value) {
    return "";
  }
  return `
    <div class="aimxs-binding-item">
      <div class="aimxs-binding-label">${escapeHTML(String(field?.label || "-"))}</div>
      <div class="aimxs-binding-value${field?.code ? " aimxs-binding-value-code" : ""}">
        ${field?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(formatTime(value))}
      </div>
    </div>
  `;
}

function renderSection(section = {}) {
  const fields = (Array.isArray(section?.fields) ? section.fields : []).map(renderField).filter(Boolean).join("");
  if (!fields && !section?.note) {
    return "";
  }
  return `
    <div class="aimxs-posture-section">
      <div class="aimxs-posture-header">
        <div class="aimxs-posture-title">${escapeHTML(String(section?.title || "-"))}</div>
        <span class="aimxs-posture-state aimxs-posture-state-${escapeHTML(String(section?.tone || "neutral"))}">
          ${escapeHTML(String(section?.badge || "neutral"))}
        </span>
      </div>
      ${section?.note ? `<div class="aimxs-posture-note">${escapeHTML(formatTime(String(section.note)))}</div>` : ""}
      ${fields ? `<div class="aimxs-binding-grid">${fields}</div>` : ""}
    </div>
  `;
}

export function renderAimxsIdentityPostureBlock(model = {}) {
  if (!model?.available) {
    return "";
  }
  const identityFields = (Array.isArray(model?.identityFields) ? model.identityFields : [])
    .map(renderField)
    .filter(Boolean)
    .join("");
  const identitySectionTitle = String(model?.identitySectionTitle || "Identity And Authority").trim() || "Identity And Authority";
  return `
    <div class="aimxs-posture-shell" data-aimxs-identity-posture="shared">
      ${model?.summary ? `<div class="aimxs-posture-summary">${escapeHTML(model.summary)}</div>` : ""}
      ${model?.surfaceLabel ? `<div class="aimxs-posture-surface">${escapeHTML(model.surfaceLabel)}</div>` : ""}
      <div class="aimxs-posture-section">
        <div class="aimxs-posture-header">
          <div class="aimxs-posture-title">${escapeHTML(identitySectionTitle)}</div>
        </div>
        ${
          identityFields
            ? `<div class="aimxs-binding-grid">${identityFields}</div>`
            : '<div class="aimxs-empty">No bounded identity fields are available yet.</div>'
        }
      </div>
      ${renderSection(model.currentPosture)}
      ${renderSection(model.targetPosture)}
      ${renderSection(model.rationale)}
    </div>
  `;
}
