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
    }
  });

  assert.match(ui.platformOpsContent.innerHTML, /data-domain-root="platformops"/);
  assert.match(ui.platformOpsContent.innerHTML, /Environment Overview/);
  assert.match(ui.platformOpsContent.innerHTML, /Deployment Posture/);
  assert.match(ui.platformOpsContent.innerHTML, /Dependency Readiness/);
  assert.match(ui.platformOpsContent.innerHTML, /Provider Registration/);
  assert.match(ui.platformOpsContent.innerHTML, /AIMXS Bridge Readiness/);
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
