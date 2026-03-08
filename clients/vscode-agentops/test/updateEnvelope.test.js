const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildGovernedUpdateEnvelope } = require("../lib/updateEnvelope");

test("buildGovernedUpdateEnvelope packages selected thread review state", () => {
  const envelope = buildGovernedUpdateEnvelope(
    {
      task: { taskId: "task-1", title: "Thread one", status: "IN_PROGRESS" },
      selectedSession: { sessionId: "sess-1", status: "RUNNING" },
      selectedSummary: {
        selectedWorker: { workerId: "worker-1", workerType: "managed_agent", status: "RUNNING" },
        approvals: [{ checkpointId: "appr-1", status: "PENDING" }],
        toolProposals: [{ proposalId: "prop-1", status: "PENDING" }],
        toolActions: [{ toolActionId: "tool-1" }],
        evidenceRecords: [{ evidenceId: "evidence-1" }],
        latestWorkerSummary: "Worker running"
      }
    },
    {
      header: "AgentOps thread update",
      updateType: "review",
      details: ["Selected session: sess-1"],
      actionHints: ["- approvals decide --session-id sess-1 --decision APPROVE|DENY"]
    }
  );
  assert.equal(envelope.header, "AgentOps thread update");
  assert.equal(envelope.updateType, "review");
  assert.equal(envelope.taskId, "task-1");
  assert.equal(envelope.sessionId, "sess-1");
  assert.equal(envelope.openApprovals, 1);
  assert.equal(envelope.pendingProposalCount, 1);
  assert.equal(envelope.summary, "Worker running");
  assert.match(envelope.actionHints[0], /approvals decide/);
});

test("buildGovernedUpdateEnvelope matches shared M19 parity fixture", () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "testdata", "m19-cross-surface-parity.json"), "utf8")
  );
  const envelope = buildGovernedUpdateEnvelope(
    {
      task: fixture.task,
      selectedSession: fixture.session,
      selectedSummary: {
        selectedWorker: fixture.selectedWorker,
        approvals: fixture.pendingApprovals,
        toolProposals: [{ proposalId: "proposal-1", status: "PENDING", summary: fixture.expected.summary }],
        toolActions: [{ toolActionId: "tool-1" }],
        evidenceRecords: fixture.evidenceRecords,
        latestWorkerSummary: fixture.expected.summary
      }
    },
    {
      header: "AgentOps thread update",
      updateType: "review",
      details: ["Selected session: sess-parity-1"],
      recent: fixture.expected.eventLines,
      actionHints: ["- approvals decide --session-id sess-parity-1 --checkpoint-id <id> --decision APPROVE|DENY"]
    }
  );
  assert.equal(envelope.summary, fixture.expected.summary);
  assert.equal(envelope.openApprovals, fixture.expected.approvalIds.length);
  assert.equal(envelope.pendingProposalCount, fixture.expected.proposalIds.length);
  assert.match(envelope.recent.join("\n"), /Worker Progress: Worker collected deployment context\./);
  assert.match(envelope.actionHints.join("\n"), /--checkpoint-id <id>/);
});
