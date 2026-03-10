export const GOVERNED_ACTION_CONTRACT_ID = "epydios.governed-action.v1";
export const GOVERNED_ACTION_WORKFLOW_EXTERNAL_REQUEST = "external_action_request";
export const GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER = "finance_paper_trade";

function uniqueStrings(items = []) {
  return Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function uniqueCsvList(raw) {
  return uniqueStrings(
    String(raw || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function normalizeGovernedActionBoundaryClass(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "external_actuator" || normalized === "desktop_action" || normalized === "model_gateway") {
    return normalized;
  }
  return "external_actuator";
}

export function normalizeGovernedActionRiskTier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return "high";
}

export function normalizeGovernedActionEvidenceReadiness(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "MISSING" || normalized === "PARTIAL" || normalized === "READY") {
    return normalized;
  }
  return "PARTIAL";
}

export function normalizeGovernedActionDraft(input = {}, defaults = {}) {
  const requiredGrants = Array.isArray(input.requiredGrants)
    ? uniqueStrings(input.requiredGrants)
    : uniqueCsvList(input.requiredGrantsText || defaults.requiredGrantsText || "grant.trading.supervisor");
  return {
    tenantId: String(input.tenantId || defaults.tenantId || "").trim(),
    projectId: String(input.projectId || defaults.projectId || "").trim(),
    environment: String(input.environment || defaults.environment || "dev").trim() || "dev",
    actor: String(input.actor || defaults.actor || "desktop-governed-action").trim() || "desktop-governed-action",
    subjectType: String(input.subjectType || defaults.subjectType || "user").trim() || "user",
    subjectId: String(input.subjectId || defaults.subjectId || "operator-governed-action").trim() || "operator-governed-action",
    approvedForProd: Boolean(input.approvedForProd),
    actionType: String(input.actionType || defaults.actionType || "trade.execute").trim() || "trade.execute",
    actionClass: String(input.actionClass || defaults.actionClass || "execute").trim() || "execute",
    actionVerb: String(input.actionVerb || defaults.actionVerb || "execute").trim() || "execute",
    actionTarget: String(input.actionTarget || defaults.actionTarget || input.resourceName || defaults.resourceName || "governed-action-target").trim() || "governed-action-target",
    resourceKind: String(input.resourceKind || defaults.resourceKind || "broker-order").trim() || "broker-order",
    resourceNamespace: String(input.resourceNamespace || defaults.resourceNamespace || "epydios-system").trim() || "epydios-system",
    resourceName: String(input.resourceName || defaults.resourceName || "governed-action-001").trim() || "governed-action-001",
    resourceId: String(input.resourceId || defaults.resourceId || input.resourceName || defaults.resourceName || "governed-action-001").trim() || "governed-action-001",
    boundaryClass: normalizeGovernedActionBoundaryClass(input.boundaryClass || defaults.boundaryClass),
    riskTier: normalizeGovernedActionRiskTier(input.riskTier || defaults.riskTier),
    requiredGrants,
    requiredGrantsText: requiredGrants.join(", "),
    evidenceReadiness: normalizeGovernedActionEvidenceReadiness(input.evidenceReadiness || defaults.evidenceReadiness),
    handshakeRequired: input.handshakeRequired !== false,
    dryRun: Boolean(input.dryRun),
    policyBucketId:
      String(input.policyBucketId || defaults.policyBucketId || "desktop-governed-action").trim() || "desktop-governed-action",
    workflowKind:
      String(input.workflowKind || defaults.workflowKind || GOVERNED_ACTION_WORKFLOW_EXTERNAL_REQUEST).trim() ||
      GOVERNED_ACTION_WORKFLOW_EXTERNAL_REQUEST,
    requestLabel: String(input.requestLabel || defaults.requestLabel || "Governed Action Request").trim() || "Governed Action Request",
    demoProfile: String(input.demoProfile || defaults.demoProfile || "").trim(),
    originSurface: String(input.originSurface || defaults.originSurface || "").trim()
  };
}

export function buildGovernedActionPolicyGates(draft = {}) {
  const normalized = normalizeGovernedActionDraft(draft);
  return {
    "core09.gates.default_off": true,
    "core09.gates.required_grants_enforced": normalized.requiredGrants.length > 0,
    "core09.gates.evidence_readiness_enforced": normalized.evidenceReadiness !== "READY",
    "core14.adapter_present.enforce_handshake": normalized.handshakeRequired
  };
}

export function buildGovernedActionRequest(draft = {}) {
  const normalized = normalizeGovernedActionDraft(draft);
  return {
    meta: {
      requestId: `governed-action-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tenantId: normalized.tenantId,
      projectId: normalized.projectId,
      environment: normalized.environment,
      actor: normalized.actor
    },
    subject: {
      type: normalized.subjectType,
      id: normalized.subjectId,
      attributes: {
        approvedForProd: normalized.approvedForProd
      }
    },
    action: {
      type: normalized.actionType,
      class: normalized.actionClass,
      verb: normalized.actionVerb,
      target: normalized.actionTarget
    },
    resource: {
      kind: normalized.resourceKind,
      class: normalized.boundaryClass,
      namespace: normalized.resourceNamespace,
      name: normalized.resourceName,
      id: normalized.resourceId
    },
    context: {
      governed_action: {
        contract_id: GOVERNED_ACTION_CONTRACT_ID,
        workflow_kind: normalized.workflowKind,
        request_label: normalized.requestLabel,
        demo_profile: normalized.demoProfile,
        origin_surface: normalized.originSurface
      },
      policy_stratification: {
        policy_bucket_id: normalized.policyBucketId,
        action_class: normalized.actionClass,
        boundary_class: normalized.boundaryClass,
        risk_tier: normalized.riskTier,
        required_grants: normalized.requiredGrants,
        evidence_readiness: normalized.evidenceReadiness,
        gates: buildGovernedActionPolicyGates(normalized)
      }
    },
    mode: "enforce",
    dryRun: normalized.dryRun
  };
}
