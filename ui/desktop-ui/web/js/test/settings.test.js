import test from "node:test";
import assert from "node:assert/strict";
import { renderSettings } from "../views/settings.js";

test("settings view persists raw response and native timeline disclosure shells", () => {
  const ui = { settingsContent: { innerHTML: "" } };
  renderSettings(
    ui,
    {
      summary: {
        tenantId: "tenant-local",
        projectId: "project-local"
      },
      integrations: {
        selectedAgentProfileId: "openai",
        agentProfiles: [
          {
            id: "openai",
            label: "OpenAI",
            provider: "openai_responses",
            transport: "responses_api",
            model: "gpt-5"
          }
        ]
      },
      diagnostics: {
        providerContracts: []
      }
    },
    {},
    {
      agentTest: {
        agentProfileId: "openai",
        prompt: "Reply with exactly: local-runtime-ok",
        response: {
          outputText: "local-runtime-ok",
          rawResponse: {
            id: "resp_123",
            status: "completed"
          }
        },
        sessionView: {
          timeline: {
            session: {
              sessionId: "session-123",
              status: "COMPLETED"
            },
            events: [
              {
                sequence: 1,
                eventType: "worker.output.delta",
                timestamp: "2026-03-09T01:00:00Z"
              }
            ]
          }
        }
      }
    }
  );

  assert.match(ui.settingsContent.innerHTML, /data-detail-key="settings\.agent_test\.raw_response"/);
  assert.match(ui.settingsContent.innerHTML, /data-detail-key="settings\.agent_session_timeline_json"/);
});
