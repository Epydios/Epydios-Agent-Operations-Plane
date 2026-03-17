import {
  buildNativeSessionActivitySummary,
  latestManagedWorkerTranscript,
  listNativeToolProposals
} from "../../runtime/session-client.js";
import {
  createAimxsField,
  createAimxsIdentityPostureModel,
  inferAimxsAuthorityTierFromRoles
} from "../../shared/aimxs/identity-posture.js";
import {
  createAimxsRouteBoundaryField,
  createAimxsRouteBoundaryModel
} from "../../shared/aimxs/route-boundary.js";

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function parseTimeMs(value) {
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickLatestItem(items = []) {
  const values = Array.isArray(items) ? items : [];
  let best = null;
  let bestTs = 0;
  for (const item of values) {
    const candidate = item && typeof item === "object" ? item : {};
    const ts = Math.max(parseTimeMs(candidate.updatedAt), parseTimeMs(candidate.createdAt));
    if (!best || ts > bestTs) {
      best = candidate;
      bestTs = ts;
    }
  }
  return best || {};
}

function uniqueValues(items = [], selector) {
  const values = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const value = normalizeString(selector(item));
    if (value) {
      values.add(value);
    }
  }
  return [...values];
}

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function countStatuses(items = []) {
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const status = normalizeStatus(item?.status);
    if (!status) {
      return acc;
    }
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function countDecisions(items = []) {
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const decision = normalizeString(item?.policyDecision).toUpperCase();
    if (!decision) {
      return acc;
    }
    acc[decision] = (acc[decision] || 0) + 1;
    return acc;
  }, {});
}

function summarizeFreshness(value, nowValue = new Date()) {
  const ts = parseTimeMs(value);
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : parseTimeMs(nowValue);
  if (!ts || !Number.isFinite(nowMs)) {
    return { label: "unknown", tone: "neutral" };
  }
  const ageMinutes = Math.max(0, Math.round((nowMs - ts) / 60000));
  if (ageMinutes <= 5) {
    return { label: "current", tone: "ok" };
  }
  if (ageMinutes <= 60) {
    return { label: "recent", tone: "ok" };
  }
  if (ageMinutes <= 240) {
    return { label: "watch", tone: "warn" };
  }
  return { label: "stale", tone: "warn" };
}

function summarizeProviders(providers = {}) {
  const items = Array.isArray(providers?.items) ? providers.items : [];
  const readyCount = items.filter((item) => item?.ready === true).length;
  const degradedCount = items.filter((item) => item?.probed === true && item?.ready !== true).length;
  const unknownCount = items.length - readyCount - degradedCount;
  return {
    items,
    totalCount: items.length,
    readyCount,
    degradedCount,
    unknownCount
  };
}

function summarizeRuntimeSessions(runtimeSessions = {}) {
  const items = Array.isArray(runtimeSessions?.items) ? runtimeSessions.items : [];
  const latestSession = pickLatestItem(items);
  const statusCounts = countStatuses(items);
  const terminalStatuses = new Set(["completed", "failed", "cancelled", "blocked"]);
  const activeCount = items.filter((item) => !terminalStatuses.has(normalizeStatus(item?.status))).length;
  const terminalCount = items.filter((item) => terminalStatuses.has(normalizeStatus(item?.status))).length;
  const awaitingApprovalCount = Number(statusCounts.awaiting_approval || 0);
  const attachedWorkerIds = uniqueValues(items, (item) => item?.selectedWorkerId || "");
  const sessionTypes = uniqueValues(items, (item) => item?.sessionType || "");

  return {
    source: normalizeString(runtimeSessions?.source, "unknown"),
    warning: normalizeString(runtimeSessions?.warning),
    totalCount: Number(runtimeSessions?.count || items.length || 0),
    activeCount,
    terminalCount,
    awaitingApprovalCount,
    attachedWorkerCount: attachedWorkerIds.length,
    sessionTypeCount: sessionTypes.length,
    latestSessionId: normalizeString(latestSession?.sessionId, "-"),
    latestTaskId: normalizeString(latestSession?.taskId, "-"),
    latestStatus: normalizeString(latestSession?.status, "-"),
    latestWorkerId: normalizeString(latestSession?.selectedWorkerId, "-"),
    latestUpdatedAt: normalizeString(latestSession?.updatedAt || latestSession?.createdAt, "-")
  };
}

