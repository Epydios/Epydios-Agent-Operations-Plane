import { displayAimxsModeLabel, displayPolicyProviderLabel } from "../../views/common.js";
import { createIdentityWorkspaceSnapshot } from "../identityops/state.js";

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readItems(value) {
  return Array.isArray(value?.items) ? value.items : [];
}

function normalizeStatus(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || fallback;
}

function normalizeCount(value) {
  return Number.isFinite(value) ? value : 0;
}

function parseTimeMs(value) {
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickLatest(items = [], selectors = []) {
  let best = null;
  let bestTs = -1;
  for (const item of Array.isArray(items) ? items : []) {
    const candidate = item && typeof item === "object" ? item : {};
    const ts = selectors.reduce((latest, key) => Math.max(latest, parseTimeMs(candidate?.[key])), 0);
    if (!best || ts > bestTs) {
      best = candidate;
      bestTs = ts;
    }
  }
  return best || null;
}

function countAttentionRuns(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    const status = String(item?.status || "").trim().toUpperCase();
    const decision = String(item?.policyDecision || "").trim().toUpperCase();
    return (
      status === "FAILED" ||
      status === "POLICY_BLOCKED" ||
      decision === "DENY" ||
      decision === "DEFER"
    );
  }).length;
}

function countAuditDenies(items = []) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => String(item?.decision || "").trim().toUpperCase() === "DENY"
  ).length;
}

function countPendingApprovals(items = []) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => String(item?.status || "").trim().toUpperCase() === "PENDING"
  ).length;
}

function countExpiringApprovals(items = [], nowValue = Date.now()) {
  const nowMs = Number.isFinite(nowValue) ? nowValue : Date.now();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const status = String(item?.status || "").trim().toUpperCase();
    if (status !== "PENDING") {
      return false;
    }
    const expiresAt = parseTimeMs(item?.expiresAt);
    if (expiresAt <= 0) {
      return false;
    }
    const delta = expiresAt - nowMs;
    return delta > 0 && delta <= 300000;
  }).length;
}

function countReadyProviders(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.ready === true).length;
}

function countEnabledPolicyPacks(settings = {}) {
  const catalog = readObject(settings?.policyCatalog);
  return normalizeCount(catalog.count) || readItems(catalog).length;
}

function deriveIncidentSeverity(item = {}, runs = [], approvals = []) {
  const explicit = normalizeStatus(item?.severity, "");
  if (explicit) {
    return explicit;
  }
  const linkedRun = (Array.isArray(runs) ? runs : []).find(
    (run) => String(run?.runId || "").trim() === String(item?.runId || "").trim()
  );
  const linkedApproval = (Array.isArray(approvals) ? approvals : []).find(
    (approval) =>
      String(approval?.approvalId || "").trim() === String(item?.approvalId || "").trim() ||
      String(approval?.runId || "").trim() === String(item?.runId || "").trim()
  );
  const filingStatus = normalizeStatus(item?.filingStatus);
  const approvalStatus = String(linkedApproval?.status || item?.approvalStatus || "")
    .trim()
    .toUpperCase();
  const policyDecision = String(linkedRun?.policyDecision || "").trim().toUpperCase();
  if (filingStatus === "filed" || policyDecision === "DENY") {
    return "high";
  }
  if (filingStatus === "drafted" || approvalStatus === "PENDING") {
    return "medium";
  }
  return "low";
}

function summarizeIncidents(incidentHistory = {}, runs = {}, approvals = {}) {
  const items = readItems(incidentHistory).map((item) => ({
    ...item,
    severity: deriveIncidentSeverity(item, readItems(runs), readItems(approvals))
  }));
  return {
    total: items.length,
    high: items.filter((item) => item.severity === "high").length,
    medium: items.filter((item) => item.severity === "medium").length,
    latest: pickLatest(items, ["filingUpdatedAt", "generatedAt"])
  };
}

function summarizePolicy(runs = {}, settings = {}) {
  const latestRun = pickLatest(readItems(runs), ["updatedAt", "createdAt"]);
  const latestDecision = String(latestRun?.policyDecision || "").trim().toUpperCase() || "-";
  const provider = displayPolicyProviderLabel(
    latestRun?.selectedPolicyProvider || settings?.aimxs?.activation?.selectedProviderId || ""
  );
  return {
    latestDecision,
    provider,
    packCount: countEnabledPolicyPacks(settings),
    blockedCount: readItems(runs).filter((item) => {
      const decision = String(item?.policyDecision || "").trim().toUpperCase();
      return decision === "DENY" || decision === "DEFER";
    }).length
  };
}

function summarizeAimxsPath(settings = {}, policy = {}) {
  const aimxs = readObject(settings?.aimxs);
  const activation = readObject(aimxs?.activation);
  const mode = String(activation?.activeMode || aimxs?.mode || "oss-only").trim() || "oss-only";
  const provider = displayPolicyProviderLabel(
    activation?.selectedProviderId || activation?.selectedProviderName || policy?.provider || ""
  );
  return {
    mode,
    modeLabel: displayAimxsModeLabel(mode),
    provider: provider || "-"
  };
}

function summarizeRuntime(health = {}, runs = {}, approvals = {}) {
  return {
    status: normalizeStatus(health?.runtime?.status, "unknown"),
    detail: String(health?.runtime?.detail || "").trim() || "Runtime status unavailable.",
    runCount: readItems(runs).length,
    attentionRuns: countAttentionRuns(readItems(runs)),
    pendingApprovals: countPendingApprovals(readItems(approvals))
  };
}

function summarizePlatform(health = {}, pipeline = {}, providers = {}) {
  return {
    status:
      normalizeStatus(health?.providers?.status, "unknown") === "ok" &&
      normalizeStatus(pipeline?.status, "unknown") === "pass"
        ? "ok"
        : normalizeStatus(health?.providers?.status || pipeline?.status, "unknown"),
    providerCount: readItems(providers).length,
    readyProviders: countReadyProviders(readItems(providers)),
    gateStatus: normalizeStatus(pipeline?.status, "unknown"),
    latestGate:
      String(pipeline?.latestProdGate || pipeline?.latestStagingGate || "").trim() || "no gate recorded"
  };
}

function summarizeGovernance(approvals = {}) {
  const items = readItems(approvals);
  return {
    pending: countPendingApprovals(items),
    expiringSoon: countExpiringApprovals(items),
    source: String(approvals?.source || "unknown").trim() || "unknown"
  };
}

function formatScopeLabel(tenantIds = [], projectIds = []) {
  const tenant = String(tenantIds?.[0] || "").trim();
  const project = String(projectIds?.[0] || "").trim();
  if (tenant && project) {
    return `${tenant}/${project}`;
  }
  return tenant || project || "-";
}

function formatIdentityLabel(value, fallback = "-") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function joinMetaLine(parts = [], fallback = "") {
  const normalized = (Array.isArray(parts) ? parts : [parts])
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return normalized.length ? normalized.join("; ") : fallback;
}

function mergeCompanionTone(...values) {
  const tones = values.map((value) => normalizeStatus(value, "")).filter(Boolean);
  if (tones.includes("danger") || tones.includes("error")) {
    return "danger";
  }
  if (tones.includes("warn") || tones.includes("warning")) {
    return "warn";
  }
  if (tones.includes("ok") || tones.includes("success")) {
    return "ok";
  }
  return "neutral";
}

function formatAuthorityBasis(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "unresolved";
  }
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRoleSummary(roles = []) {
  const items = Array.isArray(roles) ? roles.filter(Boolean) : [];
  if (!items.length) {
    return "none";
  }
  const preview = items.slice(0, 2).join(", ");
  return items.length > 2 ? `${preview} +${items.length - 2}` : preview;
}

function createIdentityAndScopeSnapshot(context = {}) {
  const identity = createIdentityWorkspaceSnapshot(context.settings, context.session);
  const authenticated = Boolean(identity.authenticated);
  const authEnabled = Boolean(identity.authEnabled);
  const tone = authenticated ? "ok" : authEnabled ? "warn" : "unknown";
  return {
    cards: [
      {
        id: "effective-identity",
        title: "Effective Identity",
        tone,
        value: formatIdentityLabel(identity.subject),
        summary: `client=${formatIdentityLabel(identity.clientId)}`,
        meta: `source=${formatIdentityLabel(identity.source, "unknown")}`
      },
      {
        id: "authority-basis",
        title: "Authority Basis",
        tone,
        value: formatAuthorityBasis(identity.authorityBasis),
        summary: `auth=${authenticated ? "active" : authEnabled ? "required" : "disabled"}`,
        meta: `environment=${formatIdentityLabel(identity.environment, "unknown")}`
      },
      {
        id: "scope",
        title: "Scope",
        tone: identity.tenantIds.length || identity.projectIds.length ? "ok" : "warn",
        value: formatScopeLabel(identity.tenantIds, identity.projectIds),
        summary: `tenants=${identity.tenantIds.length}; projects=${identity.projectIds.length}`,
        meta: `claims=${identity.claimKeys.length}`
      },
      {
        id: "access-posture",
        title: "Access Posture",
        tone: identity.roles.length > 0 ? "ok" : "warn",
        value: `${identity.roles.length} roles`,
        summary: formatRoleSummary(identity.roles),
        meta: `permissions=${identity.effectivePermissions.length}`
      }
    ],
    actionLabel: "Open IdentityOps",
    view: "identityops"
  };
}

