import test from "node:test";
import assert from "node:assert/strict";
import { renderGovernanceOpsEmptyState, renderGovernanceOpsPage } from "../domains/governanceops/routes.js";
import { createAimxsDecisionBindingSpine } from "../shared/aimxs/decision-binding.js";

test("governanceops page renders runtime approvals plus identity admin proposal review", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsPage(ui, {
    settings: {
      connectors: {
        source: "runtime-endpoint",
        selectedConnectorId: "browser-proof",
        selectedProfileLabel: "Browser Proof",
        profileCount: 3,
        enabledProfileCount: 3
      },
      identity: {
        source: "runtime.auth.context",
        authorityBasis: "bearer_token_jwt",
        identity: {
          subject: "demo.operator",
          clientId: "epydiosops-desktop-local",
          roles: ["runtime.admin", "enterprise.ai_operator"],
          tenantIds: ["tenant-demo"],
          projectIds: ["project-core"]
        }
      }
    },
    approvals: {
      source: "runtime-approval-endpoint",
      items: [
        {
          approvalId: "approval-run-20260314-queue-001",
          runId: "run-20260314-queue-001",
          requestId: "req-20260314-queue-001",
          tenantId: "tenant-demo",
          projectId: "project-core",
          status: "PENDING",
          tier: 3,
          targetExecutionProfile: "sandbox_vm_autonomous",
          createdAt: "2026-03-14T21:00:00Z",
          expiresAt: "2026-03-14T21:15:00Z",
          reason: "Tier-3 desktop actuation requires explicit approval and policy grant token.",
          annotations: {
            orgAdminDecisionBinding: {
              profileId: "centralized_enterprise_admin",
              profileLabel: "Centralized Enterprise Admin",
              category: "residency",
              bindingId: "centralized_enterprise_admin_residency_binding",
              bindingLabel: "Centralized Enterprise Admin Residency Binding",
              bindingMode: "residency_exception_review",
              selectedRoleBundle: "enterprise.break_glass_admin",
              selectedExceptionProfiles: ["centralized_enterprise_admin_residency_exception"],
              selectedOverlayProfiles: ["centralized_enterprise_admin_quota_overlay"],
              requiredInputs: ["residency_exception_ticket", "tenant_id"],
              requestedInputKeys: ["residency_exception_ticket", "tenant_id"],
              decisionSurfaces: ["export_profile_override", "quota_override"],
              boundaryRequirements: ["runtime_authz", "governed_export_redaction"]
            }
          }
        },
        {
          approvalId: "approval-run-20260314-reviewed-002",
          runId: "run-20260314-reviewed-002",
          requestId: "req-20260314-reviewed-002",
          tenantId: "tenant-demo",
          projectId: "project-core",
          status: "APPROVED",
          tier: 2,
          targetExecutionProfile: "managed_codex_worker",
          createdAt: "2026-03-14T20:30:00Z",
          reviewedAt: "2026-03-14T20:35:00Z",
          expiresAt: "2026-03-14T20:45:00Z",
          reason: "Approved by operator."
        }
      ]
    },
    orgAdminProfiles: {
      source: "runtime-org-admin-endpoint",
      items: [
        {
          profileId: "centralized_enterprise_admin",
          label: "Centralized Enterprise Admin",
          breakGlassRoleBundles: ["enterprise.break_glass_admin", "enterprise.break_glass_auditor"],
          exceptionProfiles: [
            {
              profileId: "centralized_enterprise_admin_residency_exception",
              label: "Centralized Enterprise Admin Residency Exception",
              category: "residency",
              requiredInputs: ["residency_exception_ticket"],
              decisionSurfaces: ["export_profile_override"],
              boundaryRequirements: ["runtime_authz", "governed_export_redaction"]
            }
          ],
          overlayProfiles: [
            {
              overlayId: "centralized_enterprise_admin_quota_overlay",
              label: "Centralized Enterprise Admin Quota Overlay",
              category: "quota",
              overlayMode: "quota_override_review",
              requiredInputs: ["tenant_id"],
              decisionSurfaces: ["quota_override"],
              boundaryRequirements: ["runtime_authz"]
            }
          ]
        }
      ]
    },
    runs: {
      source: "runtime-endpoint",
      items: [
        {
          runId: "run-20260314-queue-001",
          requestId: "req-20260314-queue-001",
          environment: "staging",
          status: "POLICY_EVALUATED",
          policyDecision: "DEFER",
          selectedPolicyProvider: "aimxs-policy-primary",
          policyGrantTokenPresent: false,
          evidenceBundleResponse: { status: "pending" },
          evidenceRecordResponse: { status: "queued" }
        },
        {
          runId: "run-20260314-reviewed-002",
          requestId: "req-20260314-reviewed-002",
          environment: "staging",
          status: "COMPLETED",
          policyDecision: "ALLOW",
          selectedPolicyProvider: "aimxs-policy-primary",
          policyGrantTokenPresent: true,
          evidenceBundleResponse: { status: "sealed" },
          evidenceRecordResponse: { status: "recorded" }
        }
      ]
    },
    nativeGatewayHolds: [
      {
        interpositionRequestId: "ixr-browser-001",
        gatewayRequestId: "gateway-browser-001",
        runId: "run-connector-browser-001",
        approvalId: "approval-connector-browser-001",
        state: "held_pending_approval",
        holdStartedAtUtc: "2026-03-14T21:01:00Z",
        holdDeadlineAtUtc: "2026-03-14T21:11:00Z",
        holdReason: "Destructive browser click needs explicit approval.",
        clientSurface: "mcp",
        sourceClient: {
          id: "client-mcp",
          name: "Phase2 Test Shim"
        },
        tenantId: "tenant-demo",
        projectId: "project-core",
        environmentId: "staging",
        governanceTarget: {
          actionType: "connector.browser.click_destructive_button",
          targetRef: "https://app.example.com/settings/danger"
        },
        requestSummary: {
          title: "Browser MCP click_destructive_button call",
          reason: "Danger-zone control is bounded and approval-gated."
        }
      }
    ],
    session: {
      claims: {
        sub: "demo.operator",
        client_id: "epydiosops-desktop-local"
      }
    },
    adminQueueItems: [
      {
        id: "authority-change-001",
        kind: "authority",
        label: "Authority Change Draft",
        requestedAction: "set project_admin",
        subjectId: "demo.operator",
        targetScope: "tenant-demo / project-core",
        status: "routed",
        reason: "Project operator coverage needs temporary admin review.",
        summary: "project_admin for demo.operator @ tenant-demo / project-core",
        simulationSummary: "Preview only. This authority proposal requires GovernanceOps approval before a live authority mutation can execute.",
        updatedAt: "2026-03-15T10:11:00Z",
        routedAt: "2026-03-15T10:12:00Z"
      }
    ],
    viewState: {
      selectedAdminChangeId: "authority-change-001"
    },
    aimxsDecisionBindingSpine: createAimxsDecisionBindingSpine({
      activeDomain: "governanceops",
      sourceLabel: "correlated run",
      correlationRef: "run-20260314-queue-001",
      runId: "run-20260314-queue-001",
      approvalId: "approval-run-20260314-queue-001",
      actorRef: "demo.operator",
      subjectRef: "task-20260314-queue-001",
      authorityRef: "codex",
      authorityBasis: "bearer_token_jwt",
      scopeRef: "tenant-demo / project-core",
      providerRef: "aimxs-policy-primary",
      routeRef: "managed_codex_worker",
      boundaryRef: "agentops_gateway",
      grantRef: "policy_grant_token",
      decisionStatus: "DEFER",
      executionProfile: "sandbox_vm_autonomous",
      grantReason: "Tier-3 desktop actuation requires explicit approval and policy grant token.",
      receiptRef: "approval-receipt-queue-001",
      stableRef: "stable://run-20260314-queue-001",
      bundleId: "bundle-governed-001",
      recordId: "evidence-run-001",
      replayRef: "run-20260314-queue-001",
      sessionRef: "session-20260314-queue-001",
      taskRef: "task-20260314-queue-001",
      evidenceRefs: ["evidence://finance/transfer/001"],
      auditRefs: ["approval.reviewed@2026-03-14T21:05:00Z"],
      summary: "Correlated AIMXS drill-in for governance review."
    }),
    now: "2026-03-14T21:05:00Z"
  });

  assert.match(ui.governanceOpsContent.innerHTML, /data-domain-root="governanceops"/);
  assert.match(ui.governanceOpsContent.innerHTML, /Admin Proposal Review/);
  assert.match(ui.governanceOpsContent.innerHTML, /AIMXS Lifecycle Ribbon/);
  assert.match(ui.governanceOpsContent.innerHTML, /AIMXS Decision-Binding Spine/);
  assert.match(ui.governanceOpsContent.innerHTML, /Authority Chain/);
  assert.match(ui.governanceOpsContent.innerHTML, /Grant Chain/);
  assert.match(ui.governanceOpsContent.innerHTML, /Receipt Chain/);
  assert.match(ui.governanceOpsContent.innerHTML, /Replay Chain/);
  assert.match(ui.governanceOpsContent.innerHTML, /Evidence Chain/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-aimxs-spine-action="open-workspace"/);
  assert.match(ui.governanceOpsContent.innerHTML, /Decision Binding Contract/);
  assert.match(ui.governanceOpsContent.innerHTML, /Stable Or Replay Refs/);
  assert.match(ui.governanceOpsContent.innerHTML, /Approval Queue/);
  assert.match(ui.governanceOpsContent.innerHTML, /Connector Approvals/);
  assert.match(ui.governanceOpsContent.innerHTML, /Authority Ladder/);
  assert.match(ui.governanceOpsContent.innerHTML, /Decision Receipt/);
  assert.match(ui.governanceOpsContent.innerHTML, /Active Review/);
  assert.match(ui.governanceOpsContent.innerHTML, /Delegation And Escalation/);
  assert.match(ui.governanceOpsContent.innerHTML, /Override And Exception Posture/);
  assert.match(ui.governanceOpsContent.innerHTML, /approval-run-20260314-queue-001/);
  assert.match(ui.governanceOpsContent.innerHTML, /approval-run-20260314-reviewed-002/);
  assert.match(ui.governanceOpsContent.innerHTML, /Tier 3/);
  assert.match(ui.governanceOpsContent.innerHTML, /sandbox_vm_autonomous/);
  assert.match(ui.governanceOpsContent.innerHTML, /demo.operator/);
  assert.match(ui.governanceOpsContent.innerHTML, /epydiosops-desktop-local/);
  assert.match(ui.governanceOpsContent.innerHTML, /bearer_token_jwt/);
  assert.match(ui.governanceOpsContent.innerHTML, /runtime\.auth\.context/);
  assert.match(ui.governanceOpsContent.innerHTML, /runtime-approval-endpoint/);
  assert.match(ui.governanceOpsContent.innerHTML, /identityops-admin/);
  assert.match(ui.governanceOpsContent.innerHTML, /approval-connector-browser-001/);
  assert.match(ui.governanceOpsContent.innerHTML, /Browser MCP/);
  assert.match(ui.governanceOpsContent.innerHTML, /click_destructive_button/);
  assert.match(ui.governanceOpsContent.innerHTML, /Phase2 Test Shim/);
  assert.match(ui.governanceOpsContent.innerHTML, /Decision Reason \(Optional\)/);
  assert.match(ui.governanceOpsContent.innerHTML, /Approve Connector Hold/);
  assert.match(ui.governanceOpsContent.innerHTML, /Deny Connector Hold/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-native-decision-action="APPROVE"/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-native-decision-action="DENY"/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-native-decision-key="native:hold:ixr-browser-001"/);
  assert.match(ui.governanceOpsContent.innerHTML, /RuntimeOps keeps the linked connector continuity and evidence handoff on the related run/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open SettingsOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open RuntimeOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.governanceOpsContent.innerHTML, /recorded/);
  assert.match(ui.governanceOpsContent.innerHTML, /grant token/);
  assert.match(ui.governanceOpsContent.innerHTML, /sealed/);
  assert.match(ui.governanceOpsContent.innerHTML, /tenant-demo/);
  assert.match(ui.governanceOpsContent.innerHTML, /project-core/);
  assert.match(ui.governanceOpsContent.innerHTML, /step-up approval/);
  assert.match(ui.governanceOpsContent.innerHTML, /pending receiver/);
  assert.match(ui.governanceOpsContent.innerHTML, /role-scoped/);
  assert.match(ui.governanceOpsContent.innerHTML, /scope-bound/);
  assert.match(ui.governanceOpsContent.innerHTML, /exception-linked/);
  assert.match(ui.governanceOpsContent.innerHTML, /authority-change-001/);
  assert.match(ui.governanceOpsContent.innerHTML, /tenant-demo \/ project-core/);
  assert.match(ui.governanceOpsContent.innerHTML, /project_admin for demo\.operator @ tenant-demo \/ project-core/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-decision="APPROVE"/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-decision="DENY"/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-routing-action="DEFER"/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-routing-action="ESCALATE"/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-decision-admin-change-id="authority-change-001"/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-routing-admin-change-id="authority-change-001"/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open IdentityOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /Copy Decision Receipt/);
  assert.match(ui.governanceOpsContent.innerHTML, /Copy Receipt Snapshot/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open AuditOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /Centralized Enterprise Admin Residency Exception/);
  assert.match(ui.governanceOpsContent.innerHTML, /Centralized Enterprise Admin Quota Overlay/);
  assert.match(ui.governanceOpsContent.innerHTML, /enterprise\.break_glass_admin/);
});

