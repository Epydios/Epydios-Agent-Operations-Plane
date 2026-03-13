export function resolveAuthSummaryState(session = {}) {
  if (session.authenticated) {
    return {
      label: "Authenticated",
      chipClass: "chip chip-ok"
    };
  }
  return {
    label: "Unauthenticated",
    chipClass: "chip chip-danger"
  };
}

export function chipClassForAuthorityBasis(value) {
  const basis = String(value || "").trim().toLowerCase();
  if (basis === "bearer_token_jwt" || basis === "runtime_context_identity" || basis === "mock_bearer_token_jwt") {
    return "chip chip-ok";
  }
  if (basis === "runtime_auth_disabled" || basis === "endpoint_unavailable" || basis === "unresolved") {
    return "chip chip-warn";
  }
  return "chip chip-neutral";
}

export function createIdentitySettingsSnapshot(settings = {}) {
  const runtimeIdentity =
    settings?.identity && typeof settings.identity === "object" ? settings.identity : {};
  const identitySummary =
    runtimeIdentity?.identity && typeof runtimeIdentity.identity === "object"
      ? runtimeIdentity.identity
      : {};
  return {
    runtimeIdentity,
    identitySummary
  };
}

export function normalizeIdentityStringList(values = []) {
  if (Array.isArray(values)) {
    return values.map((value) => String(value || "").trim()).filter(Boolean);
  }
  const singleValue = String(values || "").trim();
  return singleValue ? [singleValue] : [];
}

export function createIdentityWorkspaceSnapshot(settings = {}, session = {}) {
  const { runtimeIdentity, identitySummary } = createIdentitySettingsSnapshot(settings);
  const claims = session?.claims && typeof session.claims === "object" ? session.claims : {};
  const roles = normalizeIdentityStringList(identitySummary?.roles || claims?.roles || []);
  const tenantIds = normalizeIdentityStringList(identitySummary?.tenantIds || claims?.tenant_id || []);
  const projectIds = normalizeIdentityStringList(identitySummary?.projectIds || claims?.project_id || []);
  const effectivePermissions = normalizeIdentityStringList(identitySummary?.effectivePermissions || []);
  const claimKeys = normalizeIdentityStringList(identitySummary?.claimKeys || Object.keys(claims || {}));
  const authenticated =
    typeof runtimeIdentity?.authenticated === "boolean"
      ? runtimeIdentity.authenticated
      : Boolean(session?.authenticated);
  const authEnabled =
    typeof runtimeIdentity?.authEnabled === "boolean"
      ? runtimeIdentity.authEnabled
      : Boolean(settings?.authEnabled);
  const subject = String(identitySummary?.subject || claims?.sub || claims?.email || "").trim();
  const clientId = String(identitySummary?.clientId || claims?.client_id || "").trim();
  const environment = String(settings?.environment || "").trim() || "unknown";
  const authorityBasis = String(runtimeIdentity?.authorityBasis || "").trim();
  const generatedAt = String(runtimeIdentity?.generatedAt || "").trim();
  const dataSources =
    settings?.dataSources && typeof settings.dataSources === "object" ? settings.dataSources : {};
  const policyCatalogCount = Number(settings?.policyCatalog?.count || 0);
  const traceability =
    settings?.identityTraceability && typeof settings.identityTraceability === "object"
      ? settings.identityTraceability
      : {};
  const latestRun =
    traceability?.latestRun && typeof traceability.latestRun === "object" ? traceability.latestRun : {};
  const latestApproval =
    traceability?.latestApproval && typeof traceability.latestApproval === "object"
      ? traceability.latestApproval
      : {};
  const latestAudit =
    traceability?.latestAudit && typeof traceability.latestAudit === "object" ? traceability.latestAudit : {};

  return {
    runtimeIdentity,
    identitySummary,
    authenticated,
    authEnabled,
    source: String(runtimeIdentity?.source || "").trim() || "unknown",
    generatedAt,
    authorityBasis,
    policyMatrixRequired: Boolean(runtimeIdentity?.policyMatrixRequired),
    policyRuleCount: Number(runtimeIdentity?.policyRuleCount || 0),
    roleClaim: String(runtimeIdentity?.roleClaim || "").trim(),
    clientIdClaim: String(runtimeIdentity?.clientIdClaim || "").trim(),
    tenantClaim: String(runtimeIdentity?.tenantClaim || "").trim(),
    projectClaim: String(runtimeIdentity?.projectClaim || "").trim(),
    subject: subject || "-",
    clientId: clientId || "-",
    environment,
    dataSourceRuns: String(dataSources?.runs || "").trim() || "unknown",
    dataSourceApprovals: String(dataSources?.approvals || "").trim() || "unknown",
    dataSourceAudit: String(dataSources?.audit || "").trim() || "unknown",
    policyCatalogCount: Number.isFinite(policyCatalogCount) ? policyCatalogCount : 0,
    traceRunCount: Number(traceability?.runCount || 0),
    traceApprovalCount: Number(traceability?.approvalCount || 0),
    traceAuditCount: Number(traceability?.auditCount || 0),
    traceLatestRun: {
      runId: String(latestRun?.runId || "").trim(),
      requestId: String(latestRun?.requestId || "").trim(),
      tenantId: String(latestRun?.tenantId || "").trim(),
      projectId: String(latestRun?.projectId || "").trim(),
      environment: String(latestRun?.environment || "").trim(),
      status: String(latestRun?.status || "").trim(),
      policyDecision: String(latestRun?.policyDecision || "").trim(),
      selectedEvidenceProvider: String(latestRun?.selectedEvidenceProvider || "").trim(),
      evidenceRecordStatus: String(latestRun?.evidenceRecordStatus || "").trim(),
      evidenceBundleStatus: String(latestRun?.evidenceBundleStatus || "").trim(),
      policyGrantTokenPresent: Boolean(latestRun?.policyGrantTokenPresent),
      updatedAt: String(latestRun?.updatedAt || "").trim()
    },
    traceLatestApproval: {
      approvalId: String(latestApproval?.approvalId || "").trim(),
      runId: String(latestApproval?.runId || "").trim(),
      status: String(latestApproval?.status || "").trim(),
      tier: String(latestApproval?.tier || "").trim(),
      targetExecutionProfile: String(latestApproval?.targetExecutionProfile || "").trim(),
      reviewedAt: String(latestApproval?.reviewedAt || "").trim(),
      createdAt: String(latestApproval?.createdAt || "").trim(),
      expiresAt: String(latestApproval?.expiresAt || "").trim()
    },
    traceLatestAudit: {
      ts: String(latestAudit?.ts || "").trim(),
      event: String(latestAudit?.event || "").trim(),
      providerId: String(latestAudit?.providerId || "").trim(),
      decision: String(latestAudit?.decision || "").trim(),
      tenantId: String(latestAudit?.tenantId || "").trim(),
      projectId: String(latestAudit?.projectId || "").trim()
    },
    roles,
    tenantIds,
    projectIds,
    effectivePermissions,
    claimKeys
  };
}
