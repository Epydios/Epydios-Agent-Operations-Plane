import test from "node:test";
import assert from "node:assert/strict";
import {
  renderIdentityOpsEmptyState,
  renderIdentityOpsPage
} from "../domains/identityops/routes.js";

test("identityops page renders inspect-first boards plus bounded admin recovery posture", () => {
  const ui = { identityContent: { innerHTML: "" } };
  renderIdentityOpsPage(
    ui,
    {
      environment: "staging",
      dataSources: {
        runs: "runtime-endpoint",
        approvals: "runtime-endpoint",
        audit: "runtime-endpoint"
      },
      identityTraceability: {
        runCount: 3,
        approvalCount: 1,
        auditCount: 8,
        latestRun: {
          runId: "run-20260313-001",
          requestId: "req-20260313-001",
          projectId: "project-local",
          environment: "staging",
          status: "COMPLETED",
          policyDecision: "ALLOW",
          selectedEvidenceProvider: "oss-evidence-memory",
          evidenceRecordStatus: "recorded",
          evidenceBundleStatus: "finalized",
          policyGrantTokenPresent: true,
          updatedAt: "2026-03-13T12:00:30Z"
        },
        latestApproval: {
          approvalId: "approval-run-20260313-001",
          runId: "run-20260313-001",
          status: "PENDING",
          tier: 3,
          targetExecutionProfile: "sandbox_vm_autonomous",
          expiresAt: "2026-03-13T12:15:00Z"
        },
        latestAudit: {
          ts: "2026-03-13T12:00:45Z",
          event: "runtime.policy.decision",
          providerId: "premium-policy-primary",
          decision: "ALLOW"
        }
      },
      policyCatalog: {
        count: 4,
        items: []
      },
      viewState: {
        feedback: {
          tone: "ok",
          message: "Identity admin draft feedback is visible."
        },
        selectedAdminChangeId: "authority-change-001",
        recoveryReason: "Rollback required if governance context changes after approval.",
        authorityDraft: {
          subjectId: "demo.operator",
          targetScope: "tenant-local / project-local",
          authorityTier: "project_admin",
          reason: "Project operator coverage needs temporary admin review."
        },
        grantDraft: {
          subjectId: "finance.reviewer",
          targetScope: "tenant-local / project-local",
          changeKind: "delegation",
          grantKey: "runtime.run.read",
          delegationMode: "approval_chain",
          reason: "Route delegated read access through the approval ladder."
        },
        queueItems: [
          {
            id: "authority-change-001",
            kind: "authority",
            label: "Authority Change Draft",
            requestedAction: "set project_admin",
            subjectId: "demo.operator",
            targetScope: "tenant-local / project-local",
            status: "approved",
            reason: "Project operator coverage needs temporary admin review.",
            summary: "project_admin for demo.operator @ tenant-local / project-local",
            simulationSummary: "Preview only. This authority proposal requires GovernanceOps approval before a live authority mutation can execute.",
            updatedAt: "2026-03-13T12:14:00Z",
            routedAt: "2026-03-13T12:13:30Z",
            decision: {
              decisionId: "admin-decision-001",
              status: "approved",
              reason: "Approved after scoped identity review.",
              decidedAt: "2026-03-13T12:14:00Z",
              approvalReceiptId: "approval-receipt-001",
              actorRef: "governance.reviewer"
            }
          },
          {
            id: "grant-change-001",
            kind: "grant",
            label: "Grant And Delegation Draft",
            requestedAction: "delegation runtime.run.read",
            subjectId: "finance.reviewer",
            targetScope: "tenant-local / project-local",
            status: "draft",
            reason: "Route delegated read access through the approval ladder.",
            summary: "delegation runtime.run.read for finance.reviewer @ tenant-local / project-local",
            updatedAt: "2026-03-13T12:12:00Z"
          }
        ],
        latestSimulation: {
          changeId: "authority-change-001",
          kind: "authority",
          tone: "warn",
          title: "Authority change simulation",
          summary: "Preview only. This authority proposal requires GovernanceOps approval before a live authority mutation can execute.",
          updatedAt: "2026-03-13T12:13:00Z",
          facts: [
            { label: "subject", value: "demo.operator", code: true },
            { label: "target", value: "tenant-local / project-local", code: true },
            { label: "authority", value: "project_admin", code: true }
          ],
          findings: [
            "Execution is blocked in this slice. Governance approval is required before any live identity mutation can occur.",
            "This proposal targets the currently active governed identity."
          ]
        }
      },
      identity: {
        generatedAt: "2026-03-13T12:00:00Z",
        source: "runtime.auth.context",
        authEnabled: true,
        authenticated: true,
        authorityBasis: "bearer_token_jwt",
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
          claimKeys: ["sub", "roles", "tenant_id", "project_id"]
        }
      }
    },
    {
      authenticated: true,
      claims: {
        sub: "demo.operator",
        client_id: "epydios-desktop-local"
      }
    }
  );

  assert.match(ui.identityContent.innerHTML, /data-domain-root="identityops"/);
  assert.match(ui.identityContent.innerHTML, /Effective Identity/);
  assert.match(ui.identityContent.innerHTML, /Authority/);
  assert.match(ui.identityContent.innerHTML, /Scope/);
  assert.match(ui.identityContent.innerHTML, /Grant And Entitlement/);
  assert.match(ui.identityContent.innerHTML, /Identity Network/);
  assert.match(ui.identityContent.innerHTML, /Delegation And Override Basis/);
  assert.match(ui.identityContent.innerHTML, /Identity Traceability/);
  assert.match(ui.identityContent.innerHTML, /direct relations/);
  assert.match(ui.identityContent.innerHTML, /links=4/);
  assert.match(ui.identityContent.innerHTML, /governance-backed/);
  assert.match(ui.identityContent.innerHTML, /approval=linked/);
  assert.match(ui.identityContent.innerHTML, /grant=issued/);
  assert.match(ui.identityContent.innerHTML, /runtime-endpoint/);
  assert.match(ui.identityContent.innerHTML, /Latest Run/);
  assert.match(ui.identityContent.innerHTML, /approval-run-20260313-001/);
  assert.match(ui.identityContent.innerHTML, /runtime\.policy\.decision/);
  assert.match(ui.identityContent.innerHTML, /oss-evidence-memory/);
  assert.match(ui.identityContent.innerHTML, /req-20260313-001/);
  assert.match(ui.identityContent.innerHTML, /sandbox_vm_autonomous/);
  assert.match(ui.identityContent.innerHTML, /Receipt State/);
  assert.match(ui.identityContent.innerHTML, /identityops-value-pill/);
  assert.match(ui.identityContent.innerHTML, /2026-03-13T12:15:00Z/);
  assert.match(ui.identityContent.innerHTML, /premium-policy-primary/);
  assert.match(ui.identityContent.innerHTML, /demo\.operator/);
  assert.match(ui.identityContent.innerHTML, /runtime\.run\.create/);
  assert.match(ui.identityContent.innerHTML, /staging/);
  assert.match(ui.identityContent.innerHTML, /Identity And Posture/);
  assert.match(ui.identityContent.innerHTML, /runtime-bound subject/);
  assert.match(ui.identityContent.innerHTML, /authority tier|current authority/);
  assert.match(ui.identityContent.innerHTML, /governance-backed claims/);
  assert.match(ui.identityContent.innerHTML, /Current Posture/);
  assert.match(ui.identityContent.innerHTML, /governance-backed identity/);
  assert.match(ui.identityContent.innerHTML, /Target Posture/);
  assert.match(ui.identityContent.innerHTML, /authority tier transition|grant or delegation transition/);
  assert.match(ui.identityContent.innerHTML, /Allowed Or Blocked/);
  assert.match(ui.identityContent.innerHTML, /IdentityOps Admin/);
  assert.match(ui.identityContent.innerHTML, /Identity admin draft feedback is visible\./);
  assert.match(ui.identityContent.innerHTML, /Admin Change Queue/);
  assert.match(ui.identityContent.innerHTML, /Authority Change Draft/);
  assert.match(ui.identityContent.innerHTML, /Grant And Delegation Draft/);
  assert.match(ui.identityContent.innerHTML, /Simulation And Impact Preview/);
  assert.match(ui.identityContent.innerHTML, /Governance Route And Receipt/);
  assert.match(ui.identityContent.innerHTML, /Rollback And Expiry History/);
  assert.match(ui.identityContent.innerHTML, /proposal -&gt; simulation -&gt; governance -&gt; apply -&gt; receipt -&gt; rollback\/expiry|proposal -> simulation -> governance -> apply -> receipt -> rollback\/expiry/);
  assert.match(ui.identityContent.innerHTML, /dry run/);
  assert.match(ui.identityContent.innerHTML, /queued=2/);
  assert.match(ui.identityContent.innerHTML, /authority-change-001/);
  assert.match(ui.identityContent.innerHTML, /grant-change-001/);
  assert.match(ui.identityContent.innerHTML, /Project operator coverage needs temporary admin review\./);
  assert.match(ui.identityContent.innerHTML, /runtime\.run\.read/);
  assert.match(ui.identityContent.innerHTML, /approval_chain/);
  assert.match(ui.identityContent.innerHTML, /Run Simulation/);
  assert.match(ui.identityContent.innerHTML, /Route To Governance/);
  assert.match(ui.identityContent.innerHTML, /Open GovernanceOps/);
  assert.match(ui.identityContent.innerHTML, /Apply Approved Change/);
  assert.match(ui.identityContent.innerHTML, /Copy Governance Receipt/);
  assert.match(ui.identityContent.innerHTML, /Copy Admin Receipt/);
  assert.match(ui.identityContent.innerHTML, /Rollback required if governance context changes after approval\./);
  assert.match(ui.identityContent.innerHTML, /Rollback Applied Change/);
  assert.match(ui.identityContent.innerHTML, /Expire Applied Grant/);
  assert.match(ui.identityContent.innerHTML, /Copy Rollback Receipt/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-recovery-reason/);
  assert.match(ui.identityContent.innerHTML, /approval-receipt-001/);
  assert.match(ui.identityContent.innerHTML, /Approved after scoped identity review\./);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"save-draft\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"simulate-draft\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"route-draft\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"select-queue-item\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"simulate-queue-item\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"route-queue-item\"|data-identityops-admin-action=\"open-governance\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"apply-approved-change\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"copy-governance-receipt\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"copy-admin-receipt\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"rollback-applied-change\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"expire-applied-change\"/);
  assert.match(ui.identityContent.innerHTML, /data-identityops-admin-action=\"copy-rollback-receipt\"/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /run=<code>/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /expires=<code>2026-03-13T12:15:00Z<\/code>/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /policy=<code>premium-policy-primary<\/code>/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /NetworkOps will own transport path/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /Traceability stays bounded/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /Execute Live Mutation/);
});

