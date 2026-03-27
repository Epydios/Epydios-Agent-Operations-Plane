import {
  createAimxsRouteBoundaryField,
  createAimxsRouteBoundaryModel
} from "../../shared/aimxs/route-boundary.js";
import { isAimxsPremiumVisible } from "../../aimxs/state.js";

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

function normalizePlatformAdminFeedback(feedback = null) {
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

function normalizePlatformDraft(draft = {}, defaults = {}) {
  const input = draft && typeof draft === "object" ? draft : {};
  const changeKind = normalizeString(input.changeKind || defaults.changeKind || "promote", "promote").toLowerCase();
  return {
    changeKind: changeKind === "rollback" ? "rollback" : "promote",
    environment: normalizeString(input.environment || defaults.environment, "local"),
    deploymentTarget: normalizeString(input.deploymentTarget || defaults.deploymentTarget, "desktop-local"),
    releaseRef: normalizeString(input.releaseRef || defaults.releaseRef),
    reason: normalizeString(input.reason)
  };
}

function normalizePlatformAdminDecision(decision = null) {
  if (!decision || typeof decision !== "object") {
    return null;
  }
  const decisionId = normalizeString(decision.decisionId);
  const status = normalizeString(decision.status).toLowerCase();
  const decidedAt = normalizeString(decision.decidedAt);
  const reason = normalizeString(decision.reason);
  const approvalReceiptId = normalizeString(decision.approvalReceiptId);
  if (!decisionId && !status && !decidedAt && !reason && !approvalReceiptId) {
    return null;
  }
  return {
    decisionId,
    status,
    decidedAt,
    reason,
    approvalReceiptId,
    actorRef: normalizeString(decision.actorRef)
  };
}

function normalizePlatformAdminExecution(execution = null) {
  if (!execution || typeof execution !== "object") {
    return null;
  }
  const executionId = normalizeString(execution.executionId);
  const executedAt = normalizeString(execution.executedAt);
  const status = normalizeString(execution.status).toLowerCase();
  const summary = normalizeString(execution.summary);
  if (!executionId && !executedAt && !status && !summary) {
    return null;
  }
  return {
    executionId,
    executedAt,
    status,
    summary,
    actorRef: normalizeString(execution.actorRef)
  };
}

function normalizePlatformAdminReceipt(receipt = null) {
  if (!receipt || typeof receipt !== "object") {
    return null;
  }
  const receiptId = normalizeString(receipt.receiptId);
  const issuedAt = normalizeString(receipt.issuedAt);
  const summary = normalizeString(receipt.summary);
  const stableRef = normalizeString(receipt.stableRef);
  if (!receiptId && !issuedAt && !summary && !stableRef) {
    return null;
  }
  return {
    receiptId,
    issuedAt,
    summary,
    stableRef,
    approvalReceiptId: normalizeString(receipt.approvalReceiptId),
    executionId: normalizeString(receipt.executionId)
  };
}

function normalizePlatformAdminRollback(rollback = null) {
  if (!rollback || typeof rollback !== "object") {
    return null;
  }
  const rollbackId = normalizeString(rollback.rollbackId);
  const action = normalizeString(rollback.action).toLowerCase();
  const status = normalizeString(rollback.status).toLowerCase();
  const rolledBackAt = normalizeString(rollback.rolledBackAt);
  const summary = normalizeString(rollback.summary);
  const stableRef = normalizeString(rollback.stableRef);
  if (!rollbackId && !action && !status && !rolledBackAt && !summary && !stableRef) {
    return null;
  }
  return {
    rollbackId,
    action,
    status,
    rolledBackAt,
    summary,
    stableRef,
    reason: normalizeString(rollback.reason),
    actorRef: normalizeString(rollback.actorRef),
    approvalReceiptId: normalizeString(rollback.approvalReceiptId),
    adminReceiptId: normalizeString(rollback.adminReceiptId),
    executionId: normalizeString(rollback.executionId)
  };
}

function normalizePlatformAdminQueueItems(items = []) {
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
        ownerDomain: normalizeString(entry.ownerDomain || entry.domain, "platformops").toLowerCase(),
        kind: normalizeString(entry.kind, "platform").toLowerCase(),
        label: normalizeString(entry.label, "Promotion Draft"),
        requestedAction: normalizeString(entry.requestedAction, "proposal"),
        subjectId: normalizeString(entry.subjectId || entry.releaseRef),
        subjectLabel: normalizeString(entry.subjectLabel, "release"),
        targetScope: normalizeString(entry.targetScope),
        targetLabel: normalizeString(entry.targetLabel, "target"),
        environment: normalizeString(entry.environment),
        deploymentTarget: normalizeString(entry.deploymentTarget),
        releaseRef: normalizeString(entry.releaseRef),
        status: normalizeString(entry.status, "draft").toLowerCase(),
        reason: normalizeString(entry.reason),
        summary: normalizeString(entry.summary),
        simulationSummary: normalizeString(entry.simulationSummary),
        createdAt: normalizeString(entry.createdAt),
        simulatedAt: normalizeString(entry.simulatedAt),
        updatedAt: normalizeString(entry.updatedAt),
        routedAt: normalizeString(entry.routedAt),
        decision: normalizePlatformAdminDecision(entry.decision || null),
        execution: normalizePlatformAdminExecution(entry.execution || null),
        receipt: normalizePlatformAdminReceipt(entry.receipt || null),
        rollback: normalizePlatformAdminRollback(entry.rollback || null)
      };
    })
    .filter(Boolean);
}

