import test from "node:test";
import assert from "node:assert/strict";
import { renderChat } from "../views/chat.js";
import { loadM19ParityFixture, buildChatThreadFromParityFixture } from "./m19-parity-fixture.js";

test("chat view renders parity fixture state from the native contract", async () => {
  const fixture = await loadM19ParityFixture();
  const thread = buildChatThreadFromParityFixture(fixture);
  const ui = { chatContent: { innerHTML: "" } };
  renderChat(
    ui,
    {
      integrations: {
        selectedAgentProfileId: "codex",
        agentProfiles: [{ id: "codex", label: "Codex" }]
      }
    },
    {
      thread,
      history: {
        items: [
          {
            taskId: thread.taskId,
            title: fixture.task.title,
            status: fixture.task.status,
            sessionCount: 1,
            executionMode: "managed_codex_worker"
          }
        ],
        count: 1,
        archivedCount: 0,
        showArchived: false
      },
      agentProfileId: "codex",
      executionMode: "managed_codex_worker",
      status: "ready",
      message: "Loaded parity fixture state."
    }
  );

  assert.match(ui.chatContent.innerHTML, /Operator Chat/);
  assert.match(ui.chatContent.innerHTML, /Managed Codex Worker/);
  assert.match(ui.chatContent.innerHTML, /Investigate checkout timeouts/);
  assert.match(ui.chatContent.innerHTML, /Tool proposal generated for shell execution\./);
  assert.match(ui.chatContent.innerHTML, /approval-1/);
  assert.match(ui.chatContent.innerHTML, /proposal-1/);
});
