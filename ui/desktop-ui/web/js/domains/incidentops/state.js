function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "filed" || status === "closed") {
    return status;
  }
  return "drafted";
}

function normalizeApprovalStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  return status || "UNAVAILABLE";
}

function readTimestamp(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function normalizeIncidentEntry(entry, index) {
  const item = entry && typeof entry === "object" ? entry : {};
  const packageId = String(item.packageId || item.id || `incident-${index + 1}`).trim();
  const id = String(item.id || packageId || `incident-entry-${index + 1}`).trim();
  return {
    id,
    packageId,
    generatedAt: readTimestamp(item.generatedAt, item.createdAt, item.updatedAt),
    filingUpdatedAt: readTimestamp(item.filingUpdatedAt, item.updatedAt, item.generatedAt),
    filingStatus: normalizeStatus(item.filingStatus),
    scope: String(item.scope || "").trim(),
    auditSource: String(item.auditSource || "").trim(),
    runId: String(item.runId || "").trim(),
    approvalId: String(item.approvalId || "").trim(),
    approvalStatus: normalizeApprovalStatus(item.approvalStatus),
    auditMatchedCount: Number(item.auditMatchedCount || 0) || 0,
    fileName: String(item.fileName || "").trim(),
    handoffText: String(item.handoffText || "").trim(),
    payload: item.payload && typeof item.payload === "object" ? item.payload : null
  };
}

function normalizeDecision(run) {
  return String(run?.policyDecision || run?.policyResponse?.decision || run?.decision || "")
    .trim()
    .toUpperCase();
}

function buildRunIndex(items = []) {
  const index = {};
  for (const item of Array.isArray(items) ? items : []) {
    const runId = String(item?.runId || "").trim();
    if (runId) {
      index[runId] = item;
    }
  }
  return index;
}

function buildApprovalIndex(items = []) {
  const index = {};
  for (const item of Array.isArray(items) ? items : []) {
    const runId = String(item?.runId || "").trim();
    if (runId) {
      index[runId] = item;
    }
  }
  return index;
}

function sortByMostRecent(items = []) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const leftTs = Date.parse(readTimestamp(left.filingUpdatedAt, left.generatedAt)) || 0;
    const rightTs = Date.parse(readTimestamp(right.filingUpdatedAt, right.generatedAt)) || 0;
    return rightTs - leftTs;
  });
}

function deriveSeverity(entry, run, approval, auditItems) {
  const decision = normalizeDecision(run);
  const matchedAuditCount = Number(entry.auditMatchedCount || 0) || 0;
  const reviewStatus = String(approval?.status || entry.approvalStatus || "").trim().toUpperCase();
  const linkedAuditCount = Array.isArray(auditItems)
    ? auditItems.filter((item) => String(item?.runId || "").trim() === entry.runId).length
    : 0;
  if (
    entry.filingStatus === "filed" &&
    (decision === "DENY" || decision === "DEFER" || matchedAuditCount >= 3 || linkedAuditCount >= 3)
  ) {
    return "high";
  }
  if (
    entry.filingStatus === "drafted" ||
    reviewStatus === "PENDING" ||
    matchedAuditCount > 0 ||
    linkedAuditCount > 0
  ) {
    return "medium";
  }
  return "low";
}

function toTone(value) {
  const severity = String(value || "").trim().toLowerCase();
  if (severity === "high") {
    return "danger";
  }
  if (severity === "medium" || severity === "warn") {
    return "warn";
  }
  if (severity === "low" || severity === "ok") {
    return "ok";
  }
  return "neutral";
}

function buildTransitionActions(item) {
  const status = String(item?.filingStatus || "drafted").trim().toLowerCase();
  if (status === "drafted") {
    return [{ toStatus: "filed", label: "Mark Filed" }];
  }
  if (status === "filed") {
    return [
      { toStatus: "closed", label: "Mark Closed" },
      { toStatus: "drafted", label: "Return To Draft" }
    ];
  }
  if (status === "closed") {
    return [{ toStatus: "filed", label: "Reopen Filed" }];
  }
  return [];
}

