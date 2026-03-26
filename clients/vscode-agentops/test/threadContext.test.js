const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDecisionActionHints,
  resolveApprovalDecisionTarget,
  resolveProposalDecisionTarget
} = require("../lib/threadContext");

test("resolveApprovalDecisionTarget auto-selects a single pending approval", () => {
  const target = resolveApprovalDecisionTarget(
    {
      session: { sessionId: "sess-1" },
      approvals: [{ checkpointId: "appr-1", status: "PENDING" }]
    },
    "",
    ""
  );
  assert.deepEqual(target, { sessionId: "sess-1", targetId: "appr-1" });
});

test("resolveProposalDecisionTarget rejects ambiguous pending proposals", () => {
  assert.throws(
    () => resolveProposalDecisionTarget(
      {
        session: { sessionId: "sess-1" },
        toolProposals: [
          { proposalId: "prop-1", status: "PENDING" },
          { proposalId: "prop-2", status: "PENDING" }
        ]
      },
      "",
      ""
    ),
    /multiple pending proposals matched the thread review/
  );
});

test("buildDecisionActionHints lists pending target guidance", () => {
  const hints = buildDecisionActionHints(
    {
      session: { sessionId: "sess-7" },
      approvals: [{ checkpointId: "appr-7", status: "PENDING" }],
      toolProposals: [
        { proposalId: "prop-7a", status: "PENDING" },
        { proposalId: "prop-7b", status: "PENDING" }
      ]
    },
    ""
  );
  assert.equal(hints[0], "Current approval is focused automatically in session sess-7. Use the approval action directly.");
  assert.equal(hints[1], "Secondary path: use checkpoint appr-7 only when you need to target it explicitly.");
  assert.equal(hints[2], "Current proposal is not unambiguous in session sess-7. Choose the right proposal from the proposals list.");
  assert.equal(hints[3], "Secondary proposal IDs: prop-7a, prop-7b");
});
