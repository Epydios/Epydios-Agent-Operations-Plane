import {
  chipClassForStatus,
  displayPolicyProviderLabel
} from "../../views/common.js";
import { createAimxsLegibilityModel } from "../../shared/aimxs/legibility.js";

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeStatus(value) {
  return normalizeString(value).toUpperCase();
}

function parseTimeMs(value) {
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }
  const single = normalizeString(value);
  return single ? [single] : [];
}

function uniqueSortedValues(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => normalizeString(item)).filter(Boolean))).sort();
}

function latestTimestamp(item = {}) {
  return Math.max(parseTimeMs(item.reviewedAt), parseTimeMs(item.updatedAt), parseTimeMs(item.expiresAt), parseTimeMs(item.createdAt));
}

function pickLatestItem(items = []) {
  let best = null;
  let bestTs = -1;
  for (const item of Array.isArray(items) ? items : []) {
    const candidate = item && typeof item === "object" ? item : {};
    const ts = latestTimestamp(candidate);
    if (!best || ts > bestTs) {
      best = candidate;
      bestTs = ts;
    }
  }
  return best || {};
}

function isExpiredApproval(item = {}, nowValue) {
  const expiresAt = parseTimeMs(item?.expiresAt);
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : parseTimeMs(nowValue || new Date());
  return expiresAt > 0 && nowMs > 0 && expiresAt < nowMs;
}

function approvalStatus(item = {}, nowValue) {
  const raw = normalizeStatus(item?.status);
  if (raw === "PENDING" && isExpiredApproval(item, nowValue)) {
    return "EXPIRED";
  }
  return raw || "UNKNOWN";
}

function approvalTierLabel(value) {
  const tier = Number.parseInt(String(value || ""), 10);
  if (tier === 1) {
    return "Tier 1";
  }
  if (tier === 2) {
    return "Tier 2";
  }
  if (tier === 3) {
    return "Tier 3";
  }
  if (tier === 4) {
    return "Tier 4";
  }
  return tier > 0 ? `Tier ${tier}` : "Unassigned";
}

function summarizeApprovalQueue(approvals = {}, nowValue = new Date()) {
  const items = Array.isArray(approvals?.items) ? approvals.items : [];
  const normalized = items.map((item) => {
    const status = approvalStatus(item, nowValue);
    return {
      approvalId: normalizeString(item?.approvalId, "-"),
      runId: normalizeString(item?.runId, "-"),
      requestId: normalizeString(item?.requestId, "-"),
      tenantId: normalizeString(item?.tenantId, "-"),
      projectId: normalizeString(item?.projectId, "-"),
      status,
      tier: normalizeString(item?.tier, "0"),
      tierLabel: approvalTierLabel(item?.tier),
      targetExecutionProfile: normalizeString(item?.targetExecutionProfile, "-"),
      reason: normalizeString(item?.reason, "-"),
      createdAt: normalizeString(item?.createdAt, "-"),
      reviewedAt: normalizeString(item?.reviewedAt, "-"),
      expiresAt: normalizeString(item?.expiresAt, "-"),
      requestedCapabilities: readStringArray(item?.requestedCapabilities),
      actionable: status === "PENDING"
    };
  });

  const counts = normalized.reduce(
    (acc, item) => {
      const status = normalizeStatus(item.status);
      acc.total += 1;
      if (status === "PENDING") {
        acc.pending += 1;
      } else if (status === "APPROVED") {
        acc.approved += 1;
      } else if (status === "DENIED") {
        acc.denied += 1;
      } else if (status === "EXPIRED") {
        acc.expired += 1;
      } else {
        acc.other += 1;
      }
      return acc;
    },
    { total: 0, pending: 0, approved: 0, denied: 0, expired: 0, other: 0 }
  );

  const statusOrder = {
    PENDING: 0,
    APPROVED: 1,
    DENIED: 2,
    EXPIRED: 3
  };
  const topItems = normalized
    .slice()
    .sort((a, b) => {
      const aOrder = statusOrder[normalizeStatus(a.status)] ?? 9;
      const bOrder = statusOrder[normalizeStatus(b.status)] ?? 9;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return latestTimestamp(b) - latestTimestamp(a);
    })
    .slice(0, 3);

  return {
    available: counts.total > 0,
    source: normalizeString(approvals?.source, "unknown"),
    warning: normalizeString(approvals?.warning),
    counts,
    items: topItems
  };
}

