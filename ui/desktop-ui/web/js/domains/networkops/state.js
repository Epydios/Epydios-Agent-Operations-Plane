import { isAimxsPremiumVisible, resolveAimxsContractProfile } from "../../aimxs/state.js";
import {
  createAimxsRouteBoundaryField,
  createAimxsRouteBoundaryModel
} from "../../shared/aimxs/route-boundary.js";

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
    normalizeString(aimxs.mode).toLowerCase() === "provider-https"
      ? [aimxs.endpointRef, aimxs.bearerTokenRef, aimxs.clientTlsCertRef, aimxs.clientTlsKeyRef, aimxs.caCertRef]
      : [];
  const gatewayRefs = [integrations.gatewayTokenRef, integrations.gatewayMtlsCertRef, integrations.gatewayMtlsKeyRef];
  const secretEntries = Object.values(activation.secrets && typeof activation.secrets === "object" ? activation.secrets : {});
  const secureSecretPresentCount = secretEntries.filter((entry) => Boolean(entry?.present)).length;
  const secureSecretMissingCount = Math.max(0, secretEntries.length - secureSecretPresentCount);
  const secureRefConfiguredCount = countConfigured(secureRefs);
  const gatewayRefConfiguredCount = countConfigured(gatewayRefs);
  const secureMode = normalizeString(activation.activeMode || aimxs.mode).toLowerCase() === "provider-https";
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
  const secureMode = normalizeString(activation.activeMode || aimxs.mode).toLowerCase() === "provider-https";
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

function normalizeNetworkAdminFeedback(feedback = null) {
  if (!feedback || typeof feedback !== "object") {
    return null;
  }
  const message = normalizeString(feedback.message);
  if (!message) {
    return null;
  }
  return {
    tone: normalizeString(feedback.tone, "info").toLowerCase(),
    message
  };
}

function normalizeNetworkAdminDraft(draft = null, defaults = {}) {
  const input = draft && typeof draft === "object" ? draft : {};
  return {
    changeKind: "probe",
    boundaryPathId: normalizeString(input.boundaryPathId || defaults.boundaryPathId),
    targetScope: normalizeString(input.targetScope || defaults.targetScope, "workspace"),
    targetEndpointId: normalizeString(input.targetEndpointId || defaults.targetEndpointId),
    reason: normalizeString(input.reason)
  };
}

function normalizeNetworkAdminQueueItems(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => {
      const entry = item && typeof item === "object" ? item : {};
      const id = normalizeString(entry.id);
      if (!id) {
        return null;
      }
      return {
        id,
        ownerDomain: normalizeString(entry.ownerDomain || entry.domain, "networkops").toLowerCase(),
        kind: normalizeString(entry.kind, "network").toLowerCase(),
        label: normalizeString(entry.label, "Probe Request Draft"),
        requestedAction: normalizeString(entry.requestedAction, "probe_request"),
        subjectId: normalizeString(entry.subjectId || entry.boundaryPathId, "-"),
        subjectLabel: normalizeString(entry.subjectLabel, "boundary").toLowerCase(),
        targetScope: normalizeString(entry.targetScope, "-"),
        targetLabel: normalizeString(entry.targetLabel, "scope").toLowerCase(),
        changeKind: normalizeString(entry.changeKind, "probe").toLowerCase(),
        boundaryPathId: normalizeString(entry.boundaryPathId),
        boundaryPathLabel: normalizeString(entry.boundaryPathLabel),
        targetEndpointId: normalizeString(entry.targetEndpointId),
        targetEndpointLabel: normalizeString(entry.targetEndpointLabel),
        status: normalizeString(entry.status, "draft").toLowerCase(),
        reason: normalizeString(entry.reason),
        summary: normalizeString(entry.summary),
        simulationSummary: normalizeString(entry.simulationSummary),
        createdAt: normalizeString(entry.createdAt),
        simulatedAt: normalizeString(entry.simulatedAt),
        updatedAt: normalizeString(entry.updatedAt),
        routedAt: normalizeString(entry.routedAt),
        decision: entry.decision && typeof entry.decision === "object" ? entry.decision : null,
        execution: entry.execution && typeof entry.execution === "object" ? entry.execution : null,
        receipt: entry.receipt && typeof entry.receipt === "object" ? entry.receipt : null,
        rollback: entry.rollback && typeof entry.rollback === "object" ? entry.rollback : null
      };
    })
    .filter(Boolean);
}

