import { chipClassForStatus, escapeHTML, renderPanelStateMetric } from "./common.js";
import {
  GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER,
  buildGovernedActionRequest,
  normalizeGovernedActionDraft,
  normalizeGovernedActionEvidenceReadiness,
  normalizeGovernedActionRiskTier
} from "../runtime/governed-action-contract.js";
import {
  applyDemoGovernanceToGovernedActionInput,
  buildDemoGovernanceContext
} from "../runtime/demo-governance.js";

function parsePositiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function normalizeFinanceSide(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "buy" || normalized === "sell") {
    return normalized;
  }
  return "buy";
}

function buildFinanceSummary(input) {
  const quantity = parsePositiveInteger(input.financeQuantity, 25);
  const side = normalizeFinanceSide(input.financeSide);
  const symbol = String(input.financeSymbol || "").trim().toUpperCase() || "AAPL";
  const account = String(input.financeAccount || "").trim() || "paper-main";
  return `${side.toUpperCase()} ${quantity} ${symbol} in paper account ${account}`;
}

function financeRequestLabel(input) {
  const symbol = String(input.financeSymbol || "").trim().toUpperCase() || "AAPL";
  return `Paper Trade Request: ${symbol}`;
}

function normalizeProfileDefaults(input) {
  const profile = String(input.demoProfile || "").trim();
  if (profile !== GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER) {
    return {
      requestLabel: String(input.requestLabel || "").trim(),
      requestSummary: String(input.requestSummary || "").trim(),
      actionType: String(input.actionType || "").trim(),
      actionTarget: String(input.actionTarget || "").trim(),
      resourceKind: String(input.resourceKind || "").trim(),
      resourceName: String(input.resourceName || "").trim(),
      resourceId: String(input.resourceId || "").trim()
    };
  }
  return {
    requestLabel: String(input.requestLabel || "").trim() || financeRequestLabel(input),
    requestSummary: String(input.requestSummary || "").trim() || buildFinanceSummary(input),
    actionType: String(input.actionType || "").trim() || "trade.execute",
    actionTarget: String(input.actionTarget || "").trim() || "paper-broker-order",
    resourceKind: String(input.resourceKind || "").trim() || "broker-order",
    resourceName: String(input.resourceName || "").trim() || `paper-order-${String(input.financeSymbol || "aapl").trim().toLowerCase() || "aapl"}`,
    resourceId: String(input.resourceId || "").trim() || String(input.resourceName || "").trim() || `paper-order-${String(input.financeSymbol || "aapl").trim().toLowerCase() || "aapl"}`
  };
}

export function ensureGovernedActionDefaults(ui, session) {
  const claims = session?.claims || {};
  if (ui.gaTenantId && !ui.gaTenantId.value && claims.tenant_id) {
    ui.gaTenantId.value = claims.tenant_id;
  }
  if (ui.gaProjectId && !ui.gaProjectId.value && claims.project_id) {
    ui.gaProjectId.value = claims.project_id;
  }
  if (ui.gaDemoProfile && !String(ui.gaDemoProfile.value || "").trim()) {
    ui.gaDemoProfile.value = GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER;
  }
  if (ui.gaEnvironment && !String(ui.gaEnvironment.value || "").trim()) {
    ui.gaEnvironment.value = "dev";
  }
  if (ui.gaRiskTier && !String(ui.gaRiskTier.value || "").trim()) {
    ui.gaRiskTier.value = "high";
  }
  if (ui.gaEvidenceReadiness && !String(ui.gaEvidenceReadiness.value || "").trim()) {
    ui.gaEvidenceReadiness.value = "PARTIAL";
  }
  if (ui.gaFinanceSymbol && !String(ui.gaFinanceSymbol.value || "").trim()) {
    ui.gaFinanceSymbol.value = "AAPL";
  }
  if (ui.gaFinanceSide && !String(ui.gaFinanceSide.value || "").trim()) {
    ui.gaFinanceSide.value = "buy";
  }
  if (ui.gaFinanceQuantity && !String(ui.gaFinanceQuantity.value || "").trim()) {
    ui.gaFinanceQuantity.value = "25";
  }
  if (ui.gaFinanceAccount && !String(ui.gaFinanceAccount.value || "").trim()) {
    ui.gaFinanceAccount.value = "paper-main";
  }
  if (ui.gaRequiredGrants && !String(ui.gaRequiredGrants.value || "").trim()) {
    ui.gaRequiredGrants.value = "grant.trading.supervisor";
  }
  if (ui.gaHandshakeRequired && !ui.gaHandshakeRequired.checked) {
    ui.gaHandshakeRequired.checked = true;
  }
}