test("governanceops empty state renders without loaded governance context", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsEmptyState(ui, {
    title: "GovernanceOps",
    message: "Governance posture becomes available after approval, authority, and decision receipt signals load."
  });

  assert.match(ui.governanceOpsContent.innerHTML, /GovernanceOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /Governance posture becomes available/);
});

test("governanceops page tolerates approvals without org-admin decision bindings", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsPage(ui, {
    approvals: {
      items: [
        {
          approvalId: "approval-no-binding-001",
          runId: "run-no-binding-001",
          requestId: "req-no-binding-001",
          status: "PENDING",
          tier: 2,
          targetExecutionProfile: "managed_codex_worker",
          createdAt: "2026-03-15T12:00:00Z",
          expiresAt: "2026-03-15T12:15:00Z",
          reason: "Awaiting standard approval."
        }
      ]
    },
    runs: {
      items: [
        {
          runId: "run-no-binding-001",
          requestId: "req-no-binding-001",
          status: "POLICY_EVALUATED",
          policyDecision: "DEFER"
        }
      ]
    },
    orgAdminProfiles: {
      items: []
    },
    settings: {},
    session: {},
    now: "2026-03-15T12:05:00Z"
  });

  assert.match(ui.governanceOpsContent.innerHTML, /Override And Exception Posture/);
  assert.match(ui.governanceOpsContent.innerHTML, /approval-no-binding-001/);
});