function normalizeNetworkAdminSimulation(simulation = null) {
  if (!simulation || typeof simulation !== "object") {
    return null;
  }
  const title = normalizeString(simulation.title);
  const summary = normalizeString(simulation.summary);
  const facts = Array.isArray(simulation.facts)
    ? simulation.facts
        .map((fact) => {
          const item = fact && typeof fact === "object" ? fact : {};
          const label = normalizeString(item.label);
          const value = normalizeString(item.value);
          if (!label || !value) {
            return null;
          }
          return {
            label,
            value,
            code: Boolean(item.code)
          };
        })
        .filter(Boolean)
    : [];
  const findings = Array.isArray(simulation.findings)
    ? simulation.findings.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
  if (!title && !summary && facts.length === 0 && findings.length === 0) {
    return null;
  }
  return {
    changeId: normalizeString(simulation.changeId),
    kind: normalizeString(simulation.kind, "network").toLowerCase(),
    tone: normalizeString(simulation.tone, "info").toLowerCase(),
    title: title || "Network admin dry-run",
    summary,
    updatedAt: normalizeString(simulation.updatedAt),
    facts,
    findings
  };
}

function slugifyBoundaryPath(value = "") {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized.includes("gateway")) {
    return "gateway_path";
  }
  if (normalized.includes("policy")) {
    return "policy_path";
  }
  if (normalized.includes("desktop")) {
    return "desktop_path";
  }
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function createNetworkWorkspaceSnapshot(context = {}) {
  const settings = context?.settings && typeof context.settings === "object" ? context.settings : {};
  const health = context?.health && typeof context.health === "object" ? context.health : {};
  const viewState = context?.viewState && typeof context.viewState === "object" ? context.viewState : {};
  const networkBoundary = buildBoundaryBoard(
    settings,
    health,
    context.providers || {},
    context.runs || {},
    context.runtimeWorkerCapabilities || {}
  );
  const endpointReachability = buildEndpointBoard(settings, context.providers || {});
  const trustAndCertificate = buildTrustBoard(settings, health);
  const ingressEgressPosture = buildIngressEgressBoard(
    settings,
    health,
    context.runs || {},
    context.runtimeWorkerCapabilities || {}
  );
  const connectivityTopology = buildTopologyBoard(
    settings,
    context.providers || {},
    context.runs || {},
    context.runtimeWorkerCapabilities || {}
  );
  const boundaryPathOptions = connectivityTopology.topologyPaths.map((item) => ({
    value: slugifyBoundaryPath(item?.label),
    label: normalizeString(item?.label, "boundary path"),
    route: normalizeString(item?.route, "-"),
    endpoint: normalizeString(item?.endpoint, "-"),
    transport: normalizeString(item?.transport, "-")
  }));
  const endpointOptions = (Array.isArray(settings?.endpoints) ? settings.endpoints : []).map((item) => ({
    value: normalizeString(item?.id || item?.label),
    label: normalizeString(item?.label || item?.id, "endpoint"),
    state: classifyEndpointState(item?.state),
    path: normalizeString(item?.path, "-")
  }));
  const adminDefaults = {
    boundaryPathId: boundaryPathOptions[0]?.value || "gateway_path",
    targetScope:
      normalizeString(settings?.environment, "workspace") +
      " / " +
      normalizeString(
        networkBoundary.selectedProviderId !== "-" ? networkBoundary.selectedProviderId : networkBoundary.gatewayProviderId,
        "network-scope"
      ),
    targetEndpointId: endpointOptions[0]?.value || ""
  };
  const adminQueueItems = normalizeNetworkAdminQueueItems(viewState.queueItems);
  const selectedAdminChangeId = normalizeString(viewState.selectedAdminChangeId);
  const selectedAdminQueueItem =
    adminQueueItems.find((item) => item.id === selectedAdminChangeId) || adminQueueItems[0] || null;
  const currentBoundaryPathOption = boundaryPathOptions[0] || null;
  const snapshot = {
    aimxsPremiumVisible: isAimxsPremiumVisible(settings),
    networkBoundary,
    endpointReachability,
    trustAndCertificate,
    ingressEgressPosture,
    connectivityTopology,
    admin: {
      feedback: normalizeNetworkAdminFeedback(viewState.feedback || null),
      selectedChangeId: selectedAdminQueueItem ? selectedAdminQueueItem.id : selectedAdminChangeId,
      recoveryReason: normalizeString(viewState.recoveryReason),
      selectedQueueItem: selectedAdminQueueItem,
      queueItems: adminQueueItems,
      draft: normalizeNetworkAdminDraft(viewState.adminDraft || {}, adminDefaults),
      latestSimulation: normalizeNetworkAdminSimulation(viewState.latestSimulation || null),
      currentScope: {
        currentBoundaryPath: currentBoundaryPathOption?.value || "-",
        currentBoundaryLabel: currentBoundaryPathOption?.label || "-",
        currentBoundaryRoute: currentBoundaryPathOption?.route || "-",
        currentBoundaryEndpoint: currentBoundaryPathOption?.endpoint || "-",
        defaultTargetScope: adminDefaults.targetScope,
        boundaryPathOptions,
        endpointOptions,
        selectedProviderId: networkBoundary.selectedProviderId,
        environment: networkBoundary.environment,
        firstBoundaryRequirement: networkBoundary.firstBoundaryRequirement,
        firstTransport: ingressEgressPosture.firstTransport,
        transportCount: connectivityTopology.transportCount,
        endpointCount: endpointReachability.totalCount,
        okCount: endpointReachability.okCount,
        warnCount: endpointReachability.warnCount,
        errorCount: endpointReachability.errorCount,
        reachableEndpointCount: connectivityTopology.reachableEndpointCount,
        readyProviderCount: connectivityTopology.readyProviderCount,
        degradedProviderCount: connectivityTopology.degradedProviderCount,
        directFallbackState: ingressEgressPosture.directFallbackState,
        secureMode: trustAndCertificate.activeMode,
        trustWarningCount: trustAndCertificate.warningCount,
        secureSecretMissingCount: trustAndCertificate.secureSecretMissingCount,
        latestPolicyRoute: ingressEgressPosture.latestPolicyRoute,
        latestDesktopRoute: ingressEgressPosture.latestDesktopRoute
      }
    }
  };
  snapshot.aimxsRouteBoundary = buildNetworkAimxsRouteBoundary(snapshot);
  return snapshot;
}