function summarizeRuntimeWorkerFleet(runtimeWorkerCapabilities = {}, runtimeSessions = {}) {
  const items = Array.isArray(runtimeWorkerCapabilities?.items) ? runtimeWorkerCapabilities.items : [];
  const latestCapability = pickLatestItem(items);
  const executionModes = uniqueValues(items, (item) => item?.executionMode || "");
  const adapterIds = uniqueValues(items, (item) => item?.adapterId || "");
  const providers = uniqueValues(items, (item) => item?.provider || "");
  const boundaryRequirements = uniqueValues(
    items.flatMap((item) => (Array.isArray(item?.boundaryRequirements) ? item.boundaryRequirements : [])),
    (value) => value
  );
  const attachedSessionCount = (Array.isArray(runtimeSessions?.items) ? runtimeSessions.items : []).filter((item) =>
    normalizeString(item?.selectedWorkerId)
  ).length;

  return {
    source: normalizeString(runtimeWorkerCapabilities?.source, "unknown"),
    warning: normalizeString(runtimeWorkerCapabilities?.warning),
    totalCount: Number(runtimeWorkerCapabilities?.count || items.length || 0),
    managedAgentCount: items.filter((item) => normalizeString(item?.workerType).toLowerCase() === "managed_agent").length,
    modelInvokeCount: items.filter((item) => normalizeString(item?.workerType).toLowerCase() === "model_invoke").length,
    executionModeCount: executionModes.length,
    adapterCount: adapterIds.length,
    providerCount: providers.length,
    boundaryCoverageCount: boundaryRequirements.length,
    attachedSessionCount,
    latestLabel: normalizeString(latestCapability?.label || latestCapability?.adapterId, "-"),
    latestProvider: normalizeString(latestCapability?.provider, "-"),
    latestTransport: normalizeString(latestCapability?.transport, "-"),
    latestModel: normalizeString(latestCapability?.model, "-")
  };
}

function summarizeProviderRouting(runs = {}, latestRun = {}) {
  const items = Array.isArray(runs?.items) ? runs.items : [];
  const profileProviders = uniqueValues(items, (item) => item?.selectedProfileProvider || "");
  const policyProviders = uniqueValues(items, (item) => item?.selectedPolicyProvider || "");
  const evidenceProviders = uniqueValues(items, (item) => item?.selectedEvidenceProvider || "");
  const desktopProviders = uniqueValues(items, (item) => item?.selectedDesktopProvider || "");
  const aimxsPolicyCount = items.filter((item) =>
    normalizeString(item?.selectedPolicyProvider).toLowerCase().includes("aimxs")
  ).length;

  return {
    source: normalizeString(runs?.source, "unknown"),
    totalRuns: Number(runs?.count || items.length || 0),
    profileRouteCount: profileProviders.length,
    policyRouteCount: policyProviders.length,
    evidenceRouteCount: evidenceProviders.length,
    desktopRouteCount: desktopProviders.length,
    aimxsPolicyCount,
    latestProfileProvider: normalizeString(latestRun?.selectedProfileProvider, "-"),
    latestPolicyProvider: normalizeString(latestRun?.selectedPolicyProvider, "-"),
    latestEvidenceProvider: normalizeString(latestRun?.selectedEvidenceProvider, "-"),
    latestDesktopProvider: normalizeString(latestRun?.selectedDesktopProvider, "-")
  };
}

function summarizeIdentityApplication(runtimeIdentity = {}, session = {}) {
  const identity = runtimeIdentity?.identity && typeof runtimeIdentity.identity === "object" ? runtimeIdentity.identity : {};
  const sessionClaims = session?.claims && typeof session.claims === "object" ? session.claims : {};
  const roles = uniqueValues(identity?.roles || sessionClaims?.roles || [], (value) => value);
  const tenantIds = uniqueValues(identity?.tenantIds || sessionClaims?.tenant_id || [], (value) => value);
  const projectIds = uniqueValues(identity?.projectIds || sessionClaims?.project_id || [], (value) => value);
  const permissions = uniqueValues(identity?.effectivePermissions || [], (value) => value);

  return {
    source: normalizeString(runtimeIdentity?.source, "unknown"),
    authenticated:
      typeof runtimeIdentity?.authenticated === "boolean"
        ? runtimeIdentity.authenticated
        : Boolean(session?.authenticated),
    authEnabled:
      typeof runtimeIdentity?.authEnabled === "boolean"
        ? runtimeIdentity.authEnabled
        : false,
    authorityBasis: normalizeString(runtimeIdentity?.authorityBasis, "unknown"),
    policyMatrixRequired: Boolean(runtimeIdentity?.policyMatrixRequired),
    policyRuleCount: Number(runtimeIdentity?.policyRuleCount || 0),
    subject: normalizeString(identity?.subject || sessionClaims?.sub || sessionClaims?.email, "-"),
    clientId: normalizeString(identity?.clientId || sessionClaims?.client_id, "-"),
    roleClaim: normalizeString(runtimeIdentity?.roleClaim, "-"),
    clientIdClaim: normalizeString(runtimeIdentity?.clientIdClaim, "-"),
    tenantClaim: normalizeString(runtimeIdentity?.tenantClaim, "-"),
    projectClaim: normalizeString(runtimeIdentity?.projectClaim, "-"),
    roleCount: roles.length,
    tenantCount: tenantIds.length,
    projectCount: projectIds.length,
    permissionCount: permissions.length,
    roles,
    tenantIds,
    projectIds,
    permissions
  };
}

function selectPreferredRun(items = [], selectedRunId = "") {
  const values = Array.isArray(items) ? items : [];
  const normalizedRunId = normalizeString(selectedRunId);
  if (normalizedRunId) {
    const selected = values.find((item) => normalizeString(item?.runId) === normalizedRunId);
    if (selected) {
      return selected;
    }
  }
  return pickLatestItem(values);
}

