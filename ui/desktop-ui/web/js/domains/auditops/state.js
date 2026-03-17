import {
  buildAuditCsv,
  buildAuditFilingBundle,
  buildAuditHandoffText,
  getFilteredAuditEvents
} from "../../views/audit.js";
import { createAimxsLegibilityModel } from "../../shared/aimxs/legibility.js";

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function parseTime(value) {
  const ts = new Date(value || "").getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function pickLatest(items = [], fields = ["ts"]) {
  const values = Array.isArray(items) ? items : [];
  let best = null;
  let bestTs = 0;
  for (const item of values) {
    const current = item && typeof item === "object" ? item : {};
    const ts = fields.reduce((max, field) => {
      const next = parseTime(current?.[field]);
      return next > max ? next : max;
    }, 0);
    if (!best || ts > bestTs) {
      best = current;
      bestTs = ts;
    }
  }
  return best || {};
}

function summarizeTopValues(items = [], key, limit = 3) {
  const counts = {};
  for (const item of Array.isArray(items) ? items : []) {
    const value = normalizeString(item?.[key], "(unknown)");
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

function uniqueCount(items = [], key) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeString(item?.[key]))
      .filter(Boolean)
  ).size;
}

function countLines(value) {
  const text = String(value || "").trim();
  if (!text) {
    return 0;
  }
  return text.split(/\r?\n/).filter(Boolean).length;
}

function normalizeIncidentEntry(entry = {}) {
  const current = entry && typeof entry === "object" ? entry : {};
  return {
    id: normalizeString(current?.id),
    packageId: normalizeString(current?.packageId),
    generatedAt: normalizeString(current?.generatedAt, normalizeString(current?.createdAt)),
    filingUpdatedAt: normalizeString(current?.filingUpdatedAt, normalizeString(current?.generatedAt, normalizeString(current?.createdAt))),
    filingStatus: normalizeString(current?.filingStatus, "drafted").toLowerCase(),
    scope: normalizeString(current?.scope, "-"),
    auditSource: normalizeString(current?.auditSource, "-"),
    runId: normalizeString(current?.runId),
    approvalStatus: normalizeString(current?.approvalStatus, "UNAVAILABLE").toUpperCase(),
    auditMatchedCount: Number(current?.auditMatchedCount || 0),
    fileName: normalizeString(current?.fileName),
    handoffText: normalizeString(current?.handoffText)
  };
}

function countIncidentStatuses(items = []) {
  const counts = { drafted: 0, filed: 0, closed: 0 };
  for (const item of Array.isArray(items) ? items : []) {
    const status = normalizeString(item?.filingStatus, "drafted").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }
  return counts;
}

function formatTimeWindow(filters = {}) {
  const range = normalizeString(filters?.timeRange).toLowerCase();
  if (range) {
    return `range:${range}`;
  }
  const fromValue = normalizeString(filters?.timeFrom, "-");
  const toValue = normalizeString(filters?.timeTo, "-");
  return fromValue !== "-" || toValue !== "-" ? `${fromValue} -> ${toValue}` : "range:any";
}

function toneForAuditBoard(bundle = {}, audit = {}) {
  if (normalizeString(audit?.warning)) {
    return "warn";
  }
  if (Number(bundle?.summary?.denyCount || 0) > 0) {
    return "warn";
  }
  if (Number(bundle?.meta?.matchedCount || 0) > 0) {
    return "ok";
  }
  return "neutral";
}

function summarizeRun(run = {}) {
  return {
    runId: normalizeString(run?.runId),
    status: normalizeString(run?.status),
    policyDecision: normalizeString(run?.policyDecision),
    projectId: normalizeString(run?.projectId),
    tenantId: normalizeString(run?.tenantId),
    updatedAt: normalizeString(run?.updatedAt, normalizeString(run?.createdAt))
  };
}

