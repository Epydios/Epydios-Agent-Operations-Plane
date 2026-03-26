const { buildDecisionActionHints } = require("./threadContext");

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
    const parts = [
      normalizedString(item?.kind, "evidence"),
      normalizedString(item?.evidenceId, "-"),
      normalizedString(item?.uri, normalizedString(item?.summary, "Evidence recorded."))
    ];
    if (normalizedString(item?.checkpointId)) parts.push(`checkpoint=${normalizedString(item?.checkpointId)}`);
    if (normalizedString(item?.toolActionId)) parts.push(`toolAction=${normalizedString(item?.toolActionId)}`);
    return `Evidence package: ${parts.join(" | ")}`;
  });
}

function taskTargetLabel(task = {}) {
  const taskId = normalizedString(task?.taskId);
  if (taskId) {
    return `task ${taskId}`;
  }
  const title = normalizedString(task?.title);
  if (title) {
    return `task ${title}`;
  }
  return "the current VS Code governed thread";
}

function packageTargetLabel(task = {}) {
  return `the VS Code handoff summary for ${taskTargetLabel(task)}`;
}

function escalationTargetLabel(task = {}) {
  return `the VS Code governed thread for ${taskTargetLabel(task)}`;
}

function buildNextActionLines(selectedSummary = {}, selectedSession = {}) {
  const approvals = Array.isArray(selectedSummary?.approvals) ? selectedSummary.approvals : [];
  const proposals = Array.isArray(selectedSummary?.toolProposals) ? selectedSummary.toolProposals : [];
  const pendingApprovals = approvals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING");
  const pendingProposals = proposals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING");
  if (pendingApprovals.length > 0 || pendingProposals.length > 0) {
    return buildDecisionActionHints({
      ...selectedSummary,
      session: {
        ...(selectedSummary?.session && typeof selectedSummary.session === "object" ? selectedSummary.session : {}),
        sessionId: normalizedString(selectedSession?.sessionId, selectedSummary?.session?.sessionId)
      }
    }, normalizedString(selectedSession?.sessionId, selectedSummary?.session?.sessionId));
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

function currentDecisionLines(selectedSummary = {}) {
  const approvals = Array.isArray(selectedSummary?.approvals) ? selectedSummary.approvals : [];
  const proposals = Array.isArray(selectedSummary?.toolProposals) ? selectedSummary.toolProposals : [];
  const pendingApprovalLines = approvals
    .filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING")
    .map((item) => `Pending approval checkpoint ${normalizedString(item?.checkpointId, "approval")} (${normalizedString(item?.scope, "scope-unspecified")}).`);
  const pendingProposalLines = proposals
    .filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING")
    .map((item) => `Pending tool proposal ${normalizedString(item?.proposalId, "proposal")} (${normalizedString(item?.summary, normalizedString(item?.command, "tool proposal"))}).`);
  const pendingTotal = pendingApprovalLines.length + pendingProposalLines.length;
  let lines = [];
  if (pendingTotal === 1) {
    lines = pendingApprovalLines.length === 1
      ? [pendingApprovalLines[0].replace("Pending approval checkpoint", "Focused approval checkpoint")]
      : [pendingProposalLines[0].replace("Pending tool proposal", "Focused tool proposal")];
  } else {
    lines = [...pendingApprovalLines, ...pendingProposalLines];
  }
  lines = sanitizeLines(lines);
  return lines.length > 0 ? lines : ["No pending approval checkpoints or tool proposals remain."];
}

function runSessionContinuityLines(selectedSummary = {}, selectedSession = {}) {
  const runId = normalizedString(selectedSummary?.runId);
  const lines = sanitizeLines([
    runId ? `Run anchor: ${runId}.` : "",
    normalizedString(selectedSession?.sessionId) || normalizedString(selectedSummary?.sessionStatus)
      ? `Session anchor: ${normalizedString(selectedSession?.sessionId, "-")} (${normalizedString(selectedSummary?.sessionStatus, normalizedString(selectedSession?.status, "-"))}).`
      : "",
    selectedSummary?.route ? `Execution route: ${normalizedString(selectedSummary.route)}` : "",
    selectedSummary?.boundaryProviderId ? `Boundary provider: ${normalizedString(selectedSummary.boundaryProviderId)}` : "",
    selectedSummary?.latestActivity ? `Latest governed activity: ${normalizedString(selectedSummary.latestActivity)}` : "",
    selectedSummary?.latestToolActionId
      ? `Latest tool action anchor: ${normalizedString(selectedSummary.latestToolActionId)} (${normalizedString(selectedSummary.latestToolType, "tool action")} / ${normalizedString(selectedSummary.latestToolStatus, "UNKNOWN")}).`
      : "",
    selectedSummary?.latestEvidenceId
      ? `Latest evidence anchor: ${normalizedString(selectedSummary.latestEvidenceId)}${selectedSummary?.latestEvidenceKind ? ` (${normalizedString(selectedSummary.latestEvidenceKind)})` : ""}.`
      : ""
  ]);
  return lines.length > 0 ? lines : ["Continuity anchors are not fully available yet."];
}

function primaryDecisionDetailLines(selectedSummary = {}, task = {}) {
  const approvals = Array.isArray(selectedSummary?.approvals) ? selectedSummary.approvals : [];
  const proposals = Array.isArray(selectedSummary?.toolProposals) ? selectedSummary.toolProposals : [];
  const pendingApprovals = approvals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING");
  const pendingProposals = proposals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING");
  const decidedApprovals = approvals.filter((item) => normalizedString(item?.status).toUpperCase() && normalizedString(item?.status).toUpperCase() !== "PENDING");
  const decidedProposals = proposals.filter((item) => normalizedString(item?.status).toUpperCase() && normalizedString(item?.status).toUpperCase() !== "PENDING");
  const subject = taskTargetLabel(task);
  if (pendingApprovals.length + pendingProposals.length > 1) {
    return [`Primary decision detail is not unambiguous yet for ${subject}.`];
  }
  if (pendingApprovals.length === 1) {
    return [`Primary decision detail: approval checkpoint ${normalizedString(pendingApprovals[0]?.checkpointId, "approval")} (${normalizedString(pendingApprovals[0]?.scope, "scope-unspecified")}) is the current record for ${subject}.`];
  }
  if (pendingProposals.length === 1) {
    return [`Primary decision detail: tool proposal ${normalizedString(pendingProposals[0]?.proposalId, "proposal")} is the current record for ${subject}.`];
  }
  if (decidedApprovals.length > 0) {
    const latest = decidedApprovals[decidedApprovals.length - 1];
    return [`Primary decision detail: approval checkpoint ${normalizedString(latest?.checkpointId, "approval")} (${normalizedString(latest?.status, "UNKNOWN")}) is the latest resolved record for ${subject}.`];
  }
  if (decidedProposals.length > 0) {
    const latest = decidedProposals[decidedProposals.length - 1];
    return [`Primary decision detail: tool proposal ${normalizedString(latest?.proposalId, "proposal")} (${normalizedString(latest?.status, "UNKNOWN")}) is the latest resolved record for ${subject}.`];
  }
  return [];
}

function approvalProposalLinkageLines(selectedSummary = {}, task = {}) {
  const approvals = Array.isArray(selectedSummary?.approvals) ? selectedSummary.approvals : [];
  const proposals = Array.isArray(selectedSummary?.toolProposals) ? selectedSummary.toolProposals : [];
  const pendingApprovals = approvals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING");
  const decidedApprovals = approvals.filter((item) => normalizedString(item?.status).toUpperCase() && normalizedString(item?.status).toUpperCase() !== "PENDING");
  const pendingProposals = proposals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING");
  const decidedProposals = proposals.filter((item) => normalizedString(item?.status).toUpperCase() && normalizedString(item?.status).toUpperCase() !== "PENDING");
  const lines = sanitizeLines([
    ...primaryDecisionDetailLines(selectedSummary, task),
    pendingApprovals.length > 0
      ? `Pending approval checkpoints: ${pendingApprovals.map((item) => normalizedString(item?.checkpointId, "approval")).join(", ")}`
      : "",
    decidedApprovals.length > 0
      ? `Resolved approvals: ${decidedApprovals.map((item) => `${normalizedString(item?.checkpointId, "approval")} (${normalizedString(item?.status, "UNKNOWN")})`).join(", ")}`
      : "",
    pendingProposals.length > 0
      ? `Pending tool proposals: ${pendingProposals.map((item) => normalizedString(item?.proposalId, "proposal")).join(", ")}`
      : "",
    decidedProposals.length > 0
      ? `Resolved proposals: ${decidedProposals.map((item) => `${normalizedString(item?.proposalId, "proposal")} (${normalizedString(item?.status, "UNKNOWN")})`).join(", ")}`
      : ""
  ]);
  return lines.length > 0 ? lines : ["No approval checkpoints or tool proposals are attached to this session yet."];
}

function auditEvidenceHandoffLines(selectedSummary = {}, selectedSession = {}, task = {}) {
  const sessionId = normalizedString(selectedSession?.sessionId, "-");
  const audit = auditEventLines(selectedSummary);
  const evidence = evidenceLines(selectedSummary);
  const records = Array.isArray(selectedSummary?.evidenceRecords) ? selectedSummary.evidenceRecords : [];
  const latestEvidence = records.length > 0 ? records[records.length - 1] : null;
  const packageTarget = packageTargetLabel(task);
  return [
    latestEvidence
      ? `Primary evidence destination: latest ${normalizedString(latestEvidence?.kind, "evidence").replaceAll("_", " ")} evidence is ready for ${packageTarget}.`
      : `Primary evidence destination is not available yet for ${packageTarget}.`,
    `Suggested escalation target: ${escalationTargetLabel(task)}.`,
    `Suggested package target: ${packageTarget}.`,
    `Audit continuity: ${(Array.isArray(selectedSummary?.events) ? selectedSummary.events.length : 0)} session event(s) captured for ${sessionId}.`,
    ...audit,
    ...(evidence.length > 0 ? evidence : ["No evidence records captured yet."])
  ];
}

function buildAuditEvidenceHandoff(model = {}) {
  const task = model?.task && typeof model.task === "object" ? model.task : {};
  const selectedSession = model?.selectedSession && typeof model.selectedSession === "object" ? model.selectedSession : {};
  const selectedSummary = model?.selectedSummary && typeof model.selectedSummary === "object" ? model.selectedSummary : {};
  const currentDecision = currentDecisionLines(selectedSummary);
  const nextActions = buildNextActionLines(selectedSummary, selectedSession);
  const runContinuity = runSessionContinuityLines(selectedSummary, selectedSession);
  const approvalLinkage = approvalProposalLinkageLines(selectedSummary, task);
  const auditEvidence = auditEvidenceHandoffLines(selectedSummary, selectedSession, task);
  const openApprovals = Number((Array.isArray(selectedSummary?.approvals) ? selectedSummary.approvals : []).filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length || 0);
  const pendingProposals = Number((Array.isArray(selectedSummary?.toolProposals) ? selectedSummary.toolProposals : []).filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length || 0);
  const evidenceCount = Number((Array.isArray(selectedSummary?.evidenceRecords) ? selectedSummary.evidenceRecords : []).length || 0);
  const runId = normalizedString(selectedSummary?.runId);
  const summary = evidenceCount > 0
    ? `${runId ? `Run ${runId}` : `Session ${normalizedString(selectedSession?.sessionId, "-")}`} has ${evidenceCount} evidence record(s) ready for ${packageTargetLabel(task)}.`
    : `${runId ? `Run ${runId}` : `Session ${normalizedString(selectedSession?.sessionId, "-")}`} does not yet have recorded evidence for ${packageTargetLabel(task)}.`;
  const renderedText = [
    "AgentOps Audit and Evidence Handoff",
    `Task: ${normalizedString(task?.title, normalizedString(task?.taskId, "-"))}`,
    `Session: ${normalizedString(selectedSession?.sessionId, "-")}`,
    `Run: ${runId || "-"}`,
    `Task Status: ${normalizedString(selectedSummary?.taskStatus, normalizedString(task?.status, "-"))}`,
    `Session Status: ${normalizedString(selectedSummary?.sessionStatus, normalizedString(selectedSession?.status, "-"))}`,
    `Open Approvals: ${openApprovals}`,
    `Pending Proposals: ${pendingProposals}`,
    `Evidence Records: ${evidenceCount}`,
    "",
    "Current decision:",
    ...currentDecision.map((item) => `- ${item}`),
    "",
    "Run/session continuity:",
    ...runContinuity.map((item) => `- ${item}`),
    "",
    "Approval/proposal linkage:",
    ...approvalLinkage.map((item) => `- ${item}`),
    "",
    "Audit/evidence handoff:",
    ...auditEvidence.map((item) => `- ${item}`),
    "",
    "Next actions:",
    ...nextActions.map((item) => `- ${item}`)
  ].join("\n");
  return {
    header: "Audit and Evidence Handoff",
    summary,
    sessionId: normalizedString(selectedSession?.sessionId),
    taskId: normalizedString(task?.taskId),
    runId,
    openApprovals,
    pendingProposals,
    evidenceCount,
    auditEventCount: Array.isArray(selectedSummary?.events) ? selectedSummary.events.length : 0,
    currentDecisionLines: currentDecision,
    runSessionContinuityLines: runContinuity,
    approvalProposalLinkageLines: approvalLinkage,
    auditEvidenceHandoffLines: auditEvidence,
    nextActionLines: nextActions,
    runContinuityLines: runContinuity,
    approvalLinkageLines: approvalLinkage,
    actionHints: nextActions,
    renderedText
  };
}

module.exports = {
  buildAuditEvidenceHandoff
};
