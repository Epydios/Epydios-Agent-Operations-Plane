import test from "node:test";
import assert from "node:assert/strict";
import { renderApprovals, renderApprovalsDetail, renderApprovalReviewModal } from "../views/approvals.js";
import { renderRunDetail } from "../views/runs.js";

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
  assert.match(ui.approvalsContent.innerHTML, /Current Thread Decisions/);
  assert.match(ui.approvalsContent.innerHTML, /approval-org-admin-1/);
  assert.match(ui.approvalsContent.innerHTML, /Hide Review/);
});

test("approval side panel renders a pinned summary with popup affordance", () => {
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
  assert.match(ui.approvalsDetailContent.innerHTML, /Open Review Popup/);
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

  assert.match(ui.runDetailContent.innerHTML, /Artifact Access/);
  assert.match(ui.runDetailContent.innerHTML, /EPYDIOS_AGENTOPS_DESKTOP_REPO\/provenance\//);
  assert.match(ui.runDetailContent.innerHTML, /EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB\/provenance\//);
  assert.match(ui.runDetailContent.innerHTML, /EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB\/internal-readiness\/history\/20260228\//);
  assert.match(ui.runDetailContent.innerHTML, /EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB\/internal-readiness\/history\/20260228\/run-20260228-001\//);
  assert.match(ui.runDetailContent.innerHTML, /EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB\/internal-readiness\/incidents\/20260228\/run-20260228-001\//);
  assert.match(ui.runDetailContent.innerHTML, /Copy Path/);
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
        context: {
          governed_action: {
            contract_id: "epydios.governed-action.v1",
            workflow_kind: "external_action_request",
            request_label: "Paper Trade Request: AAPL",
            demo_profile: "finance_paper_trade",
            request_summary: "BUY 25 AAPL in paper account paper-main",
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

  assert.match(ui.runDetailContent.innerHTML, /2\. Policy Richness/);
  assert.match(ui.runDetailContent.innerHTML, /Paper Trade Request: AAPL/);
  assert.match(ui.runDetailContent.innerHTML, /finance_paper_trade/);
  assert.match(ui.runDetailContent.innerHTML, /governance_provider/);
  assert.match(ui.runDetailContent.innerHTML, /Policy Stratification Present/);
  assert.match(ui.runDetailContent.innerHTML, /Request Contract Echo Present/);
  assert.match(ui.runDetailContent.innerHTML, /sha256-demo-evidence/);
});