function normalizePlatformAdminSimulation(simulation = null) {
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
    kind: normalizeString(simulation.kind, "platform").toLowerCase(),
    tone: normalizeString(simulation.tone, "info").toLowerCase(),
    title: title || "Platform admin dry-run",
    summary,
    updatedAt: normalizeString(simulation.updatedAt),
    facts,
    findings
  };
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
  const aimxsSettings =
    context?.settings?.aimxs && typeof context.settings.aimxs === "object" ? context.settings.aimxs : {};
  const viewState = context?.viewState && typeof context.viewState === "object" ? context.viewState : {};
  const aimxsPremiumVisible = isAimxsPremiumVisible({
    paymentEntitled: aimxsSettings.paymentEntitled,
    mode: aimxsSettings.mode,
    state: aimxsSettings.state,
    activation: aimxsActivation
  });
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
  const adminDefaults = {
    changeKind: "promote",
    environment,
    deploymentTarget: normalizeString(aimxsActivation.selectedProviderId || aimxsActivation.activeMode, "desktop-local"),
    releaseRef:
      environment === "prod"
        ? normalizeString(pipeline.latestProdGate || pipeline.latestStagingGate)
        : normalizeString(pipeline.latestStagingGate || pipeline.latestProdGate)
  };
  const adminQueueItems = normalizePlatformAdminQueueItems(viewState.queueItems || []);
  const selectedAdminChangeId = normalizeString(viewState.selectedAdminChangeId);
  const selectedAdminQueueItem =
    adminQueueItems.find((item) => item.id === selectedAdminChangeId) || adminQueueItems[0] || null;

  const snapshot = {
    aimxsPremiumVisible,
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
    },
    admin: {
      feedback: normalizePlatformAdminFeedback(viewState.feedback || null),
      draft: normalizePlatformDraft(viewState.promotionDraft || {}, adminDefaults),
      recoveryReason: normalizeString(viewState.recoveryReason),
      selectedChangeId: selectedAdminQueueItem ? selectedAdminQueueItem.id : "",
      queueItems: adminQueueItems,
      selectedQueueItem: selectedAdminQueueItem,
      latestSimulation: normalizePlatformAdminSimulation(viewState.latestSimulation || null),
      defaults: adminDefaults,
      currentScope: {
        environment,
        deploymentTarget: adminDefaults.deploymentTarget,
        pipelineStatus: normalizeString(pipeline.status, "unknown"),
        latestStagingGate: normalizeString(pipeline.latestStagingGate, "-"),
        latestProdGate: normalizeString(pipeline.latestProdGate, "-"),
        deploymentIssueCount,
        providerDegradedCount: providerCounts.degradedCount,
        warningCount: warnings.length,
        secretMissingCount: secretCounts.missingCount
      }
    }
  };
  snapshot.aimxsRouteBoundary = buildPlatformAimxsRouteBoundary(snapshot);
  return snapshot;
}