function selectPreferredSession(items = [], selectedSessionId = "") {
  const values = Array.isArray(items) ? items : [];
  const normalizedSessionId = normalizeString(selectedSessionId);
  if (normalizedSessionId) {
    const selected = values.find((item) => normalizeString(item?.sessionId) === normalizedSessionId);
    if (selected) {
      return selected;
    }
  }
  const active = values.filter((item) => !["completed", "failed", "cancelled", "blocked"].includes(normalizeStatus(item?.status)));
  return pickLatestItem(active.length > 0 ? active : values);
}

function selectPreferredWorkerCapability(items = [], selectedWorker = {}) {
  const values = Array.isArray(items) ? items : [];
  const selectedAdapterId = normalizeString(selectedWorker?.adapterId).toLowerCase();
  const selectedProvider = normalizeString(selectedWorker?.provider).toLowerCase();
  const managedItems = values.filter((item) => normalizeString(item?.workerType).toLowerCase() === "managed_agent");
  if (selectedAdapterId) {
    const selectedByAdapter = managedItems.find(
      (item) => normalizeString(item?.adapterId).toLowerCase() === selectedAdapterId
    );
    if (selectedByAdapter) {
      return selectedByAdapter;
    }
  }
  if (selectedProvider) {
    const selectedByProvider = managedItems.find(
      (item) => normalizeString(item?.provider).toLowerCase() === selectedProvider
    );
    if (selectedByProvider) {
      return selectedByProvider;
    }
  }
  const codexManaged = managedItems.find(
    (item) => normalizeString(item?.adapterId).toLowerCase() === "codex"
  );
  if (codexManaged) {
    return codexManaged;
  }
  return managedItems[0] || values[0] || {};
}

function summarizeSessionReviewMeta(viewState = {}, sessionReview = {}, selectedSessionId = "") {
  const reviewMeta = readObject(viewState?.sessionReviewMeta);
  const selected = normalizeString(selectedSessionId);
  const loadedSessionId = normalizeString(sessionReview?.sessionId);
  const loadedReview = Boolean(selected && loadedSessionId && loadedSessionId === selected);
  const defaultState = loadedReview ? normalizeString(sessionReview?.status, "ready") : selected ? "idle" : "idle";
  const state = normalizeString(reviewMeta?.state, defaultState).toLowerCase();
  const defaultTone =
    state === "error"
      ? "danger"
      : state === "warn"
        ? "warn"
        : state === "loading"
          ? "neutral"
          : loadedReview && normalizeString(sessionReview?.status).toLowerCase() === "warn"
            ? "warn"
            : loadedReview && normalizeString(sessionReview?.status).toLowerCase() === "error"
              ? "danger"
              : selected
                ? "ok"
                : "neutral";
  const message = normalizeString(
    reviewMeta?.message,
    loadedReview
      ? normalizeString(sessionReview?.message, "Native runtime session review is loaded.")
      : selected
        ? "Review the selected runtime session to load its bounded timeline and worker posture."
        : "Select a runtime session to inspect its bounded review and worker posture."
  );
  return {
    state,
    tone: normalizeString(reviewMeta?.tone, defaultTone).toLowerCase(),
    message
  };
}

