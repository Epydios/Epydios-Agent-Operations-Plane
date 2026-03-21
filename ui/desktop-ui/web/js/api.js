import {
  normalizeAimxsActivationSnapshot,
  summarizeAimxsStatus
} from "./aimxs/state.js";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowISO() {
  return new Date().toISOString();
}

function plusSecondsISO(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function normalizeDecision(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "ALLOW" || normalized === "DENY") {
    return normalized;
  }
  return "";
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function summarizeRun(item) {
  return {
    runId: item.runId,
    requestId: item.requestId,
    tenantId: item.tenantId,
    projectId: item.projectId,
    environment: item.environment,
    retentionClass: item.retentionClass,
    expiresAt: item.expiresAt,
    status: item.status,
    selectedProfileProvider: item.selectedProfileProvider,
    selectedPolicyProvider: item.selectedPolicyProvider,
    selectedEvidenceProvider: item.selectedEvidenceProvider,
    selectedDesktopProvider: item.selectedDesktopProvider,
    policyDecision: item.policyDecision,
    policyBundleId: item.policyBundleId,
    policyBundleVersion: item.policyBundleVersion,
    policyGrantTokenPresent: Boolean(item.policyGrantTokenPresent),
    policyGrantTokenSha256: item.policyGrantTokenSha256,
    evidenceRecordStatus: String(item?.evidenceRecordResponse?.status || item?.evidenceRecordStatus || "").trim(),
    evidenceBundleStatus: String(item?.evidenceBundleResponse?.status || item?.evidenceBundleStatus || "").trim(),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function parseSummaryTime(value) {
  const ts = new Date(value || "").getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function pickLatestSummaryItem(items = [], timeFields = []) {
  const values = Array.isArray(items) ? items : [];
  let best = null;
  let bestTs = 0;
  for (const item of values) {
    const current = item && typeof item === "object" ? item : {};
    const ts = timeFields.reduce((max, field) => {
      const next = parseSummaryTime(current?.[field]);
      return next > max ? next : max;
    }, 0);
    if (!best || ts > bestTs) {
      best = current;
      bestTs = ts;
    }
  }
  return best || {};
}

function summarizeIdentityTraceRun(run = {}) {
  return {
    runId: String(run?.runId || "").trim(),
    requestId: String(run?.requestId || "").trim(),
    tenantId: String(run?.tenantId || "").trim(),
    projectId: String(run?.projectId || "").trim(),
    environment: String(run?.environment || "").trim(),
    status: String(run?.status || "").trim(),
    policyDecision: String(run?.policyDecision || "").trim(),
    selectedEvidenceProvider: String(run?.selectedEvidenceProvider || "").trim(),
    evidenceRecordStatus: String(run?.evidenceRecordStatus || run?.evidenceRecordResponse?.status || "").trim(),
    evidenceBundleStatus: String(run?.evidenceBundleStatus || run?.evidenceBundleResponse?.status || "").trim(),
    policyGrantTokenPresent: Boolean(run?.policyGrantTokenPresent),
    updatedAt: String(run?.updatedAt || run?.createdAt || "").trim()
  };
}

function summarizeIdentityTraceApproval(approval = {}) {
  return {
    approvalId: String(approval?.approvalId || "").trim(),
    runId: String(approval?.runId || "").trim(),
    status: String(approval?.status || "").trim(),
    tier: String(approval?.tier ?? "").trim(),
    targetExecutionProfile: String(approval?.targetExecutionProfile || "").trim(),
    reviewedAt: String(approval?.reviewedAt || "").trim(),
    createdAt: String(approval?.createdAt || "").trim(),
    expiresAt: String(approval?.expiresAt || "").trim()
  };
}

function summarizeIdentityTraceAudit(item = {}) {
  return {
    ts: String(item?.ts || "").trim(),
    event: String(item?.event || "").trim(),
    providerId: String(item?.providerId || "").trim(),
    decision: String(item?.decision || "").trim(),
    tenantId: String(item?.tenantId || "").trim(),
    projectId: String(item?.projectId || "").trim()
  };
}

function buildIdentityTraceabilitySnapshot(context = {}) {
  const runItems = Array.isArray(context?.runs?.items) ? context.runs.items : [];
  const approvalItems = Array.isArray(context?.approvals?.items) ? context.approvals.items : [];
  const auditItems = Array.isArray(context?.audit?.items) ? context.audit.items : [];
  const latestRun = summarizeIdentityTraceRun(pickLatestSummaryItem(runItems, ["updatedAt", "createdAt"]));
  const latestApproval = summarizeIdentityTraceApproval(
    pickLatestSummaryItem(approvalItems, ["reviewedAt", "createdAt", "expiresAt"])
  );
  const latestAudit = summarizeIdentityTraceAudit(pickLatestSummaryItem(auditItems, ["ts"]));
  return {
    runCount: Number(context?.runs?.count || runItems.length || 0),
    approvalCount: Number(context?.approvals?.count || approvalItems.length || 0),
    auditCount: Number(context?.audit?.count || auditItems.length || 0),
    latestRun,
    latestApproval,
    latestAudit
  };
}

function mockProviderList() {
  return {
    items: [
      {
        providerId: "oss-profile-static",
        providerType: "ProfileResolver",
        ready: true,
        probed: true,
        message: "Resolved",
        endpoint: "http://oss-profile-static-resolver.epydios-system.svc.cluster.local:8080"
      },
      {
        providerId: "oss-policy-opa",
        providerType: "PolicyProvider",
        ready: true,
        probed: true,
        message: "Resolved",
        endpoint: "http://epydios-oss-policy-provider.epydios-system.svc.cluster.local:8080"
      },
      {
        providerId: "oss-desktop-openfang-linux",
        providerType: "DesktopProvider",
        ready: true,
        probed: true,
        message: "External desktop endpoint",
        endpoint: "https://openfang.epydios-system.svc.cluster.local:8443"
      },
      {
        providerId: "aimxs-policy-primary",
        providerType: "PolicyProvider",
        ready: true,
        probed: true,
        message: "External AIMXS endpoint",
        endpoint: "https://aimxs-policy.epydios-system.svc.cluster.local:8443"
      }
    ]
  };
}

function mockHealth() {
  return {
    runtime: { status: "ok", detail: "Runtime API reachable." },
    providers: { status: "ok", detail: "Provider discovery reconciled." },
    policy: { status: "ok", detail: "Policy/evidence checks are operational." }
  };
}

function mockPipelineStatus() {
  return {
    environment: "staging",
    latestStagingGate: "staging-full-gate-20260304T140030Z.log",
    latestProdGate: "prod-full-gate-20260304T141122Z.log",
    status: "pass"
  };
}

function mockWorkerCapabilityCatalog() {
  return {
    source: "mock",
    count: 7,
    items: [
      {
        executionMode: "managed_codex_worker",
        workerType: "managed_agent",
        adapterId: "codex",
        label: "Managed Codex Worker",
        provider: "agentops_gateway",
        transport: "responses_api",
        model: "gpt-5-codex",
        boundaryRequirements: [
          "tenant_project_scope",
          "runtime_authz",
          "audit_emission",
          "agentops_gateway_boundary",
          "governed_tool_execution"
        ]
      },
      {
        executionMode: "raw_model_invoke",
        workerType: "model_invoke",
        adapterId: "codex",
        label: "OpenAI Codex",
        provider: "openai_compatible",
        transport: "responses_api",
        model: "gpt-5-codex",
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "gateway_or_direct_provider_boundary"]
      },
      {
        executionMode: "raw_model_invoke",
        workerType: "model_invoke",
        adapterId: "openai",
        label: "OpenAI",
        provider: "openai_responses",
        transport: "responses_api",
        model: "gpt-5",
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "gateway_or_direct_provider_boundary"]
      },
      {
        executionMode: "raw_model_invoke",
        workerType: "model_invoke",
        adapterId: "anthropic",
        label: "Anthropic",
        provider: "anthropic_messages",
        transport: "messages_api",
        model: "claude-sonnet-latest",
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "gateway_or_direct_provider_boundary"]
      },
      {
        executionMode: "raw_model_invoke",
        workerType: "model_invoke",
        adapterId: "google",
        label: "Google",
        provider: "google_gemini",
        transport: "gemini_api",
        model: "gemini-2.5-pro",
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "gateway_or_direct_provider_boundary"]
      },
      {
        executionMode: "raw_model_invoke",
        workerType: "model_invoke",
        adapterId: "azure_openai",
        label: "Azure OpenAI",
        provider: "azure_openai",
        transport: "chat_completions_api",
        model: "gpt-4.1",
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "gateway_or_direct_provider_boundary"]
      },
      {
        executionMode: "raw_model_invoke",
        workerType: "model_invoke",
        adapterId: "bedrock",
        label: "AWS Bedrock",
        provider: "aws_bedrock",
        transport: "bedrock_invoke_model",
        model: "anthropic.claude-3-7-sonnet",
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "gateway_or_direct_provider_boundary"]
      }
    ]
  };
}

function mockPolicyPackCatalog() {
  return {
    source: "mock",
    count: 3,
    items: [
      {
        packId: "read_only_review",
        label: "Read-Only Review",
        roleBundles: ["enterprise.observer", "enterprise.reviewer"],
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission"],
        decisionSurfaces: ["review_only"],
        clientSurfaces: ["chat", "vscode", "cli", "workflow", "chatops"],
        reportingSurfaces: ["update", "delta-update", "report"]
      },
      {
        packId: "governed_model_invoke_operator",
        label: "Governed Model Invoke Operator",
        applicableExecutionModes: ["raw_model_invoke"],
        applicableWorkerTypes: ["model_invoke"],
        applicableAdapterIDs: ["codex", "openai", "anthropic", "google", "azure_openai", "bedrock"],
        roleBundles: ["enterprise.operator", "enterprise.ai_operator"],
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "gateway_or_direct_provider_boundary"],
        decisionSurfaces: ["governed_turn_submission", "approval_checkpoint"],
        clientSurfaces: ["chat", "vscode", "cli", "workflow", "chatops"],
        reportingSurfaces: ["update", "delta-update", "report"]
      },
      {
        packId: "managed_codex_worker_operator",
        label: "Managed Codex Worker Operator",
        applicableExecutionModes: ["managed_codex_worker"],
        applicableWorkerTypes: ["managed_agent"],
        applicableAdapterIDs: ["codex"],
        roleBundles: ["enterprise.operator", "enterprise.ai_operator", "enterprise.worker_controller"],
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "agentops_gateway_boundary", "governed_tool_execution"],
        decisionSurfaces: ["managed_worker_launch", "managed_worker_recovery", "approval_checkpoint", "tool_proposal", "governed_tool_action"],
        clientSurfaces: ["chat", "vscode", "cli", "workflow", "chatops"],
        reportingSurfaces: ["update", "delta-update", "report"]
      }
    ]
  };
}

function mockRuntimeIdentity() {
  return {
    generatedAt: nowISO(),
    source: "mock",
    authEnabled: true,
    authenticated: true,
    authorityBasis: "mock_bearer_token_jwt",
    policyMatrixRequired: true,
    policyRuleCount: 3,
    roleClaim: "roles",
    clientIdClaim: "client_id",
    tenantClaim: "tenant_id",
    projectClaim: "project_id",
    identity: {
      subject: "demo.operator",
      clientId: "epydios-desktop-local",
      roles: ["runtime.admin", "enterprise.ai_operator"],
      tenantIds: ["tenant-local"],
      projectIds: ["project-local"],
      effectivePermissions: ["runtime.run.create", "runtime.run.read"],
      claimKeys: ["aud", "client_id", "project_id", "roles", "sub", "tenant_id"]
    }
  };
}

function mockExportProfileCatalog() {
  return {
    source: "mock",
    count: 10,
    items: [
      {
        exportProfile: "operator_review",
        label: "Operator Review",
        reportTypes: ["review", "report"],
        defaultAudience: "operator",
        allowedAudiences: ["operator", "security_review", "exec_review"],
        defaultRetentionClass: "standard",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: { security_review: "archive", exec_review: "archive" },
        clientSurfaces: ["chat", "vscode", "cli"],
        deliveryChannels: ["copy", "download", "report"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "operator_follow",
        label: "Operator Follow",
        reportTypes: ["delta-report", "follow"],
        defaultAudience: "operator",
        allowedAudiences: ["operator", "security_review"],
        defaultRetentionClass: "short",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { security_review: "standard" },
        clientSurfaces: ["chat", "vscode", "cli"],
        deliveryChannels: ["stream", "report"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "workflow_review",
        label: "Workflow Review",
        reportTypes: ["review", "report"],
        defaultAudience: "workflow_operator",
        allowedAudiences: ["workflow_operator", "security_review", "ticket_reviewer"],
        defaultRetentionClass: "standard",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: { security_review: "archive" },
        clientSurfaces: ["workflow"],
        deliveryChannels: ["comment", "update", "report"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "workflow_follow",
        label: "Workflow Follow",
        reportTypes: ["delta-report", "follow"],
        defaultAudience: "workflow_operator",
        allowedAudiences: ["workflow_operator", "ticket_reviewer"],
        defaultRetentionClass: "short",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { ticket_reviewer: "standard" },
        clientSurfaces: ["workflow"],
        deliveryChannels: ["update", "comment", "stream"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "conversation_review",
        label: "Conversation Review",
        reportTypes: ["review", "report"],
        defaultAudience: "conversation_operator",
        allowedAudiences: ["conversation_operator", "security_review", "channel_reviewer"],
        defaultRetentionClass: "standard",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: { security_review: "archive" },
        clientSurfaces: ["chatops"],
        deliveryChannels: ["update", "thread_reply", "report"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "conversation_follow",
        label: "Conversation Follow",
        reportTypes: ["delta-report", "follow"],
        defaultAudience: "conversation_operator",
        allowedAudiences: ["conversation_operator", "channel_reviewer"],
        defaultRetentionClass: "short",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { channel_reviewer: "standard" },
        clientSurfaces: ["chatops"],
        deliveryChannels: ["update", "thread_reply", "stream"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "audit_export",
        label: "Audit Export",
        reportTypes: ["export", "handoff"],
        defaultAudience: "downstream_review",
        allowedAudiences: ["downstream_review", "security_review", "compliance_review"],
        defaultRetentionClass: "archive",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: { downstream_review: "standard", security_review: "archive", compliance_review: "archive" },
        clientSurfaces: ["desktop"],
        deliveryChannels: ["download", "copy", "preview"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "audit_handoff",
        label: "Audit Handoff",
        reportTypes: ["handoff"],
        defaultAudience: "downstream_review",
        allowedAudiences: ["downstream_review", "security_review"],
        defaultRetentionClass: "short",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { security_review: "standard" },
        clientSurfaces: ["desktop"],
        deliveryChannels: ["copy", "preview"],
        redactionMode: "text"
      },
      {
        exportProfile: "incident_export",
        label: "Incident Export",
        reportTypes: ["export", "handoff"],
        defaultAudience: "incident_response",
        allowedAudiences: ["incident_response", "security_review", "executive_incident_review"],
        defaultRetentionClass: "archive",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: { incident_response: "standard", security_review: "archive", executive_incident_review: "archive" },
        clientSurfaces: ["desktop"],
        deliveryChannels: ["download", "copy", "preview"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "incident_handoff",
        label: "Incident Handoff",
        reportTypes: ["handoff"],
        defaultAudience: "incident_response",
        allowedAudiences: ["incident_response", "security_review"],
        defaultRetentionClass: "standard",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { security_review: "standard" },
        clientSurfaces: ["desktop"],
        deliveryChannels: ["copy", "preview"],
        redactionMode: "text"
      }
    ]
  };
}

function orgAdminEnforcementCategory(hookId) {
  switch (hookId) {
    case "delegated_admin_scope_guard":
    case "delegated_business_unit_scope_guard":
      return "delegated_admin";
    case "break_glass_timebox":
      return "break_glass";
    case "directory_sync_group_mapping":
    case "directory_sync_business_unit_mapping":
      return "directory_sync";
    case "regional_residency_guard":
    case "cross_border_exception_review":
    case "residency_policy_exception_review":
      return "residency";
    case "legal_hold_exception_review":
      return "legal_hold";
    case "org_quota_override_approval":
    case "business_unit_quota_override_approval":
    case "regional_quota_override_approval":
      return "quota";
    case "chargeback_override_audit":
      return "chargeback";
    default:
      return "admin";
  }
}

function orgAdminEnforcementLabel(hookId) {
  switch (hookId) {
    case "delegated_admin_scope_guard":
      return "Delegated Admin Scope Guard";
    case "delegated_business_unit_scope_guard":
      return "Delegated Business-Unit Scope Guard";
    case "break_glass_timebox":
      return "Break-Glass Timebox";
    case "directory_sync_group_mapping":
      return "Directory Sync Group Mapping";
    case "directory_sync_business_unit_mapping":
      return "Directory Sync Business-Unit Mapping";
    case "regional_residency_guard":
      return "Regional Residency Guard";
    case "cross_border_exception_review":
      return "Cross-Border Exception Review";
    case "residency_policy_exception_review":
      return "Residency Policy Exception Review";
    case "legal_hold_exception_review":
      return "Legal-Hold Exception Review";
    case "org_quota_override_approval":
      return "Org Quota Override Approval";
    case "business_unit_quota_override_approval":
      return "Business-Unit Quota Override Approval";
    case "regional_quota_override_approval":
      return "Regional Quota Override Approval";
    case "chargeback_override_audit":
      return "Chargeback Override Audit";
    default:
      return hookId;
  }
}

function orgAdminEnforcementMode(category) {
  switch (category) {
    case "delegated_admin":
      return "scope_guard";
    case "break_glass":
      return "timeboxed_elevation";
    case "directory_sync":
      return "mapping_validation";
    case "residency":
    case "legal_hold":
      return "exception_review";
    case "quota":
      return "approval_required";
    case "chargeback":
      return "audit_required";
    default:
      return "governed_review";
  }
}

function uniqueSortedValues(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))).sort();
}

function buildMockOrgAdminEnforcementProfiles(entry) {
  const decisionSurfaces = Array.isArray(entry?.decisionSurfaces) ? entry.decisionSurfaces : [];
  return (Array.isArray(entry?.enforcementHooks) ? entry.enforcementHooks : []).map((hookId) => {
    const category = orgAdminEnforcementCategory(hookId);
    let roleBundles = [];
    let requiredInputs = [];
    let scopedSurfaces = decisionSurfaces;
    if (category === "delegated_admin") {
      roleBundles = entry?.delegatedAdminRoleBundles || [];
      requiredInputs = uniqueSortedValues([...(entry?.directorySyncInputs || []), "project_id", "tenant_id", "business_unit", "region", "environment"]);
    } else if (category === "break_glass") {
      roleBundles = entry?.breakGlassRoleBundles || [];
      requiredInputs = ["break_glass_ticket", "break_glass_reason", "break_glass_expiry"];
      scopedSurfaces = decisionSurfaces.filter((item) => item === "break_glass_activation");
    } else if (category === "directory_sync") {
      roleBundles = uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || [])]);
      requiredInputs = entry?.directorySyncInputs || [];
    } else if (category === "residency") {
      roleBundles = uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || [])]);
      requiredInputs = entry?.residencyExceptionInputs || [];
      scopedSurfaces = decisionSurfaces.filter((item) => item === "residency_policy_assignment" || item === "export_profile_override");
    } else if (category === "legal_hold") {
      roleBundles = uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.breakGlassRoleBundles || [])]);
      requiredInputs = entry?.legalHoldExceptionInputs || [];
      scopedSurfaces = decisionSurfaces.filter((item) => item === "legal_hold_activation" || item === "export_profile_override");
    } else if (category === "quota") {
      roleBundles = uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || [])]);
      requiredInputs = uniqueSortedValues([...(entry?.quotaOverlayInputs || []), ...(entry?.quotaDimensions || [])]);
      scopedSurfaces = decisionSurfaces.filter((item) => item === "quota_override");
    } else if (category === "chargeback") {
      roleBundles = uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || [])]);
      requiredInputs = uniqueSortedValues([...(entry?.chargebackOverlayInputs || []), ...(entry?.chargebackDimensions || [])]);
      scopedSurfaces = decisionSurfaces.filter((item) => item === "quota_override" || item === "export_profile_override");
    } else {
      roleBundles = entry?.adminRoleBundles || [];
    }
    return {
      hookId,
      label: orgAdminEnforcementLabel(hookId),
      category,
      enforcementMode: orgAdminEnforcementMode(category),
      roleBundles,
      requiredInputs,
      decisionSurfaces: scopedSurfaces.length > 0 ? scopedSurfaces : decisionSurfaces,
      boundaryRequirements: entry?.boundaryRequirements || []
    };
  });
}

