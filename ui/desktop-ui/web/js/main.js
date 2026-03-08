import { loadConfig } from "./config.js";
import { bootstrapAuth, beginLogin, logout, getSession } from "./oidc.js";
import { AgentOpsApi } from "./api.js";
import { createAppStore } from "./state/store.js";
import { resolveRuntimeChoices } from "./runtime/choices.js";
import { setAuthDisplay } from "./views/session.js";
import { renderHealth, renderError } from "./views/health.js";
import { renderProviders } from "./views/providers.js";
import { readRunFilters, renderRuns, renderRunDetail } from "./views/runs.js";
import {
  readAuditFilters,
  renderAudit,
  buildAuditFilingBundle,
  buildAuditCsv,
  buildAuditHandoffText
} from "./views/audit.js";
import {
  ensureRunBuilderDefaults,
  readRunBuilderInput,
  evaluateRunBuilderIssues,
  buildRunCreatePayload,
  renderRunBuilderPayload,
  renderRunBuilderPolicyHints,
  renderRunBuilderFeedback
} from "./views/run-builder.js";
import {
  readApprovalFilters,
  renderApprovals,
  renderApprovalsDetail,
  renderApprovalFeedback
} from "./views/approvals.js";
import {
  readTerminalInput,
  applyTerminalInput,
  readTerminalHistoryFilters,
  evaluateTerminalIssues,
  buildTerminalRequest,
  renderTerminalPolicyHints,
  renderTerminalPayload,
  renderTerminalFeedback,
  renderTerminalHistory
} from "./views/terminal.js";
import { renderSettings } from "./views/settings.js";
import { buildChatTurnGovernanceReport, renderChat, resolveChatGovernedExportSelection } from "./views/chat.js";
import { renderExecutionDefaults } from "./views/execution-defaults.js";
import {
  closeManagedCodexWorkerSession,
  createOperatorChatThread,
  deriveOperatorChatThreadState,
  emitManagedCodexWorkerHeartbeat,
  followOperatorChatThread,
  invokeOperatorChatTurn,
  launchManagedCodexWorker,
  listOperatorChatThreads,
  loadOperatorChatThread,
  normalizeOperatorChatDraft,
  reattachManagedCodexWorker,
  recoverManagedCodexWorker,
  refreshOperatorChatThreadSession
} from "./runtime/session-client.js";
import {
  buildGovernedExportSelectionState,
  prepareGovernedJsonExport,
  prepareGovernedTextExport
} from "./runtime/governance-report.js";
import {
  buildDesktopGovernedExportOptions as buildDesktopGovernedExportOptionsInternal,
  describeGovernedExportDisposition as describeGovernedExportDispositionInternal,
  describeGovernedExportRedactions as describeGovernedExportRedactionsInternal
} from "./runtime/desktop-export-governance.js";
import {
  escapeHTML,
  formatTime,
  normalizeTimeRange,
  paginateItems,
  parsePositiveInt,
  parseTimeMs,
  renderPanelStateMetric,
  resolveTimeBounds,
  withinTimeBounds
} from "./views/common.js";

const ui = {
  title: document.getElementById("app-title"),
  subtitle: document.getElementById("app-subtitle"),
  configSummary: document.getElementById("config-summary"),
  workspaceLayout: document.getElementById("workspace-layout"),
  workspaceTabs: Array.from(document.querySelectorAll("[data-workspace-tab]")),
  workspacePanels: [],
  chatContent: document.getElementById("chat-content"),
  triageContent: document.getElementById("triage-content"),
  executionDefaultsContent: document.getElementById("execution-defaults-content"),
  settingsContent: document.getElementById("settings-content"),
  settingsOpenAuditEventsButton: document.getElementById("settings-open-audit-events-button"),
  settingsThemeMode: document.getElementById("settings-theme-mode"),
  settingsAgentProfile: document.getElementById("settings-agent-profile"),
  authStatus: document.getElementById("auth-status"),
  tenant: document.getElementById("tenant-value"),
  project: document.getElementById("project-value"),
  clientId: document.getElementById("client-id-value"),
  subject: document.getElementById("subject-value"),
  contextProjectSelect: document.getElementById("context-project-select"),
  contextAgentProfile: document.getElementById("context-agent-profile"),
  contextEndpointBadges: document.getElementById("context-endpoint-badges"),
  healthContent: document.getElementById("health-content"),
  providersContent: document.getElementById("providers-content"),
  approvalsFeedback: document.getElementById("approvals-feedback"),
  approvalsContent: document.getElementById("approvals-content"),
  approvalsDetailContent: document.getElementById("approvals-detail-content"),
  runsContent: document.getElementById("runs-content"),
  runDetailContent: document.getElementById("run-detail-content"),
  auditContent: document.getElementById("audit-content"),
  runsRunIdFilter: document.getElementById("runs-runid-filter"),
  runsTenantFilter: document.getElementById("runs-tenant-filter"),
  runsProjectFilter: document.getElementById("runs-project-filter"),
  runsStatusFilter: document.getElementById("runs-status-filter"),
  runsDecisionFilter: document.getElementById("runs-decision-filter"),
  runsTimeRange: document.getElementById("runs-time-range"),
  runsTimeFrom: document.getElementById("runs-time-from"),
  runsTimeTo: document.getElementById("runs-time-to"),
  runsSort: document.getElementById("runs-sort"),
  runsLimitFilter: document.getElementById("runs-limit-filter"),
  runsPageSize: document.getElementById("runs-page-size"),
  runsPage: document.getElementById("runs-page"),
  runsApplyButton: document.getElementById("runs-apply-button"),
  auditTenantFilter: document.getElementById("audit-tenant-filter"),
  auditProjectFilter: document.getElementById("audit-project-filter"),
  auditProviderFilter: document.getElementById("audit-provider-filter"),
  auditEventFilter: document.getElementById("audit-event-filter"),
  auditDecisionFilter: document.getElementById("audit-decision-filter"),
  auditTimeRange: document.getElementById("audit-time-range"),
  auditTimeFrom: document.getElementById("audit-time-from"),
  auditTimeTo: document.getElementById("audit-time-to"),
  auditPageSize: document.getElementById("audit-page-size"),
  auditPage: document.getElementById("audit-page"),
  auditApplyButton: document.getElementById("audit-apply-button"),
  auditExportJsonButton: document.getElementById("audit-export-json-button"),
  auditExportCsvButton: document.getElementById("audit-export-csv-button"),
  auditCopyHandoffButton: document.getElementById("audit-copy-handoff-button"),
  auditExportIncidentButton: document.getElementById("audit-export-incident-button"),
  auditFeedback: document.getElementById("audit-feedback"),
  auditHandoffPreview: document.getElementById("audit-handoff-preview"),
  incidentSubtabs: Array.from(document.querySelectorAll("[data-incident-subtab]")),
  incidentSubpanels: Array.from(document.querySelectorAll("[data-incident-subpanel]")),
  incidentHistorySummary: document.getElementById("incident-history-summary"),
  incidentHistoryContent: document.getElementById("incident-history-content"),
  incidentHistoryStatusFilter: document.getElementById("incident-history-status-filter"),
  incidentHistorySort: document.getElementById("incident-history-sort"),
  incidentHistoryTimeRange: document.getElementById("incident-history-time-range"),
  incidentHistoryTimeFrom: document.getElementById("incident-history-time-from"),
  incidentHistoryTimeTo: document.getElementById("incident-history-time-to"),
  incidentHistoryPageSize: document.getElementById("incident-history-page-size"),
  incidentHistoryPage: document.getElementById("incident-history-page"),
  incidentHistorySearchInput: document.getElementById("incident-history-search-input"),
  incidentHistorySearchClearButton: document.getElementById("incident-history-search-clear-button"),
  incidentHistoryQuickAllButton: document.getElementById("incident-history-quick-all-button"),
  incidentHistoryQuickFiledButton: document.getElementById("incident-history-quick-filed-button"),
  incidentHistoryQuickNeedsClosureButton: document.getElementById("incident-history-quick-needs-closure-button"),
  incidentHistoryBulkFiledButton: document.getElementById("incident-history-bulk-filed-button"),
  incidentHistoryBulkClosedButton: document.getElementById("incident-history-bulk-closed-button"),
  incidentHistoryExportSelectedButton: document.getElementById("incident-history-export-selected-button"),
  incidentHistoryClearSelectionButton: document.getElementById("incident-history-clear-selection-button"),
  incidentHistoryCopyLatestButton: document.getElementById("incident-history-copy-latest-button"),
  incidentHistoryClearButton: document.getElementById("incident-history-clear-button"),
  approvalsTenantFilter: document.getElementById("approvals-tenant-filter"),
  approvalsProjectFilter: document.getElementById("approvals-project-filter"),
  approvalsStatusFilter: document.getElementById("approvals-status-filter"),
  approvalsTimeRange: document.getElementById("approvals-time-range"),
  approvalsTimeFrom: document.getElementById("approvals-time-from"),
  approvalsTimeTo: document.getElementById("approvals-time-to"),
  approvalsSort: document.getElementById("approvals-sort"),
  approvalsPageSize: document.getElementById("approvals-page-size"),
  approvalsPage: document.getElementById("approvals-page"),
  approvalsTTLSeconds: document.getElementById("approvals-ttl-seconds"),
  approvalsApplyButton: document.getElementById("approvals-apply-button"),
  terminalForm: document.getElementById("terminal-form"),
  terminalRunId: document.getElementById("terminal-run-id"),
  terminalCommand: document.getElementById("terminal-command"),
  terminalCwd: document.getElementById("terminal-cwd"),
  terminalTimeoutSeconds: document.getElementById("terminal-timeout-seconds"),
  terminalReadOnly: document.getElementById("terminal-read-only"),
  terminalRestrictedHostRequest: document.getElementById("terminal-restricted-host-request"),
  terminalPolicyHints: document.getElementById("terminal-policy-hints"),
  terminalFeedback: document.getElementById("terminal-feedback"),
  terminalHistory: document.getElementById("terminal-history"),
  terminalHistoryRunFilter: document.getElementById("terminal-history-run-filter"),
  terminalHistoryStatusFilter: document.getElementById("terminal-history-status-filter"),
  terminalHistoryClearButton: document.getElementById("terminal-history-clear-button"),
  terminalPayload: document.getElementById("terminal-payload"),
  runBuilderForm: document.getElementById("run-builder-form"),
  runBuilderPolicyHints: document.getElementById("run-builder-policy-hints"),
  runBuilderFeedback: document.getElementById("run-builder-feedback"),
  runBuilderPayload: document.getElementById("run-builder-payload"),
  rbRequestId: document.getElementById("rb-request-id"),
  rbTenantId: document.getElementById("rb-tenant-id"),
  rbProjectId: document.getElementById("rb-project-id"),
  rbEnvironment: document.getElementById("rb-environment"),
  rbTier: document.getElementById("rb-tier"),
  rbTargetOS: document.getElementById("rb-target-os"),
  rbTargetProfile: document.getElementById("rb-target-profile"),
  rbStepId: document.getElementById("rb-step-id"),
  rbCapabilities: document.getElementById("rb-capabilities"),
  rbVerifierIds: document.getElementById("rb-verifier-ids"),
  rbActionType: document.getElementById("rb-action-type"),
  rbActionSelector: document.getElementById("rb-action-selector"),
  rbPostAction: document.getElementById("rb-post-action"),
  rbActionTarget: document.getElementById("rb-action-target"),
  rbHumanApprovalGranted: document.getElementById("rb-human-approval-granted"),
  rbRestrictedHostOptIn: document.getElementById("rb-restricted-host-opt-in"),
  rbDryRun: document.getElementById("rb-dry-run"),
  refreshStatus: document.getElementById("refresh-status"),
  loginButton: document.getElementById("login-button"),
  logoutButton: document.getElementById("logout-button"),
  refreshButton: document.getElementById("refresh-button")
};

const store = createAppStore();
const THEME_PREF_KEY = "epydios.agentops.desktop.theme.mode";
const AGENT_PREF_KEY = "epydios.agentops.desktop.agent.profile";
const PROJECT_PREF_KEY = "epydios.agentops.desktop.project.scope";
const WORKSPACE_VIEW_PREF_KEY = "epydios.agentops.desktop.workspace.view";
const INCIDENT_SUBVIEW_PREF_KEY = "epydios.agentops.desktop.incidents.subview";
const SETTINGS_SUBVIEW_PREF_KEY = "epydios.agentops.desktop.settings.subview";
const LIST_FILTER_STATE_KEY = "epydios.agentops.desktop.list.filters.v1";
const ADVANCED_SECTION_STATE_KEY = "epydios.agentops.desktop.advanced.sections.v1";
const DETAILS_OPEN_STATE_KEY = "epydios.agentops.desktop.details.open.v1";
const AIMXS_OVERRIDE_KEY = "epydios.agentops.desktop.aimxs.override.v1";
const INTEGRATION_OVERRIDES_KEY = "epydios.agentops.desktop.integrations.project_overrides.v1";
const INCIDENT_HISTORY_KEY = "epydios.agentops.desktop.incident.history.v1";
const CONFIG_CHANGE_HISTORY_KEY = "epydios.agentops.desktop.settings.change.history.v1";
const OPERATOR_CHAT_ARCHIVE_KEY = "epydios.agentops.desktop.chat.archive.v1";
const PROJECT_ANY_SCOPE_KEY = "__project_any__";
const WORKSPACE_VIEW_IDS = new Set(["operations", "chat", "runs", "approvals", "incidents", "settings"]);
const INCIDENT_SUBVIEW_IDS = new Set(["queue", "audit"]);
const SETTINGS_SUBVIEW_IDS = new Set(["configuration", "diagnostics"]);
const ADVANCED_SECTION_IDS = new Set(["operations", "runs", "approvals", "incidents", "settings"]);
const INCIDENT_STATUS_TRANSITIONS = {
  drafted: [
    { to: "filed", label: "Mark Filed" }
  ],
  filed: [
    { to: "closed", label: "Mark Closed" },
    { to: "drafted", label: "Return to Draft" }
  ],
  closed: [
    { to: "filed", label: "Reopen Filed" }
  ]
};
const INCIDENT_STATUS_SORT_RANK = {
  drafted: 0,
  filed: 1,
  closed: 2
};
const incidentHistorySelection = new Set();
const incidentHistoryViewState = {
  status: "",
  sort: "newest",
  search: "",
  timeRange: "",
  timeFrom: "",
  timeTo: "",
  pageSize: 25,
  page: 1
};
let settingsSubviewState = "configuration";
let listFilterStateDigest = "";
let advancedSectionState = {};
let detailsOpenState = {};
let aimxsEditorState = {
  status: "clean",
  message: ""
};
let agentInvokeState = {
  agentProfileId: "",
  prompt: "",
  systemPrompt: "",
  maxOutputTokens: 1024,
  status: "clean",
  message: "",
  response: null,
  sessionView: null
};
let operatorChatState = {
  title: "",
  intent: "",
  agentProfileId: "",
  executionMode: "raw_model_invoke",
  systemPrompt: "",
  prompt: "",
  maxOutputTokens: 1024,
  status: "idle",
  message: "",
  thread: null,
  history: {
    source: "not-loaded",
    count: 0,
    archivedCount: 0,
    showArchived: false,
    message: "",
    items: []
  },
  catalogs: {
    source: "not-loaded",
    message: "",
    workerCapabilities: null,
    policyPacks: null,
    exportProfiles: null,
    orgAdminProfiles: null
  },
  exportSelection: {
    exportProfile: "",
    audience: "",
    retentionClass: ""
  }
};
let operatorChatArchiveState = normalizeOperatorChatArchiveState(readSavedJSON(OPERATOR_CHAT_ARCHIVE_KEY));
let operatorChatFollowState = {
  token: 0,
  timerId: 0,
  sessionId: ""
};
let desktopGovernedExportCatalogState = {
  source: "not-loaded",
  message: "",
  exportProfiles: null,
  orgAdminProfiles: null
};
const CHAT_FOLLOW_RETRY_MS = 1250;
const CHAT_FOLLOW_CONTINUE_MS = 160;

const SECRET_LIKE_PATTERNS = [
  /sk-[a-zA-Z0-9]{12,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/
];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readSavedJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value || {}));
  } catch (_) {
    // Local storage is optional.
  }
}

function normalizeOperatorChatArchiveState(value) {
  const archivedByScope = value?.archivedByScope && typeof value.archivedByScope === "object"
    ? value.archivedByScope
    : {};
  const next = { archivedByScope: {} };
  Object.entries(archivedByScope).forEach(([scopeKey, taskIds]) => {
    if (!Array.isArray(taskIds)) {
      return;
    }
    const normalizedTaskIds = Array.from(new Set(taskIds.map((item) => String(item || "").trim()).filter(Boolean)));
    if (normalizedTaskIds.length > 0) {
      next.archivedByScope[String(scopeKey || "").trim()] = normalizedTaskIds;
    }
  });
  return next;
}

function operatorChatScopeKey(scope = {}) {
  const tenantId = String(scope?.tenantId || "").trim();
  const projectId = String(scope?.projectId || "").trim();
  return tenantId && projectId ? `${tenantId}::${projectId}` : "";
}

function archivedOperatorChatTaskIds(scope = {}) {
  const scopeKey = operatorChatScopeKey(scope);
  if (!scopeKey) {
    return new Set();
  }
  return new Set(operatorChatArchiveState.archivedByScope?.[scopeKey] || []);
}

function setOperatorChatArchivedTask(scope = {}, taskId, archived) {
  const scopeKey = operatorChatScopeKey(scope);
  const normalizedTaskID = String(taskId || "").trim();
  if (!scopeKey || !normalizedTaskID) {
    return;
  }
  operatorChatArchiveState = normalizeOperatorChatArchiveState(operatorChatArchiveState);
  const current = new Set(operatorChatArchiveState.archivedByScope?.[scopeKey] || []);
  if (archived) {
    current.add(normalizedTaskID);
  } else {
    current.delete(normalizedTaskID);
  }
  if (current.size > 0) {
    operatorChatArchiveState.archivedByScope[scopeKey] = Array.from(current).sort();
  } else {
    delete operatorChatArchiveState.archivedByScope[scopeKey];
  }
  saveJSON(OPERATOR_CHAT_ARCHIVE_KEY, operatorChatArchiveState);
}

function activeWorkspaceView() {
  return normalizeWorkspaceView(ui.workspaceLayout?.dataset?.workspaceView, "operations");
}

function clearOperatorChatFollowLoop() {
  operatorChatFollowState.token += 1;
  if (operatorChatFollowState.timerId) {
    window.clearTimeout(operatorChatFollowState.timerId);
  }
  operatorChatFollowState = {
    token: operatorChatFollowState.token,
    timerId: 0,
    sessionId: ""
  };
}

function patchOperatorChatThreadState(thread, overrides = {}) {
  const derived = deriveOperatorChatThreadState(thread);
  operatorChatState = {
    ...operatorChatState,
    thread,
    status: String(overrides.status || derived.uiStatus || operatorChatState.status || "idle").trim().toLowerCase() || "idle",
    message: String(overrides.message || derived.message || operatorChatState.message || "").trim()
  };
  return derived;
}

function buildFollowUpOperatorChatDraft(draft = {}, thread = {}) {
  const baseTitle = String(draft.title || thread.title || "").trim();
  const normalizedTitle = baseTitle
    ? /^follow-up:/i.test(baseTitle)
      ? baseTitle
      : `Follow-up: ${baseTitle}`
    : `Follow-up: ${String(draft.agentProfileId || thread.agentProfileId || "agent").trim() || "agent"} thread`;
  return {
    ...draft,
    title: normalizedTitle,
    intent: String(draft.intent || thread.intent || "").trim(),
    agentProfileId: String(draft.agentProfileId || thread.agentProfileId || "").trim().toLowerCase(),
    executionMode: String(draft.executionMode || thread.executionMode || "raw_model_invoke").trim().toLowerCase(),
    prompt: ""
  };
}

function scheduleOperatorChatFollow(delayMs, token) {
  if (operatorChatFollowState.token !== token) {
    return;
  }
  if (operatorChatFollowState.timerId) {
    window.clearTimeout(operatorChatFollowState.timerId);
  }
  operatorChatFollowState.timerId = window.setTimeout(() => {
    runOperatorChatFollowLoop(token).catch(() => {});
  }, delayMs);
}

function shouldOperatorChatFollow() {
  const derived = deriveOperatorChatThreadState(operatorChatState.thread);
  return activeWorkspaceView() === "chat" && document.visibilityState !== "hidden" && derived.shouldFollow;
}

async function runOperatorChatFollowLoop(token) {
  if (operatorChatFollowState.token !== token || !shouldOperatorChatFollow()) {
    return;
  }
  try {
    const result = await followOperatorChatThread(api, operatorChatState.thread, {
      tailCount: 8,
      waitSeconds: 10
    });
    if (operatorChatFollowState.token !== token) {
      return;
    }
    if (result?.changed && result?.thread) {
      patchOperatorChatThreadState(result.thread);
      if (result?.state?.isResolvedThread) {
        await refreshOperatorChatHistory(getSession());
      }
      await refresh();
    }
    if (shouldOperatorChatFollow()) {
      scheduleOperatorChatFollow(CHAT_FOLLOW_CONTINUE_MS, token);
    }
  } catch (error) {
    if (operatorChatFollowState.token !== token) {
      return;
    }
    operatorChatState = {
      ...operatorChatState,
      status: "warn",
      message: `Live thread follow paused: ${error.message}`
    };
    await refresh();
    if (shouldOperatorChatFollow()) {
      scheduleOperatorChatFollow(CHAT_FOLLOW_RETRY_MS, token);
    }
  }
}

function reconcileOperatorChatFollowLoop() {
  const derived = deriveOperatorChatThreadState(operatorChatState.thread);
  if (activeWorkspaceView() !== "chat" || document.visibilityState === "hidden" || !derived.shouldFollow) {
    if (operatorChatFollowState.timerId || operatorChatFollowState.sessionId) {
      clearOperatorChatFollowLoop();
    }
    return;
  }
  if (operatorChatFollowState.sessionId === derived.sessionId && operatorChatFollowState.timerId) {
    return;
  }
  clearOperatorChatFollowLoop();
  operatorChatFollowState.sessionId = derived.sessionId;
  const token = operatorChatFollowState.token;
  scheduleOperatorChatFollow(40, token);
}

function normalizeProjectScopeKey(projectID) {
  const id = String(projectID || "").trim();
  return id || PROJECT_ANY_SCOPE_KEY;
}

function activeProjectScope(session) {
  const fromSelect = String(ui.contextProjectSelect?.value || "").trim();
  if (fromSelect) {
    return fromSelect;
  }
  return String(session?.claims?.project_id || "").trim();
}

function activeTenantScope(session) {
  const claimTenant = String(session?.claims?.tenant_id || "").trim();
  if (claimTenant) {
    return claimTenant;
  }
  const candidateFilters = [
    ui.runsTenantFilter?.value,
    ui.auditTenantFilter?.value,
    ui.approvalsTenantFilter?.value,
    ui.rbTenantId?.value
  ];
  for (const value of candidateFilters) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function looksLikeRawSecret(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(text));
}