function summarizeSelectedSessionReview(context = {}, options = {}) {
  const sessions = Array.isArray(context?.runtimeSessions?.items) ? context.runtimeSessions.items : [];
  const preferredSession = selectPreferredSession(sessions, options?.viewState?.selectedSessionId);
  const selectedSessionId = normalizeString(
    options?.viewState?.selectedSessionId,
    normalizeString(preferredSession?.sessionId)
  );
  const sessionRecord =
    sessions.find((item) => normalizeString(item?.sessionId) === selectedSessionId) || preferredSession || {};
  const rawSessionReview = readObject(options?.viewState?.sessionReview);
  const sessionReview =
    normalizeString(rawSessionReview?.sessionId) === selectedSessionId ? rawSessionReview : {};
  const timeline = readObject(sessionReview?.timeline);
  const reviewSession = readObject(timeline?.session);
  const task = readObject(timeline?.task);
  const activity = sessionReview?.timeline ? buildNativeSessionActivitySummary(sessionReview) : {};
  const proposals = sessionReview?.timeline ? listNativeToolProposals(sessionReview) : [];
  const semanticEvents = Array.isArray(activity?.semanticEvents) ? activity.semanticEvents : [];
  const latestEvent = semanticEvents[semanticEvents.length - 1] || {};
  const progressItems = (Array.isArray(activity?.progressItems) ? activity.progressItems : [])
    .slice(-5)
    .reverse()
    .map((item) => ({
      label: normalizeString(item?.label, "Session Event"),
      detail: normalizeString(item?.detail, "-"),
      tone: normalizeString(item?.tone, "neutral"),
      timestamp: normalizeString(item?.timestamp, "-"),
      sequence: Number(item?.sequence || 0) || 0
    }));
  const meta = summarizeSessionReviewMeta(options?.viewState, sessionReview, selectedSessionId);

  return {
    available: Boolean(selectedSessionId),
    loaded: Boolean(sessionReview?.timeline),
    selectedSessionId: normalizeString(selectedSessionId, "-"),
    source: normalizeString(sessionReview?.source, normalizeString(context?.runtimeSessions?.source, "unknown")),
    state: meta.state,
    tone: meta.tone,
    message: meta.message,
    requestId: normalizeString(reviewSession?.requestId, normalizeString(sessionRecord?.requestId, "-")),
    taskId: normalizeString(reviewSession?.taskId || task?.taskId, normalizeString(sessionRecord?.taskId, "-")),
    sessionStatus: normalizeString(reviewSession?.status, normalizeString(sessionRecord?.status, "-")),
    taskStatus: normalizeString(task?.status, normalizeString(activity?.taskStatus, "-")),
    selectedWorkerId: normalizeString(
      timeline?.selectedWorker?.workerId,
      normalizeString(sessionRecord?.selectedWorkerId, "-")
    ),
    latestWorkerStatus: normalizeString(
      activity?.latestWorkerStatus,
      normalizeString(timeline?.selectedWorker?.status, normalizeString(sessionRecord?.selectedWorkerStatus, "-"))
    ),
    executionMode: normalizeString(activity?.executionMode, "-"),
    openApprovalCount: Number(activity?.openApprovalCount || 0),
    pendingToolProposalCount: Number(
      activity?.pendingToolProposalCount || proposals.filter((item) => normalizeString(item?.status, "PENDING").toUpperCase() === "PENDING").length
    ),
    evidenceCount: Number(
      activity?.evidenceCount || (Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords.length : 0)
    ),
    toolActionCount: Number(
      activity?.toolActionCount || (Array.isArray(timeline?.toolActions) ? timeline.toolActions.length : 0)
    ),
    eventCount: Number(activity?.eventCount || semanticEvents.length || 0),
    latestEventLabel: normalizeString(latestEvent?.label, "-"),
    latestEventDetail: normalizeString(latestEvent?.detail, "-"),
    latestEventTimestamp: normalizeString(latestEvent?.timestamp, "-"),
    latestEventTone: normalizeString(latestEvent?.tone, "neutral"),
    latestEventSequence: Number(latestEvent?.sequence || timeline?.latestEventSequence || 0) || 0,
    resolutionStatus: normalizeString(activity?.resolutionStatus, "-"),
    resolutionMessage: normalizeString(activity?.resolutionMessage),
    progressItems
  };
}

function summarizeWorkerPosture(context = {}, options = {}) {
  const sessions = Array.isArray(context?.runtimeSessions?.items) ? context.runtimeSessions.items : [];
  const capabilities = Array.isArray(context?.runtimeWorkerCapabilities?.items)
    ? context.runtimeWorkerCapabilities.items
    : [];
  const review = summarizeSelectedSessionReview(context, options);
  const sessionRecord =
    sessions.find((item) => normalizeString(item?.sessionId) === normalizeString(review.selectedSessionId)) || {};
  const rawSessionReview = readObject(options?.viewState?.sessionReview);
  const sessionReview =
    normalizeString(rawSessionReview?.sessionId) === normalizeString(review.selectedSessionId) ? rawSessionReview : {};
  const timeline = readObject(sessionReview?.timeline);
  const selectedWorker = readObject(timeline?.selectedWorker);
  const activity = sessionReview?.timeline ? buildNativeSessionActivitySummary(sessionReview) : {};
  const transcript = sessionReview?.timeline ? latestManagedWorkerTranscript(sessionReview) : null;
  const capability = selectPreferredWorkerCapability(capabilities, {
    workerId: normalizeString(selectedWorker?.workerId, normalizeString(sessionRecord?.selectedWorkerId)),
    workerType: normalizeString(selectedWorker?.workerType, normalizeString(sessionRecord?.selectedWorkerType)),
    adapterId: normalizeString(selectedWorker?.adapterId, normalizeString(sessionRecord?.selectedWorkerAdapterId)),
    provider: normalizeString(selectedWorker?.provider, normalizeString(sessionRecord?.selectedWorkerProvider))
  });
  const boundaries = uniqueValues(Array.isArray(capability?.boundaryRequirements) ? capability.boundaryRequirements : [], (value) => value);
  return {
    available: Boolean(
      normalizeString(review.selectedSessionId) ||
        normalizeString(selectedWorker?.workerId) ||
        normalizeString(sessionRecord?.selectedWorkerId) ||
        normalizeString(capability?.adapterId)
    ),
    selectedSessionId: normalizeString(review.selectedSessionId, "-"),
    workerId: normalizeString(selectedWorker?.workerId, normalizeString(sessionRecord?.selectedWorkerId, "-")),
    workerType: normalizeString(
      selectedWorker?.workerType,
      normalizeString(sessionRecord?.selectedWorkerType, normalizeString(capability?.workerType, "-"))
    ),
    workerStatus: normalizeString(
      selectedWorker?.status,
      normalizeString(sessionRecord?.selectedWorkerStatus, normalizeString(sessionRecord?.status, "-"))
    ),
    latestWorkerStatus: normalizeString(
      activity?.latestWorkerStatus,
      normalizeString(selectedWorker?.status, normalizeString(sessionRecord?.selectedWorkerStatus, "-"))
    ),
    adapterId: normalizeString(
      selectedWorker?.adapterId,
      normalizeString(sessionRecord?.selectedWorkerAdapterId, normalizeString(capability?.adapterId, "-"))
    ),
    provider: normalizeString(
      selectedWorker?.provider,
      normalizeString(sessionRecord?.selectedWorkerProvider, normalizeString(capability?.provider, "-"))
    ),
    transport: normalizeString(selectedWorker?.transport, normalizeString(capability?.transport, "-")),
    model: normalizeString(selectedWorker?.model, normalizeString(capability?.model, "-")),
    targetEnvironment: normalizeString(
      selectedWorker?.targetEnvironment,
      normalizeString(sessionRecord?.targetEnvironment, normalizeString(capability?.targetEnvironments?.[0], "-"))
    ),
    source: normalizeString(selectedWorker?.source, "-"),
    boundaryRequirements: boundaries,
    boundaryCount: boundaries.length,
    transcriptAvailable: Boolean(transcript),
    transcriptEventCount: Number(transcript?.eventCount || 0),
    latestWorkerSummary: normalizeString(
      activity?.latestWorkerSummary,
      normalizeString(
        activity?.latestOutputText,
        review.available
          ? "Review the selected runtime session to load the latest worker summary."
          : "Select a runtime session to inspect worker posture."
      )
    ),
    pendingToolProposalCount: Number(activity?.pendingToolProposalCount || 0),
    evidenceCount: Number(activity?.evidenceCount || 0),
    openApprovalCount: Number(activity?.openApprovalCount || 0)
  };
}

