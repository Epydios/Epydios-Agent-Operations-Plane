import test from "node:test";
import assert from "node:assert/strict";
import { renderDeveloperOpsEmptyState, renderDeveloperOpsPage } from "../domains/developerops/routes.js";

test("developerops page renders bounded debug, raw payload, and contract boards", () => {
  const ui = { developerOpsContent: { innerHTML: "" } };
  renderDeveloperOpsPage(ui, {
    session: {
      claims: {
        sub: "operator@example.com",
        project_id: "project-core"
      }
    },
    projectScope: "project-core",
    selectedAgentProfileId: "managed-codex",
    advancedVisible: false,
    health: {
      runtime: { status: "ok" },
      providers: { status: "warn" },
      policy: { status: "ok" }
    },
    providers: {
      items: [
        { providerId: "openai", ready: true, probed: true },
        { providerId: "desktop", ready: false, probed: true }
      ]
    },
    runs: {
      items: [{ runId: "run-20260315-007" }, { runId: "run-20260315-006" }]
    },
    terminalHistory: [
      { id: "term-1" },
      { id: "term-2" }
    ],
    settings: {
      integrations: {
        selectedAgentProfileId: "managed-codex",
        providerContracts: [
          {
            profileId: "managed-codex",
            provider: "openai",
            transport: "responses_api",
            endpointRef: "ref://gateways/litellm/openai-compatible",
            selected: true
          }
        ]
      },
      identity: {
        authorityBasis: "runtime_context_identity",
        source: "runtime-endpoint",
        identity: {
          subject: "operator@example.com",
          effectivePermissions: ["runs.read", "audit.read"]
        }
      },
      policyCatalog: {
        count: 4
      },
      aimxs: {
        mode: "aimxs-full",
        activation: {
          activeMode: "aimxs-full",
          selectedProviderId: "aimxs-policy-primary",
          state: "active"
        }
      }
    },
    governedActionPreview: {
      issues: [{ severity: "warn", message: "Handshake is disabled." }],
      payload: {
        meta: {
          requestId: "req-governed-001",
          tenantId: "tenant-demo",
          projectId: "project-core"
        },
        action: { target: "paper-broker-order" },
        context: { governed_action: { risk_tier: "high" } },
        task: { requestLabel: "Paper Trade Request: AAPL", demoProfile: "finance_paper_trade" },
        resource: { kind: "broker-order", id: "paper-order-aapl" }
      }
    },
    runBuilderPreview: {
      issues: [],
      payload: {
        meta: {
          requestId: "req-run-001",
          tenantId: "tenant-demo",
          projectId: "project-core"
        },
        action: { target: "desktop-sandbox" },
        dryRun: false,
        desktop: {
          tier: 2,
          targetExecutionProfile: "sandbox_vm_autonomous",
          targetOS: "linux",
          requestedCapabilities: ["observe.window_metadata", "actuate.window_focus"]
        }
      }
    },
    terminalPreview: {
      issues: [{ severity: "error", message: "Run ID required." }],
      payload: {
        meta: {
          requestId: "term-001",
          tenantId: "tenant-demo",
          projectId: "project-core"
        },
        scope: { runId: "run-20260315-007" },
        command: {
          text: "kubectl get pods",
          cwd: "/workspace",
          timeoutSeconds: 60,
          readOnlyRequested: true
        },
        safety: {
          terminalMode: "interactive_sandbox_only",
          restrictedHostMode: "blocked"
        },
        provenance: {
          commandTag: "cmd-1234abcd"
        }
      }
    }
  });

  assert.match(ui.developerOpsContent.innerHTML, /data-domain-root="developerops"/);
  assert.match(ui.developerOpsContent.innerHTML, /Debug Tools Board/);
  assert.match(ui.developerOpsContent.innerHTML, /Raw Payload Board/);
  assert.match(ui.developerOpsContent.innerHTML, /Contract Lab/);
  assert.match(ui.developerOpsContent.innerHTML, /project-core/);
  assert.match(ui.developerOpsContent.innerHTML, /managed-codex/);
  assert.match(ui.developerOpsContent.innerHTML, /advanced=hidden/);
  assert.match(ui.developerOpsContent.innerHTML, /req-governed-001/);
  assert.match(ui.developerOpsContent.innerHTML, /req-run-001/);
  assert.match(ui.developerOpsContent.innerHTML, /term-001/);
  assert.match(ui.developerOpsContent.innerHTML, /cmd-1234abcd/);
  assert.match(ui.developerOpsContent.innerHTML, /runtime_context_identity/);
  assert.match(ui.developerOpsContent.innerHTML, /responses_api/);
  assert.match(ui.developerOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.developerOpsContent.innerHTML, /interactive_sandbox_only/);
  assert.match(ui.developerOpsContent.innerHTML, /paper-broker-order/);
});

test("developerops empty state renders without loaded debug posture", () => {
  const ui = { developerOpsContent: { innerHTML: "" } };
  renderDeveloperOpsEmptyState(ui, {
    title: "Diagnostics",
    message: "Diagnostics become available after Epydios loads runtime, settings, and inspection context."
  });

  assert.match(ui.developerOpsContent.innerHTML, /Diagnostics/);
  assert.match(ui.developerOpsContent.innerHTML, /loads runtime, settings, and inspection context/i);
});
