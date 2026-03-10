import { escapeHTML } from "../views/common.js";
import {
  buildGovernedActionRequest,
  GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER,
  GOVERNED_ACTION_WORKFLOW_EXTERNAL_REQUEST,
  normalizeGovernedActionBoundaryClass,
  normalizeGovernedActionDraft,
  normalizeGovernedActionEvidenceReadiness,
  normalizeGovernedActionRiskTier
} from "../runtime/governed-action-contract.js";

export const AIMXS_PROBE_STATE_KEY = "epydios.agentops.desktop.aimxs.probe.v1";

function uniqueCsvList(raw) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "oss-only" || normalized === "aimxs-full") {
    return normalized;
  }
  return "unknown";
}

function chipClassForProbeStatus(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "applied" || state === "clean" || state === "captured") {
    return "chip chip-ok chip-compact";
  }
  if (state === "dirty" || state === "warn" || state === "pending") {
    return "chip chip-warn chip-compact";
  }
  if (state === "error" || state === "invalid") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function renderProbeResultCard(modeLabel, result) {
  if (!result) {
    return `
      <article class="artifact-path-card">
        <div class="metric-title-row">
          <div class="title">${escapeHTML(modeLabel)}</div>
          <span class="chip chip-neutral chip-compact">empty</span>
        </div>
        <div class="meta">No captured result yet for this mode.</div>
      </article>
    `;
  }
  const signals = result.differentialSignals || {};
  return `
    <article class="artifact-path-card">
      <div class="metric-title-row">
        <div class="title">${escapeHTML(modeLabel)}</div>
        <span class="chip chip-neutral chip-compact">decision=${escapeHTML(result.decision || "-")}</span>
      </div>
      <div class="meta">provider=${escapeHTML(result.providerId || "-")}; evaluatedAt=${escapeHTML(result.evaluatedAt || "-")}</div>
      <div class="meta">capabilities=${escapeHTML(String((result.capabilities || []).length))}; evidenceRefs=${escapeHTML(String(signals.evidenceRefsCount || 0))}</div>
      <div class="meta">deferCapability=${escapeHTML(String(Boolean(signals.hasDeferCapability)))}; handshakeCapability=${escapeHTML(String(Boolean(signals.hasHandshakeCapability)))}; policyStratification=${escapeHTML(String(Boolean(signals.hasPolicyStratification)))}; evidenceHash=${escapeHTML(String(Boolean(signals.hasEvidenceHash)))}; baakEngaged=${escapeHTML(String(Boolean(signals.baakEngaged)))}</div>
    </article>
  `;
}

function buildComparisonLines(resultsByMode = {}) {
  const oss = resultsByMode["oss-only"];
  const aimxs = resultsByMode["aimxs-full"];
  if (!oss || !aimxs) {
    return [];
  }
  const ossSignals = oss.differentialSignals || {};
  const aimxsSignals = aimxs.differentialSignals || {};
  return [
    `decisionDifferential=oss-only:${oss.decision || "-"} vs aimxs-full:${aimxs.decision || "-"}`,
    `policy.defer capability=oss-only:${Boolean(ossSignals.hasDeferCapability)} vs aimxs-full:${Boolean(aimxsSignals.hasDeferCapability)}`,
    `handshake validation=oss-only:${Boolean(ossSignals.hasHandshakeCapability)} vs aimxs-full:${Boolean(aimxsSignals.hasHandshakeCapability)}`,
    `policy stratification=oss-only:${Boolean(ossSignals.hasPolicyStratification)} vs aimxs-full:${Boolean(aimxsSignals.hasPolicyStratification)}`,
    `evidence hash=oss-only:${Boolean(ossSignals.hasEvidenceHash)} vs aimxs-full:${Boolean(aimxsSignals.hasEvidenceHash)}`,
    `evidence refs count=oss-only:${Number(ossSignals.evidenceRefsCount || 0)} vs aimxs-full:${Number(aimxsSignals.evidenceRefsCount || 0)}`
  ];
}