function summarizeOperationalFeedback(viewState = {}) {
  const feedback = readObject(viewState?.feedback);
  const message = normalizeString(feedback?.message);
  const tone = normalizeString(feedback?.tone, "info").toLowerCase();
  return {
    available: Boolean(message),
    tone,
    message
  };
}

function normalizeAdminProposalItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const entry = item && typeof item === "object" ? item : {};
      const changeId = normalizeString(entry?.id);
      if (!changeId) {
        return null;
      }
      const decision = readObject(entry?.decision);
      const receipt = readObject(entry?.receipt);
      return {
        changeId,
        ownerDomain: normalizeString(entry?.ownerDomain || entry?.domain, "identityops").toLowerCase(),
        kind: normalizeString(entry?.kind, "identity"),
        label: normalizeString(entry?.label, "Queued proposal"),
        requestedAction: normalizeString(entry?.requestedAction, "proposal"),
        subjectId: normalizeString(entry?.subjectId, "-"),
        subjectLabel: normalizeString(entry?.subjectLabel, "subject").toLowerCase(),
        targetScope: normalizeString(entry?.targetScope, "-"),
        targetLabel: normalizeString(entry?.targetLabel, "target").toLowerCase(),
        status: normalizeString(entry?.status, "draft").toLowerCase(),
        reason: normalizeString(entry?.reason, "-"),
        summary: normalizeString(entry?.summary, "-"),
        simulationSummary: normalizeString(entry?.simulationSummary, "-"),
        updatedAt: normalizeString(entry?.updatedAt, "-"),
        routedAt: normalizeString(entry?.routedAt, "-"),
        decision: {
          decisionId: normalizeString(decision?.decisionId, "-"),
          status: normalizeString(decision?.status, "-").toLowerCase(),
          reason: normalizeString(decision?.reason, "-"),
          decidedAt: normalizeString(decision?.decidedAt, "-"),
          approvalReceiptId: normalizeString(decision?.approvalReceiptId, "-"),
          actorRef: normalizeString(decision?.actorRef, "-")
        },
        receipt: {
          receiptId: normalizeString(receipt?.receiptId, "-"),
          issuedAt: normalizeString(receipt?.issuedAt, "-"),
          stableRef: normalizeString(receipt?.stableRef, "-"),
          approvalReceiptId: normalizeString(receipt?.approvalReceiptId, "-")
        }
      };
    })
    .filter(Boolean);
}

function summarizeAdminProposalReview(adminQueueItems = [], viewState = {}) {
  const items = normalizeAdminProposalItems(adminQueueItems);
  const selectedChangeId = normalizeString(viewState?.selectedAdminChangeId);
  const selectedItem =
    items.find((item) => item.changeId === selectedChangeId) ||
    items.find((item) => item.status === "routed") ||
    items.find((item) => item.status === "approved") ||
    items.find((item) => item.status === "applied") ||
    items.find((item) => item.status === "deferred" || item.status === "escalated") ||
    items[0] ||
    null;
  if (!selectedItem) {
    return {
      available: false
    };
  }

  const actionable = selectedItem.status === "routed";
  return {
    available: true,
    source: `${selectedItem.ownerDomain}-admin`,
    ownerDomain: selectedItem.ownerDomain,
    selectedChangeId: selectedItem.changeId,
    changeId: selectedItem.changeId,
    kind: selectedItem.kind,
    label: selectedItem.label,
    requestedAction: selectedItem.requestedAction,
    subjectId: selectedItem.subjectId,
    subjectLabel: selectedItem.subjectLabel,
    targetScope: selectedItem.targetScope,
    targetLabel: selectedItem.targetLabel,
    status: selectedItem.status,
    reason: selectedItem.reason,
    summary: selectedItem.summary,
    simulationSummary: selectedItem.simulationSummary,
    updatedAt: selectedItem.updatedAt,
    routedAt: selectedItem.routedAt,
    decision: selectedItem.decision,
    receipt: selectedItem.receipt,
    aimxsLegibility: createAimxsLegibilityModel({
      requestRef: selectedItem.changeId,
      actorRef: selectedItem.decision.actorRef,
      subjectRef: selectedItem.subjectId,
      authorityRef: `${selectedItem.ownerDomain}-admin`,
      grantRef: selectedItem.decision.approvalReceiptId,
      posture: selectedItem.status,
      scopeRef: selectedItem.targetScope,
      routeRef: `${selectedItem.ownerDomain}-governance`,
      boundaryRef: selectedItem.kind,
      previewRef: selectedItem.routedAt || selectedItem.updatedAt,
      previewSummary: selectedItem.simulationSummary,
      decisionRef: selectedItem.decision.decisionId,
      decisionStatus: selectedItem.decision.status || selectedItem.status,
      approvalReceiptRef: selectedItem.decision.approvalReceiptId,
      receiptRef: selectedItem.receipt.receiptId,
      stableRef: selectedItem.receipt.stableRef,
      summary: selectedItem.summary
    }),
    canApproveDeny: actionable,
    canRoute: actionable,
    canCopyReceipt: selectedItem.decision.approvalReceiptId !== "-",
    canOpenIdentity: true
  };
}