test("identityops empty state renders without loaded settings", () => {
  const ui = { identityContent: { innerHTML: "" } };
  renderIdentityOpsEmptyState(ui, {
    tone: "info",
    title: "IdentityOps",
    message: "Identity state becomes available after configuration and runtime identity load."
  });

  assert.match(ui.identityContent.innerHTML, /IdentityOps/);
  assert.match(ui.identityContent.innerHTML, /Identity state becomes available/);
});

test("identityops page renders applied admin receipt state with bounded rollback and expiry actions", () => {
  const ui = { identityContent: { innerHTML: "" } };
  renderIdentityOpsPage(
    ui,
    {
      environment: "staging",
      viewState: {
        selectedAdminChangeId: "grant-change-apply-001",
        queueItems: [
          {
            id: "grant-change-apply-001",
            kind: "grant",
            label: "Grant And Delegation Draft",
            requestedAction: "issue runtime.run.read",
            subjectId: "finance.reviewer",
            targetScope: "tenant-local / project-local",
            status: "applied",
            reason: "Grant approved for finance review coverage.",
            summary: "issue runtime.run.read for finance.reviewer @ tenant-local / project-local",
            simulationSummary: "Preview only. This issue proposal requires GovernanceOps approval before a grant or delegation change can execute.",
            createdAt: "2026-03-16T09:10:00Z",
            simulatedAt: "2026-03-16T09:11:00Z",
            updatedAt: "2026-03-16T09:15:00Z",
            routedAt: "2026-03-16T09:12:00Z",
            decision: {
              decisionId: "admin-decision-apply-001",
              status: "approved",
              reason: "Approved for bounded finance review access.",
              decidedAt: "2026-03-16T09:13:00Z",
              approvalReceiptId: "approval-receipt-apply-001",
              actorRef: "governance.reviewer"
            },
            execution: {
              executionId: "admin-execution-apply-001",
              status: "applied",
              executedAt: "2026-03-16T09:14:00Z",
              summary: "Applied issue runtime.run.read for finance.reviewer at tenant-local / project-local.",
              actorRef: "demo.operator"
            },
            receipt: {
              receiptId: "admin-receipt-apply-001",
              issuedAt: "2026-03-16T09:14:30Z",
              summary: "Applied issue runtime.run.read for finance.reviewer at tenant-local / project-local.",
              stableRef: "grant-change-apply-001/admin-receipt-apply-001",
              approvalReceiptId: "approval-receipt-apply-001",
              executionId: "admin-execution-apply-001"
            }
          }
        ],
        recoveryReason: "Grant must be removed after review window closes."
      },
      identity: {
        authenticated: true,
        authEnabled: true,
        authorityBasis: "bearer_token_jwt",
        identity: {
          subject: "demo.operator"
        }
      }
    },
    {
      authenticated: true,
      claims: {
        sub: "demo.operator"
      }
    }
  );

  assert.match(ui.identityContent.innerHTML, /admin-receipt-apply-001/);
  assert.match(ui.identityContent.innerHTML, /grant-change-apply-001\/admin-receipt-apply-001/);
  assert.match(ui.identityContent.innerHTML, /admin-execution-apply-001/);
  assert.match(ui.identityContent.innerHTML, /approval-receipt-apply-001/);
  assert.match(ui.identityContent.innerHTML, /Rollback And Expiry History/);
  assert.match(ui.identityContent.innerHTML, /Grant must be removed after review window closes\./);
  assert.match(ui.identityContent.innerHTML, /Rollback Applied Change/);
  assert.match(ui.identityContent.innerHTML, /Expire Applied Grant/);
  assert.match(ui.identityContent.innerHTML, /Copy Rollback Receipt/);
  assert.match(ui.identityContent.innerHTML, /admin-receipt-apply-001/);
  assert.match(ui.identityContent.innerHTML, /admin-execution-apply-001/);
});