test("governanceops admin review renders a routed platform proposal without identity-specific leakage", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsPage(ui, {
    approvals: { items: [] },
    runs: { items: [] },
    orgAdminProfiles: { items: [] },
    settings: {},
    session: {},
    adminQueueItems: [
      {
        id: "platform-change-queue-001",
        ownerDomain: "platformops",
        kind: "platform",
        label: "Promotion Draft",
        requestedAction: "promote staging-full-gate-20260316T200000Z.log",
        subjectId: "staging-full-gate-20260316T200000Z.log",
        subjectLabel: "release",
        targetScope: "staging / aimxs-full",
        targetLabel: "target",
        status: "routed",
        reason: "Promote the verified staging gate after bounded readiness preview.",
        summary: "Promote staging-full-gate-20260316T200000Z.log to staging / aimxs-full",
        simulationSummary: "Preview only. This promotion proposal requires GovernanceOps approval before any live platform change can execute.",
        updatedAt: "2026-03-16T20:21:00Z",
        routedAt: "2026-03-16T20:22:00Z"
      }
    ],
    viewState: {
      selectedAdminChangeId: "platform-change-queue-001"
    }
  });

  assert.match(ui.governanceOpsContent.innerHTML, /Admin Proposal Review/);
  assert.match(ui.governanceOpsContent.innerHTML, /owner=platformops/);
  assert.match(ui.governanceOpsContent.innerHTML, /platformops-admin/);
  assert.match(ui.governanceOpsContent.innerHTML, /staging-full-gate-20260316T200000Z\.log/);
  assert.match(ui.governanceOpsContent.innerHTML, /staging \/ aimxs-full/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open PlatformOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-open-admin-owner-domain="platformops"/);
});

