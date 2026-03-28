const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAuditEvidenceHandoff } = require("../lib/handoffSummary");

test("buildAuditEvidenceHandoff packages evidence and recent audit continuity", () => {
  const handoff = buildAuditEvidenceHandoff({
    task: {
      taskId: "task-1",
      title: "Review production change"
    },
    selectedSession: {
      sessionId: "sess-2",
      status: "RUNNING"
    },
    selectedSummary: {
      runId: "run-9",
      route: "managed_worker_gateway_process",
      boundaryProviderId: "agentops_gateway",
      taskStatus: "IN_PROGRESS",
      sessionStatus: "RUNNING",
      latestToolActionId: "tool-5",
      latestToolType: "managed_agent_turn",
      latestToolStatus: "COMPLETED",
      latestEvidenceId: "evidence-1",
      latestEvidenceKind: "audit_bundle",
      approvals: [{ checkpointId: "appr-1", status: "APPROVED" }],
      toolProposals: [{ proposalId: "prop-1", status: "APPROVED" }],
      evidenceRecords: [
        { evidenceId: "evidence-1", kind: "audit_bundle", summary: "Governed request bundle ready" }
      ],
      events: [
        { eventType: "approval.status.changed", label: "Approval Decision", detail: "Approved by operator." },
        { eventType: "evidence.recorded", label: "Evidence Recorded", detail: "Audit bundle captured." }
      ]
    }
  });
  assert.equal(handoff.evidenceCount, 1);
  assert.equal(handoff.auditEventCount, 2);
  assert.equal(handoff.runId, "run-9");
  assert.match(handoff.renderedText, /EpydiosOps audit and evidence handoff/);
  assert.match(handoff.renderedText, /Run: run-9/);
  assert.match(handoff.renderedText, /Current decision:/);
  assert.match(handoff.renderedText, /Run\/session continuity:/);
  assert.match(handoff.renderedText, /Primary decision detail: approval checkpoint appr-1 \(APPROVED\) is the latest resolved record for task task-1\./);
  assert.match(handoff.renderedText, /Resolved approvals: appr-1 \(APPROVED\)/);
  assert.match(handoff.renderedText, /Audit\/evidence handoff:/);
  assert.match(handoff.renderedText, /Primary evidence destination: latest audit bundle evidence is ready for the VS Code handoff summary for task task-1\./);
  assert.match(handoff.renderedText, /Suggested escalation target: the VS Code governed thread for task task-1\./);
  assert.match(handoff.renderedText, /Suggested package target: the VS Code handoff summary for task task-1\./);
  assert.match(handoff.renderedText, /Evidence package: audit_bundle \| evidence-1/);
  assert.match(handoff.renderedText, /Approval Decision: Approved by operator\./);
});
