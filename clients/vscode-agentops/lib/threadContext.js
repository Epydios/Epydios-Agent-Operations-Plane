function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function resolvePendingTarget({
  sessionId = "",
  explicitTargetId = "",
  targetSingular = "target",
  targetPlural = "targets",
  explicitFlag = "id",
  items = [],
  contextLabel = "thread review"
} = {}) {
  const resolvedSessionId = normalizedString(sessionId);
  const resolvedTargetId = normalizedString(explicitTargetId);
  if (!resolvedSessionId) {
    throw new Error(`no session available to resolve ${targetSingular}`);
  }
  if (resolvedTargetId) {
    return { sessionId: resolvedSessionId, targetId: resolvedTargetId };
  }
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (normalizedItems.length === 0) {
    throw new Error(`no pending ${targetPlural} were found for the resolved ${contextLabel}`);
  }
  if (normalizedItems.length === 1) {
    return { sessionId: resolvedSessionId, targetId: normalizedString(normalizedItems[0]?.id) };
  }
  const ids = normalizedItems
    .map((item) => normalizedString(item?.id, item?.label))
    .filter(Boolean);
  throw new Error(`multiple pending ${targetPlural} matched the ${contextLabel}; choose --${explicitFlag} (${ids.join(", ")})`);
}

function listPendingApprovals(selectedSummary = {}) {
  return (Array.isArray(selectedSummary?.approvals) ? selectedSummary.approvals : [])
    .filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING")
    .map((item) => ({
      id: normalizedString(item?.checkpointId),
      label: normalizedString(item?.checkpointId, item?.scope)
    }))
    .filter((item) => Boolean(item.id));
}

function listPendingProposals(selectedSummary = {}) {
  return (Array.isArray(selectedSummary?.toolProposals) ? selectedSummary.toolProposals : [])
    .filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING")
    .map((item) => ({
      id: normalizedString(item?.proposalId),
      label: normalizedString(item?.proposalId, item?.summary)
    }))
    .filter((item) => Boolean(item.id));
}

function buildDecisionActionHints(selectedSummary = {}, sessionId = "") {
  const resolvedSessionId = normalizedString(sessionId, selectedSummary?.session?.sessionId);
  if (!resolvedSessionId) {
    return [];
  }
  const lines = [];
  const approvalIds = listPendingApprovals(selectedSummary).map((item) => item.id);
  const proposalIds = listPendingProposals(selectedSummary).map((item) => item.id);
  if (approvalIds.length === 1) {
    lines.push(`Approve or deny the pending approval in session ${resolvedSessionId}.`);
  } else if (approvalIds.length > 1) {
    lines.push(`Choose one approval explicitly in session ${resolvedSessionId}: ${approvalIds.join(", ")}`);
  }
  if (proposalIds.length === 1) {
    lines.push(`Approve or deny the pending proposal in session ${resolvedSessionId}.`);
  } else if (proposalIds.length > 1) {
    lines.push(`Choose one proposal explicitly in session ${resolvedSessionId}: ${proposalIds.join(", ")}`);
  }
  return lines;
}

function resolveApprovalDecisionTarget(selectedSummary = {}, sessionId = "", checkpointId = "") {
  return resolvePendingTarget({
    sessionId: normalizedString(sessionId, selectedSummary?.session?.sessionId),
    explicitTargetId: checkpointId,
    targetSingular: "approval",
    targetPlural: "approvals",
    explicitFlag: "checkpoint-id",
    items: listPendingApprovals(selectedSummary),
    contextLabel: "thread review"
  });
}

function resolveProposalDecisionTarget(selectedSummary = {}, sessionId = "", proposalId = "") {
  return resolvePendingTarget({
    sessionId: normalizedString(sessionId, selectedSummary?.session?.sessionId),
    explicitTargetId: proposalId,
    targetSingular: "proposal",
    targetPlural: "proposals",
    explicitFlag: "proposal-id",
    items: listPendingProposals(selectedSummary),
    contextLabel: "thread review"
  });
}

module.exports = {
  buildDecisionActionHints,
  listPendingApprovals,
  listPendingProposals,
  resolveApprovalDecisionTarget,
  resolveProposalDecisionTarget
};