test("governanceops admin review renders a routed guardrail proposal without platform leakage", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsPage(ui, {
    approvals: { items: [] },
    runs: { items: [] },
    orgAdminProfiles: { items: [] },
    settings: {},
    session: {},
    adminQueueItems: [
      {
        id: "guardrail-change-queue-001",
        ownerDomain: "guardrailops",
        kind: "guardrail",
        label: "Guardrail Change Draft",
        requestedAction: "tighten approval_required",
        subjectId: "sandbox_vm_autonomous",
        subjectLabel: "profile",
        targetScope: "tenant-demo / project-core",
        targetLabel: "scope",
        status: "routed",
        reason: "Keep sandbox actuation scoped while approvals remain pending.",
        summary: "tighten approval_required for tenant-demo / project-core @ sandbox_vm_autonomous",
        simulationSummary: "Preview only. This tighten guardrail proposal requires GovernanceOps approval before any live guardrail change can execute.",
        updatedAt: "2026-03-16T22:10:00Z",
        routedAt: "2026-03-16T22:11:00Z"
      }
    ],
    viewState: {
      selectedAdminChangeId: "guardrail-change-queue-001"
    }
  });

  assert.match(ui.governanceOpsContent.innerHTML, /Admin Proposal Review/);
  assert.match(ui.governanceOpsContent.innerHTML, /owner=guardrailops/);
  assert.match(ui.governanceOpsContent.innerHTML, /guardrailops-admin/);
  assert.match(ui.governanceOpsContent.innerHTML, /sandbox_vm_autonomous/);
  assert.match(ui.governanceOpsContent.innerHTML, /tenant-demo \/ project-core/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open GuardrailOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-open-admin-owner-domain="guardrailops"/);
});

