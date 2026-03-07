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
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
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
    integrationSettingsByScope: {}
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
  const tier = Number.parseInt(String(desktop.tier || "2"), 10) || 2;

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
    selectedDesktopProvider: tier > 1 ? "oss-desktop-openfang-linux" : "",
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

function mockInvokeIntegrationAgent(payload = {}) {
  const meta = payload.meta || {};
  const agentProfileId = String(payload.agentProfileId || "codex").trim().toLowerCase() || "codex";
  const prompt = String(payload.prompt || "").trim();
  const outputText = prompt
    ? `Mock invocation completed for ${agentProfileId}: ${prompt.slice(0, 180)}`
    : `Mock invocation completed for ${agentProfileId}.`;
  return deepClone({
    source: "mock",
    applied: true,
    tenantId: String(meta.tenantId || "").trim(),
    projectId: String(meta.projectId || "").trim(),
    requestId: String(meta.requestId || "").trim(),
    agentProfileId,
    provider: agentProfileId,
    transport: "mock",
    model: "mock-model",
    route: "mock",
    outputText,
    finishReason: "completed",
    startedAt: nowISO(),
    completedAt: nowISO(),
    rawResponse: {
      mock: true,
      prompt,
      systemPrompt: String(payload.systemPrompt || "").trim()
    }
  });
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

export class AgentOpsApi {
  constructor(config, getToken) {
    this.config = config;
    this.getToken = getToken;
    this.endpointStatus = {
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

  summarizeAimxsStatus(providerPayload) {
    const providers = Array.isArray(providerPayload?.items) ? providerPayload.items : [];
    const aimxsProviders = providers.filter((item) =>
      String(item?.providerId || "").toLowerCase().includes("aimxs")
    );

    if (aimxsProviders.length === 0) {
      return {
        state: "not_configured",
        detail: "No AIMXS provider is currently discovered in registry state.",
        providerIds: []
      };
    }

    const ready = aimxsProviders.filter((item) => Boolean(item?.ready) && Boolean(item?.probed));
    const providerIds = aimxsProviders.map((item) => String(item?.providerId || "").trim()).filter(Boolean);
    if (ready.length === aimxsProviders.length) {
      return {
        state: "ready",
        detail: `${ready.length}/${aimxsProviders.length} AIMXS providers are ready.`,
        providerIds
      };
    }

    return {
      state: "degraded",
      detail: `${ready.length}/${aimxsProviders.length} AIMXS providers are ready.`,
      providerIds
    };
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
      endpoints: [
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
      terminal: deepClone(choices?.terminal || {}),
      theme: {
        mode: themeMode || "system"
      },
      aimxs: {
        ...this.summarizeAimxsStatus(context.providers || {}),
        paymentEntitled: Boolean(choices?.aimxs?.paymentEntitled),
        mode: String(choices?.aimxs?.mode || "disabled").trim().toLowerCase(),
        endpointRef: String(choices?.aimxs?.endpointRef || "-"),
        bearerTokenRef: String(choices?.aimxs?.bearerTokenRef || "-"),
        mtlsCertRef: String(choices?.aimxs?.mtlsCertRef || "-"),
        mtlsKeyRef: String(choices?.aimxs?.mtlsKeyRef || "-")
      }
    };
  }

  resolveBaseUrl(baseUrl) {
    const trimmed = String(baseUrl || "").trim();
    if (!trimmed) {
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
      const error = new Error(`HTTP ${response.status} ${response.statusText}`);
      error.status = response.status;
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
    const runtime = await fetch(`${this.config.runtimeApiBaseUrl}${this.config.endpoints.health}`, {
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
