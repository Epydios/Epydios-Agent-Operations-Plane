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
      },
      identity: {
        source: "runtime.auth.context",
        authEnabled: true,
        authenticated: true,
        authorityBasis: "bearer_token_jwt",
        policyMatrixRequired: true,
        policyRuleCount: 3,
        roleClaim: "roles",
        clientIdClaim: "client_id",
        tenantClaim: "tenant_id",
        projectClaim: "project_id",
        identity: {
          subject: "demo.operator",
          clientId: "epydios-desktop-local",
          roles: ["runtime.admin", "enterprise.ai_operator"],
          tenantIds: ["tenant-local"],
          projectIds: ["project-local"],
          effectivePermissions: ["runtime.run.create", "runtime.run.read"],
          claimKeys: ["sub", "roles", "tenant_id", "project_id"]
        }
      },
      policyCatalog: {
        source: "m20.enterprise.policy_pack_catalog",
        count: 1,
        items: [
          {
            packId: "managed_codex_worker_operator",
            label: "Managed Codex Worker Operator",
            version: "2026.03.14",
            sourceRef: "bundle://aimxs/managed_codex_worker_operator/2026.03.14",
            stableRef: "policy-pack://managed_codex_worker_operator@2026.03.14",
            schemaReadiness: "declared",
            compileReadiness: "ready",
            activationTarget: "workspace",
            activationPosture: "current",
            roleBundles: ["enterprise.operator"],
            decisionSurfaces: ["governed_tool_action"],
            boundaryRequirements: ["tenant_project_scope", "runtime_authz"]
          }
        ]
      }
    },
    {},
    {
      demoGovernance: {
        overlay: {
          persona: {
            enabled: true,
            label: "Local Demo Persona",
            subjectId: "demo.operator.local",
            clientId: "desktop-demo-local",
            rolesText: "compliance.viewer, runtime.run.create",
            tenantScope: "tenant-local",
            projectScope: "project-local",
            approvedForProd: false
          },
          policy: {
            enabled: true,
            reviewMode: "policy_first",
            handshakeRequired: true,
            advisoryAutoShape: true,
            financeSupervisorGrant: true,
            financeEvidenceReadiness: "PARTIAL",
            productionDeleteDeny: true,
            policyBucketPrefix: "desktop-demo"
          }
        },
        status: "saved",
        message: "Local demo governance overlay saved."
      },
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
  assert.match(ui.settingsContent.innerHTML, /clusterMode=aimxs-full/);
  assert.match(ui.settingsContent.innerHTML, /Current Identity \+ Authority/);
  assert.match(ui.settingsContent.innerHTML, /data-domain-root="identityops"/);
  assert.match(ui.settingsContent.innerHTML, /demo\.operator/);
  assert.match(ui.settingsContent.innerHTML, /Current Policy Contract/);
  assert.match(ui.settingsContent.innerHTML, /data-domain-root="policyops"/);
  assert.match(ui.settingsContent.innerHTML, /Local Demo Identity \+ Policy Overlay/);
  assert.match(ui.settingsContent.innerHTML, /Save Demo Overlay/);
  assert.match(ui.settingsContent.innerHTML, /Policy Bucket Prefix/);
  assert.match(ui.settingsContent.innerHTML, /Policy Pack Catalog/);
  assert.match(ui.settingsContent.innerHTML, /managed_codex_worker_operator/);
  assert.match(ui.settingsContent.innerHTML, /2026\.03\.14/);
  assert.match(ui.settingsContent.innerHTML, /bundle:\/\/aimxs\/managed_codex_worker_operator\/2026\.03\.14/);
  assert.match(ui.settingsContent.innerHTML, /policy-pack:\/\/managed_codex_worker_operator@2026\.03\.14/);
  assert.match(ui.settingsContent.innerHTML, /schemaReadiness=declared; compileReadiness=ready/);
});