function resolveActiveIncident(items = [], selectedIncidentId = "") {
  const normalizedSelectedId = String(selectedIncidentId || "").trim();
  if (!normalizedSelectedId) {
    return items[0] || null;
  }
  return (
    items.find((item) => item.id === normalizedSelectedId || item.packageId === normalizedSelectedId) ||
    items[0] ||
    null
  );
}

function takeTopCounts(values = [], limit = 3) {
  const counts = new Map();
  for (const value of values) {
    const key = String(value || "").trim();
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function buildResponseTimeline(latestItem, auditItems = []) {
  const item = latestItem || null;
  if (!item) {
    return {
      tone: "neutral",
      eventCount: 0,
      auditLinkedCount: 0,
      approvalLinked: false,
      handoffReady: false,
      latestEventAt: "",
      events: []
    };
  }

  const events = [];
  const pushEvent = (kind, ts, summary, detail = "") => {
    const timestamp = readTimestamp(ts);
    if (!timestamp || !summary) {
      return;
    }
    events.push({
      kind: String(kind || "").trim(),
      ts: timestamp,
      summary: String(summary || "").trim(),
      detail: String(detail || "").trim()
    });
  };

  pushEvent(
    "package_generated",
    item.generatedAt,
    "Incident package generated",
    item.packageId || item.fileName || ""
  );

  if (item.runId) {
    pushEvent(
      "run_updated",
      readTimestamp(item.run?.updatedAt, item.run?.createdAt),
      "Linked run anchor updated",
      item.runId
    );
  }

  if (item.approval || item.approvalStatus !== "UNAVAILABLE") {
    const approvalStatus = String(item.approval?.status || item.approvalStatus || "")
      .trim()
      .toUpperCase();
    pushEvent(
      "approval_anchor",
      readTimestamp(item.approval?.reviewedAt, item.approval?.updatedAt, item.approval?.createdAt),
      approvalStatus ? `Approval ${approvalStatus.toLowerCase()}` : "Approval linked",
      String(item.approval?.approvalId || item.approvalId || "").trim()
    );
  }

  if (item.filingUpdatedAt && item.filingUpdatedAt !== item.generatedAt) {
    pushEvent(
      "filing_transition",
      item.filingUpdatedAt,
      `Incident marked ${String(item.filingStatus || "drafted").trim().toLowerCase()}`,
      item.scope || ""
    );
  }

  if (item.handoffText) {
    pushEvent(
      "handoff_ready",
      readTimestamp(item.filingUpdatedAt, item.generatedAt),
      "Handoff summary available",
      item.packageId || item.fileName || ""
    );
  }

  const linkedAudit = (Array.isArray(auditItems) ? auditItems : [])
    .filter((auditItem) => String(auditItem?.runId || "").trim() === item.runId)
    .sort((left, right) => {
      const leftTs = Date.parse(readTimestamp(left?.ts, left?.timestamp)) || 0;
      const rightTs = Date.parse(readTimestamp(right?.ts, right?.timestamp)) || 0;
      return rightTs - leftTs;
    })
    .slice(0, 4);

  for (const auditItem of linkedAudit) {
    const event = String(auditItem?.event || "").trim();
    const decision = String(auditItem?.decision || "").trim();
    const providerId = String(auditItem?.providerId || "").trim();
    pushEvent(
      "audit_anchor",
      readTimestamp(auditItem?.ts, auditItem?.timestamp),
      event || "Audit anchor",
      [decision, providerId].filter(Boolean).join(" · ")
    );
  }

  events.sort((left, right) => {
    const leftTs = Date.parse(left.ts) || 0;
    const rightTs = Date.parse(right.ts) || 0;
    return rightTs - leftTs;
  });

  const latestEventAt = String(events[0]?.ts || "").trim();
  return {
    tone:
      item.severity === "high"
        ? "danger"
        : item.severity === "medium" || String(item.approval?.status || item.approvalStatus || "").trim().toUpperCase() === "PENDING"
          ? "warn"
          : "ok",
    eventCount: events.length,
    auditLinkedCount: linkedAudit.length,
    approvalLinked: Boolean(item.approval || item.approvalId),
    handoffReady: Boolean(item.handoffText),
    latestEventAt,
    events
  };
}

function buildClosureBoard(latestItem, latestAudit) {
  const item = latestItem || null;
  if (!item) {
    return {
      tone: "neutral",
      closureState: "unavailable",
      blockerCount: 0,
      blockers: [],
      nextAction: "Open an incident package to review what is ready and what still needs attention.",
      handoffReady: false,
      approvalCleared: false,
      auditLinked: false,
      latestAuditEvent: "",
      latestAuditAt: "",
      packageId: "",
      runId: "",
      updatedAt: "",
      decision: ""
    };
  }

  const blockers = [];
  const approvalStatus = String(item.approval?.status || item.approvalStatus || "")
    .trim()
    .toUpperCase();
  const approvalCleared =
    approvalStatus === "APPROVED" || approvalStatus === "UNAVAILABLE" || approvalStatus === "CLOSED";
  const handoffReady = Boolean(item.handoffText);
  const auditLinked = Number(item.auditMatchedCount || 0) > 0;
  const isClosed = item.filingStatus === "closed";
  const isFiled = item.filingStatus === "filed";

  if (!isFiled && !isClosed) {
    blockers.push("package not filed");
  }
  if (!approvalCleared) {
    blockers.push("approval still pending");
  }
  if (!handoffReady) {
    blockers.push("handoff summary missing");
  }
  if (!auditLinked) {
    blockers.push("audit anchor missing");
  }

  let closureState = "blocked";
  let tone = "danger";
  let nextAction = "Finish the missing package links before recording closure.";

  if (isClosed) {
    closureState = "closed";
    tone = "ok";
    nextAction = "Keep this package available for bounded reopen or audit review only if new activity appears.";
  } else if (blockers.length === 0) {
    closureState = "ready";
    tone = "ok";
    nextAction = "Record the closure note and keep the linked run, review, and audit trail attached.";
  } else if (isFiled) {
    closureState = "pending";
    tone = "warn";
    nextAction = "This package is filed but still needs one or more linked items before it can be closed cleanly.";
  }

  return {
    tone,
    closureState,
    blockerCount: blockers.length,
    blockers,
    nextAction,
    handoffReady,
    approvalCleared,
    auditLinked,
    latestAuditEvent: String(latestAudit?.event || "").trim(),
    latestAuditAt: String(latestAudit?.ts || latestAudit?.timestamp || "").trim(),
    packageId: item.packageId || "",
    runId: item.runId || "",
    updatedAt: item.filingUpdatedAt || item.generatedAt || "",
    decision: item.decision || ""
  };
}

export function createIncidentOpsWorkspaceSnapshot(context = {}) {
  const viewState = context?.viewState && typeof context.viewState === "object" ? context.viewState : {};
  const incidentItems = sortByMostRecent(
    (Array.isArray(context?.incidentHistory?.items) ? context.incidentHistory.items : []).map(
      normalizeIncidentEntry
    )
  );
  const runIndex = buildRunIndex(context?.runs?.items);
  const approvalIndex = buildApprovalIndex(context?.approvals?.items);
  const auditItems = Array.isArray(context?.audit?.items) ? context.audit.items : [];
  const enrichedItems = incidentItems.map((item) => {
    const run = runIndex[item.runId] || null;
    const approval = approvalIndex[item.runId] || null;
    const severity = deriveSeverity(item, run, approval, auditItems);
    return {
      ...item,
      run,
      approval,
      decision: normalizeDecision(run),
      severity
    };
  });

  const latestItem = resolveActiveIncident(enrichedItems, viewState.selectedIncidentId);
  const draftedCount = enrichedItems.filter((item) => item.filingStatus === "drafted").length;
  const filedCount = enrichedItems.filter((item) => item.filingStatus === "filed").length;
  const closedCount = enrichedItems.filter((item) => item.filingStatus === "closed").length;
  const highCount = enrichedItems.filter((item) => item.severity === "high").length;
  const mediumCount = enrichedItems.filter((item) => item.severity === "medium").length;
  const lowCount = enrichedItems.filter((item) => item.severity === "low").length;
  const latestAudit = auditItems[0] || {};
  const feedbackMessage = String(viewState?.feedback?.message || "").trim();

  return {
    feedback: feedbackMessage
      ? {
          tone: String(viewState?.feedback?.tone || "info").trim().toLowerCase(),
          message: feedbackMessage
        }
      : null,
    aimxsDecisionBindingSpine:
      context?.aimxsDecisionBindingSpine && typeof context.aimxsDecisionBindingSpine === "object"
        ? context.aimxsDecisionBindingSpine
        : { available: false },
    selectedIncidentId: latestItem?.id || "",
    incidentQueueBoard: {
      tone:
        enrichedItems.length === 0 ? "neutral" : draftedCount > 0 || highCount > 0 ? "warn" : "ok",
      totalCount: enrichedItems.length,
      draftedCount,
      filedCount,
      closedCount,
      pendingApprovalCount: enrichedItems.filter(
        (item) => String(item.approval?.status || item.approvalStatus || "").trim().toUpperCase() === "PENDING"
      ).length,
      auditSourceCount: new Set(enrichedItems.map((item) => item.auditSource).filter(Boolean)).size,
      topScopes: takeTopCounts(enrichedItems.map((item) => item.scope)),
      recentItems: enrichedItems.slice(0, 4).map((item) => ({
        ...item,
        isSelected: Boolean(latestItem?.id) && item.id === latestItem.id
      }))
    },
    activeIncidentBoard: {
      tone: toTone(latestItem?.severity),
      entryId: latestItem?.id || "",
      packageId: latestItem?.packageId || "",
      filingStatus: latestItem?.filingStatus || "drafted",
      generatedAt: latestItem?.generatedAt || "",
      filingUpdatedAt: latestItem?.filingUpdatedAt || "",
      scope: latestItem?.scope || "",
      auditSource: latestItem?.auditSource || "",
      runId: latestItem?.runId || "",
      decision: latestItem?.decision || "",
      approvalId: latestItem?.approval?.approvalId || latestItem?.approvalId || "",
      approvalStatus:
        String(latestItem?.approval?.status || latestItem?.approvalStatus || "").trim().toUpperCase() ||
        "UNAVAILABLE",
      auditMatchedCount: Number(latestItem?.auditMatchedCount || 0) || 0,
      severity: latestItem?.severity || "low",
      fileName: latestItem?.fileName || "",
      hasPayload: Boolean(latestItem?.payload),
      hasHandoffText: Boolean(latestItem?.handoffText),
      isFocused: Boolean(latestItem?.id),
      selectedLabel: latestItem?.id ? "focused" : "latest"
    },
    severityBoard: {
      tone: highCount > 0 ? "danger" : mediumCount > 0 ? "warn" : "ok",
      highCount,
      mediumCount,
      lowCount,
      decisionCounts: takeTopCounts(enrichedItems.map((item) => item.decision || "UNSET")),
      latestAudit: {
        event: String(latestAudit?.event || "").trim(),
        ts: String(latestAudit?.ts || latestAudit?.timestamp || "").trim(),
        decision: String(latestAudit?.decision || "").trim()
      },
      highestPackages: enrichedItems.filter((item) => item.severity === "high").slice(0, 3)
    },
    responseTimelineBoard: {
      entryId: latestItem?.id || "",
      activePackageId: latestItem?.packageId || "",
      activeRunId: latestItem?.runId || "",
      ...buildResponseTimeline(latestItem, auditItems)
    },
    closureBoard: {
      entryId: latestItem?.id || "",
      availableTransitions: buildTransitionActions(latestItem),
      ...buildClosureBoard(latestItem, latestAudit)
    }
  };
}