function createDashboardCards(context = {}) {
  const runtime = summarizeRuntime(context.health, context.runs, context.approvals);
  const platform = summarizePlatform(context.health, context.pipeline, context.providers);
  const governance = summarizeGovernance(context.approvals);
  const incidents = summarizeIncidents(context.incidentHistory, context.runs, context.approvals);
  const policy = summarizePolicy(context.runs, context.settings);
  return [
    {
      id: "runtimeops",
      title: "RuntimeOps",
      tone: runtime.status,
      value: `${runtime.runCount} runs`,
      summary: `attention=${runtime.attentionRuns}`,
      meta: runtime.detail,
      action: "open-domain",
      view: "runtimeops",
      actionLabel: "Open RuntimeOps"
    },
    {
      id: "platformops",
      title: "PlatformOps",
      tone: platform.status,
      value: `${platform.readyProviders}/${platform.providerCount || 0} ready`,
      summary: `gate=${platform.gateStatus}`,
      meta: platform.latestGate,
      action: "open-domain",
      view: "platformops",
      actionLabel: "Open PlatformOps"
    },
    {
      id: "policyops",
      title: "PolicyOps",
      tone: policy.latestDecision === "DENY" ? "danger" : policy.latestDecision === "DEFER" ? "warn" : "ok",
      value: policy.provider || "-",
      summary: `blocked=${policy.blockedCount}`,
      meta: `latest decision=${policy.latestDecision}; packs=${policy.packCount}`,
      action: "open-domain",
      view: "policyops",
      actionLabel: "Open PolicyOps"
    },
    {
      id: "governanceops",
      title: "GovernanceOps",
      tone: governance.pending > 0 ? "warn" : "ok",
      value: `${governance.pending} pending`,
      summary: `expiring=${governance.expiringSoon}`,
      meta: `source=${governance.source}`,
      action: "open-approvals-pending",
      actionLabel: "Open Approval Queue"
    },
    {
      id: "incidentops",
      title: "IncidentOps",
      tone: incidents.high > 0 ? "danger" : incidents.medium > 0 ? "warn" : "ok",
      value: `${incidents.total} active`,
      summary: `high=${incidents.high}; medium=${incidents.medium}`,
      meta: String(incidents.latest?.packageId || "no incident package loaded").trim(),
      action: "open-incidentops-active",
      actionLabel: "Open IncidentOps"
    }
  ];
}

