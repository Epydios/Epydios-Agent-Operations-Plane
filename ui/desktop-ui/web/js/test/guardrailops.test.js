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
    }
  });

  assert.match(ui.guardrailOpsContent.innerHTML, /data-domain-root="guardrailops"/);
  assert.match(ui.guardrailOpsContent.innerHTML, /Guardrail Posture/);
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
