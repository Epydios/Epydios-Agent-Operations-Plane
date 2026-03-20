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

function pendingGatewayHolds(context = {}) {
  return readGatewayHoldItems(context).filter(
    (item) => String(item?.state || "").trim().toLowerCase() === "held_pending_approval"
  );
}

function latestGatewayHold(context = {}) {
  return pickLatest(pendingGatewayHolds(context), ["updatedAtUtc", "createdAtUtc", "holdStartedAtUtc", "holdDeadlineAtUtc"]);
}

function gatewayHoldSummaryTarget(item = {}) {
  return formatIdentityLabel(
    item?.requestSummary?.title ||
      item?.governanceTarget?.targetRef ||
      item?.requestSummary?.reason
  );
}

function createSystemStatusRegion(context = {}) {
  const shell = readObject(context.nativeShell);
  const runtimeService = readObject(shell.runtimeService);
  const gatewayService = readObject(shell.gatewayService);
  const runtime = summarizeRuntime(context.health, context.runs, context.approvals);
  const platform = summarizePlatform(context.health, context.pipeline, context.providers);
  const policy = summarizePolicy(context.runs, context.settings);
  const aimxsPath = summarizeAimxsPath(context.settings, policy);
  const lastWorkbenchDomain = formatOpsLabel(context.lastWorkbenchDomain, "AgentOps");
  const startupError = formatIdentityLabel(shell.startupError, "");
  return {
    feedback: context.companionFeedback || null,
    cards: [
      {
        id: "companion-posture",
        title: "Product Posture",
        tone: "ok",
        value: "Companion",
        summary: `workbench=${lastWorkbenchDomain}`,
        meta: `mode=${formatIdentityLabel(shell.mode, "unknown")}; aimxs=${aimxsPath.modeLabel}`
      },
      {
        id: "launcher",
        title: "Launcher",
        tone: toneFromRuntimeStatus(shell.launcherState, "warn"),
        value: titleCaseToken(shell.launcherState, "Unknown"),
        summary: `bootstrap=${titleCaseToken(shell.bootstrapConfigState, "unknown")}; runtime=${formatIdentityLabel(shell.runtimeState, runtime.status)}`,
        meta: startupError || `process=${formatIdentityLabel(shell.runtimeProcessMode, "unknown")}`
      },
      {
        id: "runtime-service",
        title: "Runtime Service",
        tone: toneFromRuntimeStatus(runtimeService.state || runtime.status, "warn"),
        value: titleCaseToken(runtimeService.state || runtime.status, "Unknown"),
        summary: `health=${formatIdentityLabel(runtimeService.health, runtime.status)}`,
        meta: runtime.detail
      },
      {
        id: "gateway-service",
        title: "Gateway",
        tone: toneFromRuntimeStatus(gatewayService.state, "warn"),
        value: titleCaseToken(gatewayService.state, "Unknown"),
        summary: `health=${formatIdentityLabel(gatewayService.health, "unknown")}`,
        meta: `route=${platform.status}; policy=${policy.latestDecision}; provider=${aimxsPath.provider}`
      }
    ],
    actions: [
      {
        id: "open-workbench",
        label: "Open Workbench",
        summary: `resume ${lastWorkbenchDomain}`,
        action: "open-workbench"
      },
      {
        id: "restart-services",
        label: "Restart Services",
        summary: `mode=${formatIdentityLabel(shell.mode, "unknown")}`,
        action: "restart-services"
      },
      {
        id: "show-diagnostics",
        label: "Show Diagnostics",
        summary: "inspect launcher, gateway, and local settings state",
        action: "show-diagnostics"
      }
    ]
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
      title: "Interposed approval required",
      tone: holdDeadlineMs > 0 && holdDeadlineMs - Date.now() <= 300000 ? "danger" : "warn",
      value: String(pendingHolds.length),
      detail: `latest=${formatIdentityLabel(latestHold?.approvalId, "-")}; client=${deriveGatewayClientLabel(latestHold, context)}; deadline=${formatIdentityLabel(latestHold?.holdDeadlineAtUtc, "-")}`,
      action: "open-approval-item",
      actionLabel: "Open Approval",
      runId: String(latestHold?.runId || "").trim(),
      approvalId: String(latestHold?.approvalId || "").trim()
    });
  } else if (pendingApprovals.length > 0) {
    items.push({
      title: "Approval required",
      tone: countExpiringApprovals(approvals) > 0 ? "danger" : "warn",
      value: String(pendingApprovals.length),
      detail: `latest=${formatIdentityLabel(latestPendingApproval?.approvalId, "-")}; expiring soon=${countExpiringApprovals(approvals)}`,
      action: "open-approval-item",
      actionLabel: "Open Approval",
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
      detail: "Inspect diagnostics before trusting the current local governed path.",
      action: "show-diagnostics",
      actionLabel: "Open Diagnostics"
    });
  }
  if (countAttentionRuns(runs) > 0) {
    items.push({
      title: "Runs requiring attention",
      tone: "danger",
      value: String(countAttentionRuns(runs)),
      detail: `latest=${String(latestAttentionRun?.runId || "-").trim() || "-"}`,
      action: "open-run-item",
      runId: String(latestAttentionRun?.runId || "").trim(),
      actionLabel: "Open Run"
    });
  }
  if (incidents.total > 0) {
    items.push({
      title: "Incident escalation pending",
      tone: incidents.high > 0 ? "danger" : "warn",
      value: String(incidents.total),
      detail: `latest=${String(incidents.latest?.packageId || "-").trim() || "-"}`,
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
    recentItemsByRun.set(runId, {
      id: runId,
      clientLabel: deriveGatewayClientLabel(hold, context),
      actionName: gatewayHoldSummaryTarget(hold),
      targetSummary:
        formatScopeLabel([hold?.tenantId], [hold?.projectId]) ||
        formatIdentityLabel(hold?.governanceTarget?.targetRef, "-"),
      state: formatIdentityLabel(hold?.state, "-"),
      policyDecision: "DEFER",
      occurredAt: formatIdentityLabel(hold?.holdStartedAtUtc || hold?.createdAtUtc, "-"),
      runId,
      approvalId: String(hold?.approvalId || "").trim(),
      gatewayRequestId: formatIdentityLabel(hold?.gatewayRequestId, ""),
      action: "open-approval-item",
      actionLabel: "Open Approval"
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
      return [
        runId,
        {
        id: runId || String(run?.requestId || "").trim() || `run-${Math.random().toString(36).slice(2, 7)}`,
        clientLabel: deriveGatewayClientLabel(run, context),
        actionName: formatIdentityLabel(
          run?.requestedAction || run?.action || run?.requestId || "governed action"
        ),
        targetSummary:
          formatScopeLabel([run?.tenantId], [run?.projectId]) ||
          formatIdentityLabel(run?.requestId, runId || "-"),
        state: formatIdentityLabel(run?.status, "-"),
        policyDecision,
        occurredAt: formatIdentityLabel(run?.updatedAt || run?.createdAt, "-"),
        runId,
        approvalId: String(linkedApproval?.approvalId || "").trim(),
        gatewayRequestId: formatIdentityLabel(run?.requestId, ""),
        action: approvalRequired ? "open-approval-item" : "open-run-item",
        actionLabel: approvalRequired ? "Open Approval" : "Open Run"
        }
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

function createQuickActions(context = {}) {
  const lastWorkbenchDomain = String(context.lastWorkbenchDomain || "agentops").trim().toLowerCase() || "agentops";
  const approvals = readItems(context.approvals);
  const runs = readItems(context.runs);
  const shell = readObject(context.nativeShell);
  return [
    {
      id: "open-workbench",
      label: "Open Workbench",
      summary: `resume ${formatOpsLabel(lastWorkbenchDomain)}`,
      action: "open-workbench"
    },
    {
      id: "open-approval-queue",
      label: "Open Approval Queue",
      summary: `pending=${countPendingApprovals(approvals)}`,
      action: "open-approval-queue"
    },
    {
      id: "open-recent-runs",
      label: "Open Recent Runs",
      summary: `runs=${runs.length}`,
      action: "open-recent-runs"
    },
    {
      id: "restart-services",
      label: "Restart Services",
      summary: `mode=${formatIdentityLabel(shell.mode, "unknown")}`,
      action: "restart-services"
    },
    {
      id: "show-diagnostics",
      label: "Show Diagnostics",
      summary: "settings, endpoint health, and native logs",
      action: "show-diagnostics"
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
        summary: `subject=${formatIdentityLabel(identity.subject)}`,
        meta: latestHold
          ? `surface=${formatIdentityLabel(latestHold?.clientSurface, "gateway")}; authority=${formatAuthorityBasis(identity.authorityBasis)}`
          : `authority=${formatAuthorityBasis(identity.authorityBasis)}`
      },
      {
        id: "agent-profile",
        title: "Agent Profile",
        tone: context.selectedAgentProfileId ? "ok" : "warn",
        value: formatIdentityLabel(context.selectedAgentProfileId),
        summary: `scope=${formatScopeLabel(identity.tenantIds, identity.projectIds)}`,
        meta: `roles=${identity.roles.length}`
      },
      {
        id: "gateway-traffic",
        title: "Gateway Traffic",
        tone: toneFromRuntimeStatus(gatewayService.state, "warn"),
        value: `${gatewayTrafficCount} observed`,
        summary: latestHold
          ? `latest=${formatIdentityLabel(latestHold?.runId)}`
          : `latest=${formatIdentityLabel(latestRun?.runId)}`,
        meta: latestHold
          ? `approval=${formatIdentityLabel(latestHold?.approvalId)}`
          : `request=${formatIdentityLabel(latestRun?.requestId)}`
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
    attentionQueue: {
      items: createAttentionItems(snapshot)
    },
    recentGovernedActions: {
      items: createRecentGovernedActions(snapshot)
    },
    quickActions: {
      items: createQuickActions(snapshot)
    },
    connectedClientContext: createConnectedClientContext(snapshot)
  };
}
