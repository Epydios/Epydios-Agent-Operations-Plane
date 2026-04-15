import test from "node:test";
import assert from "node:assert/strict";
import { buildChatTurnGovernanceReport, renderChat } from "../views/chat.js";
import { createAimxsDecisionBindingSpine } from "../shared/aimxs/decision-binding.js";
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
      message: "Loaded parity fixture state.",
      aimxsDecisionBindingSpine: createAimxsDecisionBindingSpine({
        activeDomain: "agentops",
        sourceLabel: "correlated run",
        correlationRef: "run-parity-001",
        runId: "run-parity-001",
        approvalId: "approval-1",
        actorRef: "demo.operator",
        subjectRef: "task-parity-001",
        authorityRef: "codex",
        authorityBasis: "bearer_token_jwt",
        scopeRef: "tenant-demo / project-demo",
        providerRef: "enterprise-default",
        routeRef: "managed_codex_worker",
        boundaryRef: "agentops_gateway",
        grantRef: "approval-1",
        decisionStatus: "PENDING",
        receiptRef: "approval-receipt-parity-001",
        stableRef: "stable://run-parity-001",
        replayRef: "run-parity-001",
        sessionRef: "session-parity-001",
        taskRef: "task-parity-001",
        evidenceRefs: ["evidence://thread/parity/001"],
        auditRefs: ["approval.reviewed@2026-03-10T14:00:00Z"],
        summary: "Correlated decision drill-in for the active thread."
      })
    }
  );

  const html = ui.chatContent.innerHTML;

  assert.match(html, /AgentOps/);
  assert.match(html, /Active Governed Work/);
  assert.match(html, /Thread Review And Proof/);
  assert.match(html, /Managed Codex Worker/);
  assert.match(html, /Investigate checkout timeouts/);
  assert.match(html, /Tool proposal generated for shell execution\./);
  assert.match(html, /approval-1/);
  assert.match(html, /proposal-1/);
  assert.match(html, /Pending Decisions/);
  assert.match(html, /Approve Proposal/);
  assert.match(html, /Thread Header/);
  assert.match(html, /Transcript Workspace/);
  assert.match(html, /Anchored Composer/);
  assert.match(html, /Thread Title/);
  assert.match(html, /Agent Profile/);
  assert.match(html, /Execution Path/);
  assert.match(html, /Thread Intent/);
  assert.match(html, /Routed Thread Flow/);
  assert.match(html, /Current stage:/);
  assert.match(html, /Next Truthful Action/);
  assert.match(html, /Review 2 approval checkpoints/);
  assert.match(html, /Approval Context Drawer/);
  assert.match(html, /Decision Record/);
  assert.match(html, /Correlated Decision Drill-In/);
  assert.match(html, /Decision Lifecycle/);
  assert.match(html, /Authority Chain/);
  assert.match(html, /Grant Chain/);
  assert.match(html, /Receipt Chain/);
  assert.match(html, /Replay Chain/);
  assert.match(html, /Evidence Chain/);
  assert.match(html, /data-aimxs-spine-action="open-workspace"/);
  assert.match(html, /Decision Record/);
  assert.match(html, /Evidence And Trace Refs/);
  assert.match(html, /Pinned Approval Review/);
  assert.match(html, /Pin Approval Checkpoints/);
  assert.match(html, /Pin Tool Proposals/);
  assert.match(html, /Pin Governance Receipt/);
  assert.match(html, /Pin Decision History/);
  assert.match(html, /Run And Artifact Context/);
  assert.match(html, /Execution Proof/);
  assert.match(html, /Artifact And Evidence Drill-In/);
  assert.match(html, /Pin Latest Tool Action/);
  assert.match(html, /Pin Latest Evidence/);
  assert.match(html, /Pin Managed Transcript/);
  assert.match(html, /Latest Tool Action Drill-In/);
  assert.match(html, /Latest Evidence Drill-In/);
  assert.match(html, /Managed Transcript Anchor/);
  assert.match(html, /Latest Tool Action/);
  assert.match(html, /Latest Evidence/);
  assert.match(html, /Latest Event/);
  assert.match(html, /Latest Reply/);
  assert.match(html, /Resolve pending decisions first/);
  assert.match(html, /Enterprise Governance Report/);
  assert.match(html, /Copy Report/);
  assert.match(html, /enterprise-default: Enterprise Default/);
  assert.ok(html.indexOf("Thread Header") < html.indexOf("Anchored Composer"));
  assert.ok(html.indexOf("Anchored Composer") < html.indexOf("Transcript Workspace"));
  assert.doesNotMatch(html, /Thread Overview/);
  assert.doesNotMatch(html, /Launch Worker/);
  assert.doesNotMatch(html, /Refresh Reply/);
});

