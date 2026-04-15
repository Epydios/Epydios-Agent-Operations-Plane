import {
  chipClassForStatus,
  displayAimxsModeLabel,
  displayPolicyProviderLabel,
  escapeHTML
} from "../../views/common.js";
import {
  createAimxsField,
  createAimxsIdentityPostureModel,
  inferAimxsAuthorityTierFromRoles
} from "../../shared/aimxs/identity-posture.js";
import { isAimxsPremiumVisible } from "../../aimxs/state.js";

export function presentPolicyCopy(value) {
  return String(value || "")
    .replace(/OSS-only/g, "Baseline")
    .replace(/\boss-only\b/g, "baseline")
    .replace(/\boss-policy-opa\b/g, "baseline");
}

export function renderDelimitedCodeList(items = []) {
  const values = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (values.length === 0) {
    return "-";
  }
  return values.map((item) => `<code>${escapeHTML(item)}</code>`).join(", ");
}

export function policyProviderLabel(settings = {}) {
  const selectedProviderId = String(settings?.aimxs?.activation?.selectedProviderId || "").trim();
  if (selectedProviderId) {
    return displayPolicyProviderLabel(selectedProviderId);
  }
  const mode = String(settings?.aimxs?.mode || "").trim().toLowerCase();
  if (mode === "oss-only") {
    return "baseline";
  }
  if (mode === "aimxs-full") {
    return displayPolicyProviderLabel("aimxs-full");
  }
  if (mode === "aimxs-https") {
    return displayPolicyProviderLabel("premium-policy-primary");
  }
  return "-";
}

export function summarizePolicyDataSource(value) {
  const source = String(value || "unknown").trim().toLowerCase();
  if (source === "runtime-endpoint") {
    return "runtime-endpoint";
  }
  if (source === "derived-runs") {
    return "derived-runs";
  }
  if (source === "mock") {
    return "mock";
  }
  if (source === "endpoint-unavailable") {
    return "endpoint-unavailable";
  }
  return source || "unknown";
}

function normalizePolicyPackReadiness(value, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["ok", "pass", "passing", "complete", "compiled", "valid"].includes(normalized)) {
    return "ready";
  }
  if (["ready", "declared", "conditional", "partial", "unknown", "missing", "incomplete", "unchecked"].includes(normalized)) {
    return normalized;
  }
  return normalized;
}

function derivePolicyPackSchemaReadiness(item = {}) {
  const surfaces = readStringArray(item?.decisionSurfaces);
  const hasPackId = Boolean(String(item?.packId || "").trim());
  const hasLabel = Boolean(String(item?.label || "").trim());
  if (hasPackId && hasLabel && surfaces.length > 0) {
    return "declared";
  }
  if (hasPackId || hasLabel || surfaces.length > 0) {
    return "partial";
  }
  return "unknown";
}

function derivePolicyPackCompileReadiness(item = {}) {
  const roleBundles = readStringArray(item?.roleBundles);
  const surfaces = readStringArray(item?.decisionSurfaces);
  const boundaryRequirements = readStringArray(item?.boundaryRequirements);
  if (roleBundles.length > 0 && surfaces.length > 0 && boundaryRequirements.length > 0) {
    return "ready";
  }
  if (surfaces.length > 0 && boundaryRequirements.length > 0) {
    return "conditional";
  }
  if (roleBundles.length > 0 || surfaces.length > 0 || boundaryRequirements.length > 0) {
    return "partial";
  }
  return "unknown";
}

function normalizePolicyCatalogItem(item = {}, index = 0) {
  const packId = String(item?.packId || "").trim();
  const label = String(item?.label || "").trim();
  const version = String(item?.version || item?.packVersion || "").trim() || "unversioned";
  const stableRef =
    String(item?.stableRef || "").trim() || (packId ? `policy-pack://${packId}@${version}` : "");
  const sourceRef =
    String(item?.sourceRef || item?.bundleRef || item?.uri || "").trim() ||
    (packId ? `bundle://premium-provider/${packId}/${version}` : "");
  const activationTarget = String(item?.activationTarget || item?.scope || "").trim() || "workspace";
  const activationPosture =
    String(item?.activationPosture || "").trim().toLowerCase() || (index === 0 ? "current" : "available");
  const schemaReadiness = normalizePolicyPackReadiness(
    item?.schemaReadiness || item?.schemaStatus,
    derivePolicyPackSchemaReadiness(item)
  );
  const compileReadiness = normalizePolicyPackReadiness(
    item?.compileReadiness || item?.compileStatus,
    derivePolicyPackCompileReadiness(item)
  );
  return {
    ...item,
    packId,
    label,
    version,
    sourceRef,
    stableRef,
    activationTarget,
    activationPosture,
    schemaReadiness,
    compileReadiness,
    roleBundles: readStringArray(item?.roleBundles),
    decisionSurfaces: readStringArray(item?.decisionSurfaces),
    boundaryRequirements: readStringArray(item?.boundaryRequirements)
  };
}

