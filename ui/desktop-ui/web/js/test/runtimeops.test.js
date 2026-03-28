import test from "node:test";
import assert from "node:assert/strict";
import { renderRuntimeOpsEmptyState, renderRuntimeOpsPage } from "../domains/runtimeops/routes.js";

test("runtimeops page renders the first inspect-only runtime boards", () => {
  const ui = { runtimeOpsContent: { innerHTML: "" } };
  renderRuntimeOpsPage(
    ui,
    {
      health: {
        runtime: { status: "ok", detail: "Runtime API reachable." },
        providers: { status: "warn", detail: "One provider is degraded." },
        policy: { status: "ok", detail: "Policy evaluation reachable." }
      },
      pipeline: {
        status: "pass",
        latestStagingGate: "staging-full-gate-20260314T040000Z.log",
        latestProdGate: "prod-full-gate-20260314T041500Z.log"
      },
      providers: {
        items: [
          { providerId: "oss-profile-static", ready: true, probed: true },
          { providerId: "aimxs-policy-primary", ready: true, probed: true },
          { providerId: "oss-desktop-openfang-linux", ready: false, probed: true }
        ]
      },
      approvals: {
        count: 1,
        items: [{ approvalId: "approval-run-20260314-001", status: "PENDING" }]
      },
      runtimeSessions: {
        source: "runtime-session-endpoint",
        count: 3,
        items: [
          {
            sessionId: "session-20260314-003",
            taskId: "task-20260314-003",
            sessionType: "interactive",
            status: "RUNNING",
            selectedWorkerId: "worker-managed-codex-01",
            updatedAt: "2026-03-14T04:21:00Z"
          },
          {
            sessionId: "session-20260314-002",
            taskId: "task-20260314-002",
            sessionType: "interactive",
            status: "AWAITING_APPROVAL",
            selectedWorkerId: "worker-managed-codex-02",
            updatedAt: "2026-03-14T04:19:00Z"
          },
          {
            sessionId: "session-20260314-001",
            taskId: "task-20260314-001",
            sessionType: "batch",
            status: "COMPLETED",
            selectedWorkerId: "worker-model-01",
            updatedAt: "2026-03-14T04:11:00Z"
          }
        ]
      },
      runtimeWorkerCapabilities: {
        source: "worker-capability-endpoint",
        count: 3,
        items: [
          {
            label: "Managed Codex Worker",
            executionMode: "managed_codex_worker",
            workerType: "managed_agent",
            adapterId: "codex",
            provider: "codex",
            transport: "wss",
            model: "gpt-5-codex",
            boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission"]
          },
          {
            label: "Raw Model Invoke",
            executionMode: "raw_model_invoke",
            workerType: "model_invoke",
            adapterId: "openai-responses",
            provider: "openai",
            transport: "https",
            model: "gpt-5.4",
            boundaryRequirements: ["tenant_project_scope", "runtime_authz"]
          },
          {
            label: "Governed Local Tools",
            executionMode: "managed_codex_worker",
            workerType: "managed_agent",
            adapterId: "local-tools",
            provider: "desktop",
            transport: "local",
            model: "tool-router",
            boundaryRequirements: ["governed_tool_execution", "audit_emission"]
          }
        ]
      },
      runtimeIdentity: {
        source: "runtime-identity-endpoint",
        authEnabled: true,
        authenticated: true,
        authorityBasis: "bearer_token_jwt",
        policyMatrixRequired: true,
        policyRuleCount: 6,
        roleClaim: "roles",
        clientIdClaim: "client_id",
        tenantClaim: "tenant_id",
        projectClaim: "project_id",
        identity: {
          subject: "demo.operator",
          clientId: "epydiosops-desktop-local",
          roles: ["runtime.admin", "enterprise.ai_operator"],
          tenantIds: ["tenant-demo"],
          projectIds: ["project-core"],
          effectivePermissions: ["runtime.run.read", "runtime.session.read", "runtime.provider.read"]
        }
      },
      runs: {
        source: "runtime-endpoint",
        count: 3,
        items: [
          {
            runId: "run-20260314-003",
            tenantId: "tenant-demo",
            projectId: "project-core",
            status: "FAILED",
            policyDecision: "DENY",
            selectedPolicyProvider: "aimxs-policy-primary",
            selectedEvidenceProvider: "oss-evidence-memory",
            selectedDesktopProvider: "oss-desktop-openfang-linux",
            updatedAt: "2026-03-14T04:20:00Z"
          },
          {
            runId: "run-20260314-002",
            tenantId: "tenant-demo",
            projectId: "project-core",
            status: "COMPLETED",
            policyDecision: "ALLOW",
            selectedPolicyProvider: "oss-policy-opa",
            selectedEvidenceProvider: "oss-evidence-memory",
            updatedAt: "2026-03-14T04:10:00Z"
          },
          {
            runId: "run-20260314-001",
            tenantId: "tenant-ops",
            projectId: "project-payments",
            status: "POLICY_EVALUATED",
            policyDecision: "ALLOW",
            selectedProfileProvider: "oss-profile-static",
            selectedPolicyProvider: "oss-policy-opa",
            updatedAt: "2026-03-14T04:00:00Z"
          }
        ]
      }
    },
    {
      claims: {
        tenant_id: "tenant-demo",
        project_id: "project-core"
      }
    },
    {
      now: "2026-03-14T04:25:00Z"
      ,
      viewState: {
        selectedRunId: "run-20260314-003",
        selectedSessionId: "session-20260314-003",
        sessionReviewMeta: {
          state: "ready",
          tone: "ok",
          message: "Native runtime session review is loaded."
        },
        sessionReview: {
          sessionId: "session-20260314-003",
          source: "timeline+stream",
          status: "ready",
          message: "Native M16 session state loaded from timeline and event-stream surfaces.",
          timeline: {
            latestEventSequence: 14,
            session: {
              sessionId: "session-20260314-003",
              requestId: "req-20260314-003",
              taskId: "task-20260314-003",
              status: "RUNNING"
            },
            task: {
              taskId: "task-20260314-003",
              status: "RUNNING"
            },
            selectedWorker: {
              workerId: "worker-managed-codex-01",
              workerType: "managed_agent",
              adapterId: "codex",
              provider: "codex",
              transport: "wss",
              model: "gpt-5-codex",
              targetEnvironment: "local-desktop",
              source: "runtimeops.attach",
              status: "RUNNING"
            },
            openApprovalCount: 1,
            evidenceRecords: [{ evidenceId: "evidence-001" }],
            toolActions: [
              {
                toolActionId: "tool-action-001",
                toolType: "managed_agent_turn",
                resultPayload: {
                  rawResponse: [{ type: "worker.output.delta", text: "Investigating runtime session." }]
                }
              }
            ],
            events: [
              {
                eventId: "evt-10",
                sequence: 10,
                eventType: "worker.bridge.started",
                timestamp: "2026-03-14T04:21:05Z",
                payload: {
                  summary: "Managed worker bridge attached."
                }
              },
              {
                eventId: "evt-11",
                sequence: 11,
                eventType: "worker.progress",
                timestamp: "2026-03-14T04:21:20Z",
                payload: {
                  stage: "planning",
                  percent: 35,
                  summary: "Worker is planning the next governed step."
                }
              },
              {
                eventId: "evt-12",
                sequence: 12,
                eventType: "tool_proposal.generated",
                timestamp: "2026-03-14T04:21:30Z",
                payload: {
                  proposalId: "proposal-001",
                  proposalType: "governed_action_request",
                  payload: {
                    requestLabel: "Fetch evidence"
                  }
                }
              },
              {
                eventId: "evt-13",
                sequence: 13,
                eventType: "approval.requested",
                timestamp: "2026-03-14T04:21:40Z",
                payload: {
                  summary: "Approval requested for governed action."
                }
              },
              {
                eventId: "evt-14",
                sequence: 14,
                eventType: "worker.output.delta",
                timestamp: "2026-03-14T04:21:50Z",
                payload: {
                  payload: {
                    delta: "Investigating runtime session."
                  }
                }
              }
            ]
          },
          streamItems: []
        },
        feedback: {
          tone: "ok",
          message: "Runtime worker heartbeat recorded."
        }
      }
    }
  );

  assert.match(ui.runtimeOpsContent.innerHTML, /data-domain-root="runtimeops"/);
  assert.match(ui.runtimeOpsContent.innerHTML, /RuntimeOps/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Current Run And Session/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Investigation And Follow-Through/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Routing, Connectors, And Inventory/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Use the deeper runtime console to inspect governed runs, follow session continuity, and confirm runtime posture/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Run And Session Follow-Through/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Selected Session Review/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Worker Posture/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Runtime Health/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Run Backlog Signals/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Latency And Capacity/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Session Activity/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Worker Fleet/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Provider Routing/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Route And Boundary Echo/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Identity Application/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Identity And Posture Echo/);
  assert.match(ui.runtimeOpsContent.innerHTML, /runtime session identity/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Route And Provider Chain/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Current Boundary/);
  assert.match(ui.runtimeOpsContent.innerHTML, /approval-bound runtime continuation/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Current Posture/);
  assert.match(ui.runtimeOpsContent.innerHTML, /selected session/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Target Posture/);
  assert.match(ui.runtimeOpsContent.innerHTML, /approved continuation required|stable governed session/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Allowed Or Blocked/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Run Inventory/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Runtime API reachable\./);
  assert.match(ui.runtimeOpsContent.innerHTML, /One provider is degraded\./);
  assert.match(ui.runtimeOpsContent.innerHTML, /approvals=1/);
  assert.match(ui.runtimeOpsContent.innerHTML, /attention=1/);
  assert.match(ui.runtimeOpsContent.innerHTML, /routes=5/);
  assert.match(ui.runtimeOpsContent.innerHTML, /sessions=3/);
  assert.match(ui.runtimeOpsContent.innerHTML, /awaiting approval/i);
  assert.match(ui.runtimeOpsContent.innerHTML, /worker-capability-endpoint/);
  assert.match(ui.runtimeOpsContent.innerHTML, /capabilities=3/);
  assert.match(ui.runtimeOpsContent.innerHTML, /gpt-5-codex/);
  assert.match(ui.runtimeOpsContent.innerHTML, /premium policy/i);
  assert.match(ui.runtimeOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.runtimeOpsContent.innerHTML, /bearer_token_jwt/);
  assert.match(ui.runtimeOpsContent.innerHTML, /epydiosops-desktop-local/);
  assert.match(ui.runtimeOpsContent.innerHTML, /runtime-identity-endpoint/);
  assert.match(ui.runtimeOpsContent.innerHTML, /freshness/i);
  assert.match(ui.runtimeOpsContent.innerHTML, /req-20260314-003/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Investigating runtime session\./);
  assert.match(ui.runtimeOpsContent.innerHTML, /runtimeops\.attach/);
  assert.match(ui.runtimeOpsContent.innerHTML, /tenant-demo/);
  assert.match(ui.runtimeOpsContent.innerHTML, /project-core/);
  assert.match(ui.runtimeOpsContent.innerHTML, /tenant-demo \/ project-core/);
  assert.match(ui.runtimeOpsContent.innerHTML, /pending proposals/);
  assert.match(ui.runtimeOpsContent.innerHTML, /runtime-endpoint/);
  assert.match(ui.runtimeOpsContent.innerHTML, /runtime-session-endpoint/);
  assert.match(ui.runtimeOpsContent.innerHTML, /run-20260314-003/);
  assert.match(ui.runtimeOpsContent.innerHTML, /session-20260314-003/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Open Run Detail/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Review Session/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Refresh Review/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Close Session/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Attach Worker/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Heartbeat/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Reattach/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Runtime worker heartbeat recorded\./);
  assert.match(ui.runtimeOpsContent.innerHTML, /data-runtimeops-open-run-id="run-20260314-003"/);
  assert.match(ui.runtimeOpsContent.innerHTML, /data-runtimeops-review-session-id="session-20260314-003"/);
  assert.match(ui.runtimeOpsContent.innerHTML, /data-runtimeops-close-session-id="session-20260314-003"/);
  assert.match(ui.runtimeOpsContent.innerHTML, /data-runtimeops-worker-event-type="heartbeat"/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Companion needs more than the daily lane/);
  assert.match(ui.runtimeOpsContent.innerHTML, /without turning RuntimeOps into a second daily queue/);
  assert.ok(
    ui.runtimeOpsContent.innerHTML.indexOf("Current Run And Session") <
      ui.runtimeOpsContent.innerHTML.indexOf("Investigation And Follow-Through")
  );
  assert.ok(
    ui.runtimeOpsContent.innerHTML.indexOf("Investigation And Follow-Through") <
      ui.runtimeOpsContent.innerHTML.indexOf("Routing, Connectors, And Inventory")
  );
});

