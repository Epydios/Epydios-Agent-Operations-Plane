import { createAimxsLegibilityModel } from "../../shared/aimxs/legibility.js";

const WORKSPACE_ARTIFACT_ROOTS = {
  repoProvenance: "EPYDIOS_AGENTOPS_DESKTOP_REPO/provenance/",
  nonRepoProvenance: ".epydios/provenance/",
  nonRepoReadiness: ".epydios/internal-readiness/"
};

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function parseTime(value) {
  const ts = new Date(value || "").getTime();
  return Number.isFinite(ts) ? ts : 0;
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

function safePathSegment(value, fallback = "item") {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized || fallback;
}

function scopeLabel(tenantId, projectId) {
  const tenant = normalizeString(tenantId);
  const project = normalizeString(projectId);
  if (tenant && project) {
    return `${tenant}/${project}`;
  }
  return tenant || project || "-";
}

function deriveDateBucket(value) {
  const timestamp = normalizeString(value);
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10).replaceAll("-", "");
}

function normalizeBundleStatusCategory(status) {
  const normalized = normalizeString(status).toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (["sealed", "exported"].includes(normalized)) {
    return "sealed";
  }
  if (["ready", "finalized", "recorded"].includes(normalized)) {
    return "ready";
  }
  if (["degraded", "failed", "missing", "expired", "error"].includes(normalized)) {
    return "degraded";
  }
  if (["pending", "queued", "collecting", "draft"].includes(normalized)) {
    return "collecting";
  }
  return "unknown";
}

function bundleTone(entries = []) {
  if ((Array.isArray(entries) ? entries : []).some((entry) => entry?.statusCategory === "degraded")) {
    return "warn";
  }
  if ((Array.isArray(entries) ? entries : []).length > 0) {
    return "ok";
  }
  return "neutral";
}

function readObject(value) {
  return value && typeof value === "object" ? value : {};
}

function readStringArray(value) {
  return (Array.isArray(value) ? value : []).map((item) => normalizeString(item)).filter(Boolean);
}

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveRetentionDefaults(settings = {}) {
  const storage = readObject(settings?.storage);
  const retention = readObject(storage?.retentionDays);
  return {
    auditEvents: toPositiveNumber(retention.auditEvents, 90),
    incidentPackages: toPositiveNumber(retention.incidentPackages, 180),
    terminalHistory: toPositiveNumber(retention.terminalHistory, 30),
    runSnapshots: toPositiveNumber(retention.runSnapshots, 14)
  };
}

function normalizeRetentionClass(value) {
  const normalized = normalizeString(value).toLowerCase();
  return normalized || "unset";
}

function normalizeDecision(value) {
  const normalized = normalizeString(value).toUpperCase();
  return normalized || "UNSPECIFIED";
}

function controlTone(entries = []) {
  const values = Array.isArray(entries) ? entries : [];
  if (values.length === 0) {
    return "neutral";
  }
  if (values.some((entry) => ["DENY", "DEFER"].includes(normalizeDecision(entry?.decision)))) {
    return "warn";
  }
  return "ok";
}

function normalizeAdminTraceItem(item = {}) {
  const current = item && typeof item === "object" ? item : {};
  const decision = readObject(current?.decision);
  const execution = readObject(current?.execution);
  const receipt = readObject(current?.receipt);
  const rollback = readObject(current?.rollback);
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
    simulatedAt: normalizeString(current?.simulatedAt),
    decision: {
      decisionId: normalizeString(decision?.decisionId),
      status: normalizeString(decision?.status).toLowerCase(),
      approvalReceiptId: normalizeString(decision?.approvalReceiptId),
      decidedAt: normalizeString(decision?.decidedAt)
    },
    execution: {
      executionId: normalizeString(execution?.executionId),
      executedAt: normalizeString(execution?.executedAt),
      status: normalizeString(execution?.status).toLowerCase()
    },
    receipt: {
      receiptId: normalizeString(receipt?.receiptId),
      issuedAt: normalizeString(receipt?.issuedAt),
      stableRef: normalizeString(receipt?.stableRef),
      executionId: normalizeString(receipt?.executionId)
    },
    recovery: {
      recoveryId: normalizeString(rollback?.rollbackId),
      action: normalizeString(rollback?.action),
      status: normalizeString(rollback?.status).toLowerCase(),
      recordedAt: normalizeString(rollback?.rolledBackAt),
      stableRef: normalizeString(rollback?.stableRef)
    },
    updatedAt: normalizeString(current?.updatedAt),
    createdAt: normalizeString(current?.createdAt)
  };
}

