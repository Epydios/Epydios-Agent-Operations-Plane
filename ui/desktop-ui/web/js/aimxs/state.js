export const AIMXS_OVERRIDE_KEY = "epydios.agentops.desktop.aimxs.override.v1";

export const AIMXS_ALLOWED_MODES = Object.freeze([
  "oss-only",
  "aimxs-full",
  "aimxs-https"
]);

export const AIMXS_DEFAULT_REFS = Object.freeze({
  endpointRef: "ref://projects/{projectId}/providers/aimxs/https-endpoint",
  bearerTokenRef: "ref://projects/{projectId}/providers/aimxs/bearer-token",
  clientTlsCertRef: "ref://projects/{projectId}/providers/aimxs/client-tls-cert",
  clientTlsKeyRef: "ref://projects/{projectId}/providers/aimxs/client-tls-key",
  caCertRef: "ref://projects/{projectId}/providers/aimxs/provider-ca"
});

export const AIMXS_ACTIVATION_SECRET_NAMES = Object.freeze({
  bearerTokenSecret: "aimxs-policy-token",
  clientTlsSecret: "epydios-controller-mtls-client",
  caSecret: "epydios-provider-ca"
});

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value || {}));
}

function defaultValidateReference(errors, label, value) {
  const text = String(value || "").trim();
  if (!text) {
    errors.push(`${label} is required.`);
    return;
  }
  if (!text.startsWith("ref://")) {
    errors.push(`${label} must use ref:// format.`);
  }
}

export function buildDefaultAimxsSettings() {
  return {
    paymentEntitled: false,
    mode: "oss-only",
    endpointRef: AIMXS_DEFAULT_REFS.endpointRef,
    bearerTokenRef: AIMXS_DEFAULT_REFS.bearerTokenRef,
    clientTlsCertRef: AIMXS_DEFAULT_REFS.clientTlsCertRef,
    clientTlsKeyRef: AIMXS_DEFAULT_REFS.clientTlsKeyRef,
    caCertRef: AIMXS_DEFAULT_REFS.caCertRef
  };
}

function normalizeAimxsReportedMode(value, fallback = "unknown") {
  const rawRequested = String(value || "").trim().toLowerCase();
  const requested = rawRequested.replace(/_/g, "-");
  if (requested === "unknown") {
    return "unknown";
  }
  if (AIMXS_ALLOWED_MODES.includes(requested)) {
    return requested;
  }
  return fallback;
}

function normalizeAimxsActivationSecretState(input = {}, name) {
  const source = input && typeof input === "object" ? input : {};
  return {
    name: String(source.name || name || "").trim(),
    present: Boolean(source.present)
  };
}

function normalizeAimxsActivationProviderState(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    name: String(source.name || "").trim(),
    providerId: String(source.providerId || "").trim(),
    mode: normalizeAimxsReportedMode(source.mode, "unknown"),
    enabled: Boolean(source.enabled),
    ready: Boolean(source.ready),
    probed: Boolean(source.probed),
    priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0,
    authMode: String(source.authMode || "").trim(),
    capabilities: Array.isArray(source.capabilities)
      ? source.capabilities.map((item) => String(item || "").trim()).filter(Boolean)
      : []
  };
}

export function buildDefaultAimxsActivationSnapshot() {
  return {
    available: false,
    source: "helper-unavailable",
    state: "unavailable",
    message: "AIMXS activation helper is unavailable on this launcher.",
    namespace: "epydios-system",
    activeMode: "unknown",
    requestedMode: "",
    selectedProviderId: "",
    selectedProviderName: "",
    selectedProviderReady: false,
    selectedProviderProbed: false,
    capabilities: [],
    enabledProviders: [],
    warnings: [],
    applied: false,
    lastAppliedAt: "",
    secrets: {
      bearerTokenSecret: {
        name: AIMXS_ACTIVATION_SECRET_NAMES.bearerTokenSecret,
        present: false
      },
      clientTlsSecret: {
        name: AIMXS_ACTIVATION_SECRET_NAMES.clientTlsSecret,
        present: false
      },
      caSecret: {
        name: AIMXS_ACTIVATION_SECRET_NAMES.caSecret,
        present: false
      }
    }
  };
}

