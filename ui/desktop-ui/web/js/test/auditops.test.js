import test from "node:test";
import assert from "node:assert/strict";
import { renderAuditOpsEmptyState, renderAuditOpsPage } from "../domains/auditops/routes.js";
import { createAimxsDecisionBindingSpine } from "../shared/aimxs/decision-binding.js";

test("auditops page renders bounded audit event, actor activity, and decision trace boards", () => {
  const ui = { auditOpsContent: { innerHTML: "" } };
  renderAuditOpsPage(ui, {
    now: "2026-03-15T01:20:00Z",
    actor: "demo.operator",
    filters: {
      tenant: "tenant-demo",
      project: "project-core",
      providerId: "aimxs-policy-primary",
      timeRange: "24h"
    },
    audit: {
      source: "audit-endpoint",
      warning: "One provider decision trail is delayed.",
      items: [
        {
          ts: "2026-03-15T01:18:00Z",
          event: "policy.decision.denied",
          tenantId: "tenant-demo",
          projectId: "project-core",
          providerId: "aimxs-policy-primary",
          decision: "DENY"
        },
        {
          ts: "2026-03-15T01:12:00Z",
          event: "policy.decision.allowed",
          tenantId: "tenant-demo",
          projectId: "project-core",
          providerId: "aimxs-policy-primary",
          decision: "ALLOW"
        },
        {
          ts: "2026-03-15T01:05:00Z",
          event: "approval.reviewed",
          tenantId: "tenant-demo",
          projectId: "project-core",
          providerId: "governance-receipt",
          decision: ""
        }
      ]
    },
    runs: {
      items: [
        {
          runId: "run-20260315-001",
          status: "DENIED",
          policyDecision: "DENY",
          tenantId: "tenant-demo",
          projectId: "project-core",
          updatedAt: "2026-03-15T01:19:00Z"
        }
      ]
    },
    approvals: {
      items: [
        {
          approvalId: "approval-20260315-001",
          status: "APPROVED",
          runId: "run-20260315-001",
          reviewedAt: "2026-03-15T01:10:00Z"
        }
      ]
    },
    adminQueueItems: [
      {
        id: "network-change-aa10-001",
        ownerDomain: "networkops",
        kind: "network",
        status: "rolled_back",
        requestedAction: "probe gateway_path tasks",
        subjectId: "gateway_path",
        targetScope: "local / aimxs-policy-primary",
        reason: "Trace admin lifecycle.",
        summary: "Probe Runtime Tasks within local / aimxs-policy-primary.",
        simulationSummary: "Preview only before live probe execution.",
        createdAt: "2026-03-15T01:00:00Z",
        simulatedAt: "2026-03-15T01:01:00Z",
        routedAt: "2026-03-15T01:02:00Z",
        updatedAt: "2026-03-15T01:05:00Z",
        decision: {
          decisionId: "admin-decision-aa10-001",
          status: "approved",
          approvalReceiptId: "approval-receipt-aa10-001",
          decidedAt: "2026-03-15T01:03:00Z"
        },
        execution: {
          executionId: "admin-execution-aa10-001",
          executedAt: "2026-03-15T01:04:00Z",
          status: "applied"
        },
        receipt: {
          receiptId: "admin-receipt-aa10-001",
          issuedAt: "2026-03-15T01:04:00Z",
          stableRef: "network-change-aa10-001/admin-receipt-aa10-001"
        },
        rollback: {
          rollbackId: "admin-rollback-aa10-001",
          action: "rollback",
          status: "rolled_back",
          rolledBackAt: "2026-03-15T01:05:00Z",
          stableRef: "network-change-aa10-001/admin-rollback-aa10-001"
        }
      }
    ],
    selectedRunDetail: {
      runId: "run-20260315-001",
      status: "DENIED",
      policyDecision: "DENY",
      projectId: "project-core",
      tenantId: "tenant-demo",
      updatedAt: "2026-03-15T01:19:00Z"
    },
    incidentHistory: {
      items: [
        {
          id: "incident-history-001",
          packageId: "incident-20260315T011900Z-run-20260315-001",
          generatedAt: "2026-03-15T01:19:30Z",
          filingUpdatedAt: "2026-03-15T01:20:00Z",
          filingStatus: "filed",
          scope: "tenant-demo/project-core",
          auditSource: "audit-endpoint",
          runId: "run-20260315-001",
          approvalStatus: "APPROVED",
          auditMatchedCount: 2,
          fileName: "incident-20260315T011900Z-run-20260315-001.json",
          handoffText: "EpydiosOps Desktop Audit Handoff Summary\nscope=tenant-demo/project-core"
        },
        {
          id: "incident-history-002",
          packageId: "incident-20260315T010900Z-run-20260315-000",
          generatedAt: "2026-03-15T01:09:30Z",
          filingStatus: "drafted",
          scope: "tenant-demo/project-core",
          auditSource: "audit-endpoint",
          runId: "run-20260315-000",
          approvalStatus: "UNAVAILABLE",
          auditMatchedCount: 1,
          fileName: "incident-20260315T010900Z-run-20260315-000.json",
          handoffText: "EpydiosOps Desktop Audit Handoff Summary"
        }
      ]
    },
    viewState: {
      feedback: {
        tone: "ok",
        message: "Audit JSON exported to audit-export.json."
      },
      handoffPreview:
        "EpydiosOps Desktop Audit Handoff Summary\ngeneratedAt=2026-03-15T01:20:00Z\nscope=tenant-demo/project-core"
    },
    aimxsDecisionBindingSpine: createAimxsDecisionBindingSpine({
      activeDomain: "auditops",
      sourceLabel: "correlated run",
      correlationRef: "run-20260315-001",
      runId: "run-20260315-001",
      approvalId: "approval-20260315-001",
      actorRef: "demo.operator",
      subjectRef: "task-20260315-001",
      authorityRef: "codex",
      authorityBasis: "bearer_token_jwt",
      scopeRef: "tenant-demo / project-core",
      providerRef: "aimxs-policy-primary",
      routeRef: "managed_codex_worker",
      boundaryRef: "agentops_gateway",
      grantRef: "approval-20260315-001",
      decisionStatus: "DENY",
      receiptRef: "approval-receipt-aa10-001",
      stableRef: "network-change-aa10-001/admin-receipt-aa10-001",
      bundleId: "bundle-governed-audit-001",
      recordId: "evidence-run-20260315-001",
      replayRef: "run-20260315-001",
      sessionRef: "session-20260315-001",
      taskRef: "task-20260315-001",
      evidenceRefs: ["evidence://tenant-demo/project-core/run-20260315-001"],
      auditRefs: ["policy.decision.denied@2026-03-15T01:18:00Z"],
      summary: "Audit traceability for the correlated run."
    })
  });

  assert.match(ui.auditOpsContent.innerHTML, /data-domain-root="auditops"/);
  assert.match(ui.auditOpsContent.innerHTML, /Audit Event Board/);
  assert.match(ui.auditOpsContent.innerHTML, /Actor Activity Board/);
  assert.match(ui.auditOpsContent.innerHTML, /Decision Trace Board/);
  assert.match(ui.auditOpsContent.innerHTML, /Admin Lifecycle Trace/);
  assert.match(ui.auditOpsContent.innerHTML, /AIMXS Lifecycle Ribbon/);
  assert.match(ui.auditOpsContent.innerHTML, /AIMXS Decision-Binding Spine/);
  assert.match(ui.auditOpsContent.innerHTML, /Authority Chain/);
  assert.match(ui.auditOpsContent.innerHTML, /Grant Chain/);
  assert.match(ui.auditOpsContent.innerHTML, /Receipt Chain/);
  assert.match(ui.auditOpsContent.innerHTML, /Replay Chain/);
  assert.match(ui.auditOpsContent.innerHTML, /Evidence Chain/);
  assert.match(ui.auditOpsContent.innerHTML, /data-aimxs-spine-action="open-workspace"/);
  assert.match(ui.auditOpsContent.innerHTML, /Decision Binding Contract/);
  assert.match(ui.auditOpsContent.innerHTML, /Stable Or Replay Refs/);
  assert.match(ui.auditOpsContent.innerHTML, /Export Board/);
  assert.match(ui.auditOpsContent.innerHTML, /Investigation Workspace/);
  assert.match(ui.auditOpsContent.innerHTML, /AuditOps Action Complete/);
  assert.match(ui.auditOpsContent.innerHTML, /Audit JSON exported to audit-export\.json\./);
  assert.match(ui.auditOpsContent.innerHTML, /audit-endpoint/);
  assert.match(ui.auditOpsContent.innerHTML, /demo\.operator/);
  assert.match(ui.auditOpsContent.innerHTML, /tenant-demo/);
  assert.match(ui.auditOpsContent.innerHTML, /project-core/);
  assert.match(ui.auditOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.auditOpsContent.innerHTML, /policy\.decision\.denied/);
  assert.match(ui.auditOpsContent.innerHTML, /run-20260315-001/);
  assert.match(ui.auditOpsContent.innerHTML, /approval-20260315-001/);
  assert.match(ui.auditOpsContent.innerHTML, /network-change-aa10-001/);
  assert.match(ui.auditOpsContent.innerHTML, /approval-receipt-aa10-001/);
  assert.match(ui.auditOpsContent.innerHTML, /admin-receipt-aa10-001/);
  assert.match(ui.auditOpsContent.innerHTML, /admin-rollback-aa10-001/);
  assert.match(ui.auditOpsContent.innerHTML, /decisionEvents=2/);
  assert.match(ui.auditOpsContent.innerHTML, /matched=2/);
  assert.match(ui.auditOpsContent.innerHTML, /csv=3/);
  assert.match(ui.auditOpsContent.innerHTML, /handoff=\d+/);
  assert.match(ui.auditOpsContent.innerHTML, /queue=2/);
  assert.match(ui.auditOpsContent.innerHTML, /incident-20260315T011900Z-run-20260315-001/);
  assert.match(ui.auditOpsContent.innerHTML, /tenant-demo\/project-core/);
  assert.match(ui.auditOpsContent.innerHTML, /data-auditops-action="export-json"/);
  assert.match(ui.auditOpsContent.innerHTML, /data-auditops-action="export-csv"/);
  assert.match(ui.auditOpsContent.innerHTML, /data-auditops-action="copy-handoff"/);
  assert.match(ui.auditOpsContent.innerHTML, /data-auditops-action="export-incident-package"/);
  assert.match(ui.auditOpsContent.innerHTML, /data-auditops-action="open-incidentops"/);
  assert.match(ui.auditOpsContent.innerHTML, /data-auditops-action="copy-latest-handoff"/);
  assert.match(ui.auditOpsContent.innerHTML, /Handoff Preview/);
  assert.match(ui.auditOpsContent.innerHTML, /selected run/);
  assert.match(ui.auditOpsContent.innerHTML, /drafted=1/);
  assert.match(ui.auditOpsContent.innerHTML, /filed=1/);
  assert.match(ui.auditOpsContent.innerHTML, /One provider decision trail is delayed\./);
});

test("auditops empty state renders without loaded audit posture", () => {
  const ui = { auditOpsContent: { innerHTML: "" } };
  renderAuditOpsEmptyState(ui, {
    title: "AuditOps",
    message: "Audit posture becomes available after audit, run, approval, and decision trace signals load."
  });

  assert.match(ui.auditOpsContent.innerHTML, /AuditOps/);
  assert.match(ui.auditOpsContent.innerHTML, /Audit posture becomes available/);
});