function buildMockOrgAdminDirectorySyncMappings(entry) {
  const sourceSystems = uniqueSortedValues((entry?.groupRoleMappingInputs || []).map((item) => item?.source).filter(Boolean));
  const scopeDimensions = uniqueSortedValues(
    (entry?.groupRoleMappingInputs || [])
      .map((item) => item?.field)
      .filter((field) => ["tenant_id", "project_id", "business_unit", "environment", "region", "jurisdiction", "cost_center"].includes(field))
  );
  if ((entry?.directorySyncInputs || []).length === 0 && (entry?.groupRoleMappingInputs || []).length === 0) {
    return [];
  }
  return [
    {
      mappingId: `${entry?.profileId || "org-admin"}_directory_sync_mapping`,
      label: `${entry?.label || "Org Admin"} Directory Sync Mapping`,
      mappingMode: "group_to_role_binding",
      sourceSystems: sourceSystems.length > 0 ? sourceSystems : ["directory_sync"],
      requiredInputs: uniqueSortedValues(entry?.directorySyncInputs || []),
      roleBundles: uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || []), ...(entry?.breakGlassRoleBundles || [])]),
      scopeDimensions,
      decisionSurfaces: uniqueSortedValues((entry?.decisionSurfaces || []).filter((item) => item === "policy_pack_assignment" || item === "break_glass_activation"))
    }
  ];
}

function buildMockOrgAdminExceptionProfiles(entry) {
  const profiles = [];
  if ((entry?.residencyProfiles || []).length > 0 || (entry?.residencyExceptionInputs || []).length > 0) {
    profiles.push({
      profileId: `${entry?.profileId || "org-admin"}_residency_exception`,
      label: `${entry?.label || "Org Admin"} Residency Exception`,
      category: "residency",
      exceptionMode: "ticketed_exception_review",
      managedProfiles: uniqueSortedValues(entry?.residencyProfiles || []),
      requiredInputs: uniqueSortedValues(entry?.residencyExceptionInputs || []),
      roleBundles: uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || []), ...(entry?.breakGlassRoleBundles || [])]),
      decisionSurfaces: uniqueSortedValues((entry?.decisionSurfaces || []).filter((item) => item === "residency_policy_assignment" || item === "export_profile_override")),
      boundaryRequirements: uniqueSortedValues((entry?.boundaryRequirements || []).filter((item) => ["tenant_project_scope", "runtime_authz", "governed_export_redaction"].includes(item)))
    });
  }
  if ((entry?.legalHoldProfiles || []).length > 0 || (entry?.legalHoldExceptionInputs || []).length > 0) {
    profiles.push({
      profileId: `${entry?.profileId || "org-admin"}_legal_hold_exception`,
      label: `${entry?.label || "Org Admin"} Legal Hold Exception`,
      category: "legal_hold",
      exceptionMode: "hold_exception_review",
      managedProfiles: uniqueSortedValues(entry?.legalHoldProfiles || []),
      requiredInputs: uniqueSortedValues(entry?.legalHoldExceptionInputs || []),
      roleBundles: uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || []), ...(entry?.breakGlassRoleBundles || [])]),
      decisionSurfaces: uniqueSortedValues((entry?.decisionSurfaces || []).filter((item) => item === "legal_hold_activation" || item === "export_profile_override")),
      boundaryRequirements: uniqueSortedValues((entry?.boundaryRequirements || []).filter((item) => ["audit_emission", "runtime_authz", "governed_export_redaction"].includes(item)))
    });
  }
  return profiles;
}

function buildMockOrgAdminOverlayProfiles(entry) {
  const profiles = [];
  if ((entry?.quotaDimensions || []).length > 0 || (entry?.quotaOverlayInputs || []).length > 0) {
    profiles.push({
      overlayId: `${entry?.profileId || "org-admin"}_quota_overlay`,
      label: `${entry?.label || "Org Admin"} Quota Overlay`,
      category: "quota",
      overlayMode: "quota_override_review",
      targetDimensions: uniqueSortedValues(entry?.quotaDimensions || []),
      requiredInputs: uniqueSortedValues(entry?.quotaOverlayInputs || []),
      roleBundles: uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || []), ...(entry?.breakGlassRoleBundles || [])]),
      decisionSurfaces: uniqueSortedValues((entry?.decisionSurfaces || []).filter((item) => item === "quota_override")),
      boundaryRequirements: uniqueSortedValues((entry?.boundaryRequirements || []).filter((item) => ["org_quota_metering", "audit_emission", "runtime_authz"].includes(item)))
    });
  }
  if ((entry?.chargebackDimensions || []).length > 0 || (entry?.chargebackOverlayInputs || []).length > 0) {
    profiles.push({
      overlayId: `${entry?.profileId || "org-admin"}_chargeback_overlay`,
      label: `${entry?.label || "Org Admin"} Chargeback Overlay`,
      category: "chargeback",
      overlayMode: "chargeback_allocation_review",
      targetDimensions: uniqueSortedValues(entry?.chargebackDimensions || []),
      requiredInputs: uniqueSortedValues(entry?.chargebackOverlayInputs || []),
      roleBundles: uniqueSortedValues([...(entry?.adminRoleBundles || []), ...(entry?.delegatedAdminRoleBundles || []), ...(entry?.breakGlassRoleBundles || [])]),
      decisionSurfaces: uniqueSortedValues((entry?.decisionSurfaces || []).filter((item) => item === "quota_override" || item === "export_profile_override")),
      boundaryRequirements: uniqueSortedValues((entry?.boundaryRequirements || []).filter((item) => ["org_quota_metering", "audit_emission"].includes(item)))
    });
  }
  return profiles;
}

function mockOrgAdminCatalog() {
  const items = [
      {
        profileId: "centralized_enterprise_admin",
        label: "Centralized Enterprise Admin",
        organizationModel: "centralized_enterprise",
        delegationModel: "central_it_with_tenant_project_delegation",
        adminRoleBundles: ["enterprise.org_admin", "enterprise.security_admin", "enterprise.compliance_admin"],
        delegatedAdminRoleBundles: ["enterprise.tenant_admin", "enterprise.project_admin", "enterprise.identity_admin"],
        breakGlassRoleBundles: ["enterprise.break_glass_admin", "enterprise.break_glass_auditor"],
        directorySyncInputs: ["idp_group", "tenant_id", "cost_center", "environment"],
        residencyProfiles: ["single_region_tenant_pinning", "regional_failover_within_jurisdiction"],
        residencyExceptionInputs: ["region", "jurisdiction", "residency_exception_ticket"],
        legalHoldProfiles: ["litigation_hold", "security_incident_hold"],
        legalHoldExceptionInputs: ["legal_hold_case_id", "legal_hold_reason", "legal_hold_expiry"],
        networkBoundaryProfiles: ["enterprise_proxy_required", "private_egress_preferred", "tls_inspection_compatible"],
        fleetRolloutProfiles: ["mdm_managed_desktop_ring", "regional_beta_ring"],
        quotaDimensions: ["organization", "tenant", "project", "worker_adapter", "provider", "model"],
        quotaOverlayInputs: ["tenant_id", "project_id", "environment", "cost_center"],
        chargebackDimensions: ["cost_center", "business_unit", "tenant", "project", "environment"],
        chargebackOverlayInputs: ["cost_center", "business_unit", "project_id", "environment"],
        decisionSurfaces: ["policy_pack_assignment", "export_profile_override", "quota_override", "legal_hold_activation", "break_glass_activation"],
        enforcementHooks: ["delegated_admin_scope_guard", "break_glass_timebox", "directory_sync_group_mapping", "residency_policy_exception_review", "legal_hold_exception_review", "org_quota_override_approval", "chargeback_override_audit"],
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "directory_group_mapping", "org_quota_metering", "governed_export_redaction"],
        clientSurfaces: ["chat", "vscode", "cli", "workflow", "chatops", "desktop", "runtime"],
        reportingSurfaces: ["report", "export", "admin_report"]
      },
      {
        profileId: "federated_business_unit_admin",
        label: "Federated Business-Unit Admin",
        organizationModel: "federated_business_unit",
        delegationModel: "business_unit_scoped_delegation",
        adminRoleBundles: ["enterprise.org_admin", "enterprise.security_admin"],
        delegatedAdminRoleBundles: ["enterprise.business_unit_admin", "enterprise.tenant_admin", "enterprise.project_admin"],
        breakGlassRoleBundles: ["enterprise.break_glass_admin"],
        directorySyncInputs: ["idp_group", "business_unit", "cost_center", "workflow_id"],
        residencyProfiles: ["business_unit_regional_partitioning", "regional_residency_enforced"],
        residencyExceptionInputs: ["business_unit", "region", "residency_exception_ticket"],
        legalHoldProfiles: ["business_unit_case_hold", "security_incident_hold"],
        legalHoldExceptionInputs: ["hold_case_id", "hold_reason", "regional_counsel_approval"],
        networkBoundaryProfiles: ["proxy_by_business_unit", "private_egress_preferred"],
        fleetRolloutProfiles: ["business_unit_desktop_ring", "regional_package_distribution"],
        quotaDimensions: ["organization", "business_unit", "tenant", "project", "worker_adapter"],
        quotaOverlayInputs: ["business_unit", "tenant_id", "project_id", "cost_center"],
        chargebackDimensions: ["business_unit", "cost_center", "project", "environment"],
        chargebackOverlayInputs: ["business_unit", "cost_center", "project_id", "environment"],
        decisionSurfaces: ["policy_pack_assignment", "quota_override", "export_profile_override"],
        enforcementHooks: ["delegated_business_unit_scope_guard", "directory_sync_business_unit_mapping", "business_unit_quota_override_approval", "chargeback_override_audit"],
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "directory_group_mapping", "business_unit_chargeback"],
        clientSurfaces: ["chat", "vscode", "cli", "workflow", "chatops", "desktop"],
        reportingSurfaces: ["report", "export", "admin_report"]
      },
      {
        profileId: "regulated_regional_admin",
        label: "Regulated Regional Admin",
        organizationModel: "regulated_regional",
        delegationModel: "regional_compliance_delegation",
        adminRoleBundles: ["enterprise.org_admin", "enterprise.compliance_admin", "enterprise.records_admin"],
        delegatedAdminRoleBundles: ["enterprise.regional_admin", "enterprise.tenant_admin"],
        breakGlassRoleBundles: ["enterprise.break_glass_admin", "enterprise.break_glass_auditor"],
        directorySyncInputs: ["idp_group", "region", "data_classification", "legal_entity"],
        residencyProfiles: ["single_jurisdiction_enforced", "regional_failover_blocked"],
        residencyExceptionInputs: ["region", "jurisdiction", "cross_region_exception_ticket"],
        legalHoldProfiles: ["litigation_hold", "regulatory_hold", "ediscovery_hold"],
        legalHoldExceptionInputs: ["hold_case_id", "regulator_reference", "exception_expiry"],
        networkBoundaryProfiles: ["private_connectivity_only", "regional_egress_allowlist", "mutual_tls_enterprise_edge"],
        fleetRolloutProfiles: ["mdm_managed_regional_ring", "signed_package_required"],
        quotaDimensions: ["organization", "region", "tenant", "project", "export_profile"],
        quotaOverlayInputs: ["region", "tenant_id", "project_id", "data_classification"],
        chargebackDimensions: ["region", "legal_entity", "project"],
        chargebackOverlayInputs: ["region", "legal_entity", "cost_center", "project_id"],
        decisionSurfaces: ["residency_policy_assignment", "legal_hold_activation", "export_profile_override", "break_glass_activation"],
        enforcementHooks: ["regional_residency_guard", "cross_border_exception_review", "legal_hold_exception_review", "break_glass_timebox", "regional_quota_override_approval"],
        boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission", "directory_group_mapping", "jurisdictional_residency", "governed_export_redaction"],
        clientSurfaces: ["chat", "vscode", "cli", "workflow", "chatops", "desktop", "runtime"],
        reportingSurfaces: ["report", "export", "compliance_report", "admin_report"]
      }
    ].map((entry) => ({
      ...entry,
      enforcementProfiles: buildMockOrgAdminEnforcementProfiles(entry),
      directorySyncMappings: buildMockOrgAdminDirectorySyncMappings(entry),
      exceptionProfiles: buildMockOrgAdminExceptionProfiles(entry),
      overlayProfiles: buildMockOrgAdminOverlayProfiles(entry)
    }));
  return {
    source: "mock",
    count: items.length,
    items
  };
}

function seedMockRuns() {
  return [
    {
      runId: "run-20260304-005",
      requestId: "req-005",
      tenantId: "tenant-demo",
      projectId: "project-payments",
      environment: "staging",
      status: "POLICY_EVALUATED",
      selectedProfileProvider: "oss-profile-static",
      selectedPolicyProvider: "oss-policy-opa",
      selectedEvidenceProvider: "oss-evidence-memory",
      selectedDesktopProvider: "oss-desktop-openfang-linux",
      policyDecision: "ALLOW",
      policyBundleId: "bundle-default",
      policyBundleVersion: "2026.03.04",
      policyGrantTokenPresent: false,
      policyGrantTokenSha256: "",
      createdAt: "2026-03-04T14:20:11Z",
      updatedAt: "2026-03-04T14:20:13Z",
      requestPayload: {
        meta: {
          requestId: "req-005",
          tenantId: "tenant-demo",
          projectId: "project-payments",
          environment: "staging"
        },
        subject: { type: "operator", id: "user-5" },
        action: { verb: "desktop.step", target: "openfang-sandbox" },
        mode: "enforce",
        desktop: {
          enabled: true,
          tier: 3,
          targetOS: "linux",
          targetExecutionProfile: "sandbox_vm_autonomous",
          stepId: "desktop-step-1",
          requestedCapabilities: [
            "observe.window_metadata",
            "actuate.window_focus",
            "verify.post_action_state"
          ],
          requiredVerifierIds: ["V-M13-LNX-001", "V-M13-LNX-002", "V-M13-LNX-003"],
          observer: { mode: "snapshot" },
          actuation: { type: "click", selector: "#approve" },
          postAction: { verify: "post_action_state" },
          humanApprovalGranted: false,
          restrictedHostOptIn: false
        }
      },
      profileResponse: { profileId: "desktop-sandbox-linux" },
      policyResponse: {
        decision: "ALLOW",
        source: "oss-policy-opa",
        reasonCode: "NEEDS_APPROVAL"
      },
      evidenceRecordResponse: { status: "pending" },
      evidenceBundleResponse: { status: "pending" }
    },
    {
      runId: "run-20260228-001",
      requestId: "req-001",
      tenantId: "tenant-demo",
      projectId: "project-core",
      environment: "staging",
      status: "COMPLETED",
      selectedProfileProvider: "oss-profile-static",
      selectedPolicyProvider: "oss-policy-opa",
      selectedEvidenceProvider: "oss-evidence-memory",
      selectedDesktopProvider: "oss-desktop-openfang-linux",
      policyDecision: "ALLOW",
      policyBundleId: "bundle-default",
      policyBundleVersion: "2026.02.28",
      policyGrantTokenPresent: true,
      policyGrantTokenSha256: "sha256:mock-grant-001",
      createdAt: "2026-02-28T00:35:11Z",
      updatedAt: "2026-02-28T00:35:16Z",
      requestPayload: {
        meta: {
          requestId: "req-001",
          tenantId: "tenant-demo",
          projectId: "project-core",
          environment: "staging"
        },
        subject: { type: "operator", id: "user-1" },
        action: { verb: "desktop.step", target: "openfang-sandbox" }
      },
      profileResponse: { profileId: "profile-static-default" },
      policyResponse: { decision: "ALLOW", source: "oss-policy-opa" },
      desktopObserveResponse: {
        decision: "ALLOW",
        verifierId: "V-M13-LNX-001",
        reasonCode: "OBSERVED",
        evidenceBundle: {
          windowMetadata: { title: "Sandbox Browser" },
          screenshotHash: "sha256:observe-001",
          resultCode: "observed"
        }
      },
      desktopActuateResponse: {
        decision: "ALLOW",
        verifierId: "V-M13-LNX-002",
        reasonCode: "ACTUATED",
        evidenceBundle: {
          windowMetadata: { title: "Sandbox Browser" },
          screenshotHash: "sha256:actuate-001",
          resultCode: "ok"
        }
      },
      desktopVerifyResponse: {
        decision: "ALLOW",
        verifierId: "V-M13-LNX-003",
        reasonCode: "VERIFIED",
        evidenceBundle: {
          windowMetadata: { title: "Sandbox Browser" },
          screenshotHash: "sha256:verify-001",
          resultCode: "verified"
        }
      },
      evidenceRecordResponse: { status: "recorded" },
      evidenceBundleResponse: { status: "finalized" }
    },
    {
      runId: "run-20260228-002",
      requestId: "req-002",
      tenantId: "tenant-demo",
      projectId: "project-finance",
      environment: "staging",
      status: "COMPLETED",
      selectedProfileProvider: "oss-profile-static",
      selectedPolicyProvider: "oss-policy-opa",
      selectedEvidenceProvider: "oss-evidence-memory",
      selectedDesktopProvider: "",
      policyDecision: "DENY",
      policyBundleId: "bundle-default",
      policyBundleVersion: "2026.02.28",
      policyGrantTokenPresent: false,
      policyGrantTokenSha256: "",
      createdAt: "2026-02-28T00:37:11Z",
      updatedAt: "2026-02-28T00:37:13Z",
      requestPayload: {
        meta: {
          requestId: "req-002",
          tenantId: "tenant-demo",
          projectId: "project-finance",
          environment: "staging"
        },
        subject: { type: "operator", id: "user-2" },
        action: { verb: "payments.refund", target: "invoice-2211" }
      },
      profileResponse: { profileId: "profile-static-default" },
      policyResponse: {
        decision: "DENY",
        source: "oss-policy-opa",
        reasonCode: "NO_POLICY_GRANT"
      },
      evidenceRecordResponse: { status: "recorded" },
      evidenceBundleResponse: { status: "finalized" }
    },
    {
      runId: "run-20260228-003",
      requestId: "req-003",
      tenantId: "tenant-ops",
      projectId: "project-core",
      environment: "staging",
      status: "FAILED",
      selectedProfileProvider: "oss-profile-static",
      selectedPolicyProvider: "aimxs-policy-primary",
      selectedEvidenceProvider: "oss-evidence-memory",
      selectedDesktopProvider: "oss-desktop-openfang-linux",
      policyDecision: "DENY",
      policyBundleId: "bundle-default",
      policyBundleVersion: "2026.02.28",
      policyGrantTokenPresent: false,
      policyGrantTokenSha256: "",
      createdAt: "2026-02-28T00:42:11Z",
      updatedAt: "2026-02-28T00:42:17Z",
      errorMessage: "runtime execution failed after policy deny",
      requestPayload: {
        meta: {
          requestId: "req-003",
          tenantId: "tenant-ops",
          projectId: "project-core",
          environment: "staging"
        },
        subject: { type: "operator", id: "user-3" },
        action: { verb: "desktop.step", target: "ops-console" }
      },
      profileResponse: { profileId: "profile-static-default" },
      policyResponse: {
        decision: "DENY",
        source: "aimxs-policy-primary",
        reasonCode: "AIMXS_ENTITLEMENT_FEATURE_MISSING"
      },
      evidenceRecordResponse: { status: "recorded" },
      evidenceBundleResponse: { status: "finalized" }
    }
  ];
}