export function renderPolicyPackRows(items) {
  return (items || [])
    .map((item) => `
      <tr>
        <td data-label="Pack"><code>${escapeHTML(item?.packId || "-")}</code></td>
        <td data-label="Label">${escapeHTML(item?.label || "-")}</td>
        <td data-label="Version"><code>${escapeHTML(item?.version || "unversioned")}</code></td>
        <td data-label="Source Ref">${item?.sourceRef ? `<code>${escapeHTML(item.sourceRef)}</code>` : "-"}</td>
        <td data-label="Stable Ref">${item?.stableRef ? `<code>${escapeHTML(item.stableRef)}</code>` : "-"}</td>
        <td data-label="Rigor Contract">
          <div>schema=${escapeHTML(item?.schemaReadiness || "unknown")}; compile=${escapeHTML(item?.compileReadiness || "unknown")}</div>
          <div>target=${escapeHTML(item?.activationTarget || "workspace")}; posture=${escapeHTML(item?.activationPosture || "available")}</div>
        </td>
        <td data-label="Role Bundles">${renderDelimitedCodeList(item?.roleBundles || [])}</td>
        <td data-label="Decision Surfaces">${renderDelimitedCodeList(item?.decisionSurfaces || [])}</td>
        <td data-label="Boundary Requirements">${renderDelimitedCodeList(item?.boundaryRequirements || [])}</td>
      </tr>
    `)
    .join("");
}

export function createPolicySettingsSnapshot(settings = {}) {
  const runtimeIdentity =
    settings?.identity && typeof settings.identity === "object" ? settings.identity : {};
  const policyCatalog =
    settings?.policyCatalog && typeof settings.policyCatalog === "object" ? settings.policyCatalog : {};
  const policyCatalogItems = Array.isArray(policyCatalog.items)
    ? policyCatalog.items.map((item, index) => normalizePolicyCatalogItem(item, index))
    : [];
  const activePolicyPack =
    policyCatalogItems.find((item) => ["current", "active", "applied"].includes(String(item?.activationPosture || "").trim().toLowerCase())) ||
    policyCatalogItems[0] ||
    {};
  return {
    runtimeIdentity,
    policyCatalog,
    policyCatalogItems,
    activePolicyPack
  };
}

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readStringArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
}

function uniqueCountFromItems(items = [], key) {
  const values = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    for (const value of readStringArray(item?.[key])) {
      values.add(value);
    }
  }
  return values.size;
}

function countItemsMissingList(items = [], key) {
  return (Array.isArray(items) ? items : []).filter((item) => readStringArray(item?.[key]).length === 0).length;
}