function summarizeActionReview(approvals = {}, runs = {}, nowValue = new Date(), viewState = {}) {
  const approvalItems = Array.isArray(approvals?.items) ? approvals.items : [];
  const selectedRunId = normalizeString(viewState?.selectedRunId);
  const selectedApproval =
    approvalItems.find((item) => normalizeString(item?.runId) === selectedRunId) ||
    approvalItems.find((item) => normalizeString(item?.approvalId) === selectedRunId) ||
    approvalItems
      .filter((item) => approvalStatus(item, nowValue) === "PENDING")
      .sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] ||
    approvalItems
      .filter((item) => normalizeString(item?.reviewedAt))
      .sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] ||
    pickLatestItem(approvalItems);
  const linkedRun = linkedRunReference(runs, selectedApproval);
  const status = approvalStatus(selectedApproval, nowValue) || "UNKNOWN";
  const actionable = status === "PENDING";
  const requestedCapabilities = readStringArray(selectedApproval?.requestedCapabilities);
  const reason = normalizeString(
    selectedApproval?.reason || linkedRun?.policyResponse?.reasons?.[0]?.message,
    "-"
  );

  return {
    available: Boolean(
      normalizeString(selectedApproval?.approvalId) || normalizeString(linkedRun?.runId)
    ),
    source: normalizeString(approvals?.source || runs?.source, "unknown"),
    selectedRunId: normalizeString(selectedApproval?.runId || linkedRun?.runId),
    approvalId: normalizeString(selectedApproval?.approvalId, "-"),
    approvalStatus: status,
    actionable,
    canApproveDeny: actionable,
    canRoute: actionable,
    routeOnlyActions: ["DEFER", "ESCALATE"],
    runId: normalizeString(linkedRun?.runId || selectedApproval?.runId, "-"),
    requestId: normalizeString(linkedRun?.requestId || selectedApproval?.requestId, "-"),
    tenantId: normalizeString(selectedApproval?.tenantId || linkedRun?.tenantId, "-"),
    projectId: normalizeString(selectedApproval?.projectId || linkedRun?.projectId, "-"),
    tierLabel: approvalTierLabel(selectedApproval?.tier),
    targetExecutionProfile: normalizeString(selectedApproval?.targetExecutionProfile, "-"),
    createdAt: normalizeString(selectedApproval?.createdAt, "-"),
    reviewedAt: normalizeString(selectedApproval?.reviewedAt, "-"),
    expiresAt: normalizeString(selectedApproval?.expiresAt, "-"),
    reason,
    requestedCapabilities,
    policyDecision: normalizeString(linkedRun?.policyDecision || linkedRun?.policyResponse?.decision, "-"),
    policyProvider: displayPolicyProviderLabel(
      linkedRun?.selectedPolicyProvider || linkedRun?.policyResponse?.source || "-"
    ),
    grantTokenPresent: Boolean(linkedRun?.policyGrantTokenPresent),
    evidenceBundleStatus: normalizeString(
      linkedRun?.evidenceBundleResponse?.status || linkedRun?.evidenceBundleStatus,
      "-"
    ),
    evidenceRecordStatus: normalizeString(
      linkedRun?.evidenceRecordResponse?.status || linkedRun?.evidenceRecordStatus,
      "-"
    )
  };
}

