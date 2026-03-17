import test from "node:test";
import assert from "node:assert/strict";
import { renderPlatformOpsEmptyState, renderPlatformOpsPage } from "../domains/platformops/routes.js";

test("platformops page renders the first inspect-only platform boards", () => {
  const ui = { platformOpsContent: { innerHTML: "" } };
  renderPlatformOpsPage(ui, {
    health: {
      runtime: { status: "ok", detail: "Runtime API reachable." },
      providers: { status: "warn", detail: "One provider is degraded." },
      policy: { status: "ok", detail: "Policy evaluation reachable." }
    },
    pipeline: {
      status: "pass",
      latestStagingGate: "staging-full-gate-20260314T040000Z.log",
      latestProdGate: "prod-full-gate-20260314T041500Z.log"
    },
    providers: {
      items: [
        { providerId: "oss-profile-static", ready: true, probed: true },
        { providerId: "aimxs-policy-primary", ready: true, probed: true },
        { providerId: "oss-desktop-openfang-linux", ready: false, probed: true }
      ]
    },
    aimxsActivation: {
      available: true,
      state: "active",
      namespace: "epydios-system",
      activeMode: "aimxs-full",
      selectedProviderId: "aimxs-policy-primary",
      selectedProviderReady: true,
      selectedProviderProbed: true,
      capabilities: ["policy.evaluate", "governance.handshake_validation", "evidence.policy_decision_refs"],
      warnings: ["Provider CA rotation due soon."],
      enabledProviders: [
        { providerId: "aimxs-policy-primary", ready: true, probed: true },
        { providerId: "aimxs-policy-secondary", ready: false, probed: true }
      ],
      secrets: {
        bearerTokenSecret: { name: "aimxs-policy-token", present: true },
        clientTlsSecret: { name: "epydios-controller-mtls-client", present: true },
        caSecret: { name: "epydios-provider-ca", present: false }
      }
    },
    viewState: {
      feedback: {
        tone: "warn",
        message: "Platform admin proposal platform-change-001 routed to GovernanceOps. Apply remains blocked until an explicit governance approval lands."
      },
      selectedAdminChangeId: "platform-change-001",
      promotionDraft: {
        changeKind: "promote",
        environment: "staging",
        deploymentTarget: "aimxs-full",
        releaseRef: "staging-full-gate-20260314T040000Z.log",
        reason: "Promote the verified staging gate after readiness preview."
      },
      queueItems: [
        {
          id: "platform-change-001",
          ownerDomain: "platformops",
          kind: "platform",
          label: "Promotion Draft",
          requestedAction: "promote staging-full-gate-20260314T040000Z.log",
          subjectId: "staging-full-gate-20260314T040000Z.log",
          subjectLabel: "release",
          targetScope: "staging / aimxs-full",
          targetLabel: "target",
          environment: "staging",
          deploymentTarget: "aimxs-full",
          releaseRef: "staging-full-gate-20260314T040000Z.log",
          status: "routed",
          reason: "Promote the verified staging gate after readiness preview.",
          summary: "Promote staging-full-gate-20260314T040000Z.log to staging / aimxs-full",
          simulationSummary: "Preview only. This promotion proposal requires GovernanceOps approval before any live platform change can execute.",
          updatedAt: "2026-03-16T20:20:00Z",
          routedAt: "2026-03-16T20:21:00Z"
        }
      ],
      latestSimulation: {
        changeId: "platform-change-001",
        kind: "platform",
        tone: "warn",
        title: "Platform admin dry-run",
        summary: "Preview only. This promotion proposal requires GovernanceOps approval before any live platform change can execute.",
        updatedAt: "2026-03-16T20:19:00Z",
        facts: [
          { label: "release", value: "staging-full-gate-20260314T040000Z.log", code: true },
          { label: "environment", value: "staging" },
          { label: "deployment", value: "aimxs-full", code: true },
          { label: "issues", value: "1" }
        ],
        findings: [
          "Execution remains blocked until GovernanceOps records an explicit approved decision receipt for this platform proposal.",
          "One or more provider registrations remain degraded."
        ]
      }
    }
  });

  assert.match(ui.platformOpsContent.innerHTML, /data-domain-root="platformops"/);
  assert.match(ui.platformOpsContent.innerHTML, /Environment Overview/);
  assert.match(ui.platformOpsContent.innerHTML, /Deployment Posture/);
  assert.match(ui.platformOpsContent.innerHTML, /Dependency Readiness/);
  assert.match(ui.platformOpsContent.innerHTML, /Provider Registration/);
  assert.match(ui.platformOpsContent.innerHTML, /AIMXS Bridge Readiness/);
  assert.match(ui.platformOpsContent.innerHTML, /AIMXS Route And Boundary/);
  assert.match(ui.platformOpsContent.innerHTML, /Release Readiness/);
  assert.match(ui.platformOpsContent.innerHTML, /Support Posture/);
  assert.match(ui.platformOpsContent.innerHTML, /desktop-local/);
  assert.match(ui.platformOpsContent.innerHTML, /epydios-system/);
  assert.match(ui.platformOpsContent.innerHTML, /staging/);
  assert.match(ui.platformOpsContent.innerHTML, /aimxs-full/);
  assert.match(ui.platformOpsContent.innerHTML, /aimxs-policy-primary/);
  assert.match(ui.platformOpsContent.innerHTML, /staging-full-gate-20260314T040000Z\.log/);
  assert.match(ui.platformOpsContent.innerHTML, /prod-full-gate-20260314T041500Z\.log/);
  assert.match(ui.platformOpsContent.innerHTML, /enabled aimxs/);
  assert.match(ui.platformOpsContent.innerHTML, /warnings=1/);
  assert.match(ui.platformOpsContent.innerHTML, /signals=3/);
  assert.match(ui.platformOpsContent.innerHTML, /issues=1/);
  assert.match(ui.platformOpsContent.innerHTML, /first degraded/);
  assert.match(ui.platformOpsContent.innerHTML, /oss-desktop-openfang-linux/);
  assert.match(ui.platformOpsContent.innerHTML, /secrets missing=1/);
  assert.match(ui.platformOpsContent.innerHTML, /Provider CA rotation due soon\./);
  assert.match(ui.platformOpsContent.innerHTML, /Runtime API reachable\./);
  assert.match(ui.platformOpsContent.innerHTML, /One provider is degraded\./);
  assert.match(ui.platformOpsContent.innerHTML, /primary platform surface/);
  assert.match(ui.platformOpsContent.innerHTML, /Route And Provider Chain/);
  assert.match(ui.platformOpsContent.innerHTML, /deployment target/);
  assert.match(ui.platformOpsContent.innerHTML, /Allowed Or Constrained/);
  assert.match(ui.platformOpsContent.innerHTML, /Admin Change Queue/);
  assert.match(ui.platformOpsContent.innerHTML, /Promotion Draft/);
  assert.match(ui.platformOpsContent.innerHTML, /Environment And Deployment Scope/);
  assert.match(ui.platformOpsContent.innerHTML, /Readiness And Impact Preview/);
  assert.match(ui.platformOpsContent.innerHTML, /Governance Route And Receipt/);
  assert.match(ui.platformOpsContent.innerHTML, /Rollback And History/);
  assert.match(ui.platformOpsContent.innerHTML, /Platform admin proposal platform-change-001 routed to GovernanceOps/);
  assert.match(ui.platformOpsContent.innerHTML, /Route To Governance|Open GovernanceOps/);
  assert.match(ui.platformOpsContent.innerHTML, /Run Dry-Run/);
  assert.match(ui.platformOpsContent.innerHTML, /staging \/ aimxs-full/);
  assert.match(ui.platformOpsContent.innerHTML, /Promote staging-full-gate-20260314T040000Z\.log to staging \/ aimxs-full/);
  assert.match(ui.platformOpsContent.innerHTML, /Execution remains blocked until GovernanceOps records an explicit approved decision receipt/);
  assert.match(ui.platformOpsContent.innerHTML, /One or more provider registrations remain degraded\./);
});

