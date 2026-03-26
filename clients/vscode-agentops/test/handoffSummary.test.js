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
      taskStatus: "IN_PROGRESS",
      sessionStatus: "RUNNING",
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
  assert.match(handoff.renderedText, /AgentOps Audit and Evidence Handoff/);
  assert.match(handoff.renderedText, /Governed request bundle ready/);
  assert.match(handoff.renderedText, /Approval Decision: Approved by operator\./);
});
