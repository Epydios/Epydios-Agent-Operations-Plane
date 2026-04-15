export const AIMXS_OVERRIDE_KEY = "epydios.agentops.desktop.aimxs.override.v1";

export const AIMXS_ALLOWED_MODES = Object.freeze([
  "oss-only",
  "aimxs-full",
  "aimxs-https"
]);

export const AIMXS_DEFAULT_REFS = Object.freeze({
  endpointRef: "ref://projects/{projectId}/providers/provider-route/https-endpoint",
  bearerTokenRef: "ref://projects/{projectId}/providers/provider-route/bearer-token",
  clientTlsCertRef: "ref://projects/{projectId}/providers/provider-route/client-tls-cert",
  clientTlsKeyRef: "ref://projects/{projectId}/providers/provider-route/client-tls-key",
  caCertRef: "ref://projects/{projectId}/providers/provider-route/provider-ca"
});

export const AIMXS_ACTIVATION_SECRET_NAMES = Object.freeze({
  bearerTokenSecret: "policy-provider-token",
  clientTlsSecret: "epydios-provider-client-tls",
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
    message: "Provider-route activation is unavailable on this launcher.",
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

function resolveAimxsSource(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  if (
    source.premiumProvider &&
    typeof source.premiumProvider === "object" &&
    !Array.isArray(source.premiumProvider)
  ) {
    return source.premiumProvider;
  }
  if (source.aimxs && typeof source.aimxs === "object" && !Array.isArray(source.aimxs)) {
    return source.aimxs;
  }
  return source;
}

export function isAimxsLive(input = {}) {
  const aimxs = resolveAimxsSource(input);
  const activation = normalizeAimxsActivationSnapshot(aimxs.activation || aimxs);
  const activationState = String(activation.state || aimxs.state || "").trim().toLowerCase();
  const activeMode = normalizeAimxsMode(activation.activeMode || aimxs.mode || "oss-only", "oss-only");
  return (
    Boolean(activation.available) &&
    activationState === "active" &&
    activeMode !== "oss-only" &&
    Boolean(activation.selectedProviderReady)
  );
}

export function isAimxsPremiumVisible(input = {}) {
  const aimxs = resolveAimxsSource(input);
  return Boolean(aimxs.paymentEntitled) || isAimxsLive(aimxs);
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
    errors.push("Secure provider mode is locked until entitlement is active.");
  }

  if (draft.mode === "aimxs-https") {
    validateReference(errors, "Provider endpoint ref", draft.endpointRef);
    validateReference(errors, "Provider bearer token ref", draft.bearerTokenRef);
    validateReference(errors, "Provider client TLS cert ref", draft.clientTlsCertRef);
    validateReference(errors, "Provider client TLS key ref", draft.clientTlsKeyRef);
    validateReference(errors, "Provider CA ref", draft.caCertRef);
  } else if (draft.mode === "aimxs-full") {
    warnings.push("local-provider uses the launcher-side provider bridge and does not require HTTPS or secure ref material.");
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
  const aimxsProviders = providers.filter((item) => {
    const providerId = String(item?.providerId || "").trim().toLowerCase();
    return Boolean(providerId) && providerId !== "oss-policy-opa";
  });

  if (aimxsProviders.length === 0) {
    return {
      state: "not_configured",
      detail: "No separately delivered provider route is currently discovered in registry state.",
      providerIds: []
    };
  }

  const ready = aimxsProviders.filter((item) => Boolean(item?.ready) && Boolean(item?.probed));
  const providerIds = aimxsProviders.map((item) => String(item?.providerId || "").trim()).filter(Boolean);
  if (ready.length === aimxsProviders.length) {
    return {
      state: "ready",
      detail: `${ready.length}/${aimxsProviders.length} provider routes are ready.`,
      providerIds
    };
  }

  return {
    state: "partial",
    detail: `${ready.length}/${aimxsProviders.length} provider routes are ready.`,
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
      label: "Provider endpoint",
      kind: "endpoint"
    },
    {
      ref: String(aimxs.bearerTokenRef || "").trim(),
      label: "Provider bearer token",
      kind: "credential"
    },
    {
      ref: String(aimxs.clientTlsCertRef || aimxs.mtlsCertRef || "").trim(),
      label: "Provider client TLS cert",
      kind: "credential"
    },
    {
      ref: String(aimxs.clientTlsKeyRef || aimxs.mtlsKeyRef || "").trim(),
      label: "Provider client TLS key",
      kind: "credential"
    },
    {
      ref: String(aimxs.caCertRef || aimxs.caBundleRef || "").trim(),
      label: "Provider CA",
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
      deploymentLabel: "local-provider",
      summary: "Launcher-side local provider route with no HTTPS or cluster-secret dependency."
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
      deploymentLabel: "secure-provider",
      summary: "Secure provider route with bearer token, client TLS, and provider CA trust."
    };
  }
  return {
    mode: "oss-only",
    providerId: "oss-policy-opa",
    authMode: "n/a",
    healthPath: "/healthz",
    capabilitiesPath: "/v1alpha1/capabilities",
    contractVersion: "v1alpha1",
    deploymentLabel: "baseline",
    summary: "Baseline policy-provider routing with the separately delivered route kept out of the active decision path."
  };
}

export function describeAimxsEntitlementMessage(aimxs = {}) {
  const mode = normalizeAimxsMode(aimxs?.mode, "oss-only");
  if (mode === "aimxs-full") {
    return "local-provider can be enabled without entitlement because it runs through the launcher-side provider bridge.";
  }
  return Boolean(aimxs?.paymentEntitled)
    ? "Entitlement is active; secure provider modes can be enabled with valid refs."
    : "Entitlement is locked; secure provider modes remain disabled.";
}

export function describeAimxsSettingsMessage(aimxs = {}, editorMessage = "") {
  const message = String(editorMessage || "").trim();
  if (message) {
    return message;
  }
  const mode = normalizeAimxsMode(aimxs?.mode, "oss-only");
  if (mode === "aimxs-full") {
    return "local-provider uses the launcher-side provider bridge and does not require HTTPS, bearer token, client TLS, or provider CA refs.";
  }
  if (mode === "oss-only") {
    return "Baseline keeps the separately delivered provider route out of the active policy path until you intentionally switch modes.";
  }
  return Boolean(aimxs?.paymentEntitled)
    ? "Entitlement is active; secure-provider can be applied with endpoint, bearer token, client TLS, and provider CA refs."
    : "Entitlement is locked; secure provider modes cannot be enabled yet.";
}

export function describeAimxsAppliedMessage(aimxs = {}) {
  const mode = normalizeAimxsMode(aimxs?.mode, "oss-only");
  if (mode === "aimxs-full") {
    return "Provider routing is set to local-provider; HTTPS and secure refs are not required in this mode.";
  }
  if (mode === "aimxs-https") {
    return "Provider routing is set to secure-provider with secure refs prepared for the HTTPS policy path.";
  }
  return "Provider routing is set to baseline; policy routing stays on the baseline provider path.";
}

export function describeAimxsSyncedMessage(aimxs = {}) {
  const mode = normalizeAimxsMode(aimxs?.mode, "oss-only");
  if (mode === "aimxs-full") {
    return "Provider settings synced from another tab; local-provider is active in the local Desktop state.";
  }
  if (mode === "aimxs-https") {
    return "Provider settings synced from another tab; secure-provider is active in the local Desktop state.";
  }
  return "Provider settings synced from another tab; baseline remains active.";
}
