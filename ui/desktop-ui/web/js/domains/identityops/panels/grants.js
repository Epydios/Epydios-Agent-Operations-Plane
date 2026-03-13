import { escapeHTML } from "../../../views/common.js";
import {
  createIdentityWorkspaceSnapshot,
  normalizeIdentityStringList
} from "../state.js";

function renderDelimitedCodeList(items = []) {
  const values = normalizeIdentityStringList(items);
  if (values.length === 0) {
    return "-";
  }
  return values.map((item) => `<code>${escapeHTML(item)}</code>`).join(", ");
}

export function renderGrantEntitlementBoard(settings = {}, session = {}) {
  const snapshot = createIdentityWorkspaceSnapshot(settings, session);
  const permissionTone =
    snapshot.effectivePermissions.length > 0 ? "chip chip-ok chip-compact" : "chip chip-warn chip-compact";
  return `
    <article class="metric identityops-card identityops-card-primary" data-domain-root="identityops" data-identityops-panel="grant-entitlement">
      <div class="metric-title-row">
        <div class="title">Grant And Entitlement</div>
        <span class="${permissionTone}">permissions=${escapeHTML(String(snapshot.effectivePermissions.length))}</span>
      </div>
      <div class="meta">policyMatrixRequired=${escapeHTML(String(snapshot.policyMatrixRequired))}; policyRuleCount=${escapeHTML(String(snapshot.policyRuleCount))}</div>
      <div class="meta">effectivePermissions=${renderDelimitedCodeList(snapshot.effectivePermissions)}</div>
      <div class="meta">authorityBasis=<code>${escapeHTML(snapshot.authorityBasis || "-")}</code></div>
    </article>
  `;
}
