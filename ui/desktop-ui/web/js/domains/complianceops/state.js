import { displayPolicyProviderLabel } from "../../views/common.js";
import { derivePolicyRichness } from "../policyops/state.js";

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function parseTime(value) {
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickLatest(items = [], fields = ["updatedAt", "createdAt"]) {
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

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeString(item)).filter(Boolean)
    : [];
}

function summarizeTopValues(items = [], key, limit = 4) {
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

function uniqueValues(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => normalizeString(item)).filter(Boolean)));
}

function approvalStatus(item = {}) {
  const status = normalizeString(item?.status).toUpperCase();
  return status || "UNLINKED";
}

function evidenceStatus(run = {}) {
  const raw = normalizeString(
    run?.evidenceBundleResponse?.status || run?.evidenceBundleStatus || run?.evidenceRecordResponse?.status
  ).toLowerCase();
  if (["ready", "recorded", "finalized", "sealed", "exported"].includes(raw)) {
    return "ready";
  }
  if (["collecting", "pending", "queued", "draft"].includes(raw)) {
    return "collecting";
  }
  if (["degraded", "failed", "missing", "expired", "error"].includes(raw)) {
    return "blocked";
  }
  return raw ? "collecting" : "missing";
}

function normalizeRetentionClass(run = {}) {
  const value = normalizeString(
    run?.retentionClass ||
      run?.evidenceBundleResponse?.retentionClass ||
      run?.evidenceRecordResponse?.retentionClass
  ).toLowerCase();
  return value || "standard";
}

function resolveRetentionDefaults(settings = {}) {
  const retention = readObject(readObject(settings?.storage).retentionDays);
  return {
    auditEvents: Number(retention.auditEvents) > 0 ? Number(retention.auditEvents) : 90,
    incidentPackages: Number(retention.incidentPackages) > 0 ? Number(retention.incidentPackages) : 180,
    runSnapshots: Number(retention.runSnapshots) > 0 ? Number(retention.runSnapshots) : 14
  };
}

function collectExceptionProfiles(orgAdminProfiles = {}) {
  const items = Array.isArray(orgAdminProfiles?.items) ? orgAdminProfiles.items : [];
  return items.flatMap((item) => {
    const profiles = Array.isArray(item?.exceptionProfiles) ? item.exceptionProfiles : [];
    return profiles.map((profile) => ({
      label: normalizeString(profile?.label),
      category: normalizeString(profile?.category),
      exceptionMode: normalizeString(profile?.exceptionMode),
      decisionSurfaces: readStringArray(profile?.decisionSurfaces),
      boundaryRequirements: readStringArray(profile?.boundaryRequirements),
      requiredInputs: readStringArray(profile?.requiredInputs)
    }));
  });
}

function collectDesktopExportProfiles(exportProfiles = {}) {
  const items = Array.isArray(exportProfiles?.items) ? exportProfiles.items : [];
  return items
    .filter((item) => readStringArray(item?.clientSurfaces).includes("desktop"))
    .map((item) => ({
      exportProfile: normalizeString(item?.exportProfile),
      label: normalizeString(item?.label),
      defaultAudience: normalizeString(item?.defaultAudience),
      allowedAudiences: readStringArray(item?.allowedAudiences),
      defaultRetentionClass: normalizeString(item?.defaultRetentionClass),
      allowedRetentionClasses: readStringArray(item?.allowedRetentionClasses),
      redactionMode: normalizeString(item?.redactionMode),
      audienceRetentionClassOverlays: readObject(item?.audienceRetentionClassOverlays)
    }));
}

function buildApprovalLookup(approvals = []) {
  const map = new Map();
  for (const approval of Array.isArray(approvals) ? approvals : []) {
    const runId = normalizeString(approval?.runId);
    if (!runId) {
      continue;
    }
    const current = map.get(runId);
    const candidate = approval && typeof approval === "object" ? approval : {};
    const candidateTs = Math.max(
      parseTime(candidate?.reviewedAt),
      parseTime(candidate?.updatedAt),
      parseTime(candidate?.expiresAt),
      parseTime(candidate?.createdAt)
    );
    const currentTs = current
      ? Math.max(
          parseTime(current?.reviewedAt),
          parseTime(current?.updatedAt),
          parseTime(current?.expiresAt),
          parseTime(current?.createdAt)
        )
      : 0;
    if (!current || candidateTs >= currentTs) {
      map.set(runId, candidate);
    }
  }
  return map;
}

