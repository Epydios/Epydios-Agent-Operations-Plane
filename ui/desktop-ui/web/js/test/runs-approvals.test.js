import test from "node:test";
import assert from "node:assert/strict";
import { renderApprovals, renderApprovalsDetail, renderApprovalReviewModal } from "../views/approvals.js";
import { renderGovernanceApprovalSummary } from "../domains/governanceops/components/embedded-approvals.js";
import { renderHealthCards } from "../views/health.js";
import { renderRunDetail, renderRuns } from "../views/runs.js";

test("governance summary module renders embedded approval state and current thread decisions", () => {
  const target = { innerHTML: "" };
  renderGovernanceApprovalSummary(
    target,
    { items: [] },
    [],
    { items: [], page: 1, totalPages: 1, totalItems: 0 },
    "native:checkpoint:session-1:approval-org-admin-1",
    [
      {
        selectionId: "native:checkpoint:session-1:approval-org-admin-1",
        decisionType: "checkpoint",
        tenantId: "tenant-demo",
        projectId: "project-core",
        taskId: "thread-123",
        sessionId: "session-1",
        checkpointId: "approval-org-admin-1",
        status: "PENDING",
        summary: "Desktop verify needs approval."
      }
    ]
  );

  assert.match(target.innerHTML, /Approval State/);
  assert.match(target.innerHTML, /Pinned Decisions/);
  assert.match(target.innerHTML, /approval-org-admin-1/);
});

test("governance summary module renders interposed request holds alongside native approvals", () => {
  const target = { innerHTML: "" };
  renderGovernanceApprovalSummary(
    target,
    { items: [] },
    [],
    { items: [], page: 1, totalPages: 1, totalItems: 0 },
    "native:hold:ixr-20260319-001",
    [
      {
        selectionId: "native:hold:ixr-20260319-001",
        decisionType: "gateway_hold",
        tenantId: "tenant-demo",
        projectId: "project-core",
        runId: "run-20260319-001",
        approvalId: "approval-20260319-001",
        status: "PENDING",
        sourceClient: { id: "client-codex", name: "Codex" },
        summary: "Restart payments deployment",
        governanceTarget: { targetRef: "deploy/payments" }
      }
    ]
  );

  assert.match(target.innerHTML, /Pinned Decisions/);
  assert.match(target.innerHTML, /Held Request/);
  assert.match(target.innerHTML, /approval-20260319-001/);
  assert.match(target.innerHTML, /Codex/);
});

test("approvals rail includes current thread decisions in the pending approvals section", () => {
  const ui = {
    approvalsContent: { innerHTML: "" },
    approvalsPage: { value: "1" },
    approvalsPageSize: { value: "25" }
  };
  const store = {
    setApprovalItems() {}
  };

  renderApprovals(
    ui,
    store,
    { items: [] },
    {
      tenant: "",
      project: "",
      status: "",
      sortBy: "ttl_asc",
      timeRange: "",
      timeFrom: "",
      timeTo: "",
      pageSize: 25,
      page: 1
    },
    "native:checkpoint:session-1:approval-org-admin-1",
    [
      {
        selectionId: "native:checkpoint:session-1:approval-org-admin-1",
        decisionType: "checkpoint",
        tenantId: "tenant-demo",
        projectId: "project-core",
        taskId: "thread-123",
        sessionId: "session-1",
        checkpointId: "approval-org-admin-1",
        status: "PENDING",
        summary: "Desktop verify needs approval."
      }
    ]
  );

  assert.match(ui.approvalsContent.innerHTML, /Approval State/);
  assert.match(ui.approvalsContent.innerHTML, /Pinned Decisions/);
  assert.match(ui.approvalsContent.innerHTML, /approval-org-admin-1/);
  assert.match(ui.approvalsContent.innerHTML, /Hide Review/);
});

