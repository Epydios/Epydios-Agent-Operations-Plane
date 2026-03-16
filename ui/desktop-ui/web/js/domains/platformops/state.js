function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function countProviderReadiness(items = []) {
  const values = Array.isArray(items) ? items : [];
  const readyCount = values.filter((item) => item?.ready === true).length;
  const degradedCount = values.filter((item) => item?.probed === true && item?.ready !== true).length;
  return {
    totalCount: values.length,
    readyCount,
    degradedCount,
    unknownCount: values.length - readyCount - degradedCount
  };
}

function countPresentSecrets(secrets = {}) {
  const values = Object.values(secrets && typeof secrets === "object" ? secrets : {});
  const totalCount = values.length;
  const presentCount = values.filter((entry) => Boolean(entry?.present)).length;
  return {
    totalCount,
    presentCount,
    missingCount: Math.max(0, totalCount - presentCount)
  };
}

function countProbedProviders(items = []) {
  const values = Array.isArray(items) ? items : [];
  return values.filter((item) => item?.probed === true).length;
}

function postureTone(...statuses) {
  const values = statuses.map((value) => normalizeString(value).toLowerCase()).filter(Boolean);
  if (values.some((value) => ["error", "failed", "blocked", "degraded"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["warn", "unknown", "unavailable"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["ok", "pass", "active", "ready", "available"].includes(value))) {
    return "ok";
  }
  return "neutral";
}

export function createPlatformWorkspaceSnapshot(context = {}) {
  const health = context?.health && typeof context.health === "object" ? context.health : {};
  const pipeline = context?.pipeline && typeof context.pipeline === "object" ? context.pipeline : {};
  const providers = context?.providers && typeof context.providers === "object" ? context.providers : {};
  const aimxsActivation =
    context?.aimxsActivation && typeof context.aimxsActivation === "object" ? context.aimxsActivation : {};
  const providerCounts = countProviderReadiness(providers.items || []);
  const providerItems = Array.isArray(providers.items) ? providers.items : [];
  const probedProviderCount = countProbedProviders(providerItems);
  const secretCounts = countPresentSecrets(aimxsActivation.secrets);
  const enabledProviders = Array.isArray(aimxsActivation.enabledProviders) ? aimxsActivation.enabledProviders : [];
  const enabledReadyCount = enabledProviders.filter((item) => item?.ready === true).length;
  const warnings = Array.isArray(aimxsActivation.warnings) ? aimxsActivation.warnings : [];
  const selectedProviderId = normalizeString(aimxsActivation.selectedProviderId, "-");
  const firstDegradedProviderId =
    normalizeString(providerItems.find((item) => item?.probed === true && item?.ready !== true)?.providerId, "-");
  const environment = normalizeString(pipeline.environment, "local");
  const deploymentHealthyCount = [
    health.runtime?.status,
    health.providers?.status,
    health.policy?.status
  ].filter((status) => normalizeString(status).toLowerCase() === "ok").length;
  const deploymentIssueCount = 3 - deploymentHealthyCount;
  const supportSignalCount =
    providerCounts.degradedCount + providerCounts.unknownCount + secretCounts.missingCount + warnings.length;

  return {
    environmentOverview: {
      surface: "desktop-local",
      namespace: normalizeString(aimxsActivation.namespace, "epydios-system"),
      activeMode: normalizeString(aimxsActivation.activeMode, "unknown"),
      selectedProviderId: normalizeString(aimxsActivation.selectedProviderId, "-"),
      pipelineStatus: normalizeString(pipeline.status, "unknown"),
      latestStagingGate: normalizeString(pipeline.latestStagingGate, "-"),
      latestProdGate: normalizeString(pipeline.latestProdGate, "-"),
      tone: postureTone(pipeline.status, aimxsActivation.state)
    },
    deploymentPosture: {
      runtimeStatus: normalizeString(health.runtime?.status, "unknown"),
      providersStatus: normalizeString(health.providers?.status, "unknown"),
      policyStatus: normalizeString(health.policy?.status, "unknown"),
      pipelineStatus: normalizeString(pipeline.status, "unknown"),
      aimxsState: normalizeString(aimxsActivation.state, "unknown"),
      enabledProviderCount: enabledProviders.length,
      selectedProviderReady: Boolean(aimxsActivation.selectedProviderReady),
      selectedProviderProbed: Boolean(aimxsActivation.selectedProviderProbed),
      tone: postureTone(
        health.runtime?.status,
        health.providers?.status,
        health.policy?.status,
        pipeline.status,
        aimxsActivation.state
      )
    },
    dependencyReadiness: {
      providerTotalCount: providerCounts.totalCount,
      providerReadyCount: providerCounts.readyCount,
      providerDegradedCount: providerCounts.degradedCount,
      providerUnknownCount: providerCounts.unknownCount,
      secretPresentCount: secretCounts.presentCount,
      secretMissingCount: secretCounts.missingCount,
      enabledReadyCount,
      capabilityCount: Array.isArray(aimxsActivation.capabilities) ? aimxsActivation.capabilities.length : 0,
      warningCount: warnings.length,
      tone: postureTone(
        health.providers?.status,
        aimxsActivation.state,
        secretCounts.missingCount > 0 ? "warn" : "ok",
        warnings.length > 0 ? "warn" : "ok"
      )
    },
    providerRegistration: {
      totalCount: providerCounts.totalCount,
      readyCount: providerCounts.readyCount,
      degradedCount: providerCounts.degradedCount,
      unknownCount: providerCounts.unknownCount,
      probedProviderCount,
      selectedProviderId,
      selectedProviderReady: Boolean(aimxsActivation.selectedProviderReady),
      selectedProviderProbed: Boolean(aimxsActivation.selectedProviderProbed),
      enabledProviderCount: enabledProviders.length,
      enabledReadyCount,
      firstDegradedProviderId,
      tone: postureTone(
        providerCounts.degradedCount > 0 ? "warn" : "ok",
        providerCounts.unknownCount > 0 ? "warn" : "ok",
        providerCounts.totalCount > 0 ? "ready" : "unknown"
      )
    },
    aimxsBridgeReadiness: {
      available: Boolean(aimxsActivation.available),
      state: normalizeString(aimxsActivation.state, "unknown"),
      environment,
      activeMode: normalizeString(aimxsActivation.activeMode, "unknown"),
      selectedProviderId,
      selectedProviderReady: Boolean(aimxsActivation.selectedProviderReady),
      selectedProviderProbed: Boolean(aimxsActivation.selectedProviderProbed),
      enabledProviderCount: enabledProviders.length,
      enabledReadyCount,
      secretPresentCount: secretCounts.presentCount,
      secretMissingCount: secretCounts.missingCount,
      capabilityCount: Array.isArray(aimxsActivation.capabilities) ? aimxsActivation.capabilities.length : 0,
      warningCount: warnings.length,
      firstWarning: normalizeString(warnings[0], "-"),
      tone: postureTone(
        aimxsActivation.state,
        aimxsActivation.selectedProviderReady ? "ready" : "warn",
        secretCounts.missingCount > 0 ? "warn" : "ok",
        warnings.length > 0 ? "warn" : "ok"
      )
    },
    releaseReadiness: {
      environment,
      pipelineStatus: normalizeString(pipeline.status, "unknown"),
      latestStagingGate: normalizeString(pipeline.latestStagingGate, "-"),
      latestProdGate: normalizeString(pipeline.latestProdGate, "-"),
      deploymentHealthyCount,
      deploymentIssueCount,
      providerReadyCount: providerCounts.readyCount,
      providerDegradedCount: providerCounts.degradedCount,
      secretMissingCount: secretCounts.missingCount,
      warningCount: warnings.length,
      selectedProviderReady: Boolean(aimxsActivation.selectedProviderReady),
      tone: postureTone(
        pipeline.status,
        deploymentIssueCount > 0 ? "warn" : "ok",
        providerCounts.degradedCount > 0 ? "warn" : "ok",
        secretCounts.missingCount > 0 ? "warn" : "ok",
        warnings.length > 0 ? "warn" : "ok"
      )
    },
    supportPosture: {
      environment,
      activeMode: normalizeString(aimxsActivation.activeMode, "unknown"),
      selectedProviderId,
      selectedProviderReady: Boolean(aimxsActivation.selectedProviderReady),
      supportSignalCount,
      warningCount: warnings.length,
      firstWarning: normalizeString(warnings[0], "-"),
      degradedProviderCount: providerCounts.degradedCount,
      unknownProviderCount: providerCounts.unknownCount,
      secretMissingCount: secretCounts.missingCount,
      runtimeDetail: normalizeString(health.runtime?.detail, "-"),
      providersDetail: normalizeString(health.providers?.detail, "-"),
      policyDetail: normalizeString(health.policy?.detail, "-"),
      tone: postureTone(
        supportSignalCount > 0 ? "warn" : "ok",
        health.runtime?.status,
        health.providers?.status,
        health.policy?.status
      )
    }
  };
}
