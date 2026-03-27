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
            version: "2026.03.14",
            sourceRef: "bundle://aimxs/managed_codex_worker_operator/2026.03.14",
            stableRef: "policy-pack://managed_codex_worker_operator@2026.03.14",
            schemaReadiness: "declared",
            compileReadiness: "ready",
            activationTarget: "workspace",
            activationPosture: "current",
            roleBundles: ["enterprise.operator"],
            decisionSurfaces: ["governed_tool_action"],
            boundaryRequirements: ["tenant_project_scope", "runtime_authz"]
          },
          {
            packId: "finance_supervisor_review",
            label: "Finance Supervisor Review",
            version: "2026.03.15",
            sourceRef: "bundle://aimxs/finance_supervisor_review/2026.03.15",
            stableRef: "policy-pack://finance_supervisor_review@2026.03.15",
            schemaReadiness: "declared",
            compileReadiness: "conditional",
            activationTarget: "tenant-demo / project-finance",
            activationPosture: "available",
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
      simulationRefreshedAt: "2026-03-14T21:05:00Z",
      selectedAdminChangeId: "policy-change-001",
      adminDraft: {
        changeKind: "activate",
        packId: "finance_supervisor_review",
        providerId: "aimxs-policy-primary",
        targetScope: "tenant-demo / project-finance",
        reason: "Finance policy pack needs bounded activation preview."
      },
      queueItems: [
        {
          id: "policy-change-001",
          ownerDomain: "policyops",
          kind: "policy",
          label: "Policy Pack Load And Activation Draft",
          requestedAction: "activate finance_supervisor_review",
          subjectId: "finance_supervisor_review",
          subjectLabel: "pack",
          targetScope: "tenant-demo / project-finance",
          targetLabel: "scope",
          changeKind: "activate",
          packId: "finance_supervisor_review",
          providerId: "aimxs-policy-primary",
          status: "simulated",
          reason: "Finance policy pack needs bounded activation preview.",
          summary: "Activate finance_supervisor_review for tenant-demo / project-finance @ aimxs-policy-primary",
          simulationSummary: "Preview only. This activate proposal requires GovernanceOps approval before any live policy-pack change can execute.",
          verification: {
            changeId: "policy-change-001",
            kind: "policy",
            tone: "warn",
            title: "Policy verify gate",
            summary: "Verify gate passed with warnings for policy-change-001. GovernanceOps can review the bounded compile, lint, and golden-case posture before approval.",
            updatedAt: "2026-03-14T21:09:00Z",
            verifiedAt: "2026-03-14T21:09:00Z",
            compileStatus: "warn",
            lintStatus: "pass",
            goldenStatus: "warn",
            passing: true,
            diffSummary: "pack managed_codex_worker_operator@2026.03.14 -> finance_supervisor_review@2026.03.15; provider aimxs-policy-primary -> aimxs-policy-primary; scope workspace -> tenant-demo / project-finance",
            findings: [
              "Golden simulation posture still carries bounded warnings or blockers; route is still allowed only if the verify gate itself passes."
            ],
            cases: [
              {
                label: "compile validation",
                status: "warn",
                detail: "schema=declared; compile=conditional"
              },
              {
                label: "lint posture",
                status: "pass",
                detail: "stableRef=present; sourceRef=present; version=2026.03.15; surfaces=1; boundaries=1"
              },
              {
                label: "golden simulation set",
                status: "warn",
                detail: "decision=DEFER; blockers=3; preview=warn"
              }
            ]
          },
          updatedAt: "2026-03-14T21:07:00Z"
        }
      ],
      latestVerification: {
        changeId: "policy-change-001",
        kind: "policy",
        tone: "warn",
        title: "Policy verify gate",
        summary: "Verify gate passed with warnings for policy-change-001. GovernanceOps can review the bounded compile, lint, and golden-case posture before approval.",
        updatedAt: "2026-03-14T21:09:00Z",
        verifiedAt: "2026-03-14T21:09:00Z",
        compileStatus: "warn",
        lintStatus: "pass",
        goldenStatus: "warn",
        passing: true,
        diffSummary: "pack managed_codex_worker_operator@2026.03.14 -> finance_supervisor_review@2026.03.15; provider aimxs-policy-primary -> aimxs-policy-primary; scope workspace -> tenant-demo / project-finance",
        findings: [
          "Golden simulation posture still carries bounded warnings or blockers; route is still allowed only if the verify gate itself passes."
        ],
        cases: [
          {
            label: "compile validation",
            status: "warn",
            detail: "schema=declared; compile=conditional"
          },
          {
            label: "lint posture",
            status: "pass",
            detail: "stableRef=present; sourceRef=present; version=2026.03.15; surfaces=1; boundaries=1"
          },
          {
            label: "golden simulation set",
            status: "warn",
            detail: "decision=DEFER; blockers=3; preview=warn"
          }
        ]
      },
      latestSimulation: {
        changeId: "policy-change-001",
        kind: "policy",
        tone: "warn",
        title: "Policy admin dry-run",
        summary: "Preview only. This activate proposal requires GovernanceOps approval before any live policy-pack change can execute.",
        updatedAt: "2026-03-14T21:08:00Z",
        facts: [
          { label: "pack", value: "finance_supervisor_review", code: true },
          { label: "provider", value: "aimxs-policy-primary", code: true },
          { label: "scope", value: "tenant-demo / project-finance", code: true }
        ],
        findings: [
          "Execution remains blocked until GovernanceOps records an explicit approved decision receipt for this policy proposal."
        ]
      }
    }
  });

  assert.match(ui.policyOpsContent.innerHTML, /data-domain-root="policyops"/);
  assert.match(ui.policyOpsContent.innerHTML, /PolicyOps action feedback is visible\./);
  assert.match(ui.policyOpsContent.innerHTML, /Admin Change Queue/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy Pack Load And Activation Draft/);
  assert.match(ui.policyOpsContent.innerHTML, /Decision Provider And Applicability Scope/);
  assert.match(ui.policyOpsContent.innerHTML, /Semantic Impact Preview/);
  assert.match(ui.policyOpsContent.innerHTML, /Governance Route And Receipt/);
  assert.match(ui.policyOpsContent.innerHTML, /Current Policy Contract/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy Pack Catalog/);
  assert.match(ui.policyOpsContent.innerHTML, /policy-pack:\/\/managed_codex_worker_operator@2026\.03\.14/);
  assert.match(ui.policyOpsContent.innerHTML, /bundle:\/\/aimxs\/managed_codex_worker_operator\/2026\.03\.14/);
  assert.match(ui.policyOpsContent.innerHTML, /schema=declared; compile=ready/);
  assert.match(ui.policyOpsContent.innerHTML, /activationTarget=workspace; activationPosture=current/);
  assert.match(ui.policyOpsContent.innerHTML, /Decision Explanation/);
  assert.match(ui.policyOpsContent.innerHTML, /Identity And Posture Echo/);
  assert.match(ui.policyOpsContent.innerHTML, /governed action authority/);
  assert.match(ui.policyOpsContent.innerHTML, /governance handshake/);
  assert.match(ui.policyOpsContent.innerHTML, /Current Posture/);
  assert.match(ui.policyOpsContent.innerHTML, /financial_control/);
  assert.match(ui.policyOpsContent.innerHTML, /Target Posture/);
  assert.match(ui.policyOpsContent.innerHTML, /activate policy pack|bounded policy draft/);
  assert.match(ui.policyOpsContent.innerHTML, /Allowed Or Blocked/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy Coverage/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy Simulation/);
  assert.match(ui.policyOpsContent.innerHTML, /aimxs-full/);
  assert.match(ui.policyOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.policyOpsContent.innerHTML, /managed_codex_worker_operator/);
  assert.match(ui.policyOpsContent.innerHTML, /Finance Supervisor Review/);
  assert.match(ui.policyOpsContent.innerHTML, /2026\.03\.15/);
  assert.match(ui.policyOpsContent.innerHTML, /policy-pack:\/\/finance_supervisor_review@2026\.03\.15/);
  assert.match(ui.policyOpsContent.innerHTML, /run-20260314-010/);
  assert.match(ui.policyOpsContent.innerHTML, /contract-finance-transfer-v1/);
  assert.match(ui.policyOpsContent.innerHTML, /Finance supervisor approval is still required\./);
  assert.match(ui.policyOpsContent.innerHTML, /financial_control/);
  assert.match(ui.policyOpsContent.innerHTML, /project-finance/);
  assert.match(ui.policyOpsContent.innerHTML, /aimxs:\/\/audit\/policy-event-001/);
  assert.match(ui.policyOpsContent.innerHTML, /latest governed run replay/);
  assert.match(ui.policyOpsContent.innerHTML, /required grants/);
  assert.match(ui.policyOpsContent.innerHTML, /blockers=3/);
  assert.match(ui.policyOpsContent.innerHTML, /policy-change-001/);
  assert.match(ui.policyOpsContent.innerHTML, /tenant-demo \/ project-finance/);
  assert.match(ui.policyOpsContent.innerHTML, /Finance policy pack needs bounded activation preview\./);
  assert.match(ui.policyOpsContent.innerHTML, /decision surfaces/);
  assert.match(ui.policyOpsContent.innerHTML, /catalog/);
  assert.match(ui.policyOpsContent.innerHTML, /Stable References/);
  assert.match(ui.policyOpsContent.innerHTML, /Catalog Rigor/);
  assert.match(ui.policyOpsContent.innerHTML, /schema ready/);
  assert.match(ui.policyOpsContent.innerHTML, /compile ready/);
  assert.match(ui.policyOpsContent.innerHTML, /Rigor Gate/);
  assert.match(ui.policyOpsContent.innerHTML, /Verification Gate/);
  assert.match(ui.policyOpsContent.innerHTML, /Simulation Diff Summary/);
  assert.match(ui.policyOpsContent.innerHTML, /Golden Simulation Set/);
  assert.match(ui.policyOpsContent.innerHTML, /Verify gate passed with warnings/);
  assert.match(ui.policyOpsContent.innerHTML, /compile validation/);
  assert.match(ui.policyOpsContent.innerHTML, /lint posture/);
  assert.match(ui.policyOpsContent.innerHTML, /golden simulation set/);
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
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="save-draft"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="simulate-draft"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="verify-draft"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="route-draft"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="select-queue-item"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="simulate-queue-item"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="verify-queue-item"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="route-queue-item"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-action="open-governance"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-draft-field="changeKind"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-draft-field="packId"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-draft-field="providerId"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-draft-field="targetScope"/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-draft-field="reason"/);
  assert.match(ui.policyOpsContent.innerHTML, /Open GovernanceOps/);
});