function summarizeAuthorityLadder(settings = {}, approvals = {}, runs = {}, session = {}) {
  const runtimeIdentity = readObject(settings?.identity);
  const identity = readObject(runtimeIdentity?.identity);
  const claims = readObject(session?.claims);
  const approvalItems = Array.isArray(approvals?.items) ? approvals.items : [];
  const activeApproval =
    approvalItems.find((item) => approvalStatus(item) === "PENDING") || pickLatestItem(approvalItems);
  const runItems = Array.isArray(runs?.items) ? runs.items : [];
  const linkedRun =
    runItems.find((item) => normalizeString(item?.runId) === normalizeString(activeApproval?.runId)) ||
    pickLatestItem(runItems);
  const requestPayload = readObject(linkedRun?.requestPayload);
  const requestMeta = readObject(requestPayload?.meta);
  const roles = readStringArray(identity?.roles || claims?.roles || []);
  const tenantIds = readStringArray(identity?.tenantIds || claims?.tenant_id || []);
  const projectIds = readStringArray(identity?.projectIds || claims?.project_id || []);

  return {
    available: Boolean(
      normalizeString(identity?.subject || claims?.sub || claims?.email) ||
        normalizeString(activeApproval?.approvalId) ||
        normalizeString(linkedRun?.runId)
    ),
    source: normalizeString(runtimeIdentity?.source || settings?.dataSources?.approvals, "unknown"),
    subject: normalizeString(identity?.subject || claims?.sub || claims?.email, "-"),
    clientId: normalizeString(identity?.clientId || claims?.client_id, "-"),
    authorityBasis: normalizeString(runtimeIdentity?.authorityBasis, "-"),
    roles,
    tenantIds,
    projectIds,
    currentTier: approvalTierLabel(activeApproval?.tier),
    currentTierValue: normalizeString(activeApproval?.tier, "0"),
    targetExecutionProfile: normalizeString(activeApproval?.targetExecutionProfile, "-"),
    approvalId: normalizeString(activeApproval?.approvalId, "-"),
    runId: normalizeString(linkedRun?.runId || activeApproval?.runId, "-"),
    requestId: normalizeString(linkedRun?.requestId || activeApproval?.requestId, "-"),
    policyProvider: displayPolicyProviderLabel(linkedRun?.selectedPolicyProvider || "-"),
    policyDecision: normalizeString(linkedRun?.policyDecision, "-"),
    environment: normalizeString(linkedRun?.environment || requestMeta?.environment, "-")
  };
}

function receiptState(latestReviewed = {}, fallbackApproval = {}, fallbackRun = {}, nowValue = new Date()) {
  if (normalizeString(latestReviewed?.approvalId)) {
    const status = approvalStatus(latestReviewed, nowValue);
    if (status === "APPROVED" || status === "DENIED") {
      return { label: "recorded", tone: "ok" };
    }
    if (status === "EXPIRED") {
      return { label: "expired", tone: "warn" };
    }
  }
  if (normalizeString(fallbackApproval?.approvalId)) {
    const status = approvalStatus(fallbackApproval, nowValue);
    if (status === "PENDING") {
      return { label: "pending", tone: "warn" };
    }
    if (status === "EXPIRED") {
      return { label: "expired", tone: "warn" };
    }
  }
  if (normalizeString(fallbackRun?.runId)) {
    return { label: "issued", tone: "ok" };
  }
  return { label: "unavailable", tone: "neutral" };
}

function summarizeDecisionReceipt(approvals = {}, runs = {}, nowValue = new Date()) {
  const approvalItems = Array.isArray(approvals?.items) ? approvals.items : [];
  const runItems = Array.isArray(runs?.items) ? runs.items : [];
  const latestReviewed =
    approvalItems
      .filter((item) => normalizeString(item?.reviewedAt))
      .sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] || {};
  const latestPending =
    approvalItems
      .filter((item) => approvalStatus(item, nowValue) === "PENDING")
      .sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] || {};
  const referenceApproval = normalizeString(latestReviewed?.approvalId) ? latestReviewed : latestPending;
  const latestRun =
    runItems.find((item) => normalizeString(item?.runId) === normalizeString(referenceApproval?.runId)) ||
    pickLatestItem(runItems);
  const state = receiptState(latestReviewed, latestPending, latestRun, nowValue);

  return {
    available: Boolean(
      normalizeString(latestReviewed?.approvalId) ||
        normalizeString(latestPending?.approvalId) ||
        normalizeString(latestRun?.runId)
    ),
    state,
    source: normalizeString(
      normalizeString(approvals?.source) || normalizeString(runs?.source),
      "unknown"
    ),
    approvalId: normalizeString(referenceApproval?.approvalId, "-"),
    approvalStatus: approvalStatus(referenceApproval, nowValue) || "-",
    runId: normalizeString(latestRun?.runId || referenceApproval?.runId, "-"),
    reviewedAt: normalizeString(referenceApproval?.reviewedAt, "-"),
    expiresAt: normalizeString(referenceApproval?.expiresAt, "-"),
    reason: normalizeString(referenceApproval?.reason || latestRun?.policyResponse?.reasons?.[0]?.message, "-"),
    policyDecision: normalizeString(latestRun?.policyDecision || latestRun?.policyResponse?.decision, "-"),
    policyProvider: displayPolicyProviderLabel(latestRun?.selectedPolicyProvider || latestRun?.policyResponse?.source || "-"),
    grantTokenPresent: Boolean(latestRun?.policyGrantTokenPresent),
    evidenceBundleStatus: normalizeString(
      latestRun?.evidenceBundleResponse?.status || latestRun?.evidenceBundleStatus,
      "-"
    ),
    evidenceRecordStatus: normalizeString(
      latestRun?.evidenceRecordResponse?.status || latestRun?.evidenceRecordStatus,
      "-"
    )
  };
}