test("approval side panel renders a pinned summary without popup-oriented copy", () => {
  const ui = { approvalsDetailContent: { innerHTML: "", dataset: {} } };
  renderApprovalsDetail(ui, {
    runId: "run-20260309-001",
    tenantId: "tenant-demo",
    projectId: "project-core",
    tier: "tier-3",
    targetExecutionProfile: "desktop-sandbox-linux",
    requestedCapabilities: ["desktop.observe", "desktop.verify"],
    status: "PENDING",
    createdAt: "2026-03-09T05:00:00Z",
    expiresAt: "2099-03-09T05:15:00Z"
  });

  assert.match(ui.approvalsDetailContent.innerHTML, /Pinned Approval Review/);
  assert.match(ui.approvalsDetailContent.innerHTML, /Open Run Detail/);
  assert.doesNotMatch(ui.approvalsDetailContent.innerHTML, /popup/i);
  assert.match(ui.approvalsDetailContent.innerHTML, /capabilities=2/);
  assert.doesNotMatch(ui.approvalsDetailContent.innerHTML, />Approve<\/button>/);
});

test("approval side panel renders native current-thread decisions inline", () => {
  const ui = { approvalsDetailContent: { innerHTML: "", dataset: {} } };
  renderApprovalsDetail(ui, {
    selectionId: "native:checkpoint:session-1:approval-org-admin-1",
    decisionType: "checkpoint",
    tenantId: "tenant-demo",
    projectId: "project-core",
    taskId: "thread-123",
    sessionId: "session-1",
    checkpointId: "approval-org-admin-1",
    createdAt: "2026-03-09T05:00:00Z",
    status: "PENDING",
    reason: "Desktop verify needs approval."
  });

  assert.equal(
    ui.approvalsDetailContent.dataset.selectedRunId,
    "native:checkpoint:session-1:approval-org-admin-1"
  );
  assert.match(ui.approvalsDetailContent.innerHTML, /Pinned Approval Review/);
  assert.match(ui.approvalsDetailContent.innerHTML, /data-native-decision-action="APPROVE"/);
  assert.match(ui.approvalsDetailContent.innerHTML, /approval-org-admin-1/);
});

test("approval side panel renders interposed request holds inline", () => {
  const ui = { approvalsDetailContent: { innerHTML: "", dataset: {} } };
  renderApprovalsDetail(ui, {
    selectionId: "native:hold:ixr-20260319-001",
    decisionType: "gateway_hold",
    interpositionRequestId: "ixr-20260319-001",
    gatewayRequestId: "gateway-20260319-001",
    runId: "run-20260319-001",
    approvalId: "approval-20260319-001",
    tenantId: "tenant-demo",
    projectId: "project-core",
    source: "gateway-hold",
    sourceClient: { id: "client-codex", name: "Codex" },
    clientSurface: "codex",
    createdAt: "2026-03-19T05:00:00Z",
    expiresAt: "2099-03-19T05:15:00Z",
    status: "PENDING",
    summary: "Restart payments deployment"
  });

  assert.equal(ui.approvalsDetailContent.dataset.selectedRunId, "run-20260319-001");
  assert.match(ui.approvalsDetailContent.innerHTML, /Pinned Approval Review/);
  assert.match(ui.approvalsDetailContent.innerHTML, /Held Request/);
  assert.match(ui.approvalsDetailContent.innerHTML, /approvalId=approval-20260319-001/);
  assert.match(ui.approvalsDetailContent.innerHTML, /data-native-decision-action="APPROVE"/);
});

test("approval review modal renders explicit decision controls", () => {
  const ui = { approvalReviewModalContent: { innerHTML: "", dataset: {} } };
  renderApprovalReviewModal(ui, {
    runId: "run-20260309-002",
    tenantId: "tenant-demo",
    projectId: "project-risk",
    tier: "tier-3",
    targetExecutionProfile: "desktop-sandbox-linux",
    requestedCapabilities: ["desktop.actuate"],
    status: "PENDING",
    createdAt: "2026-03-09T05:00:00Z",
    expiresAt: "2099-03-09T05:15:00Z"
  });

  assert.match(ui.approvalReviewModalContent.innerHTML, /Decision Context/);
  assert.match(ui.approvalReviewModalContent.innerHTML, /Decision Reason/);
  assert.match(ui.approvalReviewModalContent.innerHTML, />Approve<\/button>/);
  assert.match(ui.approvalReviewModalContent.innerHTML, />Deny<\/button>/);
});

