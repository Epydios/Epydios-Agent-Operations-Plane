import {
  chipClassForStatus,
  displayPolicyProviderLabel,
  escapeHTML
} from "../../views/common.js";

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
    return displayPolicyProviderLabel("aimxs-policy-primary");
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

export function renderPolicyPackRows(items) {
  return (items || [])
    .map((item) => `
      <tr>
        <td data-label="Pack"><code>${escapeHTML(item?.packId || "-")}</code></td>
        <td data-label="Label">${escapeHTML(item?.label || "-")}</td>
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
  const policyCatalogItems = Array.isArray(policyCatalog.items) ? policyCatalog.items : [];
  return {
    runtimeIdentity,
    policyCatalog,
    policyCatalogItems
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
  const requestPolicy = readObject(requestContext.policy_stratification);
  const requestTask = readObject(requestPayload.task);
  const policyResponse = readObject(run?.policyResponse);
  const policyOutput = readObject(policyResponse.output);
  const aimxsOutput = readObject(policyOutput.aimxs);
  const providerMeta = readObject(aimxsOutput.providerMeta);
  const providerPolicy = readObject(providerMeta.policy_stratification);
  const requestContract = readObject(providerMeta.request_contract);
  const providerCurrentState = readObject(providerMeta.current_state);
  const providerContinuity = readObject(providerMeta.state_continuity);
  const providerAuditSink = readObject(providerMeta.audit_sink);
  const outputContract = readObject(aimxsOutput.requestContract);
  const evidence = readObject(aimxsOutput.evidence);
  const financeOrder = readObject(requestGoverned.finance_order);
  const reasons = Array.isArray(policyResponse.reasons) ? policyResponse.reasons : [];
  const firstReason = readObject(reasons[0]);
  const requiredGrants = readStringArray(requestPolicy.required_grants);
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
    aimxsOutput.providerId ||
      providerMeta.providerId ||
      policyResponse.source ||
      run?.selectedPolicyProvider ||
      ""
  ).trim();
  const decision = String(policyResponse.decision || run?.policyDecision || "").trim().toUpperCase();
  const decisionPath = String(providerMeta.decision_path || "").trim();
  const evidenceHash = String(evidence.evidence_hash || evidence.evidenceHash || "").trim();
  const policyStratificationPresent =
    Object.keys(providerPolicy).length > 0 || Object.keys(readObject(aimxsOutput.policyStratification)).length > 0;
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
    riskTier: String(requestPolicy.risk_tier || providerPolicy.risk_tier || "").trim(),
    requiredGrants,
    evidenceReadiness: String(requestPolicy.evidence_readiness || providerPolicy.evidence_readiness || "").trim(),
    handshakeRequired: requestPolicy?.gates?.["core14.adapter_present.enforce_handshake"] === true,
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
