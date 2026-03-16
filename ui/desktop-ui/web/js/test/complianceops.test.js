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
        mode: "aimxs-full",
        activation: {
          selectedProviderId: "aimxs-policy-provider"
        }
      }
    },
    runs: {
      items: [
        {
          runId: "run-20260315-001",
          tenantId: "tenant-demo",
          projectId: "project-core",
          selectedPolicyProvider: "aimxs-policy-provider",
          policyDecision: "ALLOW",
          retentionClass: "archive",
          updatedAt: "2026-03-15T02:00:30Z",
          createdAt: "2026-03-15T01:57:00Z",
          requestPayload: {
            context: {
              policy_stratification: {
                boundary_class: "financial_control",
                risk_tier: "high",
                evidence_readiness: "partial",
                required_grants: ["grant.finance.transfer"]
              },
              governed_action: {
                operator_approval_required: true
              }
            }
          },
          policyResponse: {
            decision: "ALLOW",
            source: "aimxs-policy-provider"
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
          selectedPolicyProvider: "aimxs-policy-provider",
          policyDecision: "DEFER",
          retentionClass: "standard",
          updatedAt: "2026-03-15T01:51:30Z",
          createdAt: "2026-03-15T01:48:00Z",
          requestPayload: {
            context: {
              policy_stratification: {
                boundary_class: "external_actuator",
                risk_tier: "high",
                evidence_readiness: "ready",
                required_grants: []
              }
            }
          },
          policyResponse: {
            decision: "DEFER",
            source: "aimxs-policy-provider"
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
      activeMode: "aimxs-full",
      selectedProviderId: "aimxs-policy-provider"
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
    }
  });

  assert.match(ui.complianceOpsContent.innerHTML, /data-domain-root="complianceops"/);
  assert.match(ui.complianceOpsContent.innerHTML, /Control Coverage Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /Obligation Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /Attestation Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /Gap And Exception Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /Retention And Disclosure Board/);
  assert.match(ui.complianceOpsContent.innerHTML, /financial_control/);
  assert.match(ui.complianceOpsContent.innerHTML, /external_actuator/);
  assert.match(ui.complianceOpsContent.innerHTML, /grant\.finance\.transfer/);
  assert.match(ui.complianceOpsContent.innerHTML, /approval-20260315-001/);
  assert.match(ui.complianceOpsContent.innerHTML, /bundle-governed-001/);
  assert.match(ui.complianceOpsContent.innerHTML, /aimxs-policy-provider/);
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