function seedMockApprovals() {
  return [
    {
      approvalId: "approval-run-20260304-005",
      runId: "run-20260304-005",
      requestId: "req-005",
      tenantId: "tenant-demo",
      projectId: "project-payments",
      tier: 3,
      targetOS: "linux",
      targetExecutionProfile: "sandbox_vm_autonomous",
      requestedCapabilities: [
        "observe.window_metadata",
        "actuate.window_focus",
        "verify.post_action_state"
      ],
      status: "PENDING",
      createdAt: "2026-03-04T14:20:14Z",
      expiresAt: "2026-03-04T14:35:14Z",
      reason: "Tier-3 desktop actuation requires explicit approval and policy grant token."
    }
  ];
}

function createMockState() {
  const runs = seedMockRuns();
  const runByID = {};
  for (const run of runs) {
    runByID[run.runId] = run;
  }
  return {
    runs,
    runByID,
    approvals: seedMockApprovals(),
    integrationSettingsByScope: {},
    tasksById: {},
    sessionTimelinesById: {}
  };
}

const MOCK_STATE = createMockState();

function mockRuns() {
  const sorted = [...MOCK_STATE.runs].sort((a, b) => {
    const at = new Date(a.createdAt || 0).getTime();
    const bt = new Date(b.createdAt || 0).getTime();
    return bt - at;
  });
  return {
    count: sorted.length,
    items: sorted.map((item) => summarizeRun(item))
  };
}

function mockRunDetail(runID) {
  const hit = MOCK_STATE.runByID[runID];
  if (!hit) {
    return null;
  }
  return deepClone(hit);
}

function mockAuditEvents() {
  return {
    source: "mock",
    count: 8,
    items: [
      {
        ts: "2026-03-04T14:20:13Z",
        event: "runtime.policy.decision",
        tenantId: "tenant-demo",
        projectId: "project-payments",
        providerId: "oss-policy-opa",
        decision: "ALLOW"
      },
      {
        ts: "2026-03-04T14:20:14Z",
        event: "runtime.desktop.approval.pending",
        tenantId: "tenant-demo",
        projectId: "project-payments",
        providerId: "oss-desktop-openfang-linux",
        decision: "ALLOW"
      },
      {
        ts: "2026-02-28T00:35:11Z",
        event: "runtime.provider.selected",
        tenantId: "tenant-demo",
        projectId: "project-core",
        providerId: "oss-profile-static",
        decision: ""
      },
      {
        ts: "2026-02-28T00:35:12Z",
        event: "runtime.policy.decision",
        tenantId: "tenant-demo",
        projectId: "project-core",
        providerId: "oss-policy-opa",
        decision: "ALLOW"
      },
      {
        ts: "2026-02-28T00:35:16Z",
        event: "runtime.run.completed",
        tenantId: "tenant-demo",
        projectId: "project-core",
        providerId: "oss-evidence-memory",
        decision: "ALLOW"
      },
      {
        ts: "2026-02-28T00:37:11Z",
        event: "runtime.policy.decision",
        tenantId: "tenant-demo",
        projectId: "project-finance",
        providerId: "oss-policy-opa",
        decision: "DENY"
      },
      {
        ts: "2026-02-28T00:42:11Z",
        event: "runtime.policy.decision",
        tenantId: "tenant-ops",
        projectId: "project-core",
        providerId: "aimxs-policy-primary",
        decision: "DENY"
      },
      {
        ts: "2026-02-28T00:42:17Z",
        event: "runtime.run.failed",
        tenantId: "tenant-ops",
        projectId: "project-core",
        providerId: "oss-evidence-memory",
        decision: "DENY"
      }
    ]
  };
}

function mockApprovalQueue() {
  return {
    source: "mock",
    count: MOCK_STATE.approvals.length,
    items: deepClone(MOCK_STATE.approvals)
  };
}

