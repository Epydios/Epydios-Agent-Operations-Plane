const test = require("node:test");
const assert = require("node:assert/strict");
const { buildThreadReviewModel } = require("../lib/sessionReview");

test("buildThreadReviewModel surfaces managed worker review state", () => {
  const model = buildThreadReviewModel({
    task: {
      taskId: "task-1",
      status: "IN_PROGRESS",
      title: "Thread one",
      latestRunId: "run-17"
    },
    sessionViews: [
      {
        session: { sessionId: "sess-1", status: "RUNNING", runId: "run-17" },
        timeline: {
          session: { sessionId: "sess-1", status: "RUNNING", runId: "run-17" },
          task: { taskId: "task-1", status: "IN_PROGRESS" },
          selectedWorker: { workerId: "worker-1", workerType: "managed_agent", adapterId: "codex", status: "RUNNING" },
          toolActions: [
            {
              toolActionId: "tool-1",
              toolType: "managed_agent_turn",
              status: "RUNNING",
              resultPayload: {
                runId: "run-17",
                route: "managed_worker_gateway_process",
                boundaryProviderId: "agentops_gateway",
                rawResponse: [{ type: "message", text: "ok" }]
              }
            }
          ],
          approvalCheckpoints: [],
          evidenceRecords: [],
          events: [
            { eventId: "evt-1", sequence: 1, eventType: "worker.progress", payload: { summary: "Worker running" } },
            { eventId: "evt-2", sequence: 2, eventType: "tool_proposal.generated", payload: { proposalId: "prop-1", summary: "Run pwd", payload: { command: "pwd" } } }
          ]
        },
        streamItems: []
      }
    ]
  }, "sess-1");
  assert.equal(model.selectedSummary.executionMode, "managed_codex_worker");
  assert.equal(model.selectedSummary.boundaryProviderId, "agentops_gateway");
  assert.equal(model.selectedSummary.runId, "run-17");
  assert.equal(model.selectedSummary.latestToolActionId, "tool-1");
  assert.equal(model.selectedSummary.toolProposals.length, 1);
  assert.equal(model.selectedTranscript.toolActionId, "tool-1");
});