function summarizeApproval(approval = {}) {
  return {
    approvalId: normalizeString(approval?.approvalId),
    status: normalizeString(approval?.status),
    runId: normalizeString(approval?.runId),
    reviewedAt: normalizeString(approval?.reviewedAt, normalizeString(approval?.createdAt))
  };
}

function normalizeAdminTraceItem(item = {}) {
  const current = item && typeof item === "object" ? item : {};
  const decision = current?.decision && typeof current.decision === "object" ? current.decision : {};
  const execution = current?.execution && typeof current.execution === "object" ? current.execution : {};
  const receipt = current?.receipt && typeof current.receipt === "object" ? current.receipt : {};
  const rollback = current?.rollback && typeof current.rollback === "object" ? current.rollback : {};
  return {
    id: normalizeString(current?.id),
    ownerDomain: normalizeString(current?.ownerDomain, "unknown").toLowerCase(),
    kind: normalizeString(current?.kind),
    status: normalizeString(current?.status).toLowerCase(),
    requestedAction: normalizeString(current?.requestedAction),
    subjectId: normalizeString(current?.subjectId),
    targetScope: normalizeString(current?.targetScope),
    reason: normalizeString(current?.reason),
    summary: normalizeString(current?.summary),
    simulationSummary: normalizeString(current?.simulationSummary),
    createdAt: normalizeString(current?.createdAt),
    simulatedAt: normalizeString(current?.simulatedAt),
    routedAt: normalizeString(current?.routedAt),
    updatedAt: normalizeString(current?.updatedAt),
    decision: {
      decisionId: normalizeString(decision?.decisionId),
      status: normalizeString(decision?.status).toLowerCase(),
      reason: normalizeString(decision?.reason),
      decidedAt: normalizeString(decision?.decidedAt),
      approvalReceiptId: normalizeString(decision?.approvalReceiptId),
      actorRef: normalizeString(decision?.actorRef)
    },
    execution: {
      executionId: normalizeString(execution?.executionId),
      executedAt: normalizeString(execution?.executedAt),
      status: normalizeString(execution?.status).toLowerCase(),
      summary: normalizeString(execution?.summary),
      actorRef: normalizeString(execution?.actorRef)
    },
    receipt: {
      receiptId: normalizeString(receipt?.receiptId),
      issuedAt: normalizeString(receipt?.issuedAt),
      summary: normalizeString(receipt?.summary),
      stableRef: normalizeString(receipt?.stableRef),
      approvalReceiptId: normalizeString(receipt?.approvalReceiptId),
      executionId: normalizeString(receipt?.executionId)
    },
    recovery: {
      recoveryId: normalizeString(rollback?.rollbackId),
      action: normalizeString(rollback?.action),
      status: normalizeString(rollback?.status).toLowerCase(),
      recordedAt: normalizeString(rollback?.rolledBackAt),
      summary: normalizeString(rollback?.summary),
      stableRef: normalizeString(rollback?.stableRef),
      reason: normalizeString(rollback?.reason),
      approvalReceiptId: normalizeString(rollback?.approvalReceiptId),
      adminReceiptId: normalizeString(rollback?.adminReceiptId),
      executionId: normalizeString(rollback?.executionId)
    }
  };
}

function adminTraceTone(items = [], latest = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return "neutral";
  }
  if (normalizeString(latest?.recovery?.recoveryId)) {
    return "ok";
  }
  if (normalizeString(latest?.receipt?.receiptId) && normalizeString(latest?.decision?.approvalReceiptId)) {
    return "ok";
  }
  return "warn";
}