export function normalizeAimxsProbeDraft(input = {}, defaults = {}) {
  const normalized = normalizeGovernedActionDraft(
    {
      ...input,
      workflowKind: input.workflowKind || GOVERNED_ACTION_WORKFLOW_EXTERNAL_REQUEST,
      requestLabel: input.requestLabel || "AIMXS Richness Self-Check",
      demoProfile: input.demoProfile || GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER,
      originSurface: input.originSurface || "settings_aimxs_self_check",
      subjectId: input.subjectId || defaults.subjectId || "operator-richness-probe",
      actionType: input.actionType || defaults.actionType || "trade.execute",
      resourceKind: input.resourceKind || defaults.resourceKind || "broker-order",
      resourceName: input.resourceName || defaults.resourceName || "order-probe-001",
      resourceId: input.resourceId || input.resourceName || defaults.resourceName || "order-probe-001"
    },
    defaults
  );
  return {
    ...normalized,
    boundaryClass: normalizeGovernedActionBoundaryClass(normalized.boundaryClass),
    riskTier: normalizeGovernedActionRiskTier(normalized.riskTier),
    evidenceReadiness: normalizeGovernedActionEvidenceReadiness(normalized.evidenceReadiness),
    requiredGrantsText: uniqueCsvList(normalized.requiredGrantsText || normalized.requiredGrants.join(", ")).join(", ")
  };
}

export function normalizeAimxsProbeResult(input = {}) {
  const differentialSignals = input?.differentialSignals && typeof input.differentialSignals === "object"
    ? input.differentialSignals
    : {};
  return {
    mode: normalizeMode(input.mode),
    providerId: String(input.providerId || "").trim(),
    providerName: String(input.providerName || "").trim(),
    decision: String(input.decision || "").trim().toUpperCase(),
    summary: String(input.summary || "").trim(),
    evaluatedAt: String(input.evaluatedAt || "").trim(),
    capabilities: Array.isArray(input.capabilities) ? input.capabilities.map((item) => String(item || "").trim()).filter(Boolean) : [],
    requestPayload: input?.requestPayload && typeof input.requestPayload === "object" ? input.requestPayload : {},
    responsePayload: input?.responsePayload && typeof input.responsePayload === "object" ? input.responsePayload : {},
    differentialSignals: {
      hasDeferCapability: Boolean(differentialSignals.hasDeferCapability),
      hasHandshakeCapability: Boolean(differentialSignals.hasHandshakeCapability),
      hasPolicyDecisionRefsCapability: Boolean(differentialSignals.hasPolicyDecisionRefsCapability),
      hasPolicyStratification: Boolean(differentialSignals.hasPolicyStratification),
      baakEngaged: Boolean(differentialSignals.baakEngaged),
      hasEvidenceHash: Boolean(differentialSignals.hasEvidenceHash),
      evidenceRefsCount: Number(differentialSignals.evidenceRefsCount || 0)
    }
  };
}

export function normalizeAimxsProbeState(input = {}, defaults = {}) {
  const resultsByModeInput = input?.resultsByMode && typeof input.resultsByMode === "object" ? input.resultsByMode : {};
  const resultsByMode = {};
  for (const mode of ["oss-only", "aimxs-full"]) {
    if (resultsByModeInput[mode]) {
      resultsByMode[mode] = normalizeAimxsProbeResult(resultsByModeInput[mode]);
    }
  }
  const draftSource = input?.draft && typeof input.draft === "object" ? input.draft : input;
  const lastResult = input?.lastResult ? normalizeAimxsProbeResult(input.lastResult) : null;
  return {
    draft: normalizeAimxsProbeDraft(draftSource, defaults),
    status: String(input.status || "clean").trim().toLowerCase() || "clean",
    message: String(input.message || "").trim(),
    lastResult,
    resultsByMode
  };
}

export function buildAimxsProbeRequest(draft = {}) {
  const normalized = normalizeAimxsProbeDraft(draft);
  return buildGovernedActionRequest({
    ...normalized,
    actor: "desktop-richness-ui",
    subjectType: "user",
    actionClass: "execute",
    actionVerb: "execute",
    actionTarget: normalized.resourceName,
    resourceNamespace: "epydios-system",
    policyBucketId: "desktop-ui-richness-probe"
  });
}

