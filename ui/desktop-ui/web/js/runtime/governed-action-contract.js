export const GOVERNED_ACTION_CONTRACT_ID = "epydios.governed-request.v1";
export const GOVERNED_ACTION_WORKFLOW_EXTERNAL_REQUEST = "governed_request";
export const GOVERNED_ACTION_DEMO_PROFILE_FINANCE_PAPER = "";

function uniqueStrings(items = []) {
  return Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}
 
function normalizeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

export function normalizeGovernedActionBoundaryClass(value) {
  return String(value || "").trim().toLowerCase() || "external";
}

export function normalizeGovernedActionRiskTier(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || "standard";
}

export function normalizeGovernedActionEvidenceReadiness(value) {
  return String(value || "").trim().toUpperCase() || "UNKNOWN";
}

export function normalizeGovernedActionDraft(input = {}, defaults = {}) {
  const subjectAttributes = {
    ...normalizeObject(defaults.subjectAttributes),
    ...normalizeObject(input.subjectAttributes)
  };

  const notes = uniqueStrings([...(Array.isArray(defaults.notes) ? defaults.notes : []), ...(Array.isArray(input.notes) ? input.notes : [])]);

  return {
    tenantId: String(input.tenantId || defaults.tenantId || "").trim(),
    projectId: String(input.projectId || defaults.projectId || "").trim(),
    environment: String(input.environment || defaults.environment || "dev").trim() || "dev",
    actor: String(input.actor || defaults.actor || "desktop-operator").trim() || "desktop-operator",
    subjectType: String(input.subjectType || defaults.subjectType || "user").trim() || "user",
    subjectId: String(input.subjectId || defaults.subjectId || "operator-001").trim() || "operator-001",
    subjectAttributes,
    actionType: String(input.actionType || defaults.actionType || "task.execute").trim() || "task.execute",
    actionVerb: String(input.actionVerb || defaults.actionVerb || "execute").trim() || "execute",
    actionTarget:
      String(input.actionTarget || defaults.actionTarget || input.resourceName || defaults.resourceName || "governed-target").trim() ||
      "governed-target",
    resourceKind: String(input.resourceKind || defaults.resourceKind || "external-system").trim() || "external-system",
    resourceNamespace: String(input.resourceNamespace || defaults.resourceNamespace || "epydios-system").trim() || "epydios-system",
    resourceName: String(input.resourceName || defaults.resourceName || "governed-target").trim() || "governed-target",
    resourceId:
      String(input.resourceId || defaults.resourceId || input.resourceName || defaults.resourceName || "governed-target").trim() ||
      "governed-target",
    requestLabel: String(input.requestLabel || defaults.requestLabel || "Governed Request").trim() || "Governed Request",
    workflowKind:
      String(input.workflowKind || defaults.workflowKind || GOVERNED_ACTION_WORKFLOW_EXTERNAL_REQUEST).trim() ||
      GOVERNED_ACTION_WORKFLOW_EXTERNAL_REQUEST,
    originSurface: String(input.originSurface || defaults.originSurface || "desktop").trim() || "desktop",
    notes,
    dryRun: Boolean(input.dryRun),
    mode: String(input.mode || defaults.mode || "enforce").trim() || "enforce",
    boundaryClass: normalizeGovernedActionBoundaryClass(input.boundaryClass || defaults.boundaryClass),
    riskTier: normalizeGovernedActionRiskTier(input.riskTier || defaults.riskTier),
    evidenceReadiness: normalizeGovernedActionEvidenceReadiness(input.evidenceReadiness || defaults.evidenceReadiness)
  };
}

export function buildGovernedActionPolicyGates() {
  return {};
}

export function buildGovernedActionRequest(draft = {}) {
  const normalized = normalizeGovernedActionDraft(draft);

  return {
    meta: {
      requestId: `governed-request-${Date.now()}`,
      timestamp: new Date().toISOString(),
      tenantId: normalized.tenantId,
      projectId: normalized.projectId,
      environment: normalized.environment,
      actor: normalized.actor
    },
    subject: {
      type: normalized.subjectType,
      id: normalized.subjectId,
      attributes: normalized.subjectAttributes
    },
    action: {
      type: normalized.actionType,
      verb: normalized.actionVerb,
      target: normalized.actionTarget
    },
    resource: {
      kind: normalized.resourceKind,
      namespace: normalized.resourceNamespace,
      name: normalized.resourceName,
      id: normalized.resourceId
    },
    context: {
      request: {
        contractId: GOVERNED_ACTION_CONTRACT_ID,
        workflowKind: normalized.workflowKind,
        requestLabel: normalized.requestLabel,
        originSurface: normalized.originSurface
      },
      notes: normalized.notes
    },
    mode: normalized.mode,
    dryRun: normalized.dryRun
  };
}