test("identityops page renders rolled-back receipt history once recovery is recorded", () => {
  const ui = { identityContent: { innerHTML: "" } };
  renderIdentityOpsPage(
    ui,
    {
      environment: "staging",
      viewState: {
        selectedAdminChangeId: "authority-change-rolled-back-001",
        queueItems: [
          {
            id: "authority-change-rolled-back-001",
            kind: "authority",
            label: "Authority Change Draft",
            requestedAction: "set project_admin",
            subjectId: "demo.operator",
            targetScope: "tenant-local / project-local",
            status: "rolled_back",
            reason: "Temporary admin coverage for investigation.",
            summary: "project_admin for demo.operator @ tenant-local / project-local",
            simulationSummary: "Preview only. This authority proposal requires GovernanceOps approval before a live authority mutation can execute.",
            createdAt: "2026-03-16T08:00:00Z",
            simulatedAt: "2026-03-16T08:05:00Z",
            updatedAt: "2026-03-16T08:20:00Z",
            routedAt: "2026-03-16T08:06:00Z",
            decision: {
              decisionId: "admin-decision-rolled-back-001",
              status: "approved",
              reason: "Approved for temporary response work.",
              decidedAt: "2026-03-16T08:07:00Z",
              approvalReceiptId: "approval-receipt-rolled-back-001",
              actorRef: "governance.reviewer"
            },
            execution: {
              executionId: "admin-execution-rolled-back-001",
              status: "applied",
              executedAt: "2026-03-16T08:10:00Z",
              summary: "Applied set project_admin for demo.operator at tenant-local / project-local.",
              actorRef: "demo.operator"
            },
            receipt: {
              receiptId: "admin-receipt-rolled-back-001",
              issuedAt: "2026-03-16T08:10:30Z",
              summary: "Applied set project_admin for demo.operator at tenant-local / project-local.",
              stableRef: "authority-change-rolled-back-001/admin-receipt-rolled-back-001",
              approvalReceiptId: "approval-receipt-rolled-back-001",
              executionId: "admin-execution-rolled-back-001"
            },
            rollback: {
              rollbackId: "admin-rollback-rolled-back-001",
              action: "rollback",
              status: "rolled_back",
              rolledBackAt: "2026-03-16T08:20:00Z",
              summary: "Rolled back set project_admin for demo.operator at tenant-local / project-local.",
              stableRef: "authority-change-rolled-back-001/admin-rollback-rolled-back-001",
              reason: "Response window closed; restore normal authority posture.",
              actorRef: "demo.operator",
              approvalReceiptId: "approval-receipt-rolled-back-001",
              adminReceiptId: "admin-receipt-rolled-back-001",
              executionId: "admin-execution-rolled-back-001"
            }
          }
        ]
      },
      identity: {
        authenticated: true,
        authEnabled: true,
        authorityBasis: "bearer_token_jwt",
        identity: {
          subject: "demo.operator"
        }
      }
    },
    {
      authenticated: true,
      claims: {
        sub: "demo.operator"
      }
    }
  );

  assert.match(ui.identityContent.innerHTML, /admin-rollback-rolled-back-001/);
  assert.match(ui.identityContent.innerHTML, /authority-change-rolled-back-001\/admin-rollback-rolled-back-001/);
  assert.match(ui.identityContent.innerHTML, /Response window closed; restore normal authority posture\./);
  assert.match(ui.identityContent.innerHTML, /Rolled back set project_admin for demo\.operator at tenant-local \/ project-local\./);
  assert.match(ui.identityContent.innerHTML, /Copy Rollback Receipt/);
});
