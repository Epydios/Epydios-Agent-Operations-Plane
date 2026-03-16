import { resolveAimxsContractProfile } from "../../aimxs/state.js";

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function pickLatestItem(items = []) {
  const values = Array.isArray(items) ? items : [];
  let best = null;
  let bestTs = 0;
  for (const item of values) {
    const candidate = item && typeof item === "object" ? item : {};
    const ts = Math.max(
      Date.parse(candidate.updatedAt || "") || 0,
      Date.parse(candidate.createdAt || "") || 0
    );
    if (!best || ts > bestTs) {
      best = candidate;
      bestTs = ts;
    }
  }
  return best || {};
}

function uniqueValues(items = [], selector) {
  const values = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const selected = normalizeString(selector(item));
    if (selected) {
      values.add(selected);
    }
  }
  return [...values];
}

function uniqueFlatValues(items = []) {
  const values = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const text = normalizeString(item);
    if (text) {
      values.add(text);
    }
  }
  return [...values];
}

function classifyEndpointState(value) {
  const state = normalizeString(value, "unknown").toLowerCase();
  if (["ok", "pass", "ready", "healthy", "reachable", "active"].includes(state)) {
    return "ok";
  }
  if (["warn", "warning", "pending", "unknown", "degraded", "expiring", "constrained"].includes(state)) {
    return "warn";
  }
  return "error";
}

