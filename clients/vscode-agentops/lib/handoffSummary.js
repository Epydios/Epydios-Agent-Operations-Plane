function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function sanitizeLines(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => normalizedString(item)).filter(Boolean);
}

function clipText(value, maxLength = 220) {
  const text = normalizedString(value);
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function auditEventLines(selectedSummary = {}) {
  const items = Array.isArray(selectedSummary?.events) ? selectedSummary.events : [];
  return items
    .filter((item) => {
      const type = normalizedString(item?.eventType).toLowerCase();
      return type.startsWith("approval.") ||
        type.startsWith("tool_proposal.") ||
        type.startsWith("tool_action.") ||
        type === "evidence.recorded" ||
        type.startsWith("session.");
    })
    .slice(-6)
    .map((item) => `${normalizedString(item?.label, item?.eventType)}: ${clipText(normalizedString(item?.detail, normalizedString(item?.summary, "Event recorded.")), 180)}`);
}

function evidenceLines(selectedSummary = {}) {
  const records = Array.isArray(selectedSummary?.evidenceRecords) ? selectedSummary.evidenceRecords : [];
  return records.map((item) => {
    const label = normalizedString(item?.kind, "evidence");
    const summary = clipText(normalizedString(item?.summary, normalizedString(item?.evidenceId, "Evidence recorded.")), 180);
    return `${label}: ${summary}`;
  });
}

function buildActionHints(selectedSummary = {}) {
  const approvals = Array.isArray(selectedSummary?.approvals) ? selectedSummary.approvals : [];
  const proposals = Array.isArray(selectedSummary?.toolProposals) ? selectedSummary.toolProposals : [];
  const pendingApprovals = approvals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING");
  const pendingProposals = proposals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING");
  if (pendingApprovals.length > 0 || pendingProposals.length > 0) {
    return sanitizeLines([
      pendingApprovals.length > 0 ? "Resolve the remaining approval checkpoints before external handoff." : "",
      pendingProposals.length > 0 ? "Resolve the remaining tool proposals before external handoff." : ""
    ]);
  }
  if ((Array.isArray(selectedSummary?.evidenceRecords) ? selectedSummary.evidenceRecords.length : 0) > 0) {
    return [
      "Copy this handoff summary or the governed report when downstream review needs the current proof package."
    ];
  }
  return [
    "Refresh after the next governed turn to capture audit activity and evidence for handoff."
  ];
}

function buildAuditEvidenceHandoff(model = {}) {
  const task = model?.task && typeof model.task === "object" ? model.task : {};
  const selectedSession = model?.selectedSession && typeof model.selectedSession === "object" ? model.selectedSession : {};
  const selectedSummary = model?.selectedSummary && typeof model.selectedSummary === "object" ? model.selectedSummary : {};
  const evidence = evidenceLines(selectedSummary);
  const audit = auditEventLines(selectedSummary);
  const actionHints = buildActionHints(selectedSummary);
  const openApprovals = Number((Array.isArray(selectedSummary?.approvals) ? selectedSummary.approvals : []).filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length || 0);
  const pendingProposals = Number((Array.isArray(selectedSummary?.toolProposals) ? selectedSummary.toolProposals : []).filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length || 0);
  const evidenceCount = Number((Array.isArray(selectedSummary?.evidenceRecords) ? selectedSummary.evidenceRecords : []).length || 0);
  const summary = evidenceCount > 0
    ? `Session ${normalizedString(selectedSession?.sessionId, "-")} has ${evidenceCount} evidence record(s) and ${audit.length} recent audit event(s) ready for handoff.`
    : `Session ${normalizedString(selectedSession?.sessionId, "-")} does not yet have recorded evidence for handoff.`;
  const renderedText = [
    "AgentOps Audit and Evidence Handoff",
    `Task: ${normalizedString(task?.title, normalizedString(task?.taskId, "-"))}`,
    `Session: ${normalizedString(selectedSession?.sessionId, "-")}`,
    `Task Status: ${normalizedString(selectedSummary?.taskStatus, normalizedString(task?.status, "-"))}`,
    `Session Status: ${normalizedString(selectedSummary?.sessionStatus, normalizedString(selectedSession?.status, "-"))}`,
    `Open Approvals: ${openApprovals}`,
    `Pending Proposals: ${pendingProposals}`,
    `Evidence Records: ${evidenceCount}`,
    "",
    "Evidence:",
    ...(evidence.length > 0 ? evidence.map((item) => `- ${item}`) : ["- None yet"]),
    "",
    "Recent Audit and Review:",
    ...(audit.length > 0 ? audit.map((item) => `- ${item}`) : ["- No recent audit or review events recorded."]),
    "",
    "Next Truthful Actions:",
    ...actionHints.map((item) => `- ${item}`)
  ].join("\n");
  return {
    header: "Audit and Evidence Handoff",
    summary,
    sessionId: normalizedString(selectedSession?.sessionId),
    taskId: normalizedString(task?.taskId),
    openApprovals,
    pendingProposals,
    evidenceCount,
    auditEventCount: audit.length,
    evidenceLines: evidence,
    auditLines: audit,
    actionHints,
    renderedText
  };
}

module.exports = {
  buildAuditEvidenceHandoff
};