export function normalizeAimxsActivationSnapshot(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = buildDefaultAimxsActivationSnapshot();
  return {
    available: Boolean(source.available),
    source: String(source.source || base.source).trim() || base.source,
    state: String(source.state || base.state).trim().toLowerCase() || base.state,
    message: String(source.message || base.message).trim() || base.message,
    namespace: String(source.namespace || base.namespace).trim() || base.namespace,
    activeMode: normalizeAimxsReportedMode(source.activeMode, base.activeMode),
    requestedMode: normalizeAimxsReportedMode(source.requestedMode, ""),
    selectedProviderId: String(source.selectedProviderId || base.selectedProviderId).trim(),
    selectedProviderName: String(source.selectedProviderName || base.selectedProviderName).trim(),
    selectedProviderReady: Boolean(source.selectedProviderReady),
    selectedProviderProbed: Boolean(source.selectedProviderProbed),
    capabilities: Array.isArray(source.capabilities)
      ? source.capabilities.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    enabledProviders: Array.isArray(source.enabledProviders)
      ? source.enabledProviders.map((item) => normalizeAimxsActivationProviderState(item)).filter((item) => item.name || item.providerId)
      : [],
    warnings: Array.isArray(source.warnings)
      ? source.warnings.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    applied: Boolean(source.applied),
    lastAppliedAt: String(source.lastAppliedAt || base.lastAppliedAt).trim(),
    secrets: {
      bearerTokenSecret: normalizeAimxsActivationSecretState(
        source.secrets?.bearerTokenSecret,
        AIMXS_ACTIVATION_SECRET_NAMES.bearerTokenSecret
      ),
      clientTlsSecret: normalizeAimxsActivationSecretState(
        source.secrets?.clientTlsSecret,
        AIMXS_ACTIVATION_SECRET_NAMES.clientTlsSecret
      ),
      caSecret: normalizeAimxsActivationSecretState(
        source.secrets?.caSecret,
        AIMXS_ACTIVATION_SECRET_NAMES.caSecret
      )
    }
  };
}

export function normalizeAimxsMode(value, fallback = "oss-only") {
  const requested = String(value || "").trim().toLowerCase();
  if (AIMXS_ALLOWED_MODES.includes(requested)) {
    return requested;
  }
  const nextFallback = String(fallback || "").trim().toLowerCase();
  if (AIMXS_ALLOWED_MODES.includes(nextFallback)) {
    return nextFallback;
  }
  return "oss-only";
}

export function normalizeAimxsOverride(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = {
    ...buildDefaultAimxsSettings(),
    ...(fallback && typeof fallback === "object" ? fallback : {})
  };
  return {
    paymentEntitled: Boolean(base.paymentEntitled),
    mode: normalizeAimxsMode(source.mode, normalizeAimxsMode(base.mode, "oss-only")),
    endpointRef: firstNonEmpty(source.endpointRef, base.endpointRef, AIMXS_DEFAULT_REFS.endpointRef) || "-",
    bearerTokenRef:
      firstNonEmpty(source.bearerTokenRef, base.bearerTokenRef, AIMXS_DEFAULT_REFS.bearerTokenRef) || "-",
    clientTlsCertRef:
      firstNonEmpty(
        source.clientTlsCertRef,
        source.mtlsCertRef,
        base.clientTlsCertRef,
        base.mtlsCertRef,
        AIMXS_DEFAULT_REFS.clientTlsCertRef
      ) || "-",
    clientTlsKeyRef:
      firstNonEmpty(
        source.clientTlsKeyRef,
        source.mtlsKeyRef,
        base.clientTlsKeyRef,
        base.mtlsKeyRef,
        AIMXS_DEFAULT_REFS.clientTlsKeyRef
      ) || "-",
    caCertRef:
      firstNonEmpty(
        source.caCertRef,
        source.caBundleRef,
        base.caCertRef,
        base.caBundleRef,
        AIMXS_DEFAULT_REFS.caCertRef
      ) || "-"
  };
}

