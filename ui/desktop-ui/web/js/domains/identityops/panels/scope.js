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

export function renderScopeBoard(settings = {}, session = {}) {
  const snapshot = createIdentityWorkspaceSnapshot(settings, session);
  return `
    <article class="metric identityops-card identityops-card-primary" data-domain-root="identityops" data-identityops-panel="scope">
      <div class="metric-title-row">
        <div class="title">Scope</div>
        <span class="chip chip-neutral chip-compact">${escapeHTML(snapshot.environment)}</span>
      </div>
      <div class="meta">tenantScopeCount=${escapeHTML(String(snapshot.tenantIds.length))}; projectScopeCount=${escapeHTML(String(snapshot.projectIds.length))}</div>
      <div class="meta">tenantScopes=${renderDelimitedCodeList(snapshot.tenantIds)}</div>
      <div class="meta">projectScopes=${renderDelimitedCodeList(snapshot.projectIds)}</div>
      <div class="meta">environment=<code>${escapeHTML(snapshot.environment)}</code></div>
    </article>
  `;
}