function buildRuntimeActionReview(context = {}, session = {}, options = {}) {
  const runs = Array.isArray(context?.runs?.items) ? context.runs.items : [];
  const sessions = Array.isArray(context?.runtimeSessions?.items) ? context.runtimeSessions.items : [];
  const capabilities = Array.isArray(context?.runtimeWorkerCapabilities?.items)
    ? context.runtimeWorkerCapabilities.items
    : [];
  const feedback =
    options?.viewState?.feedback && typeof options.viewState.feedback === "object"
      ? {
          tone: normalizeString(options.viewState.feedback.tone, "info").toLowerCase(),
          message: normalizeString(options.viewState.feedback.message)
        }
      : null;

  const selectedRun = selectPreferredRun(runs, options?.viewState?.selectedRunId);
  const selectedSession = selectPreferredSession(sessions, options?.viewState?.selectedSessionId);
  const scopeTenant = normalizeString(selectedSession?.tenantId, normalizeString(session?.claims?.tenant_id, "-"));
  const scopeProject = normalizeString(selectedSession?.projectId, normalizeString(session?.claims?.project_id, "-"));
  const selectedWorker = {
    workerId: normalizeString(selectedSession?.selectedWorkerId, "-"),
    workerType: normalizeString(selectedSession?.selectedWorkerType, "-"),
    adapterId: normalizeString(selectedSession?.selectedWorkerAdapterId, "-"),
    provider: normalizeString(selectedSession?.selectedWorkerProvider, "-"),
    status: normalizeString(selectedSession?.selectedWorkerStatus, normalizeString(selectedSession?.status, "-"))
  };
  const capability = selectPreferredWorkerCapability(capabilities, selectedWorker);
  const sessionStatus = normalizeString(selectedSession?.status, "-");
  const sessionTerminal = ["completed", "failed", "cancelled", "blocked"].includes(
    normalizeStatus(selectedSession?.status)
  );
  const workerAttached = Boolean(normalizeString(selectedSession?.selectedWorkerId));
  return {
    feedback,
    run: {
      runId: normalizeString(selectedRun?.runId, "-"),
      status: normalizeString(selectedRun?.status, "-"),
      decision: normalizeString(selectedRun?.policyDecision, "-"),
      actionable: Boolean(normalizeString(selectedRun?.runId))
    },
    session: {
      sessionId: normalizeString(selectedSession?.sessionId, "-"),
      taskId: normalizeString(selectedSession?.taskId, "-"),
      status: sessionStatus,
      tenantId: scopeTenant,
      projectId: scopeProject,
      workerId: normalizeString(selectedSession?.selectedWorkerId, "-"),
      actionable: Boolean(normalizeString(selectedSession?.sessionId)),
      closeAllowed: Boolean(normalizeString(selectedSession?.sessionId)) && !sessionTerminal
    },
    worker: {
      workerId: selectedWorker.workerId,
      status: selectedWorker.status,
      capabilityLabel: normalizeString(capability?.label, "-"),
      capabilityAdapterId: normalizeString(capability?.adapterId, "-"),
      capabilityProvider: normalizeString(capability?.provider, "-"),
      capabilityModel: normalizeString(capability?.model, "-"),
      attachAllowed:
        Boolean(normalizeString(selectedSession?.sessionId)) &&
        !sessionTerminal &&
        !workerAttached &&
        Boolean(normalizeString(capability?.adapterId)),
      heartbeatAllowed: Boolean(normalizeString(selectedSession?.sessionId)) && workerAttached,
      reattachAllowed: Boolean(normalizeString(selectedSession?.sessionId)) && workerAttached
    }
  };
}