export function createAuditWorkspaceSnapshot(context = {}) {
  const audit = context?.audit && typeof context.audit === "object" ? context.audit : {};
  const filters = context?.filters && typeof context.filters === "object" ? context.filters : {};
  const viewState = context?.viewState && typeof context.viewState === "object" ? context.viewState : {};
  const actor = normalizeString(context?.actor, "-");
  const runs = Array.isArray(context?.runs?.items) ? context.runs.items : [];
  const approvals = Array.isArray(context?.approvals?.items) ? context.approvals.items : [];
  const incidentHistory = Array.isArray(context?.incidentHistory?.items) ? context.incidentHistory.items : [];
  const selectedRun = summarizeRun(context?.selectedRunDetail || {});
  const nowMs = parseTime(context?.now || "");
  const filterOptions = nowMs > 0 ? { nowMs } : {};
  const filteredItems = getFilteredAuditEvents(audit, filters, filterOptions);
  const bundle = buildAuditFilingBundle(audit, filters, {
    actor,
    source: normalizeString(audit?.source)
  }, filterOptions);
  const csvText = buildAuditCsv(bundle?.items || []);
  const handoffText = buildAuditHandoffText(bundle);
  const latestEvent = pickLatest(filteredItems, ["ts"]);
  const decisionItems = filteredItems.filter((item) => normalizeString(item?.decision).toUpperCase());
  const latestDecisionEvent = pickLatest(decisionItems, ["ts"]);
  const latestRun = summarizeRun(pickLatest(runs, ["updatedAt", "createdAt"]));
  const latestApproval = summarizeApproval(pickLatest(approvals, ["reviewedAt", "createdAt", "expiresAt"]));
  const investigationItems = incidentHistory
    .map((item) => normalizeIncidentEntry(item))
    .filter((item) => item.id || item.packageId);
  const adminTraceItems = (Array.isArray(context?.adminQueueItems) ? context.adminQueueItems : [])
    .map((item) => normalizeAdminTraceItem(item))
    .filter((item) => item.id);
  const incidentCounts = countIncidentStatuses(investigationItems);
  const latestInvestigation = normalizeIncidentEntry(
    pickLatest(investigationItems, ["generatedAt", "filingUpdatedAt"])
  );
  const latestAdminTrace = pickLatest(adminTraceItems, [
    "updatedAt",
    "recovery.recordedAt",
    "receipt.issuedAt",
    "execution.executedAt",
    "decision.decidedAt",
    "simulatedAt",
    "createdAt"
  ]);
  const recentInvestigations = investigationItems
    .slice()
    .sort((a, b) => parseTime(b?.generatedAt || b?.filingUpdatedAt) - parseTime(a?.generatedAt || a?.filingUpdatedAt))
    .slice(0, 4);
  const recentEvents = filteredItems
    .slice()
    .sort((a, b) => parseTime(b?.ts) - parseTime(a?.ts))
    .slice(0, 4)
    .map((item) => ({
      ts: normalizeString(item?.ts),
      event: normalizeString(item?.event),
      providerId: normalizeString(item?.providerId),
      tenantId: normalizeString(item?.tenantId),
      projectId: normalizeString(item?.projectId),
      decision: normalizeString(item?.decision).toUpperCase()
    }));
  const feedbackMessage = normalizeString(viewState?.feedback?.message);
  const handoffPreview = normalizeString(viewState?.handoffPreview);
  const adminOwnerMix = summarizeTopValues(adminTraceItems, "ownerDomain");
  const adminSimulatedCount = adminTraceItems.filter(
    (item) => normalizeString(item?.simulatedAt) || normalizeString(item?.simulationSummary)
  ).length;
  const adminDecisionCount = adminTraceItems.filter((item) => normalizeString(item?.decision?.decisionId)).length;
  const adminExecutionCount = adminTraceItems.filter(
    (item) => normalizeString(item?.execution?.executionId) || normalizeString(item?.receipt?.receiptId)
  ).length;
  const adminRecoveryCount = adminTraceItems.filter((item) => normalizeString(item?.recovery?.recoveryId)).length;

  return {
    feedback: feedbackMessage
      ? {
          tone: normalizeString(viewState?.feedback?.tone, "info"),
          message: feedbackMessage
        }
      : null,
    aimxsDecisionBindingSpine:
      context?.aimxsDecisionBindingSpine && typeof context.aimxsDecisionBindingSpine === "object"
        ? context.aimxsDecisionBindingSpine
        : { available: false },
    handoffPreview,
    auditEventBoard: {
      source: normalizeString(bundle?.meta?.source, normalizeString(audit?.source, "unknown")),
      warning: normalizeString(audit?.warning),
      matchedCount: Number(bundle?.meta?.matchedCount || 0),
      allowCount: Number(bundle?.summary?.allowCount || 0),
      denyCount: Number(bundle?.summary?.denyCount || 0),
      otherCount: Number(bundle?.summary?.otherCount || 0),
      topEvents: Array.isArray(bundle?.summary?.topEvents) ? bundle.summary.topEvents : [],
      topProviders: Array.isArray(bundle?.summary?.topProviders) ? bundle.summary.topProviders : [],
      latestEvent: {
        ts: normalizeString(latestEvent?.ts),
        event: normalizeString(latestEvent?.event),
        providerId: normalizeString(latestEvent?.providerId),
        decision: normalizeString(latestEvent?.decision).toUpperCase()
      },
      scope: {
        tenant: normalizeString(bundle?.meta?.filters?.tenant, "-"),
        project: normalizeString(bundle?.meta?.filters?.project, "-"),
        providerId: normalizeString(bundle?.meta?.filters?.providerId, "-"),
        timeWindow: formatTimeWindow(filters)
      },
      recentEvents,
      tone: toneForAuditBoard(bundle, audit)
    },
    actorActivityBoard: {
      actor,
      source: normalizeString(bundle?.meta?.source, normalizeString(audit?.source, "unknown")),
      matchedCount: Number(bundle?.meta?.matchedCount || 0),
      tenantCount: uniqueCount(filteredItems, "tenantId"),
      projectCount: uniqueCount(filteredItems, "projectId"),
      providerCount: uniqueCount(filteredItems, "providerId"),
      topTenants: summarizeTopValues(filteredItems, "tenantId"),
      topProjects: summarizeTopValues(filteredItems, "projectId"),
      latestRun,
      latestApproval,
      latestEvent: {
        event: normalizeString(latestEvent?.event),
        ts: normalizeString(latestEvent?.ts),
        tenantId: normalizeString(latestEvent?.tenantId),
        projectId: normalizeString(latestEvent?.projectId),
        providerId: normalizeString(latestEvent?.providerId)
      },
      tone: toneForAuditBoard(bundle, audit)
    },
    decisionTraceBoard: {
      decisionEventCount: decisionItems.length,
      allowCount: Number(bundle?.summary?.allowCount || 0),
      denyCount: Number(bundle?.summary?.denyCount || 0),
      otherCount: Number(bundle?.summary?.otherCount || 0),
      latestDecisionEvent: {
        ts: normalizeString(latestDecisionEvent?.ts),
        event: normalizeString(latestDecisionEvent?.event),
        providerId: normalizeString(latestDecisionEvent?.providerId),
        decision: normalizeString(latestDecisionEvent?.decision).toUpperCase(),
        tenantId: normalizeString(latestDecisionEvent?.tenantId),
        projectId: normalizeString(latestDecisionEvent?.projectId)
      },
      latestRun,
      latestApproval,
      topDecisionEvents: summarizeTopValues(decisionItems, "event"),
      tone:
        Number(bundle?.summary?.denyCount || 0) > 0
          ? "warn"
          : decisionItems.length > 0
            ? "ok"
            : "neutral"
    },
    adminLifecycleBoard: {
      totalCount: adminTraceItems.length,
      simulatedCount: adminSimulatedCount,
      decisionCount: adminDecisionCount,
      executionCount: adminExecutionCount,
      recoveryCount: adminRecoveryCount,
      ownerMix: adminOwnerMix,
      latestItem: latestAdminTrace,
      aimxsLegibility: createAimxsLegibilityModel({
        requestRef: normalizeString(latestAdminTrace?.id),
        actorRef: normalizeString(latestAdminTrace?.decision?.actorRef),
        subjectRef: normalizeString(latestAdminTrace?.subjectId),
        authorityRef: normalizeString(latestAdminTrace?.ownerDomain),
        grantRef: normalizeString(latestAdminTrace?.decision?.approvalReceiptId),
        posture: normalizeString(latestAdminTrace?.status),
        scopeRef: normalizeString(latestAdminTrace?.targetScope),
        previewRef: normalizeString(latestAdminTrace?.simulatedAt),
        previewSummary: normalizeString(latestAdminTrace?.simulationSummary),
        decisionRef: normalizeString(latestAdminTrace?.decision?.decisionId),
        decisionStatus: normalizeString(latestAdminTrace?.decision?.status || latestAdminTrace?.status),
        approvalReceiptRef: normalizeString(latestAdminTrace?.decision?.approvalReceiptId),
        executionRef: normalizeString(latestAdminTrace?.execution?.executionId),
        executionStatus: normalizeString(latestAdminTrace?.execution?.status),
        receiptRef: normalizeString(latestAdminTrace?.receipt?.receiptId),
        stableRef: normalizeString(latestAdminTrace?.receipt?.stableRef),
        recoveryRef: normalizeString(latestAdminTrace?.recovery?.recoveryId),
        recoveryAction: normalizeString(latestAdminTrace?.recovery?.action),
        recoveryStableRef: normalizeString(latestAdminTrace?.recovery?.stableRef),
        summary: normalizeString(latestAdminTrace?.summary)
      }),
      tone: adminTraceTone(adminTraceItems, latestAdminTrace)
    },
    exportBoard: {
      source: normalizeString(bundle?.meta?.source, normalizeString(audit?.source, "unknown")),
      actor,
      generatedAt: normalizeString(bundle?.meta?.generatedAt),
      matchedCount: Number(bundle?.meta?.matchedCount || 0),
      allowCount: Number(bundle?.summary?.allowCount || 0),
      denyCount: Number(bundle?.summary?.denyCount || 0),
      otherCount: Number(bundle?.summary?.otherCount || 0),
      csvLineCount: countLines(csvText),
      handoffLineCount: countLines(handoffText),
      currentScope: {
        tenant: normalizeString(bundle?.meta?.filters?.tenant, "-"),
        project: normalizeString(bundle?.meta?.filters?.project, "-"),
        providerId: normalizeString(bundle?.meta?.filters?.providerId, "-"),
        decision: normalizeString(bundle?.meta?.filters?.decision, "ANY"),
        timeWindow: formatTimeWindow(filters)
      },
      latestLinkedRun: latestRun,
      selectedRun,
      latestIncident: latestInvestigation,
      queueCount: investigationItems.length,
      canExportJson: Number(bundle?.meta?.matchedCount || 0) > 0,
      canExportCsv: Number(bundle?.meta?.matchedCount || 0) > 0,
      canCopyHandoff: Number(bundle?.meta?.matchedCount || 0) > 0,
      canExportIncident: Boolean(selectedRun.runId),
      tone:
        Number(bundle?.meta?.matchedCount || 0) > 0 || investigationItems.length > 0
          ? "ok"
          : "neutral"
    },
    investigationWorkspace: {
      totalCount: investigationItems.length,
      draftedCount: incidentCounts.drafted,
      filedCount: incidentCounts.filed,
      closedCount: incidentCounts.closed,
      latestIncident: latestInvestigation,
      latestRun,
      latestApproval,
      topScopes: summarizeTopValues(investigationItems, "scope"),
      recentInvestigations,
      canOpenIncidentOps: investigationItems.length > 0,
      canCopyLatestHandoff: Boolean(latestInvestigation.handoffText),
      tone:
        incidentCounts.drafted > 0 || incidentCounts.filed > 0
          ? "warn"
          : investigationItems.length > 0
            ? "ok"
            : "neutral"
    }
  };
}
