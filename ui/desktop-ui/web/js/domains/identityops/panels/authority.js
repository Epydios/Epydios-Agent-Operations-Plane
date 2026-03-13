import { escapeHTML } from "../../../views/common.js";
import {
  chipClassForAuthorityBasis,
  createIdentitySettingsSnapshot,
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

export function renderCurrentIdentityAuthorityPanel(settings = {}) {
  const { runtimeIdentity, identitySummary } = createIdentitySettingsSnapshot(settings);
  const authorityChipClass = chipClassForAuthorityBasis(runtimeIdentity?.authorityBasis);
  return `
    <div class="metric settings-metric settings-metric-identity-authority" data-domain-root="identityops" data-identityops-panel="current-authority">
      <div class="metric-title-row">
        <div class="title">Current Identity + Authority</div>
        <span class="${authorityChipClass}">${escapeHTML(runtimeIdentity?.authorityBasis || "unknown")}</span>
      </div>
      <div class="meta">authEnabled=${escapeHTML(String(Boolean(runtimeIdentity?.authEnabled)))}; authenticated=${escapeHTML(String(Boolean(runtimeIdentity?.authenticated)))}</div>
      <div class="meta">subject=<code>${escapeHTML(identitySummary?.subject || "-")}</code>; clientId=<code>${escapeHTML(identitySummary?.clientId || "-")}</code></div>
      <div class="meta">roles=${renderDelimitedCodeList(identitySummary?.roles || [])}</div>
      <div class="meta">tenantScopes=${renderDelimitedCodeList(identitySummary?.tenantIds || [])}</div>
      <div class="meta">projectScopes=${renderDelimitedCodeList(identitySummary?.projectIds || [])}</div>
      <div class="meta">effectivePermissions=${renderDelimitedCodeList(identitySummary?.effectivePermissions || [])}</div>
    </div>
  `;
}

export function renderRuntimeIdentityContractPanel(settings = {}) {
  const { runtimeIdentity, identitySummary } = createIdentitySettingsSnapshot(settings);
  return `
    <div class="metric settings-metric settings-metric-runtime-identity" data-domain-root="identityops" data-identityops-panel="runtime-contract">
      <div class="title">Runtime Identity Contract</div>
      <div class="meta">source=${escapeHTML(runtimeIdentity?.source || "-")}; authEnabled=${escapeHTML(String(Boolean(runtimeIdentity?.authEnabled)))}; authenticated=${escapeHTML(String(Boolean(runtimeIdentity?.authenticated)))}</div>
      <div class="meta">authorityBasis=${escapeHTML(runtimeIdentity?.authorityBasis || "-")}; roleClaim=${escapeHTML(runtimeIdentity?.roleClaim || "-")}; clientIdClaim=${escapeHTML(runtimeIdentity?.clientIdClaim || "-")}</div>
      <div class="meta">tenantClaim=${escapeHTML(runtimeIdentity?.tenantClaim || "-")}; projectClaim=${escapeHTML(runtimeIdentity?.projectClaim || "-")}</div>
      <div class="meta">claimKeys=${renderDelimitedCodeList(identitySummary?.claimKeys || [])}</div>
    </div>
  `;
}

export function renderAuthorityBoard(settings = {}, session = {}) {
  const snapshot = createIdentityWorkspaceSnapshot(settings, session);
  const authorityChipClass = chipClassForAuthorityBasis(snapshot.authorityBasis);
  return `
    <article class="metric identityops-card identityops-card-primary" data-domain-root="identityops" data-identityops-panel="authority">
      <div class="metric-title-row">
        <div class="title">Authority</div>
        <span class="${authorityChipClass}">${escapeHTML(snapshot.authorityBasis || "unknown")}</span>
      </div>
      <div class="meta">policyMatrixRequired=${escapeHTML(String(snapshot.policyMatrixRequired))}; policyRuleCount=${escapeHTML(String(snapshot.policyRuleCount))}</div>
      <div class="meta">roleClaim=<code>${escapeHTML(snapshot.roleClaim || "-")}</code>; clientIdClaim=<code>${escapeHTML(snapshot.clientIdClaim || "-")}</code></div>
      <div class="meta">tenantClaim=<code>${escapeHTML(snapshot.tenantClaim || "-")}</code>; projectClaim=<code>${escapeHTML(snapshot.projectClaim || "-")}</code></div>
      <div class="meta">authoritySource=<code>${escapeHTML(snapshot.source)}</code></div>
    </article>
  `;
}