test("chat view surfaces governed action proposals and linked run detail from the same thread", () => {
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
      agentProfileId: "codex",
      executionMode: "managed_codex_worker",
      thread: {
        taskId: "task-governed-chat-1",
        tenantId: "tenant-demo",
        projectId: "project-demo",
        turns: [
          {
            requestId: "request-governed-chat-1",
            taskId: "task-governed-chat-1",
            prompt: "Place a paper trade for 25 AAPL shares in the paper-main account.",
            response: {
              sessionId: "session-governed-chat-1",
              outputText: "I translated the request into a governed paper-trade action for review.",
              route: "managed-worker-bridge",
              boundaryProviderId: "agentops_gateway",
              completedAt: "2026-03-10T14:00:00Z"
            },
            sessionView: {
              timeline: {
                task: {
                  taskId: "task-governed-chat-1",
                  status: "IN_PROGRESS"
                },
                session: {
                  sessionId: "session-governed-chat-1",
                  status: "RUNNING"
                },
                selectedWorker: {
                  workerId: "worker-governed-chat-1",
                  workerType: "managed_agent",
                  adapterId: "codex",
                  status: "RUNNING"
                },
                approvalCheckpoints: [],
                toolActions: [
                  {
                    toolActionId: "tool-action-governed-chat-1",
                    toolType: "governed_action_request",
                    status: "COMPLETED",
                    workerId: "worker-governed-chat-1",
                    source: "runtime.tool-proposal-decision",
                    requestPayload: {
                      proposalId: "proposal-governed-chat-1",
                      operatorApprovalRequired: false,
                      reviewMode: "policy_first_auto"
                    },
                    resultPayload: {
                      decision: "AUTO",
                      reviewMode: "policy_first_auto",
                      governedRun: {
                        runId: "run-governed-chat-1",
                        status: "COMPLETED",
                        policyDecision: "DEFER",
                        selectedPolicyProvider: "aimxs-full",
                        policyGrantTokenPresent: false,
                        policyResponse: {
                          decision: "DEFER",
                          reasons: [
                            {
                              code: "grant_missing",
                              message: "Supervisor trading grant is still required."
                            }
                          ]
                        }
                      }
                    }
                  }
                ],
                evidenceRecords: [],
                events: [
                  {
                    eventId: "event-governed-generated-1",
                    sessionId: "session-governed-chat-1",
                    sequence: 20,
                    eventType: "tool_proposal.generated",
                    timestamp: "2026-03-10T14:00:01Z",
                    payload: {
                      proposalId: "proposal-governed-chat-1",
                      proposalType: "governed_action_request",
                      workerId: "worker-governed-chat-1",
                      summary: "Managed Codex proposed a governed paper trade request.",
                      payload: {
                        type: "governed_action_request",
                        summary: "BUY 25 AAPL in paper account paper-main",
                        requestLabel: "Paper Trade Request: AAPL",
                        requestSummary: "BUY 25 AAPL in paper account paper-main",
                        demoProfile: "finance_paper_trade",
                        actionType: "trade.execute",
                        resourceKind: "broker-order",
                        resourceName: "paper-order-aapl",
                        boundaryClass: "external_actuator",
                        riskTier: "high",
                        requiredGrants: ["grant.trading.supervisor"],
                        evidenceReadiness: "PARTIAL",
                        operatorApprovalRequired: false,
                        handshakeRequired: true,
                        financeOrder: {
                          symbol: "AAPL",
                          side: "buy",
                          quantity: 25,
                          account: "paper-main"
                        }
                      }
                    }
                  },
                  {
                    eventId: "event-governed-decided-1",
                    sessionId: "session-governed-chat-1",
                    sequence: 22,
                    eventType: "tool_proposal.decided",
                    timestamp: "2026-03-10T14:00:05Z",
                    payload: {
                      proposalId: "proposal-governed-chat-1",
                      proposalType: "governed_action_request",
                      workerId: "worker-governed-chat-1",
                      decision: "AUTO",
                      status: "DEFERRED",
                      reason: "Supervisor trading grant is still required.",
                      toolActionId: "tool-action-governed-chat-1",
                      actionStatus: "COMPLETED",
                      runId: "run-governed-chat-1",
                      runStatus: "COMPLETED",
                      policyDecision: "DEFER",
                      selectedPolicyProvider: "aimxs-full",
                      operatorApprovalRequired: false
                    }
                  }
                ]
              },
              streamItems: []
            }
          }
        ]
      }
    }
  );

  assert.match(ui.chatContent.innerHTML, /Paper Trade Request: AAPL/);
  assert.match(ui.chatContent.innerHTML, /BUY 25 AAPL in paper account paper-main/);
  assert.match(ui.chatContent.innerHTML, /grant\.trading\.supervisor/);
  assert.match(ui.chatContent.innerHTML, /aimxs-full/);
  assert.match(ui.chatContent.innerHTML, /Open Run Detail/);
  assert.match(ui.chatContent.innerHTML, /Run And Artifact Context/);
  assert.match(ui.chatContent.innerHTML, /Execution Proof/);
  assert.match(ui.chatContent.innerHTML, /Artifact And Evidence Drill-In/);
  assert.match(ui.chatContent.innerHTML, /Open Active Run/);
  assert.match(ui.chatContent.innerHTML, /Pin Tool Proposals/);
  assert.match(ui.chatContent.innerHTML, /Pin Governance Receipt/);
  assert.match(ui.chatContent.innerHTML, /Pin Decision History/);
  assert.doesNotMatch(ui.chatContent.innerHTML, /Pin Approval Checkpoints/);
  assert.match(ui.chatContent.innerHTML, /Pin Latest Tool Action/);
  assert.match(ui.chatContent.innerHTML, /Latest Tool Action Drill-In/);
  assert.match(ui.chatContent.innerHTML, /session=session-governed-chat-1/);
  assert.match(ui.chatContent.innerHTML, /run=run-governed-chat-1/);
  assert.match(ui.chatContent.innerHTML, /Latest Tool Action/);
  assert.match(ui.chatContent.innerHTML, /Latest Event/);
  assert.match(ui.chatContent.innerHTML, /tool_proposal\.decided/);
  assert.match(ui.chatContent.innerHTML, /Governed Run Result/);
  assert.match(ui.chatContent.innerHTML, /Latest Policy Outcome/);
  assert.match(ui.chatContent.innerHTML, /operatorGate=policy-first/);
  assert.match(ui.chatContent.innerHTML, /chip chip-warn chip-compact">effect=execution deferred/);
  assert.match(ui.chatContent.innerHTML, /effect=execution deferred/);
  assert.match(ui.chatContent.innerHTML, /deferred the request\./);
});

