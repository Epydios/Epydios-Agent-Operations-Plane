import { escapeHTML } from "../../../views/common.js";
import {
  createIdentityWorkspaceSnapshot,
  normalizeIdentityStringList,
  resolveAuthSummaryState
} from "../state.js";

function renderDelimitedCodeList(items = []) {
  const values = normalizeIdentityStringList(items);
  if (values.length === 0) {
    return "-";
  }
  return values.map((item) => `<code>${escapeHTML(item)}</code>`).join(", ");
}

export function renderIdentityAuthSummaryCard(container, session) {
  if (!(container instanceof HTMLElement)) {
    return;
  }
  const authState = resolveAuthSummaryState(session || {});
  container.dataset.domainRoot = "identityops";
  container.innerHTML = `
    <div class="title">Auth</div>
    <div class="meta"><span class="${authState.chipClass}">${escapeHTML(authState.label)}</span></div>
  `;
}

export function setIdentityAuthDisplay(ui, session) {
  if (ui.homeDashboardAuth instanceof HTMLElement) {
    renderIdentityAuthSummaryCard(ui.homeDashboardAuth, session);
    return;
  }
  if (!ui.authStatus) {
    return;
  }
  const authState = resolveAuthSummaryState(session || {});
  ui.authStatus.textContent = authState.label;
  ui.authStatus.className = authState.chipClass;
}

export function renderEffectiveIdentityBoard(settings = {}, session = {}) {
  const snapshot = createIdentityWorkspaceSnapshot(settings, session);
  const authState = resolveAuthSummaryState({
    authenticated: snapshot.authenticated
  });
  return `
    <article class="metric identityops-card identityops-card-primary" data-domain-root="identityops" data-identityops-panel="effective-identity">
      <div class="metric-title-row">
        <div class="title">Effective Identity</div>
        <span class="${authState.chipClass}">${escapeHTML(authState.label)}</span>
      </div>
      <div class="meta">source=<code>${escapeHTML(snapshot.source)}</code>; authEnabled=${escapeHTML(String(snapshot.authEnabled))}</div>
      <div class="meta">subject=<code>${escapeHTML(snapshot.subject)}</code></div>
      <div class="meta">clientId=<code>${escapeHTML(snapshot.clientId)}</code></div>
      <div class="meta">roles=${renderDelimitedCodeList(snapshot.roles)}</div>
      <div class="meta">claimKeys=${renderDelimitedCodeList(snapshot.claimKeys)}</div>
    </article>
  `;
}
