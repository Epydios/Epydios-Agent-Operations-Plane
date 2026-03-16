function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function readObject(value) {
  return value && typeof value === "object" ? value : {};
}

function countProviderReadiness(items = []) {
  const values = Array.isArray(items) ? items : [];
  const readyCount = values.filter((item) => item?.ready === true).length;
  const degradedCount = values.filter((item) => item?.probed === true && item?.ready !== true).length;
  return {
    totalCount: values.length,
    readyCount,
    degradedCount
  };
}

function postureTone(...statuses) {
  const values = statuses
    .map((value) => normalizeString(value).toLowerCase())
    .filter(Boolean);
  if (values.some((value) => ["error", "failed", "blocked", "missing"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["warn", "warning", "unknown", "degraded", "partial"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["ok", "ready", "active", "healthy", "pass"].includes(value))) {
    return "ok";
  }
  return "neutral";
}

function normalizePreview(preview) {
  const source = preview && typeof preview === "object" ? preview : {};
  return {
    input: readObject(source.input),
    issues: Array.isArray(source.issues) ? source.issues : [],
    payload: readObject(source.payload)
  };
}

function summarizeIssues(issues = []) {
  const values = Array.isArray(issues) ? issues : [];
  const errorCount = values.filter((issue) => normalizeString(issue?.severity).toLowerCase() === "error").length;
  const warnCount = values.filter((issue) => normalizeString(issue?.severity).toLowerCase() === "warn").length;
  return {
    totalCount: values.length,
    errorCount,
    warnCount,
    tone: postureTone(errorCount > 0 ? "error" : "ok", warnCount > 0 ? "warn" : "ok")
  };
}

function compactJson(value, maxLength = 420) {
  const source = value && typeof value === "object" ? value : {};
  const json = JSON.stringify(source, null, 2);
  if (json.length <= maxLength) {
    return json;
  }
  return `${json.slice(0, Math.max(0, maxLength - 3))}...`;
}

function selectProviderContract(settings, selectedAgentProfileId) {
  const integrations = readObject(settings?.integrations);
  const contracts = Array.isArray(integrations.providerContracts) ? integrations.providerContracts : [];
  const selectedProfileId = normalizeString(selectedAgentProfileId || integrations.selectedAgentProfileId)
    .toLowerCase();
  return (
    contracts.find((item) => item?.selected === true) ||
    contracts.find((item) => normalizeString(item?.profileId).toLowerCase() === selectedProfileId) ||
    contracts[0] ||
    {}
  );
}

function summarizeGovernedActionPreview(preview) {
  const payload = readObject(preview.payload);
  const issues = summarizeIssues(preview.issues);
  const resource = readObject(payload.resource);
  const task = readObject(payload.task);
  return {
    requestId: normalizeString(payload?.meta?.requestId, "-"),
    target: normalizeString(payload?.action?.target, "-"),
    requestLabel: normalizeString(task.requestLabel, "-"),
    riskTier: normalizeString(payload?.context?.governed_action?.risk_tier, "-"),
    issueCount: issues.totalCount,
    errorCount: issues.errorCount,
    tone: issues.tone,
    preview: compactJson({
      meta: {
        requestId: payload?.meta?.requestId,
        tenantId: payload?.meta?.tenantId,
        projectId: payload?.meta?.projectId
      },
      action: payload?.action,
      resource: {
        kind: resource.kind,
        name: resource.name,
        id: resource.id
      },
      task: {
        requestLabel: task.requestLabel,
        demoProfile: task.demoProfile
      }
    })
  };
}

function summarizeRunBuilderPreview(preview) {
  const payload = readObject(preview.payload);
  const desktop = readObject(payload.desktop);
  const issues = summarizeIssues(preview.issues);
  return {
    requestId: normalizeString(payload?.meta?.requestId, "-"),
    tier: normalizeString(desktop.tier, "-"),
    targetExecutionProfile: normalizeString(desktop.targetExecutionProfile, "-"),
    targetOS: normalizeString(desktop.targetOS, "-"),
    capabilityCount: Array.isArray(desktop.requestedCapabilities) ? desktop.requestedCapabilities.length : 0,
    issueCount: issues.totalCount,
    errorCount: issues.errorCount,
    tone: issues.tone,
    preview: compactJson({
      meta: {
        requestId: payload?.meta?.requestId,
        tenantId: payload?.meta?.tenantId,
        projectId: payload?.meta?.projectId
      },
      action: payload?.action,
      desktop: {
        tier: desktop.tier,
        targetOS: desktop.targetOS,
        targetExecutionProfile: desktop.targetExecutionProfile,
        requestedCapabilities: desktop.requestedCapabilities
      },
      dryRun: payload?.dryRun
    })
  };
}

function summarizeTerminalPreview(preview) {
  const payload = readObject(preview.payload);
  const safety = readObject(payload.safety);
  const command = readObject(payload.command);
  const issues = summarizeIssues(preview.issues);
  return {
    requestId: normalizeString(payload?.meta?.requestId, "-"),
    runId: normalizeString(payload?.scope?.runId, "-"),
    commandTag: normalizeString(payload?.provenance?.commandTag, "-"),
    terminalMode: normalizeString(safety.terminalMode, "-"),
    restrictedHostMode: normalizeString(safety.restrictedHostMode, "-"),
    readOnlyRequested: command.readOnlyRequested === true,
    issueCount: issues.totalCount,
    errorCount: issues.errorCount,
    tone: issues.tone,
    preview: compactJson({
      meta: {
        requestId: payload?.meta?.requestId,
        tenantId: payload?.meta?.tenantId,
        projectId: payload?.meta?.projectId
      },
      scope: payload?.scope,
      command: {
        text: command.text,
        cwd: command.cwd,
        timeoutSeconds: command.timeoutSeconds,
        readOnlyRequested: command.readOnlyRequested
      },
      safety,
      provenance: payload?.provenance
    })
  };
}

export function createDeveloperWorkspaceSnapshot(context = {}) {
  const settings = readObject(context.settings);
  const health = readObject(context.health);
  const providers = readObject(context.providers);
  const runs = readObject(context.runs);
  const session = readObject(context.session);
  const projectScope = normalizeString(context.projectScope || session?.claims?.project_id, "-");
  const selectedAgentProfileId = normalizeString(
    context.selectedAgentProfileId || settings?.integrations?.selectedAgentProfileId,
    "-"
  ).toLowerCase();
  const providerCounts = countProviderReadiness(providers.items || []);
  const providerContract = selectProviderContract(settings, selectedAgentProfileId);
  const governedActionPreview = summarizeGovernedActionPreview(normalizePreview(context.governedActionPreview));
  const runBuilderPreview = summarizeRunBuilderPreview(normalizePreview(context.runBuilderPreview));
  const terminalPreview = summarizeTerminalPreview(normalizePreview(context.terminalPreview));
  const terminalHistory = Array.isArray(context.terminalHistory) ? context.terminalHistory : [];
  const identity = readObject(settings.identity);
  const runtimeIdentity = readObject(identity.identity);
  const policyCatalog = readObject(settings.policyCatalog);
  const aimxs = readObject(settings.aimxs);
  const aimxsActivation = readObject(aimxs.activation);
  const toolErrorCount =
    governedActionPreview.errorCount + runBuilderPreview.errorCount + terminalPreview.errorCount;
  const toolIssueCount =
    governedActionPreview.issueCount + runBuilderPreview.issueCount + terminalPreview.issueCount;

  return {
    debugTools: {
      projectScope,
      selectedAgentProfileId: selectedAgentProfileId || "-",
      actor: normalizeString(session?.claims?.sub || runtimeIdentity.subject, "-"),
      runtimeStatus: normalizeString(health?.runtime?.status, "unknown"),
      providersStatus: normalizeString(health?.providers?.status, "unknown"),
      policyStatus: normalizeString(health?.policy?.status, "unknown"),
      providerReadyCount: providerCounts.readyCount,
      providerTotalCount: providerCounts.totalCount,
      runCount: Array.isArray(runs.items) ? runs.items.length : 0,
      terminalHistoryCount: terminalHistory.length,
      advancedVisible: context.advancedVisible === true,
      toolIssueCount,
      tone: postureTone(
        health?.runtime?.status,
        health?.providers?.status,
        health?.policy?.status,
        toolErrorCount > 0 ? "warn" : "ok"
      )
    },
    rawPayload: {
      governedAction: governedActionPreview,
      runBuilder: runBuilderPreview,
      terminal: terminalPreview,
      tone: postureTone(
        governedActionPreview.tone,
        runBuilderPreview.tone,
        terminalPreview.tone
      )
    },
    contractLab: {
      selectedAgentProfileId: selectedAgentProfileId || "-",
      providerContractCount: Array.isArray(settings?.integrations?.providerContracts)
        ? settings.integrations.providerContracts.length
        : 0,
      selectedProvider: normalizeString(providerContract.provider, "-"),
      selectedTransport: normalizeString(providerContract.transport, "-"),
      selectedEndpointRef: normalizeString(providerContract.endpointRef, "-"),
      authorityBasis: normalizeString(identity.authorityBasis, "-"),
      identitySource: normalizeString(identity.source, "-"),
      policyPackCount: Number(policyCatalog.count || (Array.isArray(policyCatalog.items) ? policyCatalog.items.length : 0)),
      effectivePermissionCount: Array.isArray(runtimeIdentity.effectivePermissions)
        ? runtimeIdentity.effectivePermissions.length
        : 0,
      aimxsMode: normalizeString(aimxsActivation.activeMode || aimxs.mode, "-"),
      aimxsProviderId: normalizeString(aimxsActivation.selectedProviderId, "-"),
      terminalMode: normalizeString(terminalPreview.terminalMode, "-"),
      restrictedHostMode: normalizeString(terminalPreview.restrictedHostMode, "-"),
      tone: postureTone(
        identity.authorityBasis ? "ok" : "warn",
        providerContract.provider ? "ok" : "warn",
        policyCatalog.count ? "ok" : "warn",
        aimxsActivation.state || aimxs.mode
      )
    }
  };
}