test("platformops page renders apply and receipt actions for approved platform admin proposals", () => {
  const ui = { platformOpsContent: { innerHTML: "" } };
  renderPlatformOpsPage(ui, {
    health: {
      runtime: { status: "ok", detail: "Runtime API reachable." },
      providers: { status: "ok", detail: "Providers are healthy." },
      policy: { status: "ok", detail: "Policy evaluation reachable." }
    },
    pipeline: {
      status: "pass",
      latestStagingGate: "staging-full-gate-20260314T040000Z.log",
      latestProdGate: "prod-full-gate-20260314T041500Z.log"
    },
    providers: {
      items: [{ providerId: "aimxs-policy-primary", ready: true, probed: true }]
    },
    aimxsActivation: {
      available: true,
      state: "active",
      namespace: "epydios-system",
      activeMode: "aimxs-full",
      selectedProviderId: "aimxs-policy-primary",
      selectedProviderReady: true,
      selectedProviderProbed: true,
      capabilities: ["policy.evaluate"],
      warnings: [],
      enabledProviders: [{ providerId: "aimxs-policy-primary", ready: true, probed: true }],
      secrets: {
        bearerTokenSecret: { name: "aimxs-policy-token", present: true }
      }
    },
    viewState: {
      selectedAdminChangeId: "platform-change-apply-001",
      promotionDraft: {
        changeKind: "promote",
        environment: "staging",
        deploymentTarget: "aimxs-full",
        releaseRef: "staging-full-gate-20260314T040000Z.log",
        reason: "Promote the verified staging gate after governance approval."
      },
      queueItems: [
        {
          id: "platform-change-apply-001",
          ownerDomain: "platformops",
          kind: "platform",
          label: "Promotion Draft",
          requestedAction: "promote staging-full-gate-20260314T040000Z.log",
          subjectId: "staging-full-gate-20260314T040000Z.log",
          subjectLabel: "release",
          targetScope: "staging / aimxs-full",
          targetLabel: "target",
          environment: "staging",
          deploymentTarget: "aimxs-full",
          releaseRef: "staging-full-gate-20260314T040000Z.log",
          status: "approved",
          reason: "Promote the verified staging gate after governance approval.",
          summary: "Promote staging-full-gate-20260314T040000Z.log to staging / aimxs-full",
          simulationSummary: "Preview only. This promotion proposal requires GovernanceOps approval before any live platform change can execute.",
          updatedAt: "2026-03-16T22:15:00Z",
          routedAt: "2026-03-16T22:10:00Z",
          decision: {
            decisionId: "admin-decision-001",
            status: "approved",
            reason: "Readiness preview and governance checks are green.",
            decidedAt: "2026-03-16T22:12:00Z",
            approvalReceiptId: "approval-receipt-001",
            actorRef: "governance-reviewer"
          }
        }
      ],
      latestSimulation: {
        changeId: "platform-change-apply-001",
        kind: "platform",
        tone: "info",
        title: "Platform admin dry-run",
        summary: "Preview only. This promotion proposal requires GovernanceOps approval before any live platform change can execute.",
        updatedAt: "2026-03-16T22:09:00Z",
        facts: [
          { label: "release", value: "staging-full-gate-20260314T040000Z.log", code: true }
        ],
        findings: []
      }
    }
  });

  assert.match(ui.platformOpsContent.innerHTML, /Apply Approved Change/);
  assert.match(ui.platformOpsContent.innerHTML, /Copy Governance Receipt/);
  assert.match(ui.platformOpsContent.innerHTML, /Copy Admin Receipt/);
  assert.match(ui.platformOpsContent.innerHTML, /approval-receipt-001/);
  assert.match(ui.platformOpsContent.innerHTML, /Readiness preview and governance checks are green\./);
});

