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
        gatewayTokenRef: "ref://projects/{projectId}/gateways/litellm/bearer-token",
        selectedAgentProfileId: "openai",
        agentProfiles: [
          {
            id: "openai",
            label: "OpenAI",
            provider: "openai_responses",
            transport: "responses_api",
            model: "gpt-5",
            endpointRef: "ref://gateways/litellm/openai",
            credentialRef: "ref://projects/{projectId}/providers/openai/api-key"
          }
        ]
      },
      aimxs: {
        mode: "aimxs-full",
        endpointRef: "ref://projects/{projectId}/providers/aimxs/https-endpoint",
        bearerTokenRef: "ref://projects/{projectId}/providers/aimxs/bearer-token",
        clientTlsCertRef: "ref://projects/{projectId}/providers/aimxs/client-tls-cert",
        clientTlsKeyRef: "ref://projects/{projectId}/providers/aimxs/client-tls-key",
        caCertRef: "ref://projects/{projectId}/providers/aimxs/provider-ca",
        activation: {
          available: true,
          state: "active",
          message: "AIMXS activation switched the live policy-provider path to aimxs-full using the local AIMXS provider shim.",
          namespace: "epydios-system",
          activeMode: "aimxs-full",
          selectedProviderId: "aimxs-full",
          selectedProviderName: "aimxs-full",
          selectedProviderReady: true,
          selectedProviderProbed: true,
          capabilities: [
            "policy.evaluate",
            "policy.validate_bundle",
            "governance.handshake_validation"
          ],
          enabledProviders: [
            {
              name: "aimxs-full",
              providerId: "aimxs-full",
              mode: "aimxs-full",
              enabled: true,
              ready: true,
              probed: true,
              priority: 1000,
              authMode: "None"
            }
          ],
          secrets: {
            bearerTokenSecret: { name: "aimxs-policy-token", present: false },
            clientTlsSecret: { name: "epydios-controller-mtls-client", present: false },
            caSecret: { name: "epydios-provider-ca", present: false }
          }
        }
      },
      localSecureRefs: {
        available: true,
        service: "epydios.agentops.desktop.local-ref.v1",
        indexPath: "/tmp/local-ref-vault/index.json",
        exportPath: "/tmp/local-ref-vault/runtime-ref-values.generated.json",
        storedCount: 2,
        entries: [
          {
            ref: "ref://projects/{projectId}/providers/openai/api-key",
            present: true,
            updatedAt: "2026-03-09T12:00:00Z"
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
  assert.match(ui.settingsContent.innerHTML, /Secure Local Credential Capture/);
  assert.match(ui.settingsContent.innerHTML, /data-settings-local-ref-action="save"/);
  assert.match(ui.settingsContent.innerHTML, /ref:\/\/projects\/\{projectId\}\/providers\/openai\/api-key/);
  assert.match(ui.settingsContent.innerHTML, /aimxs-full/);
  assert.match(ui.settingsContent.innerHTML, /aimxs-full/);
  assert.match(ui.settingsContent.innerHTML, /Provider CA Ref/);
  assert.match(ui.settingsContent.innerHTML, /Activate AIMXS Mode/);
  assert.match(ui.settingsContent.innerHTML, /Refresh Activation Status/);
  assert.match(ui.settingsContent.innerHTML, /AIMXS Richness Self-Check/);
  assert.match(ui.settingsContent.innerHTML, /Evaluate Current Mode/);
  assert.match(ui.settingsContent.innerHTML, /clusterMode=aimxs-full/);
});
