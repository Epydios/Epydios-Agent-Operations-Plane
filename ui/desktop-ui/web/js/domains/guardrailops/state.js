function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeStatus(value) {
  return normalizeString(value).toLowerCase();
}

function parseTimeMs(value) {
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickLatestItem(items = []) {
  const values = Array.isArray(items) ? items : [];
  let best = null;
  let bestTs = -1;
  for (const item of values) {
    const candidate = item && typeof item === "object" ? item : {};
    const ts = Math.max(parseTimeMs(candidate.updatedAt), parseTimeMs(candidate.createdAt), parseTimeMs(candidate.expiresAt));
    if (!best || ts > bestTs) {
      best = candidate;
      bestTs = ts;
    }
  }
  return best || {};
}

function uniqueValues(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => normalizeString(item)).filter(Boolean))];
}

function readStringArray(value) {
  return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) : [];
}

function collectCatalogValues(items = [], field) {
  return uniqueValues((Array.isArray(items) ? items : []).flatMap((item) => readStringArray(item?.[field])));
}

function pickLatestGuardrailRun(runs = {}) {
  const items = Array.isArray(runs?.items) ? runs.items : [];
  const candidates = items.filter((item) => {
    const payload = item?.requestPayload && typeof item.requestPayload === "object" ? item.requestPayload : {};
    const desktop = payload?.desktop && typeof payload.desktop === "object" ? payload.desktop : {};
    return (
      Object.keys(desktop).length > 0 ||
      Boolean(normalizeString(item?.selectedDesktopProvider)) ||
      normalizeString(payload?.action?.verb).toLowerCase() === "desktop.step"
    );
  });
  return pickLatestItem(candidates);
}

function pickLatestPendingApproval(approvals = {}) {
  const items = Array.isArray(approvals?.items) ? approvals.items : [];
  const pending = items.filter((item) => normalizeStatus(item?.status) === "pending");
  return pickLatestItem(pending);
}

function collectEnforcementProfiles(orgAdminProfiles = {}) {
  const profiles = [];
  const items = Array.isArray(orgAdminProfiles?.items) ? orgAdminProfiles.items : [];
  for (const item of items) {
    const enforcementProfiles = Array.isArray(item?.enforcementProfiles) ? item.enforcementProfiles : [];
    for (const profile of enforcementProfiles) {
      profiles.push({
        profileId: normalizeString(item?.profileId),
        profileLabel: normalizeString(item?.label),
        hookId: normalizeString(profile?.hookId),
        label: normalizeString(profile?.label),
        category: normalizeString(profile?.category),
        enforcementMode: normalizeString(profile?.enforcementMode),
        roleBundles: readStringArray(profile?.roleBundles),
        requiredInputs: readStringArray(profile?.requiredInputs),
        decisionSurfaces: readStringArray(profile?.decisionSurfaces),
        boundaryRequirements: readStringArray(profile?.boundaryRequirements)
      });
    }
  }
  return profiles;
}

function collectOverlayProfiles(orgAdminProfiles = {}) {
  const profiles = [];
  const items = Array.isArray(orgAdminProfiles?.items) ? orgAdminProfiles.items : [];
  for (const item of items) {
    const overlayProfiles = Array.isArray(item?.overlayProfiles) ? item.overlayProfiles : [];
    for (const profile of overlayProfiles) {
      profiles.push({
        profileId: normalizeString(item?.profileId),
        profileLabel: normalizeString(item?.label),
        overlayId: normalizeString(profile?.overlayId),
        label: normalizeString(profile?.label),
        category: normalizeString(profile?.category),
        overlayMode: normalizeString(profile?.overlayMode),
        targetDimensions: readStringArray(profile?.targetDimensions),
        requiredInputs: readStringArray(profile?.requiredInputs),
        roleBundles: readStringArray(profile?.roleBundles),
        decisionSurfaces: readStringArray(profile?.decisionSurfaces),
        boundaryRequirements: readStringArray(profile?.boundaryRequirements)
      });
    }
  }
  return profiles;
}