function validateReference(errors, label, value) {
  const text = String(value || "").trim();
  if (!text) {
    errors.push(`${label} is required.`);
    return;
  }
  if (looksLikeRawSecret(text)) {
    errors.push(`${label} looks like raw secret material; use a ref:// pointer instead.`);
    return;
  }
  if (!text.startsWith("ref://")) {
    errors.push(`${label} must use ref:// format.`);
  }
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function normalizeIntegrationEditorDraft(input = {}) {
  return {
    selectedAgentProfileId: String(input.selectedAgentProfileId || "").trim().toLowerCase(),
    modelRouting: String(input.modelRouting || "").trim().toLowerCase(),
    gatewayProviderId: String(input.gatewayProviderId || "").trim(),
    gatewayTokenRef: String(input.gatewayTokenRef || "").trim(),
    gatewayMtlsCertRef: String(input.gatewayMtlsCertRef || "").trim(),
    gatewayMtlsKeyRef: String(input.gatewayMtlsKeyRef || "").trim(),
    allowDirectProviderFallback: normalizeBoolean(input.allowDirectProviderFallback),
    profileTransport: String(input.profileTransport || "").trim(),
    profileModel: String(input.profileModel || "").trim(),
    profileEndpointRef: String(input.profileEndpointRef || "").trim(),
    profileCredentialRef: String(input.profileCredentialRef || "").trim(),
    profileCredentialScope: String(input.profileCredentialScope || "").trim().toLowerCase(),
    profileEnabled: normalizeBoolean(input.profileEnabled)
  };
}

function buildRuntimeIntegrationSettingsPayload(draft) {
  return normalizeIntegrationEditorDraft(draft || {});
}

function validateIntegrationEditorDraft(draft, choices) {
  const errors = [];
  const warnings = [];
  const profiles = Array.isArray(choices?.integrations?.agentProfiles)
    ? choices.integrations.agentProfiles
    : [];

  if (!draft.selectedAgentProfileId) {
    errors.push("Agent profile is required.");
  } else if (
    !profiles.some(
      (profile) =>
        String(profile?.id || "").trim().toLowerCase() ===
        String(draft.selectedAgentProfileId || "").trim().toLowerCase()
    )
  ) {
    errors.push(`Unknown agent profile: ${draft.selectedAgentProfileId}`);
  }

  if (draft.modelRouting !== "gateway_first" && draft.modelRouting !== "direct_first") {
    errors.push("Model routing must be gateway_first or direct_first.");
  }

  if (!draft.gatewayProviderId) {
    errors.push("Gateway provider is required.");
  }
  validateReference(errors, "Gateway token ref", draft.gatewayTokenRef);
  validateReference(errors, "Gateway mTLS cert ref", draft.gatewayMtlsCertRef);
  validateReference(errors, "Gateway mTLS key ref", draft.gatewayMtlsKeyRef);

  if (!draft.profileTransport) {
    errors.push("Profile transport is required.");
  }
  if (!draft.profileModel) {
    errors.push("Profile model is required.");
  }

  validateReference(errors, "Profile endpoint ref", draft.profileEndpointRef);
  validateReference(errors, "Profile credential ref", draft.profileCredentialRef);

  if (
    draft.profileCredentialScope !== "project" &&
    draft.profileCredentialScope !== "tenant" &&
    draft.profileCredentialScope !== "workspace"
  ) {
    errors.push("Credential scope must be project, tenant, or workspace.");
  }

  if (draft.modelRouting === "direct_first" && draft.allowDirectProviderFallback) {
    warnings.push("direct_first with fallback=true may bypass gateway-first governance.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function applyIntegrationOverrideToChoices(baseChoices, override) {
  const next = deepClone(baseChoices || {});
  next.integrations = next.integrations || {};
  next.integrations.agentProfiles = Array.isArray(next.integrations.agentProfiles)
    ? next.integrations.agentProfiles
    : [];

  next.integrations.modelRouting = override.modelRouting;
  next.integrations.gatewayProviderId = override.gatewayProviderId;
  next.integrations.gatewayTokenRef = override.gatewayTokenRef;
  next.integrations.gatewayMtlsCertRef = override.gatewayMtlsCertRef;
  next.integrations.gatewayMtlsKeyRef = override.gatewayMtlsKeyRef;
  next.integrations.allowDirectProviderFallback = Boolean(override.allowDirectProviderFallback);
  next.integrations.selectedAgentProfileId = override.selectedAgentProfileId;

  const targetProfileID = String(override.selectedAgentProfileId || "").trim().toLowerCase();
  const profiles = next.integrations.agentProfiles;
  const index = profiles.findIndex(
    (profile) => String(profile?.id || "").trim().toLowerCase() === targetProfileID
  );
  if (index >= 0) {
    profiles[index] = {
      ...profiles[index],
      transport: override.profileTransport,
      model: override.profileModel,
      endpointRef: override.profileEndpointRef,
      credentialRef: override.profileCredentialRef,
      credentialScope: override.profileCredentialScope,
      enabled: Boolean(override.profileEnabled)
    };
  }
  return next;
}

function resolveChoicesForProject(baseChoices, projectID, overrides) {
  const key = normalizeProjectScopeKey(projectID);
  const entry = overrides[key];
  if (!entry?.applied || !entry?.override) {
    return deepClone(baseChoices);
  }
  return applyIntegrationOverrideToChoices(baseChoices, entry.override);
}

function normalizeAimxsMode(value, fallback = "disabled") {
  const requested = String(value || "").trim().toLowerCase();
  if (requested === "disabled" || requested === "https_external" || requested === "in_stack_reserved") {
    return requested;
  }
  const nextFallback = String(fallback || "").trim().toLowerCase();
  if (nextFallback === "disabled" || nextFallback === "https_external" || nextFallback === "in_stack_reserved") {
    return nextFallback;
  }
  return "disabled";
}

function normalizeAimxsOverride(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    paymentEntitled: Boolean(base.paymentEntitled),
    mode: normalizeAimxsMode(source.mode, normalizeAimxsMode(base.mode, "disabled")),
    endpointRef:
      String(
        source.endpointRef ||
          base.endpointRef ||
          "ref://projects/{projectId}/providers/aimxs/https-endpoint"
      ).trim() || "-",
    bearerTokenRef:
      String(
        source.bearerTokenRef ||
          base.bearerTokenRef ||
          "ref://projects/{projectId}/providers/aimxs/bearer-token"
      ).trim() || "-",
    mtlsCertRef:
      String(
        source.mtlsCertRef ||
          base.mtlsCertRef ||
          "ref://projects/{projectId}/providers/aimxs/mtls-cert"
      ).trim() || "-",
    mtlsKeyRef:
      String(
        source.mtlsKeyRef ||
          base.mtlsKeyRef ||
          "ref://projects/{projectId}/providers/aimxs/mtls-key"
      ).trim() || "-"
  };
}

function applyAimxsOverrideToChoices(baseChoices, override) {
  const next = deepClone(baseChoices || {});
  next.aimxs = normalizeAimxsOverride(override || {}, baseChoices?.aimxs || {});
  return next;
}

function buildEditorDraftFromChoices(choices, selectedAgentProfileId) {
  const integrations = choices?.integrations || {};
  const profiles = Array.isArray(integrations.agentProfiles) ? integrations.agentProfiles : [];
  const selectedProfileID = String(
    selectedAgentProfileId || integrations.selectedAgentProfileId || profiles[0]?.id || ""
  )
    .trim()
    .toLowerCase();
  const profile =
    profiles.find((item) => String(item?.id || "").trim().toLowerCase() === selectedProfileID) ||
    profiles[0] ||
    {};

  return {
    selectedAgentProfileId: selectedProfileID,
    modelRouting: String(integrations.modelRouting || "gateway_first").trim().toLowerCase(),
    gatewayProviderId: String(integrations.gatewayProviderId || "litellm").trim(),
    gatewayTokenRef: String(integrations.gatewayTokenRef || "").trim(),
    gatewayMtlsCertRef: String(integrations.gatewayMtlsCertRef || "").trim(),
    gatewayMtlsKeyRef: String(integrations.gatewayMtlsKeyRef || "").trim(),
    allowDirectProviderFallback: Boolean(integrations.allowDirectProviderFallback),
    profileTransport: String(profile?.transport || "").trim(),
    profileModel: String(profile?.model || "").trim(),
    profileEndpointRef: String(profile?.endpointRef || "").trim(),
    profileCredentialRef: String(profile?.credentialRef || "").trim(),
    profileCredentialScope: String(profile?.credentialScope || "project").trim().toLowerCase(),
    profileEnabled: profile?.enabled !== false
  };
}

function readIntegrationEditorInput() {
  const root = ui.settingsContent;
  if (!root) {
    return null;
  }
  const read = (selector) => root.querySelector(selector);
  const selectedAgent = read("#settings-int-selected-profile");
  const modelRouting = read("#settings-int-model-routing");
  const gatewayProvider = read("#settings-int-gateway-provider");
  const gatewayTokenRef = read("#settings-int-gateway-token-ref");
  const gatewayMtlsCertRef = read("#settings-int-gateway-mtls-cert-ref");
  const gatewayMtlsKeyRef = read("#settings-int-gateway-mtls-key-ref");
  const directFallback = read("#settings-int-direct-fallback");
  const profileTransport = read("#settings-int-profile-transport");
  const profileModel = read("#settings-int-profile-model");
  const profileEndpointRef = read("#settings-int-profile-endpoint-ref");
  const profileCredentialRef = read("#settings-int-profile-credential-ref");
  const profileCredentialScope = read("#settings-int-profile-credential-scope");
  const profileEnabled = read("#settings-int-profile-enabled");

  if (
    !(selectedAgent instanceof HTMLSelectElement) ||
    !(modelRouting instanceof HTMLSelectElement) ||
    !(gatewayProvider instanceof HTMLInputElement) ||
    !(gatewayTokenRef instanceof HTMLInputElement) ||
    !(gatewayMtlsCertRef instanceof HTMLInputElement) ||
    !(gatewayMtlsKeyRef instanceof HTMLInputElement) ||
    !(directFallback instanceof HTMLInputElement) ||
    !(profileTransport instanceof HTMLInputElement) ||
    !(profileModel instanceof HTMLInputElement) ||
    !(profileEndpointRef instanceof HTMLInputElement) ||
    !(profileCredentialRef instanceof HTMLInputElement) ||
    !(profileCredentialScope instanceof HTMLSelectElement) ||
    !(profileEnabled instanceof HTMLInputElement)
  ) {
    return null;
  }

  return normalizeIntegrationEditorDraft({
    selectedAgentProfileId: selectedAgent.value,
    modelRouting: modelRouting.value,
    gatewayProviderId: gatewayProvider.value,
    gatewayTokenRef: gatewayTokenRef.value,
    gatewayMtlsCertRef: gatewayMtlsCertRef.value,
    gatewayMtlsKeyRef: gatewayMtlsKeyRef.value,
    allowDirectProviderFallback: directFallback.checked,
    profileTransport: profileTransport.value,
    profileModel: profileModel.value,
    profileEndpointRef: profileEndpointRef.value,
    profileCredentialRef: profileCredentialRef.value,
    profileCredentialScope: profileCredentialScope.value,
    profileEnabled: profileEnabled.checked
  });
}

function readAimxsEditorInput() {
  const root = ui.settingsContent;
  if (!root) {
    return null;
  }
  const read = (selector) => root.querySelector(selector);
  const mode = read("#settings-aimxs-mode");
  const endpointRef = read("#settings-aimxs-endpoint-ref");
  const bearerTokenRef = read("#settings-aimxs-bearer-token-ref");
  const mtlsCertRef = read("#settings-aimxs-mtls-cert-ref");
  const mtlsKeyRef = read("#settings-aimxs-mtls-key-ref");

  if (
    !(mode instanceof HTMLSelectElement) ||
    !(endpointRef instanceof HTMLInputElement) ||
    !(bearerTokenRef instanceof HTMLInputElement) ||
    !(mtlsCertRef instanceof HTMLInputElement) ||
    !(mtlsKeyRef instanceof HTMLInputElement)
  ) {
    return null;
  }

  return {
    mode: normalizeAimxsMode(mode.value, "disabled"),
    endpointRef: String(endpointRef.value || "").trim(),
    bearerTokenRef: String(bearerTokenRef.value || "").trim(),
    mtlsCertRef: String(mtlsCertRef.value || "").trim(),
    mtlsKeyRef: String(mtlsKeyRef.value || "").trim()
  };
}

function normalizeAgentInvokeDraft(input = {}) {
  const maxOutputTokens = Number.parseInt(String(input.maxOutputTokens || ""), 10);
  return {
    agentProfileId: String(input.agentProfileId || "").trim().toLowerCase(),
    prompt: String(input.prompt || "").trim(),
    systemPrompt: String(input.systemPrompt || "").trim(),
    maxOutputTokens:
      Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 1024
  };
}

function readAgentInvokeInput() {
  const root = ui.settingsContent;
  if (!root) {
    return null;
  }
  const read = (selector) => root.querySelector(selector);
  const profile = read("#settings-agent-test-profile");
  const prompt = read("#settings-agent-test-prompt");
  const systemPrompt = read("#settings-agent-test-system-prompt");
  const maxOutputTokens = read("#settings-agent-test-max-output-tokens");
  if (
    !(profile instanceof HTMLSelectElement) ||
    !(prompt instanceof HTMLTextAreaElement) ||
    !(systemPrompt instanceof HTMLTextAreaElement) ||
    !(maxOutputTokens instanceof HTMLInputElement)
  ) {
    return null;
  }
  return normalizeAgentInvokeDraft({
    agentProfileId: profile.value,
    prompt: prompt.value,
    systemPrompt: systemPrompt.value,
    maxOutputTokens: maxOutputTokens.value
  });
}

function readOperatorChatInput() {
  const read = (selector) => ui.chatContent?.querySelector(selector);
  const title = read("#chat-thread-title");
  const agentProfile = read("#chat-agent-profile");
  const executionMode = read("#chat-execution-mode");
  const intent = read("#chat-thread-intent");
  const systemPrompt = read("#chat-system-prompt");
  const prompt = read("#chat-prompt");
  if (
    !(title instanceof HTMLInputElement) ||
    !(agentProfile instanceof HTMLSelectElement) ||
    !(executionMode instanceof HTMLSelectElement) ||
    !(intent instanceof HTMLInputElement) ||
    !(systemPrompt instanceof HTMLTextAreaElement) ||
    !(prompt instanceof HTMLTextAreaElement)
  ) {
    return null;
  }
  return normalizeOperatorChatDraft({
    title: title.value,
    intent: intent.value,
    agentProfileId: agentProfile.value,
    executionMode: executionMode.value,
    systemPrompt: systemPrompt.value,
    prompt: prompt.value,
    maxOutputTokens: operatorChatState.maxOutputTokens
  });
}

function validateAgentInvokeDraft(draft, choices) {
  const errors = [];
  const profiles = Array.isArray(choices?.integrations?.agentProfiles)
    ? choices.integrations.agentProfiles
    : [];
  const selected = String(draft?.agentProfileId || "").trim().toLowerCase();
  if (!selected) {
    errors.push("Agent profile is required.");
  } else if (!profiles.some((profile) => String(profile?.id || "").trim().toLowerCase() === selected)) {
    errors.push(`Unknown agent profile: ${selected}`);
  }
  if (!String(draft?.prompt || "").trim()) {
    errors.push("Prompt is required.");
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

async function hydrateAgentInvokeSessionView(sessionId) {
  return loadNativeSessionView(api, sessionId, { tailCount: 6, waitSeconds: 1 });
}

async function refreshOperatorChatHistory(sessionValue) {
  const scope = {
    tenantId: activeTenantScope(sessionValue),
    projectId: activeProjectScope(sessionValue)
  };
  if (!scope.tenantId || !scope.projectId) {
    operatorChatState = {
      ...operatorChatState,
      history: {
        source: "scope-unavailable",
        count: 0,
        message: "Tenant and project scope are required before native chat threads can be loaded.",
        items: []
      }
    };
    return;
  }
  try {
    const history = await listOperatorChatThreads(api, scope, { limit: 12 });
    const archivedTaskIds = archivedOperatorChatTaskIds(scope);
    const allItems = (Array.isArray(history?.items) ? history.items : []).map((item) => ({
      ...item,
      archived: archivedTaskIds.has(String(item?.taskId || "").trim())
    }));
    const showArchived = Boolean(operatorChatState.history?.showArchived);
    const visibleItems = showArchived ? allItems : allItems.filter((item) => !item.archived);
    const archivedCount = allItems.filter((item) => item.archived).length;
    operatorChatState = {
      ...operatorChatState,
      history: {
        ...history,
        count: visibleItems.length,
        archivedCount,
        showArchived,
        message:
          allItems.length > 0
            ? `Resume any prior operator chat thread directly from native M16 task/session records.${archivedCount > 0 ? ` ${showArchived ? "Archived threads are visible." : "Archived threads are hidden until you show them."}` : ""}`
            : "No native operator chat threads exist yet for the current scope.",
        items: visibleItems
      }
    };
  } catch (error) {
    operatorChatState = {
      ...operatorChatState,
      history: {
        source: "error",
        count: 0,
        message: `Native thread history failed to load: ${error.message}`,
        items: []
      }
    };
  }
}

async function refreshOperatorChatGovernanceCatalogs(sessionValue) {
  const scope = {
    tenantId: activeTenantScope(sessionValue),
    projectId: activeProjectScope(sessionValue)
  };
  if (!scope.tenantId || !scope.projectId) {
    operatorChatState = {
      ...operatorChatState,
      catalogs: {
        source: "scope-unavailable",
        message: "Tenant and project scope are required before enterprise governance catalogs can be loaded.",
        workerCapabilities: null,
        policyPacks: null,
        exportProfiles: null,
        orgAdminProfiles: null
      }
    };
    return;
  }
  try {
    const [workerCapabilities, policyPacks, exportProfiles, orgAdminProfiles] = await Promise.all([
      api.listRuntimeWorkerCapabilities({}),
      api.listRuntimePolicyPacks({ clientSurface: "chat" }),
      api.listRuntimeExportProfiles({ clientSurface: "chat" }),
      api.listRuntimeOrgAdminProfiles({ clientSurface: "chat" })
    ]);
    operatorChatState = {
      ...operatorChatState,
      catalogs: {
        source: "runtime-endpoint",
        message: "Enterprise governance catalogs loaded for Chat review, report, governed export, and org-admin posture.",
        workerCapabilities,
        policyPacks,
        exportProfiles,
        orgAdminProfiles
      }
    };
  } catch (error) {
    operatorChatState = {
      ...operatorChatState,
      catalogs: {
        source: "error",
        message: `Enterprise governance catalogs failed to load: ${error.message}`,
        workerCapabilities: null,
        policyPacks: null,
        exportProfiles: null,
        orgAdminProfiles: null
      }
    };
  }
}

async function refreshDesktopGovernedExportCatalogs() {
  try {
    const [exportProfiles, orgAdminProfiles] = await Promise.all([
      api.listRuntimeExportProfiles({ clientSurface: "desktop" }),
      api.listRuntimeOrgAdminProfiles({ clientSurface: "desktop" })
    ]);
    desktopGovernedExportCatalogState = {
      source: "runtime-endpoint",
      message: "Enterprise governed export profiles and org-admin overlays loaded for desktop export and handoff paths.",
      exportProfiles,
      orgAdminProfiles
    };
  } catch (error) {
    desktopGovernedExportCatalogState = {
      source: "error",
      message: `Enterprise governed export profiles failed to load: ${error.message}`,
      exportProfiles: null,
      orgAdminProfiles: null
    };
  }
}

function findOperatorChatTurn(thread = {}, sessionId) {
  const normalizedSessionID = String(sessionId || "").trim();
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  return turns.find((turn) => String(turn?.sessionView?.timeline?.session?.sessionId || turn?.response?.sessionId || "").trim() === normalizedSessionID) || null;
}

function buildOperatorChatToolActionExport(thread = {}, sessionId, toolActionId) {
  const turn = findOperatorChatTurn(thread, sessionId);
  const timeline = turn?.sessionView?.timeline && typeof turn.sessionView.timeline === "object" ? turn.sessionView.timeline : {};
  const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
  const toolAction = toolActions.find((item) => String(item?.toolActionId || "").trim() === String(toolActionId || "").trim());
  if (!toolAction) {
    return null;
  }
  return {
    task: timeline?.task || null,
    session: timeline?.session || null,
    selectedWorker: timeline?.selectedWorker || null,
    approvalCheckpoints: Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [],
    toolAction
  };
}

function buildOperatorChatEvidenceExport(thread = {}, sessionId, evidenceId) {
  const turn = findOperatorChatTurn(thread, sessionId);
  const timeline = turn?.sessionView?.timeline && typeof turn.sessionView.timeline === "object" ? turn.sessionView.timeline : {};
  const evidenceRecords = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
  const evidence = evidenceRecords.find((item) => String(item?.evidenceId || "").trim() === String(evidenceId || "").trim());
  if (!evidence) {
    return null;
  }
  return {
    task: timeline?.task || null,
    session: timeline?.session || null,
    selectedWorker: timeline?.selectedWorker || null,
    approvalCheckpoints: Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [],
    evidence
  };
}

function buildOperatorChatGovernanceReportExport(thread = {}, sessionId, catalogs = {}, exportSelection = {}) {
  const turn = findOperatorChatTurn(thread, sessionId);
  if (!turn) {
    return null;
  }
  return buildChatTurnGovernanceReport(turn, catalogs, exportSelection);
}

function validateAimxsOverride(override, fallback) {
  const errors = [];
  const warnings = [];
  const draft = normalizeAimxsOverride(override || {}, fallback || {});
  if (draft.mode === "disabled") {
    return { valid: true, errors, warnings, draft };
  }

  if (!draft.paymentEntitled) {
    errors.push("AIMXS mode is locked until payment entitlement is active.");
  }

  if (draft.mode === "https_external") {
    validateReference(errors, "AIMXS endpoint ref", draft.endpointRef);
    validateReference(errors, "AIMXS bearer token ref", draft.bearerTokenRef);
    validateReference(errors, "AIMXS mTLS cert ref", draft.mtlsCertRef);
    validateReference(errors, "AIMXS mTLS key ref", draft.mtlsKeyRef);
  } else if (draft.mode === "in_stack_reserved") {
    warnings.push("in_stack_reserved is a placeholder in this build; external HTTPS mode is currently active path.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    draft
  };
}

function readSavedValue(key) {
  try {
    return String(window.localStorage.getItem(key) || "").trim();
  } catch (_) {
    return "";
  }
}

function saveValue(key, value) {
  try {
    window.localStorage.setItem(key, String(value || "").trim());
  } catch (_) {
    // Local storage is optional.
  }
}

function normalizeWorkspaceView(value, fallback = "operations") {
  const requested = String(value || "").trim().toLowerCase();
  if (WORKSPACE_VIEW_IDS.has(requested)) {
    return requested;
  }
  const fallbackView = String(fallback || "").trim().toLowerCase();
  if (WORKSPACE_VIEW_IDS.has(fallbackView)) {
    return fallbackView;
  }
  return "operations";
}

function initializeWorkspacePanels() {
  if (!(ui.workspaceLayout instanceof HTMLElement)) {
    ui.workspacePanels = [];
    return;
  }
  const layout = ui.workspaceLayout;
  const existingPanels = Array.from(layout.querySelectorAll(":scope > [data-workspace-panel]"));
  if (existingPanels.length > 0) {
    ui.workspacePanels = existingPanels;
    return;
  }
  const sectionNodes = Array.from(layout.querySelectorAll(":scope > [data-workspace-section]"));
  const wrappers = new Map();
  for (const view of WORKSPACE_VIEW_IDS) {
    const panel = document.createElement("section");
    panel.className = "workspace-panel";
    panel.dataset.workspacePanel = view;
    panel.hidden = true;
    wrappers.set(view, panel);
  }
  for (const section of sectionNodes) {
    const view = normalizeWorkspaceView(section?.dataset?.workspaceSection, "");
    const panel = wrappers.get(view);
    if (panel) {
      panel.appendChild(section);
    }
  }
  for (const view of WORKSPACE_VIEW_IDS) {
    const panel = wrappers.get(view);
    if (!(panel instanceof HTMLElement)) {
      continue;
    }
    layout.appendChild(panel);
  }
  ui.workspacePanels = Array.from(layout.querySelectorAll(":scope > [data-workspace-panel]"));
}

function initializePanelRegions(root = document) {
  const panels = Array.from(root.querySelectorAll(".panel"));
  let headingCounter = 0;
  for (const panel of panels) {
    if (!(panel instanceof HTMLElement)) {
      continue;
    }
    const heading =
      panel.querySelector(".panel-header h2, .panel-heading h2, h2") ||
      panel.querySelector(".title");
    if (!(heading instanceof HTMLElement)) {
      continue;
    }
    headingCounter += 1;
    heading.id = heading.id || `panel-heading-${headingCounter}`;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", heading.id);
  }
}

function initializeLiveRegionSemantics() {
  const liveNodes = [
    ui.approvalsFeedback,
    ui.auditFeedback,
    document.getElementById("run-builder-feedback"),
    document.getElementById("terminal-feedback"),
    ui.incidentHistorySummary,
    document.getElementById("settings-int-feedback"),
    document.getElementById("settings-aimxs-feedback")
  ];
  for (const node of liveNodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", node.getAttribute("aria-live") || "polite");
    node.setAttribute("aria-atomic", "true");
  }
  if (ui.auditHandoffPreview instanceof HTMLElement) {
    ui.auditHandoffPreview.setAttribute("role", "region");
    ui.auditHandoffPreview.setAttribute("aria-label", "Audit and incident handoff preview");
    ui.auditHandoffPreview.setAttribute("aria-live", "polite");
    ui.auditHandoffPreview.setAttribute("aria-atomic", "true");
  }
}

function activeElementWithin(node) {
  const active = document.activeElement;
  return node instanceof HTMLElement && active instanceof HTMLElement && node.contains(active);
}

function setSubtreeInert(node, inactive) {
  if (!(node instanceof HTMLElement)) {
    return;
  }
  if (inactive) {
    node.setAttribute("inert", "");
  } else {
    node.removeAttribute("inert");
  }
}

function focusElement(node, options = {}) {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  if (!node.hasAttribute("tabindex") && !["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "A"].includes(node.tagName)) {
    node.setAttribute("tabindex", "-1");
  }
  window.requestAnimationFrame(() => {
    node.focus({ preventScroll: options.scroll === false });
  });
  return true;
}

function applyWorkspaceView(view) {
  const selectedView = normalizeWorkspaceView(view, "operations");
  if (ui.workspaceLayout) {
    ui.workspaceLayout.setAttribute("data-workspace-view", selectedView);
  }
  let recoverFocus = false;
  let activeTab = null;
  for (const tab of ui.workspaceTabs || []) {
    const tabView = normalizeWorkspaceView(tab?.dataset?.workspaceTab, "");
    const isActive = tabView === selectedView;
    const panel = (ui.workspacePanels || []).find(
      (item) => normalizeWorkspaceView(item?.dataset?.workspacePanel, "") === tabView
    );
    if (tabView) {
      tab.id = tab.id || `workspace-tab-${tabView}`;
    }
    if (panel && tabView) {
      panel.id = panel.id || `workspace-panel-${tabView}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      tab.setAttribute("aria-controls", panel.id);
    }
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.setAttribute("tabindex", isActive ? "0" : "-1");
    if (isActive) {
      activeTab = tab;
    }
  }
  for (const panel of ui.workspacePanels || []) {
    const panelView = normalizeWorkspaceView(panel?.dataset?.workspacePanel, "");
    const isActive = panelView === selectedView;
    if (!isActive && activeElementWithin(panel)) {
      recoverFocus = true;
    }
    panel.hidden = !isActive;
    panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    setSubtreeInert(panel, !isActive);
  }
  if (recoverFocus && activeTab instanceof HTMLElement) {
    focusElement(activeTab, { scroll: false });
  }
  return selectedView;
}

function setWorkspaceView(view, persist = false) {
  const selectedView = applyWorkspaceView(view);
  if (persist) {
    saveValue(WORKSPACE_VIEW_PREF_KEY, selectedView);
  }
  reconcileOperatorChatFollowLoop();
  return selectedView;
}

function normalizeIncidentSubview(value, fallback = "queue") {
  const requested = String(value || "").trim().toLowerCase();
  if (INCIDENT_SUBVIEW_IDS.has(requested)) {
    return requested;
  }
  const fallbackView = String(fallback || "").trim().toLowerCase();
  if (INCIDENT_SUBVIEW_IDS.has(fallbackView)) {
    return fallbackView;
  }
  return "queue";
}

function applyIncidentSubview(view) {
  const selectedView = normalizeIncidentSubview(view, "queue");
  let recoverFocus = false;
  for (const tab of ui.incidentSubtabs || []) {
    const tabView = normalizeIncidentSubview(tab?.dataset?.incidentSubtab, "");
    const isActive = tabView === selectedView;
    const panel = (ui.incidentSubpanels || []).find(
      (item) => normalizeIncidentSubview(item?.dataset?.incidentSubpanel, "") === tabView
    );
    if (tabView) {
      tab.id = tab.id || `incident-subtab-${tabView}`;
    }
    if (panel && tabView) {
      panel.id = panel.id || `incident-subpanel-${tabView}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      tab.setAttribute("aria-controls", panel.id);
    }
    tab.setAttribute("role", "tab");
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.setAttribute("tabindex", isActive ? "0" : "-1");
  }
  for (const panel of ui.incidentSubpanels || []) {
    const panelView = normalizeIncidentSubview(panel?.dataset?.incidentSubpanel, "");
    const isActive = panelView === selectedView;
    if (!isActive && activeElementWithin(panel)) {
      recoverFocus = true;
    }
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
    panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    setSubtreeInert(panel, !isActive);
  }
  if (recoverFocus) {
    focusActiveIncidentSubview({ scroll: false });
  }
  return selectedView;
}

function setIncidentSubview(view, persist = false) {
  const selected = applyIncidentSubview(view);
  if (persist) {
    saveValue(INCIDENT_SUBVIEW_PREF_KEY, selected);
  }
  return selected;
}

function normalizeSettingsSubview(value, fallback = "configuration") {
  const requested = String(value || "").trim().toLowerCase();
  if (SETTINGS_SUBVIEW_IDS.has(requested)) {
    return requested;
  }
  const fallbackView = String(fallback || "").trim().toLowerCase();
  if (SETTINGS_SUBVIEW_IDS.has(fallbackView)) {
    return fallbackView;
  }
  return "configuration";
}

function applySettingsSubview(view) {
  const selected = normalizeSettingsSubview(view, "configuration");
  const tabs = Array.from(ui.settingsContent?.querySelectorAll("[data-settings-subtab]") || []);
  let recoverFocus = false;
  for (const tab of tabs) {
    const tabView = normalizeSettingsSubview(tab?.dataset?.settingsSubtab, "");
    const isActive = tabView === selected;
    const panel = Array.from(ui.settingsContent?.querySelectorAll("[data-settings-subpanel]") || []).find(
      (item) => normalizeSettingsSubview(item?.dataset?.settingsSubpanel, "") === tabView
    );
    if (tabView) {
      tab.id = tab.id || `settings-subtab-${tabView}`;
    }
    if (panel && tabView) {
      panel.id = panel.id || `settings-subpanel-${tabView}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      tab.setAttribute("aria-controls", panel.id);
    }
    tab.setAttribute("role", "tab");
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
    tab.setAttribute("tabindex", isActive ? "0" : "-1");
  }
  const panels = Array.from(ui.settingsContent?.querySelectorAll("[data-settings-subpanel]") || []);
  for (const panel of panels) {
    const panelView = normalizeSettingsSubview(panel?.dataset?.settingsSubpanel, "");
    const isActive = panelView === selected;
    if (!isActive && activeElementWithin(panel)) {
      recoverFocus = true;
    }
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
    panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    setSubtreeInert(panel, !isActive);
  }
  if (recoverFocus) {
    focusActiveSettingsSubview({ scroll: false });
  }
  return selected;
}

function setSettingsSubview(view, persist = false) {
  settingsSubviewState = normalizeSettingsSubview(view, settingsSubviewState);
  if (!isAdvancedSectionEnabled("settings") && settingsSubviewState === "diagnostics") {
    settingsSubviewState = "configuration";
  }
  const selected = applySettingsSubview(settingsSubviewState);
  if (persist) {
    saveValue(SETTINGS_SUBVIEW_PREF_KEY, selected);
  }
  return selected;
}

function getFocusableTabCandidates(nodes) {
  return (nodes || []).filter(
    (node) =>
      node instanceof HTMLElement &&
      !node.hidden &&
      node.getAttribute("aria-hidden") !== "true" &&
      !node.classList.contains("advanced-hidden")
  );
}

function handleHorizontalTabKeydown(event, nodes, readValue, activate) {
  if (!(event.target instanceof HTMLElement)) {
    return false;
  }
  const key = String(event.key || "");
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) {
    return false;
  }
  const tabs = getFocusableTabCandidates(nodes);
  if (tabs.length === 0) {
    return false;
  }
  const currentIndex = Math.max(0, tabs.indexOf(event.target.closest("[role='tab']")));
  let nextIndex = currentIndex;
  if (key === "Home") {
    nextIndex = 0;
  } else if (key === "End") {
    nextIndex = tabs.length - 1;
  } else if (key === "ArrowLeft" || key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (key === "ArrowRight" || key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % tabs.length;
  }
  const nextTab = tabs[nextIndex];
  if (!(nextTab instanceof HTMLElement)) {
    return false;
  }
  event.preventDefault();
  const requested = readValue(nextTab);
  if (requested) {
    activate(requested);
  }
  nextTab.focus({ preventScroll: true });
  return true;
}

function focusRenderedRegion(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    return false;
  }
  const scroll = options.scroll !== false;
  if (scroll) {
    container.scrollIntoView({ behavior: "smooth", block: options.block || "start" });
  }
  const focusTarget =
    container.querySelector("[data-focus-anchor]") ||
    container.querySelector("h2, .title, .panel-lead, button, input, select, textarea, summary");
  const target = focusTarget instanceof HTMLElement ? focusTarget : container;
  if (!target.hasAttribute("tabindex") && !["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "A"].includes(target.tagName)) {
    target.setAttribute("tabindex", "-1");
  }
  window.requestAnimationFrame(() => {
    target.focus({ preventScroll: true });
  });
  return true;
}

function focusActiveIncidentSubview(options = {}) {
  const panel = (ui.incidentSubpanels || []).find(
    (item) => item instanceof HTMLElement && !item.hidden && item.getAttribute("aria-hidden") !== "true"
  );
  return focusRenderedRegion(panel, options);
}

function focusActiveSettingsSubview(options = {}) {
  const panel = Array.from(ui.settingsContent?.querySelectorAll("[data-settings-subpanel]") || []).find(
    (item) => item instanceof HTMLElement && !item.hidden && item.getAttribute("aria-hidden") !== "true"
  );
  return focusRenderedRegion(panel, options);
}

function normalizeAdvancedSectionState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = {};
  for (const section of ADVANCED_SECTION_IDS) {
    next[section] = source[section] === true;
  }
  return next;
}

function isAdvancedSectionEnabled(sectionID) {
  const section = String(sectionID || "").trim().toLowerCase();
  return Boolean(advancedSectionState?.[section]);
}

function applyAdvancedToggleLabels(root = document) {
  const toggles = Array.from(root.querySelectorAll("[data-advanced-toggle-section]") || []);
  for (const toggle of toggles) {
    if (!(toggle instanceof HTMLElement)) {
      continue;
    }
    const section = String(toggle.dataset.advancedToggleSection || "").trim().toLowerCase();
    if (!ADVANCED_SECTION_IDS.has(section)) {
      continue;
    }
    const enabled = isAdvancedSectionEnabled(section);
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.textContent = enabled ? "Hide advanced details" : "Show advanced details";
  }
}

function applyAdvancedVisibility(root = document) {
  const nodes = Array.from(root.querySelectorAll("[data-advanced-section]") || []);
  let recoverSection = "";
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const section = String(node.dataset.advancedSection || "").trim().toLowerCase();
    if (!ADVANCED_SECTION_IDS.has(section)) {
      continue;
    }
    const enabled = isAdvancedSectionEnabled(section);
    if (!enabled && !recoverSection && activeElementWithin(node)) {
      recoverSection = section;
    }
    node.classList.toggle("advanced-hidden", !enabled);
    node.setAttribute("aria-hidden", enabled ? "false" : "true");
    setSubtreeInert(node, !enabled);
  }
  if (recoverSection) {
    const toggle = root.querySelector(`[data-advanced-toggle-section="${recoverSection}"]`) || document.querySelector(`[data-advanced-toggle-section="${recoverSection}"]`);
    focusElement(toggle, { scroll: false });
  }
}

function applyAdvancedState(root = document) {
  advancedSectionState = normalizeAdvancedSectionState(advancedSectionState);
  applyAdvancedToggleLabels(root);
  applyAdvancedVisibility(root);
  if (!isAdvancedSectionEnabled("settings") && settingsSubviewState === "diagnostics") {
    setSettingsSubview("configuration", true);
  }
}

function setAdvancedSectionEnabled(sectionID, enabled, persist = false) {
  const section = String(sectionID || "").trim().toLowerCase();
  if (!ADVANCED_SECTION_IDS.has(section)) {
    return false;
  }
  advancedSectionState[section] = enabled === true;
  applyAdvancedState();
  if (persist) {
    saveJSON(ADVANCED_SECTION_STATE_KEY, advancedSectionState);
  }
  return advancedSectionState[section] === true;
}

function toggleAdvancedSection(sectionID, persist = false) {
  const section = String(sectionID || "").trim().toLowerCase();
  if (!ADVANCED_SECTION_IDS.has(section)) {
    return false;
  }
  const next = !isAdvancedSectionEnabled(section);
  return setAdvancedSectionEnabled(section, next, persist);
}

function normalizeDetailsOpenState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      continue;
    }
    next[normalizedKey] = value === true;
  }
  return next;
}

function applyDetailsOpenState(root = document) {
  const detailsNodes = Array.from(root.querySelectorAll("details[data-detail-key]") || []);
  for (const node of detailsNodes) {
    if (!(node instanceof HTMLDetailsElement)) {
      continue;
    }
    const key = String(node.dataset.detailKey || "").trim();
    if (!key) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(detailsOpenState, key)) {
      node.open = detailsOpenState[key] === true;
    }
  }
}

function normalizeThemeMode(value, fallback = "system") {
  const requested = String(value || "").trim().toLowerCase();
  if (requested === "light" || requested === "dark" || requested === "system") {
    return requested;
  }
  const nextFallback = String(fallback || "").trim().toLowerCase();
  if (nextFallback === "light" || nextFallback === "dark" || nextFallback === "system") {
    return nextFallback;
  }
  return "system";
}

function resolveThemeMode(defaultMode) {
  const saved = normalizeThemeMode(readSavedValue(THEME_PREF_KEY), "");
  if (saved) {
    return saved;
  }
  return normalizeThemeMode(defaultMode, "system");
}

function applyThemeMode(mode) {
  const requested = String(mode || "system").trim().toLowerCase();
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effective = requested === "system" ? (prefersDark ? "dark" : "light") : requested;
  document.documentElement.setAttribute("data-theme", effective);
  document.documentElement.setAttribute("data-theme-mode", requested);
  return { requested, effective };
}

function formatRefreshClock() {
  try {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (_) {
    return "-";
  }
}

function setRefreshStatus(tone, detail = "") {
  if (!(ui.refreshStatus instanceof HTMLElement)) {
    return;
  }
  const state = String(tone || "").trim().toLowerCase();
  let chipClass = "chip chip-neutral chip-compact";
  if (state === "ok") {
    chipClass = "chip chip-ok chip-compact";
  } else if (state === "warn" || state === "loading") {
    chipClass = "chip chip-warn chip-compact";
  } else if (state === "error") {
    chipClass = "chip chip-danger chip-compact";
  }
  const text = String(detail || "").trim();
  ui.refreshStatus.className = chipClass;
  ui.refreshStatus.textContent = text ? `Data: ${text}` : "Data: idle";
}

function populateAgentProfileSelect(ui, profiles, selectedID) {
  if (!ui.settingsAgentProfile) {
    return;
  }

  const entries = Array.isArray(profiles) ? profiles : [];
  const options = entries
    .map((profile) => {
      const id = String(profile?.id || "").trim().toLowerCase();
      const label = String(profile?.label || id || "unknown").trim();
      return { id, label };
    })
    .filter((item) => item.id);

  ui.settingsAgentProfile.innerHTML = options
    .map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.label)}</option>`)
    .join("");

  const fallbackID = options[0]?.id || "codex";
  const nextSelected = options.some((item) => item.id === selectedID) ? selectedID : fallbackID;
  ui.settingsAgentProfile.value = nextSelected;
}

function resolveSelectedAgentID(choices, ui) {
  const configured = String(choices?.integrations?.selectedAgentProfileId || "").trim().toLowerCase();
  const saved = readSavedValue(AGENT_PREF_KEY).toLowerCase();
  const candidate = configured || saved;
  const profiles = Array.isArray(choices?.integrations?.agentProfiles)
    ? choices.integrations.agentProfiles
    : [];
  if (profiles.some((profile) => String(profile?.id || "").trim().toLowerCase() === candidate)) {
    return candidate;
  }
  return String(profiles[0]?.id || "codex").trim().toLowerCase();
}

function applyProjectContext(projectID) {
  const selectedProject = String(projectID || "").trim();
  if (ui.runsProjectFilter) {
    ui.runsProjectFilter.value = selectedProject;
  }
  if (ui.approvalsProjectFilter) {
    ui.approvalsProjectFilter.value = selectedProject;
  }
  if (ui.auditProjectFilter) {
    ui.auditProjectFilter.value = selectedProject;
  }
  if (ui.rbProjectId) {
    ui.rbProjectId.value = selectedProject;
  }
}

function setControlValue(control, value) {
  if (
    !(control instanceof HTMLInputElement) &&
    !(control instanceof HTMLSelectElement) &&
    !(control instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  control.value = String(value ?? "");
}

function normalizeListFilterState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const runs = source?.runs && typeof source.runs === "object" ? source.runs : {};
  const approvals =
    source?.approvals && typeof source.approvals === "object" ? source.approvals : {};
  const audit = source?.audit && typeof source.audit === "object" ? source.audit : {};
  const incidents =
    source?.incidents && typeof source.incidents === "object" ? source.incidents : {};
  const terminalHistory =
    source?.terminalHistory && typeof source.terminalHistory === "object"
      ? source.terminalHistory
      : {};

  return {
    runs: {
      runId: String(runs.runId || "").trim(),
      tenant: String(runs.tenant || "").trim(),
      project: String(runs.project || "").trim(),
      status: String(runs.status || "").trim().toUpperCase(),
      decision: String(runs.decision || "").trim().toUpperCase(),
      timeRange: normalizeTimeRange(runs.timeRange),
      timeFrom: String(runs.timeFrom || "").trim(),
      timeTo: String(runs.timeTo || "").trim(),
      sort: String(runs.sort || "updated_desc").trim().toLowerCase(),
      limit: parsePositiveInt(runs.limit, 25, 1, 500),
      pageSize: parsePositiveInt(runs.pageSize, 25, 1, 500),
      page: parsePositiveInt(runs.page, 1, 1, 999999)
    },
    approvals: {
      tenant: String(approvals.tenant || "").trim(),
      project: String(approvals.project || "").trim(),
      status: String(approvals.status || "").trim().toUpperCase(),
      timeRange: normalizeTimeRange(approvals.timeRange),
      timeFrom: String(approvals.timeFrom || "").trim(),
      timeTo: String(approvals.timeTo || "").trim(),
      sort: String(approvals.sort || "ttl_asc").trim().toLowerCase(),
      pageSize: parsePositiveInt(approvals.pageSize, 25, 1, 500),
      page: parsePositiveInt(approvals.page, 1, 1, 999999),
      ttlSeconds: parsePositiveInt(approvals.ttlSeconds, 900, 60, 86400)
    },
    audit: {
      tenant: String(audit.tenant || "").trim(),
      project: String(audit.project || "").trim(),
      provider: String(audit.provider || "").trim(),
      event: String(audit.event || "").trim(),
      decision: String(audit.decision || "").trim().toUpperCase(),
      timeRange: normalizeTimeRange(audit.timeRange),
      timeFrom: String(audit.timeFrom || "").trim(),
      timeTo: String(audit.timeTo || "").trim(),
      pageSize: parsePositiveInt(audit.pageSize, 25, 1, 500),
      page: parsePositiveInt(audit.page, 1, 1, 999999)
    },
    incidents: {
      status: normalizeIncidentHistoryStatusFilter(incidents.status),
      sort: normalizeIncidentHistorySort(incidents.sort),
      search: normalizeIncidentHistorySearch(incidents.search),
      timeRange: normalizeIncidentHistoryTimeRange(incidents.timeRange),
      timeFrom: String(incidents.timeFrom || "").trim(),
      timeTo: String(incidents.timeTo || "").trim(),
      pageSize: parsePositiveInt(incidents.pageSize, 25, 1, 500),
      page: parsePositiveInt(incidents.page, 1, 1, 999999)
    },
    terminalHistory: {
      run: String(terminalHistory.run || "").trim(),
      status: String(terminalHistory.status || "").trim().toUpperCase()
    }
  };
}

function applyListFilterState(raw) {
  const state = normalizeListFilterState(raw);
  setControlValue(ui.runsRunIdFilter, state.runs.runId);
  setControlValue(ui.runsTenantFilter, state.runs.tenant);
  setControlValue(ui.runsProjectFilter, state.runs.project);
  setControlValue(ui.runsStatusFilter, state.runs.status);
  setControlValue(ui.runsDecisionFilter, state.runs.decision);
  setControlValue(ui.runsTimeRange, state.runs.timeRange);
  setControlValue(ui.runsTimeFrom, state.runs.timeFrom);
  setControlValue(ui.runsTimeTo, state.runs.timeTo);
  setControlValue(ui.runsSort, state.runs.sort);
  setControlValue(ui.runsLimitFilter, state.runs.limit);
  setControlValue(ui.runsPageSize, state.runs.pageSize);
  setControlValue(ui.runsPage, state.runs.page);

  setControlValue(ui.approvalsTenantFilter, state.approvals.tenant);
  setControlValue(ui.approvalsProjectFilter, state.approvals.project);
  setControlValue(ui.approvalsStatusFilter, state.approvals.status);
  setControlValue(ui.approvalsTimeRange, state.approvals.timeRange);
  setControlValue(ui.approvalsTimeFrom, state.approvals.timeFrom);
  setControlValue(ui.approvalsTimeTo, state.approvals.timeTo);
  setControlValue(ui.approvalsSort, state.approvals.sort);
  setControlValue(ui.approvalsPageSize, state.approvals.pageSize);
  setControlValue(ui.approvalsPage, state.approvals.page);
  setControlValue(ui.approvalsTTLSeconds, state.approvals.ttlSeconds);

  setControlValue(ui.auditTenantFilter, state.audit.tenant);
  setControlValue(ui.auditProjectFilter, state.audit.project);
  setControlValue(ui.auditProviderFilter, state.audit.provider);
  setControlValue(ui.auditEventFilter, state.audit.event);
  setControlValue(ui.auditDecisionFilter, state.audit.decision);
  setControlValue(ui.auditTimeRange, state.audit.timeRange);
  setControlValue(ui.auditTimeFrom, state.audit.timeFrom);
  setControlValue(ui.auditTimeTo, state.audit.timeTo);
  setControlValue(ui.auditPageSize, state.audit.pageSize);
  setControlValue(ui.auditPage, state.audit.page);

  setControlValue(ui.terminalHistoryRunFilter, state.terminalHistory.run);
  setControlValue(ui.terminalHistoryStatusFilter, state.terminalHistory.status);

  incidentHistoryViewState.status = state.incidents.status;
  incidentHistoryViewState.sort = state.incidents.sort;
  incidentHistoryViewState.search = state.incidents.search;
  incidentHistoryViewState.timeRange = state.incidents.timeRange;
  incidentHistoryViewState.timeFrom = state.incidents.timeFrom;
  incidentHistoryViewState.timeTo = state.incidents.timeTo;
  incidentHistoryViewState.pageSize = state.incidents.pageSize;
  incidentHistoryViewState.page = state.incidents.page;
  applyIncidentHistoryViewControls();
  syncCustomTimeFilterControls("runs");
  syncCustomTimeFilterControls("approvals");
  syncCustomTimeFilterControls("audit");
  syncCustomTimeFilterControls("incidents");
  return state;
}

function resolveCustomTimeFilterControls(sectionID) {
  const section = String(sectionID || "").trim().toLowerCase();
  if (section === "runs") {
    return {
      range: ui.runsTimeRange,
      from: ui.runsTimeFrom,
      to: ui.runsTimeTo,
      fields: document.querySelector('[data-time-filter-fields="runs"]')
    };
  }
  if (section === "approvals") {
    return {
      range: ui.approvalsTimeRange,
      from: ui.approvalsTimeFrom,
      to: ui.approvalsTimeTo,
      fields: document.querySelector('[data-time-filter-fields="approvals"]')
    };
  }
  if (section === "audit") {
    return {
      range: ui.auditTimeRange,
      from: ui.auditTimeFrom,
      to: ui.auditTimeTo,
      fields: document.querySelector('[data-time-filter-fields="audit"]')
    };
  }
  if (section === "incidents") {
    return {
      range: ui.incidentHistoryTimeRange,
      from: ui.incidentHistoryTimeFrom,
      to: ui.incidentHistoryTimeTo,
      fields: document.querySelector('[data-time-filter-fields="incidents"]')
    };
  }
  return null;
}

function syncCustomTimeFilterControls(sectionID) {
  const controls = resolveCustomTimeFilterControls(sectionID);
  if (!controls?.range || !controls?.from || !controls?.to || !(controls.fields instanceof HTMLElement)) {
    return;
  }
  const customSelected = String(controls.range.value || "").trim().toLowerCase() === "custom";
  if (!customSelected) {
    controls.from.value = "";
    controls.to.value = "";
  }
  controls.fields.hidden = !customSelected;
  controls.fields.setAttribute("aria-hidden", customSelected ? "false" : "true");
  setSubtreeInert(controls.fields, !customSelected);
  controls.from.disabled = !customSelected;
  controls.to.disabled = !customSelected;
}

function promoteCustomTimeFilter(sectionID) {
  const controls = resolveCustomTimeFilterControls(sectionID);
  if (!controls?.range) {
    return;
  }
  if (String(controls.range.value || "").trim().toLowerCase() !== "custom") {
    controls.range.value = "custom";
  }
  syncCustomTimeFilterControls(sectionID);
}

function readListFilterStateFromUI() {
  return normalizeListFilterState({
    runs: {
      runId: ui.runsRunIdFilter?.value,
      tenant: ui.runsTenantFilter?.value,
      project: ui.runsProjectFilter?.value,
      status: ui.runsStatusFilter?.value,
      decision: ui.runsDecisionFilter?.value,
      timeRange: ui.runsTimeRange?.value,
      timeFrom: ui.runsTimeFrom?.value,
      timeTo: ui.runsTimeTo?.value,
      sort: ui.runsSort?.value,
      limit: ui.runsLimitFilter?.value,
      pageSize: ui.runsPageSize?.value,
      page: ui.runsPage?.value
    },
    approvals: {
      tenant: ui.approvalsTenantFilter?.value,
      project: ui.approvalsProjectFilter?.value,
      status: ui.approvalsStatusFilter?.value,
      timeRange: ui.approvalsTimeRange?.value,
      timeFrom: ui.approvalsTimeFrom?.value,
      timeTo: ui.approvalsTimeTo?.value,
      sort: ui.approvalsSort?.value,
      pageSize: ui.approvalsPageSize?.value,
      page: ui.approvalsPage?.value,
      ttlSeconds: ui.approvalsTTLSeconds?.value
    },
    audit: {
      tenant: ui.auditTenantFilter?.value,
      project: ui.auditProjectFilter?.value,
      provider: ui.auditProviderFilter?.value,
      event: ui.auditEventFilter?.value,
      decision: ui.auditDecisionFilter?.value,
      timeRange: ui.auditTimeRange?.value,
      timeFrom: ui.auditTimeFrom?.value,
      timeTo: ui.auditTimeTo?.value,
      pageSize: ui.auditPageSize?.value,
      page: ui.auditPage?.value
    },
    incidents: {
      status: incidentHistoryViewState.status,
      sort: incidentHistoryViewState.sort,
      search: incidentHistoryViewState.search,
      timeRange: incidentHistoryViewState.timeRange,
      timeFrom: incidentHistoryViewState.timeFrom,
      timeTo: incidentHistoryViewState.timeTo,
      pageSize: incidentHistoryViewState.pageSize,
      page: incidentHistoryViewState.page
    },
    terminalHistory: {
      run: ui.terminalHistoryRunFilter?.value,
      status: ui.terminalHistoryStatusFilter?.value
    }
  });
}

function persistListFilterStateFromUI() {
  const nextState = readListFilterStateFromUI();
  const nextDigest = JSON.stringify(nextState);
  if (nextDigest === listFilterStateDigest) {
    return;
  }
  listFilterStateDigest = nextDigest;
  saveJSON(LIST_FILTER_STATE_KEY, nextState);
}

function chipClassForEndpointState(value) {
  const state = String(value || "").trim().toLowerCase();
  if (state === "available" || state === "mock" || state === "ready") {
    return "chip chip-ok chip-compact";
  }
  if (state === "fallback" || state === "unknown") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-danger chip-compact";
}

function collectProjectScopeIDs(snapshot, session) {
  const ids = new Set();
  const fromSession = String(session?.claims?.project_id || "").trim();
  if (fromSession) {
    ids.add(fromSession);
  }

  const sources = [
    snapshot?.runs?.items,
    snapshot?.approvals?.items,
    snapshot?.audit?.items
  ];
  for (const list of sources) {
    for (const item of list || []) {
      const projectID = String(item?.projectId || "").trim();
      if (projectID) {
        ids.add(projectID);
      }
    }
  }
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

function renderContextBar(snapshot, session, settings) {
  if (ui.contextProjectSelect) {
    const projectIDs = collectProjectScopeIDs(snapshot, session);
    const savedProject = String(readSavedValue(PROJECT_PREF_KEY) || "").trim();
    const claimProject = String(session?.claims?.project_id || "").trim();
    const existingProject = String(ui.contextProjectSelect.value || "").trim();
    const preferredProject = savedProject || existingProject || claimProject;
    if (preferredProject && !projectIDs.includes(preferredProject)) {
      projectIDs.unshift(preferredProject);
    }
    const projectOptions = [
      `<option value="">project:any</option>`,
      ...projectIDs.map((projectID) => {
        return `<option value="${escapeHTML(projectID)}">${escapeHTML(projectID)}</option>`;
      })
    ].join("");
    ui.contextProjectSelect.innerHTML = projectOptions;
    ui.contextProjectSelect.value = preferredProject;
  }

  if (ui.contextAgentProfile) {
    const integrations = settings?.integrations || {};
    const profiles = Array.isArray(integrations.agentProfiles) ? integrations.agentProfiles : [];
    const selectedAgentProfile = String(integrations.selectedAgentProfileId || "").trim().toLowerCase();
    const active =
      profiles.find((item) => String(item?.id || "").trim().toLowerCase() === selectedAgentProfile) || null;
    const label = active?.label || selectedAgentProfile || "-";
    const provider = active?.provider || "-";
    const model = active?.model || "-";
    ui.contextAgentProfile.innerHTML = `
      <span class="chip chip-neutral chip-compact">${escapeHTML(label)}</span>
      <span class="meta">provider=${escapeHTML(provider)}</span>
      <span class="meta">model=${escapeHTML(model)}</span>
    `;
  }

  if (ui.contextEndpointBadges) {
    const endpoints = Array.isArray(settings?.endpoints) ? settings.endpoints : [];
    ui.contextEndpointBadges.innerHTML = endpoints
      .map((endpoint) => {
        const endpointID = String(endpoint?.id || "").trim().toLowerCase();
        const label = endpointID || String(endpoint?.label || "endpoint").trim().toLowerCase();
        const state = String(endpoint?.state || "unknown").trim().toLowerCase();
        if (!endpointID) {
          return `<span class="${chipClassForEndpointState(state)}">${escapeHTML(label)}:${escapeHTML(state)}</span>`;
        }
        return `
          <button
            class="${chipClassForEndpointState(state)} context-endpoint-button"
            type="button"
            data-context-endpoint-id="${escapeHTML(endpointID)}"
            title="Open ${escapeHTML(label)} endpoint detail"
          >${escapeHTML(label)}:${escapeHTML(state)}</button>
        `;
      })
      .join("");
  }
}

function focusSettingsEndpointRow(endpointID) {
  const target = String(endpointID || "").trim().toLowerCase();
  if (!target || !ui.settingsContent) {
    return false;
  }
  const rows = Array.from(ui.settingsContent.querySelectorAll("[data-settings-endpoint-id]"));
  const row = rows.find(
    (item) => String(item?.dataset?.settingsEndpointId || "").trim().toLowerCase() === target
  );
  if (!row) {
    return false;
  }

  const highlighted = ui.settingsContent.querySelectorAll(".settings-row-focus");
  highlighted.forEach((item) => item.classList.remove("settings-row-focus"));
  row.classList.add("settings-row-focus");
  window.setTimeout(() => {
    row.classList.remove("settings-row-focus");
  }, 1800);
  row.setAttribute("tabindex", "-1");
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  window.requestAnimationFrame(() => {
    row.focus({ preventScroll: true });
  });
  return true;
}

function settingsEditorChipClass(value) {
  const status = String(value || "clean").trim().toLowerCase();
  if (status === "applied" || status === "saved") {
    return "chip chip-ok";
  }
  if (status === "dirty" || status === "pending_apply") {
    return "chip chip-warn";
  }
  if (status === "invalid" || status === "error") {
    return "chip chip-danger";
  }
  return "chip chip-neutral";
}

function settingsEditorStatusLabel(value) {
  const status = String(value || "clean").trim().toLowerCase();
  if (status === "pending_apply") {
    return "Pending Apply";
  }
  return status
    .split("_")
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ") || "Clean";
}

function buildSettingsEditorState(
  projectID,
  settings,
  draftsByProject,
  statusByProject,
  overridesByProject,
  syncStateByProject
) {
  const key = normalizeProjectScopeKey(projectID);
  const overrideEntry = overridesByProject?.[key] || null;
  const statusEntry = statusByProject?.[key] || null;
  const syncState = String(syncStateByProject?.[key] || "unknown")
    .trim()
    .toLowerCase();
  const fallbackDraft = buildEditorDraftFromChoices(
    { integrations: settings?.integrations || {} },
    settings?.integrations?.selectedAgentProfileId
  );

  const status = String(
    statusEntry?.status || (overrideEntry?.applied ? "applied" : overrideEntry?.override ? "saved" : "clean")
  )
    .trim()
    .toLowerCase();

  return {
    projectId: String(projectID || "").trim() || "project:any",
    draft: draftsByProject?.[key] || overrideEntry?.override || fallbackDraft,
    status,
    message: statusEntry?.message || "",
    errors: Array.isArray(statusEntry?.errors) ? statusEntry.errors : [],
    warnings: Array.isArray(statusEntry?.warnings) ? statusEntry.warnings : [],
    hasSavedOverride: Boolean(overrideEntry?.override),
    applied: Boolean(overrideEntry?.applied),
    source: String(overrideEntry?.source || "").trim().toLowerCase(),
    syncState,
    scopeTenantId: String(overrideEntry?.tenantId || "").trim(),
    scopeProjectId: String(overrideEntry?.projectId || "").trim(),
    savedAt: String(overrideEntry?.savedAt || "").trim(),
    appliedAt: String(overrideEntry?.appliedAt || "").trim()
  };
}

function renderSettingsEditorFeedbackInline(state) {
  if (!ui.settingsContent) {
    return;
  }
  const chip = ui.settingsContent.querySelector("#settings-int-status-chip");
  if (chip instanceof HTMLElement) {
    chip.className = settingsEditorChipClass(state?.status);
    chip.textContent = settingsEditorStatusLabel(state?.status);
  }

  const feedback = ui.settingsContent.querySelector("#settings-int-feedback");
  if (!(feedback instanceof HTMLElement)) {
    return;
  }

  const errors = Array.isArray(state?.errors) ? state.errors : [];
  const warnings = Array.isArray(state?.warnings) ? state.warnings : [];
  const parts = [];
  const message = String(state?.message || "").trim();
  if (message) {
    parts.push(`<div class="meta">${escapeHTML(message)}</div>`);
  }
  for (const item of errors) {
    parts.push(`<div class="meta settings-editor-error">Blocked: ${escapeHTML(item)}</div>`);
  }
  for (const item of warnings) {
    parts.push(`<div class="meta settings-editor-warn">Review before apply: ${escapeHTML(item)}</div>`);
  }
  if (!message && errors.length === 0 && warnings.length === 0) {
    parts.push("<div class=\"meta\">Next step: edit the draft, then Save Draft for a checkpoint or Apply Saved for this project scope.</div>");
  }
  parts.push(
    `<div class="meta">draftSaved=${escapeHTML(String(Boolean(state?.hasSavedOverride)))}; applied=${escapeHTML(String(Boolean(state?.applied)))}</div>`
  );
  if (state?.savedAt) {
    parts.push(`<div class="meta">draftSavedAt=${escapeHTML(String(state.savedAt))}</div>`);
  }
  if (state?.appliedAt) {
    parts.push(`<div class="meta">appliedAt=${escapeHTML(String(state.appliedAt))}</div>`);
  }
  feedback.innerHTML = parts.join("");
}

function renderAimxsEditorFeedbackInline(state) {
  if (!ui.settingsContent) {
    return;
  }
  const chip = ui.settingsContent.querySelector("#settings-aimxs-status-chip");
  if (chip instanceof HTMLElement) {
    chip.className = settingsEditorChipClass(state?.status);
    chip.textContent = settingsEditorStatusLabel(state?.status);
  }

  const feedback = ui.settingsContent.querySelector("#settings-aimxs-feedback");
  if (!(feedback instanceof HTMLElement)) {
    return;
  }

  const errors = Array.isArray(state?.errors) ? state.errors : [];
  const warnings = Array.isArray(state?.warnings) ? state.warnings : [];
  const message = String(state?.message || "").trim();
  const parts = [];
  if (message) {
    parts.push(`<div class="meta">${escapeHTML(message)}</div>`);
  }
  for (const item of errors) {
    parts.push(`<div class="meta settings-editor-error">Blocked: ${escapeHTML(item)}</div>`);
  }
  for (const item of warnings) {
    parts.push(`<div class="meta settings-editor-warn">Review before apply: ${escapeHTML(item)}</div>`);
  }
  parts.push(
    "<div class=\"meta\">Next step: confirm entitlement and valid ref:// credential references, then rerun Apply AIMXS Settings.</div>"
  );
  feedback.innerHTML = parts.join("");
}

function safeFileToken(value, fallback = "any") {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function buildTimestampToken(value = new Date().toISOString()) {
  return String(value || new Date().toISOString())
    .trim()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

function buildAuditFileSuffix(filters, generatedAt = new Date().toISOString()) {
  const tenant = safeFileToken(filters?.tenant, "tenant-any");
  const project = safeFileToken(filters?.project, "project-any");
  const provider = safeFileToken(filters?.providerId, "provider-any");
  const decision = safeFileToken(filters?.decision, "decision-any");
  const timestamp = buildTimestampToken(generatedAt);
  return `${tenant}-${project}-${provider}-${decision}-${timestamp}`;
}

function buildAuditExportFileName(format, filters, generatedAt) {
  const extension = String(format || "").trim().toLowerCase() === "csv" ? "csv" : "json";
  return `epydios-agentops-audit-events-${buildAuditFileSuffix(filters, generatedAt)}.${extension}`;
}

function buildIncidentPackageFileName(runId, filters, generatedAt) {
  const runToken = safeFileToken(runId, "run");
  return `epydios-agentops-incident-package-${runToken}-${buildAuditFileSuffix(filters, generatedAt)}.json`;
}

function buildIncidentSelectionFileName(count, generatedAt) {
  const safeCount = Math.max(0, Number(count) || 0);
  return `epydios-agentops-incident-selected-bundle-${safeCount}-items-${buildTimestampToken(generatedAt)}.json`;
}

function formatScopeLabel(tenantId, projectId) {
  const tenant = String(tenantId || "").trim() || "-";
  const project = String(projectId || "").trim() || "-";
  return `${tenant}/${project}`;
}

function resolveAuditBundleScope(bundle) {
  return formatScopeLabel(bundle?.meta?.filters?.tenant, bundle?.meta?.filters?.project);
}

function resolveIncidentPackageScope(pkg) {
  return formatScopeLabel(
    pkg?.run?.summary?.tenantId || pkg?.approval?.record?.tenantId || pkg?.audit?.meta?.filters?.tenant,
    pkg?.run?.summary?.projectId || pkg?.approval?.record?.projectId || pkg?.audit?.meta?.filters?.project
  );
}

function resolveIncidentPackageSources(pkg) {
  return [
    `run:${String(pkg?.run?.detailSource || "").trim() || "-"}`,
    `approval:${String(pkg?.approval?.source || "").trim() || "-"}`,
    `audit:${String(pkg?.audit?.meta?.source || "").trim() || "-"}`
  ].join(",");
}

function buildAuditTraceabilitySummary(bundle, fileName = "") {
  const parts = [];
  if (fileName) {
    parts.push(`file=${fileName}`);
  }
  parts.push(`source=${String(bundle?.meta?.source || "").trim() || "-"}`);
  parts.push(`scope=${resolveAuditBundleScope(bundle)}`);
  parts.push(`generatedAt=${String(bundle?.meta?.generatedAt || "").trim() || "-"}`);
  return parts.join("; ");
}

function buildIncidentTraceabilitySummary(pkg, fileName = "") {
  const parts = [
    `packageId=${String(pkg?.meta?.packageId || "").trim() || "-"}`,
    `scope=${resolveIncidentPackageScope(pkg)}`,
    `generatedAt=${String(pkg?.meta?.generatedAt || "").trim() || "-"}`,
    `sources=${resolveIncidentPackageSources(pkg)}`
  ];
  if (fileName) {
    parts.splice(1, 0, `file=${fileName}`);
  }
  return parts.join("; ");
}

function buildIncidentEntryTraceabilitySummary(entry) {
  return [
    `scope=${String(entry?.scope || "").trim() || "-"}`,
    `generatedAt=${String(entry?.generatedAt || entry?.createdAt || "").trim() || "-"}`,
    `sources=run:${String(entry?.runDetailSource || "").trim() || "-"},approval:${String(entry?.approvalSource || "").trim() || "-"},audit:${String(entry?.auditSource || "").trim() || "-"}`
  ].join("; ");
}

function resolveGovernedExportProfileCatalog(clientSurface = "desktop", overrideCatalog = null) {
  if (overrideCatalog && Array.isArray(overrideCatalog.items) && overrideCatalog.items.length > 0) {
    return overrideCatalog;
  }
  if (String(clientSurface || "").trim().toLowerCase() === "chat") {
    return operatorChatState?.catalogs?.exportProfiles || null;
  }
  return desktopGovernedExportCatalogState?.exportProfiles || null;
}

function resolveGovernedOrgAdminCatalog(clientSurface = "desktop", overrideCatalog = null) {
  if (overrideCatalog && Array.isArray(overrideCatalog.items) && overrideCatalog.items.length > 0) {
    return overrideCatalog;
  }
  if (String(clientSurface || "").trim().toLowerCase() === "chat") {
    return operatorChatState?.catalogs?.orgAdminProfiles || null;
  }
  return desktopGovernedExportCatalogState?.orgAdminProfiles || null;
}

function buildDesktopGovernedExportOptions(exportProfile, audience, reportType = "export", clientSurface = "desktop", exportProfileCatalog = null, retentionClass = "") {
  return buildDesktopGovernedExportOptionsInternal(
    exportProfile,
    audience,
    reportType,
    clientSurface,
    resolveGovernedExportProfileCatalog(clientSurface, exportProfileCatalog),
    retentionClass
  );
}

function describeGovernedExportDisposition(result = {}) {
  return describeGovernedExportDispositionInternal(result);
}

function describeGovernedExportRedactions(result = {}, noun = "export") {
  return describeGovernedExportRedactionsInternal(result, noun);
}

function resolveOperatorChatGovernedExportSelection() {
  return resolveChatGovernedExportSelection(
    operatorChatState?.exportSelection || {},
    operatorChatState?.catalogs?.exportProfiles || null
  );
}

function exportGovernedJson(payload, fileName, options = {}) {
  const prepared = prepareGovernedJsonExport(payload, {
    ...options,
    orgAdminCatalog: resolveGovernedOrgAdminCatalog(options?.clientSurface || "desktop", options?.orgAdminCatalog || options?.orgAdminProfiles || null)
  });
  triggerTextDownload(prepared.serialized, fileName, "application/json;charset=utf-8");
  return prepared;
}

async function copyGovernedText(text, options = {}) {
  const prepared = prepareGovernedTextExport(text, {
    ...options,
    orgAdminCatalog: resolveGovernedOrgAdminCatalog(options?.clientSurface || "desktop", options?.orgAdminCatalog || options?.orgAdminProfiles || null)
  });
  await copyTextToClipboard(prepared.text);
  return prepared;
}

function downloadGovernedText(text, fileName, mimeType = "text/plain;charset=utf-8", options = {}) {
  const prepared = prepareGovernedTextExport(text, {
    ...options,
    orgAdminCatalog: resolveGovernedOrgAdminCatalog(options?.clientSurface || "desktop", options?.orgAdminCatalog || options?.orgAdminProfiles || null)
  });
  triggerTextDownload(prepared.text, fileName, mimeType);
  return prepared;
}

function triggerTextDownload(content, fileName, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([String(content || "")], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyTextToClipboard(text) {
  const payload = String(text || "");
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload);
    return true;
  }
  const area = document.createElement("textarea");
  area.value = payload;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  return Boolean(copied);
}

function renderAuditFilingFeedback(tone, message) {
  if (!(ui.auditFeedback instanceof HTMLElement)) {
    return;
  }
  const normalizedTone = String(tone || "warn").trim().toLowerCase();
  const state =
    normalizedTone === "ok"
      ? "success"
      : normalizedTone === "error"
        ? "error"
        : normalizedTone === "warn"
          ? "warn"
          : "info";
  const title =
    normalizedTone === "ok"
      ? "Audit/Incident Action Complete"
      : normalizedTone === "error"
        ? "Audit/Incident Action Failed"
        : normalizedTone === "warn"
          ? "Audit/Incident Action Needs Review"
          : "Audit And Incident Actions";
  ui.auditFeedback.innerHTML = renderPanelStateMetric(state, title, message || "");
}

function requestTypedConfirmation(title, lines, acknowledgement) {
  const heading = String(title || "").trim() || "Confirm action";
  const detailLines = Array.isArray(lines)
    ? lines.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const requiredPhrase = String(acknowledgement || "").trim().toUpperCase();
  const promptText = [
    heading,
    "",
    ...detailLines,
    "",
    `Type ${requiredPhrase} to continue.`
  ].join("\n");
  if (typeof window?.prompt === "function") {
    const response = window.prompt(promptText, "");
    if (response === null) {
      return { confirmed: false, reason: "cancelled" };
    }
    if (String(response || "").trim().toUpperCase() !== requiredPhrase) {
      return { confirmed: false, reason: "mismatch" };
    }
    return { confirmed: true, reason: "confirmed" };
  }
  if (typeof window?.confirm === "function") {
    return {
      confirmed: Boolean(window.confirm(promptText)),
      reason: "confirm_fallback"
    };
  }
  return { confirmed: true, reason: "prompt_unavailable" };
}

function confirmIncidentQueueClear(totalCount, selectedCount) {
  return requestTypedConfirmation(
    "Clear Incident Queue",
    [
      `Scope: queue rows=${String(totalCount || 0)}; selected rows=${String(selectedCount || 0)}.`,
      "Effect: this removes every tracked incident package from the local queue and clears current selection.",
      "Impact: queue contents, copied handoff history context, and download shortcuts will be removed from this UI state.",
      "Recovery: this cannot be undone from this prompt; you would need to rebuild incident packages manually."
    ],
    "CLEAR QUEUE"
  );
}

function confirmResetProjectOverride(scope, projectID) {
  const tenantId = String(scope?.tenantId || "").trim() || "tenant:unscoped";
  const scopedProjectId = String(scope?.projectId || projectID || "").trim() || "project:any";
  return requestTypedConfirmation(
    "Reset Project Override",
    [
      `Scope: tenant=${tenantId}; project=${scopedProjectId}.`,
      "Effect: this replaces the current project override with baseline defaults and discards unsaved edits in the editor.",
      "Impact: runtime-linked settings for this project scope may be overwritten immediately when the runtime endpoint is available.",
      "Recovery: this cannot be undone from this prompt; you would need to rebuild and re-apply the prior override manually."
    ],
    "RESET OVERRIDE"
  );
}

function buildIncidentPackageHandoffText(pkg) {
  const meta = pkg?.meta || {};
  const run = pkg?.run || {};
  const approval = pkg?.approval || {};
  const audit = pkg?.audit || {};
  const summary = audit?.summary || {};
  const scope = resolveIncidentPackageScope(pkg);
  const auditSource = String(audit?.meta?.source || "").trim() || "-";
  const auditGeneratedAt = String(audit?.meta?.generatedAt || "").trim() || "-";
  const auditTimeRange = String(audit?.meta?.filters?.timeRange || "").trim() || "any";
  const auditTimeFrom = String(audit?.meta?.filters?.timeFrom || "").trim() || "-";
  const auditTimeTo = String(audit?.meta?.filters?.timeTo || "").trim() || "-";
  const provenanceTag = String(
    run?.detail?.provenance?.commandTag || run?.summary?.provenanceTag || run?.detail?.provenanceTag || ""
  ).trim() || "-";
  return [
    "Epydios AgentOps Desktop Incident Handoff Summary",
    `packageId=${String(meta.packageId || "").trim() || "-"}`,
    `generatedAt=${String(meta.generatedAt || "").trim() || "-"}`,
    `actor=${String(meta.actor || "").trim() || "-"}`,
    `scope=${scope}`,
    `packageVersion=${String(meta.packageVersion || "").trim() || "-"}`,
    `runId=${String(run.runId || "").trim() || "-"}`,
    `runDetailSource=${String(run.detailSource || "").trim() || "-"}`,
    `approvalStatus=${String(approval.status || "").trim() || "-"}`,
    `approvalSource=${String(approval.source || "").trim() || "-"}`,
    `auditSource=${auditSource}`,
    `auditGeneratedAt=${auditGeneratedAt}`,
    `auditScope=${formatScopeLabel(audit?.meta?.filters?.tenant, audit?.meta?.filters?.project)}`,
    `auditTimeRange=${auditTimeRange}`,
    `auditTimeFrom=${auditTimeFrom}`,
    `auditTimeTo=${auditTimeTo}`,
    `provenanceTag=${provenanceTag}`,
    `auditMatchedCount=${String(audit?.meta?.matchedCount ?? 0)}`,
    `auditDecisionBreakdown=ALLOW:${String(summary.allowCount ?? 0)};DENY:${String(summary.denyCount ?? 0)};OTHER:${String(summary.otherCount ?? 0)}`
  ].join("\n");
}

function normalizeIncidentFilingStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "drafted" || normalized === "filed" || normalized === "closed") {
    return normalized;
  }
  return "drafted";
}

function incidentStatusChipClass(status) {
  const normalized = normalizeIncidentFilingStatus(status);
  if (normalized === "closed") {
    return "chip chip-ok chip-compact";
  }
  if (normalized === "filed") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function buildIncidentHistoryEntry(incidentPkg, fileName) {
  const packageId = String(incidentPkg?.meta?.packageId || "").trim();
  const runId = String(incidentPkg?.run?.runId || "").trim();
  const createdAt = String(incidentPkg?.meta?.generatedAt || new Date().toISOString()).trim();
  const approvalStatus = String(incidentPkg?.approval?.status || "UNAVAILABLE")
    .trim()
    .toUpperCase();
  const auditMatchedCount = Number(incidentPkg?.audit?.meta?.matchedCount || 0);
  const handoffText = String(incidentPkg?.handoff?.text || "").trim();
  const filingStatus = normalizeIncidentFilingStatus("drafted");
  const generatedAt = createdAt;
  return {
    id: packageId || `incident-history-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    packageId,
    createdAt,
    generatedAt,
    runId,
    approvalStatus,
    auditMatchedCount,
    scope: resolveIncidentPackageScope(incidentPkg),
    runDetailSource: String(incidentPkg?.run?.detailSource || "").trim() || "-",
    approvalSource: String(incidentPkg?.approval?.source || "").trim() || "-",
    auditSource: String(incidentPkg?.audit?.meta?.source || "").trim() || "-",
    provenanceTag: String(
      incidentPkg?.run?.detail?.provenance?.commandTag ||
      incidentPkg?.run?.summary?.provenanceTag ||
      incidentPkg?.run?.detail?.provenanceTag ||
      ""
    ).trim(),
    fileName: String(fileName || "").trim(),
    handoffText,
    payload: deepClone(incidentPkg || {}),
    filingStatus,
    filingUpdatedAt: createdAt
  };
}

function normalizeIncidentHistoryEntry(input = {}) {
  const candidate = input && typeof input === "object" ? input : {};
  const createdAt = String(candidate.createdAt || candidate?.meta?.generatedAt || new Date().toISOString()).trim();
  const filingStatus = normalizeIncidentFilingStatus(candidate.filingStatus);
  const filingUpdatedAt = String(candidate.filingUpdatedAt || createdAt).trim() || createdAt;
  const payload = candidate.payload && typeof candidate.payload === "object" ? deepClone(candidate.payload) : {};
  const generatedAt = String(candidate.generatedAt || payload?.meta?.generatedAt || createdAt).trim() || createdAt;
  return {
    id: String(candidate.id || candidate.packageId || `incident-history-${Date.now()}-${Math.floor(Math.random() * 100000)}`).trim(),
    packageId: String(candidate.packageId || "").trim(),
    createdAt,
    generatedAt,
    runId: String(candidate.runId || "").trim(),
    approvalStatus: String(candidate.approvalStatus || "UNAVAILABLE").trim().toUpperCase(),
    auditMatchedCount: Number(candidate.auditMatchedCount || 0),
    scope: String(candidate.scope || resolveIncidentPackageScope(payload)).trim(),
    runDetailSource: String(candidate.runDetailSource || payload?.run?.detailSource || "").trim(),
    approvalSource: String(candidate.approvalSource || payload?.approval?.source || "").trim(),
    auditSource: String(candidate.auditSource || payload?.audit?.meta?.source || "").trim(),
    provenanceTag: String(
      candidate.provenanceTag ||
      payload?.run?.detail?.provenance?.commandTag ||
      payload?.run?.summary?.provenanceTag ||
      payload?.run?.detail?.provenanceTag ||
      ""
    ).trim(),
    fileName: String(candidate.fileName || "").trim(),
    handoffText: String(candidate.handoffText || "").trim(),
    payload,
    filingStatus,
    filingUpdatedAt
  };
}

function normalizeIncidentHistoryList(input) {
  const source = Array.isArray(input) ? input : [];
  return source.map((item) => normalizeIncidentHistoryEntry(item)).slice(0, 20);
}

function persistIncidentHistory() {
  saveJSON(INCIDENT_HISTORY_KEY, {
    version: "v1",
    items: store.getIncidentPackageHistory()
  });
}

function pushIncidentHistory(entry) {
  const normalized = normalizeIncidentHistoryEntry(entry);
  store.upsertIncidentPackageHistoryEntry(normalized);
  persistIncidentHistory();
  renderIncidentHistoryPanel();
}

function clearIncidentHistoryQueue() {
  store.setIncidentPackageHistory([]);
  incidentHistorySelection.clear();
  persistIncidentHistory();
  renderIncidentHistoryPanel();
}

function clearDataPanels() {
  store.setTerminalHistory([]);
  incidentHistorySelection.clear();
  if (ui.terminalHistoryRunFilter) {
    ui.terminalHistoryRunFilter.value = "";
  }
  if (ui.terminalHistoryStatusFilter) {
    ui.terminalHistoryStatusFilter.value = "";
  }
  ui.providersContent.innerHTML = renderPanelStateMetric(
    "empty",
    "Extension Providers",
    "No provider data loaded."
  );
  if (ui.chatContent) {
    ui.chatContent.innerHTML = renderPanelStateMetric(
      "info",
      "Operator Chat",
      "Chat becomes available after workspace scope and runtime choices load."
    );
  }
  ui.settingsContent.innerHTML = renderPanelStateMetric(
    "empty",
    "Settings",
    "No configuration data loaded.",
    "Refresh the workspace. If settings should be present, verify scope and runtime endpoint availability."
  );
  ui.approvalsFeedback.innerHTML = "";
  ui.approvalsContent.innerHTML = renderPanelStateMetric(
    "empty",
    "Approvals Queue",
    "No approval data loaded.",
    "Refresh the workspace, then verify approval endpoint health and active scope."
  );
  if (ui.approvalsDetailContent) {
    ui.approvalsDetailContent.innerHTML = renderPanelStateMetric(
      "info",
      "Approval Detail",
      "Select an approval row to review detail."
    );
    delete ui.approvalsDetailContent.dataset.selectedRunId;
  }
  ui.terminalFeedback.innerHTML = "";
  ui.terminalHistory.innerHTML = renderPanelStateMetric(
    "empty",
    "Terminal History",
    "No terminal history loaded.",
    "Run a terminal request or refresh the workspace to repopulate history."
  );
  ui.terminalPayload.textContent = "";
  ui.terminalPolicyHints.innerHTML = "";
  ui.runsContent.innerHTML = renderPanelStateMetric(
    "empty",
    "Runs",
    "No run data loaded.",
    "Refresh the workspace, then verify runtime availability and current scope."
  );
  ui.runDetailContent.innerHTML = renderPanelStateMetric(
    "info",
    "Run Detail",
    "Select a run to view detail."
  );
  delete ui.runDetailContent.dataset.selectedRunId;
  ui.auditContent.innerHTML = renderPanelStateMetric(
    "empty",
    "Audit Events",
    "No audit data loaded.",
    "Refresh the workspace, then verify audit source availability and current filters."
  );
  if (ui.auditFeedback) {
    ui.auditFeedback.innerHTML = "";
  }
  if (ui.auditHandoffPreview) {
    ui.auditHandoffPreview.textContent = "Copy an audit or incident handoff to populate this preview. Review the text here before sharing it downstream.";
  }
  renderIncidentHistoryPanel();
  if (ui.triageContent) {
    ui.triageContent.innerHTML = "";
  }
  if (ui.contextAgentProfile) {
    ui.contextAgentProfile.textContent = "-";
  }
  if (ui.contextEndpointBadges) {
    ui.contextEndpointBadges.innerHTML = "";
  }
}

function renderPanelLoadingStates() {
  if (ui.healthContent) {
    ui.healthContent.innerHTML = renderPanelStateMetric(
      "loading",
      "Platform Health",
      "Loading runtime and pipeline status..."
    );
  }
  if (ui.providersContent) {
    ui.providersContent.innerHTML = renderPanelStateMetric(
      "loading",
      "Extension Providers",
      "Loading provider contract and readiness data..."
    );
  }
  if (ui.runsContent) {
    ui.runsContent.innerHTML = renderPanelStateMetric("loading", "Runs", "Loading run history...");
  }
  if (ui.approvalsContent) {
    ui.approvalsContent.innerHTML = renderPanelStateMetric("loading", "Approvals Queue", "Loading approvals...");
  }
  if (ui.auditContent) {
    ui.auditContent.innerHTML = renderPanelStateMetric("loading", "Audit Events", "Loading audit events...");
  }
  if (ui.settingsContent) {
    ui.settingsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "Settings",
      "Loading configuration and diagnostics..."
    );
  }
}

function startRealtimeRefreshLoop(choices, refreshFn) {
  if (choices.realtime.mode !== "polling") {
    return () => {};
  }

  const timer = window.setInterval(() => {
    if (document.visibilityState !== "hidden") {
      refreshFn().catch(() => {});
    }
  }, choices.realtime.pollIntervalMs);

  return () => window.clearInterval(timer);
}

function refreshRunBuilderPreview(session) {
  ensureRunBuilderDefaults(ui, session);
  const input = readRunBuilderInput(ui);
  const issues = evaluateRunBuilderIssues(input);
  const payload = buildRunCreatePayload(input, session);
  renderRunBuilderPolicyHints(ui, input, issues);
  renderRunBuilderPayload(ui, payload);
  return { input, issues, payload };
}

function refreshTerminalPreview(session, choices) {
  const input = readTerminalInput(ui);
  if (!input.runId) {
    const selectedRunId = String(ui.runDetailContent?.dataset?.selectedRunId || "").trim();
    if (selectedRunId && ui.terminalRunId) {
      ui.terminalRunId.value = selectedRunId;
    }
  }
  const normalizedInput = readTerminalInput(ui);
  const issues = evaluateTerminalIssues(normalizedInput, choices);
  const selectedAgentProfileId = String(ui.settingsAgentProfile?.value || "").trim().toLowerCase();
  const payload = buildTerminalRequest(normalizedInput, session, choices, selectedAgentProfileId);
  renderTerminalPolicyHints(ui, choices, issues);
  renderTerminalPayload(ui, payload);
  return { input: normalizedInput, issues, payload };
}

function buildTerminalHistoryEntry(input, payload, result, tone, message) {
  return {
    id: `terminal-history-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    createdAt: new Date().toISOString(),
    tone: String(tone || "").trim().toLowerCase() || "warn",
    message: String(message || "").trim(),
    input: {
      runId: String(input?.runId || "").trim(),
      command: String(input?.command || "").trim(),
      cwd: String(input?.cwd || "").trim(),
      timeoutSeconds: Number(input?.timeoutSeconds || 60),
      readOnlyRequested: Boolean(input?.readOnlyRequested),
      restrictedHostRequest: Boolean(input?.restrictedHostRequest)
    },
    payload: payload || {},
    result: result || {}
  };
}

function pushTerminalHistory(entry) {
  store.addTerminalHistoryEntry(entry);
  const filters = readTerminalHistoryFilters(ui);
  renderTerminalHistory(ui, store.getTerminalHistory(), filters);
}

function renderTerminalHistoryPanel() {
  const filters = readTerminalHistoryFilters(ui);
  renderTerminalHistory(ui, store.getTerminalHistory(), filters);
  persistListFilterStateFromUI();
}

function buildIncidentTransitionButtons(entryID, status) {
  const normalized = normalizeIncidentFilingStatus(status);
  const transitions = Array.isArray(INCIDENT_STATUS_TRANSITIONS[normalized])
    ? INCIDENT_STATUS_TRANSITIONS[normalized]
    : [];
  return transitions
    .map((transition) => {
      const toStatus = normalizeIncidentFilingStatus(transition?.to);
      const label = String(transition?.label || "").trim();
      if (!label || toStatus === normalized) {
        return "";
      }
      return `<button class="btn btn-secondary btn-small" type="button" data-incident-history-transition-id="${escapeHTML(entryID)}" data-incident-history-next-status="${escapeHTML(toStatus)}">${escapeHTML(label)}</button>`;
    })
    .filter(Boolean)
    .join("");
}

function canTransitionIncidentStatus(currentStatus, nextStatus) {
  const current = normalizeIncidentFilingStatus(currentStatus);
  const next = normalizeIncidentFilingStatus(nextStatus);
  const transitions = Array.isArray(INCIDENT_STATUS_TRANSITIONS[current])
    ? INCIDENT_STATUS_TRANSITIONS[current]
    : [];
  return transitions.some((transition) => normalizeIncidentFilingStatus(transition?.to) === next);
}

function normalizeIncidentHistoryStatusFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  return normalizeIncidentFilingStatus(normalized);
}

function normalizeIncidentHistorySort(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "oldest" || normalized === "status") {
    return normalized;
  }
  return "newest";
}

function normalizeIncidentHistorySearch(value) {
  return String(value || "").trim().toLowerCase();
}

function countIncidentStatuses(items) {
  const counts = {
    drafted: 0,
    filed: 0,
    closed: 0
  };
  for (const item of items || []) {
    const status = normalizeIncidentFilingStatus(item?.filingStatus);
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function incidentStatusMeaning(status) {
  const normalized = normalizeIncidentFilingStatus(status);
  if (normalized === "filed") {
    return "Filed means the package has been handed off and is waiting for closure tracking.";
  }
  if (normalized === "closed") {
    return "Closed means queue tracking is complete unless follow-up requires reopening.";
  }
  return "Drafted means the package is prepared but not yet handed off downstream.";
}

function incidentStatusNextStep(status) {
  const normalized = normalizeIncidentFilingStatus(status);
  if (normalized === "filed") {
    return "Next: mark closed when downstream response is complete, or return to draft if the package needs revision.";
  }
  if (normalized === "closed") {
    return "Next: reopen filed only if downstream handling resumes or new response work appears.";
  }
  return "Next: review the package and handoff summary, then mark filed when downstream handoff actually occurs.";
}

function normalizeIncidentHistoryTimeRange(value) {
  return normalizeTimeRange(value);
}

function applyIncidentHistoryViewControls() {
  if (ui.incidentHistoryStatusFilter) {
    ui.incidentHistoryStatusFilter.value = incidentHistoryViewState.status;
  }
  if (ui.incidentHistorySort) {
    ui.incidentHistorySort.value = incidentHistoryViewState.sort;
  }
  if (ui.incidentHistorySearchInput) {
    ui.incidentHistorySearchInput.value = incidentHistoryViewState.search;
  }
  if (ui.incidentHistoryTimeRange) {
    ui.incidentHistoryTimeRange.value = incidentHistoryViewState.timeRange;
  }
  if (ui.incidentHistoryTimeFrom) {
    ui.incidentHistoryTimeFrom.value = incidentHistoryViewState.timeFrom;
  }
  if (ui.incidentHistoryTimeTo) {
    ui.incidentHistoryTimeTo.value = incidentHistoryViewState.timeTo;
  }
  syncCustomTimeFilterControls("incidents");
  if (ui.incidentHistoryPageSize) {
    ui.incidentHistoryPageSize.value = String(incidentHistoryViewState.pageSize);
  }
  if (ui.incidentHistoryPage) {
    ui.incidentHistoryPage.value = String(incidentHistoryViewState.page);
  }
}

function readIncidentHistoryViewFromUI() {
  incidentHistoryViewState.status = normalizeIncidentHistoryStatusFilter(
    ui.incidentHistoryStatusFilter?.value
  );
  incidentHistoryViewState.sort = normalizeIncidentHistorySort(ui.incidentHistorySort?.value);
  incidentHistoryViewState.search = normalizeIncidentHistorySearch(ui.incidentHistorySearchInput?.value);
  incidentHistoryViewState.timeRange = normalizeIncidentHistoryTimeRange(ui.incidentHistoryTimeRange?.value);
  incidentHistoryViewState.timeFrom = String(ui.incidentHistoryTimeFrom?.value || "").trim();
  incidentHistoryViewState.timeTo = String(ui.incidentHistoryTimeTo?.value || "").trim();
  incidentHistoryViewState.pageSize = parsePositiveInt(ui.incidentHistoryPageSize?.value, 25, 1, 500);
  incidentHistoryViewState.page = parsePositiveInt(ui.incidentHistoryPage?.value, 1, 1, 999999);
  applyIncidentHistoryViewControls();
  persistListFilterStateFromUI();
  return {
    status: incidentHistoryViewState.status,
    sort: incidentHistoryViewState.sort,
    search: incidentHistoryViewState.search,
    timeRange: incidentHistoryViewState.timeRange,
    timeFrom: incidentHistoryViewState.timeFrom,
    timeTo: incidentHistoryViewState.timeTo,
    pageSize: incidentHistoryViewState.pageSize,
    page: incidentHistoryViewState.page
  };
}

function setIncidentHistoryQuickView(status, sort, options = {}) {
  incidentHistoryViewState.status = normalizeIncidentHistoryStatusFilter(status);
  incidentHistoryViewState.sort = normalizeIncidentHistorySort(sort);
  if (options.resetSearch === true) {
    incidentHistoryViewState.search = "";
  }
  incidentHistoryViewState.page = 1;
  applyIncidentHistoryViewControls();
  renderIncidentHistoryPanel();
}

function clearIncidentHistorySelection() {
  incidentHistorySelection.clear();
  renderIncidentHistoryPanel();
}

function getIncidentHistoryFilteredSortedItems(items, view) {
  const source = Array.isArray(items) ? items : [];
  const statusFilter = normalizeIncidentHistoryStatusFilter(view?.status);
  const sortMode = normalizeIncidentHistorySort(view?.sort);
  const search = normalizeIncidentHistorySearch(view?.search);
  const timeBounds = resolveTimeBounds(view?.timeRange, view?.timeFrom, view?.timeTo);
  const filtered = source.filter((item) => {
    const status = normalizeIncidentFilingStatus(item?.filingStatus);
    if (statusFilter && status !== statusFilter) {
      return false;
    }
    if (search) {
      const runId = String(item?.runId || "").trim().toLowerCase();
      const packageId = String(item?.packageId || "").trim().toLowerCase();
      if (!runId.includes(search) && !packageId.includes(search)) {
        return false;
      }
    }
    if (!withinTimeBounds(item?.filingUpdatedAt || item?.createdAt || "", timeBounds)) {
      return false;
    }
    return true;
  });
  const sorted = filtered.slice().sort((left, right) => {
    if (sortMode === "status") {
      const leftStatus = normalizeIncidentFilingStatus(left?.filingStatus);
      const rightStatus = normalizeIncidentFilingStatus(right?.filingStatus);
      const leftRank = INCIDENT_STATUS_SORT_RANK[leftStatus] ?? 99;
      const rightRank = INCIDENT_STATUS_SORT_RANK[rightStatus] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
    }
    const leftTs = parseTimeMs(left?.filingUpdatedAt || left?.createdAt);
    const rightTs = parseTimeMs(right?.filingUpdatedAt || right?.createdAt);
    if (sortMode === "oldest") {
      return leftTs - rightTs;
    }
    return rightTs - leftTs;
  });
  return sorted;
}

function applyBulkIncidentStatusTransition(nextStatus) {
  const targetStatus = normalizeIncidentFilingStatus(nextStatus);
  const selectedIDs = Array.from(incidentHistorySelection);
  if (selectedIDs.length === 0) {
    renderAuditFilingFeedback("warn", "Select one or more incident rows before bulk status updates. Bulk actions apply only to the current selection.");
    return;
  }
  let updatedCount = 0;
  let skippedCount = 0;
  const updatedAt = new Date().toISOString();
  for (const id of selectedIDs) {
    const entry = store.getIncidentPackageHistoryById(id);
    if (!entry) {
      skippedCount += 1;
      continue;
    }
    const currentStatus = normalizeIncidentFilingStatus(entry?.filingStatus);
    if (!canTransitionIncidentStatus(currentStatus, targetStatus)) {
      skippedCount += 1;
      continue;
    }
    store.updateIncidentPackageHistoryEntry(id, {
      filingStatus: targetStatus,
      filingUpdatedAt: updatedAt
    });
    updatedCount += 1;
  }
  if (updatedCount === 0) {
    renderAuditFilingFeedback(
      "warn",
      `Bulk update blocked: no selected rows can transition to ${targetStatus}. Review current filing state first.`
    );
    return;
  }
  persistIncidentHistory();
  renderIncidentHistoryPanel();
  const detail = skippedCount > 0 ? `; skipped=${skippedCount}` : "";
  renderAuditFilingFeedback(
    "ok",
    `Bulk incident status update complete: nextStatus=${targetStatus}; updated=${updatedCount}${detail}. Review skipped rows before leaving the queue.`
  );
}

function getSelectedIncidentEntries() {
  const selectedIDs = Array.from(incidentHistorySelection);
  if (selectedIDs.length === 0) {
    return [];
  }
  return selectedIDs
    .map((id) => store.getIncidentPackageHistoryById(id))
    .filter((entry) => entry && typeof entry === "object");
}

function buildSelectedIncidentExportBundle(entries, view, actor) {
  const generatedAt = new Date().toISOString();
  const items = (Array.isArray(entries) ? entries : []).map((entry) =>
    normalizeIncidentHistoryEntry(entry)
  );
  const uniqueScopes = Array.from(new Set(items.map((item) => String(item?.scope || "").trim()).filter(Boolean))).slice(0, 5);
  const uniqueAuditSources = Array.from(new Set(items.map((item) => String(item?.auditSource || "").trim()).filter(Boolean))).slice(0, 5);
  return {
    meta: {
      generatedAt,
      actor: String(actor || "").trim(),
      source: "incident-history-selection",
      selectedCount: items.length,
      scopeSummary: uniqueScopes,
      auditSources: uniqueAuditSources,
      view: {
        status: normalizeIncidentHistoryStatusFilter(view?.status),
        sort: normalizeIncidentHistorySort(view?.sort),
        search: normalizeIncidentHistorySearch(view?.search),
        timeRange: normalizeIncidentHistoryTimeRange(view?.timeRange),
        timeFrom: String(view?.timeFrom || "").trim(),
        timeTo: String(view?.timeTo || "").trim(),
        pageSize: parsePositiveInt(view?.pageSize, 25, 1, 500),
        page: parsePositiveInt(view?.page, 1, 1, 999999)
      }
    },
    items
  };
}

function parseIncidentHistoryStoragePayload(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const candidates = Array.isArray(parsed) ? parsed : parsed?.items;
    return normalizeIncidentHistoryList(candidates);
  } catch (_) {
    return null;
  }
}

function syncIncidentHistoryFromStorage(raw, sourceLabel = "storage") {
  const parsed = parseIncidentHistoryStoragePayload(raw);
  if (parsed === null) {
    renderAuditFilingFeedback("warn", `Incident queue sync ignored (${sourceLabel}) because the storage payload is invalid.`);
    return false;
  }
  store.setIncidentPackageHistory(parsed);
  renderIncidentHistoryPanel();
  renderAuditFilingFeedback(
    "ok",
    `Incident queue synced from ${sourceLabel}. rows=${parsed.length}; review latest scope and source before bulk actions.`
  );
  return true;
}

function normalizeConfigChangeEntry(candidate) {
  const entry = candidate && typeof candidate === "object" ? candidate : null;
  if (!entry) {
    return null;
  }
  const ts = String(entry.ts || "").trim() || new Date().toISOString();
  const action = String(entry.action || "").trim();
  if (!action) {
    return null;
  }
  const id = String(entry.id || `${ts}:${action}:${Math.random().toString(16).slice(2, 10)}`).trim();
  return {
    id,
    ts,
    action,
    scope: String(entry.scope || "").trim() || "-",
    actor: String(entry.actor || "").trim() || "-",
    source: String(entry.source || "").trim() || "local-ui",
    status: String(entry.status || "").trim() || "observed",
    event: String(entry.event || "").trim(),
    providerId: String(entry.providerId || "").trim(),
    decision: String(entry.decision || "").trim().toUpperCase()
  };
}

function parseConfigChangeHistoryStoragePayload(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .map((item) => normalizeConfigChangeEntry(item))
      .filter(Boolean)
      .slice(0, 40);
  } catch (_) {
    return [];
  }
}

function buildSettingsConfigChanges(localChanges, auditPayload) {
  const local = (Array.isArray(localChanges) ? localChanges : [])
    .map((item) => normalizeConfigChangeEntry(item))
    .filter(Boolean);
  const auditItems = Array.isArray(auditPayload?.items) ? auditPayload.items : [];
  const auditChanges = auditItems
    .filter((item) => {
      const event = String(item?.event || "").trim().toLowerCase();
      const provider = String(item?.providerId || "").trim().toLowerCase();
      return (
        event.startsWith("settings.") ||
        event.includes("integration") ||
        provider.includes("settings") ||
        provider.includes("integration")
      );
    })
    .map((item) =>
      normalizeConfigChangeEntry({
        id: `audit:${item?.ts || ""}:${item?.event || ""}:${item?.providerId || ""}`,
        ts: item?.ts || "",
        action: String(item?.event || "").trim() || "audit.event",
        scope: `${String(item?.tenantId || "").trim() || "-"}/${String(item?.projectId || "").trim() || "-"}`,
        actor: "runtime",
        source: "audit",
        status: String(item?.decision || "").trim() ? "observed" : "audit",
        event: String(item?.event || "").trim(),
        providerId: String(item?.providerId || "").trim(),
        decision: String(item?.decision || "").trim().toUpperCase()
      })
    )
    .filter(Boolean);

  const merged = [...local, ...auditChanges]
    .sort((left, right) => parseTimeMs(right?.ts) - parseTimeMs(left?.ts))
    .slice(0, 20);
  const seen = new Set();
  const deduped = [];
  for (const item of merged) {
    const key = `${item.ts}|${item.action}|${item.scope}|${item.status}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped.slice(0, 20);
}

function renderIncidentHistorySummary(totalCount, visibleCount, selectedCount, view, allItems = [], visibleItems = []) {
  if (!(ui.incidentHistorySummary instanceof HTMLElement)) {
    return;
  }
  const searchLabel = normalizeIncidentHistorySearch(view?.search) || "-";
  const pageLabel = `${String(view?.page || 1)}/${String(view?.totalPages || 1)}`;
  const totalStatusCounts = countIncidentStatuses(allItems);
  const visibleStatusCounts = countIncidentStatuses(visibleItems);
  const latestVisible = Array.isArray(visibleItems) && visibleItems.length > 0 ? visibleItems[0] : null;
  const timeLabel =
    normalizeIncidentHistoryTimeRange(view?.timeRange) || (view?.timeFrom || view?.timeTo ? "custom" : "any");
  ui.incidentHistorySummary.innerHTML = `
    <div class="metric">
      <div class="metric-title-row">
        <div class="title">Incident Queue Summary</div>
        <span class="chip chip-neutral chip-compact">queueTotal=${escapeHTML(String(totalCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">visible=${escapeHTML(String(visibleCount || 0))}</span>
        <span class="${selectedCount > 0 ? "chip chip-warn chip-compact" : "chip chip-neutral chip-compact"}">selected=${escapeHTML(String(selectedCount || 0))}</span>
      </div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">drafted=${escapeHTML(String(visibleStatusCounts.drafted))}/${escapeHTML(String(totalStatusCounts.drafted))}</span>
        <span class="chip chip-neutral chip-compact">filed=${escapeHTML(String(visibleStatusCounts.filed))}/${escapeHTML(String(totalStatusCounts.filed))}</span>
        <span class="chip chip-neutral chip-compact">closed=${escapeHTML(String(visibleStatusCounts.closed))}/${escapeHTML(String(totalStatusCounts.closed))}</span>
        <span class="chip chip-neutral chip-compact">latestScope=${escapeHTML(String(latestVisible?.scope || "-"))}</span>
        <span class="chip chip-neutral chip-compact">latestSource=${escapeHTML(String(latestVisible?.auditSource || "-"))}</span>
      </div>
      <div class="meta incident-history-note">Transition semantics: drafted=prepared locally, filed=handed off downstream, closed=queue tracking complete.</div>
      <div class="meta incident-history-note">Bulk actions touch selected rows only. Rows that cannot move to the requested next status are skipped and reported in feedback.</div>
      <div class="meta">latestPackage=${escapeHTML(String(latestVisible?.packageId || "-"))}; latestGeneratedAt=${escapeHTML(String(latestVisible?.generatedAt || latestVisible?.createdAt || "-"))}</div>
      <div class="meta">filter=${escapeHTML(String(view?.status || "any"))}; sort=${escapeHTML(String(view?.sort || "newest"))}; time=${escapeHTML(timeLabel)}; search=${escapeHTML(searchLabel)}; page=${escapeHTML(pageLabel)}; pageSize=${escapeHTML(String(view?.pageSize || 25))}</div>
    </div>
  `;
}

function renderIncidentHistoryPanel() {
  if (!(ui.incidentHistoryContent instanceof HTMLElement)) {
    return;
  }
  const allItems = store.getIncidentPackageHistory();
  const knownIDs = new Set(
    (Array.isArray(allItems) ? allItems : [])
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean)
  );
  for (const selectedId of Array.from(incidentHistorySelection)) {
    if (!knownIDs.has(selectedId)) {
      incidentHistorySelection.delete(selectedId);
    }
  }
  const view = readIncidentHistoryViewFromUI();
  const filteredSorted = getIncidentHistoryFilteredSortedItems(allItems, view);
  const pageState = paginateItems(filteredSorted, view?.pageSize, view?.page);
  incidentHistoryViewState.page = pageState.page;
  incidentHistoryViewState.pageSize = pageState.pageSize;
  applyIncidentHistoryViewControls();
  const items = pageState.items;
  const selectedCount = incidentHistorySelection.size;
  renderIncidentHistorySummary(allItems.length, filteredSorted.length, selectedCount, {
    ...view,
    page: pageState.page,
    pageSize: pageState.pageSize,
    totalPages: pageState.totalPages
  }, allItems, filteredSorted);
  if (!Array.isArray(allItems) || allItems.length === 0) {
    ui.incidentHistoryContent.innerHTML = renderPanelStateMetric(
      "empty",
      "Incident Queue",
      "No incident packages are currently tracked.",
      "Start in Audit Events: open a run detail, then export an incident package to seed this queue."
    );
    return;
  }
  if (items.length === 0) {
    ui.incidentHistoryContent.innerHTML = renderPanelStateMetric(
      "empty",
      "Incident Queue",
      "No incident packages match the current queue filters.",
      "Clear filters or widen scope, then review drafted or filed packages."
    );
    return;
  }
  const pager = `
    <div class="table-meta-row">
      <span class="chip chip-neutral chip-compact">matches=${escapeHTML(String(pageState.totalItems))}</span>
      <span class="chip chip-neutral chip-compact">page=${escapeHTML(String(pageState.page))}/${escapeHTML(String(pageState.totalPages))}</span>
      <button class="btn btn-secondary btn-small" type="button" data-incident-history-page-action="prev" ${pageState.page <= 1 ? "disabled" : ""}>Prev</button>
      <button class="btn btn-secondary btn-small" type="button" data-incident-history-page-action="next" ${pageState.page >= pageState.totalPages ? "disabled" : ""}>Next</button>
    </div>
  `;
  ui.incidentHistoryContent.innerHTML = `${pager}${items.map((item) => renderIncidentHistoryRow(item)).join("")}`;
}

function renderIncidentHistoryRow(item) {
  const entryId = String(item?.id || "").trim();
  const selectedAttr = incidentHistorySelection.has(entryId) ? " checked" : "";
  const createdAt = formatTime(item?.createdAt);
  const packageId = String(item?.packageId || "").trim() || "-";
  const runIdValue = String(item?.runId || "").trim();
  const runId = runIdValue || "-";
  const approvalStatus = String(item?.approvalStatus || "UNAVAILABLE").trim().toUpperCase();
  const auditRows = Number(item?.auditMatchedCount || 0);
  const fileName = String(item?.fileName || "").trim() || "(unspecified)";
  const filingStatus = normalizeIncidentFilingStatus(item?.filingStatus);
  const filingUpdatedAt = formatTime(item?.filingUpdatedAt || item?.createdAt);
  const generatedAt = formatTime(item?.generatedAt || item?.createdAt);
  const statusChipClass = incidentStatusChipClass(filingStatus);
  const transitionActions = buildIncidentTransitionButtons(entryId, filingStatus);
  const statusMeaning = incidentStatusMeaning(filingStatus);
  const nextStep = incidentStatusNextStep(filingStatus);
  const openRunAction = runIdValue
    ? `<button class="btn btn-secondary btn-small" type="button" data-incident-history-open-run-id="${escapeHTML(runIdValue)}">Open Run Detail</button>`
    : "";
  return `
    <article class="metric incident-history-row" data-incident-history-entry-id="${escapeHTML(entryId)}">
      <div class="title">${escapeHTML(packageId)}</div>
      <div class="incident-history-state">
        <label class="incident-history-select">
          <input type="checkbox" data-incident-history-select-id="${escapeHTML(entryId)}" aria-label="select incident ${escapeHTML(packageId)}"${selectedAttr} />
          <span>select</span>
        </label>
        <span class="${statusChipClass}" data-incident-history-status="${escapeHTML(filingStatus)}">status:${escapeHTML(filingStatus)}</span>
      </div>
      <div class="incident-history-note">${escapeHTML(statusMeaning)}</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">scope=${escapeHTML(String(item?.scope || "-"))}</span>
        <span class="chip chip-neutral chip-compact">auditSource=${escapeHTML(String(item?.auditSource || "-"))}</span>
        <span class="chip chip-neutral chip-compact">runDetail=${escapeHTML(String(item?.runDetailSource || "-"))}</span>
        <span class="chip chip-neutral chip-compact">approvalSource=${escapeHTML(String(item?.approvalSource || "-"))}</span>
      </div>
      <div class="incident-history-meta">
        created=${escapeHTML(createdAt)}; generatedAt=${escapeHTML(generatedAt)}; filingUpdated=${escapeHTML(filingUpdatedAt)}; runId=${escapeHTML(runId)}; approval=${escapeHTML(approvalStatus)}; auditRows=${escapeHTML(String(auditRows))}; file=${escapeHTML(fileName)}
      </div>
      <div class="incident-history-meta">${escapeHTML(buildIncidentEntryTraceabilitySummary(item))}</div>
      <div class="incident-history-note">${escapeHTML(nextStep)}</div>
      <div class="incident-history-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary btn-small" type="button" data-incident-history-download-id="${escapeHTML(entryId)}">Download Incident JSON</button>
          </div>
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary btn-small" type="button" data-incident-history-copy-id="${escapeHTML(entryId)}">Copy Incident Handoff</button>
            ${transitionActions}
            ${openRunAction}
          </div>
        </div>
      </div>
    </article>
  `;
}

function summarizeOpsTriage(snapshot) {
  const runs = Array.isArray(snapshot?.runs?.items) ? snapshot.runs.items : [];
  const approvals = Array.isArray(snapshot?.approvals?.items) ? snapshot.approvals.items : [];
  const audit = Array.isArray(snapshot?.audit?.items) ? snapshot.audit.items : [];
  const terminalHistory = Array.isArray(snapshot?.terminalHistory) ? snapshot.terminalHistory : [];

  const pendingApprovals = approvals.filter(
    (item) => String(item?.status || "").trim().toUpperCase() === "PENDING"
  );
  const expiringSoonApprovals = pendingApprovals.filter((item) => {
    const expiresAt = parseTimeMs(item?.expiresAt);
    if (expiresAt <= 0) {
      return false;
    }
    const delta = expiresAt - Date.now();
    return delta > 0 && delta <= 300000;
  });
  const attentionRuns = runs.filter((item) => {
    const status = String(item?.status || "").trim().toUpperCase();
    const decision = String(item?.policyDecision || "").trim().toUpperCase();
    return status === "FAILED" || status === "POLICY_BLOCKED" || decision === "DENY";
  });
  const latestAttentionRun = attentionRuns
    .slice()
    .sort((a, b) => parseTimeMs(b?.updatedAt) - parseTimeMs(a?.updatedAt))[0] || null;
  const denyAuditEvents = audit.filter(
    (item) => String(item?.decision || "").trim().toUpperCase() === "DENY"
  );
  const terminalPolicyBlocked = terminalHistory.filter(
    (item) => String(item?.result?.status || "").trim().toUpperCase() === "POLICY_BLOCKED"
  );
  const terminalFailed = terminalHistory.filter(
    (item) => String(item?.result?.status || "").trim().toUpperCase() === "FAILED"
  );

  return {
    pendingApprovals: pendingApprovals.length,
    expiringSoonApprovals: expiringSoonApprovals.length,
    attentionRuns: attentionRuns.length,
    latestAttentionRunId: String(latestAttentionRun?.runId || "").trim(),
    denyAuditEvents: denyAuditEvents.length,
    terminalPolicyBlocked: terminalPolicyBlocked.length,
    terminalFailed: terminalFailed.length
  };
}

function renderOpsTriage(snapshot) {
  if (!ui.triageContent) {
    return;
  }
  const triage = summarizeOpsTriage(snapshot);
  const approvalTone = triage.pendingApprovals > 0 ? "chip chip-danger chip-compact" : "chip chip-ok chip-compact";
  const runsTone = triage.attentionRuns > 0 ? "chip chip-danger chip-compact" : "chip chip-ok chip-compact";
  const auditTone = triage.denyAuditEvents > 0 ? "chip chip-warn chip-compact" : "chip chip-ok chip-compact";
  const terminalIssueCount = triage.terminalPolicyBlocked + triage.terminalFailed;
  const terminalTone = terminalIssueCount > 0 ? "chip chip-warn chip-compact" : "chip chip-ok chip-compact";

  ui.triageContent.innerHTML = `
    <article class="triage-card">
      <div class="title">Pending Approvals</div>
      <div class="triage-value">${escapeHTML(String(triage.pendingApprovals))}</div>
      <div class="meta"><span class="${approvalTone}">expiring <=5m: ${escapeHTML(String(triage.expiringSoonApprovals))}</span></div>
      <div class="triage-actions">
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-approvals-pending">Open Approval Queue</button>
      </div>
    </article>
    <article class="triage-card">
      <div class="title">Runs Requiring Attention</div>
      <div class="triage-value">${escapeHTML(String(triage.attentionRuns))}</div>
      <div class="meta"><span class="${runsTone}">latest=${escapeHTML(triage.latestAttentionRunId || "-")}</span></div>
      <div class="triage-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-triage-action="open-runs-attention"
          data-triage-run-id="${escapeHTML(triage.latestAttentionRunId || "")}"
        >Open Run List</button>
      </div>
    </article>
    <article class="triage-card">
      <div class="title">Audit Denies</div>
      <div class="triage-value">${escapeHTML(String(triage.denyAuditEvents))}</div>
      <div class="meta"><span class="${auditTone}">current audit scope</span></div>
      <div class="triage-actions">
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-audit-deny">Filter Deny Events</button>
      </div>
    </article>
    <article class="triage-card">
      <div class="title">Terminal Issues</div>
      <div class="triage-value">${escapeHTML(String(terminalIssueCount))}</div>
      <div class="meta"><span class="${terminalTone}">policy_blocked=${escapeHTML(String(triage.terminalPolicyBlocked))}; failed=${escapeHTML(String(triage.terminalFailed))}</span></div>
      <div class="triage-actions">
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-terminal-issues">Open Terminal History</button>
      </div>
    </article>
  `;
}

async function main() {
  const config = await loadConfig();
  window.__m14MainReady = false;
  initializeWorkspacePanels();
  initializePanelRegions();
  initializeLiveRegionSemantics();
  const baselineChoices = resolveRuntimeChoices(config);
  let aimxsOverride = normalizeAimxsOverride(
    readSavedJSON(AIMXS_OVERRIDE_KEY),
    baselineChoices?.aimxs || {}
  );
  let integrationOverrides = readSavedJSON(INTEGRATION_OVERRIDES_KEY);
  let configChangeHistory = parseConfigChangeHistoryStoragePayload(
    readSavedValue(CONFIG_CHANGE_HISTORY_KEY)
  );
  store.patch({
    runtimeChoices: deepClone(baselineChoices),
    integrationEditorDraftsByProject: {},
    integrationEditorStatusByProject: {}
  });

  const getRuntimeChoices = () => store.getState().runtimeChoices || baselineChoices;
  const persistIntegrationOverrides = () => {
    saveJSON(INTEGRATION_OVERRIDES_KEY, integrationOverrides);
  };
  const persistAimxsOverride = () => {
    saveJSON(AIMXS_OVERRIDE_KEY, aimxsOverride);
  };
  const persistConfigChangeHistory = () => {
    try {
      window.localStorage.setItem(
        CONFIG_CHANGE_HISTORY_KEY,
        JSON.stringify(configChangeHistory.slice(0, 40))
      );
    } catch (_) {
      // Local storage is optional.
    }
  };
  const recordConfigChange = (entryPatch = {}) => {
    const currentSession = getSession();
    const tenantID = activeTenantScope(currentSession) || "-";
    const projectID = activeProjectScope(currentSession) || "-";
    const actor = String(
      currentSession?.claims?.sub || currentSession?.claims?.email || currentSession?.claims?.client_id || "-"
    ).trim();
    const entry = normalizeConfigChangeEntry({
      ts: new Date().toISOString(),
      action: String(entryPatch?.action || "").trim(),
      scope: String(entryPatch?.scope || `${tenantID}/${projectID}`).trim(),
      actor,
      source: String(entryPatch?.source || "local-ui").trim(),
      status: String(entryPatch?.status || "applied").trim(),
      event: String(entryPatch?.event || "").trim(),
      providerId: String(entryPatch?.providerId || "").trim(),
      decision: String(entryPatch?.decision || "").trim().toUpperCase()
    });
    if (!entry) {
      return;
    }
    configChangeHistory = [entry, ...configChangeHistory].slice(0, 40);
    persistConfigChangeHistory();
  };
  const setEditorDraftForProject = (projectID, draft) => {
    const key = normalizeProjectScopeKey(projectID);
    const current = store.getState().integrationEditorDraftsByProject || {};
    store.patch({
      integrationEditorDraftsByProject: {
        ...current,
        [key]: draft
      }
    });
  };
  const clearEditorDraftForProject = (projectID) => {
    const key = normalizeProjectScopeKey(projectID);
    const current = { ...(store.getState().integrationEditorDraftsByProject || {}) };
    delete current[key];
    store.patch({ integrationEditorDraftsByProject: current });
  };
  const setEditorStatusForProject = (projectID, statusPatch) => {
    const key = normalizeProjectScopeKey(projectID);
    const current = store.getState().integrationEditorStatusByProject || {};
    store.patch({
      integrationEditorStatusByProject: {
        ...current,
        [key]: {
          ...(current[key] || {}),
          ...(statusPatch || {})
        }
      }
    });
  };
  const clearEditorStatusForProject = (projectID) => {
    const key = normalizeProjectScopeKey(projectID);
    const current = { ...(store.getState().integrationEditorStatusByProject || {}) };
    delete current[key];
    store.patch({ integrationEditorStatusByProject: current });
  };
  const resolveProjectChoices = (projectID, selectedAgentHint = "") => {
    let next = resolveChoicesForProject(baselineChoices, projectID, integrationOverrides);
    next = applyAimxsOverrideToChoices(next, aimxsOverride);
    const profiles = Array.isArray(next?.integrations?.agentProfiles)
      ? next.integrations.agentProfiles
      : [];
    let selected = String(
      selectedAgentHint || next?.integrations?.selectedAgentProfileId || ""
    )
      .trim()
      .toLowerCase();
    if (!selected) {
      selected = resolveSelectedAgentID(next, ui);
    }
    if (!profiles.some((profile) => String(profile?.id || "").trim().toLowerCase() === selected)) {
      selected = String(profiles[0]?.id || "codex").trim().toLowerCase();
    }
    next.integrations.selectedAgentProfileId = selected;
    store.patch({ runtimeChoices: next });
    populateAgentProfileSelect(ui, profiles, selected);
    return next;
  };
  const renderConfigSummary = (choices) => {
    ui.configSummary.textContent = `runtime=${config.runtimeApiBaseUrl}; registry=${config.registryApiBaseUrl}; mockMode=${config.mockMode}; authResponseType=${config.auth?.responseType || "token"}; approvalsEndpoint=${config.endpoints?.approvalsQueue || "(derived)"}; realtime=${choices.realtime.mode}/${choices.realtime.pollIntervalMs}ms; terminal=${choices.terminal.mode}; integrations=${choices.integrations.modelRouting}`;
  };

  ui.title.textContent = config.appName || "Epydios AgentOps Desktop";
  ui.subtitle.textContent = `${config.environment || "unknown"} environment`;
  setWorkspaceView(readSavedValue(WORKSPACE_VIEW_PREF_KEY));
  setIncidentSubview(readSavedValue(INCIDENT_SUBVIEW_PREF_KEY));
  settingsSubviewState = normalizeSettingsSubview(readSavedValue(SETTINGS_SUBVIEW_PREF_KEY));
  advancedSectionState = normalizeAdvancedSectionState(readSavedJSON(ADVANCED_SECTION_STATE_KEY));
  detailsOpenState = normalizeDetailsOpenState(readSavedJSON(DETAILS_OPEN_STATE_KEY));
  applyAdvancedState();
  for (const tab of ui.workspaceTabs || []) {
    tab.addEventListener("click", () => {
      const requested = String(tab.dataset.workspaceTab || "").trim().toLowerCase();
      setWorkspaceView(requested, true);
    });
    tab.addEventListener("keydown", (event) => {
      handleHorizontalTabKeydown(
        event,
        ui.workspaceTabs || [],
        (node) => String(node?.dataset?.workspaceTab || "").trim().toLowerCase(),
        (requested) => setWorkspaceView(requested, true)
      );
    });
  }
  for (const tab of ui.incidentSubtabs || []) {
    tab.addEventListener("click", () => {
      const requested = String(tab.dataset.incidentSubtab || "").trim().toLowerCase();
      setIncidentSubview(requested, true);
      focusActiveIncidentSubview({ scroll: false });
    });
    tab.addEventListener("keydown", (event) => {
      handleHorizontalTabKeydown(
        event,
        ui.incidentSubtabs || [],
        (node) => String(node?.dataset?.incidentSubtab || "").trim().toLowerCase(),
        (requested) => {
          setIncidentSubview(requested, true);
          focusActiveIncidentSubview({ scroll: false });
        }
      );
    });
  }
  document.addEventListener("visibilitychange", () => {
    reconcileOperatorChatFollowLoop();
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const toggleNode = target.closest("[data-advanced-toggle-section]");
    if (!(toggleNode instanceof HTMLElement)) {
      return;
    }
    const section = String(toggleNode.dataset.advancedToggleSection || "").trim().toLowerCase();
    const nextEnabled = toggleAdvancedSection(section, true);
    if (section === "settings" && nextEnabled && settingsSubviewState === "configuration") {
      setSettingsSubview("diagnostics", true);
    }
    focusElement(toggleNode, { scroll: false });
  });
  document.addEventListener("toggle", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement)) {
      return;
    }
    const key = String(target.dataset.detailKey || "").trim();
    if (!key) {
      return;
    }
    detailsOpenState[key] = target.open === true;
    saveJSON(DETAILS_OPEN_STATE_KEY, detailsOpenState);
  }, true);

  let session = await bootstrapAuth(config);
  setAuthDisplay(ui, session);
  setRefreshStatus("warn", "initializing");

  if (session.claims.tenant_id) {
    if (!String(ui.runsTenantFilter?.value || "").trim() && ui.runsTenantFilter) {
      ui.runsTenantFilter.value = session.claims.tenant_id;
    }
    if (!String(ui.auditTenantFilter?.value || "").trim() && ui.auditTenantFilter) {
      ui.auditTenantFilter.value = session.claims.tenant_id;
    }
    if (!String(ui.approvalsTenantFilter?.value || "").trim() && ui.approvalsTenantFilter) {
      ui.approvalsTenantFilter.value = session.claims.tenant_id;
    }
  }
  const initialProjectScope = String(
    readSavedValue(PROJECT_PREF_KEY) || session.claims.project_id || ""
  ).trim();
  applyProjectContext(initialProjectScope);
  const savedListFilters = readSavedJSON(LIST_FILTER_STATE_KEY);
  if (savedListFilters && Object.keys(savedListFilters).length > 0) {
    applyListFilterState(savedListFilters);
  }
  syncCustomTimeFilterControls("runs");
  syncCustomTimeFilterControls("approvals");
  syncCustomTimeFilterControls("audit");
  syncCustomTimeFilterControls("incidents");
  persistListFilterStateFromUI();

  let initialChoices = resolveProjectChoices(initialProjectScope);
  aimxsEditorState = {
    status: "clean",
    message: initialChoices?.aimxs?.paymentEntitled
      ? "Entitlement is active; AIMXS HTTPS mode can be enabled with valid refs."
      : "Entitlement is locked; AIMXS HTTPS mode remains disabled."
  };
  const initialThemeMode = resolveThemeMode(initialChoices?.theme?.mode || "system");
  if (ui.settingsThemeMode) {
    ui.settingsThemeMode.value = initialThemeMode;
  }
  applyThemeMode(initialThemeMode);
  renderExecutionDefaults(ui, initialChoices);
  renderConfigSummary(initialChoices);

  const initialAgentID = String(initialChoices?.integrations?.selectedAgentProfileId || "")
    .trim()
    .toLowerCase();
  if (initialAgentID) {
    saveValue(AGENT_PREF_KEY, initialAgentID);
  }

  let incidentHistorySeedRaw = "";
  try {
    incidentHistorySeedRaw = String(window.localStorage.getItem(INCIDENT_HISTORY_KEY) || "");
  } catch (_) {
    incidentHistorySeedRaw = "";
  }
  const incidentHistorySeedItems = parseIncidentHistoryStoragePayload(incidentHistorySeedRaw) || [];
  store.setIncidentPackageHistory(incidentHistorySeedItems);
  applyIncidentHistoryViewControls();

  refreshRunBuilderPreview(session);
  refreshTerminalPreview(session, initialChoices);
  renderTerminalHistoryPanel();
  renderIncidentHistoryPanel();

  const api = new AgentOpsApi(config, () => getSession().token);
  const runtimeIntegrationSyncStateByProject = {};
  const resolveIntegrationScope = (currentSession, projectHint = "") => {
    const tenantID = activeTenantScope(currentSession);
    const projectID = String(projectHint || activeProjectScope(currentSession) || "").trim();
    return { tenantId: tenantID, projectId: projectID };
  };
  const syncProjectIntegrationSettings = async (projectID, currentSession, options = {}) => {
    const scope = resolveIntegrationScope(currentSession, projectID);
    const key = normalizeProjectScopeKey(scope.projectId);
    const currentState = runtimeIntegrationSyncStateByProject[key];
    if (!options.force && (currentState === "loaded" || currentState === "loaded-empty")) {
      return;
    }
    if (!scope.tenantId || !scope.projectId) {
      runtimeIntegrationSyncStateByProject[key] = "scope-unavailable";
      return;
    }

    runtimeIntegrationSyncStateByProject[key] = "loading";
    const response = await api.getIntegrationSettings(scope);
    if (response?.source !== "runtime-endpoint") {
      runtimeIntegrationSyncStateByProject[key] = response?.source || "fallback";
      return;
    }
    if (!response?.hasSettings || !response?.settings || typeof response.settings !== "object") {
      runtimeIntegrationSyncStateByProject[key] = "loaded-empty";
      return;
    }

    const baselineProjectChoices = resolveChoicesForProject(baselineChoices, scope.projectId, {});
    const fallbackDraft = buildEditorDraftFromChoices(
      baselineProjectChoices,
      response?.settings?.selectedAgentProfileId || baselineProjectChoices?.integrations?.selectedAgentProfileId
    );
    const runtimeDraft = normalizeIntegrationEditorDraft({
      ...fallbackDraft,
      ...(response.settings || {})
    });
    const syncedAt = String(response?.updatedAt || new Date().toISOString()).trim();

    integrationOverrides[key] = {
      override: runtimeDraft,
      applied: true,
      source: "runtime-endpoint",
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      savedAt: syncedAt,
      appliedAt: syncedAt
    };
    persistIntegrationOverrides();
    setEditorDraftForProject(scope.projectId, runtimeDraft);
    setEditorStatusForProject(scope.projectId, {
      status: "applied",
      message: "Project integration settings loaded from runtime endpoint.",
      errors: [],
      warnings: [],
      hasSavedOverride: true,
      applied: true,
      savedAt: syncedAt,
      appliedAt: syncedAt
    });
    resolveProjectChoices(scope.projectId, runtimeDraft.selectedAgentProfileId);
    runtimeIntegrationSyncStateByProject[key] = "loaded";
  };
  await syncProjectIntegrationSettings(initialProjectScope, session, { force: true });
  initialChoices = resolveProjectChoices(initialProjectScope);
  renderExecutionDefaults(ui, initialChoices);
  renderConfigSummary(initialChoices);
  refreshRunBuilderPreview(session);
  refreshTerminalPreview(session, initialChoices);

  let triageSnapshot = {
    runs: { items: [] },
    approvals: { items: [] },
    audit: { items: [] }
  };
  let latestAuditPayload = { items: [], source: "unknown" };
  let latestRunDetail = null;
  let latestRunDetailSource = "unknown";
  let latestSettingsSnapshot = {
    ...api.getSettingsSnapshot({
      choices: getRuntimeChoices(),
      themeMode: initialThemeMode,
      selectedAgentProfileId: initialAgentID
    }),
    configChanges: buildSettingsConfigChanges(configChangeHistory, { items: [] })
  };
  const renderTriagePanel = () => {
    renderOpsTriage({
      ...triageSnapshot,
      terminalHistory: store.getTerminalHistory()
    });
  };
  const renderContextPanel = () => {
    renderContextBar(triageSnapshot, session, latestSettingsSnapshot);
  };
  renderTriagePanel();
  renderContextPanel();
  let refreshInFlight = false;
  let refreshQueued = false;

  async function refresh() {
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }
    refreshInFlight = true;
    setRefreshStatus("loading", "refreshing");
    let refreshSucceeded = false;

    session = getSession();
    setAuthDisplay(ui, session);
    const projectID = activeProjectScope(session);
    await syncProjectIntegrationSettings(projectID, session);
    const currentChoices = resolveProjectChoices(projectID);
    renderExecutionDefaults(ui, currentChoices);
    refreshRunBuilderPreview(session);
    refreshTerminalPreview(session, currentChoices);

    if (config.auth?.enabled && !session.authenticated && !config.mockMode) {
      renderError(ui, "Sign in is required to view runtime and provider data.");
      clearDataPanels();
      setRefreshStatus("warn", "sign-in required");
      refreshInFlight = false;
      return;
    }

    renderPanelLoadingStates();

    try {
      const runScope = readRunFilters(ui);
      const auditScope = readAuditFilters(ui);
      const approvalScope = readApprovalFilters(ui);
      persistListFilterStateFromUI();

      const [health, pipeline, providers, runs] = await Promise.all([
        api.getHealth(),
        api.getPipelineStatus(),
        api.getProviders(),
        api.getRuntimeRuns(runScope.limit)
      ]);

      const [audit, approvals] = await Promise.all([
        api.getAuditEvents(auditScope, runs.items || []),
        api.getApprovalQueue(approvalScope, runs.items || [])
      ]);

      const selectedThemeMode = normalizeThemeMode(
        ui.settingsThemeMode?.value,
        currentChoices?.theme?.mode || "system"
      );
      const selectedAgentProfileId = String(
        ui.settingsAgentProfile?.value || currentChoices?.integrations?.selectedAgentProfileId || ""
      )
        .trim()
        .toLowerCase();
      const effectiveChoices = deepClone(currentChoices);
      effectiveChoices.theme = effectiveChoices.theme || {};
      effectiveChoices.theme.mode = selectedThemeMode;
      effectiveChoices.integrations = effectiveChoices.integrations || {};
      effectiveChoices.integrations.selectedAgentProfileId = selectedAgentProfileId;
      const latestRunId = String(runs?.items?.[0]?.runId || "").trim();
      if (!String(ui.terminalRunId?.value || "").trim() && latestRunId && ui.terminalRunId) {
        ui.terminalRunId.value = latestRunId;
      }
      refreshTerminalPreview(session, effectiveChoices);
      const settings = api.getSettingsSnapshot({
        choices: effectiveChoices,
        providers,
        runs,
        approvals,
        audit,
        themeMode: selectedThemeMode,
        selectedAgentProfileId
      });
      const settingsWithConfigChanges = {
        ...settings,
        configChanges: buildSettingsConfigChanges(configChangeHistory, audit)
      };
      await Promise.all([
        refreshOperatorChatHistory(session),
        refreshOperatorChatGovernanceCatalogs(session),
        refreshDesktopGovernedExportCatalogs()
      ]);

      latestSettingsSnapshot = settingsWithConfigChanges;
      triageSnapshot = { runs, approvals, audit };
      latestAuditPayload = audit || { items: [] };
      renderTriagePanel();
      renderContextPanel();
      renderHealth(ui, health, pipeline);
      renderProviders(ui, providers);
      renderChat(ui, settingsWithConfigChanges, {
        ...operatorChatState,
        agentProfileId:
          String(
            operatorChatState.agentProfileId ||
              selectedAgentProfileId ||
              settingsWithConfigChanges?.integrations?.selectedAgentProfileId ||
              ""
          )
            .trim()
            .toLowerCase()
      });
      const editorState = buildSettingsEditorState(
        activeProjectScope(session),
        settingsWithConfigChanges,
        store.getState().integrationEditorDraftsByProject || {},
        store.getState().integrationEditorStatusByProject || {},
        integrationOverrides,
        runtimeIntegrationSyncStateByProject
      );
      const selectedApprovalRunId = String(ui.approvalsDetailContent?.dataset?.selectedRunId || "").trim();
      renderSettings(ui, settingsWithConfigChanges, editorState, {
        subview: settingsSubviewState,
        aimxsEditor: aimxsEditorState,
        agentTest: {
          ...agentInvokeState,
          agentProfileId:
            String(
              agentInvokeState.agentProfileId ||
                selectedAgentProfileId ||
                settingsWithConfigChanges?.integrations?.selectedAgentProfileId ||
                ""
            )
              .trim()
              .toLowerCase()
        }
      });
      setSettingsSubview(settingsSubviewState);
      renderApprovals(ui, store, approvals, approvalScope, selectedApprovalRunId);
      renderApprovalsDetail(ui, store.getApprovalByRunID(selectedApprovalRunId));
      renderRuns(ui, store, runs, runScope);
      renderAudit(ui, audit, auditScope, {
        actor: String(
          session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || ""
        ).trim(),
        source: audit?.source || ""
      });
      applyAdvancedState();
      applyDetailsOpenState();
      refreshSucceeded = true;
    } catch (error) {
      renderError(ui, `Refresh failed: ${error.message}`);
      setRefreshStatus("error", "refresh failed");
    } finally {
      reconcileOperatorChatFollowLoop();
      refreshInFlight = false;
      if (refreshSucceeded) {
        setRefreshStatus("ok", `synced ${formatRefreshClock()}`);
      } else if (refreshQueued) {
        setRefreshStatus("loading", "refreshing");
      }
      if (refreshQueued) {
        refreshQueued = false;
        refresh().catch(() => {});
      }
    }
  }

  function getCurrentAuditFilingBundle() {
    const filters = readAuditFilters(ui);
    const currentSession = getSession();
    const actor = String(
      currentSession?.claims?.sub || currentSession?.claims?.email || currentSession?.claims?.client_id || ""
    ).trim();
    return buildAuditFilingBundle(latestAuditPayload, filters, {
      actor,
      source: latestAuditPayload?.source || ""
    });
  }

  function getCurrentIncidentPackage() {
    const auditBundle = getCurrentAuditFilingBundle();
    const runDetail = latestRunDetail && typeof latestRunDetail === "object" ? deepClone(latestRunDetail) : null;
    const runId = String(runDetail?.runId || "").trim();
    const runSummary = runId ? deepClone(store.getRunById(runId) || {}) : {};
    const approvalRecord = runId ? deepClone(store.getApprovalByRunID(runId) || {}) : {};
    const currentSession = getSession();
    const actor = String(
      currentSession?.claims?.sub || currentSession?.claims?.email || currentSession?.claims?.client_id || ""
    ).trim();
    const generatedAt = new Date().toISOString();
    const packageId = `incident-${generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}-${safeFileToken(runId, "run-none")}`;
    const approvalStatus = String(approvalRecord?.status || "").trim().toUpperCase();

    return {
      meta: {
        packageId,
        generatedAt,
        actor,
        packageVersion: "v1alpha1",
        scope: resolveIncidentPackageScope({
          run: { summary: runSummary },
          approval: { record: approvalRecord },
          audit: auditBundle
        }),
        sources: resolveIncidentPackageSources({
          run: { detailSource: latestRunDetailSource },
          approval: { source: approvalStatus ? "approval-queue" : "none" },
          audit: auditBundle
        })
      },
      run: {
        runId,
        detailSource: latestRunDetailSource,
        detail: runDetail,
        summary: runSummary
      },
      approval: {
        source: approvalStatus ? "approval-queue" : "none",
        status: approvalStatus || "UNAVAILABLE",
        record: approvalRecord
      },
      audit: auditBundle
    };
  }

  async function openRunDetail(runID, options = {}) {
    const nextRunID = String(runID || "").trim();
    if (!nextRunID) {
      return;
    }
    setWorkspaceView("runs", true);
    ui.runDetailContent.dataset.selectedRunId = nextRunID;
    if (ui.terminalRunId) {
      ui.terminalRunId.value = nextRunID;
      refreshTerminalPreview(getSession(), getRuntimeChoices());
    }

    const linkedApproval = store.getApprovalByRunID(nextRunID);
    if (options.fromApproval) {
      const approval = linkedApproval;
      if (approval?.tenantId) {
        ui.runsTenantFilter.value = String(approval.tenantId).trim();
      }
      if (approval?.projectId) {
        ui.runsProjectFilter.value = String(approval.projectId).trim();
      }
      if (ui.runsPage) {
        ui.runsPage.value = "1";
      }
    }

    try {
      const detail = await api.getRuntimeRun(nextRunID);
      latestRunDetail = detail;
      latestRunDetailSource = "runtime-endpoint";
      renderRunDetail(ui, detail, {
        approval: linkedApproval,
        selectedRunId: nextRunID
      });
      applyDetailsOpenState(ui.runDetailContent || document);
      applyAdvancedState(ui.runDetailContent || document);
    } catch (error) {
      const fallback = store.getRunById(nextRunID);
      if (fallback) {
        const fallbackDetail = {
          ...fallback,
          detailError: `Runtime detail endpoint failed: ${error.message}`
        };
        latestRunDetail = fallbackDetail;
        latestRunDetailSource = "run-summary-fallback";
        renderRunDetail(ui, fallbackDetail, {
          approval: linkedApproval,
          selectedRunId: nextRunID
        });
        applyDetailsOpenState(ui.runDetailContent || document);
        applyAdvancedState(ui.runDetailContent || document);
      } else {
        latestRunDetail = null;
        latestRunDetailSource = "unavailable";
        ui.runDetailContent.dataset.selectedRunId = nextRunID;
        ui.runDetailContent.innerHTML = renderPanelStateMetric(
          "error",
          "Run Detail",
          `Run detail failed: ${error.message}`
        );
      }
    }

    focusRenderedRegion(ui.runDetailContent);
  }

  function openApprovalDetail(runID) {
    const nextRunID = String(runID || "").trim();
    if (!nextRunID || !ui.approvalsDetailContent) {
      return "noop";
    }
    const selectedRunID = String(ui.approvalsDetailContent.dataset.selectedRunId || "").trim();
    if (selectedRunID && selectedRunID === nextRunID) {
      delete ui.approvalsDetailContent.dataset.selectedRunId;
      renderApprovalsDetail(ui, null);
      return "collapsed";
    }
    ui.approvalsDetailContent.dataset.selectedRunId = nextRunID;
    const approval = store.getApprovalByRunID(nextRunID);
    renderApprovalsDetail(ui, approval);
    focusRenderedRegion(ui.approvalsDetailContent);
    return "opened";
  }

  ui.loginButton.addEventListener("click", async () => {
    try {
      await beginLogin(config);
      session = getSession();
      setAuthDisplay(ui, session);

      if (session.claims.tenant_id) {
        if (!String(ui.runsTenantFilter?.value || "").trim() && ui.runsTenantFilter) {
          ui.runsTenantFilter.value = session.claims.tenant_id;
        }
        if (!String(ui.auditTenantFilter?.value || "").trim() && ui.auditTenantFilter) {
          ui.auditTenantFilter.value = session.claims.tenant_id;
        }
        if (!String(ui.approvalsTenantFilter?.value || "").trim() && ui.approvalsTenantFilter) {
          ui.approvalsTenantFilter.value = session.claims.tenant_id;
        }
      }

      const activeProject = String(
        readSavedValue(PROJECT_PREF_KEY) || session.claims.project_id || ""
      ).trim();
      applyProjectContext(activeProject);
      await syncProjectIntegrationSettings(activeProject, session, { force: true });
      const currentChoices = resolveProjectChoices(activeProject);
      renderExecutionDefaults(ui, currentChoices);
      renderConfigSummary(currentChoices);
      refreshRunBuilderPreview(session);
      refreshTerminalPreview(session, currentChoices);
      await refresh();
    } catch (error) {
      renderError(ui, `Sign-in flow failed: ${error.message}`);
      setRefreshStatus("error", "sign-in failed");
    }
  });

  ui.logoutButton.addEventListener("click", () => {
    logout();
    setAuthDisplay(ui, getSession());
    latestRunDetail = null;
    latestRunDetailSource = "unknown";
    clearDataPanels();
    setRefreshStatus("warn", "signed out");
  });

  ui.runBuilderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { issues, payload } = refreshRunBuilderPreview(getSession());

    const blocking = issues.filter((issue) => issue.severity === "error");
    if (blocking.length) {
      renderRunBuilderFeedback(ui, "error", blocking.map((issue) => issue.message).join(" "));
      return;
    }

    try {
      const result = await api.createRuntimeRun(payload);
      const resultRunID = result?.runId || payload?.meta?.requestId || "(unknown)";
      const resultStatus = result?.status || "submitted";
      renderRunBuilderFeedback(ui, "ok", `runId=${resultRunID}; status=${resultStatus}`);
      await refresh();
    } catch (error) {
      renderRunBuilderFeedback(ui, "error", error.message);
    }
  });

  const runBuilderWatchTargets = [
    ui.rbRequestId,
    ui.rbTenantId,
    ui.rbProjectId,
    ui.rbEnvironment,
    ui.rbTier,
    ui.rbTargetOS,
    ui.rbTargetProfile,
    ui.rbStepId,
    ui.rbCapabilities,
    ui.rbVerifierIds,
    ui.rbActionType,
    ui.rbActionSelector,
    ui.rbPostAction,
    ui.rbActionTarget,
    ui.rbHumanApprovalGranted,
    ui.rbRestrictedHostOptIn,
    ui.rbDryRun
  ].filter(Boolean);

  for (const target of runBuilderWatchTargets) {
    target.addEventListener("change", () => {
      refreshRunBuilderPreview(getSession());
    });
    if (target.tagName === "INPUT") {
      target.addEventListener("keyup", () => {
        refreshRunBuilderPreview(getSession());
      });
    }
  }

  const terminalWatchTargets = [
    ui.terminalRunId,
    ui.terminalCommand,
    ui.terminalCwd,
    ui.terminalTimeoutSeconds,
    ui.terminalReadOnly,
    ui.terminalRestrictedHostRequest
  ].filter(Boolean);
  for (const target of terminalWatchTargets) {
    target.addEventListener("change", () => {
      refreshTerminalPreview(getSession(), getRuntimeChoices());
    });
    if (target.tagName === "INPUT" && target.type !== "checkbox") {
      target.addEventListener("keyup", () => {
        refreshTerminalPreview(getSession(), getRuntimeChoices());
      });
    }
  }
  ui.terminalHistoryRunFilter?.addEventListener("keyup", () => {
    renderTerminalHistoryPanel();
  });
  ui.terminalHistoryRunFilter?.addEventListener("change", () => {
    renderTerminalHistoryPanel();
  });
  ui.terminalHistoryStatusFilter?.addEventListener("change", () => {
    renderTerminalHistoryPanel();
  });
  ui.terminalHistoryClearButton?.addEventListener("click", () => {
    if (ui.terminalHistoryRunFilter) {
      ui.terminalHistoryRunFilter.value = "";
    }
    if (ui.terminalHistoryStatusFilter) {
      ui.terminalHistoryStatusFilter.value = "";
    }
    renderTerminalHistoryPanel();
  });

  ui.approvalsApplyButton.addEventListener("click", () => {
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.approvalsSort?.addEventListener("change", () => {
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.approvalsTimeRange?.addEventListener("change", () => {
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }
    syncCustomTimeFilterControls("approvals");
    refresh().catch(() => {});
  });
  ui.approvalsTimeFrom?.addEventListener("change", () => {
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }
    promoteCustomTimeFilter("approvals");
    refresh().catch(() => {});
  });
  ui.approvalsTimeTo?.addEventListener("change", () => {
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }
    promoteCustomTimeFilter("approvals");
    refresh().catch(() => {});
  });
  ui.approvalsPageSize?.addEventListener("change", () => {
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.approvalsPage?.addEventListener("change", () => {
    refresh().catch(() => {});
  });
  ui.contextProjectSelect?.addEventListener("change", async () => {
    const selectedProject = String(ui.contextProjectSelect?.value || "").trim();
    saveValue(PROJECT_PREF_KEY, selectedProject);
    applyProjectContext(selectedProject);
    await syncProjectIntegrationSettings(selectedProject, getSession(), { force: true });
    const nextChoices = resolveProjectChoices(selectedProject);
    renderExecutionDefaults(ui, nextChoices);
    renderConfigSummary(nextChoices);
    refreshRunBuilderPreview(getSession());
    refreshTerminalPreview(getSession(), nextChoices);
    await refresh();
  });
  ui.contextEndpointBadges?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-context-endpoint-id]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const endpointID = String(actionNode.dataset.contextEndpointId || "").trim().toLowerCase();
    if (!endpointID) {
      return;
    }

    setWorkspaceView("settings", true);
    setAdvancedSectionEnabled("settings", true, true);
    setSettingsSubview("diagnostics", true);
    await refresh();
    if (focusSettingsEndpointRow(endpointID)) {
      return;
    }
    ui.settingsContent?.scrollIntoView({ behavior: "smooth", block: "start" });
    focusRenderedRegion(ui.settingsContent, { scroll: false });
  });
  ui.settingsOpenAuditEventsButton?.addEventListener("click", async () => {
    setWorkspaceView("incidents", true);
    setIncidentSubview("audit", true);
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    await refresh();
    focusRenderedRegion(ui.auditContent);
  });
  ui.settingsThemeMode?.addEventListener("change", () => {
    const mode = normalizeThemeMode(ui.settingsThemeMode?.value, "system");
    saveValue(THEME_PREF_KEY, mode);
    applyThemeMode(mode);
    const current = deepClone(getRuntimeChoices());
    current.theme = current.theme || {};
    current.theme.mode = mode;
    store.patch({ runtimeChoices: current });
    recordConfigChange({
      action: "settings.theme.mode",
      status: "applied",
      source: "local-ui",
      event: "settings.theme.mode",
      providerId: "settings-editor"
    });
    refresh().catch(() => {});
  });
  ui.settingsAgentProfile?.addEventListener("change", () => {
    const selected = String(ui.settingsAgentProfile?.value || "").trim().toLowerCase();
    if (selected) {
      saveValue(AGENT_PREF_KEY, selected);
    }
    agentInvokeState = {
      ...agentInvokeState,
      agentProfileId: selected || agentInvokeState.agentProfileId
    };
    const current = deepClone(getRuntimeChoices());
    current.integrations = current.integrations || {};
    current.integrations.selectedAgentProfileId = selected;
    store.patch({ runtimeChoices: current });
    refreshTerminalPreview(getSession(), current);
    recordConfigChange({
      action: "settings.agent_profile.select",
      status: "applied",
      source: "local-ui",
      event: "settings.agent_profile.select",
      providerId: "settings-editor"
    });
    refresh().catch(() => {});
  });
  ui.chatContent?.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-chat-export-field]")) {
      const field = String(target.dataset.chatExportField || "").trim();
      if (!field) {
        return;
      }
      const rawValue = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
        ? String(target.value || "").trim()
        : "";
      const selection = buildGovernedExportSelectionState({
        clientSurface: "chat",
        reportType: "review",
        exportProfileCatalog: operatorChatState?.catalogs?.exportProfiles || null,
        ...operatorChatState?.exportSelection,
        [field]: rawValue
      });
      operatorChatState = {
        ...operatorChatState,
        exportSelection: {
          exportProfile: selection.exportProfile,
          audience: selection.audience,
          retentionClass: selection.retentionClass
        },
        status: operatorChatState.thread?.taskId ? "ready" : operatorChatState.status,
        message: "Governed export selection updated for Chat review and export actions."
      };
      refresh().catch(() => {});
      return;
    }
    if (!(target instanceof HTMLElement) || !target.closest("[data-chat-field]")) {
      return;
    }
    const draft = readOperatorChatInput();
    if (!draft) {
      return;
    }
    operatorChatState = {
      ...operatorChatState,
      ...draft,
      status: operatorChatState.thread?.taskId ? "dirty" : "idle",
      message: operatorChatState.thread?.taskId
        ? "Chat draft changed. Send Turn to append a new M16 session to this thread."
        : "Chat draft changed. Start Thread to create the M16 task for this conversation."
    };
  });
  ui.chatContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-chat-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.chatAction || "").trim().toLowerCase();
    if (!action) {
      return;
    }
    const session = getSession();
    const scope = {
      tenantId: activeTenantScope(session),
      projectId: activeProjectScope(session)
    };
    const draft =
      readOperatorChatInput() ||
      normalizeOperatorChatDraft(operatorChatState, getRuntimeChoices()?.integrations?.selectedAgentProfileId || "");

    if (action === "reset-thread") {
      clearOperatorChatFollowLoop();
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        prompt: "",
        status: "idle",
        message: "Chat thread cleared. Start a new thread when ready.",
        thread: null
      };
      await refresh();
      return;
    }

    if (action === "refresh-threads") {
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: `Refreshing native operator chat threads for ${scope.projectId || "current scope"}...`
      };
      await refresh();
      await refreshOperatorChatHistory(session);
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "ready",
        message: "Native operator chat thread history refreshed."
      };
      await refresh();
      return;
    }

    if (action === "toggle-archived-threads") {
      operatorChatState = {
        ...operatorChatState,
        history: {
          ...operatorChatState.history,
          showArchived: !operatorChatState.history?.showArchived
        }
      };
      await refreshOperatorChatHistory(session);
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "ready",
        message: operatorChatState.history?.showArchived
          ? "Archived operator chat threads are now visible in the history rail."
          : "Archived operator chat threads are now hidden from the history rail."
      };
      await refresh();
      return;
    }

    if (!scope.tenantId || !scope.projectId) {
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "invalid",
        message: "Tenant and project scope are required before using operator chat."
      };
      await refresh();
      return;
    }

    if (action === "archive-thread" || action === "archive-thread-from-history") {
      const taskId = action === "archive-thread"
        ? String(operatorChatState.thread?.taskId || "").trim()
        : String(actionNode.dataset.chatTaskId || "").trim();
      if (!taskId) {
        return;
      }
      setOperatorChatArchivedTask(scope, taskId, true);
      if (String(operatorChatState.thread?.taskId || "").trim() === taskId) {
        clearOperatorChatFollowLoop();
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          prompt: "",
          status: "success",
          message: `Thread ${taskId} archived locally. Resume it from history only when you intentionally restore it.`,
          thread: null
        };
      } else {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "success",
          message: `Thread ${taskId} archived locally.`
        };
      }
      await refreshOperatorChatHistory(session);
      await refresh();
      return;
    }

    if (action === "restore-archived-thread") {
      const taskId = String(actionNode.dataset.chatTaskId || "").trim();
      if (!taskId) {
        return;
      }
      setOperatorChatArchivedTask(scope, taskId, false);
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "success",
        message: `Thread ${taskId} restored to the active history rail.`
      };
      await refreshOperatorChatHistory(session);
      await refresh();
      return;
    }

    if (action === "resume-thread") {
      const taskId = String(actionNode.dataset.chatTaskId || "").trim();
      if (!taskId) {
        return;
      }
      const taskEntry = (Array.isArray(operatorChatState.history?.items) ? operatorChatState.history.items : []).find(
        (item) => String(item?.taskId || "").trim() === taskId
      );
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: `Loading native chat thread ${taskId}...`
      };
      await refresh();
      try {
        const thread = await loadOperatorChatThread(api, scope, taskEntry || taskId, { limit: 12 });
        const derived = patchOperatorChatThreadState(thread, {
          status: "success",
          message: `Native chat thread ${taskId} loaded from M16 task/session history. ${deriveOperatorChatThreadState(thread).message}`
        });
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          title: thread.title || draft.title,
          intent: thread.intent || draft.intent,
          agentProfileId: thread.agentProfileId || draft.agentProfileId,
          executionMode: thread.executionMode || draft.executionMode,
          prompt: "",
          status: derived.uiStatus === "success" ? "success" : operatorChatState.status,
          message: operatorChatState.message,
          thread
        };
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Thread resume failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "close-thread-view") {
      clearOperatorChatFollowLoop();
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        prompt: "",
        status: "ready",
        message: "Resolved thread view closed. Resume it from history or start a follow-up thread when needed.",
        thread: null
      };
      await refresh();
      return;
    }

    if (action === "start-thread") {
      if (operatorChatState.thread?.taskId) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "warn",
          message: "A thread is already active. Reset it before starting a new one."
        };
        await refresh();
        return;
      }
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: `Creating operator chat task for ${scope.projectId}...`
      };
      await refresh();
      try {
        const thread = await createOperatorChatThread(api, scope, draft);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "success",
          message: `Operator chat thread ${thread.taskId} created. Send the first turn when ready.`,
          thread: {
            ...thread,
            agentProfileId: draft.agentProfileId,
            executionMode: draft.executionMode,
            turns: []
          }
        };
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Thread creation failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "start-followup-thread") {
      if (!operatorChatState.thread?.taskId) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "invalid",
          message: "An active resolved thread is required before starting a follow-up thread."
        };
        await refresh();
        return;
      }
      clearOperatorChatFollowLoop();
      const followUpDraft = buildFollowUpOperatorChatDraft(draft, operatorChatState.thread);
      operatorChatState = {
        ...operatorChatState,
        ...followUpDraft,
        status: "running",
        message: `Creating follow-up operator chat task for ${scope.projectId}...`
      };
      await refresh();
      try {
        const thread = await createOperatorChatThread(api, scope, followUpDraft);
        operatorChatState = {
          ...operatorChatState,
          ...followUpDraft,
          prompt: "",
          status: "success",
          message: `Follow-up thread ${thread.taskId} created. Send the next governed turn when ready.`,
          thread: {
            ...thread,
            agentProfileId: followUpDraft.agentProfileId,
            executionMode: followUpDraft.executionMode,
            turns: []
          }
        };
        await refreshOperatorChatHistory(session);
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...followUpDraft,
          status: "error",
          message: `Follow-up thread creation failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "send-turn") {
      if (!operatorChatState.thread?.taskId) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "invalid",
          message: "Start a thread first so the turn has an M16 task to attach to."
        };
        await refresh();
        return;
      }
      if (!String(draft.prompt || "").trim()) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "invalid",
          message: "Operator prompt is required before sending a chat turn."
        };
        await refresh();
        return;
      }
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: `Invoking ${draft.agentProfileId} on thread ${operatorChatState.thread.taskId}...`
      };
      await refresh();
      try {
        const result = await invokeOperatorChatTurn(api, scope, operatorChatState.thread, draft);
        const turn = {
          requestId: String(result?.response?.requestId || "").trim(),
          taskId: String(result?.response?.taskId || operatorChatState.thread.taskId || "").trim(),
          prompt: draft.prompt,
          systemPrompt: draft.systemPrompt,
          createdAt: String(result?.response?.startedAt || new Date().toISOString()).trim(),
          response: result?.response || null,
          sessionView: result?.sessionView || null
        };
        const nextThread = {
          ...operatorChatState.thread,
          agentProfileId: draft.agentProfileId,
          latestSessionId: String(result?.response?.sessionId || "").trim(),
          turns: [...(Array.isArray(operatorChatState.thread.turns) ? operatorChatState.thread.turns : []), turn]
        };
        const derived = deriveOperatorChatThreadState(nextThread);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          prompt: "",
          status:
            derived.uiStatus ||
            (result?.response?.applied && result?.response?.source === "runtime-endpoint"
              ? "success"
              : result?.response?.applied
                ? "warn"
                : "error"),
          message:
            result?.response?.applied && result?.response?.source === "runtime-endpoint"
              ? derived.message
              : String(result?.response?.warning || "").trim() || "Turn did not complete.",
          thread: nextThread
        };
        await refreshOperatorChatHistory(session);
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Send turn failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "launch-managed-worker") {
      if (!operatorChatState.thread?.taskId) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "invalid",
          message: "Start a managed-worker thread first so the worker launch has an M16 task to attach to."
        };
        await refresh();
        return;
      }
      if (String(draft.executionMode || operatorChatState.thread?.executionMode || "").trim().toLowerCase() !== "managed_codex_worker") {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "invalid",
          message: "Switch Execution Path to Managed Codex Worker before launching the bridge."
        };
        await refresh();
        return;
      }
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: `Launching managed Codex worker for ${operatorChatState.thread.taskId}...`
      };
      await refresh();
      try {
        const result = await launchManagedCodexWorker(api, scope, operatorChatState.thread, draft);
        const derived = deriveOperatorChatThreadState(result.thread);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          prompt: "",
          status: derived.uiStatus || "success",
          message: derived.message || "Managed Codex worker launched.",
          thread: result.thread
        };
        await refreshOperatorChatHistory(session);
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Managed worker launch failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "emit-worker-heartbeat") {
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: "Recording managed worker heartbeat..."
      };
      await refresh();
      try {
        const result = await emitManagedCodexWorkerHeartbeat(api, scope, operatorChatState.thread, {
          summary: "Managed Codex worker heartbeat recorded from the chat control surface."
        });
        const derived = deriveOperatorChatThreadState(result.thread);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: derived.uiStatus || "success",
          message: derived.message || "Managed worker heartbeat recorded.",
          thread: result.thread
        };
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Managed worker heartbeat failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "reattach-managed-worker") {
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: "Reattaching managed Codex worker to the active native session..."
      };
      await refresh();
      try {
        const result = await reattachManagedCodexWorker(api, scope, operatorChatState.thread, draft);
        const derived = deriveOperatorChatThreadState(result.thread);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: derived.uiStatus || "success",
          message: derived.message || "Managed Codex worker reattached.",
          thread: result.thread
        };
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Managed worker reattach failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "recover-managed-worker") {
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: "Recovering managed Codex worker onto a fresh native session..."
      };
      await refresh();
      try {
        const result = await recoverManagedCodexWorker(api, scope, operatorChatState.thread, draft);
        const derived = deriveOperatorChatThreadState(result.thread);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: derived.uiStatus || "success",
          message: derived.message || "Managed Codex worker recovered onto a fresh native session.",
          thread: result.thread
        };
        await refreshOperatorChatHistory(session);
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Managed worker recover failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "close-managed-worker") {
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: "Closing the active managed Codex worker session..."
      };
      await refresh();
      try {
        const result = await closeManagedCodexWorkerSession(api, scope, operatorChatState.thread, {
          status: "CANCELLED",
          reason: "Managed Codex worker session closed from chat controls."
        });
        const derived = deriveOperatorChatThreadState(result.thread);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: derived.uiStatus || "warn",
          message: derived.message || "Managed Codex worker session closed.",
          thread: result.thread
        };
        await refreshOperatorChatHistory(session);
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Managed worker close failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "refresh-last-turn") {
      const turns = Array.isArray(operatorChatState.thread?.turns) ? operatorChatState.thread.turns : [];
      const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
      const sessionId = String(lastTurn?.response?.sessionId || lastTurn?.sessionView?.sessionId || "").trim();
      if (!sessionId) {
        return;
      }
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: `Refreshing native M16 session ${sessionId} for the latest chat turn...`
      };
      await refresh();
      try {
        const result = await refreshOperatorChatThreadSession(api, operatorChatState.thread, sessionId, {
          tailCount: 8,
          waitSeconds: 1
        });
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: result?.state?.uiStatus || "ready",
          message: result?.state?.message || "Latest chat turn refreshed from the native session contract.",
          thread: result?.thread || operatorChatState.thread
        };
        if (result?.state?.isResolvedThread) {
          await refreshOperatorChatHistory(session);
        }
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Refresh last turn failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "copy-tool-action-json" || action === "download-tool-action-json") {
      const sessionId = String(actionNode.dataset.chatSessionId || "").trim();
      const toolActionId = String(actionNode.dataset.chatToolActionId || "").trim();
      if (!sessionId || !toolActionId) {
        return;
      }
      const payload = buildOperatorChatToolActionExport(operatorChatState.thread, sessionId, toolActionId);
      const governedExportSelection = resolveOperatorChatGovernedExportSelection();
      if (!payload) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "warn",
          message: `Tool action ${toolActionId} is no longer available in the loaded thread view.`
        };
        await refresh();
        return;
      }
      const serialized = JSON.stringify(payload, null, 2);
      try {
        if (action === "copy-tool-action-json") {
          const prepared = await copyGovernedText(
            serialized,
            {
              ...buildDesktopGovernedExportOptions(
              governedExportSelection.exportProfile,
              governedExportSelection.audience,
              "review",
              "chat",
              operatorChatState?.catalogs?.exportProfiles,
              governedExportSelection.retentionClass
              ),
              approvalCheckpoints: payload?.approvalCheckpoints || []
            }
          );
          operatorChatState = {
            ...operatorChatState,
            ...draft,
            status: "success",
            message: `Copied tool action ${toolActionId} review JSON to the clipboard.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "tool-action export")}`
          };
        } else {
          const fileName = `epydios-agentops-chat-tool-action-${toolActionId}.json`;
          const prepared = exportGovernedJson(
            payload,
            fileName,
            {
              ...buildDesktopGovernedExportOptions(
              governedExportSelection.exportProfile,
              governedExportSelection.audience,
              "review",
              "chat",
              operatorChatState?.catalogs?.exportProfiles,
              governedExportSelection.retentionClass
              ),
              approvalCheckpoints: payload?.approvalCheckpoints || []
            }
          );
          operatorChatState = {
            ...operatorChatState,
            ...draft,
            status: "success",
            message: `Downloaded tool action ${toolActionId} review JSON as ${fileName}.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "tool-action export")}`
          };
        }
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Tool action export failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "copy-evidence-json" || action === "download-evidence-json") {
      const sessionId = String(actionNode.dataset.chatSessionId || "").trim();
      const evidenceId = String(actionNode.dataset.chatEvidenceId || "").trim();
      if (!sessionId || !evidenceId) {
        return;
      }
      const payload = buildOperatorChatEvidenceExport(operatorChatState.thread, sessionId, evidenceId);
      const governedExportSelection = resolveOperatorChatGovernedExportSelection();
      if (!payload) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "warn",
          message: `Evidence record ${evidenceId} is no longer available in the loaded thread view.`
        };
        await refresh();
        return;
      }
      try {
        if (action === "copy-evidence-json") {
          const prepared = await copyGovernedText(
            JSON.stringify(payload, null, 2),
            {
              ...buildDesktopGovernedExportOptions(
              governedExportSelection.exportProfile,
              governedExportSelection.audience,
              "review",
              "chat",
              operatorChatState?.catalogs?.exportProfiles,
              governedExportSelection.retentionClass
              ),
              approvalCheckpoints: payload?.approvalCheckpoints || []
            }
          );
          operatorChatState = {
            ...operatorChatState,
            ...draft,
            status: "success",
            message: `Copied evidence record ${evidenceId} review JSON to the clipboard.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "evidence export")}`
          };
        } else {
          const fileName = `epydios-agentops-chat-evidence-${evidenceId}.json`;
          const prepared = exportGovernedJson(
            payload,
            fileName,
            {
              ...buildDesktopGovernedExportOptions(
              governedExportSelection.exportProfile,
              governedExportSelection.audience,
              "review",
              "chat",
              operatorChatState?.catalogs?.exportProfiles,
              governedExportSelection.retentionClass
              ),
              approvalCheckpoints: payload?.approvalCheckpoints || []
            }
          );
          operatorChatState = {
            ...operatorChatState,
            ...draft,
            status: "success",
            message: `Downloaded evidence record ${evidenceId} review JSON as ${fileName}.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "evidence export")}`
          };
        }
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Evidence export failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "copy-governance-report" || action === "download-governance-report") {
      const sessionId = String(actionNode.dataset.chatSessionId || "").trim();
      if (!sessionId) {
        return;
      }
      const governedExportSelection = resolveOperatorChatGovernedExportSelection();
      const envelope = buildOperatorChatGovernanceReportExport(operatorChatState.thread, sessionId, operatorChatState.catalogs, governedExportSelection);
      if (!envelope) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "warn",
          message: `Governance report for session ${sessionId} is no longer available in the loaded thread view.`
        };
        await refresh();
        return;
      }
      try {
        if (action === "copy-governance-report") {
          const prepared = await copyGovernedText(
            envelope.renderedText || "",
            buildDesktopGovernedExportOptions(
              envelope.exportProfile,
              envelope.audience,
              envelope.reportType || "review",
              "chat",
              operatorChatState?.catalogs?.exportProfiles,
              envelope.retentionClass
            )
          );
          operatorChatState = {
            ...operatorChatState,
            ...draft,
            status: "success",
            message: `Copied enterprise governance report for session ${sessionId}.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "governance report")}`
          };
        } else {
          const fileName = `epydios-agentops-chat-governance-report-${sessionId}.json`;
          const prepared = exportGovernedJson(
            envelope,
            fileName,
            buildDesktopGovernedExportOptions(
              envelope.exportProfile,
              envelope.audience,
              envelope.reportType || "review",
              "chat",
              operatorChatState?.catalogs?.exportProfiles,
              envelope.retentionClass
            )
          );
          operatorChatState = {
            ...operatorChatState,
            ...draft,
            status: "success",
            message: `Downloaded enterprise governance report for session ${sessionId} as ${fileName}.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "governance report")}`
          };
        }
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Governance report export failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "approve-tool-proposal" || action === "deny-tool-proposal") {
      const sessionId = String(actionNode.dataset.chatSessionId || "").trim();
      const proposalId = String(actionNode.dataset.chatProposalId || "").trim();
      if (!sessionId || !proposalId || !operatorChatState.thread) {
        return;
      }
      const proposalRow = actionNode.closest("[data-chat-tool-proposal-row]");
      const reasonInput = proposalRow instanceof HTMLElement ? proposalRow.querySelector("[data-chat-proposal-reason]") : null;
      const reason = reasonInput instanceof HTMLInputElement ? String(reasonInput.value || "").trim() : "";
      const decision = action === "deny-tool-proposal" ? "DENY" : "APPROVE";
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: `Submitting ${decision} for tool proposal ${proposalId} on session ${sessionId}...`
      };
      await refresh();
      try {
        const result = await api.submitRuntimeSessionToolProposalDecision(sessionId, proposalId, decision, {
          meta: {
            tenantId: scope.tenantId,
            projectId: scope.projectId,
            requestId: `chat-tool-proposal-${Date.now()}`
          },
          reason
        });
        const refreshed = await refreshOperatorChatThreadSession(api, operatorChatState.thread, sessionId, {
          tailCount: 8,
          waitSeconds: 1
        });
        const nextThread = refreshed?.thread || operatorChatState.thread;
        const derived = deriveOperatorChatThreadState(nextThread);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: derived.uiStatus || (result?.applied ? "success" : "warn"),
          message: result?.applied
            ? `Tool proposal ${proposalId} ${decision === "DENY" ? "denied" : "approved"}. ${derived.message}`
            : String(result?.warning || "").trim() || `Tool proposal ${proposalId} was not changed.`,
          thread: nextThread
        };
        await refreshOperatorChatHistory(session);
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Tool proposal decision failed: ${error.message}`
        };
      }
      await refresh();
      return;
    }

    if (action === "approve-checkpoint" || action === "deny-checkpoint") {
      const sessionId = String(actionNode.dataset.chatSessionId || "").trim();
      const checkpointId = String(actionNode.dataset.chatCheckpointId || "").trim();
      if (!sessionId || !checkpointId || !operatorChatState.thread) {
        return;
      }
      const approvalRow = actionNode.closest("[data-chat-approval-row]");
      const reasonInput = approvalRow instanceof HTMLElement ? approvalRow.querySelector("[data-chat-approval-reason]") : null;
      const reason = reasonInput instanceof HTMLInputElement ? String(reasonInput.value || "").trim() : "";
      const decision = action === "deny-checkpoint" ? "DENY" : "APPROVE";
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "running",
        message: `Submitting ${decision} for checkpoint ${checkpointId} on session ${sessionId}...`
      };
      await refresh();
      try {
        const result = await api.submitRuntimeSessionApprovalDecision(sessionId, checkpointId, decision, {
          meta: {
            tenantId: scope.tenantId,
            projectId: scope.projectId,
            requestId: `chat-approval-${Date.now()}`
          },
          reason
        });
        const refreshed = await refreshOperatorChatThreadSession(api, operatorChatState.thread, sessionId, {
          tailCount: 8,
          waitSeconds: 1
        });
        const nextThread = refreshed?.thread || operatorChatState.thread;
        const derived = deriveOperatorChatThreadState(nextThread);
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: derived.uiStatus || (result?.applied ? "success" : "warn"),
          message: result?.applied
            ? `Checkpoint ${checkpointId} ${decision === "DENY" ? "denied" : "approved"}. ${derived.message}`
            : String(result?.warning || "").trim() || `Checkpoint ${checkpointId} was not changed.`,
          thread: nextThread
        };
        await refreshOperatorChatHistory(session);
      } catch (error) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "error",
          message: `Approval decision failed: ${error.message}`
        };
      }
      await refresh();
    }
  });
  ui.settingsContent?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const integrationFieldNode = target.closest("[data-settings-int-field]");
    const aimxsFieldNode = target.closest("[data-settings-aimxs-field]");
    const agentTestFieldNode = target.closest("[data-settings-agent-test-field]");
    if (!integrationFieldNode && !aimxsFieldNode && !agentTestFieldNode) {
      return;
    }
    if (agentTestFieldNode) {
      const draft = readAgentInvokeInput();
      if (!draft) {
        return;
      }
      const validation = validateAgentInvokeDraft(draft, getRuntimeChoices());
      agentInvokeState = {
        ...agentInvokeState,
        ...draft,
        status: validation.valid ? "dirty" : "invalid",
        message: validation.valid
          ? "Agent test draft changed. Run Invoke Selected Agent to exercise the live runtime integration path."
          : validation.errors.join(" "),
        response: null,
        sessionView: null
      };
      return;
    }
    if (aimxsFieldNode) {
      const draft = readAimxsEditorInput();
      if (!draft) {
        return;
      }
      const validation = validateAimxsOverride(draft, getRuntimeChoices()?.aimxs || {});
      aimxsEditorState = validation.valid
        ? {
            status: "dirty",
            message:
              "AIMXS draft changed. Review warnings, then run Apply AIMXS Settings to update the active runtime choices.",
            errors: [],
            warnings: validation.warnings
          }
        : {
            status: "invalid",
            message: "AIMXS apply is blocked. Fix the fields below, then run Apply AIMXS Settings again.",
            errors: validation.errors,
            warnings: validation.warnings
          };
      renderAimxsEditorFeedbackInline(aimxsEditorState);
      return;
    }
    const projectID = activeProjectScope(getSession());
    const draft = readIntegrationEditorInput();
    if (!draft) {
      return;
    }
    setEditorDraftForProject(projectID, draft);
    const key = normalizeProjectScopeKey(projectID);
    const entry = integrationOverrides[key];
    const inlineState = {
      status: "dirty",
      message: "Project settings draft changed. Save Draft to checkpoint it, then run Apply Saved to activate this scope.",
      errors: [],
      warnings: [],
      hasSavedOverride: Boolean(entry?.override),
      applied: Boolean(entry?.applied),
      savedAt: String(entry?.savedAt || "").trim(),
      appliedAt: String(entry?.appliedAt || "").trim()
    };
    setEditorStatusForProject(projectID, inlineState);
    renderSettingsEditorFeedbackInline(inlineState);
  });
  ui.settingsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const settingsSubviewNode = target.closest("[data-settings-subtab]");
    if (settingsSubviewNode instanceof HTMLElement) {
      const requested = String(settingsSubviewNode.dataset.settingsSubtab || "").trim().toLowerCase();
      setSettingsSubview(requested, true);
      focusActiveSettingsSubview({ scroll: false });
      return;
    }
    const openAuditNode = target.closest("[data-settings-config-open-audit]");
    if (openAuditNode instanceof HTMLElement) {
      const eventFilter = String(openAuditNode.dataset.settingsConfigEvent || "").trim();
      const providerFilter = String(openAuditNode.dataset.settingsConfigProvider || "").trim();
      const decisionFilter = String(openAuditNode.dataset.settingsConfigDecision || "")
        .trim()
        .toUpperCase();
      if (ui.auditEventFilter) {
        ui.auditEventFilter.value = eventFilter;
      }
      if (ui.auditProviderFilter && providerFilter) {
        ui.auditProviderFilter.value = providerFilter;
      }
      if (ui.auditDecisionFilter && (decisionFilter === "ALLOW" || decisionFilter === "DENY")) {
        ui.auditDecisionFilter.value = decisionFilter;
      }
      if (ui.auditPage) {
        ui.auditPage.value = "1";
      }
      setWorkspaceView("incidents", true);
      setIncidentSubview("audit", true);
      await refresh();
      focusRenderedRegion(ui.auditContent);
      return;
    }
    const aimxsActionNode = target.closest("[data-settings-aimxs-action]");
    if (aimxsActionNode instanceof HTMLElement) {
      const action = String(aimxsActionNode.dataset.settingsAimxsAction || "")
        .trim()
        .toLowerCase();
      if (!action) {
        return;
      }

      if (action === "apply") {
        const draft = readAimxsEditorInput();
        if (!draft) {
          aimxsEditorState = {
            status: "invalid",
            message: "AIMXS controls are unavailable in this view. Reopen Settings and retry the action.",
            errors: [],
            warnings: []
          };
          renderAimxsEditorFeedbackInline(aimxsEditorState);
          return;
        }

        const validation = validateAimxsOverride(draft, getRuntimeChoices()?.aimxs || {});
        if (!validation.valid) {
          aimxsEditorState = {
            status: "invalid",
            message: "AIMXS apply is blocked. Fix the fields below, then run Apply AIMXS Settings again.",
            errors: validation.errors,
            warnings: validation.warnings
          };
          renderAimxsEditorFeedbackInline(aimxsEditorState);
          return;
        }

        aimxsOverride = validation.draft;
        persistAimxsOverride();
        const projectID = activeProjectScope(getSession());
        const selectedAgentProfileId = String(ui.settingsAgentProfile?.value || "")
          .trim()
          .toLowerCase();
        const nextChoices = resolveProjectChoices(projectID, selectedAgentProfileId);
        renderExecutionDefaults(ui, nextChoices);
        renderConfigSummary(nextChoices);
        refreshRunBuilderPreview(getSession());
        refreshTerminalPreview(getSession(), nextChoices);
        const mode = String(aimxsOverride.mode || "disabled").trim().toLowerCase();
        const message =
          mode === "https_external"
            ? "AIMXS HTTPS mode is active with external provider references."
            : mode === "in_stack_reserved"
              ? "AIMXS mode is set to in_stack_reserved placeholder; HTTPS external remains the active path in this build."
              : "AIMXS mode is disabled.";
        aimxsEditorState = {
          status: "applied",
          message,
          errors: [],
          warnings: validation.warnings
        };
        renderAimxsEditorFeedbackInline(aimxsEditorState);
        recordConfigChange({
          action: "settings.aimxs.apply",
          status: "applied",
          source: "local-ui",
          event: "settings.aimxs.apply",
          providerId: "aimxs-settings"
        });
        await refresh();
        return;
      }
      return;
    }
    const actionNode = target.closest("[data-settings-int-action]");
    const agentTestActionNode = target.closest("[data-settings-agent-test-action]");
    if (agentTestActionNode instanceof HTMLElement) {
      const action = String(agentTestActionNode.dataset.settingsAgentTestAction || "")
        .trim()
        .toLowerCase();
      if (action === "refresh-session") {
        const sessionId = String(
          agentInvokeState?.sessionView?.sessionId || agentInvokeState?.response?.sessionId || ""
        ).trim();
        if (!sessionId) {
          return;
        }
        agentInvokeState = {
          ...agentInvokeState,
          sessionView: {
            ...(agentInvokeState.sessionView || {}),
            sessionId,
            source: "refreshing",
            status: "loading",
            message: `Refreshing native session ${sessionId}...`
          }
        };
        await refresh();
        agentInvokeState = {
          ...agentInvokeState,
          sessionView: await hydrateAgentInvokeSessionView(sessionId)
        };
        await refresh();
        return;
      }
      if (action !== "invoke") {
        return;
      }

      const draft = readAgentInvokeInput() || normalizeAgentInvokeDraft(agentInvokeState);
      const validation = validateAgentInvokeDraft(draft, getRuntimeChoices());
      if (!validation.valid) {
        agentInvokeState = {
          ...agentInvokeState,
          ...draft,
          status: "invalid",
          message: validation.errors.join(" "),
          response: null,
          sessionView: null
        };
        await refresh();
        return;
      }

      const session = getSession();
      const tenantID = activeTenantScope(session);
      const projectID = activeProjectScope(session);
      if (!tenantID || !projectID) {
        agentInvokeState = {
          ...agentInvokeState,
          ...draft,
          status: "invalid",
          message: "Tenant and project scope are required before invoking a configured agent profile.",
          response: null,
          sessionView: null
        };
        await refresh();
        return;
      }

      agentInvokeState = {
        ...agentInvokeState,
        ...draft,
        status: "running",
        message: `Invoking ${draft.agentProfileId} through the runtime integration path...`,
        response: null,
        sessionView: null
      };
      await refresh();

      try {
        const result = await api.invokeIntegrationAgent({
          meta: {
            tenantId: tenantID,
            projectId: projectID,
            requestId: `req-agent-test-${Date.now()}`
          },
          agentProfileId: draft.agentProfileId,
          prompt: draft.prompt,
          systemPrompt: draft.systemPrompt,
          maxOutputTokens: draft.maxOutputTokens
        });
        const sessionView = result?.applied && result?.sessionId
          ? await hydrateAgentInvokeSessionView(result.sessionId)
          : null;
        agentInvokeState = {
          ...agentInvokeState,
          ...draft,
          status:
            result?.applied && result?.source !== "endpoint-unavailable"
              ? "success"
              : result?.source === "endpoint-unavailable"
                ? "error"
                : "warn",
          message:
            result?.applied && result?.source === "runtime-endpoint"
              ? `Invocation completed via ${String(result.route || "runtime").trim() || "runtime"} route.`
              : String(result?.warning || "").trim() || "Invocation did not complete.",
          response: result || null,
          sessionView
        };
      } catch (error) {
        agentInvokeState = {
          ...agentInvokeState,
          ...draft,
          status: "error",
          message: `Invocation failed: ${error.message}`,
          response: null,
          sessionView: null
        };
      }
      await refresh();
      return;
    }
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.settingsIntAction || "").trim().toLowerCase();
    if (!action) {
      return;
    }

    const projectID = activeProjectScope(getSession());
    const key = normalizeProjectScopeKey(projectID);
    const draft = readIntegrationEditorInput();
    if (!draft) {
      return;
    }
    setEditorDraftForProject(projectID, draft);

    if (action === "save") {
      const validation = validateIntegrationEditorDraft(draft, getRuntimeChoices());
      if (!validation.valid) {
        const invalidState = {
          status: "invalid",
          message: "Save Draft is blocked. Fix the fields below, then save the project draft again.",
          errors: validation.errors,
          warnings: validation.warnings,
          hasSavedOverride: Boolean(integrationOverrides[key]?.override),
          applied: Boolean(integrationOverrides[key]?.applied),
          savedAt: String(integrationOverrides[key]?.savedAt || "").trim(),
          appliedAt: String(integrationOverrides[key]?.appliedAt || "").trim()
        };
        setEditorStatusForProject(projectID, invalidState);
        renderSettingsEditorFeedbackInline(invalidState);
        return;
      }

      const now = new Date().toISOString();
      integrationOverrides[key] = {
        override: draft,
        applied: false,
        savedAt: now,
        appliedAt: String(integrationOverrides[key]?.appliedAt || "").trim()
      };
      persistIntegrationOverrides();
      const savedState = {
        status: "saved",
        message: "Draft saved for this project scope. Review warnings if present, then run Apply Saved when you are ready to activate it.",
        errors: [],
        warnings: validation.warnings,
        hasSavedOverride: true,
        applied: false,
        savedAt: now,
        appliedAt: String(integrationOverrides[key]?.appliedAt || "").trim()
      };
      setEditorStatusForProject(projectID, savedState);
      renderSettingsEditorFeedbackInline(savedState);
      recordConfigChange({
        action: "settings.integration.save_draft",
        status: "saved",
        source: "local-ui",
        event: "settings.integration.save_draft",
        providerId: "settings-editor"
      });
      return;
    }

    if (action === "apply") {
      const entry = integrationOverrides[key];
      const savedDraft = entry?.override || draft;
      const validation = validateIntegrationEditorDraft(savedDraft, getRuntimeChoices());
      if (!validation.valid) {
        const invalidState = {
          status: "invalid",
          message: "Apply Saved is blocked because the saved draft is invalid. Fix the values, save again, then retry Apply Saved.",
          errors: validation.errors,
          warnings: validation.warnings,
          hasSavedOverride: Boolean(entry?.override),
          applied: Boolean(entry?.applied),
          savedAt: String(entry?.savedAt || "").trim(),
          appliedAt: String(entry?.appliedAt || "").trim()
        };
        setEditorStatusForProject(projectID, invalidState);
        renderSettingsEditorFeedbackInline(invalidState);
        return;
      }

      const scope = resolveIntegrationScope(getSession(), projectID);
      const now = new Date().toISOString();
      let appliedMessage =
        "Saved draft applied to active runtime choices for this project scope. Open Diagnostics to verify endpoint state and traceability.";
      let appliedWarnings = [];
      let appliedAt = now;
      let savedAt = String(entry?.savedAt || now).trim();
      let source = "local-fallback";

      if (scope.tenantId && scope.projectId) {
        const runtimePayload = {
          meta: {
            tenantId: scope.tenantId,
            projectId: scope.projectId
          },
          settings: buildRuntimeIntegrationSettingsPayload(savedDraft)
        };
        const result = await api.upsertIntegrationSettings(runtimePayload);
        if (result?.applied && result?.source === "runtime-endpoint") {
          source = "runtime-endpoint";
          appliedAt = String(result?.updatedAt || now).trim() || now;
          savedAt = appliedAt;
          appliedMessage =
            "Saved draft applied via runtime endpoint and activated for this project scope. Open Diagnostics and Audit Events to verify the recorded change.";
          runtimeIntegrationSyncStateByProject[key] = "loaded";
        } else if (result?.source === "endpoint-unavailable") {
          appliedMessage =
            "Runtime integration settings endpoint is unavailable; applied local fallback for this project scope. Open Diagnostics, verify the integrationSettings endpoint row, then retry Apply Saved before relying on the change.";
          appliedWarnings = [
            "Runtime state may still differ from the local fallback until the integrationSettings endpoint returns to ready or available.",
            `Retry Apply Saved after Diagnostics is clean, then open Audit Events for ${String(scope.projectId || projectID || "project:any")} to confirm the recorded runtime trail.`
          ];
          runtimeIntegrationSyncStateByProject[key] = "endpoint-unavailable";
        }
      } else {
        appliedMessage =
          "Tenant/project scope is unavailable. Local fallback was updated only. Choose the intended project in the context bar, then save and apply again before relying on the change.";
        appliedWarnings = [
          "A runtime endpoint write cannot be verified until both tenant and project scope are present.",
          "After scope is restored, reopen Configuration, confirm the project scope chip, then rerun Save Draft and Apply Saved."
        ];
      }

      integrationOverrides[key] = {
        override: savedDraft,
        applied: true,
        source,
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        savedAt,
        appliedAt
      };
      persistIntegrationOverrides();
      const nextChoices = resolveProjectChoices(projectID, savedDraft.selectedAgentProfileId);
      renderExecutionDefaults(ui, nextChoices);
      renderConfigSummary(nextChoices);
      if (nextChoices?.integrations?.selectedAgentProfileId) {
        saveValue(AGENT_PREF_KEY, nextChoices.integrations.selectedAgentProfileId);
      }
      refreshRunBuilderPreview(getSession());
      refreshTerminalPreview(getSession(), nextChoices);
      setEditorDraftForProject(projectID, savedDraft);
      setEditorStatusForProject(projectID, {
        status: "applied",
        message: appliedMessage,
        errors: [],
        warnings: [...validation.warnings, ...appliedWarnings],
        hasSavedOverride: true,
        applied: true,
        savedAt: String(integrationOverrides[key].savedAt || "").trim(),
        appliedAt: String(integrationOverrides[key].appliedAt || "").trim()
      });
      recordConfigChange({
        action: "settings.integration.apply_saved",
        status: "applied",
        source,
        event: "settings.integration.apply_saved",
        providerId: "settings-editor"
      });
      await refresh();
      return;
    }

    if (action === "reset") {
      const scope = resolveIntegrationScope(getSession(), projectID);
      const confirmation = confirmResetProjectOverride(scope, projectID);
      if (!confirmation.confirmed) {
        const cancelledState = {
          status: "warn",
          message:
            confirmation.reason === "mismatch"
              ? "Reset override cancelled. Type RESET OVERRIDE to replace this project's saved values with baseline defaults."
              : "Reset override cancelled. Existing project-scoped values remain active.",
          errors: [],
          warnings: [
            `Current values remain active for ${String(scope?.tenantId || "tenant:unscoped")}/${String(scope?.projectId || projectID || "project:any")}.`
          ],
          hasSavedOverride: Boolean(integrationOverrides[key]?.override),
          applied: Boolean(integrationOverrides[key]?.applied),
          savedAt: String(integrationOverrides[key]?.savedAt || "").trim(),
          appliedAt: String(integrationOverrides[key]?.appliedAt || "").trim()
        };
        setEditorStatusForProject(projectID, cancelledState);
        renderSettingsEditorFeedbackInline(cancelledState);
        return;
      }
      const baselineProjectChoices = resolveChoicesForProject(baselineChoices, projectID, {});
      const baselineDraft = buildEditorDraftFromChoices(
        baselineProjectChoices,
        baselineProjectChoices?.integrations?.selectedAgentProfileId
      );
      const now = new Date().toISOString();
      let source = "local-fallback";
      let statusMessage =
        "Project override reset to baseline defaults in local fallback mode. Review the resulting values before editing again.";
      let resetWarnings = [];
      let syncedAt = now;

      if (scope.tenantId && scope.projectId) {
        const runtimePayload = {
          meta: {
            tenantId: scope.tenantId,
            projectId: scope.projectId
          },
          settings: buildRuntimeIntegrationSettingsPayload(baselineDraft)
        };
        const result = await api.upsertIntegrationSettings(runtimePayload);
        if (result?.applied && result?.source === "runtime-endpoint") {
          source = "runtime-endpoint";
          syncedAt = String(result?.updatedAt || now).trim() || now;
          statusMessage =
            "Project override reset to baseline defaults via runtime endpoint. Open Diagnostics and Audit Events to confirm the new baseline.";
          runtimeIntegrationSyncStateByProject[key] = "loaded";
        } else if (result?.source === "endpoint-unavailable") {
          runtimeIntegrationSyncStateByProject[key] = "endpoint-unavailable";
          statusMessage =
            "Runtime integration settings endpoint is unavailable; baseline defaults were applied locally only. Open Diagnostics, verify the integrationSettings endpoint row, then retry Reset Project Override before relying on this reset.";
          resetWarnings = [
            "Local baseline values can drift from runtime state until the integrationSettings endpoint is healthy again.",
            `After endpoint recovery, rerun Reset Project Override and inspect Audit Events for ${String(scope.projectId || projectID || "project:any")}.`
          ];
        }
      } else {
        statusMessage =
          "Tenant/project scope is unavailable. Baseline defaults were applied locally only. Re-establish scope from the context bar, then retry the reset before relying on it.";
        resetWarnings = [
          "Scope must be restored before a runtime-backed reset can be confirmed.",
          "After scope is restored, reopen Configuration, confirm project scope, rerun the reset, then verify Diagnostics and Audit Events."
        ];
      }

      integrationOverrides[key] = {
        override: baselineDraft,
        applied: true,
        source,
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        savedAt: syncedAt,
        appliedAt: syncedAt
      };
      persistIntegrationOverrides();
      clearEditorDraftForProject(projectID);
      setEditorStatusForProject(projectID, {
        status: "applied",
        message: statusMessage,
        errors: [],
        warnings: resetWarnings,
        hasSavedOverride: true,
        applied: true,
        savedAt: syncedAt,
        appliedAt: syncedAt
      });
      const nextChoices = resolveProjectChoices(projectID);
      renderExecutionDefaults(ui, nextChoices);
      renderConfigSummary(nextChoices);
      refreshRunBuilderPreview(getSession());
      refreshTerminalPreview(getSession(), nextChoices);
      recordConfigChange({
        action: "settings.integration.reset_override",
        status: "applied",
        source,
        event: "settings.integration.reset_override",
        providerId: "settings-editor"
      });
      await refresh();
    }
  });
  ui.settingsContent?.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    const settingsSubviewNode = event.target.closest("[data-settings-subtab]");
    if (!(settingsSubviewNode instanceof HTMLElement)) {
      return;
    }
    handleHorizontalTabKeydown(
      event,
      Array.from(ui.settingsContent?.querySelectorAll("[data-settings-subtab]") || []),
      (node) => String(node?.dataset?.settingsSubtab || "").trim().toLowerCase(),
      (requested) => {
        setSettingsSubview(requested, true);
        focusActiveSettingsSubview({ scroll: false });
      }
    );
  });
  async function submitTerminalFromCurrentInput(origin = "manual") {
    const { input, issues, payload } = refreshTerminalPreview(getSession(), getRuntimeChoices());
    const blocking = issues.filter((item) => item.severity === "error");
    if (blocking.length > 0) {
      const message = blocking.map((item) => item.message).join(" ");
      renderTerminalFeedback(ui, "error", message, {
        status: "POLICY_BLOCKED",
        provenanceTag: payload?.provenance?.commandTag || ""
      });
      pushTerminalHistory(
        buildTerminalHistoryEntry(
          input,
          payload,
          {
            status: "POLICY_BLOCKED",
            provenanceTag: payload?.provenance?.commandTag || ""
          },
          "error",
          `${origin}: ${message}`
        )
      );
      renderTriagePanel();
      return;
    }

    try {
      const result = await api.createTerminalSession(payload);
      if (result?.applied === false) {
        const warning = result.warning || "Terminal endpoint unavailable.";
        renderTerminalFeedback(ui, "warn", warning, result);
        pushTerminalHistory(
          buildTerminalHistoryEntry(input, payload, result, "warn", `${origin}: ${warning}`)
        );
        renderTriagePanel();
      } else {
        const okMessage = "Terminal command request was queued.";
        renderTerminalFeedback(ui, "ok", okMessage, result);
        pushTerminalHistory(
          buildTerminalHistoryEntry(input, payload, result, "ok", `${origin}: ${okMessage}`)
        );
        renderTriagePanel();
      }

      if (payload?.scope?.tenantId) {
        ui.auditTenantFilter.value = payload.scope.tenantId;
      }
      if (payload?.scope?.projectId) {
        ui.auditProjectFilter.value = payload.scope.projectId;
      }
      if (payload?.auditLink?.event) {
        ui.auditProviderFilter.value = payload.auditLink.providerId || "terminal-session";
      }
      if (ui.auditPage) {
        ui.auditPage.value = "1";
      }
      await refresh();
    } catch (error) {
      const message = error.message || "Terminal request failed.";
      renderTerminalFeedback(ui, "error", message, {
        status: "FAILED",
        provenanceTag: payload?.provenance?.commandTag || ""
      });
      pushTerminalHistory(
        buildTerminalHistoryEntry(
          input,
          payload,
          {
            status: "FAILED",
            warning: message,
            provenanceTag: payload?.provenance?.commandTag || ""
          },
          "error",
          `${origin}: ${message}`
        )
      );
      renderTriagePanel();
    }
  }

  ui.terminalForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitTerminalFromCurrentInput("manual");
  });
  ui.terminalHistory?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const historyId = String(target.dataset.terminalHistoryRerunId || "").trim();
    if (!historyId) {
      return;
    }
    const entry = store.getTerminalHistoryById(historyId);
    if (!entry || !entry.input) {
      return;
    }
    applyTerminalInput(ui, entry.input);
    await submitTerminalFromCurrentInput("rerun");
  });
  ui.approvalsContent.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const pageActionNode = target.closest("[data-approvals-page-action]");
    if (pageActionNode instanceof HTMLElement) {
      const action = String(pageActionNode.dataset.approvalsPageAction || "").trim().toLowerCase();
      const current = parsePositiveInt(ui.approvalsPage?.value, 1, 1, 999999);
      const next = action === "prev" ? Math.max(1, current - 1) : current + 1;
      if (ui.approvalsPage) {
        ui.approvalsPage.value = String(next);
      }
      await refresh();
      return;
    }
    const selectRunNode = target.closest("[data-approval-select-run-id]");
    const selectRunID =
      selectRunNode instanceof HTMLElement
        ? String(selectRunNode.dataset.approvalSelectRunId || "").trim()
        : "";
    if (selectRunID) {
      openApprovalDetail(selectRunID);
      await refresh();
      focusRenderedRegion(ui.approvalsDetailContent, { scroll: false });
      return;
    }
    const openRunNode = target.closest("[data-approval-open-run-id]");
    const openRunID =
      openRunNode instanceof HTMLElement
        ? String(openRunNode.dataset.approvalOpenRunId || "").trim()
        : "";
    if (openRunID) {
      await openRunDetail(openRunID, { fromApproval: true });
      return;
    }
  });
  ui.approvalsDetailContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const openRunNode = target.closest("[data-approval-open-run-id]");
    const openRunID =
      openRunNode instanceof HTMLElement
        ? String(openRunNode.dataset.approvalOpenRunId || "").trim()
        : "";
    if (openRunID) {
      await openRunDetail(openRunID, { fromApproval: true });
      return;
    }
    const decisionNode = target.closest("[data-approval-detail-run-id]");
    const runID =
      decisionNode instanceof HTMLElement
        ? String(decisionNode.dataset.approvalDetailRunId || "").trim()
        : "";
    const decision =
      decisionNode instanceof HTMLElement
        ? String(decisionNode.dataset.approvalDetailDecision || "").trim().toUpperCase()
        : "";
    if (!runID || !decision) {
      return;
    }
    const reasonInput = ui.approvalsDetailContent.querySelector("#approval-detail-reason");
    const reason =
      reasonInput instanceof HTMLInputElement ? String(reasonInput.value || "").trim() : "";
    if (!reason) {
      renderApprovalFeedback(ui, "warn", "Decision reason is required before approve/deny.");
      return;
    }

    const approvalScope = readApprovalFilters(ui);
    const approvalRecord = store.getApprovalByRunID(runID) || {};
    const decisionScope = formatScopeLabel(approvalRecord?.tenantId, approvalRecord?.projectId);
    const submittedAt = new Date().toISOString();
    try {
      const result = await api.submitApprovalDecision(runID, decision, {
        ttlSeconds: approvalScope.ttlSeconds,
        reason
      });
      if (result?.applied === false) {
        renderApprovalFeedback(
          ui,
          "warn",
          `${result.warning || "No approval endpoint available."} scope=${decisionScope}; source=approval-queue; submittedAt=${submittedAt}`
        );
      } else {
        renderApprovalFeedback(
          ui,
          "ok",
          `runId=${runID}; decision=${decision}; status=${result.status || "updated"}; scope=${decisionScope}; source=approval-queue; submittedAt=${submittedAt}`
        );
      }
      if (ui.approvalsDetailContent) {
        ui.approvalsDetailContent.dataset.selectedRunId = runID;
      }
      await refresh();
    } catch (error) {
      renderApprovalFeedback(ui, "error", error.message);
    }
  });
  ui.triageContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-triage-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.triageAction || "").trim();
    if (!action) {
      return;
    }

    if (action === "open-approvals-pending") {
      ui.approvalsStatusFilter.value = "PENDING";
      if (ui.approvalsSort) {
        ui.approvalsSort.value = "ttl_asc";
      }
      if (ui.approvalsPage) {
        ui.approvalsPage.value = "1";
      }
      await refresh();
      setWorkspaceView("approvals", true);
      ui.approvalsContent?.scrollIntoView({ behavior: "smooth", block: "start" });
      focusRenderedRegion(ui.approvalsContent, { scroll: false });
      return;
    }

    if (action === "open-runs-attention") {
      const runID = String(actionNode.dataset.triageRunId || "").trim();
      if (ui.runsSort) {
        ui.runsSort.value = "updated_desc";
      }
      if (ui.runsPage) {
        ui.runsPage.value = "1";
      }
      await refresh();
      setWorkspaceView("runs", true);
      if (runID) {
        await openRunDetail(runID);
      } else {
        ui.runsContent?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (action === "open-audit-deny") {
      ui.auditDecisionFilter.value = "DENY";
      if (ui.auditPage) {
        ui.auditPage.value = "1";
      }
      await refresh();
      setWorkspaceView("incidents", true);
      setIncidentSubview("audit", true);
      ui.auditContent?.scrollIntoView({ behavior: "smooth", block: "start" });
      focusRenderedRegion(ui.auditContent, { scroll: false });
      return;
    }

    if (action === "open-terminal-issues") {
      if (ui.terminalHistoryStatusFilter) {
        ui.terminalHistoryStatusFilter.value = "POLICY_BLOCKED";
      }
      renderTerminalHistoryPanel();
      setWorkspaceView("operations", true);
      ui.terminalHistory?.scrollIntoView({ behavior: "smooth", block: "start" });
      focusRenderedRegion(ui.terminalHistory, { scroll: false });
    }
  });

  ui.refreshButton.addEventListener("click", refresh);
  ui.runsApplyButton.addEventListener("click", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.runsSort?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.runsStatusFilter?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.runsDecisionFilter?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.runsRunIdFilter?.addEventListener("input", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.runsTimeRange?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    syncCustomTimeFilterControls("runs");
    refresh().catch(() => {});
  });
  ui.runsTimeFrom?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    promoteCustomTimeFilter("runs");
    refresh().catch(() => {});
  });
  ui.runsTimeTo?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    promoteCustomTimeFilter("runs");
    refresh().catch(() => {});
  });
  ui.runsPageSize?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.runsPage?.addEventListener("change", () => {
    refresh().catch(() => {});
  });
  ui.auditApplyButton.addEventListener("click", () => {
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.auditTimeRange?.addEventListener("change", () => {
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    syncCustomTimeFilterControls("audit");
    refresh().catch(() => {});
  });
  ui.auditTimeFrom?.addEventListener("change", () => {
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    promoteCustomTimeFilter("audit");
    refresh().catch(() => {});
  });
  ui.auditTimeTo?.addEventListener("change", () => {
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    promoteCustomTimeFilter("audit");
    refresh().catch(() => {});
  });
  ui.auditPageSize?.addEventListener("change", () => {
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.auditPage?.addEventListener("change", () => {
    refresh().catch(() => {});
  });
  ui.auditEventFilter?.addEventListener("change", () => {
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.auditExportJsonButton?.addEventListener("click", () => {
    const bundle = getCurrentAuditFilingBundle();
    if (!Array.isArray(bundle?.items) || bundle.items.length === 0) {
      renderAuditFilingFeedback("warn", "No audit rows match the current filters, so JSON export was skipped.");
      return;
    }
    const fileName = buildAuditExportFileName("json", bundle?.meta?.filters || {}, bundle?.meta?.generatedAt);
    const prepared = exportGovernedJson(bundle, fileName, buildDesktopGovernedExportOptions("audit_export", "downstream_review", "export"));
    if (ui.auditHandoffPreview instanceof HTMLElement) {
      ui.auditHandoffPreview.textContent = prepareGovernedTextExport(
        buildAuditHandoffText(bundle),
        buildDesktopGovernedExportOptions("audit_export", "downstream_review", "handoff")
      ).text;
    }
    renderAuditFilingFeedback(
      "ok",
      `Audit JSON exported to ${fileName}. rows=${bundle.items.length}. Review the handoff preview before sharing downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "audit export")} ${buildAuditTraceabilitySummary(bundle, fileName)}`
    );
  });
  ui.auditExportCsvButton?.addEventListener("click", () => {
    const bundle = getCurrentAuditFilingBundle();
    if (!Array.isArray(bundle?.items) || bundle.items.length === 0) {
      renderAuditFilingFeedback("warn", "No audit rows match the current filters, so CSV export was skipped.");
      return;
    }
    const fileName = buildAuditExportFileName("csv", bundle?.meta?.filters || {}, bundle?.meta?.generatedAt);
    const csv = buildAuditCsv(bundle.items);
    const prepared = downloadGovernedText(
      csv,
      fileName,
      "text/csv;charset=utf-8",
      buildDesktopGovernedExportOptions("audit_export", "downstream_review", "export")
    );
    renderAuditFilingFeedback(
      "ok",
      `Audit CSV exported to ${fileName}. rows=${bundle.items.length}. Review scope and time window before sharing downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "audit export")} ${buildAuditTraceabilitySummary(bundle, fileName)}`
    );
  });
  ui.auditCopyHandoffButton?.addEventListener("click", async () => {
    const bundle = getCurrentAuditFilingBundle();
    if (!Array.isArray(bundle?.items) || bundle.items.length === 0) {
      renderAuditFilingFeedback("warn", "No audit rows match the current filters, so handoff copy was skipped.");
      return;
    }
    const handoffText = buildAuditHandoffText(bundle);
    try {
      const prepared = await copyGovernedText(
        handoffText,
        buildDesktopGovernedExportOptions("audit_handoff", "downstream_review", "handoff")
      );
      if (ui.auditHandoffPreview instanceof HTMLElement) {
        ui.auditHandoffPreview.textContent = prepared.text;
      }
      renderAuditFilingFeedback(
        "ok",
        `Copied handoff summary for ${bundle.items.length} audit rows to clipboard. Review the preview pane before sending it downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "audit handoff")} ${buildAuditTraceabilitySummary(bundle)}`
      );
    } catch (error) {
      renderAuditFilingFeedback("error", `Audit handoff copy failed: ${error.message}`);
    }
  });
  ui.auditExportIncidentButton?.addEventListener("click", () => {
    const incidentPkg = getCurrentIncidentPackage();
    const runId = String(incidentPkg?.run?.runId || "").trim();
    if (!runId) {
      renderAuditFilingFeedback("warn", "Select a run detail first, then export the incident package from Audit Events.");
      return;
    }

    const handoffText = buildIncidentPackageHandoffText(incidentPkg);
    incidentPkg.handoff = {
      text: handoffText
    };
    const fileName = buildIncidentPackageFileName(
      runId,
      incidentPkg?.audit?.meta?.filters || {},
      incidentPkg?.meta?.generatedAt
    );
    const prepared = exportGovernedJson(
      incidentPkg,
      fileName,
      buildDesktopGovernedExportOptions("incident_export", "incident_response", "export")
    );
    pushIncidentHistory(buildIncidentHistoryEntry(incidentPkg, fileName));
    if (ui.auditHandoffPreview instanceof HTMLElement) {
      ui.auditHandoffPreview.textContent = prepareGovernedTextExport(
        handoffText,
        buildDesktopGovernedExportOptions("incident_export", "incident_response", "handoff")
      ).text;
    }
    const auditCount = Number(incidentPkg?.audit?.meta?.matchedCount || 0);
    const approvalStatus = String(incidentPkg?.approval?.status || "UNAVAILABLE").trim().toUpperCase();
    renderAuditFilingFeedback(
      "ok",
      `Incident package exported to ${fileName}. runId=${runId}; approval=${approvalStatus}; auditRows=${auditCount}. Review the handoff preview and queue status before downstream handoff.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident export")} ${buildIncidentTraceabilitySummary(incidentPkg, fileName)}`
    );
  });
  ui.auditContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const pageActionNode = target.closest("[data-audit-page-action]");
    if (!(pageActionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(pageActionNode.dataset.auditPageAction || "").trim().toLowerCase();
    const current = parsePositiveInt(ui.auditPage?.value, 1, 1, 999999);
    const next = action === "prev" ? Math.max(1, current - 1) : current + 1;
    if (ui.auditPage) {
      ui.auditPage.value = String(next);
    }
    await refresh();
  });
  ui.incidentHistoryStatusFilter?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
    renderIncidentHistoryPanel();
  });
  ui.incidentHistorySort?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
    renderIncidentHistoryPanel();
  });
  ui.incidentHistoryTimeRange?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
    syncCustomTimeFilterControls("incidents");
    renderIncidentHistoryPanel();
  });
  ui.incidentHistoryTimeFrom?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
    promoteCustomTimeFilter("incidents");
    renderIncidentHistoryPanel();
  });
  ui.incidentHistoryTimeTo?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
    promoteCustomTimeFilter("incidents");
    renderIncidentHistoryPanel();
  });
  ui.incidentHistoryPageSize?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
    renderIncidentHistoryPanel();
  });
  ui.incidentHistoryPage?.addEventListener("change", () => {
    renderIncidentHistoryPanel();
  });
  ui.incidentHistorySearchInput?.addEventListener("input", () => {
    incidentHistoryViewState.page = 1;
    renderIncidentHistoryPanel();
  });
  ui.incidentHistorySearchInput?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
    renderIncidentHistoryPanel();
  });
  ui.incidentHistorySearchClearButton?.addEventListener("click", () => {
    if (ui.incidentHistorySearchInput) {
      ui.incidentHistorySearchInput.value = "";
    }
    incidentHistoryViewState.page = 1;
    renderIncidentHistoryPanel();
  });
  ui.incidentHistoryQuickAllButton?.addEventListener("click", () => {
    setIncidentHistoryQuickView("", "newest");
  });
  ui.incidentHistoryQuickFiledButton?.addEventListener("click", () => {
    setIncidentHistoryQuickView("filed", "newest");
  });
  ui.incidentHistoryQuickNeedsClosureButton?.addEventListener("click", () => {
    setIncidentHistoryQuickView("filed", "oldest");
  });
  ui.incidentHistoryBulkFiledButton?.addEventListener("click", () => {
    applyBulkIncidentStatusTransition("filed");
  });
  ui.incidentHistoryBulkClosedButton?.addEventListener("click", () => {
    applyBulkIncidentStatusTransition("closed");
  });
  ui.incidentHistoryExportSelectedButton?.addEventListener("click", () => {
    const selectedEntries = getSelectedIncidentEntries();
    if (selectedEntries.length === 0) {
      renderAuditFilingFeedback("warn", "Select one or more incident rows before exporting a bundle. This action exports selected incident JSON only.");
      return;
    }
    const session = getSession();
    const actor = String(
      session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || ""
    ).trim();
    const view = readIncidentHistoryViewFromUI();
    const bundle = buildSelectedIncidentExportBundle(selectedEntries, view, actor);
    const fileName = buildIncidentSelectionFileName(selectedEntries.length, bundle?.meta?.generatedAt);
    const prepared = exportGovernedJson(
      bundle,
      fileName,
      buildDesktopGovernedExportOptions("incident_export", "incident_response", "export")
    );
    renderAuditFilingFeedback(
      "ok",
      `Selected incident bundle exported to ${fileName}. rows=${selectedEntries.length}; source=${bundle?.meta?.source || "-"}; generatedAt=${bundle?.meta?.generatedAt || "-"}; scopes=${(bundle?.meta?.scopeSummary || []).join(",") || "-"}. Review scope coverage before sharing downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident export")}`
    );
  });
  ui.incidentHistoryClearSelectionButton?.addEventListener("click", () => {
    clearIncidentHistorySelection();
    renderAuditFilingFeedback("info", "Incident selection cleared. Choose queue rows again before running bulk actions or selected export.");
  });
  ui.incidentHistoryCopyLatestButton?.addEventListener("click", async () => {
    const [latest] = store.getIncidentPackageHistory();
    if (!latest) {
      renderAuditFilingFeedback("warn", "Incident queue is empty, so there is no incident handoff summary to copy.");
      return;
    }
    const handoffText = String(latest?.handoffText || "").trim();
    if (!handoffText) {
      renderAuditFilingFeedback("warn", "Latest incident package does not have a handoff summary yet.");
      return;
    }
    try {
      const prepared = await copyGovernedText(
        handoffText,
        buildDesktopGovernedExportOptions("incident_handoff", "incident_response", "handoff")
      );
      if (ui.auditHandoffPreview instanceof HTMLElement) {
        ui.auditHandoffPreview.textContent = prepared.text;
      }
      renderAuditFilingFeedback(
        "ok",
        `Latest incident handoff summary copied for ${latest.packageId || latest.id}. Review the preview pane before sending it downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident handoff")} ${buildIncidentEntryTraceabilitySummary(latest)}`
      );
    } catch (error) {
      renderAuditFilingFeedback("error", `Incident handoff summary copy failed: ${error.message}`);
    }
  });
  ui.incidentHistoryClearButton?.addEventListener("click", () => {
    const totalCount = store.getIncidentPackageHistory().length;
    const confirmation = confirmIncidentQueueClear(totalCount, incidentHistorySelection.size);
    if (!confirmation.confirmed) {
      renderAuditFilingFeedback(
        "warn",
        confirmation.reason === "mismatch"
          ? "Incident queue clear cancelled. Type CLEAR QUEUE to confirm destructive queue removal."
          : "Incident queue clear cancelled. Queue contents were preserved."
      );
      return;
    }
    clearIncidentHistoryQueue();
    renderAuditFilingFeedback("warn", "Incident queue cleared after operator confirmation. Export a new incident package if downstream tracking must continue.");
  });
  ui.incidentHistoryContent?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const selectId = String(target.dataset.incidentHistorySelectId || "").trim();
    if (!selectId) {
      return;
    }
    if (target.checked) {
      incidentHistorySelection.add(selectId);
    } else {
      incidentHistorySelection.delete(selectId);
    }
    const view = readIncidentHistoryViewFromUI();
    const allItems = store.getIncidentPackageHistory();
    const visible = getIncidentHistoryFilteredSortedItems(allItems, view);
    const pageState = paginateItems(visible, view?.pageSize, view?.page);
    renderIncidentHistorySummary(allItems.length, visible.length, incidentHistorySelection.size, {
      ...view,
      page: pageState.page,
      pageSize: pageState.pageSize,
      totalPages: pageState.totalPages
    }, allItems, visible);
  });
  ui.incidentHistoryContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const pageActionNode = target.closest("[data-incident-history-page-action]");
    if (pageActionNode instanceof HTMLElement) {
      const action = String(pageActionNode.dataset.incidentHistoryPageAction || "").trim().toLowerCase();
      const current = parsePositiveInt(ui.incidentHistoryPage?.value, 1, 1, 999999);
      incidentHistoryViewState.page = action === "prev" ? Math.max(1, current - 1) : current + 1;
      renderIncidentHistoryPanel();
      return;
    }
    const transitionId = String(target.dataset.incidentHistoryTransitionId || "").trim();
    const nextStatus = normalizeIncidentFilingStatus(
      String(target.dataset.incidentHistoryNextStatus || "").trim()
    );
    if (transitionId) {
      const entry = store.getIncidentPackageHistoryById(transitionId);
      if (!entry) {
        renderAuditFilingFeedback("warn", "Incident queue entry not found.");
        return;
      }
      const currentStatus = normalizeIncidentFilingStatus(entry.filingStatus);
      if (!canTransitionIncidentStatus(currentStatus, nextStatus)) {
        renderAuditFilingFeedback(
          "warn",
          `Status change blocked for ${entry.packageId || entry.id}: ${currentStatus} -> ${nextStatus}. Follow the row guidance before retrying.`
        );
        return;
      }
      const updatedAt = new Date().toISOString();
      store.updateIncidentPackageHistoryEntry(transitionId, {
        filingStatus: nextStatus,
        filingUpdatedAt: updatedAt
      });
      persistIncidentHistory();
      renderIncidentHistoryPanel();
      renderAuditFilingFeedback(
        "ok",
        `Incident queue status updated for ${entry.packageId || entry.id}: ${currentStatus} -> ${nextStatus}. Review the row guidance before leaving the queue.`
      );
      return;
    }
    const downloadId = String(target.dataset.incidentHistoryDownloadId || "").trim();
    if (downloadId) {
      const entry = store.getIncidentPackageHistoryById(downloadId);
      if (!entry?.payload) {
        return;
      }
      const fallbackRunId = String(entry?.runId || "").trim();
      const fallbackFileName = String(entry?.fileName || "").trim();
      const fileName = fallbackFileName || buildIncidentPackageFileName(fallbackRunId, {}, new Date().toISOString());
      const prepared = exportGovernedJson(
        entry.payload,
        fileName,
        buildDesktopGovernedExportOptions("incident_export", "incident_response", "export")
      );
      renderAuditFilingFeedback("ok", `Incident package JSON downloaded to ${fileName}. Review package metadata before external handoff.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident export")} ${buildIncidentEntryTraceabilitySummary(entry)}`);
      return;
    }
    const copyId = String(target.dataset.incidentHistoryCopyId || "").trim();
    if (copyId) {
      const entry = store.getIncidentPackageHistoryById(copyId);
      const handoffText = String(entry?.handoffText || "").trim();
      if (!handoffText) {
        renderAuditFilingFeedback("warn", "Selected incident entry does not have a handoff summary yet.");
        return;
      }
      try {
        const prepared = await copyGovernedText(
          handoffText,
          buildDesktopGovernedExportOptions("incident_handoff", "incident_response", "handoff")
        );
        if (ui.auditHandoffPreview instanceof HTMLElement) {
          ui.auditHandoffPreview.textContent = prepared.text;
        }
        renderAuditFilingFeedback(
          "ok",
          `Incident handoff summary copied for ${entry.packageId || entry.id}. Review the preview pane before sending it downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident handoff")} ${buildIncidentEntryTraceabilitySummary(entry)}`
        );
      } catch (error) {
        renderAuditFilingFeedback("error", `Incident handoff summary copy failed: ${error.message}`);
      }
      return;
    }
    const openRunId = String(target.dataset.incidentHistoryOpenRunId || "").trim();
    if (openRunId) {
      await openRunDetail(openRunId);
    }
  });
  window.addEventListener("storage", (event) => {
    if (!event) {
      return;
    }
    if (event.key === INCIDENT_HISTORY_KEY) {
      syncIncidentHistoryFromStorage(String(event.newValue || ""), "another-tab");
      return;
    }
    if (event.key === LIST_FILTER_STATE_KEY) {
      const nextFilters = readSavedJSON(LIST_FILTER_STATE_KEY);
      if (nextFilters && Object.keys(nextFilters).length > 0) {
        applyListFilterState(nextFilters);
      }
      refresh().catch(() => {});
      return;
    }
    if (event.key === SETTINGS_SUBVIEW_PREF_KEY) {
      settingsSubviewState = normalizeSettingsSubview(String(event.newValue || ""));
      setSettingsSubview(settingsSubviewState);
      return;
    }
    if (event.key === ADVANCED_SECTION_STATE_KEY) {
      let parsed = {};
      try {
        parsed = JSON.parse(String(event.newValue || "{}"));
      } catch (_) {
        parsed = {};
      }
      advancedSectionState = normalizeAdvancedSectionState(parsed);
      applyAdvancedState();
      return;
    }
    if (event.key === DETAILS_OPEN_STATE_KEY) {
      let parsed = {};
      try {
        parsed = JSON.parse(String(event.newValue || "{}"));
      } catch (_) {
        parsed = {};
      }
      detailsOpenState = normalizeDetailsOpenState(parsed);
      applyDetailsOpenState();
      return;
    }
    if (event.key === AIMXS_OVERRIDE_KEY) {
      aimxsOverride = normalizeAimxsOverride(
        readSavedJSON(AIMXS_OVERRIDE_KEY),
        baselineChoices?.aimxs || {}
      );
      aimxsEditorState = {
        status: "clean",
        message:
          aimxsOverride.mode === "https_external"
            ? "AIMXS settings synced from another tab; HTTPS mode is active."
            : aimxsOverride.paymentEntitled
              ? "AIMXS settings synced from another tab."
              : "Entitlement is locked; AIMXS HTTPS mode remains disabled."
      };
      refresh().catch(() => {});
      return;
    }
    if (event.key === CONFIG_CHANGE_HISTORY_KEY) {
      configChangeHistory = parseConfigChangeHistoryStoragePayload(String(event.newValue || ""));
      refresh().catch(() => {});
      return;
    }
  });

  ui.runsContent.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const pageActionNode = target.closest("[data-runs-page-action]");
    if (pageActionNode instanceof HTMLElement) {
      const action = String(pageActionNode.dataset.runsPageAction || "").trim().toLowerCase();
      const current = parsePositiveInt(ui.runsPage?.value, 1, 1, 999999);
      const next = action === "prev" ? Math.max(1, current - 1) : current + 1;
      if (ui.runsPage) {
        ui.runsPage.value = String(next);
      }
      await refresh();
      return;
    }
    const runNode = target.closest("[data-run-id]");
    if (!(runNode instanceof HTMLElement)) {
      return;
    }
    const runID = String(runNode.dataset.runId || "").trim();
    if (!runID) {
      return;
    }
    const selectedRunID = String(ui.runDetailContent?.dataset?.selectedRunId || "").trim();
    if (selectedRunID && selectedRunID === runID) {
      latestRunDetail = null;
      latestRunDetailSource = "unknown";
      delete ui.runDetailContent.dataset.selectedRunId;
      ui.runDetailContent.innerHTML = renderPanelStateMetric(
        "info",
        "Run Detail",
        "Select a run to view detail."
      );
      await refresh();
      return;
    }
    await openRunDetail(runID);
  });
  ui.runDetailContent.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const openApprovalRunID = String(target.dataset.openApprovalRunId || "").trim();
    if (!openApprovalRunID) {
      return;
    }

    const approval = store.getApprovalByRunID(openApprovalRunID);
    const run = store.getRunById(openApprovalRunID);
    if (approval?.tenantId) {
      ui.approvalsTenantFilter.value = String(approval.tenantId).trim();
    } else if (run?.tenantId) {
      ui.approvalsTenantFilter.value = String(run.tenantId).trim();
    }
    if (approval?.projectId) {
      ui.approvalsProjectFilter.value = String(approval.projectId).trim();
    } else if (run?.projectId) {
      ui.approvalsProjectFilter.value = String(run.projectId).trim();
    }
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }

    await refresh();
    setWorkspaceView("approvals", true);
    openApprovalDetail(openApprovalRunID);
  });

  const stopRefreshLoop = startRealtimeRefreshLoop(getRuntimeChoices(), refresh);
  window.addEventListener("beforeunload", stopRefreshLoop, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refresh().catch(() => {});
    }
  });

  await refresh();
  window.__m14MainReady = true;
}

main().catch((error) => {
  renderError(ui, `Bootstrap failed: ${error.message}`);
});