function buildNetworkAimxsRouteBoundary(snapshot = {}) {
  const boundary = snapshot?.networkBoundary || {};
  const reachability = snapshot?.endpointReachability || {};
  const trust = snapshot?.trustAndCertificate || {};
  const posture = snapshot?.ingressEgressPosture || {};
  const topology = snapshot?.connectivityTopology || {};
  const scope = snapshot?.admin?.currentScope || {};
  const constrained =
    Number(scope?.errorCount || 0) > 0 ||
    Number(scope?.degradedProviderCount || 0) > 0 ||
    Number(scope?.trustWarningCount || 0) > 0 ||
    Number(scope?.secureSecretMissingCount || 0) > 0;

  return createAimxsRouteBoundaryModel({
    summary:
      snapshot?.aimxsPremiumVisible
        ? "This primary routed view correlates the active network route chain, trust boundary, and bounded probe surface. Later bounded network control remains closed."
        : "This primary provider-route view correlates the active network route chain, trust boundary, and bounded probe surface. Later bounded network control remains closed.",
    surfaceLabel: "primary network surface",
    routeFields: [
      createAimxsRouteBoundaryField("environment", boundary?.environment, true),
      createAimxsRouteBoundaryField("mode", trust?.activeMode, true),
      createAimxsRouteBoundaryField(
        "provider",
        boundary?.selectedProviderId !== "-" ? boundary?.selectedProviderId : boundary?.gatewayProviderId,
        true
      ),
      createAimxsRouteBoundaryField("gateway", boundary?.gatewayProviderId, true),
      createAimxsRouteBoundaryField("auth mode", trust?.authMode, true),
      createAimxsRouteBoundaryField("transport", posture?.firstTransport, true),
      createAimxsRouteBoundaryField("endpoint ref", reachability?.selectedProfileEndpointRef, true),
      createAimxsRouteBoundaryField("policy route", posture?.latestPolicyRoute, true)
    ].filter(Boolean),
    currentBoundary: {
      title: "Current Boundary",
      badge: constrained ? "watch" : "current",
      tone: constrained ? "warn" : "ok",
      note: "Current boundary is derived from the loaded bounded path, selected endpoint, and the present provider and trust inputs.",
      fields: [
        createAimxsRouteBoundaryField("path", scope?.currentBoundaryPath, true),
        createAimxsRouteBoundaryField("label", scope?.currentBoundaryLabel),
        createAimxsRouteBoundaryField("route", scope?.currentBoundaryRoute, true),
        createAimxsRouteBoundaryField("endpoint", scope?.currentBoundaryEndpoint, true),
        createAimxsRouteBoundaryField("target scope", scope?.defaultTargetScope, true),
        createAimxsRouteBoundaryField("boundary req", scope?.firstBoundaryRequirement, true)
      ].filter(Boolean)
    },
    routePosture: {
      title: "Route Posture",
      badge: constrained ? "constrained" : "bounded",
      tone: constrained ? "warn" : "ok",
      note: "Network route posture is still bounded to probe-first visibility. No later bounded network control is opened by this slice.",
      fields: [
        createAimxsRouteBoundaryField("reachable endpoints", String(topology?.reachableEndpointCount || 0)),
        createAimxsRouteBoundaryField("warn endpoints", String(reachability?.warnCount || 0)),
        createAimxsRouteBoundaryField("error endpoints", String(reachability?.errorCount || 0)),
        createAimxsRouteBoundaryField("ready providers", String(topology?.readyProviderCount || 0)),
        createAimxsRouteBoundaryField("degraded providers", String(topology?.degradedProviderCount || 0)),
        createAimxsRouteBoundaryField("fallback", scope?.directFallbackState),
        createAimxsRouteBoundaryField("trust mode", scope?.secureMode, true),
        createAimxsRouteBoundaryField("trust warnings", String(scope?.trustWarningCount || 0))
      ].filter(Boolean)
    },
    rationale: {
      title: "Allowed Or Constrained",
      badge: constrained ? "constrained" : "bounded",
      tone: constrained ? "warn" : "ok",
      note:
        "Later bounded network control remains closed. This slice only makes the active route, trust, and boundary chain legible for operator review.",
      fields: [
        createAimxsRouteBoundaryField("provider detail", boundary?.providersDetail),
        createAimxsRouteBoundaryField("secure secrets missing", String(trust?.secureSecretMissingCount || 0)),
        createAimxsRouteBoundaryField("first transport", posture?.firstTransport, true),
        createAimxsRouteBoundaryField("policy route", posture?.latestPolicyRoute, true),
        createAimxsRouteBoundaryField("desktop route", posture?.latestDesktopRoute, true),
        createAimxsRouteBoundaryField("boundary count", String(boundary?.boundaryRequirementCount || 0))
      ].filter(Boolean)
    }
  });
}
