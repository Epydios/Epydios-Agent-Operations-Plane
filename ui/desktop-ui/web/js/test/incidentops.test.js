import test from "node:test";
import assert from "node:assert/strict";
import {
  renderIncidentOpsEmptyState,
  renderIncidentOpsPage
} from "../domains/incidentops/routes.js";
import { createAimxsDecisionBindingSpine } from "../shared/aimxs/decision-binding.js";

test("incidentops page renders bounded queue, active incident, severity, timeline, and closure boards", () => {
  const ui = { incidentOpsContent: { innerHTML: "" } };
  renderIncidentOpsPage(ui, {
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
          approvalId: "approval-20260315-001",
          approvalStatus: "APPROVED",
          auditMatchedCount: 4,
          fileName: "incident-20260315T011900Z-run-20260315-001.json",
          handoffText: "Incident handoff summary ready for downstream response."
        },
        {
          id: "incident-history-002",
          packageId: "incident-20260315T010900Z-run-20260315-000",
          generatedAt: "2026-03-15T01:09:30Z",
          filingStatus: "drafted",
          scope: "tenant-ops/project-payments",
          auditSource: "audit-endpoint",
          runId: "run-20260315-000",
          approvalStatus: "PENDING",
          auditMatchedCount: 1,
          fileName: "incident-20260315T010900Z-run-20260315-000.json"
        }
      ]
    },
    runs: {
      items: [
        {
          runId: "run-20260315-001",
          policyDecision: "DENY",
          updatedAt: "2026-03-15T01:20:30Z"
        },
        {
          runId: "run-20260315-000",
          policyDecision: "ALLOW"
        }
      ]
    },
    approvals: {
      items: [
        {
          approvalId: "approval-20260315-001",
          runId: "run-20260315-001",
          status: "APPROVED",
          reviewedAt: "2026-03-15T01:20:10Z"
        },
        {
          approvalId: "approval-20260315-000",
          runId: "run-20260315-000",
          status: "PENDING"
        }
      ]
    },
    audit: {
      items: [
        {
          ts: "2026-03-15T01:21:00Z",
          event: "incident.package.filed",
          decision: "DENY",
          runId: "run-20260315-001"
        }
      ]
    },
    viewState: {
      selectedIncidentId: "incident-history-002",
      feedback: {
        tone: "ok",
        message: "IncidentOps action feedback is visible."
      }
    },
    aimxsDecisionBindingSpine: createAimxsDecisionBindingSpine({
      activeDomain: "incidentops",
      sourceLabel: "correlated run",
      correlationRef: "run-20260315-001",
      runId: "run-20260315-001",
      approvalId: "approval-20260315-001",
      incidentEntryId: "incident-history-001",
      actorRef: "demo.operator",
      subjectRef: "incident-20260315T011900Z-run-20260315-001",
      authorityRef: "codex",
      authorityBasis: "bearer_token_jwt",
      scopeRef: "tenant-demo / project-core",
      providerRef: "aimxs-policy-primary",
      routeRef: "managed_codex_worker",
      boundaryRef: "agentops_gateway",
      grantRef: "approval-20260315-001",
      decisionStatus: "DENY",
      receiptRef: "approval-receipt-incident-001",
      stableRef: "incident-20260315T011900Z-run-20260315-001",
      incidentPackageId: "incident-20260315T011900Z-run-20260315-001",
      incidentStatus: "filed",
      replayRef: "run-20260315-001",
      sessionRef: "session-20260315-001",
      taskRef: "task-20260315-001",
      evidenceRefs: ["evidence://incident/run-20260315-001"],
      auditRefs: ["incident.package.filed@2026-03-15T01:21:00Z"],
      summary: "Incident traceability for the correlated governed run."
    })
  });

  assert.match(ui.incidentOpsContent.innerHTML, /data-domain-root="incidentops"/);
  assert.match(ui.incidentOpsContent.innerHTML, /IncidentOps action feedback is visible\./);
  assert.match(ui.incidentOpsContent.innerHTML, /Incident Queue/);
  assert.match(ui.incidentOpsContent.innerHTML, /Active Incident Board/);
  assert.match(ui.incidentOpsContent.innerHTML, /Severity Board/);
  assert.match(ui.incidentOpsContent.innerHTML, /Response Timeline Board/);
  assert.match(ui.incidentOpsContent.innerHTML, /Closure Board/);
  assert.match(ui.incidentOpsContent.innerHTML, /AIMXS Decision-Binding Spine/);
  assert.match(ui.incidentOpsContent.innerHTML, /Authority Chain/);
  assert.match(ui.incidentOpsContent.innerHTML, /Grant Chain/);
  assert.match(ui.incidentOpsContent.innerHTML, /Receipt Chain/);
  assert.match(ui.incidentOpsContent.innerHTML, /Replay Chain/);
  assert.match(ui.incidentOpsContent.innerHTML, /Evidence Chain/);
  assert.match(ui.incidentOpsContent.innerHTML, /data-aimxs-spine-action="open-workspace"/);
  assert.match(ui.incidentOpsContent.innerHTML, /incident-20260315T011900Z-run-20260315-001/);
  assert.match(ui.incidentOpsContent.innerHTML, /tenant-demo\/project-core/);
  assert.match(ui.incidentOpsContent.innerHTML, /run-20260315-001/);
  assert.match(ui.incidentOpsContent.innerHTML, /audit-endpoint/);
  assert.match(ui.incidentOpsContent.innerHTML, /high=1/);
  assert.match(ui.incidentOpsContent.innerHTML, /medium=1/);
  assert.match(ui.incidentOpsContent.innerHTML, /drafted=1/);
  assert.match(ui.incidentOpsContent.innerHTML, /filed=1/);
  assert.match(ui.incidentOpsContent.innerHTML, /Incident package generated/);
  assert.match(ui.incidentOpsContent.innerHTML, /events=1/);
  assert.match(ui.incidentOpsContent.innerHTML, /audit=0/);
  assert.match(ui.incidentOpsContent.innerHTML, /handoff=pending/);
  assert.match(ui.incidentOpsContent.innerHTML, /blockers=3/);
  assert.match(ui.incidentOpsContent.innerHTML, /approval=pending/);
  assert.match(ui.incidentOpsContent.innerHTML, /audit=linked/);
  assert.match(ui.incidentOpsContent.innerHTML, /package not filed/);
  assert.match(ui.incidentOpsContent.innerHTML, /approval still pending/);
  assert.match(ui.incidentOpsContent.innerHTML, /handoff summary missing/);
  assert.match(ui.incidentOpsContent.innerHTML, /data-incidentops-action="focus-incident"/);
  assert.match(ui.incidentOpsContent.innerHTML, /data-incidentops-action="download-incident-json"/);
  assert.match(ui.incidentOpsContent.innerHTML, /data-incidentops-action="copy-handoff-summary"/);
  assert.match(ui.incidentOpsContent.innerHTML, /data-incidentops-action="open-linked-run"/);
  assert.match(ui.incidentOpsContent.innerHTML, /data-incidentops-action="transition-incident-status"/);
  assert.match(ui.incidentOpsContent.innerHTML, /data-incidentops-entry-id="incident-history-002"/);
  assert.match(ui.incidentOpsContent.innerHTML, /Focused/);
});

test("incidentops empty state renders without loaded incident posture", () => {
  const ui = { incidentOpsContent: { innerHTML: "" } };
  renderIncidentOpsEmptyState(ui, {
    title: "IncidentOps",
    message: "Incident posture becomes available after incident packages, linked runs, and audit anchors load."
  });

  assert.match(ui.incidentOpsContent.innerHTML, /IncidentOps/);
  assert.match(ui.incidentOpsContent.innerHTML, /incident packages, linked runs, and audit anchors load/i);
});