function summarizeDelegationAndEscalation(settings = {}, approvals = {}, runs = {}, session = {}, nowValue = new Date()) {
  const runtimeIdentity = readObject(settings?.identity);
  const identity = readObject(runtimeIdentity?.identity);
  const claims = readObject(session?.claims);
  const roles = readStringArray(identity?.roles || claims?.roles || []);
  const tenantIds = readStringArray(identity?.tenantIds || claims?.tenant_id || []);
  const projectIds = readStringArray(identity?.projectIds || claims?.project_id || []);
  const approvalItems = Array.isArray(approvals?.items) ? approvals.items : [];
  const latestReviewed =
    approvalItems
      .filter((item) => normalizeString(item?.reviewedAt))
      .sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] || {};
  const latestPending =
    approvalItems
      .filter((item) => approvalStatus(item, nowValue) === "PENDING")
      .sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] || {};
  const referenceApproval = normalizeString(latestPending?.approvalId)
    ? latestPending
    : normalizeString(latestReviewed?.approvalId)
      ? latestReviewed
      : pickLatestItem(approvalItems);
  const runItems = Array.isArray(runs?.items) ? runs.items : [];
  const linkedRun =
    runItems.find((item) => normalizeString(item?.runId) === normalizeString(referenceApproval?.runId)) ||
    pickLatestItem(runItems);
  const approvalState = approvalStatus(referenceApproval, nowValue);
  const tier = Number.parseInt(String(referenceApproval?.tier || "0"), 10) || 0;
  const policyDecision = normalizeString(linkedRun?.policyDecision || linkedRun?.policyResponse?.decision, "-").toUpperCase();
  const authorityBasis = normalizeString(runtimeIdentity?.authorityBasis, "-");
  const roleScoped = roles.length > 0;
  const scopeBound = tenantIds.length > 0 || projectIds.length > 0;
  let routeState = "clear";
  let routeTone = "neutral";
  let routeMode = "policy-first";
  if (approvalState === "PENDING") {
    routeState = "active";
    routeTone = "warn";
    routeMode = "step-up approval";
  } else if (approvalState === "APPROVED" || approvalState === "DENIED") {
    routeState = "recorded";
    routeTone = "ok";
    routeMode = "recorded review";
  } else if (approvalState === "EXPIRED") {
    routeState = "expired";
    routeTone = "warn";
    routeMode = "expired approval";
  } else if (policyDecision === "DEFER") {
    routeState = "watch";
    routeTone = "warn";
    routeMode = "deferred governance path";
  }
  const receiverState =
    approvalState === "PENDING"
      ? "pending receiver"
      : approvalState === "APPROVED" || approvalState === "DENIED"
        ? "recorded receiver"
        : "no receiver";
  const receiverClass =
    tier > 0 ? `${approvalTierLabel(tier)} reviewer` : approvalState === "PENDING" ? "approval queue" : "not assigned";

  return {
    available: Boolean(
      normalizeString(referenceApproval?.approvalId) ||
        normalizeString(linkedRun?.runId) ||
        normalizeString(identity?.subject || claims?.sub || claims?.email)
    ),
    source: normalizeString(runtimeIdentity?.source || approvals?.source || runs?.source, "unknown"),
    routeState,
    routeTone,
    routeMode,
    receiverState,
    receiverClass,
    authorityBasis,
    roleScoped,
    scopeBound,
    roleCount: roles.length,
    tenantCount: tenantIds.length,
    projectCount: projectIds.length,
    rolePreview: roles.slice(0, 2),
    approvalTier: approvalTierLabel(tier),
    targetExecutionProfile: normalizeString(referenceApproval?.targetExecutionProfile, "-"),
    approvalId: normalizeString(referenceApproval?.approvalId, "-"),
    runId: normalizeString(linkedRun?.runId || referenceApproval?.runId, "-"),
    requestId: normalizeString(linkedRun?.requestId || referenceApproval?.requestId, "-"),
    policyDecision: policyDecision || "-",
    reason: normalizeString(referenceApproval?.reason || linkedRun?.policyResponse?.reasons?.[0]?.message, "-"),
    reviewedAt: normalizeString(referenceApproval?.reviewedAt, "-"),
    expiresAt: normalizeString(referenceApproval?.expiresAt, "-")
  };
}