function coverageStatus(item = {}) {
  const decision = normalizeString(item?.decision).toUpperCase();
  const approval = normalizeString(item?.approvalStatus).toUpperCase();
  const proof = normalizeString(item?.evidenceStatus).toLowerCase();
  if (decision === "DENY" || approval === "DENIED" || approval === "EXPIRED" || proof === "blocked") {
    return "blocked";
  }
  if (
    decision === "ALLOW" &&
    proof === "ready" &&
    (!item?.approvalRequired || approval === "APPROVED" || approval === "UNLINKED")
  ) {
    return "covered";
  }
  if (
    decision ||
    proof !== "missing" ||
    item?.requiredGrantCount > 0 ||
    item?.approvalRequired ||
    approval !== "UNLINKED"
  ) {
    return "partial";
  }
  return "missing";
}

function coverageTone(records = []) {
  const values = Array.isArray(records) ? records : [];
  if (values.some((item) => item?.coverageStatus === "blocked")) {
    return "warn";
  }
  if (values.some((item) => item?.coverageStatus === "covered")) {
    return "ok";
  }
  return "neutral";
}

function obligationTone(records = []) {
  const values = Array.isArray(records) ? records : [];
  if (values.some((item) => item?.approvalStatus === "PENDING" || item?.requiredGrantCount > 0)) {
    return "warn";
  }
  if (values.length > 0) {
    return "ok";
  }
  return "neutral";
}

function attestationTone(summary = {}) {
  if (summary?.blockedCount > 0 || summary?.pipelineStatus === "error" || summary?.aimxsState === "error") {
    return "warn";
  }
  if (summary?.readyCount > 0) {
    return "ok";
  }
  return "neutral";
}

function gapTone(summary = {}) {
  if ((summary?.gapCount || 0) > 0 || (summary?.exceptionProfileCount || 0) > 0) {
    return "warn";
  }
  if ((summary?.totalCount || 0) > 0) {
    return "ok";
  }
  return "neutral";
}

function retentionTone(summary = {}) {
  if ((summary?.residencyExceptionCount || 0) > 0 || (summary?.legalHoldExceptionCount || 0) > 0) {
    return "warn";
  }
  if ((summary?.exportProfileCount || 0) > 0 || (summary?.archiveCount || 0) > 0) {
    return "ok";
  }
  return "neutral";
}

function summarizeControlRecord(run = {}, approvalsByRunId) {
  const richness = derivePolicyRichness(run);
  const runId = normalizeString(run?.runId);
  const approval = approvalsByRunId.get(runId) || {};
  const approvalStatusValue = approvalStatus(approval);
  const decision = normalizeString(
    richness?.decision || run?.policyDecision || run?.policyResponse?.decision
  ).toUpperCase();
  const record = {
    runId,
    scope: `${normalizeString(run?.tenantId, "-")}/${normalizeString(run?.projectId, "-")}`,
    tenantId: normalizeString(run?.tenantId),
    projectId: normalizeString(run?.projectId),
    boundaryClass: normalizeString(richness?.boundaryClass, "unclassified"),
    riskTier: normalizeString(richness?.riskTier, "unspecified"),
    evidenceReadiness: normalizeString(richness?.evidenceReadiness, "unspecified"),
    requiredGrants: readStringArray(richness?.requiredGrants),
    requiredGrantCount: readStringArray(richness?.requiredGrants).length,
    approvalRequired: richness?.operatorApprovalRequired === true,
    approvalStatus: approvalStatusValue,
    approvalId: normalizeString(approval?.approvalId),
    evidenceStatus: evidenceStatus(run),
    evidenceBundleId: normalizeString(run?.evidenceBundleResponse?.bundleId),
    retentionClass: normalizeRetentionClass(run),
    decision,
    providerId: displayPolicyProviderLabel(richness?.providerId || run?.selectedPolicyProvider),
    contractId: normalizeString(richness?.contractId),
    requestLabel: normalizeString(richness?.requestLabel),
    updatedAt: normalizeString(run?.updatedAt, normalizeString(run?.createdAt))
  };
  record.coverageStatus = coverageStatus(record);
  return record;
}

