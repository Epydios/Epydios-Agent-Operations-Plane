import {
  createAimxsField,
  createAimxsIdentityPostureModel,
  inferAimxsAuthorityTierFromRoles
} from "../../shared/aimxs/identity-posture.js";
import { isAimxsPremiumVisible } from "../../aimxs/state.js";

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

function normalizeIdentityAdminFeedback(feedback = null) {
  if (!feedback || typeof feedback !== "object") {
    return null;
  }
  const message = String(feedback.message || "").trim();
  if (!message) {
    return null;
  }
  const tone = String(feedback.tone || "info").trim().toLowerCase() || "info";
  return {
    tone,
    message
  };
}

function normalizeAuthorityDraft(draft = {}, defaults = {}) {
  const input = draft && typeof draft === "object" ? draft : {};
  return {
    subjectId: String(input.subjectId || defaults.subjectId || "").trim(),
    targetScope: String(input.targetScope || defaults.targetScope || "").trim(),
    authorityTier: String(input.authorityTier || defaults.authorityTier || "workspace_operator").trim(),
    reason: String(input.reason || "").trim()
  };
}

function normalizeGrantDraft(draft = {}, defaults = {}) {
  const input = draft && typeof draft === "object" ? draft : {};
  return {
    subjectId: String(input.subjectId || defaults.subjectId || "").trim(),
    targetScope: String(input.targetScope || defaults.targetScope || "").trim(),
    changeKind: String(input.changeKind || defaults.changeKind || "issue").trim().toLowerCase(),
    grantKey: String(input.grantKey || "").trim(),
    delegationMode: String(input.delegationMode || defaults.delegationMode || "governed").trim().toLowerCase(),
    reason: String(input.reason || "").trim()
  };
}

function normalizeAdminDecision(decision = null) {
  if (!decision || typeof decision !== "object") {
    return null;
  }
  const decisionId = String(decision.decisionId || "").trim();
  const status = String(decision.status || "").trim().toLowerCase();
  const decidedAt = String(decision.decidedAt || "").trim();
  const reason = String(decision.reason || "").trim();
  const approvalReceiptId = String(decision.approvalReceiptId || "").trim();
  if (!decisionId && !status && !decidedAt && !reason && !approvalReceiptId) {
    return null;
  }
  return {
    decisionId,
    status,
    decidedAt,
    reason,
    approvalReceiptId,
    actorRef: String(decision.actorRef || "").trim()
  };
}

function normalizeAdminExecution(execution = null) {
  if (!execution || typeof execution !== "object") {
    return null;
  }
  const executionId = String(execution.executionId || "").trim();
  const executedAt = String(execution.executedAt || "").trim();
  const status = String(execution.status || "").trim().toLowerCase();
  const summary = String(execution.summary || "").trim();
  if (!executionId && !executedAt && !status && !summary) {
    return null;
  }
  return {
    executionId,
    executedAt,
    status,
    summary,
    actorRef: String(execution.actorRef || "").trim()
  };
}

function normalizeAdminRollback(rollback = null) {
  if (!rollback || typeof rollback !== "object") {
    return null;
  }
  const rollbackId = String(rollback.rollbackId || "").trim();
  const action = String(rollback.action || "").trim().toLowerCase();
  const status = String(rollback.status || "").trim().toLowerCase();
  const rolledBackAt = String(rollback.rolledBackAt || "").trim();
  const summary = String(rollback.summary || "").trim();
  const stableRef = String(rollback.stableRef || "").trim();
  if (!rollbackId && !action && !status && !rolledBackAt && !summary && !stableRef) {
    return null;
  }
  return {
    rollbackId,
    action,
    status,
    rolledBackAt,
    summary,
    stableRef,
    reason: String(rollback.reason || "").trim(),
    actorRef: String(rollback.actorRef || "").trim(),
    approvalReceiptId: String(rollback.approvalReceiptId || "").trim(),
    adminReceiptId: String(rollback.adminReceiptId || "").trim(),
    executionId: String(rollback.executionId || "").trim()
  };
}

function normalizeAdminReceipt(receipt = null) {
  if (!receipt || typeof receipt !== "object") {
    return null;
  }
  const receiptId = String(receipt.receiptId || "").trim();
  const issuedAt = String(receipt.issuedAt || "").trim();
  const summary = String(receipt.summary || "").trim();
  const stableRef = String(receipt.stableRef || "").trim();
  if (!receiptId && !issuedAt && !summary && !stableRef) {
    return null;
  }
  return {
    receiptId,
    issuedAt,
    summary,
    stableRef,
    approvalReceiptId: String(receipt.approvalReceiptId || "").trim(),
    executionId: String(receipt.executionId || "").trim()
  };
}