function formatOpsLabel(value, fallback = "AgentOps") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized.endsWith("ops")) {
    return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1, -3)}Ops`;
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function titleCaseToken(value, fallback = "-") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function describeShellMode(value) {
  switch (normalizeStatus(value, "")) {
    case "live":
      return "Live desktop path";
    case "mock":
      return "Preview path";
    default:
      return `${titleCaseToken(value, "Unknown")} path`;
  }
}

function describeProcessMode(value) {
  switch (normalizeStatus(value, "")) {
    case "background_supervisor":
      return "Managed in the background";
    case "mock_only":
      return "Running in preview mode only";
    default:
      return titleCaseToken(value, "Process mode unavailable");
  }
}

function toneFromRuntimeStatus(value, fallback = "unknown") {
  const normalized = normalizeStatus(value, fallback);
  if (["ok", "healthy", "ready", "running", "loaded"].includes(normalized)) {
    return "ok";
  }
  if (["starting", "prepared", "pending", "mock_only", "not_required"].includes(normalized)) {
    return "warn";
  }
  if (["failed", "degraded", "deny", "blocked", "unreachable", "stopped"].includes(normalized)) {
    return "danger";
  }
  return fallback;
}

function deriveGatewayClientLabel(run = {}, context = {}) {
  const claims = readObject(context?.session?.claims);
  return formatIdentityLabel(
    run?.sourceClient?.name ||
      run?.sourceClient?.id ||
      run?.clientLabel ||
      run?.clientSurface ||
      run?.clientId ||
      run?.requestClientId ||
      run?.actorRef ||
      claims?.client_id ||
      context?.selectedAgentProfileId ||
      "local-gateway"
  );
}

function readGatewayHoldItems(context = {}) {
  return Array.isArray(context?.nativeGatewayHolds) ? context.nativeGatewayHolds : [];
}

function readNativeApprovalRailItems(context = {}) {
  return Array.isArray(context?.nativeApprovalRailItems) ? context.nativeApprovalRailItems : [];
}

function pendingGatewayHolds(context = {}) {
  return readGatewayHoldItems(context).filter(
    (item) => String(item?.state || "").trim().toLowerCase() === "held_pending_approval"
  );
}

function latestGatewayHold(context = {}) {
  return pickLatest(pendingGatewayHolds(context), ["updatedAtUtc", "createdAtUtc", "holdStartedAtUtc", "holdDeadlineAtUtc"]);
}

function canonicalCompanionInterpositionMessage(status, reason = "") {
  const normalizedStatus = normalizeStatus(status, "");
  const rawReason = String(reason || "").trim();
  if (
    rawReason &&
    ![
      "Interposition is ON. Epydios is governing supported requests.",
      "Interposition is OFF. Epydios is not governing supported requests.",
      "Interposition is turning on. Epydios is getting ready.",
      "Interposition is ON, but Epydios is still getting ready.",
      "Interposition cannot turn on until setup is complete."
    ].includes(rawReason)
  ) {
    return rawReason;
  }
  switch (normalizedStatus) {
    case "on":
      return "Interposition is ON. Companion is the live governance lane for supported requests.";
    case "off":
      return "Interposition is OFF. Companion is monitoring only; supported requests are not being governed in path.";
    case "warming":
      return "Interposition is turning ON. Companion will become the live governance lane when the launcher finishes reconciling.";
    case "gateway_unavailable":
      return "Interposition is ON, but the live governance path is still getting ready.";
    case "blocked_mock_mode":
    case "blocked_upstream_config":
      return "Interposition cannot turn ON until setup is complete. Companion stays in monitor mode.";
    default:
      return rawReason;
  }
}

function createCompanionInterpositionFeedback(shell = {}) {
  const interposition = readObject(shell.interposition);
  const status = normalizeStatus(
    interposition.status,
    interposition.enabled ? "warming" : "off"
  );
  const reason = String(interposition.reason || "").trim();
  switch (status) {
    case "on":
      return {
        tone: "ok",
        message: canonicalCompanionInterpositionMessage(status, reason)
      };
    case "off":
      return {
        tone: "danger",
        message: canonicalCompanionInterpositionMessage(status, reason)
      };
    case "warming":
      return {
        tone: "warn",
        message: canonicalCompanionInterpositionMessage(status, reason)
      };
    case "gateway_unavailable":
      return {
        tone: "warn",
        message: canonicalCompanionInterpositionMessage(status, reason)
      };
    case "blocked_mock_mode":
    case "blocked_upstream_config":
      return {
        tone: "danger",
        message: canonicalCompanionInterpositionMessage(status, reason)
      };
    default:
      return null;
  }
}

function gatewayHoldSummaryTarget(item = {}) {
  return formatIdentityLabel(
    item?.requestSummary?.title ||
      item?.governanceTarget?.targetRef ||
      item?.requestSummary?.reason
  );
}

function liveApprovalKindLabel(item = {}) {
  const decisionType = normalizeStatus(item?.decisionType, "");
  if (decisionType === "gateway_hold") {
    return "Held Request";
  }
  if (decisionType === "checkpoint") {
    return "Current Thread Approval";
  }
  return "Pending Review";
}

function liveApprovalTone(item = {}) {
  const expiresAt = parseTimeMs(item?.expiresAt);
  if (expiresAt > 0 && expiresAt - Date.now() <= 300000) {
    return "danger";
  }
  return "warn";
}

function createLiveApprovalItems(context = {}) {
  return readNativeApprovalRailItems(context)
    .filter((item) => {
      const decisionType = normalizeStatus(item?.decisionType, "");
      const status = normalizeStatus(item?.status, "");
      return status === "pending" && (decisionType === "gateway_hold" || decisionType === "checkpoint");
    })
    .map((item) => {
      const decisionType = normalizeStatus(item?.decisionType, "");
      const selectionId = formatIdentityLabel(item?.selectionId, "");
      const runId = formatIdentityLabel(item?.runId, "");
      const approvalId = formatIdentityLabel(item?.approvalId, "");
      const checkpointId = formatIdentityLabel(item?.checkpointId, "");
      const clientLabel =
        decisionType === "gateway_hold"
          ? formatIdentityLabel(item?.clientLabel || deriveGatewayClientLabel(item, context))
          : "Companion thread";
      return {
        selectionId,
        runId,
        approvalId,
        checkpointId,
        tone: liveApprovalTone(item),
        kindLabel: liveApprovalKindLabel(item),
        title:
          decisionType === "gateway_hold"
            ? formatIdentityLabel(item?.summary || gatewayHoldSummaryTarget(item), "Held request")
            : formatIdentityLabel(item?.summary || item?.reason, "Approval required"),
        summary:
          decisionType === "gateway_hold"
            ? `Client ${clientLabel} is waiting on review before ${formatIdentityLabel(item?.expiresAt, "-")}.`
            : `${formatIdentityLabel(item?.reason, "Current thread approval is waiting on review.")}`,
        primaryMeta:
          decisionType === "gateway_hold"
            ? `runId=${runId || "-"}; approvalId=${approvalId || "-"}`
            : `checkpointId=${checkpointId || "-"}; sessionId=${formatIdentityLabel(item?.sessionId, "-")}`,
        secondaryMeta:
          decisionType === "gateway_hold"
            ? `target=${formatIdentityLabel(item?.governanceTarget?.targetRef, "-")}`
            : `scope=${formatIdentityLabel(item?.scope, "-")}`,
        createdAt: formatIdentityLabel(item?.createdAt, "-"),
        expiresAt: formatIdentityLabel(item?.expiresAt, "-"),
        detailAction:
          decisionType === "gateway_hold" && runId
            ? "open-run-item"
            : "open-approval-queue",
        detailActionLabel:
          decisionType === "gateway_hold" && runId
            ? "Open Runtime"
            : "Open Workbench"
      };
    })
    .sort((left, right) => parseTimeMs(right?.createdAt || right?.expiresAt) - parseTimeMs(left?.createdAt || left?.expiresAt))
    .slice(0, 4);
}

function createSystemStatusRegion(context = {}) {
  const shell = readObject(context.nativeShell);
  const runtimeService = readObject(shell.runtimeService);
  const gatewayService = readObject(shell.gatewayService);
  const interposition = readObject(shell.interposition);
  const runtime = summarizeRuntime(context.health, context.runs, context.approvals);
  const platform = summarizePlatform(context.health, context.pipeline, context.providers);
  const policy = summarizePolicy(context.runs, context.settings);
  const aimxsPath = summarizeAimxsPath(context.settings, policy);
  const lastWorkbenchDomain = formatOpsLabel(context.lastWorkbenchDomain, "AgentOps");
  const startupError = formatIdentityLabel(shell.startupError, "");
  const derivedFeedback = context.companionFeedback ||
    (startupError
      ? {
          tone: "error",
          message: startupError
        }
      : createCompanionInterpositionFeedback(shell));
  return {
    feedback: derivedFeedback || null,
    cards: [
      {
        id: "companion-posture",
        title: "Daily Governance Lane",
        tone: "ok",
        value: "Companion",
        summary: `Default daily lane. Deep console: ${lastWorkbenchDomain}.`,
        meta: `Interposition: ${titleCaseToken(interposition.status || (interposition.enabled ? "warming" : "off"), "Unknown")}. Decision layer: ${aimxsPath.modeLabel}. Shell: ${describeShellMode(shell.mode)}.`
      },
      {
        id: "launcher",
        title: "Launcher",
        tone: toneFromRuntimeStatus(shell.launcherState, "warn"),
        value: titleCaseToken(shell.launcherState, "Unknown"),
        summary: `Bootstrap config ${titleCaseToken(shell.bootstrapConfigState, "unknown").toLowerCase()}; runtime path ${titleCaseToken(shell.runtimeState, runtime.status).toLowerCase()}.`,
        meta: startupError || describeProcessMode(shell.runtimeProcessMode)
      },
      {
        id: "runtime-service",
        title: "Runtime Service",
        tone: toneFromRuntimeStatus(runtimeService.state || runtime.status, "warn"),
        value: titleCaseToken(runtimeService.state || runtime.status, "Unknown"),
        summary: `Health: ${titleCaseToken(runtimeService.health || runtime.status, "Unknown").toLowerCase()}.`,
        meta: runtime.detail
      },
      {
        id: "gateway-service",
        title: "Gateway",
        tone: toneFromRuntimeStatus(gatewayService.state, "warn"),
        value: titleCaseToken(gatewayService.state, "Unknown"),
        summary: `Health: ${titleCaseToken(gatewayService.health, "unknown").toLowerCase()}.`,
        meta: `Route: ${titleCaseToken(platform.status, "unknown")}. Latest policy: ${policy.latestDecision}. Provider: ${aimxsPath.provider}.`
      }
    ],
    actions: [
      {
        id: "open-workbench",
        label: "Open Workbench",
        summary: `Deep review in ${lastWorkbenchDomain}`,
        action: "open-workbench"
      },
      {
        id: "restart-services",
        label: "Restart Services",
        summary: "Recheck the local launcher, runtime, and gateway",
        action: "restart-services"
      },
      {
        id: "show-diagnostics",
        label: "Show Diagnostics",
        summary: "Open deeper tools for launcher, gateway, and settings detail",
        action: "show-diagnostics"
      }
    ]
  };
}

function findRunById(context = {}, runId = "") {
  const normalizedRunId = String(runId || "").trim();
  if (!normalizedRunId) {
    return null;
  }
  return (
    readItems(context.runs).find((item) => String(item?.runId || "").trim() === normalizedRunId) || null
  );
}

function findApprovalById(context = {}, approvalId = "") {
  const normalizedApprovalId = String(approvalId || "").trim();
  if (!normalizedApprovalId) {
    return null;
  }
  return (
    readItems(context.approvals).find((item) => String(item?.approvalId || "").trim() === normalizedApprovalId) || null
  );
}

function findApprovalByRunId(context = {}, runId = "") {
  const normalizedRunId = String(runId || "").trim();
  if (!normalizedRunId) {
    return null;
  }
  return (
    readItems(context.approvals).find((item) => String(item?.runId || "").trim() === normalizedRunId) || null
  );
}

function findIncidentById(context = {}, incidentId = "") {
  const normalizedIncidentId = String(incidentId || "").trim();
  if (!normalizedIncidentId) {
    return null;
  }
  return (
    readItems(context.incidentHistory).find((item) => String(item?.id || "").trim() === normalizedIncidentId) || null
  );
}

function findIncidentByRunId(context = {}, runId = "") {
  const normalizedRunId = String(runId || "").trim();
  if (!normalizedRunId) {
    return null;
  }
  return (
    readItems(context.incidentHistory).find((item) => String(item?.runId || "").trim() === normalizedRunId) || null
  );
}

function collectRunEvidenceRefs(run = {}) {
  const policyResponse = readObject(run?.policyResponse);
  return Array.from(
    new Set(
      [
        ...(Array.isArray(policyResponse?.evidenceRefs) ? policyResponse.evidenceRefs : []),
        ...(Array.isArray(run?.evidenceRefs) ? run.evidenceRefs : [])
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function countLinkedAuditEvents(context = {}, runId = "", approvalId = "") {
  const normalizedRunId = String(runId || "").trim();
  const normalizedApprovalId = String(approvalId || "").trim();
  return readItems(context.audit).filter((item) => {
    if (normalizedRunId && String(item?.runId || "").trim() === normalizedRunId) {
      return true;
    }
    if (normalizedApprovalId && String(item?.approvalId || "").trim() === normalizedApprovalId) {
      return true;
    }
    return false;
  }).length;
}

function findLinkedGatewayHold(context = {}, options = {}) {
  const gatewayRequestId = String(options.gatewayRequestId || "").trim();
  const approvalId = String(options.approvalId || "").trim();
  const runId = String(options.runId || "").trim();
  return (
    pendingGatewayHolds(context).find((item) => {
      if (gatewayRequestId && String(item?.gatewayRequestId || "").trim() === gatewayRequestId) {
        return true;
      }
      if (approvalId && String(item?.approvalId || "").trim() === approvalId) {
        return true;
      }
      if (runId && String(item?.runId || "").trim() === runId) {
        return true;
      }
      return false;
    }) || null
  );
}

function findLinkedNativeApprovalRailItem(context = {}, options = {}) {
  const checkpointId = String(options.checkpointId || "").trim();
  const approvalId = String(options.approvalId || "").trim();
  const runId = String(options.runId || "").trim();
  return (
    readNativeApprovalRailItems(context).find((item) => {
      if (checkpointId && String(item?.checkpointId || "").trim() === checkpointId) {
        return true;
      }
      if (approvalId && String(item?.approvalId || "").trim() === approvalId) {
        return true;
      }
      if (runId && String(item?.runId || "").trim() === runId) {
        return true;
      }
      return false;
    }) || null
  );
}

function buildAttachedProofSummary(context = {}, options = {}) {
  const runId = String(options.runId || "").trim();
  const approvalId = String(options.approvalId || "").trim();
  const checkpointId = String(options.checkpointId || "").trim();
  const incidentId = String(options.incidentId || "").trim();
  const run = findRunById(context, runId);
  const incident = incidentId ? findIncidentById(context, incidentId) : findIncidentByRunId(context, runId);
  const evidenceBundleStatus = formatIdentityLabel(
    run?.evidenceBundleResponse?.status || run?.evidenceBundleStatus,
    ""
  );
  const evidenceRecordStatus = formatIdentityLabel(
    run?.evidenceRecordResponse?.status || run?.evidenceRecordStatus,
    ""
  );
  const evidenceRefs = collectRunEvidenceRefs(run || {});
  const auditCount = countLinkedAuditEvents(context, runId, approvalId);
  const summaryParts = [];
  if (evidenceBundleStatus) {
    summaryParts.push(`bundle=${evidenceBundleStatus}`);
  }
  if (evidenceRecordStatus) {
    summaryParts.push(`record=${evidenceRecordStatus}`);
  }
  if (incident?.packageId) {
    summaryParts.push(`incident=${formatIdentityLabel(incident.packageId)}`);
  }
  if (evidenceRefs.length > 0) {
    summaryParts.push(`refs=${evidenceRefs.length}`);
  }
  if (auditCount > 0) {
    summaryParts.push(`audit=${auditCount}`);
  }
  let tone = "warn";
  let label = "Proof pending";
  if (
    incident?.packageId ||
    ["sealed", "finalized", "ready", "available"].includes(normalizeStatus(evidenceBundleStatus, "")) ||
    ["recorded", "sealed", "finalized", "ready", "available"].includes(normalizeStatus(evidenceRecordStatus, ""))
  ) {
    tone = "ok";
    label = "Proof ready";
  } else if (evidenceRefs.length > 0 || auditCount > 0 || approvalId || checkpointId) {
    tone = "warn";
    label = "Proof attached";
  }
  let action = "";
  let actionLabel = "";
  if (runId) {
    action = "open-evidence-item";
    actionLabel = "Open Evidence";
  } else if (incident?.id) {
    action = "open-incident-item";
    actionLabel = "Open Incident";
  } else if (auditCount > 0 || approvalId || checkpointId) {
    action = "open-audit-depth";
    actionLabel = "Open Audit";
  }
  return {
    tone,
    label,
    summary:
      summaryParts.join("; ") ||
      (checkpointId
        ? "Thread approval proof lives on the checkpoint review path."
        : runId
          ? "Run-linked proof is still forming."
          : "Open the owner surface for deeper proof context."),
    action,
    actionLabel,
    runId,
    approvalId,
    checkpointId,
    gatewayRequestId: String(options.gatewayRequestId || "").trim(),
    sourceClient: String(options.sourceClient || "").trim(),
    incidentId: String(incident?.id || incidentId || "").trim(),
    bundleStatus: evidenceBundleStatus,
    recordStatus: evidenceRecordStatus,
    evidenceRefCount: evidenceRefs.length,
    auditCount,
    incidentPackageId: String(incident?.packageId || "").trim(),
    incidentStatus: String(incident?.filingStatus || "").trim()
  };
}

function buildCompanionArrivalRationale(view = "", kind = "") {
  const normalizedView = String(view || "").trim().toLowerCase();
  const normalizedKind = String(kind || "").trim().toLowerCase();
  switch (normalizedView) {
    case "governanceops":
      return "Companion opened governance depth because this governed request needs deeper approval structure, receipt continuity, or exception review.";
    case "runtimeops":
      return "Companion opened runtime depth because the governed run needs deeper runtime investigation and proof follow-through.";
    case "auditops":
      return "Companion opened audit depth because the governed request needs decision trace and receipt continuity beyond the daily lane.";
    case "evidenceops":
      return "Companion opened evidence depth because attached proof is ready for bundle, provenance, or artifact review.";
    case "incidentops":
      return "Companion opened incident depth because escalation or closure follow-through is now part of the governed path.";
    default:
      if (normalizedKind === "approval" || normalizedKind === "approval-queue") {
        return "Companion opened Workbench depth because the governed request still needs approval review and receipt continuity.";
      }
      if (normalizedKind === "run" || normalizedKind === "runs") {
        return "Companion opened Workbench depth because the governed run needs deeper investigation beyond the daily lane.";
      }
      return "Companion opened Workbench depth because this governed request needs deeper review than the daily lane should carry.";
  }
}

function buildCompanionReceiptSummary(context = {}, options = {}) {
  const approval = options.approval && typeof options.approval === "object" ? options.approval : null;
  const gatewayHold = options.gatewayHold && typeof options.gatewayHold === "object" ? options.gatewayHold : null;
  const nativeApprovalRailItem =
    options.nativeApprovalRailItem && typeof options.nativeApprovalRailItem === "object"
      ? options.nativeApprovalRailItem
      : null;
  const checkpointId = String(options.checkpointId || "").trim();
  const approvalId = String(approval?.approvalId || options.approvalId || "").trim();
  const approvalStatus = normalizeStatus(approval?.status, "");
  if (approvalId) {
    if (approvalStatus === "approved" || approvalStatus === "denied") {
      return {
        tone: "ok",
        label: "Decision receipt ready",
        summary: `Approval ${approvalId} is ${approvalStatus}; the decision receipt path is already attached to this governed item.`
      };
    }
    if (approvalStatus === "pending") {
      return {
        tone: "warn",
        label: "Approval receipt pending",
        summary: `Approval ${approvalId} is still pending review, so receipt continuity is anchored to the live approval path.`
      };
    }
    return {
      tone: "warn",
      label: "Approval receipt linked",
      summary: `Approval ${approvalId} still carries the receipt path for this governed request.`
    };
  }
  if (checkpointId) {
    return {
      tone: "warn",
      label: "Checkpoint receipt path",
      summary: `Checkpoint ${checkpointId} stays attached to the current-thread approval path until that review is resolved.`
    };
  }
  if (gatewayHold?.gatewayRequestId || gatewayHold?.approvalId) {
    return {
      tone: "warn",
      label: "Gateway hold receipt path",
      summary: `Held request ${formatIdentityLabel(gatewayHold?.gatewayRequestId || gatewayHold?.approvalId, "-")} is still carrying the live review receipt path.`
    };
  }
  if (nativeApprovalRailItem?.selectionId) {
    return {
      tone: "warn",
      label: "Live review receipt path",
      summary: `Selection ${formatIdentityLabel(nativeApprovalRailItem.selectionId, "-")} is still attached to the live review rail.`
    };
  }
  return {
    tone: "neutral",
    label: "Receipt continuity attached",
    summary: "This governed item still carries receipt continuity into Workbench depth."
  };
}

function buildCompanionIncidentAnchor(options = {}) {
  const incidentId = String(options.incidentId || "").trim();
  const incidentPackageId = String(options.incidentPackageId || "").trim();
  const incidentStatus = normalizeStatus(options.incidentStatus, "");
  if (incidentPackageId) {
    const label =
      incidentStatus === "closed" || incidentStatus === "resolved"
        ? "Incident closed"
        : incidentStatus === "draft" || incidentStatus === "drafted"
          ? "Incident draft"
          : incidentStatus
            ? `Incident ${titleCaseToken(incidentStatus, "active").toLowerCase()}`
            : "Incident linked";
    const tone =
      incidentStatus === "closed" || incidentStatus === "resolved"
        ? "ok"
        : incidentStatus === "draft" || incidentStatus === "drafted"
          ? "warn"
          : "danger";
    return {
      id: "incident",
      title: "Incident",
      tone,
      label,
      summary: `Incident package ${incidentPackageId} is attached to this governed path.`,
      meta: joinMetaLine(
        [incidentStatus ? `status=${formatIdentityLabel(options.incidentStatus)}` : "", incidentId ? `incident=${incidentId}` : ""],
        "Incident follow-through now belongs to IncidentOps depth."
      )
    };
  }
  if (incidentId) {
    return {
      id: "incident",
      title: "Incident",
      tone: "warn",
      label: "Incident attached",
      summary: `Incident follow-through is already part of this governed path.`,
      meta: `incident=${incidentId}`
    };
  }
  return {
    id: "incident",
    title: "Incident",
    tone: "neutral",
    label: "No incident handoff",
    summary: "Incident follow-through is not attached to this governed path.",
    meta: "Open IncidentOps only when escalation or closure follow-through is needed."
  };
}

function buildCompanionProofSpine(options = {}) {
  const proof = options.proof && typeof options.proof === "object" ? options.proof : {};
  const receipt = options.receipt && typeof options.receipt === "object" ? options.receipt : {};
  const decisionMeta = String(options.decisionMeta || "").trim();
  return {
    decision: {
      id: "decision",
      title: "Decision",
      tone: mergeCompanionTone(options.decisionTone, receipt.tone, proof.tone),
      label: formatIdentityLabel(options.decisionLabel, "Governed review"),
      summary: formatIdentityLabel(
        options.decisionSummary,
        "This governed item is still the active decision path."
      ),
      meta: decisionMeta || joinMetaLine(
        [
          options.decisionState ? `state=${formatIdentityLabel(options.decisionState)}` : "",
          options.runId ? `run=${formatIdentityLabel(options.runId)}` : "",
          options.approvalId ? `approval=${formatIdentityLabel(options.approvalId)}` : "",
          options.checkpointId ? `checkpoint=${formatIdentityLabel(options.checkpointId)}` : "",
          options.sourceClient ? `client=${formatIdentityLabel(options.sourceClient)}` : "",
          options.gatewayRequestId ? `gatewayRequest=${formatIdentityLabel(options.gatewayRequestId)}` : ""
        ],
        "Companion keeps this governed decision attached into deeper review."
      )
    },
    receipt: {
      id: "receipt",
      title: "Receipt",
      tone: receipt.tone || "neutral",
      label: receipt.label || "Receipt continuity attached",
      summary: receipt.summary || "Receipt continuity stays attached to this governed path.",
      meta: joinMetaLine(
        [
          options.approvalId ? `approval=${formatIdentityLabel(options.approvalId)}` : "",
          options.checkpointId ? `checkpoint=${formatIdentityLabel(options.checkpointId)}` : "",
          options.gatewayRequestId ? `gatewayRequest=${formatIdentityLabel(options.gatewayRequestId)}` : ""
        ],
        "Receipt continuity remains attached from Companion into deeper review."
      )
    },
    proof: {
      id: "proof",
      title: "Proof",
      tone: proof.tone || "warn",
      label: proof.label || "Proof pending",
      summary: proof.summary || "Proof continuity stays attached to this governed path.",
      meta: joinMetaLine(
        [
          proof.bundleStatus ? `bundle=${formatIdentityLabel(proof.bundleStatus)}` : "",
          proof.recordStatus ? `record=${formatIdentityLabel(proof.recordStatus)}` : "",
          Number.isFinite(proof.evidenceRefCount) && proof.evidenceRefCount > 0 ? `refs=${proof.evidenceRefCount}` : "",
          Number.isFinite(proof.auditCount) && proof.auditCount > 0 ? `audit=${proof.auditCount}` : ""
        ],
        "Open Workbench depth when bundle, provenance, or audit detail is needed."
      )
    },
    incident: buildCompanionIncidentAnchor({
      incidentId: options.incidentId || proof.incidentId,
      incidentPackageId: options.incidentPackageId || proof.incidentPackageId,
      incidentStatus: options.incidentStatus || proof.incidentStatus
    })
  };
}

function attachCompanionProofSpine(item = {}, options = {}) {
  const proof = item?.proof && typeof item.proof === "object" ? item.proof : {};
  const receipt = item?.receipt && typeof item.receipt === "object" ? item.receipt : {};
  return {
    ...item,
    spine: buildCompanionProofSpine({
      decisionTone: options.decisionTone || item.tone || proof.tone || receipt.tone,
      decisionLabel:
        options.decisionLabel ||
        item.kindLabel ||
        item.state ||
        item.actionName ||
        item.title ||
        "Governed review",
      decisionSummary: options.decisionSummary || item.summary,
      decisionState: options.decisionState || item.state || item.kindLabel,
      decisionMeta:
        options.decisionMeta ||
        joinMetaLine([item.primaryMeta, item.secondaryMeta], ""),
      runId: item.runId,
      approvalId: item.approvalId,
      checkpointId: item.checkpointId,
      gatewayRequestId: item.gatewayRequestId,
      sourceClient: item.sourceClient || item.clientLabel,
      incidentId: item.incidentId,
      proof,
      receipt,
      incidentPackageId: proof.incidentPackageId,
      incidentStatus: proof.incidentStatus
    })
  };
}

function buildHandoffDecisionLabel(kind = "", view = "") {
  switch (String(kind || "").trim().toLowerCase()) {
    case "approval":
    case "approval-queue":
      return "Governed review";
    case "run":
    case "runs":
      return "Run investigation";
    case "audit":
      return "Trace review";
    case "incident":
      return "Incident follow-through";
    default:
      if (String(view || "").trim()) {
        return `${formatOpsLabel(view, "Workbench")} depth`;
      }
      return "Workbench depth";
  }
}

export function createCompanionProofHandoffContext(context = {}, options = {}) {
  const kind = String(options.kind || "handoff").trim().toLowerCase() || "handoff";
  const view = String(options.view || "").trim().toLowerCase();
  const runId = String(options.runId || "").trim();
  const approvalId = String(options.approvalId || "").trim();
  const checkpointId = String(options.checkpointId || "").trim();
  const gatewayRequestId = String(options.gatewayRequestId || "").trim();
  const incidentId = String(options.incidentId || "").trim();
  const gatewayHold = findLinkedGatewayHold(context, { gatewayRequestId, approvalId, runId });
  const nativeApprovalRailItem = findLinkedNativeApprovalRailItem(context, {
    checkpointId,
    approvalId,
    runId
  });
  const approval = findApprovalById(context, approvalId) || findApprovalByRunId(context, runId);
  const sourceClient = formatIdentityLabel(
    options.sourceClient ||
      gatewayHold?.sourceClient?.name ||
      gatewayHold?.clientSurface ||
      nativeApprovalRailItem?.clientLabel,
    ""
  );
  const proof = buildAttachedProofSummary(context, {
    runId,
    approvalId,
    checkpointId,
    gatewayRequestId,
    incidentId,
    sourceClient
  });
  const receipt = buildCompanionReceiptSummary(context, {
    approval,
    approvalId,
    checkpointId,
    gatewayHold,
    nativeApprovalRailItem
  });
  const arrivalRationale = buildCompanionArrivalRationale(view, kind);
  return {
    kind,
    view,
    runId,
    approvalId,
    checkpointId,
    gatewayRequestId,
    sourceClient,
    incidentId: String(proof.incidentId || incidentId || "").trim(),
    openedFrom: String(options.openedFrom || "").trim(),
    arrivalRationale,
    proof,
    receipt,
    spine: buildCompanionProofSpine({
      decisionTone: mergeCompanionTone(receipt.tone, proof.tone),
      decisionLabel: buildHandoffDecisionLabel(kind, view),
      decisionSummary: arrivalRationale,
      decisionState: view ? `target=${formatOpsLabel(view, "Workbench")}` : "target=Workbench",
      decisionMeta: joinMetaLine(
        [
          view ? `target=${formatOpsLabel(view, "Workbench")}` : "",
          runId ? `run=${formatIdentityLabel(runId)}` : "",
          approvalId ? `approval=${formatIdentityLabel(approvalId)}` : "",
          checkpointId ? `checkpoint=${formatIdentityLabel(checkpointId)}` : "",
          sourceClient ? `client=${formatIdentityLabel(sourceClient)}` : ""
        ],
        "Companion keeps the same governed item attached into this deeper workspace."
      ),
      runId,
      approvalId,
      checkpointId,
      gatewayRequestId,
      sourceClient,
      incidentId: String(proof.incidentId || incidentId || "").trim(),
      proof,
      receipt,
      incidentPackageId: proof.incidentPackageId,
      incidentStatus: proof.incidentStatus
    }),
    bundleStatus: proof.bundleStatus,
    recordStatus: proof.recordStatus,
    evidenceRefCount: proof.evidenceRefCount,
    auditCount: proof.auditCount,
    incidentPackageId: proof.incidentPackageId,
    incidentStatus: proof.incidentStatus
  };
}

function createAttentionItems(context = {}) {
  const approvals = readItems(context.approvals);
  const runs = readItems(context.runs);
  const shell = readObject(context.nativeShell);
  const runtimeService = readObject(shell.runtimeService);
  const gatewayService = readObject(shell.gatewayService);
  const incidents = summarizeIncidents(context.incidentHistory, context.runs, context.approvals);
  const pendingHolds = pendingGatewayHolds(context);
  const liveApprovals = createLiveApprovalItems(context);
  const latestHold = latestGatewayHold(context);
  const pendingApprovals = approvals.filter(
    (item) => String(item?.status || "").trim().toUpperCase() === "PENDING"
  );
  const latestPendingApproval = pickLatest(
    pendingApprovals,
    ["updatedAt", "expiresAt", "createdAt", "requestedAt"]
  );
  const latestAttentionRun = pickLatest(
    runs.filter((item) => {
      const status = String(item?.status || "").trim().toUpperCase();
      const decision = String(item?.policyDecision || "").trim().toUpperCase();
      return status === "FAILED" || status === "POLICY_BLOCKED" || decision === "DENY" || decision === "DEFER";
    }),
    ["updatedAt", "createdAt"]
  );
  const items = [];
  if (pendingHolds.length > 0) {
    const holdDeadlineMs = parseTimeMs(latestHold?.holdDeadlineAtUtc);
    items.push({
      title: "Held request review",
      tone: holdDeadlineMs > 0 && holdDeadlineMs - Date.now() <= 300000 ? "danger" : "warn",
      value: String(pendingHolds.length),
      detail: `Latest approval ${formatIdentityLabel(latestHold?.approvalId, "-")} from ${deriveGatewayClientLabel(latestHold, context)} should be reviewed before ${formatIdentityLabel(latestHold?.holdDeadlineAtUtc, "-")}.`,
      action: liveApprovals.length > 0 ? "focus-live-approvals" : "open-approval-item",
      actionLabel: liveApprovals.length > 0 ? "Review In Companion" : "Open Workbench",
      runId: String(latestHold?.runId || "").trim(),
      approvalId: String(latestHold?.approvalId || "").trim()
    });
  } else if (pendingApprovals.length > 0) {
    items.push({
      title: "Approval required",
      tone: countExpiringApprovals(approvals) > 0 ? "danger" : "warn",
      value: String(pendingApprovals.length),
      detail: `Latest approval ${formatIdentityLabel(latestPendingApproval?.approvalId, "-")}. ${countExpiringApprovals(approvals)} expiring soon.`,
      action: liveApprovals.length > 0 ? "focus-live-approvals" : "open-approval-item",
      actionLabel: liveApprovals.length > 0 ? "Review In Companion" : "Open Workbench",
      runId: String(latestPendingApproval?.runId || "").trim(),
      approvalId: String(latestPendingApproval?.approvalId || "").trim()
    });
  }
  const runtimeServiceNeedsAttention =
    ["failed", "degraded", "stopped"].includes(normalizeStatus(runtimeService.state, "")) ||
    ["unreachable"].includes(normalizeStatus(runtimeService.health, ""));
  const gatewayNeedsAttention =
    ["failed", "degraded", "stopped"].includes(normalizeStatus(gatewayService.state, "")) ||
    ["unreachable"].includes(normalizeStatus(gatewayService.health, ""));
  if (runtimeServiceNeedsAttention || gatewayNeedsAttention) {
    const affected = gatewayNeedsAttention ? "Gateway" : "Runtime service";
    const state = gatewayNeedsAttention
      ? formatIdentityLabel(gatewayService.state, gatewayService.health)
      : formatIdentityLabel(runtimeService.state, runtimeService.health);
    items.push({
      title: `${affected} degraded`,
      tone: "danger",
      value: state,
      detail: "Open Diagnostics before trusting the current local path.",
      action: "show-diagnostics",
      actionLabel: "Open Diagnostics"
    });
  }
  if (countAttentionRuns(runs) > 0) {
    items.push({
      title: "Runs requiring attention",
      tone: "danger",
      value: String(countAttentionRuns(runs)),
      detail: `Latest affected run: ${String(latestAttentionRun?.runId || "-").trim() || "-"}.`,
      action: "open-run-item",
      runId: String(latestAttentionRun?.runId || "").trim(),
      actionLabel: "Open Runtime"
    });
  }
  if (incidents.total > 0) {
    items.push({
      title: "Incident escalation pending",
      tone: incidents.high > 0 ? "danger" : "warn",
      value: String(incidents.total),
      detail: `Latest incident package: ${String(incidents.latest?.packageId || "-").trim() || "-"}.`,
      action: "open-incident-item",
      actionLabel: "Open Incident",
      incidentId: String(incidents.latest?.id || "").trim(),
      runId: String(incidents.latest?.runId || "").trim()
    });
  }
  return items.slice(0, 5);
}

function createRecentGovernedActions(context = {}) {
  const approvals = readItems(context.approvals);
  const pendingHolds = pendingGatewayHolds(context);
  const approvalsByRun = new Map(
    approvals
      .filter((item) => String(item?.runId || "").trim())
      .map((item) => [String(item.runId).trim(), item])
  );
  const recentItemsByRun = new Map();
  pendingHolds.forEach((hold) => {
    const runId = String(hold?.runId || "").trim();
    if (!runId) {
      return;
    }
    const approvalId = String(hold?.approvalId || "").trim();
    const linkedApproval = approvalsByRun.get(runId) || findApprovalById(context, approvalId);
    const proof = buildAttachedProofSummary(context, {
      runId,
      approvalId
    });
    const receipt = buildCompanionReceiptSummary(context, {
      approval: linkedApproval,
      approvalId,
      gatewayHold: hold
    });
    recentItemsByRun.set(runId, {
      ...attachCompanionProofSpine({
      id: runId,
      clientLabel: deriveGatewayClientLabel(hold, context),
      sourceClient: deriveGatewayClientLabel(hold, context),
      actionName: gatewayHoldSummaryTarget(hold),
      targetSummary:
        formatScopeLabel([hold?.tenantId], [hold?.projectId]) ||
        formatIdentityLabel(hold?.governanceTarget?.targetRef, "-"),
      state: formatIdentityLabel(hold?.state, "-"),
      policyDecision: "DEFER",
      summary: `Client ${deriveGatewayClientLabel(hold, context)} is waiting on review for ${gatewayHoldSummaryTarget(hold)}.`,
      occurredAt: formatIdentityLabel(hold?.holdStartedAtUtc || hold?.createdAtUtc, "-"),
      runId,
      approvalId,
      gatewayRequestId: formatIdentityLabel(hold?.gatewayRequestId, ""),
      action: "open-approval-item",
      actionLabel: "Open Workbench",
      proof,
      receipt
      }, {
        decisionLabel: "Held request",
        decisionState: formatIdentityLabel(hold?.state, "held_pending_approval")
      })
    });
  });
  readItems(context.runs)
    .slice()
    .sort((left, right) => {
      const leftTs = parseTimeMs(left?.updatedAt || left?.createdAt);
      const rightTs = parseTimeMs(right?.updatedAt || right?.createdAt);
      return rightTs - leftTs;
    })
    .map((run) => {
      const runId = String(run?.runId || "").trim();
      if (!runId || recentItemsByRun.has(runId)) {
        return null;
      }
      const linkedApproval = approvalsByRun.get(runId) || null;
      const policyDecision = String(run?.policyDecision || "").trim().toUpperCase() || "-";
      const approvalRequired =
        String(linkedApproval?.status || "").trim().toUpperCase() === "PENDING" || policyDecision === "DEFER";
      const proof = buildAttachedProofSummary(context, {
        runId,
        approvalId: String(linkedApproval?.approvalId || "").trim()
      });
      const receipt = buildCompanionReceiptSummary(context, {
        approval: linkedApproval,
        approvalId: String(linkedApproval?.approvalId || "").trim(),
        gatewayHold: findLinkedGatewayHold(context, {
          approvalId: String(linkedApproval?.approvalId || "").trim(),
          runId
        })
      });
      return [
        runId,
        attachCompanionProofSpine({
        id: runId || String(run?.requestId || "").trim() || `run-${Math.random().toString(36).slice(2, 7)}`,
        clientLabel: deriveGatewayClientLabel(run, context),
        sourceClient: deriveGatewayClientLabel(run, context),
        actionName: formatIdentityLabel(
          run?.requestedAction || run?.action || run?.requestId || "governed action"
        ),
        targetSummary:
          formatScopeLabel([run?.tenantId], [run?.projectId]) ||
          formatIdentityLabel(run?.requestId, runId || "-"),
        state: formatIdentityLabel(run?.status, "-"),
        policyDecision,
        summary: `Policy ${policyDecision} on ${formatIdentityLabel(run?.requestId, runId || "-")} is part of the governed path.`,
        occurredAt: formatIdentityLabel(run?.updatedAt || run?.createdAt, "-"),
        runId,
        approvalId: String(linkedApproval?.approvalId || "").trim(),
        gatewayRequestId: formatIdentityLabel(run?.requestId, ""),
        action: approvalRequired ? "open-approval-item" : "open-run-item",
        actionLabel: approvalRequired ? "Open Workbench" : "Open Runtime",
        proof,
        receipt
        }, {
          decisionLabel: formatIdentityLabel(run?.status, "Governed action"),
          decisionState: policyDecision
        })
      ];
    })
    .filter(Boolean)
    .forEach(([runId, item]) => {
      recentItemsByRun.set(runId, item);
    });
  return Array.from(recentItemsByRun.values())
    .sort((left, right) => parseTimeMs(right?.occurredAt) - parseTimeMs(left?.occurredAt))
    .slice(0, 5);
}

function formatEventLabel(value, fallback = "Audit Event") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function auditEventTone(item = {}) {
  const decision = String(item?.decision || "").trim().toUpperCase();
  const eventName = String(item?.event || "").trim().toLowerCase();
  if (decision === "DENY" || decision === "DEFER" || /deny|defer|fail|error|blocked/.test(eventName)) {
    return "danger";
  }
  if (decision === "ALLOW" || /allow|approved|success|completed/.test(eventName)) {
    return "ok";
  }
  return "warn";
}

function createLiveAuditEventItems(context = {}) {
  return readItems(context.audit)
    .slice()
    .sort((left, right) => parseTimeMs(right?.ts) - parseTimeMs(left?.ts))
    .map((item) => {
      const runId = String(item?.runId || "").trim();
      const approvalId = String(item?.approvalId || "").trim();
      return {
        id: `${String(item?.event || "audit.event").trim()}@${String(item?.ts || "").trim()}`,
        title: formatEventLabel(item?.event, "Audit Event"),
        tone: auditEventTone(item),
        summary:
          String(item?.message || item?.reason || "").trim() ||
          `Latest live event from ${formatIdentityLabel(context?.audit?.source, "audit")}.`,
        primaryMeta: `decision=${formatIdentityLabel(item?.decision, "-")}`,
        secondaryMeta: `runId=${runId || "-"}; approvalId=${approvalId || "-"}`,
        occurredAt: formatIdentityLabel(item?.ts, "-"),
        action: approvalId ? "open-approval-item" : runId ? "open-run-item" : "open-audit-depth",
        actionLabel: approvalId
          ? "Open Workbench"
          : runId
            ? "Open Runtime"
            : "Open Audit",
        runId,
        approvalId
      };
    })
    .slice(0, 5);
}

function createIncidentEscalationItems(context = {}) {
  const items = readItems(context.incidentHistory)
    .slice()
    .sort((left, right) => {
      const leftTs = parseTimeMs(left?.filingUpdatedAt || left?.generatedAt);
      const rightTs = parseTimeMs(right?.filingUpdatedAt || right?.generatedAt);
      return rightTs - leftTs;
    })
    .map((item) => {
      const severity = deriveIncidentSeverity(item, readItems(context.runs), readItems(context.approvals));
      return {
        id: String(item?.id || item?.packageId || "").trim(),
        title: formatIdentityLabel(item?.packageId, "Incident package"),
        tone: severity === "high" ? "danger" : severity === "medium" ? "warn" : "ok",
        summary:
          severity === "high"
            ? "Active escalation is shaping the live governance path right now."
            : severity === "medium"
              ? "Current incident context still needs operator attention."
              : "Recent incident context is available in Companion before deeper packaging work.",
        primaryMeta: `status=${formatIdentityLabel(item?.filingStatus, "-")}; runId=${formatIdentityLabel(item?.runId, "-")}`,
        secondaryMeta: `approval=${formatIdentityLabel(item?.approvalStatus, "-")}; severity=${severity}`,
        occurredAt: formatIdentityLabel(item?.filingUpdatedAt || item?.generatedAt, "-"),
        action: "open-incident-item",
        actionLabel: "Open Incident",
        incidentId: String(item?.id || "").trim(),
        runId: String(item?.runId || "").trim()
      };
    });
  if (items.length > 0) {
    return items.slice(0, 3);
  }
  const latestAttentionRun = pickLatest(
    readItems(context.runs).filter((item) => {
      const status = String(item?.status || "").trim().toUpperCase();
      const decision = String(item?.policyDecision || "").trim().toUpperCase();
      return status === "FAILED" || status === "POLICY_BLOCKED" || decision === "DENY" || decision === "DEFER";
    }),
    ["updatedAt", "createdAt"]
  );
  if (latestAttentionRun) {
    return [
      {
        id: "escalation-candidate",
        title: "Escalation candidate",
        tone: "danger",
        summary: "A failed or blocked governed run is still shaping live operator posture even before full incident packaging.",
        primaryMeta: `runId=${formatIdentityLabel(latestAttentionRun?.runId, "-")}; status=${formatIdentityLabel(latestAttentionRun?.status, "-")}`,
        secondaryMeta: `policy=${formatIdentityLabel(latestAttentionRun?.policyDecision, "-")}`,
        occurredAt: formatIdentityLabel(latestAttentionRun?.updatedAt || latestAttentionRun?.createdAt, "-"),
        action: "open-run-item",
        actionLabel: "Open Runtime",
        runId: String(latestAttentionRun?.runId || "").trim()
      }
    ];
  }
  const shell = readObject(context.nativeShell);
  const runtimeService = readObject(shell.runtimeService);
  const gatewayService = readObject(shell.gatewayService);
  if (
    ["degraded", "failed", "stopped"].includes(normalizeStatus(runtimeService.state, "")) ||
    ["degraded", "failed", "stopped"].includes(normalizeStatus(gatewayService.state, ""))
  ) {
    return [
      {
        id: "service-escalation",
        title: "Service escalation",
        tone: "danger",
        summary: "Runtime or gateway degradation is part of the current live incident posture.",
        primaryMeta: `runtime=${formatIdentityLabel(runtimeService.state, "-")}; gateway=${formatIdentityLabel(gatewayService.state, "-")}`,
        secondaryMeta: "Open Diagnostics for the deeper service path and recovery detail.",
        occurredAt: "-",
        action: "show-diagnostics",
        actionLabel: "Show Diagnostics"
      }
    ];
  }
  return [];
}

function queueKindWeight(value = "") {
  switch (String(value || "").trim()) {
    case "approval":
      return 0;
    case "incident":
      return 1;
    case "run":
      return 2;
    default:
      return 3;
  }
}

function queueToneWeight(value = "") {
  switch (normalizeStatus(value, "")) {
    case "danger":
      return 0;
    case "warn":
      return 1;
    case "ok":
      return 2;
    default:
      return 3;
  }
}

function createGovernedRequestQueueItems(context = {}) {
  const items = [];
  const queuedRunIds = new Set();
  const liveApprovals = createLiveApprovalItems(context);
  liveApprovals.forEach((item) => {
    const runId = String(item?.runId || "").trim();
    const approvalId = String(item?.approvalId || "").trim();
    const checkpointId = String(item?.checkpointId || "").trim();
    const linkedApproval = findApprovalById(context, approvalId) || findApprovalByRunId(context, runId);
    const linkedGatewayHold = findLinkedGatewayHold(context, {
      approvalId,
      runId
    });
    const proof = buildAttachedProofSummary(context, {
      runId,
      approvalId,
      checkpointId
    });
    const receipt = buildCompanionReceiptSummary(context, {
      approval: linkedApproval,
      approvalId,
      checkpointId,
      gatewayHold: linkedGatewayHold,
      nativeApprovalRailItem: item
    });
    if (runId) {
      queuedRunIds.add(runId);
    }
    items.push({
      ...attachCompanionProofSpine({
      id: `queue-approval-${item.selectionId || approvalId || runId || items.length}`,
      queueKind: "approval",
      tone: item.tone || "warn",
      kindLabel: item.kindLabel || "Pending Review",
      title: item.title || "Pending review",
      summary: item.summary || "-",
      primaryMeta: item.primaryMeta || "-",
      secondaryMeta: item.secondaryMeta || "-",
      occurredAt: formatIdentityLabel(item.createdAt || item.expiresAt, "-"),
      runId,
      approvalId,
      checkpointId,
      gatewayRequestId: String(linkedGatewayHold?.gatewayRequestId || "").trim(),
      sourceClient: String(item?.clientLabel || "").trim(),
      selectionId: String(item?.selectionId || "").trim(),
      action: item.detailAction || "open-approval-item",
      actionLabel: item.detailActionLabel || "Open Workbench",
      proof,
      receipt
      }, {
        decisionState: item.kindLabel || "Pending Review"
      })
    });
  });

  const incidentItems = createIncidentEscalationItems(context);
  incidentItems.forEach((item) => {
    const runId = String(item?.runId || "").trim();
    const linkedApproval = findApprovalByRunId(context, runId);
    const proof = buildAttachedProofSummary(context, {
      runId,
      incidentId: String(item?.incidentId || item?.id || "").trim()
    });
    const receipt = buildCompanionReceiptSummary(context, {
      approval: linkedApproval,
      approvalId: String(linkedApproval?.approvalId || "").trim(),
      gatewayHold: findLinkedGatewayHold(context, {
        approvalId: String(linkedApproval?.approvalId || "").trim(),
        runId
      })
    });
    if (runId && queuedRunIds.has(runId)) {
      return;
    }
    if (runId) {
      queuedRunIds.add(runId);
    }
    items.push({
      ...attachCompanionProofSpine({
      id: `queue-incident-${String(item?.id || runId || items.length).trim()}`,
      queueKind: "incident",
      tone: item.tone || "warn",
      kindLabel: "Incident",
      title: item.title || "Incident context",
      summary: item.summary || "-",
      primaryMeta: item.primaryMeta || "-",
      secondaryMeta: item.secondaryMeta || "-",
      occurredAt: formatIdentityLabel(item.occurredAt, "-"),
      runId,
      incidentId: String(item?.incidentId || item?.id || "").trim(),
      action: item.action || "open-incident-item",
      actionLabel: item.actionLabel || "Open Incident",
      proof,
      receipt
      }, {
        decisionState: "Incident"
      })
    });
  });

  readItems(context.runs)
    .slice()
    .sort((left, right) => {
      const leftTs = parseTimeMs(left?.updatedAt || left?.createdAt);
      const rightTs = parseTimeMs(right?.updatedAt || right?.createdAt);
      return rightTs - leftTs;
    })
    .forEach((run) => {
      const runId = String(run?.runId || "").trim();
      if (!runId || queuedRunIds.has(runId)) {
        return;
      }
      const status = String(run?.status || "").trim().toUpperCase();
      const decision = String(run?.policyDecision || "").trim().toUpperCase();
      if (!["FAILED", "POLICY_BLOCKED"].includes(status) && !["DENY", "DEFER"].includes(decision)) {
        return;
      }
      queuedRunIds.add(runId);
      const linkedApproval = readItems(context.approvals).find(
        (item) => String(item?.runId || "").trim() === runId
      );
      const proof = buildAttachedProofSummary(context, {
        runId,
        approvalId: String(linkedApproval?.approvalId || "").trim()
      });
      const receipt = buildCompanionReceiptSummary(context, {
        approval: linkedApproval,
        approvalId: String(linkedApproval?.approvalId || "").trim(),
        gatewayHold: findLinkedGatewayHold(context, {
          approvalId: String(linkedApproval?.approvalId || "").trim(),
          runId
        })
      });
      items.push({
        ...attachCompanionProofSpine({
        id: `queue-run-${runId}`,
        queueKind: "run",
        tone: status === "FAILED" || decision === "DENY" ? "danger" : "warn",
        kindLabel: "Run Attention",
        title: formatIdentityLabel(run?.requestedAction || run?.action || runId, "Governed run"),
        summary:
          decision === "DEFER"
            ? "The governed run is deferred and still needs an operator move."
            : decision === "DENY"
              ? "The governed run is blocked by policy and needs review."
              : "The governed run is still shaping the active operator lane.",
        primaryMeta: `status=${formatIdentityLabel(run?.status, "-")}; policy=${decision || "-"}`,
        secondaryMeta: `runId=${runId}; target=${formatIdentityLabel(run?.requestId, "-")}`,
        occurredAt: formatIdentityLabel(run?.updatedAt || run?.createdAt, "-"),
        runId,
        approvalId: String(linkedApproval?.approvalId || "").trim(),
        action: "open-run-item",
        actionLabel: "Open Runtime",
        proof,
        receipt
        }, {
          decisionState: decision || status
        })
      });
    });

  return items
    .sort((left, right) => {
      const toneDelta = queueToneWeight(left?.tone) - queueToneWeight(right?.tone);
      if (toneDelta !== 0) {
        return toneDelta;
      }
      const kindDelta = queueKindWeight(left?.queueKind) - queueKindWeight(right?.queueKind);
      if (kindDelta !== 0) {
        return kindDelta;
      }
      return parseTimeMs(right?.occurredAt) - parseTimeMs(left?.occurredAt);
    })
    .slice(0, 6);
}

function createRuntimeDiagnosticsItems(context = {}) {
  const shell = readObject(context.nativeShell);
  const runtimeService = readObject(shell.runtimeService);
  const gatewayService = readObject(shell.gatewayService);
  const runtime = summarizeRuntime(context.health, context.runs, context.approvals);
  return [
    {
      id: "runtime-depth",
      title: "Runtime depth",
      tone: toneFromRuntimeStatus(runtimeService.state || runtime.status, "warn"),
      value: titleCaseToken(runtimeService.state || runtime.status, "Unknown"),
      summary: runtime.detail,
      meta: `attention=${runtime.attentionRuns}; runs=${runtime.runCount}; pendingApprovals=${runtime.pendingApprovals}`,
      action: "open-recent-runs",
      actionLabel: "Open Runtime"
    },
    {
      id: "diagnostics-depth",
      title: "Diagnostics",
      tone:
        ["degraded", "failed", "stopped"].includes(normalizeStatus(shell.launcherState, "")) ||
        ["degraded", "failed", "stopped"].includes(normalizeStatus(gatewayService.state, ""))
          ? "danger"
          : "warn",
      value: titleCaseToken(shell.launcherState, "Unknown"),
      summary: `gateway=${titleCaseToken(gatewayService.state, "Unknown").toLowerCase()}; runtime=${titleCaseToken(runtimeService.state || runtime.status, "Unknown").toLowerCase()}.`,
      meta: "Use Companion for practical restart and status truth; open diagnostics for deeper launcher and bridge detail.",
      action: "show-diagnostics",
      actionLabel: "Show Diagnostics"
    }
  ];
}

function createQuickActions(context = {}) {
  const lastWorkbenchDomain = String(context.lastWorkbenchDomain || "agentops").trim().toLowerCase() || "agentops";
  const approvals = readItems(context.approvals);
  const runs = readItems(context.runs);
  const liveApprovals = createLiveApprovalItems(context);
  const shell = readObject(context.nativeShell);
  return [
    {
      id: liveApprovals.length > 0 ? "review-live-approvals" : "open-approval-queue",
      label: liveApprovals.length > 0 ? "Review In Companion" : "Open Workbench",
      summary: `${countPendingApprovals(approvals)} waiting in the daily Companion lane`,
      action: liveApprovals.length > 0 ? "focus-live-approvals" : "open-approval-queue"
    },
    {
      id: "open-recent-runs",
      label: "Open Recent Runs",
      summary: `${runs.length} recent governed runs`,
      action: "open-recent-runs"
    },
    {
      id: "restart-services",
      label: "Restart Services",
      summary: "Recheck the local launcher, runtime, and gateway",
      action: "restart-services"
    },
    {
      id: "show-diagnostics",
      label: "Show Diagnostics",
      summary: "Open deeper tools for launcher, gateway, and settings detail",
      action: "show-diagnostics"
    },
    {
      id: "open-workbench",
      label: "Open Workbench",
      summary: `Investigate in ${formatOpsLabel(lastWorkbenchDomain)}`,
      action: "open-workbench"
    }
  ];
}

function createConnectedClientContext(context = {}) {
  const identity = createIdentityWorkspaceSnapshot(context.settings, context.session);
  const latestHold = latestGatewayHold(context);
  const latestRun = pickLatest(readItems(context.runs), ["updatedAt", "createdAt"]);
  const shell = readObject(context.nativeShell);
  const gatewayService = readObject(shell.gatewayService);
  const gatewayTrafficCount = readItems(context.runs).length + pendingGatewayHolds(context).length;
  const trafficClient = latestHold ? deriveGatewayClientLabel(latestHold, context) : formatIdentityLabel(identity.clientId || context?.session?.claims?.client_id);
  return {
    cards: [
      {
        id: "connected-client",
        title: "Connected Client",
        tone: identity.authenticated ? "ok" : "warn",
        value: trafficClient,
        summary: `Signed in as ${formatIdentityLabel(identity.subject)}.`,
        meta: latestHold
          ? `Current request came from ${formatIdentityLabel(latestHold?.clientSurface, "gateway")}. Authority: ${formatAuthorityBasis(identity.authorityBasis)}.`
          : `Authority: ${formatAuthorityBasis(identity.authorityBasis)}.`
      },
      {
        id: "agent-profile",
        title: "Agent Profile",
        tone: context.selectedAgentProfileId ? "ok" : "warn",
        value: formatIdentityLabel(context.selectedAgentProfileId),
        summary: `Scope: ${formatScopeLabel(identity.tenantIds, identity.projectIds)}.`,
        meta: `Roles available: ${identity.roles.length}.`
      },
      {
        id: "gateway-traffic",
        title: "Gateway Traffic",
        tone: toneFromRuntimeStatus(gatewayService.state, "warn"),
        value: `${gatewayTrafficCount} observed`,
        summary: latestHold
          ? `Latest held run: ${formatIdentityLabel(latestHold?.runId)}.`
          : `Latest run: ${formatIdentityLabel(latestRun?.runId)}.`,
        meta: latestHold
          ? `Pending approval: ${formatIdentityLabel(latestHold?.approvalId)}.`
          : `Request reference: ${formatIdentityLabel(latestRun?.requestId)}.`
      }
    ]
  };
}

function createAimxsWorkflowSnapshot(context = {}) {
  const runtime = summarizeRuntime(context.health, context.runs, context.approvals);
  const platform = summarizePlatform(context.health, context.pipeline, context.providers);
  const governance = summarizeGovernance(context.approvals);
  const incidents = summarizeIncidents(context.incidentHistory, context.runs, context.approvals);
  const policy = summarizePolicy(context.runs, context.settings);
  const aimxsPath = summarizeAimxsPath(context.settings, policy);

  let state = {
    tone: "ok",
    label: "execution-ready",
    summary: "Runtime, provider route, and governance posture are clear for the next governed step.",
    meta: `runtime=${runtime.status}; route=${platform.status}; policy=${policy.latestDecision}`,
    next: {
      title: "AgentOps",
      summary: "Continue governed work from the active thread surface.",
      meta: "Use AgentOps to continue the current thread or start the next governed task.",
      action: "open-domain",
      view: "agentops",
      actionLabel: "Open AgentOps"
    }
  };

  if (incidents.high > 0 || incidents.medium > 0) {
    state = {
      tone: incidents.high > 0 ? "danger" : "warn",
      label: "incident-bound",
      summary: `${incidents.total} active incident package${incidents.total === 1 ? "" : "s"} are shaping the governed path.`,
      meta: `latest=${String(incidents.latest?.packageId || "no incident package loaded").trim() || "-"}; high=${incidents.high}; medium=${incidents.medium}`,
      next: {
        title: "IncidentOps",
        summary: "Review the active incident package before continuing new governed work.",
        meta: "Incident response is the most truthful next surface at the current posture.",
        action: "open-incidentops-active",
        actionLabel: "Open IncidentOps"
      }
    };
  } else if (governance.pending > 0) {
    state = {
      tone: "warn",
      label: "governance-gated",
      summary: `${governance.pending} pending approval item${governance.pending === 1 ? "" : "s"} are gating the next governed step.`,
      meta: `expiring=${governance.expiringSoon}; source=${governance.source}`,
      next: {
        title: "GovernanceOps",
        summary: "Resolve the pending approval queue before continuing the current path.",
        meta: "Governance is the active gate for the next AIMXS-controlled transition.",
        action: "open-approvals-pending",
        actionLabel: "Open Approval Queue"
      }
    };
  } else if (platform.status !== "ok") {
    state = {
      tone: "warn",
      label: "route-constrained",
      summary: "Provider route or deployment readiness is not yet clear enough to treat the path as open.",
      meta: `providers=${platform.readyProviders}/${platform.providerCount || 0}; gate=${platform.gateStatus}`,
      next: {
        title: "PlatformOps",
        summary: "Review bridge, provider, and deployment posture before assuming the route is clear.",
        meta: platform.latestGate,
        action: "open-domain",
        view: "platformops",
        actionLabel: "Open PlatformOps"
      }
    };
  } else if (runtime.status !== "ok" || runtime.attentionRuns > 0) {
    state = {
      tone: runtime.attentionRuns > 0 ? "danger" : "warn",
      label: "runtime-constrained",
      summary: "The current runtime posture still has active blocked or failed governed work.",
      meta: `attention=${runtime.attentionRuns}; runs=${runtime.runCount}; pendingApprovals=${runtime.pendingApprovals}`,
      next: {
        title: "RuntimeOps",
        summary: "Review the active attention runs before continuing the next governed thread.",
        meta: runtime.detail,
        action: "open-runs-attention",
        actionLabel: "Open RuntimeOps"
      }
    };
  } else if (policy.latestDecision === "DENY" || policy.latestDecision === "DEFER") {
    state = {
      tone: policy.latestDecision === "DENY" ? "danger" : "warn",
      label: "policy-constrained",
      summary: `The latest governed path is currently ${policy.latestDecision.toLowerCase()}ed at the policy surface.`,
      meta: `provider=${policy.provider}; blocked=${policy.blockedCount}; packs=${policy.packCount}`,
      next: {
        title: "PolicyOps",
        summary: "Review the latest policy outcome and bounded simulation before retrying or escalating.",
        meta: `latest decision=${policy.latestDecision}`,
        action: "open-domain",
        view: "policyops",
        actionLabel: "Open PolicyOps"
      }
    };
  }

  return {
    summary: `${aimxsPath.modeLabel} via ${aimxsPath.provider} is the current bounded AIMXS path.`,
    cards: [
      {
        id: "aimxs-path",
        title: "Current AIMXS Path",
        tone: platform.status === "ok" ? "ok" : "warn",
        value: aimxsPath.provider,
        summary: `mode=${aimxsPath.modeLabel}`,
        meta: `route=${platform.status}; ready=${platform.readyProviders}/${platform.providerCount || 0}`,
        action: "open-domain",
        view: "platformops",
        actionLabel: "Open PlatformOps"
      },
      {
        id: "aimxs-governed-state",
        title: "Governed State",
        tone: state.tone,
        value: state.label,
        summary: state.summary,
        meta: state.meta
      },
      {
        id: "aimxs-next-action",
        title: "Next Truthful Action",
        tone: state.tone,
        value: state.next.title,
        summary: state.next.summary,
        meta: state.next.meta,
        action: state.next.action,
        view: state.next.view,
        actionLabel: state.next.actionLabel
      }
    ]
  };
}

export function createEmptyHomeSnapshot() {
  return {
    session: {},
    settings: {},
    health: {},
    pipeline: {},
    providers: { items: [] },
    runs: { items: [] },
    approvals: { items: [] },
    audit: { items: [] },
    incidentHistory: { items: [] },
    nativeGatewayHolds: []
  };
}

export function createHomeWorkspaceSnapshot(context = {}) {
  const snapshot = {
    ...createEmptyHomeSnapshot(),
    ...readObject(context)
  };
  return {
    ...snapshot,
    systemStatus: createSystemStatusRegion(snapshot),
    commandDashboard: {
      cards: createDashboardCards(snapshot)
    },
    aimxsWorkflow: createAimxsWorkflowSnapshot(snapshot),
    identityAndScope: createIdentityAndScopeSnapshot(snapshot),
    liveApprovals: {
      items: createLiveApprovalItems(snapshot)
    },
    governedRequestQueue: {
      items: createGovernedRequestQueueItems(snapshot)
    },
    attentionQueue: {
      items: createAttentionItems(snapshot)
    },
    recentGovernedActions: {
      items: createRecentGovernedActions(snapshot)
    },
    liveAuditEvents: {
      items: createLiveAuditEventItems(snapshot)
    },
    incidentEscalations: {
      items: createIncidentEscalationItems(snapshot)
    },
    runtimeDiagnostics: {
      items: createRuntimeDiagnosticsItems(snapshot)
    },
    quickActions: {
      items: createQuickActions(snapshot)
    },
    connectedClientContext: createConnectedClientContext(snapshot)
  };
}