export function createComplianceWorkspaceSnapshot(context = {}) {
  const settings = readObject(context?.settings);
  const runs = Array.isArray(context?.runs?.items) ? context.runs.items : [];
  const approvals = Array.isArray(context?.approvals?.items) ? context.approvals.items : [];
  const auditItems = Array.isArray(context?.audit?.items) ? context.audit.items : [];
  const health = readObject(context?.health);
  const pipeline = readObject(context?.pipeline);
  const aimxsActivation = readObject(context?.aimxsActivation);
  const exportProfiles = readObject(context?.exportProfiles);
  const orgAdminProfiles = readObject(context?.orgAdminProfiles);
  const retentionDefaults = resolveRetentionDefaults(settings);
  const approvalsByRunId = buildApprovalLookup(approvals);
  const controlRecords = runs
    .map((run) => summarizeControlRecord(run, approvalsByRunId))
    .filter((item) => item.runId || item.boundaryClass !== "unclassified" || item.decision);
  const desktopExportProfiles = collectDesktopExportProfiles(exportProfiles);
  const exceptionProfiles = collectExceptionProfiles(orgAdminProfiles);

  const latestControl = pickLatest(controlRecords, ["updatedAt"]);
  const coveredCount = controlRecords.filter((item) => item.coverageStatus === "covered").length;
  const partialCount = controlRecords.filter((item) => item.coverageStatus === "partial").length;
  const blockedCount = controlRecords.filter((item) => item.coverageStatus === "blocked").length;
  const missingCount = controlRecords.filter((item) => item.coverageStatus === "missing").length;
  const grantScopedCount = controlRecords.filter((item) => item.requiredGrantCount > 0).length;
  const approvalScopedCount = controlRecords.filter(
    (item) => item.approvalRequired || item.approvalStatus !== "UNLINKED"
  ).length;
  const pendingApprovalCount = controlRecords.filter((item) => item.approvalStatus === "PENDING").length;
  const evidenceLinkedCount = controlRecords.filter((item) => item.evidenceStatus === "ready").length;
  const archivedCount = controlRecords.filter((item) => item.retentionClass === "archive").length;
  const shortCount = controlRecords.filter((item) => item.retentionClass === "short").length;
  const standardCount = controlRecords.filter((item) => item.retentionClass === "standard").length;
  const latestAuditItem = pickLatest(auditItems, ["ts", "updatedAt", "createdAt"]);
  const auditEventCount = auditItems.length;
  const approvalApprovedCount = approvals.filter((item) => approvalStatus(item) === "APPROVED").length;
  const gapCount = partialCount + blockedCount + missingCount;
  const latestGap =
    pickLatest(
      controlRecords.filter((item) => item.coverageStatus !== "covered"),
      ["updatedAt"]
    ) || {};
  const latestException = exceptionProfiles[0] || {};
  const exceptionCategories = uniqueValues(exceptionProfiles.map((item) => item.category));
  const decisionSurfaces = uniqueValues(exceptionProfiles.flatMap((item) => item.decisionSurfaces));
  const boundaryRequirements = uniqueValues(exceptionProfiles.flatMap((item) => item.boundaryRequirements));
  const requiredInputs = uniqueValues(exceptionProfiles.flatMap((item) => item.requiredInputs));
  const allowedAudiences = uniqueValues(desktopExportProfiles.flatMap((item) => item.allowedAudiences));
  const redactionModes = uniqueValues(desktopExportProfiles.map((item) => item.redactionMode));
  const firstDesktopExportProfile = desktopExportProfiles[0] || {};
  const archiveOverlayCount = desktopExportProfiles.reduce((count, item) => {
    return (
      count +
      Object.values(readObject(item?.audienceRetentionClassOverlays)).filter(
        (value) => normalizeString(value).toLowerCase() === "archive"
      ).length
    );
  }, 0);
  const residencyExceptionCount = exceptionProfiles.filter((item) => item.category === "residency").length;
  const legalHoldExceptionCount = exceptionProfiles.filter((item) => item.category === "legal_hold").length;

  return {
    controlCoverageBoard: {
      totalCount: controlRecords.length,
      coveredCount,
      partialCount,
      blockedCount,
      missingCount,
      boundaryCount: uniqueCount(controlRecords, "boundaryClass"),
      riskTierCount: uniqueCount(controlRecords, "riskTier"),
      latestControl,
      topBoundaries: summarizeTopValues(controlRecords, "boundaryClass"),
      topRiskTiers: summarizeTopValues(controlRecords, "riskTier"),
      evidenceLinkedCount,
      approvalScopedCount,
      tone: coverageTone(controlRecords)
    },
    obligationBoard: {
      totalCount: controlRecords.length,
      grantScopedCount,
      approvalScopedCount,
      pendingApprovalCount,
      evidenceLinkedCount,
      archivedCount,
      latestControl,
      topGrants: summarizeTopValues(
        controlRecords.flatMap((item) =>
          item.requiredGrants.map((grant) => ({
            grant
          }))
        ),
        "grant"
      ),
      retentionDefaults,
      tone: obligationTone(controlRecords)
    },
    attestationBoard: {
      candidateCount: controlRecords.length,
      readyCount: coveredCount,
      partialCount,
      blockedCount,
      approvalApprovedCount,
      auditEventCount,
      evidenceLinkedCount,
      latestControl,
      latestAudit: {
        event: normalizeString(latestAuditItem?.event, "-"),
        ts: normalizeString(latestAuditItem?.ts, "-")
      },
      environment: normalizeString(pipeline?.environment, "local"),
      pipelineStatus: normalizeString(pipeline?.status, "unknown"),
      latestStagingGate: normalizeString(pipeline?.latestStagingGate, "-"),
      latestProdGate: normalizeString(pipeline?.latestProdGate, "-"),
      runtimeStatus: normalizeString(health?.runtime?.status, "unknown"),
      providersStatus: normalizeString(health?.providers?.status, "unknown"),
      policyStatus: normalizeString(health?.policy?.status, "unknown"),
      aimxsState: normalizeString(aimxsActivation?.state, normalizeString(settings?.aimxs?.mode, "unknown")),
      activeMode: normalizeString(aimxsActivation?.activeMode, normalizeString(settings?.aimxs?.mode, "unknown")),
      selectedProviderId: displayPolicyProviderLabel(
        aimxsActivation?.selectedProviderId || settings?.aimxs?.activation?.selectedProviderId
      ),
      tone: attestationTone({
        blockedCount,
        readyCount: coveredCount,
        pipelineStatus: normalizeString(pipeline?.status, "unknown").toLowerCase(),
        aimxsState: normalizeString(aimxsActivation?.state, normalizeString(settings?.aimxs?.mode, "unknown")).toLowerCase()
      })
    },
    gapExceptionBoard: {
      totalCount: controlRecords.length,
      gapCount,
      blockedCount,
      partialCount,
      missingCount,
      pendingApprovalCount,
      latestGap,
      exceptionProfileCount: exceptionProfiles.length,
      exceptionCategoryCount: exceptionCategories.length,
      latestException,
      decisionSurfaceCount: decisionSurfaces.length,
      firstDecisionSurface: decisionSurfaces[0] || "-",
      boundaryRequirementCount: boundaryRequirements.length,
      firstBoundaryRequirement: boundaryRequirements[0] || "-",
      requiredInputCount: requiredInputs.length,
      firstRequiredInput: requiredInputs[0] || "-",
      tone: gapTone({
        totalCount: controlRecords.length,
        gapCount,
        exceptionProfileCount: exceptionProfiles.length
      })
    },
    retentionDisclosureBoard: {
      archiveCount: archivedCount,
      standardCount,
      shortCount,
      latestControl,
      retentionDefaults,
      exportProfileCount: desktopExportProfiles.length,
      allowedAudienceCount: allowedAudiences.length,
      allowedAudiences,
      firstAudience: firstDesktopExportProfile.defaultAudience || allowedAudiences[0] || "-",
      firstProfileLabel: firstDesktopExportProfile.label || "-",
      firstRedactionMode: firstDesktopExportProfile.redactionMode || redactionModes[0] || "-",
      archiveOverlayCount,
      residencyExceptionCount,
      legalHoldExceptionCount,
      firstDecisionSurface: decisionSurfaces[0] || "-",
      firstBoundaryRequirement: boundaryRequirements[0] || "-",
      tone: retentionTone({
        exportProfileCount: desktopExportProfiles.length,
        archiveCount: archivedCount,
        residencyExceptionCount,
        legalHoldExceptionCount
      })
    }
  };
}