function adminTraceTone(items = [], latest = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return "neutral";
  }
  if (normalizeString(latest?.recovery?.recoveryId)) {
    return "ok";
  }
  if (normalizeString(latest?.receipt?.receiptId)) {
    return "ok";
  }
  return "warn";
}

function desktopEvidenceStage(run, key, kind, label) {
  const payload = run?.[key];
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const evidence = payload.evidenceBundle || {};
  const windowMetadata = evidence.windowMetadata || {};
  const screenshotHash = normalizeString(evidence.screenshotHash);
  const screenshotUri = normalizeString(evidence.screenshotUri);
  const resultCode = normalizeString(evidence.resultCode);
  const verifierId = normalizeString(payload.verifierId);
  if (!screenshotHash && !screenshotUri && !resultCode && !verifierId) {
    return null;
  }
  const runId = normalizeString(run?.runId, "run");
  return {
    artifactId: `${runId}:${kind}`,
    kind,
    label,
    uri: screenshotUri,
    hash: screenshotHash,
    resultCode,
    verifierId,
    windowTitle: normalizeString(windowMetadata.title),
    runId,
    tenantId: normalizeString(run?.tenantId),
    projectId: normalizeString(run?.projectId),
    scope: scopeLabel(run?.tenantId, run?.projectId),
    createdAt: normalizeString(run?.updatedAt, normalizeString(run?.createdAt)),
    source: "runtime_stage",
    retentionClass: normalizeString(run?.retentionClass)
  };
}

function collectRunArtifacts(run = {}) {
  const artifacts = [];
  const runId = normalizeString(run?.runId);
  const runCreatedAt = normalizeString(run?.updatedAt, normalizeString(run?.createdAt));
  const recordResponse =
    run?.evidenceRecordResponse && typeof run.evidenceRecordResponse === "object"
      ? run.evidenceRecordResponse
      : {};
  const recordId = normalizeString(recordResponse?.evidenceId);
  const recordStatus = normalizeString(recordResponse?.status, normalizeString(run?.evidenceRecordStatus));
  if (recordId || recordStatus) {
    artifacts.push({
      artifactId: recordId || `${runId}:record`,
      kind: "evidence_record",
      label: "Evidence Record",
      uri: normalizeString(recordResponse?.uri),
      hash: normalizeString(recordResponse?.hash),
      resultCode: recordStatus,
      verifierId: "",
      windowTitle: "",
      runId,
      tenantId: normalizeString(run?.tenantId),
      projectId: normalizeString(run?.projectId),
      scope: scopeLabel(run?.tenantId, run?.projectId),
      createdAt: runCreatedAt,
      source: "run_record",
      retentionClass: normalizeString(recordResponse?.retentionClass, normalizeString(run?.retentionClass))
    });
  }

  const stageArtifacts = [
    desktopEvidenceStage(run, "desktopObserveResponse", "observe_capture", "Observe"),
    desktopEvidenceStage(run, "desktopActuateResponse", "actuate_capture", "Actuate"),
    desktopEvidenceStage(run, "desktopVerifyResponse", "verify_capture", "Verify")
  ].filter(Boolean);

  return [...artifacts, ...stageArtifacts];
}

function collectThreadArtifacts(thread = {}) {
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const taskId = normalizeString(thread?.taskId);
  return turns.flatMap((turn) => {
    const sessionView = turn?.sessionView && typeof turn.sessionView === "object" ? turn.sessionView : {};
    const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
    const evidenceRecords = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
    const session = timeline?.session && typeof timeline.session === "object" ? timeline.session : {};
    const createdAt = normalizeString(
      turn?.response?.completedAt,
      normalizeString(session?.updatedAt, normalizeString(session?.createdAt))
    );
    return evidenceRecords.map((record) => {
      const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
      return {
        artifactId: normalizeString(record?.evidenceId),
        kind: normalizeString(record?.kind, "thread_evidence"),
        label: normalizeString(record?.kind, "Evidence"),
        uri: normalizeString(record?.uri),
        hash: normalizeString(metadata?.screenshotHash),
        resultCode: normalizeString(metadata?.resultCode, normalizeString(metadata?.policyDecision)),
        verifierId: "",
        windowTitle: normalizeString(metadata?.windowTitle),
        runId: normalizeString(metadata?.runId),
        tenantId: normalizeString(record?.tenantId, normalizeString(thread?.tenantId)),
        projectId: normalizeString(record?.projectId, normalizeString(thread?.projectId)),
        scope: scopeLabel(record?.tenantId || thread?.tenantId, record?.projectId || thread?.projectId),
        createdAt: normalizeString(record?.createdAt, createdAt),
        source: "thread_evidence",
        retentionClass: normalizeString(record?.retentionClass, normalizeString(metadata?.retentionClass)),
        taskId,
        sessionId: normalizeString(record?.sessionId),
        toolActionId: normalizeString(record?.toolActionId),
        policyDecision: normalizeString(metadata?.policyDecision)
      };
    });
  });
}