function buildRuntimeHealthSnapshot(health = {}, pipeline = {}) {
  const runtime = health?.runtime && typeof health.runtime === "object" ? health.runtime : {};
  const providers = health?.providers && typeof health.providers === "object" ? health.providers : {};
  const policy = health?.policy && typeof health.policy === "object" ? health.policy : {};
  const pipelineStatus = normalizeString(pipeline?.status, "unknown");
  const pipelineDetail =
    normalizeString(pipeline?.detail) ||
    `staging=${normalizeString(pipeline?.latestStagingGate, "-")}; prod=${normalizeString(pipeline?.latestProdGate, "-")}`;
  return {
    runtime: {
      status: normalizeString(runtime.status, "unknown"),
      detail: normalizeString(runtime.detail, "-")
    },
    providers: {
      status: normalizeString(providers.status, "unknown"),
      detail: normalizeString(providers.detail, "-")
    },
    policy: {
      status: normalizeString(policy.status, "unknown"),
      detail: normalizeString(policy.detail, "-")
    },
    pipeline: {
      status: pipelineStatus,
      detail: pipelineDetail
    }
  };
}

export function createRuntimeWorkspaceSnapshot(context = {}, session = {}, options = {}) {
  const healthSnapshot = buildRuntimeHealthSnapshot(context.health, context.pipeline);
  const runs = Array.isArray(context?.runs?.items) ? context.runs.items : [];
  const approvals = Array.isArray(context?.approvals?.items) ? context.approvals.items : [];
  const providers = summarizeProviders(context.providers);
  const latestRun = pickLatestItem(runs);
  const runtimeSessions = summarizeRuntimeSessions(context.runtimeSessions);
  const workerFleet = summarizeRuntimeWorkerFleet(context.runtimeWorkerCapabilities, context.runtimeSessions);
  const providerRouting = summarizeProviderRouting(context.runs, latestRun);
  const identityApplication = summarizeIdentityApplication(context.runtimeIdentity, session);
  const actionReview = buildRuntimeActionReview(context, session, options);
  const selectedSessionReview = summarizeSelectedSessionReview(context, options);
  const workerPosture = summarizeWorkerPosture(context, options);
  const statusCounts = countStatuses(runs);
  const decisionCounts = countDecisions(runs);
  const activeStatuses = ["new", "pending", "policy_evaluated", "desktop_verified", "running", "in_progress"];
  const attentionStatuses = ["failed", "policy_blocked", "blocked"];
  const activeCount = activeStatuses.reduce((count, status) => count + Number(statusCounts[status] || 0), 0);
  const attentionCount = attentionStatuses.reduce((count, status) => count + Number(statusCounts[status] || 0), 0);
  const completedCount = Number(statusCounts.completed || 0);
  const deniedCount = Number(decisionCounts.DENY || 0);
  const allowCount = Number(decisionCounts.ALLOW || 0);
  const tenantIds = uniqueValues(runs, (item) => item?.tenantId || "");
  const projectIds = uniqueValues(runs, (item) => item?.projectId || "");
  const routeIds = uniqueValues(
    runs.flatMap((item) => [
      item?.selectedProfileProvider,
      item?.selectedPolicyProvider,
      item?.selectedEvidenceProvider,
      item?.selectedDesktopProvider
    ]),
    (value) => value
  );
  const freshness = summarizeFreshness(latestRun?.updatedAt || latestRun?.createdAt, options.now);
  const queueTone = attentionCount > 0 || approvals.length > 0 ? "warn" : activeCount > 0 ? "ok" : "neutral";
  const scopeTenant = normalizeString(session?.claims?.tenant_id, tenantIds[0] || "-");
  const scopeProject = normalizeString(session?.claims?.project_id, projectIds[0] || "-");

  const snapshot = {
    runtimeHealth: healthSnapshot,
    queueAndThroughput: {
      source: normalizeString(context?.runs?.source, "unknown"),
      totalRuns: Number(context?.runs?.count || runs.length || 0),
      activeCount,
      attentionCount,
      completedCount,
      approvalCount: Number(context?.approvals?.count || approvals.length || 0),
      queueTone,
      latestRunId: normalizeString(latestRun?.runId, "-"),
      latestUpdatedAt: normalizeString(latestRun?.updatedAt || latestRun?.createdAt, "-")
    },
    latencyAndCapacity: {
      readyProviders: providers.readyCount,
      degradedProviders: providers.degradedCount,
      unknownProviders: providers.unknownCount,
      totalProviders: providers.totalCount,
      routeCount: routeIds.length,
      freshnessLabel: freshness.label,
      freshnessTone: freshness.tone,
      latestPolicyProvider: normalizeString(latestRun?.selectedPolicyProvider, "-"),
      latestDesktopProvider: normalizeString(latestRun?.selectedDesktopProvider, "-")
    },
    liveSessions: runtimeSessions,
    workerFleet,
    providerRouting,
    identityApplication,
    actionReview,
    selectedSessionReview,
    workerPosture,
    runInventory: {
      totalRuns: Number(context?.runs?.count || runs.length || 0),
      allowCount,
      deniedCount,
      tenantCount: tenantIds.length,
      projectCount: projectIds.length,
      scopeTenant,
      scopeProject,
      latestRunId: normalizeString(latestRun?.runId, "-"),
      latestRunStatus: normalizeString(latestRun?.status, "-"),
      latestRunDecision: normalizeString(latestRun?.policyDecision, "-"),
      evidenceLinkedCount: runs.filter((item) => normalizeString(item?.selectedEvidenceProvider)).length
    }
  };
  snapshot.aimxsIdentityPosture = buildRuntimeAimxsIdentityPosture(snapshot);
  snapshot.aimxsRouteBoundary = buildRuntimeAimxsRouteBoundary(snapshot);
  return snapshot;
}