function normalizeAdminQueueItems(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const entry = item && typeof item === "object" ? item : {};
      const id = String(entry.id || "").trim();
      if (!id) {
        return null;
      }
      return {
        id,
        kind: String(entry.kind || "").trim().toLowerCase(),
        label: String(entry.label || "").trim(),
        requestedAction: String(entry.requestedAction || "").trim(),
        subjectId: String(entry.subjectId || "").trim(),
        targetScope: String(entry.targetScope || "").trim(),
        status: String(entry.status || "draft").trim().toLowerCase(),
        reason: String(entry.reason || "").trim(),
        summary: String(entry.summary || "").trim(),
        simulationSummary: String(entry.simulationSummary || "").trim(),
        createdAt: String(entry.createdAt || "").trim(),
        simulatedAt: String(entry.simulatedAt || "").trim(),
        updatedAt: String(entry.updatedAt || "").trim(),
        routedAt: String(entry.routedAt || "").trim(),
        decision: normalizeAdminDecision(entry.decision || null),
        execution: normalizeAdminExecution(entry.execution || null),
        receipt: normalizeAdminReceipt(entry.receipt || null),
        rollback: normalizeAdminRollback(entry.rollback || null)
      };
    })
    .filter(Boolean);
}

function normalizeAdminSimulation(simulation = null) {
  if (!simulation || typeof simulation !== "object") {
    return null;
  }
  const title = String(simulation.title || "").trim();
  const summary = String(simulation.summary || "").trim();
  const facts = Array.isArray(simulation.facts)
    ? simulation.facts
        .map((fact) => {
          const item = fact && typeof fact === "object" ? fact : {};
          const label = String(item.label || "").trim();
          const value = String(item.value || "").trim();
          if (!label || !value) {
            return null;
          }
          return {
            label,
            value,
            code: Boolean(item.code)
          };
        })
        .filter(Boolean)
    : [];
  const normalizedFindings = Array.isArray(simulation.findings)
    ? simulation.findings.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!title && !summary && facts.length === 0 && normalizedFindings.length === 0) {
    return null;
  }
  return {
    changeId: String(simulation.changeId || "").trim(),
    kind: String(simulation.kind || "").trim().toLowerCase(),
    tone: String(simulation.tone || "info").trim().toLowerCase() || "info",
    title: title || "Simulation ready",
    summary,
    updatedAt: String(simulation.updatedAt || "").trim(),
    facts,
    findings: normalizedFindings
  };
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
  const viewState = settings?.viewState && typeof settings.viewState === "object" ? settings.viewState : {};
  const defaultScope = [tenantIds[0], projectIds[0]].filter(Boolean).join(" / ") || environment;
  const defaultSubject = subject || clientId || "";
  const adminQueueItems = normalizeAdminQueueItems(viewState?.queueItems || []);
  const adminSelectedChangeId = String(viewState?.selectedAdminChangeId || "").trim();
  const selectedAdminQueueItem =
    adminQueueItems.find((item) => item.id === adminSelectedChangeId) || adminQueueItems[0] || null;

  const snapshot = {
    aimxsPremiumVisible: isAimxsPremiumVisible(settings),
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
    admin: {
      feedback: normalizeIdentityAdminFeedback(viewState?.feedback || null),
      recoveryReason: String(viewState?.recoveryReason || "").trim(),
      selectedChangeId: adminSelectedChangeId,
      selectedQueueItem: selectedAdminQueueItem,
      queueItems: adminQueueItems,
      authorityDraft: normalizeAuthorityDraft(viewState?.authorityDraft || {}, {
        subjectId: defaultSubject,
        targetScope: defaultScope,
        authorityTier: "workspace_operator"
      }),
      grantDraft: normalizeGrantDraft(viewState?.grantDraft || {}, {
        subjectId: defaultSubject,
        targetScope: defaultScope,
        changeKind: "issue",
        delegationMode: "governed"
      }),
      latestSimulation: normalizeAdminSimulation(viewState?.latestSimulation || null)
    },
    roles,
    tenantIds,
    projectIds,
    effectivePermissions,
    claimKeys
  };
  snapshot.aimxsIdentityPosture = buildIdentityAimxsIdentityPosture(snapshot);
  return snapshot;
}

function identityAimxsPostureTone(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) {
    return "neutral";
  }
  if (["approved", "applied", "authenticated", "current", "issued", "linked"].includes(normalized)) {
    return "ok";
  }
  if (["blocked", "denied", "error", "failed", "unresolved", "unauthenticated"].includes(normalized)) {
    return "danger";
  }
  if (["deferred", "draft", "escalated", "pending", "review", "routed", "simulated", "watch"].includes(normalized)) {
    return "warn";
  }
  return "neutral";
}

function identityAimxsBadge(status = "", fallback = "watch") {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized || fallback;
}

