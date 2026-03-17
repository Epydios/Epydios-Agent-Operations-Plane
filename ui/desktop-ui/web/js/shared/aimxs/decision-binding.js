function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized && normalized !== "-") {
      return normalized;
    }
  }
  return "";
}

function normalizeArray(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeString(value))
    .filter(Boolean);
}

function pushChainItem(items, label, value, options = {}) {
  const normalized = normalizeString(value);
  if (!label || !normalized || normalized === "-") {
    return;
  }
  items.push({
    label,
    value: normalized,
    code: options.code === true,
    tone: normalizeString(options.tone, "neutral").toLowerCase()
  });
}

function uniqueValues(values = []) {
  return Array.from(new Set(normalizeArray(values)));
}

function buildPivotTarget(view, label, activeDomain, runId, incidentEntryId) {
  const normalizedView = normalizeString(view).toLowerCase();
  return {
    view: normalizedView,
    label,
    runId: normalizeString(runId),
    incidentEntryId: normalizeString(incidentEntryId),
    disabled:
      normalizedView === normalizeString(activeDomain).toLowerCase() ||
      (!normalizeString(runId) && !(normalizedView === "incidentops" && normalizeString(incidentEntryId)))
  };
}

export function createAimxsDecisionBindingSpine(input = {}) {
  const correlationRef = firstValue(input.correlationRef, input.runId, input.requestRef, input.approvalId);
  const runId = firstValue(input.runId, input.replayRef);
  const approvalId = firstValue(input.approvalId, input.grantRef);
  const incidentEntryId = firstValue(input.incidentEntryId);
  const authorityChain = [];
  const grantChain = [];
  const receiptChain = [];
  const replayChain = [];
  const evidenceChain = [];

  pushChainItem(authorityChain, "actor", firstValue(input.actorRef), { code: true });
  pushChainItem(authorityChain, "subject", firstValue(input.subjectRef), { code: true });
  pushChainItem(authorityChain, "authority", firstValue(input.authorityRef), { code: true });
  pushChainItem(authorityChain, "basis", firstValue(input.authorityBasis));
  pushChainItem(authorityChain, "scope", firstValue(input.scopeRef), { code: true });
  pushChainItem(authorityChain, "provider", firstValue(input.providerRef), { code: true });
  pushChainItem(authorityChain, "route", firstValue(input.routeRef));
  pushChainItem(authorityChain, "boundary", firstValue(input.boundaryRef), { code: true });

  pushChainItem(grantChain, "grant", firstValue(input.grantRef), { code: true });
  pushChainItem(grantChain, "approval", approvalId, { code: true });
  pushChainItem(grantChain, "decision", firstValue(input.decisionStatus));
  pushChainItem(grantChain, "profile", firstValue(input.executionProfile));
  uniqueValues(input.requestedCapabilities)
    .slice(0, 3)
    .forEach((value, index) => pushChainItem(grantChain, `capability ${index + 1}`, value, { code: true }));
  pushChainItem(grantChain, "reason", firstValue(input.grantReason));

  pushChainItem(receiptChain, "governance receipt", firstValue(input.receiptRef, input.approvalReceiptRef), { code: true });
  pushChainItem(receiptChain, "stable ref", firstValue(input.stableRef), { code: true });
  pushChainItem(receiptChain, "bundle", firstValue(input.bundleId), { code: true });
  pushChainItem(receiptChain, "bundle status", firstValue(input.bundleStatus));
  pushChainItem(receiptChain, "record", firstValue(input.recordId), { code: true });
  pushChainItem(receiptChain, "record status", firstValue(input.recordStatus));
  pushChainItem(receiptChain, "incident", firstValue(input.incidentPackageId), { code: true });
  pushChainItem(receiptChain, "incident status", firstValue(input.incidentStatus));

  pushChainItem(replayChain, "run", runId, { code: true });
  pushChainItem(replayChain, "request", firstValue(input.requestRef), { code: true });
  pushChainItem(replayChain, "session", firstValue(input.sessionRef), { code: true });
  pushChainItem(replayChain, "task", firstValue(input.taskRef), { code: true });
  pushChainItem(replayChain, "replay", firstValue(input.replayRef, runId), { code: true });

  uniqueValues(input.evidenceRefs)
    .slice(0, 4)
    .forEach((value, index) => pushChainItem(evidenceChain, `evidence ${index + 1}`, value, { code: true }));
  uniqueValues(input.auditRefs)
    .slice(0, 3)
    .forEach((value, index) => pushChainItem(evidenceChain, `audit ${index + 1}`, value, { code: true }));
  pushChainItem(evidenceChain, "latest evidence", firstValue(input.latestEvidenceRef), { code: true });
  pushChainItem(evidenceChain, "evidence status", firstValue(input.evidenceStatus));

  const available =
    Boolean(correlationRef) ||
    authorityChain.length > 0 ||
    grantChain.length > 0 ||
    receiptChain.length > 0 ||
    replayChain.length > 0 ||
    evidenceChain.length > 0;

  return {
    available,
    activeDomain: normalizeString(input.activeDomain).toLowerCase(),
    correlationRef,
    sourceLabel: firstValue(input.sourceLabel, input.sourceRef, "aimxs"),
    runId,
    approvalId,
    incidentEntryId,
    authorityChain,
    grantChain,
    receiptChain,
    replayChain,
    evidenceChain,
    summary: firstValue(input.summary, input.note),
    pivotTargets: [
      buildPivotTarget("agentops", "Open AgentOps", input.activeDomain, runId, incidentEntryId),
      buildPivotTarget("governanceops", "Open GovernanceOps", input.activeDomain, runId, incidentEntryId),
      buildPivotTarget("auditops", "Open AuditOps", input.activeDomain, runId, incidentEntryId),
      buildPivotTarget("evidenceops", "Open EvidenceOps", input.activeDomain, runId, incidentEntryId),
      buildPivotTarget("incidentops", "Open IncidentOps", input.activeDomain, runId, incidentEntryId)
    ]
  };
}
