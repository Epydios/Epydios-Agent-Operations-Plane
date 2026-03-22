import { loadConfig } from "./config.js";
import { bootstrapAuth, beginLogin, logout, getSession } from "./oidc.js";
import { AgentOpsApi } from "./api.js";
import { createAppStore } from "./state/store.js";
import { resolveRuntimeChoices } from "./runtime/choices.js";
import {
  AIMXS_OVERRIDE_KEY,
  applyAimxsOverrideToChoices,
  buildDefaultAimxsActivationSnapshot,
  describeAimxsAppliedMessage,
  describeAimxsEntitlementMessage,
  describeAimxsSyncedMessage,
  normalizeAimxsActivationSnapshot,
  normalizeAimxsOverride,
  validateAimxsOverride
} from "./aimxs/state.js";
import {
  readAimxsEditorInput as readAimxsEditorDraft,
  renderAimxsEditorFeedback
} from "./aimxs/editor.js";
import {
  createWorkspaceLayoutController,
  normalizeWorkspaceView as normalizeShellWorkspaceView
} from "./shell/layout/workspace.js";
import { createWorkspaceNavController } from "./shell/nav/workspace-nav.js";
import { initializeShellLiveRegions } from "./shell/alerts/live-regions.js";
import { createTopbarController } from "./shell/topbar/topbar.js";
import { renderNativeLauncherStatus } from "./shell/topbar/native-launcher-status.js";
import { createRefreshStatusController } from "./shell/topbar/refresh-status.js";
import { initializePanelRegions } from "./shared/components/panel-region.js";
import { copyTextToClipboard, triggerTextDownload } from "./shared/exports/text.js";
import { handleHorizontalTabKeydown } from "./shared/forms/tablist.js";
import {
  activeElementWithin,
  focusElement,
  setSubtreeInert
} from "./shared/utils/dom.js";
import {
  readSavedJSON,
  readSavedValue,
  saveJSON,
  saveValue
} from "./shared/utils/storage.js";
import {
  renderHomeOpsEmptyState,
  renderHomeOpsPage
} from "./domains/homeops/routes.js";
import { createEmptyHomeSnapshot } from "./domains/homeops/state.js";
import {
  mountAgentOpsEmbeddedPanels,
  renderAgentOpsEmptyState,
  renderAgentOpsPage
} from "./domains/agentops/routes.js";
import {
  renderGovernanceOpsEmptyState,
  renderGovernanceOpsPage
} from "./domains/governanceops/routes.js";
import {
  renderGuardrailOpsEmptyState,
  renderGuardrailOpsPage
} from "./domains/guardrailops/routes.js";
import {
  renderAuditOpsEmptyState,
  renderAuditOpsPage
} from "./domains/auditops/routes.js";
import {
  renderEvidenceOpsEmptyState,
  renderEvidenceOpsPage
} from "./domains/evidenceops/routes.js";
import { createEvidenceWorkspaceSnapshot } from "./domains/evidenceops/state.js";
import {
  renderComplianceOpsEmptyState,
  renderComplianceOpsPage
} from "./domains/complianceops/routes.js";
import { createComplianceWorkspaceSnapshot } from "./domains/complianceops/state.js";
import {
  renderIncidentOpsEmptyState,
  renderIncidentOpsPage
} from "./domains/incidentops/routes.js";
import { createIncidentOpsWorkspaceSnapshot } from "./domains/incidentops/state.js";
import {
  renderLogOpsEmptyState,
  renderLogOpsPage
} from "./domains/logops/routes.js";
import { buildTimestampToken } from "./domains/incidentops/tokens.js";
import {
  renderNetworkOpsEmptyState,
  renderNetworkOpsPage
} from "./domains/networkops/routes.js";
import { createNetworkWorkspaceSnapshot } from "./domains/networkops/state.js";
import {
  renderIdentityOpsEmptyState,
  renderIdentityOpsPage,
  setIdentityAuthDisplay as setAuthDisplay
} from "./domains/identityops/routes.js";
import {
  renderPlatformOpsEmptyState,
  renderPlatformOpsPage
} from "./domains/platformops/routes.js";
import {
  renderPolicyOpsEmptyState,
  renderPolicyOpsPage
} from "./domains/policyops/routes.js";
import { createPolicyWorkspaceSnapshot } from "./domains/policyops/state.js";
import {
  renderDeveloperOpsEmptyState,
  renderDeveloperOpsPage
} from "./domains/developerops/routes.js";
import {
  readRuntimeRunFilters as readRunFilters,
  renderRuntimeOpsEmptyState,
  renderRuntimeOpsPage,
  renderRuntimeRunDetail as renderRunDetail,
  renderRuntimeRunDetailError,
  renderRuntimeRuns as renderRuns
} from "./domains/runtimeops/routes.js";
import { createRuntimeWorkspaceSnapshot } from "./domains/runtimeops/state.js";
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
  ensureGovernedActionDefaults,
  readGovernedActionInput,
  evaluateGovernedActionIssues,
  buildGovernedActionRunPayload,
  renderGovernedActionPayload,
  renderGovernedActionPolicyHints,
  renderGovernedActionFeedback
} from "./views/governed-action.js";
import {
  DEMO_GOVERNANCE_STATE_KEY,
  buildDemoGovernanceContext,
  normalizeDemoGovernanceOverlay,
  validateDemoGovernanceOverlay
} from "./runtime/demo-governance.js";
import {
  readApprovalFilters,
  renderApprovals,
  renderApprovalsDetail,
  renderApprovalReviewModal,
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
import { renderSettingsOpsEmptyState, renderSettingsOpsPage } from "./domains/settingsops/routes.js";
import { buildChatTurnGovernanceReport, resolveChatGovernedExportSelection } from "./views/chat.js";
import { createAimxsDecisionBindingSpine } from "./shared/aimxs/decision-binding.js";
import {
  closeManagedCodexWorkerSession,
  createOperatorChatThread,
  deriveOperatorChatThreadState,
  emitManagedCodexWorkerHeartbeat,
  followOperatorChatThread,
  invokeOperatorChatTurn,
  launchManagedCodexWorker,
  listNativeToolProposals,
  loadNativeSessionView,
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
  nativeLauncherStatus: document.getElementById("native-launcher-status"),
  companionHandoffBanner: document.getElementById("companion-handoff-banner"),
  workspaceLayout: document.getElementById("workspace-layout"),
  chatContent: document.getElementById("chat-content"),
  identityContent: document.getElementById("identity-content"),
  governanceOpsContent: document.getElementById("governanceops-content"),
  guardrailOpsContent: document.getElementById("guardrailops-content"),
  auditOpsContent: document.getElementById("auditops-content"),
  evidenceOpsContent: document.getElementById("evidenceops-content"),
  complianceOpsContent: document.getElementById("complianceops-content"),
  incidentOpsContent: document.getElementById("incidentops-content"),
  logOpsContent: document.getElementById("logops-content"),
  networkOpsContent: document.getElementById("networkops-content"),
  runtimeOpsContent: document.getElementById("runtimeops-content"),
  platformOpsContent: document.getElementById("platformops-content"),
  policyOpsContent: document.getElementById("policyops-content"),
  homeOpsContent: document.getElementById("homeops-content"),
  developerOpsContent: document.getElementById("developerops-content"),
  settingsContent: document.getElementById("settings-content"),
  settingsOpenAuditEventsButton: document.getElementById("settings-open-audit-events-button"),
  settingsThemeMode: document.getElementById("settings-theme-mode"),
  settingsAgentProfile: document.getElementById("settings-agent-profile"),
  contextProjectSelect: document.getElementById("context-project-select"),
  contextAgentProfile: document.getElementById("context-agent-profile"),
  contextEndpointBadges: document.getElementById("context-endpoint-badges"),
  approvalsFeedback: document.getElementById("approvals-feedback"),
  approvalsContent: document.getElementById("approvals-content"),
  approvalsDetailContent: document.getElementById("approvals-detail-content"),
  approvalReviewModal: document.getElementById("approval-review-modal"),
  approvalReviewModalContent: document.getElementById("approval-review-modal-content"),
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
  governedActionForm: document.getElementById("governed-action-form"),
  governedActionPolicyHints: document.getElementById("governed-action-policy-hints"),
  governedActionFeedback: document.getElementById("governed-action-feedback"),
  governedActionPayload: document.getElementById("governed-action-payload"),
  gaRequestId: document.getElementById("ga-request-id"),
  gaTenantId: document.getElementById("ga-tenant-id"),
  gaProjectId: document.getElementById("ga-project-id"),
  gaEnvironment: document.getElementById("ga-environment"),
  gaDemoProfile: document.getElementById("ga-demo-profile"),
  gaRequestLabel: document.getElementById("ga-request-label"),
  gaRequestSummary: document.getElementById("ga-request-summary"),
  gaFinanceSymbol: document.getElementById("ga-finance-symbol"),
  gaFinanceSide: document.getElementById("ga-finance-side"),
  gaFinanceQuantity: document.getElementById("ga-finance-quantity"),
  gaFinanceAccount: document.getElementById("ga-finance-account"),
  gaRequiredGrants: document.getElementById("ga-required-grants"),
  gaEvidenceReadiness: document.getElementById("ga-evidence-readiness"),
  gaRiskTier: document.getElementById("ga-risk-tier"),
  gaBoundaryClass: document.getElementById("ga-boundary-class"),
  gaSubjectId: document.getElementById("ga-subject-id"),
  gaActionType: document.getElementById("ga-action-type"),
  gaActionVerb: document.getElementById("ga-action-verb"),
  gaActionTarget: document.getElementById("ga-action-target"),
  gaResourceKind: document.getElementById("ga-resource-kind"),
  gaResourceNamespace: document.getElementById("ga-resource-namespace"),
  gaResourceName: document.getElementById("ga-resource-name"),
  gaResourceId: document.getElementById("ga-resource-id"),
  gaHandshakeRequired: document.getElementById("ga-handshake-required"),
  gaApprovedForProd: document.getElementById("ga-approved-for-prod"),
  gaDryRun: document.getElementById("ga-dry-run"),
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
  loginButton: document.getElementById("login-button"),
  logoutButton: document.getElementById("logout-button"),
  refreshButton: document.getElementById("refresh-button")
};

let runtimeApiClient = null;
let companionOpsViewState = {
  lastWorkbenchDomain: "agentops",
  handoffContext: null,
  feedback: null
};
let logOpsViewState = {
  feedback: null
};
let renderCompanionHandoffBanner = () => {};

function requireRuntimeApiClient() {
  if (!runtimeApiClient) {
    throw new Error("Runtime API client is not initialized yet.");
  }
  return runtimeApiClient;
}

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
const INTEGRATION_OVERRIDES_KEY = "epydios.agentops.desktop.integrations.project_overrides.v1";
const INCIDENT_HISTORY_KEY = "epydios.agentops.desktop.incident.history.v1";
const CONFIG_CHANGE_HISTORY_KEY = "epydios.agentops.desktop.settings.change.history.v1";
const OPERATOR_CHAT_ARCHIVE_KEY = "epydios.agentops.desktop.chat.archive.v1";
const DEMO_GOVERNANCE_EDITOR_KEY = DEMO_GOVERNANCE_STATE_KEY;
const APPROVAL_SELECTION_NONE = "__approval_selection_none__";
const PROJECT_ANY_SCOPE_KEY = "__project_any__";
const WORKSPACE_VIEW_IDS = new Set([
  "companionops",
  "agentops",
  "runtimeops",
  "platformops",
  "identityops",
  "networkops",
  "policyops",
  "guardrailops",
  "governanceops",
  "complianceops",
  "auditops",
  "evidenceops",
  "incidentops",
  "logops",
  "settingsops",
  "developerops"
]);
const WORKSPACE_VIEW_ID_LIST = Array.from(WORKSPACE_VIEW_IDS);
const INCIDENT_SUBVIEW_IDS = new Set(["queue", "audit"]);
const SETTINGS_SUBVIEW_IDS = new Set(["configuration", "diagnostics"]);
const ADVANCED_SECTION_IDS = new Set(["operations", "runs", "approvals", "incidents"]);
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
const workspaceTabNodes = Array.from(document.querySelectorAll("[data-workspace-tab]"));
const workspaceShell = createWorkspaceLayoutController({
  layout: ui.workspaceLayout,
  viewIds: WORKSPACE_VIEW_ID_LIST
});
const topbarShell = createTopbarController({
  titleElement: document.querySelector("[data-shell-brand-title]"),
  subtitleElement: document.querySelector("[data-shell-brand-subtitle]")
});
const refreshStatusShell = createRefreshStatusController(
  document.querySelector("[data-shell-refresh-status]")
);
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
let aimxsActivationSnapshot = buildDefaultAimxsActivationSnapshot();
let localSecureRefSnapshot = {
  available: false,
  platform: "unknown",
  service: "",
  indexPath: "",
  exportPath: "",
  storedCount: 0,
  entries: [],
  lastExportedAt: "",
  message: "Local secure credential capture is unavailable until the local Mac launcher exposes the helper path."
};
let localSecureRefEditorState = {
  selectedRef: "",
  customRef: "",
  secretValue: "",
  status: "clean",
  message: ""
};
let demoGovernanceOverlay = normalizeDemoGovernanceOverlay();
let demoGovernanceEditorState = {
  overlay: normalizeDemoGovernanceOverlay(),
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
  executionMode: "managed_codex_worker",
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
let latestDeveloperOpsContext = {
  session: null,
  settings: null,
  health: {},
  providers: {},
  runs: {},
  projectScope: "",
  selectedAgentProfileId: ""
};
let latestDeveloperOpsPreviews = {
  governedAction: { input: {}, issues: [], payload: {} },
  runBuilder: { input: {}, issues: [], payload: {} },
  terminal: { input: {}, issues: [], payload: {} }
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

function readPinnedApprovalSelectionId() {
  const value = String(ui.approvalsDetailContent?.dataset?.selectedRunId || "").trim();
  return value === APPROVAL_SELECTION_NONE ? "" : value;
}

function isApprovalSelectionDismissed() {
  return String(ui.approvalsDetailContent?.dataset?.selectedRunId || "").trim() === APPROVAL_SELECTION_NONE;
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
  return normalizeWorkspaceView(ui.workspaceLayout?.dataset?.workspaceView, "home");
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
    executionMode: String(draft.executionMode || thread.executionMode || "managed_codex_worker").trim().toLowerCase(),
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
  return activeWorkspaceView() === "agentops" && document.visibilityState !== "hidden" && derived.shouldFollow;
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
  if (activeWorkspaceView() !== "agentops" || document.visibilityState === "hidden" || !derived.shouldFollow) {
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
  const candidateSources = [
    ui.contextProjectSelect?.value,
    readSavedValue(PROJECT_PREF_KEY),
    ui.runsProjectFilter?.value,
    ui.auditProjectFilter?.value,
    ui.approvalsProjectFilter?.value,
    ui.rbProjectId?.value,
    session?.claims?.project_id
  ];
  for (const value of candidateSources) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
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

function applyTenantContext(tenantID) {
  const selectedTenant = String(tenantID || "").trim();
  if (ui.runsTenantFilter) {
    ui.runsTenantFilter.value = selectedTenant;
  }
  if (ui.auditTenantFilter) {
    ui.auditTenantFilter.value = selectedTenant;
  }
  if (ui.approvalsTenantFilter) {
    ui.approvalsTenantFilter.value = selectedTenant;
  }
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

function resolveLocalSecureRefTargetRef(input = {}) {
  const customRef = String(input.customRef || "").trim();
  if (customRef) {
    return customRef;
  }
  return String(input.selectedRef || "").trim();
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function normalizeLocalSecureRefSnapshot(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const entries = Array.isArray(source.entries)
    ? source.entries
        .map((item) => ({
          ref: String(item?.ref || "").trim(),
          present: Boolean(item?.present),
          updatedAt: String(item?.updatedAt || "").trim()
        }))
        .filter((item) => item.ref)
    : [];
  return {
    available: Boolean(source.available),
    platform: String(source.platform || "unknown").trim() || "unknown",
    service: String(source.service || "").trim(),
    indexPath: String(source.indexPath || "").trim(),
    exportPath: String(source.exportPath || "").trim(),
    storedCount: Number.isFinite(Number(source.storedCount)) ? Number(source.storedCount) : entries.filter((item) => item.present).length,
    entries,
    lastExportedAt: String(source.lastExportedAt || "").trim(),
    message: String(source.message || "").trim()
  };
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
  return readAimxsEditorDraft(ui.settingsContent);
}

function readLocalSecureRefInput() {
  const root = ui.settingsContent;
  if (!root) {
    return null;
  }
  const read = (selector) => root.querySelector(selector);
  const selectedRef = read("#settings-local-ref-select");
  const customRef = read("#settings-local-ref-custom");
  const secretValue = read("#settings-local-ref-value");
  if (
    !(selectedRef instanceof HTMLSelectElement) ||
    !(customRef instanceof HTMLInputElement) ||
    !(secretValue instanceof HTMLTextAreaElement)
  ) {
    return null;
  }
  return {
    selectedRef: String(selectedRef.value || "").trim(),
    customRef: String(customRef.value || "").trim(),
    secretValue: String(secretValue.value || "")
  };
}

function readDemoGovernanceInput() {
  const root = ui.settingsContent;
  if (!root) {
    return null;
  }
  const read = (selector) => root.querySelector(selector);
  const personaEnabled = read("#settings-demo-persona-enabled");
  const personaLabel = read("#settings-demo-persona-label");
  const personaSubjectId = read("#settings-demo-persona-subject-id");
  const personaClientId = read("#settings-demo-persona-client-id");
  const personaRolesText = read("#settings-demo-persona-roles");
  const personaTenantScope = read("#settings-demo-persona-tenant-scope");
  const personaProjectScope = read("#settings-demo-persona-project-scope");
  const personaApprovedForProd = read("#settings-demo-persona-approved-for-prod");
  const policyEnabled = read("#settings-demo-policy-enabled");
  const policyReviewMode = read("#settings-demo-policy-review-mode");
  const policyBucketPrefix = read("#settings-demo-policy-bucket-prefix");
  const policyHandshakeRequired = read("#settings-demo-policy-handshake-required");
  const policyAdvisoryAutoShape = read("#settings-demo-policy-advisory-auto-shape");
  const policyFinanceSupervisorGrant = read("#settings-demo-policy-finance-supervisor-grant");
  const policyFinanceEvidenceReadiness = read("#settings-demo-policy-finance-evidence-readiness");
  const policyProductionDeleteDeny = read("#settings-demo-policy-production-delete-deny");

  if (
    !(personaEnabled instanceof HTMLInputElement) ||
    !(personaLabel instanceof HTMLInputElement) ||
    !(personaSubjectId instanceof HTMLInputElement) ||
    !(personaClientId instanceof HTMLInputElement) ||
    !(personaRolesText instanceof HTMLInputElement) ||
    !(personaTenantScope instanceof HTMLInputElement) ||
    !(personaProjectScope instanceof HTMLInputElement) ||
    !(personaApprovedForProd instanceof HTMLInputElement) ||
    !(policyEnabled instanceof HTMLInputElement) ||
    !(policyReviewMode instanceof HTMLSelectElement) ||
    !(policyBucketPrefix instanceof HTMLInputElement) ||
    !(policyHandshakeRequired instanceof HTMLInputElement) ||
    !(policyAdvisoryAutoShape instanceof HTMLInputElement) ||
    !(policyFinanceSupervisorGrant instanceof HTMLInputElement) ||
    !(policyFinanceEvidenceReadiness instanceof HTMLSelectElement) ||
    !(policyProductionDeleteDeny instanceof HTMLInputElement)
  ) {
    return null;
  }

  return normalizeDemoGovernanceOverlay({
    persona: {
      enabled: personaEnabled.checked,
      label: personaLabel.value,
      subjectId: personaSubjectId.value,
      clientId: personaClientId.value,
      rolesText: personaRolesText.value,
      tenantScope: personaTenantScope.value,
      projectScope: personaProjectScope.value,
      approvedForProd: personaApprovedForProd.checked
    },
    policy: {
      enabled: policyEnabled.checked,
      reviewMode: policyReviewMode.value,
      policyBucketPrefix: policyBucketPrefix.value,
      handshakeRequired: policyHandshakeRequired.checked,
      advisoryAutoShape: policyAdvisoryAutoShape.checked,
      financeSupervisorGrant: policyFinanceSupervisorGrant.checked,
      financeEvidenceReadiness: policyFinanceEvidenceReadiness.value,
      productionDeleteDeny: policyProductionDeleteDeny.checked
    }
  });
}

function activeDemoGovernanceContext(session) {
  return buildDemoGovernanceContext(demoGovernanceOverlay, session);
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
  return loadNativeSessionView(requireRuntimeApiClient(), sessionId, { tailCount: 6, waitSeconds: 1 });
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
    const history = await listOperatorChatThreads(requireRuntimeApiClient(), scope, { limit: 12 });
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
    const endpointUnavailable =
      error && [404, 405, 501].includes(Number(error.status || 0));
    operatorChatState = {
      ...operatorChatState,
      history: {
        source: endpointUnavailable ? "endpoint-unavailable" : "error",
        count: 0,
        message: endpointUnavailable
          ? `Native task/session endpoints are unavailable in the current live runtime (HTTP ${error.status}). Chat history cannot load until the local runtime contract is updated.`
          : `Native thread history failed to load: ${error.message}`,
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
    const apiClient = requireRuntimeApiClient();
    const [workerCapabilities, policyPacks, exportProfiles, orgAdminProfiles] = await Promise.all([
      apiClient.listRuntimeWorkerCapabilities({}),
      apiClient.listRuntimePolicyPacks({ clientSurface: "chat" }),
      apiClient.listRuntimeExportProfiles({ clientSurface: "chat" }),
      apiClient.listRuntimeOrgAdminProfiles({ clientSurface: "chat" })
    ]);
    const responses = [workerCapabilities, policyPacks, exportProfiles, orgAdminProfiles];
    const unavailableWarnings = responses
      .filter((item) => String(item?.source || "").trim().toLowerCase() === "endpoint-unavailable")
      .map((item) => String(item?.warning || "").trim())
      .filter(Boolean);
    operatorChatState = {
      ...operatorChatState,
      catalogs: {
        source: unavailableWarnings.length > 0 ? "endpoint-unavailable" : "runtime-endpoint",
        message:
          unavailableWarnings.length > 0
            ? `Enterprise governance catalogs are unavailable in the current live runtime. ${unavailableWarnings.join(" ")}`
            : "Enterprise governance catalogs loaded for Chat review, report, governed export, and org-admin posture.",
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
    const apiClient = requireRuntimeApiClient();
    const [exportProfiles, orgAdminProfiles] = await Promise.all([
      apiClient.listRuntimeExportProfiles({ clientSurface: "desktop" }),
      apiClient.listRuntimeOrgAdminProfiles({ clientSurface: "desktop" })
    ]);
    const responses = [exportProfiles, orgAdminProfiles];
    const unavailableWarnings = responses
      .filter((item) => String(item?.source || "").trim().toLowerCase() === "endpoint-unavailable")
      .map((item) => String(item?.warning || "").trim())
      .filter(Boolean);
    desktopGovernedExportCatalogState = {
      source: unavailableWarnings.length > 0 ? "endpoint-unavailable" : "runtime-endpoint",
      message:
        unavailableWarnings.length > 0
          ? `Enterprise governed export catalogs are unavailable in the current live runtime. ${unavailableWarnings.join(" ")}`
          : "Enterprise governed export profiles and org-admin overlays loaded for desktop export and handoff paths.",
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

function normalizeWorkspaceView(value, fallback = "companionops") {
  return normalizeShellWorkspaceView(value, fallback, WORKSPACE_VIEW_ID_LIST);
}

function setWorkspaceView(view, persist = false) {
  const selectedView = workspaceShell.applyView(view, { tabs: workspaceTabNodes });
  if (selectedView !== "companionops") {
    companionOpsViewState = {
      ...companionOpsViewState,
      lastWorkbenchDomain: selectedView
    };
  }
  if (persist) {
    saveValue(WORKSPACE_VIEW_PREF_KEY, selectedView);
  }
  renderCompanionHandoffBanner();
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
  const selected = applySettingsSubview(settingsSubviewState);
  if (persist) {
    saveValue(SETTINGS_SUBVIEW_PREF_KEY, selected);
  }
  return selected;
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
  refreshStatusShell.setStatus(tone, detail);
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

function collectRuntimeScopePairs(snapshot, session) {
  const pairs = [];
  const seen = new Set();
  const addPair = (tenantID, projectID) => {
    const tenant = String(tenantID || "").trim();
    const project = String(projectID || "").trim();
    if (!tenant || !project) {
      return;
    }
    const key = `${tenant}::${project}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    pairs.push({ tenantId: tenant, projectId: project });
  };

  addPair(session?.claims?.tenant_id, session?.claims?.project_id);

  const sources = [
    snapshot?.runs?.items,
    snapshot?.approvals?.items,
    snapshot?.audit?.items
  ];
  for (const list of sources) {
    for (const item of list || []) {
      addPair(item?.tenantId, item?.projectId);
    }
  }
  return pairs;
}

function deriveRuntimeScopeSeed(snapshot, session) {
  const currentTenant = activeTenantScope(session);
  const currentProject = activeProjectScope(session);
  if (currentTenant && currentProject) {
    return null;
  }
  const pairs = collectRuntimeScopePairs(snapshot, session);
  if (pairs.length === 0) {
    return null;
  }
  if (currentProject && !currentTenant) {
    return pairs.find((item) => item.projectId === currentProject) || pairs[0];
  }
  if (!currentProject && currentTenant) {
    return pairs.find((item) => item.tenantId === currentTenant) || pairs[0];
  }
  return pairs[0];
}

function seedRuntimeScopeFromSnapshot(snapshot, session) {
  const seed = deriveRuntimeScopeSeed(snapshot, session);
  if (!seed) {
    return false;
  }

  let changed = false;
  if (!activeTenantScope(session) && seed.tenantId) {
    applyTenantContext(seed.tenantId);
    changed = true;
  }
  if (!activeProjectScope(session) && seed.projectId) {
    saveValue(PROJECT_PREF_KEY, seed.projectId);
    applyProjectContext(seed.projectId);
    if (ui.contextProjectSelect) {
      ui.contextProjectSelect.value = seed.projectId;
    }
    changed = true;
  }
  return changed;
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
  if (status === "dirty" || status === "pending_apply" || status === "warn") {
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
  renderAimxsEditorFeedback(ui.settingsContent, state, {
    settingsEditorChipClass,
    settingsEditorStatusLabel
  });
}

function renderLocalSecureRefFeedbackInline(state) {
  if (!ui.settingsContent) {
    return;
  }
  const chip = ui.settingsContent.querySelector("#settings-local-ref-status-chip");
  if (chip instanceof HTMLElement) {
    chip.className = settingsEditorChipClass(state?.status);
    chip.textContent = settingsEditorStatusLabel(state?.status);
  }

  const feedback = ui.settingsContent.querySelector("#settings-local-ref-feedback");
  if (!(feedback instanceof HTMLElement)) {
    return;
  }

  const parts = [];
  const message = String(state?.message || "").trim();
  if (message) {
    parts.push(`<div class="meta">${escapeHTML(message)}</div>`);
  }
  parts.push(
    `<div class="meta">storedCount=${escapeHTML(String(localSecureRefSnapshot.storedCount || 0))}; keychainService=${escapeHTML(localSecureRefSnapshot.service || "-")}</div>`
  );
  parts.push(`<div class="meta">indexPath=<code>${escapeHTML(localSecureRefSnapshot.indexPath || "-")}</code></div>`);
  parts.push(`<div class="meta">exportPath=<code>${escapeHTML(localSecureRefSnapshot.exportPath || "-")}</code></div>`);
  if (localSecureRefSnapshot.lastExportedAt) {
    parts.push(`<div class="meta">lastExportedAt=${escapeHTML(String(localSecureRefSnapshot.lastExportedAt))}</div>`);
  }
  feedback.innerHTML = parts.join("");
}

function renderDemoGovernanceFeedbackInline(state) {
  if (!ui.settingsContent) {
    return;
  }
  const chip = ui.settingsContent.querySelector("#settings-demo-governance-status-chip");
  if (chip instanceof HTMLElement) {
    chip.className = settingsEditorChipClass(state?.status);
    chip.textContent = settingsEditorStatusLabel(state?.status);
  }

  const feedback = ui.settingsContent.querySelector("#settings-demo-governance-feedback");
  if (!(feedback instanceof HTMLElement)) {
    return;
  }

  const parts = [];
  const message = String(state?.message || "").trim();
  if (message) {
    parts.push(`<div class="meta">${escapeHTML(message)}</div>`);
  }
  parts.push(
    "<div class=\"meta\">Runtime identity remains authoritative. This overlay only shapes local demo governed requests.</div>"
  );
  for (const item of Array.isArray(state?.errors) ? state.errors : []) {
    parts.push(`<div class="meta settings-editor-error">Blocked: ${escapeHTML(item)}</div>`);
  }
  for (const item of Array.isArray(state?.warnings) ? state.warnings : []) {
    parts.push(`<div class="meta settings-editor-warn">Review before save: ${escapeHTML(item)}</div>`);
  }
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

const DEFAULT_AUDITOPS_HANDOFF_PREVIEW =
  "Copy an audit or incident handoff to populate this preview. Review the text here before sharing it downstream.";
let syncAuditOpsFeedbackState = () => {};
let syncAuditOpsHandoffPreviewState = () => {};

function renderAuditFilingFeedback(tone, message) {
  if (!(ui.auditFeedback instanceof HTMLElement)) {
    syncAuditOpsFeedbackState(tone, message);
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
  syncAuditOpsFeedbackState(normalizedTone, message || "");
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
    "EpydiosOps Desktop Incident Handoff Summary",
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

let syncIncidentOpsSelectionAfterHistoryChange = () => {};

function pushIncidentHistory(entry) {
  const normalized = normalizeIncidentHistoryEntry(entry);
  store.upsertIncidentPackageHistoryEntry(normalized);
  persistIncidentHistory();
  renderIncidentHistoryPanel();
  syncIncidentOpsSelectionAfterHistoryChange(normalized.id);
}

function clearIncidentHistoryQueue() {
  store.setIncidentPackageHistory([]);
  incidentHistorySelection.clear();
  persistIncidentHistory();
  renderIncidentHistoryPanel();
  syncIncidentOpsSelectionAfterHistoryChange("");
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
  renderAgentOpsEmptyState(ui, {
    tone: "info",
    title: "Agent Workspace",
    message: "Agent workspace becomes available after scope and runtime choices load."
  });
  renderIdentityOpsEmptyState(ui, {
    tone: "info",
    title: "IdentityOps",
    message: "Identity state becomes available after configuration and runtime identity load."
  });
  renderGuardrailOpsEmptyState(ui, {
    tone: "info",
    title: "GuardrailOps",
    message: "Guardrail posture becomes available after runtime, policy, and governance signals load."
  });
  renderAuditOpsEmptyState(ui, {
    tone: "info",
    title: "AuditOps",
    message: "Audit posture becomes available after audit, run, approval, and decision trace signals load."
  });
  renderEvidenceOpsEmptyState(ui, {
    tone: "info",
    title: "EvidenceOps",
    message: "Evidence posture becomes available after governed runs, artifacts, and linked proof material load."
  });
  renderComplianceOpsEmptyState(ui, {
    tone: "info",
    title: "ComplianceOps",
    message: "Compliance posture becomes available after policy, governance, evidence, audit, and platform signals load."
  });
  renderIncidentOpsEmptyState(ui, {
    tone: "info",
    title: "IncidentOps",
    message: "Incident posture becomes available after incident packages, linked runs, and audit anchors load."
  });
  renderNetworkOpsEmptyState(ui, {
    tone: "info",
    title: "NetworkOps",
    message: "Network posture becomes available after boundary, endpoint, and trust signals load."
  });
  renderGovernanceOpsEmptyState(ui, {
    tone: "info",
    title: "GovernanceOps",
    message: "Governance posture becomes available after approval, authority, and decision receipt signals load."
  });
  renderPlatformOpsEmptyState(ui, {
    tone: "info",
    title: "PlatformOps",
    message: "Platform posture becomes available after environment, deployment, and dependency signals load."
  });
  renderPolicyOpsEmptyState(ui, {
    tone: "info",
    title: "PolicyOps",
    message: "Policy semantics become available after policy contract, pack, and decision signals load."
  });
  latestDeveloperOpsContext = {
    session: null,
    settings: null,
    health: {},
    providers: {},
    runs: {},
    projectScope: "",
    selectedAgentProfileId: ""
  };
  renderDeveloperOpsEmptyState(ui, {
    tone: "info",
    title: "DeveloperOps",
    message: "Developer diagnostics become available after runtime, settings, and advanced preview signals load."
  });
  renderSettingsOpsEmptyState(ui, {
    tone: "empty",
    title: "SettingsOps",
    message: "No configuration data loaded.",
    detail: "Refresh the workspace. If settings should be present, verify scope and runtime endpoint availability."
  });
  ui.approvalsFeedback.innerHTML = "";
  ui.approvalsContent.innerHTML = renderPanelStateMetric(
    "empty",
    "Pending Approvals",
    "No approval data loaded.",
    "Refresh the workspace, then verify approval endpoint health and active scope."
  );
  if (ui.approvalsDetailContent) {
    ui.approvalsDetailContent.innerHTML = renderPanelStateMetric(
      "info",
      "Approval Review",
      "Select an approval card to pin its context in Agent.",
      "Use the pinned review section and run detail. Do not rely on the legacy review overlay."
    );
    delete ui.approvalsDetailContent.dataset.selectedRunId;
  }
  renderApprovalReviewModal(ui, null);
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
    "History",
    "No run history loaded.",
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
    ui.auditHandoffPreview.textContent = DEFAULT_AUDITOPS_HANDOFF_PREVIEW;
  }
  syncAuditOpsHandoffPreviewState(DEFAULT_AUDITOPS_HANDOFF_PREVIEW, { render: false });
  renderIncidentHistoryPanel();
  if (ui.homeOpsContent) {
    ui.homeOpsContent.innerHTML = "";
  }
  if (ui.contextAgentProfile) {
    ui.contextAgentProfile.textContent = "-";
  }
  if (ui.contextEndpointBadges) {
    ui.contextEndpointBadges.innerHTML = "";
  }
}

function renderPanelLoadingStates() {
  if (ui.homeOpsContent) {
    ui.homeOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "CompanionOps",
      "Loading companion status, attention queue, recent governed actions, and workbench handoffs..."
    );
  }
  if (ui.runsContent) {
    ui.runsContent.innerHTML = renderPanelStateMetric("loading", "Run Inventory", "Loading run inventory...");
  }
  if (ui.runtimeOpsContent) {
    ui.runtimeOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "RuntimeOps",
      "Loading runtime health, queue posture, and run inventory signals..."
    );
  }
  if (ui.platformOpsContent) {
    ui.platformOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "PlatformOps",
      "Loading environment, deployment, and dependency posture..."
    );
  }
  if (ui.networkOpsContent) {
    ui.networkOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "NetworkOps",
      "Loading network boundary, endpoint reachability, and trust posture..."
    );
  }
  if (ui.policyOpsContent) {
    ui.policyOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "PolicyOps",
      "Loading policy contract, pack posture, and decision explanation..."
    );
  }
  if (ui.governanceOpsContent) {
    ui.governanceOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "GovernanceOps",
      "Loading approval queue, authority ladder, and decision receipt posture..."
    );
  }
  if (ui.auditOpsContent) {
    ui.auditOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "AuditOps",
      "Loading audit event, actor activity, and decision trace posture..."
    );
  }
  if (ui.evidenceOpsContent) {
    ui.evidenceOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "EvidenceOps",
      "Loading evidence bundles, provenance, and artifact access posture..."
    );
  }
  if (ui.complianceOpsContent) {
    ui.complianceOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "ComplianceOps",
      "Loading control coverage, obligation posture, and attestation readiness..."
    );
  }
  if (ui.incidentOpsContent) {
    ui.incidentOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "IncidentOps",
      "Loading incident queue, active package posture, and severity anchors..."
    );
  }
  if (ui.logOpsContent) {
    renderLogOpsEmptyState(ui, {
      tone: "loading",
      title: "LogOps",
      message: "Loading native shell logs, service logs, and session artifacts..."
    });
  }
  if (ui.approvalsContent) {
    ui.approvalsContent.innerHTML = renderPanelStateMetric("loading", "Pending Approvals", "Loading approvals...");
  }
  if (ui.auditContent) {
    ui.auditContent.innerHTML = renderPanelStateMetric("loading", "Audit Events", "Loading audit events...");
  }
  if (ui.settingsContent) {
    renderSettingsOpsEmptyState(ui, {
      tone: "loading",
      title: "SettingsOps",
      message: "Loading app preferences, secure refs, and local environment bindings..."
    });
  }
  if (ui.identityContent) {
    ui.identityContent.innerHTML = renderPanelStateMetric(
      "loading",
      "IdentityOps",
      "Loading effective identity, authority, scope, and grant state..."
    );
  }
  if (ui.developerOpsContent) {
    ui.developerOpsContent.innerHTML = renderPanelStateMetric(
      "loading",
      "DeveloperOps",
      "Loading debug tools, payload previews, and contract diagnostics..."
    );
  }
}

function isEditableElement(node) {
  if (node instanceof HTMLTextAreaElement) {
    return true;
  }
  if (node instanceof HTMLSelectElement) {
    return true;
  }
  if (node instanceof HTMLInputElement) {
    const type = String(node.type || "text").trim().toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "range", "file", "color"].includes(type);
  }
  return node instanceof HTMLElement && node.isContentEditable;
}

function shouldPauseBackgroundRefresh() {
  const activeElement = document.activeElement;
  if (!isEditableElement(activeElement)) {
    return false;
  }
  return [
    ui.chatContent,
    ui.settingsContent,
    ui.runsContent,
    ui.approvalsContent,
    ui.auditContent,
    ui.homeOpsContent
  ].some((root) => root instanceof HTMLElement && root.contains(activeElement));
}

function startRealtimeRefreshLoop(choices, statusFn) {
  if (choices.realtime.mode !== "polling") {
    return () => {};
  }

  const timer = window.setInterval(() => {
    if (document.visibilityState !== "hidden") {
      if (shouldPauseBackgroundRefresh()) {
        return;
      }
      statusFn().catch(() => {});
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
  latestDeveloperOpsPreviews.runBuilder = { input, issues, payload };
  renderDeveloperOpsPanel();
  return latestDeveloperOpsPreviews.runBuilder;
}

function refreshGovernedActionPreview(session) {
  ensureGovernedActionDefaults(ui, session);
  const input = readGovernedActionInput(ui);
  const issues = evaluateGovernedActionIssues(input);
  const payload = buildGovernedActionRunPayload(input, session, demoGovernanceOverlay);
  renderGovernedActionPolicyHints(ui, input, issues);
  renderGovernedActionPayload(ui, payload);
  latestDeveloperOpsPreviews.governedAction = { input, issues, payload };
  renderDeveloperOpsPanel();
  return latestDeveloperOpsPreviews.governedAction;
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
  latestDeveloperOpsPreviews.terminal = { input: normalizedInput, issues, payload };
  renderDeveloperOpsPanel();
  return latestDeveloperOpsPreviews.terminal;
}

function renderDeveloperOpsPanel() {
  if (!ui.developerOpsContent) {
    return;
  }
  if (!latestDeveloperOpsContext?.settings) {
    renderDeveloperOpsEmptyState(ui, {
      tone: "info",
      title: "DeveloperOps",
      message: "Developer diagnostics become available after runtime, settings, and advanced preview signals load."
    });
    return;
  }
  renderDeveloperOpsPage(ui, {
    ...latestDeveloperOpsContext,
    projectScope: String(ui.contextProjectSelect?.value || latestDeveloperOpsContext.projectScope || "").trim(),
    selectedAgentProfileId: String(
      ui.settingsAgentProfile?.value || latestDeveloperOpsContext.selectedAgentProfileId || ""
    )
      .trim()
      .toLowerCase(),
    terminalHistory: store.getTerminalHistory(),
    governedActionPreview: latestDeveloperOpsPreviews.governedAction,
    runBuilderPreview: latestDeveloperOpsPreviews.runBuilder,
    terminalPreview: latestDeveloperOpsPreviews.terminal,
    advancedVisible: isAdvancedSectionEnabled("operations")
  });
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
  const visibleSelectedCount = Array.isArray(visibleItems)
    ? visibleItems.filter((item) => incidentHistorySelection.has(String(item?.id || "").trim())).length
    : 0;
  const hiddenSelectedCount = Math.max(0, selectedCount - visibleSelectedCount);
  const timeLabel =
    normalizeIncidentHistoryTimeRange(view?.timeRange) || (view?.timeFrom || view?.timeTo ? "custom" : "any");
  let nextAction = "Use Audit Events to seed a new package when a run needs durable incident handoff.";
  if (selectedCount > 0) {
    nextAction = "Selection is active. Run bulk status updates or export the selected bundle before changing filters.";
  } else if (visibleStatusCounts.drafted > 0) {
    nextAction = "Review drafted packages first and mark them filed only after downstream handoff has actually started.";
  } else if (visibleStatusCounts.filed > 0) {
    nextAction = "Filed packages are waiting on closure. Use Needs Closure and mark them closed when response tracking is complete.";
  } else if (visibleStatusCounts.closed > 0) {
    nextAction = "Closed packages are archival. Open the linked run or clear filters if active queue work needs to resume.";
  }
  const summaryActions = `
    <div class="incident-history-actions">
      <div class="action-hierarchy">
        <div class="action-group action-group-primary">
          <button class="btn btn-primary btn-small" type="button" data-incident-summary-action="copy-latest" ${latestVisible?.handoffText ? "" : "disabled"}>Copy Latest Handoff</button>
        </div>
        <div class="action-group action-group-secondary">
          <button class="btn btn-secondary btn-small" type="button" data-incident-summary-action="open-audit">Open Audit Events</button>
          <button class="btn btn-secondary btn-small" type="button" data-incident-summary-action="show-needs-closure">Needs Closure</button>
          <button class="btn btn-secondary btn-small" type="button" data-incident-summary-action="show-all">Show All</button>
          <button class="btn btn-secondary btn-small" type="button" data-incident-summary-action="clear-selection" ${selectedCount > 0 ? "" : "disabled"}>Clear Selection</button>
        </div>
      </div>
    </div>
  `;
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
        <span class="chip chip-neutral chip-compact">selectedVisible=${escapeHTML(String(visibleSelectedCount))}</span>
      </div>
      <div class="meta incident-history-note">${escapeHTML(nextAction)}</div>
      ${hiddenSelectedCount > 0 ? `<div class="meta incident-history-note">selectionHiddenByFilters=${escapeHTML(String(hiddenSelectedCount))}; clear selection or widen filters before bulk actions if you need to review every selected row first.</div>` : ""}
      <div class="meta incident-history-note">Transition semantics: drafted=prepared locally, filed=handed off downstream, closed=queue tracking complete.</div>
      <div class="meta incident-history-note">Bulk actions touch selected rows only. Rows that cannot move to the requested next status are skipped and reported in feedback.</div>
      <div class="meta">latestPackage=${escapeHTML(String(latestVisible?.packageId || "-"))}; latestGeneratedAt=${escapeHTML(String(latestVisible?.generatedAt || latestVisible?.createdAt || "-"))}</div>
      <div class="meta">filter=${escapeHTML(String(view?.status || "any"))}; sort=${escapeHTML(String(view?.sort || "newest"))}; time=${escapeHTML(timeLabel)}; search=${escapeHTML(searchLabel)}; page=${escapeHTML(pageLabel)}; pageSize=${escapeHTML(String(view?.pageSize || 25))}</div>
      ${summaryActions}
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

async function main() {
  const config = await loadConfig();
  window.__m14MainReady = false;
  workspaceShell.initializePanels();
  initializePanelRegions();
  initializeShellLiveRegions({
    liveNodes: [
      ui.approvalsFeedback,
      ui.auditFeedback,
      document.getElementById("run-builder-feedback"),
      document.getElementById("terminal-feedback"),
      ui.incidentHistorySummary,
      document.getElementById("settings-int-feedback"),
      document.getElementById("settings-aimxs-feedback")
    ],
    handoffPreview: ui.auditHandoffPreview
  });
  const baselineChoices = resolveRuntimeChoices(config);
  let aimxsOverride = normalizeAimxsOverride(
    readSavedJSON(AIMXS_OVERRIDE_KEY),
    baselineChoices?.aimxs || {}
  );
  demoGovernanceOverlay = normalizeDemoGovernanceOverlay(readSavedJSON(DEMO_GOVERNANCE_EDITOR_KEY));
  demoGovernanceEditorState = {
    overlay: normalizeDemoGovernanceOverlay(demoGovernanceOverlay),
    status: demoGovernanceOverlay?.persona?.enabled || demoGovernanceOverlay?.policy?.enabled ? "saved" : "clean",
    message:
      demoGovernanceOverlay?.persona?.enabled || demoGovernanceOverlay?.policy?.enabled
        ? "Local demo governance overlay loaded from browser storage."
        : "No local demo governance overlay is active."
  };
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
  const persistDemoGovernanceOverlay = () => {
    saveJSON(DEMO_GOVERNANCE_EDITOR_KEY, demoGovernanceOverlay);
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
  const updateNativeLauncherPresentation = (nativeShellSummary = config.nativeShell) => {
    config.nativeShell = nativeShellSummary && typeof nativeShellSummary === "object" ? nativeShellSummary : {};
    if (!(ui.nativeLauncherStatus instanceof HTMLElement)) {
      return;
    }
    const launcherMarkup = renderNativeLauncherStatus(config.nativeShell);
    ui.nativeLauncherStatus.innerHTML = launcherMarkup;
    ui.nativeLauncherStatus.hidden = !launcherMarkup;
    if (launcherMarkup) {
      ui.nativeLauncherStatus.dataset.launcherState = String(
        config?.nativeShell?.launcherState || ""
      )
        .trim()
        .toLowerCase();
    } else {
      delete ui.nativeLauncherStatus.dataset.launcherState;
    }
    syncNativeInterpositionDraftPresentation();
  };
  topbarShell.setBrand({
    title: config.appName || "EpydiosOps Desktop",
    subtitle: `${config.environment || "unknown"} environment`
  });
  updateNativeLauncherPresentation(config.nativeShell);
  setWorkspaceView("companionops");
  setIncidentSubview(readSavedValue(INCIDENT_SUBVIEW_PREF_KEY));
  settingsSubviewState = normalizeSettingsSubview(readSavedValue(SETTINGS_SUBVIEW_PREF_KEY));
  advancedSectionState = normalizeAdvancedSectionState(readSavedJSON(ADVANCED_SECTION_STATE_KEY));
  detailsOpenState = normalizeDetailsOpenState(readSavedJSON(DETAILS_OPEN_STATE_KEY));
  applyAdvancedState();
  createWorkspaceNavController({
    tabs: workspaceTabNodes,
    normalizeView: normalizeWorkspaceView,
    activateView: (requested) => setWorkspaceView(requested, true),
    onKeydown: handleHorizontalTabKeydown
  }).bind();
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
    const copyNode = target.closest("[data-copy-text]");
    if (copyNode instanceof HTMLElement) {
      const payload = String(copyNode.dataset.copyText || "").trim();
      const feedbackTargetId = String(copyNode.dataset.copyFeedbackTarget || "").trim();
      const feedbackNode = feedbackTargetId ? document.getElementById(feedbackTargetId) : null;
      if (!payload) {
        return;
      }
      copyTextToClipboard(payload)
        .then(() => {
          if (feedbackNode instanceof HTMLElement) {
            feedbackNode.textContent = "Path copied to the clipboard.";
          }
        })
        .catch((error) => {
          if (feedbackNode instanceof HTMLElement) {
            feedbackNode.textContent = `Copy failed: ${error.message}`;
          }
        });
      return;
    }
    const toggleNode = target.closest("[data-advanced-toggle-section]");
    if (!(toggleNode instanceof HTMLElement)) {
      return;
    }
    const section = String(toggleNode.dataset.advancedToggleSection || "").trim().toLowerCase();
    toggleAdvancedSection(section, true);
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
    message: describeAimxsEntitlementMessage(initialChoices?.aimxs || {})
  };
  const initialThemeMode = resolveThemeMode(initialChoices?.theme?.mode || "system");
  if (ui.settingsThemeMode) {
    ui.settingsThemeMode.value = initialThemeMode;
  }
  applyThemeMode(initialThemeMode);

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

  refreshGovernedActionPreview(session);
  refreshRunBuilderPreview(session);
  refreshTerminalPreview(session, initialChoices);
  renderTerminalHistoryPanel();
  renderIncidentHistoryPanel();

  const api = new AgentOpsApi(config, () => getSession().token);
  runtimeApiClient = api;
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
  refreshGovernedActionPreview(session);
  refreshRunBuilderPreview(session);
  refreshTerminalPreview(session, initialChoices);

  let triageSnapshot = createEmptyHomeSnapshot();
  let latestAuditPayload = { items: [], source: "unknown" };
  let latestRunDetail = null;
  let latestRunDetailSource = "unknown";
  let latestSettingsSnapshot = {
    ...api.getSettingsSnapshot({
      choices: getRuntimeChoices(),
      themeMode: initialThemeMode,
      selectedAgentProfileId: initialAgentID,
      runtimeIdentity: null,
      policyPacksCatalog: null,
      aimxsActivation: aimxsActivationSnapshot,
      localSecureRefs: localSecureRefSnapshot
    }),
    configChanges: buildSettingsConfigChanges(configChangeHistory, { items: [] })
  };
  latestDeveloperOpsContext = {
    session,
    settings: latestSettingsSnapshot,
    health: {},
    providers: {},
    runs: {},
    projectScope: activeProjectScope(session),
    selectedAgentProfileId: initialAgentID
  };
  let latestIdentityOpsContext = {
    settings: latestSettingsSnapshot,
    session
  };
  let latestGuardrailOpsContext = {
    settings: latestSettingsSnapshot,
    runs: {},
    approvals: {},
    runtimeWorkerCapabilities: {},
    exportProfiles: null,
    orgAdminProfiles: null
  };
  let latestGovernanceOpsContext = {
    settings: latestSettingsSnapshot,
    approvals: {},
    runs: {},
    session,
    orgAdminProfiles: null
  };
  let latestRuntimeOpsContext = {
    health: {},
    pipeline: {},
    providers: {},
    runs: {},
    approvals: {},
    runtimeIdentity: {},
    runtimeSessions: {},
    runtimeWorkerCapabilities: {}
  };
  let latestPlatformOpsContext = {
    health: {},
    pipeline: {},
    providers: {},
    aimxsActivation: {}
  };
  let latestAuditOpsContext = {
    audit: { items: [] },
    filters: {},
    actor: String(session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || "").trim(),
    runs: {},
    approvals: {}
  };
  let latestEvidenceOpsContext = {
    settings: latestSettingsSnapshot,
    audit: { items: [] },
    runs: {},
    approvals: {},
    thread: {}
  };
  let latestPolicyOpsContext = {
    settings: latestSettingsSnapshot,
    runs: {}
  };
  let latestIncidentOpsContext = {
    incidentHistory: { items: [] },
    runs: {},
    approvals: {},
    audit: { items: [] }
  };
  let latestComplianceOpsContext = {
    settings: latestSettingsSnapshot,
    runs: {},
    approvals: {},
    audit: { items: [] }
  };
  let latestNetworkOpsContext = {
    settings: latestSettingsSnapshot,
    health: {},
    providers: {},
    runs: {},
    runtimeWorkerCapabilities: {}
  };
  let governanceOpsViewState = {
    selectedRunId: "",
    selectedAdminChangeId: "",
    feedback: null
  };
  let runtimeOpsViewState = {
    selectedRunId: "",
    selectedSessionId: "",
    sessionReview: null,
    sessionReviewMeta: null,
    feedback: null
  };
  let platformOpsViewState = {
    feedback: null,
    selectedAdminChangeId: "",
    recoveryReason: "",
    promotionDraft: {
      changeKind: "promote",
      environment: "",
      deploymentTarget: "",
      releaseRef: "",
      reason: ""
    },
    queueItems: [],
    latestSimulation: null
  };
  let guardrailOpsViewState = {
    feedback: null,
    selectedAdminChangeId: "",
    recoveryReason: "",
    guardrailDraft: {
      changeKind: "tighten",
      targetScope: "",
      executionProfile: "",
      safetyBoundary: "",
      proposedState: "approval_required",
      reason: ""
    },
    queueItems: [],
    latestSimulation: null
  };
  let auditOpsViewState = {
    feedback: null,
    handoffPreview: DEFAULT_AUDITOPS_HANDOFF_PREVIEW
  };
  let evidenceOpsViewState = {
    feedback: null
  };
  let policyOpsViewState = {
    feedback: null,
    simulationRefreshedAt: "",
    selectedAdminChangeId: "",
    recoveryReason: "",
    adminDraft: {
      changeKind: "load",
      packId: "",
      providerId: "",
      targetScope: "",
      reason: ""
    },
    queueItems: [],
    latestSimulation: null,
    latestVerification: null
  };
  let complianceOpsViewState = {
    feedback: null,
    selectedAdminChangeId: "",
    recoveryReason: "",
    adminDraft: {
      changeKind: "attestation",
      subjectId: "",
      targetScope: "",
      controlBoundary: "",
      reason: ""
    },
    queueItems: [],
    latestSimulation: null
  };
  let networkOpsViewState = {
    feedback: null,
    selectedAdminChangeId: "",
    recoveryReason: "",
    adminDraft: {
      changeKind: "probe",
      boundaryPathId: "",
      targetScope: "",
      targetEndpointId: "",
      reason: ""
    },
    queueItems: [],
    latestSimulation: null
  };
  let incidentOpsViewState = {
    selectedIncidentId: "",
    feedback: null
  };
  let aimxsSpineViewState = {
    selectedRunId: "",
    selectedIncidentEntryId: ""
  };
  let identityOpsViewState = {
    feedback: null,
    selectedAdminChangeId: "",
    recoveryReason: "",
    authorityDraft: {
      subjectId: "",
      targetScope: "",
      authorityTier: "workspace_operator",
      reason: ""
    },
    grantDraft: {
      subjectId: "",
      targetScope: "",
      changeKind: "issue",
      grantKey: "",
      delegationMode: "governed",
      reason: ""
    },
    queueItems: [],
    latestSimulation: null
  };
  const withAdminOwnerDomain = (items, ownerDomain) =>
    (Array.isArray(items) ? items : []).map((item) => ({
      ...(item && typeof item === "object" ? item : {}),
      ownerDomain:
        String(item?.ownerDomain || "").trim().toLowerCase() ||
        String(ownerDomain || "").trim().toLowerCase()
    }));
  const getAdminLifecycleQueueItems = () => [
    ...withAdminOwnerDomain(identityOpsViewState.queueItems, "identityops"),
    ...withAdminOwnerDomain(platformOpsViewState.queueItems, "platformops"),
    ...withAdminOwnerDomain(guardrailOpsViewState.queueItems, "guardrailops"),
    ...withAdminOwnerDomain(policyOpsViewState.queueItems, "policyops"),
    ...withAdminOwnerDomain(complianceOpsViewState.queueItems, "complianceops"),
    ...withAdminOwnerDomain(networkOpsViewState.queueItems, "networkops")
  ];
  const normalizeAimxsValue = (value, fallback = "") => {
    const normalized = String(value || "").trim();
    return normalized || fallback;
  };
  const firstAimxsValue = (...values) => {
    for (const value of values) {
      const normalized = normalizeAimxsValue(value);
      if (normalized && normalized !== "-") {
        return normalized;
      }
    }
    return "";
  };
  const aimxsScopeLabel = (...parts) => {
    const values = parts.map((value) => normalizeAimxsValue(value)).filter(Boolean);
    return values.join(" / ");
  };
  const aimxsArray = (values = []) =>
    (Array.isArray(values) ? values : []).map((value) => normalizeAimxsValue(value)).filter(Boolean);
  const aimxsObject = (value) => (value && typeof value === "object" ? value : {});
  const aimxsUnique = (values = []) => Array.from(new Set(aimxsArray(values)));
  const agentOpsCurrentProfileId = () =>
    normalizeAimxsValue(
      operatorChatState.agentProfileId ||
        initialAgentID ||
        latestSettingsSnapshot?.integrations?.selectedAgentProfileId
    );
  const getAimxsRunItems = () => {
    const candidates = [
      latestRuntimeOpsContext?.runs?.items,
      latestGovernanceOpsContext?.runs?.items,
      latestAuditOpsContext?.runs?.items,
      latestEvidenceOpsContext?.runs?.items,
      latestIncidentOpsContext?.runs?.items,
      latestPolicyOpsContext?.runs?.items,
      latestComplianceOpsContext?.runs?.items,
      latestNetworkOpsContext?.runs?.items
    ];
    for (const items of candidates) {
      if (Array.isArray(items) && items.length > 0) {
        return items;
      }
    }
    return [];
  };
  const getAimxsApprovalItems = () => {
    const candidates = [
      latestGovernanceOpsContext?.approvals?.items,
      latestAuditOpsContext?.approvals?.items,
      latestEvidenceOpsContext?.approvals?.items,
      latestIncidentOpsContext?.approvals?.items,
      latestComplianceOpsContext?.approvals?.items,
      latestRuntimeOpsContext?.approvals?.items
    ];
    for (const items of candidates) {
      if (Array.isArray(items) && items.length > 0) {
        return items;
      }
    }
    return [];
  };
  const getAimxsAuditItems = () => {
    const candidates = [latestAuditOpsContext?.audit?.items, latestAuditPayload?.items];
    for (const items of candidates) {
      if (Array.isArray(items) && items.length > 0) {
        return items;
      }
    }
    return [];
  };
  const getAimxsIncidentItems = () => {
    const items = store.getIncidentPackageHistory();
    return Array.isArray(items) ? items : [];
  };
  const extractThreadRunReference = (thread = null) => {
    const currentThread = thread && typeof thread === "object" ? thread : {};
    const turns = Array.isArray(currentThread?.turns) ? currentThread.turns : [];
    for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
      const turn = turns[turnIndex] && typeof turns[turnIndex] === "object" ? turns[turnIndex] : {};
      const sessionView = aimxsObject(turn?.sessionView);
      const timeline = aimxsObject(sessionView?.timeline);
      const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
      for (let actionIndex = toolActions.length - 1; actionIndex >= 0; actionIndex -= 1) {
        const resultPayload = aimxsObject(toolActions[actionIndex]?.resultPayload);
        const governedRun = aimxsObject(resultPayload?.governedRun);
        const runId = normalizeAimxsValue(governedRun?.runId);
        if (!runId) {
          continue;
        }
        const latestEvidence = Array.isArray(timeline?.evidenceRecords) && timeline.evidenceRecords.length > 0
          ? timeline.evidenceRecords[timeline.evidenceRecords.length - 1]
          : null;
        const selectedWorker = aimxsObject(timeline?.selectedWorker);
        return {
          runId,
          requestRef: normalizeAimxsValue(turn?.requestId),
          sessionRef: normalizeAimxsValue(timeline?.session?.sessionId, normalizeAimxsValue(turn?.response?.sessionId)),
          taskRef: normalizeAimxsValue(timeline?.task?.taskId, normalizeAimxsValue(turn?.taskId, normalizeAimxsValue(currentThread?.taskId))),
          actorRef: normalizeAimxsValue(selectedWorker?.adapterId, normalizeAimxsValue(selectedWorker?.workerId)),
          providerRef: normalizeAimxsValue(governedRun?.selectedPolicyProvider, normalizeAimxsValue(governedRun?.policyResponse?.source)),
          routeRef: normalizeAimxsValue(turn?.response?.route),
          boundaryRef: normalizeAimxsValue(turn?.response?.boundaryProviderId),
          summary: normalizeAimxsValue(turn?.response?.outputText, normalizeAimxsValue(turn?.prompt)),
          latestEvidenceRef: normalizeAimxsValue(latestEvidence?.evidenceId),
          evidenceRefs: aimxsUnique(governedRun?.policyResponse?.evidenceRefs),
          decisionStatus: normalizeAimxsValue(governedRun?.policyDecision, normalizeAimxsValue(governedRun?.policyResponse?.decision)),
          grantTokenPresent: governedRun?.policyGrantTokenPresent === true
        };
      }
      const proposals = listNativeToolProposals(sessionView);
      for (let proposalIndex = proposals.length - 1; proposalIndex >= 0; proposalIndex -= 1) {
        const governedRun = aimxsObject(proposals[proposalIndex]?.governedRun);
        const runId = normalizeAimxsValue(governedRun?.runId);
        if (!runId) {
          continue;
        }
        return {
          runId,
          requestRef: normalizeAimxsValue(turn?.requestId),
          sessionRef: normalizeAimxsValue(timeline?.session?.sessionId, normalizeAimxsValue(turn?.response?.sessionId)),
          taskRef: normalizeAimxsValue(timeline?.task?.taskId, normalizeAimxsValue(turn?.taskId, normalizeAimxsValue(currentThread?.taskId))),
          actorRef: normalizeAimxsValue(timeline?.selectedWorker?.adapterId, normalizeAimxsValue(timeline?.selectedWorker?.workerId)),
          providerRef: normalizeAimxsValue(governedRun?.selectedPolicyProvider, normalizeAimxsValue(governedRun?.policyResponse?.source)),
          routeRef: normalizeAimxsValue(turn?.response?.route),
          boundaryRef: normalizeAimxsValue(turn?.response?.boundaryProviderId),
          summary: normalizeAimxsValue(proposals[proposalIndex]?.summary, normalizeAimxsValue(turn?.prompt)),
          latestEvidenceRef: "",
          evidenceRefs: aimxsUnique(governedRun?.policyResponse?.evidenceRefs),
          decisionStatus: normalizeAimxsValue(governedRun?.policyDecision, normalizeAimxsValue(governedRun?.policyResponse?.decision)),
          grantTokenPresent: governedRun?.policyGrantTokenPresent === true
        };
      }
    }
    return {
      runId: "",
      requestRef: "",
      sessionRef: "",
      taskRef: normalizeAimxsValue(currentThread?.taskId),
      actorRef: "",
      providerRef: "",
      routeRef: "",
      boundaryRef: "",
      summary: "",
      latestEvidenceRef: "",
      evidenceRefs: [],
      decisionStatus: "",
      grantTokenPresent: false
    };
  };
  const latestApprovalRunId = () => {
    const items = getAimxsApprovalItems();
    const pending = items.find((item) => normalizeAimxsValue(item?.status).toUpperCase() === "PENDING");
    return normalizeAimxsValue(pending?.runId, normalizeAimxsValue(items[0]?.runId));
  };
  const latestIncidentRunId = () => {
    const items = getAimxsIncidentItems();
    return normalizeAimxsValue(items[0]?.runId);
  };
  const getAimxsSelectedRunId = () => {
    const selectedIncident =
      getAimxsIncidentItems().find((item) => normalizeAimxsValue(item?.id) === normalizeAimxsValue(incidentOpsViewState.selectedIncidentId)) ||
      null;
    const threadRun = extractThreadRunReference(operatorChatState.thread);
    return firstAimxsValue(
      aimxsSpineViewState.selectedRunId,
      normalizeAimxsValue(selectedIncident?.runId),
      normalizeAimxsValue(governanceOpsViewState.selectedRunId),
      normalizeAimxsValue(latestRunDetail?.runId),
      normalizeAimxsValue(threadRun?.runId),
      latestApprovalRunId(),
      latestIncidentRunId(),
      normalizeAimxsValue(getAimxsRunItems()[0]?.runId)
    );
  };
  const buildAimxsDecisionBindingSpineModel = (activeDomain = "") => {
    const selectedRunId = getAimxsSelectedRunId();
    const threadReference = extractThreadRunReference(operatorChatState.thread);
    const runItems = getAimxsRunItems();
    const approvalItems = getAimxsApprovalItems();
    const auditItems = getAimxsAuditItems();
    const incidentItems = getAimxsIncidentItems();
    const selectedRun =
      runItems.find((item) => normalizeAimxsValue(item?.runId) === selectedRunId) ||
      (normalizeAimxsValue(latestRunDetail?.runId) === selectedRunId ? latestRunDetail : null) ||
      store.getRunById(selectedRunId) ||
      {};
    const selectedApproval =
      approvalItems.find((item) => normalizeAimxsValue(item?.runId) === selectedRunId) ||
      store.getApprovalByRunID(selectedRunId) ||
      {};
    const selectedIncident =
      incidentItems.find((item) => normalizeAimxsValue(item?.id) === normalizeAimxsValue(aimxsSpineViewState.selectedIncidentEntryId)) ||
      incidentItems.find((item) => normalizeAimxsValue(item?.runId) === selectedRunId) ||
      null;
    const matchedAudit = auditItems
      .filter((item) => normalizeAimxsValue(item?.runId) === selectedRunId)
      .slice(0, 3)
      .map((item) =>
        firstAimxsValue(
          `${normalizeAimxsValue(item?.event || "audit")}@${normalizeAimxsValue(item?.ts || item?.timestamp)}`,
          normalizeAimxsValue(item?.event)
        )
      );
    const policyResponse = aimxsObject(selectedRun?.policyResponse);
    const evidenceBundleResponse = aimxsObject(selectedRun?.evidenceBundleResponse);
    const evidenceRecordResponse = aimxsObject(selectedRun?.evidenceRecordResponse);
    const incidentPackageId = normalizeAimxsValue(selectedIncident?.packageId);
    const incidentStatus = normalizeAimxsValue(selectedIncident?.filingStatus);
    const policyReasons = Array.isArray(policyResponse?.reasons) ? policyResponse.reasons : [];
    const scopeRef = aimxsScopeLabel(
      selectedRun?.tenantId,
      selectedRun?.projectId
    ) || aimxsScopeLabel(
      operatorChatState?.thread?.tenantId,
      operatorChatState?.thread?.projectId
    ) || aimxsScopeLabel(selectedIncident?.scope);
    const evidenceRefs = aimxsUnique([
      ...(Array.isArray(policyResponse?.evidenceRefs) ? policyResponse.evidenceRefs : []),
      normalizeAimxsValue(evidenceRecordResponse?.evidenceId),
      normalizeAimxsValue(threadReference?.latestEvidenceRef)
    ]);
    const requestedCapabilities = aimxsUnique(
      Array.isArray(selectedApproval?.requestedCapabilities)
        ? selectedApproval.requestedCapabilities
        : []
    );
    const receiptRef = firstAimxsValue(
      normalizeAimxsValue(selectedApproval?.approvalId),
      normalizeAimxsValue(evidenceBundleResponse?.bundleId),
      normalizeAimxsValue(evidenceRecordResponse?.evidenceId)
    );
    const stableRef = firstAimxsValue(
      normalizeAimxsValue(evidenceBundleResponse?.bundleId),
      normalizeAimxsValue(evidenceRecordResponse?.evidenceId),
      incidentPackageId
    );
    return createAimxsDecisionBindingSpine({
      activeDomain,
      sourceLabel: "correlated run",
      correlationRef: firstAimxsValue(selectedRunId, normalizeAimxsValue(selectedApproval?.approvalId), incidentPackageId),
      runId: selectedRunId,
      requestRef: firstAimxsValue(normalizeAimxsValue(selectedRun?.requestId), threadReference?.requestRef),
      approvalId: normalizeAimxsValue(selectedApproval?.approvalId),
      incidentEntryId: normalizeAimxsValue(selectedIncident?.id),
      actorRef: firstAimxsValue(threadReference?.actorRef, normalizeAimxsValue(session?.claims?.sub || session?.claims?.email || session?.claims?.client_id)),
      subjectRef: firstAimxsValue(threadReference?.sessionRef, threadReference?.taskRef, normalizeAimxsValue(selectedIncident?.packageId)),
      authorityRef: firstAimxsValue(agentOpsCurrentProfileId(), normalizeAimxsValue(selectedApproval?.tier)),
      authorityBasis: firstAimxsValue(latestSettingsSnapshot?.identity?.authorityBasis),
      scopeRef,
      providerRef: firstAimxsValue(normalizeAimxsValue(selectedRun?.selectedPolicyProvider), threadReference?.providerRef),
      routeRef: firstAimxsValue(threadReference?.routeRef, normalizeAimxsValue(selectedRun?.environment)),
      boundaryRef: firstAimxsValue(threadReference?.boundaryRef),
      grantRef: selectedRun?.policyGrantTokenPresent === true ? "policy_grant_token" : normalizeAimxsValue(selectedApproval?.approvalId),
      executionProfile: normalizeAimxsValue(selectedApproval?.targetExecutionProfile),
      grantReason: firstAimxsValue(
        normalizeAimxsValue(selectedApproval?.reason),
        normalizeAimxsValue(policyReasons[0]?.message),
        normalizeAimxsValue(selectedIncident?.handoffText)
      ),
      requestedCapabilities,
      decisionStatus: firstAimxsValue(
        normalizeAimxsValue(selectedApproval?.status),
        normalizeAimxsValue(selectedRun?.policyDecision),
        threadReference?.decisionStatus
      ),
      receiptRef,
      approvalReceiptRef: normalizeAimxsValue(selectedApproval?.approvalId),
      stableRef,
      bundleId: normalizeAimxsValue(evidenceBundleResponse?.bundleId),
      bundleStatus: normalizeAimxsValue(evidenceBundleResponse?.status, normalizeAimxsValue(selectedRun?.evidenceBundleStatus)),
      recordId: normalizeAimxsValue(evidenceRecordResponse?.evidenceId),
      recordStatus: normalizeAimxsValue(evidenceRecordResponse?.status, normalizeAimxsValue(selectedRun?.evidenceRecordStatus)),
      incidentPackageId,
      incidentStatus,
      replayRef: selectedRunId,
      sessionRef: firstAimxsValue(threadReference?.sessionRef, normalizeAimxsValue(latestRunDetail?.sessionId)),
      taskRef: firstAimxsValue(threadReference?.taskRef, normalizeAimxsValue(operatorChatState?.thread?.taskId)),
      evidenceRefs,
      latestEvidenceRef: firstAimxsValue(threadReference?.latestEvidenceRef, normalizeAimxsValue(evidenceRecordResponse?.evidenceId)),
      evidenceStatus: firstAimxsValue(
        normalizeAimxsValue(evidenceRecordResponse?.status),
        normalizeAimxsValue(evidenceBundleResponse?.status),
        incidentStatus
      ),
      auditRefs: matchedAudit,
      summary: firstAimxsValue(
        normalizeAimxsValue(selectedIncident?.handoffText),
        normalizeAimxsValue(policyReasons[0]?.message),
        threadReference?.summary
      )
    });
  };
  let renderAgentOpsPanel = () => {};
  const syncAimxsSpinePanels = () => {
    renderAgentOpsPanel();
    renderGovernanceOpsPanel();
    renderAuditOpsPanel();
    renderEvidenceOpsPanel();
    renderIncidentOpsPanel();
  };
  const setAimxsSpineSelection = (runId = "", incidentEntryId = "", options = {}) => {
    aimxsSpineViewState = {
      selectedRunId: normalizeAimxsValue(runId),
      selectedIncidentEntryId: normalizeAimxsValue(incidentEntryId)
    };
    if (options.render === true) {
      syncAimxsSpinePanels();
    }
  };
  const findIncidentEntryByRunId = (runId = "") =>
    getAimxsIncidentItems().find((item) => normalizeAimxsValue(item?.runId) === normalizeAimxsValue(runId)) || null;
  syncIncidentOpsSelectionAfterHistoryChange = function syncIncidentOpsSelectionAfterHistoryChangeBound(entryId = "") {
    const items = store.getIncidentPackageHistory();
    const candidateId = String(entryId || incidentOpsViewState.selectedIncidentId || "").trim();
    const resolvedEntry =
      items.find((item) => String(item?.id || "").trim() === candidateId) || items[0] || null;
    setAimxsSpineSelection(resolvedEntry?.runId, resolvedEntry?.id, { render: false });
    incidentOpsViewState = {
      ...incidentOpsViewState,
      selectedIncidentId: String(resolvedEntry?.id || "").trim()
    };
    renderIncidentOpsPanel();
  };
  renderAgentOpsPanel = () => {
    renderAgentOpsPage(ui, latestSettingsSnapshot, {
      ...operatorChatState,
      agentProfileId:
        String(
          operatorChatState.agentProfileId ||
            initialAgentID ||
            latestSettingsSnapshot?.integrations?.selectedAgentProfileId ||
            ""
        )
          .trim()
          .toLowerCase(),
      aimxsDecisionBindingSpine: buildAimxsDecisionBindingSpineModel("agentops")
    });
  };
  const currentWorkspaceView = () =>
    normalizeWorkspaceView(ui.workspaceLayout?.dataset?.workspaceView || "", "companionops");
  renderCompanionHandoffBanner = () => {
    if (!(ui.companionHandoffBanner instanceof HTMLElement)) {
      return;
    }
    const handoff = companionOpsViewState.handoffContext;
    const selectedView = currentWorkspaceView();
    if (!handoff || selectedView === "companionops") {
      ui.companionHandoffBanner.innerHTML = "";
      ui.companionHandoffBanner.hidden = true;
      return;
    }
    const chips = [
      handoff.runId ? `<span class="chip chip-neutral chip-compact">run=${escapeHTML(handoff.runId)}</span>` : "",
      handoff.approvalId
        ? `<span class="chip chip-neutral chip-compact">approval=${escapeHTML(handoff.approvalId)}</span>`
        : "",
      handoff.incidentId
        ? `<span class="chip chip-neutral chip-compact">incident=${escapeHTML(handoff.incidentId)}</span>`
        : "",
      handoff.sourceClient
        ? `<span class="chip chip-neutral chip-compact">client=${escapeHTML(handoff.sourceClient)}</span>`
        : ""
    ]
      .filter(Boolean)
      .join("");
    ui.companionHandoffBanner.innerHTML = `
      <div class="companion-handoff-summary">
        <span class="native-launcher-status-badge">Opened From CompanionOps</span>
        <span class="chip chip-neutral chip-compact">${escapeHTML(
          String(handoff.kind || "handoff").trim() || "handoff"
        )}</span>
        ${chips}
      </div>
      <div class="companion-handoff-copy">Workbench depth is open for the selected handoff. Use the explicit return action when you are done reviewing or approving.</div>
      <div class="companion-handoff-actions">
        <button class="btn btn-secondary btn-small" type="button" data-companion-return-action="return">Return To Companion</button>
      </div>
    `;
    ui.companionHandoffBanner.hidden = false;
  };
  const setCompanionOpsFeedback = (tone, message) => {
    companionOpsViewState = {
      ...companionOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderHomePanel();
  };
  const buildCompanionRenderContext = (snapshot = triageSnapshot) => ({
    ...(snapshot && typeof snapshot === "object" ? snapshot : triageSnapshot),
    nativeShell: config.nativeShell,
    nativeGatewayHolds: Array.isArray(config.nativeGatewayHolds) ? config.nativeGatewayHolds : [],
    selectedAgentProfileId: latestSettingsSnapshot?.integrations?.selectedAgentProfileId || "",
    lastWorkbenchDomain: companionOpsViewState.lastWorkbenchDomain,
    companionFeedback: companionOpsViewState.feedback,
    handoffContext: companionOpsViewState.handoffContext
  });
  const renderHomePanel = (options = {}) => {
    const snapshot = options.snapshot || triageSnapshot;
    if (options.snapshot) {
      triageSnapshot = options.snapshot;
    }
    renderHomeOpsPage(ui, buildCompanionRenderContext(snapshot));
  };
  const renderHomeErrorPanel = (message, options = {}) => {
    if (options.snapshot) {
      triageSnapshot = options.snapshot;
    }
    renderHomeOpsEmptyState(ui, {
      tone: "error",
      title: "CompanionOps",
      message
    });
  };
  const renderContextPanel = () => {
    renderContextBar(triageSnapshot, session, latestSettingsSnapshot);
  };
  const renderIdentityOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestIdentityOpsContext = context;
    }
    const settingsPayload =
      latestIdentityOpsContext?.settings && typeof latestIdentityOpsContext.settings === "object"
        ? latestIdentityOpsContext.settings
        : latestSettingsSnapshot;
    const sessionPayload =
      latestIdentityOpsContext?.session && typeof latestIdentityOpsContext.session === "object"
        ? latestIdentityOpsContext.session
        : session;
    renderIdentityOpsPage(
      ui,
      {
        ...settingsPayload,
        viewState: identityOpsViewState
      },
      sessionPayload
    );
  };
  const renderGuardrailOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestGuardrailOpsContext = context;
    }
    renderGuardrailOpsPage(ui, {
      ...latestGuardrailOpsContext,
      viewState: guardrailOpsViewState
    });
  };
  const renderGovernanceOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestGovernanceOpsContext = context;
    }
    renderGovernanceOpsPage(ui, {
      ...latestGovernanceOpsContext,
      adminQueueItems: getAdminLifecycleQueueItems(),
      aimxsDecisionBindingSpine: buildAimxsDecisionBindingSpineModel("governanceops"),
      viewState: governanceOpsViewState
    });
  };
  const renderRuntimeOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestRuntimeOpsContext = context;
    }
    renderRuntimeOpsPage(ui, latestRuntimeOpsContext, session, {
      viewState: runtimeOpsViewState
    });
  };
  const renderPlatformOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestPlatformOpsContext = context;
    }
    renderPlatformOpsPage(ui, {
      ...latestPlatformOpsContext,
      viewState: platformOpsViewState
    });
  };
  const renderAuditOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestAuditOpsContext = context;
    }
    renderAuditOpsPage(ui, {
      ...latestAuditOpsContext,
      adminQueueItems: getAdminLifecycleQueueItems(),
      aimxsDecisionBindingSpine: buildAimxsDecisionBindingSpineModel("auditops"),
      incidentHistory: {
        items: store.getIncidentPackageHistory()
      },
      selectedRunDetail: latestRunDetail,
      viewState: auditOpsViewState
    });
  };
  const renderEvidenceOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestEvidenceOpsContext = context;
    }
    renderEvidenceOpsPage(ui, {
      ...latestEvidenceOpsContext,
      adminQueueItems: getAdminLifecycleQueueItems(),
      aimxsDecisionBindingSpine: buildAimxsDecisionBindingSpineModel("evidenceops"),
      incidentHistory: {
        items: store.getIncidentPackageHistory()
      },
      viewState: evidenceOpsViewState
    });
  };
  const renderComplianceOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestComplianceOpsContext = context;
    }
    renderComplianceOpsPage(ui, {
      ...latestComplianceOpsContext,
      viewState: complianceOpsViewState
    });
  };
  const renderNetworkOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestNetworkOpsContext = context;
    }
    renderNetworkOpsPage(ui, {
      ...latestNetworkOpsContext,
      viewState: networkOpsViewState
    });
  };
  const renderPolicyOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestPolicyOpsContext = context;
    }
    renderPolicyOpsPage(ui, {
      ...latestPolicyOpsContext,
      viewState: policyOpsViewState
    });
  };
  const syncAdminTracePanels = () => {
    renderGovernanceOpsPanel();
    renderAuditOpsPanel();
    renderEvidenceOpsPanel();
  };
  const renderIncidentOpsPanel = (context = null) => {
    if (context && typeof context === "object") {
      latestIncidentOpsContext = context;
    }
    renderIncidentOpsPage(ui, {
      ...latestIncidentOpsContext,
      aimxsDecisionBindingSpine: buildAimxsDecisionBindingSpineModel("incidentops"),
      incidentHistory: {
        items: store.getIncidentPackageHistory()
      },
      viewState: incidentOpsViewState
    });
  };
  const renderLogOpsPanel = (context = null) => {
    const nextContext = context && typeof context === "object" ? context : {};
    renderLogOpsPage(ui, {
      nativeShell: config.nativeShell,
      ...nextContext,
      viewState: logOpsViewState
    });
  };
  const setLogOpsFeedback = (tone, message) => {
    logOpsViewState = {
      ...logOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderLogOpsPanel();
  };
  const openLogOpsView = () => {
    setWorkspaceView("logops", true);
    renderLogOpsPanel();
    focusRenderedRegion(ui.logOpsContent, { scroll: false });
  };
  const openNativePathFromLogOps = async (path, label = "Artifact") => {
    const targetPath = String(path || "").trim();
    if (!targetPath) {
      setLogOpsFeedback("warn", `${label} path is unavailable in this shell.`);
      return false;
    }
    const bindings = nativeBindings();
    if (!bindings || typeof bindings.NativeOpenPath !== "function") {
      setLogOpsFeedback(
        "warn",
        "Open path is only available from the installed desktop shell. Use LogOps from the app bundle, not the browser harness."
      );
      return false;
    }
    try {
      await bindings.NativeOpenPath(targetPath);
      setLogOpsFeedback("ok", `${label} opened from LogOps.`);
      return true;
    } catch (error) {
      setLogOpsFeedback("error", `${label} open failed: ${error.message}`);
      return false;
    }
  };
  const setGovernanceOpsFeedback = (tone, message) => {
    governanceOpsViewState = {
      ...governanceOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderGovernanceOpsPanel();
  };
  const setGovernanceOpsSelection = (runID, options = {}) => {
    const normalizedRunID = String(runID || "").trim();
    const nextSelectedRunId =
      governanceOpsViewState.selectedRunId && governanceOpsViewState.selectedRunId === normalizedRunID && options.force !== true
        ? ""
        : normalizedRunID;
    if (options.syncSpine !== false) {
      setAimxsSpineSelection(nextSelectedRunId, aimxsSpineViewState.selectedIncidentEntryId, { render: false });
    }
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedRunId: nextSelectedRunId
    };
    if (options.render === false) {
      return;
    }
    if (options.syncSpine !== false) {
      syncAimxsSpinePanels();
      return;
    }
    renderGovernanceOpsPanel();
  };
  const setGovernanceOpsAdminSelection = (changeId) => {
    const normalizedChangeId = String(changeId || "").trim();
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: normalizedChangeId
    };
    renderGovernanceOpsPanel();
  };
  const setComplianceOpsFeedback = (tone, message) => {
    complianceOpsViewState = {
      ...complianceOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderComplianceOpsPanel();
  };
  const setComplianceOpsRecoveryReason = (value) => {
    complianceOpsViewState = {
      ...complianceOpsViewState,
      recoveryReason: String(value || "").trimStart()
    };
  };
  const complianceOpsActorRef = () =>
    String(session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || "").trim() ||
    "compliance-operator";
  const networkOpsActorRef = () =>
    String(session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || "").trim() ||
    "network-operator";
  const setIdentityOpsFeedback = (tone, message) => {
    identityOpsViewState = {
      ...identityOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderIdentityOpsPanel();
  };
  const setIdentityOpsRecoveryReason = (value) => {
    identityOpsViewState = {
      ...identityOpsViewState,
      recoveryReason: String(value || "").trimStart()
    };
  };
  const identityOpsActorRef = () => {
    const claims =
      latestIdentityOpsContext?.session?.claims && typeof latestIdentityOpsContext.session.claims === "object"
        ? latestIdentityOpsContext.session.claims
        : session?.claims && typeof session.claims === "object"
          ? session.claims
          : {};
    return (
      String(claims?.sub || claims?.email || claims?.client_id || "").trim() ||
      "identity-admin"
    );
  };
  const getIdentityOpsDefaults = () => {
    const settingsPayload =
      latestIdentityOpsContext?.settings && typeof latestIdentityOpsContext.settings === "object"
        ? latestIdentityOpsContext.settings
        : latestSettingsSnapshot;
    const runtimeIdentity =
      settingsPayload?.identity && typeof settingsPayload.identity === "object" ? settingsPayload.identity : {};
    const identity =
      runtimeIdentity?.identity && typeof runtimeIdentity.identity === "object" ? runtimeIdentity.identity : {};
    const claims =
      latestIdentityOpsContext?.session?.claims && typeof latestIdentityOpsContext.session.claims === "object"
        ? latestIdentityOpsContext.session.claims
        : session?.claims && typeof session.claims === "object"
          ? session.claims
          : {};
    const tenantIds = Array.isArray(identity?.tenantIds)
      ? identity.tenantIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const projectIds = Array.isArray(identity?.projectIds)
      ? identity.projectIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const subject = String(identity?.subject || claims?.sub || claims?.email || identity?.clientId || claims?.client_id || "").trim();
    const targetScope =
      [tenantIds[0], projectIds[0]].filter(Boolean).join(" / ") ||
      String(settingsPayload?.environment || "").trim() ||
      "workspace";
    return {
      subjectId: subject,
      targetScope
    };
  };
  const normalizeIdentityOpsDraft = (kind, draft = null) => {
    const defaults = getIdentityOpsDefaults();
    const input = draft && typeof draft === "object" ? draft : {};
    if (String(kind || "").trim().toLowerCase() === "grant") {
      return {
        subjectId: String(input.subjectId || defaults.subjectId || "").trim(),
        targetScope: String(input.targetScope || defaults.targetScope || "").trim(),
        changeKind: String(input.changeKind || "issue").trim().toLowerCase() || "issue",
        grantKey: String(input.grantKey || "").trim(),
        delegationMode: String(input.delegationMode || "governed").trim().toLowerCase() || "governed",
        reason: String(input.reason || "").trim()
      };
    }
    return {
      subjectId: String(input.subjectId || defaults.subjectId || "").trim(),
      targetScope: String(input.targetScope || defaults.targetScope || "").trim(),
      authorityTier: String(input.authorityTier || "workspace_operator").trim() || "workspace_operator",
      reason: String(input.reason || "").trim()
    };
  };
  const getIdentityOpsDraft = (kind) => {
    const normalizedKind = String(kind || "").trim().toLowerCase();
    return normalizedKind === "grant"
      ? normalizeIdentityOpsDraft("grant", identityOpsViewState.grantDraft)
      : normalizeIdentityOpsDraft("authority", identityOpsViewState.authorityDraft);
  };
  const setIdentityOpsDraft = (kind, draft, options = {}) => {
    const normalizedKind = String(kind || "").trim().toLowerCase() === "grant" ? "grant" : "authority";
    const nextDraft = normalizeIdentityOpsDraft(normalizedKind, draft);
    identityOpsViewState = {
      ...identityOpsViewState,
      [normalizedKind === "grant" ? "grantDraft" : "authorityDraft"]: nextDraft,
      latestSimulation:
        identityOpsViewState.latestSimulation?.kind === normalizedKind && options.keepSimulation !== true
          ? null
          : identityOpsViewState.latestSimulation,
      feedback: options.clearFeedback === true ? null : identityOpsViewState.feedback
    };
  };
  const updateIdentityOpsDraftField = (kind, field, value) => {
    const normalizedKind = String(kind || "").trim().toLowerCase() === "grant" ? "grant" : "authority";
    const currentDraft = getIdentityOpsDraft(normalizedKind);
    const nextValue = String(value || "").trim();
    setIdentityOpsDraft(
      normalizedKind,
      {
        ...currentDraft,
        [field]: nextValue
      },
      {
        clearFeedback: true
      }
    );
  };
  const findIdentityOpsQueueItem = (changeId) => {
    const normalizedChangeId = String(changeId || "").trim();
    if (!normalizedChangeId) {
      return null;
    }
    return (
      (Array.isArray(identityOpsViewState.queueItems) ? identityOpsViewState.queueItems : []).find(
        (item) => String(item?.id || "").trim() === normalizedChangeId
      ) || null
    );
  };
  const upsertIdentityOpsQueueItem = (nextItem) => {
    const item = nextItem && typeof nextItem === "object" ? nextItem : null;
    const changeId = String(item?.id || "").trim();
    if (!changeId) {
      return null;
    }
    const existingItems = Array.isArray(identityOpsViewState.queueItems) ? identityOpsViewState.queueItems : [];
    const nextItems = [];
    let replaced = false;
    existingItems.forEach((entry) => {
      const entryId = String(entry?.id || "").trim();
      if (entryId === changeId) {
        nextItems.push({
          ...entry,
          ...item
        });
        replaced = true;
        return;
      }
      nextItems.push(entry);
    });
    if (!replaced) {
      nextItems.unshift(item);
    }
    identityOpsViewState = {
      ...identityOpsViewState,
      queueItems: nextItems
    };
    syncAdminTracePanels();
    return nextItems.find((entry) => String(entry?.id || "").trim() === changeId) || null;
  };
  const getIdentityOpsSelectedQueueItemForKind = (kind) => {
    const selectedItem = findIdentityOpsQueueItem(identityOpsViewState.selectedAdminChangeId);
    return selectedItem && String(selectedItem.kind || "").trim().toLowerCase() === String(kind || "").trim().toLowerCase()
      ? selectedItem
      : null;
  };
  const buildIdentityOpsQueueItem = (kind, draft, options = {}) => {
    const normalizedKind = String(kind || "").trim().toLowerCase() === "grant" ? "grant" : "authority";
    const nextDraft = normalizeIdentityOpsDraft(normalizedKind, draft);
    const selectedItem = getIdentityOpsSelectedQueueItemForKind(normalizedKind);
    const existingId = String(options.id || selectedItem?.id || "").trim();
    const changeId =
      existingId ||
      `${normalizedKind}-change-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const requestedAction =
      normalizedKind === "grant"
        ? `${nextDraft.changeKind} ${nextDraft.grantKey || "grant"}`
        : `set ${nextDraft.authorityTier || "authority"}`;
    const summary =
      normalizedKind === "grant"
        ? `${nextDraft.changeKind || "issue"} ${nextDraft.grantKey || "grant"} for ${nextDraft.subjectId || "subject"} @ ${nextDraft.targetScope || "scope"}`
        : `${nextDraft.authorityTier || "authority"} for ${nextDraft.subjectId || "subject"} @ ${nextDraft.targetScope || "scope"}`;
    return {
      id: changeId,
      kind: normalizedKind,
      label: normalizedKind === "grant" ? "Grant And Delegation Draft" : "Authority Change Draft",
      requestedAction,
      subjectId: nextDraft.subjectId,
      targetScope: nextDraft.targetScope,
      status: String(options.status || selectedItem?.status || "draft").trim().toLowerCase(),
      reason: nextDraft.reason,
      summary,
      simulationSummary: String(options.simulationSummary || selectedItem?.simulationSummary || "").trim(),
      createdAt: String(options.createdAt || selectedItem?.createdAt || new Date().toISOString()).trim(),
      simulatedAt: String(options.simulatedAt || selectedItem?.simulatedAt || "").trim(),
      updatedAt: String(options.updatedAt || new Date().toISOString()).trim(),
      routedAt: String(options.routedAt || selectedItem?.routedAt || "").trim(),
      decision:
        options.decision === null
          ? null
          : options.decision || (selectedItem?.decision && typeof selectedItem.decision === "object" ? selectedItem.decision : null),
      execution:
        options.execution === null
          ? null
          : options.execution || (selectedItem?.execution && typeof selectedItem.execution === "object" ? selectedItem.execution : null),
      receipt:
        options.receipt === null
          ? null
          : options.receipt || (selectedItem?.receipt && typeof selectedItem.receipt === "object" ? selectedItem.receipt : null),
      rollback:
        options.rollback === null
          ? null
          : options.rollback || (selectedItem?.rollback && typeof selectedItem.rollback === "object" ? selectedItem.rollback : null)
    };
  };
  const validateIdentityOpsDraft = (kind, draft) => {
    const normalizedKind = String(kind || "").trim().toLowerCase() === "grant" ? "grant" : "authority";
    const nextDraft = normalizeIdentityOpsDraft(normalizedKind, draft);
    if (!nextDraft.subjectId) {
      return "Subject is required before saving an identity admin proposal.";
    }
    if (!nextDraft.targetScope) {
      return "Target scope is required before saving an identity admin proposal.";
    }
    if (!nextDraft.reason) {
      return "Reason is required before saving an identity admin proposal.";
    }
    if (normalizedKind === "grant" && !nextDraft.grantKey) {
      return "Grant key is required before saving a grant or delegation proposal.";
    }
    return "";
  };
  const buildIdentityOpsSimulation = (item, draft) => {
    const normalizedItem = item && typeof item === "object" ? item : {};
    const normalizedKind = String(normalizedItem.kind || "").trim().toLowerCase() === "grant" ? "grant" : "authority";
    const nextDraft = normalizeIdentityOpsDraft(normalizedKind, draft);
    const defaults = getIdentityOpsDefaults();
    const settingsPayload =
      latestIdentityOpsContext?.settings && typeof latestIdentityOpsContext.settings === "object"
        ? latestIdentityOpsContext.settings
        : latestSettingsSnapshot;
    const runtimeIdentity =
      settingsPayload?.identity && typeof settingsPayload.identity === "object" ? settingsPayload.identity : {};
    const touchesActiveSubject = nextDraft.subjectId && nextDraft.subjectId === defaults.subjectId;
    const touchesActiveScope = nextDraft.targetScope && nextDraft.targetScope === defaults.targetScope;
    const changeIsRevoke = normalizedKind === "grant" && nextDraft.changeKind === "revoke";
    const tone = touchesActiveSubject || touchesActiveScope || changeIsRevoke ? "warn" : "info";
    const findings = [
      "Execution is blocked in this slice. Governance approval is required before any live identity mutation can occur."
    ];
    if (touchesActiveSubject) {
      findings.push("This proposal targets the currently active governed identity.");
    }
    if (touchesActiveScope) {
      findings.push("This proposal touches the current tenant/project scope.");
    }
    if (changeIsRevoke) {
      findings.push("Revoke proposals may remove currently visible permissions from the active posture.");
    }
    return {
      changeId: String(normalizedItem.id || "").trim(),
      kind: normalizedKind,
      tone,
      title: normalizedKind === "grant" ? "Grant and delegation simulation" : "Authority change simulation",
      summary:
        normalizedKind === "grant"
          ? `Preview only. This ${nextDraft.changeKind} proposal requires GovernanceOps approval before a grant or delegation change can execute.`
          : "Preview only. This authority proposal requires GovernanceOps approval before a live authority mutation can execute.",
      updatedAt: new Date().toISOString(),
      facts: [
        { label: "subject", value: nextDraft.subjectId, code: true },
        { label: "target", value: nextDraft.targetScope, code: true },
        {
          label: normalizedKind === "grant" ? "grant" : "authority",
          value: normalizedKind === "grant" ? nextDraft.grantKey : nextDraft.authorityTier,
          code: true
        },
        {
          label: normalizedKind === "grant" ? "change" : "policy rules",
          value: normalizedKind === "grant" ? nextDraft.changeKind : String(runtimeIdentity?.policyRuleCount || 0)
        },
        { label: "trace runs", value: String(settingsPayload?.identityTraceability?.runCount || 0) },
        { label: "trace approvals", value: String(settingsPayload?.identityTraceability?.approvalCount || 0) }
      ],
      findings
    };
  };
  const buildIdentityOpsGovernanceReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Governance Decision Receipt",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `subject_id=${String(queueItem.subjectId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `decision=${String(decision.status || "").trim()}`,
      `decision_id=${String(decision.decisionId || "").trim()}`,
      `approval_receipt_id=${String(decision.approvalReceiptId || "").trim()}`,
      `decided_at=${String(decision.decidedAt || "").trim()}`,
      `actor_ref=${String(decision.actorRef || "").trim()}`,
      `reason=${String(decision.reason || "").trim()}`
    ].join("\n");
  };
  const buildIdentityOpsAdminReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    return [
      "EpydiosOps IdentityOps Admin Change Receipt",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_receipt_id=${String(receipt.receiptId || "").trim()}`,
      `admin_change_execution_id=${String(execution.executionId || "").trim()}`,
      `approval_receipt_id=${String(receipt.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `stable_ref=${String(receipt.stableRef || "").trim()}`,
      `status=${String(queueItem.status || "").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `subject_id=${String(queueItem.subjectId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `executed_at=${String(execution.executedAt || "").trim()}`,
      `issued_at=${String(receipt.issuedAt || "").trim()}`,
      `actor_ref=${String(execution.actorRef || "").trim()}`,
      `summary=${String(receipt.summary || execution.summary || queueItem.summary || "").trim()}`
    ].join("\n");
  };
  const buildIdentityOpsRollbackReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const rollback = queueItem?.rollback && typeof queueItem.rollback === "object" ? queueItem.rollback : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps IdentityOps Recovery Receipt",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "").trim()}`,
      `admin_change_rollback_id=${String(rollback.rollbackId || "").trim()}`,
      `action=${String(rollback.action || "").trim()}`,
      `status=${String(rollback.status || "").trim()}`,
      `approval_receipt_id=${String(rollback.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `admin_change_receipt_id=${String(rollback.adminReceiptId || receipt.receiptId || "").trim()}`,
      `execution_id=${String(rollback.executionId || execution.executionId || "").trim()}`,
      `stable_ref=${String(rollback.stableRef || "").trim()}`,
      `rolled_back_at=${String(rollback.rolledBackAt || "").trim()}`,
      `actor_ref=${String(rollback.actorRef || "").trim()}`,
      `reason=${String(rollback.reason || "").trim()}`,
      `summary=${String(rollback.summary || "").trim()}`
    ].join("\n");
  };
  const buildPlatformOpsGovernanceReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Platform Governance Receipt",
      `owner_domain=platformops`,
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "platform").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `release_ref=${String(queueItem.releaseRef || queueItem.subjectId || "").trim()}`,
      `environment=${String(queueItem.environment || "").trim()}`,
      `deployment_target=${String(queueItem.deploymentTarget || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `decision=${String(decision.status || "").trim()}`,
      `decision_id=${String(decision.decisionId || "").trim()}`,
      `approval_receipt_id=${String(decision.approvalReceiptId || "").trim()}`,
      `decided_at=${String(decision.decidedAt || "").trim()}`,
      `actor_ref=${String(decision.actorRef || "").trim()}`,
      `reason=${String(decision.reason || "").trim()}`
    ].join("\n");
  };
  const buildPlatformOpsAdminReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    return [
      "EpydiosOps Platform Admin Receipt",
      `owner_domain=platformops`,
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "platform").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `release_ref=${String(queueItem.releaseRef || queueItem.subjectId || "").trim()}`,
      `environment=${String(queueItem.environment || "").trim()}`,
      `deployment_target=${String(queueItem.deploymentTarget || "").trim()}`,
      `approval_receipt_id=${String(receipt.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `execution_id=${String(execution.executionId || "").trim()}`,
      `executed_at=${String(execution.executedAt || "").trim()}`,
      `execution_status=${String(execution.status || "").trim()}`,
      `receipt_id=${String(receipt.receiptId || "").trim()}`,
      `issued_at=${String(receipt.issuedAt || "").trim()}`,
      `stable_ref=${String(receipt.stableRef || "").trim()}`,
      `summary=${String(receipt.summary || execution.summary || queueItem.summary || "").trim()}`
    ].join("\n");
  };
  const buildPlatformOpsRollbackReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const rollback = queueItem?.rollback && typeof queueItem.rollback === "object" ? queueItem.rollback : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Platform Recovery Receipt",
      `owner_domain=platformops`,
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "platform").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `release_ref=${String(queueItem.releaseRef || queueItem.subjectId || "").trim()}`,
      `environment=${String(queueItem.environment || "").trim()}`,
      `deployment_target=${String(queueItem.deploymentTarget || "").trim()}`,
      `rollback_id=${String(rollback.rollbackId || "").trim()}`,
      `action=${String(rollback.action || "").trim()}`,
      `status=${String(rollback.status || "").trim()}`,
      `approval_receipt_id=${String(rollback.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `admin_change_receipt_id=${String(rollback.adminReceiptId || receipt.receiptId || "").trim()}`,
      `execution_id=${String(rollback.executionId || execution.executionId || "").trim()}`,
      `stable_ref=${String(rollback.stableRef || "").trim()}`,
      `rolled_back_at=${String(rollback.rolledBackAt || "").trim()}`,
      `actor_ref=${String(rollback.actorRef || "").trim()}`,
      `reason=${String(rollback.reason || "").trim()}`,
      `summary=${String(rollback.summary || "").trim()}`
    ].join("\n");
  };
  const buildGuardrailOpsGovernanceReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Guardrail Governance Receipt",
      "owner_domain=guardrailops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "guardrail").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `execution_profile=${String(queueItem.executionProfile || queueItem.subjectId || "").trim()}`,
      `safety_boundary=${String(queueItem.safetyBoundary || "").trim()}`,
      `proposed_state=${String(queueItem.proposedState || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `decision=${String(decision.status || "").trim()}`,
      `decision_id=${String(decision.decisionId || "").trim()}`,
      `approval_receipt_id=${String(decision.approvalReceiptId || "").trim()}`,
      `decided_at=${String(decision.decidedAt || "").trim()}`,
      `actor_ref=${String(decision.actorRef || "").trim()}`,
      `reason=${String(decision.reason || "").trim()}`
    ].join("\n");
  };
  const buildGuardrailOpsAdminReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    return [
      "EpydiosOps Guardrail Admin Receipt",
      "owner_domain=guardrailops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "guardrail").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `execution_profile=${String(queueItem.executionProfile || queueItem.subjectId || "").trim()}`,
      `safety_boundary=${String(queueItem.safetyBoundary || "").trim()}`,
      `proposed_state=${String(queueItem.proposedState || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `approval_receipt_id=${String(receipt.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `execution_id=${String(execution.executionId || "").trim()}`,
      `executed_at=${String(execution.executedAt || "").trim()}`,
      `execution_status=${String(execution.status || "").trim()}`,
      `receipt_id=${String(receipt.receiptId || "").trim()}`,
      `issued_at=${String(receipt.issuedAt || "").trim()}`,
      `stable_ref=${String(receipt.stableRef || "").trim()}`,
      `summary=${String(receipt.summary || execution.summary || queueItem.summary || "").trim()}`
    ].join("\n");
  };
  const buildPolicyOpsGovernanceReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Policy Governance Receipt",
      "owner_domain=policyops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "policy").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `change_kind=${String(queueItem.changeKind || "").trim()}`,
      `pack_id=${String(queueItem.packId || queueItem.subjectId || "").trim()}`,
      `provider_id=${String(queueItem.providerId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `decision=${String(decision.status || "").trim()}`,
      `decision_id=${String(decision.decisionId || "").trim()}`,
      `approval_receipt_id=${String(decision.approvalReceiptId || "").trim()}`,
      `decided_at=${String(decision.decidedAt || "").trim()}`,
      `actor_ref=${String(decision.actorRef || "").trim()}`,
      `reason=${String(decision.reason || "").trim()}`
    ].join("\n");
  };
  const buildPolicyOpsAdminReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    return [
      "EpydiosOps Policy Admin Receipt",
      "owner_domain=policyops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "policy").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `change_kind=${String(queueItem.changeKind || "").trim()}`,
      `pack_id=${String(queueItem.packId || queueItem.subjectId || "").trim()}`,
      `provider_id=${String(queueItem.providerId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `approval_receipt_id=${String(receipt.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `execution_id=${String(execution.executionId || "").trim()}`,
      `executed_at=${String(execution.executedAt || "").trim()}`,
      `execution_status=${String(execution.status || "").trim()}`,
      `receipt_id=${String(receipt.receiptId || "").trim()}`,
      `issued_at=${String(receipt.issuedAt || "").trim()}`,
      `stable_ref=${String(receipt.stableRef || "").trim()}`,
      `summary=${String(receipt.summary || execution.summary || queueItem.summary || "").trim()}`
    ].join("\n");
  };
  const buildPolicyOpsRollbackReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const rollback = queueItem?.rollback && typeof queueItem.rollback === "object" ? queueItem.rollback : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Policy Rollback Receipt",
      "owner_domain=policyops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "policy").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `change_kind=${String(queueItem.changeKind || "").trim()}`,
      `pack_id=${String(queueItem.packId || queueItem.subjectId || "").trim()}`,
      `provider_id=${String(queueItem.providerId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `approval_receipt_id=${String(rollback.approvalReceiptId || receipt.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `admin_receipt_id=${String(rollback.adminReceiptId || receipt.receiptId || "").trim()}`,
      `execution_id=${String(rollback.executionId || execution.executionId || "").trim()}`,
      `rollback_id=${String(rollback.rollbackId || "").trim()}`,
      `rolled_back_at=${String(rollback.rolledBackAt || "").trim()}`,
      `rollback_status=${String(rollback.status || "").trim()}`,
      `stable_ref=${String(rollback.stableRef || "").trim()}`,
      `reason=${String(rollback.reason || "").trim()}`,
      `summary=${String(rollback.summary || "").trim()}`
    ].join("\n");
  };
  const buildComplianceOpsGovernanceReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Compliance Governance Receipt",
      "owner_domain=complianceops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "compliance").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `change_kind=${String(queueItem.changeKind || "").trim()}`,
      `proposal=${String(queueItem.subjectId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `control_boundary=${String(queueItem.controlBoundary || "").trim()}`,
      `decision=${String(decision.status || "").trim()}`,
      `decision_id=${String(decision.decisionId || "").trim()}`,
      `approval_receipt_id=${String(decision.approvalReceiptId || "").trim()}`,
      `decided_at=${String(decision.decidedAt || "").trim()}`,
      `actor_ref=${String(decision.actorRef || "").trim()}`,
      `reason=${String(decision.reason || "").trim()}`
    ].join("\n");
  };
  const buildComplianceOpsAdminReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    return [
      "EpydiosOps Compliance Admin Receipt",
      "owner_domain=complianceops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "compliance").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `change_kind=${String(queueItem.changeKind || "").trim()}`,
      `proposal=${String(queueItem.subjectId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `control_boundary=${String(queueItem.controlBoundary || "").trim()}`,
      `approval_receipt_id=${String(receipt.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `execution_id=${String(execution.executionId || "").trim()}`,
      `executed_at=${String(execution.executedAt || "").trim()}`,
      `execution_status=${String(execution.status || "").trim()}`,
      `receipt_id=${String(receipt.receiptId || "").trim()}`,
      `issued_at=${String(receipt.issuedAt || "").trim()}`,
      `stable_ref=${String(receipt.stableRef || "").trim()}`,
      `summary=${String(receipt.summary || execution.summary || queueItem.summary || "").trim()}`
    ].join("\n");
  };
  const buildComplianceOpsRecoveryReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const rollback = queueItem?.rollback && typeof queueItem.rollback === "object" ? queueItem.rollback : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Compliance Recovery Receipt",
      "owner_domain=complianceops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "compliance").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `change_kind=${String(queueItem.changeKind || "").trim()}`,
      `proposal=${String(queueItem.subjectId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `control_boundary=${String(queueItem.controlBoundary || "").trim()}`,
      `recovery_id=${String(rollback.rollbackId || "").trim()}`,
      `action=${String(rollback.action || "").trim()}`,
      `status=${String(rollback.status || "").trim()}`,
      `approval_receipt_id=${String(rollback.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `admin_receipt_id=${String(rollback.adminReceiptId || receipt.receiptId || "").trim()}`,
      `execution_id=${String(rollback.executionId || execution.executionId || "").trim()}`,
      `stable_ref=${String(rollback.stableRef || "").trim()}`,
      `recorded_at=${String(rollback.rolledBackAt || "").trim()}`,
      `actor_ref=${String(rollback.actorRef || "").trim()}`,
      `reason=${String(rollback.reason || "").trim()}`,
      `summary=${String(rollback.summary || "").trim()}`
    ].join("\n");
  };
  const buildGuardrailOpsRollbackReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const rollback = queueItem?.rollback && typeof queueItem.rollback === "object" ? queueItem.rollback : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Guardrail Recovery Receipt",
      "owner_domain=guardrailops",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "guardrail").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `execution_profile=${String(queueItem.executionProfile || queueItem.subjectId || "").trim()}`,
      `safety_boundary=${String(queueItem.safetyBoundary || "").trim()}`,
      `proposed_state=${String(queueItem.proposedState || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `rollback_id=${String(rollback.rollbackId || "").trim()}`,
      `action=${String(rollback.action || "").trim()}`,
      `status=${String(rollback.status || "").trim()}`,
      `approval_receipt_id=${String(rollback.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `admin_change_receipt_id=${String(rollback.adminReceiptId || receipt.receiptId || "").trim()}`,
      `execution_id=${String(rollback.executionId || execution.executionId || "").trim()}`,
      `stable_ref=${String(rollback.stableRef || "").trim()}`,
      `rolled_back_at=${String(rollback.rolledBackAt || "").trim()}`,
      `actor_ref=${String(rollback.actorRef || "").trim()}`,
      `reason=${String(rollback.reason || "").trim()}`,
      `summary=${String(rollback.summary || "").trim()}`
    ].join("\n");
  };
  const loadIdentityOpsQueueItemIntoDraft = (changeId) => {
    const item = findIdentityOpsQueueItem(changeId);
    if (!item) {
      setIdentityOpsFeedback("warn", "The selected identity admin proposal is no longer available.");
      return false;
    }
    identityOpsViewState = {
      ...identityOpsViewState,
      selectedAdminChangeId: String(item.id || "").trim(),
      recoveryReason: "",
      latestSimulation:
        String(identityOpsViewState.latestSimulation?.changeId || "").trim() === String(item.id || "").trim()
          ? identityOpsViewState.latestSimulation
          : null,
      authorityDraft:
        String(item.kind || "").trim().toLowerCase() === "authority"
          ? normalizeIdentityOpsDraft("authority", {
              subjectId: item.subjectId,
              targetScope: item.targetScope,
              authorityTier: String(item.requestedAction || "").replace(/^set\s+/i, ""),
              reason: item.reason
            })
          : identityOpsViewState.authorityDraft,
      grantDraft:
        String(item.kind || "").trim().toLowerCase() === "grant"
          ? normalizeIdentityOpsDraft("grant", {
              subjectId: item.subjectId,
              targetScope: item.targetScope,
              changeKind: item.requestedAction.split(" ")[0] || "issue",
              grantKey: item.requestedAction.split(" ").slice(1).join(" ").trim(),
              reason: item.reason
            })
          : identityOpsViewState.grantDraft,
      feedback: {
        tone: "info",
        message: `Loaded queued identity proposal ${String(item.id || "").trim()} into the active draft editor.`
      }
    };
    renderIdentityOpsPanel();
    return true;
  };
  const saveIdentityOpsDraft = (kind, options = {}) => {
    const normalizedKind = String(kind || "").trim().toLowerCase() === "grant" ? "grant" : "authority";
    const draft = getIdentityOpsDraft(normalizedKind);
    const validationError = validateIdentityOpsDraft(normalizedKind, draft);
    if (validationError) {
      setIdentityOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildIdentityOpsQueueItem(normalizedKind, draft, {
      status: options.status || "draft",
      simulationSummary: options.simulationSummary || "",
      routedAt: options.routedAt || ""
    });
    upsertIdentityOpsQueueItem(queueItem);
    identityOpsViewState = {
      ...identityOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: options.keepSimulation === true ? identityOpsViewState.latestSimulation : null,
      feedback: {
        tone: "ok",
        message: `${normalizedKind === "grant" ? "Grant/delegation" : "Authority"} draft saved as ${String(queueItem.id || "").trim()}.`
      }
    };
    renderIdentityOpsPanel();
    return queueItem;
  };
  const simulateIdentityOpsDraft = (kind, changeId = "") => {
    const normalizedKind = String(kind || "").trim().toLowerCase() === "grant" ? "grant" : "authority";
    const queueSource = changeId ? findIdentityOpsQueueItem(changeId) : getIdentityOpsSelectedQueueItemForKind(normalizedKind);
    if (queueSource) {
      loadIdentityOpsQueueItemIntoDraft(queueSource.id);
    }
    const draft = getIdentityOpsDraft(normalizedKind);
    const validationError = validateIdentityOpsDraft(normalizedKind, draft);
    if (validationError) {
      setIdentityOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildIdentityOpsQueueItem(normalizedKind, draft, {
      id: queueSource?.id || "",
      status: "simulated"
    });
    const simulation = buildIdentityOpsSimulation(queueItem, draft);
    upsertIdentityOpsQueueItem({
      ...queueItem,
      status: "simulated",
      simulationSummary: simulation.summary,
      simulatedAt: simulation.updatedAt
    });
    identityOpsViewState = {
      ...identityOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: simulation,
      feedback: {
        tone: simulation.tone,
        message: `${normalizedKind === "grant" ? "Grant/delegation" : "Authority"} simulation is ready for ${String(queueItem.id || "").trim()}.`
      }
    };
    renderIdentityOpsPanel();
    return simulation;
  };
  const routeIdentityOpsDraftToGovernance = (kind, changeId = "") => {
    const normalizedKind = String(kind || "").trim().toLowerCase() === "grant" ? "grant" : "authority";
    const selectedQueueItem = changeId ? findIdentityOpsQueueItem(changeId) : getIdentityOpsSelectedQueueItemForKind(normalizedKind);
    const simulation = identityOpsViewState.latestSimulation;
    const matchingSimulation =
      simulation &&
      String(simulation.kind || "").trim().toLowerCase() === normalizedKind &&
      String(simulation.changeId || "").trim() &&
      (!selectedQueueItem || String(simulation.changeId || "").trim() === String(selectedQueueItem.id || "").trim());
    if (!matchingSimulation) {
      setIdentityOpsFeedback(
        "warn",
        "Run a bounded simulation for the active identity admin proposal before routing it to GovernanceOps."
      );
      return false;
    }
    const queueItem =
      selectedQueueItem ||
      buildIdentityOpsQueueItem(normalizedKind, getIdentityOpsDraft(normalizedKind), {
        status: "simulated",
        simulationSummary: simulation.summary
      });
    upsertIdentityOpsQueueItem({
      ...queueItem,
      status: "routed",
      simulationSummary: simulation.summary,
      routedAt: new Date().toISOString(),
      decision: null,
      execution: null,
      receipt: null,
      rollback: null
    });
    identityOpsViewState = {
      ...identityOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      feedback: {
        tone: "warn",
        message: `Identity admin proposal ${String(queueItem.id || "").trim()} routed to GovernanceOps. Apply remains blocked until an explicit governance approval lands.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "warn",
      `Identity admin proposal routed from IdentityOps: changeId=${String(queueItem.id || "").trim()}; action=${String(queueItem.requestedAction || "").trim()}; subject=${String(queueItem.subjectId || "").trim()}; target=${String(queueItem.targetScope || "").trim()}. Governance approval is now required before apply can proceed.`
    );
    renderIdentityOpsPanel();
    setWorkspaceView("governanceops", true);
    return true;
  };
  const openIdentityOpsGovernanceView = () => {
    setWorkspaceView("governanceops", true);
  };
  const openIdentityOpsAdminQueueItem = (changeId) => {
    const queueItem = findIdentityOpsQueueItem(changeId);
    if (!queueItem) {
      setIdentityOpsFeedback("warn", "The selected identity admin proposal is no longer available.");
      return false;
    }
    identityOpsViewState = {
      ...identityOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    renderIdentityOpsPanel();
    setWorkspaceView("identityops", true);
    return true;
  };
  const applyApprovedIdentityOpsChange = (changeId) => {
    const queueItem = findIdentityOpsQueueItem(changeId);
    if (!queueItem) {
      setIdentityOpsFeedback("warn", "The selected identity admin proposal is no longer available.");
      return false;
    }
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : null;
    if (String(queueItem.status || "").trim().toLowerCase() !== "approved" || !String(decision?.approvalReceiptId || "").trim()) {
      setIdentityOpsFeedback("warn", "Apply is only available after GovernanceOps records an explicit approved decision receipt.");
      return false;
    }
    const actorRef = identityOpsActorRef();
    const executedAt = new Date().toISOString();
    const executionId = `admin-execution-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const receiptId = `admin-receipt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const executionSummary = `Applied ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.subjectId || "").trim()} at ${String(queueItem.targetScope || "").trim()}.`;
    const receipt = {
      receiptId,
      issuedAt: executedAt,
      summary: executionSummary,
      stableRef: `${String(queueItem.id || "").trim()}/${receiptId}`,
      approvalReceiptId: String(decision.approvalReceiptId || "").trim(),
      executionId
    };
    upsertIdentityOpsQueueItem({
      ...queueItem,
      status: "applied",
      updatedAt: executedAt,
      execution: {
        executionId,
        executedAt,
        status: "applied",
        summary: executionSummary,
        actorRef
      },
      receipt
    });
    identityOpsViewState = {
      ...identityOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      feedback: {
        tone: "ok",
        message: `Approved identity admin change ${String(queueItem.id || "").trim()} applied. Admin receipt ${receiptId} is now available.`
      }
    };
    setGovernanceOpsFeedback(
      "ok",
      `Identity admin change ${String(queueItem.id || "").trim()} applied from IdentityOps. Receipt ${receiptId} is now linked to approval receipt ${String(decision.approvalReceiptId || "").trim()}.`
    );
    renderIdentityOpsPanel();
    return true;
  };
  const applyIdentityOpsRecoveryAction = (changeId, action) => {
    const queueItem = findIdentityOpsQueueItem(changeId);
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!queueItem) {
      setIdentityOpsFeedback("warn", "The selected identity admin proposal is no longer available.");
      return false;
    }
    if (String(queueItem.status || "").trim().toLowerCase() !== "applied" || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setIdentityOpsFeedback("warn", "Rollback or expiry is only available after an approved change has been applied and receipted.");
      return false;
    }
    if (String(queueItem?.rollback?.rollbackId || "").trim()) {
      setIdentityOpsFeedback("warn", `Recovery has already been recorded for identity admin change ${String(queueItem.id || "").trim()}.`);
      return false;
    }
    if (normalizedAction === "expiry" && String(queueItem.kind || "").trim().toLowerCase() !== "grant") {
      setIdentityOpsFeedback("warn", "Expiry is only available for applied grant changes.");
      return false;
    }
    if (normalizedAction !== "rollback" && normalizedAction !== "expiry") {
      setIdentityOpsFeedback("warn", "Unsupported recovery action for the selected identity admin proposal.");
      return false;
    }
    const reason = String(identityOpsViewState.recoveryReason || "").trim();
    if (!reason) {
      setIdentityOpsFeedback("warn", "Rollback or expiry reason is required before recovery can execute.");
      return false;
    }
    const actorRef = identityOpsActorRef();
    const rolledBackAt = new Date().toISOString();
    const rollbackId = `admin-rollback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const nextStatus = normalizedAction === "expiry" ? "expired" : "rolled_back";
    const summary =
      normalizedAction === "expiry"
        ? `Expired ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.subjectId || "").trim()} at ${String(queueItem.targetScope || "").trim()}.`
        : `Rolled back ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.subjectId || "").trim()} at ${String(queueItem.targetScope || "").trim()}.`;
    const rollback = {
      rollbackId,
      action: normalizedAction,
      status: nextStatus,
      rolledBackAt,
      summary,
      stableRef: `${String(queueItem.id || "").trim()}/${rollbackId}`,
      reason,
      actorRef,
      approvalReceiptId: String(queueItem?.decision?.approvalReceiptId || "").trim(),
      adminReceiptId: String(queueItem?.receipt?.receiptId || "").trim(),
      executionId: String(queueItem?.execution?.executionId || "").trim()
    };
    upsertIdentityOpsQueueItem({
      ...queueItem,
      status: nextStatus,
      updatedAt: rolledBackAt,
      rollback
    });
    identityOpsViewState = {
      ...identityOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `${normalizedAction === "expiry" ? "Expiry" : "Rollback"} recorded for identity admin change ${String(queueItem.id || "").trim()}. Recovery receipt ${rollbackId} is now available.`
      }
    };
    setGovernanceOpsFeedback(
      "warn",
      `IdentityOps recorded ${normalizedAction === "expiry" ? "expiry" : "rollback"} for admin change ${String(queueItem.id || "").trim()}. Recovery record ${rollbackId} is linked to approval receipt ${String(rollback.approvalReceiptId || "").trim()}.`
    );
    renderIdentityOpsPanel();
    return true;
  };
  const copyIdentityOpsGovernanceReceipt = async (changeId) => {
    const queueItem = findIdentityOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.decision?.approvalReceiptId || "").trim()) {
      setIdentityOpsFeedback("warn", "No governance decision receipt is available for the selected identity admin change.");
      return false;
    }
    await copyTextToClipboard(buildIdentityOpsGovernanceReceiptText(queueItem));
    setIdentityOpsFeedback("ok", `Governance decision receipt copied for identity admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyIdentityOpsAdminReceipt = async (changeId) => {
    const queueItem = findIdentityOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setIdentityOpsFeedback("warn", "No admin change receipt is available for the selected identity admin change.");
      return false;
    }
    await copyTextToClipboard(buildIdentityOpsAdminReceiptText(queueItem));
    setIdentityOpsFeedback("ok", `Admin change receipt copied for identity admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyIdentityOpsRollbackReceipt = async (changeId) => {
    const queueItem = findIdentityOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.rollback?.rollbackId || "").trim()) {
      setIdentityOpsFeedback("warn", "No rollback or expiry receipt is available for the selected identity admin change.");
      return false;
    }
    await copyTextToClipboard(buildIdentityOpsRollbackReceiptText(queueItem));
    setIdentityOpsFeedback("ok", `Rollback/expiry receipt copied for identity admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const setPlatformOpsFeedback = (tone, message) => {
    platformOpsViewState = {
      ...platformOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderPlatformOpsPanel();
  };
  const setPlatformOpsRecoveryReason = (value) => {
    platformOpsViewState = {
      ...platformOpsViewState,
      recoveryReason: String(value || "").trimStart()
    };
  };
  const platformOpsActorRef = () =>
    String(session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || "").trim() ||
    "platform-operator";
  const getPlatformOpsDefaults = () => {
    const pipeline = latestPlatformOpsContext?.pipeline && typeof latestPlatformOpsContext.pipeline === "object"
      ? latestPlatformOpsContext.pipeline
      : {};
    const aimxsActivation =
      latestPlatformOpsContext?.aimxsActivation && typeof latestPlatformOpsContext.aimxsActivation === "object"
        ? latestPlatformOpsContext.aimxsActivation
        : {};
    const environment = String(pipeline.environment || "").trim() || "local";
    const deploymentTarget =
      String(aimxsActivation.selectedProviderId || aimxsActivation.activeMode || "").trim() || "desktop-local";
    const releaseRef =
      environment === "prod"
        ? String(pipeline.latestProdGate || pipeline.latestStagingGate || "").trim()
        : String(pipeline.latestStagingGate || pipeline.latestProdGate || "").trim();
    return {
      changeKind: "promote",
      environment,
      deploymentTarget,
      releaseRef
    };
  };
  const normalizePlatformOpsDraft = (draft = null) => {
    const defaults = getPlatformOpsDefaults();
    const input = draft && typeof draft === "object" ? draft : {};
    const changeKind = String(input.changeKind || defaults.changeKind || "promote").trim().toLowerCase();
    return {
      changeKind: changeKind === "rollback" ? "rollback" : "promote",
      environment: String(input.environment || defaults.environment || "").trim() || "local",
      deploymentTarget: String(input.deploymentTarget || defaults.deploymentTarget || "").trim() || "desktop-local",
      releaseRef: String(input.releaseRef || defaults.releaseRef || "").trim(),
      reason: String(input.reason || "").trim()
    };
  };
  const updatePlatformOpsDraftField = (field, value) => {
    const nextDraft = normalizePlatformOpsDraft({
      ...platformOpsViewState.promotionDraft,
      [field]: String(value || "").trim()
    });
    platformOpsViewState = {
      ...platformOpsViewState,
      promotionDraft: nextDraft,
      latestSimulation: null,
      feedback: null
    };
    renderPlatformOpsPanel();
  };
  const findPlatformOpsQueueItem = (changeId) => {
    const normalizedChangeId = String(changeId || "").trim();
    if (!normalizedChangeId) {
      return null;
    }
    return (
      (Array.isArray(platformOpsViewState.queueItems) ? platformOpsViewState.queueItems : []).find(
        (item) => String(item?.id || "").trim() === normalizedChangeId
      ) || null
    );
  };
  const upsertPlatformOpsQueueItem = (nextItem) => {
    const item = nextItem && typeof nextItem === "object" ? nextItem : null;
    const changeId = String(item?.id || "").trim();
    if (!changeId) {
      return null;
    }
    const existingItems = Array.isArray(platformOpsViewState.queueItems) ? platformOpsViewState.queueItems : [];
    const nextItems = [];
    let replaced = false;
    existingItems.forEach((entry) => {
      const entryId = String(entry?.id || "").trim();
      if (entryId === changeId) {
        nextItems.push({
          ...entry,
          ...item
        });
        replaced = true;
        return;
      }
      nextItems.push(entry);
    });
    if (!replaced) {
      nextItems.unshift(item);
    }
    platformOpsViewState = {
      ...platformOpsViewState,
      queueItems: nextItems
    };
    syncAdminTracePanels();
    return nextItems.find((entry) => String(entry?.id || "").trim() === changeId) || null;
  };
  const buildPlatformOpsQueueItem = (draft, options = {}) => {
    const nextDraft = normalizePlatformOpsDraft(draft);
    const selectedItem = findPlatformOpsQueueItem(platformOpsViewState.selectedAdminChangeId);
    const existingId = String(options.id || selectedItem?.id || "").trim();
    const changeId =
      existingId || `platform-change-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const requestedAction = `${nextDraft.changeKind} ${nextDraft.releaseRef || "release"}`.trim();
    return {
      id: changeId,
      ownerDomain: "platformops",
      kind: "platform",
      label: "Promotion Draft",
      requestedAction,
      subjectId: nextDraft.releaseRef,
      subjectLabel: "release",
      targetScope: `${nextDraft.environment} / ${nextDraft.deploymentTarget}`.trim(),
      targetLabel: "target",
      environment: nextDraft.environment,
      deploymentTarget: nextDraft.deploymentTarget,
      releaseRef: nextDraft.releaseRef,
      status: String(options.status || selectedItem?.status || "draft").trim().toLowerCase(),
      reason: nextDraft.reason,
      summary:
        `${nextDraft.changeKind === "rollback" ? "Rollback" : "Promote"} ${nextDraft.releaseRef || "release"} to ${nextDraft.environment} / ${nextDraft.deploymentTarget}`,
      simulationSummary: String(options.simulationSummary || selectedItem?.simulationSummary || "").trim(),
      createdAt: String(options.createdAt || selectedItem?.createdAt || new Date().toISOString()).trim(),
      simulatedAt: String(options.simulatedAt || selectedItem?.simulatedAt || "").trim(),
      updatedAt: String(options.updatedAt || new Date().toISOString()).trim(),
      routedAt: String(options.routedAt || selectedItem?.routedAt || "").trim(),
      decision:
        options.decision === null
          ? null
          : options.decision || (selectedItem?.decision && typeof selectedItem.decision === "object" ? selectedItem.decision : null),
      execution:
        options.execution === null
          ? null
          : options.execution || (selectedItem?.execution && typeof selectedItem.execution === "object" ? selectedItem.execution : null),
      receipt:
        options.receipt === null
          ? null
          : options.receipt || (selectedItem?.receipt && typeof selectedItem.receipt === "object" ? selectedItem.receipt : null),
      rollback:
        options.rollback === null
          ? null
          : options.rollback || (selectedItem?.rollback && typeof selectedItem.rollback === "object" ? selectedItem.rollback : null)
    };
  };
  const validatePlatformOpsDraft = (draft) => {
    const nextDraft = normalizePlatformOpsDraft(draft);
    if (!nextDraft.environment) {
      return "Environment is required before saving a platform admin proposal.";
    }
    if (!nextDraft.deploymentTarget) {
      return "Deployment target is required before saving a platform admin proposal.";
    }
    if (!nextDraft.releaseRef) {
      return "Release ref is required before saving a platform admin proposal.";
    }
    if (!nextDraft.reason) {
      return "Reason is required before saving a platform admin proposal.";
    }
    return "";
  };
  const buildPlatformOpsSimulation = (item, draft) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const nextDraft = normalizePlatformOpsDraft(draft);
    const health = latestPlatformOpsContext?.health && typeof latestPlatformOpsContext.health === "object"
      ? latestPlatformOpsContext.health
      : {};
    const pipeline = latestPlatformOpsContext?.pipeline && typeof latestPlatformOpsContext.pipeline === "object"
      ? latestPlatformOpsContext.pipeline
      : {};
    const providers = latestPlatformOpsContext?.providers && typeof latestPlatformOpsContext.providers === "object"
      ? latestPlatformOpsContext.providers
      : {};
    const aimxsActivation =
      latestPlatformOpsContext?.aimxsActivation && typeof latestPlatformOpsContext.aimxsActivation === "object"
        ? latestPlatformOpsContext.aimxsActivation
        : {};
    const providerItems = Array.isArray(providers.items) ? providers.items : [];
    const degradedProviderCount = providerItems.filter((entry) => entry?.probed === true && entry?.ready !== true).length;
    const secretEntries = Object.values(
      aimxsActivation?.secrets && typeof aimxsActivation.secrets === "object" ? aimxsActivation.secrets : {}
    );
    const secretMissingCount = secretEntries.filter((entry) => !entry?.present).length;
    const warnings = Array.isArray(aimxsActivation.warnings) ? aimxsActivation.warnings : [];
    const deploymentIssueCount = [
      health.runtime?.status,
      health.providers?.status,
      health.policy?.status
    ].filter((status) => String(status || "").trim().toLowerCase() !== "ok").length;
    const findings = [
      "Execution remains blocked until GovernanceOps records an explicit approved decision receipt for this platform proposal."
    ];
    if (String(pipeline.status || "").trim().toLowerCase() !== "pass") {
      findings.push("Pipeline posture is not fully green for the current environment.");
    }
    if (deploymentIssueCount > 0) {
      findings.push("At least one platform health surface is not currently green.");
    }
    if (degradedProviderCount > 0) {
      findings.push("One or more provider registrations remain degraded.");
    }
    if (secretMissingCount > 0) {
      findings.push("AIMXS activation still has missing secret posture.");
    }
    if (warnings.length > 0) {
      findings.push(warnings[0]);
    }
    const tone =
      deploymentIssueCount > 0 ||
      degradedProviderCount > 0 ||
      secretMissingCount > 0 ||
      warnings.length > 0 ||
      String(pipeline.status || "").trim().toLowerCase() !== "pass"
        ? "warn"
        : "info";
    return {
      changeId: String(queueItem.id || "").trim(),
      kind: "platform",
      tone,
      title: "Platform admin dry-run",
      summary:
        nextDraft.changeKind === "rollback"
          ? "Preview only. This rollback proposal requires GovernanceOps approval before any platform recovery action can execute."
          : "Preview only. This promotion proposal requires GovernanceOps approval before any live platform change can execute.",
      updatedAt: new Date().toISOString(),
      facts: [
        { label: "release", value: nextDraft.releaseRef, code: true },
        { label: "environment", value: nextDraft.environment },
        { label: "deployment", value: nextDraft.deploymentTarget, code: true },
        { label: "pipeline", value: String(pipeline.status || "").trim() || "unknown" },
        { label: "issues", value: String(deploymentIssueCount) },
        { label: "degraded providers", value: String(degradedProviderCount) },
        { label: "secrets missing", value: String(secretMissingCount) },
        { label: "warnings", value: String(warnings.length) }
      ],
      findings
    };
  };
  const loadPlatformOpsQueueItemIntoDraft = (changeId) => {
    const item = findPlatformOpsQueueItem(changeId);
    if (!item) {
      setPlatformOpsFeedback("warn", "The selected platform admin proposal is no longer available.");
      return false;
    }
    platformOpsViewState = {
      ...platformOpsViewState,
      selectedAdminChangeId: String(item.id || "").trim(),
      recoveryReason: "",
      promotionDraft: normalizePlatformOpsDraft({
        changeKind: String(item.requestedAction || "").trim().toLowerCase().startsWith("rollback") ? "rollback" : "promote",
        environment: item.environment,
        deploymentTarget: item.deploymentTarget,
        releaseRef: item.releaseRef || item.subjectId,
        reason: item.reason
      }),
      latestSimulation:
        String(platformOpsViewState.latestSimulation?.changeId || "").trim() === String(item.id || "").trim()
          ? platformOpsViewState.latestSimulation
          : null,
      feedback: {
        tone: "info",
        message: `Loaded queued platform proposal ${String(item.id || "").trim()} into the active draft editor.`
      }
    };
    renderPlatformOpsPanel();
    return true;
  };
  const savePlatformOpsDraft = () => {
    const draft = normalizePlatformOpsDraft(platformOpsViewState.promotionDraft);
    const validationError = validatePlatformOpsDraft(draft);
    if (validationError) {
      setPlatformOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildPlatformOpsQueueItem(draft, { status: "draft" });
    upsertPlatformOpsQueueItem(queueItem);
    platformOpsViewState = {
      ...platformOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: null,
      feedback: {
        tone: "ok",
        message: `Platform draft saved as ${String(queueItem.id || "").trim()}.`
      }
    };
    renderPlatformOpsPanel();
    return queueItem;
  };
  const simulatePlatformOpsDraft = (changeId = "") => {
    const selectedQueueItem = changeId ? findPlatformOpsQueueItem(changeId) : null;
    if (selectedQueueItem) {
      loadPlatformOpsQueueItemIntoDraft(selectedQueueItem.id);
    }
    const draft = normalizePlatformOpsDraft(platformOpsViewState.promotionDraft);
    const validationError = validatePlatformOpsDraft(draft);
    if (validationError) {
      setPlatformOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildPlatformOpsQueueItem(draft, {
      id: selectedQueueItem?.id || String(platformOpsViewState.selectedAdminChangeId || "").trim(),
      status: "simulated"
    });
    const simulation = buildPlatformOpsSimulation(queueItem, draft);
    upsertPlatformOpsQueueItem({
      ...queueItem,
      status: "simulated",
      simulationSummary: simulation.summary,
      simulatedAt: simulation.updatedAt
    });
    platformOpsViewState = {
      ...platformOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: simulation,
      feedback: {
        tone: simulation.tone,
        message: `Platform dry-run is ready for ${String(queueItem.id || "").trim()}.`
      }
    };
    renderPlatformOpsPanel();
    return simulation;
  };
  const routePlatformOpsDraftToGovernance = (changeId = "") => {
    const selectedQueueItem = changeId ? findPlatformOpsQueueItem(changeId) : null;
    const simulation = platformOpsViewState.latestSimulation;
    const matchingSimulation =
      simulation &&
      String(simulation.kind || "").trim().toLowerCase() === "platform" &&
      String(simulation.changeId || "").trim() &&
      (!selectedQueueItem || String(simulation.changeId || "").trim() === String(selectedQueueItem.id || "").trim());
    if (!matchingSimulation) {
      setPlatformOpsFeedback("warn", "Run a bounded dry-run for the active platform admin proposal before routing it to GovernanceOps.");
      return false;
    }
    const queueItem =
      selectedQueueItem ||
      buildPlatformOpsQueueItem(platformOpsViewState.promotionDraft, {
        id: String(platformOpsViewState.selectedAdminChangeId || "").trim(),
        status: "simulated",
        simulationSummary: simulation.summary
      });
    upsertPlatformOpsQueueItem({
      ...queueItem,
      status: "routed",
      simulationSummary: simulation.summary,
      routedAt: new Date().toISOString(),
      decision: null,
      execution: null,
      receipt: null,
      rollback: null
    });
    platformOpsViewState = {
      ...platformOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      feedback: {
        tone: "warn",
        message: `Platform admin proposal ${String(queueItem.id || "").trim()} routed to GovernanceOps. Apply remains blocked until an explicit governance approval lands.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "warn",
      `Platform admin proposal routed from PlatformOps: changeId=${String(queueItem.id || "").trim()}; action=${String(queueItem.requestedAction || "").trim()}; release=${String(queueItem.releaseRef || "").trim()}; target=${String(queueItem.targetScope || "").trim()}. Governance approval is now required before apply can proceed.`
    );
    renderPlatformOpsPanel();
    setWorkspaceView("governanceops", true);
    return true;
  };
  const openPlatformOpsGovernanceView = () => {
    setWorkspaceView("governanceops", true);
  };
  const openPlatformOpsAdminQueueItem = (changeId) => {
    const queueItem = findPlatformOpsQueueItem(changeId);
    if (!queueItem) {
      setPlatformOpsFeedback("warn", "The selected platform admin proposal is no longer available.");
      return false;
    }
    loadPlatformOpsQueueItemIntoDraft(changeId);
    setWorkspaceView("platformops", true);
    return true;
  };
  const applyApprovedPlatformOpsChange = (changeId) => {
    const queueItem = findPlatformOpsQueueItem(changeId);
    if (!queueItem) {
      setPlatformOpsFeedback("warn", "The selected platform admin proposal is no longer available.");
      return false;
    }
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : null;
    if (String(queueItem.status || "").trim().toLowerCase() !== "approved" || !String(decision?.approvalReceiptId || "").trim()) {
      setPlatformOpsFeedback("warn", "Apply is only available after GovernanceOps records an explicit approved decision receipt.");
      return false;
    }
    if (String(queueItem?.receipt?.receiptId || "").trim()) {
      setPlatformOpsFeedback("warn", `Platform admin change ${String(queueItem.id || "").trim()} already has an admin receipt.`);
      return false;
    }
    const actorRef = platformOpsActorRef();
    const executedAt = new Date().toISOString();
    const executionId = `admin-execution-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const receiptId = `admin-receipt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const executionSummary = `${String(queueItem.requestedAction || "").trim()} applied for ${String(queueItem.targetScope || "").trim()} using ${String(queueItem.releaseRef || queueItem.subjectId || "").trim()}.`;
    const receipt = {
      receiptId,
      issuedAt: executedAt,
      summary: executionSummary,
      stableRef: `${String(queueItem.id || "").trim()}/${receiptId}`,
      approvalReceiptId: String(decision.approvalReceiptId || "").trim(),
      executionId
    };
    upsertPlatformOpsQueueItem({
      ...queueItem,
      status: "applied",
      updatedAt: executedAt,
      execution: {
        executionId,
        executedAt,
        status: "applied",
        summary: executionSummary,
        actorRef
      },
      receipt
    });
    platformOpsViewState = {
      ...platformOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      feedback: {
        tone: "ok",
        message: `Approved platform admin change ${String(queueItem.id || "").trim()} applied. Admin receipt ${receiptId} is now available.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "ok",
      `Platform admin change ${String(queueItem.id || "").trim()} applied from PlatformOps. Receipt ${receiptId} is now linked to approval receipt ${String(decision.approvalReceiptId || "").trim()}.`
    );
    renderPlatformOpsPanel();
    return true;
  };
  const applyPlatformOpsRecoveryAction = (changeId, action) => {
    const queueItem = findPlatformOpsQueueItem(changeId);
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!queueItem) {
      setPlatformOpsFeedback("warn", "The selected platform admin proposal is no longer available.");
      return false;
    }
    if (String(queueItem.status || "").trim().toLowerCase() !== "applied" || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setPlatformOpsFeedback("warn", "Rollback is only available after an approved platform change has been applied and receipted.");
      return false;
    }
    if (String(queueItem?.rollback?.rollbackId || "").trim()) {
      setPlatformOpsFeedback("warn", `Recovery has already been recorded for platform admin change ${String(queueItem.id || "").trim()}.`);
      return false;
    }
    if (normalizedAction !== "rollback") {
      setPlatformOpsFeedback("warn", "Unsupported recovery action for the selected platform admin proposal.");
      return false;
    }
    const reason = String(platformOpsViewState.recoveryReason || "").trim();
    if (!reason) {
      setPlatformOpsFeedback("warn", "Rollback reason is required before platform recovery can execute.");
      return false;
    }
    const actorRef = platformOpsActorRef();
    const rolledBackAt = new Date().toISOString();
    const rollbackId = `admin-rollback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const rollback = {
      rollbackId,
      action: "rollback",
      status: "rolled_back",
      rolledBackAt,
      summary: `Rolled back ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.targetScope || "").trim()} using ${String(queueItem.releaseRef || queueItem.subjectId || "").trim()}.`,
      stableRef: `${String(queueItem.id || "").trim()}/${rollbackId}`,
      reason,
      actorRef,
      approvalReceiptId: String(queueItem?.decision?.approvalReceiptId || "").trim(),
      adminReceiptId: String(queueItem?.receipt?.receiptId || "").trim(),
      executionId: String(queueItem?.execution?.executionId || "").trim()
    };
    upsertPlatformOpsQueueItem({
      ...queueItem,
      status: "rolled_back",
      updatedAt: rolledBackAt,
      rollback
    });
    platformOpsViewState = {
      ...platformOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `Rollback recorded for platform admin change ${String(queueItem.id || "").trim()}. Recovery receipt ${rollbackId} is now available.`
      }
    };
    setGovernanceOpsFeedback(
      "warn",
      `PlatformOps recorded rollback for admin change ${String(queueItem.id || "").trim()}. Recovery record ${rollbackId} is linked to approval receipt ${String(rollback.approvalReceiptId || "").trim()}.`
    );
    renderPlatformOpsPanel();
    return true;
  };
  const copyPlatformOpsGovernanceReceipt = async (changeId) => {
    const queueItem = findPlatformOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.decision?.approvalReceiptId || "").trim()) {
      setPlatformOpsFeedback("warn", "No governance decision receipt is available for the selected platform admin change.");
      return false;
    }
    await copyTextToClipboard(buildPlatformOpsGovernanceReceiptText(queueItem));
    setPlatformOpsFeedback("ok", `Governance decision receipt copied for platform admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyPlatformOpsAdminReceipt = async (changeId) => {
    const queueItem = findPlatformOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setPlatformOpsFeedback("warn", "No admin change receipt is available for the selected platform admin change.");
      return false;
    }
    await copyTextToClipboard(buildPlatformOpsAdminReceiptText(queueItem));
    setPlatformOpsFeedback("ok", `Admin change receipt copied for platform admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyPlatformOpsRollbackReceipt = async (changeId) => {
    const queueItem = findPlatformOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.rollback?.rollbackId || "").trim()) {
      setPlatformOpsFeedback("warn", "No rollback receipt is available for the selected platform admin change.");
      return false;
    }
    await copyTextToClipboard(buildPlatformOpsRollbackReceiptText(queueItem));
    setPlatformOpsFeedback("ok", `Rollback receipt copied for platform admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const setGuardrailOpsFeedback = (tone, message) => {
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderGuardrailOpsPanel();
  };
  const setGuardrailOpsRecoveryReason = (value) => {
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      recoveryReason: String(value || "").trimStart()
    };
  };
  const guardrailOpsActorRef = () =>
    String(session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || "").trim() ||
    "guardrail-operator";
  const getGuardrailOpsDefaults = () => {
    const settingsPayload =
      latestGuardrailOpsContext?.settings && typeof latestGuardrailOpsContext.settings === "object"
        ? latestGuardrailOpsContext.settings
        : latestSettingsSnapshot;
    const latestRun =
      Array.isArray(latestGuardrailOpsContext?.runs?.items) ? latestGuardrailOpsContext.runs.items[0] : null;
    const targetScope =
      [
        String(latestRun?.tenantId || latestRun?.requestPayload?.meta?.tenantId || "").trim(),
        String(latestRun?.projectId || latestRun?.requestPayload?.meta?.projectId || "").trim()
      ]
        .filter(Boolean)
        .join(" / ") ||
      String(settingsPayload?.environment || "").trim() ||
      "workspace";
    const policyCatalogItems = Array.isArray(settingsPayload?.policyCatalog?.items)
      ? settingsPayload.policyCatalog.items
      : [];
    const firstBoundary =
      policyCatalogItems
        .flatMap((item) => (Array.isArray(item?.boundaryRequirements) ? item.boundaryRequirements : []))
        .map((item) => String(item || "").trim())
        .find(Boolean) || "tenant_project_scope";
    const latestExecutionProfile =
      String(
        latestGuardrailOpsContext?.approvals?.items?.[0]?.targetExecutionProfile ||
          latestRun?.requestPayload?.desktop?.targetExecutionProfile ||
          ""
      ).trim() || "managed_codex_worker";
    return {
      changeKind: "tighten",
      targetScope,
      executionProfile: latestExecutionProfile,
      safetyBoundary: firstBoundary,
      proposedState: "approval_required",
      reason: ""
    };
  };
  const normalizeGuardrailOpsDraft = (draft = null) => {
    const defaults = getGuardrailOpsDefaults();
    const input = draft && typeof draft === "object" ? draft : {};
    return {
      changeKind: String(input.changeKind || defaults.changeKind || "tighten").trim().toLowerCase() || "tighten",
      targetScope: String(input.targetScope || defaults.targetScope || "workspace").trim() || "workspace",
      executionProfile:
        String(input.executionProfile || defaults.executionProfile || "managed_codex_worker").trim() ||
        "managed_codex_worker",
      safetyBoundary:
        String(input.safetyBoundary || defaults.safetyBoundary || "tenant_project_scope").trim() ||
        "tenant_project_scope",
      proposedState:
        String(input.proposedState || defaults.proposedState || "approval_required").trim() || "approval_required",
      reason: String(input.reason || "").trim()
    };
  };
  const updateGuardrailOpsDraftField = (field, value) => {
    const nextDraft = normalizeGuardrailOpsDraft({
      ...guardrailOpsViewState.guardrailDraft,
      [field]: String(value || "").trim()
    });
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      guardrailDraft: nextDraft,
      latestSimulation: null,
      feedback: null
    };
    renderGuardrailOpsPanel();
  };
  const findGuardrailOpsQueueItem = (changeId) => {
    const normalizedChangeId = String(changeId || "").trim();
    if (!normalizedChangeId) {
      return null;
    }
    return (
      (Array.isArray(guardrailOpsViewState.queueItems) ? guardrailOpsViewState.queueItems : []).find(
        (item) => String(item?.id || "").trim() === normalizedChangeId
      ) || null
    );
  };
  const upsertGuardrailOpsQueueItem = (nextItem) => {
    const item = nextItem && typeof nextItem === "object" ? nextItem : null;
    const changeId = String(item?.id || "").trim();
    if (!changeId) {
      return null;
    }
    const existingItems = Array.isArray(guardrailOpsViewState.queueItems) ? guardrailOpsViewState.queueItems : [];
    const nextItems = [];
    let replaced = false;
    existingItems.forEach((entry) => {
      const entryId = String(entry?.id || "").trim();
      if (entryId === changeId) {
        nextItems.push({
          ...entry,
          ...item
        });
        replaced = true;
        return;
      }
      nextItems.push(entry);
    });
    if (!replaced) {
      nextItems.unshift(item);
    }
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      queueItems: nextItems
    };
    syncAdminTracePanels();
    return nextItems.find((entry) => String(entry?.id || "").trim() === changeId) || null;
  };
  const buildGuardrailOpsQueueItem = (draft, options = {}) => {
    const nextDraft = normalizeGuardrailOpsDraft(draft);
    const selectedItem = findGuardrailOpsQueueItem(guardrailOpsViewState.selectedAdminChangeId);
    const existingId = String(options.id || selectedItem?.id || "").trim();
    const changeId =
      existingId || `guardrail-change-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const requestedAction = `${nextDraft.changeKind} ${nextDraft.proposedState}`.trim();
    return {
      id: changeId,
      ownerDomain: "guardrailops",
      kind: "guardrail",
      label: "Guardrail Change Draft",
      requestedAction,
      subjectId: nextDraft.executionProfile,
      subjectLabel: "profile",
      targetScope: nextDraft.targetScope,
      targetLabel: "scope",
      changeKind: nextDraft.changeKind,
      executionProfile: nextDraft.executionProfile,
      safetyBoundary: nextDraft.safetyBoundary,
      proposedState: nextDraft.proposedState,
      status: String(options.status || selectedItem?.status || "draft").trim().toLowerCase(),
      reason: nextDraft.reason,
      summary: `${nextDraft.changeKind} ${nextDraft.proposedState} for ${nextDraft.targetScope} @ ${nextDraft.executionProfile}`,
      simulationSummary: String(options.simulationSummary || selectedItem?.simulationSummary || "").trim(),
      createdAt: String(options.createdAt || selectedItem?.createdAt || new Date().toISOString()).trim(),
      simulatedAt: String(options.simulatedAt || selectedItem?.simulatedAt || "").trim(),
      updatedAt: String(options.updatedAt || new Date().toISOString()).trim(),
      routedAt: String(options.routedAt || selectedItem?.routedAt || "").trim(),
      decision:
        options.decision === null
          ? null
          : options.decision || (selectedItem?.decision && typeof selectedItem.decision === "object" ? selectedItem.decision : null),
      execution:
        options.execution === null
          ? null
          : options.execution ||
            (selectedItem?.execution && typeof selectedItem.execution === "object" ? selectedItem.execution : null),
      receipt:
        options.receipt === null
          ? null
          : options.receipt || (selectedItem?.receipt && typeof selectedItem.receipt === "object" ? selectedItem.receipt : null),
      rollback:
        options.rollback === null
          ? null
          : options.rollback || (selectedItem?.rollback && typeof selectedItem.rollback === "object" ? selectedItem.rollback : null)
    };
  };
  const validateGuardrailOpsDraft = (draft) => {
    const nextDraft = normalizeGuardrailOpsDraft(draft);
    if (!nextDraft.targetScope) {
      return "Target scope is required before saving a guardrail admin proposal.";
    }
    if (!nextDraft.executionProfile) {
      return "Execution profile is required before saving a guardrail admin proposal.";
    }
    if (!nextDraft.safetyBoundary) {
      return "Safety boundary is required before saving a guardrail admin proposal.";
    }
    if (!nextDraft.proposedState) {
      return "Proposed state is required before saving a guardrail admin proposal.";
    }
    if (!nextDraft.reason) {
      return "Reason is required before saving a guardrail admin proposal.";
    }
    return "";
  };
  const buildGuardrailOpsSimulation = (item, draft) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const nextDraft = normalizeGuardrailOpsDraft(draft);
    const settingsPayload =
      latestGuardrailOpsContext?.settings && typeof latestGuardrailOpsContext.settings === "object"
        ? latestGuardrailOpsContext.settings
        : latestSettingsSnapshot;
    const approvals = Array.isArray(latestGuardrailOpsContext?.approvals?.items)
      ? latestGuardrailOpsContext.approvals.items
      : [];
    const pendingApprovalCount = approvals.filter((entry) => String(entry?.status || "").trim().toLowerCase() === "pending").length;
    const policyCatalogItems = Array.isArray(settingsPayload?.policyCatalog?.items)
      ? settingsPayload.policyCatalog.items
      : [];
    const boundaryRequirements = [
      ...new Set(
        policyCatalogItems.flatMap((entry) =>
          Array.isArray(entry?.boundaryRequirements)
            ? entry.boundaryRequirements.map((item) => String(item || "").trim()).filter(Boolean)
            : []
        )
      )
    ];
    const restrictedHostMode = String(settingsPayload?.terminal?.restrictedHostMode || "").trim().toLowerCase() || "blocked";
    const terminalMode = String(settingsPayload?.terminal?.mode || "").trim().toLowerCase() || "interactive_sandbox_only";
    const orgAdminItems = Array.isArray(latestGuardrailOpsContext?.orgAdminProfiles?.items)
      ? latestGuardrailOpsContext.orgAdminProfiles.items
      : [];
    const breakGlassGateCount = orgAdminItems.reduce(
      (count, entry) =>
        count +
        (Array.isArray(entry?.enforcementProfiles)
          ? entry.enforcementProfiles.filter((profile) => String(profile?.category || "").trim().toLowerCase() === "break_glass").length
          : 0),
      0
    );
    const findings = [
      "Execution remains blocked in this slice. GovernanceOps approval is required before any live guardrail change can execute."
    ];
    if (pendingApprovalCount > 0) {
      findings.push("Existing pending approvals mean guardrail changes will land on an already constrained execution surface.");
    }
    if (restrictedHostMode === "blocked") {
      findings.push("Restricted host posture remains blocked for the current desktop surface.");
    }
    if (boundaryRequirements.includes("governed_export_redaction")) {
      findings.push("Governed export redaction remains a required boundary for the current policy posture.");
    }
    if (breakGlassGateCount > 0) {
      findings.push("Break-glass controls remain present and should be reviewed before relaxing any posture.");
    }
    return {
      changeId: String(queueItem.id || "").trim(),
      kind: "guardrail",
      tone:
        pendingApprovalCount > 0 ||
        restrictedHostMode === "blocked" ||
        breakGlassGateCount > 0 ||
        terminalMode === "read_only"
          ? "warn"
          : "info",
      title: "Guardrail admin dry-run",
      summary: `Preview only. This ${nextDraft.changeKind} guardrail proposal requires GovernanceOps approval before any live guardrail change can execute.`,
      updatedAt: new Date().toISOString(),
      facts: [
        { label: "scope", value: nextDraft.targetScope, code: true },
        { label: "profile", value: nextDraft.executionProfile, code: true },
        { label: "boundary", value: nextDraft.safetyBoundary, code: true },
        { label: "state", value: nextDraft.proposedState, code: true },
        { label: "pending approvals", value: String(pendingApprovalCount) },
        { label: "break-glass gates", value: String(breakGlassGateCount) },
        { label: "terminal", value: terminalMode },
        { label: "restricted host", value: restrictedHostMode }
      ],
      findings
    };
  };
  const loadGuardrailOpsQueueItemIntoDraft = (changeId) => {
    const item = findGuardrailOpsQueueItem(changeId);
    if (!item) {
      setGuardrailOpsFeedback("warn", "The selected guardrail admin proposal is no longer available.");
      return false;
    }
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      selectedAdminChangeId: String(item.id || "").trim(),
      recoveryReason: "",
      guardrailDraft: normalizeGuardrailOpsDraft({
        changeKind: item.changeKind,
        targetScope: item.targetScope,
        executionProfile: item.executionProfile || item.subjectId,
        safetyBoundary: item.safetyBoundary,
        proposedState: item.proposedState,
        reason: item.reason
      }),
      latestSimulation:
        String(guardrailOpsViewState.latestSimulation?.changeId || "").trim() === String(item.id || "").trim()
          ? guardrailOpsViewState.latestSimulation
          : null,
      feedback: {
        tone: "info",
        message: `Loaded queued guardrail proposal ${String(item.id || "").trim()} into the active draft editor.`
      }
    };
    renderGuardrailOpsPanel();
    return true;
  };
  const saveGuardrailOpsDraft = () => {
    const draft = normalizeGuardrailOpsDraft(guardrailOpsViewState.guardrailDraft);
    const validationError = validateGuardrailOpsDraft(draft);
    if (validationError) {
      setGuardrailOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildGuardrailOpsQueueItem(draft, { status: "draft" });
    upsertGuardrailOpsQueueItem(queueItem);
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: null,
      feedback: {
        tone: "ok",
        message: `Guardrail draft saved as ${String(queueItem.id || "").trim()}.`
      }
    };
    renderGuardrailOpsPanel();
    return queueItem;
  };
  const simulateGuardrailOpsDraft = (changeId = "") => {
    const selectedQueueItem = changeId ? findGuardrailOpsQueueItem(changeId) : null;
    if (selectedQueueItem) {
      loadGuardrailOpsQueueItemIntoDraft(selectedQueueItem.id);
    }
    const draft = normalizeGuardrailOpsDraft(guardrailOpsViewState.guardrailDraft);
    const validationError = validateGuardrailOpsDraft(draft);
    if (validationError) {
      setGuardrailOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildGuardrailOpsQueueItem(draft, {
      id: selectedQueueItem?.id || String(guardrailOpsViewState.selectedAdminChangeId || "").trim(),
      status: "simulated"
    });
    const simulation = buildGuardrailOpsSimulation(queueItem, draft);
    upsertGuardrailOpsQueueItem({
      ...queueItem,
      status: "simulated",
      simulationSummary: simulation.summary,
      simulatedAt: simulation.updatedAt
    });
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: simulation,
      feedback: {
        tone: simulation.tone,
        message: `Guardrail dry-run is ready for ${String(queueItem.id || "").trim()}.`
      }
    };
    renderGuardrailOpsPanel();
    return simulation;
  };
  const routeGuardrailOpsDraftToGovernance = (changeId = "") => {
    const selectedQueueItem = changeId ? findGuardrailOpsQueueItem(changeId) : null;
    const simulation = guardrailOpsViewState.latestSimulation;
    const matchingSimulation =
      simulation &&
      String(simulation.kind || "").trim().toLowerCase() === "guardrail" &&
      String(simulation.changeId || "").trim() &&
      (!selectedQueueItem || String(simulation.changeId || "").trim() === String(selectedQueueItem.id || "").trim());
    if (!matchingSimulation) {
      setGuardrailOpsFeedback("warn", "Run a bounded dry-run for the active guardrail admin proposal before routing it to GovernanceOps.");
      return false;
    }
    const queueItem =
      selectedQueueItem ||
      buildGuardrailOpsQueueItem(guardrailOpsViewState.guardrailDraft, {
        id: String(guardrailOpsViewState.selectedAdminChangeId || "").trim(),
        status: "simulated",
        simulationSummary: simulation.summary
      });
    upsertGuardrailOpsQueueItem({
      ...queueItem,
      status: "routed",
      simulationSummary: simulation.summary,
      routedAt: new Date().toISOString(),
      decision: null,
      execution: null,
      receipt: null,
      rollback: null
    });
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      feedback: {
        tone: "warn",
        message: `Guardrail admin proposal ${String(queueItem.id || "").trim()} routed to GovernanceOps. Apply remains blocked until an explicit governance approval lands.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "warn",
      `Guardrail admin proposal routed from GuardrailOps: changeId=${String(queueItem.id || "").trim()}; action=${String(queueItem.requestedAction || "").trim()}; profile=${String(queueItem.subjectId || "").trim()}; scope=${String(queueItem.targetScope || "").trim()}. Governance approval is now required before apply can proceed.`
    );
    renderGuardrailOpsPanel();
    setWorkspaceView("governanceops", true);
    return true;
  };
  const openGuardrailOpsGovernanceView = () => {
    setWorkspaceView("governanceops", true);
  };
  const openGuardrailOpsAdminQueueItem = (changeId) => {
    const queueItem = findGuardrailOpsQueueItem(changeId);
    if (!queueItem) {
      setGuardrailOpsFeedback("warn", "The selected guardrail admin proposal is no longer available.");
      return false;
    }
    loadGuardrailOpsQueueItemIntoDraft(changeId);
    setWorkspaceView("guardrailops", true);
    return true;
  };
  const applyApprovedGuardrailOpsChange = (changeId) => {
    const queueItem = findGuardrailOpsQueueItem(changeId);
    if (!queueItem) {
      setGuardrailOpsFeedback("warn", "The selected guardrail admin proposal is no longer available.");
      return false;
    }
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : null;
    if (String(queueItem.status || "").trim().toLowerCase() !== "approved" || !String(decision?.approvalReceiptId || "").trim()) {
      setGuardrailOpsFeedback("warn", "Apply is only available after GovernanceOps records an explicit approved decision receipt.");
      return false;
    }
    if (String(queueItem?.receipt?.receiptId || "").trim()) {
      setGuardrailOpsFeedback("warn", `Guardrail admin change ${String(queueItem.id || "").trim()} already has an admin receipt.`);
      return false;
    }
    const actorRef = guardrailOpsActorRef();
    const executedAt = new Date().toISOString();
    const executionId = `admin-execution-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const receiptId = `admin-receipt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const executionSummary = `${String(queueItem.requestedAction || "").trim()} applied for ${String(queueItem.targetScope || "").trim()} on ${String(queueItem.executionProfile || queueItem.subjectId || "").trim()}.`;
    const receipt = {
      receiptId,
      issuedAt: executedAt,
      summary: executionSummary,
      stableRef: `${String(queueItem.id || "").trim()}/${receiptId}`,
      approvalReceiptId: String(decision.approvalReceiptId || "").trim(),
      executionId
    };
    upsertGuardrailOpsQueueItem({
      ...queueItem,
      status: "applied",
      updatedAt: executedAt,
      execution: {
        executionId,
        executedAt,
        status: "applied",
        summary: executionSummary,
        actorRef
      },
      receipt
    });
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `Approved guardrail admin change ${String(queueItem.id || "").trim()} applied. Admin receipt ${receiptId} is now available.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "ok",
      `Guardrail admin change ${String(queueItem.id || "").trim()} applied from GuardrailOps. Receipt ${receiptId} is now linked to approval receipt ${String(decision.approvalReceiptId || "").trim()}.`
    );
    renderGuardrailOpsPanel();
    return true;
  };
  const applyGuardrailOpsRecoveryAction = (changeId, action) => {
    const queueItem = findGuardrailOpsQueueItem(changeId);
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!queueItem) {
      setGuardrailOpsFeedback("warn", "The selected guardrail admin proposal is no longer available.");
      return false;
    }
    if (String(queueItem.status || "").trim().toLowerCase() !== "applied" || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setGuardrailOpsFeedback("warn", "Rollback is only available after an approved guardrail change has been applied and receipted.");
      return false;
    }
    if (String(queueItem?.rollback?.rollbackId || "").trim()) {
      setGuardrailOpsFeedback("warn", `Recovery has already been recorded for guardrail admin change ${String(queueItem.id || "").trim()}.`);
      return false;
    }
    if (normalizedAction !== "rollback") {
      setGuardrailOpsFeedback("warn", "Unsupported recovery action for the selected guardrail admin proposal.");
      return false;
    }
    const reason = String(guardrailOpsViewState.recoveryReason || "").trim();
    if (!reason) {
      setGuardrailOpsFeedback("warn", "Rollback reason is required before guardrail recovery can execute.");
      return false;
    }
    const actorRef = guardrailOpsActorRef();
    const rolledBackAt = new Date().toISOString();
    const rollbackId = `admin-rollback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const rollback = {
      rollbackId,
      action: "rollback",
      status: "rolled_back",
      rolledBackAt,
      summary: `Rolled back ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.targetScope || "").trim()} on ${String(queueItem.executionProfile || queueItem.subjectId || "").trim()}.`,
      stableRef: `${String(queueItem.id || "").trim()}/${rollbackId}`,
      reason,
      actorRef,
      approvalReceiptId: String(queueItem?.decision?.approvalReceiptId || "").trim(),
      adminReceiptId: String(queueItem?.receipt?.receiptId || "").trim(),
      executionId: String(queueItem?.execution?.executionId || "").trim()
    };
    upsertGuardrailOpsQueueItem({
      ...queueItem,
      status: "rolled_back",
      updatedAt: rolledBackAt,
      rollback
    });
    guardrailOpsViewState = {
      ...guardrailOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `Rollback recorded for guardrail admin change ${String(queueItem.id || "").trim()}. Recovery receipt ${rollbackId} is now available.`
      }
    };
    setGovernanceOpsFeedback(
      "warn",
      `GuardrailOps recorded rollback for admin change ${String(queueItem.id || "").trim()}. Recovery record ${rollbackId} is linked to approval receipt ${String(rollback.approvalReceiptId || "").trim()}.`
    );
    renderGuardrailOpsPanel();
    return true;
  };
  const copyGuardrailOpsGovernanceReceipt = async (changeId) => {
    const queueItem = findGuardrailOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.decision?.approvalReceiptId || "").trim()) {
      setGuardrailOpsFeedback("warn", "No governance decision receipt is available for the selected guardrail admin change.");
      return false;
    }
    await copyTextToClipboard(buildGuardrailOpsGovernanceReceiptText(queueItem));
    setGuardrailOpsFeedback("ok", `Governance decision receipt copied for guardrail admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyGuardrailOpsAdminReceipt = async (changeId) => {
    const queueItem = findGuardrailOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setGuardrailOpsFeedback("warn", "No admin change receipt is available for the selected guardrail admin change.");
      return false;
    }
    await copyTextToClipboard(buildGuardrailOpsAdminReceiptText(queueItem));
    setGuardrailOpsFeedback("ok", `Admin change receipt copied for guardrail admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyGuardrailOpsRollbackReceipt = async (changeId) => {
    const queueItem = findGuardrailOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.rollback?.rollbackId || "").trim()) {
      setGuardrailOpsFeedback("warn", "No rollback receipt is available for the selected guardrail admin change.");
      return false;
    }
    await copyTextToClipboard(buildGuardrailOpsRollbackReceiptText(queueItem));
    setGuardrailOpsFeedback("ok", `Rollback receipt copied for guardrail admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const setRuntimeOpsFeedback = (tone, message) => {
    runtimeOpsViewState = {
      ...runtimeOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderRuntimeOpsPanel();
  };
  const setAuditOpsHandoffPreview = (text, options = {}) => {
    const preview = String(text || "").trim() || DEFAULT_AUDITOPS_HANDOFF_PREVIEW;
    if (ui.auditHandoffPreview instanceof HTMLElement) {
      ui.auditHandoffPreview.textContent = preview;
    }
    auditOpsViewState = {
      ...auditOpsViewState,
      handoffPreview: preview
    };
    if (options.render !== false) {
      renderAuditOpsPanel();
    }
  };
  const setEvidenceOpsFeedback = (tone, message) => {
    evidenceOpsViewState = {
      ...evidenceOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderEvidenceOpsPanel();
  };
  const setPolicyOpsFeedback = (tone, message) => {
    policyOpsViewState = {
      ...policyOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderPolicyOpsPanel();
  };
  const setPolicyOpsRecoveryReason = (value) => {
    policyOpsViewState = {
      ...policyOpsViewState,
      recoveryReason: String(value || "").trimStart()
    };
  };
  const setIncidentOpsFeedback = (tone, message) => {
    incidentOpsViewState = {
      ...incidentOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderIncidentOpsPanel();
  };
  const setIncidentOpsSelection = (entryId, options = {}) => {
    const normalizedEntryId = String(entryId || "").trim();
    const nextSelectedIncidentId =
      incidentOpsViewState.selectedIncidentId &&
      incidentOpsViewState.selectedIncidentId === normalizedEntryId &&
      options.force !== true
        ? ""
        : normalizedEntryId;
    const selectedIncident =
      getAimxsIncidentItems().find((item) => normalizeAimxsValue(item?.id) === normalizeAimxsValue(nextSelectedIncidentId)) ||
      null;
    if (options.syncSpine !== false) {
      setAimxsSpineSelection(selectedIncident?.runId, nextSelectedIncidentId, { render: false });
    }
    incidentOpsViewState = {
      ...incidentOpsViewState,
      selectedIncidentId: nextSelectedIncidentId
    };
    if (options.render === false) {
      return;
    }
    if (options.syncSpine !== false) {
      syncAimxsSpinePanels();
      return;
    }
    renderIncidentOpsPanel();
  };
  const openAimxsSpineWorkspace = async (view = "", runId = "", incidentEntryId = "") => {
    const workspaceView = String(view || "").trim().toLowerCase();
    const normalizedRunId = normalizeAimxsValue(runId);
    const resolvedIncidentEntryId = normalizeAimxsValue(
      incidentEntryId,
      findIncidentEntryByRunId(normalizedRunId)?.id
    );
    if (!workspaceView) {
      return false;
    }
    setAimxsSpineSelection(normalizedRunId, resolvedIncidentEntryId, { render: false });
    if (workspaceView === "governanceops" && normalizedRunId) {
      setGovernanceOpsSelection(normalizedRunId, {
        force: true,
        syncSpine: false,
        render: false
      });
    }
    if (workspaceView === "incidentops" && resolvedIncidentEntryId) {
      setIncidentOpsSelection(resolvedIncidentEntryId, {
        force: true,
        syncSpine: false,
        render: false
      });
    }
    syncAimxsSpinePanels();
    setWorkspaceView(workspaceView, true);
    if (workspaceView === "agentops") {
      focusRenderedRegion(ui.chatContent, { scroll: false });
      return true;
    }
    if (workspaceView === "governanceops") {
      focusRenderedRegion(ui.governanceOpsContent, { scroll: false });
      return true;
    }
    if (workspaceView === "auditops") {
      focusRenderedRegion(ui.auditOpsContent || ui.auditContent, { scroll: false });
      return true;
    }
    if (workspaceView === "evidenceops") {
      focusRenderedRegion(ui.evidenceOpsContent, { scroll: false });
      return true;
    }
    if (workspaceView === "incidentops") {
      focusRenderedRegion(ui.incidentOpsContent, { scroll: false });
      return true;
    }
    return false;
  };
  const handleAimxsSpineWorkspaceClick = async (target) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const actionNode = target.closest('[data-aimxs-spine-action="open-workspace"]');
    if (!(actionNode instanceof HTMLElement)) {
      return false;
    }
    await openAimxsSpineWorkspace(
      String(actionNode.dataset.aimxsSpineView || "").trim(),
      String(actionNode.dataset.aimxsSpineRunId || "").trim(),
      String(actionNode.dataset.aimxsSpineIncidentEntryId || "").trim()
    );
    return true;
  };
  syncAuditOpsFeedbackState = (tone, message) => {
    const normalizedMessage = String(message || "").trim();
    auditOpsViewState = {
      ...auditOpsViewState,
      feedback: normalizedMessage
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: normalizedMessage
          }
        : null
    };
    renderAuditOpsPanel();
  };
  syncAuditOpsHandoffPreviewState = setAuditOpsHandoffPreview;
  const setRuntimeOpsSessionReviewState = (sessionId, sessionReview, sessionReviewMeta, options = {}) => {
    runtimeOpsViewState = {
      ...runtimeOpsViewState,
      selectedSessionId: String(sessionId || runtimeOpsViewState.selectedSessionId || "").trim(),
      sessionReview,
      sessionReviewMeta
    };
    if (options.render !== false) {
      renderRuntimeOpsPanel();
    }
  };
  const loadRuntimeOpsSessionReview = async (sessionId = "", options = {}) => {
    const resolvedSessionID = String(sessionId || runtimeOpsViewState.selectedSessionId || "").trim();
    if (!resolvedSessionID) {
      setRuntimeOpsSessionReviewState(
        "",
        null,
        {
          state: "idle",
          tone: "neutral",
          message: "Select a runtime session to inspect its bounded review and worker posture."
        },
        options
      );
      return null;
    }
    setRuntimeOpsSessionReviewState(
      resolvedSessionID,
      null,
      {
        state: "loading",
        tone: "neutral",
        message: `Loading runtime session review for ${resolvedSessionID}...`
      },
      options
    );
    const sessionReview = await loadNativeSessionView(api, resolvedSessionID, {
      tailCount: 8,
      waitSeconds: 1
    });
    const reviewStatus = String(sessionReview?.status || "").trim().toLowerCase();
    const tone = reviewStatus === "error" ? "danger" : reviewStatus === "warn" ? "warn" : "ok";
    setRuntimeOpsSessionReviewState(
      resolvedSessionID,
      sessionReview,
      {
        state: reviewStatus || "ready",
        tone,
        message: String(sessionReview?.message || "Native runtime session review is loaded.").trim()
      },
      options
    );
    if (options.focus) {
      const reviewNode = ui.runtimeOpsContent?.querySelector(
        "[data-runtimeops-panel='workspace-selected-session']"
      );
      if (reviewNode instanceof HTMLElement) {
        focusRenderedRegion(reviewNode, { block: "center" });
      }
    }
    return sessionReview;
  };
  renderHomePanel();
  renderLogOpsPanel();
  renderContextPanel();
  renderDeveloperOpsPanel();
  let refreshInFlight = false;
  let refreshQueued = false;
  let hasHydratedPanels = false;

  function scheduleRefreshStatusLoading(detail = "refreshing") {
    refreshStatusShell.scheduleLoading(detail, () => refreshInFlight);
  }

  function clearRefreshStatusLoadingTimer() {
    refreshStatusShell.clearLoadingTimer();
  }

  async function refresh() {
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }
    refreshInFlight = true;
    scheduleRefreshStatusLoading("refreshing");
    let refreshSucceeded = false;

    session = getSession();
    setAuthDisplay(ui, session);
    let projectID = activeProjectScope(session);
    await syncProjectIntegrationSettings(projectID, session);
    let currentChoices = resolveProjectChoices(projectID);
    refreshGovernedActionPreview(session);
    refreshRunBuilderPreview(session);
    refreshTerminalPreview(session, currentChoices);

    if (config.auth?.enabled && !session.authenticated && !config.mockMode) {
      clearDataPanels();
      triageSnapshot = createEmptyHomeSnapshot();
      renderHomeErrorPanel("Sign in is required to view runtime and provider data.", {
        snapshot: triageSnapshot,
        terminalHistory: []
      });
      clearRefreshStatusLoadingTimer();
      setRefreshStatus("warn", "sign-in required");
      refreshInFlight = false;
      return;
    }

    const previousViewport = {
      x: window.scrollX,
      y: window.scrollY
    };
    if (!hasHydratedPanels) {
      renderPanelLoadingStates();
    }

    try {
      for (let refreshAttempt = 0; refreshAttempt < 2; refreshAttempt += 1) {
        const runScope = readRunFilters(ui);
        const auditScope = readAuditFilters(ui);
        const approvalScope = readApprovalFilters(ui);
        persistListFilterStateFromUI();

        const runtimeSessionsPromise = api.listRuntimeSessions({ limit: 25 }).catch((error) => ({
          source: "unavailable",
          warning: `Runtime session list unavailable: ${error.message}`,
          count: 0,
          items: []
        }));
        const runtimeWorkerCapabilitiesPromise = api
          .listRuntimeWorkerCapabilities({ clientSurface: "desktop" })
          .catch((error) => ({
            source: "unavailable",
            warning: `Runtime worker-capability catalog unavailable: ${error.message}`,
            count: 0,
            items: []
          }));

        const [
          health,
          pipeline,
          providers,
          runs,
          localSecureRefs,
          aimxsActivation,
          runtimeIdentity,
          policyPacksCatalog,
          runtimeSessions,
          runtimeWorkerCapabilities
        ] = await Promise.all([
          api.getHealth(),
          api.getPipelineStatus(),
          api.getProviders(),
          api.getRuntimeRuns(runScope.limit),
          api.getLocalSecureRefs(),
          api.getAimxsActivation(),
          api.getRuntimeIdentity(),
          api.listRuntimePolicyPacks({ clientSurface: "desktop" }),
          runtimeSessionsPromise,
          runtimeWorkerCapabilitiesPromise
        ]);
        localSecureRefSnapshot = normalizeLocalSecureRefSnapshot(localSecureRefs);
        aimxsActivationSnapshot = normalizeAimxsActivationSnapshot(aimxsActivation);

        const [audit, approvals] = await Promise.all([
          api.getAuditEvents(auditScope, runs.items || []),
          api.getApprovalQueue(approvalScope, runs.items || [])
        ]);

        if (refreshAttempt === 0 && seedRuntimeScopeFromSnapshot({ runs, approvals, audit }, session)) {
          session = getSession();
          setAuthDisplay(ui, session);
          projectID = activeProjectScope(session);
          await syncProjectIntegrationSettings(projectID, session, { force: true });
          currentChoices = resolveProjectChoices(projectID);
          refreshGovernedActionPreview(session);
          refreshRunBuilderPreview(session);
          refreshTerminalPreview(session, currentChoices);
          continue;
        }

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
          runtimeIdentity,
          policyPacksCatalog,
          themeMode: selectedThemeMode,
          selectedAgentProfileId,
          aimxsActivation: aimxsActivationSnapshot,
          localSecureRefs: localSecureRefSnapshot
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
        const homeSnapshot = {
          session,
          settings: settingsWithConfigChanges,
          health,
          pipeline,
          providers,
          runs,
          approvals,
          audit,
          incidentHistory: {
            items: store.getIncidentPackageHistory()
          }
        };
        latestSettingsSnapshot = settingsWithConfigChanges;
        latestDeveloperOpsContext = {
          session,
          settings: settingsWithConfigChanges,
          health,
          providers,
          runs,
          projectScope: projectID,
          selectedAgentProfileId
        };
        triageSnapshot = homeSnapshot;
        latestAuditPayload = audit || { items: [] };
        renderHomePanel({
          snapshot: homeSnapshot
        });
        renderContextPanel();
        renderDeveloperOpsPanel();
        renderAgentOpsPanel();
        renderIdentityOpsPanel({
          settings: settingsWithConfigChanges,
          session
        });
        renderGuardrailOpsPanel({
          settings: settingsWithConfigChanges,
          runs,
          approvals,
          runtimeWorkerCapabilities,
          exportProfiles: desktopGovernedExportCatalogState?.exportProfiles || null,
          orgAdminProfiles: desktopGovernedExportCatalogState?.orgAdminProfiles || null
        });
        renderGovernanceOpsPanel({
          settings: settingsWithConfigChanges,
          approvals,
          runs,
          session,
          orgAdminProfiles: desktopGovernedExportCatalogState?.orgAdminProfiles || null
        });
        renderAuditOpsPanel({
          audit,
          filters: auditScope,
          actor: String(
            session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || ""
          ).trim(),
          runs,
          approvals
        });
        renderEvidenceOpsPanel({
          settings: settingsWithConfigChanges,
          audit,
          runs,
          approvals,
          thread: operatorChatState.thread
        });
        renderIncidentOpsPanel({
          incidentHistory: {
            items: store.getIncidentPackageHistory()
          },
          runs,
          approvals,
          audit
        });
        renderLogOpsPanel();
        renderComplianceOpsPanel({
          settings: settingsWithConfigChanges,
          runs,
          approvals,
          audit,
          health,
          pipeline,
          providers,
          aimxsActivation: aimxsActivationSnapshot,
          exportProfiles: desktopGovernedExportCatalogState?.exportProfiles || null,
          orgAdminProfiles: desktopGovernedExportCatalogState?.orgAdminProfiles || null
        });
        renderPlatformOpsPanel({
          health,
          pipeline,
          providers,
          aimxsActivation: aimxsActivationSnapshot
        });
        renderNetworkOpsPanel({
          settings: settingsWithConfigChanges,
          health,
          providers,
          runs,
          runtimeWorkerCapabilities
        });
        renderPolicyOpsPanel({
          settings: settingsWithConfigChanges,
          runs
        });
        renderRuntimeOpsPanel({
          health,
          pipeline,
          providers,
          runs,
          approvals,
          runtimeIdentity,
          runtimeSessions,
          runtimeWorkerCapabilities
        });
        const editorState = buildSettingsEditorState(
          activeProjectScope(session),
          settingsWithConfigChanges,
          store.getState().integrationEditorDraftsByProject || {},
          store.getState().integrationEditorStatusByProject || {},
          integrationOverrides,
          runtimeIntegrationSyncStateByProject
        );
        const nativeApprovalRailItems = buildCombinedNativeApprovalRailItems();
        let selectedApprovalRunId = readPinnedApprovalSelectionId();
        let selectedApproval = resolveApprovalSelection(selectedApprovalRunId);
        if (!selectedApproval && !isApprovalSelectionDismissed()) {
          const fallbackSelectionId = String(nativeApprovalRailItems[0]?.selectionId || "").trim();
          if (fallbackSelectionId) {
            selectedApprovalRunId = fallbackSelectionId;
            selectedApproval = resolveApprovalSelection(selectedApprovalRunId);
            if (ui.approvalsDetailContent) {
              ui.approvalsDetailContent.dataset.selectedRunId = selectedApprovalRunId;
            }
          } else if (ui.approvalsDetailContent && selectedApprovalRunId) {
            delete ui.approvalsDetailContent.dataset.selectedRunId;
            selectedApprovalRunId = "";
          }
        }
        renderSettingsOpsPage(ui, {
          session,
          settings: settingsWithConfigChanges,
          editorState,
          selectedAgentProfileId,
          viewState: {
            subview: settingsSubviewState,
            aimxsEditor: aimxsEditorState,
            demoGovernance: demoGovernanceEditorState,
            localSecureRefEditor: localSecureRefEditorState,
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
          }
        });
        setSettingsSubview(settingsSubviewState);
        renderApprovals(ui, store, approvals, approvalScope, selectedApprovalRunId, nativeApprovalRailItems);
        renderApprovalsDetail(ui, selectedApproval);
        mountAgentOpsEmbeddedPanels(ui);
        if (approvalReviewModalIsOpen()) {
          if (selectedApproval && !String(selectedApproval?.selectionId || "").trim().startsWith("native:")) {
            renderApprovalReviewModal(ui, selectedApproval);
          } else {
            closeApprovalReviewModal();
          }
        }
        renderRuns(ui, store, runs, runScope);
        renderAudit(ui, audit, auditScope, {
          actor: String(
            session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || ""
          ).trim(),
          source: audit?.source || ""
        });
        applyAdvancedState();
        applyDetailsOpenState();
        if (hasHydratedPanels) {
          window.requestAnimationFrame(() => {
            window.scrollTo(previousViewport.x, previousViewport.y);
          });
        }
        hasHydratedPanels = true;
        refreshSucceeded = true;
        break;
      }
    } catch (error) {
      clearRefreshStatusLoadingTimer();
      renderHomeErrorPanel(`Refresh failed: ${error.message}`);
      renderRuntimeOpsEmptyState(ui, {
        tone: "error",
        message: `RuntimeOps refresh failed: ${error.message}`
      });
      renderGuardrailOpsEmptyState(ui, {
        tone: "error",
        message: `GuardrailOps refresh failed: ${error.message}`
      });
      renderGovernanceOpsEmptyState(ui, {
        tone: "error",
        message: `GovernanceOps refresh failed: ${error.message}`
      });
      renderAuditOpsEmptyState(ui, {
        tone: "error",
        message: `AuditOps refresh failed: ${error.message}`
      });
      renderEvidenceOpsEmptyState(ui, {
        tone: "error",
        message: `EvidenceOps refresh failed: ${error.message}`
      });
      renderComplianceOpsEmptyState(ui, {
        tone: "error",
        message: `ComplianceOps refresh failed: ${error.message}`
      });
      renderIncidentOpsEmptyState(ui, {
        tone: "error",
        message: `IncidentOps refresh failed: ${error.message}`
      });
      renderLogOpsPanel();
      renderPlatformOpsEmptyState(ui, {
        tone: "error",
        message: `PlatformOps refresh failed: ${error.message}`
      });
      renderNetworkOpsEmptyState(ui, {
        tone: "error",
        message: `NetworkOps refresh failed: ${error.message}`
      });
      renderPolicyOpsEmptyState(ui, {
        tone: "error",
        message: `PolicyOps refresh failed: ${error.message}`
      });
      setRefreshStatus("error", "refresh failed");
    } finally {
      reconcileOperatorChatFollowLoop();
      clearRefreshStatusLoadingTimer();
      refreshInFlight = false;
      if (refreshSucceeded) {
        setRefreshStatus("ok", `synced ${formatRefreshClock()}`);
      }
      if (refreshQueued) {
        refreshQueued = false;
        refresh().catch(() => {});
      }
    }
  }

  async function refreshStatusOnly() {
    if (refreshInFlight) {
      return;
    }
    const currentSession = getSession();
    if (config.auth?.enabled && !currentSession.authenticated && !config.mockMode) {
      setRefreshStatus("warn", "sign-in required");
      return;
    }
    try {
      const health = await api.getHealth();
      const runtimeStatus = String(health?.runtime?.status || "").trim().toLowerCase();
      const runtimeDetail = String(health?.runtime?.detail || "").trim();
      if (runtimeStatus === "error") {
        setRefreshStatus("error", runtimeDetail || "status check failed");
        return;
      }
      if (runtimeStatus === "warn") {
        setRefreshStatus("warn", runtimeDetail || "runtime degraded");
        return;
      }
      setRefreshStatus("ok", `synced ${formatRefreshClock()}`);
    } catch (error) {
      const detail = String(error?.message || "").trim();
      setRefreshStatus("error", detail || "status check failed");
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
    const packageId = `incident-${buildTimestampToken(generatedAt)}-${safeFileToken(runId, "run-none")}`;
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

  function getCurrentEvidenceOpsSnapshot() {
    return createEvidenceWorkspaceSnapshot({
      ...latestEvidenceOpsContext,
      adminQueueItems: getAdminLifecycleQueueItems(),
      incidentHistory: {
        items: store.getIncidentPackageHistory()
      },
      viewState: evidenceOpsViewState
    });
  }

  function getCurrentPolicyOpsSnapshot() {
    return createPolicyWorkspaceSnapshot({
      ...latestPolicyOpsContext,
      viewState: policyOpsViewState
    });
  }

  function buildPolicyOpsDecisionExplanationPayload(snapshot = {}) {
    return {
      exportedAt: new Date().toISOString(),
      source: "policyops",
      board: "decision_explanation",
      currentContract: snapshot?.currentContract || {},
      decisionExplanation: snapshot?.decisionExplanation || {},
      policyCoverage: snapshot?.policyCoverage || {},
      stableReferences: snapshot?.stableReferences || {}
    };
  }

  function buildPolicyOpsReviewFileName(prefix, token) {
    const normalizedPrefix = String(prefix || "policy-review").trim() || "policy-review";
    const normalizedToken =
      String(token || "latest")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-") || "latest";
    return `epydiosops-${normalizedPrefix}-${normalizedToken}.json`;
  }

  function buildPolicyOpsStableReferenceText(snapshot = {}) {
    const refs = snapshot?.stableReferences || {};
    return [
      `provider=${String(snapshot?.currentContract?.providerLabel || "-").trim() || "-"}`,
      `mode=${String(snapshot?.currentContract?.mode || "-").trim() || "-"}`,
      `catalogSource=${String(snapshot?.currentContract?.catalogSource || "-").trim() || "-"}`,
      `contractId=${String(refs.contractId || "-").trim() || "-"}`,
      `runId=${String(refs.runId || "-").trim() || "-"}`,
      `providerId=${String(refs.providerId || "-").trim() || "-"}`,
      `packId=${String(refs.packId || "-").trim() || "-"}`,
      `boundaryClass=${String(refs.boundaryClass || "-").trim() || "-"}`,
      `riskTier=${String(refs.riskTier || "-").trim() || "-"}`,
      `auditEventRef=${String(refs.auditEventRef || "-").trim() || "-"}`
    ].join("\n");
  }

  function runPolicyOpsExportDecisionExplanation() {
    const snapshot = getCurrentPolicyOpsSnapshot();
    const board = snapshot?.decisionExplanation || {};
    if (!board.available || !board.exportable) {
      setPolicyOpsFeedback("warn", "No recorded policy decision is available yet, so decision explanation export was skipped.");
      return false;
    }
    const payload = buildPolicyOpsDecisionExplanationPayload(snapshot);
    const fileName = buildPolicyOpsReviewFileName(
      "policy-decision-explanation",
      board.runId || snapshot?.stableReferences?.contractId
    );
    const prepared = exportGovernedJson(
      payload,
      fileName,
      buildDesktopGovernedExportOptions("audit_export", "downstream_review", "review")
    );
    setPolicyOpsFeedback(
      "ok",
      `Policy decision explanation JSON downloaded as ${fileName}.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "policy review")}`
    );
    return true;
  }

  async function runPolicyOpsCopyStableReferences() {
    const snapshot = getCurrentPolicyOpsSnapshot();
    const refs = snapshot?.stableReferences || {};
    if (!refs.contractId && !refs.runId && !refs.providerId) {
      setPolicyOpsFeedback("warn", "No stable policy references are available yet from the current PolicyOps snapshot.");
      return false;
    }
    try {
      await copyTextToClipboard(buildPolicyOpsStableReferenceText(snapshot));
      setPolicyOpsFeedback("ok", "Stable policy references copied to the clipboard.");
      return true;
    } catch (error) {
      setPolicyOpsFeedback("error", `Copy failed: ${error.message}`);
      return false;
    }
  }

  function runPolicyOpsRefreshSimulation() {
    const snapshot = getCurrentPolicyOpsSnapshot();
    const board = snapshot?.policySimulation || {};
    if (!board.available || !board.refreshable) {
      setPolicyOpsFeedback("warn", "No governed run replay is available yet, so bounded simulation refresh was skipped.");
      return false;
    }
    policyOpsViewState = {
      ...policyOpsViewState,
      simulationRefreshedAt: new Date().toISOString()
    };
    renderPolicyOpsPanel();
    setPolicyOpsFeedback(
      "ok",
      `Policy simulation refreshed from the latest governed run replay. Expected outcome=${String(board.expectedOutcome || "UNSET").trim() || "UNSET"}; blockers=${String(board.blockerCount || 0)}.`
    );
    return true;
  }

  function openPolicyOpsGovernance() {
    const snapshot = getCurrentPolicyOpsSnapshot();
    const runId = String(snapshot?.decisionExplanation?.runId || "").trim();
    if (!runId) {
      setPolicyOpsFeedback("warn", "No linked governance run is available from the current PolicyOps snapshot.");
      return false;
    }
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedRunId: runId
    };
    renderGovernanceOpsPanel();
    setWorkspaceView("governanceops", true);
    focusRenderedRegion(ui.governanceOpsContent, { scroll: false });
    setPolicyOpsFeedback("info", `Opened linked governance context for ${runId}.`);
    return true;
  }

  const policyOpsActorRef = () =>
    String(session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || "").trim() ||
    "policy-operator";

  const normalizePolicyOpsAdminDraft = (draft = {}) => {
    const snapshot = getCurrentPolicyOpsSnapshot();
    const input = draft && typeof draft === "object" ? draft : {};
    const providerOptions = Array.isArray(snapshot?.admin?.currentScope?.providerOptions)
      ? snapshot.admin.currentScope.providerOptions.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    const providerIdFallback =
      String(input.providerId || "").trim() ||
      providerOptions[0] ||
      String(snapshot?.currentContract?.providerId || "").trim();
    const changeKind = String(input.changeKind || "").trim().toLowerCase();
    return {
      changeKind: changeKind === "activate" ? "activate" : "load",
      packId:
        String(input.packId || "").trim() ||
        String(snapshot?.admin?.currentScope?.currentPackId || "").trim(),
      providerId: providerIdFallback,
      targetScope:
        String(input.targetScope || "").trim() ||
        String(snapshot?.admin?.currentScope?.defaultTargetScope || "").trim() ||
        "workspace",
      reason: String(input.reason || "").trim()
    };
  };

  const updatePolicyOpsDraftField = (field, value) => {
    const nextDraft = normalizePolicyOpsAdminDraft({
      ...policyOpsViewState.adminDraft,
      [field]: String(value || "").trim()
    });
    policyOpsViewState = {
      ...policyOpsViewState,
      adminDraft: nextDraft,
      latestSimulation: null,
      latestVerification: null,
      feedback: null
    };
    renderPolicyOpsPanel();
  };

  const findPolicyOpsQueueItem = (changeId) => {
    const normalizedChangeId = String(changeId || "").trim();
    if (!normalizedChangeId) {
      return null;
    }
    return (
      (Array.isArray(policyOpsViewState.queueItems) ? policyOpsViewState.queueItems : []).find(
        (item) => String(item?.id || "").trim() === normalizedChangeId
      ) || null
    );
  };

  const upsertPolicyOpsQueueItem = (nextItem) => {
    const item = nextItem && typeof nextItem === "object" ? nextItem : null;
    const changeId = String(item?.id || "").trim();
    if (!changeId) {
      return null;
    }
    const existingItems = Array.isArray(policyOpsViewState.queueItems) ? policyOpsViewState.queueItems : [];
    const nextItems = [];
    let replaced = false;
    existingItems.forEach((entry) => {
      const entryId = String(entry?.id || "").trim();
      if (entryId === changeId) {
        nextItems.push({
          ...entry,
          ...item
        });
        replaced = true;
        return;
      }
      nextItems.push(entry);
    });
    if (!replaced) {
      nextItems.unshift(item);
    }
    policyOpsViewState = {
      ...policyOpsViewState,
      queueItems: nextItems
    };
    syncAdminTracePanels();
    return nextItems.find((entry) => String(entry?.id || "").trim() === changeId) || null;
  };

  const buildPolicyOpsQueueItem = (draft, options = {}) => {
    const nextDraft = normalizePolicyOpsAdminDraft(draft);
    const selectedItem = findPolicyOpsQueueItem(policyOpsViewState.selectedAdminChangeId);
    const existingId = String(options.id || selectedItem?.id || "").trim();
    const changeId =
      existingId || `policy-change-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const requestedAction = `${nextDraft.changeKind} ${nextDraft.packId || "policy-pack"}`.trim();
    return {
      id: changeId,
      ownerDomain: "policyops",
      kind: "policy",
      label: "Policy Pack Load And Activation Draft",
      requestedAction,
      subjectId: nextDraft.packId,
      subjectLabel: "pack",
      targetScope: nextDraft.targetScope,
      targetLabel: "scope",
      changeKind: nextDraft.changeKind,
      packId: nextDraft.packId,
      providerId: nextDraft.providerId,
      status: String(options.status || selectedItem?.status || "draft").trim().toLowerCase(),
      reason: nextDraft.reason,
      summary: `${nextDraft.changeKind === "activate" ? "Activate" : "Load"} ${nextDraft.packId || "policy-pack"} for ${nextDraft.targetScope} @ ${nextDraft.providerId || "policy-provider"}`,
      simulationSummary: String(options.simulationSummary || selectedItem?.simulationSummary || "").trim(),
      verification:
        options.verification === null
          ? null
          : options.verification || (selectedItem?.verification && typeof selectedItem.verification === "object" ? selectedItem.verification : null),
      createdAt: String(options.createdAt || selectedItem?.createdAt || new Date().toISOString()).trim(),
      simulatedAt: String(options.simulatedAt || selectedItem?.simulatedAt || "").trim(),
      updatedAt: String(options.updatedAt || new Date().toISOString()).trim(),
      routedAt: String(options.routedAt || selectedItem?.routedAt || "").trim(),
      decision:
        options.decision === null
          ? null
          : options.decision || (selectedItem?.decision && typeof selectedItem.decision === "object" ? selectedItem.decision : null),
      execution:
        options.execution === null
          ? null
          : options.execution || (selectedItem?.execution && typeof selectedItem.execution === "object" ? selectedItem.execution : null),
      receipt:
        options.receipt === null
          ? null
          : options.receipt || (selectedItem?.receipt && typeof selectedItem.receipt === "object" ? selectedItem.receipt : null),
      rollback:
        options.rollback === null
          ? null
          : options.rollback || (selectedItem?.rollback && typeof selectedItem.rollback === "object" ? selectedItem.rollback : null)
    };
  };

  const validatePolicyOpsAdminDraft = (draft) => {
    const nextDraft = normalizePolicyOpsAdminDraft(draft);
    const snapshot = getCurrentPolicyOpsSnapshot();
    const packItems = Array.isArray(snapshot?.policyCatalogItems) ? snapshot.policyCatalogItems : [];
    const providerOptions = Array.isArray(snapshot?.admin?.currentScope?.providerOptions)
      ? snapshot.admin.currentScope.providerOptions.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    if (!nextDraft.packId) {
      return "Policy pack is required before saving a PolicyOps admin proposal.";
    }
    if (packItems.length > 0 && !packItems.some((item) => String(item?.packId || "").trim() === nextDraft.packId)) {
      return "Policy pack must be selected from the loaded catalog before saving a PolicyOps admin proposal.";
    }
    if (!nextDraft.providerId) {
      return "Decision provider is required before saving a PolicyOps admin proposal.";
    }
    if (providerOptions.length > 0 && !providerOptions.includes(nextDraft.providerId)) {
      return "Decision provider must be selected from the loaded PolicyOps scope before saving a PolicyOps admin proposal.";
    }
    if (!nextDraft.targetScope) {
      return "Applicability scope is required before saving a PolicyOps admin proposal.";
    }
    if (!nextDraft.reason) {
      return "Reason is required before saving a PolicyOps admin proposal.";
    }
    return "";
  };

  const buildPolicyOpsSimulation = (item, draft) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const nextDraft = normalizePolicyOpsAdminDraft(draft);
    const snapshot = getCurrentPolicyOpsSnapshot();
    const packItems = Array.isArray(snapshot?.policyCatalogItems) ? snapshot.policyCatalogItems : [];
    const selectedPack =
      packItems.find((entry) => String(entry?.packId || "").trim() === nextDraft.packId) || null;
    const decisionSurfaceCount = Array.isArray(selectedPack?.decisionSurfaces) ? selectedPack.decisionSurfaces.length : 0;
    const boundaryRequirementCount = Array.isArray(selectedPack?.boundaryRequirements)
      ? selectedPack.boundaryRequirements.length
      : 0;
    const findings = [
      "Execution remains blocked until GovernanceOps records an explicit approved decision receipt for this policy proposal."
    ];
    if (nextDraft.changeKind === "load") {
      findings.push("Load preview only. Activation remains closed in this slice even if the load proposal is later approved.");
    } else {
      findings.push("Activation preview only. Live activation remains blocked in this slice until a later apply path opens.");
    }
    if (selectedPack && decisionSurfaceCount === 0) {
      findings.push("Selected pack is missing declared decision surfaces in the loaded catalog.");
    }
    if (selectedPack && boundaryRequirementCount === 0) {
      findings.push("Selected pack is missing declared boundary requirements in the loaded catalog.");
    }
    if ((snapshot?.policyCoverage?.gapCount || 0) > 0) {
      findings.push("The current policy catalog already shows coverage gaps that should be reviewed before changing active policy posture.");
    }
    if ((snapshot?.policySimulation?.blockerCount || 0) > 0) {
      findings.push(
        `Current bounded replay still shows ${String(snapshot.policySimulation.blockerCount)} blocker(s) under the latest policy posture.`
      );
    }
    if (String(snapshot?.policySimulation?.decision || "").trim().toUpperCase() === "DENY") {
      findings.push("Latest governed replay is currently denied; review semantic regression risk before changing active policy posture.");
    } else if (String(snapshot?.policySimulation?.decision || "").trim().toUpperCase() === "DEFER") {
      findings.push("Latest governed replay is currently deferred; grants or evidence may still be required after the policy change.");
    }
    const tone =
      decisionSurfaceCount === 0 ||
      boundaryRequirementCount === 0 ||
      (snapshot?.policyCoverage?.gapCount || 0) > 0 ||
      (snapshot?.policySimulation?.blockerCount || 0) > 0 ||
      String(snapshot?.policySimulation?.decision || "").trim().toUpperCase() !== "ALLOW"
        ? "warn"
        : "info";
    return {
      changeId: String(queueItem.id || "").trim(),
      kind: "policy",
      tone,
      title: "Policy admin dry-run",
      summary: `Preview only. This ${nextDraft.changeKind} proposal requires GovernanceOps approval before any live policy-pack change can execute.`,
      updatedAt: new Date().toISOString(),
      facts: [
        { label: "change", value: nextDraft.changeKind },
        { label: "pack", value: nextDraft.packId, code: true },
        { label: "provider", value: nextDraft.providerId, code: true },
        { label: "scope", value: nextDraft.targetScope, code: true },
        { label: "current pack", value: String(snapshot?.admin?.currentScope?.currentPackId || "-").trim() || "-", code: true },
        { label: "current provider", value: String(snapshot?.admin?.currentScope?.currentProviderId || "-").trim() || "-", code: true },
        { label: "decision surfaces", value: String(decisionSurfaceCount) },
        { label: "boundaries", value: String(boundaryRequirementCount) }
      ],
      findings
    };
  };

  const latestPolicyOpsVerificationForChange = (changeId = "") => {
    const normalizedChangeId = String(changeId || policyOpsViewState.selectedAdminChangeId || "").trim();
    if (!normalizedChangeId) {
      return null;
    }
    const latestVerification =
      policyOpsViewState.latestVerification && typeof policyOpsViewState.latestVerification === "object"
        ? policyOpsViewState.latestVerification
        : null;
    if (String(latestVerification?.changeId || "").trim() === normalizedChangeId) {
      return latestVerification;
    }
    const queueItem = findPolicyOpsQueueItem(normalizedChangeId);
    return queueItem?.verification && typeof queueItem.verification === "object" ? queueItem.verification : null;
  };

  const buildPolicyOpsVerification = (item, draft, simulation) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const nextDraft = normalizePolicyOpsAdminDraft(draft);
    const latestSimulation = simulation && typeof simulation === "object" ? simulation : null;
    const snapshot = getCurrentPolicyOpsSnapshot();
    const currentScope = snapshot?.admin?.currentScope && typeof snapshot.admin.currentScope === "object"
      ? snapshot.admin.currentScope
      : {};
    const policyCatalogItems = Array.isArray(snapshot?.policyCatalogItems) ? snapshot.policyCatalogItems : [];
    const selectedPack =
      policyCatalogItems.find((entry) => String(entry?.packId || "").trim() === nextDraft.packId) || null;
    const targetSchemaReadiness = String(currentScope.targetSchemaReadiness || "").trim().toLowerCase();
    const targetCompileReadiness = String(currentScope.targetCompileReadiness || "").trim().toLowerCase();
    const targetStableRef = String(currentScope.targetPackStableRef || "").trim();
    const targetSourceRef = String(currentScope.targetPackSourceRef || "").trim();
    const targetVersion = String(currentScope.targetPackVersion || "").trim();
    const currentPackRef = `${String(currentScope.currentPackId || "-").trim() || "-"}@${String(currentScope.currentPackVersion || "unversioned").trim() || "unversioned"}`;
    const targetPackRef = `${String(currentScope.targetPackId || nextDraft.packId || "-").trim() || "-"}@${targetVersion || "unversioned"}`;
    const decisionSurfaceCount = Array.isArray(selectedPack?.decisionSurfaces) ? selectedPack.decisionSurfaces.length : 0;
    const boundaryRequirementCount = Array.isArray(selectedPack?.boundaryRequirements) ? selectedPack.boundaryRequirements.length : 0;
    const schemaReady = ["ready", "declared"].includes(targetSchemaReadiness);
    const compileReady = targetCompileReadiness === "ready";
    const compileWarn = targetCompileReadiness === "conditional";
    const compileStatus = schemaReady && compileReady ? "pass" : schemaReady && compileWarn ? "warn" : "fail";
    const lintSignals = [
      Boolean(targetStableRef),
      Boolean(targetSourceRef),
      Boolean(targetVersion && targetVersion !== "unversioned"),
      decisionSurfaceCount > 0,
      boundaryRequirementCount > 0
    ];
    const lintReadyCount = lintSignals.filter(Boolean).length;
    const lintStatus = lintReadyCount === lintSignals.length ? "pass" : lintReadyCount >= 3 ? "warn" : "fail";
    const coverageGapCount = Number(snapshot?.policyCoverage?.gapCount || 0);
    const blockerCount = Number(snapshot?.policySimulation?.blockerCount || 0);
    const simulationTone = String(latestSimulation?.tone || "").trim().toLowerCase();
    const goldenStatus =
      !latestSimulation || String(latestSimulation.changeId || "").trim() !== String(queueItem.id || "").trim()
        ? "fail"
        : simulationTone === "danger"
          ? "fail"
          : simulationTone === "warn" || coverageGapCount > 0 || blockerCount > 0
            ? "warn"
            : "pass";
    const cases = [
      {
        label: "compile validation",
        status: compileStatus,
        detail: `schema=${targetSchemaReadiness || "unknown"}; compile=${targetCompileReadiness || "unknown"}`
      },
      {
        label: "lint posture",
        status: lintStatus,
        detail: `stableRef=${targetStableRef ? "present" : "missing"}; sourceRef=${targetSourceRef ? "present" : "missing"}; version=${targetVersion || "unversioned"}; surfaces=${decisionSurfaceCount}; boundaries=${boundaryRequirementCount}`
      },
      {
        label: "golden simulation set",
        status: goldenStatus,
        detail: `decision=${String(snapshot?.policySimulation?.decision || "UNSET").trim().toUpperCase() || "UNSET"}; blockers=${String(blockerCount)}; preview=${simulationTone || "unknown"}`
      }
    ];
    const failureCount = cases.filter((entry) => entry.status === "fail").length;
    const warningCount = cases.filter((entry) => entry.status === "warn").length;
    const passing = failureCount === 0;
    const findings = [];
    if (compileStatus !== "pass") {
      findings.push("Compile validation is not fully green for the target policy pack posture.");
    }
    if (lintStatus !== "pass") {
      findings.push("Policy pack lint posture still has bounded catalog hygiene gaps that should be reviewed before governance routing.");
    }
    if (goldenStatus !== "pass") {
      findings.push("Golden simulation posture still carries bounded warnings or blockers; route is still allowed only if the verify gate itself passes.");
    }
    const now = new Date().toISOString();
    return {
      changeId: String(queueItem.id || "").trim(),
      kind: "policy",
      tone: !passing ? "error" : warningCount > 0 ? "warn" : "ok",
      title: "Policy verify gate",
      summary: !passing
        ? `Verify gate failed for ${String(queueItem.id || "").trim()}. Resolve compile or lint failures before routing this policy proposal to GovernanceOps.`
        : warningCount > 0
          ? `Verify gate passed with warnings for ${String(queueItem.id || "").trim()}. GovernanceOps can review the bounded compile, lint, and golden-case posture before approval.`
          : `Verify gate passed for ${String(queueItem.id || "").trim()}. The bounded policy proposal is ready for GovernanceOps review.`,
      updatedAt: now,
      verifiedAt: now,
      compileStatus,
      lintStatus,
      goldenStatus,
      passing,
      diffSummary: `pack ${currentPackRef} -> ${targetPackRef}; provider ${String(currentScope.currentProviderId || "-").trim() || "-"} -> ${nextDraft.providerId || "-"}; scope ${String(currentScope.currentActivationTarget || "workspace").trim() || "workspace"} -> ${nextDraft.targetScope || "workspace"}`,
      findings,
      cases
    };
  };

  const loadPolicyOpsQueueItemIntoDraft = (changeId) => {
    const item = findPolicyOpsQueueItem(changeId);
    if (!item) {
      setPolicyOpsFeedback("warn", "The selected PolicyOps admin proposal is no longer available.");
      return false;
    }
    policyOpsViewState = {
      ...policyOpsViewState,
      selectedAdminChangeId: String(item.id || "").trim(),
      recoveryReason: "",
      adminDraft: normalizePolicyOpsAdminDraft({
        changeKind: item.changeKind,
        packId: item.packId || item.subjectId,
        providerId: item.providerId,
        targetScope: item.targetScope,
        reason: item.reason
      }),
      latestSimulation:
        String(policyOpsViewState.latestSimulation?.changeId || "").trim() === String(item.id || "").trim()
          ? policyOpsViewState.latestSimulation
          : null,
      latestVerification:
        String(policyOpsViewState.latestVerification?.changeId || "").trim() === String(item.id || "").trim()
          ? policyOpsViewState.latestVerification
          : item?.verification && typeof item.verification === "object"
            ? item.verification
            : null,
      feedback: {
        tone: "info",
        message: `Loaded queued PolicyOps proposal ${String(item.id || "").trim()} into the active draft editor.`
      }
    };
    renderPolicyOpsPanel();
    return true;
  };

  const savePolicyOpsDraft = () => {
    const draft = normalizePolicyOpsAdminDraft(policyOpsViewState.adminDraft);
    const validationError = validatePolicyOpsAdminDraft(draft);
    if (validationError) {
      setPolicyOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildPolicyOpsQueueItem(draft, { status: "draft", verification: null });
    upsertPolicyOpsQueueItem(queueItem);
    policyOpsViewState = {
      ...policyOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: null,
      latestVerification: null,
      feedback: {
        tone: "ok",
        message: `PolicyOps draft saved as ${String(queueItem.id || "").trim()}.`
      }
    };
    renderPolicyOpsPanel();
    return queueItem;
  };

  const simulatePolicyOpsDraft = (changeId = "") => {
    const selectedQueueItem = changeId ? findPolicyOpsQueueItem(changeId) : null;
    if (selectedQueueItem) {
      loadPolicyOpsQueueItemIntoDraft(selectedQueueItem.id);
    }
    const draft = normalizePolicyOpsAdminDraft(policyOpsViewState.adminDraft);
    const validationError = validatePolicyOpsAdminDraft(draft);
    if (validationError) {
      setPolicyOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildPolicyOpsQueueItem(draft, {
      id: selectedQueueItem?.id || String(policyOpsViewState.selectedAdminChangeId || "").trim(),
      status: "simulated",
      verification: null
    });
    const simulation = buildPolicyOpsSimulation(queueItem, draft);
    upsertPolicyOpsQueueItem({
      ...queueItem,
      status: "simulated",
      simulationSummary: simulation.summary,
      simulatedAt: simulation.updatedAt,
      verification: null
    });
    policyOpsViewState = {
      ...policyOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: simulation,
      latestVerification: null,
      feedback: {
        tone: simulation.tone,
        message: `Policy dry-run is ready for ${String(queueItem.id || "").trim()}.`
      }
    };
    renderPolicyOpsPanel();
    return simulation;
  };

  const verifyPolicyOpsDraft = (changeId = "") => {
    const selectedQueueItem = changeId ? findPolicyOpsQueueItem(changeId) : null;
    if (selectedQueueItem) {
      loadPolicyOpsQueueItemIntoDraft(selectedQueueItem.id);
    }
    const draft = normalizePolicyOpsAdminDraft(policyOpsViewState.adminDraft);
    const validationError = validatePolicyOpsAdminDraft(draft);
    if (validationError) {
      setPolicyOpsFeedback("warn", validationError);
      return null;
    }
    const simulation =
      policyOpsViewState.latestSimulation &&
      String(policyOpsViewState.latestSimulation.kind || "").trim().toLowerCase() === "policy" &&
      (!selectedQueueItem ||
        String(policyOpsViewState.latestSimulation.changeId || "").trim() === String(selectedQueueItem.id || "").trim())
        ? policyOpsViewState.latestSimulation
        : null;
    if (!simulation) {
      setPolicyOpsFeedback("warn", "Run a bounded dry-run for the active PolicyOps admin proposal before verifying it.");
      return null;
    }
    const queueItem = buildPolicyOpsQueueItem(draft, {
      id:
        selectedQueueItem?.id ||
        String(policyOpsViewState.selectedAdminChangeId || "").trim() ||
        String(simulation.changeId || "").trim(),
      status: "simulated",
      simulationSummary: simulation.summary
    });
    const verification = buildPolicyOpsVerification(queueItem, draft, simulation);
    upsertPolicyOpsQueueItem({
      ...queueItem,
      status: verification.passing ? "verified" : "verification_failed",
      simulationSummary: simulation.summary,
      simulatedAt: simulation.updatedAt,
      verification
    });
    policyOpsViewState = {
      ...policyOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestVerification: verification,
      feedback: {
        tone: verification.tone === "error" ? "error" : verification.tone,
        message: verification.summary
      }
    };
    renderPolicyOpsPanel();
    return verification;
  };

  const routePolicyOpsDraftToGovernance = (changeId = "") => {
    const selectedQueueItem = changeId ? findPolicyOpsQueueItem(changeId) : null;
    const normalizedChangeId = String(changeId || selectedQueueItem?.id || policyOpsViewState.selectedAdminChangeId || "").trim();
    const simulation =
      policyOpsViewState.latestSimulation &&
      String(policyOpsViewState.latestSimulation.kind || "").trim().toLowerCase() === "policy" &&
      String(policyOpsViewState.latestSimulation.changeId || "").trim() === normalizedChangeId
        ? policyOpsViewState.latestSimulation
        : null;
    const verification = latestPolicyOpsVerificationForChange(normalizedChangeId);
    const hasSimulation = Boolean(
      simulation ||
        (selectedQueueItem && String(selectedQueueItem.simulationSummary || "").trim() && String(selectedQueueItem.simulatedAt || "").trim())
    );
    if (!hasSimulation) {
      setPolicyOpsFeedback("warn", "Run a bounded dry-run for the active PolicyOps admin proposal before routing it to GovernanceOps.");
      return false;
    }
    if (!verification || verification.passing !== true) {
      setPolicyOpsFeedback("warn", "Run Verify Gate and resolve any compile or lint failures before routing this PolicyOps proposal to GovernanceOps.");
      return false;
    }
    const queueItem =
      selectedQueueItem ||
      buildPolicyOpsQueueItem(policyOpsViewState.adminDraft, {
        id: normalizedChangeId,
        status: "simulated",
        simulationSummary: simulation?.summary || String(selectedQueueItem?.simulationSummary || "").trim(),
        verification
      });
    upsertPolicyOpsQueueItem({
      ...queueItem,
      status: "routed",
      simulationSummary: simulation?.summary || String(queueItem.simulationSummary || "").trim(),
      routedAt: new Date().toISOString(),
      verification,
      decision: null,
      execution: null,
      receipt: null,
      rollback: null
    });
    policyOpsViewState = {
      ...policyOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestVerification: verification,
      feedback: {
        tone: "warn",
        message: `Policy admin proposal ${String(queueItem.id || "").trim()} routed to GovernanceOps. Apply remains blocked until an explicit governance approval lands.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "warn",
      `Policy admin proposal routed from PolicyOps: changeId=${String(queueItem.id || "").trim()}; action=${String(queueItem.requestedAction || "").trim()}; pack=${String(queueItem.packId || queueItem.subjectId || "").trim()}; scope=${String(queueItem.targetScope || "").trim()}. Governance approval is now required before apply can proceed.`
    );
    renderPolicyOpsPanel();
    setWorkspaceView("governanceops", true);
    return true;
  };

  const openPolicyOpsGovernanceView = () => {
    setWorkspaceView("governanceops", true);
  };

  const openPolicyOpsAdminQueueItem = (changeId) => {
    const queueItem = findPolicyOpsQueueItem(changeId);
    if (!queueItem) {
      setPolicyOpsFeedback("warn", "The selected PolicyOps admin proposal is no longer available.");
      return false;
    }
    loadPolicyOpsQueueItemIntoDraft(changeId);
    setWorkspaceView("policyops", true);
    return true;
  };
  const applyApprovedPolicyOpsChange = (changeId) => {
    const queueItem = findPolicyOpsQueueItem(changeId);
    if (!queueItem) {
      setPolicyOpsFeedback("warn", "The selected PolicyOps admin proposal is no longer available.");
      return false;
    }
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : null;
    if (String(queueItem.status || "").trim().toLowerCase() !== "approved" || !String(decision?.approvalReceiptId || "").trim()) {
      setPolicyOpsFeedback("warn", "Apply is only available after GovernanceOps records an explicit approved decision receipt.");
      return false;
    }
    if (String(queueItem?.receipt?.receiptId || "").trim()) {
      setPolicyOpsFeedback("warn", `Policy admin change ${String(queueItem.id || "").trim()} already has an admin receipt.`);
      return false;
    }
    const actorRef = policyOpsActorRef();
    const executedAt = new Date().toISOString();
    const executionId = `admin-execution-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const receiptId = `admin-receipt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const executionSummary = `${String(queueItem.requestedAction || "").trim()} applied for ${String(queueItem.targetScope || "").trim()} on ${String(queueItem.providerId || "policy-provider").trim()}.`;
    const receipt = {
      receiptId,
      issuedAt: executedAt,
      summary: executionSummary,
      stableRef: `${String(queueItem.id || "").trim()}/${receiptId}`,
      approvalReceiptId: String(decision.approvalReceiptId || "").trim(),
      executionId
    };
    upsertPolicyOpsQueueItem({
      ...queueItem,
      status: "applied",
      updatedAt: executedAt,
      execution: {
        executionId,
        executedAt,
        status: "applied",
        summary: executionSummary,
        actorRef
      },
      receipt
    });
    policyOpsViewState = {
      ...policyOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `Approved PolicyOps admin change ${String(queueItem.id || "").trim()} applied. Admin receipt ${receiptId} is now available.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "ok",
      `Policy admin change ${String(queueItem.id || "").trim()} applied from PolicyOps. Receipt ${receiptId} is now linked to approval receipt ${String(decision.approvalReceiptId || "").trim()}.`
    );
    renderPolicyOpsPanel();
    return true;
  };
  const applyPolicyOpsRecoveryAction = (changeId, action) => {
    const queueItem = findPolicyOpsQueueItem(changeId);
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!queueItem) {
      setPolicyOpsFeedback("warn", "The selected PolicyOps admin proposal is no longer available.");
      return false;
    }
    if (String(queueItem.status || "").trim().toLowerCase() !== "applied" || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setPolicyOpsFeedback("warn", "Rollback is only available after an approved policy change has been applied and receipted.");
      return false;
    }
    if (String(queueItem?.rollback?.rollbackId || "").trim()) {
      setPolicyOpsFeedback("warn", `Recovery has already been recorded for PolicyOps admin change ${String(queueItem.id || "").trim()}.`);
      return false;
    }
    if (normalizedAction !== "rollback") {
      setPolicyOpsFeedback("warn", "Unsupported recovery action for the selected PolicyOps admin proposal.");
      return false;
    }
    const reason = String(policyOpsViewState.recoveryReason || "").trim();
    if (!reason) {
      setPolicyOpsFeedback("warn", "Rollback reason is required before policy recovery can execute.");
      return false;
    }
    const actorRef = policyOpsActorRef();
    const rolledBackAt = new Date().toISOString();
    const rollbackId = `admin-rollback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const rollback = {
      rollbackId,
      action: "rollback",
      status: "rolled_back",
      rolledBackAt,
      summary: `Rolled back ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.targetScope || "").trim()} on ${String(queueItem.providerId || "policy-provider").trim()}.`,
      stableRef: `${String(queueItem.id || "").trim()}/${rollbackId}`,
      reason,
      actorRef,
      approvalReceiptId: String(queueItem?.decision?.approvalReceiptId || "").trim(),
      adminReceiptId: String(queueItem?.receipt?.receiptId || "").trim(),
      executionId: String(queueItem?.execution?.executionId || "").trim()
    };
    upsertPolicyOpsQueueItem({
      ...queueItem,
      status: "rolled_back",
      updatedAt: rolledBackAt,
      rollback
    });
    policyOpsViewState = {
      ...policyOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `Rollback recorded for PolicyOps admin change ${String(queueItem.id || "").trim()}. Recovery receipt ${rollbackId} is now available.`
      }
    };
    setGovernanceOpsFeedback(
      "warn",
      `PolicyOps recorded rollback for admin change ${String(queueItem.id || "").trim()}. Recovery record ${rollbackId} is linked to approval receipt ${String(rollback.approvalReceiptId || "").trim()}.`
    );
    renderPolicyOpsPanel();
    return true;
  };
  const copyPolicyOpsGovernanceReceipt = async (changeId) => {
    const queueItem = findPolicyOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.decision?.approvalReceiptId || "").trim()) {
      setPolicyOpsFeedback("warn", "No governance decision receipt is available for the selected PolicyOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildPolicyOpsGovernanceReceiptText(queueItem));
    setPolicyOpsFeedback("ok", `Governance decision receipt copied for PolicyOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyPolicyOpsAdminReceipt = async (changeId) => {
    const queueItem = findPolicyOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setPolicyOpsFeedback("warn", "No admin change receipt is available for the selected PolicyOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildPolicyOpsAdminReceiptText(queueItem));
    setPolicyOpsFeedback("ok", `Admin change receipt copied for PolicyOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyPolicyOpsRollbackReceipt = async (changeId) => {
    const queueItem = findPolicyOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.rollback?.rollbackId || "").trim()) {
      setPolicyOpsFeedback("warn", "No rollback receipt is available for the selected PolicyOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildPolicyOpsRollbackReceiptText(queueItem));
    setPolicyOpsFeedback("ok", `Rollback receipt copied for PolicyOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };

  function getCurrentComplianceOpsSnapshot() {
    return createComplianceWorkspaceSnapshot({
      ...latestComplianceOpsContext,
      viewState: complianceOpsViewState
    });
  }

  const normalizeComplianceOpsAdminDraft = (draft = {}) => {
    const snapshot = getCurrentComplianceOpsSnapshot();
    const currentScope = snapshot?.admin?.currentScope || {};
    const input = draft && typeof draft === "object" ? draft : {};
    const changeKind = String(
      input.changeKind || complianceOpsViewState.adminDraft?.changeKind || "attestation"
    )
      .trim()
      .toLowerCase();
    const optionPool =
      changeKind === "exception"
        ? Array.isArray(currentScope.exceptionOptions)
          ? currentScope.exceptionOptions
          : []
        : Array.isArray(currentScope.attestationOptions)
          ? currentScope.attestationOptions
          : [];
    const subjectId = String(input.subjectId || "").trim() || String(optionPool[0]?.value || "").trim();
    const targetScope =
      String(input.targetScope || "").trim() ||
      String(currentScope.targetScope || currentScope.targetScopeOptions?.[0]?.value || "workspace").trim();
    const controlBoundary =
      String(input.controlBoundary || "").trim() ||
      String(currentScope.controlBoundary || currentScope.controlBoundaryOptions?.[0]?.value || "control_scope").trim();
    return {
      changeKind: changeKind || "attestation",
      subjectId,
      targetScope,
      controlBoundary,
      reason: String(input.reason || "").trimStart()
    };
  };

  const updateComplianceOpsDraftField = (field, value) => {
    const normalizedField = String(field || "").trim();
    if (!normalizedField) {
      return;
    }
    const nextDraft = normalizeComplianceOpsAdminDraft({
      ...complianceOpsViewState.adminDraft,
      [normalizedField]: value
    });
    complianceOpsViewState = {
      ...complianceOpsViewState,
      adminDraft: nextDraft,
      latestSimulation: null
    };
    renderComplianceOpsPanel();
  };

  function findComplianceOpsQueueItem(changeId) {
    const normalizedChangeId = String(changeId || "").trim();
    if (!normalizedChangeId) {
      return null;
    }
    return (
      (Array.isArray(complianceOpsViewState.queueItems) ? complianceOpsViewState.queueItems : []).find(
        (item) => String(item?.id || "").trim() === normalizedChangeId
      ) || null
    );
  }

  function upsertComplianceOpsQueueItem(nextItem) {
    const normalizedId = String(nextItem?.id || "").trim();
    if (!normalizedId) {
      return null;
    }
    const existingItems = Array.isArray(complianceOpsViewState.queueItems) ? complianceOpsViewState.queueItems : [];
    const remainingItems = existingItems.filter((item) => String(item?.id || "").trim() !== normalizedId);
    const mergedItems = [nextItem, ...remainingItems].sort((left, right) => {
      const leftTime = new Date(left?.updatedAt || left?.createdAt || 0).getTime();
      const rightTime = new Date(right?.updatedAt || right?.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
    complianceOpsViewState = {
      ...complianceOpsViewState,
      queueItems: mergedItems
    };
    syncAdminTracePanels();
    return nextItem;
  }

  function buildComplianceOpsQueueItem(draft, options = {}) {
    const nextDraft = normalizeComplianceOpsAdminDraft(draft);
    const selectedItem = findComplianceOpsQueueItem(options.id || complianceOpsViewState.selectedAdminChangeId);
    const now = new Date().toISOString();
    const id =
      String(options.id || selectedItem?.id || "").trim() ||
      `compliance-change-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const requestedAction =
      nextDraft.changeKind === "exception" ? "exception_proposal" : "attestation_proposal";
    const subjectLabel = nextDraft.changeKind === "exception" ? "exception" : "attestation";
    return {
      id,
      ownerDomain: "complianceops",
      kind: "compliance",
      label: "Attestation And Exception Draft",
      requestedAction,
      subjectId: nextDraft.subjectId,
      subjectLabel,
      targetScope: nextDraft.targetScope,
      targetLabel: "scope",
      changeKind: nextDraft.changeKind,
      controlBoundary: nextDraft.controlBoundary,
      status: String(options.status || selectedItem?.status || "draft").trim().toLowerCase(),
      reason: nextDraft.reason,
      summary: `${
        nextDraft.changeKind === "exception" ? "Exception" : "Attestation"
      } ${nextDraft.subjectId || "proposal"} for ${nextDraft.targetScope} @ ${nextDraft.controlBoundary}`,
      simulationSummary: String(options.simulationSummary || selectedItem?.simulationSummary || "").trim(),
      createdAt: String(options.createdAt || selectedItem?.createdAt || now).trim(),
      simulatedAt: String(options.simulatedAt || selectedItem?.simulatedAt || "").trim(),
      updatedAt: String(options.updatedAt || now).trim(),
      routedAt: String(options.routedAt || selectedItem?.routedAt || "").trim(),
      decision:
        options.decision === null
          ? null
          : options.decision || (selectedItem?.decision && typeof selectedItem.decision === "object" ? selectedItem.decision : null),
      execution:
        options.execution === null
          ? null
          : options.execution || (selectedItem?.execution && typeof selectedItem.execution === "object" ? selectedItem.execution : null),
      receipt:
        options.receipt === null
          ? null
          : options.receipt || (selectedItem?.receipt && typeof selectedItem.receipt === "object" ? selectedItem.receipt : null),
      rollback:
        options.rollback === null
          ? null
          : options.rollback || (selectedItem?.rollback && typeof selectedItem.rollback === "object" ? selectedItem.rollback : null),
      history:
        options.history === null
          ? []
          : Array.isArray(options.history)
            ? options.history
            : Array.isArray(selectedItem?.history)
              ? selectedItem.history
              : []
    };
  }

  const validateComplianceOpsAdminDraft = (draft) => {
    const nextDraft = normalizeComplianceOpsAdminDraft(draft);
    const snapshot = getCurrentComplianceOpsSnapshot();
    const currentScope = snapshot?.admin?.currentScope || {};
    const subjectOptions =
      nextDraft.changeKind === "exception"
        ? Array.isArray(currentScope.exceptionOptions)
          ? currentScope.exceptionOptions
          : []
        : Array.isArray(currentScope.attestationOptions)
          ? currentScope.attestationOptions
          : [];
    const targetScopeOptions = Array.isArray(currentScope.targetScopeOptions) ? currentScope.targetScopeOptions : [];
    const controlBoundaryOptions = Array.isArray(currentScope.controlBoundaryOptions)
      ? currentScope.controlBoundaryOptions
      : [];
    if (!nextDraft.subjectId) {
      return nextDraft.changeKind === "exception"
        ? "Exception profile is required before saving a ComplianceOps admin proposal."
        : "Attestation candidate is required before saving a ComplianceOps admin proposal.";
    }
    if (subjectOptions.length > 0 && !subjectOptions.some((item) => String(item?.value || "").trim() === nextDraft.subjectId)) {
      return nextDraft.changeKind === "exception"
        ? "Exception profile must be selected from the loaded ComplianceOps scope before saving a proposal."
        : "Attestation candidate must be selected from the loaded ComplianceOps scope before saving a proposal.";
    }
    if (!nextDraft.targetScope) {
      return "Target scope is required before saving a ComplianceOps admin proposal.";
    }
    if (targetScopeOptions.length > 0 && !targetScopeOptions.some((item) => String(item?.value || "").trim() === nextDraft.targetScope)) {
      return "Target scope must be selected from the loaded ComplianceOps scope before saving a proposal.";
    }
    if (!nextDraft.controlBoundary) {
      return "Control boundary is required before saving a ComplianceOps admin proposal.";
    }
    if (
      controlBoundaryOptions.length > 0 &&
      !controlBoundaryOptions.some((item) => String(item?.value || "").trim() === nextDraft.controlBoundary)
    ) {
      return "Control boundary must be selected from the loaded ComplianceOps scope before saving a proposal.";
    }
    if (!String(nextDraft.reason || "").trim()) {
      return "Reason is required before saving a ComplianceOps admin proposal.";
    }
    return "";
  };

  const buildComplianceOpsSimulation = (item, draft) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const nextDraft = normalizeComplianceOpsAdminDraft(draft);
    const snapshot = getCurrentComplianceOpsSnapshot();
    const currentScope = snapshot?.admin?.currentScope || {};
    const findings = [
      "Execution remains blocked until GovernanceOps records an explicit approved decision receipt for this compliance proposal."
    ];
    if (nextDraft.changeKind === "exception") {
      findings.push("Exception preview only. Live exception activation remains blocked in this slice until a later apply path opens.");
    } else {
      findings.push("Attestation preview only. Live attestation issuance remains blocked in this slice until a later apply path opens.");
    }
    if ((currentScope.gapCount || 0) > 0) {
      findings.push(
        `Current compliance posture already shows ${String(currentScope.gapCount || 0)} gap(s); review obligation drift before mutating formal compliance posture.`
      );
    }
    if ((currentScope.blockedCount || 0) > 0) {
      findings.push(
        `Current compliance posture includes ${String(currentScope.blockedCount || 0)} blocked control record(s); missing proof or policy blockers still exist.`
      );
    }
    if ((currentScope.pendingApprovalCount || 0) > 0) {
      findings.push(
        `There are ${String(currentScope.pendingApprovalCount || 0)} pending approval-bound control anchor(s) that may affect final attestation or exception scope.`
      );
    }
    if (nextDraft.changeKind === "exception" && (currentScope.exceptionOptions?.length || 0) === 0) {
      findings.push("No bounded exception profile is currently loaded for this desktop scope.");
    }
    if (nextDraft.changeKind === "attestation" && (currentScope.attestationOptions?.length || 0) === 0) {
      findings.push("No bounded attestation candidate is currently loaded for this desktop scope.");
    }
    if ((currentScope.residencyExceptionCount || 0) > 0 || (currentScope.legalHoldExceptionCount || 0) > 0) {
      findings.push("Existing disclosure exceptions are present and should be reviewed before mutating formal compliance posture.");
    }
    const tone =
      (currentScope.gapCount || 0) > 0 ||
      (currentScope.blockedCount || 0) > 0 ||
      (currentScope.pendingApprovalCount || 0) > 0 ||
      (nextDraft.changeKind === "exception" && (currentScope.exceptionOptions?.length || 0) === 0) ||
      (nextDraft.changeKind === "attestation" && (currentScope.attestationOptions?.length || 0) === 0)
        ? "warn"
        : "info";
    return {
      changeId: String(queueItem.id || "").trim(),
      kind: "compliance",
      tone,
      title: "Compliance admin dry-run",
      summary: `Preview only. This ${
        nextDraft.changeKind === "exception" ? "exception" : "attestation"
      } proposal requires GovernanceOps approval before any live compliance change can execute.`,
      updatedAt: new Date().toISOString(),
      facts: [
        { label: "change", value: nextDraft.changeKind },
        { label: "proposal", value: nextDraft.subjectId, code: true },
        { label: "scope", value: nextDraft.targetScope, code: true },
        { label: "boundary", value: nextDraft.controlBoundary, code: true },
        { label: "covered", value: String(currentScope.coveredCount || 0) },
        { label: "blocked", value: String(currentScope.blockedCount || 0) },
        { label: "gaps", value: String(currentScope.gapCount || 0) },
        { label: "export profiles", value: String(currentScope.exportProfileCount || 0) }
      ],
      findings
    };
  };

  const loadComplianceOpsQueueItemIntoDraft = (changeId) => {
    const item = findComplianceOpsQueueItem(changeId);
    if (!item) {
      setComplianceOpsFeedback("warn", "The selected ComplianceOps admin proposal is no longer available.");
      return false;
    }
    complianceOpsViewState = {
      ...complianceOpsViewState,
      selectedAdminChangeId: String(item.id || "").trim(),
      recoveryReason: "",
      adminDraft: normalizeComplianceOpsAdminDraft({
        changeKind: item.changeKind,
        subjectId: item.subjectId,
        targetScope: item.targetScope,
        controlBoundary: item.controlBoundary,
        reason: item.reason
      }),
      latestSimulation:
        String(complianceOpsViewState.latestSimulation?.changeId || "").trim() === String(item.id || "").trim()
          ? complianceOpsViewState.latestSimulation
          : null,
      feedback: {
        tone: "info",
        message: `Loaded queued ComplianceOps proposal ${String(item.id || "").trim()} into the active draft editor.`
      }
    };
    renderComplianceOpsPanel();
    return true;
  };

  const saveComplianceOpsDraft = () => {
    const draft = normalizeComplianceOpsAdminDraft(complianceOpsViewState.adminDraft);
    const validationError = validateComplianceOpsAdminDraft(draft);
    if (validationError) {
      setComplianceOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildComplianceOpsQueueItem(draft, { status: "draft" });
    upsertComplianceOpsQueueItem(queueItem);
    complianceOpsViewState = {
      ...complianceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      latestSimulation: null,
      feedback: {
        tone: "ok",
        message: `ComplianceOps draft saved as ${String(queueItem.id || "").trim()}.`
      }
    };
    renderComplianceOpsPanel();
    return queueItem;
  };

  const simulateComplianceOpsDraft = (changeId = "") => {
    const selectedQueueItem = changeId ? findComplianceOpsQueueItem(changeId) : null;
    if (selectedQueueItem) {
      loadComplianceOpsQueueItemIntoDraft(selectedQueueItem.id);
    }
    const draft = normalizeComplianceOpsAdminDraft(complianceOpsViewState.adminDraft);
    const validationError = validateComplianceOpsAdminDraft(draft);
    if (validationError) {
      setComplianceOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildComplianceOpsQueueItem(draft, {
      id: selectedQueueItem?.id || String(complianceOpsViewState.selectedAdminChangeId || "").trim(),
      status: "simulated"
    });
    const simulation = buildComplianceOpsSimulation(queueItem, draft);
    upsertComplianceOpsQueueItem({
      ...queueItem,
      status: "simulated",
      simulationSummary: simulation.summary,
      simulatedAt: simulation.updatedAt
    });
    complianceOpsViewState = {
      ...complianceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      latestSimulation: simulation,
      feedback: {
        tone: simulation.tone,
        message: `Compliance dry-run is ready for ${String(queueItem.id || "").trim()}.`
      }
    };
    renderComplianceOpsPanel();
    return simulation;
  };

  const routeComplianceOpsDraftToGovernance = (changeId = "") => {
    const selectedQueueItem = changeId ? findComplianceOpsQueueItem(changeId) : null;
    const simulation = complianceOpsViewState.latestSimulation;
    const matchingSimulation =
      simulation &&
      String(simulation.kind || "").trim().toLowerCase() === "compliance" &&
      String(simulation.changeId || "").trim() &&
      (!selectedQueueItem || String(simulation.changeId || "").trim() === String(selectedQueueItem.id || "").trim());
    if (!matchingSimulation) {
      setComplianceOpsFeedback("warn", "Run a bounded dry-run for the active ComplianceOps admin proposal before routing it to GovernanceOps.");
      return false;
    }
    const queueItem =
      selectedQueueItem ||
      buildComplianceOpsQueueItem(complianceOpsViewState.adminDraft, {
        id: String(complianceOpsViewState.selectedAdminChangeId || "").trim(),
        status: "simulated",
        simulationSummary: simulation.summary
      });
    upsertComplianceOpsQueueItem({
      ...queueItem,
      status: "routed",
      simulationSummary: simulation.summary,
      routedAt: new Date().toISOString(),
      decision: null,
      execution: null,
      receipt: null,
      rollback: null
    });
    complianceOpsViewState = {
      ...complianceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "warn",
        message: `Compliance admin proposal ${String(queueItem.id || "").trim()} routed to GovernanceOps. Apply remains blocked until an explicit governance approval lands.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "warn",
      `Compliance admin proposal routed from ComplianceOps: changeId=${String(queueItem.id || "").trim()}; action=${String(queueItem.requestedAction || "").trim()}; proposal=${String(queueItem.subjectId || "").trim()}; scope=${String(queueItem.targetScope || "").trim()}. Governance approval is now required before apply can proceed.`
    );
    renderComplianceOpsPanel();
    setWorkspaceView("governanceops", true);
    return true;
  };

  const openComplianceOpsGovernanceView = () => {
    setWorkspaceView("governanceops", true);
  };

  const openComplianceOpsAdminQueueItem = (changeId) => {
    const queueItem = findComplianceOpsQueueItem(changeId);
    if (!queueItem) {
      setComplianceOpsFeedback("warn", "The selected ComplianceOps admin proposal is no longer available.");
      return false;
    }
    loadComplianceOpsQueueItemIntoDraft(changeId);
    setWorkspaceView("complianceops", true);
    return true;
  };
  const applyApprovedComplianceOpsChange = (changeId) => {
    const queueItem = findComplianceOpsQueueItem(changeId);
    if (!queueItem) {
      setComplianceOpsFeedback("warn", "The selected ComplianceOps admin proposal is no longer available.");
      return false;
    }
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : null;
    if (String(queueItem.status || "").trim().toLowerCase() !== "approved" || !String(decision?.approvalReceiptId || "").trim()) {
      setComplianceOpsFeedback("warn", "Apply is only available after GovernanceOps records an explicit approved decision receipt.");
      return false;
    }
    if (String(queueItem?.receipt?.receiptId || "").trim()) {
      setComplianceOpsFeedback("warn", `Compliance admin change ${String(queueItem.id || "").trim()} already has an admin receipt.`);
      return false;
    }
    const actorRef = complianceOpsActorRef();
    const executedAt = new Date().toISOString();
    const executionId = `admin-execution-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const receiptId = `admin-receipt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const executionSummary = `${String(queueItem.requestedAction || "").trim()} applied for ${String(queueItem.targetScope || "").trim()} @ ${String(queueItem.controlBoundary || "").trim()}.`;
    const receipt = {
      receiptId,
      issuedAt: executedAt,
      summary: executionSummary,
      stableRef: `${String(queueItem.id || "").trim()}/${receiptId}`,
      approvalReceiptId: String(decision.approvalReceiptId || "").trim(),
      executionId
    };
    upsertComplianceOpsQueueItem({
      ...queueItem,
      status: "applied",
      updatedAt: executedAt,
      execution: {
        executionId,
        executedAt,
        status: "applied",
        summary: executionSummary,
        actorRef
      },
      receipt
    });
    complianceOpsViewState = {
      ...complianceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `Approved ComplianceOps admin change ${String(queueItem.id || "").trim()} applied. Admin receipt ${receiptId} is now available.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "ok",
      `Compliance admin change ${String(queueItem.id || "").trim()} applied from ComplianceOps. Receipt ${receiptId} is now linked to approval receipt ${String(decision.approvalReceiptId || "").trim()}.`
    );
    renderComplianceOpsPanel();
    return true;
  };
  const applyComplianceOpsRecoveryAction = (changeId, action) => {
    const queueItem = findComplianceOpsQueueItem(changeId);
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!queueItem) {
      setComplianceOpsFeedback("warn", "The selected ComplianceOps admin proposal is no longer available.");
      return false;
    }
    const status = String(queueItem.status || "").trim().toLowerCase();
    const existingRecovery = queueItem?.rollback && typeof queueItem.rollback === "object" ? queueItem.rollback : null;
    const hasReceipt = Boolean(String(queueItem?.receipt?.receiptId || "").trim());
    if (!hasReceipt) {
      setComplianceOpsFeedback("warn", "Expiry or renewal is only available after an approved compliance change has been applied and receipted.");
      return false;
    }
    if (normalizedAction === "expiry") {
      if (status !== "applied") {
        setComplianceOpsFeedback("warn", "Expiry is only available for applied compliance admin changes.");
        return false;
      }
      if (String(existingRecovery?.rollbackId || "").trim()) {
        setComplianceOpsFeedback("warn", `Recovery has already been recorded for ComplianceOps admin change ${String(queueItem.id || "").trim()}.`);
        return false;
      }
    } else if (normalizedAction === "renew") {
      if (status !== "expired" || String(existingRecovery?.action || "").trim().toLowerCase() !== "expiry") {
        setComplianceOpsFeedback("warn", "Renewal is only available after an applied compliance change has been explicitly expired.");
        return false;
      }
    } else {
      setComplianceOpsFeedback("warn", "Unsupported recovery action for the selected ComplianceOps admin proposal.");
      return false;
    }
    const reason = String(complianceOpsViewState.recoveryReason || "").trim();
    if (!reason) {
      setComplianceOpsFeedback("warn", "Expiry or renewal reason is required before compliance recovery can execute.");
      return false;
    }
    const actorRef = complianceOpsActorRef();
    const recordedAt = new Date().toISOString();
    const recoveryId = `${
      normalizedAction === "renew" ? "admin-renewal" : "admin-expiry"
    }-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const nextStatus = normalizedAction === "renew" ? "renewed" : "expired";
    const summary =
      normalizedAction === "renew"
        ? `Renewed ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.targetScope || "").trim()} @ ${String(queueItem.controlBoundary || "").trim()}.`
        : `Expired ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.targetScope || "").trim()} @ ${String(queueItem.controlBoundary || "").trim()}.`;
    const rollback = {
      rollbackId: recoveryId,
      action: normalizedAction,
      status: nextStatus,
      rolledBackAt: recordedAt,
      summary,
      stableRef: `${String(queueItem.id || "").trim()}/${recoveryId}`,
      reason,
      actorRef,
      approvalReceiptId: String(queueItem?.decision?.approvalReceiptId || "").trim(),
      adminReceiptId: String(queueItem?.receipt?.receiptId || "").trim(),
      executionId: String(queueItem?.execution?.executionId || "").trim()
    };
    const existingHistory = Array.isArray(queueItem.history) ? queueItem.history : [];
    const nextHistory = [
      ...existingHistory,
      {
        label: normalizedAction === "renew" ? "Renewal" : "Expiry",
        at: recordedAt,
        summary
      }
    ];
    upsertComplianceOpsQueueItem({
      ...queueItem,
      status: nextStatus,
      updatedAt: recordedAt,
      rollback,
      history: nextHistory
    });
    complianceOpsViewState = {
      ...complianceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `${normalizedAction === "renew" ? "Renewal" : "Expiry"} recorded for ComplianceOps admin change ${String(queueItem.id || "").trim()}. Recovery receipt ${recoveryId} is now available.`
      }
    };
    setGovernanceOpsFeedback(
      "warn",
      `ComplianceOps recorded ${normalizedAction === "renew" ? "renewal" : "expiry"} for admin change ${String(queueItem.id || "").trim()}. Recovery record ${recoveryId} is linked to approval receipt ${String(rollback.approvalReceiptId || "").trim()}.`
    );
    renderComplianceOpsPanel();
    return true;
  };
  const copyComplianceOpsGovernanceReceipt = async (changeId) => {
    const queueItem = findComplianceOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.decision?.approvalReceiptId || "").trim()) {
      setComplianceOpsFeedback("warn", "No governance decision receipt is available for the selected ComplianceOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildComplianceOpsGovernanceReceiptText(queueItem));
    setComplianceOpsFeedback("ok", `Governance decision receipt copied for ComplianceOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyComplianceOpsAdminReceipt = async (changeId) => {
    const queueItem = findComplianceOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setComplianceOpsFeedback("warn", "No admin change receipt is available for the selected ComplianceOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildComplianceOpsAdminReceiptText(queueItem));
    setComplianceOpsFeedback("ok", `Admin change receipt copied for ComplianceOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };
  const copyComplianceOpsRecoveryReceipt = async (changeId) => {
    const queueItem = findComplianceOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.rollback?.rollbackId || "").trim()) {
      setComplianceOpsFeedback("warn", "No expiry or renewal receipt is available for the selected ComplianceOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildComplianceOpsRecoveryReceiptText(queueItem));
    setComplianceOpsFeedback("ok", `Recovery receipt copied for ComplianceOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  };

  function getCurrentNetworkOpsSnapshot() {
    return createNetworkWorkspaceSnapshot({
      ...latestNetworkOpsContext,
      viewState: networkOpsViewState
    });
  }

  const setNetworkOpsFeedback = (tone, message) => {
    networkOpsViewState = {
      ...networkOpsViewState,
      feedback: message
        ? {
            tone: String(tone || "info").trim().toLowerCase(),
            message: String(message || "").trim()
          }
        : null
    };
    renderNetworkOpsPanel();
  };
  const setNetworkOpsRecoveryReason = (value) => {
    networkOpsViewState = {
      ...networkOpsViewState,
      recoveryReason: String(value || "").trimStart()
    };
  };

  const normalizeNetworkOpsAdminDraft = (draft = {}) => {
    const snapshot = getCurrentNetworkOpsSnapshot();
    const currentScope = snapshot?.admin?.currentScope || {};
    const input = draft && typeof draft === "object" ? draft : {};
    return {
      changeKind: "probe",
      boundaryPathId:
        String(input.boundaryPathId || "").trim() ||
        String(currentScope.currentBoundaryPath || currentScope.boundaryPathOptions?.[0]?.value || "gateway_path").trim(),
      targetScope:
        String(input.targetScope || "").trim() ||
        String(currentScope.defaultTargetScope || "workspace").trim() ||
        "workspace",
      targetEndpointId:
        String(input.targetEndpointId || "").trim() ||
        String(currentScope.endpointOptions?.[0]?.value || "").trim(),
      reason: String(input.reason || "").trimStart()
    };
  };

  const updateNetworkOpsDraftField = (field, value) => {
    const normalizedField = String(field || "").trim();
    if (!normalizedField) {
      return;
    }
    const nextDraft = normalizeNetworkOpsAdminDraft({
      ...networkOpsViewState.adminDraft,
      [normalizedField]: value
    });
    networkOpsViewState = {
      ...networkOpsViewState,
      adminDraft: nextDraft,
      latestSimulation: null,
      feedback: null
    };
    renderNetworkOpsPanel();
  };

  function findNetworkOpsQueueItem(changeId) {
    const normalizedChangeId = String(changeId || "").trim();
    if (!normalizedChangeId) {
      return null;
    }
    return (
      (Array.isArray(networkOpsViewState.queueItems) ? networkOpsViewState.queueItems : []).find(
        (item) => String(item?.id || "").trim() === normalizedChangeId
      ) || null
    );
  }

  function upsertNetworkOpsQueueItem(nextItem) {
    const normalizedId = String(nextItem?.id || "").trim();
    if (!normalizedId) {
      return null;
    }
    const existingItems = Array.isArray(networkOpsViewState.queueItems) ? networkOpsViewState.queueItems : [];
    const remainingItems = existingItems.filter((item) => String(item?.id || "").trim() !== normalizedId);
    const mergedItems = [nextItem, ...remainingItems].sort((left, right) => {
      const leftTime = new Date(left?.updatedAt || left?.createdAt || 0).getTime();
      const rightTime = new Date(right?.updatedAt || right?.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
    networkOpsViewState = {
      ...networkOpsViewState,
      queueItems: mergedItems
    };
    syncAdminTracePanels();
    return nextItem;
  }

  function buildNetworkOpsQueueItem(draft, options = {}) {
    const nextDraft = normalizeNetworkOpsAdminDraft(draft);
    const snapshot = getCurrentNetworkOpsSnapshot();
    const currentScope = snapshot?.admin?.currentScope || {};
    const selectedItem = findNetworkOpsQueueItem(options.id || networkOpsViewState.selectedAdminChangeId);
    const now = new Date().toISOString();
    const id =
      String(options.id || selectedItem?.id || "").trim() ||
      `network-change-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const boundaryOption =
      (Array.isArray(currentScope.boundaryPathOptions) ? currentScope.boundaryPathOptions : []).find(
        (item) => String(item?.value || "").trim() === nextDraft.boundaryPathId
      ) || null;
    const endpointOption =
      (Array.isArray(currentScope.endpointOptions) ? currentScope.endpointOptions : []).find(
        (item) => String(item?.value || "").trim() === nextDraft.targetEndpointId
      ) || null;
    return {
      id,
      ownerDomain: "networkops",
      kind: "network",
      label: "Probe Request Draft",
      requestedAction: `probe ${nextDraft.boundaryPathId || "boundary"} ${nextDraft.targetEndpointId || ""}`.trim(),
      subjectId: nextDraft.boundaryPathId,
      subjectLabel: "boundary",
      targetScope: nextDraft.targetScope,
      targetLabel: "scope",
      changeKind: "probe",
      boundaryPathId: nextDraft.boundaryPathId,
      boundaryPathLabel: String(boundaryOption?.label || nextDraft.boundaryPathId).trim(),
      targetEndpointId: nextDraft.targetEndpointId,
      targetEndpointLabel: String(endpointOption?.label || nextDraft.targetEndpointId).trim(),
      status: String(options.status || selectedItem?.status || "draft").trim().toLowerCase(),
      reason: nextDraft.reason,
      summary: `Probe ${String(boundaryOption?.label || nextDraft.boundaryPathId || "boundary").trim()} against ${String(endpointOption?.label || nextDraft.targetEndpointId || "endpoint").trim()} within ${nextDraft.targetScope}`,
      simulationSummary: String(options.simulationSummary || selectedItem?.simulationSummary || "").trim(),
      createdAt: String(options.createdAt || selectedItem?.createdAt || now).trim(),
      simulatedAt: String(options.simulatedAt || selectedItem?.simulatedAt || "").trim(),
      updatedAt: String(options.updatedAt || now).trim(),
      routedAt: String(options.routedAt || selectedItem?.routedAt || "").trim(),
      decision:
        options.decision === null
          ? null
          : options.decision || (selectedItem?.decision && typeof selectedItem.decision === "object" ? selectedItem.decision : null),
      execution:
        options.execution === null
          ? null
          : options.execution || (selectedItem?.execution && typeof selectedItem.execution === "object" ? selectedItem.execution : null),
      receipt:
        options.receipt === null
          ? null
          : options.receipt || (selectedItem?.receipt && typeof selectedItem.receipt === "object" ? selectedItem.receipt : null),
      rollback:
        options.rollback === null
          ? null
          : options.rollback || (selectedItem?.rollback && typeof selectedItem.rollback === "object" ? selectedItem.rollback : null)
    };
  }

  const validateNetworkOpsAdminDraft = (draft) => {
    const nextDraft = normalizeNetworkOpsAdminDraft(draft);
    const snapshot = getCurrentNetworkOpsSnapshot();
    const currentScope = snapshot?.admin?.currentScope || {};
    const boundaryPathOptions = Array.isArray(currentScope.boundaryPathOptions) ? currentScope.boundaryPathOptions : [];
    const endpointOptions = Array.isArray(currentScope.endpointOptions) ? currentScope.endpointOptions : [];
    if (!nextDraft.boundaryPathId) {
      return "Boundary path is required before saving a NetworkOps admin proposal.";
    }
    if (
      boundaryPathOptions.length > 0 &&
      !boundaryPathOptions.some((item) => String(item?.value || "").trim() === nextDraft.boundaryPathId)
    ) {
      return "Boundary path must be selected from the loaded NetworkOps scope before saving a proposal.";
    }
    if (!nextDraft.targetEndpointId) {
      return "Target endpoint is required before saving a NetworkOps admin proposal.";
    }
    if (
      endpointOptions.length > 0 &&
      !endpointOptions.some((item) => String(item?.value || "").trim() === nextDraft.targetEndpointId)
    ) {
      return "Target endpoint must be selected from the loaded NetworkOps scope before saving a proposal.";
    }
    if (!nextDraft.targetScope) {
      return "Target scope is required before saving a NetworkOps admin proposal.";
    }
    if (!String(nextDraft.reason || "").trim()) {
      return "Reason is required before saving a NetworkOps admin proposal.";
    }
    return "";
  };

  const buildNetworkOpsSimulation = (item, draft) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const nextDraft = normalizeNetworkOpsAdminDraft(draft);
    const snapshot = getCurrentNetworkOpsSnapshot();
    const currentScope = snapshot?.admin?.currentScope || {};
    const endpointOption =
      (Array.isArray(currentScope.endpointOptions) ? currentScope.endpointOptions : []).find(
        (entry) => String(entry?.value || "").trim() === nextDraft.targetEndpointId
      ) || null;
    const findings = [
      "Execution remains blocked until GovernanceOps records an explicit approved decision receipt for this network probe proposal."
    ];
    if (String(endpointOption?.state || "").trim().toLowerCase() === "warn") {
      findings.push("Selected endpoint already shows warning posture in the loaded NetworkOps scope.");
    }
    if (String(endpointOption?.state || "").trim().toLowerCase() === "error") {
      findings.push("Selected endpoint already shows error posture in the loaded NetworkOps scope.");
    }
    if ((currentScope.degradedProviderCount || 0) > 0) {
      findings.push(
        `Provider readiness already shows ${String(currentScope.degradedProviderCount || 0)} degraded provider(s) across the active network surface.`
      );
    }
    if ((currentScope.trustWarningCount || 0) > 0 || (currentScope.secureSecretMissingCount || 0) > 0) {
      findings.push("Trust posture already includes warning or missing-secret signals that should be reviewed before any live probe opens.");
    }
    if (String(currentScope.directFallbackState || "").trim().toLowerCase() === "available") {
      findings.push("Direct provider fallback is available on the current network surface and should be considered during probe review.");
    }
    const tone =
      String(endpointOption?.state || "").trim().toLowerCase() === "warn" ||
      String(endpointOption?.state || "").trim().toLowerCase() === "error" ||
      (currentScope.degradedProviderCount || 0) > 0 ||
      (currentScope.trustWarningCount || 0) > 0 ||
      (currentScope.secureSecretMissingCount || 0) > 0 ||
      String(currentScope.directFallbackState || "").trim().toLowerCase() === "available"
        ? "warn"
        : "info";
    return {
      changeId: String(queueItem.id || "").trim(),
      kind: "network",
      tone,
      title: "Network admin dry-run",
      summary: `Preview only. This bounded probe request requires GovernanceOps approval before any live network probe can execute.`,
      updatedAt: new Date().toISOString(),
      facts: [
        { label: "boundary", value: nextDraft.boundaryPathId, code: true },
        { label: "endpoint", value: nextDraft.targetEndpointId, code: true },
        { label: "scope", value: nextDraft.targetScope, code: true },
        { label: "provider", value: String(currentScope.selectedProviderId || "-").trim() || "-", code: true },
        { label: "reachable", value: String(currentScope.reachableEndpointCount || 0) },
        { label: "degraded providers", value: String(currentScope.degradedProviderCount || 0) },
        { label: "trust warnings", value: String(currentScope.trustWarningCount || 0) },
        { label: "fallback", value: String(currentScope.directFallbackState || "-").trim() || "-" }
      ],
      findings
    };
  };

  const loadNetworkOpsQueueItemIntoDraft = (changeId) => {
    const item = findNetworkOpsQueueItem(changeId);
    if (!item) {
      setNetworkOpsFeedback("warn", "The selected NetworkOps admin proposal is no longer available.");
      return false;
    }
    networkOpsViewState = {
      ...networkOpsViewState,
      selectedAdminChangeId: String(item.id || "").trim(),
      adminDraft: normalizeNetworkOpsAdminDraft({
        boundaryPathId: item.boundaryPathId || item.subjectId,
        targetScope: item.targetScope,
        targetEndpointId: item.targetEndpointId,
        reason: item.reason
      }),
      latestSimulation:
        String(networkOpsViewState.latestSimulation?.changeId || "").trim() === String(item.id || "").trim()
          ? networkOpsViewState.latestSimulation
          : null,
      feedback: {
        tone: "info",
        message: `Loaded queued NetworkOps proposal ${String(item.id || "").trim()} into the active draft editor.`
      }
    };
    renderNetworkOpsPanel();
    return true;
  };

  const saveNetworkOpsDraft = () => {
    const draft = normalizeNetworkOpsAdminDraft(networkOpsViewState.adminDraft);
    const validationError = validateNetworkOpsAdminDraft(draft);
    if (validationError) {
      setNetworkOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildNetworkOpsQueueItem(draft, { status: "draft" });
    upsertNetworkOpsQueueItem(queueItem);
    networkOpsViewState = {
      ...networkOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: null,
      feedback: {
        tone: "ok",
        message: `NetworkOps draft saved as ${String(queueItem.id || "").trim()}.`
      }
    };
    renderNetworkOpsPanel();
    return queueItem;
  };

  const simulateNetworkOpsDraft = (changeId = "") => {
    const selectedQueueItem = changeId ? findNetworkOpsQueueItem(changeId) : null;
    if (selectedQueueItem) {
      loadNetworkOpsQueueItemIntoDraft(selectedQueueItem.id);
    }
    const draft = normalizeNetworkOpsAdminDraft(networkOpsViewState.adminDraft);
    const validationError = validateNetworkOpsAdminDraft(draft);
    if (validationError) {
      setNetworkOpsFeedback("warn", validationError);
      return null;
    }
    const queueItem = buildNetworkOpsQueueItem(draft, {
      id: selectedQueueItem?.id || String(networkOpsViewState.selectedAdminChangeId || "").trim(),
      status: "simulated"
    });
    const simulation = buildNetworkOpsSimulation(queueItem, draft);
    upsertNetworkOpsQueueItem({
      ...queueItem,
      status: "simulated",
      simulationSummary: simulation.summary,
      simulatedAt: simulation.updatedAt
    });
    networkOpsViewState = {
      ...networkOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      latestSimulation: simulation,
      feedback: {
        tone: simulation.tone,
        message: `Network dry-run is ready for ${String(queueItem.id || "").trim()}.`
      }
    };
    renderNetworkOpsPanel();
    return simulation;
  };

  const routeNetworkOpsDraftToGovernance = (changeId = "") => {
    const selectedQueueItem = changeId ? findNetworkOpsQueueItem(changeId) : null;
    const simulation = networkOpsViewState.latestSimulation;
    const matchingSimulation =
      simulation &&
      String(simulation.kind || "").trim().toLowerCase() === "network" &&
      String(simulation.changeId || "").trim() &&
      (!selectedQueueItem || String(simulation.changeId || "").trim() === String(selectedQueueItem.id || "").trim());
    if (!matchingSimulation) {
      setNetworkOpsFeedback("warn", "Run a bounded dry-run for the active NetworkOps admin proposal before routing it to GovernanceOps.");
      return false;
    }
    const queueItem =
      selectedQueueItem ||
      buildNetworkOpsQueueItem(networkOpsViewState.adminDraft, {
        id: String(networkOpsViewState.selectedAdminChangeId || "").trim(),
        status: "simulated",
        simulationSummary: simulation.summary
      });
    upsertNetworkOpsQueueItem({
      ...queueItem,
      status: "routed",
      simulationSummary: simulation.summary,
      routedAt: new Date().toISOString(),
      decision: null,
      execution: null,
      receipt: null,
      rollback: null
    });
    networkOpsViewState = {
      ...networkOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      feedback: {
        tone: "warn",
        message: `Network admin proposal ${String(queueItem.id || "").trim()} routed to GovernanceOps. Probe execution remains blocked until an explicit governance approval lands.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "warn",
      `Network admin proposal routed from NetworkOps: changeId=${String(queueItem.id || "").trim()}; action=${String(queueItem.requestedAction || "").trim()}; boundary=${String(queueItem.subjectId || "").trim()}; scope=${String(queueItem.targetScope || "").trim()}. Governance approval is now required before any live network probe can proceed.`
    );
    renderNetworkOpsPanel();
    setWorkspaceView("governanceops", true);
    return true;
  };

  const openNetworkOpsGovernanceView = () => {
    setWorkspaceView("governanceops", true);
  };

  const openNetworkOpsAdminQueueItem = (changeId) => {
    const queueItem = findNetworkOpsQueueItem(changeId);
    if (!queueItem) {
      setNetworkOpsFeedback("warn", "The selected NetworkOps admin proposal is no longer available.");
      return false;
    }
    loadNetworkOpsQueueItemIntoDraft(changeId);
    setWorkspaceView("networkops", true);
    return true;
  };

  const applyApprovedNetworkOpsChange = (changeId) => {
    const queueItem = findNetworkOpsQueueItem(changeId);
    if (!queueItem) {
      setNetworkOpsFeedback("warn", "The selected NetworkOps admin proposal is no longer available.");
      return false;
    }
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : null;
    if (String(queueItem.status || "").trim().toLowerCase() !== "approved" || !String(decision?.approvalReceiptId || "").trim()) {
      setNetworkOpsFeedback("warn", "Apply is only available after GovernanceOps records an explicit approved decision receipt.");
      return false;
    }
    if (String(queueItem?.receipt?.receiptId || "").trim()) {
      setNetworkOpsFeedback("warn", `Network admin change ${String(queueItem.id || "").trim()} already has a result receipt.`);
      return false;
    }
    const actorRef = networkOpsActorRef();
    const executedAt = new Date().toISOString();
    const executionId = `admin-execution-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const receiptId = `admin-receipt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const executionSummary = `Executed bounded probe ${String(queueItem.subjectId || queueItem.boundaryPathId || "").trim()} -> ${String(queueItem.targetEndpointId || "").trim()} within ${String(queueItem.targetScope || "").trim()}.`;
    const receipt = {
      receiptId,
      issuedAt: executedAt,
      summary: executionSummary,
      stableRef: `${String(queueItem.id || "").trim()}/${receiptId}`,
      approvalReceiptId: String(decision.approvalReceiptId || "").trim(),
      executionId
    };
    upsertNetworkOpsQueueItem({
      ...queueItem,
      status: "applied",
      updatedAt: executedAt,
      execution: {
        executionId,
        executedAt,
        status: "completed",
        summary: executionSummary,
        actorRef
      },
      receipt
    });
    networkOpsViewState = {
      ...networkOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `Approved network admin change ${String(queueItem.id || "").trim()} applied. Result receipt ${receiptId} is now available.`
      }
    };
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim()
    };
    setGovernanceOpsFeedback(
      "ok",
      `Network admin change ${String(queueItem.id || "").trim()} applied from NetworkOps. Result receipt ${receiptId} is now linked to approval receipt ${String(decision.approvalReceiptId || "").trim()}.`
    );
    renderNetworkOpsPanel();
    return true;
  };

  const applyNetworkOpsRecoveryAction = (changeId, action) => {
    const queueItem = findNetworkOpsQueueItem(changeId);
    const normalizedAction = String(action || "").trim().toLowerCase();
    if (!queueItem) {
      setNetworkOpsFeedback("warn", "The selected NetworkOps admin proposal is no longer available.");
      return false;
    }
    if (String(queueItem.status || "").trim().toLowerCase() !== "applied" || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setNetworkOpsFeedback("warn", "Rollback is only available after an approved network change has been applied and receipted.");
      return false;
    }
    if (String(queueItem?.rollback?.rollbackId || "").trim()) {
      setNetworkOpsFeedback("warn", `Recovery has already been recorded for NetworkOps admin change ${String(queueItem.id || "").trim()}.`);
      return false;
    }
    if (normalizedAction !== "rollback") {
      setNetworkOpsFeedback("warn", "Unsupported recovery action for the selected NetworkOps admin proposal.");
      return false;
    }
    const reason = String(networkOpsViewState.recoveryReason || "").trim();
    if (!reason) {
      setNetworkOpsFeedback("warn", "Rollback reason is required before network recovery can execute.");
      return false;
    }
    const actorRef = networkOpsActorRef();
    const rolledBackAt = new Date().toISOString();
    const rollbackId = `admin-rollback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const rollback = {
      rollbackId,
      action: "rollback",
      status: "rolled_back",
      rolledBackAt,
      summary: `Rolled back ${String(queueItem.requestedAction || "").trim()} for ${String(queueItem.targetScope || "").trim()} on ${String(queueItem.targetEndpointId || queueItem.subjectId || "").trim()}.`,
      stableRef: `${String(queueItem.id || "").trim()}/${rollbackId}`,
      reason,
      actorRef,
      approvalReceiptId: String(queueItem?.decision?.approvalReceiptId || "").trim(),
      adminReceiptId: String(queueItem?.receipt?.receiptId || "").trim(),
      executionId: String(queueItem?.execution?.executionId || "").trim()
    };
    upsertNetworkOpsQueueItem({
      ...queueItem,
      status: "rolled_back",
      updatedAt: rolledBackAt,
      rollback
    });
    networkOpsViewState = {
      ...networkOpsViewState,
      selectedAdminChangeId: String(queueItem.id || "").trim(),
      recoveryReason: "",
      feedback: {
        tone: "ok",
        message: `Rollback recorded for NetworkOps admin change ${String(queueItem.id || "").trim()}. Recovery receipt ${rollbackId} is now available.`
      }
    };
    setGovernanceOpsFeedback(
      "warn",
      `NetworkOps recorded rollback for admin change ${String(queueItem.id || "").trim()}. Recovery record ${rollbackId} is linked to approval receipt ${String(rollback.approvalReceiptId || "").trim()}.`
    );
    renderNetworkOpsPanel();
    return true;
  };

  async function copyNetworkOpsGovernanceReceipt(changeId) {
    const queueItem = findNetworkOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.decision?.approvalReceiptId || "").trim()) {
      setNetworkOpsFeedback("warn", "No governance decision receipt is available for the selected NetworkOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildNetworkOpsGovernanceReceiptText(queueItem));
    setNetworkOpsFeedback("ok", `Governance decision receipt copied for NetworkOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  }

  async function copyNetworkOpsResultReceipt(changeId) {
    const queueItem = findNetworkOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.receipt?.receiptId || "").trim()) {
      setNetworkOpsFeedback("warn", "No result receipt is available for the selected NetworkOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildNetworkOpsResultReceiptText(queueItem));
    setNetworkOpsFeedback("ok", `Result receipt copied for NetworkOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  }

  async function copyNetworkOpsRollbackReceipt(changeId) {
    const queueItem = findNetworkOpsQueueItem(changeId);
    if (!queueItem || !String(queueItem?.rollback?.rollbackId || "").trim()) {
      setNetworkOpsFeedback("warn", "No rollback receipt is available for the selected NetworkOps admin change.");
      return false;
    }
    await copyTextToClipboard(buildNetworkOpsRollbackReceiptText(queueItem));
    setNetworkOpsFeedback("ok", `Rollback receipt copied for NetworkOps admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  }

  function getCurrentIncidentOpsSnapshot() {
    return createIncidentOpsWorkspaceSnapshot({
      ...latestIncidentOpsContext,
      incidentHistory: {
        items: store.getIncidentPackageHistory()
      },
      viewState: incidentOpsViewState
    });
  }

function getCurrentIncidentOpsEntry(entryId = "") {
  const snapshot = getCurrentIncidentOpsSnapshot();
  const resolvedEntryId =
    String(entryId || "").trim() ||
    String(snapshot?.selectedIncidentId || "").trim() ||
      String(snapshot?.activeIncidentBoard?.entryId || "").trim();
    if (!resolvedEntryId) {
      return null;
  }
  return store.getIncidentPackageHistoryById(resolvedEntryId);
}

  function buildEvidenceOpsBundleReviewPayload(snapshot = {}) {
    return {
      exportedAt: new Date().toISOString(),
      source: "evidenceops",
      board: "evidence_bundle_review",
      bundle: snapshot?.evidenceBundleBoard || {}
    };
  }

  function buildEvidenceOpsProvenanceReviewPayload(snapshot = {}) {
    return {
      exportedAt: new Date().toISOString(),
      source: "evidenceops",
      board: "provenance_review",
      provenance: snapshot?.provenanceBoard || {},
      adminChangeProvenance: snapshot?.adminChangeProvenanceBoard || {}
    };
  }

  function buildEvidenceOpsReviewFileName(prefix, token) {
    const normalizedPrefix = String(prefix || "evidence-review").trim() || "evidence-review";
    const normalizedToken =
      String(token || "latest")
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-") || "latest";
    return `epydiosops-${normalizedPrefix}-${normalizedToken}.json`;
  }

  function runEvidenceOpsExportBundleReview() {
    const snapshot = getCurrentEvidenceOpsSnapshot();
    const board = snapshot?.evidenceBundleBoard || {};
    if (!board.bundleCount) {
      setEvidenceOpsFeedback("warn", "No evidence bundles are available yet, so bundle review export was skipped.");
      return false;
    }
    const payload = buildEvidenceOpsBundleReviewPayload(snapshot);
    const fileName = buildEvidenceOpsReviewFileName(
      "evidence-bundle-review",
      board.latestBundle?.bundleId || board.latestBundle?.runId
    );
    const prepared = exportGovernedJson(
      payload,
      fileName,
      buildDesktopGovernedExportOptions("audit_export", "downstream_review", "review")
    );
    setEvidenceOpsFeedback(
      "ok",
      `Evidence bundle review JSON downloaded as ${fileName}.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "evidence review")}`
    );
    return true;
  }

  function runEvidenceOpsExportProvenanceReview() {
    const snapshot = getCurrentEvidenceOpsSnapshot();
    const board = snapshot?.provenanceBoard || {};
    if (!board.artifactCount && !board.incidentPackageCount) {
      setEvidenceOpsFeedback("warn", "No provenance material is available yet, so provenance review export was skipped.");
      return false;
    }
    const payload = buildEvidenceOpsProvenanceReviewPayload(snapshot);
    const fileName = buildEvidenceOpsReviewFileName(
      "evidence-provenance-review",
      board.latestArtifact?.artifactId || board.bundleId
    );
    const prepared = exportGovernedJson(
      payload,
      fileName,
      buildDesktopGovernedExportOptions("audit_export", "downstream_review", "review")
    );
    setEvidenceOpsFeedback(
      "ok",
      `Evidence provenance review JSON downloaded as ${fileName}.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "evidence review")}`
    );
    return true;
  }

  async function runEvidenceOpsCopyPath(path, label = "Path") {
    const normalizedPath = String(path || "").trim();
    if (!normalizedPath) {
      setEvidenceOpsFeedback("warn", `${label} is not available to copy yet.`);
      return false;
    }
    try {
      await copyTextToClipboard(normalizedPath);
      setEvidenceOpsFeedback("ok", `${label} copied to the clipboard.`);
      return true;
    } catch (error) {
      setEvidenceOpsFeedback("error", `Copy failed: ${error.message}`);
      return false;
    }
  }

  async function runEvidenceOpsOpenLinkedRun(runId = "") {
    const snapshot = getCurrentEvidenceOpsSnapshot();
    const resolvedRunId =
      String(runId || "").trim() ||
      String(snapshot?.artifactAccessBoard?.latestArtifact?.runId || "").trim() ||
      String(snapshot?.evidenceBundleBoard?.latestBundle?.runId || "").trim();
    if (!resolvedRunId) {
      setEvidenceOpsFeedback("warn", "No linked run is available from the current evidence snapshot.");
      return false;
    }
    await openRunDetail(resolvedRunId);
    setEvidenceOpsFeedback("info", `Opened linked run detail for ${resolvedRunId}.`);
    return true;
  }

  function runIncidentOpsDownloadPackage(entryId = "") {
    const entry = getCurrentIncidentOpsEntry(entryId);
    if (!entry?.payload) {
      setIncidentOpsFeedback("warn", "No incident package payload is available from the current IncidentOps focus.");
      return false;
    }
    const fallbackRunId = String(entry?.runId || "").trim();
    const fallbackFileName = String(entry?.fileName || "").trim();
    const fileName = fallbackFileName || buildIncidentPackageFileName(fallbackRunId, {}, new Date().toISOString());
    const prepared = exportGovernedJson(
      entry.payload,
      fileName,
      buildDesktopGovernedExportOptions("incident_export", "incident_response", "export")
    );
    setIncidentOpsFeedback(
      "ok",
      `Incident package JSON downloaded to ${fileName}. Review package metadata before external handoff.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident export")} ${buildIncidentEntryTraceabilitySummary(entry)}`
    );
    return true;
  }

  async function runIncidentOpsCopyHandoff(entryId = "") {
    const entry = getCurrentIncidentOpsEntry(entryId);
    const handoffText = String(entry?.handoffText || "").trim();
    if (!handoffText) {
      setIncidentOpsFeedback("warn", "The focused incident does not have a handoff summary yet.");
      return false;
    }
    try {
      const prepared = await copyGovernedText(
        handoffText,
        buildDesktopGovernedExportOptions("incident_handoff", "incident_response", "handoff")
      );
      setIncidentOpsFeedback(
        "ok",
        `Incident handoff summary copied for ${entry.packageId || entry.id}. Review the text before sending it downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident handoff")} ${buildIncidentEntryTraceabilitySummary(entry)}`
      );
      return true;
    } catch (error) {
      setIncidentOpsFeedback("error", `Incident handoff summary copy failed: ${error.message}`);
      return false;
    }
  }

  async function runIncidentOpsOpenLinkedRun(entryId = "") {
    const entry = getCurrentIncidentOpsEntry(entryId);
    const runId = String(entry?.runId || "").trim();
    if (!runId) {
      setIncidentOpsFeedback("warn", "No linked run is available from the current IncidentOps focus.");
      return false;
    }
    await openRunDetail(runId);
    setIncidentOpsFeedback("info", `Opened linked run detail for ${runId}.`);
    return true;
  }

  function runIncidentOpsTransitionStatus(nextStatus, entryId = "") {
    const entry = getCurrentIncidentOpsEntry(entryId);
    if (!entry) {
      setIncidentOpsFeedback("warn", "IncidentOps could not resolve the focused incident entry.");
      return false;
    }
    const currentStatus = normalizeIncidentFilingStatus(entry.filingStatus);
    const targetStatus = normalizeIncidentFilingStatus(nextStatus);
    if (!canTransitionIncidentStatus(currentStatus, targetStatus)) {
      setIncidentOpsFeedback(
        "warn",
        `Status change blocked for ${entry.packageId || entry.id}: ${currentStatus} -> ${targetStatus}. Follow the bounded closure guidance before retrying.`
      );
      return false;
    }
    store.updateIncidentPackageHistoryEntry(entry.id, {
      filingStatus: targetStatus,
      filingUpdatedAt: new Date().toISOString()
    });
    persistIncidentHistory();
    renderIncidentHistoryPanel();
    syncIncidentOpsSelectionAfterHistoryChange(entry.id);
    setIncidentOpsFeedback(
      "ok",
      `Incident status updated for ${entry.packageId || entry.id}: ${currentStatus} -> ${targetStatus}. Review closure posture before leaving IncidentOps.`
    );
    return true;
  }

  function runAuditOpsExportJson() {
    const bundle = getCurrentAuditFilingBundle();
    if (!Array.isArray(bundle?.items) || bundle.items.length === 0) {
      renderAuditFilingFeedback("warn", "No audit rows match the current filters, so JSON export was skipped.");
      return false;
    }
    const fileName = buildAuditExportFileName("json", bundle?.meta?.filters || {}, bundle?.meta?.generatedAt);
    const prepared = exportGovernedJson(
      bundle,
      fileName,
      buildDesktopGovernedExportOptions("audit_export", "downstream_review", "export")
    );
    setAuditOpsHandoffPreview(
      prepareGovernedTextExport(
        buildAuditHandoffText(bundle),
        buildDesktopGovernedExportOptions("audit_export", "downstream_review", "handoff")
      ).text,
      { render: false }
    );
    renderAuditFilingFeedback(
      "ok",
      `Audit JSON exported to ${fileName}. rows=${bundle.items.length}. Review the handoff preview before sharing downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "audit export")} ${buildAuditTraceabilitySummary(bundle, fileName)}`
    );
    return true;
  }

  function runAuditOpsExportCsv() {
    const bundle = getCurrentAuditFilingBundle();
    if (!Array.isArray(bundle?.items) || bundle.items.length === 0) {
      renderAuditFilingFeedback("warn", "No audit rows match the current filters, so CSV export was skipped.");
      return false;
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
    return true;
  }

  async function runAuditOpsCopyHandoff() {
    const bundle = getCurrentAuditFilingBundle();
    if (!Array.isArray(bundle?.items) || bundle.items.length === 0) {
      renderAuditFilingFeedback("warn", "No audit rows match the current filters, so handoff copy was skipped.");
      return false;
    }
    const handoffText = buildAuditHandoffText(bundle);
    try {
      const prepared = await copyGovernedText(
        handoffText,
        buildDesktopGovernedExportOptions("audit_handoff", "downstream_review", "handoff")
      );
      setAuditOpsHandoffPreview(prepared.text, { render: false });
      renderAuditFilingFeedback(
        "ok",
        `Copied handoff summary for ${bundle.items.length} audit rows to clipboard. Review the preview pane before sending it downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "audit handoff")} ${buildAuditTraceabilitySummary(bundle)}`
      );
      return true;
    } catch (error) {
      renderAuditFilingFeedback("error", `Audit handoff copy failed: ${error.message}`);
      return false;
    }
  }

  function runAuditOpsExportIncidentPackage() {
    const incidentPkg = getCurrentIncidentPackage();
    const runId = String(incidentPkg?.run?.runId || "").trim();
    if (!runId) {
      renderAuditFilingFeedback("warn", "Select a run detail first, then export the incident package from Audit Events.");
      return false;
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
    setAuditOpsHandoffPreview(
      prepareGovernedTextExport(
        handoffText,
        buildDesktopGovernedExportOptions("incident_export", "incident_response", "handoff")
      ).text,
      { render: false }
    );
    const auditCount = Number(incidentPkg?.audit?.meta?.matchedCount || 0);
    const approvalStatus = String(incidentPkg?.approval?.status || "UNAVAILABLE").trim().toUpperCase();
    renderAuditFilingFeedback(
      "ok",
      `Incident package exported to ${fileName}. runId=${runId}; approval=${approvalStatus}; auditRows=${auditCount}. Review the handoff preview and queue status before downstream handoff.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident export")} ${buildIncidentTraceabilitySummary(incidentPkg, fileName)}`
    );
    return true;
  }

  async function runAuditOpsCopyLatestIncidentHandoff() {
    const [latest] = store.getIncidentPackageHistory();
    if (!latest) {
      renderAuditFilingFeedback("warn", "Incident queue is empty, so there is no incident handoff summary to copy.");
      return false;
    }
    const handoffText = String(latest?.handoffText || "").trim();
    if (!handoffText) {
      renderAuditFilingFeedback("warn", "Latest incident package does not have a handoff summary yet.");
      return false;
    }
    try {
      const prepared = await copyGovernedText(
        handoffText,
        buildDesktopGovernedExportOptions("incident_handoff", "incident_response", "handoff")
      );
      setAuditOpsHandoffPreview(prepared.text, { render: false });
      renderAuditFilingFeedback(
        "ok",
        `Latest incident handoff summary copied for ${latest.packageId || latest.id}. Review the preview pane before sending it downstream.${describeGovernedExportDisposition(prepared)}${describeGovernedExportRedactions(prepared, "incident handoff")} ${buildIncidentEntryTraceabilitySummary(latest)}`
      );
      return true;
    } catch (error) {
      renderAuditFilingFeedback("error", `Incident handoff summary copy failed: ${error.message}`);
      return false;
    }
  }

  function buildNativeApprovalRailItems(thread = {}) {
    const turns = Array.isArray(thread?.turns) ? thread.turns : [];
    const taskId = String(thread?.taskId || "").trim();
    const tenantId = String(thread?.tenantId || "").trim();
    const projectId = String(thread?.projectId || "").trim();
    return turns
      .flatMap((turn) => {
        const sessionView = turn?.sessionView || {};
        const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
        const sessionId = String(timeline?.session?.sessionId || turn?.response?.sessionId || "").trim();
        const approvals = Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [];
        const proposals = listNativeToolProposals(sessionView);
        const approvalItems = approvals
          .filter((item) => String(item?.status || "").trim().toUpperCase() === "PENDING")
          .map((item) => {
            const checkpointId = String(item?.checkpointId || "").trim();
            return {
              selectionId: `native:checkpoint:${sessionId}:${checkpointId}`,
              decisionType: "checkpoint",
              source: "native-session-checkpoint",
              taskId,
              tenantId,
              projectId,
              sessionId,
              checkpointId,
              createdAt: String(item?.createdAt || item?.updatedAt || turn?.createdAt || "").trim(),
              status: "PENDING",
              reason: String(item?.reason || "").trim(),
              summary: String(item?.reason || "").trim(),
              scope: String(item?.scope || "").trim()
            };
          });
        const proposalItems = proposals
          .filter((item) => String(item?.status || "PENDING").trim().toUpperCase() === "PENDING")
          .map((item) => {
            const proposalId = String(item?.proposalId || "").trim();
            return {
              selectionId: `native:proposal:${sessionId}:${proposalId}`,
              decisionType: "proposal",
              source: "native-tool-proposal",
              taskId,
              tenantId,
              projectId,
              sessionId,
              proposalId,
              createdAt: String(item?.generatedAt || turn?.createdAt || "").trim(),
              status: "PENDING",
              summary: String(item?.summary || item?.command || "").trim(),
              reason: String(item?.reason || "").trim(),
              proposalType: String(item?.proposalType || "").trim(),
              command: String(item?.command || "").trim()
            };
          });
        return [...approvalItems, ...proposalItems];
      })
      .sort((a, b) => parseTimeMs(b?.createdAt) - parseTimeMs(a?.createdAt));
  }

  function buildInterpositionHoldDecisionItems(items = config.nativeGatewayHolds || []) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => String(item?.state || "").trim().toLowerCase() === "held_pending_approval")
      .map((item) => {
        const interpositionRequestId = String(item?.interpositionRequestId || "").trim();
        const runId = String(item?.runId || "").trim();
        const approvalId = String(item?.approvalId || "").trim();
        const tenantId = String(item?.tenantId || "").trim();
        const projectId = String(item?.projectId || "").trim();
        const clientName = String(item?.sourceClient?.name || "").trim();
        const clientId = String(item?.sourceClient?.id || "").trim();
        const summary = String(
          item?.requestSummary?.title ||
          item?.holdReason ||
          item?.governanceTarget?.targetRef ||
          item?.requestSummary?.reason ||
          ""
        ).trim();
        return {
          selectionId: `native:hold:${interpositionRequestId}`,
          decisionType: "gateway_hold",
          source: "gateway-hold",
          interpositionRequestId,
          gatewayRequestId: String(item?.gatewayRequestId || "").trim(),
          runId,
          approvalId,
          tenantId,
          projectId,
          environmentId: String(item?.environmentId || "").trim(),
          clientSurface: String(item?.clientSurface || "").trim(),
          sourceClient: { id: clientId, name: clientName },
          clientLabel: clientName || clientId || "local-gateway",
          actorRef: String(item?.actorRef || "").trim(),
          createdAt: String(item?.holdStartedAtUtc || item?.createdAtUtc || "").trim(),
          expiresAt: String(item?.holdDeadlineAtUtc || "").trim(),
          status: "PENDING",
          state: String(item?.state || "").trim(),
          reason: String(item?.holdReason || item?.requestSummary?.reason || "").trim(),
          summary,
          governanceTarget: item?.governanceTarget || {},
          requestSummary: item?.requestSummary || {},
          codexSessionId: String(item?.codexSessionId || "").trim(),
          codexConversationId: String(item?.codexConversationId || "").trim()
        };
      })
      .sort((a, b) => parseTimeMs(b?.createdAt || b?.expiresAt) - parseTimeMs(a?.createdAt || a?.expiresAt));
  }

  function buildCombinedNativeApprovalRailItems() {
    return [
      ...buildInterpositionHoldDecisionItems(config.nativeGatewayHolds || []),
      ...buildNativeApprovalRailItems(operatorChatState.thread || {})
    ].sort((a, b) => parseTimeMs(b?.createdAt || b?.expiresAt) - parseTimeMs(a?.createdAt || a?.expiresAt));
  }

  function getNativeApprovalRailItemBySelectionId(selectionId) {
    const id = String(selectionId || "").trim();
    if (!id.startsWith("native:")) {
      return null;
    }
    return buildCombinedNativeApprovalRailItems().find(
      (item) => String(item?.selectionId || "").trim() === id
    ) || null;
  }

  function resolveApprovalSelection(selectionId) {
    const id = String(selectionId || "").trim();
    if (!id) {
      return null;
    }
    if (id.startsWith("native:")) {
      return getNativeApprovalRailItemBySelectionId(id);
    }
    return store.getApprovalByRunID(id) || null;
  }

  async function openRunDetail(runID, options = {}) {
    const nextRunID = String(runID || "").trim();
    if (!nextRunID) {
      return;
    }
    setAimxsSpineSelection(nextRunID, findIncidentEntryByRunId(nextRunID)?.id, { render: true });
    runtimeOpsViewState = {
      ...runtimeOpsViewState,
      selectedRunId: nextRunID
    };
    setWorkspaceView("runtimeops", true);
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
        renderRuntimeRunDetailError(ui, `Run detail failed: ${error.message}`, {
          selectedRunId: nextRunID
        });
      }
    }

    focusRenderedRegion(ui.runDetailContent);
  }

  function runtimeOpsActionSnapshot() {
    return createRuntimeWorkspaceSnapshot(latestRuntimeOpsContext, session, {
      viewState: runtimeOpsViewState
    });
  }

  function runtimeOpsSessionRecordById(sessionID = "") {
    const normalizedSessionID = String(sessionID || "").trim();
    const items = Array.isArray(latestRuntimeOpsContext?.runtimeSessions?.items)
      ? latestRuntimeOpsContext.runtimeSessions.items
      : [];
    if (!normalizedSessionID) {
      return null;
    }
    return (
      items.find((item) => String(item?.sessionId || "").trim() === normalizedSessionID) || null
    );
  }

  function runtimeOpsWorkerCapabilityForSession(sessionRecord = {}) {
    const items = Array.isArray(latestRuntimeOpsContext?.runtimeWorkerCapabilities?.items)
      ? latestRuntimeOpsContext.runtimeWorkerCapabilities.items
      : [];
    const selectedAdapterId = String(sessionRecord?.selectedWorkerAdapterId || "").trim().toLowerCase();
    const selectedProvider = String(sessionRecord?.selectedWorkerProvider || "").trim().toLowerCase();
    const managed = items.filter(
      (item) => String(item?.workerType || "").trim().toLowerCase() === "managed_agent"
    );
    if (selectedAdapterId) {
      const byAdapter = managed.find(
        (item) => String(item?.adapterId || "").trim().toLowerCase() === selectedAdapterId
      );
      if (byAdapter) {
        return byAdapter;
      }
    }
    if (selectedProvider) {
      const byProvider = managed.find(
        (item) => String(item?.provider || "").trim().toLowerCase() === selectedProvider
      );
      if (byProvider) {
        return byProvider;
      }
    }
    return (
      managed.find((item) => String(item?.adapterId || "").trim().toLowerCase() === "codex") ||
      managed[0] ||
      items[0] ||
      null
    );
  }

  function buildRuntimeOpsScopeMeta(sessionRecord = {}) {
    return {
      tenantId:
        String(sessionRecord?.tenantId || "").trim() ||
        String(session?.claims?.tenant_id || "").trim(),
      projectId:
        String(sessionRecord?.projectId || "").trim() ||
        String(session?.claims?.project_id || "").trim()
    };
  }

  async function submitRuntimeOpsCloseSession(sessionID = "") {
    const snapshot = runtimeOpsActionSnapshot();
    const resolvedSessionID = String(sessionID || snapshot?.actionReview?.session?.sessionId || "").trim();
    const sessionRecord = runtimeOpsSessionRecordById(resolvedSessionID);
    if (!resolvedSessionID || !sessionRecord) {
      setRuntimeOpsFeedback("warn", "No live runtime session is available to close.");
      return true;
    }
    const scopeMeta = buildRuntimeOpsScopeMeta(sessionRecord);
    runtimeOpsViewState = {
      ...runtimeOpsViewState,
      selectedSessionId: resolvedSessionID
    };
    setRuntimeOpsFeedback("info", `Closing runtime session ${resolvedSessionID}...`);
    try {
      const result = await api.closeRuntimeSession(resolvedSessionID, {
        meta: {
          tenantId: scopeMeta.tenantId,
          projectId: scopeMeta.projectId,
          requestId: `req-runtimeops-close-${Date.now()}`
        },
        status: "CANCELLED",
        reason: "Runtime session closed from RuntimeOps."
      });
      if (result?.applied === false) {
        setRuntimeOpsFeedback("warn", result.warning || "Runtime session close was not applied.");
      } else {
        setRuntimeOpsFeedback("ok", `Runtime session ${resolvedSessionID} closed.`);
      }
      await refresh();
      await loadRuntimeOpsSessionReview(resolvedSessionID);
    } catch (error) {
      setRuntimeOpsFeedback("error", `Runtime session close failed: ${error.message}`);
    }
    return true;
  }

  async function submitRuntimeOpsAttachWorker(sessionID = "") {
    const snapshot = runtimeOpsActionSnapshot();
    const resolvedSessionID = String(sessionID || snapshot?.actionReview?.session?.sessionId || "").trim();
    const sessionRecord = runtimeOpsSessionRecordById(resolvedSessionID);
    if (!resolvedSessionID || !sessionRecord) {
      setRuntimeOpsFeedback("warn", "No live runtime session is available for worker attachment.");
      return true;
    }
    if (String(sessionRecord?.selectedWorkerId || "").trim()) {
      setRuntimeOpsFeedback(
        "warn",
        `Session ${resolvedSessionID} already has an attached worker. Use Heartbeat or Reattach instead.`
      );
      return true;
    }
    const capability = runtimeOpsWorkerCapabilityForSession(sessionRecord);
    if (!capability) {
      setRuntimeOpsFeedback("warn", "No runtime worker capability is available for attachment.");
      return true;
    }
    const scopeMeta = buildRuntimeOpsScopeMeta(sessionRecord);
    runtimeOpsViewState = {
      ...runtimeOpsViewState,
      selectedSessionId: resolvedSessionID
    };
    setRuntimeOpsFeedback(
      "info",
      `Attaching ${String(capability.label || capability.adapterId || "worker").trim()} to ${resolvedSessionID}...`
    );
    try {
      await api.attachRuntimeSessionWorker(resolvedSessionID, {
        meta: {
          tenantId: scopeMeta.tenantId,
          projectId: scopeMeta.projectId,
          requestId: `req-runtimeops-attach-${Date.now()}`
        },
        workerType: String(capability.workerType || "").trim(),
        adapterId: String(capability.adapterId || "").trim(),
        source: "desktop-ui.runtimeops.worker.attach",
        routing: "runtimeops",
        agentProfileId:
          String(capability.adapterId || "").trim().toLowerCase() === "codex"
            ? "codex"
            : "",
        provider: String(capability.provider || "").trim(),
        transport: String(capability.transport || "").trim(),
        model: String(capability.model || "").trim(),
        targetEnvironment: Array.isArray(capability.targetEnvironments)
          ? String(capability.targetEnvironments[0] || "").trim()
          : "",
        capabilities: Array.isArray(capability.capabilities) ? capability.capabilities : [],
        annotations: {
          surface: "runtimeops",
          action: "attach_worker"
        }
      });
      setRuntimeOpsFeedback(
        "ok",
        `Worker attached to ${resolvedSessionID} from RuntimeOps.`
      );
      await refresh();
      await loadRuntimeOpsSessionReview(resolvedSessionID);
    } catch (error) {
      setRuntimeOpsFeedback("error", `Worker attach failed: ${error.message}`);
    }
    return true;
  }

  async function submitRuntimeOpsWorkerEvent(actionType = "", sessionID = "", workerID = "") {
    const snapshot = runtimeOpsActionSnapshot();
    const resolvedSessionID = String(sessionID || snapshot?.actionReview?.session?.sessionId || "").trim();
    const resolvedWorkerID = String(workerID || snapshot?.actionReview?.worker?.workerId || "").trim();
    const sessionRecord = runtimeOpsSessionRecordById(resolvedSessionID);
    if (!resolvedSessionID || !resolvedWorkerID || !sessionRecord) {
      setRuntimeOpsFeedback("warn", "A live worker selection is required before submitting a runtime worker event.");
      return true;
    }
    const normalizedAction = String(actionType || "").trim().toLowerCase();
    const scopeMeta = buildRuntimeOpsScopeMeta(sessionRecord);
    const eventType = normalizedAction === "reattach" ? "worker.bridge.started" : "worker.heartbeat";
    const summary =
      normalizedAction === "reattach"
        ? "Managed worker bridge reasserted from RuntimeOps."
        : "Managed worker heartbeat recorded from RuntimeOps.";
    runtimeOpsViewState = {
      ...runtimeOpsViewState,
      selectedSessionId: resolvedSessionID
    };
    setRuntimeOpsFeedback(
      "info",
      `${normalizedAction === "reattach" ? "Reasserting" : "Recording"} worker state for ${resolvedWorkerID}...`
    );
    try {
      await api.createRuntimeSessionWorkerEvent(resolvedSessionID, resolvedWorkerID, {
        meta: {
          tenantId: scopeMeta.tenantId,
          projectId: scopeMeta.projectId,
          requestId: `req-runtimeops-worker-event-${Date.now()}`
        },
        eventType,
        status: "RUNNING",
        severity: "info",
        summary,
        payload: {
          stage: normalizedAction || "heartbeat",
          surface: "runtimeops"
        }
      });
      setRuntimeOpsFeedback(
        "ok",
        `${normalizedAction === "reattach" ? "Worker bridge reasserted" : "Worker heartbeat recorded"} for ${resolvedWorkerID}.`
      );
      await refresh();
      await loadRuntimeOpsSessionReview(resolvedSessionID);
    } catch (error) {
      setRuntimeOpsFeedback("error", `Worker event failed: ${error.message}`);
    }
    return true;
  }

  function focusAgentDetailByKey(rawDetailKey) {
    const detailKey = String(rawDetailKey || "").trim();
    if (!detailKey || !(ui.chatContent instanceof HTMLElement)) {
      return false;
    }
    const detailNode = Array.from(ui.chatContent.querySelectorAll("details[data-detail-key]") || []).find((node) => {
      return node instanceof HTMLDetailsElement && String(node.dataset.detailKey || "").trim() === detailKey;
    });
    if (!(detailNode instanceof HTMLDetailsElement)) {
      return false;
    }
    detailNode.open = true;
    detailsOpenState[detailKey] = true;
    saveJSON(DETAILS_OPEN_STATE_KEY, detailsOpenState);
    return focusRenderedRegion(detailNode, { block: "center" });
  }

  function openApprovalDetail(runID, options = {}) {
    const nextRunID = String(runID || "").trim();
    if (!nextRunID || !ui.approvalsDetailContent) {
      return "noop";
    }
    const selectedRunID = readPinnedApprovalSelectionId();
    if (selectedRunID && selectedRunID === nextRunID && options.force !== true) {
      ui.approvalsDetailContent.dataset.selectedRunId = APPROVAL_SELECTION_NONE;
      renderApprovalsDetail(ui, null);
      closeApprovalReviewModal();
      return "collapsed";
    }
    ui.approvalsDetailContent.dataset.selectedRunId = nextRunID;
    const approval = resolveApprovalSelection(nextRunID);
    renderApprovalsDetail(ui, approval);
    focusRenderedRegion(ui.approvalsDetailContent);
    return "opened";
  }

  function approvalReviewModalIsOpen() {
    if (typeof HTMLDialogElement !== "undefined" && ui.approvalReviewModal instanceof HTMLDialogElement) {
      return ui.approvalReviewModal.open;
    }
    return ui.approvalReviewModal instanceof HTMLElement && ui.approvalReviewModal.hasAttribute("open");
  }

  function closeApprovalReviewModal() {
    if (typeof HTMLDialogElement !== "undefined" && ui.approvalReviewModal instanceof HTMLDialogElement) {
      if (ui.approvalReviewModal.open) {
        ui.approvalReviewModal.close();
      }
      return;
    }
    if (ui.approvalReviewModal instanceof HTMLElement) {
      ui.approvalReviewModal.removeAttribute("open");
    }
  }

  function openApprovalReviewModal(runID, options = {}) {
    const nextRunID = String(runID || "").trim();
    if (!nextRunID || !ui.approvalReviewModalContent) {
      return false;
    }
    const approval = store.getApprovalByRunID(nextRunID);
    if (!approval || String(nextRunID || "").trim().startsWith("native:")) {
      closeApprovalReviewModal();
      return false;
    }
    renderApprovalReviewModal(ui, approval);
    if (typeof HTMLDialogElement !== "undefined" && ui.approvalReviewModal instanceof HTMLDialogElement) {
      if (!ui.approvalReviewModal.open) {
        ui.approvalReviewModal.showModal();
      }
    } else if (ui.approvalReviewModal instanceof HTMLElement) {
      ui.approvalReviewModal.setAttribute("open", "open");
    }
    if (options.focus !== false) {
      focusRenderedRegion(ui.approvalReviewModalContent, { scroll: false });
    }
    return true;
  }

  function governanceApprovalRecordByRunID(runID) {
    const normalizedRunID = String(runID || "").trim();
    if (!normalizedRunID) {
      return null;
    }
    const approvalItems = Array.isArray(latestGovernanceOpsContext?.approvals?.items)
      ? latestGovernanceOpsContext.approvals.items
      : [];
    return (
      approvalItems.find((item) => String(item?.runId || "").trim() === normalizedRunID) ||
      store.getApprovalByRunID(normalizedRunID) ||
      null
    );
  }

  function governanceRunRecordByRunID(runID) {
    const normalizedRunID = String(runID || "").trim();
    if (!normalizedRunID) {
      return null;
    }
    const runItems = Array.isArray(latestGovernanceOpsContext?.runs?.items)
      ? latestGovernanceOpsContext.runs.items
      : [];
    return (
      runItems.find((item) => String(item?.runId || "").trim() === normalizedRunID) ||
      store.getRunById(normalizedRunID) ||
      null
    );
  }

  function buildGovernanceReceiptSnapshot(runID, options = {}) {
    const normalizedRunID = String(runID || governanceOpsViewState.selectedRunId || "").trim();
    if (!normalizedRunID) {
      return "";
    }
    const approval = governanceApprovalRecordByRunID(normalizedRunID) || {};
    const run = governanceRunRecordByRunID(normalizedRunID) || {};
    const requestedAction = String(options.requestedAction || "").trim().toUpperCase();
    const reason = String(options.reason || approval?.reason || "").trim();
    const capabilities = Array.isArray(approval?.requestedCapabilities) ? approval.requestedCapabilities : [];
    const lines = [
      "Governance receipt snapshot",
      `runId=${normalizedRunID}`,
      `approvalId=${String(approval?.approvalId || "-").trim() || "-"}`,
      `requestId=${String(run?.requestId || approval?.requestId || "-").trim() || "-"}`,
      `status=${String(approval?.status || "-").trim() || "-"}`,
      `decision=${String(run?.policyDecision || "-").trim() || "-"}`,
      `provider=${String(run?.selectedPolicyProvider || run?.policyResponse?.source || "-").trim() || "-"}`,
      `tenant=${String(approval?.tenantId || run?.tenantId || "-").trim() || "-"}`,
      `project=${String(approval?.projectId || run?.projectId || "-").trim() || "-"}`,
      `tier=${String(approval?.tier || "-").trim() || "-"}`,
      `profile=${String(approval?.targetExecutionProfile || "-").trim() || "-"}`,
      `grantTokenPresent=${run?.policyGrantTokenPresent ? "yes" : "no"}`,
      `evidenceBundle=${String(run?.evidenceBundleResponse?.status || run?.evidenceBundleStatus || "-").trim() || "-"}`,
      `evidenceRecord=${String(run?.evidenceRecordResponse?.status || run?.evidenceRecordStatus || "-").trim() || "-"}`,
      `createdAt=${String(approval?.createdAt || "-").trim() || "-"}`,
      `reviewedAt=${String(approval?.reviewedAt || "-").trim() || "-"}`,
      `expiresAt=${String(approval?.expiresAt || "-").trim() || "-"}`,
      `reason=${reason || "-"}`
    ];
    if (requestedAction) {
      lines.push(`requestedAction=${requestedAction}`);
    }
    if (capabilities.length > 0) {
      lines.push(`requestedCapabilities=${capabilities.join(", ")}`);
    }
    return lines.join("\n");
  }

  async function copyGovernanceReceiptSnapshot(runID, options = {}) {
    const payload = buildGovernanceReceiptSnapshot(runID, options);
    if (!payload) {
      if (options.report !== false) {
        setGovernanceOpsFeedback("warn", "No governance receipt snapshot is available for the selected run.");
      }
      return false;
    }
    try {
      await copyTextToClipboard(payload);
      if (options.report !== false) {
        setGovernanceOpsFeedback(
          "ok",
          `Governance receipt snapshot copied for runId=${String(runID || governanceOpsViewState.selectedRunId || "").trim()}.`
        );
      }
      return true;
    } catch (error) {
      if (options.report !== false) {
        setGovernanceOpsFeedback("error", `Copy failed: ${error.message}`);
      }
      return false;
    }
  }

  function governanceAdminQueueItemById(changeId) {
    return (
      findIdentityOpsQueueItem(changeId) ||
      findPlatformOpsQueueItem(changeId) ||
      findGuardrailOpsQueueItem(changeId) ||
      findPolicyOpsQueueItem(changeId) ||
      findComplianceOpsQueueItem(changeId) ||
      findNetworkOpsQueueItem(changeId)
    );
  }

  function governanceOpsActorRef() {
    return (
      String(session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || "").trim() ||
      "governance-reviewer"
    );
  }

  function governanceAdminQueueOwnerDomain(queueItem) {
    return String(queueItem?.ownerDomain || queueItem?.domain || "identityops").trim().toLowerCase() || "identityops";
  }

  function upsertGovernanceAdminQueueItem(nextItem) {
    const ownerDomain = governanceAdminQueueOwnerDomain(nextItem);
    if (ownerDomain === "networkops") {
      return upsertNetworkOpsQueueItem(nextItem);
    }
    if (ownerDomain === "complianceops") {
      return upsertComplianceOpsQueueItem(nextItem);
    }
    if (ownerDomain === "platformops") {
      return upsertPlatformOpsQueueItem(nextItem);
    }
    if (ownerDomain === "guardrailops") {
      return upsertGuardrailOpsQueueItem(nextItem);
    }
    if (ownerDomain === "policyops") {
      return upsertPolicyOpsQueueItem(nextItem);
    }
    return upsertIdentityOpsQueueItem(nextItem);
  }

  function selectGovernanceAdminOwnerQueueItem(ownerDomain, changeId) {
    const normalizedOwnerDomain = String(ownerDomain || "").trim().toLowerCase();
    if (normalizedOwnerDomain === "networkops") {
      networkOpsViewState = {
        ...networkOpsViewState,
        selectedAdminChangeId: changeId
      };
      return;
    }
    if (normalizedOwnerDomain === "complianceops") {
      complianceOpsViewState = {
        ...complianceOpsViewState,
        selectedAdminChangeId: changeId
      };
      return;
    }
    if (normalizedOwnerDomain === "platformops") {
      platformOpsViewState = {
        ...platformOpsViewState,
        selectedAdminChangeId: changeId
      };
      return;
    }
    if (normalizedOwnerDomain === "guardrailops") {
      guardrailOpsViewState = {
        ...guardrailOpsViewState,
        selectedAdminChangeId: changeId
      };
      return;
    }
    if (normalizedOwnerDomain === "policyops") {
      policyOpsViewState = {
        ...policyOpsViewState,
        selectedAdminChangeId: changeId
      };
      return;
    }
    identityOpsViewState = {
      ...identityOpsViewState,
      selectedAdminChangeId: changeId
    };
  }

  function setAdminOwnerFeedback(ownerDomain, tone, message) {
    const normalizedOwnerDomain = String(ownerDomain || "").trim().toLowerCase();
    if (normalizedOwnerDomain === "networkops") {
      setNetworkOpsFeedback(tone, message);
      return;
    }
    if (normalizedOwnerDomain === "complianceops") {
      setComplianceOpsFeedback(tone, message);
      return;
    }
    if (normalizedOwnerDomain === "platformops") {
      setPlatformOpsFeedback(tone, message);
      return;
    }
    if (normalizedOwnerDomain === "guardrailops") {
      setGuardrailOpsFeedback(tone, message);
      return;
    }
    if (normalizedOwnerDomain === "policyops") {
      setPolicyOpsFeedback(tone, message);
      return;
    }
    setIdentityOpsFeedback(tone, message);
  }

  function governanceApprovedOwnerMessage(ownerDomain) {
    const normalizedOwnerDomain = String(ownerDomain || "").trim().toLowerCase();
    if (normalizedOwnerDomain === "networkops") {
      return "NetworkOps can now apply the approved probe request.";
    }
    if (normalizedOwnerDomain === "complianceops") {
      return "ComplianceOps can now apply the approved change.";
    }
    if (normalizedOwnerDomain === "identityops") {
      return "IdentityOps can now apply the approved change.";
    }
    if (normalizedOwnerDomain === "platformops") {
      return "PlatformOps can now apply the approved change.";
    }
    if (normalizedOwnerDomain === "guardrailops") {
      return "GuardrailOps can now apply the approved change.";
    }
    if (normalizedOwnerDomain === "policyops") {
      return "PolicyOps can now apply the approved change.";
    }
    return "The owner domain recorded approved status for the admin proposal.";
  }

  function governanceOwnerFeedbackMessage(ownerDomain, nextStatus) {
    const normalizedStatus = String(nextStatus || "").trim().toLowerCase();
    if (normalizedStatus !== "approved") {
      return "The proposal remains blocked from apply.";
    }
    const normalizedOwnerDomain = String(ownerDomain || "").trim().toLowerCase();
    if (normalizedOwnerDomain === "networkops") {
      return "Apply is now available in NetworkOps.";
    }
    if (normalizedOwnerDomain === "complianceops") {
      return "Apply is now available in ComplianceOps.";
    }
    if (normalizedOwnerDomain === "identityops") {
      return "Apply is now available in IdentityOps.";
    }
    if (normalizedOwnerDomain === "platformops") {
      return "Apply is now available in PlatformOps.";
    }
    if (normalizedOwnerDomain === "guardrailops") {
      return "Apply is now available in GuardrailOps.";
    }
    if (normalizedOwnerDomain === "policyops") {
      return "Apply is now available in PolicyOps.";
    }
    return "Approved status is now visible in the owner domain.";
  }

  function buildGovernanceAdminReceiptText(item) {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Governance Decision Receipt",
      `owner_domain=${governanceAdminQueueOwnerDomain(queueItem)}`,
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      `admin_change_kind=${String(queueItem.kind || "").trim()}`,
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `${String(queueItem.subjectLabel || "subject").trim()}=${String(queueItem.subjectId || "").trim()}`,
      `${String(queueItem.targetLabel || "target").trim()}=${String(queueItem.targetScope || "").trim()}`,
      `decision=${String(decision.status || "").trim()}`,
      `decision_id=${String(decision.decisionId || "").trim()}`,
      `approval_receipt_id=${String(decision.approvalReceiptId || "").trim()}`,
      `decided_at=${String(decision.decidedAt || "").trim()}`,
      `actor_ref=${String(decision.actorRef || "").trim()}`,
      `reason=${String(decision.reason || "").trim()}`
    ].join("\n");
  }

  const buildNetworkOpsGovernanceReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Network Governance Receipt",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      "owner_domain=networkops",
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `boundary=${String(queueItem.subjectId || queueItem.boundaryPathId || "").trim()}`,
      `endpoint=${String(queueItem.targetEndpointId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `decision=${String(decision.status || "").trim()}`,
      `decision_id=${String(decision.decisionId || "").trim()}`,
      `approval_receipt_id=${String(decision.approvalReceiptId || "").trim()}`,
      `decided_at=${String(decision.decidedAt || "").trim()}`,
      `actor_ref=${String(decision.actorRef || "").trim()}`,
      `reason=${String(decision.reason || "").trim()}`
    ].join("\n");
  };

  const buildNetworkOpsResultReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    return [
      "EpydiosOps Network Probe Result Receipt",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      "owner_domain=networkops",
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `boundary=${String(queueItem.subjectId || queueItem.boundaryPathId || "").trim()}`,
      `endpoint=${String(queueItem.targetEndpointId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `execution_id=${String(execution.executionId || "").trim()}`,
      `execution_status=${String(execution.status || "").trim()}`,
      `executed_at=${String(execution.executedAt || "").trim()}`,
      `receipt_id=${String(receipt.receiptId || "").trim()}`,
      `issued_at=${String(receipt.issuedAt || "").trim()}`,
      `stable_ref=${String(receipt.stableRef || "").trim()}`,
      `approval_receipt_id=${String(receipt.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `summary=${String(receipt.summary || execution.summary || "").trim()}`
    ].join("\n");
  };

  const buildNetworkOpsRollbackReceiptText = (item) => {
    const queueItem = item && typeof item === "object" ? item : {};
    const rollback = queueItem?.rollback && typeof queueItem.rollback === "object" ? queueItem.rollback : {};
    const receipt = queueItem?.receipt && typeof queueItem.receipt === "object" ? queueItem.receipt : {};
    const execution = queueItem?.execution && typeof queueItem.execution === "object" ? queueItem.execution : {};
    const decision = queueItem?.decision && typeof queueItem.decision === "object" ? queueItem.decision : {};
    return [
      "EpydiosOps Network Recovery Receipt",
      `admin_change_request_id=${String(queueItem.id || "").trim()}`,
      "owner_domain=networkops",
      `requested_action=${String(queueItem.requestedAction || "").trim()}`,
      `boundary=${String(queueItem.subjectId || queueItem.boundaryPathId || "").trim()}`,
      `endpoint=${String(queueItem.targetEndpointId || "").trim()}`,
      `target_scope=${String(queueItem.targetScope || "").trim()}`,
      `rollback_id=${String(rollback.rollbackId || "").trim()}`,
      `action=${String(rollback.action || "").trim()}`,
      `status=${String(rollback.status || "").trim()}`,
      `approval_receipt_id=${String(rollback.approvalReceiptId || decision.approvalReceiptId || "").trim()}`,
      `admin_change_receipt_id=${String(rollback.adminReceiptId || receipt.receiptId || "").trim()}`,
      `execution_id=${String(rollback.executionId || execution.executionId || "").trim()}`,
      `stable_ref=${String(rollback.stableRef || "").trim()}`,
      `rolled_back_at=${String(rollback.rolledBackAt || "").trim()}`,
      `actor_ref=${String(rollback.actorRef || "").trim()}`,
      `reason=${String(rollback.reason || "").trim()}`,
      `summary=${String(rollback.summary || "").trim()}`
    ].join("\n");
  };

  function governanceAdminReasonFromNode(node) {
    const container = node instanceof HTMLElement ? node.closest("[data-governanceops-panel='admin-proposal-review'], [data-governanceops-panel=\"admin-proposal-review\"]") : null;
    const reasonInput =
      container instanceof HTMLElement ? container.querySelector("[data-governanceops-admin-decision-reason]") : null;
    return reasonInput instanceof HTMLInputElement ? String(reasonInput.value || "").trim() : "";
  }

  function buildGovernanceAdminDecision(changeId, status, reason) {
    const queueItem = governanceAdminQueueItemById(changeId);
    if (!queueItem) {
      return null;
    }
    const decidedAt = new Date().toISOString();
    const normalizedStatus = String(status || "").trim().toLowerCase();
    return {
      ...queueItem,
      status: normalizedStatus,
      updatedAt: decidedAt,
      decision: {
        decisionId: `admin-decision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        status: normalizedStatus,
        reason,
        decidedAt,
        approvalReceiptId:
          normalizedStatus === "approved"
            ? `approval-receipt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
            : "",
        actorRef: governanceOpsActorRef()
      },
      execution: null,
      receipt: null
    };
  }

  async function copyGovernanceOpsAdminReceipt(changeId) {
    const queueItem = governanceAdminQueueItemById(changeId);
    if (!queueItem || !String(queueItem?.decision?.approvalReceiptId || "").trim()) {
      setGovernanceOpsFeedback("warn", "No governance decision receipt is available for the selected admin proposal.");
      return false;
    }
    await copyTextToClipboard(buildGovernanceAdminReceiptText(queueItem));
    setGovernanceOpsFeedback("ok", `Governance decision receipt copied for admin change ${String(queueItem.id || "").trim()}.`);
    return true;
  }

  async function submitGovernanceOpsAdminDecision(decisionNode) {
    const changeId =
      decisionNode instanceof HTMLElement
        ? String(decisionNode.dataset.governanceopsDecisionAdminChangeId || "").trim()
        : "";
    const decision =
      decisionNode instanceof HTMLElement
        ? String(decisionNode.dataset.governanceopsDecision || "").trim().toUpperCase()
        : "";
    if (!changeId || !decision) {
      return false;
    }
    const queueItem = governanceAdminQueueItemById(changeId);
    if (!queueItem) {
      setGovernanceOpsFeedback("warn", "The selected admin proposal is no longer available.");
      return true;
    }
    if (String(queueItem.status || "").trim().toLowerCase() !== "routed") {
      setGovernanceOpsFeedback("warn", `Admin proposal ${changeId} is not awaiting governance decision.`);
      return true;
    }
    const reason = governanceAdminReasonFromNode(decisionNode);
    if (!reason) {
      setGovernanceOpsFeedback("warn", "Decision reason is required before approve or deny.");
      return true;
    }
    const nextStatus = decision === "APPROVE" ? "approved" : "denied";
    const nextQueueItem = buildGovernanceAdminDecision(changeId, nextStatus, reason);
    if (!nextQueueItem) {
      setGovernanceOpsFeedback("warn", "The selected admin proposal is no longer available.");
      return true;
    }
    upsertGovernanceAdminQueueItem(nextQueueItem);
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: changeId
    };
    selectGovernanceAdminOwnerQueueItem(governanceAdminQueueOwnerDomain(nextQueueItem), changeId);
    const ownerDomain = governanceAdminQueueOwnerDomain(nextQueueItem);
    setGovernanceOpsFeedback(
      nextStatus === "approved" ? "ok" : "warn",
      `GovernanceOps recorded ${nextStatus} for admin change ${changeId}. ${
        nextStatus === "approved" ? governanceApprovedOwnerMessage(ownerDomain) : "Apply remains blocked."
      }`
    );
    setAdminOwnerFeedback(
      ownerDomain,
      nextStatus === "approved" ? "ok" : "warn",
      `GovernanceOps recorded ${nextStatus} for ${ownerDomain} admin proposal ${changeId}. ${
        governanceOwnerFeedbackMessage(ownerDomain, nextStatus)
      }`
    );
    return true;
  }

  async function submitGovernanceOpsAdminRoutingAction(routingNode) {
    const changeId =
      routingNode instanceof HTMLElement
        ? String(routingNode.dataset.governanceopsRoutingAdminChangeId || "").trim()
        : "";
    const routeAction =
      routingNode instanceof HTMLElement
        ? String(routingNode.dataset.governanceopsRoutingAction || "").trim().toUpperCase()
        : "";
    if (!changeId || !routeAction) {
      return false;
    }
    const queueItem = governanceAdminQueueItemById(changeId);
    if (!queueItem) {
      setGovernanceOpsFeedback("warn", "The selected admin proposal is no longer available.");
      return true;
    }
    if (String(queueItem.status || "").trim().toLowerCase() !== "routed") {
      setGovernanceOpsFeedback("warn", `Admin proposal ${changeId} is not awaiting governance routing action.`);
      return true;
    }
    const reason = governanceAdminReasonFromNode(routingNode);
    if (!reason) {
      setGovernanceOpsFeedback("warn", "Decision reason is required before defer or escalate.");
      return true;
    }
    const nextStatus = routeAction === "ESCALATE" ? "escalated" : "deferred";
    const ownerDomain = governanceAdminQueueOwnerDomain(queueItem);
    upsertGovernanceAdminQueueItem({
      ...queueItem,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
      decision: {
        decisionId: `admin-decision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        status: nextStatus,
        reason,
        decidedAt: new Date().toISOString(),
        approvalReceiptId: "",
        actorRef: governanceOpsActorRef()
      },
      execution: null,
      receipt: null
    });
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedAdminChangeId: changeId
    };
    selectGovernanceAdminOwnerQueueItem(ownerDomain, changeId);
    setGovernanceOpsFeedback("warn", `GovernanceOps recorded ${nextStatus} for admin change ${changeId}.`);
    setAdminOwnerFeedback(ownerDomain, "warn", `GovernanceOps recorded ${nextStatus} for ${ownerDomain} admin proposal ${changeId}.`);
    return true;
  }

  async function submitApprovalDecisionFromContainer(container, decisionNode) {
    const runID =
      decisionNode instanceof HTMLElement
        ? String(decisionNode.dataset.approvalDetailRunId || "").trim()
        : "";
    const decision =
      decisionNode instanceof HTMLElement
        ? String(decisionNode.dataset.approvalDetailDecision || "").trim().toUpperCase()
        : "";
    if (!runID || !decision) {
      return false;
    }
    const reasonInput =
      container instanceof HTMLElement ? container.querySelector("[data-approval-decision-reason]") : null;
    const reason =
      reasonInput instanceof HTMLInputElement ? String(reasonInput.value || "").trim() : "";
    if (!reason) {
      renderApprovalFeedback(ui, "warn", "Decision reason is required before approve/deny.");
      return true;
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
        closeApprovalReviewModal();
      }
      if (ui.approvalsDetailContent) {
        ui.approvalsDetailContent.dataset.selectedRunId = runID;
      }
      await refresh();
    } catch (error) {
      renderApprovalFeedback(ui, "error", error.message);
    }
    return true;
  }

  async function submitGovernanceOpsDecisionFromContainer(container, decisionNode) {
    const runID =
      decisionNode instanceof HTMLElement
        ? String(decisionNode.dataset.governanceopsDecisionRunId || "").trim()
        : "";
    const decision =
      decisionNode instanceof HTMLElement
        ? String(decisionNode.dataset.governanceopsDecision || "").trim().toUpperCase()
        : "";
    if (!runID || !decision) {
      return false;
    }
    const reasonInput =
      container instanceof HTMLElement ? container.querySelector("[data-governanceops-decision-reason]") : null;
    const reason =
      reasonInput instanceof HTMLInputElement ? String(reasonInput.value || "").trim() : "";
    if (!reason) {
      setGovernanceOpsFeedback("warn", "Decision reason is required before approve or deny.");
      return true;
    }
    const approvalScope = readApprovalFilters(ui);
    const approvalRecord = governanceApprovalRecordByRunID(runID) || {};
    const decisionScope = formatScopeLabel(approvalRecord?.tenantId, approvalRecord?.projectId);
    const submittedAt = new Date().toISOString();
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedRunId: runID
    };
    try {
      const result = await api.submitApprovalDecision(runID, decision, {
        ttlSeconds: approvalScope.ttlSeconds,
        reason
      });
      if (result?.applied === false) {
        setGovernanceOpsFeedback(
          "warn",
          `${result.warning || "No approval endpoint available."} scope=${decisionScope}; source=governanceops; submittedAt=${submittedAt}`
        );
      } else {
        setGovernanceOpsFeedback(
          "ok",
          `runId=${runID}; decision=${decision}; status=${result.status || "updated"}; scope=${decisionScope}; source=governanceops; submittedAt=${submittedAt}`
        );
      }
      await refresh();
    } catch (error) {
      setGovernanceOpsFeedback("error", error.message);
    }
    return true;
  }

  async function submitGovernanceOpsRoutingAction(container, actionNode) {
    const runID =
      actionNode instanceof HTMLElement
        ? String(actionNode.dataset.governanceopsRoutingRunId || "").trim()
        : "";
    const routeAction =
      actionNode instanceof HTMLElement
        ? String(actionNode.dataset.governanceopsRoutingAction || "").trim().toUpperCase()
        : "";
    if (!runID || !routeAction) {
      return false;
    }
    const reasonInput =
      container instanceof HTMLElement ? container.querySelector("[data-governanceops-decision-reason]") : null;
    const reason =
      reasonInput instanceof HTMLInputElement ? String(reasonInput.value || "").trim() : "";
    if (!reason) {
      setGovernanceOpsFeedback(
        "warn",
        `Decision reason is required before ${routeAction === "ESCALATE" ? "escalating" : "deferring"}.`
      );
      return true;
    }
    governanceOpsViewState = {
      ...governanceOpsViewState,
      selectedRunId: runID
    };
    const copied = await copyGovernanceReceiptSnapshot(runID, {
      requestedAction: routeAction,
      reason,
      report: false
    });
    if (!copied) {
      setGovernanceOpsFeedback("error", `Failed to prepare the ${routeAction.toLowerCase()} handoff packet.`);
      return true;
    }
    setGovernanceOpsFeedback(
      "warn",
      `${routeAction === "ESCALATE" ? "Escalation" : "Deferral"} packet copied for runId=${runID}. Runtime approval endpoints currently expose approve/deny only, so no runtime state change was applied.`
    );
    return true;
  }

  async function submitNativeApprovalRailDecision(selectionId, decision, reason) {
    const item = getNativeApprovalRailItemBySelectionId(selectionId);
    if (!item) {
      return false;
    }
    const normalizedDecision = String(decision || "").trim().toUpperCase();
    const decisionVerb = normalizedDecision === "DENY" ? "denied" : "approved";
    const isGatewayHold = item?.decisionType === "gateway_hold";
    const submittedReason =
      String(reason || "").trim() ||
      (isGatewayHold
        ? `Pinned Companion review ${decisionVerb} interposed request hold.`
        : item?.decisionType === "proposal"
          ? `Pinned Agent review ${decisionVerb} tool proposal.`
          : `Pinned Agent review ${decisionVerb} approval checkpoint.`);
    const sessionId = String(item?.sessionId || "").trim();
    if ((!isGatewayHold && !sessionId) || !normalizedDecision) {
      return false;
    }
    const currentSession = getSession();
    const decisionScope = {
      tenantId: String(item?.tenantId || activeTenantScope(currentSession) || "").trim(),
      projectId: String(item?.projectId || activeProjectScope(currentSession) || "").trim()
    };
    operatorChatState = {
      ...operatorChatState,
      status: "running",
      message:
        isGatewayHold
          ? `Submitting ${normalizedDecision} for interposed request ${item.interpositionRequestId} on run ${item.runId}...`
          : item?.decisionType === "proposal"
          ? `Submitting ${normalizedDecision} for tool proposal ${item.proposalId} on session ${sessionId}...`
          : `Submitting ${normalizedDecision} for checkpoint ${item.checkpointId} on session ${sessionId}...`
    };
    await refresh();
    try {
      let result = null;
      if (isGatewayHold) {
        result = await api.submitApprovalDecision(item.runId, normalizedDecision, {
          ttlSeconds: readApprovalFilters(ui).ttlSeconds,
          reason: submittedReason
        });
        if (result?.applied) {
          const bindings = nativeBindings();
          if (bindings && typeof bindings.NativeGatewayHoldResolve === "function") {
            await bindings.NativeGatewayHoldResolve(item.interpositionRequestId, normalizedDecision, submittedReason);
          }
          await syncNativeGatewayHoldsFromBindings().catch(() => {});
        }
      } else if (item?.decisionType === "proposal") {
        result = await api.submitRuntimeSessionToolProposalDecision(sessionId, item.proposalId, normalizedDecision, {
          meta: {
            tenantId: decisionScope.tenantId,
            projectId: decisionScope.projectId,
            requestId: `chat-tool-proposal-${Date.now()}`
          },
          reason: submittedReason
        });
      } else {
        result = await api.submitRuntimeSessionApprovalDecision(sessionId, item.checkpointId, normalizedDecision, {
          meta: {
            tenantId: decisionScope.tenantId,
            projectId: decisionScope.projectId,
            requestId: `chat-approval-${Date.now()}`
          },
          reason: submittedReason
        });
      }
      let nextThread = operatorChatState.thread;
      let derived = deriveOperatorChatThreadState(nextThread);
      if (!isGatewayHold) {
        const refreshed = await refreshOperatorChatThreadSession(api, operatorChatState.thread, sessionId, {
          tailCount: 8,
          waitSeconds: 1
        });
        nextThread = refreshed?.thread || operatorChatState.thread;
        derived = deriveOperatorChatThreadState(nextThread);
      }
      operatorChatState = {
        ...operatorChatState,
        status: derived.uiStatus || (result?.applied ? "success" : "warn"),
        message: result?.applied
          ? isGatewayHold
            ? `Interposed request ${item.interpositionRequestId} ${normalizedDecision === "DENY" ? "denied" : "approved"}; run ${item.runId} moved ${normalizedDecision === "DENY" ? "to deny" : "forward"}.`
            : item?.decisionType === "proposal"
              ? `Tool proposal ${item.proposalId} ${normalizedDecision === "DENY" ? "denied" : "approved"}. ${derived.message}`
              : `Checkpoint ${item.checkpointId} ${normalizedDecision === "DENY" ? "denied" : "approved"}. ${derived.message}`
          : String(result?.warning || "").trim() || "Native decision was not changed.",
        thread: nextThread
      };
      if (!isGatewayHold) {
        await refreshOperatorChatHistory(session);
      }
      renderApprovalFeedback(
        ui,
        result?.applied ? "ok" : "warn",
        operatorChatState.message
      );
    } catch (error) {
      operatorChatState = {
        ...operatorChatState,
        status: "error",
        message: isGatewayHold
          ? `Interposed request decision failed: ${error.message}`
          : item?.decisionType === "proposal"
            ? `Tool proposal decision failed: ${error.message}`
            : `Approval decision failed: ${error.message}`,
        thread: operatorChatState.thread
      };
      renderApprovalFeedback(ui, "error", operatorChatState.message);
    }
    await refresh();
    return true;
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
      refreshGovernedActionPreview(session);
      refreshRunBuilderPreview(session);
      refreshTerminalPreview(session, currentChoices);
      await refresh();
    } catch (error) {
      renderHomeErrorPanel(`Sign-in flow failed: ${error.message}`, {
        session: getSession()
      });
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

  ui.governedActionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { issues, payload } = refreshGovernedActionPreview(getSession());
    const blocking = issues.filter((issue) => issue.severity === "error");
    if (blocking.length) {
      renderGovernedActionFeedback(ui, "error", blocking.map((issue) => issue.message).join(" "));
      return;
    }

    try {
      const result = await api.createRuntimeRun(payload);
      const resultRunID = result?.runId || payload?.meta?.requestId || "";
      const resultStatus = result?.status || "submitted";
      renderGovernedActionFeedback(ui, "ok", `runId=${resultRunID || "(unknown)"}; status=${resultStatus}. Opening History for review.`);
      await refresh();
      if (resultRunID) {
        await openRunDetail(resultRunID);
      }
    } catch (error) {
      renderGovernedActionFeedback(ui, "error", error.message);
    }
  });

  const governedActionWatchTargets = [
    ui.gaRequestId,
    ui.gaTenantId,
    ui.gaProjectId,
    ui.gaEnvironment,
    ui.gaDemoProfile,
    ui.gaRequestLabel,
    ui.gaRequestSummary,
    ui.gaFinanceSymbol,
    ui.gaFinanceSide,
    ui.gaFinanceQuantity,
    ui.gaFinanceAccount,
    ui.gaRequiredGrants,
    ui.gaEvidenceReadiness,
    ui.gaRiskTier,
    ui.gaBoundaryClass,
    ui.gaSubjectId,
    ui.gaActionType,
    ui.gaActionVerb,
    ui.gaActionTarget,
    ui.gaResourceKind,
    ui.gaResourceNamespace,
    ui.gaResourceName,
    ui.gaResourceId,
    ui.gaHandshakeRequired,
    ui.gaApprovedForProd,
    ui.gaDryRun
  ].filter(Boolean);

  for (const target of governedActionWatchTargets) {
    target.addEventListener("change", () => {
      refreshGovernedActionPreview(getSession());
    });
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      target.addEventListener("keyup", () => {
        refreshGovernedActionPreview(getSession());
      });
    }
  }

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
    refreshGovernedActionPreview(getSession());
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

    setWorkspaceView("settingsops", true);
    await refresh();
    if (focusSettingsEndpointRow(endpointID)) {
      return;
    }
    const integrationBoard = document.getElementById("settingsops-integration-board");
    if (focusRenderedRegion(integrationBoard, { scroll: true })) {
      return;
    }
    ui.settingsContent?.scrollIntoView({ behavior: "smooth", block: "start" });
    focusRenderedRegion(ui.settingsContent, { scroll: false });
  });
  ui.settingsOpenAuditEventsButton?.addEventListener("click", async () => {
    setWorkspaceView("auditops", true);
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    await refresh();
    focusRenderedRegion(ui.auditOpsContent || ui.auditContent);
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
    if (await handleAimxsSpineWorkspaceClick(target)) {
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
        title: "",
        intent: "",
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
        const result = await invokeOperatorChatTurn(api, scope, operatorChatState.thread, {
          ...draft,
          governanceContext: activeDemoGovernanceContext(getSession())
        });
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

    if (action === "open-governed-run") {
      const runID = String(actionNode.dataset.chatRunId || "").trim();
      if (!runID) {
        return;
      }
      await openRunDetail(runID);
      operatorChatState = {
        ...operatorChatState,
        ...draft,
        status: "success",
        message: `Opened governed run ${runID} in History.`
      };
      await refresh();
      return;
    }

    if (action === "focus-agent-detail") {
      const detailKey = String(actionNode.dataset.chatDetailKey || "").trim();
      if (!detailKey) {
        return;
      }
      const focused = focusAgentDetailByKey(detailKey);
      if (!focused) {
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: "warn",
          message: "That active-turn detail is no longer available in the current AgentOps view."
        };
        await refresh();
      }
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
        const runSummary = result?.runId
          ? ` Run ${String(result.runId || "").trim()} returned ${String(result.policyDecision || "UNKNOWN").trim().toUpperCase() || "UNKNOWN"} via ${String(result.selectedPolicyProvider || "-").trim() || "-"}.`
          : "";
        operatorChatState = {
          ...operatorChatState,
          ...draft,
          status: derived.uiStatus || (result?.applied ? "success" : "warn"),
          message: result?.applied
            ? `Tool proposal ${proposalId} ${decision === "DENY" ? "denied" : "approved"}.${runSummary} ${derived.message}`.trim()
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
    const demoGovernanceFieldNode = target.closest("[data-settings-demo-governance-field]");
    const agentTestFieldNode = target.closest("[data-settings-agent-test-field]");
    const localSecureRefFieldNode = target.closest("[data-settings-local-ref-field]");
    if (!integrationFieldNode && !aimxsFieldNode && !demoGovernanceFieldNode && !agentTestFieldNode && !localSecureRefFieldNode) {
      return;
    }
    if (demoGovernanceFieldNode) {
      const draft = readDemoGovernanceInput();
      if (!draft) {
        return;
      }
      const validation = validateDemoGovernanceOverlay(draft);
      demoGovernanceEditorState = {
        overlay: validation.overlay,
        status: validation.valid ? "dirty" : "invalid",
        message: validation.valid
          ? "Local demo governance overlay changed. Save Demo Overlay when you want Agent and governed-action requests to use it."
          : "Local demo governance overlay is blocked. Fix the fields below, then save again.",
        errors: validation.errors,
        warnings: validation.warnings
      };
      renderDemoGovernanceFeedbackInline(demoGovernanceEditorState);
      refreshGovernedActionPreview(getSession());
      return;
    }
    if (localSecureRefFieldNode) {
      const draft = readLocalSecureRefInput();
      if (!draft) {
        return;
      }
      localSecureRefEditorState = {
        ...localSecureRefEditorState,
        ...draft,
        status: localSecureRefSnapshot.available ? "dirty" : "warn",
        message: localSecureRefSnapshot.available
          ? "Local secure ref draft changed. Save Secure Value to store it outside the repo, then restart terminal 1 when you need the runtime to pick it up."
          : "Local secure credential capture is unavailable on this launcher."
      };
      renderLocalSecureRefFeedbackInline(localSecureRefEditorState);
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
          ? "Draft changed since the last result. Run Invoke Selected Agent to exercise the live runtime integration path again."
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
      const validation = validateAimxsOverride(
        draft,
        getRuntimeChoices()?.aimxs || {},
        validateReference
      );
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
      setWorkspaceView("auditops", true);
      await refresh();
      focusRenderedRegion(ui.auditOpsContent || ui.auditContent);
      return;
    }
    const demoGovernanceActionNode = target.closest("[data-settings-demo-governance-action]");
    if (demoGovernanceActionNode instanceof HTMLElement) {
      const action = String(demoGovernanceActionNode.dataset.settingsDemoGovernanceAction || "")
        .trim()
        .toLowerCase();
      if (!action) {
        return;
      }
      if (action === "clear") {
        demoGovernanceOverlay = normalizeDemoGovernanceOverlay();
        demoGovernanceEditorState = {
          overlay: normalizeDemoGovernanceOverlay(),
          status: "saved",
          message: "Local demo governance overlay cleared.",
          errors: [],
          warnings: []
        };
        persistDemoGovernanceOverlay();
        recordConfigChange({
          action: "settings.demo_governance.clear",
          status: "saved",
          source: "local-ui",
          event: "settings.demo_governance.clear",
          providerId: "demo-governance"
        });
        refreshGovernedActionPreview(getSession());
        await refresh();
        return;
      }

      const draft = readDemoGovernanceInput() || demoGovernanceEditorState.overlay || demoGovernanceOverlay;
      if (action === "reset") {
        demoGovernanceEditorState = {
          overlay: normalizeDemoGovernanceOverlay(demoGovernanceOverlay),
          status: "clean",
          message:
            demoGovernanceOverlay?.persona?.enabled || demoGovernanceOverlay?.policy?.enabled
              ? "Unsaved demo governance changes were discarded."
              : "No local demo governance overlay is active.",
          errors: [],
          warnings: []
        };
        await refresh();
        return;
      }
      if (action !== "save") {
        return;
      }
      const validation = validateDemoGovernanceOverlay(draft);
      if (!validation.valid) {
        demoGovernanceEditorState = {
          overlay: validation.overlay,
          status: "invalid",
          message: "Local demo governance overlay is blocked. Fix the fields below, then save again.",
          errors: validation.errors,
          warnings: validation.warnings
        };
        renderDemoGovernanceFeedbackInline(demoGovernanceEditorState);
        return;
      }
      demoGovernanceOverlay = normalizeDemoGovernanceOverlay(validation.overlay);
      demoGovernanceEditorState = {
        overlay: normalizeDemoGovernanceOverlay(demoGovernanceOverlay),
        status: "saved",
        message:
          demoGovernanceOverlay?.persona?.enabled || demoGovernanceOverlay?.policy?.enabled
            ? "Local demo governance overlay saved. Agent and governed-action requests will include it on the next run."
            : "No local demo governance overlay is active.",
        errors: [],
        warnings: validation.warnings
      };
      persistDemoGovernanceOverlay();
      recordConfigChange({
        action: "settings.demo_governance.save",
        status: "saved",
        source: "local-ui",
        event: "settings.demo_governance.save",
        providerId: "demo-governance"
      });
      refreshGovernedActionPreview(getSession());
      await refresh();
      return;
    }
    const localSecureRefActionNode = target.closest("[data-settings-local-ref-action]");
    if (localSecureRefActionNode instanceof HTMLElement) {
      const action = String(localSecureRefActionNode.dataset.settingsLocalRefAction || "")
        .trim()
        .toLowerCase();
      if (!action) {
        return;
      }
      if (action === "refresh") {
        localSecureRefSnapshot = normalizeLocalSecureRefSnapshot(await api.getLocalSecureRefs());
        localSecureRefEditorState = {
          ...localSecureRefEditorState,
          status: localSecureRefSnapshot.available ? "clean" : "warn",
          message: localSecureRefSnapshot.message || "Secure local ref status refreshed."
        };
        await refresh();
        return;
      }

      const draft = readLocalSecureRefInput() || localSecureRefEditorState;
      const targetRef = resolveLocalSecureRefTargetRef(draft);
      const validationErrors = [];
      validateReference(validationErrors, "Local ref", targetRef);

      if (!localSecureRefSnapshot.available) {
        localSecureRefEditorState = {
          ...localSecureRefEditorState,
          ...draft,
          status: "warn",
          message: "Local secure credential capture is unavailable on this launcher."
        };
        renderLocalSecureRefFeedbackInline(localSecureRefEditorState);
        return;
      }

      if (validationErrors.length > 0) {
        localSecureRefEditorState = {
          ...localSecureRefEditorState,
          ...draft,
          status: "invalid",
          message: validationErrors.join(" ")
        };
        renderLocalSecureRefFeedbackInline(localSecureRefEditorState);
        return;
      }

      if (action === "save") {
        if (!String(draft?.secretValue || "").trim()) {
          localSecureRefEditorState = {
            ...localSecureRefEditorState,
            ...draft,
            status: "invalid",
            message: "Concrete local value is required before saving."
          };
          renderLocalSecureRefFeedbackInline(localSecureRefEditorState);
          return;
        }
        try {
          const result = await api.upsertLocalSecureRef({
            ref: targetRef,
            value: String(draft.secretValue || "")
          });
          localSecureRefSnapshot = normalizeLocalSecureRefSnapshot(result);
          localSecureRefEditorState = {
            selectedRef: draft.selectedRef,
            customRef: draft.customRef,
            secretValue: "",
            status: "saved",
            message: String(result?.message || "Secure local ref value saved.").trim()
          };
          recordConfigChange({
            action: "settings.local_secure_ref.save",
            status: "saved",
            source: "local-keychain",
            event: "settings.local_secure_ref.save",
            providerId: "local-secure-ref-helper"
          });
          await refresh();
        } catch (error) {
          localSecureRefEditorState = {
            ...localSecureRefEditorState,
            ...draft,
            status: "error",
            message: `Secure local save failed: ${error.message}`
          };
          renderLocalSecureRefFeedbackInline(localSecureRefEditorState);
        }
        return;
      }

      if (action === "delete") {
        try {
          const result = await api.deleteLocalSecureRef({
            ref: targetRef
          });
          localSecureRefSnapshot = normalizeLocalSecureRefSnapshot(result);
          localSecureRefEditorState = {
            selectedRef: draft.selectedRef,
            customRef: draft.customRef,
            secretValue: "",
            status: "applied",
            message: String(result?.message || "Secure local ref value removed.").trim()
          };
          recordConfigChange({
            action: "settings.local_secure_ref.delete",
            status: "applied",
            source: "local-keychain",
            event: "settings.local_secure_ref.delete",
            providerId: "local-secure-ref-helper"
          });
          await refresh();
        } catch (error) {
          localSecureRefEditorState = {
            ...localSecureRefEditorState,
            ...draft,
            status: "error",
            message: `Secure local delete failed: ${error.message}`
          };
          renderLocalSecureRefFeedbackInline(localSecureRefEditorState);
        }
        return;
      }

      if (action === "export") {
        try {
          const result = await api.exportLocalSecureRefs();
          localSecureRefSnapshot = normalizeLocalSecureRefSnapshot(result);
          localSecureRefEditorState = {
            ...localSecureRefEditorState,
            ...draft,
            secretValue: "",
            status: "applied",
            message: String(result?.message || "Runtime ref-values export refreshed.").trim()
          };
          recordConfigChange({
            action: "settings.local_secure_ref.export",
            status: "applied",
            source: "local-keychain",
            event: "settings.local_secure_ref.export",
            providerId: "local-secure-ref-helper"
          });
          await refresh();
        } catch (error) {
          localSecureRefEditorState = {
            ...localSecureRefEditorState,
            ...draft,
            status: "error",
            message: `Runtime ref export failed: ${error.message}`
          };
          renderLocalSecureRefFeedbackInline(localSecureRefEditorState);
        }
        return;
      }
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

      const draft = readAimxsEditorInput();
      if ((action === "apply" || action === "activate") && !draft) {
        aimxsEditorState = {
          status: "invalid",
          message: "AIMXS controls are unavailable in this view. Reopen Settings and retry the action.",
          errors: [],
          warnings: []
        };
        renderAimxsEditorFeedbackInline(aimxsEditorState);
        return;
      }

      if (action === "refresh-activation") {
        try {
          aimxsActivationSnapshot = normalizeAimxsActivationSnapshot(await api.getAimxsActivation());
          aimxsEditorState = {
            status: "clean",
            message: String(
              aimxsActivationSnapshot.message ||
                "AIMXS activation status refreshed from the local launcher helper."
            ).trim(),
            errors: [],
            warnings: aimxsActivationSnapshot.warnings || [],
            nextStep:
              "Next step: if the active cluster mode is wrong, adjust the contract and run Activate AIMXS Mode."
          };
        } catch (error) {
          aimxsEditorState = {
            status: "error",
            message: `AIMXS activation status refresh failed: ${error.message}`,
            errors: [],
            warnings: []
          };
        }
        renderAimxsEditorFeedbackInline(aimxsEditorState);
        await refresh();
        return;
      }

      if (action === "activate" && !aimxsActivationSnapshot.available) {
        aimxsEditorState = {
          status: "warn",
          message:
            aimxsActivationSnapshot.message ||
            "AIMXS activation is unavailable on this launcher. Save the contract only, or use the supported launcher helper path.",
          errors: [],
          warnings: Array.isArray(aimxsActivationSnapshot.warnings) ? aimxsActivationSnapshot.warnings : []
        };
        renderAimxsEditorFeedbackInline(aimxsEditorState);
        return;
      }

      if (action === "apply" || action === "activate") {
        const validation = validateAimxsOverride(
          draft,
          getRuntimeChoices()?.aimxs || {},
          validateReference
        );
        if (!validation.valid) {
          aimxsEditorState = {
            status: "invalid",
            message: `AIMXS ${action} is blocked. Fix the fields below, then retry.`,
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
        refreshGovernedActionPreview(getSession());
        refreshRunBuilderPreview(getSession());
        refreshTerminalPreview(getSession(), nextChoices);

        if (action === "apply") {
          aimxsEditorState = {
            status: "applied",
            message: describeAimxsAppliedMessage(aimxsOverride),
            errors: [],
            warnings: validation.warnings,
            nextStep:
              "Next step: run Activate AIMXS Mode when you want the live policy-provider selection to switch to this contract."
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

        try {
          const activationResult = await api.applyAimxsActivation(validation.draft);
          aimxsActivationSnapshot = normalizeAimxsActivationSnapshot(activationResult);
          aimxsEditorState = {
            status:
              aimxsActivationSnapshot.state === "active" || aimxsActivationSnapshot.state === "ready"
                ? "applied"
                : "dirty",
            message: String(
              activationResult?.message ||
                aimxsActivationSnapshot.message ||
                "AIMXS activation request completed."
            ).trim(),
            errors: [],
            warnings: [
              ...validation.warnings,
              ...(Array.isArray(aimxsActivationSnapshot.warnings) ? aimxsActivationSnapshot.warnings : [])
            ],
            nextStep:
              "Next step: confirm provider readiness and capabilities in Settings, then run the live operator loop on the selected AIMXS mode."
          };
          recordConfigChange({
            action: "settings.aimxs.activate",
            status:
              aimxsActivationSnapshot.state === "active" || aimxsActivationSnapshot.state === "ready"
                ? "applied"
                : "pending",
            source: "local-launcher",
            event: "settings.aimxs.activate",
            providerId: String(
              aimxsActivationSnapshot.selectedProviderId || validation.draft.mode || "aimxs-settings"
            ).trim()
          });
        } catch (error) {
          aimxsEditorState = {
            status: "error",
            message: `AIMXS activation failed: ${error.message}`,
            errors: [],
            warnings: validation.warnings,
            nextStep:
              validation.draft.mode === "aimxs-full"
                ? "Next step: confirm terminal 2 is still running the live launcher AIMXS shim, then retry Activate AIMXS Mode."
                : "Next step: verify the AIMXS refs exist in Secure Local Credential Capture, then retry Activate AIMXS Mode."
          };
        }
        renderAimxsEditorFeedbackInline(aimxsEditorState);
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
        const governanceContext = activeDemoGovernanceContext(session);
        const result = await api.invokeIntegrationAgent({
          meta: {
            tenantId: tenantID,
            projectId: projectID,
            requestId: `req-agent-test-${Date.now()}`
          },
          agentProfileId: draft.agentProfileId,
          prompt: draft.prompt,
          systemPrompt: draft.systemPrompt,
          maxOutputTokens: draft.maxOutputTokens,
          governanceContext
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
        "Saved draft applied to active runtime choices for this project scope. Review Integration Settings Board to verify endpoint state and traceability.";
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
            "Saved draft applied via runtime endpoint and activated for this project scope. Review Integration Settings Board and Audit Events to verify the recorded change.";
          runtimeIntegrationSyncStateByProject[key] = "loaded";
        } else if (result?.source === "endpoint-unavailable") {
          appliedMessage =
            "Runtime integration settings endpoint is unavailable; applied local fallback for this project scope. Review the integrationSettings endpoint row in Integration Settings Board, then retry Apply Saved before relying on the change.";
          appliedWarnings = [
            "Runtime state may still differ from the local fallback until the integrationSettings endpoint returns to ready or available.",
            `Retry Apply Saved after the endpoint is ready, then open Audit Events for ${String(scope.projectId || projectID || "project:any")} to confirm the recorded runtime trail.`
          ];
          runtimeIntegrationSyncStateByProject[key] = "endpoint-unavailable";
        }
      } else {
        appliedMessage =
          "Tenant/project scope is unavailable. Local fallback was updated only. Choose the intended project in the context bar, then save and apply again before relying on the change.";
        appliedWarnings = [
          "A runtime endpoint write cannot be verified until both tenant and project scope are present.",
          "After scope is restored, review Integration Settings Board, confirm the project scope chip, then rerun Save Draft and Apply Saved."
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
      if (nextChoices?.integrations?.selectedAgentProfileId) {
        saveValue(AGENT_PREF_KEY, nextChoices.integrations.selectedAgentProfileId);
      }
      refreshGovernedActionPreview(getSession());
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
            "Project override reset to baseline defaults via runtime endpoint. Review Integration Settings Board and Audit Events to confirm the new baseline.";
          runtimeIntegrationSyncStateByProject[key] = "loaded";
        } else if (result?.source === "endpoint-unavailable") {
          runtimeIntegrationSyncStateByProject[key] = "endpoint-unavailable";
          statusMessage =
            "Runtime integration settings endpoint is unavailable; baseline defaults were applied locally only. Review the integrationSettings endpoint row in Integration Settings Board, then retry Reset Project Override before relying on this reset.";
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
          "After scope is restored, review Integration Settings Board, confirm project scope, rerun the reset, then verify Audit Events."
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
      refreshGovernedActionPreview(getSession());
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
      renderHomePanel();
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
        renderHomePanel();
      } else {
        const okMessage = "Terminal command request was queued.";
        renderTerminalFeedback(ui, "ok", okMessage, result);
        pushTerminalHistory(
          buildTerminalHistoryEntry(input, payload, result, "ok", `${origin}: ${okMessage}`)
        );
        renderHomePanel();
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
      renderHomePanel();
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
      const state = openApprovalDetail(selectRunID);
      if (state === "collapsed") {
        await refresh();
        return;
      }
      await refresh();
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
    const nativeDecisionNode = target.closest("[data-native-decision-action]");
    if (nativeDecisionNode instanceof HTMLElement) {
      const selectionId = String(nativeDecisionNode.dataset.nativeDecisionKey || "").trim();
      const decision = String(nativeDecisionNode.dataset.nativeDecisionAction || "").trim().toUpperCase();
      const reasonInput = ui.approvalsDetailContent.querySelector("[data-native-decision-reason]");
      const reason = reasonInput instanceof HTMLInputElement ? String(reasonInput.value || "").trim() : "";
      await submitNativeApprovalRailDecision(selectionId, decision, reason);
      return;
    }
    const openModalNode = target.closest("[data-approval-open-modal-run-id]");
    const openModalRunID =
      openModalNode instanceof HTMLElement
        ? String(openModalNode.dataset.approvalOpenModalRunId || "").trim()
        : "";
    if (openModalRunID) {
      openApprovalReviewModal(openModalRunID);
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
    if (!(decisionNode instanceof HTMLElement)) {
      return;
    }
    await submitApprovalDecisionFromContainer(ui.approvalsDetailContent, decisionNode);
  });
  ui.approvalReviewModal?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target === ui.approvalReviewModal) {
      closeApprovalReviewModal();
      return;
    }
    const closeNode = target.closest("[data-approval-modal-close]");
    if (closeNode instanceof HTMLElement) {
      closeApprovalReviewModal();
    }
  });
  ui.approvalReviewModal?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeApprovalReviewModal();
  });
  ui.approvalReviewModalContent?.addEventListener("click", async (event) => {
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
      closeApprovalReviewModal();
      await openRunDetail(openRunID, { fromApproval: true });
      return;
    }
    const decisionNode = target.closest("[data-approval-detail-run-id]");
    if (!(decisionNode instanceof HTMLElement)) {
      return;
    }
    await submitApprovalDecisionFromContainer(ui.approvalReviewModalContent, decisionNode);
  });
  const handleIdentityOpsDraftFieldEvent = (target) => {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return false;
    }
    const kind = String(target.dataset.identityopsDraftKind || "").trim().toLowerCase();
    const field = String(target.dataset.identityopsDraftField || "").trim();
    if (!kind || !field) {
      if (target instanceof HTMLInputElement && target.hasAttribute("data-identityops-admin-recovery-reason")) {
        setIdentityOpsRecoveryReason(target.value);
        return true;
      }
      return false;
    }
    updateIdentityOpsDraftField(kind, field, target.value);
    return true;
  };
  ui.identityContent?.addEventListener("input", (event) => {
    handleIdentityOpsDraftFieldEvent(event.target);
  });
  ui.identityContent?.addEventListener("change", (event) => {
    handleIdentityOpsDraftFieldEvent(event.target);
  });
  ui.identityContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-identityops-admin-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.identityopsAdminAction || "").trim().toLowerCase();
    const kind = String(actionNode.dataset.identityopsAdminKind || "").trim().toLowerCase();
    const changeId = String(actionNode.dataset.identityopsAdminId || "").trim();
    if (!action) {
      return;
    }
    if (action === "save-draft" && kind) {
      saveIdentityOpsDraft(kind);
      return;
    }
    if (action === "simulate-draft" && kind) {
      simulateIdentityOpsDraft(kind);
      return;
    }
    if (action === "route-draft" && kind) {
      routeIdentityOpsDraftToGovernance(kind);
      return;
    }
    if (action === "select-queue-item" && changeId) {
      loadIdentityOpsQueueItemIntoDraft(changeId);
      return;
    }
    if (action === "simulate-queue-item" && changeId) {
      const queueItem = findIdentityOpsQueueItem(changeId);
      if (queueItem) {
        simulateIdentityOpsDraft(String(queueItem.kind || "").trim().toLowerCase(), changeId);
      }
      return;
    }
    if (action === "route-queue-item" && changeId) {
      const queueItem = findIdentityOpsQueueItem(changeId);
      if (queueItem) {
        routeIdentityOpsDraftToGovernance(String(queueItem.kind || "").trim().toLowerCase(), changeId);
      }
      return;
    }
    if (action === "apply-approved-change" && changeId) {
      applyApprovedIdentityOpsChange(changeId);
      return;
    }
    if (action === "copy-governance-receipt" && changeId) {
      await copyIdentityOpsGovernanceReceipt(changeId);
      return;
    }
    if (action === "copy-admin-receipt" && changeId) {
      await copyIdentityOpsAdminReceipt(changeId);
      return;
    }
    if (action === "rollback-applied-change" && changeId) {
      applyIdentityOpsRecoveryAction(changeId, "rollback");
      return;
    }
    if (action === "expire-applied-change" && changeId) {
      applyIdentityOpsRecoveryAction(changeId, "expiry");
      return;
    }
    if (action === "copy-rollback-receipt" && changeId) {
      await copyIdentityOpsRollbackReceipt(changeId);
      return;
    }
    if (action === "open-governance") {
      if (changeId) {
        setGovernanceOpsAdminSelection(changeId);
      }
      openIdentityOpsGovernanceView();
    }
  });
  const handlePlatformOpsDraftFieldEvent = (target) => {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return false;
    }
    const field = String(target.dataset.platformopsDraftField || "").trim();
    const isRecoveryReason = target.hasAttribute("data-platformops-admin-recovery-reason");
    if (isRecoveryReason) {
      setPlatformOpsRecoveryReason(target.value);
      return true;
    }
    if (!field) {
      return false;
    }
    updatePlatformOpsDraftField(field, target.value);
    return true;
  };
  ui.platformOpsContent?.addEventListener("input", (event) => {
    handlePlatformOpsDraftFieldEvent(event.target);
  });
  ui.platformOpsContent?.addEventListener("change", (event) => {
    handlePlatformOpsDraftFieldEvent(event.target);
  });
  ui.platformOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-platformops-admin-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.platformopsAdminAction || "").trim().toLowerCase();
    const changeId = String(actionNode.dataset.platformopsAdminId || "").trim();
    if (!action) {
      return;
    }
    if (action === "save-draft") {
      savePlatformOpsDraft();
      return;
    }
    if (action === "simulate-draft") {
      simulatePlatformOpsDraft(changeId);
      return;
    }
    if (action === "route-draft") {
      routePlatformOpsDraftToGovernance(changeId);
      return;
    }
    if (action === "select-queue-item" && changeId) {
      loadPlatformOpsQueueItemIntoDraft(changeId);
      return;
    }
    if (action === "simulate-queue-item" && changeId) {
      simulatePlatformOpsDraft(changeId);
      return;
    }
    if (action === "route-queue-item" && changeId) {
      routePlatformOpsDraftToGovernance(changeId);
      return;
    }
    if (action === "apply-approved-change" && changeId) {
      applyApprovedPlatformOpsChange(changeId);
      return;
    }
    if (action === "rollback-applied-change" && changeId) {
      applyPlatformOpsRecoveryAction(changeId, "rollback");
      return;
    }
    if (action === "copy-governance-receipt" && changeId) {
      await copyPlatformOpsGovernanceReceipt(changeId);
      return;
    }
    if (action === "copy-admin-receipt" && changeId) {
      await copyPlatformOpsAdminReceipt(changeId);
      return;
    }
    if (action === "copy-rollback-receipt" && changeId) {
      await copyPlatformOpsRollbackReceipt(changeId);
      return;
    }
    if (action === "open-governance") {
      if (changeId) {
        setGovernanceOpsAdminSelection(changeId);
      }
      openPlatformOpsGovernanceView();
    }
  });
  const handleGuardrailOpsDraftFieldEvent = (target) => {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return false;
    }
    if (target instanceof HTMLInputElement && target.hasAttribute("data-guardrailops-admin-recovery-reason")) {
      setGuardrailOpsRecoveryReason(target.value);
      return true;
    }
    const field = String(target.dataset.guardrailopsDraftField || "").trim();
    if (!field) {
      return false;
    }
    updateGuardrailOpsDraftField(field, target.value);
    return true;
  };
  ui.guardrailOpsContent?.addEventListener("input", (event) => {
    handleGuardrailOpsDraftFieldEvent(event.target);
  });
  ui.guardrailOpsContent?.addEventListener("change", (event) => {
    handleGuardrailOpsDraftFieldEvent(event.target);
  });
  ui.guardrailOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-guardrailops-admin-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.guardrailopsAdminAction || "").trim().toLowerCase();
    const changeId = String(actionNode.dataset.guardrailopsAdminId || "").trim();
    if (!action) {
      return;
    }
    if (action === "save-draft") {
      saveGuardrailOpsDraft();
      return;
    }
    if (action === "simulate-draft") {
      simulateGuardrailOpsDraft(changeId);
      return;
    }
    if (action === "route-draft") {
      routeGuardrailOpsDraftToGovernance(changeId);
      return;
    }
    if (action === "select-queue-item" && changeId) {
      loadGuardrailOpsQueueItemIntoDraft(changeId);
      return;
    }
    if (action === "simulate-queue-item" && changeId) {
      simulateGuardrailOpsDraft(changeId);
      return;
    }
    if (action === "route-queue-item" && changeId) {
      routeGuardrailOpsDraftToGovernance(changeId);
      return;
    }
    if (action === "open-governance") {
      if (changeId) {
        setGovernanceOpsAdminSelection(changeId);
      }
      openGuardrailOpsGovernanceView();
      return;
    }
    if (action === "apply-approved-change" && changeId) {
      applyApprovedGuardrailOpsChange(changeId);
      return;
    }
    if (action === "rollback-applied-change" && changeId) {
      applyGuardrailOpsRecoveryAction(changeId, "rollback");
      return;
    }
    if (action === "copy-governance-receipt" && changeId) {
      await copyGuardrailOpsGovernanceReceipt(changeId);
      return;
    }
    if (action === "copy-admin-receipt" && changeId) {
      await copyGuardrailOpsAdminReceipt(changeId);
      return;
    }
    if (action === "copy-rollback-receipt" && changeId) {
      await copyGuardrailOpsRollbackReceipt(changeId);
    }
  });
  const handlePolicyOpsDraftFieldEvent = (target) => {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return false;
    }
    if (target instanceof HTMLInputElement && target.hasAttribute("data-policyops-admin-recovery-reason")) {
      setPolicyOpsRecoveryReason(target.value);
      return true;
    }
    const field = String(target.dataset.policyopsDraftField || "").trim();
    if (!field) {
      return false;
    }
    updatePolicyOpsDraftField(field, target.value);
    return true;
  };
  ui.policyOpsContent?.addEventListener("input", (event) => {
    handlePolicyOpsDraftFieldEvent(event.target);
  });
  ui.policyOpsContent?.addEventListener("change", (event) => {
    handlePolicyOpsDraftFieldEvent(event.target);
  });
  const handleComplianceOpsDraftFieldEvent = (target) => {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return false;
    }
    if (target instanceof HTMLInputElement && target.hasAttribute("data-complianceops-admin-recovery-reason")) {
      setComplianceOpsRecoveryReason(target.value);
      return true;
    }
    const field = String(target.dataset.complianceopsDraftField || "").trim();
    if (!field) {
      return false;
    }
    updateComplianceOpsDraftField(field, target.value);
    return true;
  };
  ui.complianceOpsContent?.addEventListener("input", (event) => {
    handleComplianceOpsDraftFieldEvent(event.target);
  });
  ui.complianceOpsContent?.addEventListener("change", (event) => {
    handleComplianceOpsDraftFieldEvent(event.target);
  });
  ui.complianceOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-complianceops-admin-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.complianceopsAdminAction || "").trim().toLowerCase();
    const changeId = String(actionNode.dataset.complianceopsAdminId || "").trim();
    if (!action) {
      return;
    }
    if (action === "save-draft") {
      saveComplianceOpsDraft();
      return;
    }
    if (action === "simulate-draft") {
      simulateComplianceOpsDraft(changeId);
      return;
    }
    if (action === "route-draft") {
      routeComplianceOpsDraftToGovernance(changeId);
      return;
    }
    if (action === "select-queue-item" && changeId) {
      loadComplianceOpsQueueItemIntoDraft(changeId);
      return;
    }
    if (action === "simulate-queue-item" && changeId) {
      simulateComplianceOpsDraft(changeId);
      return;
    }
    if (action === "route-queue-item" && changeId) {
      routeComplianceOpsDraftToGovernance(changeId);
      return;
    }
    if (action === "open-governance") {
      if (changeId) {
        setGovernanceOpsAdminSelection(changeId);
      }
      openComplianceOpsGovernanceView();
      return;
    }
    if (action === "apply-approved-change" && changeId) {
      applyApprovedComplianceOpsChange(changeId);
      return;
    }
    if (action === "expire-applied-change" && changeId) {
      applyComplianceOpsRecoveryAction(changeId, "expiry");
      return;
    }
    if (action === "renew-expired-change" && changeId) {
      applyComplianceOpsRecoveryAction(changeId, "renew");
      return;
    }
    if (action === "copy-governance-receipt" && changeId) {
      await copyComplianceOpsGovernanceReceipt(changeId);
      return;
    }
    if (action === "copy-admin-receipt" && changeId) {
      await copyComplianceOpsAdminReceipt(changeId);
      return;
    }
    if (action === "copy-recovery-receipt" && changeId) {
      await copyComplianceOpsRecoveryReceipt(changeId);
    }
  });
  const handleNetworkOpsDraftFieldEvent = (target) => {
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
    ) {
      return false;
    }
    if (target instanceof HTMLInputElement && target.hasAttribute("data-networkops-admin-recovery-reason")) {
      setNetworkOpsRecoveryReason(target.value);
      return true;
    }
    const field = String(target.dataset.networkopsDraftField || "").trim();
    if (!field) {
      return false;
    }
    updateNetworkOpsDraftField(field, target.value);
    return true;
  };
  ui.networkOpsContent?.addEventListener("input", (event) => {
    handleNetworkOpsDraftFieldEvent(event.target);
  });
  ui.networkOpsContent?.addEventListener("change", (event) => {
    handleNetworkOpsDraftFieldEvent(event.target);
  });
  ui.networkOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-networkops-admin-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.networkopsAdminAction || "").trim().toLowerCase();
    const changeId = String(actionNode.dataset.networkopsAdminId || "").trim();
    if (!action) {
      return;
    }
    if (action === "save-draft") {
      saveNetworkOpsDraft();
      return;
    }
    if (action === "simulate-draft") {
      simulateNetworkOpsDraft(changeId);
      return;
    }
    if (action === "route-draft") {
      routeNetworkOpsDraftToGovernance(changeId);
      return;
    }
    if (action === "select-queue-item" && changeId) {
      loadNetworkOpsQueueItemIntoDraft(changeId);
      return;
    }
    if (action === "simulate-queue-item" && changeId) {
      simulateNetworkOpsDraft(changeId);
      return;
    }
    if (action === "route-queue-item" && changeId) {
      routeNetworkOpsDraftToGovernance(changeId);
      return;
    }
    if (action === "apply-approved-change" && changeId) {
      applyApprovedNetworkOpsChange(changeId);
      return;
    }
    if (action === "rollback-applied-change" && changeId) {
      applyNetworkOpsRecoveryAction(changeId, "rollback");
      return;
    }
    if (action === "copy-governance-receipt" && changeId) {
      await copyNetworkOpsGovernanceReceipt(changeId);
      return;
    }
    if (action === "copy-result-receipt" && changeId) {
      await copyNetworkOpsResultReceipt(changeId);
      return;
    }
    if (action === "copy-rollback-receipt" && changeId) {
      await copyNetworkOpsRollbackReceipt(changeId);
      return;
    }
    if (action === "open-governance") {
      if (changeId) {
        setGovernanceOpsAdminSelection(changeId);
      }
      openNetworkOpsGovernanceView();
    }
  });
  ui.governanceOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (await handleAimxsSpineWorkspaceClick(target)) {
      return;
    }
    const selectNode = target.closest("[data-governanceops-select-run-id]");
    const selectedRunID =
      selectNode instanceof HTMLElement
        ? String(selectNode.dataset.governanceopsSelectRunId || "").trim()
        : "";
    if (selectedRunID) {
      setGovernanceOpsSelection(selectedRunID);
      focusRenderedRegion(ui.governanceOpsContent, { scroll: false });
      return;
    }
    const selectAdminNode = target.closest("[data-governanceops-select-admin-change-id]");
    const selectedAdminChangeId =
      selectAdminNode instanceof HTMLElement
        ? String(selectAdminNode.dataset.governanceopsSelectAdminChangeId || "").trim()
        : "";
    if (selectedAdminChangeId) {
      setGovernanceOpsAdminSelection(selectedAdminChangeId);
      focusRenderedRegion(ui.governanceOpsContent, { scroll: false });
      return;
    }
    const openRunNode = target.closest("[data-governanceops-open-run-id]");
    const openRunID =
      openRunNode instanceof HTMLElement
        ? String(openRunNode.dataset.governanceopsOpenRunId || "").trim()
        : "";
    if (openRunID) {
      await openRunDetail(openRunID, { fromApproval: true });
      return;
    }
    const openViewNode = target.closest("[data-governanceops-open-view]");
    const workspaceView =
      openViewNode instanceof HTMLElement
        ? String(openViewNode.dataset.governanceopsOpenView || "").trim().toLowerCase()
        : "";
    if (workspaceView) {
      setWorkspaceView(workspaceView, true);
      return;
    }
    const openIdentityAdminNode = target.closest("[data-governanceops-open-identity-admin-change-id]");
    const openIdentityAdminChangeId =
      openIdentityAdminNode instanceof HTMLElement
        ? String(openIdentityAdminNode.dataset.governanceopsOpenIdentityAdminChangeId || "").trim()
        : "";
    if (openIdentityAdminChangeId) {
      openIdentityOpsAdminQueueItem(openIdentityAdminChangeId);
      return;
    }
    const openAdminOwnerNode = target.closest("[data-governanceops-open-admin-owner-domain]");
    const openAdminOwnerDomain =
      openAdminOwnerNode instanceof HTMLElement
        ? String(openAdminOwnerNode.dataset.governanceopsOpenAdminOwnerDomain || "").trim().toLowerCase()
        : "";
    const openAdminChangeId =
      openAdminOwnerNode instanceof HTMLElement
        ? String(openAdminOwnerNode.dataset.governanceopsOpenAdminChangeId || "").trim()
        : "";
    if (openAdminOwnerDomain && openAdminChangeId) {
      if (openAdminOwnerDomain === "complianceops") {
        openComplianceOpsAdminQueueItem(openAdminChangeId);
        return;
      }
      if (openAdminOwnerDomain === "platformops") {
        openPlatformOpsAdminQueueItem(openAdminChangeId);
        return;
      }
      if (openAdminOwnerDomain === "guardrailops") {
        openGuardrailOpsAdminQueueItem(openAdminChangeId);
        return;
      }
      if (openAdminOwnerDomain === "policyops") {
        openPolicyOpsAdminQueueItem(openAdminChangeId);
        return;
      }
      if (openAdminOwnerDomain === "networkops") {
        openNetworkOpsAdminQueueItem(openAdminChangeId);
        return;
      }
      openIdentityOpsAdminQueueItem(openAdminChangeId);
      return;
    }
    const copyReceiptNode = target.closest("[data-governanceops-copy-receipt-run-id]");
    const copyReceiptRunID =
      copyReceiptNode instanceof HTMLElement
        ? String(copyReceiptNode.dataset.governanceopsCopyReceiptRunId || "").trim()
        : "";
    if (copyReceiptRunID) {
      governanceOpsViewState = {
        ...governanceOpsViewState,
        selectedRunId: copyReceiptRunID
      };
      await copyGovernanceReceiptSnapshot(copyReceiptRunID);
      return;
    }
    const copyAdminReceiptNode = target.closest("[data-governanceops-copy-admin-receipt-change-id]");
    const copyAdminReceiptChangeId =
      copyAdminReceiptNode instanceof HTMLElement
        ? String(copyAdminReceiptNode.dataset.governanceopsCopyAdminReceiptChangeId || "").trim()
        : "";
    if (copyAdminReceiptChangeId) {
      governanceOpsViewState = {
        ...governanceOpsViewState,
        selectedAdminChangeId: copyAdminReceiptChangeId
      };
      await copyGovernanceOpsAdminReceipt(copyAdminReceiptChangeId);
      return;
    }
    const adminRoutingNode = target.closest("[data-governanceops-routing-admin-change-id]");
    if (adminRoutingNode instanceof HTMLElement) {
      await submitGovernanceOpsAdminRoutingAction(adminRoutingNode);
      return;
    }
    const adminDecisionNode = target.closest("[data-governanceops-decision-admin-change-id]");
    if (adminDecisionNode instanceof HTMLElement) {
      await submitGovernanceOpsAdminDecision(adminDecisionNode);
      return;
    }
    const routingNode = target.closest("[data-governanceops-routing-run-id]");
    if (routingNode instanceof HTMLElement) {
      await submitGovernanceOpsRoutingAction(ui.governanceOpsContent, routingNode);
      return;
    }
    const decisionNode = target.closest("[data-governanceops-decision-run-id]");
    if (decisionNode instanceof HTMLElement) {
      await submitGovernanceOpsDecisionFromContainer(ui.governanceOpsContent, decisionNode);
    }
  });
  ui.auditOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (await handleAimxsSpineWorkspaceClick(target)) {
      return;
    }
    const actionNode = target.closest("[data-auditops-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.auditopsAction || "").trim().toLowerCase();
    if (!action) {
      return;
    }
    if (action === "export-json") {
      runAuditOpsExportJson();
      return;
    }
    if (action === "export-csv") {
      runAuditOpsExportCsv();
      return;
    }
    if (action === "copy-handoff") {
      await runAuditOpsCopyHandoff();
      return;
    }
    if (action === "export-incident-package") {
      runAuditOpsExportIncidentPackage();
      return;
    }
    if (action === "open-incidentops") {
      setWorkspaceView("incidentops", true);
      focusRenderedRegion(ui.incidentOpsContent, { scroll: false });
      return;
    }
    if (action === "copy-latest-handoff") {
      await runAuditOpsCopyLatestIncidentHandoff();
    }
  });
  ui.evidenceOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (await handleAimxsSpineWorkspaceClick(target)) {
      return;
    }
    const copyPathNode = target.closest("[data-evidenceops-copy-path]");
    if (copyPathNode instanceof HTMLElement) {
      await runEvidenceOpsCopyPath(
        String(copyPathNode.dataset.evidenceopsCopyPath || "").trim(),
        String(copyPathNode.dataset.evidenceopsCopyPathLabel || "Path").trim()
      );
      return;
    }
    const actionNode = target.closest("[data-evidenceops-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.evidenceopsAction || "").trim().toLowerCase();
    if (!action) {
      return;
    }
    if (action === "download-bundle-json") {
      runEvidenceOpsExportBundleReview();
      return;
    }
    if (action === "download-provenance-json") {
      runEvidenceOpsExportProvenanceReview();
      return;
    }
    if (action === "copy-latest-uri") {
      const snapshot = getCurrentEvidenceOpsSnapshot();
      await runEvidenceOpsCopyPath(
        String(snapshot?.artifactAccessBoard?.latestArtifact?.uri || "").trim(),
        "Latest artifact URI"
      );
      return;
    }
    if (action === "copy-suggested-run-folder") {
      const snapshot = getCurrentEvidenceOpsSnapshot();
      await runEvidenceOpsCopyPath(
        String(snapshot?.artifactAccessBoard?.suggestedRunFolderPath || "").trim(),
        "Suggested run folder"
      );
      return;
    }
    if (action === "open-bundle-run" || action === "open-artifact-run") {
      await runEvidenceOpsOpenLinkedRun();
      return;
    }
    if (action === "open-auditops") {
      setWorkspaceView("auditops", true);
      focusRenderedRegion(ui.auditOpsContent, { scroll: false });
      return;
    }
    if (action === "open-incidentops") {
      setWorkspaceView("incidentops", true);
      focusRenderedRegion(ui.incidentOpsContent, { scroll: false });
    }
  });
  ui.policyOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const adminActionNode = target.closest("[data-policyops-admin-action]");
    if (adminActionNode instanceof HTMLElement) {
      const action = String(adminActionNode.dataset.policyopsAdminAction || "").trim().toLowerCase();
      const changeId = String(adminActionNode.dataset.policyopsAdminId || "").trim();
      if (!action) {
        return;
      }
      if (action === "save-draft") {
        savePolicyOpsDraft();
        return;
      }
      if (action === "simulate-draft") {
        simulatePolicyOpsDraft(changeId);
        return;
      }
      if (action === "verify-draft") {
        verifyPolicyOpsDraft(changeId);
        return;
      }
      if (action === "route-draft") {
        routePolicyOpsDraftToGovernance(changeId);
        return;
      }
      if (action === "select-queue-item" && changeId) {
        loadPolicyOpsQueueItemIntoDraft(changeId);
        return;
      }
      if (action === "simulate-queue-item" && changeId) {
        simulatePolicyOpsDraft(changeId);
        return;
      }
      if (action === "verify-queue-item" && changeId) {
        verifyPolicyOpsDraft(changeId);
        return;
      }
      if (action === "route-queue-item" && changeId) {
        routePolicyOpsDraftToGovernance(changeId);
        return;
      }
      if (action === "open-governance") {
        if (changeId) {
          setGovernanceOpsAdminSelection(changeId);
        }
        openPolicyOpsGovernanceView();
        return;
      }
      if (action === "apply-approved-change" && changeId) {
        applyApprovedPolicyOpsChange(changeId);
        return;
      }
      if (action === "rollback-applied-change" && changeId) {
        applyPolicyOpsRecoveryAction(changeId, "rollback");
        return;
      }
      if (action === "copy-governance-receipt" && changeId) {
        await copyPolicyOpsGovernanceReceipt(changeId);
        return;
      }
      if (action === "copy-admin-receipt" && changeId) {
        await copyPolicyOpsAdminReceipt(changeId);
        return;
      }
      if (action === "copy-rollback-receipt" && changeId) {
        await copyPolicyOpsRollbackReceipt(changeId);
        return;
      }
      return;
    }
    const actionNode = target.closest("[data-policyops-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.policyopsAction || "").trim().toLowerCase();
    if (!action) {
      return;
    }
    if (action === "export-decision-explanation") {
      runPolicyOpsExportDecisionExplanation();
      return;
    }
    if (action === "copy-stable-policy-references") {
      await runPolicyOpsCopyStableReferences();
      return;
    }
    if (action === "refresh-bounded-simulation") {
      runPolicyOpsRefreshSimulation();
      return;
    }
    if (action === "open-linked-governance") {
      openPolicyOpsGovernance();
      return;
    }
    if (action === "open-auditops") {
      setWorkspaceView("auditops", true);
      focusRenderedRegion(ui.auditOpsContent || ui.auditContent, { scroll: false });
      return;
    }
    if (action === "open-evidenceops") {
      setWorkspaceView("evidenceops", true);
      focusRenderedRegion(ui.evidenceOpsContent, { scroll: false });
      return;
    }
    if (action === "open-complianceops") {
      setWorkspaceView("complianceops", true);
      focusRenderedRegion(ui.complianceOpsContent, { scroll: false });
    }
  });
  ui.incidentOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (await handleAimxsSpineWorkspaceClick(target)) {
      return;
    }
    const actionNode = target.closest("[data-incidentops-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.incidentopsAction || "").trim().toLowerCase();
    const entryId = String(actionNode.dataset.incidentopsEntryId || "").trim();
    const nextStatus = String(actionNode.dataset.incidentopsNextStatus || "").trim();
    if (!action) {
      return;
    }
    if (action === "focus-incident") {
      setIncidentOpsSelection(entryId);
      return;
    }
    if (action === "download-incident-json") {
      runIncidentOpsDownloadPackage(entryId);
      return;
    }
    if (action === "copy-handoff-summary") {
      await runIncidentOpsCopyHandoff(entryId);
      return;
    }
    if (action === "open-linked-run") {
      await runIncidentOpsOpenLinkedRun(entryId);
      return;
    }
    if (action === "transition-incident-status") {
      runIncidentOpsTransitionStatus(nextStatus, entryId);
      return;
    }
    if (action === "open-auditops") {
      setWorkspaceView("auditops", true);
      focusRenderedRegion(ui.auditOpsContent || ui.auditContent, { scroll: false });
      return;
    }
    if (action === "open-evidenceops") {
      setWorkspaceView("evidenceops", true);
      focusRenderedRegion(ui.evidenceOpsContent, { scroll: false });
    }
  });
  const REQUIRED_NATIVE_BRIDGE_METHODS = Object.freeze([
    "NativeSessionSummary",
    "NativeGatewayHoldList",
    "NativeInterpositionConfigure",
    "NativeRuntimeServiceRestart",
    "NativeOpenPath"
  ]);
  const nativeBindings = () => globalThis?.go?.main?.App || null;
  let nativeBridgeFailureKey = "";
  const readNativeBridgeContract = () => {
    const bindings = nativeBindings();
    if (!bindings || typeof bindings !== "object") {
      return {
        available: false,
        healthy: false,
        missing: [...REQUIRED_NATIVE_BRIDGE_METHODS],
        bindings: null
      };
    }
    const missing = REQUIRED_NATIVE_BRIDGE_METHODS.filter(
      (name) => typeof bindings?.[name] !== "function"
    );
    return {
      available: true,
      healthy: missing.length === 0,
      missing,
      bindings
    };
  };
  const setNativeLauncherControlsDisabled = (disabled) => {
    if (!(ui.nativeLauncherStatus instanceof HTMLElement)) {
      return;
    }
    ui.nativeLauncherStatus.dataset.pending = disabled ? "true" : "false";
    ui.nativeLauncherStatus.setAttribute("aria-busy", disabled ? "true" : "false");
    Array.from(
      ui.nativeLauncherStatus.querySelectorAll("button, input, select, textarea")
    ).forEach((node) => {
      if (node instanceof HTMLButtonElement || node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement) {
        node.disabled = disabled;
      }
    });
  };
  const reportNativeBridgeContractFailure = (bridgeContract) => {
    if (!bridgeContract?.available || bridgeContract.healthy) {
      return false;
    }
    const failureKey = bridgeContract.missing.join(",");
    if (failureKey === nativeBridgeFailureKey) {
      return true;
    }
    nativeBridgeFailureKey = failureKey;
    const shell = config?.nativeShell && typeof config.nativeShell === "object"
      ? config.nativeShell
      : {};
    const startupError = `Native bridge missing required bindings: ${bridgeContract.missing.join(", ")}`;
    updateNativeLauncherPresentation({
      ...shell,
      launcherState: "degraded",
      startupError
    });
    setCompanionOpsFeedback("error", startupError);
    return true;
  };
  const syncNativeGatewayHoldsFromBindings = async () => {
    const bindings = nativeBindings();
    if (!bindings || typeof bindings.NativeGatewayHoldList !== "function") {
      config.nativeGatewayHolds = [];
      return [];
    }
    const holdItems = await bindings.NativeGatewayHoldList();
    config.nativeGatewayHolds = Array.isArray(holdItems) ? holdItems : [];
    return config.nativeGatewayHolds;
  };
  const applyNativeSessionSummary = async (sessionSummary, options = {}) => {
    if (!sessionSummary || typeof sessionSummary !== "object") {
      return false;
    }
    nativeBridgeFailureKey = "";
    updateNativeLauncherPresentation(sessionSummary);
    if (options.syncHolds !== false) {
      await syncNativeGatewayHoldsFromBindings().catch(() => {
        config.nativeGatewayHolds = Array.isArray(config.nativeGatewayHolds) ? config.nativeGatewayHolds : [];
      });
    }
    if (options.renderHome !== false) {
      renderHomePanel();
    }
    if (options.renderLog !== false) {
      renderLogOpsPanel();
    }
    return true;
  };
  const syncNativeShellStateFromBindings = async () => {
    const bridgeContract = readNativeBridgeContract();
    if (!bridgeContract.available) {
      return false;
    }
    if (!bridgeContract.healthy) {
      reportNativeBridgeContractFailure(bridgeContract);
      return false;
    }
    const sessionSummary = await bridgeContract.bindings.NativeSessionSummary();
    return applyNativeSessionSummary(sessionSummary);
  };
  const initialNativeBridgeContract = readNativeBridgeContract();
  if (initialNativeBridgeContract.available && !initialNativeBridgeContract.healthy) {
    reportNativeBridgeContractFailure(initialNativeBridgeContract);
  }
  function syncNativeInterpositionDraftPresentation() {
    const root = ui.nativeLauncherStatus instanceof HTMLElement ? ui.nativeLauncherStatus : null;
    if (!(root instanceof HTMLElement)) {
      return;
    }
    const shell = config?.nativeShell && typeof config.nativeShell === "object" ? config.nativeShell : {};
    const interposition = shell?.interposition && typeof shell.interposition === "object"
      ? shell.interposition
      : {};
    const authModeNodes = Array.from(
      root.querySelectorAll("[data-native-shell-field='interposition-auth-mode']")
    ).filter((node) => node instanceof HTMLInputElement);
    const selectedNode = authModeNodes.find((node) => node.checked);
    const authMode =
      String(
        selectedNode instanceof HTMLInputElement
          ? selectedNode.value
          : interposition.upstreamAuthMode || (interposition.upstreamBearerTokenConfigured ? "saved_token" : "client_passthrough")
      )
        .trim()
        .toLowerCase() || "client_passthrough";
    const usingSavedToken = authMode === "saved_token";
    const bearerTokenInput = root.querySelector("[data-native-shell-field='interposition-upstream-bearer-token']");
    if (bearerTokenInput instanceof HTMLInputElement) {
      bearerTokenInput.disabled = !usingSavedToken;
      if (usingSavedToken) {
        bearerTokenInput.placeholder = interposition.upstreamBearerTokenConfigured
          ? "Saved token is configured. Enter a new token to replace it."
          : "Paste upstream bearer token";
      } else {
        bearerTokenInput.value = "";
        bearerTokenInput.placeholder = "Client passthrough mode uses the Authorization already present in compatible client requests.";
      }
    }
    const authHintNode = root.querySelector("[data-native-shell-field='interposition-auth-hint']");
    if (authHintNode instanceof HTMLElement) {
      authHintNode.textContent = usingSavedToken
        ? "Save a dedicated upstream token here when you want Epydios to override the upstream credentials."
        : "Leave saved-token mode off to forward the Authorization already present in compatible client requests.";
    }
  }
  const readNativeInterpositionDraft = () => {
    const shell = config?.nativeShell && typeof config.nativeShell === "object" ? config.nativeShell : {};
    const interposition = shell?.interposition && typeof shell.interposition === "object"
      ? shell.interposition
      : {};
    const root = ui.nativeLauncherStatus instanceof HTMLElement ? ui.nativeLauncherStatus : null;
    const baseUrlInput = root?.querySelector("[data-native-shell-field='interposition-upstream-base-url']");
    const bearerTokenInput = root?.querySelector("[data-native-shell-field='interposition-upstream-bearer-token']");
    const authModeNodes = Array.from(
      root?.querySelectorAll("[data-native-shell-field='interposition-auth-mode']") || []
    );
    const selectedAuthNode = authModeNodes.find(
      (node) => node instanceof HTMLInputElement && node.checked
    );
    const authMode = String(
      selectedAuthNode instanceof HTMLInputElement
        ? selectedAuthNode.value
        : interposition.upstreamAuthMode || (interposition.upstreamBearerTokenConfigured ? "saved_token" : "client_passthrough")
    )
      .trim()
      .toLowerCase();
    const upstreamBaseURL = String(
      baseUrlInput instanceof HTMLInputElement ? baseUrlInput.value : interposition.upstreamBaseUrl || "https://api.openai.com/v1"
    ).trim() || "https://api.openai.com/v1";
    return {
      enabled: Boolean(interposition.enabled),
      upstreamBaseURL,
      upstreamBearerToken:
        authMode === "saved_token"
          ? String(bearerTokenInput instanceof HTMLInputElement ? bearerTokenInput.value : "").trim()
          : "__EPYDIOS_CLEAR_INTERPOSITION_BEARER__"
    };
  };
  const configureNativeInterposition = async (enabled) => {
    const bridgeContract = readNativeBridgeContract();
    if (!bridgeContract.available) {
      setCompanionOpsFeedback(
        "warn",
        "Interposition controls are unavailable in this shell. Use the installed native launcher build to place Epydios in the request path."
      );
      return false;
    }
    if (!bridgeContract.healthy) {
      reportNativeBridgeContractFailure(bridgeContract);
      return false;
    }
    const draft = readNativeInterpositionDraft();
    setNativeLauncherControlsDisabled(true);
    setCompanionOpsFeedback(
      "info",
      enabled
        ? "Turning interposition on. Epydios is applying the local request-path change."
        : "Turning interposition off. Epydios is removing the local request-path change."
    );
    try {
      const sessionSummary = await bridgeContract.bindings.NativeInterpositionConfigure(
        Boolean(enabled),
        draft.upstreamBaseURL,
        draft.upstreamBearerToken
      );
      if (!(await applyNativeSessionSummary(sessionSummary))) {
        await syncNativeShellStateFromBindings();
      }
      await refreshStatusOnly().catch(() => {});
      const shell = config?.nativeShell && typeof config.nativeShell === "object" ? config.nativeShell : {};
      const interposition = shell?.interposition && typeof shell.interposition === "object"
        ? shell.interposition
        : {};
      const interpositionStatus = String(interposition.status || "").trim().toLowerCase();
      const statusMessage = String(interposition.reason || "").trim() || (
        enabled
          ? "Interposition is ON. Compatible upstream requests now enter the local governed proxy path."
          : "Interposition is OFF. Compatible upstream requests will no longer enter the local governed proxy path."
      );
      const feedbackTone =
        !Boolean(interposition.enabled) || interpositionStatus === "off"
          ? "danger"
          : interpositionStatus === "on"
            ? "ok"
            : "warn";
      setCompanionOpsFeedback(feedbackTone, statusMessage);
      return true;
    } catch (error) {
      await syncNativeShellStateFromBindings().catch(() => {});
      setCompanionOpsFeedback("error", `Interposition update failed: ${error.message}`);
      return false;
    } finally {
      setNativeLauncherControlsDisabled(false);
    }
  };
  const setCompanionHandoffContext = (nextContext = null) => {
    companionOpsViewState = {
      ...companionOpsViewState,
      handoffContext: nextContext && typeof nextContext === "object" ? nextContext : null
    };
    renderCompanionHandoffBanner();
    renderHomePanel();
  };
  const returnToCompanionOps = () => {
    setWorkspaceView("companionops", true);
    renderHomePanel();
    focusRenderedRegion(ui.homeOpsContent, { scroll: false });
  };
  const restartNativeServicesFromCompanion = async () => {
    const bindings = nativeBindings();
    if (!bindings || typeof bindings.NativeRuntimeServiceRestart !== "function") {
      setCompanionOpsFeedback(
        "warn",
        "Native service controls are unavailable in this shell. Open Diagnostics to inspect the current launcher and local runtime posture."
      );
      return false;
    }
    try {
      await bindings.NativeRuntimeServiceRestart();
      if (
        String(config?.nativeShell?.mode || "").trim().toLowerCase() === "live" &&
        typeof bindings.NativeGatewayServiceRestart === "function"
      ) {
        await bindings.NativeGatewayServiceRestart();
      }
      await syncNativeShellStateFromBindings();
      await refresh();
      setCompanionOpsFeedback("ok", "Local runtime and gateway services restarted from CompanionOps.");
      return true;
    } catch (error) {
      await syncNativeShellStateFromBindings().catch(() => {});
      setCompanionOpsFeedback("error", `Restart failed: ${error.message}`);
      return false;
    }
  };
  const openCompanionWorkbenchTarget = async (kind, options = {}) => {
    const nextKind = String(kind || "").trim().toLowerCase();
    const runId = String(options.runId || "").trim();
    const approvalId = String(options.approvalId || "").trim();
    const incidentId = String(options.incidentId || "").trim();
    const sourceClient = String(options.sourceClient || "").trim();
    const openContext = (view) => {
      setCompanionHandoffContext({
        kind: nextKind || "handoff",
        approvalId,
        runId,
        incidentId,
        gatewayRequestId: String(options.gatewayRequestId || "").trim(),
        sourceClient,
        openedFrom: "companionops",
        view: String(view || "").trim().toLowerCase()
      });
    };
    if (nextKind === "workbench") {
      setWorkspaceView(companionOpsViewState.lastWorkbenchDomain || "agentops", true);
      return true;
    }
    if (nextKind === "approval" || nextKind === "approval-queue") {
      await refresh();
      openContext("governanceops");
      setGovernanceOpsSelection(runId, {
        force: true,
        syncSpine: false,
        render: false
      });
      setWorkspaceView("governanceops", true);
      if (runId) {
        openApprovalDetail(runId, { force: true });
      }
      focusRenderedRegion(ui.governanceOpsContent, { scroll: false });
      return true;
    }
    if (nextKind === "run" || nextKind === "runs") {
      openContext("runtimeops");
      if (runId) {
        await openRunDetail(runId);
      } else {
        setWorkspaceView("runtimeops", true);
        focusRenderedRegion(ui.runsContent, { scroll: false });
      }
      return true;
    }
    if (nextKind === "incident") {
      await refresh();
      openContext("incidentops");
      await openAimxsSpineWorkspace("incidentops", runId, incidentId);
      return true;
    }
    if (nextKind === "diagnostics") {
      openContext("diagnostics");
      setSettingsSubview("diagnostics", true);
      setWorkspaceView("settingsops", true);
      focusRenderedRegion(ui.settingsContent, { scroll: false });
      return true;
    }
    return false;
  };
  ui.homeOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-homeops-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.homeopsAction || "").trim();
    if (!action) {
      return;
    }

    if (action === "open-domain") {
      const view = String(actionNode.dataset.homeopsView || "").trim();
      if (view) {
        setWorkspaceView(view, true);
      }
      return;
    }

    if (action === "open-workbench") {
      await openCompanionWorkbenchTarget("workbench");
      return;
    }

    if (action === "restart-services") {
      await restartNativeServicesFromCompanion();
      return;
    }

    if (action === "show-diagnostics") {
      await openCompanionWorkbenchTarget("diagnostics");
      return;
    }

    if (action === "open-approval-queue") {
      if (ui.approvalsStatusFilter) {
        ui.approvalsStatusFilter.value = "PENDING";
      }
      if (ui.approvalsSort) {
        ui.approvalsSort.value = "ttl_asc";
      }
      if (ui.approvalsPage) {
        ui.approvalsPage.value = "1";
      }
      await openCompanionWorkbenchTarget("approval-queue");
      return;
    }

    if (action === "open-approval-item") {
      await openCompanionWorkbenchTarget("approval", {
        runId: String(actionNode.dataset.homeopsRunId || "").trim(),
        approvalId: String(actionNode.dataset.homeopsApprovalId || "").trim()
      });
      return;
    }

    if (action === "open-run-item" || action === "open-recent-runs") {
      if (ui.runsSort) {
        ui.runsSort.value = "updated_desc";
      }
      if (ui.runsPage) {
        ui.runsPage.value = "1";
      }
      await openCompanionWorkbenchTarget(action === "open-run-item" ? "run" : "runs", {
        runId: String(actionNode.dataset.homeopsRunId || "").trim()
      });
      return;
    }

    if (action === "open-incident-item") {
      await openCompanionWorkbenchTarget("incident", {
        runId: String(actionNode.dataset.homeopsRunId || "").trim(),
        incidentId: String(actionNode.dataset.homeopsIncidentId || "").trim()
      });
      return;
    }
  });
  ui.companionHandoffBanner?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const returnNode = target.closest("[data-companion-return-action='return']");
    if (!(returnNode instanceof HTMLElement)) {
      return;
    }
    returnToCompanionOps();
  });
  ui.nativeLauncherStatus?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-native-shell-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.nativeShellAction || "").trim().toLowerCase();
    if (action === "toggle-interposition") {
      const nextEnabled = String(actionNode.dataset.nativeShellNextEnabled || "").trim().toLowerCase() === "true";
      configureNativeInterposition(nextEnabled).catch(() => {});
      return;
    }
    if (action === "save-interposition-config") {
      const draft = readNativeInterpositionDraft();
      configureNativeInterposition(draft.enabled).catch(() => {});
    }
  });
  ui.nativeLauncherStatus?.addEventListener("submit", (event) => {
    const formNode = event.target;
    if (!(formNode instanceof HTMLFormElement)) {
      return;
    }
    const formKind = String(formNode.dataset.nativeShellForm || "").trim().toLowerCase();
    if (formKind !== "interposition-config") {
      return;
    }
    event.preventDefault();
    const draft = readNativeInterpositionDraft();
    configureNativeInterposition(draft.enabled).catch(() => {});
  });
  ui.nativeLauncherStatus?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.matches("[data-native-shell-field='interposition-auth-mode']")) {
      syncNativeInterpositionDraftPresentation();
    }
  });
  ui.logOpsContent?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionNode = target.closest("[data-logops-action]");
    if (!(actionNode instanceof HTMLElement)) {
      return;
    }
    const action = String(actionNode.dataset.logopsAction || "").trim().toLowerCase();
    if (action === "open-path") {
      await openNativePathFromLogOps(
        String(actionNode.dataset.logopsPath || "").trim(),
        String(actionNode.dataset.logopsLabel || "Artifact").trim()
      );
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
    runAuditOpsExportJson();
  });
  ui.auditExportCsvButton?.addEventListener("click", () => {
    runAuditOpsExportCsv();
  });
  ui.auditCopyHandoffButton?.addEventListener("click", async () => {
    await runAuditOpsCopyHandoff();
  });
  ui.auditExportIncidentButton?.addEventListener("click", () => {
    runAuditOpsExportIncidentPackage();
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
    await runAuditOpsCopyLatestIncidentHandoff();
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
        setAuditOpsHandoffPreview(prepared.text, { render: false });
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
  ui.incidentHistorySummary?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const action = String(target.dataset.incidentSummaryAction || "").trim();
    if (!action) {
      return;
    }
    if (action === "copy-latest") {
      ui.incidentHistoryCopyLatestButton?.click();
      return;
    }
    if (action === "open-audit") {
      setWorkspaceView("auditops", true);
      focusRenderedRegion(ui.auditOpsContent || ui.auditContent, { scroll: false });
      return;
    }
    if (action === "show-needs-closure") {
      applyIncidentQuickView("filed", "newest", { resetSearch: false });
      return;
    }
    if (action === "show-all") {
      applyIncidentQuickView("", "newest", { resetSearch: false });
      return;
    }
    if (action === "clear-selection") {
      clearIncidentHistorySelection();
      renderAuditFilingFeedback("info", "Incident selection cleared from the queue summary.");
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
        message: describeAimxsSyncedMessage(aimxsOverride)
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
    const copyPath = String(target.dataset.runCopyPath || "").trim();
    if (copyPath) {
      const label = String(target.dataset.runCopyPathLabel || "Path").trim();
      try {
        await copyTextToClipboard(copyPath);
        const feedback = ui.runDetailContent.querySelector("[data-run-path-feedback]");
        if (feedback instanceof HTMLElement) {
          feedback.textContent = `${label} copied to the clipboard.`;
        }
      } catch (error) {
        const feedback = ui.runDetailContent.querySelector("[data-run-path-feedback]");
        if (feedback instanceof HTMLElement) {
          feedback.textContent = `Copy failed: ${error.message}`;
        }
      }
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
    setWorkspaceView("agentops", true);
    openApprovalDetail(openApprovalRunID);
  });
  ui.runtimeOpsContent.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const openRunNode = target.closest("[data-runtimeops-open-run-id]");
    if (openRunNode instanceof HTMLElement) {
      const runID = String(openRunNode.dataset.runtimeopsOpenRunId || "").trim();
      if (runID) {
        await openRunDetail(runID);
      }
      return;
    }
    const reviewSessionNode = target.closest("[data-runtimeops-review-session-id]");
    if (reviewSessionNode instanceof HTMLElement) {
      await loadRuntimeOpsSessionReview(
        String(reviewSessionNode.dataset.runtimeopsReviewSessionId || "").trim(),
        { focus: true }
      );
      return;
    }
    const closeSessionNode = target.closest("[data-runtimeops-close-session-id]");
    if (closeSessionNode instanceof HTMLElement) {
      await submitRuntimeOpsCloseSession(
        String(closeSessionNode.dataset.runtimeopsCloseSessionId || "").trim()
      );
      return;
    }
    const attachNode = target.closest("[data-runtimeops-attach-session-id]");
    if (attachNode instanceof HTMLElement) {
      await submitRuntimeOpsAttachWorker(
        String(attachNode.dataset.runtimeopsAttachSessionId || "").trim()
      );
      return;
    }
    const workerEventNode = target.closest("[data-runtimeops-worker-event-session-id]");
    if (workerEventNode instanceof HTMLElement) {
      await submitRuntimeOpsWorkerEvent(
        String(workerEventNode.dataset.runtimeopsWorkerEventType || "").trim(),
        String(workerEventNode.dataset.runtimeopsWorkerEventSessionId || "").trim(),
        String(workerEventNode.dataset.runtimeopsWorkerEventWorkerId || "").trim()
      );
    }
  });

  const stopRefreshLoop = startRealtimeRefreshLoop(getRuntimeChoices(), refreshStatusOnly);
  window.addEventListener("beforeunload", stopRefreshLoop, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshStatusOnly().catch(() => {});
    }
  });

  await refresh();
  window.__m14MainReady = true;
}

main().catch((error) => {
  renderHomeOpsEmptyState(ui, {
    tone: "error",
    title: "CompanionOps",
    message: `Bootstrap failed: ${error.message}`
  });
});