function countOrgAdminRoleBundles(orgAdminProfiles = {}, field) {
  const items = Array.isArray(orgAdminProfiles?.items) ? orgAdminProfiles.items : [];
  return uniqueValues(items.flatMap((item) => readStringArray(item?.[field]))).length;
}

function collectOrgAdminValues(orgAdminProfiles = {}, field) {
  const items = Array.isArray(orgAdminProfiles?.items) ? orgAdminProfiles.items : [];
  return uniqueValues(items.flatMap((item) => readStringArray(item?.[field])));
}

function formatDurationMinutes(startValue, endValue) {
  const startMs = parseTimeMs(startValue);
  const endMs = parseTimeMs(endValue);
  if (startMs <= 0 || endMs <= 0 || endMs <= startMs) {
    return "-";
  }
  const minutes = Math.round((endMs - startMs) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "-";
  }
  return `${minutes} min`;
}

function collectExportProfiles(exportProfiles = {}) {
  return Array.isArray(exportProfiles?.items) ? exportProfiles.items : [];
}

function summarizeSelectedProviderContract(settings = {}) {
  const contracts = Array.isArray(settings?.integrations?.providerContracts)
    ? settings.integrations.providerContracts
    : [];
  const selected =
    contracts.find((item) => item?.selected) ||
    contracts[0] ||
    {};
  return {
    contractCount: contracts.length,
    label: normalizeString(selected?.label || selected?.profileId, "-"),
    provider: normalizeString(selected?.provider, "-"),
    transport: normalizeString(selected?.transport, "-"),
    credentialScope: normalizeString(selected?.credentialScope, "-"),
    model: normalizeString(selected?.model, "-")
  };
}

function summarizeWorkerCapabilities(runtimeWorkerCapabilities = {}) {
  const items = Array.isArray(runtimeWorkerCapabilities?.items) ? runtimeWorkerCapabilities.items : [];
  const latest = pickLatestItem(items);
  const boundaryRequirements = uniqueValues(
    items.flatMap((item) => readStringArray(item?.boundaryRequirements))
  );
  return {
    source: normalizeString(runtimeWorkerCapabilities?.source, "unknown"),
    totalProfiles: Number(runtimeWorkerCapabilities?.count || items.length || 0),
    managedAgentCount: items.filter((item) => normalizeStatus(item?.workerType) === "managed_agent").length,
    modelInvokeCount: items.filter((item) => normalizeStatus(item?.workerType) === "model_invoke").length,
    boundaryRequirementCount: boundaryRequirements.length,
    latestLabel: normalizeString(latest?.label || latest?.adapterId, "-"),
    latestProvider: normalizeString(latest?.provider, "-"),
    latestTransport: normalizeString(latest?.transport, "-"),
    latestModel: normalizeString(latest?.model, "-")
  };
}

function summarizeBoundaryRequirements(policyCatalog = {}) {
  const items = Array.isArray(policyCatalog?.items) ? policyCatalog.items : [];
  const requirements = uniqueValues(items.flatMap((item) => readStringArray(item?.boundaryRequirements)));
  return {
    totalCount: requirements.length,
    firstRequirement: requirements[0] || "-",
    scopeGuardPresent: requirements.includes("tenant_project_scope"),
    runtimeAuthzPresent: requirements.includes("runtime_authz"),
    exportRedactionPresent: requirements.includes("governed_export_redaction")
  };
}