test("governanceops admin review renders a routed policy proposal without identity fallback leakage", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsPage(ui, {
    approvals: { items: [] },
    runs: { items: [] },
    orgAdminProfiles: { items: [] },
    settings: {},
    session: {},
    adminQueueItems: [
      {
        id: "policy-change-queue-001",
        ownerDomain: "policyops",
        kind: "policy",
        label: "Policy Pack Load And Activation Draft",
        requestedAction: "activate finance_supervisor_review",
        subjectId: "finance_supervisor_review",
        subjectLabel: "pack",
        targetScope: "tenant-demo / project-finance",
        targetLabel: "scope",
        status: "routed",
        reason: "Route a bounded policy activation preview into governance.",
        summary: "Activate finance_supervisor_review for tenant-demo / project-finance @ aimxs-policy-primary",
        simulationSummary: "Preview only. This activate proposal requires GovernanceOps approval before any live policy-pack change can execute.",
        updatedAt: "2026-03-16T23:20:00Z",
        routedAt: "2026-03-16T23:21:00Z"
      }
    ],
    viewState: {
      selectedAdminChangeId: "policy-change-queue-001"
    }
  });

  assert.match(ui.governanceOpsContent.innerHTML, /Admin Proposal Review/);
  assert.match(ui.governanceOpsContent.innerHTML, /owner=policyops/);
  assert.match(ui.governanceOpsContent.innerHTML, /policyops-admin/);
  assert.match(ui.governanceOpsContent.innerHTML, /finance_supervisor_review/);
  assert.match(ui.governanceOpsContent.innerHTML, /tenant-demo \/ project-finance/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open PolicyOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-open-admin-owner-domain="policyops"/);
});

test("governanceops admin review renders a routed compliance proposal without policy fallback leakage", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsPage(ui, {
    approvals: { items: [] },
    runs: { items: [] },
    orgAdminProfiles: { items: [] },
    settings: {},
    session: {},
    adminQueueItems: [
      {
        id: "compliance-change-queue-001",
        ownerDomain: "complianceops",
        kind: "compliance",
        label: "Attestation And Exception Draft",
        requestedAction: "exception_proposal",
        subjectId: "Centralized Enterprise Admin Residency Exception",
        subjectLabel: "exception",
        targetScope: "tenant-demo / project-payments",
        targetLabel: "scope",
        status: "routed",
        reason: "Route a bounded compliance exception preview into governance.",
        summary: "Exception Centralized Enterprise Admin Residency Exception for tenant-demo / project-payments @ financial_control",
        simulationSummary: "Preview only. This exception proposal requires GovernanceOps approval before any live compliance change can execute.",
        updatedAt: "2026-03-16T23:40:00Z",
        routedAt: "2026-03-16T23:41:00Z"
      }
    ],
    viewState: {
      selectedAdminChangeId: "compliance-change-queue-001"
    }
  });

  assert.match(ui.governanceOpsContent.innerHTML, /Admin Proposal Review/);
  assert.match(ui.governanceOpsContent.innerHTML, /owner=complianceops/);
  assert.match(ui.governanceOpsContent.innerHTML, /complianceops-admin/);
  assert.match(ui.governanceOpsContent.innerHTML, /Centralized Enterprise Admin Residency Exception/);
  assert.match(ui.governanceOpsContent.innerHTML, /tenant-demo \/ project-payments/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open ComplianceOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-open-admin-owner-domain="complianceops"/);
});

