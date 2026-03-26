import test from "node:test";
import assert from "node:assert/strict";
import { renderSettingsOpsEmptyState, renderSettingsOpsPage } from "../domains/settingsops/routes.js";

test("settingsops renders bounded preferences, secure refs, environment, supported setup, and recovery boards", () => {
  const ui = { settingsContent: { innerHTML: "" } };

  renderSettingsOpsPage(ui, {
    session: {
      claims: {
        tenant_id: "tenant-local",
        project_id: "project-local"
      }
    },
    settings: {
      summary: {
        tenantId: "tenant-local",
        projectId: "project-local",
        environmentId: "local"
      },
      integrations: {
        modelRouting: "gateway_first",
        gatewayProviderId: "litellm",
        allowDirectProviderFallback: false,
        selectedAgentProfileId: "openai",
        gatewayTokenRef: "ref://projects/{projectId}/gateways/litellm/bearer-token",
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
      endpoints: [
        {
          id: "integrationSettings",
          state: "ready",
          detail: "Runtime endpoint is reachable."
        }
      ],
      theme: {
        mode: "system"
      },
      realtime: {
        mode: "polling",
        pollIntervalMs: 5000
      },
      terminal: {
        mode: "governed_exec",
        restrictedHostMode: "enforced"
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
      aimxs: {
        mode: "aimxs-full",
        state: "active",
        endpointRef: "ref://projects/{projectId}/providers/aimxs/https-endpoint",
        bearerTokenRef: "ref://projects/{projectId}/providers/aimxs/bearer-token",
        clientTlsCertRef: "ref://projects/{projectId}/providers/aimxs/client-tls-cert",
        clientTlsKeyRef: "ref://projects/{projectId}/providers/aimxs/client-tls-key",
        caCertRef: "ref://projects/{projectId}/providers/aimxs/provider-ca",
        activation: {
          available: true,
          state: "active",
          activeMode: "aimxs-full",
          namespace: "epydios-system",
          selectedProviderId: "aimxs-full",
          selectedProviderName: "aimxs-full",
          capabilities: ["policy.evaluate"],
          enabledProviders: [],
          secrets: {
            bearerTokenSecret: { present: false },
            clientTlsSecret: { present: false },
            caSecret: { present: false }
          }
        }
      },
      diagnostics: {
        providerContracts: []
      }
    },
    viewState: {
      localSecureRefEditor: {
        selectedRef: "ref://projects/{projectId}/providers/openai/api-key",
        status: "saved",
        message: "Saved into the local secure store."
      },
      aimxsEditor: {
        status: "clean",
        message: "Draft ready."
      }
    },
    editorState: {
      projectId: "project-local",
      scopeTenantId: "tenant-local",
      scopeProjectId: "project-local",
      status: "saved",
      syncState: "loaded",
      source: "runtime-endpoint",
      savedAt: "2026-03-15T22:00:00Z",
      appliedAt: "2026-03-15T22:05:00Z",
      hasSavedOverride: true,
      applied: true,
      draft: {
        selectedAgentProfileId: "openai",
        modelRouting: "gateway_first",
        gatewayProviderId: "litellm",
        allowDirectProviderFallback: false,
        profileTransport: "responses_api",
        profileModel: "gpt-5",
        profileEndpointRef: "ref://gateways/litellm/openai",
        profileCredentialRef: "ref://projects/{projectId}/providers/openai/api-key",
        profileCredentialScope: "project",
        profileEnabled: true
      }
    }
  });

  const html = ui.settingsContent.innerHTML;
  assert.match(html, /Preferences And Local Environment/);
  assert.match(html, /Supported Setup And Recovery/);
  assert.match(html, /App Preferences/);
  assert.match(html, /Secure Refs/);
  assert.match(html, /Local Environment/);
  assert.match(html, /Supported Setup/);
  assert.match(html, /Setup Recovery/);
  assert.match(html, /Supported Setup Editor/);
  assert.match(html, /Setup Status/);
  assert.match(html, /Endpoint Inventory/);
  assert.match(html, /data-settings-endpoint-id="integrationsettings"/);
  assert.match(html, /Apply Saved/);
  assert.match(html, /Save Draft/);
  assert.match(html, /Review Audit Trail/);
  assert.match(html, /Show endpoint details/);
  assert.match(html, /Show endpoints and local paths/);
  assert.match(html, /Show advanced provider and credential details/);
  assert.match(html, /data-domain-root="settingsops"/);
  assert.match(html, /data-settings-local-ref-action="save"/);
  assert.match(html, /Activate AIMXS Mode/);
  assert.doesNotMatch(html, /Open Diagnostics/);
  assert.doesNotMatch(html, /reopen Configuration/i);
  assert.doesNotMatch(html, /App Preferences Board/);
  assert.doesNotMatch(html, /Integration Settings Board/);
  assert.doesNotMatch(html, /Settings Workflow Recovery/);
  assert.doesNotMatch(html, /Project Integration Editor/);
  assert.doesNotMatch(html, /Integration Sync Summary/);
  assert.doesNotMatch(html, /Current Identity \+ Authority/);
  assert.doesNotMatch(html, /Current Policy Contract/);
  assert.doesNotMatch(html, /Provider Contract Matrix/);
  assert.doesNotMatch(html, /Local Demo Identity \+ Policy Overlay/);
});

test("settings empty state uses product-language recovery guidance", () => {
  const ui = { settingsContent: { innerHTML: "" } };

  renderSettingsOpsEmptyState(ui);

  assert.match(ui.settingsContent.innerHTML, /Settings/);
  assert.match(ui.settingsContent.innerHTML, /Epydios loads the current workspace configuration/i);
  assert.match(ui.settingsContent.innerHTML, /check launcher status and try again/i);
  assert.doesNotMatch(ui.settingsContent.innerHTML, /runtime endpoint availability/i);
});
