import test from "node:test";
import assert from "node:assert/strict";
import { renderHomeOpsEmptyState, renderHomeOpsPage } from "../domains/homeops/routes.js";

test("companionops page renders companion status, attention, recent governed actions, and exact workbench handoffs", () => {
  const ui = { homeOpsContent: { innerHTML: "" } };
  renderHomeOpsPage(ui, {
    nativeShell: {
      launcherState: "ready",
      mode: "live",
      runtimeState: "service_running",
      runtimeProcessMode: "background_supervisor",
      bootstrapConfigState: "loaded",
      runtimeService: {
        state: "running",
        health: "healthy"
      },
      gatewayService: {
        state: "running",
        health: "healthy"
      }
    },
    selectedAgentProfileId: "codex",
    session: {
      authenticated: true,
      claims: {
        sub: "operator@example.com",
        client_id: "epydios-runtime-prod-client",
        tenant_id: "tenant-demo",
        project_id: "project-core",
        roles: ["enterprise.tenant_admin", "ops.operator"]
      }
    },
    health: {
      runtime: { status: "ok", detail: "Runtime API reachable." },
      providers: { status: "warn", detail: "One provider is degraded." }
    },
    pipeline: {
      status: "pass",
      latestProdGate: "prod-full-gate-20260315T164000Z.log"
    },
    providers: {
      items: [
        { providerId: "oss-profile-static", ready: true },
        { providerId: "aimxs-policy-primary", ready: true },
        { providerId: "oss-desktop-openfang-linux", ready: false }
      ]
    },
    settings: {
      identity: {
        authenticated: true,
        authEnabled: true,
        authorityBasis: "runtime_context_identity",
        source: "runtime-endpoint",
        identity: {
          subject: "operator@example.com",
          clientId: "epydios-runtime-prod-client",
          roles: ["enterprise.tenant_admin", "ops.operator"],
          tenantIds: ["tenant-demo"],
          projectIds: ["project-core"],
          effectivePermissions: ["runs.read", "approvals.review", "audit.read"],
          claimKeys: ["sub", "client_id", "tenant_id", "project_id", "roles"]
        }
      },
      aimxs: {
        mode: "aimxs-full",
        activation: {
          selectedProviderId: "aimxs-policy-primary"
        }
      },
      policyCatalog: {
        count: 4,
        items: []
      }
    },
    runs: {
      items: [
        {
          runId: "run-20260315-003",
          status: "FAILED",
          policyDecision: "DENY",
          selectedPolicyProvider: "aimxs-policy-primary",
          updatedAt: "2026-03-15T16:20:00Z"
        },
        {
          runId: "run-20260315-002",
          status: "COMPLETED",
          policyDecision: "ALLOW",
          updatedAt: "2026-03-15T16:10:00Z"
        }
      ]
    },
    approvals: {
      source: "runtime-endpoint",
      items: [
        {
          approvalId: "approval-20260315-003",
          status: "PENDING",
          runId: "run-20260315-003",
          expiresAt: "2026-03-15T16:24:00Z"
        },
        {
          approvalId: "approval-20260315-002",
          status: "APPROVED"
        }
      ]
    },
    nativeGatewayHolds: [
      {
        interpositionRequestId: "ixr-20260315-003",
        gatewayRequestId: "gateway-20260315-003",
        runId: "run-20260315-003",
        approvalId: "approval-20260315-003",
        state: "held_pending_approval",
        holdStartedAtUtc: "2026-03-15T16:19:00Z",
        holdDeadlineAtUtc: "2026-03-15T16:24:00Z",
        clientSurface: "codex",
        sourceClient: {
          id: "client-codex",
          name: "Codex"
        },
        tenantId: "tenant-demo",
        projectId: "project-core",
        requestSummary: {
          title: "Restart payments deployment",
          reason: "Policy deferred the request."
        },
        governanceTarget: {
          targetRef: "deploy/payments"
        }
      }
    ],
    audit: {
      source: "audit-endpoint",
      items: [
        {
          ts: "2026-03-15T16:21:00Z",
          event: "runtime.policy.decision",
          decision: "DENY"
        }
      ]
    },
    incidentHistory: {
      items: [
        {
          packageId: "incident-20260315T161900Z-run-20260315-003",
          generatedAt: "2026-03-15T16:19:30Z",
          filingStatus: "filed",
          runId: "run-20260315-003",
          approvalStatus: "PENDING"
        }
      ]
    }
  });

  assert.match(ui.homeOpsContent.innerHTML, /data-domain-root="companionops"/);
  assert.match(ui.homeOpsContent.innerHTML, /Mode And System Status/);
  assert.match(ui.homeOpsContent.innerHTML, /Attention Queue/);
  assert.match(ui.homeOpsContent.innerHTML, /Recent Governed Actions/);
  assert.match(ui.homeOpsContent.innerHTML, /Quick Actions/);
  assert.match(ui.homeOpsContent.innerHTML, /Connected Client Context/);
  assert.match(ui.homeOpsContent.innerHTML, /Companion/);
  assert.match(ui.homeOpsContent.innerHTML, /Launcher/);
  assert.match(ui.homeOpsContent.innerHTML, /Runtime Service/);
  assert.match(ui.homeOpsContent.innerHTML, /Gateway/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Workbench/);
  assert.match(ui.homeOpsContent.innerHTML, /Restart Services/);
  assert.match(ui.homeOpsContent.innerHTML, /Show Diagnostics/);
  assert.match(ui.homeOpsContent.innerHTML, /Interposed approval required/);
  assert.match(ui.homeOpsContent.innerHTML, /Runs requiring attention/);
  assert.match(ui.homeOpsContent.innerHTML, /Incident escalation pending/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Approval/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Run/);
  assert.match(ui.homeOpsContent.innerHTML, /operator@example\.com/);
  assert.match(ui.homeOpsContent.innerHTML, /epydios-runtime-prod-client/);
  assert.match(ui.homeOpsContent.innerHTML, /codex/);
  assert.match(ui.homeOpsContent.innerHTML, /tenant-demo\/project-core/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Approval Queue/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Recent Runs/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="open-workbench"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="open-approval-item"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-action="open-run-item"/);
});

test("homeops empty state renders without loaded domain anchors", () => {
  const ui = { homeOpsContent: { innerHTML: "" } };
  renderHomeOpsEmptyState(ui, {
    title: "CompanionOps",
    message: "CompanionOps becomes available after domain anchors load."
  });

  assert.match(ui.homeOpsContent.innerHTML, /CompanionOps/);
  assert.match(ui.homeOpsContent.innerHTML, /domain anchors load/i);
});
