import test from "node:test";
import assert from "node:assert/strict";
import { renderPolicyOpsEmptyState, renderPolicyOpsPage } from "../domains/policyops/routes.js";

test("policyops page renders the first inspect-only policy boards", () => {
  const ui = { policyOpsContent: { innerHTML: "" } };
  renderPolicyOpsPage(ui, {
    settings: {
      aimxs: {
        mode: "aimxs-full",
        activation: {
          selectedProviderId: "aimxs-policy-primary"
        }
      },
      identity: {
        source: "runtime.auth.context",
        policyMatrixRequired: true,
        policyRuleCount: 6
      },
      policyCatalog: {
        source: "runtime-endpoint",
        count: 2,
        items: [
          {
            packId: "managed_codex_worker_operator",
            label: "Managed Codex Worker Operator",
            roleBundles: ["enterprise.operator"],
            decisionSurfaces: ["governed_tool_action"],
            boundaryRequirements: ["tenant_project_scope", "runtime_authz"]
          },
          {
            packId: "finance_supervisor_review",
            label: "Finance Supervisor Review",
            roleBundles: ["finance.supervisor"],
            decisionSurfaces: ["wire_transfer"],
            boundaryRequirements: ["governance.handshake_validation"]
          }
        ]
      }
    },
    runs: {
      items: [
        {
          runId: "run-20260314-010",
          updatedAt: "2026-03-14T21:01:00Z",
          selectedPolicyProvider: "aimxs-policy-primary",
          policyDecision: "DEFER",
          requestPayload: {
            meta: { environment: "staging" },
            task: {
              requestLabel: "Transfer review",
              summary: "Review a governed finance transfer request."
            },
            context: {
              governed_action: {
                contract_id: "contract-finance-transfer-v1",
                workflow_kind: "finance_transfer"
              },
              policy_stratification: {
                boundary_class: "financial_control",
                risk_tier: "high",
                required_grants: ["finance.supervisor.approve"],
                evidence_readiness: "partial"
              },
              actor_authority: {
                subject: "demo.operator",
                client_id: "epydiosops-desktop-local",
                authority_basis: "bearer_token_jwt",
                authn: "oidc",
                roles: ["enterprise.ai_operator"],
                tenant_scopes: ["tenant-demo"],
                project_scopes: ["project-finance"]
              }
            },
            action: {
              type: "governed_finance_action",
              verb: "review"
            },
            annotations: {
              governedAction: {
                operatorApprovalRequired: true
              }
            }
          },
          policyResponse: {
            decision: "DEFER",
            source: "aimxs-policy-primary",
            reasons: [{ message: "Finance supervisor approval is still required." }],
            evidenceRefs: ["evidence://finance/transfer/001"],
            output: {
              aimxs: {
                providerMeta: {
                  decision_path: "governance.handshake_validation",
                  audit_sink: {
                    active: true,
                    event_ref: "aimxs://audit/policy-event-001"
                  }
                }
              }
            }
          }
        },
        {
          runId: "run-20260314-009",
          updatedAt: "2026-03-14T20:30:00Z",
          selectedPolicyProvider: "oss-policy-opa",
          policyDecision: "ALLOW"
        }
      ]
    },
    viewState: {
      feedback: {
        tone: "ok",
        message: "PolicyOps action feedback is visible."
      },
      simulationRefreshedAt: "2026-03-14T21:05:00Z"
    }
  });

  assert.match(ui.policyOpsContent.innerHTML, /data-domain-root="policyops"/);
  assert.match(ui.policyOpsContent.innerHTML, /PolicyOps action feedback is visible\./);
  assert.match(ui.policyOpsContent.innerHTML, /Current Policy Contract/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy Pack Catalog/);
  assert.match(ui.policyOpsContent.innerHTML, /Decision Explanation/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy Coverage/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy Simulation/);
  assert.match(ui.policyOpsContent.innerHTML, /aimxs-full/);
  assert.match(ui.policyOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.policyOpsContent.innerHTML, /managed_codex_worker_operator/);
  assert.match(ui.policyOpsContent.innerHTML, /Finance Supervisor Review/);
  assert.match(ui.policyOpsContent.innerHTML, /run-20260314-010/);
  assert.match(ui.policyOpsContent.innerHTML, /contract-finance-transfer-v1/);
  assert.match(ui.policyOpsContent.innerHTML, /Finance supervisor approval is still required\./);
  assert.match(ui.policyOpsContent.innerHTML, /financial_control/);
  assert.match(ui.policyOpsContent.innerHTML, /project-finance/);
  assert.match(ui.policyOpsContent.innerHTML, /aimxs:\/\/audit\/policy-event-001/);
  assert.match(ui.policyOpsContent.innerHTML, /latest governed run replay/);
  assert.match(ui.policyOpsContent.innerHTML, /required grants/);
  assert.match(ui.policyOpsContent.innerHTML, /blockers=3/);
  assert.match(ui.policyOpsContent.innerHTML, /decision surfaces/);
  assert.match(ui.policyOpsContent.innerHTML, /catalog/);
  assert.match(ui.policyOpsContent.innerHTML, /Export Decision Explanation/);
  assert.match(ui.policyOpsContent.innerHTML, /Copy Stable Policy References/);
  assert.match(ui.policyOpsContent.innerHTML, /Open Linked Governance/);
  assert.match(ui.policyOpsContent.innerHTML, /Run Bounded Simulation|Refresh Bounded Simulation/);
  assert.match(ui.policyOpsContent.innerHTML, /Open AuditOps/);
  assert.match(ui.policyOpsContent.innerHTML, /Open EvidenceOps/);
  assert.match(ui.policyOpsContent.innerHTML, /Open ComplianceOps/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-action="export-decision-explanation"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-action="copy-stable-policy-references"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-action="open-linked-governance"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-action="refresh-bounded-simulation"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-action="open-auditops"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-action="open-evidenceops"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-action="open-complianceops"/);
});

test("policyops empty state renders without loaded policy context", () => {
  const ui = { policyOpsContent: { innerHTML: "" } };
  renderPolicyOpsEmptyState(ui, {
    title: "PolicyOps",
    message: "Policy semantics become available after policy contract, pack, and decision signals load."
  });

  assert.match(ui.policyOpsContent.innerHTML, /PolicyOps/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy semantics become available/);
});
