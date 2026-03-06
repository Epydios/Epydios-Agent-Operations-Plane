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
import { renderExecutionDefaults } from "./views/execution-defaults.js";
import {
  escapeHTML,
  formatTime,
  normalizeTimeRange,
  paginateItems,
  parsePositiveInt,
  parseTimeMs,
  resolveTimeBounds,
  withinTimeBounds
} from "./views/common.js";

const ui = {
  title: document.getElementById("app-title"),
  subtitle: document.getElementById("app-subtitle"),
  configSummary: document.getElementById("config-summary"),
  workspaceLayout: document.getElementById("workspace-layout"),
  workspaceTabs: Array.from(document.querySelectorAll("[data-workspace-tab]")),
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
const PROJECT_ANY_SCOPE_KEY = "__project_any__";
const WORKSPACE_VIEW_IDS = new Set(["operations", "runs", "approvals", "incidents", "settings"]);
const INCIDENT_SUBVIEW_IDS = new Set(["queue", "audit"]);
const SETTINGS_SUBVIEW_IDS = new Set(["configuration", "diagnostics"]);
const ADVANCED_SECTION_IDS = new Set(["operations", "runs", "approvals", "incidents", "settings"]);
const INCIDENT_STATUS_TRANSITIONS = {
  drafted: [
    { to: "filed", label: "Mark Filed" }
  ],
  filed: [
    { to: "closed", label: "Mark Closed" },
    { to: "drafted", label: "Revert Draft" }
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

function applyWorkspaceView(view) {
  const selectedView = normalizeWorkspaceView(view, "operations");
  if (ui.workspaceLayout) {
    ui.workspaceLayout.setAttribute("data-workspace-view", selectedView);
  }
  for (const tab of ui.workspaceTabs || []) {
    const tabView = normalizeWorkspaceView(tab?.dataset?.workspaceTab, "");
    const isActive = tabView === selectedView;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  return selectedView;
}

function setWorkspaceView(view, persist = false) {
  const selectedView = applyWorkspaceView(view);
  if (persist) {
    saveValue(WORKSPACE_VIEW_PREF_KEY, selectedView);
  }
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
  for (const tab of ui.incidentSubtabs || []) {
    const tabView = normalizeIncidentSubview(tab?.dataset?.incidentSubtab, "");
    const isActive = tabView === selectedView;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  for (const panel of ui.incidentSubpanels || []) {
    const panelView = normalizeIncidentSubview(panel?.dataset?.incidentSubpanel, "");
    const isActive = panelView === selectedView;
    panel.classList.toggle("is-active", isActive);
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
  for (const tab of tabs) {
    const tabView = normalizeSettingsSubview(tab?.dataset?.settingsSubview, "");
    const isActive = tabView === selected;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  const panels = Array.from(ui.settingsContent?.querySelectorAll("[data-settings-subpanel]") || []);
  for (const panel of panels) {
    const panelView = normalizeSettingsSubview(panel?.dataset?.settingsSubpanel, "");
    const isActive = panelView === selected;
    panel.classList.toggle("is-active", isActive);
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
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const section = String(node.dataset.advancedSection || "").trim().toLowerCase();
    if (!ADVANCED_SECTION_IDS.has(section)) {
      continue;
    }
    const enabled = isAdvancedSectionEnabled(section);
    node.classList.toggle("advanced-hidden", !enabled);
    node.setAttribute("aria-hidden", enabled ? "false" : "true");
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
  return state;
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
  row.scrollIntoView({ behavior: "smooth", block: "center" });
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
    chip.textContent = String(state?.status || "clean").trim().toLowerCase() || "clean";
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
    parts.push(`<div class="meta settings-editor-error">error: ${escapeHTML(item)}</div>`);
  }
  for (const item of warnings) {
    parts.push(`<div class="meta settings-editor-warn">warn: ${escapeHTML(item)}</div>`);
  }
  parts.push(
    `<div class="meta">savedOverride=${escapeHTML(String(Boolean(state?.hasSavedOverride)))}; applied=${escapeHTML(String(Boolean(state?.applied)))}</div>`
  );
  if (state?.savedAt) {
    parts.push(`<div class="meta">savedAt=${escapeHTML(String(state.savedAt))}</div>`);
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
    chip.textContent = String(state?.status || "clean").trim().toLowerCase() || "clean";
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
    parts.push(`<div class="meta settings-editor-error">error: ${escapeHTML(item)}</div>`);
  }
  for (const item of warnings) {
    parts.push(`<div class="meta settings-editor-warn">warn: ${escapeHTML(item)}</div>`);
  }
  parts.push(
    "<div class=\"meta\">HTTPS mode requires payment entitlement and valid ref:// credential references.</div>"
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

function buildAuditFileSuffix(filters) {
  const tenant = safeFileToken(filters?.tenant, "tenant-any");
  const project = safeFileToken(filters?.project, "project-any");
  const decision = safeFileToken(filters?.decision, "decision-any");
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${tenant}-${project}-${decision}-${timestamp}`;
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
  const className =
    normalizedTone === "ok"
      ? "audit-feedback-ok"
      : normalizedTone === "error"
        ? "audit-feedback-error"
        : "audit-feedback-warn";
  ui.auditFeedback.innerHTML = `<div class="meta ${className}">${escapeHTML(message || "")}</div>`;
}

function buildIncidentPackageHandoffText(pkg) {
  const meta = pkg?.meta || {};
  const run = pkg?.run || {};
  const approval = pkg?.approval || {};
  const audit = pkg?.audit || {};
  const summary = audit?.summary || {};
  return [
    "Epydios AgentOps Desktop Incident Package",
    `packageId=${String(meta.packageId || "").trim() || "-"}`,
    `generatedAt=${String(meta.generatedAt || "").trim() || "-"}`,
    `actor=${String(meta.actor || "").trim() || "-"}`,
    `runId=${String(run.runId || "").trim() || "-"}`,
    `runDetailSource=${String(run.detailSource || "").trim() || "-"}`,
    `approvalStatus=${String(approval.status || "").trim() || "-"}`,
    `approvalSource=${String(approval.source || "").trim() || "-"}`,
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
  return {
    id: packageId || `incident-history-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    packageId,
    createdAt,
    runId,
    approvalStatus,
    auditMatchedCount,
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
  return {
    id: String(candidate.id || candidate.packageId || `incident-history-${Date.now()}-${Math.floor(Math.random() * 100000)}`).trim(),
    packageId: String(candidate.packageId || "").trim(),
    createdAt,
    runId: String(candidate.runId || "").trim(),
    approvalStatus: String(candidate.approvalStatus || "UNAVAILABLE").trim().toUpperCase(),
    auditMatchedCount: Number(candidate.auditMatchedCount || 0),
    fileName: String(candidate.fileName || "").trim(),
    handoffText: String(candidate.handoffText || "").trim(),
    payload: candidate.payload && typeof candidate.payload === "object" ? deepClone(candidate.payload) : {},
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
  ui.providersContent.innerHTML = "";
  ui.settingsContent.innerHTML = "";
  ui.approvalsFeedback.innerHTML = "";
  ui.approvalsContent.innerHTML = "";
  if (ui.approvalsDetailContent) {
    ui.approvalsDetailContent.innerHTML = "";
    delete ui.approvalsDetailContent.dataset.selectedRunId;
  }
  ui.terminalFeedback.innerHTML = "";
  ui.terminalHistory.innerHTML = "";
  ui.terminalPayload.textContent = "";
  ui.terminalPolicyHints.innerHTML = "";
  ui.runsContent.innerHTML = "";
  ui.runDetailContent.innerHTML = "";
  delete ui.runDetailContent.dataset.selectedRunId;
  ui.auditContent.innerHTML = "";
  if (ui.auditFeedback) {
    ui.auditFeedback.innerHTML = "";
  }
  if (ui.auditHandoffPreview) {
    ui.auditHandoffPreview.textContent = "Audit handoff preview appears here after Copy Handoff.";
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
    renderAuditFilingFeedback("warn", "Select one or more incident rows before bulk status updates.");
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
      `Bulk update blocked: no selected rows can transition to ${targetStatus}.`
    );
    return;
  }
  persistIncidentHistory();
  renderIncidentHistoryPanel();
  const detail = skippedCount > 0 ? `; skipped=${skippedCount}` : "";
  renderAuditFilingFeedback(
    "ok",
    `Bulk incident status update complete: to=${targetStatus}; updated=${updatedCount}${detail}.`
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
  return {
    meta: {
      generatedAt,
      actor: String(actor || "").trim(),
      source: "incident-history-selection",
      selectedCount: items.length,
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
    renderAuditFilingFeedback("warn", `Incident queue sync ignored (${sourceLabel}): invalid storage payload.`);
    return false;
  }
  store.setIncidentPackageHistory(parsed);
  renderIncidentHistoryPanel();
  renderAuditFilingFeedback(
    "ok",
    `Incident queue synced from ${sourceLabel} (rows=${parsed.length}).`
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

function renderIncidentHistorySummary(totalCount, visibleCount, selectedCount, view) {
  if (!(ui.incidentHistorySummary instanceof HTMLElement)) {
    return;
  }
  const searchLabel = normalizeIncidentHistorySearch(view?.search) || "-";
  const pageLabel = `${String(view?.page || 1)}/${String(view?.totalPages || 1)}`;
  ui.incidentHistorySummary.innerHTML = `
    <div class="metric">
      <div class="meta">queueTotal=${escapeHTML(String(totalCount || 0))}; visible=${escapeHTML(String(visibleCount || 0))}; selected=${escapeHTML(String(selectedCount || 0))}; filter=${escapeHTML(view?.status || "any")}; sort=${escapeHTML(view?.sort || "newest")}; search=${escapeHTML(searchLabel)}; page=${escapeHTML(pageLabel)}; pageSize=${escapeHTML(String(view?.pageSize || 25))}</div>
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
  });
  if (!Array.isArray(allItems) || allItems.length === 0) {
    ui.incidentHistoryContent.innerHTML = `
      <div class="metric">
        <div class="meta">No incident packages in queue.</div>
      </div>
    `;
    return;
  }
  if (items.length === 0) {
    ui.incidentHistoryContent.innerHTML = `
      <div class="metric">
        <div class="meta">No incident packages match current queue filters/search.</div>
      </div>
    `;
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
  const statusChipClass = incidentStatusChipClass(filingStatus);
  const transitionActions = buildIncidentTransitionButtons(entryId, filingStatus);
  const openRunAction = runIdValue
    ? `<button class="btn btn-secondary btn-small" type="button" data-incident-history-open-run-id="${escapeHTML(runIdValue)}">Open Run</button>`
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
      <div class="incident-history-meta">
        created=${escapeHTML(createdAt)}; filingUpdated=${escapeHTML(filingUpdatedAt)}; runId=${escapeHTML(runId)}; approval=${escapeHTML(approvalStatus)}; auditRows=${escapeHTML(String(auditRows))}; file=${escapeHTML(fileName)}
      </div>
      <div class="incident-history-actions">
        <button class="btn btn-secondary btn-small" type="button" data-incident-history-download-id="${escapeHTML(entryId)}">Download</button>
        <button class="btn btn-secondary btn-small" type="button" data-incident-history-copy-id="${escapeHTML(entryId)}">Copy Handoff</button>
        ${transitionActions}
        ${openRunAction}
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
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-approvals-pending">Open Queue</button>
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
        >Open Runs</button>
      </div>
    </article>
    <article class="triage-card">
      <div class="title">Audit Denies</div>
      <div class="triage-value">${escapeHTML(String(triage.denyAuditEvents))}</div>
      <div class="meta"><span class="${auditTone}">current audit scope</span></div>
      <div class="triage-actions">
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-audit-deny">Filter DENY</button>
      </div>
    </article>
    <article class="triage-card">
      <div class="title">Terminal Issues</div>
      <div class="triage-value">${escapeHTML(String(terminalIssueCount))}</div>
      <div class="meta"><span class="${terminalTone}">policy_blocked=${escapeHTML(String(triage.terminalPolicyBlocked))}; failed=${escapeHTML(String(triage.terminalFailed))}</span></div>
      <div class="triage-actions">
        <button class="btn btn-secondary btn-small" type="button" data-triage-action="open-terminal-issues">Open History</button>
      </div>
    </article>
  `;
}

async function main() {
  const config = await loadConfig();
  window.__m14MainReady = false;
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
  }
  for (const tab of ui.incidentSubtabs || []) {
    tab.addEventListener("click", () => {
      const requested = String(tab.dataset.incidentSubtab || "").trim().toLowerCase();
      setIncidentSubview(requested, true);
    });
  }
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

      latestSettingsSnapshot = settingsWithConfigChanges;
      triageSnapshot = { runs, approvals, audit };
      latestAuditPayload = audit || { items: [] };
      renderTriagePanel();
      renderContextPanel();
      renderHealth(ui, health, pipeline);
      renderProviders(ui, providers);
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
        aimxsEditor: aimxsEditorState
      });
      setSettingsSubview(settingsSubviewState);
      renderApprovals(ui, store, approvals, approvalScope, selectedApprovalRunId);
      renderApprovalsDetail(ui, store.getApprovalByRunID(selectedApprovalRunId));
      renderRuns(ui, store, runs, runScope);
      renderAudit(ui, audit, auditScope);
      applyAdvancedState();
      applyDetailsOpenState();
      refreshSucceeded = true;
    } catch (error) {
      renderError(ui, `Refresh failed: ${error.message}`);
      setRefreshStatus("error", "refresh failed");
    } finally {
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
        packageVersion: "v1alpha1"
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
        ui.runDetailContent.innerHTML = `<div class="metric"><div class="meta">Run detail failed: ${escapeHTML(error.message)}</div></div>`;
      }
    }

    ui.runDetailContent?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    ui.approvalsDetailContent.scrollIntoView({ behavior: "smooth", block: "start" });
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
    refresh().catch(() => {});
  });
  ui.approvalsTimeFrom?.addEventListener("change", () => {
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.approvalsTimeTo?.addEventListener("change", () => {
    if (ui.approvalsPage) {
      ui.approvalsPage.value = "1";
    }
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

    let focused = focusSettingsEndpointRow(endpointID);
    if (!focused) {
      await refresh();
      focused = focusSettingsEndpointRow(endpointID);
    }
    if (focused) {
      setWorkspaceView("settings", true);
      setAdvancedSectionEnabled("settings", true, true);
      setSettingsSubview("diagnostics", true);
      ui.settingsContent?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  ui.settingsOpenAuditEventsButton?.addEventListener("click", async () => {
    setWorkspaceView("incidents", true);
    setIncidentSubview("audit", true);
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    await refresh();
    ui.auditContent?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  ui.settingsContent?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const integrationFieldNode = target.closest("[data-settings-int-field]");
    const aimxsFieldNode = target.closest("[data-settings-aimxs-field]");
    if (!integrationFieldNode && !aimxsFieldNode) {
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
              "Draft has unapplied changes. Click Apply AIMXS Settings to update runtime choices.",
            errors: [],
            warnings: validation.warnings
          }
        : {
            status: "invalid",
            message: "AIMXS settings failed validation; correct fields before apply.",
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
      message: "Draft has unapplied changes. Save Draft, then Apply Saved to activate.",
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
      const requested = String(settingsSubviewNode.dataset.settingsSubview || "").trim().toLowerCase();
      setSettingsSubview(requested, true);
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
      ui.auditContent?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            message: "AIMXS settings controls are unavailable in the current view.",
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
            message: "AIMXS settings failed validation; correct fields before apply.",
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
            ? "AIMXS HTTPS mode applied with external provider refs."
            : mode === "in_stack_reserved"
              ? "AIMXS mode set to in_stack_reserved placeholder; HTTPS external path remains primary."
              : "AIMXS mode set to disabled.";
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
          message: "Draft failed validation; fix errors before saving.",
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
        message: "Draft saved for this project scope. Click Apply Saved to activate.",
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
          message: "Saved draft is invalid; fix values and save again.",
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
      let appliedMessage = "Saved draft applied to active runtime choices for this project scope.";
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
          appliedMessage = "Saved draft applied via runtime endpoint and activated for this project scope.";
          runtimeIntegrationSyncStateByProject[key] = "loaded";
        } else if (result?.source === "endpoint-unavailable") {
          appliedMessage =
            "Runtime integration settings endpoint is unavailable; applied local fallback for this project scope.";
          runtimeIntegrationSyncStateByProject[key] = "endpoint-unavailable";
        }
      } else {
        appliedMessage =
          "Tenant/project scope is unavailable; applied local fallback for this project scope.";
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
        warnings: validation.warnings,
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
      const baselineProjectChoices = resolveChoicesForProject(baselineChoices, projectID, {});
      const baselineDraft = buildEditorDraftFromChoices(
        baselineProjectChoices,
        baselineProjectChoices?.integrations?.selectedAgentProfileId
      );
      const now = new Date().toISOString();
      let source = "local-fallback";
      let statusMessage = "Project override reset to baseline defaults in local fallback mode.";
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
            "Project override reset to baseline defaults via runtime endpoint.";
          runtimeIntegrationSyncStateByProject[key] = "loaded";
        } else if (result?.source === "endpoint-unavailable") {
          runtimeIntegrationSyncStateByProject[key] = "endpoint-unavailable";
          statusMessage =
            "Runtime integration settings endpoint is unavailable; baseline defaults were applied locally only.";
        }
      } else {
        statusMessage =
          "Tenant/project scope is unavailable; baseline defaults were applied locally only.";
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
        warnings: [],
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
    try {
      const result = await api.submitApprovalDecision(runID, decision, {
        ttlSeconds: approvalScope.ttlSeconds,
        reason
      });
      if (result?.applied === false) {
        renderApprovalFeedback(ui, "warn", result.warning || "No approval endpoint available.");
      } else {
        renderApprovalFeedback(
          ui,
          "ok",
          `runId=${runID}; decision=${decision}; status=${result.status || "updated"}`
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
      return;
    }

    if (action === "open-terminal-issues") {
      if (ui.terminalHistoryStatusFilter) {
        ui.terminalHistoryStatusFilter.value = "POLICY_BLOCKED";
      }
      renderTerminalHistoryPanel();
      setWorkspaceView("operations", true);
      ui.terminalHistory?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    refresh().catch(() => {});
  });
  ui.runsTimeFrom?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.runsTimeTo?.addEventListener("change", () => {
    if (ui.runsPage) {
      ui.runsPage.value = "1";
    }
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
    refresh().catch(() => {});
  });
  ui.auditTimeFrom?.addEventListener("change", () => {
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
    refresh().catch(() => {});
  });
  ui.auditTimeTo?.addEventListener("change", () => {
    if (ui.auditPage) {
      ui.auditPage.value = "1";
    }
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
      renderAuditFilingFeedback("warn", "No audit rows match current filters; JSON export skipped.");
      return;
    }
    const suffix = buildAuditFileSuffix(bundle?.meta?.filters || {});
    const fileName = `audit-events-${suffix}.json`;
    triggerTextDownload(JSON.stringify(bundle, null, 2), fileName, "application/json;charset=utf-8");
    if (ui.auditHandoffPreview instanceof HTMLElement) {
      ui.auditHandoffPreview.textContent = buildAuditHandoffText(bundle);
    }
    renderAuditFilingFeedback("ok", `Exported ${bundle.items.length} rows to ${fileName}.`);
  });
  ui.auditExportCsvButton?.addEventListener("click", () => {
    const bundle = getCurrentAuditFilingBundle();
    if (!Array.isArray(bundle?.items) || bundle.items.length === 0) {
      renderAuditFilingFeedback("warn", "No audit rows match current filters; CSV export skipped.");
      return;
    }
    const suffix = buildAuditFileSuffix(bundle?.meta?.filters || {});
    const fileName = `audit-events-${suffix}.csv`;
    const csv = buildAuditCsv(bundle.items);
    triggerTextDownload(csv, fileName, "text/csv;charset=utf-8");
    renderAuditFilingFeedback("ok", `Exported ${bundle.items.length} rows to ${fileName}.`);
  });
  ui.auditCopyHandoffButton?.addEventListener("click", async () => {
    const bundle = getCurrentAuditFilingBundle();
    if (!Array.isArray(bundle?.items) || bundle.items.length === 0) {
      renderAuditFilingFeedback("warn", "No audit rows match current filters; handoff copy skipped.");
      return;
    }
    const handoffText = buildAuditHandoffText(bundle);
    try {
      await copyTextToClipboard(handoffText);
      if (ui.auditHandoffPreview instanceof HTMLElement) {
        ui.auditHandoffPreview.textContent = handoffText;
      }
      renderAuditFilingFeedback("ok", `Copied handoff summary for ${bundle.items.length} rows to clipboard.`);
    } catch (error) {
      renderAuditFilingFeedback("error", `Handoff copy failed: ${error.message}`);
    }
  });
  ui.auditExportIncidentButton?.addEventListener("click", () => {
    const incidentPkg = getCurrentIncidentPackage();
    const runId = String(incidentPkg?.run?.runId || "").trim();
    if (!runId) {
      renderAuditFilingFeedback("warn", "Select a run detail first, then export the incident package.");
      return;
    }

    const suffix = buildAuditFileSuffix(incidentPkg?.audit?.meta?.filters || {});
    const runToken = safeFileToken(runId, "run");
    const fileName = `incident-package-${runToken}-${suffix}.json`;
    const handoffText = buildIncidentPackageHandoffText(incidentPkg);
    incidentPkg.handoff = {
      text: handoffText
    };
    triggerTextDownload(JSON.stringify(incidentPkg, null, 2), fileName, "application/json;charset=utf-8");
    pushIncidentHistory(buildIncidentHistoryEntry(incidentPkg, fileName));
    if (ui.auditHandoffPreview instanceof HTMLElement) {
      ui.auditHandoffPreview.textContent = handoffText;
    }
    const auditCount = Number(incidentPkg?.audit?.meta?.matchedCount || 0);
    const approvalStatus = String(incidentPkg?.approval?.status || "UNAVAILABLE").trim().toUpperCase();
    renderAuditFilingFeedback(
      "ok",
      `Exported incident package ${fileName} (runId=${runId}; approval=${approvalStatus}; auditRows=${auditCount}).`
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
    renderIncidentHistoryPanel();
  });
  ui.incidentHistoryTimeFrom?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
    renderIncidentHistoryPanel();
  });
  ui.incidentHistoryTimeTo?.addEventListener("change", () => {
    incidentHistoryViewState.page = 1;
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
      renderAuditFilingFeedback("warn", "Select one or more incident rows before export bundle.");
      return;
    }
    const session = getSession();
    const actor = String(
      session?.claims?.sub || session?.claims?.email || session?.claims?.client_id || ""
    ).trim();
    const view = readIncidentHistoryViewFromUI();
    const bundle = buildSelectedIncidentExportBundle(selectedEntries, view, actor);
    const timestamp = String(bundle?.meta?.generatedAt || new Date().toISOString())
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const fileName = `incident-selected-bundle-${selectedEntries.length}-${timestamp}.json`;
    triggerTextDownload(JSON.stringify(bundle, null, 2), fileName, "application/json;charset=utf-8");
    renderAuditFilingFeedback(
      "ok",
      `Exported selected incident bundle ${fileName} (rows=${selectedEntries.length}).`
    );
  });
  ui.incidentHistoryClearSelectionButton?.addEventListener("click", () => {
    clearIncidentHistorySelection();
    renderAuditFilingFeedback("warn", "Cleared incident selection.");
  });
  ui.incidentHistoryCopyLatestButton?.addEventListener("click", async () => {
    const [latest] = store.getIncidentPackageHistory();
    if (!latest) {
      renderAuditFilingFeedback("warn", "Incident queue is empty; no handoff text to copy.");
      return;
    }
    const handoffText = String(latest?.handoffText || "").trim();
    if (!handoffText) {
      renderAuditFilingFeedback("warn", "Latest incident package has no handoff text.");
      return;
    }
    try {
      await copyTextToClipboard(handoffText);
      if (ui.auditHandoffPreview instanceof HTMLElement) {
        ui.auditHandoffPreview.textContent = handoffText;
      }
      renderAuditFilingFeedback("ok", `Copied latest incident handoff (${latest.packageId || latest.id}).`);
    } catch (error) {
      renderAuditFilingFeedback("error", `Incident handoff copy failed: ${error.message}`);
    }
  });
  ui.incidentHistoryClearButton?.addEventListener("click", () => {
    clearIncidentHistoryQueue();
    renderAuditFilingFeedback("warn", "Cleared incident filing queue.");
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
    });
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
          `Transition blocked for ${entry.packageId || entry.id}: ${currentStatus} -> ${nextStatus}.`
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
        `Updated filing status for ${entry.packageId || entry.id}: ${currentStatus} -> ${nextStatus}.`
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
      const runToken = safeFileToken(fallbackRunId, "run");
      const fileName = fallbackFileName || `incident-package-${runToken}-${Date.now()}.json`;
      triggerTextDownload(JSON.stringify(entry.payload, null, 2), fileName, "application/json;charset=utf-8");
      renderAuditFilingFeedback("ok", `Downloaded incident package ${fileName}.`);
      return;
    }
    const copyId = String(target.dataset.incidentHistoryCopyId || "").trim();
    if (copyId) {
      const entry = store.getIncidentPackageHistoryById(copyId);
      const handoffText = String(entry?.handoffText || "").trim();
      if (!handoffText) {
        renderAuditFilingFeedback("warn", "Selected incident entry has no handoff text.");
        return;
      }
      try {
        await copyTextToClipboard(handoffText);
        if (ui.auditHandoffPreview instanceof HTMLElement) {
          ui.auditHandoffPreview.textContent = handoffText;
        }
        renderAuditFilingFeedback("ok", `Copied incident handoff (${entry.packageId || entry.id}).`);
      } catch (error) {
        renderAuditFilingFeedback("error", `Incident handoff copy failed: ${error.message}`);
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
      ui.runDetailContent.innerHTML = '<div class="metric"><div class="meta">Select a run to view detail.</div></div>';
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
    ui.approvalsContent?.scrollIntoView({ behavior: "smooth", block: "start" });
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