test("run detail surfaces artifact roots and recommended date bucket", () => {
  const ui = { runDetailContent: { innerHTML: "", dataset: {} } };
  renderRunDetail(
    ui,
    {
      runId: "run-20260228-001",
      tenantId: "tenant-demo",
      projectId: "project-core",
      status: "COMPLETED",
      policyDecision: "ALLOW",
      createdAt: "2026-02-28T00:35:11Z",
      updatedAt: "2026-02-28T00:35:16Z",
      desktopVerifyResponse: {
        decision: "ALLOW",
        verifierId: "V-M13-LNX-003",
        reasonCode: "VERIFIED",
        evidenceBundle: {
          windowMetadata: { title: "Sandbox Browser" },
          screenshotHash: "sha256:verify-001",
          resultCode: "verified"
        }
      }
    },
    {
      selectedRunId: "run-20260228-001"
    }
  );

  assert.match(ui.runDetailContent.innerHTML, /data-domain-root="runtimeops"/);
  assert.match(ui.runDetailContent.innerHTML, /Evidence Handoff/);
  assert.match(ui.runDetailContent.innerHTML, /EPYDIOS_AGENTOPS_DESKTOP_REPO\/provenance\//);
  assert.match(ui.runDetailContent.innerHTML, /\.epydios\/provenance\//);
  assert.match(ui.runDetailContent.innerHTML, /\.epydios\/internal-readiness\/history\/20260228\//);
  assert.match(ui.runDetailContent.innerHTML, /\.epydios\/internal-readiness\/history\/20260228\/run-20260228-001\//);
  assert.match(ui.runDetailContent.innerHTML, /\.epydios\/internal-readiness\/incidents\/20260228\/run-20260228-001\//);
  assert.match(ui.runDetailContent.innerHTML, /Copy Location/);
});

test("run detail surfaces connector continuity for governed connector runs", () => {
  const ui = { runDetailContent: { innerHTML: "", dataset: {} } };
  renderRunDetail(
    ui,
    {
      runId: "run-browser-connector-001",
      tenantId: "tenant-demo",
      projectId: "project-core",
      status: "POLICY_EVALUATED",
      policyDecision: "ALLOW",
      createdAt: "2026-03-19T05:00:00Z",
      updatedAt: "2026-03-19T05:01:00Z",
      annotations: {
        connectorDriver: "mcp_browser",
        connectorToolName: "click_destructive_button",
        connectorProtocol: "mcp",
        connectorTransport: "stdio_jsonrpc"
      },
      requestPayload: {
        connector: {
          connectorId: "browser-proof",
          tier: 1,
          toolName: "click_destructive_button",
          arguments: {
            url: "https://app.example.com/settings/danger",
            selector: "#danger-delete",
            expected_label: "Delete workspace"
          }
        },
        context: {
          connector_mcp: {
            connectorId: "browser-proof",
            connectorLabel: "Browser Proof",
            clientSurface: "mcp",
            approvalId: "approval-browser-001",
            interpositionRequestId: "ixr-browser-001",
            protocol: "mcp",
            transport: "stdio_jsonrpc",
            approvalGranted: false
          }
        }
      },
      evidenceRecordResponse: {
        status: "recorded",
        payloadEcho: {
          connector: {
            requested: true,
            state: "awaiting_approval",
            toolName: "click_destructive_button",
            reason: "eligible destructive click requires operator approval",
            connector: {
              connectorId: "browser-proof",
              connectorLabel: "Browser Proof",
              driver: "mcp_browser"
            },
            classification: {
              statementClass: "destructive_button_click",
              reason: "eligible destructive click requires operator approval"
            },
            result: {
              finalUrl: "https://app.example.com/settings/danger",
              resolvedLabel: "Delete workspace"
            }
          }
        }
      }
    },
    {
      selectedRunId: "run-browser-connector-001",
      approval: {
        approvalId: "approval-browser-001",
        status: "PENDING"
      }
    }
  );

  assert.match(ui.runDetailContent.innerHTML, /Connector Continuity/);
  assert.match(ui.runDetailContent.innerHTML, /Browser MCP/);
  assert.match(ui.runDetailContent.innerHTML, /click_destructive_button/);
  assert.match(ui.runDetailContent.innerHTML, /ixr-browser-001/);
  assert.match(ui.runDetailContent.innerHTML, /approval-browser-001/);
  assert.match(ui.runDetailContent.innerHTML, /destructive_button_click/);
  assert.match(ui.runDetailContent.innerHTML, /Delete workspace/);
});

test("run detail surfaces governed-action policy richness from the stored provider response", () => {
  const ui = { runDetailContent: { innerHTML: "", dataset: {} } };
  renderRunDetail(
    ui,
    {
      runId: "run-governed-001",
      tenantId: "tenant-demo",
      projectId: "project-trading",
      status: "POLICY_EVALUATED",
      policyDecision: "DEFER",
      policyGrantTokenPresent: true,
      createdAt: "2026-03-10T08:00:00Z",
      updatedAt: "2026-03-10T08:00:05Z",
      requestPayload: {
        meta: {
          actor: {
            subject: "user-123",
            clientId: "desktop-ui",
            authn: "oidc-jwt",
            authorityBasis: "runtime_identity"
          }
        },
        context: {
          actor_authority: {
            authority_basis: "runtime_identity",
            authn: "oidc-jwt",
            subject: "user-123",
            client_id: "desktop-ui",
            roles: ["compliance.viewer", "runtime.run.create"],
            tenant_scopes: ["tenant-demo"],
            project_scopes: ["project-trading"]
          },
          governed_action: {
            contract_id: "epydios.governed-action.v1",
            workflow_kind: "external_action_request",
            request_label: "Paper Trade Request: AAPL",
            demo_profile: "finance_paper_trade",
            request_summary: "BUY 25 AAPL in paper account paper-main",
            operator_approval_required: false,
            finance_order: {
              symbol: "AAPL",
              side: "buy",
              quantity: 25,
              account: "paper-main"
            }
          },
          policy_stratification: {
            boundary_class: "external_actuator",
            risk_tier: "high",
            required_grants: ["grant.trading.supervisor"],
            evidence_readiness: "PARTIAL",
            gates: {
              "core14.adapter_present.enforce_handshake": true
            }
          }
        },
        task: {
          summary: "BUY 25 AAPL in paper account paper-main"
        }
      },
      policyResponse: {
        decision: "DEFER",
        grantTokenPresent: true,
        evidenceRefs: ["EVIDENCE_DEMO_001", "sha256:abc123"],
        reasons: [
          {
            code: "AIMXS_LOCAL_FULL_GOVERNANCE",
            message: "Deferred pending grants and evidence readiness."
          }
        ],
        output: {
          aimxs: {
            providerId: "aimxs-full",
            requestContract: {
              contract_id: "epydios.governed-action.v1"
            },
            providerMeta: {
              baak_engaged: true,
              decision_path: "governance_provider",
              adapter_status: "ERROR",
              adapter_error_code: "CORE24_BASE_ADAPTER_MISSING",
              base_adapter_present: false,
              current_state: {
                present: true,
                sha256: "state-sha256-demo"
              },
              state_continuity: {
                continuity_enabled: true,
                kernel_state_in_sha256: "kernel-in-demo",
                kernel_state_out_sha256: "kernel-out-demo",
                kernel_state_out_present: true
              },
              audit_sink: {
                active: true,
                event_ref: "aimxs://local-full/audit/aimxs-audit-demo"
              },
              policy_stratification: {
                boundary_class: "external_actuator"
              }
            },
            evidence: {
              evidence_hash: "sha256-demo-evidence"
            }
          }
        }
      }
    },
    {
      selectedRunId: "run-governed-001"
    }
  );

  assert.match(ui.runDetailContent.innerHTML, /data-domain-root="runtimeops"/);
  assert.match(ui.runDetailContent.innerHTML, /2\. Policy Richness/);
  assert.match(ui.runDetailContent.innerHTML, /data-domain-root="policyops"/);
  assert.match(ui.runDetailContent.innerHTML, /Operator Gate vs Policy Gate/);
  assert.match(ui.runDetailContent.innerHTML, /operatorGate=policy-first/);
  assert.match(ui.runDetailContent.innerHTML, /chip chip-warn chip-compact">effect=execution deferred/);
  assert.match(ui.runDetailContent.innerHTML, /chip chip-warn chip-compact">decision=DEFER/);
  assert.match(ui.runDetailContent.innerHTML, /effect=execution deferred/);
  assert.match(ui.runDetailContent.innerHTML, /deferred the request\./);
  assert.match(ui.runDetailContent.innerHTML, /Paper Trade Request: AAPL/);
  assert.match(ui.runDetailContent.innerHTML, /finance_paper_trade/);
  assert.match(ui.runDetailContent.innerHTML, /Operator Approval Required/);
  assert.match(ui.runDetailContent.innerHTML, /Actor Subject/);
  assert.match(ui.runDetailContent.innerHTML, /user-123/);
  assert.match(ui.runDetailContent.innerHTML, /Authority Roles/);
  assert.match(ui.runDetailContent.innerHTML, /compliance.viewer/);
  assert.match(ui.runDetailContent.innerHTML, /governance_provider/);
  assert.match(ui.runDetailContent.innerHTML, /Adapter Status/);
  assert.match(ui.runDetailContent.innerHTML, /CORE24_BASE_ADAPTER_MISSING/);
  assert.match(ui.runDetailContent.innerHTML, /Base Adapter Present/);
  assert.match(ui.runDetailContent.innerHTML, /Current State Present/);
  assert.match(ui.runDetailContent.innerHTML, /state-sha256-demo/);
  assert.match(ui.runDetailContent.innerHTML, /State Continuity Enabled/);
  assert.match(ui.runDetailContent.innerHTML, /Audit Sink Active/);
  assert.match(ui.runDetailContent.innerHTML, /aimxs:\/\/local-full\/audit\/aimxs-audit-demo/);
  assert.match(ui.runDetailContent.innerHTML, /Policy Stratification Present/);
  assert.match(ui.runDetailContent.innerHTML, /Request Contract Echo Present/);
  assert.match(ui.runDetailContent.innerHTML, /sha256-demo-evidence/);
});

test("history run list surfaces color-coded policy effects", () => {
  const ui = {
    runsContent: { innerHTML: "" },
    runDetailContent: { innerHTML: "", dataset: {} },
    runsPage: { value: "1" },
    runsPageSize: { value: "25" }
  };
  const store = {
    setRunItems() {}
  };

  renderRuns(
    ui,
    store,
    {
      items: [
        {
          runId: "run-allow-001",
          tenantId: "tenant-demo",
          projectId: "project-trading",
          status: "COMPLETED",
          policyDecision: "ALLOW",
          selectedPolicyProvider: "oss-policy-opa",
          createdAt: "2026-03-10T10:00:00Z",
          updatedAt: "2026-03-10T10:00:05Z"
        },
        {
          runId: "run-defer-001",
          tenantId: "tenant-demo",
          projectId: "project-trading",
          status: "POLICY_EVALUATED",
          policyDecision: "DEFER",
          selectedPolicyProvider: "aimxs-full",
          createdAt: "2026-03-10T10:05:00Z",
          updatedAt: "2026-03-10T10:05:05Z"
        },
        {
          runId: "run-deny-001",
          tenantId: "tenant-demo",
          projectId: "project-trading",
          status: "FAILED",
          policyDecision: "DENY",
          selectedPolicyProvider: "aimxs-full",
          createdAt: "2026-03-10T10:10:00Z",
          updatedAt: "2026-03-10T10:10:05Z"
        }
      ]
    },
    {
      runId: "",
      tenant: "",
      project: "",
      status: "",
      decision: "",
      sortBy: "updated_desc",
      limit: 25,
      timeRange: "",
      timeFrom: "",
      timeTo: "",
      pageSize: 25,
      page: 1
    }
  );

  assert.match(ui.runsContent.innerHTML, /data-domain-root="runtimeops"/);
  assert.match(ui.runsContent.innerHTML, /chip chip-ok chip-compact">effect=policy cleared/);
  assert.match(ui.runsContent.innerHTML, /chip chip-warn chip-compact">effect=execution deferred/);
  assert.match(ui.runsContent.innerHTML, /chip chip-danger chip-compact">effect=policy blocked/);
});

test("platform health cards render through runtimeops ownership", () => {
  const PreviousHTMLElement = globalThis.HTMLElement;
  class FakeElement {
    constructor() {
      this.innerHTML = "";
      this.dataset = {};
    }
  }
  globalThis.HTMLElement = FakeElement;

  try {
    const container = new FakeElement();

    renderHealthCards(
      container,
      {
        runtime: { status: "ok", detail: "runtime healthy" },
        providers: { status: "warn", detail: "provider backlog" },
        policy: { status: "ok", detail: "policy loaded" }
      },
      {
        status: "ok",
        latestStagingGate: "pass",
        latestProdGate: "pending"
      }
    );

    assert.match(container.innerHTML, /data-domain-root="runtimeops"/);
    assert.match(container.innerHTML, /Runtime/);
    assert.match(container.innerHTML, /Pipeline/);
  } finally {
    globalThis.HTMLElement = PreviousHTMLElement;
  }
});
