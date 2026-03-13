import test from "node:test";
import assert from "node:assert/strict";
import {
  renderIdentityOpsEmptyState,
  renderIdentityOpsPage
} from "../domains/identityops/routes.js";

test("identityops page renders the first read-only boards and bounded secondary panels", () => {
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
          providerId: "aimxs-policy-primary",
          decision: "ALLOW"
        }
      },
      policyCatalog: {
        count: 4,
        items: []
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
  assert.match(ui.identityContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.identityContent.innerHTML, /demo\.operator/);
  assert.match(ui.identityContent.innerHTML, /runtime\.run\.create/);
  assert.match(ui.identityContent.innerHTML, /staging/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /run=<code>/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /expires=<code>2026-03-13T12:15:00Z<\/code>/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /policy=<code>aimxs-policy-primary<\/code>/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /NetworkOps will own transport path/);
  assert.doesNotMatch(ui.identityContent.innerHTML, /Traceability stays bounded/);
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
