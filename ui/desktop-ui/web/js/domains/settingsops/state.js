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
      summary: "Fix the blocked integration values before saving or applying this project-scoped configuration.",
      steps: [
        "Correct the invalid fields in Integration Settings Board.",
        "Save Draft again after the editor returns to a valid state.",
        "Apply Saved only after the draft is clean enough to activate."
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
      summary: "A concrete tenant/project scope is required before the runtime-backed integration change can be trusted.",
      steps: [
        "Pin the intended project from the workspace context bar.",
        "Review the selected profile and routing values again for that scope.",
        "Save Draft and Apply Saved again after scope is restored."
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
      summary: "The integration endpoint is not ready, so current settings should be treated as local-only until a successful retry is recorded.",
      steps: [
        "Retry Apply Saved after the integration endpoint returns to a ready state.",
        "Use Open Audit Events after the retry to confirm the recorded runtime change.",
        "Do not rely on the current result as live runtime state until that audit trail is present."
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
      summary: "There are unsaved integration edits for this project scope.",
      steps: [
        "Review the current values in Integration Settings Board.",
        "Save Draft to checkpoint the configuration.",
        "Apply Saved when the draft is ready to activate."
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
      summary: "A saved project-scoped integration draft is ready to apply.",
      steps: [
        "Review the saved values in Integration Settings Board.",
        "Run Apply Saved when the project-scoped draft is ready to activate.",
        "Use Open Audit Events after apply to confirm the resulting control-plane trail."
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
    summary: "The bounded settings workflow is stable for this project scope.",
    steps: [
      "Use Save Draft before risky integration changes.",
      "Use Apply Saved to activate project-scoped integration defaults.",
      "Use Open Audit Events after meaningful changes to confirm the recorded trail."
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
    workflowRecovery
  };
}
