import {
  detectLocalPlatform,
  resolveLocalStoragePaths,
  resolveRetentionDays
} from "../../views/settings.js";

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function readObject(value) {
  return value && typeof value === "object" ? value : {};
}

function postureTone(...statuses) {
  const values = statuses
    .map((value) => normalizeString(value).toLowerCase())
    .filter(Boolean);
  if (values.some((value) => ["error", "failed", "blocked", "missing", "invalid"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["warn", "warning", "unknown", "degraded", "partial", "stale"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["ok", "ready", "active", "healthy", "resolved", "available", "clean"].includes(value))) {
    return "ok";
  }
  return "neutral";
}

function resolveSelectedAgentProfile(integrations, selectedAgentProfileId) {
  const profiles = Array.isArray(integrations.agentProfiles) ? integrations.agentProfiles : [];
  const selectedId = normalizeString(selectedAgentProfileId || integrations.selectedAgentProfileId)
    .toLowerCase();
  return (
    profiles.find((item) => normalizeString(item?.id).toLowerCase() === selectedId) ||
    profiles[0] ||
    {}
  );
}

function connectorDriverLabel(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "mcp_sqlite") {
    return "SQLite MCP";
  }
  if (normalized === "mcp_postgres") {
    return "Postgres MCP";
  }
  if (normalized === "mcp_filesystem") {
    return "Filesystem MCP";
  }
  if (normalized === "mcp_github") {
    return "GitHub MCP";
  }
  if (normalized === "mcp_browser") {
    return "Browser MCP";
  }
  return normalized || "-";
}

function normalizeConnectorProfiles(connectors) {
  const profiles = Array.isArray(connectors?.profiles) ? connectors.profiles : [];
  return profiles
    .map((item) => ({
      id: normalizeString(item?.id).toLowerCase(),
      label: normalizeString(item?.label, normalizeString(item?.id, "-")),
      driver: normalizeString(item?.driver).toLowerCase(),
      driverLabel: connectorDriverLabel(item?.driver),
      databasePath: normalizeString(item?.databasePath, "-"),
      connectionUri: normalizeString(item?.connectionUri, "-"),
      rootPath: normalizeString(item?.rootPath, "-"),
      endpointRef: normalizeString(item?.endpointRef, "-"),
      credentialRef: normalizeString(item?.credentialRef, "-"),
      allowedTools: Array.isArray(item?.allowedTools)
        ? item.allowedTools.map((entry) => normalizeString(entry).toLowerCase()).filter(Boolean)
        : [],
      allowedOwners: Array.isArray(item?.allowedOwners)
        ? item.allowedOwners.map((entry) => normalizeString(entry).toLowerCase()).filter(Boolean)
        : [],
      allowedRepos: Array.isArray(item?.allowedRepos)
        ? item.allowedRepos.map((entry) => normalizeString(entry).toLowerCase()).filter(Boolean)
        : [],
      allowedOrigins: Array.isArray(item?.allowedOrigins)
        ? item.allowedOrigins.map((entry) => normalizeString(entry).toLowerCase()).filter(Boolean)
        : [],
      enabled: item?.enabled !== false
    }))
    .filter((item) => item.id);
}

function connectorApprovalPosture(profile = {}) {
  const tools = Array.isArray(profile?.allowedTools) ? profile.allowedTools : [];
  if (tools.includes("click_destructive_button")) {
    return "approval-gated destructive click";
  }
  return "bounded read-only";
}

function buildConnectorGovernanceSnapshot(settings, session) {
  const connectors = readObject(settings.connectors);
  const endpoints = Array.isArray(settings.endpoints) ? settings.endpoints : [];
  const connectorEndpoint =
    endpoints.find((item) => normalizeString(item?.id).toLowerCase() === "connectorsettings") || {};
  const profiles = normalizeConnectorProfiles(connectors);
  const selectedId = normalizeString(connectors.selectedConnectorId || connectors.selectedProfileId)
    .toLowerCase();
  const selectedProfile =
    profiles.find((item) => item.id === selectedId) ||
    profiles[0] ||
    {};
  const driverLabels = Array.from(
    new Set(profiles.map((item) => normalizeString(item.driverLabel)).filter(Boolean))
  );
  const scopeProject = normalizeString(
    settings.summary?.projectId || session?.claims?.project_id,
    "-"
  );
  const scopeTenant = normalizeString(
    settings.summary?.tenantId || session?.claims?.tenant_id,
    "-"
  );
  const source = normalizeString(connectors.source, "none").toLowerCase();
  const endpointState = normalizeString(connectorEndpoint.state, "unknown").toLowerCase();
  return {
    projectScope: scopeProject,
    scopeTenant,
    source,
    endpointState,
    endpointDetail: normalizeString(connectorEndpoint.detail, "-"),
    warning: normalizeString(connectors.warning),
    updatedAt: normalizeString(connectors.updatedAt, "-"),
    hasSettings: connectors.hasSettings === true || profiles.length > 0,
    selectedConnectorId: normalizeString(selectedProfile.id, "-"),
    selectedConnectorLabel: normalizeString(selectedProfile.label, "-"),
    selectedDriver: normalizeString(selectedProfile.driver, "-"),
    selectedDriverLabel: normalizeString(selectedProfile.driverLabel, "-"),
    selectedEnabled: selectedProfile.enabled !== false,
    selectedAllowedTools: Array.isArray(selectedProfile.allowedTools)
      ? selectedProfile.allowedTools
      : [],
    selectedAllowedOwners: Array.isArray(selectedProfile.allowedOwners)
      ? selectedProfile.allowedOwners
      : [],
    selectedAllowedRepos: Array.isArray(selectedProfile.allowedRepos)
      ? selectedProfile.allowedRepos
      : [],
    selectedAllowedOrigins: Array.isArray(selectedProfile.allowedOrigins)
      ? selectedProfile.allowedOrigins
      : [],
    selectedDatabasePath: normalizeString(selectedProfile.databasePath, "-"),
    selectedConnectionUri: normalizeString(selectedProfile.connectionUri, "-"),
    selectedRootPath: normalizeString(selectedProfile.rootPath, "-"),
    selectedEndpointRef: normalizeString(selectedProfile.endpointRef, "-"),
    selectedCredentialRef: normalizeString(selectedProfile.credentialRef, "-"),
    approvalPosture: connectorApprovalPosture(selectedProfile),
    profiles,
    profileCount: profiles.length,
    enabledProfileCount: profiles.filter((item) => item.enabled).length,
    driverLabels,
    tone: postureTone(
      endpointState,
      source,
      profiles.length > 0 ? "ok" : "unknown",
      selectedProfile.enabled === false ? "warn" : "ok"
    )
  };
}

function buildIntegrationSettingsSnapshot(settings, editorState, session) {
  const integrations = readObject(settings.integrations);
  const draft = readObject(editorState.draft);
  const endpoints = Array.isArray(settings.endpoints) ? settings.endpoints : [];
  const integrationEndpoint =
    endpoints.find((item) => normalizeString(item?.id).toLowerCase() === "integrationsettings") || {};
  const scopeProject = normalizeString(
    editorState.projectId || editorState.scopeProjectId || session?.claims?.project_id,
    "-"
  );
  const scopeTenant = normalizeString(
    editorState.scopeTenantId || settings.summary?.tenantId || session?.claims?.tenant_id,
    "-"
  );
  const syncState = normalizeString(editorState.syncState, "unknown").toLowerCase();
  const source = normalizeString(editorState.source, "none").toLowerCase();
  const endpointState = normalizeString(integrationEndpoint.state, "unknown").toLowerCase();
  const selectedAgentProfileId = normalizeString(
    draft.selectedAgentProfileId || integrations.selectedAgentProfileId,
    "-"
  );
  return {
    projectScope: scopeProject,
    scopeTenant,
    syncState,
    source,
    endpointState,
    endpointDetail: normalizeString(integrationEndpoint.detail, "-"),
    selectedAgentProfileId,
    modelRouting: normalizeString(draft.modelRouting || integrations.modelRouting, "-"),
    gatewayProviderId: normalizeString(draft.gatewayProviderId || integrations.gatewayProviderId, "-"),
    directFallback: Boolean(
      Object.prototype.hasOwnProperty.call(draft, "allowDirectProviderFallback")
        ? draft.allowDirectProviderFallback
        : integrations.allowDirectProviderFallback
    ),
    endpoints: endpoints.map((item) => ({
      id: normalizeString(item?.id, "-").toLowerCase(),
      label: normalizeString(item?.label || item?.id, "-"),
      state: normalizeString(item?.state, "unknown").toLowerCase(),
      path: normalizeString(item?.path, "-"),
      detail: normalizeString(item?.detail, "-"),
      updatedAt: normalizeString(item?.updatedAt, "-")
    })),
    editorStatus: normalizeString(editorState.status, "clean").toLowerCase(),
    tone: postureTone(syncState, endpointState, source, editorState.status)
  };
}

function buildWorkflowRecoverySnapshot(editorState, integrationSettings) {
  const editorStatus = normalizeString(editorState.status, "clean").toLowerCase();
  const syncState = integrationSettings.syncState;
  const endpointState = integrationSettings.endpointState;
  const source = integrationSettings.source;
  const savedAt = normalizeString(editorState.savedAt, "-");
  const appliedAt = normalizeString(editorState.appliedAt, "-");

  if (editorStatus === "invalid") {
    return {
      tone: "warn",
      status: "blocked draft",
      summary: "Fix the blocked setup values before saving or applying this workspace setup.",
      steps: [
        "Correct the blocked fields in Supported Setup.",
        "Save Draft again after the setup returns to a valid state.",
        "Apply Saved only after the draft is ready to use."
      ],
      savedAt,
      appliedAt,
      source,
      syncState,
      endpointState,
      projectScope: integrationSettings.projectScope
    };
  }

  if (syncState === "scope-unavailable") {
    return {
      tone: "warn",
      status: "scope recovery",
      summary: "Choose the intended workspace before this setup can be trusted.",
      steps: [
        "Pick the intended project from the workspace context bar.",
        "Review the selected profile and routing values again for that workspace.",
        "Save Draft and Apply Saved again after the workspace is restored."
      ],
      savedAt,
      appliedAt,
      source,
      syncState,
      endpointState,
      projectScope: integrationSettings.projectScope
    };
  }

  if (
    syncState === "endpoint-unavailable" ||
    endpointState === "error" ||
    endpointState === "unknown"
  ) {
    return {
      tone: "warn",
      status: "endpoint recovery",
      summary: "Live setup verification is not ready, so treat the current result as local-only until the connection is healthy again.",
      steps: [
        "Open Diagnostics and confirm the setup connection is ready again.",
        "Retry Apply Saved after the connection returns to a healthy state.",
        "Review Audit Trail after the retry to confirm the recorded runtime change."
      ],
      savedAt,
      appliedAt,
      source,
      syncState,
      endpointState,
      projectScope: integrationSettings.projectScope
    };
  }

  if (editorStatus === "dirty") {
    return {
      tone: "neutral",
      status: "draft pending",
      summary: "You have unsaved setup changes for this workspace.",
      steps: [
        "Review the current values in Supported Setup.",
        "Save Draft to create a recoverable checkpoint.",
        "Apply Saved when the draft is ready to use."
      ],
      savedAt,
      appliedAt,
      source,
      syncState,
      endpointState,
      projectScope: integrationSettings.projectScope
    };
  }

  if (editorStatus === "saved") {
    return {
      tone: "ok",
      status: "saved draft ready",
      summary: "A saved setup draft is ready to apply for this workspace.",
      steps: [
        "Review the saved values in Supported Setup.",
        "Run Apply Saved when the draft is ready to use.",
        "Review Audit Trail after apply to confirm the recorded change."
      ],
      savedAt,
      appliedAt,
      source,
      syncState,
      endpointState,
      projectScope: integrationSettings.projectScope
    };
  }

  return {
    tone: "ok",
    status: "stable",
    summary: "This setup workflow is stable for the current workspace.",
    steps: [
      "Use Save Draft before risky setup changes.",
      "Use Apply Saved to activate the saved workspace setup.",
      "Review Audit Trail after meaningful changes to confirm the recorded result."
    ],
    savedAt,
    appliedAt,
    source,
    syncState,
    endpointState,
    projectScope: integrationSettings.projectScope
  };
}

export function createSettingsWorkspaceSnapshot(context = {}) {
  const settings = readObject(context.settings);
  const editorState = readObject(context.editorState);
  const viewState = readObject(context.viewState);
  const session = readObject(context.session);
  const summary = readObject(settings.summary);
  const integrations = readObject(settings.integrations);
  const theme = readObject(settings.theme);
  const realtime = readObject(settings.realtime);
  const terminal = readObject(settings.terminal);
  const localSecureRefs = readObject(settings.localSecureRefs);
  const aimxs = readObject(settings.aimxs);
  const activation = readObject(aimxs.activation);
  const selectedAgent = resolveSelectedAgentProfile(
    integrations,
    context.selectedAgentProfileId || integrations.selectedAgentProfileId
  );
  const platform = detectLocalPlatform();
  const localPaths = resolveLocalStoragePaths(platform);
  const retention = resolveRetentionDays(settings);
  const tenantId = normalizeString(summary.tenantId || session?.claims?.tenant_id, "-");
  const projectId = normalizeString(summary.projectId || session?.claims?.project_id, "-");
  const environmentId = normalizeString(summary.environmentId || summary.environment || aimxs.mode, "-");
  const integrationSettings = buildIntegrationSettingsSnapshot(settings, editorState, session);
  const connectorGovernance = buildConnectorGovernanceSnapshot(settings, session);
  const workflowRecovery = buildWorkflowRecoverySnapshot(editorState, integrationSettings);

  return {
    settings,
    editorState,
    viewState,
    appPreferences: {
      selectedAgentProfileId: normalizeString(selectedAgent.id, "-"),
      selectedAgentLabel: normalizeString(selectedAgent.label, normalizeString(selectedAgent.id, "-")),
      modelRouting: normalizeString(integrations.modelRouting, "-"),
      themeMode: normalizeString(theme.mode, "-"),
      realtimeMode: normalizeString(realtime.mode, "-"),
      pollIntervalMs: normalizeString(realtime.pollIntervalMs, "-"),
      terminalMode: normalizeString(terminal.mode, "-"),
      restrictedHostMode: normalizeString(terminal.restrictedHostMode, "-"),
      tone: postureTone(theme.mode, integrations.selectedAgentProfileId, realtime.mode, terminal.mode)
    },
    secureRefs: {
      available: localSecureRefs.available === true,
      storedCount: Number(localSecureRefs.storedCount || 0),
      service: normalizeString(localSecureRefs.service, "-"),
      indexPath: normalizeString(localSecureRefs.indexPath, "-"),
      exportPath: normalizeString(localSecureRefs.exportPath, "-"),
      tone: postureTone(
        localSecureRefs.available === true ? "ok" : "warn",
        Number(localSecureRefs.storedCount || 0) > 0 ? "ok" : "unknown"
      )
    },
    localEnvironment: {
      tenantId,
      projectId,
      environmentId,
      runtimePlatform: platform,
      runtimeApiBaseUrl: normalizeString(settings.runtimeApiBaseUrl, "-"),
      registryApiBaseUrl: normalizeString(settings.registryApiBaseUrl, "-"),
      baseDir: normalizeString(localPaths.base, "-"),
      logsDir: normalizeString(localPaths.logs, "-"),
      exportsDir: normalizeString(localPaths.exports, "-"),
      aimxsMode: normalizeString(aimxs.mode, "-"),
      activationState: normalizeString(activation.state || aimxs.state, "-"),
      retention,
      tone: postureTone(
        aimxs.mode,
        activation.state || aimxs.state,
        settings.runtimeApiBaseUrl ? "ok" : "warn"
      )
    },
    integrationSettings,
    connectorGovernance,
    workflowRecovery
  };
}