test("governanceops admin review renders a routed network proposal without identity fallback leakage", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsPage(ui, {
    approvals: { items: [] },
    runs: { items: [] },
    orgAdminProfiles: { items: [] },
    settings: {},
    session: {},
    adminQueueItems: [
      {
        id: "network-change-queue-001",
        ownerDomain: "networkops",
        kind: "network",
        label: "Probe Request Draft",
        requestedAction: "probe gateway_path runtime-sessions",
        subjectId: "gateway_path",
        subjectLabel: "boundary",
        targetScope: "tenant-demo / project-payments",
        targetLabel: "scope",
        status: "routed",
        reason: "Route a bounded network probe preview into governance.",
        summary: "Probe Gateway path against Runtime Sessions within tenant-demo / project-payments",
        simulationSummary: "Preview only. This bounded probe request requires GovernanceOps approval before any live network probe can execute.",
        updatedAt: "2026-03-17T15:21:00Z",
        routedAt: "2026-03-17T15:22:00Z"
      }
    ],
    viewState: {
      selectedAdminChangeId: "network-change-queue-001"
    }
  });

  assert.match(ui.governanceOpsContent.innerHTML, /Admin Proposal Review/);
  assert.match(ui.governanceOpsContent.innerHTML, /owner=networkops/);
  assert.match(ui.governanceOpsContent.innerHTML, /networkops-admin/);
  assert.match(ui.governanceOpsContent.innerHTML, /gateway_path/);
  assert.match(ui.governanceOpsContent.innerHTML, /tenant-demo \/ project-payments/);
  assert.match(ui.governanceOpsContent.innerHTML, /Open NetworkOps/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-open-admin-owner-domain="networkops"/);
});

test("governanceops page renders selected recorded review state and operational feedback", () => {
  const ui = { governanceOpsContent: { innerHTML: "" } };
  renderGovernanceOpsPage(ui, {
    approvals: {
      items: [
        {
          approvalId: "approval-reviewed-ops-001",
          runId: "run-reviewed-ops-001",
          requestId: "req-reviewed-ops-001",
          tenantId: "tenant-demo",
          projectId: "project-core",
          status: "APPROVED",
          tier: 2,
          targetExecutionProfile: "managed_codex_worker",
          createdAt: "2026-03-15T12:00:00Z",
          reviewedAt: "2026-03-15T12:03:00Z",
          expiresAt: "2026-03-15T12:15:00Z",
          reason: "Approved by supervisor."
        }
      ]
    },
    runs: {
      items: [
        {
          runId: "run-reviewed-ops-001",
          requestId: "req-reviewed-ops-001",
          status: "COMPLETED",
          policyDecision: "ALLOW",
          selectedPolicyProvider: "aimxs-policy-primary",
          policyGrantTokenPresent: true,
          evidenceBundleResponse: { status: "sealed" },
          evidenceRecordResponse: { status: "recorded" }
        }
      ]
    },
    viewState: {
      selectedRunId: "run-reviewed-ops-001",
      feedback: {
        tone: "warn",
        message: "Escalation packet copied for runId=run-reviewed-ops-001."
      }
    },
    now: "2026-03-15T12:05:00Z"
  });

  assert.match(ui.governanceOpsContent.innerHTML, /Governance handoff required/);
  assert.match(ui.governanceOpsContent.innerHTML, /Escalation packet copied for runId=run-reviewed-ops-001/);
  assert.match(ui.governanceOpsContent.innerHTML, /run-reviewed-ops-001/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-decision="APPROVE"/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-decision="APPROVE"[\s\S]*disabled/);
  assert.match(ui.governanceOpsContent.innerHTML, /data-governanceops-routing-action="ESCALATE"[\s\S]*disabled/);
});