export function readGovernedActionInput(ui) {
  const defaults = normalizeProfileDefaults({
    demoProfile: String(ui.gaDemoProfile?.value || "").trim(),
    requestLabel: String(ui.gaRequestLabel?.value || "").trim(),
    requestSummary: String(ui.gaRequestSummary?.value || "").trim(),
    actionType: String(ui.gaActionType?.value || "").trim(),
    actionTarget: String(ui.gaActionTarget?.value || "").trim(),
    resourceKind: String(ui.gaResourceKind?.value || "").trim(),
    resourceName: String(ui.gaResourceName?.value || "").trim(),
    resourceId: String(ui.gaResourceId?.value || "").trim(),
    financeSymbol: String(ui.gaFinanceSymbol?.value || "").trim(),
    financeSide: String(ui.gaFinanceSide?.value || "").trim(),
    financeQuantity: String(ui.gaFinanceQuantity?.value || "").trim(),
    financeAccount: String(ui.gaFinanceAccount?.value || "").trim()
  });

  return {
    requestId: String(ui.gaRequestId?.value || "").trim(),
    tenantId: String(ui.gaTenantId?.value || "").trim(),
    projectId: String(ui.gaProjectId?.value || "").trim(),
    environment: String(ui.gaEnvironment?.value || "").trim() || "dev",
    demoProfile: String(ui.gaDemoProfile?.value || "").trim() || GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER,
    requestLabel: defaults.requestLabel || "Governed Action Request",
    requestSummary: defaults.requestSummary || String(ui.gaRequestSummary?.value || "").trim(),
    subjectId: String(ui.gaSubjectId?.value || "").trim() || "operator-governed-action",
    approvedForProd: Boolean(ui.gaApprovedForProd?.checked),
    actionType: defaults.actionType || "trade.execute",
    actionClass: "execute",
    actionVerb: String(ui.gaActionVerb?.value || "").trim() || "execute",
    actionTarget: defaults.actionTarget || "governed-action-target",
    resourceKind: defaults.resourceKind || "broker-order",
    resourceNamespace: String(ui.gaResourceNamespace?.value || "").trim() || "epydios-system",
    resourceName: defaults.resourceName || "governed-action-001",
    resourceId: defaults.resourceId || defaults.resourceName || "governed-action-001",
    boundaryClass: String(ui.gaBoundaryClass?.value || "").trim() || "external_actuator",
    riskTier: normalizeGovernedActionRiskTier(ui.gaRiskTier?.value),
    requiredGrantsText: String(ui.gaRequiredGrants?.value || "").trim(),
    evidenceReadiness: normalizeGovernedActionEvidenceReadiness(ui.gaEvidenceReadiness?.value),
    handshakeRequired: Boolean(ui.gaHandshakeRequired?.checked),
    dryRun: Boolean(ui.gaDryRun?.checked),
    financeSymbol: String(ui.gaFinanceSymbol?.value || "").trim().toUpperCase(),
    financeSide: normalizeFinanceSide(ui.gaFinanceSide?.value),
    financeQuantity: String(ui.gaFinanceQuantity?.value || "").trim(),
    financeAccount: String(ui.gaFinanceAccount?.value || "").trim() || "paper-main"
  };
}

export function evaluateGovernedActionIssues(input) {
  const issues = [];
  if (!input.tenantId) {
    issues.push({ severity: "error", message: "Tenant is required." });
  }
  if (!input.projectId) {
    issues.push({ severity: "error", message: "Project is required." });
  }
  if (!String(input.requestLabel || "").trim()) {
    issues.push({ severity: "error", message: "Request label is required." });
  }
  if (!String(input.requestSummary || "").trim()) {
    issues.push({ severity: "error", message: "Request summary is required." });
  }
  if (!String(input.requiredGrantsText || "").trim()) {
    issues.push({
      severity: "warn",
      message: "No required grants are listed. That weakens real AIMXS-vs-OSS differentiation."
    });
  }
  if (String(input.evidenceReadiness || "").trim().toUpperCase() === "READY") {
    issues.push({
      severity: "warn",
      message: "Evidence readiness is READY. PARTIAL or MISSING is better for a real richness comparison."
    });
  }
  if (!input.handshakeRequired) {
    issues.push({
      severity: "warn",
      message: "Handshake enforcement is off. Turn it on if you want handshake-related AIMXS signals in the result."
    });
  }
  if (String(input.riskTier || "").trim().toLowerCase() !== "high") {
    issues.push({
      severity: "warn",
      message: "Risk tier is not high. High risk is better for a clear OSS-vs-AIMXS decision difference."
    });
  }
  if (String(input.demoProfile || "").trim() === GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER) {
    if (!String(input.financeSymbol || "").trim()) {
      issues.push({ severity: "error", message: "Finance symbol is required for the paper-trade demo profile." });
    }
    if (parsePositiveInteger(input.financeQuantity, 0) <= 0) {
      issues.push({ severity: "error", message: "Finance quantity must be a positive integer." });
    }
  }
  return issues;
}