function normalizeIncidentPackage(entry = {}) {
  const current = entry && typeof entry === "object" ? entry : {};
  return {
    id: normalizeString(current?.id),
    packageId: normalizeString(current?.packageId),
    generatedAt: normalizeString(current?.generatedAt, normalizeString(current?.createdAt)),
    filingUpdatedAt: normalizeString(current?.filingUpdatedAt, normalizeString(current?.generatedAt, normalizeString(current?.createdAt))),
    filingStatus: normalizeString(current?.filingStatus, "drafted").toLowerCase(),
    scope: normalizeString(current?.scope, scopeLabel(current?.tenantId, current?.projectId)),
    auditSource: normalizeString(current?.auditSource),
    runId: normalizeString(current?.runId),
    approvalStatus: normalizeString(current?.approvalStatus).toUpperCase(),
    auditMatchedCount: Number(current?.auditMatchedCount || 0),
    retentionClass: normalizeString(current?.retentionClass),
    fileName: normalizeString(current?.fileName),
    handoffText: normalizeString(current?.handoffText)
  };
}

function buildArtifactAccessEntries(latestArtifact = {}, latestIncidentPackage = {}, allArtifacts = []) {
  const latestRunId = normalizeString(latestArtifact?.runId);
  const dateBucket = deriveDateBucket(latestArtifact?.createdAt || latestIncidentPackage?.generatedAt);
  const runFolderToken = safePathSegment(latestRunId, "run-id");
  const entries = [
    {
      label: "Repo provenance root",
      path: WORKSPACE_ARTIFACT_ROOTS.repoProvenance,
      note: "Git-tracked provenance and repo-safe artifacts."
    },
    {
      label: "Non-repo provenance root",
      path: WORKSPACE_ARTIFACT_ROOTS.nonRepoProvenance,
      note: "Large governed evidence bundles and host-visible proof artifacts."
    },
    {
      label: "Non-repo readiness root",
      path: WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness,
      note: "Screenshots, manual QA, smoke evidence, and local operator artifacts."
    }
  ];

  if (dateBucket) {
    entries.push({
      label: "Suggested date bucket",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}history/${dateBucket}/`,
      note: "Recommended next folder for new evidence notes, screenshots, or bundle exports."
    });
    entries.push({
      label: "Suggested run folder",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}history/${dateBucket}/${runFolderToken}/`,
      note: "Recommended home for run-specific notes, JSON exports, and operator evidence."
    });
  }

  const latestUriArtifact = pickLatest(
    (Array.isArray(allArtifacts) ? allArtifacts : []).filter((item) => normalizeString(item?.uri)),
    ["createdAt"]
  );
  if (normalizeString(latestUriArtifact?.uri)) {
    entries.push({
      label: "Latest artifact URI",
      path: normalizeString(latestUriArtifact.uri),
      note: `Most recent reachable artifact reference from ${normalizeString(latestUriArtifact.source, "evidence")}.`
    });
  }
  if (normalizeString(latestIncidentPackage?.fileName)) {
    entries.push({
      label: "Latest incident package",
      path: normalizeString(latestIncidentPackage.fileName),
      note: "Most recent bounded incident package file linked to current proof material."
    });
  }
  return entries;
}