function parseOrgAdminDecisionBinding(approval = {}) {
  const annotations = readObject(approval?.annotations);
  const binding = readObject(annotations?.orgAdminDecisionBinding);
  return {
    profileId: normalizeString(binding?.profileId, "-"),
    profileLabel: normalizeString(binding?.profileLabel, "-"),
    category: normalizeString(binding?.category, "-"),
    bindingId: normalizeString(binding?.bindingId, "-"),
    bindingLabel: normalizeString(binding?.bindingLabel, "-"),
    bindingMode: normalizeString(binding?.bindingMode, "-"),
    selectedRoleBundle: normalizeString(binding?.selectedRoleBundle, "-"),
    selectedExceptionProfiles: uniqueSortedValues(binding?.selectedExceptionProfiles || []),
    selectedOverlayProfiles: uniqueSortedValues(binding?.selectedOverlayProfiles || []),
    requiredInputs: uniqueSortedValues(binding?.requiredInputs || []),
    requestedInputKeys: uniqueSortedValues(binding?.requestedInputKeys || []),
    decisionSurfaces: uniqueSortedValues(binding?.decisionSurfaces || []),
    boundaryRequirements: uniqueSortedValues(binding?.boundaryRequirements || [])
  };
}

function collectExceptionProfileCatalog(orgAdminProfiles = {}) {
  const items = Array.isArray(orgAdminProfiles?.items) ? orgAdminProfiles.items : [];
  const profiles = new Map();
  for (const item of items) {
    for (const profile of Array.isArray(item?.exceptionProfiles) ? item.exceptionProfiles : []) {
      const profileId = normalizeString(profile?.profileId);
      if (!profileId) {
        continue;
      }
      profiles.set(profileId, {
        profileId,
        label: normalizeString(profile?.label, profileId),
        category: normalizeString(profile?.category),
        exceptionMode: normalizeString(profile?.exceptionMode),
        requiredInputs: readStringArray(profile?.requiredInputs),
        decisionSurfaces: readStringArray(profile?.decisionSurfaces),
        boundaryRequirements: readStringArray(profile?.boundaryRequirements)
      });
    }
  }
  return profiles;
}

function collectOverlayProfileCatalog(orgAdminProfiles = {}) {
  const items = Array.isArray(orgAdminProfiles?.items) ? orgAdminProfiles.items : [];
  const profiles = new Map();
  for (const item of items) {
    for (const profile of Array.isArray(item?.overlayProfiles) ? item.overlayProfiles : []) {
      const overlayId = normalizeString(profile?.overlayId);
      if (!overlayId) {
        continue;
      }
      profiles.set(overlayId, {
        overlayId,
        label: normalizeString(profile?.label, overlayId),
        category: normalizeString(profile?.category),
        overlayMode: normalizeString(profile?.overlayMode),
        targetDimensions: readStringArray(profile?.targetDimensions),
        requiredInputs: readStringArray(profile?.requiredInputs),
        decisionSurfaces: readStringArray(profile?.decisionSurfaces),
        boundaryRequirements: readStringArray(profile?.boundaryRequirements)
      });
    }
  }
  return profiles;
}

function countBreakGlassRoleBundles(orgAdminProfiles = {}) {
  const items = Array.isArray(orgAdminProfiles?.items) ? orgAdminProfiles.items : [];
  return uniqueSortedValues(items.flatMap((item) => readStringArray(item?.breakGlassRoleBundles))).length;
}