function postureTone(...statuses) {
  const values = statuses.map((value) => normalizeString(value).toLowerCase()).filter(Boolean);
  if (values.some((value) => ["error", "failed", "blocked", "invalid", "missing"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["warn", "warning", "unknown", "degraded", "expiring", "constrained"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["ok", "ready", "active", "healthy", "reachable", "valid", "passed"].includes(value))) {
    return "ok";
  }
  return "neutral";
}

function countProviderReadiness(items = []) {
  const values = Array.isArray(items) ? items : [];
  const readyCount = values.filter((item) => item?.ready === true).length;
  const degradedCount = values.filter((item) => item?.probed === true && item?.ready !== true).length;
  return {
    readyCount,
    degradedCount,
    totalCount: values.length
  };
}

function countEndpointStates(endpoints = []) {
  return (Array.isArray(endpoints) ? endpoints : []).reduce(
    (acc, endpoint) => {
      const state = classifyEndpointState(endpoint?.state);
      acc[`${state}Count`] += 1;
      return acc;
    },
    {
      okCount: 0,
      warnCount: 0,
      errorCount: 0,
      unknownCount: 0
    }
  );
}

function countConfigured(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => normalizeString(item, "-") !== "-").length;
}

function buildBoundaryBoard(settings, health, providers, runs, runtimeWorkerCapabilities) {
  const integrations = settings?.integrations && typeof settings.integrations === "object" ? settings.integrations : {};
  const aimxs = settings?.aimxs && typeof settings.aimxs === "object" ? settings.aimxs : {};
  const activation = aimxs?.activation && typeof aimxs.activation === "object" ? aimxs.activation : {};
  const workerItems = Array.isArray(runtimeWorkerCapabilities?.items) ? runtimeWorkerCapabilities.items : [];
  const runItems = Array.isArray(runs?.items) ? runs.items : [];
  const latestRun = pickLatestItem(runItems);
  const boundaryRequirements = uniqueFlatValues(
    workerItems.flatMap((item) => (Array.isArray(item?.boundaryRequirements) ? item.boundaryRequirements : []))
  );
  const transports = uniqueValues(
    [
      ...workerItems,
      ...(Array.isArray(integrations.providerContracts) ? integrations.providerContracts : [])
    ],
    (item) => item?.transport || ""
  );
  const routeIds = uniqueFlatValues([
    ...runItems.flatMap((item) => [
      item?.selectedProfileProvider,
      item?.selectedPolicyProvider,
      item?.selectedEvidenceProvider,
      item?.selectedDesktopProvider
    ]),
    activation.selectedProviderId,
    integrations.gatewayProviderId
  ]);
  const providerStats = countProviderReadiness(providers?.items || []);
  const contractProfile = resolveAimxsContractProfile(aimxs);

  return {
    environment: normalizeString(settings?.environment, "unknown"),
    activeMode: normalizeString(activation.activeMode || aimxs.mode, "unknown"),
    activationState: normalizeString(activation.state, "unknown"),
    selectedProviderId: normalizeString(activation.selectedProviderId || contractProfile.providerId, "-"),
    authMode: normalizeString(contractProfile.authMode, "-"),
    modelRouting: normalizeString(integrations.modelRouting, "-"),
    gatewayProviderId: normalizeString(integrations.gatewayProviderId, "-"),
    allowDirectProviderFallback: Boolean(integrations.allowDirectProviderFallback),
    routeCount: routeIds.length,
    boundaryRequirementCount: boundaryRequirements.length,
    firstBoundaryRequirement: normalizeString(boundaryRequirements[0], "-"),
    transportCount: transports.length,
    firstTransport: normalizeString(transports[0], "-"),
    providerContractCount: Array.isArray(integrations.providerContracts) ? integrations.providerContracts.length : 0,
    readyProviderCount: providerStats.readyCount,
    degradedProviderCount: providerStats.degradedCount,
    latestPolicyRoute: normalizeString(latestRun?.selectedPolicyProvider, "-"),
    latestDesktopRoute: normalizeString(latestRun?.selectedDesktopProvider, "-"),
    providersDetail: normalizeString(health?.providers?.detail, "-"),
    tone: postureTone(
      health?.providers?.status,
      activation.state,
      providerStats.degradedCount > 0 ? "warn" : "ok"
    )
  };
}

function buildEndpointBoard(settings, providers) {
  const endpoints = Array.isArray(settings?.endpoints) ? settings.endpoints : [];
  const integrations = settings?.integrations && typeof settings.integrations === "object" ? settings.integrations : {};
  const providerContracts = Array.isArray(integrations.providerContracts) ? integrations.providerContracts : [];
  const selectedContract =
    providerContracts.find((item) => item?.selected) ||
    providerContracts.find((item) => normalizeString(item?.profileId) === normalizeString(integrations.selectedAgentProfileId)) ||
    providerContracts[0] ||
    {};
  const aimxs = settings?.aimxs && typeof settings.aimxs === "object" ? settings.aimxs : {};
  const endpointCounts = countEndpointStates(endpoints);
  const providerStats = countProviderReadiness(providers?.items || []);

  return {
    totalCount: endpoints.length,
    okCount: endpointCounts.okCount,
    warnCount: endpointCounts.warnCount,
    errorCount: endpointCounts.errorCount,
    unknownCount: Math.max(0, endpoints.length - endpointCounts.okCount - endpointCounts.warnCount - endpointCounts.errorCount),
    runtimeApiBaseUrl: normalizeString(settings?.runtimeApiBaseUrl, "-"),
    registryApiBaseUrl: normalizeString(settings?.registryApiBaseUrl, "-"),
    selectedAgentProfileId: normalizeString(integrations.selectedAgentProfileId, "-"),
    selectedProfileEndpointRef: normalizeString(selectedContract.endpointRef, "-"),
    selectedProfileTransport: normalizeString(selectedContract.transport, "-"),
    aimxsEndpointRef: normalizeString(aimxs.endpointRef, "-"),
    contractEndpointCount: providerContracts.filter((item) => normalizeString(item?.endpointRef, "-") !== "-").length,
    endpointSample: endpoints.slice(0, 5).map((item) => ({
      label: normalizeString(item?.label || item?.id, "endpoint"),
      state: classifyEndpointState(item?.state),
      path: normalizeString(item?.path, "-")
    })),
    tone: postureTone(
      endpointCounts.errorCount > 0 ? "error" : "ok",
      endpointCounts.warnCount > 0 ? "warn" : "ok",
      providerStats.degradedCount > 0 ? "warn" : "ok"
    )
  };
}

function buildTrustBoard(settings, health) {
  const integrations = settings?.integrations && typeof settings.integrations === "object" ? settings.integrations : {};
  const aimxs = settings?.aimxs && typeof settings.aimxs === "object" ? settings.aimxs : {};
  const activation = aimxs?.activation && typeof aimxs.activation === "object" ? aimxs.activation : {};
  const contractProfile = resolveAimxsContractProfile(aimxs);
  const warnings = Array.isArray(activation.warnings) ? activation.warnings : [];
  const secureRefs =
    normalizeString(aimxs.mode).toLowerCase() === "aimxs-https"
      ? [aimxs.endpointRef, aimxs.bearerTokenRef, aimxs.clientTlsCertRef, aimxs.clientTlsKeyRef, aimxs.caCertRef]
      : [];
  const gatewayRefs = [integrations.gatewayTokenRef, integrations.gatewayMtlsCertRef, integrations.gatewayMtlsKeyRef];
  const secretEntries = Object.values(activation.secrets && typeof activation.secrets === "object" ? activation.secrets : {});
  const secureSecretPresentCount = secretEntries.filter((entry) => Boolean(entry?.present)).length;
  const secureSecretMissingCount = Math.max(0, secretEntries.length - secureSecretPresentCount);
  const secureRefConfiguredCount = countConfigured(secureRefs);
  const gatewayRefConfiguredCount = countConfigured(gatewayRefs);
  const secureMode = normalizeString(activation.activeMode || aimxs.mode).toLowerCase() === "aimxs-https";
  const trustWarning = secureMode && (secureRefConfiguredCount < secureRefs.length || secureSecretMissingCount > 0);

  return {
    activeMode: normalizeString(activation.activeMode || aimxs.mode, "unknown"),
    activationState: normalizeString(activation.state, "unknown"),
    authMode: normalizeString(contractProfile.authMode, "-"),
    selectedProviderId: normalizeString(activation.selectedProviderId || contractProfile.providerId, "-"),
    secureRefCount: secureRefs.length,
    secureRefConfiguredCount,
    gatewayRefConfiguredCount,
    secureSecretPresentCount,
    secureSecretMissingCount,
    aimxsEndpointRef: normalizeString(aimxs.endpointRef, "-"),
    bearerTokenRef: normalizeString(aimxs.bearerTokenRef, "-"),
    clientTlsCertRef: normalizeString(aimxs.clientTlsCertRef, "-"),
    clientTlsKeyRef: normalizeString(aimxs.clientTlsKeyRef, "-"),
    caCertRef: normalizeString(aimxs.caCertRef, "-"),
    gatewayMtlsCertRef: normalizeString(integrations.gatewayMtlsCertRef, "-"),
    gatewayMtlsKeyRef: normalizeString(integrations.gatewayMtlsKeyRef, "-"),
    warningCount: warnings.length,
    firstWarning: normalizeString(warnings[0], "-"),
    summary: normalizeString(contractProfile.summary, "-"),
    tone: postureTone(
      health?.providers?.status,
      activation.state,
      trustWarning ? "warn" : "ok",
      warnings.length > 0 ? "warn" : "ok"
    )
  };
}

function buildIngressEgressBoard(settings, health, runs, runtimeWorkerCapabilities) {
  const integrations = settings?.integrations && typeof settings.integrations === "object" ? settings.integrations : {};
  const aimxs = settings?.aimxs && typeof settings.aimxs === "object" ? settings.aimxs : {};
  const activation = aimxs?.activation && typeof aimxs.activation === "object" ? aimxs.activation : {};
  const runItems = Array.isArray(runs?.items) ? runs.items : [];
  const workerItems = Array.isArray(runtimeWorkerCapabilities?.items) ? runtimeWorkerCapabilities.items : [];
  const latestRun = pickLatestItem(runItems);
  const allBoundaryRequirements = uniqueFlatValues(
    workerItems.flatMap((item) => (Array.isArray(item?.boundaryRequirements) ? item.boundaryRequirements : []))
  );
  const ingressRequirements = allBoundaryRequirements.filter(
    (value) =>
      value.includes("scope") ||
      value.includes("auth") ||
      value.includes("ingress") ||
      value.includes("gateway")
  );
  const egressRequirements = allBoundaryRequirements.filter(
    (value) =>
      value.includes("export") ||
      value.includes("tool") ||
      value.includes("audit") ||
      value.includes("egress")
  );
  const transports = uniqueValues(
    [
      ...workerItems,
      ...(Array.isArray(integrations.providerContracts) ? integrations.providerContracts : [])
    ],
    (item) => item?.transport || ""
  );
  const directFallbackState = integrations.allowDirectProviderFallback ? "available" : "bounded";
  const selectedProfileTransport = normalizeString(
    (Array.isArray(integrations.providerContracts) ? integrations.providerContracts : []).find((item) => item?.selected)?.transport,
    "-"
  );
  const secureMode = normalizeString(activation.activeMode || aimxs.mode).toLowerCase() === "aimxs-https";
  const warningCount = Array.isArray(activation.warnings) ? activation.warnings.length : 0;

  return {
    ingressRequirementCount: ingressRequirements.length,
    egressRequirementCount: egressRequirements.length,
    firstIngressRequirement: normalizeString(ingressRequirements[0], "-"),
    firstEgressRequirement: normalizeString(egressRequirements[0], "-"),
    allRequirementCount: allBoundaryRequirements.length,
    selectedProfileTransport,
    transportCount: transports.length,
    firstTransport: normalizeString(transports[0], "-"),
    directFallbackState,
    authMode: normalizeString(resolveAimxsContractProfile(aimxs).authMode, "-"),
    secureMode: secureMode ? "secure" : "local_or_baseline",
    latestPolicyRoute: normalizeString(latestRun?.selectedPolicyProvider, "-"),
    latestEvidenceRoute: normalizeString(latestRun?.selectedEvidenceProvider, "-"),
    latestDesktopRoute: normalizeString(latestRun?.selectedDesktopProvider, "-"),
    warningCount,
    providersDetail: normalizeString(health?.providers?.detail, "-"),
    tone: postureTone(
      health?.providers?.status,
      warningCount > 0 ? "warn" : "ok",
      directFallbackState === "available" ? "warn" : "ok"
    )
  };
}

function buildTopologyBoard(settings, providers, runs, runtimeWorkerCapabilities) {
  const integrations = settings?.integrations && typeof settings.integrations === "object" ? settings.integrations : {};
  const endpoints = Array.isArray(settings?.endpoints) ? settings.endpoints : [];
  const providerItems = Array.isArray(providers?.items) ? providers.items : [];
  const runItems = Array.isArray(runs?.items) ? runs.items : [];
  const workerItems = Array.isArray(runtimeWorkerCapabilities?.items) ? runtimeWorkerCapabilities.items : [];
  const routeIds = uniqueFlatValues(
    runItems.flatMap((item) => [
      item?.selectedProfileProvider,
      item?.selectedPolicyProvider,
      item?.selectedEvidenceProvider,
      item?.selectedDesktopProvider
    ])
  );
  const transports = uniqueValues(
    [
      ...workerItems,
      ...(Array.isArray(integrations.providerContracts) ? integrations.providerContracts : [])
    ],
    (item) => item?.transport || ""
  );
  const providerContracts = Array.isArray(integrations.providerContracts) ? integrations.providerContracts : [];
  const topologyPaths = [
    {
      label: "Gateway path",
      route: normalizeString(integrations.gatewayProviderId, "-"),
      endpoint: normalizeString(providerContracts.find((item) => item?.selected)?.endpointRef, "-"),
      transport: normalizeString(providerContracts.find((item) => item?.selected)?.transport, "-")
    },
    {
      label: "Policy path",
      route: normalizeString(pickLatestItem(runItems)?.selectedPolicyProvider, "-"),
      endpoint: normalizeString(settings?.aimxs?.endpointRef, "-"),
      transport: normalizeString(providerContracts.find((item) => item?.selected)?.transport, "-")
    },
    {
      label: "Desktop path",
      route: normalizeString(pickLatestItem(runItems)?.selectedDesktopProvider, "-"),
      endpoint: normalizeString(settings?.runtimeApiBaseUrl, "-"),
      transport: normalizeString(workerItems[0]?.transport, "-")
    }
  ];
  const providerStats = countProviderReadiness(providerItems);

  return {
    endpointCount: endpoints.length,
    providerCount: providerItems.length,
    routeCount: routeIds.length,
    transportCount: transports.length,
    contractCount: providerContracts.length,
    reachableEndpointCount: endpoints.filter((item) => classifyEndpointState(item?.state) === "ok").length,
    degradedProviderCount: providerStats.degradedCount,
    readyProviderCount: providerStats.readyCount,
    topologyPaths,
    tone: postureTone(
      providerStats.degradedCount > 0 ? "warn" : "ok",
      endpoints.some((item) => classifyEndpointState(item?.state) === "error") ? "error" : "ok"
    )
  };
}

export function createNetworkWorkspaceSnapshot(context = {}) {
  const settings = context?.settings && typeof context.settings === "object" ? context.settings : {};
  const health = context?.health && typeof context.health === "object" ? context.health : {};
  return {
    networkBoundary: buildBoundaryBoard(
      settings,
      health,
      context.providers || {},
      context.runs || {},
      context.runtimeWorkerCapabilities || {}
    ),
    endpointReachability: buildEndpointBoard(settings, context.providers || {}),
    trustAndCertificate: buildTrustBoard(settings, health),
    ingressEgressPosture: buildIngressEgressBoard(
      settings,
      health,
      context.runs || {},
      context.runtimeWorkerCapabilities || {}
    ),
    connectivityTopology: buildTopologyBoard(
      settings,
      context.providers || {},
      context.runs || {},
      context.runtimeWorkerCapabilities || {}
    )
  };
}