function runtimeAimxsTone(value = "") {
  const normalized = normalizeString(value).toLowerCase();
  if (["active", "allow", "allowed", "authenticated", "current", "ready", "running"].includes(normalized)) {
    return "ok";
  }
  if (["blocked", "deny", "denied", "failed", "unresolved"].includes(normalized)) {
    return "danger";
  }
  if (["approval_gated", "awaiting_approval", "pending", "review", "watch"].includes(normalized)) {
    return "warn";
  }
  return "neutral";
}

function buildRuntimeAimxsIdentityPosture(snapshot = {}) {
  const identity = snapshot?.identityApplication || {};
  const review = snapshot?.selectedSessionReview || {};
  const worker = snapshot?.workerPosture || {};
  const action = snapshot?.actionReview || {};
  const authorityTier = inferAimxsAuthorityTierFromRoles(identity?.roles, identity?.authenticated ? "workspace_operator" : "unresolved");
  const currentBadge =
    normalizeStatus(review?.sessionStatus) === "failed"
      ? "blocked"
      : Number(review?.openApprovalCount || 0) > 0
        ? "approval_gated"
        : normalizeString(review?.sessionStatus, "current").toLowerCase();
  const targetBadge =
    Number(review?.openApprovalCount || 0) > 0
      ? "pending"
      : normalizeString(review?.resolutionStatus, worker?.workerStatus || "ready").toLowerCase();
  const currentScope =
    [action?.session?.tenantId, action?.session?.projectId]
      .filter((value) => normalizeString(value) && normalizeString(value) !== "-")
      .join(" / ") ||
    [identity?.tenantIds?.[0], identity?.projectIds?.[0]].filter(Boolean).join(" / ") ||
    "workspace";

  return createAimxsIdentityPostureModel({
    summary:
      "This read-only echo shows the current runtime identity posture and the next bounded session posture without opening any new runtime mutation controls.",
    surfaceLabel: "read-only echo",
    identityFields: [
      createAimxsField("identity class", "runtime session identity"),
      createAimxsField("subject", identity?.subject, true),
      createAimxsField("client", identity?.clientId, true),
      createAimxsField("authority tier", authorityTier),
      createAimxsField("authority basis", identity?.authorityBasis || "unknown"),
      createAimxsField(
        "delegation basis",
        Number(review?.openApprovalCount || 0) > 0 ? "approval-bound runtime continuation" : identity?.policyMatrixRequired ? "policy-matrix governed" : "direct runtime grant"
      ),
      createAimxsField(
        "grant basis",
        normalizeString(action?.run?.decision, "").toUpperCase() ? `policy ${normalizeString(action?.run?.decision).toUpperCase()}` : "pending runtime decision"
      ),
      createAimxsField("assurance posture", identity?.authenticated ? "session authenticated" : "identity unresolved"),
      createAimxsField("freshness anchor", review?.latestEventTimestamp || action?.session?.status || "-", Boolean(review?.latestEventTimestamp))
    ].filter(Boolean),
    currentPosture: {
      badge: currentBadge,
      tone: runtimeAimxsTone(currentBadge),
      note: "Current posture is derived from the selected session review, current worker posture, and the bounded runtime action focus.",
      fields: [
        createAimxsField("current posture", normalizeString(review?.sessionStatus, "idle").toLowerCase()),
        createAimxsField("scope", currentScope, true),
        createAimxsField("worker posture", worker?.workerStatus || "-", true),
        createAimxsField("selected session", review?.selectedSessionId, true),
        createAimxsField("latest event", review?.latestEventLabel || "-", true)
      ].filter(Boolean)
    },
    targetPosture: {
      badge: targetBadge,
      tone: runtimeAimxsTone(targetBadge),
      note:
        Number(review?.openApprovalCount || 0) > 0
          ? "Runtime continuation remains approval-gated until the open review is resolved."
          : normalizeString(review?.resolutionMessage, "The selected runtime session is ready for bounded continuation."),
      fields: [
        createAimxsField("target posture", Number(review?.openApprovalCount || 0) > 0 ? "approved continuation required" : "stable governed session"),
        createAimxsField("target worker", worker?.adapterId || worker?.workerId || "-", true),
        createAimxsField("target environment", worker?.targetEnvironment || "-", true),
        createAimxsField("pending proposals", String(review?.pendingToolProposalCount || 0)),
        createAimxsField("open approvals", String(review?.openApprovalCount || 0))
      ].filter(Boolean)
    },
    rationale: {
      badge: Number(review?.openApprovalCount || 0) > 0 ? "pending" : currentBadge,
      tone: runtimeAimxsTone(Number(review?.openApprovalCount || 0) > 0 ? "pending" : currentBadge),
      note:
        normalizeString(review?.resolutionMessage) ||
        normalizeString(review?.message) ||
        "Use the bounded runtime review to understand whether session continuation is allowed or still blocked by approval or worker state.",
      fields: [
        createAimxsField("resolution", review?.resolutionStatus || "-", true),
        createAimxsField("latest detail", review?.latestEventDetail || ""),
        createAimxsField("worker summary", worker?.latestWorkerSummary || ""),
        createAimxsField("evidence posture", `${Number(review?.evidenceCount || 0)} evidence refs`)
      ].filter(Boolean)
    }
  });
}

