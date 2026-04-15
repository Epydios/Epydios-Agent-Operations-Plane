import test from "node:test";
import assert from "node:assert/strict";
import {
  renderComplianceOpsEmptyState,
  renderComplianceOpsPage
} from "../domains/complianceops/routes.js";

test("complianceops page renders bounded control, obligation, and attestation boards", () => {
  const ui = { complianceOpsContent: { innerHTML: "" } };
  renderComplianceOpsPage(ui, {
    settings: {
      storage: {
        retentionDays: {
          auditEvents: 45,
          incidentPackages: 120,
          runSnapshots: 10
        }
      },
      aimxs: {
        mode: "provider-local",
        activation: {
          selectedProviderId: "premium-provider-local"
        }
      }
    },
    runs: {
      items: [
        {
          runId: "run-20260315-001",
          tenantId: "tenant-demo",
          projectId: "project-core",
          selectedPolicyProvider: "premium-provider-local",
          policyDecision: "ALLOW",
          retentionClass: "archive",
          updatedAt: "2026-03-15T02:00:30Z",
          createdAt: "2026-03-15T01:57:00Z",
          requestPayload: {
            context: {
              review_signals: {
                boundary_class: "financial_control",
                review_tier: "high",
                readiness_state: "partial",
                required_reviews: ["grant.finance.transfer"]
              },
              governed_action: {
                operator_approval_required: true
              }
            }
          },
          policyResponse: {
            decision: "ALLOW",
            source: "premium-provider-local"
          },
          evidenceBundleResponse: {
            status: "finalized",
            bundleId: "bundle-governed-001"
          }
        },
        {
          runId: "run-20260315-002",
          tenantId: "tenant-ops",
          projectId: "project-payments",
          selectedPolicyProvider: "premium-provider-local",
          policyDecision: "DEFER",
          retentionClass: "standard",
          updatedAt: "2026-03-15T01:51:30Z",
          createdAt: "2026-03-15T01:48:00Z",
          requestPayload: {
            context: {
              review_signals: {
                boundary_class: "external_actuator",
                review_tier: "high",
                readiness_state: "ready",
                required_reviews: []
              }
            }
          },
          policyResponse: {
            decision: "DEFER",
            source: "premium-provider-local"
          },
          evidenceBundleResponse: {
            status: "sealed",
            bundleId: "bundle-governed-002"
          }
        }
      ]
    },
    approvals: {
      items: [
        {
          approvalId: "approval-20260315-001",
          runId: "run-20260315-001",
          status: "APPROVED",
          reviewedAt: "2026-03-15T02:01:00Z"
        },
        {
          approvalId: "approval-20260315-002",
          runId: "run-20260315-002",
          status: "PENDING",
          createdAt: "2026-03-15T01:52:00Z"
        }
      ]
    },
    audit: {
      items: [
        { event: "audit.event.recorded", ts: "2026-03-15T02:03:00Z" },
        { event: "approval.decision.recorded", ts: "2026-03-15T02:02:00Z" }
      ]
    },
    health: {
      runtime: { status: "ok" },
      providers: { status: "ok" },
      policy: { status: "ok" }
    },
    pipeline: {
      environment: "local",
      status: "ok",
      latestStagingGate: "pass",
      latestProdGate: "warn"
    },
    aimxsActivation: {
      state: "ready",
      activeMode: "provider-local",
      selectedProviderId: "premium-provider-local"
    },
    exportProfiles: {
      items: [
        {
          exportProfile: "audit_export",
          label: "Audit Export",
          clientSurfaces: ["desktop"],
          defaultAudience: "downstream_review",
          allowedAudiences: ["downstream_review", "security_review", "compliance_review"],
          defaultRetentionClass: "archive",
          allowedRetentionClasses: ["standard", "archive"],
          audienceRetentionClassOverlays: {
            downstream_review: "standard",
            security_review: "archive",
            compliance_review: "archive"
          },
          redactionMode: "structured_and_text"
        }
      ]
    },
    orgAdminProfiles: {
      items: [
        {
          exceptionProfiles: [
            {
              label: "Centralized Enterprise Admin Residency Exception",
              category: "residency",
              exceptionMode: "ticketed_exception_review",
              decisionSurfaces: ["export_profile_override"],
              boundaryRequirements: ["governed_export_redaction"],
              requiredInputs: ["residency_exception_ticket"]
            },
            {
              label: "Centralized Enterprise Admin Legal Hold Exception",
              category: "legal_hold",
              exceptionMode: "hold_exception_review",
              decisionSurfaces: ["legal_hold_activation"],
              boundaryRequirements: ["audit_emission"],
              requiredInputs: ["legal_hold_case_id"]
            }
          ]
        }
      ]
    },
    viewState: {
      selectedAdminChangeId: "compliance-change-002",
      recoveryReason: "Renew after the bounded exception review confirms the scope is still required.",
      adminDraft: {
        changeKind: "exception",
        subjectId: "Centralized Enterprise Admin Residency Exception",
        targetScope: "tenant-demo/project-core",
        controlBoundary: "financial_control",
        reason: "Preview a bounded compliance exception before routing it to GovernanceOps."
      },
      queueItems: [
        {
          id: "compliance-change-001",
          ownerDomain: "complianceops",
          kind: "compliance",
          label: "Attestation And Exception Draft",
          requestedAction: "exception_proposal",
          subjectId: "Centralized Enterprise Admin Residency Exception",
          subjectLabel: "exception",
          targetScope: "tenant-demo/project-core",
          targetLabel: "scope",
          changeKind: "exception",
          controlBoundary: "financial_control",
          status: "simulated",
          reason: "Preview a bounded compliance exception before routing it to GovernanceOps.",
          summary: "Exception Centralized Enterprise Admin Residency Exception for tenant-demo/project-core @ financial_control",
          simulationSummary: "Preview only. This exception proposal requires GovernanceOps approval before any live compliance change can execute.",
          createdAt: "2026-03-15T02:04:00Z",
          simulatedAt: "2026-03-15T02:05:00Z",
          updatedAt: "2026-03-15T02:05:00Z"
        },
        {
          id: "compliance-change-002",
          ownerDomain: "complianceops",
          kind: "compliance",
          label: "Attestation And Exception Draft",
          requestedAction: "exception_proposal",
          subjectId: "Centralized Enterprise Admin Residency Exception",
          subjectLabel: "exception",
          targetScope: "tenant-demo/project-payments",
          targetLabel: "scope",
          changeKind: "exception",
          controlBoundary: "external_actuator",
          status: "expired",
          reason: "Apply an approved bounded compliance exception after governance review.",
          summary: "Exception Centralized Enterprise Admin Residency Exception for tenant-demo/project-payments @ external_actuator",
          simulationSummary: "Preview only. This exception proposal requires GovernanceOps approval before any live compliance change can execute.",
          createdAt: "2026-03-15T02:06:00Z",
          simulatedAt: "2026-03-15T02:07:00Z",
          routedAt: "2026-03-15T02:08:00Z",
          updatedAt: "2026-03-15T02:10:00Z",
          decision: {
            status: "approved",
            decisionId: "governance-decision-001",
            approvalReceiptId: "approval-receipt-001",
            decidedAt: "2026-03-15T02:08:30Z",
            reason: "Explicitly approved after review.",
            actorRef: "governance-reviewer"
          },
          execution: {
            executionId: "admin-execution-001",
            executedAt: "2026-03-15T02:09:00Z",
            status: "applied",
            summary: "exception_proposal applied for tenant-demo/project-payments @ external_actuator.",
            actorRef: "compliance-operator"
          },
          receipt: {
            receiptId: "admin-receipt-001",
            issuedAt: "2026-03-15T02:09:30Z",
            summary: "exception_proposal applied for tenant-demo/project-payments @ external_actuator.",
            stableRef: "compliance-change-002/admin-receipt-001",
            approvalReceiptId: "approval-receipt-001",
            executionId: "admin-execution-001"
          },
          rollback: {
            rollbackId: "admin-expiry-001",
            action: "expiry",
            status: "expired",
            rolledBackAt: "2026-03-15T02:12:00Z",
            summary: "Expired exception_proposal for tenant-demo/project-payments @ external_actuator.",
            stableRef: "compliance-change-002/admin-expiry-001",
            reason: "The previous exception window elapsed and requires explicit renewal.",
            actorRef: "compliance-operator",
            approvalReceiptId: "approval-receipt-001",
            adminReceiptId: "admin-receipt-001",
            executionId: "admin-execution-001"
          },
          history: [
            {
              label: "Expiry",
              at: "2026-03-15T02:12:00Z",
              summary: "Expired exception_proposal for tenant-demo/project-payments @ external_actuator."
            }
          ]
        }
      ],
      latestSimulation: {
        changeId: "compliance-change-001",
        kind: "compliance",
        tone: "warn",
        title: "Compliance admin dry-run",
        summary: "Preview only. This exception proposal requires GovernanceOps approval before any live compliance change can execute.",
        updatedAt: "2026-03-15T02:05:00Z",
        facts: [
          { label: "change", value: "exception" },
          { label: "proposal", value: "Centralized Enterprise Admin Residency Exception", code: true },
          { label: "scope", value: "tenant-demo/project-core", code: true },
          { label: "boundary", value: "financial_control", code: true }
        ],
        findings: [
          "Execution remains blocked until GovernanceOps records an explicit approved decision receipt for this compliance proposal."
        ]
      }
    }
  });

  assert.match(ui.complianceOpsContent.innerHTML, /data-domain-root="complianceops"/);
  assert.match(ui.complianceOpsContent.innerHTML, /Admin Change Queue/);
  assert.match(ui.complianceOpsContent.innerHTML, /Attestation And Exception Draft/);
  assert.match(ui.complianceOpsContent.innerHTML, /Control Scope And Obligation Boundary/);
  assert.match(ui.complianceOpsContent.innerHTML, /Impact Preview/);
  assert.match(ui.complianceOpsContent.innerHTML, /Governance Route And Receipt/);
  assert.match(ui.complianceOpsContent.innerHTML, /Expiry And History/);
  assert.match(ui.complianceOpsContent.innerHTML, /Control Coverage Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /Obligation Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /Attestation Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /Gap And Exception Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /Retention And Disclosure Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /compliance-change-001/);
  assert.match(ui.complianceOpsContent.innerHTML, /compliance-change-002/);
  assert.match(ui.complianceOpsContent.innerHTML, /Route To Governance/);
  assert.match(ui.complianceOpsContent.innerHTML, /Open GovernanceOps/);
  assert.match(ui.complianceOpsContent.innerHTML, /Apply Approved Change/);
  assert.match(ui.complianceOpsContent.innerHTML, /Copy Governance Receipt/);
  assert.match(ui.complianceOpsContent.innerHTML, /Copy Admin Receipt/);
  assert.match(ui.complianceOpsContent.innerHTML, /Renew Expired Change/);
  assert.match(ui.complianceOpsContent.innerHTML, /Copy Recovery Receipt/);
  assert.match(ui.complianceOpsContent.innerHTML, /approval-receipt-001/);
  assert.match(ui.complianceOpsContent.innerHTML, /admin-receipt-001/);
  assert.match(ui.complianceOpsContent.innerHTML, /admin-expiry-001/);
  assert.match(ui.complianceOpsContent.innerHTML, /The previous exception window elapsed and requires explicit renewal/);
  assert.match(ui.complianceOpsContent.innerHTML, /financial_control/);
  assert.match(ui.complianceOpsContent.innerHTML, /external_actuator/);
  assert.match(ui.complianceOpsContent.innerHTML, /grant\.finance\.transfer/);
  assert.match(ui.complianceOpsContent.innerHTML, /approval-20260315-001/);
  assert.match(ui.complianceOpsContent.innerHTML, /bundle-governed-001/);
  assert.match(ui.complianceOpsContent.innerHTML, /premium-provider-local/);
  assert.match(ui.complianceOpsContent.innerHTML, /45d/);
  assert.match(ui.complianceOpsContent.innerHTML, /120d/);
  assert.match(ui.complianceOpsContent.innerHTML, /pass/);
  assert.match(ui.complianceOpsContent.innerHTML, /warn/);
  assert.match(ui.complianceOpsContent.innerHTML, /Centralized Enterprise Admin Residency Exception/);
  assert.match(ui.complianceOpsContent.innerHTML, /compliance_review/);
  assert.match(ui.complianceOpsContent.innerHTML, /structured_and_text/);
  assert.match(ui.complianceOpsContent.innerHTML, /governed_export_redaction/);
});

test("complianceops empty state renders without loaded compliance posture", () => {
  const ui = { complianceOpsContent: { innerHTML: "" } };
  renderComplianceOpsEmptyState(ui, {
    title: "ComplianceOps",
    message: "Compliance posture becomes available after policy, governance, evidence, audit, and platform signals load."
  });

  assert.match(ui.complianceOpsContent.innerHTML, /ComplianceOps/);
  assert.match(ui.complianceOpsContent.innerHTML, /Compliance posture becomes available/);
});