test("runtimeops page preserves companion handoff context in the receiving prelude", () => {
  const ui = { runtimeOpsContent: { innerHTML: "" } };
  renderRuntimeOpsPage(
    ui,
    {
      companionHandoffContext: {
        view: "runtimeops",
        arrivalRationale:
          "Companion opened runtime depth because the governed run needs deeper runtime investigation and proof follow-through.",
        proof: {
          tone: "warn",
          label: "Proof attached",
          summary: "bundle=pending; record=queued; audit=1"
        },
        receipt: {
          tone: "warn",
          label: "Approval receipt pending",
          summary: "Approval approval-20260327-002 is still pending review."
        },
        runId: "run-20260327-002",
        approvalId: "approval-20260327-002"
      }
    },
    {},
    {}
  );

  assert.match(ui.runtimeOpsContent.innerHTML, /Companion handoff context/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Proof attached/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Approval receipt pending/);
  assert.match(ui.runtimeOpsContent.innerHTML, /run=run-20260327-002/);
});

test("runtimeops empty state renders without loaded runtime context", () => {
  const ui = { runtimeOpsContent: { innerHTML: "" } };
  renderRuntimeOpsEmptyState(ui, {
    title: "RuntimeOps",
    message: "Runtime state becomes available after health, provider, and run data load."
  });

  assert.match(ui.runtimeOpsContent.innerHTML, /RuntimeOps/);
  assert.match(ui.runtimeOpsContent.innerHTML, /Runtime state becomes available/);
});