export function applyAimxsOverrideToChoices(baseChoices, override) {
  const next = cloneValue(baseChoices || {});
  next.aimxs = normalizeAimxsOverride(override || {}, baseChoices?.aimxs || {});
  return next;
}

export function validateAimxsOverride(override, fallback, validateReference = defaultValidateReference) {
  const errors = [];
  const warnings = [];
  const draft = normalizeAimxsOverride(override || {}, fallback || {});
  if (draft.mode === "oss-only") {
    return { valid: true, errors, warnings, draft };
  }

  if (
    draft.mode === "aimxs-https" && !draft.paymentEntitled
  ) {
    errors.push("AIMXS mode is locked until payment entitlement is active.");
  }

  if (draft.mode === "aimxs-https") {
    validateReference(errors, "AIMXS endpoint ref", draft.endpointRef);
    validateReference(errors, "AIMXS bearer token ref", draft.bearerTokenRef);
    validateReference(errors, "AIMXS controller client TLS cert ref", draft.clientTlsCertRef);
    validateReference(errors, "AIMXS controller client TLS key ref", draft.clientTlsKeyRef);
    validateReference(errors, "AIMXS provider CA ref", draft.caCertRef);
  } else if (draft.mode === "aimxs-full") {
    warnings.push("aimxs-full uses the local AIMXS provider shim on the live launcher/runtime stack and does not require HTTPS or secure ref material.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    draft
  };
}

export function summarizeAimxsStatus(providerPayload) {
  const providers = Array.isArray(providerPayload?.items) ? providerPayload.items : [];
  const aimxsProviders = providers.filter((item) =>
    String(item?.providerId || "").toLowerCase().includes("aimxs")
  );

  if (aimxsProviders.length === 0) {
    return {
      state: "not_configured",
      detail: "No AIMXS provider is currently discovered in registry state.",
      providerIds: []
    };
  }

  const ready = aimxsProviders.filter((item) => Boolean(item?.ready) && Boolean(item?.probed));
  const providerIds = aimxsProviders.map((item) => String(item?.providerId || "").trim()).filter(Boolean);
  if (ready.length === aimxsProviders.length) {
    return {
      state: "ready",
      detail: `${ready.length}/${aimxsProviders.length} AIMXS providers are ready.`,
      providerIds
    };
  }

  return {
    state: "degraded",
    detail: `${ready.length}/${aimxsProviders.length} AIMXS providers are ready.`,
    providerIds
  };
}

export function collectAimxsSecureRefItems(settings = {}) {
  const aimxs = settings?.aimxs || {};
  const mode = normalizeAimxsMode(aimxs.mode, "oss-only");
  if (mode === "oss-only") {
    return [];
  }
  if (mode === "aimxs-full") {
    return [];
  }
  return [
    {
      ref: String(aimxs.endpointRef || "").trim(),
      label: "AIMXS endpoint",
      kind: "endpoint"
    },
    {
      ref: String(aimxs.bearerTokenRef || "").trim(),
      label: "AIMXS bearer token",
      kind: "credential"
    },
    {
      ref: String(aimxs.clientTlsCertRef || aimxs.mtlsCertRef || "").trim(),
      label: "AIMXS controller client TLS cert",
      kind: "credential"
    },
    {
      ref: String(aimxs.clientTlsKeyRef || aimxs.mtlsKeyRef || "").trim(),
      label: "AIMXS controller client TLS key",
      kind: "credential"
    },
    {
      ref: String(aimxs.caCertRef || aimxs.caBundleRef || "").trim(),
      label: "AIMXS provider CA",
      kind: "credential"
    }
  ].filter((item) => Boolean(item.ref));
}

export function resolveAimxsContractProfile(aimxs = {}) {
  const mode = normalizeAimxsMode(aimxs.mode, "oss-only");
  if (mode === "aimxs-full") {
    return {
      mode,
      providerId: "aimxs-full",
      authMode: "None",
      healthPath: "/healthz",
      capabilitiesPath: "/v1alpha1/capabilities",
      contractVersion: "v1alpha1",
      deploymentLabel: "aimxs-full",
      summary: "Full AIMXS local provider shim for the Desktop/runtime stack with no HTTPS or cluster secret dependency."
    };
  }
  if (mode === "aimxs-https") {
    return {
      mode,
      providerId: "aimxs-policy-primary",
      authMode: "MTLSAndBearerTokenSecret",
      healthPath: "/healthz",
      capabilitiesPath: "/v1alpha1/capabilities",
      contractVersion: "v1alpha1",
      deploymentLabel: "aimxs-https",
      summary: "Secure AIMXS HTTPS path with bearer token, client TLS, and provider CA trust."
    };
  }
  return {
    mode: "oss-only",
    providerId: "oss-policy-opa",
    authMode: "n/a",
    healthPath: "/healthz",
    capabilitiesPath: "/v1alpha1/capabilities",
    contractVersion: "v1alpha1",
    deploymentLabel: "oss-only",
    summary: "OSS-only policy-provider routing with AIMXS kept out of the active decision path."
  };
}

export function describeAimxsEntitlementMessage(aimxs = {}) {
  const mode = normalizeAimxsMode(aimxs?.mode, "oss-only");
  if (mode === "aimxs-full") {
    return "aimxs-full can be enabled without entitlement because it runs through the local AIMXS provider shim.";
  }
  return Boolean(aimxs?.paymentEntitled)
    ? "Entitlement is active; AIMXS secure deployment modes can be enabled with valid refs."
    : "Entitlement is locked; secure AIMXS deployment modes remain disabled.";
}

export function describeAimxsSettingsMessage(aimxs = {}, editorMessage = "") {
  const message = String(editorMessage || "").trim();
  if (message) {
    return message;
  }
  const mode = normalizeAimxsMode(aimxs?.mode, "oss-only");
  if (mode === "aimxs-full") {
    return "aimxs-full uses the local AIMXS provider shim and does not require HTTPS, bearer token, client TLS, or provider CA refs.";
  }
  if (mode === "oss-only") {
    return "OSS-only keeps AIMXS out of the active policy route until you intentionally switch modes.";
  }
  return Boolean(aimxs?.paymentEntitled)
    ? "Entitlement is active; aimxs-https can be applied with endpoint, bearer token, client TLS, and provider CA refs."
    : "Entitlement is locked; secure AIMXS deployment modes cannot be enabled yet.";
}

export function describeAimxsAppliedMessage(aimxs = {}) {
  const mode = normalizeAimxsMode(aimxs?.mode, "oss-only");
  if (mode === "aimxs-full") {
    return "AIMXS is set to aimxs-full on the local provider shim; HTTPS and secure refs are not required in this mode.";
  }
  if (mode === "aimxs-https") {
    return "AIMXS is set to aimxs-https with secure provider refs prepared for the HTTPS policy path.";
  }
  return "AIMXS is set to oss-only; policy routing stays on the OSS provider path.";
}

export function describeAimxsSyncedMessage(aimxs = {}) {
  const mode = normalizeAimxsMode(aimxs?.mode, "oss-only");
  if (mode === "aimxs-full") {
    return "AIMXS settings synced from another tab; aimxs-full is active in the local Desktop state.";
  }
  if (mode === "aimxs-https") {
    return "AIMXS settings synced from another tab; aimxs-https is active in the local Desktop state.";
  }
  return "AIMXS settings synced from another tab; oss-only remains active.";
}
