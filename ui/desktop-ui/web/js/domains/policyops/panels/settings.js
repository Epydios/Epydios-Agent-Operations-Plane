import { isAimxsPremiumVisible } from "../../../aimxs/state.js";
import { displayAimxsModeLabel, escapeHTML } from "../../../views/common.js";
import {
  createPolicySettingsSnapshot,
  policyProviderLabel,
  renderDelimitedCodeList,
  renderPolicyPackRows,
  summarizePolicyDataSource
} from "../state.js";

function tableCell(label, content, attrs = "") {
  return `<td data-label="${escapeHTML(label)}"${attrs}>${content}</td>`;
}

export function renderCurrentPolicyContractPanel(settings = {}) {
  const { runtimeIdentity, policyCatalog, policyCatalogItems, activePolicyPack } = createPolicySettingsSnapshot(settings);
  const aimxsPremiumVisible = isAimxsPremiumVisible(settings);
  const modeLabel = displayAimxsModeLabel(settings?.aimxs?.mode || "-");
  return `
    <div class="metric settings-metric settings-metric-policy-contract" data-domain-root="policyops" data-policyops-panel="current-contract">
      <div class="title">Decision Contract</div>
      <div class="meta">decisionMode=${escapeHTML(modeLabel)}; provider=${escapeHTML(policyProviderLabel(settings))}</div>
      <div class="meta">baselineContract=active; premiumRichness=${escapeHTML(aimxsPremiumVisible ? "visible" : "not-loaded")}</div>
      <div class="meta">policyCatalogSource=${escapeHTML(summarizePolicyDataSource(policyCatalog?.source || "unknown"))}; packCount=${escapeHTML(String(policyCatalog?.count || policyCatalogItems.length || 0))}</div>
      <div class="meta">policyMatrixRequired=${escapeHTML(String(Boolean(runtimeIdentity?.policyMatrixRequired)))}; policyRuleCount=${escapeHTML(String(runtimeIdentity?.policyRuleCount || 0))}</div>
      <div class="meta">activePack=<code>${escapeHTML(activePolicyPack?.packId || "-")}</code>@<code>${escapeHTML(activePolicyPack?.version || "unversioned")}</code>; activationTarget=${escapeHTML(activePolicyPack?.activationTarget || "workspace")}; activationPosture=${escapeHTML(activePolicyPack?.activationPosture || "available")}</div>
      <div class="meta">schemaReadiness=${escapeHTML(activePolicyPack?.schemaReadiness || "unknown")}; compileReadiness=${escapeHTML(activePolicyPack?.compileReadiness || "unknown")}</div>
      <div class="meta">sourceRef=${activePolicyPack?.sourceRef ? `<code>${escapeHTML(activePolicyPack.sourceRef)}</code>` : "-"}; stableRef=${activePolicyPack?.stableRef ? `<code>${escapeHTML(activePolicyPack.stableRef)}</code>` : "-"}</div>
      <div class="meta">availablePacks=${renderDelimitedCodeList(policyCatalogItems.map((item) => item?.packId || ""))}</div>
    </div>
  `;
}

export function renderPolicyPackCatalogPanel(settings = {}) {
  const { policyCatalogItems } = createPolicySettingsSnapshot(settings);
  const policyPackRows = renderPolicyPackRows(policyCatalogItems);
  return `
    <div class="metric settings-metric settings-metric-policy-packs" data-domain-root="policyops" data-policyops-panel="pack-catalog">
      <div class="title">Policy Pack Catalog</div>
      <div class="meta">The decision contract above shows the active provider lane and current pack posture. This catalog shows the packs the desktop can verify and route right now.</div>
      <table class="data-table settings-table">
        <caption class="sr-only">Policy pack catalog for the current desktop surface, including pack id, version, source ref, stable ref, rigor contract, role bundles, decision surfaces, and boundary requirements.</caption>
        <thead>
          <tr>
            <th scope="col">Pack</th>
            <th scope="col">Label</th>
            <th scope="col">Version</th>
            <th scope="col">Source Ref</th>
            <th scope="col">Stable Ref</th>
            <th scope="col">Rigor Contract</th>
            <th scope="col">Role Bundles</th>
            <th scope="col">Decision Surfaces</th>
            <th scope="col">Boundary Requirements</th>
          </tr>
        </thead>
        <tbody>${policyPackRows || `<tr>${tableCell("Status", "No policy packs are loaded for the current desktop surface. Refresh Diagnostics, then verify the runtime policy-pack endpoint and current scope.", ' colspan="9"')}</tr>`}</tbody>
      </table>
    </div>
  `;
}
