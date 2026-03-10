import test from "node:test";
import assert from "node:assert/strict";
import { buildChatTurnGovernanceReport, renderChat } from "../views/chat.js";
import { loadM19ParityFixture, buildChatThreadFromParityFixture } from "./m19-parity-fixture.js";

test("chat view renders parity fixture state from the native contract", async () => {
  const fixture = await loadM19ParityFixture();
  const thread = buildChatThreadFromParityFixture(fixture);
  const ui = { chatContent: { innerHTML: "" } };
  renderChat(
    ui,
    {
      integrations: {
        selectedAgentProfileId: "codex",
        agentProfiles: [{ id: "codex", label: "Codex" }]
      }
    },
    {
      thread,
      catalogs: {
        workerCapabilities: {
          items: [
            {
              executionMode: "managed_codex_worker",
              workerType: "managed_agent",
              adapterId: "codex",
              label: "Managed Codex Worker",
              provider: "agentops_gateway",
              transport: "responses_api",
              model: "gpt-5-codex",
              boundaryRequirements: ["agentops_gateway"]
            }
          ]
        },
        policyPacks: {
          items: [
            {
              packId: "enterprise-default",
              label: "Enterprise Default",
              clientSurfaces: ["chat"],
              applicableExecutionModes: ["managed_codex_worker"],
              applicableWorkerTypes: ["managed_agent"],
              applicableAdapterIDs: ["codex"],
              roleBundles: ["operator", "approver"],
              decisionSurfaces: ["approval", "tool_proposal"],
              reportingSurfaces: ["report", "json_export"],
              boundaryRequirements: ["agentops_gateway"]
            }
          ]
        }
      },
      history: {
        items: [
          {
            taskId: thread.taskId,
            title: fixture.task.title,
            status: fixture.task.status,
            sessionCount: 1,
            executionMode: "managed_codex_worker"
          }
        ],
        count: 1,
        archivedCount: 0,
        showArchived: false
      },
      agentProfileId: "codex",
      executionMode: "managed_codex_worker",
      status: "ready",
      message: "Loaded parity fixture state."
    }
  );

  assert.match(ui.chatContent.innerHTML, /Agent Workspace/);
  assert.match(ui.chatContent.innerHTML, /Managed Codex Worker/);
  assert.match(ui.chatContent.innerHTML, /Investigate checkout timeouts/);
  assert.match(ui.chatContent.innerHTML, /Tool proposal generated for shell execution\./);
  assert.match(ui.chatContent.innerHTML, /approval-1/);
  assert.match(ui.chatContent.innerHTML, /proposal-1/);
  assert.match(ui.chatContent.innerHTML, /Pending Decisions/);
  assert.match(ui.chatContent.innerHTML, /Approve Proposal/);
  assert.match(ui.chatContent.innerHTML, /Current Focus/);
  assert.match(ui.chatContent.innerHTML, /Resolve pending decisions first/);
  assert.match(ui.chatContent.innerHTML, /Enterprise Governance Report/);
  assert.match(ui.chatContent.innerHTML, /Copy Report/);
  assert.match(ui.chatContent.innerHTML, /enterprise-default: Enterprise Default/);
});

test("chat view renders governed export profile controls from the export-profile catalog", () => {
  const ui = { chatContent: { innerHTML: "" } };
  renderChat(
    ui,
    {
      integrations: {
        selectedAgentProfileId: "codex",
        agentProfiles: [{ id: "codex", label: "Codex" }]
      }
    },
    {
      thread: {
        taskId: "task-export-1",
        tenantId: "tenant-local",
        projectId: "project-local",
        turns: []
      },
      catalogs: {
        exportProfiles: {
          items: [
            {
              exportProfile: "operator_review",
              label: "Operator Review",
              reportTypes: ["review"],
              defaultAudience: "operator",
              allowedAudiences: ["operator", "security_review"],
              defaultRetentionClass: "standard",
              allowedRetentionClasses: ["standard", "archive"],
              audienceRetentionClassOverlays: { security_review: "archive" },
              clientSurfaces: ["chat"],
              deliveryChannels: ["copy", "report"],
              redactionMode: "structured_and_text"
            }
          ]
        }
      },
      exportSelection: {
        exportProfile: "operator_review",
        audience: "security_review"
      }
    }
  );

  assert.match(ui.chatContent.innerHTML, /Governed Export Profile/);
  assert.match(ui.chatContent.innerHTML, /data-chat-export-field="exportProfile"/);
  assert.match(ui.chatContent.innerHTML, /data-chat-export-field="audience"/);
  assert.match(ui.chatContent.innerHTML, /data-chat-export-field="retentionClass"/);
  assert.match(ui.chatContent.innerHTML, /retention=archive/);
  assert.match(ui.chatContent.innerHTML, /overlays=security_review =&gt; archive/);
});

