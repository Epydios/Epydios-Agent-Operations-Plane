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
          available: true,
          state: "active",
          activeMode: "aimxs-https",
          selectedProviderId: "aimxs-policy-primary",
          selectedProviderReady: true,
          selectedProviderProbed: true,
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
  assert.match(ui.networkOpsContent.innerHTML, /Routed Route And Boundary/);
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
  assert.match(ui.networkOpsContent.innerHTML, /primary network surface/);
  assert.match(ui.networkOpsContent.innerHTML, /Later bounded network control remains closed\./);
  assert.match(ui.networkOpsContent.innerHTML, /Current Boundary/);
  assert.match(ui.networkOpsContent.innerHTML, /policy route/);
});

test("networkops keeps route-boundary labeling generic in baseline posture", () => {
  const ui = { networkOpsContent: { innerHTML: "" } };
  renderNetworkOpsPage(ui, {
    settings: {
      environment: "local",
      runtimeApiBaseUrl: "http://127.0.0.1:8787",
      registryApiBaseUrl: "http://127.0.0.1:8787/registry",
      endpoints: [
        { id: "tasks", label: "Runtime Tasks", path: "/v1/tasks", state: "ok" }
      ],
      integrations: {
        modelRouting: "gateway_first",
        gatewayProviderId: "litellm",
        allowDirectProviderFallback: false,
        providerContracts: [
          {
            profileId: "managed-codex",
            label: "Managed Codex",
            provider: "openai",
            transport: "responses_api",
            endpointRef: "ref://gateways/litellm/openai-compatible",
            selected: true
          }
        ]
      },
      aimxs: {
        mode: "oss-only",
        activation: {
          state: "inactive",
          activeMode: "oss-only",
          selectedProviderId: "aimxs-policy-primary"
        }
      }
    },
    health: {
      providers: { status: "ok", detail: "All providers are ready." }
    },
    providers: {
      items: [
        { providerId: "aimxs-policy-primary", ready: false, probed: false }
      ]
    },
    runs: {
      items: [
        {
          runId: "run-20260315-004",
          selectedPolicyProvider: "oss-policy-opa",
          updatedAt: "2026-03-15T06:25:00Z"
        }
      ]
    },
    runtimeWorkerCapabilities: {
      items: [
        {
          provider: "openai",
          transport: "wss",
          boundaryRequirements: ["tenant_project_scope"]
        }
      ]
    }
  });

  assert.match(ui.networkOpsContent.innerHTML, /Route And Boundary/);
  assert.match(ui.networkOpsContent.innerHTML, /primary provider-route view/);
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

test("networkops admin slice 3 renders probe queue, draft, scope, preview, receipts, rollback, and bounded history", () => {
  const ui = { networkOpsContent: { innerHTML: "" } };
  renderNetworkOpsPage(ui, {
    settings: {
      environment: "local",
      runtimeApiBaseUrl: "http://127.0.0.1:8787",
      registryApiBaseUrl: "http://127.0.0.1:8787/registry",
      endpoints: [
        { id: "runtime-tasks", label: "Runtime Tasks", path: "/v1/tasks", state: "ok" },
        { id: "runtime-sessions", label: "Runtime Sessions", path: "/v1/sessions", state: "warn" }
      ],
      integrations: {
        modelRouting: "gateway_first",
        gatewayProviderId: "litellm",
        allowDirectProviderFallback: false,
        selectedAgentProfileId: "managed-codex",
        providerContracts: [
          {
            profileId: "managed-codex",
            transport: "responses_api",
            endpointRef: "ref://gateways/litellm/openai-compatible",
            selected: true
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
            bearerTokenSecret: { present: true },
            clientTlsSecret: { present: true },
            caSecret: { present: false }
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
        { providerId: "oss-desktop-openfang-linux", ready: false, probed: true }
      ]
    },
    runs: {
      items: [
        {
          runId: "run-20260317-001",
          selectedPolicyProvider: "aimxs-policy-primary",
          selectedDesktopProvider: "oss-desktop-openfang-linux",
          updatedAt: "2026-03-17T15:20:00Z"
        }
      ]
    },
    runtimeWorkerCapabilities: {
      items: [
        {
          transport: "wss",
          boundaryRequirements: ["tenant_project_scope", "runtime_authz", "audit_emission"]
        }
      ]
    },
    viewState: {
      feedback: {
        tone: "ok",
        message: "Rollback recorded for NetworkOps admin change network-change-queue-001. Recovery receipt admin-rollback-network-001 is now available."
      },
      selectedAdminChangeId: "network-change-queue-001",
      recoveryReason: "Restore the prior bounded network probe baseline after acceptance completes.",
      adminDraft: {
        boundaryPathId: "gateway_path",
        targetScope: "tenant-demo / project-payments",
        targetEndpointId: "runtime-sessions",
        reason: "Validate bounded reachability before any later network control opens."
      },
      queueItems: [
        {
          id: "network-change-queue-001",
          ownerDomain: "networkops",
          kind: "network",
          label: "Probe Request Draft",
          requestedAction: "probe gateway_path runtime-sessions",
          subjectId: "gateway_path",
          subjectLabel: "boundary",
          targetScope: "tenant-demo / project-payments",
          targetLabel: "scope",
          changeKind: "probe",
          boundaryPathId: "gateway_path",
          targetEndpointId: "runtime-sessions",
          status: "applied",
          reason: "Validate bounded reachability before any later network control opens.",
          summary: "Probe Gateway path against Runtime Sessions within tenant-demo / project-payments",
          simulationSummary: "Preview only. This bounded probe request requires GovernanceOps approval before any live network probe can execute.",
          createdAt: "2026-03-17T15:20:30Z",
          simulatedAt: "2026-03-17T15:21:30Z",
          updatedAt: "2026-03-17T15:21:00Z",
          routedAt: "2026-03-17T15:22:00Z",
          decision: {
            decisionId: "admin-decision-network-001",
            status: "approved",
            reason: "Bounded probe approved for truthful runtime verification.",
            decidedAt: "2026-03-17T15:23:00Z",
            approvalReceiptId: "approval-receipt-network-001",
            actorRef: "governance-reviewer@example.com"
          },
          execution: {
            executionId: "admin-execution-network-001",
            executedAt: "2026-03-17T15:24:00Z",
            status: "completed",
            summary: "Executed bounded probe gateway_path -> runtime-sessions within tenant-demo / project-payments.",
            actorRef: "network-operator@example.com"
          },
          receipt: {
            receiptId: "admin-receipt-network-001",
            issuedAt: "2026-03-17T15:24:00Z",
            stableRef: "network-change-queue-001/admin-receipt-network-001",
            approvalReceiptId: "approval-receipt-network-001"
          },
          rollback: {
            rollbackId: "admin-rollback-network-001",
            action: "rollback",
            status: "rolled_back",
            rolledBackAt: "2026-03-17T15:25:00Z",
            stableRef: "network-change-queue-001/admin-rollback-network-001",
            reason: "Restore the prior bounded network probe baseline after acceptance completes.",
            summary: "Rolled back probe gateway_path runtime-sessions for tenant-demo / project-payments.",
            actorRef: "network-operator@example.com",
            approvalReceiptId: "approval-receipt-network-001",
            adminReceiptId: "admin-receipt-network-001",
            executionId: "admin-execution-network-001"
          }
        }
      ],
      latestSimulation: {
        changeId: "network-change-queue-001",
        kind: "network",
        tone: "warn",
        summary: "Preview only. This bounded probe request requires GovernanceOps approval before any live network probe can execute.",
        updatedAt: "2026-03-17T15:21:30Z",
        facts: [
          { label: "boundary", value: "gateway_path", code: true },
          { label: "endpoint", value: "runtime-sessions", code: true }
        ],
        findings: ["Execution remains blocked until GovernanceOps records an explicit approved decision receipt for this network probe proposal."]
      }
    }
  });

  assert.match(ui.networkOpsContent.innerHTML, /Admin Change Queue/);
  assert.match(ui.networkOpsContent.innerHTML, /Probe Request Draft/);
  assert.match(ui.networkOpsContent.innerHTML, /Boundary And Target Scope/);
  assert.match(ui.networkOpsContent.innerHTML, /Impact Preview/);
  assert.match(ui.networkOpsContent.innerHTML, /Governance Route And Receipt/);
  assert.match(ui.networkOpsContent.innerHTML, /Rollback And History/);
  assert.match(ui.networkOpsContent.innerHTML, /network-change-queue-001/);
  assert.match(ui.networkOpsContent.innerHTML, /gateway_path/);
  assert.match(ui.networkOpsContent.innerHTML, /runtime-sessions/);
  assert.match(ui.networkOpsContent.innerHTML, /tenant-demo \/ project-payments/);
  assert.match(ui.networkOpsContent.innerHTML, /Open GovernanceOps/);
  assert.match(ui.networkOpsContent.innerHTML, /apply-approved-change/);
  assert.match(ui.networkOpsContent.innerHTML, /copy-governance-receipt/);
  assert.match(ui.networkOpsContent.innerHTML, /copy-result-receipt/);
  assert.match(ui.networkOpsContent.innerHTML, /rollback-applied-change/);
  assert.match(ui.networkOpsContent.innerHTML, /copy-rollback-receipt/);
  assert.match(ui.networkOpsContent.innerHTML, /data-networkops-admin-recovery-reason/);
  assert.match(ui.networkOpsContent.innerHTML, /approval-receipt-network-001/);
  assert.match(ui.networkOpsContent.innerHTML, /admin-receipt-network-001/);
  assert.match(ui.networkOpsContent.innerHTML, /admin-rollback-network-001/);
  assert.match(ui.networkOpsContent.innerHTML, /Rolled back probe gateway_path runtime-sessions/);
  assert.match(ui.networkOpsContent.innerHTML, /Governance Decision/);
  assert.match(ui.networkOpsContent.innerHTML, /Result Receipt/);
  assert.match(ui.networkOpsContent.innerHTML, /Rollback/);
});