test("policyops page renders apply and receipt actions for approved policy admin proposals", () => {
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
        count: 1,
        items: [
          {
            packId: "read_only_review",
            label: "Read Only Review",
            roleBundles: ["enterprise.operator"],
            decisionSurfaces: ["governed_tool_action"],
            boundaryRequirements: ["tenant_project_scope"]
          }
        ]
      }
    },
    runs: { items: [] },
    viewState: {
      selectedAdminChangeId: "policy-change-apply-001",
      adminDraft: {
        changeKind: "activate",
        packId: "read_only_review",
        providerId: "aimxs-policy-primary",
        targetScope: "tenant-demo / workspace",
        reason: "Activate the reviewed pack after governance approval."
      },
      queueItems: [
        {
          id: "policy-change-apply-001",
          ownerDomain: "policyops",
          kind: "policy",
          label: "Policy Pack Load And Activation Draft",
          requestedAction: "activate read_only_review",
          subjectId: "read_only_review",
          subjectLabel: "pack",
          targetScope: "tenant-demo / workspace",
          targetLabel: "scope",
          changeKind: "activate",
          packId: "read_only_review",
          providerId: "aimxs-policy-primary",
          status: "approved",
          reason: "Activate the reviewed pack after governance approval.",
          summary: "Activate read_only_review for tenant-demo / workspace @ aimxs-policy-primary",
          simulationSummary: "Preview only. This activate proposal requires GovernanceOps approval before any live policy-pack change can execute.",
          updatedAt: "2026-03-16T23:20:00Z",
          routedAt: "2026-03-16T23:10:00Z",
          decision: {
            decisionId: "admin-decision-policy-001",
            status: "approved",
            reason: "Policy simulation and governance review are green.",
            decidedAt: "2026-03-16T23:12:00Z",
            approvalReceiptId: "approval-receipt-policy-001",
            actorRef: "governance-reviewer"
          }
        }
      ],
      latestSimulation: {
        changeId: "policy-change-apply-001",
        kind: "policy",
        tone: "info",
        title: "Policy admin dry-run",
        summary: "Preview only. This activate proposal requires GovernanceOps approval before any live policy-pack change can execute.",
        updatedAt: "2026-03-16T23:09:00Z",
        facts: [
          { label: "pack", value: "read_only_review", code: true },
          { label: "provider", value: "aimxs-policy-primary", code: true }
        ],
        findings: []
      }
    }
  });

  assert.match(ui.policyOpsContent.innerHTML, /Governance Route And Receipt/);
  assert.match(ui.policyOpsContent.innerHTML, /Rollback And History/);
  assert.match(ui.policyOpsContent.innerHTML, /Apply Approved Change/);
  assert.match(ui.policyOpsContent.innerHTML, /Copy Governance Receipt/);
  assert.match(ui.policyOpsContent.innerHTML, /Copy Admin Receipt/);
  assert.match(ui.policyOpsContent.innerHTML, /approval-receipt-policy-001/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy simulation and governance review are green\./);
});

