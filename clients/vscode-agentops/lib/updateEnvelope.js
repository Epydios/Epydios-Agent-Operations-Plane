const { buildOrgAdminArtifactProjection, buildOrgAdminReviewProjection } = require("./reportEnvelope");

function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeEnvelopeLines(items = []) {
  return items
    .map((item) => normalizedString(item))
    .filter(Boolean)
    .map((item) => (item.startsWith("- ") ? item : `- ${item}`));
}

function buildGovernedUpdateEnvelope(model = {}, options = {}) {
  const task = model?.task && typeof model.task === "object" ? model.task : {};
  const selectedSession = model?.selectedSession && typeof model.selectedSession === "object" ? model.selectedSession : {};
  const selectedSummary = model?.selectedSummary && typeof model.selectedSummary === "object" ? model.selectedSummary : {};
  const selectedWorker = selectedSummary?.selectedWorker && typeof selectedSummary.selectedWorker === "object" ? selectedSummary.selectedWorker : {};
  const orgAdminReview = buildOrgAdminReviewProjection(selectedSummary?.approvals || []);
  const orgAdminArtifacts = buildOrgAdminArtifactProjection(selectedSummary?.events || [], selectedSummary?.evidenceRecords || []);
  return {
    header: normalizedString(options.header, "AgentOps governed update"),
    updateType: normalizedString(options.updateType, "status"),
    contextLabel: normalizedString(options.contextLabel, "Thread"),
    contextValue: normalizedString(options.contextValue, normalizedString(task?.taskId, "-")),
    subjectLabel: normalizedString(options.subjectLabel, "Task"),
    subjectValue: normalizedString(options.subjectValue, normalizedString(task?.title, normalizedString(task?.taskId, "-"))),
    taskId: normalizedString(task?.taskId),
    taskStatus: normalizedString(task?.status),
    sessionId: normalizedString(selectedSession?.sessionId),
    sessionStatus: normalizedString(selectedSession?.status),
    workerId: normalizedString(selectedWorker?.workerId),
    workerType: normalizedString(selectedWorker?.workerType),
    workerState: normalizedString(selectedWorker?.status),
    openApprovals: Number(selectedSummary?.approvals?.filter?.((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length || 0),
    pendingProposalCount: Number(selectedSummary?.toolProposals?.filter?.((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length || 0),
    toolActionCount: Number(selectedSummary?.toolActions?.length || 0),
    evidenceCount: Number(selectedSummary?.evidenceRecords?.length || 0),
    summary: normalizedString(options.summary, normalizedString(selectedSummary?.latestWorkerSummary, "Governed thread state refreshed.")),
    orgAdminProfileId: normalizedString(orgAdminReview?.profileId),
    orgAdminProfileLabel: normalizedString(orgAdminReview?.profileLabel),
    orgAdminOrganizationModel: normalizedString(orgAdminReview?.organizationModel),
    orgAdminRoleBundle: normalizedString(orgAdminReview?.roleBundle),
    orgAdminCategories: normalizeEnvelopeLines(orgAdminReview?.categories || []),
    orgAdminDecisionBindings: normalizeEnvelopeLines(orgAdminReview?.bindingLabels || []),
    orgAdminDirectoryMappings: normalizeEnvelopeLines(orgAdminReview?.directoryMappings || []),
    orgAdminExceptionProfiles: normalizeEnvelopeLines(orgAdminReview?.exceptionProfiles || []),
    orgAdminOverlayProfiles: normalizeEnvelopeLines(orgAdminReview?.overlayProfiles || []),
    orgAdminDecisionActorRoles: normalizeEnvelopeLines(orgAdminReview?.decisionActorRoles || []),
    orgAdminDecisionSurfaces: normalizeEnvelopeLines(orgAdminReview?.decisionSurfaces || []),
    orgAdminBoundaryRequirements: normalizeEnvelopeLines(orgAdminReview?.boundaryRequirements || []),
    orgAdminInputKeys: normalizeEnvelopeLines(orgAdminReview?.inputKeys || []),
    orgAdminInputValues: normalizeEnvelopeLines(orgAdminReview?.inputValueLines || []),
    orgAdminPendingReviews: Number(orgAdminReview?.pendingCount || 0),
    orgAdminArtifactEvents: normalizeEnvelopeLines(orgAdminArtifacts?.eventLabels || []),
    orgAdminArtifactEvidence: normalizeEnvelopeLines(orgAdminArtifacts?.evidenceKinds || []),
    orgAdminArtifactRetention: normalizeEnvelopeLines(orgAdminArtifacts?.retentionClasses || []),
    details: normalizeEnvelopeLines([...(options.details || []), ...((orgAdminReview?.details) || []), ...((orgAdminArtifacts?.details) || [])]),
    recent: normalizeEnvelopeLines(options.recent || []),
    actionHints: normalizeEnvelopeLines([...(options.actionHints || []), ...((orgAdminReview?.actionHints) || [])])
  };
}

module.exports = {
  buildGovernedUpdateEnvelope,
  normalizeEnvelopeLines
};