function mockCreateRuntimeRun(payload) {
  const runID = `run-${Date.now()}`;
  const timestamp = nowISO();
  const desktop = payload?.desktop || {};
  const desktopEnabled = desktop && typeof desktop === "object" && desktop.enabled === true;
  const tier = desktopEnabled ? Number.parseInt(String(desktop.tier || "2"), 10) || 2 : 0;

  let status = "COMPLETED";
  let policyDecision = "ALLOW";
  let policyGrantTokenPresent = false;
  let policyGrantTokenSha256 = "";
  let errorMessage = "";
  let approval = null;

  if (
    String(desktop.targetExecutionProfile || "").toLowerCase() === "restricted_host" &&
    !desktop.restrictedHostOptIn
  ) {
    status = "FAILED";
    policyDecision = "DENY";
    errorMessage = "desktop.targetExecutionProfile restricted_host requires restrictedHostOptIn=true";
  } else if (tier >= 3 && !desktop.humanApprovalGranted) {
    status = "POLICY_EVALUATED";
    policyDecision = "ALLOW";
    approval = {
      approvalId: `approval-${runID}`,
      runId: runID,
      requestId: payload?.meta?.requestId || `req-${Date.now()}`,
      tenantId: payload?.meta?.tenantId || "",
      projectId: payload?.meta?.projectId || "",
      tier,
      targetOS: String(desktop.targetOS || "linux").toLowerCase(),
      targetExecutionProfile:
        String(desktop.targetExecutionProfile || "sandbox_vm_autonomous").toLowerCase(),
      requestedCapabilities: Array.isArray(desktop.requestedCapabilities)
        ? [...desktop.requestedCapabilities]
        : [],
      status: "PENDING",
      createdAt: timestamp,
      expiresAt: plusSecondsISO(900),
      reason: "Awaiting operator approval and policy grant token for Tier-3 execution."
    };
  } else if (tier >= 3) {
    policyGrantTokenPresent = true;
    policyGrantTokenSha256 = `sha256:mock-grant-${runID}`;
  }

  const runRecord = {
    runId: runID,
    requestId: payload?.meta?.requestId || `req-${Date.now()}`,
    tenantId: payload?.meta?.tenantId || "",
    projectId: payload?.meta?.projectId || "",
    environment: payload?.meta?.environment || "staging",
    retentionClass: payload?.retentionClass || "",
    status,
    selectedProfileProvider: "oss-profile-static",
    selectedPolicyProvider: "oss-policy-opa",
    selectedEvidenceProvider: "oss-evidence-memory",
    selectedDesktopProvider: desktopEnabled && tier > 1 ? "oss-desktop-openfang-linux" : "",
    policyDecision,
    policyBundleId: "bundle-default",
    policyBundleVersion: "2026.03.04",
    policyGrantTokenPresent,
    policyGrantTokenSha256,
    requestPayload: payload,
    profileResponse: { profileId: "desktop-sandbox-linux" },
    policyResponse: {
      decision: policyDecision,
      source: "oss-policy-opa",
      reasonCode: policyDecision === "ALLOW" ? "ALLOW" : "DENY"
    },
    evidenceRecordResponse: { status: status === "FAILED" ? "failed" : "recorded" },
    evidenceBundleResponse: { status: status === "FAILED" ? "failed" : "finalized" },
    errorMessage,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  MOCK_STATE.runs.unshift(runRecord);
  MOCK_STATE.runByID[runID] = runRecord;
  if (approval) {
    MOCK_STATE.approvals.unshift(approval);
  }

  return deepClone(runRecord);
}

function mockSubmitApprovalDecision(runID, decision, options = {}) {
  const approval = MOCK_STATE.approvals.find((item) => item.runId === runID);
  if (!approval) {
    throw new Error(`approval not found for runId=${runID}`);
  }

  const normalized = String(decision || "").trim().toUpperCase() === "DENY" ? "DENY" : "APPROVE";
  const timestamp = nowISO();
  const runRecord = MOCK_STATE.runByID[runID];

  if (normalized === "APPROVE") {
    approval.status = "APPROVED";
    approval.reviewedAt = timestamp;
    approval.reason = options.reason || "Approved by operator.";
    if (runRecord) {
      runRecord.status = "COMPLETED";
      runRecord.policyDecision = "ALLOW";
      runRecord.policyGrantTokenPresent = true;
      runRecord.policyGrantTokenSha256 = `sha256:mock-grant-${runID}`;
      runRecord.updatedAt = timestamp;
      runRecord.errorMessage = "";
    }
  } else {
    approval.status = "DENIED";
    approval.reviewedAt = timestamp;
    approval.reason = options.reason || "Denied by operator.";
    if (runRecord) {
      runRecord.status = "FAILED";
      runRecord.policyDecision = "DENY";
      runRecord.policyGrantTokenPresent = false;
      runRecord.policyGrantTokenSha256 = "";
      runRecord.updatedAt = timestamp;
      runRecord.errorMessage = "Tier-3 execution denied by operator.";
    }
  }

  return deepClone({
    applied: true,
    runId: runID,
    decision: normalized,
    status: approval.status,
    reviewedAt: approval.reviewedAt,
    reason: approval.reason
  });
}

function integrationScopeKey(tenantID, projectID) {
  const tenant = String(tenantID || "").trim().toLowerCase();
  const project = String(projectID || "").trim().toLowerCase();
  return `${tenant}::${project}`;
}

function mockGetIntegrationSettings(scope = {}) {
  const tenantID = String(scope.tenantId || "").trim();
  const projectID = String(scope.projectId || "").trim();
  const key = integrationScopeKey(tenantID, projectID);
  const hit = MOCK_STATE.integrationSettingsByScope[key];
  if (!hit) {
    return {
      source: "mock",
      tenantId: tenantID,
      projectId: projectID,
      hasSettings: false,
      settings: {}
    };
  }
  return deepClone({
    source: "mock",
    tenantId: tenantID,
    projectId: projectID,
    hasSettings: true,
    settings: hit.settings,
    createdAt: hit.createdAt,
    updatedAt: hit.updatedAt
  });
}

function mockPutIntegrationSettings(payload = {}) {
  const meta = payload.meta || {};
  const tenantID = String(meta.tenantId || "").trim();
  const projectID = String(meta.projectId || "").trim();
  const now = nowISO();
  const key = integrationScopeKey(tenantID, projectID);
  const existing = MOCK_STATE.integrationSettingsByScope[key];

  MOCK_STATE.integrationSettingsByScope[key] = {
    settings: deepClone(payload.settings || {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  return deepClone({
    source: "mock",
    tenantId: tenantID,
    projectId: projectID,
    hasSettings: true,
    settings: payload.settings || {},
    createdAt: MOCK_STATE.integrationSettingsByScope[key].createdAt,
    updatedAt: now
  });
}

function mockCreateRuntimeTask(payload = {}) {
  const meta = payload?.meta || {};
  const now = nowISO();
  const taskId = `task-mock-${Date.now()}`;
  const task = {
    taskId,
    requestId: String(meta.requestId || "").trim(),
    tenantId: String(meta.tenantId || "").trim(),
    projectId: String(meta.projectId || "").trim(),
    source: String(payload.source || "mock.operator_chat").trim() || "mock.operator_chat",
    title: String(payload.title || "Operator chat thread").trim() || "Operator chat thread",
    intent: String(payload.intent || "").trim(),
    requestedBy: meta.actor || {},
    status: "NEW",
    annotations: payload.annotations || {},
    createdAt: now,
    updatedAt: now,
    latestSessionId: ""
  };
  MOCK_STATE.tasksById[taskId] = deepClone(task);
  return deepClone(task);
}

function mockListRuntimeTasks(query = {}) {
  const tenantId = String(query.tenantId || "").trim();
  const projectId = String(query.projectId || "").trim();
  const status = String(query.status || "").trim().toUpperCase();
  const search = String(query.search || "").trim().toLowerCase();
  const limit = Number.parseInt(String(query.limit || "25"), 10) || 25;
  const offset = Number.parseInt(String(query.offset || "0"), 10) || 0;
  let items = Object.values(MOCK_STATE.tasksById || {}).map((item) => deepClone(item));
  if (tenantId) {
    items = items.filter((item) => String(item?.tenantId || "").trim() === tenantId);
  }
  if (projectId) {
    items = items.filter((item) => String(item?.projectId || "").trim() === projectId);
  }
  if (status) {
    items = items.filter((item) => String(item?.status || "").trim().toUpperCase() === status);
  }
  if (search) {
    items = items.filter((item) =>
      [item?.title, item?.intent, item?.source, item?.taskId]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(search))
    );
  }
  items.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const paged = items.slice(offset, offset + limit);
  return {
    count: items.length,
    limit,
    offset,
    items: paged
  };
}

function mockListRuntimeSessions(query = {}) {
  const taskId = String(query.taskId || "").trim();
  const tenantId = String(query.tenantId || "").trim();
  const projectId = String(query.projectId || "").trim();
  const status = String(query.status || "").trim().toUpperCase();
  const sessionType = String(query.sessionType || "").trim().toLowerCase();
  const limit = Number.parseInt(String(query.limit || "25"), 10) || 25;
  const offset = Number.parseInt(String(query.offset || "0"), 10) || 0;
  let items = Object.values(MOCK_STATE.sessionTimelinesById || {})
    .map((timeline) => deepClone(timeline?.session))
    .filter(Boolean);
  if (taskId) {
    items = items.filter((item) => String(item?.taskId || "").trim() === taskId);
  }
  if (tenantId) {
    items = items.filter((item) => String(item?.tenantId || "").trim() === tenantId);
  }
  if (projectId) {
    items = items.filter((item) => String(item?.projectId || "").trim() === projectId);
  }
  if (status) {
    items = items.filter((item) => String(item?.status || "").trim().toUpperCase() === status);
  }
  if (sessionType) {
    items = items.filter((item) => String(item?.sessionType || "").trim().toLowerCase() === sessionType);
  }
  items.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  const paged = items.slice(offset, offset + limit);
  return {
    count: items.length,
    limit,
    offset,
    items: paged
  };
}

function mockSessionStatusForWorkerStatus(status, current) {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  const normalizedCurrent = String(current || "").trim().toUpperCase();
  if (!normalizedStatus || ["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"].includes(normalizedCurrent)) {
    return normalizedCurrent;
  }
  switch (normalizedStatus) {
    case "ATTACHED":
    case "READY":
      return normalizedCurrent === "AWAITING_APPROVAL" ? normalizedCurrent : "READY";
    case "WAITING":
    case "DETACHED":
      return normalizedCurrent === "AWAITING_APPROVAL" ? normalizedCurrent : "AWAITING_WORKER";
    case "RUNNING":
      return normalizedCurrent === "AWAITING_APPROVAL" ? normalizedCurrent : "RUNNING";
    case "BLOCKED":
      return "BLOCKED";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    default:
      return normalizedCurrent;
  }
}

function mockTaskStatusForSessionStatus(status, current) {
  const normalizedStatus = String(status || "").trim().toUpperCase();
  switch (normalizedStatus) {
    case "READY":
    case "AWAITING_WORKER":
    case "AWAITING_APPROVAL":
    case "RUNNING":
      return "IN_PROGRESS";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    case "BLOCKED":
      return "BLOCKED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return String(current || "").trim().toUpperCase() || "NEW";
  }
}

function mockCreateRuntimeSessionForTask(taskId, payload = {}) {
  const normalizedTaskId = String(taskId || "").trim();
  const task = normalizedTaskId ? deepClone(MOCK_STATE.tasksById?.[normalizedTaskId]) : null;
  if (!task) {
    throw new Error("task not found");
  }
  const meta = payload?.meta || {};
  const now = nowISO();
  const sessionId = `session-mock-${Date.now()}`;
  const session = {
    sessionId,
    taskId: normalizedTaskId,
    requestId: String(meta.requestId || "").trim(),
    legacyRunId: String(payload.legacyRunId || "").trim(),
    tenantId: String(task.tenantId || "").trim(),
    projectId: String(task.projectId || "").trim(),
    sessionType: String(payload.sessionType || "operator_request").trim() || "operator_request",
    status: "PENDING",
    source: String(payload.source || "mock.runtime.session").trim() || "mock.runtime.session",
    selectedWorkerId: "",
    summary: payload.summary && typeof payload.summary === "object" ? deepClone(payload.summary) : {},
    annotations: payload.annotations && typeof payload.annotations === "object" ? deepClone(payload.annotations) : {},
    createdAt: now,
    startedAt: now,
    updatedAt: now
  };
  const timeline = {
    session,
    task: {
      ...task,
      latestSessionId: sessionId,
      status: "IN_PROGRESS",
      updatedAt: now
    },
    selectedWorker: null,
    workers: [],
    approvalCheckpoints: [],
    toolActions: [],
    evidenceRecords: [],
    events: [],
    openApprovalCount: 0,
    latestEventSequence: 0
  };
  appendMockSessionEvent(timeline, "session.created", {
    taskId: normalizedTaskId,
    status: session.status,
    legacyRunId: session.legacyRunId
  }, now);
  MOCK_STATE.sessionTimelinesById[sessionId] = deepClone(timeline);
  syncMockTaskFromTimeline(timeline);
  return deepClone(session);
}

function mockAttachRuntimeSessionWorker(sessionId, payload = {}) {
  const timeline = MOCK_STATE.sessionTimelinesById[String(sessionId || "").trim()];
  if (!timeline) {
    throw new Error("session not found");
  }
  const meta = payload?.meta || {};
  const workerType = String(payload.workerType || "").trim();
  const adapterId = String(payload.adapterId || "").trim();
  if (!workerType || !adapterId) {
    throw new Error("workerType and adapterId are required");
  }
  const now = nowISO();
  const worker = {
    workerId: `worker-mock-${Date.now()}`,
    sessionId: String(sessionId || "").trim(),
    taskId: String(timeline?.session?.taskId || "").trim(),
    tenantId: String(timeline?.session?.tenantId || "").trim(),
    projectId: String(timeline?.session?.projectId || "").trim(),
    workerType,
    adapterId,
    status: "ATTACHED",
    source: String(payload.source || "mock.runtime.worker.attach").trim() || "mock.runtime.worker.attach",
    capabilities: Array.isArray(payload.capabilities) ? deepClone(payload.capabilities) : [],
    routing: String(payload.routing || "").trim(),
    agentProfileId: String(payload.agentProfileId || "").trim(),
    provider: String(payload.provider || "").trim(),
    transport: String(payload.transport || "").trim(),
    model: String(payload.model || "").trim(),
    targetEnvironment: String(payload.targetEnvironment || "").trim(),
    annotations: {
      ...(payload.annotations && typeof payload.annotations === "object" ? deepClone(payload.annotations) : {}),
      actor: meta.actor || {}
    },
    createdAt: now,
    updatedAt: now
  };
  timeline.workers = Array.isArray(timeline.workers) ? timeline.workers : [];
  timeline.workers.push(worker);
  timeline.selectedWorker = deepClone(worker);
  const previousSessionStatus = String(timeline?.session?.status || "").trim().toUpperCase();
  timeline.session.selectedWorkerId = worker.workerId;
  if (previousSessionStatus === "PENDING" || previousSessionStatus === "AWAITING_WORKER") {
    timeline.session.status = "READY";
  }
  timeline.session.updatedAt = now;
  timeline.task.latestSessionId = String(sessionId || "").trim();
  timeline.task.status = mockTaskStatusForSessionStatus(timeline.session.status, timeline.task.status);
  timeline.task.updatedAt = now;
  appendMockSessionEvent(timeline, "worker.attached", {
    workerId: worker.workerId,
    workerType: worker.workerType,
    adapterId: worker.adapterId,
    status: worker.status,
    selectedWorkerId: worker.workerId,
    targetEnvironment: worker.targetEnvironment
  }, now);
  appendMockSessionEvent(timeline, "worker.status.changed", {
    workerId: worker.workerId,
    workerType: worker.workerType,
    adapterId: worker.adapterId,
    status: worker.status
  }, now);
  if (previousSessionStatus !== timeline.session.status) {
    appendMockSessionEvent(timeline, "session.status.changed", {
      previousStatus: previousSessionStatus,
      status: timeline.session.status,
      selectedWorker: worker.workerId
    }, now);
  }
  syncMockTaskFromTimeline(timeline);
  return deepClone(worker);
}

function mockCreateRuntimeSessionWorkerEvent(sessionId, workerId, payload = {}) {
  const timeline = MOCK_STATE.sessionTimelinesById[String(sessionId || "").trim()];
  if (!timeline) {
    throw new Error("session not found");
  }
  const workers = Array.isArray(timeline.workers) ? timeline.workers : [];
  const worker = workers.find((item) => String(item?.workerId || "").trim() === String(workerId || "").trim());
  if (!worker) {
    throw new Error("session worker not found");
  }
  const eventType = String(payload.eventType || "").trim() || (payload.status ? "worker.status.changed" : "");
  if (!eventType) {
    throw new Error("eventType is required when status is not provided");
  }
  const now = nowISO();
  const requestedStatus = String(payload.status || "").trim().toUpperCase();
  const previousWorkerStatus = String(worker.status || "").trim().toUpperCase();
  const statusChanged = Boolean(requestedStatus) && requestedStatus !== previousWorkerStatus;
  if (statusChanged) {
    worker.status = requestedStatus;
    worker.updatedAt = now;
    if (String(timeline?.selectedWorker?.workerId || "").trim() === String(workerId || "").trim()) {
      timeline.selectedWorker = {
        ...deepClone(timeline.selectedWorker || {}),
        status: requestedStatus,
        updatedAt: now
      };
    }
  }
  const eventPayload = {
    workerId: String(workerId || "").trim(),
    workerType: String(worker.workerType || "").trim(),
    adapterId: String(worker.adapterId || "").trim(),
    eventType
  };
  if (payload.summary) {
    eventPayload.summary = String(payload.summary).trim();
  }
  if (payload.severity) {
    eventPayload.severity = String(payload.severity).trim();
  }
  if (requestedStatus) {
    eventPayload.status = requestedStatus;
    eventPayload.previousStatus = previousWorkerStatus;
  }
  if (payload.payload && typeof payload.payload === "object") {
    eventPayload.payload = deepClone(payload.payload);
  }
  appendMockSessionEvent(timeline, eventType, eventPayload, now);
  if (statusChanged && eventType !== "worker.status.changed") {
    appendMockSessionEvent(timeline, "worker.status.changed", {
      workerId: String(workerId || "").trim(),
      workerType: String(worker.workerType || "").trim(),
      adapterId: String(worker.adapterId || "").trim(),
      previousStatus: previousWorkerStatus,
      status: requestedStatus
    }, now);
  }

  const previousSessionStatus = String(timeline?.session?.status || "").trim().toUpperCase();
  const nextSessionStatus = requestedStatus
    ? mockSessionStatusForWorkerStatus(requestedStatus, previousSessionStatus)
    : previousSessionStatus;
  if (nextSessionStatus !== previousSessionStatus) {
    timeline.session.status = nextSessionStatus;
    timeline.session.updatedAt = now;
    if (["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"].includes(nextSessionStatus)) {
      timeline.session.completedAt = now;
    }
    appendMockSessionEvent(timeline, "session.status.changed", {
      previousStatus: previousSessionStatus,
      status: nextSessionStatus,
      workerId: String(workerId || "").trim()
    }, now);
    if (nextSessionStatus === "COMPLETED") {
      appendMockSessionEvent(timeline, "session.completed", {
        status: nextSessionStatus,
        workerId: String(workerId || "").trim()
      }, now);
    } else if (nextSessionStatus === "FAILED") {
      appendMockSessionEvent(timeline, "session.failed", {
        status: nextSessionStatus,
        workerId: String(workerId || "").trim()
      }, now);
    } else if (nextSessionStatus === "BLOCKED") {
      appendMockSessionEvent(timeline, "session.blocked", {
        status: nextSessionStatus,
        workerId: String(workerId || "").trim()
      }, now);
    } else if (nextSessionStatus === "CANCELLED") {
      appendMockSessionEvent(timeline, "session.cancelled", {
        status: nextSessionStatus,
        workerId: String(workerId || "").trim()
      }, now);
    }
  }
  timeline.task.latestSessionId = String(sessionId || "").trim();
  timeline.task.status = mockTaskStatusForSessionStatus(timeline.session.status, timeline.task.status);
  timeline.task.updatedAt = now;
  syncMockTaskFromTimeline(timeline);
  return deepClone({
    sessionId: String(sessionId || "").trim(),
    workerId: String(workerId || "").trim(),
    eventType,
    workerStatus: String(worker.status || "").trim().toUpperCase(),
    sessionStatus: String(timeline?.session?.status || "").trim().toUpperCase(),
    recordedAt: now
  });
}

function mockInvokeIntegrationAgent(payload = {}) {
  const meta = payload.meta || {};
  const agentProfileId = String(payload.agentProfileId || "codex").trim().toLowerCase() || "codex";
  const executionMode = String(payload.executionMode || "").trim().toLowerCase() === "managed_codex_worker"
    ? "managed_codex_worker"
    : "raw_model_invoke";
  const prompt = String(payload.prompt || "").trim();
  const now = nowISO();
  const stamp = Date.now();
  const sessionId = `session-mock-${stamp}`;
  const requestedTaskId = String(payload.taskId || "").trim();
  const existingTask =
    requestedTaskId && MOCK_STATE.tasksById[requestedTaskId]
      ? deepClone(MOCK_STATE.tasksById[requestedTaskId])
      : null;
  const taskId = existingTask?.taskId || `task-mock-${stamp}`;
  const workerId = `worker-mock-${stamp}`;
  const toolActionId = `tool-mock-${stamp}`;
  const evidenceId = `evidence-mock-${stamp}`;
  const managedCodex = executionMode === "managed_codex_worker";
  const workerType = managedCodex ? "managed_agent" : "model_invoke";
  const workerAdapterId = managedCodex ? "codex" : agentProfileId;
  const workerSource = managedCodex ? "mock.managed.codex_bridge" : "mock.integration.invoke";
  const workerCapabilities = managedCodex
    ? ["agent_turn", "tool_proposal", "approval_checkpoint", "evidence_capture"]
    : ["invoke"];
  const route = managedCodex ? "mock-managed-bridge" : "mock";
  const outputText = managedCodex
    ? `${prompt ? `Mock managed Codex bridge completed: ${prompt.slice(0, 140)}` : "Mock managed Codex bridge completed."}\n\n\`\`\`bash\ngo test ./...\n\`\`\``
    : prompt
      ? `Mock invocation completed for ${agentProfileId}: ${prompt.slice(0, 180)}`
      : `Mock invocation completed for ${agentProfileId}.`;
  const workerOutputChunks = managedCodex
    ? [outputText.split("\n\n")[0], "```bash\ngo test ./...\n```"]
    : [outputText];
  const toolProposals = managedCodex
    ? [{
        proposalId: `proposal-terminal-${stamp}`,
        type: "terminal_command",
        summary: "Mock managed Codex suggested a terminal command.",
        command: "go test ./...",
        confidence: "mock"
      }]
    : [];
  const task = existingTask || {
    taskId,
    requestId: String(meta.requestId || "").trim(),
    tenantId: String(meta.tenantId || "").trim(),
    projectId: String(meta.projectId || "").trim(),
      source: "mock.integration.invoke",
      title: `Integration invoke: ${agentProfileId}`,
      intent: prompt || `Invoke ${agentProfileId}`,
      status: "IN_PROGRESS",
      annotations: {
        executionMode,
        preferredWorkerType: workerType,
        preferredWorkerAdapterId: workerAdapterId
      },
      createdAt: now,
      updatedAt: now,
      latestSessionId: sessionId
  };
  task.status = "COMPLETED";
  task.updatedAt = now;
  task.latestSessionId = sessionId;
  MOCK_STATE.tasksById[taskId] = deepClone(task);
  const timeline = {
    session: {
      sessionId,
      taskId,
      requestId: String(meta.requestId || "").trim(),
      tenantId: String(meta.tenantId || "").trim(),
      projectId: String(meta.projectId || "").trim(),
      sessionType: "interactive",
      status: "COMPLETED",
      source: workerSource,
      selectedWorkerId: workerId,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      completedAt: now
    },
    task: {
      ...deepClone(task),
      latestSessionId: sessionId
    },
    selectedWorker: {
      workerId,
      sessionId,
      taskId,
      tenantId: String(meta.tenantId || "").trim(),
      projectId: String(meta.projectId || "").trim(),
      workerType,
      adapterId: workerAdapterId,
      status: "COMPLETED",
      source: workerSource,
      capabilities: workerCapabilities,
      routing: route,
      agentProfileId,
      provider: agentProfileId,
      transport: "mock",
      model: "mock-model",
      targetEnvironment: managedCodex ? "codex" : "local-desktop",
      createdAt: now,
      updatedAt: now
    },
    workers: [],
    approvalCheckpoints: [],
    toolActions: [
      {
        toolActionId,
        sessionId,
        workerId,
        tenantId: String(meta.tenantId || "").trim(),
        projectId: String(meta.projectId || "").trim(),
        toolType: managedCodex ? "managed_agent_turn" : "model_invoke",
        status: "COMPLETED",
        source: workerSource,
        requestPayload: {
          prompt,
          systemPrompt: String(payload.systemPrompt || "").trim(),
          maxOutputTokens: payload.maxOutputTokens,
          executionMode
        },
        resultPayload: {
          outputText,
          executionMode
        },
        createdAt: now,
        updatedAt: now
      }
    ],
    evidenceRecords: [
      {
        evidenceId,
        sessionId,
        toolActionId,
        tenantId: String(meta.tenantId || "").trim(),
        projectId: String(meta.projectId || "").trim(),
        kind: managedCodex ? "managed_worker_output" : "model_output",
        checksum: "sha256:mock-output",
        metadata: {
          finishReason: "completed",
          chunkCount: workerOutputChunks.length,
          toolProposalCount: toolProposals.length
        },
        createdAt: now,
        updatedAt: now
      }
    ],
    events: [
      {
        eventId: `${sessionId}-event-1`,
        sessionId,
        sequence: 1,
        eventType: "session.created",
        payload: {
          source: "mock.integration.invoke"
        },
        timestamp: now
      },
      {
        eventId: `${sessionId}-event-2`,
        sessionId,
        sequence: 2,
        eventType: "worker.attached",
        payload: {
          workerId,
          workerType,
          adapterId: workerAdapterId,
          executionMode,
          status: "COMPLETED"
        },
        timestamp: now
      },
      {
        eventId: `${sessionId}-event-3`,
        sessionId,
        sequence: 3,
        eventType: managedCodex ? "worker.bridge.started" : "worker.status.changed",
        payload: managedCodex
          ? {
              workerId,
              workerType,
              adapterId: workerAdapterId,
              executionMode,
              summary: "Mock managed Codex worker bridge attached to the session."
            }
          : {
              workerId,
              executionMode,
              status: "COMPLETED",
              summary: "Mock worker moved to completed."
            },
        timestamp: now
      },
      {
        eventId: `${sessionId}-event-4`,
        sessionId,
        sequence: 4,
        eventType: "worker.output.delta",
        payload: {
          workerId,
          executionMode,
          summary: managedCodex ? "Mock managed Codex worker emitted a response delta." : "Mock worker emitted a response delta.",
          payload: {
            delta: workerOutputChunks[0],
            chunkIndex: 1,
            chunkCount: workerOutputChunks.length
          }
        },
        timestamp: now
      },
      ...(managedCodex
        ? [
            {
              eventId: `${sessionId}-event-5`,
              sessionId,
              sequence: 5,
              eventType: "tool_proposal.generated",
              payload: {
                workerId,
                proposalId: toolProposals[0].proposalId,
                proposalType: toolProposals[0].type,
                summary: toolProposals[0].summary,
                payload: {
                  ...toolProposals[0]
                }
              },
              timestamp: now
            }
          ]
        : []),
      {
        eventId: `${sessionId}-event-${managedCodex ? 6 : 5}`,
        sessionId,
        sequence: managedCodex ? 6 : 5,
        eventType: "tool_action.completed",
        payload: {
          workerId,
          toolType: managedCodex ? "managed_agent_turn" : "model_invoke",
          executionMode,
          status: "COMPLETED"
        },
        timestamp: now
      },
      {
        eventId: `${sessionId}-event-${managedCodex ? 7 : 6}`,
        sessionId,
        sequence: managedCodex ? 7 : 6,
        eventType: "evidence.recorded",
        payload: {
          evidenceId,
          kind: managedCodex ? "managed_worker_output" : "model_output"
        },
        timestamp: now
      },
      {
        eventId: `${sessionId}-event-${managedCodex ? 8 : 7}`,
        sessionId,
        sequence: managedCodex ? 8 : 7,
        eventType: "session.completed",
        payload: {
          status: "COMPLETED"
        },
        timestamp: now
      }
    ],
    openApprovalCount: 0,
    latestEventSequence: managedCodex ? 8 : 7
  };
  timeline.workers = [deepClone(timeline.selectedWorker)];
  MOCK_STATE.sessionTimelinesById[sessionId] = deepClone(timeline);

  return deepClone({
    source: "mock",
    applied: true,
    taskId,
    sessionId,
    tenantId: String(meta.tenantId || "").trim(),
    projectId: String(meta.projectId || "").trim(),
    requestId: String(meta.requestId || "").trim(),
    agentProfileId,
    executionMode,
    selectedWorkerId: workerId,
    workerType,
    workerAdapterId: workerAdapterId,
    provider: agentProfileId,
    transport: "mock",
    model: "mock-model",
    route,
    outputText,
    workerOutputChunks,
    toolProposals,
    finishReason: "completed",
    startedAt: now,
    completedAt: now,
    rawResponse: {
      mock: true,
      prompt,
      systemPrompt: String(payload.systemPrompt || "").trim()
    }
  });
}

function appendMockSessionEvent(timeline, eventType, payload = {}, timestamp = nowISO()) {
  if (!timeline || typeof timeline !== "object") {
    return null;
  }
  const events = Array.isArray(timeline.events) ? timeline.events : [];
  const nextSequence = Math.max(
    Number(timeline.latestEventSequence || 0) || 0,
    ...events.map((item) => Number(item?.sequence || 0) || 0)
  ) + 1;
  const sessionId = String(timeline?.session?.sessionId || "").trim();
  const entry = {
    eventId: `${sessionId || "session"}-event-${nextSequence}`,
    sessionId,
    sequence: nextSequence,
    eventType: String(eventType || "").trim() || "session.event",
    payload: deepClone(payload),
    timestamp
  };
  timeline.events = events.concat(entry);
  timeline.latestEventSequence = nextSequence;
  return entry;
}

function syncMockTaskFromTimeline(timeline) {
  if (!timeline || typeof timeline !== "object") {
    return;
  }
  const taskId = String(timeline?.task?.taskId || timeline?.session?.taskId || "").trim();
  if (!taskId) {
    return;
  }
  const task = {
    ...(deepClone(MOCK_STATE.tasksById?.[taskId]) || {}),
    ...(deepClone(timeline.task || {}) || {})
  };
  task.taskId = taskId;
  task.latestSessionId = String(timeline?.session?.sessionId || timeline?.latestSessionId || task.latestSessionId || "").trim();
  task.updatedAt = String(timeline?.task?.updatedAt || timeline?.session?.updatedAt || nowISO()).trim();
  MOCK_STATE.tasksById[taskId] = task;
}

function mockSubmitRuntimeSessionToolProposalDecision(sessionId, proposalId, decision, options = {}) {
  const timeline = MOCK_STATE.sessionTimelinesById[String(sessionId || "").trim()];
  if (!timeline) {
    throw new Error("session tool proposal not found");
  }
  const normalizedProposalId = String(proposalId || "").trim();
  const events = Array.isArray(timeline.events) ? timeline.events : [];
  const generatedEvent = events.find(
    (item) =>
      String(item?.eventType || "").trim() === "tool_proposal.generated" &&
      String(item?.payload?.proposalId || "").trim() === normalizedProposalId
  );
  if (!generatedEvent) {
    throw new Error("session tool proposal not found");
  }
  const priorDecision = [...events].reverse().find(
    (item) =>
      String(item?.eventType || "").trim() === "tool_proposal.decided" &&
      String(item?.payload?.proposalId || "").trim() === normalizedProposalId
  );
  const normalizedDecision = String(decision || "").trim().toUpperCase() === "DENY" ? "DENY" : "APPROVE";
  if (priorDecision) {
    return {
      applied: false,
      source: "mock",
      sessionId: String(sessionId || "").trim(),
      proposalId: normalizedProposalId,
      decision: String(priorDecision?.payload?.decision || "").trim().toUpperCase(),
      status: String(priorDecision?.payload?.status || "").trim().toUpperCase() || "PENDING",
      reason: String(priorDecision?.payload?.reason || "").trim(),
      toolActionId: String(priorDecision?.payload?.toolActionId || "").trim(),
      workerId: String(priorDecision?.payload?.workerId || "").trim(),
      toolType: String(priorDecision?.payload?.proposalType || "").trim(),
      actionStatus: String(priorDecision?.payload?.toolActionId || "").trim() ? "AUTHORIZED" : "",
      reviewedAt: String(priorDecision?.timestamp || "").trim()
    };
  }

  const generatedPayload = generatedEvent?.payload && typeof generatedEvent.payload === "object" ? generatedEvent.payload : {};
  const proposalPayload = generatedPayload?.payload && typeof generatedPayload.payload === "object" ? generatedPayload.payload : {};
  const now = nowISO();
  let toolActionId = "";
  let actionStatus = "";
  let governedRun = null;
  if (normalizedDecision === "APPROVE") {
    toolActionId = `tool-proposal-mock-${Date.now()}`;
    timeline.toolActions = Array.isArray(timeline.toolActions) ? timeline.toolActions : [];
    const toolAction = {
      toolActionId,
      sessionId: String(sessionId || "").trim(),
      workerId: String(generatedPayload?.workerId || "").trim(),
      tenantId: String(timeline?.session?.tenantId || "").trim(),
      projectId: String(timeline?.session?.projectId || "").trim(),
      toolType: String(generatedPayload?.proposalType || "").trim() || "tool_proposal",
      status: "AUTHORIZED",
      source: "mock.runtime.tool-proposal-decision",
      requestPayload: {
        proposalId: normalizedProposalId,
        proposalType: String(generatedPayload?.proposalType || "").trim(),
        summary: String(generatedPayload?.summary || "").trim(),
        proposal: deepClone(proposalPayload),
        decision: normalizedDecision,
        reason: String(options.reason || "").trim()
      },
      resultPayload: {
        decision: normalizedDecision,
        reviewedAt: now,
        reason: String(options.reason || "").trim()
      },
      createdAt: now,
      updatedAt: now
    };
    timeline.toolActions.push(toolAction);
    appendMockSessionEvent(timeline, "tool_action.authorized", {
      toolActionId,
      workerId: String(generatedPayload?.workerId || "").trim(),
      toolType: String(generatedPayload?.proposalType || "").trim() || "tool_proposal",
      status: "AUTHORIZED",
      proposalId: normalizedProposalId,
      summary: "Approved proposal promoted into a governed tool action."
    }, now);
    const previousSessionStatus = String(timeline?.session?.status || "").trim().toUpperCase();
    if (["PENDING", "READY", "AWAITING_WORKER"].includes(previousSessionStatus)) {
      timeline.session.status = "RUNNING";
      timeline.session.updatedAt = now;
      timeline.task.status = "IN_PROGRESS";
      timeline.task.updatedAt = now;
      appendMockSessionEvent(timeline, "session.status.changed", {
        previousStatus: previousSessionStatus,
        status: "RUNNING",
        proposalId: normalizedProposalId,
        toolActionId
      }, now);
    }
    actionStatus = "AUTHORIZED";
    if (String(generatedPayload?.proposalType || "").trim() === "governed_action_request") {
      const runId = `run-governed-mock-${Date.now()}`;
      governedRun = {
        runId,
        requestId: `req-governed-mock-${Date.now()}`,
        status: "COMPLETED",
        selectedProfileProvider: "mock-profile-provider",
        selectedPolicyProvider: "mock-policy-provider",
        selectedEvidenceProvider: "mock-evidence-provider",
        policyDecision: "DEFER",
        policyBundleId: "MOCK_GOVERNED_POLICY",
        policyBundleVersion: "v1",
        policyGrantTokenPresent: false,
        createdAt: now,
        updatedAt: now,
        requestPayload: {
          meta: {
            tenantId: String(timeline?.session?.tenantId || "").trim(),
            projectId: String(timeline?.session?.projectId || "").trim()
          },
          task: {
            requestLabel: String(proposalPayload?.requestLabel || "").trim(),
            summary: String(proposalPayload?.requestSummary || "").trim(),
            demoProfile: String(proposalPayload?.demoProfile || "").trim()
          },
          context: {
            governed_action: {
              contract_id: "epydios.governed-action.v1",
              workflow_kind: String(proposalPayload?.workflowKind || "external_action_request").trim(),
              request_label: String(proposalPayload?.requestLabel || "").trim(),
              demo_profile: String(proposalPayload?.demoProfile || "").trim(),
              request_summary: String(proposalPayload?.requestSummary || "").trim(),
              finance_order:
                proposalPayload?.financeOrder && typeof proposalPayload.financeOrder === "object"
                  ? deepClone(proposalPayload.financeOrder)
                  : undefined
            },
            policy_stratification: {
              policy_bucket_id: String(proposalPayload?.policyBucketId || "mock-governed-action").trim(),
              action_class: String(proposalPayload?.actionClass || "execute").trim(),
              boundary_class: String(proposalPayload?.boundaryClass || "external_actuator").trim(),
              risk_tier: String(proposalPayload?.riskTier || "high").trim(),
              required_grants: Array.isArray(proposalPayload?.requiredGrants) ? deepClone(proposalPayload.requiredGrants) : [],
              evidence_readiness: String(proposalPayload?.evidenceReadiness || "PARTIAL").trim(),
              gates: {
                "core14.adapter_present.enforce_handshake": proposalPayload?.handshakeRequired === true
              }
            }
          }
        },
        profileResponse: {
          profileId: "mock-governed-profile",
          profileVersion: "v1"
        },
        policyResponse: {
          decision: "DEFER",
          source: "mock-policy-provider",
          reasons: [
            {
              code: "mock_governed_review_required",
              message: "Mock governed-action evaluation requires richer review."
            }
          ],
          output: {
            aimxs: {
              providerId: "mock-policy-provider",
              providerMeta: {
                decision_path: "mock_governed_path",
                policy_stratification: {
                  boundary_class: String(proposalPayload?.boundaryClass || "external_actuator").trim()
                }
              },
              evidence: {
                evidence_hash: "sha256:mock-governed-evidence"
              }
            }
          },
          evidenceRefs: ["mock-evidence-ref-1"]
        },
        evidenceRecordResponse: {
          evidenceId: `evidence-governed-mock-${Date.now()}`
        },
        evidenceBundleResponse: {
          bundleId: `bundle-governed-mock-${Date.now()}`
        }
      };
      toolAction.status = "COMPLETED";
      toolAction.updatedAt = now;
      toolAction.resultPayload = {
        decision: normalizedDecision,
        reviewedAt: now,
        startedAt: now,
        completedAt: now,
        status: "COMPLETED",
        governedRun: deepClone(governedRun)
      };
      appendMockSessionEvent(timeline, "tool_action.started", {
        toolActionId,
        workerId: String(generatedPayload?.workerId || "").trim(),
        toolType: String(generatedPayload?.proposalType || "").trim() || "tool_proposal",
        status: "STARTED",
        proposalId: normalizedProposalId,
        summary: "Approved governed action proposal started runtime policy evaluation."
      }, now);
      appendMockSessionEvent(timeline, "tool_action.completed", {
        toolActionId,
        workerId: String(generatedPayload?.workerId || "").trim(),
        toolType: String(generatedPayload?.proposalType || "").trim() || "tool_proposal",
        status: "COMPLETED",
        proposalId: normalizedProposalId,
        runId,
        runStatus: "COMPLETED",
        policyDecision: "DEFER",
        selectedPolicyProvider: "mock-policy-provider",
        summary: "Governed action request evaluated with policy decision DEFER."
      }, now);
      appendMockSessionEvent(timeline, "worker.progress", {
        workerId: String(generatedPayload?.workerId || "").trim(),
        status: "RUNNING",
        summary: "Governed action evaluation completed with policy decision DEFER.",
        payload: {
          stage: "governed_action_completed",
          percent: 100,
          toolActionId,
          proposalId: normalizedProposalId,
          runId,
          runStatus: "COMPLETED",
          policyDecision: "DEFER",
          selectedPolicyProvider: "mock-policy-provider"
        }
      }, now);
      timeline.evidenceRecords = Array.isArray(timeline.evidenceRecords) ? timeline.evidenceRecords : [];
      timeline.evidenceRecords.push({
        evidenceId: `evidence-governed-run-mock-${Date.now()}`,
        sessionId: String(sessionId || "").trim(),
        toolActionId,
        tenantId: String(timeline?.session?.tenantId || "").trim(),
        projectId: String(timeline?.session?.projectId || "").trim(),
        kind: "governed_run",
        uri: `run://${runId}`,
        metadata: {
          proposalId: normalizedProposalId,
          toolActionId,
          runId,
          policyDecision: "DEFER",
          selectedPolicyProvider: "mock-policy-provider"
        },
        createdAt: now,
        updatedAt: now
      });
      MOCK_STATE.runByID[runId] = deepClone(governedRun);
      MOCK_STATE.runs.push(deepClone(governedRun));
      actionStatus = toolAction.status;
    }
    const command = String(proposalPayload?.command || "").trim();
    if (command) {
      toolAction.status = "STARTED";
      toolAction.updatedAt = now;
      appendMockSessionEvent(timeline, "tool_action.started", {
        toolActionId,
        workerId: String(generatedPayload?.workerId || "").trim(),
        toolType: String(generatedPayload?.proposalType || "").trim() || "tool_proposal",
        status: "STARTED",
        proposalId: normalizedProposalId,
        command,
        summary: "Approved tool proposal started execution."
      }, now);
      appendMockSessionEvent(timeline, "worker.progress", {
        workerId: String(generatedPayload?.workerId || "").trim(),
        status: "RUNNING",
        summary: "Approved tool action is running.",
        payload: {
          stage: "tool_action_started",
          percent: 70,
          toolActionId,
          proposalId: normalizedProposalId
        }
      }, now);

      const finishedAt = nowISO();
      const failed = /(^|\\s)(rm|mv|chmod|chown|cp)(\\s|$)/.test(command);
      toolAction.status = failed ? "FAILED" : "COMPLETED";
      toolAction.updatedAt = finishedAt;
      toolAction.resultPayload = {
        decision: normalizedDecision,
        reviewedAt: now,
        startedAt: now,
        completedAt: finishedAt,
        command,
        status: toolAction.status,
        exitCode: failed ? 1 : 0,
        timedOut: false,
        outputSha256: failed ? "" : "sha256:mock-tool-output",
        outputTruncated: false,
        output: failed ? "" : `mock executed: ${command}`,
        error: failed ? "mock deterministic policy rejected command execution" : ""
      };
      appendMockSessionEvent(timeline, failed ? "tool_action.failed" : "tool_action.completed", {
        toolActionId,
        workerId: String(generatedPayload?.workerId || "").trim(),
        toolType: String(generatedPayload?.proposalType || "").trim() || "tool_proposal",
        status: toolAction.status,
        proposalId: normalizedProposalId,
        command,
        exitCode: failed ? 1 : 0,
        outputSha256: failed ? "" : "sha256:mock-tool-output",
        error: failed ? "mock deterministic policy rejected command execution" : "",
        summary: failed ? "Approved tool action failed during execution." : "Approved tool action completed."
      }, finishedAt);
      appendMockSessionEvent(timeline, "worker.progress", {
        workerId: String(generatedPayload?.workerId || "").trim(),
        status: "RUNNING",
        summary: failed ? "Approved tool action failed during execution." : "Approved tool action completed.",
        payload: {
          stage: failed ? "tool_action_failed" : "tool_action_completed",
          percent: 100,
          toolActionId,
          proposalId: normalizedProposalId,
          exitCode: failed ? 1 : 0,
          error: failed ? "mock deterministic policy rejected command execution" : ""
        }
      }, finishedAt);
      if (!failed) {
        timeline.evidenceRecords = Array.isArray(timeline.evidenceRecords) ? timeline.evidenceRecords : [];
        const evidenceId = `evidence-tool-proposal-mock-${Date.now()}`;
        timeline.evidenceRecords.push({
          evidenceId,
          sessionId: String(sessionId || "").trim(),
          toolActionId,
          tenantId: String(timeline?.session?.tenantId || "").trim(),
          projectId: String(timeline?.session?.projectId || "").trim(),
          kind: "tool_output",
          checksum: "sha256:mock-tool-output",
          metadata: {
            proposalId: normalizedProposalId,
            toolActionId,
            status: "COMPLETED",
            exitCode: 0,
            timedOut: false,
            outputTruncated: false,
            executedCommand: command
          },
          createdAt: finishedAt,
          updatedAt: finishedAt
        });
        appendMockSessionEvent(timeline, "evidence.recorded", {
          evidenceId,
          toolActionId,
          kind: "tool_output",
          checksum: "sha256:mock-tool-output",
          proposalId: normalizedProposalId
        }, finishedAt);
      }
      actionStatus = toolAction.status;
    }
  }
  appendMockSessionEvent(timeline, "tool_proposal.decided", {
    proposalId: normalizedProposalId,
    proposalType: String(generatedPayload?.proposalType || "").trim(),
    workerId: String(generatedPayload?.workerId || "").trim(),
    decision: normalizedDecision,
    status: normalizedDecision === "DENY" ? "DENIED" : "APPROVED",
    reason: String(options.reason || "").trim(),
    toolActionId,
    actionStatus,
    runId: String(governedRun?.runId || "").trim(),
    runStatus: String(governedRun?.status || "").trim(),
    policyDecision: String(governedRun?.policyDecision || "").trim(),
    selectedPolicyProvider: String(governedRun?.selectedPolicyProvider || "").trim(),
    summary: normalizedDecision === "DENY"
      ? "Tool proposal denied by the operator."
      : "Tool proposal approved and promoted into a governed tool action."
  }, now);
  syncMockTaskFromTimeline(timeline);
  return {
    applied: true,
    source: "mock",
    sessionId: String(sessionId || "").trim(),
    proposalId: normalizedProposalId,
    decision: normalizedDecision,
    status: normalizedDecision === "DENY" ? "DENIED" : "APPROVED",
    reason: String(options.reason || "").trim(),
    toolActionId,
    workerId: String(generatedPayload?.workerId || "").trim(),
    toolType: String(generatedPayload?.proposalType || "").trim(),
    actionStatus,
    runId: String(governedRun?.runId || "").trim(),
    runStatus: String(governedRun?.status || "").trim(),
    policyDecision: String(governedRun?.policyDecision || "").trim(),
    selectedPolicyProvider: String(governedRun?.selectedPolicyProvider || "").trim(),
    reviewedAt: now
  };
}

function mockSubmitRuntimeSessionApprovalDecision(sessionId, checkpointId, decision, options = {}) {
  const timeline = MOCK_STATE.sessionTimelinesById[String(sessionId || "").trim()];
  if (!timeline) {
    throw new Error("session approval checkpoint not found");
  }
  const checkpoints = Array.isArray(timeline.approvalCheckpoints) ? timeline.approvalCheckpoints : [];
  const checkpoint = checkpoints.find((item) => String(item?.checkpointId || "").trim() === String(checkpointId || "").trim());
  if (!checkpoint) {
    throw new Error("session approval checkpoint not found");
  }
  const normalizedDecision = String(decision || "").trim().toUpperCase() === "DENY" ? "DENY" : "APPROVE";
  const targetStatus = normalizedDecision === "DENY" ? "DENIED" : "APPROVED";
  const now = nowISO();
  if (String(checkpoint.status || "").trim().toUpperCase() === targetStatus) {
    return {
      applied: false,
      source: "mock",
      sessionId: String(sessionId || "").trim(),
      checkpointId: String(checkpointId || "").trim(),
      decision: normalizedDecision,
      status: targetStatus,
      reason: String(options.reason || "").trim(),
      reviewedAt: now
    };
  }

  checkpoint.status = targetStatus;
  checkpoint.reason = String(options.reason || "").trim() || (normalizedDecision === "DENY" ? "denied by operator" : "approved by operator");
  checkpoint.reviewedAt = now;
  checkpoint.updatedAt = now;
  const previousStatus = String(timeline?.session?.status || "").trim().toUpperCase();
  if (normalizedDecision === "DENY") {
    timeline.session.status = "BLOCKED";
    timeline.session.completedAt = now;
    timeline.task.status = "BLOCKED";
  } else {
    timeline.session.status = String(timeline?.session?.selectedWorkerId || "").trim() ? "READY" : "AWAITING_WORKER";
    timeline.task.status = "IN_PROGRESS";
  }
  timeline.session.updatedAt = now;
  timeline.task.updatedAt = now;
  timeline.openApprovalCount = checkpoints.filter((item) => String(item?.status || "").trim().toUpperCase() === "PENDING").length;

  appendMockSessionEvent(timeline, "approval.status.changed", {
    checkpointId: String(checkpointId || "").trim(),
    decision: normalizedDecision,
    status: checkpoint.status,
    reason: checkpoint.reason
  }, now);
  if (previousStatus !== String(timeline?.session?.status || "").trim().toUpperCase()) {
    appendMockSessionEvent(timeline, "session.status.changed", {
      previousStatus,
      status: timeline.session.status,
      checkpointId: String(checkpointId || "").trim()
    }, now);
    if (String(timeline?.session?.status || "").trim().toUpperCase() === "BLOCKED") {
      appendMockSessionEvent(timeline, "session.blocked", {
        status: timeline.session.status,
        reason: checkpoint.reason
      }, now);
    }
  }
  syncMockTaskFromTimeline(timeline);

  return {
    applied: true,
    source: "mock",
    sessionId: String(sessionId || "").trim(),
    checkpointId: String(checkpointId || "").trim(),
    decision: normalizedDecision,
    status: checkpoint.status,
    reason: checkpoint.reason,
    reviewedAt: now
  };
}

function mockCloseRuntimeSession(sessionId, payload = {}) {
  const timeline = MOCK_STATE.sessionTimelinesById[String(sessionId || "").trim()];
  if (!timeline) {
    throw new Error("session not found");
  }
  const normalizedStatus = String(payload.status || "COMPLETED").trim().toUpperCase() || "COMPLETED";
  if (!["COMPLETED", "FAILED", "CANCELLED", "BLOCKED"].includes(normalizedStatus)) {
    throw new Error("invalid session status");
  }
  const previousStatus = String(timeline?.session?.status || "").trim().toUpperCase();
  const now = nowISO();
  timeline.session.status = normalizedStatus;
  timeline.session.updatedAt = now;
  timeline.session.completedAt = now;
  timeline.task.status = normalizedStatus === "COMPLETED"
    ? "COMPLETED"
    : normalizedStatus === "FAILED"
      ? "FAILED"
      : normalizedStatus === "CANCELLED"
        ? "CANCELLED"
        : "BLOCKED";
  timeline.task.updatedAt = now;
  if (previousStatus !== normalizedStatus) {
    appendMockSessionEvent(timeline, "session.status.changed", {
      previousStatus,
      status: normalizedStatus,
      reason: String(payload.reason || "").trim()
    }, now);
  }
  appendMockSessionEvent(timeline, normalizedStatus === "COMPLETED"
    ? "session.completed"
    : normalizedStatus === "FAILED"
      ? "session.failed"
      : normalizedStatus === "CANCELLED"
        ? "session.cancelled"
        : "session.blocked", {
    status: normalizedStatus,
    reason: String(payload.reason || "").trim()
  }, now);
  syncMockTaskFromTimeline(timeline);
  return deepClone(timeline.session);
}

function mockGetRuntimeSessionTimeline(sessionId) {
  const hit = MOCK_STATE.sessionTimelinesById[String(sessionId || "").trim()];
  return hit ? deepClone(hit) : null;
}

function mockGetRuntimeSessionEventStream(sessionId, options = {}) {
  const hit = MOCK_STATE.sessionTimelinesById[String(sessionId || "").trim()];
  if (!hit) {
    return null;
  }
  const afterSequence = Number.parseInt(String(options.afterSequence || "0"), 10) || 0;
  const items = (Array.isArray(hit.events) ? hit.events : []).filter(
    (item) => Number(item?.sequence || 0) > afterSequence
  );
  return {
    source: "mock",
    sessionId: String(sessionId || "").trim(),
    count: items.length,
    items: deepClone(items)
  };
}

function mockCreateTerminalSession(payload) {
  const requestedAt = nowISO();
  const restrictedHostRequest = Boolean(payload?.safety?.restrictedHostRequest);
  const restrictedHostMode = String(payload?.safety?.restrictedHostMode || "blocked")
    .trim()
    .toLowerCase();
  const readOnlyRequested = Boolean(payload?.command?.readOnlyRequested);
  const terminalMode = String(payload?.safety?.terminalMode || "interactive_sandbox_only")
    .trim()
    .toLowerCase();

  const blockedByPolicy =
    (restrictedHostRequest && restrictedHostMode === "blocked") ||
    (terminalMode === "read_only" && !readOnlyRequested);

  return deepClone({
    source: "mock",
    applied: !blockedByPolicy,
    sessionId: `term-${Date.now()}`,
    requestedAt,
    status: blockedByPolicy ? "POLICY_BLOCKED" : "QUEUED",
    runId: payload?.scope?.runId || "",
    provenanceTag: payload?.provenance?.commandTag || "",
    auditLink: payload?.auditLink || {
      event: "runtime.terminal.command",
      runId: payload?.scope?.runId || "",
      providerId: "terminal-session"
    },
    warning: blockedByPolicy
      ? "Terminal request was blocked by current policy posture."
      : ""
  });
}

function deriveAuditFromRuns(runs) {
  const items = [];
  for (const run of runs || []) {
    items.push({
      ts: run.createdAt || run.updatedAt || "",
      event: "runtime.run.created",
      tenantId: run.tenantId || "",
      projectId: run.projectId || "",
      providerId: run.selectedProfileProvider || "",
      decision: ""
    });
    items.push({
      ts: run.updatedAt || run.createdAt || "",
      event: "runtime.policy.decision",
      tenantId: run.tenantId || "",
      projectId: run.projectId || "",
      providerId: run.selectedPolicyProvider || "",
      decision: normalizeDecision(run.policyDecision)
    });
    if (run.selectedDesktopProvider) {
      items.push({
        ts: run.updatedAt || run.createdAt || "",
        event: "runtime.desktop.step",
        tenantId: run.tenantId || "",
        projectId: run.projectId || "",
        providerId: run.selectedDesktopProvider || "",
        decision: normalizeDecision(run.policyDecision)
      });
    }
    items.push({
      ts: run.updatedAt || run.createdAt || "",
      event: run.status === "FAILED" ? "runtime.run.failed" : "runtime.run.completed",
      tenantId: run.tenantId || "",
      projectId: run.projectId || "",
      providerId: run.selectedEvidenceProvider || "",
      decision: normalizeDecision(run.policyDecision)
    });
  }

  return {
    source: "derived-runs",
    warning: "Runtime audit endpoint is unavailable; showing synthetic audit rows from run summaries.",
    count: items.length,
    items
  };
}

function isPendingApprovalCandidate(run) {
  const decision = normalizeDecision(run?.policyDecision);
  if (decision !== "ALLOW") {
    return false;
  }
  if (Boolean(run?.policyGrantTokenPresent)) {
    return false;
  }
  const status = normalizeStatus(run?.status);
  return status !== "COMPLETED" && status !== "FAILED";
}

function withQueryParams(url, query) {
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function parseSessionEventStream(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return [];
  }
  return text
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split("\n");
      const item = {
        id: "",
        event: "",
        data: ""
      };
      for (const line of lines) {
        if (line.startsWith("id:")) {
          item.id = line.slice(3).trim();
        } else if (line.startsWith("event:")) {
          item.event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          item.data += `${line.slice(5).trim()}\n`;
        }
      }
      const payloadText = item.data.trim();
      if (!payloadText) {
        return null;
      }
      try {
        return JSON.parse(payloadText);
      } catch (_) {
        return {
          eventType: item.event || "unknown",
          raw: payloadText
        };
      }
    })
    .filter(Boolean);
}

export class AgentOpsApi {
  constructor(config, getToken) {
    this.config = config;
    this.getToken = getToken;
    this.endpointStatus = {
    tasks: {
      state: "unknown",
      detail: "Not checked yet.",
      updatedAt: ""
    },
      sessions: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      workerCapabilities: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      policyPacks: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      runtimeIdentity: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      runs: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      runById: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      sessionTimeline: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      sessionEventStream: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      auditEvents: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      approvalsQueue: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      approvalDecision: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      sessionApprovalDecision: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      sessionClose: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      terminalSessions: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      integrationSettings: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      },
      integrationInvoke: {
        state: "unknown",
        detail: "Not checked yet.",
        updatedAt: ""
      }
    };
  }

  updateEndpointStatus(endpointKey, state, detail) {
    if (!this.endpointStatus[endpointKey]) {
      return;
    }
    this.endpointStatus[endpointKey] = {
      state: String(state || "unknown").trim().toLowerCase() || "unknown",
      detail: String(detail || "").trim(),
      updatedAt: nowISO()
    };
  }

  getEndpointStatusSnapshot() {
    return deepClone(this.endpointStatus);
  }

  getSettingsSnapshot(context = {}) {
    const choices = context.choices || {};
    const endpointSnapshot = this.getEndpointStatusSnapshot();
    const themeMode = String(context.themeMode || choices?.theme?.mode || "system")
      .trim()
      .toLowerCase();
    const selectedAgentProfileID = String(
      context.selectedAgentProfileId || choices?.integrations?.selectedAgentProfileId || ""
    )
      .trim()
      .toLowerCase();
    const agentProfiles = Array.isArray(choices?.integrations?.agentProfiles)
      ? deepClone(choices.integrations.agentProfiles)
      : [];
    const providerContracts = agentProfiles.map((profile) => {
      const profileID = String(profile?.id || "").trim().toLowerCase();
      return {
        profileId: profileID,
        label: String(profile?.label || profileID || "-").trim() || "-",
        provider: String(profile?.provider || "-").trim() || "-",
        transport: String(profile?.transport || "-").trim() || "-",
        model: String(profile?.model || "-").trim() || "-",
        endpointRef: String(profile?.endpointRef || "-").trim() || "-",
        credentialRef: String(profile?.credentialRef || "-").trim() || "-",
        credentialScope: String(profile?.credentialScope || "project").trim().toLowerCase() || "project",
        status: profile?.enabled === false ? "disabled" : "enabled",
        selected: profileID === selectedAgentProfileID
      };
    });

    return {
      source: this.config.mockMode ? "mock" : "runtime-endpoint",
      environment: this.config.environment || "unknown",
      runtimeApiBaseUrl: this.config.runtimeApiBaseUrl || "",
      registryApiBaseUrl: this.config.registryApiBaseUrl || "",
      dataSources: {
        runs: context.runs?.source || (this.config.mockMode ? "mock" : "runtime-endpoint"),
        approvals:
          context.approvals?.source || (this.config.mockMode ? "mock" : "runtime-endpoint"),
        audit: context.audit?.source || (this.config.mockMode ? "mock" : "runtime-endpoint")
      },
      identityTraceability: buildIdentityTraceabilitySnapshot(context),
      endpoints: [
        {
          id: "tasks",
          label: "Runtime Tasks",
          path: this.config?.endpoints?.tasks || "",
          ...(endpointSnapshot.tasks || {})
        },
        {
          id: "sessions",
          label: "Runtime Sessions",
          path: this.config?.endpoints?.sessions || "",
          ...(endpointSnapshot.sessions || {})
        },
        {
          id: "workerCapabilities",
          label: "Runtime Worker Capabilities",
          path: this.config?.endpoints?.workerCapabilities || "",
          ...(endpointSnapshot.workerCapabilities || {})
        },
        {
          id: "policyPacks",
          label: "Runtime Policy Packs",
          path: this.config?.endpoints?.policyPacks || "",
          ...(endpointSnapshot.policyPacks || {})
        },
        {
          id: "runtimeIdentity",
          label: "Runtime Identity",
          path: this.config?.endpoints?.runtimeIdentity || "",
          ...(endpointSnapshot.runtimeIdentity || {})
        },
        {
          id: "runs",
          label: "Runtime Runs",
          path: this.config?.endpoints?.runs || "",
          ...(endpointSnapshot.runs || {})
        },
        {
          id: "runById",
          label: "Runtime Run Detail",
          path: this.config?.endpoints?.runByIdPrefix || "",
          ...(endpointSnapshot.runById || {})
        },
        {
          id: "sessionTimeline",
          label: "Runtime Session Timeline",
          path: `${this.config?.endpoints?.sessionByIdPrefix || ""}{sessionId}/timeline`,
          ...(endpointSnapshot.sessionTimeline || {})
        },
        {
          id: "sessionEventStream",
          label: "Runtime Session Event Stream",
          path: `${this.config?.endpoints?.sessionByIdPrefix || ""}{sessionId}/events/stream`,
          ...(endpointSnapshot.sessionEventStream || {})
        },
        {
          id: "auditEvents",
          label: "Runtime Audit Events",
          path: this.config?.endpoints?.auditEvents || "",
          ...(endpointSnapshot.auditEvents || {})
        },
        {
          id: "approvalsQueue",
          label: "Runtime Approvals Queue",
          path: this.config?.endpoints?.approvalsQueue || "",
          ...(endpointSnapshot.approvalsQueue || {})
        },
        {
          id: "approvalDecision",
          label: "Runtime Approval Decision",
          path: this.config?.endpoints?.approvalDecisionPrefix || "",
          ...(endpointSnapshot.approvalDecision || {})
        },
        {
          id: "sessionApprovalDecision",
          label: "Runtime Session Approval Decision",
          path: `${this.config?.endpoints?.sessionByIdPrefix || ""}{sessionId}/approval-checkpoints/{checkpointId}/decision`,
          ...(endpointSnapshot.sessionApprovalDecision || {})
        },
        {
          id: "sessionClose",
          label: "Runtime Session Close",
          path: `${this.config?.endpoints?.sessionByIdPrefix || ""}{sessionId}/close`,
          ...(endpointSnapshot.sessionClose || {})
        },
        {
          id: "terminalSessions",
          label: "Runtime Terminal Sessions",
          path: this.config?.endpoints?.terminalSessions || "",
          ...(endpointSnapshot.terminalSessions || {})
        },
        {
          id: "integrationSettings",
          label: "Runtime Integration Settings",
          path: this.config?.endpoints?.integrationSettings || "",
          ...(endpointSnapshot.integrationSettings || {})
        },
        {
          id: "integrationInvoke",
          label: "Runtime Integration Invoke",
          path: this.config?.endpoints?.integrationInvoke || "",
          ...(endpointSnapshot.integrationInvoke || {})
        }
      ],
      integrations: {
        modelRouting: String(choices?.integrations?.modelRouting || "gateway_first"),
        gatewayProviderId: String(choices?.integrations?.gatewayProviderId || "litellm"),
        gatewayTokenRef: String(choices?.integrations?.gatewayTokenRef || "-"),
        gatewayMtlsCertRef: String(choices?.integrations?.gatewayMtlsCertRef || "-"),
        gatewayMtlsKeyRef: String(choices?.integrations?.gatewayMtlsKeyRef || "-"),
        allowDirectProviderFallback: Boolean(
          choices?.integrations?.allowDirectProviderFallback ?? true
        ),
        agentProfiles,
        providerContracts,
        selectedAgentProfileId: selectedAgentProfileID || String(agentProfiles[0]?.id || "")
      },
      realtime: deepClone(choices?.realtime || {}),
      storage: deepClone(choices?.storage || {}),
      terminal: deepClone(choices?.terminal || {}),
      theme: {
        mode: themeMode || "system"
      },
      aimxs: {
        ...summarizeAimxsStatus(context.providers || {}),
        paymentEntitled: Boolean(choices?.aimxs?.paymentEntitled),
        mode: String(choices?.aimxs?.mode || "oss-only").trim().toLowerCase(),
        endpointRef: String(choices?.aimxs?.endpointRef || "-"),
        bearerTokenRef: String(choices?.aimxs?.bearerTokenRef || "-"),
        clientTlsCertRef: String(
          choices?.aimxs?.clientTlsCertRef || choices?.aimxs?.mtlsCertRef || "-"
        ),
        clientTlsKeyRef: String(
          choices?.aimxs?.clientTlsKeyRef || choices?.aimxs?.mtlsKeyRef || "-"
        ),
        caCertRef: String(
          choices?.aimxs?.caCertRef || choices?.aimxs?.caBundleRef || "-"
        ),
        activation: normalizeAimxsActivationSnapshot(context.aimxsActivation || {})
      },
      identity: deepClone(
        context.runtimeIdentity || {
          source: this.config.mockMode ? "mock" : "runtime-endpoint",
          authEnabled: Boolean(this.config?.auth?.enabled),
          authenticated: false,
          authorityBasis: this.config?.auth?.enabled ? "unresolved" : "runtime_auth_disabled",
          policyMatrixRequired: false,
          policyRuleCount: 0,
          identity: {
            subject: "",
            clientId: "",
            roles: [],
            tenantIds: [],
            projectIds: [],
            effectivePermissions: [],
            claimKeys: []
          }
        }
      ),
      policyCatalog: deepClone(
        context.policyPacksCatalog || {
          source: this.config.mockMode ? "mock" : "runtime-endpoint",
          count: 0,
          items: []
        }
      ),
      localSecureRefs: deepClone(
        context.localSecureRefs || {
          available: false,
          platform: "unknown",
          service: "",
          indexPath: "",
          exportPath: "",
          storedCount: 0,
          entries: [],
          lastExportedAt: "",
          message: ""
        }
      )
    };
  }

  resolveBaseUrl(baseUrl) {
    const trimmed = String(baseUrl || "").trim();
    if (!trimmed) {
      return `${window.location.origin}/`;
    }
    if (this.shouldUseNativeDesktopProxy(trimmed)) {
      return `${window.location.origin}/`;
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) {
      return `${window.location.origin}${trimmed}`;
    }
    return `${window.location.origin}/${trimmed}`;
  }

  shouldUseNativeDesktopProxy(baseUrl) {
    if (String(this.config?.nativeShell?.mode || "").trim().toLowerCase() !== "live") {
      return false;
    }
    const trimmed = String(baseUrl || "").trim();
    if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
      return false;
    }
    try {
      const parsed = new URL(trimmed);
      const hostname = String(parsed.hostname || "").trim().toLowerCase();
      return (
        parsed.protocol === "http:" &&
        (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]")
      );
    } catch (_) {
      return false;
    }
  }

  async request(baseUrl, path, query, options = {}) {
    const token = this.getToken();
    const method = String(options.method || "GET").toUpperCase();
    const headers = {
      Accept: "application/json",
      ...(options.headers || {})
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let body;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const url = new URL(path, this.resolveBaseUrl(baseUrl));
    withQueryParams(url, query);

    const response = await fetch(url.toString(), { method, headers, body });
    if (!response.ok) {
      let apiError = null;
      let bodyText = "";
      try {
        bodyText = await response.text();
      } catch (_) {
        bodyText = "";
      }
      if (bodyText) {
        try {
          apiError = JSON.parse(bodyText);
        } catch (_) {
          apiError = null;
        }
      }
      let message = `HTTP ${response.status} ${response.statusText}`;
      const apiMessage = String(apiError?.message || "").trim();
      const apiDetailError = String(apiError?.details?.error || "").trim();
      if (apiMessage) {
        message = `${message}: ${apiMessage}`;
      }
      if (apiDetailError) {
        message = `${message} (${apiDetailError})`;
      }
      const error = new Error(message);
      error.status = response.status;
      error.apiError = apiError;
      error.responseText = bodyText;
      throw error;
    }
    if (response.status === 204) {
      return {};
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      const text = await response.text();
      return text ? { raw: text } : {};
    }
    return response.json();
  }

  async getHealth() {
    if (this.config.mockMode) {
      return mockHealth();
    }
    const runtimeURL = new URL(
      this.config.endpoints.health,
      this.resolveBaseUrl(this.config.runtimeApiBaseUrl)
    );
    const runtime = await fetch(runtimeURL.toString(), {
      headers: this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {}
    });
    return {
      runtime: {
        status: runtime.ok ? "ok" : "error",
        detail: runtime.ok ? "Runtime API reachable." : `Runtime check failed (${runtime.status})`
      },
      providers: { status: "unknown", detail: "Provider check uses providers endpoint." },
      policy: { status: "unknown", detail: "Policy status surface pending runtime endpoint." }
    };
  }

  async getProviders() {
    if (this.config.mockMode) {
      return mockProviderList();
    }
    try {
      return await this.request(this.config.registryApiBaseUrl, this.config.endpoints.providers);
    } catch (error) {
      if (error.status === 404 || error.status === 405) {
        return { items: [] };
      }
      throw error;
    }
  }

  async getPipelineStatus() {
    if (this.config.mockMode) {
      return mockPipelineStatus();
    }
    try {
      return await this.request(this.config.runtimeApiBaseUrl, this.config.endpoints.pipelineStatus);
    } catch (error) {
      if (error.status === 404) {
        return {
          status: "unknown",
          latestStagingGate: "-",
          latestProdGate: "-",
          detail: "No runtime pipeline endpoint exposed."
        };
      }
      throw error;
    }
  }

  async getRuntimeRuns(limit = 25) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("runs", "mock", "Mock mode enabled.");
      return { ...mockRuns(), source: "mock" };
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, this.config.endpoints.runs, {
        limit
      });
      this.updateEndpointStatus("runs", "available", "Runtime runs endpoint responded.");
      return {
        source: "runtime-endpoint",
        count: Number.parseInt(String(response?.count || "0"), 10) || 0,
        items: Array.isArray(response?.items) ? response.items : []
      };
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "runs",
          "unavailable",
          `Runtime runs endpoint returned HTTP ${error.status}.`
        );
        return {
          source: "endpoint-unavailable",
          warning: "Runtime runs endpoint is unavailable; no run data returned.",
          count: 0,
          items: []
        };
      }
      this.updateEndpointStatus("runs", "error", `Runtime runs request failed (${error.message}).`);
      throw error;
    }
  }

  async getRuntimeRun(runID) {
    if (!runID) {
      throw new Error("runId is required");
    }
    if (this.config.mockMode) {
      this.updateEndpointStatus("runById", "mock", "Mock mode enabled.");
      const hit = mockRunDetail(runID);
      if (!hit) {
        throw new Error("run not found");
      }
      return hit;
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        `${this.config.endpoints.runByIdPrefix}${encodeURIComponent(runID)}`
      );
      this.updateEndpointStatus("runById", "available", "Runtime run-detail endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404) {
        this.updateEndpointStatus(
          "runById",
          "fallback",
          "Runtime run-detail endpoint returned 404; using run-summary fallback in UI."
        );
      } else if (error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "runById",
          "unavailable",
          `Runtime run-detail endpoint returned HTTP ${error.status}.`
        );
      } else {
        this.updateEndpointStatus(
          "runById",
          "error",
          `Runtime run-detail request failed (${error.message}).`
        );
      }
      throw error;
    }
  }

  async createRuntimeTask(payload = {}) {
    const meta = payload?.meta || {};
    const tenantID = String(meta.tenantId || "").trim();
    const projectID = String(meta.projectId || "").trim();
    if (!tenantID || !projectID) {
      throw new Error("meta.tenantId and meta.projectId are required");
    }

    if (this.config.mockMode) {
      this.updateEndpointStatus("tasks", "mock", "Mock mode enabled.");
      return mockCreateRuntimeTask(payload);
    }

    const endpoint = this.config?.endpoints?.tasks;
    if (!endpoint) {
      this.updateEndpointStatus("tasks", "unavailable", "No runtime task endpoint configured.");
      throw new Error("Runtime task endpoint is not configured.");
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, undefined, {
        method: "POST",
        body: payload
      });
      this.updateEndpointStatus("tasks", "available", "Runtime task endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("tasks", "unavailable", `Runtime task endpoint returned HTTP ${error.status}.`);
      } else {
        this.updateEndpointStatus("tasks", "error", `Runtime task request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async listRuntimeTasks(query = {}) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("tasks", "mock", "Mock mode enabled.");
      return mockListRuntimeTasks(query);
    }

    const endpoint = this.config?.endpoints?.tasks;
    if (!endpoint) {
      this.updateEndpointStatus("tasks", "unavailable", "No runtime task endpoint configured.");
      throw new Error("Runtime task endpoint is not configured.");
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, query);
      this.updateEndpointStatus("tasks", "available", "Runtime task endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("tasks", "unavailable", `Runtime task list endpoint returned HTTP ${error.status}.`);
      } else {
        this.updateEndpointStatus("tasks", "error", `Runtime task list request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async listRuntimeSessions(query = {}) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("sessions", "mock", "Mock mode enabled.");
      return mockListRuntimeSessions(query);
    }

    const endpoint = this.config?.endpoints?.sessions;
    if (!endpoint) {
      this.updateEndpointStatus("sessions", "unavailable", "No runtime session endpoint configured.");
      throw new Error("Runtime session endpoint is not configured.");
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, query);
      this.updateEndpointStatus("sessions", "available", "Runtime session endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("sessions", "unavailable", `Runtime session list endpoint returned HTTP ${error.status}.`);
      } else {
        this.updateEndpointStatus("sessions", "error", `Runtime session list request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async listRuntimeWorkerCapabilities(query = {}) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("workerCapabilities", "mock", "Mock mode enabled.");
      return mockWorkerCapabilityCatalog();
    }

    const endpoint = this.config?.endpoints?.workerCapabilities;
    if (!endpoint) {
      this.updateEndpointStatus("workerCapabilities", "unavailable", "No runtime worker-capability endpoint configured.");
      throw new Error("Runtime worker-capability endpoint is not configured.");
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, query);
      this.updateEndpointStatus("workerCapabilities", "available", "Runtime worker-capability endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("workerCapabilities", "unavailable", `Runtime worker-capability endpoint returned HTTP ${error.status}.`);
        return {
          source: "endpoint-unavailable",
          warning: `Runtime worker-capability endpoint returned HTTP ${error.status}.`,
          count: 0,
          items: []
        };
      } else {
        this.updateEndpointStatus("workerCapabilities", "error", `Runtime worker-capability request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async listRuntimePolicyPacks(query = {}) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("policyPacks", "mock", "Mock mode enabled.");
      return mockPolicyPackCatalog();
    }

    const endpoint = this.config?.endpoints?.policyPacks;
    if (!endpoint) {
      this.updateEndpointStatus("policyPacks", "unavailable", "No runtime policy-pack endpoint configured.");
      throw new Error("Runtime policy-pack endpoint is not configured.");
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, query);
      this.updateEndpointStatus("policyPacks", "available", "Runtime policy-pack endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("policyPacks", "unavailable", `Runtime policy-pack endpoint returned HTTP ${error.status}.`);
        return {
          source: "endpoint-unavailable",
          warning: `Runtime policy-pack endpoint returned HTTP ${error.status}.`,
          count: 0,
          items: []
        };
      } else {
        this.updateEndpointStatus("policyPacks", "error", `Runtime policy-pack request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async getRuntimeIdentity() {
    if (this.config.mockMode) {
      this.updateEndpointStatus("runtimeIdentity", "mock", "Mock mode enabled.");
      return mockRuntimeIdentity();
    }

    const endpoint = this.config?.endpoints?.runtimeIdentity;
    if (!endpoint) {
      this.updateEndpointStatus("runtimeIdentity", "unavailable", "No runtime identity endpoint configured.");
      throw new Error("Runtime identity endpoint is not configured.");
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, {});
      this.updateEndpointStatus("runtimeIdentity", "available", "Runtime identity endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("runtimeIdentity", "unavailable", `Runtime identity endpoint returned HTTP ${error.status}.`);
        return {
          source: "endpoint-unavailable",
          warning: `Runtime identity endpoint returned HTTP ${error.status}.`,
          authEnabled: Boolean(this.config?.auth?.enabled),
          authenticated: false,
          authorityBasis: "endpoint_unavailable",
          policyMatrixRequired: false,
          policyRuleCount: 0,
          identity: {
            subject: "",
            clientId: "",
            roles: [],
            tenantIds: [],
            projectIds: [],
            effectivePermissions: [],
            claimKeys: []
          }
        };
      }
      this.updateEndpointStatus("runtimeIdentity", "error", `Runtime identity request failed (${error.message}).`);
      throw error;
    }
  }

  async listRuntimeExportProfiles(query = {}) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("exportProfiles", "mock", "Mock mode enabled.");
      return mockExportProfileCatalog();
    }

    const endpoint = this.config?.endpoints?.exportProfiles;
    if (!endpoint) {
      this.updateEndpointStatus("exportProfiles", "unavailable", "No runtime export-profile endpoint configured.");
      throw new Error("Runtime export-profile endpoint is not configured.");
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, query);
      this.updateEndpointStatus("exportProfiles", "available", "Runtime export-profile endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("exportProfiles", "unavailable", `Runtime export-profile endpoint returned HTTP ${error.status}.`);
        return {
          source: "endpoint-unavailable",
          warning: `Runtime export-profile endpoint returned HTTP ${error.status}.`,
          count: 0,
          items: []
        };
      } else {
        this.updateEndpointStatus("exportProfiles", "error", `Runtime export-profile request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async listRuntimeOrgAdminProfiles(query = {}) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("orgAdminProfiles", "mock", "Mock mode enabled.");
      return mockOrgAdminCatalog();
    }

    const endpoint = this.config?.endpoints?.orgAdminProfiles;
    if (!endpoint) {
      this.updateEndpointStatus("orgAdminProfiles", "unavailable", "No runtime org-admin endpoint configured.");
      throw new Error("Runtime org-admin endpoint is not configured.");
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, query);
      this.updateEndpointStatus("orgAdminProfiles", "available", "Runtime org-admin endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("orgAdminProfiles", "unavailable", `Runtime org-admin endpoint returned HTTP ${error.status}.`);
        return {
          source: "endpoint-unavailable",
          warning: `Runtime org-admin endpoint returned HTTP ${error.status}.`,
          count: 0,
          items: []
        };
      } else {
        this.updateEndpointStatus("orgAdminProfiles", "error", `Runtime org-admin request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async createRuntimeSessionForTask(taskID, payload = {}) {
    const normalizedTaskID = String(taskID || "").trim();
    if (!normalizedTaskID) {
      throw new Error("taskId is required");
    }
    if (this.config.mockMode) {
      this.updateEndpointStatus("sessionCreate", "mock", "Mock mode enabled.");
      return mockCreateRuntimeSessionForTask(normalizedTaskID, payload);
    }

    const endpoint = this.config?.endpoints?.tasks;
    if (!endpoint) {
      this.updateEndpointStatus("sessionCreate", "unavailable", "No runtime task endpoint configured.");
      throw new Error("Runtime task endpoint is not configured.");
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        `${endpoint}/${encodeURIComponent(normalizedTaskID)}/sessions`,
        undefined,
        {
          method: "POST",
          body: payload
        }
      );
      this.updateEndpointStatus("sessionCreate", "available", "Runtime session create endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("sessionCreate", "unavailable", `Runtime session create endpoint returned HTTP ${error.status}.`);
      } else {
        this.updateEndpointStatus("sessionCreate", "error", `Runtime session create request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async attachRuntimeSessionWorker(sessionID, payload = {}) {
    const normalizedSessionID = String(sessionID || "").trim();
    if (!normalizedSessionID) {
      throw new Error("sessionId is required");
    }
    if (this.config.mockMode) {
      this.updateEndpointStatus("sessionWorkers", "mock", "Mock mode enabled.");
      return mockAttachRuntimeSessionWorker(normalizedSessionID, payload);
    }

    const prefix = this.config?.endpoints?.sessionByIdPrefix || "";
    if (!prefix) {
      this.updateEndpointStatus("sessionWorkers", "unavailable", "No runtime session worker endpoint configured.");
      throw new Error("Runtime session worker endpoint is not configured.");
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        `${prefix}${encodeURIComponent(normalizedSessionID)}/workers`,
        undefined,
        {
          method: "POST",
          body: payload
        }
      );
      this.updateEndpointStatus("sessionWorkers", "available", "Runtime session worker endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("sessionWorkers", "unavailable", `Runtime session worker endpoint returned HTTP ${error.status}.`);
      } else {
        this.updateEndpointStatus("sessionWorkers", "error", `Runtime session worker request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async createRuntimeSessionWorkerEvent(sessionID, workerID, payload = {}) {
    const normalizedSessionID = String(sessionID || "").trim();
    const normalizedWorkerID = String(workerID || "").trim();
    if (!normalizedSessionID || !normalizedWorkerID) {
      throw new Error("sessionId and workerId are required");
    }
    if (this.config.mockMode) {
      this.updateEndpointStatus("sessionWorkerEvent", "mock", "Mock mode enabled.");
      return mockCreateRuntimeSessionWorkerEvent(normalizedSessionID, normalizedWorkerID, payload);
    }

    const prefix = this.config?.endpoints?.sessionByIdPrefix || "";
    if (!prefix) {
      this.updateEndpointStatus("sessionWorkerEvent", "unavailable", "No runtime session worker event endpoint configured.");
      throw new Error("Runtime session worker event endpoint is not configured.");
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        `${prefix}${encodeURIComponent(normalizedSessionID)}/workers/${encodeURIComponent(normalizedWorkerID)}/events`,
        undefined,
        {
          method: "POST",
          body: payload
        }
      );
      this.updateEndpointStatus("sessionWorkerEvent", "available", "Runtime session worker event endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus("sessionWorkerEvent", "unavailable", `Runtime session worker event endpoint returned HTTP ${error.status}.`);
      } else {
        this.updateEndpointStatus("sessionWorkerEvent", "error", `Runtime session worker event request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async getRuntimeSessionTimeline(sessionID) {
    const normalizedSessionID = String(sessionID || "").trim();
    if (!normalizedSessionID) {
      throw new Error("sessionId is required");
    }
    if (this.config.mockMode) {
      this.updateEndpointStatus("sessionTimeline", "mock", "Mock mode enabled.");
      const hit = mockGetRuntimeSessionTimeline(normalizedSessionID);
      if (!hit) {
        throw new Error("session timeline not found");
      }
      return hit;
    }

    const prefix = this.config?.endpoints?.sessionByIdPrefix || "";
    if (!prefix) {
      this.updateEndpointStatus(
        "sessionTimeline",
        "unavailable",
        "No runtime session timeline endpoint configured."
      );
      throw new Error("Runtime session timeline endpoint is not configured.");
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        `${prefix}${encodeURIComponent(normalizedSessionID)}/timeline`
      );
      this.updateEndpointStatus(
        "sessionTimeline",
        "available",
        "Runtime session timeline endpoint responded."
      );
      return response;
    } catch (error) {
      if (error.status === 404) {
        this.updateEndpointStatus(
          "sessionTimeline",
          "fallback",
          "Runtime session timeline endpoint returned 404."
        );
      } else if (error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "sessionTimeline",
          "unavailable",
          `Runtime session timeline endpoint returned HTTP ${error.status}.`
        );
      } else {
        this.updateEndpointStatus(
          "sessionTimeline",
          "error",
          `Runtime session timeline request failed (${error.message}).`
        );
      }
      throw error;
    }
  }

  async getRuntimeSessionEventStream(sessionID, options = {}) {
    const normalizedSessionID = String(sessionID || "").trim();
    if (!normalizedSessionID) {
      throw new Error("sessionId is required");
    }
    if (this.config.mockMode) {
      this.updateEndpointStatus("sessionEventStream", "mock", "Mock mode enabled.");
      const hit = mockGetRuntimeSessionEventStream(normalizedSessionID, options);
      if (!hit) {
        throw new Error("session event stream not found");
      }
      return hit;
    }

    const prefix = this.config?.endpoints?.sessionByIdPrefix || "";
    if (!prefix) {
      this.updateEndpointStatus(
        "sessionEventStream",
        "unavailable",
        "No runtime session event-stream endpoint configured."
      );
      throw new Error("Runtime session event-stream endpoint is not configured.");
    }

    const token = this.getToken();
    const headers = {
      Accept: "text/event-stream"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = new URL(
      `${prefix}${encodeURIComponent(normalizedSessionID)}/events/stream`,
      this.resolveBaseUrl(this.config.runtimeApiBaseUrl)
    );
    withQueryParams(url, {
      afterSequence: options.afterSequence,
      waitSeconds: options.waitSeconds,
      follow: options.follow ? "true" : ""
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      headers
    });
    if (!response.ok) {
      if (response.status === 404) {
        this.updateEndpointStatus(
          "sessionEventStream",
          "fallback",
          "Runtime session event-stream endpoint returned 404."
        );
      } else if (response.status === 405 || response.status === 501) {
        this.updateEndpointStatus(
          "sessionEventStream",
          "unavailable",
          `Runtime session event-stream endpoint returned HTTP ${response.status}.`
        );
      } else {
        this.updateEndpointStatus(
          "sessionEventStream",
          "error",
          `Runtime session event-stream request failed (HTTP ${response.status}).`
        );
      }
      const error = new Error(`HTTP ${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    const raw = await response.text();
    this.updateEndpointStatus(
      "sessionEventStream",
      "available",
      "Runtime session event-stream endpoint responded."
    );
    const items = parseSessionEventStream(raw);
    return {
      source: "runtime-endpoint",
      sessionId: normalizedSessionID,
      count: items.length,
      items
    };
  }

  async submitRuntimeSessionApprovalDecision(sessionID, checkpointID, decision, options = {}) {
    const normalizedSessionID = String(sessionID || "").trim();
    const normalizedCheckpointID = String(checkpointID || "").trim();
    if (!normalizedSessionID) {
      throw new Error("sessionId is required for session approval decision");
    }
    if (!normalizedCheckpointID) {
      throw new Error("checkpointId is required for session approval decision");
    }
    const normalizedDecision = String(decision || "").trim().toUpperCase() === "DENY" ? "DENY" : "APPROVE";

    if (this.config.mockMode) {
      this.updateEndpointStatus("sessionApprovalDecision", "mock", "Mock mode enabled.");
      return mockSubmitRuntimeSessionApprovalDecision(normalizedSessionID, normalizedCheckpointID, normalizedDecision, options);
    }

    const prefix = this.config?.endpoints?.sessionByIdPrefix || "";
    if (!prefix) {
      this.updateEndpointStatus(
        "sessionApprovalDecision",
        "unavailable",
        "No runtime session approval decision endpoint configured."
      );
      return {
        applied: false,
        source: "endpoint-unavailable",
        sessionId: normalizedSessionID,
        checkpointId: normalizedCheckpointID,
        decision: normalizedDecision,
        warning: "Runtime session approval decision endpoint is not configured."
      };
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        `${prefix}${encodeURIComponent(normalizedSessionID)}/approval-checkpoints/${encodeURIComponent(normalizedCheckpointID)}/decision`,
        undefined,
        {
          method: "POST",
          body: {
            meta: options.meta || {},
            decision: normalizedDecision,
            reason: options.reason || ""
          }
        }
      );
      this.updateEndpointStatus(
        "sessionApprovalDecision",
        "available",
        "Runtime session approval decision endpoint responded."
      );
      return {
        ...response,
        source: "runtime-endpoint"
      };
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "sessionApprovalDecision",
          "unavailable",
          `Runtime session approval decision endpoint returned HTTP ${error.status}.`
        );
        return {
          applied: false,
          source: "endpoint-unavailable",
          sessionId: normalizedSessionID,
          checkpointId: normalizedCheckpointID,
          decision: normalizedDecision,
          warning: `Runtime session approval decision endpoint returned HTTP ${error.status}.`
        };
      }
      this.updateEndpointStatus(
        "sessionApprovalDecision",
        "error",
        `Runtime session approval decision request failed (${error.message}).`
      );
      throw error;
    }
  }

  async submitRuntimeSessionToolProposalDecision(sessionID, proposalID, decision, options = {}) {
    const normalizedSessionID = String(sessionID || "").trim();
    const normalizedProposalID = String(proposalID || "").trim();
    if (!normalizedSessionID) {
      throw new Error("sessionId is required for tool proposal decision");
    }
    if (!normalizedProposalID) {
      throw new Error("proposalId is required for tool proposal decision");
    }
    const normalizedDecision = String(decision || "").trim().toUpperCase() === "DENY" ? "DENY" : "APPROVE";

    if (this.config.mockMode) {
      this.updateEndpointStatus("sessionToolProposalDecision", "mock", "Mock mode enabled.");
      return mockSubmitRuntimeSessionToolProposalDecision(normalizedSessionID, normalizedProposalID, normalizedDecision, options);
    }

    const prefix = this.config?.endpoints?.sessionByIdPrefix || "";
    if (!prefix) {
      this.updateEndpointStatus(
        "sessionToolProposalDecision",
        "unavailable",
        "No runtime session tool-proposal decision endpoint configured."
      );
      return {
        applied: false,
        source: "endpoint-unavailable",
        sessionId: normalizedSessionID,
        proposalId: normalizedProposalID,
        decision: normalizedDecision,
        warning: "Runtime session tool-proposal decision endpoint is not configured."
      };
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        `${prefix}${encodeURIComponent(normalizedSessionID)}/tool-proposals/${encodeURIComponent(normalizedProposalID)}/decision`,
        undefined,
        {
          method: "POST",
          body: {
            meta: options.meta || {},
            decision: normalizedDecision,
            reason: options.reason || ""
          }
        }
      );
      this.updateEndpointStatus(
        "sessionToolProposalDecision",
        "available",
        "Runtime session tool-proposal decision endpoint responded."
      );
      return {
        ...response,
        source: "runtime-endpoint"
      };
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "sessionToolProposalDecision",
          "unavailable",
          `Runtime session tool-proposal decision endpoint returned HTTP ${error.status}.`
        );
        return {
          applied: false,
          source: "endpoint-unavailable",
          sessionId: normalizedSessionID,
          proposalId: normalizedProposalID,
          decision: normalizedDecision,
          warning: `Runtime session tool-proposal decision endpoint returned HTTP ${error.status}.`
        };
      }
      this.updateEndpointStatus(
        "sessionToolProposalDecision",
        "error",
        `Runtime session tool-proposal decision request failed (${error.message}).`
      );
      throw error;
    }
  }

  async closeRuntimeSession(sessionID, payload = {}) {
    const normalizedSessionID = String(sessionID || "").trim();
    if (!normalizedSessionID) {
      throw new Error("sessionId is required to close a runtime session");
    }

    if (this.config.mockMode) {
      this.updateEndpointStatus("sessionClose", "mock", "Mock mode enabled.");
      return mockCloseRuntimeSession(normalizedSessionID, payload);
    }

    const prefix = this.config?.endpoints?.sessionByIdPrefix || "";
    if (!prefix) {
      this.updateEndpointStatus(
        "sessionClose",
        "unavailable",
        "No runtime session close endpoint configured."
      );
      return {
        applied: false,
        source: "endpoint-unavailable",
        sessionId: normalizedSessionID,
        warning: "Runtime session close endpoint is not configured."
      };
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        `${prefix}${encodeURIComponent(normalizedSessionID)}/close`,
        undefined,
        {
          method: "POST",
          body: payload
        }
      );
      this.updateEndpointStatus(
        "sessionClose",
        "available",
        "Runtime session close endpoint responded."
      );
      return {
        ...response,
        applied: true,
        source: "runtime-endpoint"
      };
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "sessionClose",
          "unavailable",
          `Runtime session close endpoint returned HTTP ${error.status}.`
        );
        return {
          applied: false,
          source: "endpoint-unavailable",
          sessionId: normalizedSessionID,
          warning: `Runtime session close endpoint returned HTTP ${error.status}.`
        };
      }
      this.updateEndpointStatus(
        "sessionClose",
        "error",
        `Runtime session close request failed (${error.message}).`
      );
      throw error;
    }
  }

  async createRuntimeRun(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("createRuntimeRun payload must be an object");
    }
    if (this.config.mockMode) {
      this.updateEndpointStatus("runs", "mock", "Mock mode enabled.");
      return mockCreateRuntimeRun(payload);
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        this.config.endpoints.runs,
        undefined,
        {
          method: "POST",
          body: payload
        }
      );
      this.updateEndpointStatus("runs", "available", "Runtime run-create endpoint responded.");
      return response;
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "runs",
          "unavailable",
          `Runtime run-create endpoint returned HTTP ${error.status}.`
        );
      } else {
        this.updateEndpointStatus("runs", "error", `Runtime run-create request failed (${error.message}).`);
      }
      throw error;
    }
  }

  async getIntegrationSettings(scope = {}) {
    const tenantID = String(scope.tenantId || "").trim();
    const projectID = String(scope.projectId || "").trim();
    if (!tenantID || !projectID) {
      return {
        source: "scope-unavailable",
        hasSettings: false,
        warning: "tenantId and projectId are required to read integration settings.",
        tenantId: tenantID,
        projectId: projectID
      };
    }

    if (this.config.mockMode) {
      this.updateEndpointStatus("integrationSettings", "mock", "Mock mode enabled.");
      return mockGetIntegrationSettings({ tenantId: tenantID, projectId: projectID });
    }

    const endpoint = this.config?.endpoints?.integrationSettings;
    if (!endpoint) {
      this.updateEndpointStatus(
        "integrationSettings",
        "unavailable",
        "No integration settings endpoint configured."
      );
      return {
        source: "endpoint-unavailable",
        hasSettings: false,
        warning: "Runtime integration settings endpoint is not configured.",
        tenantId: tenantID,
        projectId: projectID
      };
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, {
        tenantId: tenantID,
        projectId: projectID
      });
      this.updateEndpointStatus(
        "integrationSettings",
        "available",
        "Runtime integration settings endpoint responded."
      );
      return {
        ...response,
        source: "runtime-endpoint"
      };
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "integrationSettings",
          "unavailable",
          `Runtime integration settings endpoint returned HTTP ${error.status}.`
        );
        return {
          source: "endpoint-unavailable",
          hasSettings: false,
          warning: `Runtime integration settings endpoint returned HTTP ${error.status}.`,
          tenantId: tenantID,
          projectId: projectID
        };
      }
      this.updateEndpointStatus(
        "integrationSettings",
        "error",
        `Runtime integration settings request failed (${error.message}).`
      );
      throw error;
    }
  }

  async upsertIntegrationSettings(payload = {}) {
    const meta = payload?.meta || {};
    const tenantID = String(meta.tenantId || "").trim();
    const projectID = String(meta.projectId || "").trim();
    if (!tenantID || !projectID) {
      return {
        applied: false,
        source: "scope-unavailable",
        warning: "tenantId and projectId are required to save integration settings.",
        tenantId: tenantID,
        projectId: projectID
      };
    }

    if (this.config.mockMode) {
      this.updateEndpointStatus("integrationSettings", "mock", "Mock mode enabled.");
      return {
        ...mockPutIntegrationSettings(payload),
        applied: true
      };
    }

    const endpoint = this.config?.endpoints?.integrationSettings;
    if (!endpoint) {
      this.updateEndpointStatus(
        "integrationSettings",
        "unavailable",
        "No integration settings endpoint configured."
      );
      return {
        applied: false,
        source: "endpoint-unavailable",
        warning: "Runtime integration settings endpoint is not configured.",
        tenantId: tenantID,
        projectId: projectID
      };
    }

    try {
      const response = await this.request(
        this.config.runtimeApiBaseUrl,
        endpoint,
        undefined,
        {
          method: "PUT",
          body: payload
        }
      );
      this.updateEndpointStatus(
        "integrationSettings",
        "available",
        "Runtime integration settings update endpoint responded."
      );
      return {
        ...response,
        applied: true,
        source: "runtime-endpoint"
      };
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "integrationSettings",
          "unavailable",
          `Runtime integration settings update endpoint returned HTTP ${error.status}.`
        );
        return {
          applied: false,
          source: "endpoint-unavailable",
          warning: `Runtime integration settings update endpoint returned HTTP ${error.status}.`,
          tenantId: tenantID,
          projectId: projectID
        };
      }
      this.updateEndpointStatus(
        "integrationSettings",
        "error",
        `Runtime integration settings update failed (${error.message}).`
      );
      throw error;
    }
  }

  async getLocalSecureRefs() {
    try {
      return await this.request("", "/__agentops/secure-refs");
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501 || error.status === 503) {
        return {
          available: false,
          source: "helper-unavailable",
          entries: [],
          storedCount: 0,
          service: "",
          indexPath: "",
          exportPath: "",
          lastExportedAt: "",
          message: "Local secure credential capture is unavailable on this launcher."
        };
      }
      throw error;
    }
  }

  async upsertLocalSecureRef(payload = {}) {
    return this.request("", "/__agentops/secure-refs/upsert", undefined, {
      method: "POST",
      body: payload
    });
  }

  async deleteLocalSecureRef(payload = {}) {
    return this.request("", "/__agentops/secure-refs/delete", undefined, {
      method: "POST",
      body: payload
    });
  }

  async exportLocalSecureRefs() {
    return this.request("", "/__agentops/secure-refs/export", undefined, {
      method: "POST",
      body: {}
    });
  }

  async getAimxsActivation() {
    if (this.config.mockMode) {
      return normalizeAimxsActivationSnapshot({
        available: true,
        source: "mock",
        state: "active",
        message: "Mock AIMXS activation reports aimxs-https as active.",
        namespace: "epydios-system",
        activeMode: "aimxs-https",
        selectedProviderId: "aimxs-policy-primary",
        selectedProviderName: "aimxs-policy-primary",
        selectedProviderReady: true,
        selectedProviderProbed: true,
        capabilities: [
          "policy.evaluate",
          "policy.validate_bundle",
          "governance.handshake_validation",
          "evidence.policy_decision_refs"
        ],
        enabledProviders: [
          {
            name: "aimxs-policy-primary",
            providerId: "aimxs-policy-primary",
            mode: "aimxs-https",
            enabled: true,
            ready: true,
            probed: true,
            priority: 900,
            authMode: "MTLSAndBearerTokenSecret",
            capabilities: [
              "policy.evaluate",
              "policy.validate_bundle",
              "governance.handshake_validation",
              "evidence.policy_decision_refs"
            ]
          }
        ],
        secrets: {
          bearerTokenSecret: { name: "aimxs-policy-token", present: true },
          clientTlsSecret: { name: "epydios-controller-mtls-client", present: true },
          caSecret: { name: "epydios-provider-ca", present: true }
        }
      });
    }

    try {
      return await this.request("", "/__agentops/aimxs/activation");
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501 || error.status === 503) {
        return normalizeAimxsActivationSnapshot({
          available: false,
          source: "helper-unavailable",
          state: "unavailable",
          message: "AIMXS activation helper is unavailable on this launcher."
        });
      }
      throw error;
    }
  }

  async applyAimxsActivation(payload = {}) {
    return this.request("", "/__agentops/aimxs/activation/apply", undefined, {
      method: "POST",
      body: payload
    });
  }

  async invokeIntegrationAgent(payload = {}) {
    const meta = payload?.meta || {};
    const tenantID = String(meta.tenantId || "").trim();
    const projectID = String(meta.projectId || "").trim();
    if (!tenantID || !projectID) {
      return {
        applied: false,
        source: "scope-unavailable",
        warning: "tenantId and projectId are required to invoke an agent profile.",
        tenantId: tenantID,
        projectId: projectID
      };
    }

    if (this.config.mockMode) {
      this.updateEndpointStatus("integrationInvoke", "mock", "Mock mode enabled.");
      return mockInvokeIntegrationAgent(payload);
    }

    const endpoint = this.config?.endpoints?.integrationInvoke;
    if (!endpoint) {
      this.updateEndpointStatus(
        "integrationInvoke",
        "unavailable",
        "No integration invoke endpoint configured."
      );
      return {
        applied: false,
        source: "endpoint-unavailable",
        warning: "Runtime integration invoke endpoint is not configured.",
        tenantId: tenantID,
        projectId: projectID
      };
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, undefined, {
        method: "POST",
        body: payload
      });
      this.updateEndpointStatus(
        "integrationInvoke",
        "available",
        "Runtime integration invoke endpoint responded."
      );
      return {
        ...response,
        source: "runtime-endpoint"
      };
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "integrationInvoke",
          "unavailable",
          `Runtime integration invoke endpoint returned HTTP ${error.status}.`
        );
        return {
          applied: false,
          source: "endpoint-unavailable",
          warning: `Runtime integration invoke endpoint returned HTTP ${error.status}.`,
          tenantId: tenantID,
          projectId: projectID
        };
      }
      this.updateEndpointStatus(
        "integrationInvoke",
        "error",
        `Runtime integration invoke failed (${error.message}).`
      );
      throw error;
    }
  }

  async createTerminalSession(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("createTerminalSession payload must be an object");
    }

    if (this.config.mockMode) {
      this.updateEndpointStatus("terminalSessions", "mock", "Mock mode enabled.");
      return mockCreateTerminalSession(payload);
    }

    const endpoint = this.config.endpoints.terminalSessions;
    if (endpoint) {
      try {
        const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, undefined, {
          method: "POST",
          body: payload
        });
        this.updateEndpointStatus(
          "terminalSessions",
          "available",
          "Runtime terminal sessions endpoint responded."
        );
        return {
          ...response,
          source: "runtime-endpoint"
        };
      } catch (error) {
        if (error.status !== 404 && error.status !== 405 && error.status !== 501) {
          this.updateEndpointStatus(
            "terminalSessions",
            "error",
            `Runtime terminal request failed (${error.message}).`
          );
          throw error;
        }
        this.updateEndpointStatus(
          "terminalSessions",
          "unavailable",
          `Runtime terminal endpoint returned HTTP ${error.status}; no session was created.`
        );
      }
    } else {
      this.updateEndpointStatus(
        "terminalSessions",
        "unavailable",
        "No terminal session endpoint configured."
      );
    }

    return {
      applied: false,
      warning: "Runtime terminal endpoint is not exposed yet; no session was created.",
      source: "endpoint-unavailable"
    };
  }

  async getAuditEvents(filters = {}, runSummaries = []) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("auditEvents", "mock", "Mock mode enabled.");
      return { ...mockAuditEvents(), source: "mock" };
    }

    const endpoint = this.config.endpoints.auditEvents;
    if (!endpoint) {
      this.updateEndpointStatus(
        "auditEvents",
        "unavailable",
        "No audit endpoint configured; using derived run metadata."
      );
      return deriveAuditFromRuns(runSummaries);
    }

    try {
      const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, {
        limit: filters.limit || 100,
        tenantId: filters.tenantId || filters.tenant || "",
        projectId: filters.projectId || filters.project || "",
        providerId: filters.providerId || "",
        decision: filters.decision || ""
      });
      this.updateEndpointStatus("auditEvents", "available", "Runtime audit endpoint responded.");
      if (Array.isArray(response?.items)) {
        return {
          ...response,
          source: "runtime-endpoint"
        };
      }
      return { source: "runtime-endpoint", count: 0, items: [] };
    } catch (error) {
      if (error.status === 404 || error.status === 405 || error.status === 501) {
        this.updateEndpointStatus(
          "auditEvents",
          "unavailable",
          `Runtime audit endpoint returned HTTP ${error.status}; using derived run metadata.`
        );
        return deriveAuditFromRuns(runSummaries);
      }
      this.updateEndpointStatus("auditEvents", "error", `Runtime audit request failed (${error.message}).`);
      throw error;
    }
  }

  async deriveApprovalsFromRuns(runSummaries) {
    const pending = (runSummaries || []).filter((run) => isPendingApprovalCandidate(run));
    const items = await Promise.all(
      pending.map(async (run) => {
        let detail = null;
        try {
          detail = await this.getRuntimeRun(run.runId);
        } catch (_) {
          detail = null;
        }

        const desktop = detail?.requestPayload?.desktop || {};
        const createdAt = run.updatedAt || run.createdAt || nowISO();
        const expiresAt = run.expiresAt || plusSecondsISO(900);

        return {
          approvalId: `approval-${run.runId}`,
          runId: run.runId,
          requestId: run.requestId,
          tenantId: run.tenantId,
          projectId: run.projectId,
          tier: Number.parseInt(String(desktop.tier || "3"), 10) || 3,
          targetOS: String(desktop.targetOS || "linux").toLowerCase(),
          targetExecutionProfile:
            String(desktop.targetExecutionProfile || "sandbox_vm_autonomous").toLowerCase(),
          requestedCapabilities: Array.isArray(desktop.requestedCapabilities)
            ? desktop.requestedCapabilities
            : [],
          status: "PENDING",
          createdAt,
          expiresAt,
          reason: "Derived pending approval from run state (no policy grant token detected)."
        };
      })
    );

    return items;
  }

  async getApprovalQueue(filters = {}, runSummaries = []) {
    if (this.config.mockMode) {
      this.updateEndpointStatus("approvalsQueue", "mock", "Mock mode enabled.");
      return { ...mockApprovalQueue(), source: "mock" };
    }

    const endpoint = this.config.endpoints.approvalsQueue;
    if (endpoint) {
      try {
        const response = await this.request(this.config.runtimeApiBaseUrl, endpoint, {
          limit: filters.limit || 100,
          tenantId: filters.tenant || filters.tenantId || "",
          projectId: filters.project || filters.projectId || "",
          status: filters.status || ""
        });
        if (Array.isArray(response?.items)) {
          this.updateEndpointStatus("approvalsQueue", "available", "Runtime approvals queue endpoint responded.");
          return {
            ...response,
            source: "runtime-endpoint"
          };
        }
        this.updateEndpointStatus(
          "approvalsQueue",
          "fallback",
          "Runtime approvals endpoint returned an unexpected payload; deriving queue from runs."
        );
      } catch (error) {
        if (error.status !== 404 && error.status !== 405 && error.status !== 501) {
          this.updateEndpointStatus(
            "approvalsQueue",
            "error",
            `Runtime approvals queue request failed (${error.message}).`
          );
          throw error;
        }
        this.updateEndpointStatus(
          "approvalsQueue",
          "unavailable",
          `Runtime approvals queue endpoint returned HTTP ${error.status}; deriving queue from runs.`
        );
      }
    } else {
      this.updateEndpointStatus(
        "approvalsQueue",
        "unavailable",
        "No approvals queue endpoint configured; deriving queue from runs."
      );
    }

    const sourceRuns = Array.isArray(runSummaries) && runSummaries.length
      ? runSummaries
      : (await this.getRuntimeRuns(filters.limit || 100)).items || [];

    const items = await this.deriveApprovalsFromRuns(sourceRuns);
    return {
      source: "derived-runs",
      warning: "Runtime approval queue endpoint is unavailable; queue is derived from run metadata.",
      count: items.length,
      items
    };
  }

  async submitApprovalDecision(runID, decision, options = {}) {
    if (!runID) {
      throw new Error("runId is required for approval decision");
    }

    const normalizedDecision =
      String(decision || "").trim().toUpperCase() === "DENY" ? "DENY" : "APPROVE";

    if (this.config.mockMode) {
      this.updateEndpointStatus("approvalDecision", "mock", "Mock mode enabled.");
      return mockSubmitApprovalDecision(runID, normalizedDecision, options);
    }

    const prefix = this.config.endpoints.approvalDecisionPrefix;
    if (prefix) {
      try {
        const response = await this.request(
          this.config.runtimeApiBaseUrl,
          `${prefix}${encodeURIComponent(runID)}/decision`,
          undefined,
          {
            method: "POST",
            body: {
              decision: normalizedDecision,
              ttlSeconds: options.ttlSeconds,
              reason: options.reason || ""
            }
          }
        );
        this.updateEndpointStatus("approvalDecision", "available", "Runtime approval decision endpoint responded.");
        return {
          ...response,
          source: "runtime-endpoint"
        };
      } catch (error) {
        if (error.status !== 404 && error.status !== 405 && error.status !== 501) {
          this.updateEndpointStatus(
            "approvalDecision",
            "error",
            `Runtime approval decision request failed (${error.message}).`
          );
          throw error;
        }
        this.updateEndpointStatus(
          "approvalDecision",
          "unavailable",
          `Runtime approval decision endpoint returned HTTP ${error.status}; no decision was applied.`
        );
      }
    } else {
      this.updateEndpointStatus(
        "approvalDecision",
        "unavailable",
        "No approval decision endpoint configured."
      );
    }

    return {
      applied: false,
      runId: runID,
      decision: normalizedDecision,
      warning: "Runtime approval decision endpoint is not exposed yet; no change was applied."
    };
  }
}