test("policyops page renders rollback and bounded history for applied policy admin proposals", () => {
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
        count: 1,
        items: [
          {
            packId: "read_only_review",
            label: "Read Only Review",
            roleBundles: ["enterprise.operator"],
            decisionSurfaces: ["governed_tool_action"],
            boundaryRequirements: ["tenant_project_scope"]
          }
        ]
      }
    },
    runs: { items: [] },
    viewState: {
      selectedAdminChangeId: "policy-change-rollback-001",
      recoveryReason: "Policy regression surfaced during bounded tenant replay.",
      adminDraft: {
        changeKind: "activate",
        packId: "read_only_review",
        providerId: "aimxs-policy-primary",
        targetScope: "tenant-demo / workspace",
        reason: "Activate the reviewed pack after governance approval."
      },
      queueItems: [
        {
          id: "policy-change-rollback-001",
          ownerDomain: "policyops",
          kind: "policy",
          label: "Policy Pack Load And Activation Draft",
          requestedAction: "activate read_only_review",
          subjectId: "read_only_review",
          subjectLabel: "pack",
          targetScope: "tenant-demo / workspace",
          targetLabel: "scope",
          changeKind: "activate",
          packId: "read_only_review",
          providerId: "aimxs-policy-primary",
          status: "applied",
          reason: "Activate the reviewed pack after governance approval.",
          summary: "Activate read_only_review for tenant-demo / workspace @ aimxs-policy-primary",
          simulationSummary: "Preview only. This activate proposal requires GovernanceOps approval before any live policy-pack change can execute.",
          createdAt: "2026-03-16T23:08:00Z",
          simulatedAt: "2026-03-16T23:09:00Z",
          routedAt: "2026-03-16T23:10:00Z",
          updatedAt: "2026-03-16T23:20:00Z",
          decision: {
            decisionId: "admin-decision-policy-rollback-001",
            status: "approved",
            reason: "Policy simulation and governance review are green.",
            decidedAt: "2026-03-16T23:12:00Z",
            approvalReceiptId: "approval-receipt-policy-rollback-001",
            actorRef: "governance-reviewer"
          },
          execution: {
            executionId: "admin-execution-policy-rollback-001",
            executedAt: "2026-03-16T23:14:00Z",
            status: "applied",
            summary: "Activate read_only_review for tenant-demo / workspace @ aimxs-policy-primary.",
            actorRef: "policy-operator"
          },
          receipt: {
            receiptId: "admin-receipt-policy-rollback-001",
            issuedAt: "2026-03-16T23:14:00Z",
            summary: "Activate read_only_review for tenant-demo / workspace @ aimxs-policy-primary.",
            stableRef: "policy-change-rollback-001/admin-receipt-policy-rollback-001",
            approvalReceiptId: "approval-receipt-policy-rollback-001",
            executionId: "admin-execution-policy-rollback-001"
          }
        }
      ]
    }
  });

  assert.match(ui.policyOpsContent.innerHTML, /Rollback And History/);
  assert.match(ui.policyOpsContent.innerHTML, /rollback available/);
  assert.match(ui.policyOpsContent.innerHTML, /Policy regression surfaced during bounded tenant replay\./);
  assert.match(ui.policyOpsContent.innerHTML, /Rollback Applied Change/);
  assert.match(ui.policyOpsContent.innerHTML, /Copy Rollback Receipt/);
  assert.match(ui.policyOpsContent.innerHTML, /data-policyops-admin-recovery-reason/);
  assert.match(ui.policyOpsContent.innerHTML, /admin-receipt-policy-rollback-001/);
  assert.match(ui.policyOpsContent.innerHTML, /approval-receipt-policy-rollback-001/);
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
