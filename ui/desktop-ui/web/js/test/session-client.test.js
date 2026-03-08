import test from "node:test";
import assert from "node:assert/strict";
import { buildNativeSessionActivitySummary, deriveOperatorChatThreadState, listNativeToolProposals } from "../runtime/session-client.js";
import { loadM19ParityFixture, buildSessionViewFromParityFixture, buildChatThreadFromParityFixture } from "./m19-parity-fixture.js";

test("chat session client matches the shared M19 parity fixture", async () => {
  const fixture = await loadM19ParityFixture();
  const sessionView = buildSessionViewFromParityFixture(fixture);
  const activity = buildNativeSessionActivitySummary(sessionView);
  const proposals = listNativeToolProposals(sessionView);
  const threadState = deriveOperatorChatThreadState(buildChatThreadFromParityFixture(fixture));

  assert.equal(activity.latestWorkerSummary, fixture.expected.summary);
  assert.deepEqual(
    activity.progressItems.slice(-fixture.expected.eventLines.length).map((item) => `${item.label}: ${item.detail}`),
    fixture.expected.eventLines
  );
  assert.deepEqual(proposals.map((item) => item.proposalId), fixture.expected.proposalIds);
  assert.equal(activity.openApprovalCount, fixture.expected.approvalIds.length);
  assert.equal(threadState.uiStatus, "warn");
  assert.equal(threadState.openApprovalCount, fixture.expected.approvalIds.length);
  assert.match(threadState.message, /waiting/i);
});