export function readAimxsProbeInput(root) {
  if (!root) {
    return null;
  }
  const read = (selector) => root.querySelector(selector);
  const tenantId = read("#settings-aimxs-probe-tenant-id");
  const projectId = read("#settings-aimxs-probe-project-id");
  const environment = read("#settings-aimxs-probe-environment");
  const subjectId = read("#settings-aimxs-probe-subject-id");
  const actionType = read("#settings-aimxs-probe-action-type");
  const resourceKind = read("#settings-aimxs-probe-resource-kind");
  const resourceName = read("#settings-aimxs-probe-resource-name");
  const boundaryClass = read("#settings-aimxs-probe-boundary-class");
  const riskTier = read("#settings-aimxs-probe-risk-tier");
  const requiredGrants = read("#settings-aimxs-probe-required-grants");
  const evidenceReadiness = read("#settings-aimxs-probe-evidence-readiness");
  const handshakeRequired = read("#settings-aimxs-probe-handshake-required");
  const approvedForProd = read("#settings-aimxs-probe-approved-for-prod");
  const dryRun = read("#settings-aimxs-probe-dry-run");
  if (
    !(tenantId instanceof HTMLInputElement) ||
    !(projectId instanceof HTMLInputElement) ||
    !(environment instanceof HTMLInputElement) ||
    !(subjectId instanceof HTMLInputElement) ||
    !(actionType instanceof HTMLInputElement) ||
    !(resourceKind instanceof HTMLInputElement) ||
    !(resourceName instanceof HTMLInputElement) ||
    !(boundaryClass instanceof HTMLSelectElement) ||
    !(riskTier instanceof HTMLSelectElement) ||
    !(requiredGrants instanceof HTMLInputElement) ||
    !(evidenceReadiness instanceof HTMLSelectElement) ||
    !(handshakeRequired instanceof HTMLInputElement) ||
    !(approvedForProd instanceof HTMLInputElement) ||
    !(dryRun instanceof HTMLInputElement)
  ) {
    return null;
  }
  return normalizeAimxsProbeDraft({
    tenantId: tenantId.value,
    projectId: projectId.value,
    environment: environment.value,
    subjectId: subjectId.value,
    actionType: actionType.value,
    resourceKind: resourceKind.value,
    resourceName: resourceName.value,
    boundaryClass: boundaryClass.value,
    riskTier: riskTier.value,
    requiredGrantsText: requiredGrants.value,
    evidenceReadiness: evidenceReadiness.value,
    handshakeRequired: handshakeRequired.checked,
    approvedForProd: approvedForProd.checked,
    dryRun: dryRun.checked
  });
}