function postureTone(...signals) {
  const values = signals.map((value) => normalizeString(value).toLowerCase()).filter(Boolean);
  if (values.some((value) => ["danger", "error", "denied", "failed", "blocked", "killed"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["warn", "pending", "defer", "constrained", "degraded", "unknown"].includes(value))) {
    return "warn";
  }
  if (values.some((value) => ["ok", "allow", "allowed", "completed", "clear", "ready", "active"].includes(value))) {
    return "ok";
  }
  return "neutral";
}

function normalizeGuardrailAdminFeedback(feedback = null) {
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

function normalizeGuardrailAdminDecision(decision = null) {
  if (!decision || typeof decision !== "object") {
    return null;
  }
  const decisionId = normalizeString(decision.decisionId);
  const status = normalizeString(decision.status).toLowerCase();
  const reason = normalizeString(decision.reason);
  const decidedAt = normalizeString(decision.decidedAt);
  const approvalReceiptId = normalizeString(decision.approvalReceiptId);
  if (!decisionId && !status && !reason && !decidedAt && !approvalReceiptId) {
    return null;
  }
  return {
    decisionId,
    status,
    reason,
    decidedAt,
    approvalReceiptId,
    actorRef: normalizeString(decision.actorRef)
  };
}

function normalizeGuardrailAdminReceipt(receipt = null) {
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

function normalizeGuardrailAdminExecution(execution = null) {
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

function normalizeGuardrailAdminRollback(rollback = null) {
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

function normalizeGuardrailDraft(draft = null, defaults = {}) {
  const input = draft && typeof draft === "object" ? draft : {};
  return {
    changeKind: normalizeString(input.changeKind || defaults.changeKind, "tighten").toLowerCase(),
    targetScope: normalizeString(input.targetScope || defaults.targetScope, "workspace"),
    executionProfile: normalizeString(input.executionProfile || defaults.executionProfile, "managed_codex_worker"),
    safetyBoundary: normalizeString(input.safetyBoundary || defaults.safetyBoundary, "tenant_project_scope"),
    proposedState: normalizeString(input.proposedState || defaults.proposedState, "approval_required"),
    reason: normalizeString(input.reason)
  };
}

function normalizeGuardrailAdminQueueItems(items = []) {
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
        ownerDomain: normalizeString(entry.ownerDomain || entry.domain, "guardrailops").toLowerCase(),
        kind: normalizeString(entry.kind, "guardrail").toLowerCase(),
        label: normalizeString(entry.label, "Guardrail Change Draft"),
        requestedAction: normalizeString(entry.requestedAction, "proposal"),
        subjectId: normalizeString(entry.subjectId, "-"),
        subjectLabel: normalizeString(entry.subjectLabel, "profile").toLowerCase(),
        targetScope: normalizeString(entry.targetScope, "-"),
        targetLabel: normalizeString(entry.targetLabel, "scope").toLowerCase(),
        changeKind: normalizeString(entry.changeKind, "tighten").toLowerCase(),
        executionProfile: normalizeString(entry.executionProfile, "-"),
        safetyBoundary: normalizeString(entry.safetyBoundary, "-"),
        proposedState: normalizeString(entry.proposedState, "-"),
        status: normalizeString(entry.status, "draft").toLowerCase(),
        reason: normalizeString(entry.reason),
        summary: normalizeString(entry.summary),
        simulationSummary: normalizeString(entry.simulationSummary),
        createdAt: normalizeString(entry.createdAt),
        simulatedAt: normalizeString(entry.simulatedAt),
        updatedAt: normalizeString(entry.updatedAt),
        routedAt: normalizeString(entry.routedAt),
        decision: normalizeGuardrailAdminDecision(entry.decision || null),
        execution: normalizeGuardrailAdminExecution(entry.execution || null),
        receipt: normalizeGuardrailAdminReceipt(entry.receipt || null),
        rollback: normalizeGuardrailAdminRollback(entry.rollback || null)
      };
    })
    .filter(Boolean);
}

function normalizeGuardrailAdminSimulation(simulation = null) {
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
    kind: normalizeString(simulation.kind, "guardrail").toLowerCase(),
    tone: normalizeString(simulation.tone, "info").toLowerCase(),
    title: title || "Guardrail admin dry-run",
    summary,
    updatedAt: normalizeString(simulation.updatedAt),
    facts,
    findings
  };
}

export function createGuardrailWorkspaceSnapshot(context = {}) {
  const settings = context?.settings && typeof context.settings === "object" ? context.settings : {};
  const runs = context?.runs && typeof context.runs === "object" ? context.runs : {};
  const approvals = context?.approvals && typeof context.approvals === "object" ? context.approvals : {};
  const runtimeWorkerCapabilities =
    context?.runtimeWorkerCapabilities && typeof context.runtimeWorkerCapabilities === "object"
      ? context.runtimeWorkerCapabilities
      : {};
  const exportProfiles =
    context?.exportProfiles && typeof context.exportProfiles === "object" ? context.exportProfiles : {};
  const orgAdminProfiles =
    context?.orgAdminProfiles && typeof context.orgAdminProfiles === "object" ? context.orgAdminProfiles : {};
  const viewState = context?.viewState && typeof context.viewState === "object" ? context.viewState : {};

  const latestRun = pickLatestGuardrailRun(runs);
  const latestApproval = pickLatestPendingApproval(approvals);
  const workerSummary = summarizeWorkerCapabilities(runtimeWorkerCapabilities);
  const exportProfileItems = collectExportProfiles(exportProfiles);
  const enforcementProfiles = collectEnforcementProfiles(orgAdminProfiles);
  const overlayProfiles = collectOverlayProfiles(orgAdminProfiles);
  const boundarySummary = summarizeBoundaryRequirements(settings?.policyCatalog || {});
  const selectedProviderContract = summarizeSelectedProviderContract(settings);
  const desktop = latestRun?.requestPayload?.desktop && typeof latestRun.requestPayload.desktop === "object"
    ? latestRun.requestPayload.desktop
    : {};
  const requestedCapabilities = readStringArray(
    latestApproval?.requestedCapabilities?.length ? latestApproval.requestedCapabilities : desktop?.requestedCapabilities
  );
  const requiredVerifierIds = readStringArray(desktop?.requiredVerifierIds);
  const pendingApprovalCount = Array.isArray(approvals?.items)
    ? approvals.items.filter((item) => normalizeStatus(item?.status) === "pending").length
    : 0;
  const scopeGuardCount = enforcementProfiles.filter((item) => item.enforcementMode === "scope_guard").length;
  const breakGlassGateCount = enforcementProfiles.filter((item) => item.category === "break_glass").length;
  const quotaGateCount = enforcementProfiles.filter((item) => item.category === "quota").length;
  const timeboxedGateCount = enforcementProfiles.filter((item) => item.enforcementMode === "timeboxed_elevation").length;
  const latestQuotaOverlay = pickLatestItem(overlayProfiles.filter((item) => item.category === "quota"));
  const chargebackOverlayCount = overlayProfiles.filter((item) => item.category === "chargeback").length;
  const latestExecutionProfile = normalizeString(
    latestApproval?.targetExecutionProfile || desktop?.targetExecutionProfile,
    "-"
  );
  const latestTargetOs = normalizeString(latestApproval?.targetOS || desktop?.targetOS, "-");
  const latestRunTenant = normalizeString(latestRun?.tenantId || latestRun?.requestPayload?.meta?.tenantId, "-");
  const latestRunProject = normalizeString(latestRun?.projectId || latestRun?.requestPayload?.meta?.projectId, "-");
  const terminalMode = normalizeString(settings?.terminal?.mode, "interactive_sandbox_only");
  const restrictedHostMode = normalizeString(settings?.terminal?.restrictedHostMode, "blocked");
  const latestDecision = normalizeString(latestRun?.policyDecision || latestRun?.policyResponse?.decision, "-").toUpperCase();
  const latestRunStatus = normalizeString(latestRun?.status, "-").toUpperCase();
  const firstEnforcement = enforcementProfiles[0] || null;
  const approvalWindow = formatDurationMinutes(latestApproval?.createdAt, latestApproval?.expiresAt);
  const breakGlassBundleCount = countOrgAdminRoleBundles(orgAdminProfiles, "breakGlassRoleBundles");
  const latestQuotaDimensions = readStringArray(latestQuotaOverlay?.targetDimensions);
  const latestQuotaInputs = readStringArray(latestQuotaOverlay?.requiredInputs);
  const desktopExportProfiles = exportProfileItems.filter((item) =>
    readStringArray(item?.clientSurfaces).includes("desktop")
  );
  const deliveryChannels = collectCatalogValues(exportProfileItems, "deliveryChannels");
  const desktopDeliveryChannels = collectCatalogValues(desktopExportProfiles, "deliveryChannels");
  const desktopRedactionModes = uniqueValues(desktopExportProfiles.map((item) => normalizeString(item?.redactionMode)).filter(Boolean));
  const structuredRedactionCount = desktopExportProfiles.filter(
    (item) => normalizeString(item?.redactionMode) === "structured_and_text"
  ).length;
  const textRedactionCount = desktopExportProfiles.filter(
    (item) => normalizeString(item?.redactionMode) === "text"
  ).length;
  const firstDesktopExportProfile = pickLatestItem(desktopExportProfiles);
  const breakGlassSurfaces = uniqueValues([
    ...enforcementProfiles
      .filter((item) => item.category === "break_glass")
      .flatMap((item) => readStringArray(item?.decisionSurfaces)),
    ...collectOrgAdminValues(orgAdminProfiles, "decisionSurfaces").filter((item) => item === "break_glass_activation")
  ]);
  const breakGlassRequiredInputs = uniqueValues(
    enforcementProfiles
      .filter((item) => item.category === "break_glass")
      .flatMap((item) => readStringArray(item?.requiredInputs))
  );
  const breakGlassBundles = collectOrgAdminValues(orgAdminProfiles, "breakGlassRoleBundles");
  const firstBreakGlassBundle = breakGlassBundles[0] || "-";
  const firstBreakGlassSurface = breakGlassSurfaces[0] || "-";
  const firstBreakGlassInput = breakGlassRequiredInputs[0] || "-";
  const approvalHoldPresent = pendingApprovalCount > 0;
  const restrictedHostBlocked = restrictedHostMode.toLowerCase() === "blocked";
  const readOnlyStopPresent = terminalMode.toLowerCase() === "read_only";
  const policyBlockedPresent =
    latestRunStatus === "POLICY_BLOCKED" ||
    latestDecision === "DENY" ||
    latestDecision === "BLOCKED";
  const currentHardStopCount = [
    approvalHoldPresent,
    restrictedHostBlocked,
    readOnlyStopPresent,
    policyBlockedPresent
  ].filter(Boolean).length;
  const defaultTargetScope =
    [latestRunTenant, latestRunProject].filter((value) => value && value !== "-").join(" / ") ||
    normalizeString(settings?.environment, "workspace");
  const adminDefaults = {
    changeKind: breakGlassGateCount > 0 ? "tighten" : "tighten",
    targetScope: defaultTargetScope || "workspace",
    executionProfile: latestExecutionProfile !== "-" ? latestExecutionProfile : "managed_codex_worker",
    safetyBoundary: boundarySummary.firstRequirement !== "-" ? boundarySummary.firstRequirement : "tenant_project_scope",
    proposedState: approvalHoldPresent ? "approval_required" : "governed",
    reason: ""
  };
  const adminQueueItems = normalizeGuardrailAdminQueueItems(viewState.queueItems || []);
  const selectedAdminChangeId = normalizeString(viewState.selectedAdminChangeId);
  const selectedAdminQueueItem =
    adminQueueItems.find((item) => item.id === selectedAdminChangeId) || adminQueueItems[0] || null;

  return {
    guardrailPosture: {
      available: Boolean(latestRun?.runId || latestApproval?.approvalId || terminalMode),
      terminalMode,
      latestRunId: normalizeString(latestRun?.runId, "-"),
      latestRunStatus,
      latestDecision,
      latestExecutionProfile,
      latestTargetOs,
      latestDesktopProvider: normalizeString(latestRun?.selectedDesktopProvider, "-"),
      latestRunTenant,
      latestRunProject,
      pendingApprovalCount,
      enforcementProfileCount: enforcementProfiles.length,
      breakGlassGateCount,
      tone: postureTone(
        latestDecision,
        latestRunStatus,
        pendingApprovalCount > 0 ? "pending" : "clear",
        terminalMode === "read_only" ? "constrained" : "ok"
      )
    },
    sandboxCapability: {
      available: Boolean(workerSummary.totalProfiles || requestedCapabilities.length || latestExecutionProfile !== "-"),
      terminalMode,
      latestExecutionProfile,
      latestTargetOs,
      restrictedHostOptIn: desktop?.restrictedHostOptIn === true,
      requestedCapabilityCount: requestedCapabilities.length,
      firstRequestedCapability: requestedCapabilities[0] || "-",
      requiredVerifierCount: requiredVerifierIds.length,
      workerProfileCount: workerSummary.totalProfiles,
      managedAgentCount: workerSummary.managedAgentCount,
      modelInvokeCount: workerSummary.modelInvokeCount,
      boundaryRequirementCount: workerSummary.boundaryRequirementCount,
      latestWorkerLabel: workerSummary.latestLabel,
      latestWorkerProvider: workerSummary.latestProvider,
      latestWorkerTransport: workerSummary.latestTransport,
      latestWorkerModel: workerSummary.latestModel,
      source: workerSummary.source,
      tone: postureTone(
        terminalMode === "read_only" ? "constrained" : "ok",
        latestExecutionProfile === "restricted_host" && desktop?.restrictedHostOptIn !== true ? "warn" : "ok",
        workerSummary.totalProfiles > 0 ? "ready" : "unknown"
      )
    },
    executionGates: {
      available: Boolean(latestRun?.runId || latestApproval?.approvalId || enforcementProfiles.length),
      pendingApprovalCount,
      latestApprovalId: normalizeString(latestApproval?.approvalId, "-"),
      latestApprovalRunId: normalizeString(latestApproval?.runId, "-"),
      latestApprovalTier: String(Number.parseInt(String(latestApproval?.tier || "0"), 10) || 0),
      latestApprovalReason: normalizeString(latestApproval?.reason, "-"),
      latestApprovalTargetProfile: normalizeString(latestApproval?.targetExecutionProfile, "-"),
      latestGrantTokenPresent: latestRun?.policyGrantTokenPresent === true,
      latestGrantTokenSha256: normalizeString(latestRun?.policyGrantTokenSha256, "-"),
      boundaryRequirementCount: boundarySummary.totalCount,
      firstBoundaryRequirement: boundarySummary.firstRequirement,
      scopeGuardPresent: boundarySummary.scopeGuardPresent,
      runtimeAuthzPresent: boundarySummary.runtimeAuthzPresent,
      exportRedactionPresent: boundarySummary.exportRedactionPresent,
      enforcementProfileCount: enforcementProfiles.length,
      scopeGuardCount,
      breakGlassGateCount,
      quotaGateCount,
      firstEnforcementLabel: normalizeString(firstEnforcement?.label, "-"),
      tone: postureTone(
        pendingApprovalCount > 0 ? "pending" : "clear",
        latestRun?.policyGrantTokenPresent === true ? "ok" : "warn",
        enforcementProfiles.length > 0 ? "active" : "unknown"
      )
    },
    quotaAndTimeout: {
      available: Boolean(overlayProfiles.length || latestApproval?.expiresAt || timeboxedGateCount > 0),
      quotaGateCount,
      timeboxedGateCount,
      overlayProfileCount: overlayProfiles.length,
      chargebackOverlayCount,
      latestQuotaOverlayLabel: normalizeString(latestQuotaOverlay?.label, "-"),
      latestQuotaOverlayMode: normalizeString(latestQuotaOverlay?.overlayMode, "-"),
      quotaDimensionCount: latestQuotaDimensions.length,
      firstQuotaDimension: latestQuotaDimensions[0] || "-",
      quotaInputCount: latestQuotaInputs.length,
      firstQuotaInput: latestQuotaInputs[0] || "-",
      latestApprovalId: normalizeString(latestApproval?.approvalId, "-"),
      latestApprovalExpiresAt: normalizeString(latestApproval?.expiresAt, "-"),
      approvalWindow,
      breakGlassBundleCount,
      tone: postureTone(
        timeboxedGateCount > 0 ? "active" : "unknown",
        quotaGateCount > 0 ? "active" : "unknown",
        latestApproval?.expiresAt ? "pending" : "clear"
      )
    },
    killSwitch: {
      available: Boolean(terminalMode || restrictedHostMode || latestRun?.runId || latestApproval?.approvalId),
      terminalMode,
      restrictedHostMode,
      currentHardStopCount,
      approvalHoldPresent,
      restrictedHostBlocked,
      readOnlyStopPresent,
      policyBlockedPresent,
      latestRunId: normalizeString(latestRun?.runId, "-"),
      latestRunStatus,
      latestDecision,
      latestExecutionProfile,
      latestApprovalId: normalizeString(latestApproval?.approvalId, "-"),
      latestApprovalReason: normalizeString(latestApproval?.reason, "-"),
      tone: postureTone(
        currentHardStopCount > 0 ? "warn" : "clear",
        policyBlockedPresent ? "blocked" : "ready"
      )
    },
    redactionAndTransport: {
      available: Boolean(exportProfileItems.length || selectedProviderContract.contractCount || workerSummary.totalProfiles),
      exportProfileCount: exportProfileItems.length,
      desktopExportProfileCount: desktopExportProfiles.length,
      structuredRedactionCount,
      textRedactionCount,
      redactionBoundaryPresent: boundarySummary.exportRedactionPresent,
      firstDesktopExportProfileLabel: normalizeString(firstDesktopExportProfile?.label, "-"),
      firstDesktopRedactionMode: desktopRedactionModes[0] || "-",
      deliveryChannelCount: deliveryChannels.length,
      firstDeliveryChannel: desktopDeliveryChannels[0] || deliveryChannels[0] || "-",
      selectedProviderLabel: selectedProviderContract.label,
      selectedProviderTransport: selectedProviderContract.transport,
      selectedProviderScope: selectedProviderContract.credentialScope,
      selectedProviderModel: selectedProviderContract.model,
      latestWorkerProvider: workerSummary.latestProvider,
      latestWorkerTransport: workerSummary.latestTransport,
      latestWorkerModel: workerSummary.latestModel,
      tone: postureTone(
        boundarySummary.exportRedactionPresent ? "active" : "warn",
        selectedProviderContract.transport !== "-" ? "ready" : "unknown",
        workerSummary.latestTransport !== "-" ? "ready" : "unknown"
      )
    },
    breakGlassPosture: {
      available: Boolean(breakGlassGateCount || breakGlassBundleCount || latestApproval?.expiresAt),
      breakGlassGateCount,
      timeboxedGateCount,
      breakGlassBundleCount,
      firstBreakGlassBundle,
      breakGlassSurfaceCount: breakGlassSurfaces.length,
      firstBreakGlassSurface,
      breakGlassRequiredInputCount: breakGlassRequiredInputs.length,
      firstBreakGlassInput,
      latestApprovalId: normalizeString(latestApproval?.approvalId, "-"),
      latestApprovalExpiresAt: normalizeString(latestApproval?.expiresAt, "-"),
      approvalWindow,
      latestApprovalReason: normalizeString(latestApproval?.reason, "-"),
      latestRunId: normalizeString(latestRun?.runId, "-"),
      tone: postureTone(
        breakGlassGateCount > 0 ? "active" : "unknown",
        timeboxedGateCount > 0 ? "active" : "unknown",
        latestApproval?.expiresAt ? "pending" : "clear"
      )
    },
    admin: {
      feedback: normalizeGuardrailAdminFeedback(viewState?.feedback || null),
      recoveryReason: normalizeString(viewState?.recoveryReason),
      selectedChangeId: selectedAdminQueueItem ? selectedAdminQueueItem.id : selectedAdminChangeId,
      selectedQueueItem: selectedAdminQueueItem,
      queueItems: adminQueueItems,
      draft: normalizeGuardrailDraft(viewState?.guardrailDraft || {}, adminDefaults),
      latestSimulation: normalizeGuardrailAdminSimulation(viewState?.latestSimulation || null),
      currentScope: {
        targetScope: defaultTargetScope || "-",
        executionProfile: latestExecutionProfile,
        safetyBoundary: boundarySummary.firstRequirement,
        terminalMode,
        restrictedHostMode,
        pendingApprovalCount,
        currentHardStopCount,
        breakGlassGateCount,
        quotaGateCount,
        redactionBoundaryPresent: boundarySummary.exportRedactionPresent,
        firstDeliveryChannel: desktopDeliveryChannels[0] || deliveryChannels[0] || "-",
        selectedProviderTransport: selectedProviderContract.transport,
        latestRunId: normalizeString(latestRun?.runId, "-")
      }
    }
  };
}