test("chat governed report includes active org-admin review metadata from approval checkpoints", () => {
  const report = buildChatTurnGovernanceReport(
    {
      taskId: "task-org-admin-1",
      requestId: "request-org-admin-1",
      response: {
        sessionId: "session-org-admin-1",
        executionMode: "managed_codex_worker"
      },
      sessionView: {
        timeline: {
          task: { taskId: "task-org-admin-1", status: "RUNNING" },
          session: { sessionId: "session-org-admin-1", status: "AWAITING_APPROVAL" },
          selectedWorker: { workerId: "worker-1", workerType: "managed_agent", adapterId: "codex", status: "ATTACHED" },
          approvalCheckpoints: [
            {
              checkpointId: "approval-org-admin-1",
              status: "PENDING",
              reason: "Delegated admin scope review is required before rollout.",
              annotations: {
                orgAdminDecisionBinding: {
                  profileId: "centralized_enterprise_admin",
                  profileLabel: "Centralized Enterprise Admin",
                  organizationModel: "centralized_enterprise",
                  bindingId: "centralized_enterprise_admin_delegated_admin_binding",
                  bindingLabel: "Centralized Enterprise Admin Delegated Admin Decision Binding",
                  category: "delegated_admin",
                  bindingMode: "delegated_admin_scope_review",
                  selectedRoleBundle: "enterprise.tenant_admin",
                  selectedDirectorySyncMappings: ["centralized_enterprise_admin_directory_sync_mapping"],
                  selectedExceptionProfiles: ["centralized_enterprise_admin_residency_exception"],
                  selectedOverlayProfiles: ["centralized_enterprise_admin_quota_overlay"],
                  requiredInputs: ["idp_group", "tenant_id"],
                  requestedInputKeys: ["idp_group", "tenant_id"],
                  decisionSurfaces: ["policy_pack_assignment"],
                  boundaryRequirements: ["runtime_authz"]
                }
              }
            }
          ],
          toolActions: [],
          evidenceRecords: [],
          events: []
        },
        streamItems: []
      }
    },
    {
      orgAdminProfiles: {
        items: [
          {
            profileId: "centralized_enterprise_admin",
            label: "Centralized Enterprise Admin",
            organizationModel: "centralized_enterprise",
            adminRoleBundles: ["enterprise.org_admin"],
            delegatedAdminRoleBundles: ["enterprise.tenant_admin"],
            breakGlassRoleBundles: ["enterprise.break_glass_admin"],
            decisionBindings: [
              {
                bindingId: "centralized_enterprise_admin_delegated_admin_binding",
                label: "Centralized Enterprise Admin Delegated Admin Decision Binding",
                category: "delegated_admin",
                bindingMode: "delegated_admin_scope_review",
                hookIds: ["delegated_admin_scope_guard"],
                directorySyncMappings: ["centralized_enterprise_admin_directory_sync_mapping"],
                exceptionProfiles: ["centralized_enterprise_admin_residency_exception"],
                overlayProfiles: ["centralized_enterprise_admin_quota_overlay"],
                roleBundles: ["enterprise.tenant_admin"],
                requiredInputs: ["idp_group", "tenant_id"],
                decisionSurfaces: ["policy_pack_assignment"],
                boundaryRequirements: ["runtime_authz"]
              }
            ],
            directorySyncMappings: [
              { mappingId: "centralized_enterprise_admin_directory_sync_mapping", label: "Centralized Enterprise Admin Directory Sync Mapping" }
            ],
            exceptionProfiles: [
              { profileId: "centralized_enterprise_admin_residency_exception", label: "Centralized Enterprise Admin Residency Exception" }
            ],
            overlayProfiles: [
              { overlayId: "centralized_enterprise_admin_quota_overlay", label: "Centralized Enterprise Admin Quota Overlay" }
            ],
            clientSurfaces: ["chat"]
          }
        ]
      }
    }
  );

  assert.ok(report.details.some((item) => item.includes("Org-admin decision binding:")));
  assert.ok(report.actionHints.some((item) => item.includes("pending org-admin decision reviews")));
  assert.ok(report.applicableOrgAdmins.includes("centralized_enterprise_admin: Centralized Enterprise Admin"));
});

test("chat view renders an operator-grade first-run live empty state", () => {
  const ui = { chatContent: { innerHTML: "" } };
  renderChat(
    ui,
    {
      mockMode: false,
      integrations: {
        selectedAgentProfileId: "openai",
        agentProfiles: [{ id: "openai", label: "OpenAI" }]
      }
    },
    {
      thread: {
        tenantId: "tenant-demo",
        projectId: "project-core",
        turns: []
      },
      history: {
        source: "runtime",
        count: 0,
        archivedCount: 0,
        showArchived: false,
        message: "No native operator chat threads exist yet for the current scope.",
        items: []
      },
      catalogs: {
        source: "endpoint-unavailable",
        message: "Enterprise governance catalogs are unavailable in the current live runtime."
      }
    }
  );

  assert.match(ui.chatContent.innerHTML, /No governed chat threads exist yet|Live runtime contract is incomplete for Chat history/);
  assert.match(ui.chatContent.innerHTML, /tenant=tenant-demo; project=project-core/);
  assert.match(ui.chatContent.innerHTML, /expected on first live load/i);
  assert.match(ui.chatContent.innerHTML, /Start Thread/);
  assert.match(ui.chatContent.innerHTML, /local-runtime launcher/i);
});

test("chat composer explains system instructions versus the turn prompt", () => {
  const ui = { chatContent: { innerHTML: "" } };
  renderChat(
    ui,
    {
      integrations: {
        selectedAgentProfileId: "codex",
        agentProfiles: [{ id: "codex", label: "Codex" }]
      }
    },
    {
      history: {
        items: [],
        count: 0,
        archivedCount: 0,
        showArchived: false,
        message: "",
        source: "runtime"
      }
    }
  );

  assert.match(ui.chatContent.innerHTML, /System Instructions/);
  assert.match(ui.chatContent.innerHTML, /durable guidance/i);
  assert.match(ui.chatContent.innerHTML, /Turn Prompt/);
  assert.match(ui.chatContent.innerHTML, /specific request/i);
});