function buildIdentityAimxsIdentityPosture(snapshot = {}) {
  const selectedItem = snapshot?.admin?.selectedQueueItem || null;
  const simulation = snapshot?.admin?.latestSimulation || null;
  const authorityDraft = snapshot?.admin?.authorityDraft || {};
  const grantDraft = snapshot?.admin?.grantDraft || {};
  const roles = Array.isArray(snapshot?.roles) ? snapshot.roles : [];
  const currentAuthorityTier = inferAimxsAuthorityTierFromRoles(roles, snapshot?.authenticated ? "workspace_operator" : "unresolved");
  const currentScope = [snapshot?.tenantIds?.[0], snapshot?.projectIds?.[0]].filter(Boolean).join(" / ") || snapshot?.environment || "workspace";
  const delegationBasis =
    selectedItem?.kind === "grant"
      ? String(grantDraft?.delegationMode || "governed").trim()
      : snapshot?.policyMatrixRequired
        ? "governance-backed claims"
        : "direct claim scope";
  const grantBasis = snapshot?.traceLatestRun?.policyGrantTokenPresent ? "grant token present" : "grant token pending";
  const currentPostureBadge = snapshot?.authenticated ? "current" : "unresolved";
  const targetKind = String(selectedItem?.kind || "draft").trim().toLowerCase();
  const targetBadge = identityAimxsBadge(selectedItem?.status || simulation?.kind, selectedItem ? "watch" : "draft");
  const targetSummary =
    targetKind === "authority"
      ? `Set authority tier ${authorityDraft?.authorityTier || "workspace_operator"} for ${authorityDraft?.targetScope || currentScope}.`
      : targetKind === "grant"
        ? `${grantDraft?.changeKind || "issue"} ${grantDraft?.grantKey || "grant"} using ${grantDraft?.delegationMode || "governed"} delegation.`
        : "Bounded identity change draft remains proposal-only until governance approval exists.";
  const rationaleBadge = identityAimxsBadge(
    selectedItem?.decision?.status || selectedItem?.status,
    snapshot?.authenticated ? "watch" : "blocked"
  );
  const rationaleSummary =
    String(
      simulation?.summary ||
        selectedItem?.decision?.reason ||
        selectedItem?.reason ||
        "A bounded governance review is required before any live identity mutation can proceed."
    ).trim();
  const rationaleItems = [
    createAimxsField("governance gate", selectedItem?.decision?.approvalReceiptId || snapshot?.traceLatestApproval?.approvalId || "required", Boolean(selectedItem?.decision?.approvalReceiptId || snapshot?.traceLatestApproval?.approvalId)),
    createAimxsField("latest finding", simulation?.findings?.[0] || selectedItem?.summary || ""),
    createAimxsField("trace anchor", snapshot?.traceLatestRun?.runId || snapshot?.traceLatestAudit?.event || "", Boolean(snapshot?.traceLatestRun?.runId || snapshot?.traceLatestAudit?.event))
  ].filter(Boolean);

  return createAimxsIdentityPostureModel({
    summary:
      snapshot?.aimxsPremiumVisible
        ? "Bounded AIMXS identity posture links the current runtime-bound subject to the next authority or delegation posture without opening new write controls."
        : "Bounded identity posture links the current runtime-bound subject to the next authority or delegation posture without opening new write controls.",
    surfaceLabel: "primary owner surface",
    identityFields: [
      createAimxsField("identity class", snapshot?.authenticated ? "runtime-bound subject" : "identity unresolved"),
      createAimxsField("subject", snapshot?.subject, true),
      createAimxsField("client", snapshot?.clientId, true),
      createAimxsField("authority tier", currentAuthorityTier),
      createAimxsField("authority basis", snapshot?.authorityBasis || "unresolved", true),
      createAimxsField("delegation basis", delegationBasis),
      createAimxsField("grant basis", grantBasis),
      createAimxsField("assurance posture", snapshot?.authenticated ? "session authenticated" : "identity unresolved"),
      createAimxsField("anomaly posture", snapshot?.traceApprovalCount > snapshot?.traceRunCount ? "approval-heavy" : "no anomaly flag loaded")
    ].filter(Boolean),
    currentPosture: {
      badge: currentPostureBadge,
      tone: identityAimxsPostureTone(currentPostureBadge),
      note: "Current posture is derived from runtime identity, the latest approval anchor, and the bounded audit trace.",
      fields: [
        createAimxsField("current posture", snapshot?.policyMatrixRequired ? "governance-backed identity" : "direct claim scope"),
        createAimxsField("scope", currentScope, true),
        createAimxsField("latest run", snapshot?.traceLatestRun?.runId, true),
        createAimxsField("latest approval", snapshot?.traceLatestApproval?.approvalId, true),
        createAimxsField("latest audit", snapshot?.traceLatestAudit?.event, true)
      ].filter(Boolean)
    },
    targetPosture: {
      badge: targetBadge,
      tone: identityAimxsPostureTone(targetBadge),
      note: targetSummary,
      fields: [
        createAimxsField("target posture", targetKind === "authority" ? "authority tier transition" : targetKind === "grant" ? "grant or delegation transition" : "bounded identity draft"),
        createAimxsField("target authority", targetKind === "authority" ? authorityDraft?.authorityTier : ""),
        createAimxsField("target grant", targetKind === "grant" ? grantDraft?.grantKey : "", true),
        createAimxsField("target delegation", targetKind === "grant" ? grantDraft?.delegationMode : ""),
        createAimxsField("target scope", selectedItem?.targetScope || authorityDraft?.targetScope || grantDraft?.targetScope || currentScope, true),
        createAimxsField("requested action", selectedItem?.requestedAction || "")
      ].filter(Boolean)
    },
    rationale: {
      badge: rationaleBadge,
      tone: identityAimxsPostureTone(rationaleBadge),
      note: rationaleSummary,
      fields: rationaleItems
    }
  });
}
