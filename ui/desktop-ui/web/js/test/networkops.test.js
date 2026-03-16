import test from "node:test";
import assert from "node:assert/strict";
import { renderNetworkOpsEmptyState, renderNetworkOpsPage } from "../domains/networkops/routes.js";

test("networkops page renders bounded boundary, endpoint, trust, posture, and topology boards", () => {
  const ui = { networkOpsContent: { innerHTML: "" } };
  renderNetworkOpsPage(ui, {
    settings: {
      environment: "local",
      runtimeApiBaseUrl: "http://127.0.0.1:8787",
      registryApiBaseUrl: "http://127.0.0.1:8787/registry",
      endpoints: [
        { id: "tasks", label: "Runtime Tasks", path: "/v1/tasks", state: "ok" },
        { id: "sessions", label: "Runtime Sessions", path: "/v1/sessions", state: "warn" },
        { id: "auditEvents", label: "Runtime Audit Events", path: "/v1/audit/events", state: "error" }
      ],
      integrations: {
        modelRouting: "gateway_first",
        gatewayProviderId: "litellm",
        gatewayTokenRef: "ref://gateways/litellm/token",
        gatewayMtlsCertRef: "ref://gateways/litellm/mtls-cert",
        gatewayMtlsKeyRef: "ref://gateways/litellm/mtls-key",
        allowDirectProviderFallback: false,
        selectedAgentProfileId: "managed-codex",
        providerContracts: [
          {
            profileId: "managed-codex",
            label: "Managed Codex",
            provider: "openai",
            transport: "responses_api",
            endpointRef: "ref://gateways/litellm/openai-compatible",
            selected: true
          },
          {
            profileId: "anthropic-chat",
            label: "Anthropic",
            provider: "anthropic",
            transport: "messages_api",
            endpointRef: "ref://gateways/litellm/anthropic"
          }
        ]
      },
      aimxs: {
        mode: "aimxs-https",
        endpointRef: "ref://projects/demo/providers/aimxs/https-endpoint",
        bearerTokenRef: "ref://projects/demo/providers/aimxs/bearer-token",
        clientTlsCertRef: "ref://projects/demo/providers/aimxs/client-tls-cert",
        clientTlsKeyRef: "ref://projects/demo/providers/aimxs/client-tls-key",
        caCertRef: "ref://projects/demo/providers/aimxs/provider-ca",
        activation: {
          state: "active",
          activeMode: "aimxs-https",
          selectedProviderId: "aimxs-policy-primary",
          warnings: ["Provider CA rotation due soon."],
          secrets: {
            bearerTokenSecret: { name: "aimxs-policy-token", present: true },
            clientTlsSecret: { name: "epydios-controller-mtls-client", present: true },
            caSecret: { name: "epydios-provider-ca", present: false }
          }
        }
      }
    },
    health: {
      providers: { status: "warn", detail: "One provider is degraded." }
    },
    providers: {
      items: [
        { providerId: "aimxs-policy-primary", ready: true, probed: true },
        { providerId: "oss-policy-opa", ready: true, probed: true },
        { providerId: "oss-desktop-openfang-linux", ready: false, probed: true }
      ]
    },
    runs: {
      items: [
        {
          runId: "run-20260315-003",
          selectedProfileProvider: "oss-profile-static",
          selectedPolicyProvider: "aimxs-policy-primary",
          selectedEvidenceProvider: "oss-evidence-memory",
          selectedDesktopProvider: "oss-desktop-openfang-linux",
          updatedAt: "2026-03-15T06:20:00Z"
        },
        {
          runId: "run-20260315-002",
          selectedPolicyProvider: "oss-policy-opa",
          updatedAt: "2026-03-15T06:15:00Z"
        }
      ]
    },
    runtimeWorkerCapabilities: {
      items: [
        {
          provider: "openai",
          transport: "wss",
          boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission"]
        },
        {
          provider: "desktop",
          transport: "local",
          boundaryRequirements: ["governed_tool_execution", "audit_emission"]
        }
      ]
    }
  });

  assert.match(ui.networkOpsContent.innerHTML, /data-domain-root="networkops"/);
  assert.match(ui.networkOpsContent.innerHTML, /Network Boundary Board/);
  assert.match(ui.networkOpsContent.innerHTML, /Endpoint Reachability Board/);
  assert.match(ui.networkOpsContent.innerHTML, /Trust And Certificate Board/);
  assert.match(ui.networkOpsContent.innerHTML, /Egress And Ingress Posture Board/);
  assert.match(ui.networkOpsContent.innerHTML, /Connectivity Topology Board/);
  assert.match(ui.networkOpsContent.innerHTML, /gateway_first/);
  assert.match(ui.networkOpsContent.innerHTML, /litellm/);
  assert.match(ui.networkOpsContent.innerHTML, /routes=6/);
  assert.match(ui.networkOpsContent.innerHTML, /boundaries=4/);
  assert.match(ui.networkOpsContent.innerHTML, /ingress=2/);
  assert.match(ui.networkOpsContent.innerHTML, /egress=2/);
  assert.match(ui.networkOpsContent.innerHTML, /fallback=bounded/);
  assert.match(ui.networkOpsContent.innerHTML, /reachable endpoints/);
  assert.match(ui.networkOpsContent.innerHTML, /Gateway path/);
  assert.match(ui.networkOpsContent.innerHTML, /Policy path/);
  assert.match(ui.networkOpsContent.innerHTML, /Desktop path/);
  assert.match(ui.networkOpsContent.innerHTML, /aimxs-https/);
  assert.match(ui.networkOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.networkOpsContent.innerHTML, /One provider is degraded\./);
  assert.match(ui.networkOpsContent.innerHTML, /Runtime Tasks/);
  assert.match(ui.networkOpsContent.innerHTML, /Runtime Sessions/);
  assert.match(ui.networkOpsContent.innerHTML, /Runtime Audit Events/);
  assert.match(ui.networkOpsContent.innerHTML, /ref:\/\/gateways\/litellm\/openai-compatible/);
  assert.match(ui.networkOpsContent.innerHTML, /ref:\/\/projects\/demo\/providers\/aimxs\/https-endpoint/);
  assert.match(ui.networkOpsContent.innerHTML, /MTLSAndBearerTokenSecret/);
  assert.match(ui.networkOpsContent.innerHTML, /secrets missing=1/);
  assert.match(ui.networkOpsContent.innerHTML, /Provider CA rotation due soon\./);
});

test("networkops empty state renders without loaded network posture", () => {
  const ui = { networkOpsContent: { innerHTML: "" } };
  renderNetworkOpsEmptyState(ui, {
    title: "NetworkOps",
    message: "Network posture becomes available after boundary, endpoint, and trust signals load."
  });

  assert.match(ui.networkOpsContent.innerHTML, /NetworkOps/);
  assert.match(ui.networkOpsContent.innerHTML, /Network posture becomes available/);
});
