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
  return `
    <div class="metric settings-metric settings-metric-policy-contract" data-domain-root="policyops" data-policyops-panel="current-contract">
      <div class="title">Current Policy Contract</div>
      <div class="meta">mode=${escapeHTML(displayAimxsModeLabel(settings?.aimxs?.mode || "-"))}; provider=${escapeHTML(policyProviderLabel(settings))}</div>
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
      <div class="meta">Selected provider and policy mode are shown above; this table shows the runtime-native pack catalog currently exposed to the desktop surface.</div>
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
