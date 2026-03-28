import {
  chipClassForStatus,
  displayPolicyProviderLabel,
  escapeHTML
} from "../../../views/common.js";
import {
  chipClassForPolicyEffect,
  derivePolicyOutcomePresentation,
  derivePolicyRichness
} from "../state.js";

function tableCell(label, content, attrs = "") {
  return `<td data-label="${escapeHTML(label)}"${attrs}>${content}</td>`;
}

export function renderRunPolicyRichnessSection(run) {
  const policyRichness = derivePolicyRichness(run);
  const policyOutcome = derivePolicyOutcomePresentation(run, policyRichness);
  return `
    <div class="metric" data-domain-root="policyops" data-policyops-panel="history-richness">
      <div class="title">2. Policy Richness</div>
      <div class="meta metric-note">This section is sourced from the actual stored governed-action request and provider response. It summarizes the policy outcome, rationale, and governance effects recorded for this run.</div>
      ${
        !policyRichness.isGovernedAction
          ? `<div class="meta">This run did not use the governed-action request contract.</div>`
          : `
            <div class="${escapeHTML(policyOutcome.bannerClass)}">
              <div class="metric-title-row">
                <div class="title">Operator Gate vs Policy Gate</div>
                ${policyOutcome.decision ? `<span class="${chipClassForStatus(policyOutcome.decision)} chip-compact">policy=${escapeHTML(policyOutcome.decision)}</span>` : ""}
              </div>
              <div class="run-detail-chips">
                <span class="chip chip-neutral chip-compact">operatorGate=${escapeHTML(policyRichness.operatorApprovalRequired ? "manual review" : "baseline decision lane")}</span>
                <span class="chip chip-neutral chip-compact">provider=${escapeHTML(policyOutcome.provider || "-")}</span>
                <span class="${chipClassForPolicyEffect(policyOutcome)}">effect=${escapeHTML(policyOutcome.effectLabel)}</span>
              </div>
              <div class="policy-outcome-detail">${escapeHTML(policyOutcome.headline)}</div>
              <div class="meta">${escapeHTML(policyOutcome.detail)}</div>
            </div>
            <div class="run-detail-chips">
              <span class="${`${chipClassForStatus(policyRichness.decision || "UNSET")} chip-compact`}">decision=${escapeHTML(policyRichness.decision || "UNSET")}</span>
              <span class="chip chip-neutral chip-compact">provider=${escapeHTML(displayPolicyProviderLabel(policyRichness.providerId || "-"))}</span>
              <span class="chip chip-neutral chip-compact">workflow=${escapeHTML(policyRichness.workflowKind || "-")}</span>
              <span class="chip chip-neutral chip-compact">profile=${escapeHTML(policyRichness.demoProfile || "-")}</span>
              <span class="chip chip-neutral chip-compact">env=${escapeHTML(policyRichness.environment || "-")}</span>
              <span class="chip chip-neutral chip-compact">verb=${escapeHTML(policyRichness.actionVerb || "-")}</span>
              <span class="chip chip-neutral chip-compact">boundary=${escapeHTML(policyRichness.boundaryClass || "-")}</span>
              <span class="chip chip-neutral chip-compact">risk=${escapeHTML(policyRichness.riskTier || "-")}</span>
              <span class="chip chip-neutral chip-compact">grants=${escapeHTML(String(policyRichness.requiredGrants.length))}</span>
              <span class="chip chip-neutral chip-compact">evidenceRefs=${escapeHTML(String(policyRichness.evidenceRefCount))}</span>
            </div>
            <details class="artifact-panel" data-detail-key="runs.policy_richness" open>
              <summary>Show governed request and provider richness</summary>
              <table class="data-table runs-table">
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>${tableCell("Signal", "Request Label")}${tableCell("Value", escapeHTML(policyRichness.requestLabel || "-"))}</tr>
                  <tr>${tableCell("Signal", "Request Summary")}${tableCell("Value", escapeHTML(policyRichness.requestSummary || "-"))}</tr>
                  <tr>${tableCell("Signal", "Contract ID")}${tableCell("Value", escapeHTML(policyRichness.contractId || "-"))}</tr>
                  <tr>${tableCell("Signal", "Environment")}${tableCell("Value", escapeHTML(policyRichness.environment || "-"))}</tr>
                  <tr>${tableCell("Signal", "Action Type")}${tableCell("Value", escapeHTML(policyRichness.actionType || "-"))}</tr>
                  <tr>${tableCell("Signal", "Action Verb")}${tableCell("Value", escapeHTML(policyRichness.actionVerb || "-"))}</tr>
                  <tr>${tableCell("Signal", "Approved For Prod")}${tableCell("Value", escapeHTML(policyRichness.approvedForProd ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Operator Approval Required")}${tableCell("Value", escapeHTML(policyRichness.operatorApprovalRequired ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Required Grants")}${tableCell("Value", escapeHTML(policyRichness.requiredGrants.join(", ") || "-"))}</tr>
                  <tr>${tableCell("Signal", "Evidence Readiness")}${tableCell("Value", escapeHTML(policyRichness.evidenceReadiness || "-"))}</tr>
                  <tr>${tableCell("Signal", "Handshake Required")}${tableCell("Value", escapeHTML(policyRichness.handshakeRequired ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Actor Subject")}${tableCell("Value", escapeHTML(policyRichness.actorSubject || "-"))}</tr>
                  <tr>${tableCell("Signal", "Actor Client ID")}${tableCell("Value", escapeHTML(policyRichness.actorClientId || "-"))}</tr>
                  <tr>${tableCell("Signal", "Authority Basis")}${tableCell("Value", escapeHTML(policyRichness.authorityBasis || "-"))}</tr>
                  <tr>${tableCell("Signal", "Authn Method")}${tableCell("Value", escapeHTML(policyRichness.authnMethod || "-"))}</tr>
                  <tr>${tableCell("Signal", "Authority Roles")}${tableCell("Value", escapeHTML(policyRichness.authorityRoles.join(", ") || "-"))}</tr>
                  <tr>${tableCell("Signal", "Tenant Scopes")}${tableCell("Value", escapeHTML(policyRichness.authorityTenantScopes.join(", ") || "-"))}</tr>
                  <tr>${tableCell("Signal", "Project Scopes")}${tableCell("Value", escapeHTML(policyRichness.authorityProjectScopes.join(", ") || "-"))}</tr>
                  <tr>${tableCell("Signal", "Decision Path")}${tableCell("Value", escapeHTML(policyRichness.decisionPath || "-"))}</tr>
                  <tr>${tableCell("Signal", "BAAK Engaged")}${tableCell("Value", escapeHTML(policyRichness.baakEngaged ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Adapter Status")}${tableCell("Value", escapeHTML(policyRichness.adapterStatus || "-"))}</tr>
                  <tr>${tableCell("Signal", "Adapter Error Code")}${tableCell("Value", escapeHTML(policyRichness.adapterErrorCode || "-"))}</tr>
                  <tr>${tableCell("Signal", "Base Adapter Present")}${tableCell("Value", escapeHTML(policyRichness.baseAdapterPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Current State Present")}${tableCell("Value", escapeHTML(policyRichness.currentStatePresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Current State Hash")}${tableCell("Value", escapeHTML(policyRichness.currentStateHash || "-"))}</tr>
                  <tr>${tableCell("Signal", "State Continuity Enabled")}${tableCell("Value", escapeHTML(policyRichness.continuityEnabled ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Kernel State In Present")}${tableCell("Value", escapeHTML(policyRichness.kernelStateInPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Kernel State Out Present")}${tableCell("Value", escapeHTML(policyRichness.kernelStateOutPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Audit Sink Active")}${tableCell("Value", escapeHTML(policyRichness.auditSinkActive ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Audit Event Ref")}${tableCell("Value", escapeHTML(policyRichness.auditEventRef || "-"))}</tr>
                  <tr>${tableCell("Signal", "Policy Stratification Present")}${tableCell("Value", escapeHTML(policyRichness.policyStratificationPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Request Contract Echo Present")}${tableCell("Value", escapeHTML(policyRichness.requestContractEchoPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Grant Token Present")}${tableCell("Value", escapeHTML(policyRichness.grantTokenPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Evidence Hash")}${tableCell("Value", escapeHTML(policyRichness.evidenceHash || "-"))}</tr>
                  <tr>${tableCell("Signal", "Primary Reason")}${tableCell("Value", escapeHTML(policyRichness.firstReason || "-"))}</tr>
                  <tr>${tableCell("Signal", "Finance Order")}${tableCell("Value", escapeHTML(Object.keys(policyRichness.financeOrder).length ? JSON.stringify(policyRichness.financeOrder) : "-"))}</tr>
                </tbody>
              </table>
            </details>
          `
      }
    </div>
  `;
}