function activeApprovalReference(approvals = {}, nowValue = new Date()) {
  const approvalItems = Array.isArray(approvals?.items) ? approvals.items : [];
  const latestReviewed =
    approvalItems
      .filter((item) => normalizeString(item?.reviewedAt))
      .sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] || {};
  const latestPending =
    approvalItems
      .filter((item) => approvalStatus(item, nowValue) === "PENDING")
      .sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0] || {};
  if (normalizeString(latestPending?.approvalId)) {
    return latestPending;
  }
  if (normalizeString(latestReviewed?.approvalId)) {
    return latestReviewed;
  }
  return pickLatestItem(approvalItems);
}

function linkedRunReference(runs = {}, approval = {}) {
  const runItems = Array.isArray(runs?.items) ? runs.items : [];
  return (
    runItems.find((item) => normalizeString(item?.runId) === normalizeString(approval?.runId)) ||
    pickLatestItem(runItems)
  );
}

function summarizeOverrideAndExceptionPosture(approvals = {}, runs = {}, orgAdminProfiles = {}, nowValue = new Date()) {
  const referenceApproval = activeApprovalReference(approvals, nowValue);
  const linkedRun = linkedRunReference(runs, referenceApproval);
  const binding = parseOrgAdminDecisionBinding(referenceApproval);
  const exceptionCatalog = collectExceptionProfileCatalog(orgAdminProfiles);
  const overlayCatalog = collectOverlayProfileCatalog(orgAdminProfiles);
  const selectedExceptions = binding.selectedExceptionProfiles.map((profileId) => exceptionCatalog.get(profileId) || {
    profileId,
    label: profileId,
    category: ""
  });
  const selectedOverlays = binding.selectedOverlayProfiles.map((overlayId) => overlayCatalog.get(overlayId) || {
    overlayId,
    label: overlayId,
    category: "",
    overlayMode: ""
  });
  const approvalState = approvalStatus(referenceApproval, nowValue) || "UNKNOWN";
  const policyDecision = normalizeString(linkedRun?.policyDecision || linkedRun?.policyResponse?.decision, "-").toUpperCase();
  const grantTokenPresent = Boolean(linkedRun?.policyGrantTokenPresent);
  const breakGlassBundleCount = countBreakGlassRoleBundles(orgAdminProfiles);
  const selectedRoleBundle = normalizeString(binding?.selectedRoleBundle).toLowerCase();
  const bindingSurfaces = readStringArray(binding?.decisionSurfaces);
  const breakGlassLinked =
    normalizeString(binding?.category).toLowerCase() === "break_glass" ||
    selectedExceptions.some((item) => normalizeString(item?.category).toLowerCase() === "break_glass") ||
    (selectedRoleBundle.includes("break_glass") && bindingSurfaces.includes("break_glass_activation"));
  const exceptionCategories = uniqueSortedValues(selectedExceptions.map((item) => item?.category));
  const overlayCategories = uniqueSortedValues(selectedOverlays.map((item) => item?.category));
  const hasExceptions = selectedExceptions.length > 0;
  const hasOverlays = selectedOverlays.length > 0;
  let postureState = "standard";
  let postureTone = "neutral";
  let posturePath = "normal approval path";
  if (breakGlassLinked) {
    postureState = "break-glass";
    postureTone = "warn";
    posturePath = "break-glass review";
  } else if (hasExceptions) {
    postureState = "exception-linked";
    postureTone = "warn";
    posturePath = "exception review";
  } else if (hasOverlays) {
    postureState = "overlay-linked";
    postureTone = "warn";
    posturePath = "overlay review";
  } else if (approvalState === "PENDING" || policyDecision === "DEFER" || !grantTokenPresent) {
    postureState = "approval-gated";
    postureTone = "warn";
    posturePath = "approval gate";
  } else if (approvalState === "APPROVED" || grantTokenPresent) {
    postureState = "recorded";
    postureTone = "ok";
    posturePath = "normal approval path";
  }

  const boundaryRequirements = uniqueSortedValues([
    ...readStringArray(binding?.boundaryRequirements),
    ...selectedExceptions.flatMap((item) => readStringArray(item?.boundaryRequirements)),
    ...selectedOverlays.flatMap((item) => readStringArray(item?.boundaryRequirements))
  ]);
  const decisionSurfaces = uniqueSortedValues([
    ...readStringArray(binding?.decisionSurfaces),
    ...selectedExceptions.flatMap((item) => readStringArray(item?.decisionSurfaces)),
    ...selectedOverlays.flatMap((item) => readStringArray(item?.decisionSurfaces))
  ]);
  const requiredInputs = uniqueSortedValues([
    ...readStringArray(binding?.requiredInputs),
    ...selectedExceptions.flatMap((item) => readStringArray(item?.requiredInputs)),
    ...selectedOverlays.flatMap((item) => readStringArray(item?.requiredInputs))
  ]);
  const latestException = selectedExceptions[0] || {};
  const latestOverlay = selectedOverlays[0] || {};

  return {
    available: Boolean(
      normalizeString(referenceApproval?.approvalId) ||
        normalizeString(linkedRun?.runId) ||
        hasExceptions ||
        hasOverlays ||
        breakGlassBundleCount > 0
    ),
    source: normalizeString(approvals?.source || runs?.source || orgAdminProfiles?.source, "unknown"),
    postureState,
    postureTone,
    posturePath,
    approvalStatus: approvalState,
    policyDecision: policyDecision || "-",
    approvalId: normalizeString(referenceApproval?.approvalId, "-"),
    runId: normalizeString(linkedRun?.runId || referenceApproval?.runId, "-"),
    requestId: normalizeString(linkedRun?.requestId || referenceApproval?.requestId, "-"),
    profileLabel: normalizeString(binding?.profileLabel || latestException?.label || latestOverlay?.label, "-"),
    roleBundle: normalizeString(binding?.selectedRoleBundle, "-"),
    grantTokenPresent,
    latestExceptionLabel: normalizeString(latestException?.label, "-"),
    latestExceptionCategory: normalizeString(latestException?.category || exceptionCategories[0], "-"),
    latestOverlayLabel: normalizeString(latestOverlay?.label, "-"),
    latestOverlayCategory: normalizeString(latestOverlay?.category || overlayCategories[0], "-"),
    latestOverlayMode: normalizeString(latestOverlay?.overlayMode, "-"),
    exceptionCount: selectedExceptions.length,
    overlayCount: selectedOverlays.length,
    breakGlassBundleCount,
    breakGlassLinked,
    boundaryRequirementCount: boundaryRequirements.length,
    firstBoundaryRequirement: boundaryRequirements[0] || "-",
    decisionSurfaceCount: decisionSurfaces.length,
    firstDecisionSurface: decisionSurfaces[0] || "-",
    requiredInputCount: requiredInputs.length,
    firstRequiredInput: requiredInputs[0] || "-",
    reviewedAt: normalizeString(referenceApproval?.reviewedAt, "-"),
    expiresAt: normalizeString(referenceApproval?.expiresAt, "-"),
    reason: normalizeString(referenceApproval?.reason || linkedRun?.policyResponse?.reasons?.[0]?.message, "-")
  };
}

