import test from "node:test";
import assert from "node:assert/strict";
import {
  AIMXS_ACTIVATION_SECRET_NAMES,
  AIMXS_OVERRIDE_KEY,
  applyAimxsOverrideToChoices,
  buildDefaultAimxsActivationSnapshot,
  collectAimxsSecureRefItems,
  describeAimxsAppliedMessage,
  normalizeAimxsActivationSnapshot,
  normalizeAimxsOverride,
  resolveAimxsContractProfile,
  summarizeAimxsStatus,
  validateAimxsOverride
} from "../aimxs/state.js";
import { renderAimxsSettingsMetric, renderAimxsStatusMetric } from "../aimxs/settings-view.js";

test("aimxs state keeps only the allowed mode set", () => {
  const normalized = normalizeAimxsOverride(
    {
      mode: "aimxs-https",
      endpointRef: "ref://projects/demo/providers/aimxs/https-endpoint"
    },
    {
      paymentEntitled: true
    }
  );
  const legacy = normalizeAimxsOverride({ mode: "unexpected-mode" }, {});

  assert.equal(AIMXS_OVERRIDE_KEY, "epydios.agentops.desktop.aimxs.override.v1");
  assert.equal(normalized.mode, "aimxs-https");
  assert.equal(legacy.mode, "oss-only");
  assert.equal(normalized.paymentEntitled, true);
});

test("baseline mode renders baseline labels while keeping internal ids", () => {
  const settings = {
    aimxs: {
      paymentEntitled: false,
      mode: "oss-only",
      state: "ready",
      detail: "1/1 policy providers are ready.",
      providerIds: ["oss-policy-opa"],
      activation: {
        available: true,
        state: "active",
        message: "AIMXS activation switched the live policy-provider path to oss-only.",
        namespace: "epydios-system",
        activeMode: "oss-only",
        selectedProviderId: "oss-policy-opa",
        selectedProviderName: "oss-policy-opa",
        selectedProviderReady: true,
        selectedProviderProbed: true
      }
    }
  };
  const metric = renderAimxsSettingsMetric(settings, {}, {
    chipClassForEditorStatus: () => "chip chip-neutral",
    selectedAttr: (value, expected) => (value === expected ? "selected" : "")
  });

  assert.equal(resolveAimxsContractProfile(settings.aimxs).deploymentLabel, "baseline");
  assert.equal(
    describeAimxsAppliedMessage(settings.aimxs),
    "AIMXS is set to baseline; policy routing stays on the baseline provider path."
  );
  assert.match(metric, /mode=baseline/);
  assert.match(metric, /selectedPolicyProvider=baseline/);
  assert.match(metric, />baseline<\/option>/);
  assert.doesNotMatch(metric, />oss-only<\/option>/);
});

test("aimxs full mode stays valid without secure refs", () => {
  const normalized = normalizeAimxsOverride({ mode: "aimxs-full" }, {});
  const validation = validateAimxsOverride({ mode: "aimxs-full" }, { paymentEntitled: false });

  assert.equal(normalized.mode, "aimxs-full");
  assert.equal(validation.valid, true);
  assert.match(validation.warnings.join(" "), /does not require https/i);
  assert.deepEqual(resolveAimxsContractProfile({ mode: "aimxs-full" }), {
    mode: "aimxs-full",
    providerId: "aimxs-full",
    authMode: "None",
    healthPath: "/healthz",
    capabilitiesPath: "/v1alpha1/capabilities",
    contractVersion: "v1alpha1",
    deploymentLabel: "aimxs-full",
    summary: "Full AIMXS local provider shim for the Desktop/runtime stack with no HTTPS or cluster secret dependency."
  });
});

test("aimxs https mode requires entitlement and secure refs", () => {
  const validation = validateAimxsOverride(
    {
      mode: "aimxs-https",
      endpointRef: "https://example.com",
      bearerTokenRef: "raw-token",
      clientTlsCertRef: "ref://projects/demo/providers/aimxs/client-tls-cert",
      clientTlsKeyRef: "",
      caCertRef: ""
    },
    {
      paymentEntitled: false
    }
  );

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /payment entitlement/i);
  assert.match(validation.errors.join(" "), /must use ref:\/\//i);
});

test("aimxs provider status summarizes ready and missing providers", () => {
  const ready = summarizeAimxsStatus({
    items: [
      {
        providerId: "aimxs-policy-primary",
        ready: true,
        probed: true
      }
    ]
  });
  const missing = summarizeAimxsStatus({ items: [] });

  assert.equal(ready.state, "ready");
  assert.deepEqual(ready.providerIds, ["aimxs-policy-primary"]);
  assert.equal(missing.state, "not_configured");
});

test("aimxs full rendering shows local mode and no secure ref collection", () => {
  const settings = {
    aimxs: {
      paymentEntitled: false,
      mode: "aimxs-full",
      state: "ready",
      detail: "1/1 AIMXS providers are ready.",
      providerIds: ["aimxs-full"],
      endpointRef: "ref://projects/demo/providers/aimxs/https-endpoint",
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
    }
  };
  const metric = renderAimxsSettingsMetric(settings, {}, {
    chipClassForEditorStatus: () => "chip chip-neutral",
    selectedAttr: (value, expected) => (value === expected ? "selected" : "")
  });
  const status = renderAimxsStatusMetric(settings, () => "chip chip-ok");
  const refs = collectAimxsSecureRefItems(settings);

  assert.match(metric, /aimxs-full/);
  assert.match(metric, /clusterMode=aimxs-full/);
  assert.match(metric, /clusterSecrets=not required for aimxs-full/);
  assert.match(metric, /Activate AIMXS Mode/);
  assert.match(status, /AIMXS Provider Status/);
  assert.equal(refs.length, 0);
  assert.equal(
    describeAimxsAppliedMessage(settings.aimxs),
    "AIMXS is set to aimxs-full on the local provider shim; HTTPS and secure refs are not required in this mode."
  );
});