export function renderAimxsProbeMetric(viewState = {}, activation = {}) {
  const probeState = normalizeAimxsProbeState(viewState);
  const draft = probeState.draft;
  const payloadPreview = buildAimxsProbeRequest(draft);
  const comparisonLines = buildComparisonLines(probeState.resultsByMode);
  const lastResult = probeState.lastResult;
  const activeMode = normalizeMode(activation.activeMode);
  const selectedProvider = String(activation.selectedProviderId || activation.selectedProviderName || "-").trim() || "-";
  const storedModes = Object.keys(probeState.resultsByMode);
  const feedbackLines = [];
  if (probeState.message) {
    feedbackLines.push(`<div class="meta">${escapeHTML(probeState.message)}</div>`);
  }
  if (activeMode !== "oss-only" && activeMode !== "aimxs-full") {
    feedbackLines.push('<div class="meta settings-editor-warn">Switch AIMXS Deployment Contract to <code>oss-only</code> or <code>aimxs-full</code> before running this self-check.</div>');
  }
  feedbackLines.push('<div class="meta">This panel is provider-level inside the Desktop product. It is not the managed-agent chat path.</div>');
  feedbackLines.push('<div class="meta">The generated payload is shown below so you can inspect exactly what is being evaluated before you click Evaluate Current Mode.</div>');

  return `
    <div class="metric settings-metric settings-metric-aimxs-probe">
      <div class="title">AIMXS Richness Self-Check</div>
      <div class="meta">Drive the current active policy mode with field values only, then compare captured <code>oss-only</code> and <code>aimxs-full</code> results side by side after you switch modes.</div>
      <div class="meta">activeMode=${escapeHTML(activeMode)}; selectedProvider=${escapeHTML(selectedProvider)}; storedModes=${escapeHTML(storedModes.length > 0 ? storedModes.join(", ") : "-")}</div>
      <div class="settings-editor-grid">
        <label class="field">
          <span class="label">Tenant</span>
          <input id="settings-aimxs-probe-tenant-id" class="filter-input" type="text" data-settings-aimxs-probe-field="tenantId" value="${escapeHTML(draft.tenantId)}" />
        </label>
        <label class="field">
          <span class="label">Project</span>
          <input id="settings-aimxs-probe-project-id" class="filter-input" type="text" data-settings-aimxs-probe-field="projectId" value="${escapeHTML(draft.projectId)}" />
        </label>
        <label class="field">
          <span class="label">Environment</span>
          <input id="settings-aimxs-probe-environment" class="filter-input" type="text" data-settings-aimxs-probe-field="environment" value="${escapeHTML(draft.environment)}" />
        </label>
        <label class="field">
          <span class="label">Subject ID</span>
          <input id="settings-aimxs-probe-subject-id" class="filter-input" type="text" data-settings-aimxs-probe-field="subjectId" value="${escapeHTML(draft.subjectId)}" />
        </label>
        <label class="field">
          <span class="label">Action Type</span>
          <input id="settings-aimxs-probe-action-type" class="filter-input" type="text" data-settings-aimxs-probe-field="actionType" value="${escapeHTML(draft.actionType)}" />
        </label>
        <label class="field">
          <span class="label">Resource Kind</span>
          <input id="settings-aimxs-probe-resource-kind" class="filter-input" type="text" data-settings-aimxs-probe-field="resourceKind" value="${escapeHTML(draft.resourceKind)}" />
        </label>
        <label class="field">
          <span class="label">Resource Name</span>
          <input id="settings-aimxs-probe-resource-name" class="filter-input" type="text" data-settings-aimxs-probe-field="resourceName" value="${escapeHTML(draft.resourceName)}" />
        </label>
        <label class="field">
          <span class="label">Boundary Class</span>
          <select id="settings-aimxs-probe-boundary-class" class="filter-input" data-settings-aimxs-probe-field="boundaryClass">
            <option value="external_actuator" ${draft.boundaryClass === "external_actuator" ? "selected" : ""}>external_actuator</option>
            <option value="desktop_action" ${draft.boundaryClass === "desktop_action" ? "selected" : ""}>desktop_action</option>
            <option value="model_gateway" ${draft.boundaryClass === "model_gateway" ? "selected" : ""}>model_gateway</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Risk Tier</span>
          <select id="settings-aimxs-probe-risk-tier" class="filter-input" data-settings-aimxs-probe-field="riskTier">
            <option value="high" ${draft.riskTier === "high" ? "selected" : ""}>high</option>
            <option value="medium" ${draft.riskTier === "medium" ? "selected" : ""}>medium</option>
            <option value="low" ${draft.riskTier === "low" ? "selected" : ""}>low</option>
          </select>
        </label>
        <label class="field field-wide">
          <span class="label">Required Grants (comma-separated)</span>
          <input id="settings-aimxs-probe-required-grants" class="filter-input" type="text" data-settings-aimxs-probe-field="requiredGrantsText" value="${escapeHTML(draft.requiredGrantsText)}" />
        </label>
        <label class="field">
          <span class="label">Evidence Readiness</span>
          <select id="settings-aimxs-probe-evidence-readiness" class="filter-input" data-settings-aimxs-probe-field="evidenceReadiness">
            <option value="MISSING" ${draft.evidenceReadiness === "MISSING" ? "selected" : ""}>MISSING</option>
            <option value="PARTIAL" ${draft.evidenceReadiness === "PARTIAL" ? "selected" : ""}>PARTIAL</option>
            <option value="READY" ${draft.evidenceReadiness === "READY" ? "selected" : ""}>READY</option>
          </select>
        </label>
        <label class="field field-checkbox">
          <input id="settings-aimxs-probe-handshake-required" type="checkbox" data-settings-aimxs-probe-field="handshakeRequired" ${draft.handshakeRequired ? "checked" : ""} />
          <span>Enforce handshake</span>
        </label>
        <label class="field field-checkbox">
          <input id="settings-aimxs-probe-approved-for-prod" type="checkbox" data-settings-aimxs-probe-field="approvedForProd" ${draft.approvedForProd ? "checked" : ""} />
          <span>Approved for prod</span>
        </label>
        <label class="field field-checkbox">
          <input id="settings-aimxs-probe-dry-run" type="checkbox" data-settings-aimxs-probe-field="dryRun" ${draft.dryRun ? "checked" : ""} />
          <span>Dry run</span>
        </label>
      </div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary" type="button" data-settings-aimxs-probe-action="evaluate">Evaluate Current Mode</button>
          </div>
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary btn-small" type="button" data-settings-aimxs-probe-action="clear-results">Clear Stored Results</button>
          </div>
        </div>
        <span id="settings-aimxs-probe-status-chip" class="${chipClassForProbeStatus(probeState.status)}">${escapeHTML(probeState.status || "clean")}</span>
      </div>
      <div id="settings-aimxs-probe-feedback" class="stack" role="status" aria-live="polite" aria-atomic="true">
        ${feedbackLines.join("")}
      </div>
      <details class="details-shell" data-detail-key="settings.aimxs_probe.payload" open>
        <summary>Generated policy payload</summary>
        <pre id="settings-aimxs-probe-payload" class="code-block">${escapeHTML(JSON.stringify(payloadPreview, null, 2))}</pre>
      </details>
      ${
        lastResult
          ? `
            <details class="details-shell" data-detail-key="settings.aimxs_probe.last_result" open>
              <summary>Last captured result</summary>
              <div class="meta">mode=${escapeHTML(lastResult.mode)}; provider=${escapeHTML(lastResult.providerId || "-")}; decision=${escapeHTML(lastResult.decision || "-")}; evaluatedAt=${escapeHTML(lastResult.evaluatedAt || "-")}</div>
              <div class="meta">${escapeHTML(lastResult.summary || "No summary returned.")}</div>
              <div class="meta">deferCapability=${escapeHTML(String(Boolean(lastResult.differentialSignals?.hasDeferCapability)))}; handshakeCapability=${escapeHTML(String(Boolean(lastResult.differentialSignals?.hasHandshakeCapability)))}; policyStratification=${escapeHTML(String(Boolean(lastResult.differentialSignals?.hasPolicyStratification)))}; evidenceHash=${escapeHTML(String(Boolean(lastResult.differentialSignals?.hasEvidenceHash)))}; evidenceRefs=${escapeHTML(String(lastResult.differentialSignals?.evidenceRefsCount || 0))}</div>
              <pre class="code-block">${escapeHTML(JSON.stringify(lastResult.responsePayload || {}, null, 2))}</pre>
            </details>
          `
          : ""
      }
      <div class="artifact-path-grid">
        ${renderProbeResultCard("oss-only", probeState.resultsByMode["oss-only"])}
        ${renderProbeResultCard("aimxs-full", probeState.resultsByMode["aimxs-full"])}
      </div>
      ${
        comparisonLines.length > 0
          ? `
            <details class="details-shell" data-detail-key="settings.aimxs_probe.comparison" open>
              <summary>Differential summary</summary>
              ${comparisonLines.map((line) => `<div class="meta">${escapeHTML(line)}</div>`).join("")}
            </details>
          `
          : ""
      }
    </div>
  `;
}