test("platformops page renders rollback and bounded history for applied platform admin changes", () => {
  const ui = { platformOpsContent: { innerHTML: "" } };
  renderPlatformOpsPage(ui, {
    health: {
      runtime: { status: "ok", detail: "Runtime API reachable." },
      providers: { status: "ok", detail: "Providers are healthy." },
      policy: { status: "ok", detail: "Policy evaluation reachable." }
    },
    pipeline: {
      status: "pass",
      latestStagingGate: "staging-full-gate-20260314T040000Z.log",
      latestProdGate: "prod-full-gate-20260314T041500Z.log"
    },
    providers: {
      items: [{ providerId: "aimxs-policy-primary", ready: true, probed: true }]
    },
    aimxsActivation: {
      available: true,
      state: "active",
      namespace: "epydios-system",
      activeMode: "aimxs-full",
      selectedProviderId: "aimxs-policy-primary",
      selectedProviderReady: true,
      selectedProviderProbed: true,
      capabilities: ["policy.evaluate"],
      warnings: [],
      enabledProviders: [{ providerId: "aimxs-policy-primary", ready: true, probed: true }],
      secrets: {
        bearerTokenSecret: { name: "aimxs-policy-token", present: true }
      }
    },
    viewState: {
      selectedAdminChangeId: "platform-change-rollback-001",
      recoveryReason: "Rollback is required after downstream verification drift was detected.",
      promotionDraft: {
        changeKind: "promote",
        environment: "staging",
        deploymentTarget: "aimxs-full",
        releaseRef: "staging-full-gate-20260314T040000Z.log",
        reason: "Promote the verified staging gate after governance approval."
      },
      queueItems: [
        {
          id: "platform-change-rollback-001",
          ownerDomain: "platformops",
          kind: "platform",
          label: "Promotion Draft",
          requestedAction: "promote staging-full-gate-20260314T040000Z.log",
          subjectId: "staging-full-gate-20260314T040000Z.log",
          subjectLabel: "release",
          targetScope: "staging / aimxs-full",
          targetLabel: "target",
          environment: "staging",
          deploymentTarget: "aimxs-full",
          releaseRef: "staging-full-gate-20260314T040000Z.log",
          status: "rolled_back",
          reason: "Promote the verified staging gate after governance approval.",
          summary: "Promote staging-full-gate-20260314T040000Z.log to staging / aimxs-full",
          simulationSummary: "Preview only. This promotion proposal requires GovernanceOps approval before any live platform change can execute.",
          createdAt: "2026-03-16T22:00:00Z",
          simulatedAt: "2026-03-16T22:05:00Z",
          updatedAt: "2026-03-16T22:16:00Z",
          routedAt: "2026-03-16T22:10:00Z",
          decision: {
            decisionId: "admin-decision-rollback-001",
            status: "approved",
            reason: "Readiness preview and governance checks are green.",
            decidedAt: "2026-03-16T22:12:00Z",
            approvalReceiptId: "approval-receipt-rollback-001",
            actorRef: "governance-reviewer"
          },
          execution: {
            executionId: "admin-execution-rollback-001",
            executedAt: "2026-03-16T22:13:00Z",
            status: "applied",
            summary: "promote staging-full-gate-20260314T040000Z.log applied for staging / aimxs-full.",
            actorRef: "platform-operator"
          },
          receipt: {
            receiptId: "admin-receipt-rollback-001",
            issuedAt: "2026-03-16T22:13:00Z",
            summary: "promote staging-full-gate-20260314T040000Z.log applied for staging / aimxs-full.",
            stableRef: "platform-change-rollback-001/admin-receipt-rollback-001",
            approvalReceiptId: "approval-receipt-rollback-001",
            executionId: "admin-execution-rollback-001"
          },
          rollback: {
            rollbackId: "admin-rollback-rollback-001",
            action: "rollback",
            status: "rolled_back",
            rolledBackAt: "2026-03-16T22:16:00Z",
            summary: "Rolled back promote staging-full-gate-20260314T040000Z.log for staging / aimxs-full using staging-full-gate-20260314T040000Z.log.",
            stableRef: "platform-change-rollback-001/admin-rollback-rollback-001",
            reason: "Rollback is required after downstream verification drift was detected.",
            actorRef: "platform-operator",
            approvalReceiptId: "approval-receipt-rollback-001",
            adminReceiptId: "admin-receipt-rollback-001",
            executionId: "admin-execution-rollback-001"
          }
        }
      ],
      latestSimulation: {
        changeId: "platform-change-rollback-001",
        kind: "platform",
        tone: "info",
        title: "Platform admin dry-run",
        summary: "Preview only. This promotion proposal requires GovernanceOps approval before any live platform change can execute.",
        updatedAt: "2026-03-16T22:09:00Z",
        facts: [
          { label: "release", value: "staging-full-gate-20260314T040000Z.log", code: true }
        ],
        findings: []
      }
    }
  });

  assert.match(ui.platformOpsContent.innerHTML, /Rollback And History/);
  assert.match(ui.platformOpsContent.innerHTML, /Copy Rollback Receipt/);
  assert.match(ui.platformOpsContent.innerHTML, /admin-rollback-rollback-001/);
  assert.match(ui.platformOpsContent.innerHTML, /rolled_back/);
  assert.match(ui.platformOpsContent.innerHTML, /Rollback is required after downstream verification drift was detected\./);
  assert.match(ui.platformOpsContent.innerHTML, /Rollback/);
});

test("platformops empty state renders without loaded platform context", () => {
  const ui = { platformOpsContent: { innerHTML: "" } };
  renderPlatformOpsEmptyState(ui, {
    title: "PlatformOps",
    message: "Platform posture becomes available after environment, deployment, and dependency signals load."
  });

  assert.match(ui.platformOpsContent.innerHTML, /PlatformOps/);
  assert.match(ui.platformOpsContent.innerHTML, /Platform posture becomes available/);
});