export function buildGovernedActionRunPayload(input, session, demoGovernanceOverlay = null) {
  const actorSub = String(session?.claims?.sub || "").trim() || "anonymous-operator";
  const actorId = actorSub || "anonymous-operator";
  const adjustedInput = applyDemoGovernanceToGovernedActionInput(input, demoGovernanceOverlay, session);
  const demoGovernanceContext = buildDemoGovernanceContext(demoGovernanceOverlay, session);
  const financeOrder =
    String(adjustedInput.demoProfile || "").trim() === GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER
      ? {
          symbol: String(adjustedInput.financeSymbol || "").trim().toUpperCase(),
          side: normalizeFinanceSide(adjustedInput.financeSide),
          quantity: parsePositiveInteger(adjustedInput.financeQuantity, 25),
          account: String(adjustedInput.financeAccount || "").trim() || "paper-main"
        }
      : null;
  const request = buildGovernedActionRequest({
    ...adjustedInput,
    actor: actorId,
    originSurface: "home.governed_action_request"
  });
  const governedContext = request.context?.governed_action || {};
  const summary = String(adjustedInput.requestSummary || "").trim();
  const payload = {
    meta: {
      requestId: input.requestId || request.meta.requestId,
      tenantId: request.meta.tenantId,
      projectId: request.meta.projectId,
      environment: request.meta.environment,
      actor: {
        type: "operator_ui",
        id: actorId
      }
    },
    subject: request.subject,
    action: request.action,
    resource: request.resource,
    task: {
      intent: summary,
      summary,
      requestLabel: governedContext.request_label || adjustedInput.requestLabel,
      workflowKind: governedContext.workflow_kind || "external_action_request",
      demoProfile: governedContext.demo_profile || adjustedInput.demoProfile
    },
    context: {
      ...request.context,
      governed_action: {
        ...governedContext,
        operator_actor_id: actorId,
        request_summary: summary,
        finance_order: financeOrder || undefined,
        demo_governance: demoGovernanceContext || undefined
      }
    },
    mode: request.mode,
    dryRun: request.dryRun,
    annotations: {
      originSurface: "home.governed_action_request",
      governedAction: {
        contractId: governedContext.contract_id || "",
        demoProfile: governedContext.demo_profile || adjustedInput.demoProfile
      }
    }
  };
  if (demoGovernanceContext) {
    payload.context.demo_governance = demoGovernanceContext;
  }
  return payload;
}

export function renderGovernedActionPayload(ui, payload) {
  if (!ui.governedActionPayload) {
    return;
  }
  ui.governedActionPayload.textContent = JSON.stringify(payload || {}, null, 2);
}

export function renderGovernedActionPolicyHints(ui, input, issues) {
  if (!ui.governedActionPolicyHints) {
    return;
  }
  const comparisonHint = renderPanelStateMetric(
    "info",
    "Comparison Hygiene",
    "Keep the same request fields when switching between oss-only and aimxs-full. Only the active policy provider should change."
  );
  const policyHint = renderPanelStateMetric(
    "info",
    "Differentiation Inputs",
    `boundary=${input.boundaryClass}; risk=${input.riskTier}; evidence=${input.evidenceReadiness}; handshake=${input.handshakeRequired ? "on" : "off"}`
  );
  const requestHint = renderPanelStateMetric(
    "info",
    "Request Summary",
    `${input.requestLabel}: ${input.requestSummary}`
  );
  const issueMetrics =
    issues.length === 0
      ? renderPanelStateMetric("success", "Validation", "The current request is ready to submit as a real governed-action run.")
      : issues
          .map((issue) => {
            const state = issue.severity === "error" ? "error" : "warn";
            const title = issue.severity === "error" ? "Blocking Issue" : "Comparison Warning";
            return renderPanelStateMetric(state, title, issue.message);
          })
          .join("");
  ui.governedActionPolicyHints.innerHTML = `
    ${comparisonHint}
    ${policyHint}
    ${requestHint}
    ${issueMetrics}
  `;
}

export function renderGovernedActionFeedback(ui, tone, message) {
  if (!ui.governedActionFeedback) {
    return;
  }
  const title =
    tone === "error"
      ? "Governed Action Failed"
      : tone === "ok"
        ? "Governed Action Submitted"
        : "Governed Action Request";
  const state = tone === "error" ? "error" : tone === "ok" ? "success" : tone === "warn" ? "warn" : "info";
  ui.governedActionFeedback.innerHTML = renderPanelStateMetric(state, title, message || "");
}

export function renderGovernedActionReviewSummary(run) {
  const policy = run?.policyResponse && typeof run.policyResponse === "object" ? run.policyResponse : {};
  const decision = String(policy?.decision || run?.policyDecision || "").trim().toUpperCase() || "UNSET";
  const requestPayload = run?.requestPayload && typeof run.requestPayload === "object" ? run.requestPayload : {};
  const governed = requestPayload?.context?.governed_action && typeof requestPayload.context.governed_action === "object"
    ? requestPayload.context.governed_action
    : {};
  return `
    <div class="meta">Review this run in History to compare the actual provider response, evidence refs, and policy stratification.</div>
    <div class="run-detail-chips">
      <span class="chip chip-neutral chip-compact">runId=${escapeHTML(String(run?.runId || "-"))}</span>
      <span class="${`${chipClassForStatus(decision)} chip-compact`}">decision=${escapeHTML(decision)}</span>
      <span class="chip chip-neutral chip-compact">workflow=${escapeHTML(String(governed.workflow_kind || "-"))}</span>
      <span class="chip chip-neutral chip-compact">profile=${escapeHTML(String(governed.demo_profile || "-"))}</span>
    </div>
  `;
}