test("aimxs https rendering still surfaces secure refs", () => {
  const settings = {
    aimxs: {
      paymentEntitled: true,
      mode: "aimxs-https",
      state: "ready",
      detail: "1/1 AIMXS providers are ready.",
      providerIds: ["aimxs-policy-primary"],
      endpointRef: "ref://projects/demo/providers/aimxs/https-endpoint",
      bearerTokenRef: "ref://projects/demo/providers/aimxs/bearer-token",
      clientTlsCertRef: "ref://projects/demo/providers/aimxs/client-tls-cert",
      clientTlsKeyRef: "ref://projects/demo/providers/aimxs/client-tls-key",
      caCertRef: "ref://projects/demo/providers/aimxs/provider-ca",
      activation: {
        available: true,
        state: "active",
        message: "AIMXS activation switched the live policy-provider path to aimxs-https.",
        namespace: "epydios-system",
        activeMode: "aimxs-https",
        selectedProviderId: "aimxs-policy-primary",
        selectedProviderName: "aimxs-policy-primary",
        selectedProviderReady: true,
        selectedProviderProbed: true,
        capabilities: [
          "policy.evaluate",
          "policy.validate_bundle",
          "governance.handshake_validation"
        ],
        enabledProviders: [
          {
            name: "aimxs-policy-primary",
            providerId: "aimxs-policy-primary",
            mode: "aimxs-https",
            enabled: true,
            ready: true,
            probed: true,
            priority: 900,
            authMode: "MTLSAndBearerTokenSecret"
          }
        ],
        secrets: {
          bearerTokenSecret: { name: "aimxs-policy-token", present: true },
          clientTlsSecret: { name: "epydios-controller-mtls-client", present: true },
          caSecret: { name: "epydios-provider-ca", present: true }
        }
      }
    }
  };
  const metric = renderAimxsSettingsMetric(settings, { aimxsEditor: { status: "dirty" } }, {
    chipClassForEditorStatus: () => "chip chip-warn",
    selectedAttr: (value, expected) => (value === expected ? "selected" : "")
  });
  const refs = collectAimxsSecureRefItems(settings);

  assert.match(metric, /aimxs-https/);
  assert.match(metric, /clusterMode=aimxs-https/);
  assert.equal(refs.length, 5);
  assert.deepEqual(resolveAimxsContractProfile(settings.aimxs), {
    mode: "aimxs-https",
    providerId: "aimxs-policy-primary",
    authMode: "MTLSAndBearerTokenSecret",
    healthPath: "/healthz",
    capabilitiesPath: "/v1alpha1/capabilities",
    contractVersion: "v1alpha1",
    deploymentLabel: "aimxs-https",
    summary: "Secure AIMXS HTTPS path with bearer token, client TLS, and provider CA trust."
  });
});

test("aimxs settings disables activation controls when helper is unavailable", () => {
  const settings = {
    aimxs: {
      paymentEntitled: true,
      mode: "aimxs-full",
      state: "ready",
      providerIds: ["aimxs-policy-primary"],
      activation: {
        available: false,
        state: "unavailable",
        message: "AIMXS activation helper is unavailable on this launcher."
      }
    }
  };

  const metric = renderAimxsSettingsMetric(settings, {}, {
    chipClassForEditorStatus: () => "chip chip-neutral",
    selectedAttr: (value, expected) => (value === expected ? "selected" : "")
  });

  assert.match(metric, /data-settings-aimxs-action="activate"[^>]*disabled/);
  assert.match(metric, /data-settings-aimxs-action="refresh-activation"[^>]*disabled/);
  assert.match(metric, /AIMXS activation helper is unavailable on this launcher\./);
});

test("aimxs overrides apply without mutating the base choice object", () => {
  const baseChoices = {
    integrations: {
      selectedAgentProfileId: "codex"
    },
    aimxs: {
      paymentEntitled: true,
      mode: "oss-only"
    }
  };
  const next = applyAimxsOverrideToChoices(baseChoices, {
    mode: "aimxs-https",
    endpointRef: "ref://projects/demo/providers/aimxs/https-endpoint"
  });

  assert.equal(baseChoices.aimxs.mode, "oss-only");
  assert.equal(next.aimxs.mode, "aimxs-https");
});

test("aimxs activation snapshot normalizes helper state and defaults", () => {
  const fallback = buildDefaultAimxsActivationSnapshot();
  const snapshot = normalizeAimxsActivationSnapshot({
    available: true,
    state: "ACTIVE",
    activeMode: "aimxs-https",
    requestedMode: "aimxs-https",
    selectedProviderId: "aimxs-policy-primary",
    enabledProviders: [
      {
        name: "aimxs-policy-primary",
        providerId: "aimxs-policy-primary",
        mode: "aimxs-https",
        enabled: true,
        ready: true,
        probed: true,
        priority: 900
      }
    ]
  });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.state, "active");
  assert.equal(snapshot.activeMode, "aimxs-https");
  assert.equal(snapshot.requestedMode, "aimxs-https");
  assert.equal(snapshot.enabledProviders[0].mode, "aimxs-https");
  assert.equal(fallback.secrets.bearerTokenSecret.name, AIMXS_ACTIVATION_SECRET_NAMES.bearerTokenSecret);
});