test("chat view keeps governed export profile controls off the primary agent surface", () => {
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

  assert.doesNotMatch(ui.chatContent.innerHTML, /Governed Export Profile/);
  assert.doesNotMatch(ui.chatContent.innerHTML, /data-chat-export-field="exportProfile"/);
  assert.doesNotMatch(ui.chatContent.innerHTML, /data-chat-export-field="audience"/);
  assert.doesNotMatch(ui.chatContent.innerHTML, /data-chat-export-field="retentionClass"/);
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
  assert.match(ui.chatContent.innerHTML, /Prompt/);
  assert.match(ui.chatContent.innerHTML, /Anchored Composer/);
});

test("latest policy outcome only reflects the newest turn", () => {
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
      agentProfileId: "codex",
      executionMode: "managed_codex_worker",
      thread: {
        taskId: "task-latest-policy-outcome",
        tenantId: "tenant-demo",
        projectId: "project-demo",
        turns: [
          {
            sessionView: {
              timeline: {},
              streamItems: [],
              source: "timeline",
              toolProposals: [
                {
                  type: "governed_action_request",
                  requestLabel: "Delete Production Config",
                  policyDecision: "DENY",
                  selectedPolicyProvider: "aimxs-full"
                }
              ]
            }
          },
          {
            sessionView: {
              timeline: {},
              streamItems: [],
              source: "timeline",
              toolProposals: []
            }
          }
        ]
      },
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

  assert.match(ui.chatContent.innerHTML, /Latest Policy Outcome: the latest turn has not recorded a governed policy result yet\./);
  assert.doesNotMatch(ui.chatContent.innerHTML, /Delete Production Config/);
});

test("latest reply prefers the fuller stored assistant response over truncated activity text", () => {
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
        taskId: "task-reply-1",
        tenantId: "tenant-demo",
        projectId: "project-core",
        turns: [
          {
            response: {
              sessionId: "session-reply-1",
              outputText: "Paragraph one.\n\nParagraph two.\n\nParagraph three."
            },
            sessionView: {
              timeline: {
                session: {
                  sessionId: "session-reply-1",
                  status: "COMPLETED"
                }
              },
              streamItems: [
                {
                  eventType: "worker.message",
                  payload: {
                    text: "Paragraph three."
                  }
                }
              ]
            }
          }
        ]
      },
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

  assert.match(ui.chatContent.innerHTML, /Paragraph one\./);
  assert.match(ui.chatContent.innerHTML, /Paragraph two\./);
  assert.match(ui.chatContent.innerHTML, /Paragraph three\./);
});