export function createEvidenceWorkspaceSnapshot(context = {}) {
  const settings = readObject(context?.settings);
  const viewState = readObject(context?.viewState);
  const runs = Array.isArray(context?.runs?.items) ? context.runs.items : [];
  const approvals = Array.isArray(context?.approvals?.items) ? context.approvals.items : [];
  const audit = context?.audit && typeof context.audit === "object" ? context.audit : {};
  const thread = context?.thread && typeof context.thread === "object" ? context.thread : {};
  const retentionDefaults = resolveRetentionDefaults(settings);
  const incidentPackages = (Array.isArray(context?.incidentHistory?.items) ? context.incidentHistory.items : [])
    .map((item) => normalizeIncidentPackage(item))
    .filter((item) => item.id || item.packageId);
  const adminTraceItems = (Array.isArray(context?.adminQueueItems) ? context.adminQueueItems : [])
    .map((item) => normalizeAdminTraceItem(item))
    .filter((item) => item.id);

  const approvalsByRunId = new Map(
    approvals
      .map((approval) => [
        normalizeString(approval?.runId),
        {
          approvalId: normalizeString(approval?.approvalId),
          status: normalizeString(approval?.status).toUpperCase()
        }
      ])
      .filter(([runId]) => runId)
  );

  const runArtifactsByRunId = new Map();
  const runArtifacts = [];
  for (const run of runs) {
    const artifacts = collectRunArtifacts(run);
    const runId = normalizeString(run?.runId);
    runArtifactsByRunId.set(runId, artifacts);
    runArtifacts.push(...artifacts);
  }

  const bundleEntries = runs
    .map((run) => {
      const runId = normalizeString(run?.runId);
      const response =
        run?.evidenceBundleResponse && typeof run.evidenceBundleResponse === "object"
          ? run.evidenceBundleResponse
          : {};
      const runArtifactsForRun = runArtifactsByRunId.get(runId) || [];
      const rawStatus = normalizeString(
        response?.status,
        normalizeString(run?.evidenceBundleStatus, runArtifactsForRun.length > 0 ? "collecting" : "")
      );
      const bundleId = normalizeString(response?.bundleId, runId ? `bundle:${runId}` : "");
      if (!rawStatus && !bundleId) {
        return null;
      }
      const approval = approvalsByRunId.get(runId) || {};
      const screenshotCount = runArtifactsForRun.filter((item) => item?.hash || item?.uri).length;
      return {
        bundleId,
        rawStatus,
        statusCategory: normalizeBundleStatusCategory(rawStatus),
        runId,
        tenantId: normalizeString(run?.tenantId),
        projectId: normalizeString(run?.projectId),
        scope: scopeLabel(run?.tenantId, run?.projectId),
        evidenceProvider: normalizeString(run?.selectedEvidenceProvider),
        desktopProvider: normalizeString(run?.selectedDesktopProvider),
        retentionClass: normalizeString(response?.retentionClass, normalizeString(run?.retentionClass)),
        approvalId: normalizeString(approval?.approvalId),
        approvalStatus: normalizeString(approval?.status),
        artifactCount: runArtifactsForRun.length,
        screenshotCount,
        createdAt: normalizeString(run?.createdAt),
        updatedAt: normalizeString(run?.updatedAt, normalizeString(run?.createdAt))
      };
    })
    .filter(Boolean);

  const threadArtifacts = collectThreadArtifacts(thread);
  const allArtifacts = [...runArtifacts, ...threadArtifacts];
  const latestBundle = pickLatest(bundleEntries, ["updatedAt", "createdAt"]);
  const latestArtifact = pickLatest(allArtifacts, ["createdAt", "updatedAt"]);
  const latestAdminTrace = pickLatest(adminTraceItems, [
    "updatedAt",
    "recovery.recordedAt",
    "receipt.issuedAt",
    "execution.executedAt",
    "decision.decidedAt",
    "simulatedAt",
    "createdAt"
  ]);
  const latestIncidentPackage = normalizeIncidentPackage(
    pickLatest(incidentPackages, ["generatedAt", "filingUpdatedAt"])
  );
  const topScopes = summarizeTopValues(bundleEntries, "scope");
  const artifactKinds = summarizeTopValues(allArtifacts, "kind");
  const retentionSignals = [
    ...bundleEntries.map((entry) => ({
      retentionClass: normalizeRetentionClass(entry?.retentionClass),
      source: "bundle"
    })),
    ...allArtifacts.map((entry) => ({
      retentionClass: normalizeRetentionClass(entry?.retentionClass),
      source: normalizeString(entry?.source, "artifact")
    })),
    ...incidentPackages.map((entry) => ({
      retentionClass: normalizeRetentionClass(entry?.retentionClass),
      source: "incident_package"
    }))
  ];
  const topRetentionClasses = summarizeTopValues(retentionSignals, "retentionClass");
  const unsetRetentionCount = retentionSignals.filter((entry) => entry.retentionClass === "unset").length;
  const queueCounts = incidentPackages.reduce(
    (counts, entry) => {
      const key = normalizeString(entry?.filingStatus, "drafted").toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    },
    { drafted: 0, filed: 0, closed: 0 }
  );
  const controlMappings = runs
    .map((run) => {
      const runId = normalizeString(run?.runId);
      const requestPayload = readObject(run?.requestPayload);
      const requestContext = readObject(requestPayload?.context);
      const requestPolicy = readObject(requestContext?.review_signals || requestContext?.policy_stratification);
      const policyResponse = readObject(run?.policyResponse);
      const policyOutput = readObject(policyResponse?.output);
      const providerOutput = readObject(policyOutput?.premiumProvider || policyOutput?.providerRoute || policyOutput?.aimxs);
      const providerMeta = readObject(providerOutput?.providerMeta);
      const providerPolicy = readObject(providerMeta?.review_signals || providerMeta?.policy_stratification);
      const approval = approvalsByRunId.get(runId) || {};
      const decision = normalizeDecision(policyResponse?.decision || run?.policyDecision);
      const boundaryClass = normalizeString(
        requestPolicy?.boundary_class,
        normalizeString(providerPolicy?.boundary_class)
      );
      const riskTier = normalizeString(
        requestPolicy?.review_tier,
        normalizeString(requestPolicy?.risk_tier, normalizeString(providerPolicy?.review_tier, normalizeString(providerPolicy?.risk_tier)))
      );
      const evidenceReadiness = normalizeString(
        requestPolicy?.readiness_state,
        normalizeString(requestPolicy?.evidence_readiness, normalizeString(providerPolicy?.readiness_state, normalizeString(providerPolicy?.evidence_readiness)))
      );
      const requiredGrantCount = readStringArray(requestPolicy?.required_reviews || requestPolicy?.required_grants).length;
      const evidenceRefs = readStringArray(policyResponse?.evidenceRefs);
      const providerId = normalizeString(
        providerOutput?.providerId,
        normalizeString(policyResponse?.source, normalizeString(run?.selectedPolicyProvider))
      );
      const bundleId = normalizeString(run?.evidenceBundleResponse?.bundleId);
      if (
        !runId &&
        !boundaryClass &&
        !riskTier &&
        !evidenceReadiness &&
        !bundleId &&
        evidenceRefs.length === 0 &&
        decision === "UNSPECIFIED"
      ) {
        return null;
      }
      return {
        runId,
        bundleId,
        approvalId: normalizeString(approval?.approvalId),
        scope: scopeLabel(run?.tenantId, run?.projectId),
        boundaryClass,
        riskTier,
        evidenceReadiness,
        requiredGrantCount,
        evidenceRefCount: evidenceRefs.length,
        providerId,
        decision,
        createdAt: normalizeString(run?.createdAt),
        updatedAt: normalizeString(run?.updatedAt, normalizeString(run?.createdAt))
      };
    })
    .filter(Boolean);
  const latestControlMapping = pickLatest(controlMappings, ["updatedAt", "createdAt"]);
  const controlClassMix = summarizeTopValues(controlMappings, "boundaryClass");
  const controlDecisionMix = summarizeTopValues(controlMappings, "decision");
  const controlReadinessMix = summarizeTopValues(controlMappings, "evidenceReadiness");
  const bundleCount = bundleEntries.length;
  const readyCount = bundleEntries.filter((entry) => entry.statusCategory === "ready").length;
  const sealedCount = bundleEntries.filter((entry) => entry.statusCategory === "sealed").length;
  const degradedCount = bundleEntries.filter((entry) => entry.statusCategory === "degraded").length;
  const collectingCount = bundleEntries.filter((entry) => entry.statusCategory === "collecting").length;
  const directUriCount = allArtifacts.filter((item) => normalizeString(item?.uri)).length;
  const hashedCount = allArtifacts.filter((item) => normalizeString(item?.hash)).length;
  const boundedCausalReferenceCount =
    allArtifacts.filter((item) => normalizeString(item?.runId) || normalizeString(item?.policyDecision)).length +
    incidentPackages.filter((item) => Number(item?.auditMatchedCount || 0) > 0).length;
  const accessEntries = buildArtifactAccessEntries(latestArtifact, latestIncidentPackage, allArtifacts);
  const feedbackMessage = normalizeString(viewState?.feedback?.message);
  const suggestedRunFolderPath =
    accessEntries.find((entry) => normalizeString(entry?.label).toLowerCase() === "suggested run folder")?.path || "";
  const adminOwnerMix = summarizeTopValues(adminTraceItems, "ownerDomain");

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
    evidenceBundleBoard: {
      bundleCount,
      readyCount,
      sealedCount,
      degradedCount,
      collectingCount,
      linkedApprovalCount: bundleEntries.filter((entry) => entry.approvalId).length,
      linkedIncidentCount: incidentPackages.length,
      auditSource: normalizeString(audit?.source, "not-loaded"),
      auditMatchedCount: Array.isArray(audit?.items) ? audit.items.length : 0,
      topScopes,
      latestBundle: {
        bundleId: normalizeString(latestBundle?.bundleId),
        runId: normalizeString(latestBundle?.runId),
        status: normalizeString(latestBundle?.rawStatus),
        scope: normalizeString(latestBundle?.scope),
        evidenceProvider: normalizeString(latestBundle?.evidenceProvider),
        retentionClass: normalizeString(latestBundle?.retentionClass),
        approvalId: normalizeString(latestBundle?.approvalId),
        updatedAt: normalizeString(latestBundle?.updatedAt)
      },
      latestIncidentPackage: {
        packageId: normalizeString(latestIncidentPackage?.packageId),
        filingStatus: normalizeString(latestIncidentPackage?.filingStatus),
        fileName: normalizeString(latestIncidentPackage?.fileName)
      },
      artifactCount: allArtifacts.length,
      screenshotCount: runArtifacts.filter((item) => normalizeString(item?.uri) || normalizeString(item?.hash)).length,
      canExportReview: bundleCount > 0,
      canOpenRun: Boolean(normalizeString(latestBundle?.runId)),
      canOpenIncidentOps: incidentPackages.length > 0,
      tone: bundleTone(bundleEntries)
    },
    provenanceBoard: {
      artifactCount: allArtifacts.length,
      hashedCount,
      directUriCount,
      threadArtifactCount: threadArtifacts.length,
      incidentPackageCount: incidentPackages.length,
      taskId: normalizeString(thread?.taskId),
      auditSource: normalizeString(audit?.source, "not-loaded"),
      bundleId: normalizeString(latestBundle?.bundleId),
      latestArtifact: {
        artifactId: normalizeString(latestArtifact?.artifactId),
        kind: normalizeString(latestArtifact?.kind),
        hash: normalizeString(latestArtifact?.hash),
        uri: normalizeString(latestArtifact?.uri),
        source: normalizeString(latestArtifact?.source),
        sessionId: normalizeString(latestArtifact?.sessionId),
        runId: normalizeString(latestArtifact?.runId),
        createdAt: normalizeString(latestArtifact?.createdAt)
      },
      latestIncidentPackage: {
        packageId: normalizeString(latestIncidentPackage?.packageId),
        auditMatchedCount: Number(latestIncidentPackage?.auditMatchedCount || 0),
        filingStatus: normalizeString(latestIncidentPackage?.filingStatus)
      },
      boundedCausalReferenceCount,
      sourceKinds: artifactKinds,
      canExportReview: allArtifacts.length > 0 || incidentPackages.length > 0,
      canOpenAuditOps: Boolean(normalizeString(audit?.source) || Array.isArray(audit?.items)),
      tone:
        allArtifacts.length === 0
          ? "neutral"
          : hashedCount === 0
            ? "warn"
            : "ok"
    },
    adminChangeProvenanceBoard: {
      totalCount: adminTraceItems.length,
      fullLifecycleCount: adminTraceItems.filter((item) => normalizeString(item?.recovery?.recoveryId)).length,
      stableRefCount: adminTraceItems.filter(
        (item) => normalizeString(item?.receipt?.stableRef) || normalizeString(item?.recovery?.stableRef)
      ).length,
      ownerMix: adminOwnerMix,
      latestTrace: latestAdminTrace,
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
    artifactAccessBoard: {
      artifactCount: allArtifacts.length,
      directUriCount,
      hashOnlyCount: allArtifacts.filter((item) => normalizeString(item?.hash) && !normalizeString(item?.uri)).length,
      linkedRunCount: uniqueCount(bundleEntries, "runId") || uniqueCount(allArtifacts, "runId"),
      linkedApprovalCount: bundleEntries.filter((entry) => entry.approvalId).length,
      linkedIncidentCount: incidentPackages.length,
      latestArtifact: {
        artifactId: normalizeString(latestArtifact?.artifactId),
        kind: normalizeString(latestArtifact?.kind),
        uri: normalizeString(latestArtifact?.uri),
        runId: normalizeString(latestArtifact?.runId),
        taskId: normalizeString(latestArtifact?.taskId),
        retentionClass: normalizeString(latestArtifact?.retentionClass),
        createdAt: normalizeString(latestArtifact?.createdAt)
      },
      latestBundle: {
        bundleId: normalizeString(latestBundle?.bundleId),
        runId: normalizeString(latestBundle?.runId),
        status: normalizeString(latestBundle?.rawStatus)
      },
      latestIncidentPackage: {
        packageId: normalizeString(latestIncidentPackage?.packageId),
        fileName: normalizeString(latestIncidentPackage?.fileName),
        filingStatus: normalizeString(latestIncidentPackage?.filingStatus)
      },
      accessEntries,
      suggestedRunFolderPath: normalizeString(suggestedRunFolderPath),
      canCopyLatestUri: Boolean(normalizeString(latestArtifact?.uri)),
      canCopySuggestedRunFolder: Boolean(normalizeString(suggestedRunFolderPath)),
      canOpenRun: Boolean(normalizeString(latestArtifact?.runId, normalizeString(latestBundle?.runId))),
      tone:
        allArtifacts.length === 0
          ? "neutral"
          : directUriCount === 0
            ? "warn"
            : "ok"
    },
    retentionBoard: {
      defaults: retentionDefaults,
      materialCount: retentionSignals.length,
      taggedCount: retentionSignals.filter((entry) => entry.retentionClass !== "unset").length,
      unsetCount: unsetRetentionCount,
      topRetentionClasses,
      latestArtifact: {
        artifactId: normalizeString(latestArtifact?.artifactId),
        retentionClass: normalizeRetentionClass(latestArtifact?.retentionClass),
        createdAt: normalizeString(latestArtifact?.createdAt),
        kind: normalizeString(latestArtifact?.kind)
      },
      latestBundle: {
        bundleId: normalizeString(latestBundle?.bundleId),
        retentionClass: normalizeRetentionClass(latestBundle?.retentionClass),
        status: normalizeString(latestBundle?.rawStatus)
      },
      latestIncidentPackage: {
        packageId: normalizeString(latestIncidentPackage?.packageId),
        filingStatus: normalizeString(latestIncidentPackage?.filingStatus),
        retentionClass: normalizeRetentionClass(latestIncidentPackage?.retentionClass)
      },
      queueCounts,
      tone:
        retentionSignals.length === 0
          ? "neutral"
          : unsetRetentionCount > 0
            ? "warn"
            : "ok"
    },
    controlMappingBoard: {
      mappingCount: controlMappings.length,
      controlClassCount: uniqueCount(controlMappings, "boundaryClass"),
      linkedApprovalCount: controlMappings.filter((entry) => entry.approvalId).length,
      evidenceRefCount: controlMappings.reduce((sum, entry) => sum + Number(entry?.evidenceRefCount || 0), 0),
      auditSource: normalizeString(audit?.source, "not-loaded"),
      latestIncidentPackage: {
        packageId: normalizeString(latestIncidentPackage?.packageId),
        auditMatchedCount: Number(latestIncidentPackage?.auditMatchedCount || 0)
      },
      latestMapping: {
        runId: normalizeString(latestControlMapping?.runId),
        bundleId: normalizeString(latestControlMapping?.bundleId),
        approvalId: normalizeString(latestControlMapping?.approvalId),
        scope: normalizeString(latestControlMapping?.scope),
        boundaryClass: normalizeString(latestControlMapping?.boundaryClass),
        riskTier: normalizeString(latestControlMapping?.riskTier),
        evidenceReadiness: normalizeString(latestControlMapping?.evidenceReadiness),
        requiredGrantCount: Number(latestControlMapping?.requiredGrantCount || 0),
        evidenceRefCount: Number(latestControlMapping?.evidenceRefCount || 0),
        providerId: normalizeString(latestControlMapping?.providerId),
        decision: normalizeDecision(latestControlMapping?.decision)
      },
      controlClassMix,
      controlDecisionMix,
      controlReadinessMix,
      tone: controlTone(controlMappings)
    }
  };
}
