import { displayPolicyProviderLabel } from "../../views/common.js";
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

function createAttentionItems(context = {}) {
  const approvals = readItems(context.approvals);
  const runs = readItems(context.runs);
  const audit = readItems(context.audit);
  const incidents = summarizeIncidents(context.incidentHistory, context.runs, context.approvals);
  const latestAttentionRun = pickLatest(
    runs.filter((item) => {
      const status = String(item?.status || "").trim().toUpperCase();
      const decision = String(item?.policyDecision || "").trim().toUpperCase();
      return status === "FAILED" || status === "POLICY_BLOCKED" || decision === "DENY" || decision === "DEFER";
    }),
    ["updatedAt", "createdAt"]
  );
  return [
    {
      title: "Pending approvals",
      tone: countPendingApprovals(approvals) > 0 ? "danger" : "ok",
      value: String(countPendingApprovals(approvals)),
      detail: `expiring soon=${countExpiringApprovals(approvals)}`,
      action: "open-approvals-pending",
      actionLabel: "Open Approval Queue"
    },
    {
      title: "Incident response",
      tone: incidents.high > 0 ? "danger" : incidents.medium > 0 ? "warn" : "ok",
      value: String(incidents.total),
      detail: `latest=${String(incidents.latest?.packageId || "-").trim() || "-"}`,
      action: "open-incidentops-active",
      actionLabel: "Open IncidentOps"
    },
    {
      title: "Runs requiring attention",
      tone: countAttentionRuns(runs) > 0 ? "danger" : "ok",
      value: String(countAttentionRuns(runs)),
      detail: `latest=${String(latestAttentionRun?.runId || "-").trim() || "-"}`,
      action: "open-runs-attention",
      runId: String(latestAttentionRun?.runId || "").trim(),
      actionLabel: "Open RuntimeOps"
    },
    {
      title: "Audit denies",
      tone: countAuditDenies(audit) > 0 ? "warn" : "ok",
      value: String(countAuditDenies(audit)),
      detail: `source=${String(context.audit?.source || "unknown").trim() || "unknown"}`,
      action: "open-audit-deny",
      actionLabel: "Open AuditOps"
    }
  ];
}

function createDomainPivots(context = {}) {
  const providers = readItems(context.providers);
  const approvals = readItems(context.approvals);
  const audit = readItems(context.audit);
  const incidents = readItems(context.incidentHistory);
  const runs = readItems(context.runs);
  const policy = summarizePolicy(context.runs, context.settings);
  return [
    { view: "agentops", label: "AgentOps", summary: "governed work" },
    { view: "runtimeops", label: "RuntimeOps", summary: `runs=${runs.length}` },
    { view: "platformops", label: "PlatformOps", summary: `providers=${providers.length}` },
    { view: "policyops", label: "PolicyOps", summary: `latest=${policy.latestDecision}` },
    { view: "governanceops", label: "GovernanceOps", summary: `pending=${countPendingApprovals(approvals)}` },
    { view: "auditops", label: "AuditOps", summary: `events=${audit.length}` },
    { view: "evidenceops", label: "EvidenceOps", summary: `runs=${runs.length}` },
    { view: "incidentops", label: "IncidentOps", summary: `active=${incidents.length}` }
  ];
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
    incidentHistory: { items: [] }
  };
}

export function createHomeWorkspaceSnapshot(context = {}) {
  const snapshot = {
    ...createEmptyHomeSnapshot(),
    ...readObject(context)
  };
  return {
    ...snapshot,
    commandDashboard: {
      cards: createDashboardCards(snapshot)
    },
    identityAndScope: createIdentityAndScopeSnapshot(snapshot),
    attentionQueue: {
      items: createAttentionItems(snapshot)
    },
    domainPivots: {
      items: createDomainPivots(snapshot)
    }
  };
}
