import test from "node:test";
import assert from "node:assert/strict";
import { renderHomeOpsEmptyState, renderHomeOpsPage } from "../domains/homeops/routes.js";

test("homeops page renders command dashboard, attention queue, and domain pivot row", () => {
  const ui = { homeOpsContent: { innerHTML: "" } };
  renderHomeOpsPage(ui, {
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
          expiresAt: "2026-03-15T16:24:00Z"
        },
        {
          approvalId: "approval-20260315-002",
          status: "APPROVED"
        }
      ]
    },
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

  assert.match(ui.homeOpsContent.innerHTML, /data-domain-root="homeops"/);
  assert.match(ui.homeOpsContent.innerHTML, /Command Dashboard/);
  assert.match(ui.homeOpsContent.innerHTML, /AIMXS Posture And Readiness/);
  assert.match(ui.homeOpsContent.innerHTML, /Attention Queue/);
  assert.match(ui.homeOpsContent.innerHTML, /Identity And Scope Snapshot/);
  assert.match(ui.homeOpsContent.innerHTML, /Domain Pivot Row/);
  assert.match(ui.homeOpsContent.innerHTML, /RuntimeOps/);
  assert.match(ui.homeOpsContent.innerHTML, /PlatformOps/);
  assert.match(ui.homeOpsContent.innerHTML, /PolicyOps/);
  assert.match(ui.homeOpsContent.innerHTML, /GovernanceOps/);
  assert.match(ui.homeOpsContent.innerHTML, /IncidentOps/);
  assert.match(ui.homeOpsContent.innerHTML, /2 runs/);
  assert.match(ui.homeOpsContent.innerHTML, /2\/3 ready/);
  assert.match(ui.homeOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.homeOpsContent.innerHTML, /mode=aimxs-full/);
  assert.match(ui.homeOpsContent.innerHTML, /incident-bound/);
  assert.match(ui.homeOpsContent.innerHTML, /Next Truthful Action/);
  assert.match(ui.homeOpsContent.innerHTML, /Open IncidentOps/);
  assert.match(ui.homeOpsContent.innerHTML, /blocked=1/);
  assert.match(ui.homeOpsContent.innerHTML, /1 pending/);
  assert.match(ui.homeOpsContent.innerHTML, /1 active/);
  assert.match(ui.homeOpsContent.innerHTML, /Pending approvals/);
  assert.match(ui.homeOpsContent.innerHTML, /Runs requiring attention/);
  assert.match(ui.homeOpsContent.innerHTML, /Audit denies/);
  assert.match(ui.homeOpsContent.innerHTML, /operator@example\.com/);
  assert.match(ui.homeOpsContent.innerHTML, /tenant-demo\/project-core/);
  assert.match(ui.homeOpsContent.innerHTML, /Runtime Context Identity/);
  assert.match(ui.homeOpsContent.innerHTML, /2 roles/);
  assert.match(ui.homeOpsContent.innerHTML, /Open Approval Queue/);
  assert.match(ui.homeOpsContent.innerHTML, /Open IdentityOps/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-view="agentops"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-view="identityops"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-view="runtimeops"/);
  assert.match(ui.homeOpsContent.innerHTML, /data-homeops-view="auditops"/);
  assert.doesNotMatch(ui.homeOpsContent.innerHTML, /Terminal Issues/);
  assert.doesNotMatch(ui.homeOpsContent.innerHTML, /Auth summary/);
});

test("homeops empty state renders without loaded domain anchors", () => {
  const ui = { homeOpsContent: { innerHTML: "" } };
  renderHomeOpsEmptyState(ui, {
    title: "HomeOps",
    message: "HomeOps command posture becomes available after domain anchors load."
  });

  assert.match(ui.homeOpsContent.innerHTML, /HomeOps/);
  assert.match(ui.homeOpsContent.innerHTML, /domain anchors load/i);
});