function buildRuntimeAimxsRouteBoundary(snapshot = {}) {
  const review = snapshot?.selectedSessionReview || {};
  const worker = snapshot?.workerPosture || {};
  const action = snapshot?.actionReview || {};
  const routing = snapshot?.providerRouting || {};
  const queue = snapshot?.queueAndThroughput || {};
  const currentScope =
    [action?.session?.tenantId, action?.session?.projectId]
      .filter((value) => normalizeString(value) && normalizeString(value) !== "-")
      .join(" / ") || "workspace";
  const approvalGated = Number(review?.openApprovalCount || 0) > 0;
  const routeHealthy = !approvalGated && normalizeString(worker?.workerStatus).toLowerCase() !== "failed";

  return createAimxsRouteBoundaryModel({
    summary:
      "This read-only echo correlates the active runtime worker route, the loaded provider route set, and the bounded session boundary without opening new runtime mutation controls.",
    surfaceLabel: "read-only echo",
    routeFields: [
      createAimxsRouteBoundaryField("session", review?.selectedSessionId, true),
      createAimxsRouteBoundaryField("worker", worker?.workerId, true),
      createAimxsRouteBoundaryField("adapter", worker?.adapterId, true),
      createAimxsRouteBoundaryField("provider", worker?.provider, true),
      createAimxsRouteBoundaryField("transport", worker?.transport, true),
      createAimxsRouteBoundaryField("model", worker?.model),
      createAimxsRouteBoundaryField("target", worker?.targetEnvironment, true)
    ].filter(Boolean),
    currentBoundary: {
      title: "Current Boundary",
      badge: approvalGated ? "approval_gated" : routeHealthy ? "current" : "watch",
      tone: approvalGated ? "warn" : routeHealthy ? "ok" : "warn",
      note: "Current runtime boundary comes from the selected session, worker capability, and current scope.",
      fields: [
        createAimxsRouteBoundaryField("scope", currentScope, true),
        createAimxsRouteBoundaryField("session status", review?.sessionStatus),
        createAimxsRouteBoundaryField("worker status", worker?.workerStatus),
        createAimxsRouteBoundaryField("boundaries", String(worker?.boundaryCount || 0)),
        createAimxsRouteBoundaryField("first boundary", worker?.boundaryRequirements?.[0], true),
        createAimxsRouteBoundaryField("latest event", review?.latestEventLabel, true)
      ].filter(Boolean)
    },
    routePosture: {
      title: "Route Posture",
      badge: approvalGated || Number(queue?.attentionCount || 0) > 0 ? "watch" : routing?.totalRuns > 0 ? "current" : "limited",
      tone: approvalGated || Number(queue?.attentionCount || 0) > 0 ? "warn" : routing?.totalRuns > 0 ? "ok" : "neutral",
      note:
        "This route set is bounded to loaded runtime runs and the selected managed worker capability. No new runtime write controls are opened here.",
      fields: [
        createAimxsRouteBoundaryField("profile routes", String(routing?.profileRouteCount || 0)),
        createAimxsRouteBoundaryField("policy routes", String(routing?.policyRouteCount || 0)),
        createAimxsRouteBoundaryField("evidence routes", String(routing?.evidenceRouteCount || 0)),
        createAimxsRouteBoundaryField("desktop routes", String(routing?.desktopRouteCount || 0)),
        createAimxsRouteBoundaryField("latest policy", routing?.latestPolicyProvider, true),
        createAimxsRouteBoundaryField("latest evidence", routing?.latestEvidenceProvider, true),
        createAimxsRouteBoundaryField("latest desktop", routing?.latestDesktopProvider, true)
      ].filter(Boolean)
    },
    rationale: {
      title: "Allowed Or Constrained",
      badge: approvalGated ? "constrained" : review?.loaded ? "allowed" : "review",
      tone: approvalGated ? "warn" : review?.loaded ? "ok" : "neutral",
      note:
        normalizeString(review?.resolutionMessage, "") ||
        normalizeString(worker?.latestWorkerSummary, "") ||
        normalizeString(review?.message, ""),
      fields: [
        createAimxsRouteBoundaryField("resolution", review?.resolutionStatus, true),
        createAimxsRouteBoundaryField("open approvals", String(review?.openApprovalCount || 0)),
        createAimxsRouteBoundaryField("pending proposals", String(review?.pendingToolProposalCount || 0)),
        createAimxsRouteBoundaryField("evidence refs", String(review?.evidenceCount || 0)),
        createAimxsRouteBoundaryField("transcript events", String(worker?.transcriptEventCount || 0))
      ].filter(Boolean)
    }
  });
}