function buildPlatformAimxsRouteBoundary(snapshot = {}) {
  const environment = snapshot?.environmentOverview || {};
  const bridge = snapshot?.aimxsBridgeReadiness || {};
  const release = snapshot?.releaseReadiness || {};
  const support = snapshot?.supportPosture || {};
  const scope = snapshot?.admin?.currentScope || {};
  const aimxsPremiumVisible = Boolean(snapshot?.aimxsPremiumVisible);
  const bounded =
    Number(release?.deploymentIssueCount || 0) === 0 &&
    Number(support?.supportSignalCount || 0) === 0 &&
    Number(bridge?.secretMissingCount || 0) === 0 &&
    normalizeString(bridge?.state).toLowerCase() === "active";

  return createAimxsRouteBoundaryModel({
    summary:
      aimxsPremiumVisible
        ? "This primary AIMXS view shows which deployment route is currently live on the platform surface and why the release boundary is still allowed or constrained."
        : "This primary provider-route view shows which deployment route is currently live on the platform surface and why the release boundary is still allowed or constrained.",
    surfaceLabel: "primary platform surface",
    routeFields: [
      createAimxsRouteBoundaryField("surface", environment?.surface, true),
      createAimxsRouteBoundaryField("environment", release?.environment, true),
      createAimxsRouteBoundaryField("mode", bridge?.activeMode, true),
      createAimxsRouteBoundaryField("provider", bridge?.selectedProviderId, true),
      createAimxsRouteBoundaryField("deployment target", scope?.deploymentTarget, true),
      createAimxsRouteBoundaryField("namespace", environment?.namespace, true)
    ].filter(Boolean),
    currentBoundary: {
      title: "Current Route",
      badge: bounded ? "current" : "watch",
      tone: bounded ? "ok" : "warn",
      note: aimxsPremiumVisible
        ? "Current route is derived from AIMXS bridge readiness and the active platform deployment surface."
        : "Current route is derived from bridge readiness and the active platform deployment surface.",
      fields: [
        createAimxsRouteBoundaryField("bridge state", bridge?.state),
        createAimxsRouteBoundaryField("route posture", bridge?.available ? "bridge available" : "bridge unavailable"),
        createAimxsRouteBoundaryField("selected ready", bridge?.selectedProviderReady ? "yes" : "no"),
        createAimxsRouteBoundaryField("enabled providers", String(bridge?.enabledProviderCount || 0)),
        createAimxsRouteBoundaryField("enabled ready", String(bridge?.enabledReadyCount || 0)),
        createAimxsRouteBoundaryField("provider warnings", String(bridge?.warningCount || 0))
      ].filter(Boolean)
    },
    routePosture: {
      title: "Boundary Posture",
      badge: bounded ? "bounded" : "constrained",
      tone: bounded ? "ok" : "warn",
      note: aimxsPremiumVisible
        ? "Platform boundaries stay bounded by pipeline status, provider readiness, and AIMXS secret posture before any deployment change can proceed."
        : "Platform boundaries stay bounded by pipeline status, provider readiness, and bridge secret posture before any deployment change can proceed.",
      fields: [
        createAimxsRouteBoundaryField("pipeline", release?.pipelineStatus),
        createAimxsRouteBoundaryField("deployment issues", String(release?.deploymentIssueCount || 0)),
        createAimxsRouteBoundaryField("provider degraded", String(release?.providerDegradedCount || 0)),
        createAimxsRouteBoundaryField("secret missing", String(bridge?.secretMissingCount || 0)),
        createAimxsRouteBoundaryField("support signals", String(support?.supportSignalCount || 0)),
        createAimxsRouteBoundaryField("staging gate", release?.latestStagingGate, true),
        createAimxsRouteBoundaryField("prod gate", release?.latestProdGate, true)
      ].filter(Boolean)
    },
    rationale: {
      title: "Allowed Or Constrained",
      badge: bounded ? "allowed" : "constrained",
      tone: bounded ? "ok" : "warn",
      note:
        normalizeString(support?.firstWarning, "") ||
        "Use provider, runtime, and policy details below to see why the current platform route is or is not ready for the next governed release step.",
      fields: [
        createAimxsRouteBoundaryField("runtime detail", support?.runtimeDetail),
        createAimxsRouteBoundaryField("provider detail", support?.providersDetail),
        createAimxsRouteBoundaryField("policy detail", support?.policyDetail),
        createAimxsRouteBoundaryField("active warning", support?.firstWarning)
      ].filter(Boolean)
    }
  });
}