function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizePolicyAdminFeedback(feedback = null) {
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

function normalizePolicyAdminDecision(decision = null) {
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

function normalizePolicyAdminReceipt(receipt = null) {
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

function normalizePolicyAdminExecution(execution = null) {
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

function normalizePolicyAdminRollback(rollback = null) {
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

function normalizePolicyAdminVerification(verification = null) {
  if (!verification || typeof verification !== "object") {
    return null;
  }
  const summary = normalizeString(verification.summary);
  const diffSummary = normalizeString(verification.diffSummary);
  const findings = Array.isArray(verification.findings)
    ? verification.findings.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
  const cases = Array.isArray(verification.cases)
    ? verification.cases
        .map((entry) => {
          const item = entry && typeof entry === "object" ? entry : {};
          const label = normalizeString(item.label);
          const status = normalizeString(item.status).toLowerCase();
          const detail = normalizeString(item.detail);
          if (!label && !status && !detail) {
            return null;
          }
          return {
            label: label || "case",
            status: status || "unknown",
            detail
          };
        })
        .filter(Boolean)
    : [];
  if (!summary && !diffSummary && findings.length === 0 && cases.length === 0) {
    return null;
  }
  return {
    changeId: normalizeString(verification.changeId),
    kind: normalizeString(verification.kind, "policy").toLowerCase(),
    tone: normalizeString(verification.tone, "info").toLowerCase(),
    title: normalizeString(verification.title, "Policy verify gate"),
    summary,
    updatedAt: normalizeString(verification.updatedAt),
    verifiedAt: normalizeString(verification.verifiedAt),
    compileStatus: normalizeString(verification.compileStatus, "unknown").toLowerCase(),
    lintStatus: normalizeString(verification.lintStatus, "unknown").toLowerCase(),
    goldenStatus: normalizeString(verification.goldenStatus, "unknown").toLowerCase(),
    passing: verification.passing === true,
    diffSummary,
    findings,
    cases
  };
}

function normalizePolicyAdminDraft(draft = null, defaults = {}) {
  const input = draft && typeof draft === "object" ? draft : {};
  return {
    changeKind: normalizeString(input.changeKind || defaults.changeKind, "load").toLowerCase(),
    packId: normalizeString(input.packId || defaults.packId),
    providerId: normalizeString(input.providerId || defaults.providerId),
    targetScope: normalizeString(input.targetScope || defaults.targetScope, "workspace"),
    reason: normalizeString(input.reason)
  };
}

function normalizePolicyAdminQueueItems(items = []) {
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
        ownerDomain: normalizeString(entry.ownerDomain || entry.domain, "policyops").toLowerCase(),
        kind: normalizeString(entry.kind, "policy").toLowerCase(),
        label: normalizeString(entry.label, "Policy Pack Load And Activation Draft"),
        requestedAction: normalizeString(entry.requestedAction, "proposal"),
        subjectId: normalizeString(entry.subjectId, "-"),
        subjectLabel: normalizeString(entry.subjectLabel, "pack").toLowerCase(),
        targetScope: normalizeString(entry.targetScope, "-"),
        targetLabel: normalizeString(entry.targetLabel, "scope").toLowerCase(),
        changeKind: normalizeString(entry.changeKind, "load").toLowerCase(),
        packId: normalizeString(entry.packId),
        providerId: normalizeString(entry.providerId),
        status: normalizeString(entry.status, "draft").toLowerCase(),
        reason: normalizeString(entry.reason),
        summary: normalizeString(entry.summary),
        simulationSummary: normalizeString(entry.simulationSummary),
        verification: normalizePolicyAdminVerification(entry.verification || null),
        createdAt: normalizeString(entry.createdAt),
        simulatedAt: normalizeString(entry.simulatedAt),
        updatedAt: normalizeString(entry.updatedAt),
        routedAt: normalizeString(entry.routedAt),
        decision: normalizePolicyAdminDecision(entry.decision || null),
        execution: normalizePolicyAdminExecution(entry.execution || null),
        receipt: normalizePolicyAdminReceipt(entry.receipt || null),
        rollback: normalizePolicyAdminRollback(entry.rollback || null)
      };
    })
    .filter(Boolean);
}

function normalizePolicyAdminSimulation(simulation = null) {
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
    kind: normalizeString(simulation.kind, "policy").toLowerCase(),
    tone: normalizeString(simulation.tone, "info").toLowerCase(),
    title: title || "Policy admin dry-run",
    summary,
    updatedAt: normalizeString(simulation.updatedAt),
    facts,
    findings
  };
}

export function derivePolicyRichness(run) {
  const requestPayload = readObject(run?.requestPayload);
  const requestMeta = readObject(requestPayload.meta);
  const requestActor = readObject(requestMeta.actor);
  const requestSubject = readObject(requestPayload.subject);
  const requestSubjectAttributes = readObject(requestSubject.attributes);
  const requestAction = readObject(requestPayload.action);
  const requestContext = readObject(requestPayload.context);
  const requestGoverned = readObject(requestContext.governed_action);
  const actorAuthority = readObject(requestContext.actor_authority);
  const governedAuthority = readObject(requestGoverned.authority_context);
  const requestPolicy = readObject(requestContext.review_signals || requestContext.policy_stratification);
  const requestTask = readObject(requestPayload.task);
  const policyResponse = readObject(run?.policyResponse);
  const policyOutput = readObject(policyResponse.output);
  const providerOutput = readObject(policyOutput.premiumProvider || policyOutput.providerRoute || policyOutput.aimxs);
  const providerMeta = readObject(providerOutput.providerMeta);
  const providerPolicy = readObject(providerMeta.review_signals || providerMeta.policy_stratification);
  const requestContract = readObject(providerMeta.request_contract);
  const providerCurrentState = readObject(providerMeta.current_state);
  const providerContinuity = readObject(providerMeta.state_continuity);
  const providerAuditSink = readObject(providerMeta.audit_sink);
  const outputContract = readObject(providerOutput.requestContract);
  const evidence = readObject(providerOutput.evidence);
  const financeOrder = readObject(requestGoverned.finance_order);
  const reasons = Array.isArray(policyResponse.reasons) ? policyResponse.reasons : [];
  const firstReason = readObject(reasons[0]);
  const requiredGrants = readStringArray(requestPolicy.required_reviews || requestPolicy.required_grants);
  const authorityRoles = readStringArray(actorAuthority.roles).length
    ? readStringArray(actorAuthority.roles)
    : readStringArray(governedAuthority.roles);
  const authorityTenantScopes = readStringArray(actorAuthority.tenant_scopes).length
    ? readStringArray(actorAuthority.tenant_scopes)
    : readStringArray(governedAuthority.tenant_scopes);
  const authorityProjectScopes = readStringArray(actorAuthority.project_scopes).length
    ? readStringArray(actorAuthority.project_scopes)
    : readStringArray(governedAuthority.project_scopes);
  const evidenceRefs = readStringArray(policyResponse.evidenceRefs);
  const contractId = String(requestGoverned.contract_id || requestContract.contract_id || outputContract.contract_id || "").trim();
  const providerId = String(
    providerOutput.providerId ||
      providerMeta.providerId ||
      policyResponse.source ||
      run?.selectedPolicyProvider ||
      ""
  ).trim();
  const decision = String(policyResponse.decision || run?.policyDecision || "").trim().toUpperCase();
  const decisionPath = String(providerMeta.decision_path || "").trim();
  const evidenceHash = String(evidence.evidence_hash || evidence.evidenceHash || "").trim();
  const policyStratificationPresent =
    Object.keys(providerPolicy).length > 0 ||
    Object.keys(readObject(providerOutput.reviewSignals || providerOutput.policyStratification)).length > 0;
  const requestContractEchoPresent =
    Object.keys(requestContract).length > 0 || Object.keys(outputContract).length > 0;

  return {
    isGovernedAction: Object.keys(requestGoverned).length > 0 || contractId.length > 0,
    contractId,
    workflowKind: String(requestGoverned.workflow_kind || outputContract.workflow_kind || "").trim(),
    requestLabel: String(requestGoverned.request_label || requestTask.requestLabel || "").trim(),
    demoProfile: String(requestGoverned.demo_profile || requestTask.demoProfile || "").trim(),
    requestSummary: String(requestGoverned.request_summary || requestTask.summary || requestTask.intent || "").trim(),
    environment: String(requestMeta.environment || "").trim(),
    actionType: String(requestAction.type || "").trim(),
    actionVerb: String(requestAction.verb || "").trim(),
    approvedForProd: requestSubjectAttributes.approvedForProd === true,
    boundaryClass: String(requestPolicy.boundary_class || providerPolicy.boundary_class || "").trim(),
    riskTier: String(
      requestPolicy.review_tier || requestPolicy.risk_tier || providerPolicy.review_tier || providerPolicy.risk_tier || ""
    ).trim(),
    requiredGrants,
    evidenceReadiness: String(
      requestPolicy.readiness_state ||
        requestPolicy.evidence_readiness ||
        providerPolicy.readiness_state ||
        providerPolicy.evidence_readiness ||
        ""
    ).trim(),
    handshakeRequired:
      requestPolicy?.gates?.handoff_required === true ||
      requestPolicy?.gates?.["core14.adapter_present.enforce_handshake"] === true,
    actorSubject: String(actorAuthority.subject || requestActor.subject || governedAuthority.subject || "").trim(),
    actorClientId: String(actorAuthority.client_id || requestActor.clientId || governedAuthority.client_id || "").trim(),
    authorityBasis: String(actorAuthority.authority_basis || requestActor.authorityBasis || governedAuthority.authority_basis || "").trim(),
    authnMethod: String(actorAuthority.authn || requestActor.authn || governedAuthority.authn || "").trim(),
    authorityRoles,
    authorityTenantScopes,
    authorityProjectScopes,
    decision,
    providerId,
    decisionPath,
    baakEngaged: providerMeta.baak_engaged === true,
    adapterStatus: String(providerMeta.adapter_status || "").trim(),
    adapterErrorCode: String(providerMeta.adapter_error_code || "").trim(),
    baseAdapterPresent: providerMeta.base_adapter_present !== false,
    grantTokenPresent: run?.policyGrantTokenPresent === true || policyResponse.grantTokenPresent === true,
    policyStratificationPresent,
    requestContractEchoPresent,
    currentStatePresent: providerCurrentState.present === true,
    currentStateHash: String(providerCurrentState.sha256 || "").trim(),
    continuityEnabled: providerContinuity.continuity_enabled === true,
    kernelStateInPresent: Boolean(String(providerContinuity.kernel_state_in_sha256 || "").trim()),
    kernelStateOutPresent:
      providerContinuity.kernel_state_out_present === true ||
      Boolean(String(providerContinuity.kernel_state_out_sha256 || "").trim()),
    auditSinkActive: providerAuditSink.active === true,
    auditEventRef: String(providerAuditSink.event_ref || "").trim(),
    evidenceHash,
    evidenceRefCount: evidenceRefs.length,
    evidenceRefs,
    firstReason: String(firstReason.message || firstReason.code || "").trim(),
    financeOrder,
    operatorApprovalRequired:
      requestGoverned.operator_approval_required === true ||
      requestPayload?.annotations?.governedAction?.operatorApprovalRequired === true
  };
}

export function derivePolicyOutcomePresentation(run, policyRichness = {}) {
  const decision = String(policyRichness?.decision || run?.policyDecision || "").trim().toUpperCase();
  const provider = displayPolicyProviderLabel(policyRichness?.providerId || run?.selectedPolicyProvider || "");
  const primaryReason = String(policyRichness?.firstReason || "").trim();
  if (decision === "ALLOW") {
    return {
      decision,
      provider,
      effectLabel: "policy cleared",
      bannerClass: "policy-outcome-banner is-allow",
      headline: `${provider || "Policy provider"} cleared the request.`,
      detail: primaryReason || "This request passed policy evaluation and is ready for the next execution stage."
    };
  }
  if (decision === "DEFER") {
    return {
      decision,
      provider,
      effectLabel: "execution deferred",
      bannerClass: "policy-outcome-banner is-defer",
      headline: `${provider || "Policy provider"} deferred the request.`,
      detail:
        primaryReason || "The request is deferred pending additional grants, evidence, or other governance readiness."
    };
  }
  if (decision === "DENY") {
    return {
      decision,
      provider,
      effectLabel: "policy blocked",
      bannerClass: "policy-outcome-banner is-deny",
      headline: `${provider || "Policy provider"} blocked the request.`,
      detail: primaryReason || "The request failed policy evaluation and should not proceed."
    };
  }
  return {
    decision,
    provider,
    effectLabel: "policy pending",
    bannerClass: "policy-outcome-banner",
    headline: "The provider outcome is still pending.",
    detail: primaryReason || "Review the stored run response before treating this request as cleared."
  };
}

export function chipClassForPolicyEffect(outcome = {}) {
  return `${chipClassForStatus(outcome?.decision || "")} chip-compact`;
}

function latestTimestampValue(run) {
  const raw = String(run?.updatedAt || run?.createdAt || run?.startedAt || "").trim();
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : -1;
}

function selectLatestPolicyRun(items = []) {
  const values = Array.isArray(items) ? items.filter((item) => item && typeof item === "object") : [];
  const ranked = values
    .map((run) => ({
      run,
      richness: derivePolicyRichness(run),
      timestamp: latestTimestampValue(run)
    }))
    .filter(
      ({ run, richness }) =>
        richness.isGovernedAction ||
        Boolean(String(run?.policyDecision || "").trim()) ||
        Boolean(String(run?.selectedPolicyProvider || "").trim())
    )
    .sort((left, right) => right.timestamp - left.timestamp);
  return ranked[0] || null;
}

function buildPolicyScopeLabel(tenantValues = [], projectValues = []) {
  const tenant = readStringArray(tenantValues)[0] || "";
  const project = readStringArray(projectValues)[0] || "";
  if (tenant && project) {
    return `${tenant} / ${project}`;
  }
  return tenant || project || "workspace";
}

export function createPolicyWorkspaceSnapshot(context = {}) {
  const settings = context?.settings && typeof context.settings === "object" ? context.settings : {};
  const runs = context?.runs && typeof context.runs === "object" ? context.runs : {};
  const viewState = context?.viewState && typeof context.viewState === "object" ? context.viewState : {};
  const { runtimeIdentity, policyCatalog, policyCatalogItems, activePolicyPack } = createPolicySettingsSnapshot(settings);
  const latestPolicyRun = selectLatestPolicyRun(runs.items || []);
  const decisionRichness = latestPolicyRun ? latestPolicyRun.richness : null;
  const decisionOutcome =
    latestPolicyRun && decisionRichness
      ? derivePolicyOutcomePresentation(latestPolicyRun.run, decisionRichness)
      : null;
  const activePack = activePolicyPack || {};
  const feedbackMessage = String(viewState?.feedback?.message || "").trim();
  const simulationRefreshedAt = String(viewState?.simulationRefreshedAt || "").trim();
  const providerId = String(
    settings?.aimxs?.activation?.selectedProviderId ||
      decisionRichness?.providerId ||
      latestPolicyRun?.run?.selectedPolicyProvider ||
      ""
  ).trim();
  const runtimeIdentityActor =
    runtimeIdentity?.identity && typeof runtimeIdentity.identity === "object" ? runtimeIdentity.identity : {};
  const defaultTargetScope = buildPolicyScopeLabel(
    decisionRichness?.authorityTenantScopes || runtimeIdentityActor?.tenantIds,
    decisionRichness?.authorityProjectScopes || runtimeIdentityActor?.projectIds
  );
  const adminDefaults = {
    changeKind: "load",
    packId: String(activePack?.packId || "").trim(),
    providerId,
    targetScope: defaultTargetScope
  };
  const adminQueueItems = normalizePolicyAdminQueueItems(viewState?.queueItems || []);
  const selectedAdminChangeId = normalizeString(viewState?.selectedAdminChangeId);
  const selectedAdminQueueItem =
    adminQueueItems.find((item) => item.id === selectedAdminChangeId) ||
    adminQueueItems.find((item) => item.status === "routed") ||
    adminQueueItems.find((item) => item.status === "verified") ||
    adminQueueItems.find((item) => item.status === "verification_failed") ||
    adminQueueItems.find((item) => item.status === "simulated") ||
    adminQueueItems[0] ||
    null;
  const latestAdminVerification =
    normalizePolicyAdminVerification(viewState?.latestVerification || null) ||
    normalizePolicyAdminVerification(selectedAdminQueueItem?.verification || null);
  const targetPackId = normalizeString(selectedAdminQueueItem?.packId || viewState?.adminDraft?.packId || adminDefaults.packId);
  const targetPolicyPack =
    policyCatalogItems.find((item) => item.packId === targetPackId) ||
    normalizePolicyCatalogItem(
      {
        packId: targetPackId,
        label: targetPackId,
        activationTarget: selectedAdminQueueItem?.targetScope || viewState?.adminDraft?.targetScope || adminDefaults.targetScope
      },
      policyCatalogItems.length
    );
  const schemaReadyCount = policyCatalogItems.filter((item) =>
    ["ready", "declared"].includes(String(item?.schemaReadiness || "").trim().toLowerCase())
  ).length;
  const compileReadyCount = policyCatalogItems.filter((item) =>
    ["ready", "conditional"].includes(String(item?.compileReadiness || "").trim().toLowerCase())
  ).length;
  const packsMissingStableRefs = policyCatalogItems.filter((item) => !normalizeString(item?.stableRef)).length;
  const packsMissingVersions = policyCatalogItems.filter((item) => !normalizeString(item?.version) || item.version === "unversioned").length;
  const stableReferences = {
    contractId: String(decisionRichness?.contractId || "").trim(),
    runId: String(latestPolicyRun?.run?.runId || "").trim(),
    providerId: String(decisionRichness?.providerId || latestPolicyRun?.run?.selectedPolicyProvider || providerId).trim(),
    packId: String(activePack?.packId || "").trim(),
    packVersion: String(activePack?.version || "").trim(),
    packStableRef: String(activePack?.stableRef || "").trim(),
    packSourceRef: String(activePack?.sourceRef || "").trim(),
    boundaryClass: String(decisionRichness?.boundaryClass || "").trim(),
    riskTier: String(decisionRichness?.riskTier || "").trim(),
    auditEventRef: String(decisionRichness?.auditEventRef || "").trim()
  };

  const snapshot = {
    aimxsPremiumVisible: isAimxsPremiumVisible(settings),
    feedback: feedbackMessage
      ? {
          tone: String(viewState?.feedback?.tone || "info").trim().toLowerCase(),
          message: feedbackMessage
        }
      : null,
    stableReferences,
    settings,
    runtimeIdentity,
    policyCatalog,
    policyCatalogItems,
    currentContract: {
      providerLabel: policyProviderLabel(settings),
      providerId,
      mode: displayAimxsModeLabel(String(settings?.aimxs?.mode || "").trim()),
      catalogSource: summarizePolicyDataSource(policyCatalog?.source || "unknown"),
      packCount: policyCatalog?.count || policyCatalogItems.length || 0,
      policyMatrixRequired: Boolean(runtimeIdentity?.policyMatrixRequired),
      policyRuleCount: runtimeIdentity?.policyRuleCount || 0,
      activePackId: String(activePack?.packId || "").trim(),
      activePackLabel: String(activePack?.label || "").trim(),
      activePackVersion: String(activePack?.version || "").trim(),
      activePackSourceRef: String(activePack?.sourceRef || "").trim(),
      activePackStableRef: String(activePack?.stableRef || "").trim(),
      activePackSchemaReadiness: String(activePack?.schemaReadiness || "").trim(),
      activePackCompileReadiness: String(activePack?.compileReadiness || "").trim(),
      activeActivationTarget: String(activePack?.activationTarget || "").trim(),
      activeActivationPosture: String(activePack?.activationPosture || "").trim()
    },
    decisionExplanation: {
      available: Boolean(latestPolicyRun),
      runId: String(latestPolicyRun?.run?.runId || "").trim(),
      updatedAt: String(latestPolicyRun?.run?.updatedAt || "").trim(),
      selectedPolicyProvider: String(latestPolicyRun?.run?.selectedPolicyProvider || "").trim(),
      activePackId: String(activePack?.packId || "").trim(),
      activePackLabel: String(activePack?.label || "").trim(),
      exportable: Boolean(latestPolicyRun && decisionRichness && decisionOutcome),
      outcome: decisionOutcome,
      richness: decisionRichness
    },
    policyCoverage: {
      available: (policyCatalog?.count || policyCatalogItems.length || 0) > 0 || Boolean(latestPolicyRun),
      packCount: policyCatalog?.count || policyCatalogItems.length || 0,
      roleBundleCount: uniqueCountFromItems(policyCatalogItems, "roleBundles"),
      decisionSurfaceCount: uniqueCountFromItems(policyCatalogItems, "decisionSurfaces"),
      boundaryRequirementCount: uniqueCountFromItems(policyCatalogItems, "boundaryRequirements"),
      packsMissingRoleBundles: countItemsMissingList(policyCatalogItems, "roleBundles"),
      packsMissingDecisionSurfaces: countItemsMissingList(policyCatalogItems, "decisionSurfaces"),
      packsMissingBoundaryRequirements: countItemsMissingList(policyCatalogItems, "boundaryRequirements"),
      schemaReadyCount,
      compileReadyCount,
      packsMissingStableRefs,
      packsMissingVersions,
      latestDecisionCaptured: Boolean(decisionRichness?.decision),
      latestContractCaptured: Boolean(decisionRichness?.contractId),
      latestRationaleCaptured: Boolean(decisionRichness?.firstReason),
      latestEvidenceCaptured: Boolean(decisionRichness?.evidenceRefCount),
      gapCount:
        countItemsMissingList(policyCatalogItems, "roleBundles") +
        countItemsMissingList(policyCatalogItems, "decisionSurfaces") +
        countItemsMissingList(policyCatalogItems, "boundaryRequirements") +
        (decisionRichness?.decision ? 0 : 1) +
        (decisionRichness?.contractId ? 0 : 1) +
        (decisionRichness?.firstReason ? 0 : 1),
      tone:
        (policyCatalog?.count || policyCatalogItems.length || 0) === 0 && !latestPolicyRun
          ? "neutral"
          : (policyCatalog?.count || policyCatalogItems.length || 0) === 0
          ? "warn"
          : countItemsMissingList(policyCatalogItems, "roleBundles") +
                countItemsMissingList(policyCatalogItems, "decisionSurfaces") +
                countItemsMissingList(policyCatalogItems, "boundaryRequirements") >
              0
            ? "warn"
            : "ok"
    },
    policySimulation: {
      available: Boolean(latestPolicyRun && decisionRichness),
      refreshable: Boolean(latestPolicyRun && decisionRichness),
      lastRefreshedAt: simulationRefreshedAt,
      source: latestPolicyRun ? "latest governed run replay" : "-",
      decision: String(decisionRichness?.decision || "").trim().toUpperCase(),
      providerLabel: displayPolicyProviderLabel(
        decisionRichness?.providerId || latestPolicyRun?.run?.selectedPolicyProvider || policyProviderLabel(settings)
      ),
      activePackId: String(activePack?.packId || "").trim(),
      activePackLabel: String(activePack?.label || "").trim(),
      environment: String(decisionRichness?.environment || "").trim(),
      riskTier: String(decisionRichness?.riskTier || "").trim(),
      boundaryClass: String(decisionRichness?.boundaryClass || "").trim(),
      requiredGrantCount: Array.isArray(decisionRichness?.requiredGrants) ? decisionRichness.requiredGrants.length : 0,
      operatorApprovalRequired: decisionRichness?.operatorApprovalRequired === true,
      evidenceReadiness: String(decisionRichness?.evidenceReadiness || "").trim(),
      blockerCount:
        (Array.isArray(decisionRichness?.requiredGrants) ? decisionRichness.requiredGrants.length : 0) +
        (decisionRichness?.operatorApprovalRequired === true ? 1 : 0) +
        (String(decisionRichness?.evidenceReadiness || "").trim().toLowerCase() === "complete" ? 0 : 1),
      expectedOutcome:
        String(decisionRichness?.decision || "").trim().toUpperCase() || "UNSET",
      nextAction:
        String(decisionRichness?.decision || "").trim().toUpperCase() === "ALLOW"
          ? "Execution may proceed under the current policy contract."
          : String(decisionRichness?.decision || "").trim().toUpperCase() === "DEFER"
            ? "Resolve the remaining approval, grant, or evidence blockers before execution."
            : String(decisionRichness?.decision || "").trim().toUpperCase() === "DENY"
              ? "Adjust the request or policy inputs before retrying."
              : "No bounded simulation can be derived from the current policy inputs.",
      tone:
        !latestPolicyRun || !decisionRichness
          ? "neutral"
          : String(decisionRichness?.decision || "").trim().toUpperCase() === "ALLOW"
            ? "ok"
            : String(decisionRichness?.decision || "").trim().toUpperCase() === "DEFER"
              ? "warn"
              : String(decisionRichness?.decision || "").trim().toUpperCase() === "DENY"
                ? "danger"
              : "neutral"
    },
    admin: {
      feedback: normalizePolicyAdminFeedback(viewState?.feedback || null),
      selectedChangeId: selectedAdminQueueItem ? selectedAdminQueueItem.id : selectedAdminChangeId,
      selectedQueueItem: selectedAdminQueueItem,
      recoveryReason: normalizeString(viewState?.recoveryReason),
      queueItems: adminQueueItems,
      draft: normalizePolicyAdminDraft(viewState?.adminDraft || {}, adminDefaults),
      latestSimulation: normalizePolicyAdminSimulation(viewState?.latestSimulation || null),
      latestVerification: latestAdminVerification,
      currentScope: {
        currentPackId: String(activePack?.packId || "").trim() || "-",
        currentPackLabel: String(activePack?.label || "").trim() || "-",
        currentPackVersion: String(activePack?.version || "").trim() || "unversioned",
        currentPackSourceRef: String(activePack?.sourceRef || "").trim() || "-",
        currentPackStableRef: String(activePack?.stableRef || "").trim() || "-",
        currentActivationTarget: String(activePack?.activationTarget || "").trim() || "workspace",
        currentActivationPosture: String(activePack?.activationPosture || "").trim() || "available",
        currentSchemaReadiness: String(activePack?.schemaReadiness || "").trim() || "unknown",
        currentCompileReadiness: String(activePack?.compileReadiness || "").trim() || "unknown",
        currentProviderId: providerId || "-",
        currentProviderLabel: policyProviderLabel(settings),
        defaultTargetScope,
        contractId: String(decisionRichness?.contractId || "").trim() || "-",
        boundaryClass: String(decisionRichness?.boundaryClass || "").trim() || "-",
        riskTier: String(decisionRichness?.riskTier || "").trim() || "-",
        latestDecision: String(decisionRichness?.decision || "").trim().toUpperCase() || "-",
        latestRunId: String(latestPolicyRun?.run?.runId || "").trim() || "-",
        catalogSource: summarizePolicyDataSource(policyCatalog?.source || "unknown"),
        packCount: policyCatalog?.count || policyCatalogItems.length || 0,
        decisionSurfaceCount: uniqueCountFromItems(policyCatalogItems, "decisionSurfaces"),
        boundaryRequirementCount: uniqueCountFromItems(policyCatalogItems, "boundaryRequirements"),
        packsMissingDecisionSurfaces: countItemsMissingList(policyCatalogItems, "decisionSurfaces"),
        packsMissingBoundaryRequirements: countItemsMissingList(policyCatalogItems, "boundaryRequirements"),
        schemaReadyCount,
        compileReadyCount,
        packsMissingStableRefs,
        packsMissingVersions,
        targetPackId: String(targetPolicyPack?.packId || "").trim() || "-",
        targetPackLabel: String(targetPolicyPack?.label || "").trim() || "-",
        targetPackVersion: String(targetPolicyPack?.version || "").trim() || "unversioned",
        targetPackSourceRef: String(targetPolicyPack?.sourceRef || "").trim() || "-",
        targetPackStableRef: String(targetPolicyPack?.stableRef || "").trim() || "-",
        targetActivationTarget:
          normalizeString(selectedAdminQueueItem?.targetScope || viewState?.adminDraft?.targetScope) ||
          String(targetPolicyPack?.activationTarget || "").trim() ||
          defaultTargetScope,
        targetActivationPosture:
          String(targetPolicyPack?.activationPosture || "").trim() ||
          normalizeString(selectedAdminQueueItem?.status || viewState?.adminDraft?.changeKind, "draft"),
        targetSchemaReadiness: String(targetPolicyPack?.schemaReadiness || "").trim() || "unknown",
        targetCompileReadiness: String(targetPolicyPack?.compileReadiness || "").trim() || "unknown",
        providerOptions: [
          ...new Set(
            [
              providerId,
              String(decisionRichness?.providerId || "").trim(),
              String(latestPolicyRun?.run?.selectedPolicyProvider || "").trim()
            ].filter(Boolean)
          )
        ]
      }
    }
  };
  snapshot.aimxsIdentityPosture = buildPolicyAimxsIdentityPosture(snapshot);
  return snapshot;
}

function policyAimxsTone(value = "") {
  const normalized = normalizeString(value).toLowerCase();
  if (["allow", "allowed", "applied", "current", "ready", "verified"].includes(normalized)) {
    return "ok";
  }
  if (["blocked", "deny", "denied", "failed", "verification_failed"].includes(normalized)) {
    return "danger";
  }
  if (["defer", "deferred", "pending", "review", "simulated", "watch"].includes(normalized)) {
    return "warn";
  }
  return "neutral";
}

function buildPolicyAimxsIdentityPosture(snapshot = {}) {
  const explanation = snapshot?.decisionExplanation || {};
  const richness = explanation?.richness || {};
  const simulation = snapshot?.policySimulation || {};
  const admin = snapshot?.admin || {};
  const premiumVisible = Boolean(snapshot?.aimxsPremiumVisible);
  const selectedItem = admin?.selectedQueueItem || null;
  const draft = admin?.draft || {};
  const authorityTier = inferAimxsAuthorityTierFromRoles(
    richness?.authorityRoles,
    richness?.operatorApprovalRequired ? "approval_gated_supervisor" : "workspace_operator"
  );
  const currentBadge = normalizeString(richness?.decision, "watch").toLowerCase();
  const targetBadge = normalizeString(selectedItem?.status, selectedItem ? "watch" : draft?.changeKind || "draft").toLowerCase();
  const rationaleBadge = normalizeString(richness?.decision, targetBadge).toLowerCase();
  const requiredGrants = Array.isArray(richness?.requiredGrants) ? richness.requiredGrants : [];
  const currentScope =
    [richness?.authorityTenantScopes?.[0], richness?.authorityProjectScopes?.[0]]
      .filter((value) => normalizeString(value))
      .join(" / ") ||
    draft?.targetScope ||
    "workspace";

  return createAimxsIdentityPostureModel({
    summary:
      premiumVisible
        ? "This read-only premium posture echo makes richer decision rationale, authority basis, and governed outcome posture legible from PolicyOps without adding another write surface."
        : "This read-only echo makes the current decision and authority posture legible from PolicyOps without adding another write surface.",
    surfaceLabel: premiumVisible ? "premium read-only echo" : "read-only echo",
    identitySectionTitle: premiumVisible ? "Identity And Authority Basis" : "Identity And Authority",
    currentPostureTitle: premiumVisible ? "Current Authority Posture" : "Current Posture",
    targetPostureTitle: premiumVisible ? "Target Authority Posture" : "Target Posture",
    rationaleTitle: premiumVisible ? "Decision Rationale" : "Allowed Or Blocked",
    identityFields: [
      createAimxsField("identity class", "governed action authority"),
      createAimxsField("actor", richness?.actorSubject || "-", true),
      createAimxsField("client", richness?.actorClientId || "-", true),
      createAimxsField("authority tier", authorityTier),
      createAimxsField("authority basis", richness?.authorityBasis || "unknown"),
      createAimxsField(
        "delegation basis",
        richness?.operatorApprovalRequired
          ? premiumVisible
            ? "premium governance handshake"
            : "governance handshake"
          : requiredGrants.length
            ? premiumVisible
              ? "premium grant-bundle gate"
              : "grant-bundle gated"
            : premiumVisible
              ? "premium governed review"
              : "direct governed review"
      ),
      createAimxsField("grant basis", requiredGrants.length ? requiredGrants.join(", ") : "no additional grants declared", requiredGrants.length > 0),
      createAimxsField(
        "assurance posture",
        richness?.requestContractEchoPresent && richness?.currentStatePresent
          ? premiumVisible
            ? "authority and continuity echoed"
            : "continuity echoed"
          : premiumVisible
            ? "partial premium runtime echo"
            : "partial runtime echo"
      ),
      createAimxsField(
        "anomaly posture",
        richness?.adapterStatus || richness?.adapterErrorCode
          ? `${richness.adapterStatus || "provider"} ${richness.adapterErrorCode || ""}`.trim()
          : premiumVisible
            ? "no premium anomaly flag loaded"
            : "no anomaly flag loaded"
      )
    ].filter(Boolean),
    currentPosture: {
      badge: currentBadge,
      tone: policyAimxsTone(currentBadge),
      note: snapshot?.aimxsPremiumVisible
        ? "Current posture is derived from the latest governed-run replay and the active premium decision rationale."
        : "Current posture is derived from the latest governed-run replay and the current baseline decision explanation.",
      fields: [
        createAimxsField("current posture", richness?.decision || "unset"),
        createAimxsField("scope", currentScope, true),
        createAimxsField("boundary", richness?.boundaryClass || "-", true),
        createAimxsField("risk tier", richness?.riskTier || "-"),
        createAimxsField("decision provider", richness?.providerId || explanation?.selectedPolicyProvider || "-", true)
      ].filter(Boolean)
    },
    targetPosture: {
      badge: targetBadge,
      tone: policyAimxsTone(targetBadge),
      note:
        normalizeString(selectedItem?.summary) ||
        `Target policy posture is ${draft?.changeKind || "draft"} ${draft?.packId || "pack"} for ${draft?.targetScope || currentScope}.`,
      fields: [
        createAimxsField("target posture", draft?.changeKind ? `${draft.changeKind} policy pack` : "bounded policy draft"),
        createAimxsField("target pack", draft?.packId || selectedItem?.packId || "-", true),
        createAimxsField("target provider", draft?.providerId || selectedItem?.providerId || explanation?.selectedPolicyProvider || "-", true),
        createAimxsField("target scope", draft?.targetScope || selectedItem?.targetScope || currentScope, true),
        createAimxsField("requested action", selectedItem?.requestedAction || "")
      ].filter(Boolean)
    },
    rationale: {
      badge: rationaleBadge,
      tone: policyAimxsTone(rationaleBadge),
      note:
        (premiumVisible
          ? normalizeString(explanation?.outcome?.detail) || normalizeString(simulation?.nextAction)
          : normalizeString(simulation?.nextAction) || normalizeString(explanation?.outcome?.detail)) ||
        "The latest governed policy outcome defines whether the requested posture remains deferred, blocked, or ready.",
      fields: [
        createAimxsField("first reason", richness?.firstReason || ""),
        createAimxsField("required grants", requiredGrants.join(", "), requiredGrants.length > 0),
        createAimxsField("blocker count", String(simulation?.blockerCount || 0)),
        createAimxsField("audit ref", richness?.auditEventRef || "", true)
      ].filter(Boolean)
    }
  });
}