export function governanceToneChipClass(tone) {
  const normalized = normalizeString(tone, "neutral").toLowerCase();
  if (normalized === "ok") {
    return "chip chip-ok chip-compact";
  }
  if (normalized === "warn") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

export function governanceStatusChipClass(value) {
  return `${chipClassForStatus(value)} chip-compact`;
}

export function createGovernanceWorkspaceSnapshot(context = {}) {
  const settings = readObject(context?.settings);
  const approvals = readObject(context?.approvals);
  const runs = readObject(context?.runs);
  const session = readObject(context?.session);
  const orgAdminProfiles = readObject(context?.orgAdminProfiles);
  const viewState = readObject(context?.viewState);
  const nowValue = context?.now || new Date();

  return {
    aimxsDecisionBindingSpine:
      context?.aimxsDecisionBindingSpine && typeof context.aimxsDecisionBindingSpine === "object"
        ? context.aimxsDecisionBindingSpine
        : { available: false },
    operationalFeedback: summarizeOperationalFeedback(viewState),
    adminProposalReview: summarizeAdminProposalReview(context?.adminQueueItems, viewState),
    actionReview: summarizeActionReview(approvals, runs, nowValue, viewState),
    approvalQueue: summarizeApprovalQueue(approvals, nowValue),
    authorityLadder: summarizeAuthorityLadder(settings, approvals, runs, session),
    decisionReceipt: summarizeDecisionReceipt(approvals, runs, nowValue),
    delegationEscalation: summarizeDelegationAndEscalation(settings, approvals, runs, session, nowValue),
    overrideExceptionPosture: summarizeOverrideAndExceptionPosture(approvals, runs, orgAdminProfiles, nowValue)
  };
}
