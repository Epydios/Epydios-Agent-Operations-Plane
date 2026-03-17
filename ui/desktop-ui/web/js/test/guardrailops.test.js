import test from "node:test";
import assert from "node:assert/strict";
import { renderGuardrailOpsEmptyState, renderGuardrailOpsPage } from "../domains/guardrailops/routes.js";

test("guardrailops page renders the first inspect-only guardrail boards", () => {
  const ui = { guardrailOpsContent: { innerHTML: "" } };
  renderGuardrailOpsPage(ui, {
    settings: {
      terminal: {
        mode: "interactive_sandbox_only",
        restrictedHostMode: "blocked"
      },
      integrations: {
        providerContracts: [
          {
            profileId: "codex",
            label: "OpenAI Codex",
            provider: "openai_compatible",
            transport: "responses_api",
            model: "gpt-5-codex",
            credentialScope: "project",
            selected: true
          }
        ]
      },
      policyCatalog: {
        items: [
          {
            packId: "managed_codex_worker_operator",
            boundaryRequirements: ["tenant_project_scope", "runtime_authz", "governed_export_redaction"]
          }
        ]
      }
    },
    runs: {
      items: [
        {
          runId: "run-20260314-guardrail-001",
          tenantId: "tenant-demo",
          projectId: "project-core",
          status: "POLICY_EVALUATED",
          policyDecision: "ALLOW",
          policyGrantTokenPresent: false,
          selectedDesktopProvider: "oss-desktop-openfang-linux",
          requestPayload: {
            meta: {
              tenantId: "tenant-demo",
              projectId: "project-core"
            },
            desktop: {
              targetOS: "linux",
              targetExecutionProfile: "sandbox_vm_autonomous",
              requestedCapabilities: [
                "observe.window_metadata",
                "actuate.window_focus",
                "verify.post_action_state"
              ],
              requiredVerifierIds: ["V-M13-LNX-001", "V-M13-LNX-002"],
              restrictedHostOptIn: false
            }
          },
          updatedAt: "2026-03-14T20:30:00Z"
        }
      ]
    },
    approvals: {
      items: [
        {
          approvalId: "approval-run-20260314-guardrail-001",
          runId: "run-20260314-guardrail-001",
          tier: 3,
          status: "PENDING",
          targetOS: "linux",
          targetExecutionProfile: "sandbox_vm_autonomous",
          requestedCapabilities: [
            "observe.window_metadata",
            "actuate.window_focus",
            "verify.post_action_state"
          ],
          reason: "Awaiting operator approval and policy grant token for Tier-3 execution.",
          createdAt: "2026-03-14T20:31:00Z",
          expiresAt: "2026-03-14T20:46:00Z"
        }
      ]
    },
    runtimeWorkerCapabilities: {
      source: "worker-capability-endpoint",
      count: 2,
      items: [
        {
          label: "Managed Codex Worker",
          workerType: "managed_agent",
          provider: "codex",
          transport: "wss",
          model: "gpt-5-codex",
          boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission"]
        },
        {
          label: "Governed Local Tools",
          workerType: "managed_agent",
          provider: "desktop",
          transport: "local",
          model: "tool-router",
          boundaryRequirements: ["governed_tool_execution", "audit_emission"]
        }
      ]
    },
    exportProfiles: {
      items: [
        {
          exportProfile: "audit_export",
          label: "Audit Export",
          clientSurfaces: ["desktop"],
          deliveryChannels: ["download", "copy", "preview"],
          redactionMode: "structured_and_text"
        },
        {
          exportProfile: "audit_handoff",
          label: "Audit Handoff",
          clientSurfaces: ["desktop"],
          deliveryChannels: ["copy", "preview"],
          redactionMode: "text"
        }
      ]
    },
    orgAdminProfiles: {
      items: [
        {
          profileId: "centralized_enterprise_admin",
          label: "Centralized Enterprise Admin",
          breakGlassRoleBundles: ["enterprise.break_glass_admin", "enterprise.break_glass_auditor"],
          decisionSurfaces: ["break_glass_activation", "quota_override"],
          enforcementProfiles: [
            {
              hookId: "delegated_admin_scope_guard",
              label: "Delegated Admin Scope Guard",
              category: "delegated_admin",
              enforcementMode: "scope_guard"
            },
            {
              hookId: "break_glass_timebox",
              label: "Break-Glass Timebox",
              category: "break_glass",
              enforcementMode: "timeboxed_elevation"
            },
            {
              hookId: "org_quota_override_approval",
              label: "Org Quota Override Approval",
              category: "quota",
              enforcementMode: "approval_required"
            }
          ],
          overlayProfiles: [
            {
              overlayId: "centralized_enterprise_admin_quota_overlay",
              label: "Centralized Enterprise Admin Quota Overlay",
              category: "quota",
              overlayMode: "quota_override_review",
              targetDimensions: ["organization", "tenant", "project"],
              requiredInputs: ["tenant_id", "project_id", "environment"],
              decisionSurfaces: ["quota_override"],
              boundaryRequirements: ["org_quota_metering", "runtime_authz"]
            }
          ]
        }
      ]
    },
    viewState: {
      feedback: {
        tone: "ok",
        message: "Rollback recorded for guardrailops admin proposal guardrail-change-001. Recovery receipt admin-rollback-guardrail-001 is now available."
      },
      selectedAdminChangeId: "guardrail-change-001",
      recoveryReason: "Return tenant-demo / project-core to governed posture after the bounded acceptance run.",
      guardrailDraft: {
        changeKind: "tighten",
        targetScope: "tenant-demo / project-core",
        executionProfile: "sandbox_vm_autonomous",
        safetyBoundary: "tenant_project_scope",
        proposedState: "approval_required",
        reason: "Keep sandbox actuation scoped while approvals remain pending."
      },
      queueItems: [
        {
          id: "guardrail-change-001",
          ownerDomain: "guardrailops",
          kind: "guardrail",
          label: "Guardrail Change Draft",
          requestedAction: "tighten approval_required",
          subjectId: "sandbox_vm_autonomous",
          subjectLabel: "profile",
          targetScope: "tenant-demo / project-core",
          targetLabel: "scope",
          changeKind: "tighten",
          executionProfile: "sandbox_vm_autonomous",
          safetyBoundary: "tenant_project_scope",
          proposedState: "approval_required",
          status: "rolled_back",
          reason: "Keep sandbox actuation scoped while approvals remain pending.",
          summary: "tighten approval_required for tenant-demo / project-core @ sandbox_vm_autonomous",
          simulationSummary: "Preview only. This tighten guardrail proposal requires GovernanceOps approval before any live guardrail change can execute.",
          updatedAt: "2026-03-16T22:10:00Z",
          routedAt: "2026-03-16T22:11:00Z",
          decision: {
            decisionId: "admin-decision-guardrail-001",
            status: "approved",
            reason: "Guardrail change is bounded to tenant-demo / project-core and may proceed.",
            decidedAt: "2026-03-16T22:12:00Z",
            approvalReceiptId: "approval-receipt-guardrail-001",
            actorRef: "governance-reviewer"
          },
          execution: {
            executionId: "admin-execution-guardrail-001",
            executedAt: "2026-03-16T22:13:00Z",
            status: "applied",
            summary: "tighten approval_required applied for tenant-demo / project-core on sandbox_vm_autonomous.",
            actorRef: "guardrail-operator"
          },
          receipt: {
            receiptId: "admin-receipt-guardrail-001",
            issuedAt: "2026-03-16T22:13:00Z",
            summary: "tighten approval_required applied for tenant-demo / project-core on sandbox_vm_autonomous.",
            stableRef: "guardrail-change-001/admin-receipt-guardrail-001",
            approvalReceiptId: "approval-receipt-guardrail-001",
            executionId: "admin-execution-guardrail-001"
          },
          rollback: {
            rollbackId: "admin-rollback-guardrail-001",
            action: "rollback",
            status: "rolled_back",
            rolledBackAt: "2026-03-16T22:14:00Z",
            summary: "Rolled back tighten approval_required for tenant-demo / project-core on sandbox_vm_autonomous.",
            stableRef: "guardrail-change-001/admin-rollback-guardrail-001",
            reason: "Return tenant-demo / project-core to governed posture after the bounded acceptance run.",
            actorRef: "guardrail-operator",
            approvalReceiptId: "approval-receipt-guardrail-001",
            adminReceiptId: "admin-receipt-guardrail-001",
            executionId: "admin-execution-guardrail-001"
          }
        }
      ],
      latestSimulation: {
        changeId: "guardrail-change-001",
        kind: "guardrail",
        tone: "warn",
        title: "Guardrail admin dry-run",
        summary: "Preview only. This tighten guardrail proposal requires GovernanceOps approval before any live guardrail change can execute.",
        updatedAt: "2026-03-16T22:09:00Z",
        facts: [
          { label: "scope", value: "tenant-demo / project-core", code: true },
          { label: "profile", value: "sandbox_vm_autonomous", code: true },
          { label: "boundary", value: "tenant_project_scope", code: true },
          { label: "state", value: "approval_required", code: true }
        ],
        findings: [
          "Execution remains blocked in this slice. GovernanceOps approval is required before any live guardrail change can execute.",
          "Existing pending approvals mean guardrail changes will land on an already constrained execution surface."
        ]
      }
    }
  });

  assert.match(ui.guardrailOpsContent.innerHTML, /data-domain-root="guardrailops"/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Admin Change Queue/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Guardrail Change Draft/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Execution Scope And Safety Boundary/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Impact Preview/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Governance Route And Receipt/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Rollback And History/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Guardrail Posture/);
  assert.match(ui.guardrailOpsContent.innerHTML, /AIMXS Identity And Posture/);
  assert.match(ui.guardrailOpsContent.innerHTML, /desktop execution posture/);
  assert.match(ui.guardrailOpsContent.innerHTML, /approval gate \+ runtime policy/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Current Posture/);
  assert.match(ui.guardrailOpsContent.innerHTML, /approval required|interactive_sandbox_only/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Target Posture/);
  assert.match(ui.guardrailOpsContent.innerHTML, /tenant-demo \/ project-core/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Allowed Or Blocked/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Sandbox And Capability/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Quota And Timeout/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Kill Switch/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Redaction And Transport Guards/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Break-Glass Posture/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Execution Gates/);
  assert.match(ui.guardrailOpsContent.innerHTML, /interactive_sandbox_only/);
  assert.match(ui.guardrailOpsContent.innerHTML, /sandbox_vm_autonomous/);
  assert.match(ui.guardrailOpsContent.innerHTML, /run-20260314-guardrail-001/);
  assert.match(ui.guardrailOpsContent.innerHTML, /tenant-demo/);
  assert.match(ui.guardrailOpsContent.innerHTML, /project-core/);
  assert.match(ui.guardrailOpsContent.innerHTML, /requested=3/);
  assert.match(ui.guardrailOpsContent.innerHTML, /worker-capability-endpoint/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Managed Codex Worker/);
  assert.match(ui.guardrailOpsContent.innerHTML, /gpt-5-codex/);
  assert.match(ui.guardrailOpsContent.innerHTML, /approval-run-20260314-guardrail-001/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Awaiting operator approval and policy grant token/);
  assert.match(ui.guardrailOpsContent.innerHTML, /scope guards=1/);
  assert.match(ui.guardrailOpsContent.innerHTML, /break-glass=1/);
  assert.match(ui.guardrailOpsContent.innerHTML, /grant token/);
  assert.match(ui.guardrailOpsContent.innerHTML, /redaction/);
  assert.match(ui.guardrailOpsContent.innerHTML, /quota=1/);
  assert.match(ui.guardrailOpsContent.innerHTML, /timeboxed=1/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Centralized Enterprise Admin Quota Overlay/);
  assert.match(ui.guardrailOpsContent.innerHTML, /quota_override_review/);
  assert.match(ui.guardrailOpsContent.innerHTML, /15 min/);
  assert.match(ui.guardrailOpsContent.innerHTML, /restricted=blocked/);
  assert.match(ui.guardrailOpsContent.innerHTML, /approval hold/);
  assert.match(ui.guardrailOpsContent.innerHTML, /hard-stops=2/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Audit Export/);
  assert.match(ui.guardrailOpsContent.innerHTML, /structured_and_text/);
  assert.match(ui.guardrailOpsContent.innerHTML, /responses_api/);
  assert.match(ui.guardrailOpsContent.innerHTML, /OpenAI Codex/);
  assert.match(ui.guardrailOpsContent.innerHTML, /enterprise.break_glass_admin/);
  assert.match(ui.guardrailOpsContent.innerHTML, /break_glass_activation/);
  assert.match(ui.guardrailOpsContent.innerHTML, /guardrail-change-001/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Save Draft/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Run Dry-Run/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Route To Governance/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Open GovernanceOps/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Apply Approved Change/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Copy Governance Receipt/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Copy Admin Receipt/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Rollback Applied Change/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Copy Rollback Receipt/);
  assert.match(ui.guardrailOpsContent.innerHTML, /apply-gated/);
  assert.match(ui.guardrailOpsContent.innerHTML, /approval_required/);
  assert.match(ui.guardrailOpsContent.innerHTML, /approval-receipt-guardrail-001/);
  assert.match(ui.guardrailOpsContent.innerHTML, /admin-receipt-guardrail-001/);
  assert.match(ui.guardrailOpsContent.innerHTML, /admin-rollback-guardrail-001/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Return tenant-demo \/ project-core to governed posture/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Keep sandbox actuation scoped while approvals remain pending/);
});

test("guardrailops empty state renders without loaded guardrail context", () => {
  const ui = { guardrailOpsContent: { innerHTML: "" } };
  renderGuardrailOpsEmptyState(ui, {
    title: "GuardrailOps",
    message: "Guardrail posture becomes available after runtime, policy, and governance signals load."
  });

  assert.match(ui.guardrailOpsContent.innerHTML, /GuardrailOps/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Guardrail posture becomes available/);
});
