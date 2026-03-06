function normalizeChoice(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (allowed.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return fallback;
  }
  return parsed;
}

const DEFAULT_AGENT_PROFILES = [
  {
    id: "codex",
    label: "OpenAI Codex",
    provider: "openai_compatible",
    transport: "responses_api",
    model: "gpt-5-codex",
    endpointRef: "ref://gateways/litellm/openai-compatible",
    credentialRef: "ref://projects/{projectId}/providers/openai-compatible/api-key",
    credentialScope: "project",
    enabled: true
  },
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai_responses",
    transport: "responses_api",
    model: "gpt-5",
    endpointRef: "ref://gateways/litellm/openai",
    credentialRef: "ref://projects/{projectId}/providers/openai/api-key",
    credentialScope: "project",
    enabled: true
  },
  {
    id: "anthropic",
    label: "Anthropic",
    provider: "anthropic_messages",
    transport: "messages_api",
    model: "claude-sonnet-latest",
    endpointRef: "ref://gateways/litellm/anthropic",
    credentialRef: "ref://projects/{projectId}/providers/anthropic/api-key",
    credentialScope: "project",
    enabled: true
  },
  {
    id: "google",
    label: "Google",
    provider: "google_gemini",
    transport: "gemini_api",
    model: "gemini-2.5-pro",
    endpointRef: "ref://gateways/litellm/google",
    credentialRef: "ref://projects/{projectId}/providers/google/api-key",
    credentialScope: "project",
    enabled: true
  },
  {
    id: "azure_openai",
    label: "Azure OpenAI",
    provider: "azure_openai",
    transport: "chat_completions_api",
    model: "gpt-4.1",
    endpointRef: "ref://projects/{projectId}/providers/azure-openai/endpoint",
    credentialRef: "ref://projects/{projectId}/providers/azure-openai/api-key",
    credentialScope: "project",
    enabled: true
  },
  {
    id: "bedrock",
    label: "AWS Bedrock",
    provider: "aws_bedrock",
    transport: "bedrock_invoke_model",
    model: "anthropic.claude-3-7-sonnet",
    endpointRef: "ref://projects/{projectId}/providers/bedrock/region-endpoint",
    credentialRef: "ref://projects/{projectId}/providers/bedrock/role-arn",
    credentialScope: "project",
    enabled: true
  }
];

function normalizeCredentialScope(value, fallback) {
  return normalizeChoice(value, ["project", "tenant", "workspace"], fallback);
}

function normalizeAgentProfiles(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_AGENT_PROFILES;
  }

  const defaultsById = new Map(DEFAULT_AGENT_PROFILES.map((item) => [item.id, item]));
  const defaultsByProvider = new Map(DEFAULT_AGENT_PROFILES.map((item) => [item.provider, item]));
  const normalized = [];
  const seen = new Set();
  for (const item of value) {
    const id = String(item?.id || "").trim().toLowerCase();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const provider = String(item?.provider || "openai_compatible").trim() || "openai_compatible";
    const defaults =
      defaultsById.get(id) ||
      defaultsByProvider.get(provider) ||
      DEFAULT_AGENT_PROFILES[0];
    normalized.push({
      id,
      label: String(item?.label || id).trim() || id,
      provider,
      transport: String(item?.transport || defaults.transport || "responses_api").trim(),
      model: String(item?.model || defaults.model || "-").trim() || "-",
      endpointRef: String(item?.endpointRef || defaults.endpointRef || "-").trim() || "-",
      credentialRef: String(item?.credentialRef || defaults.credentialRef || "-").trim() || "-",
      credentialScope: normalizeCredentialScope(
        item?.credentialScope,
        defaults.credentialScope || "project"
      ),
      enabled: item?.enabled !== false
    });
  }

  return normalized.length > 0 ? normalized : DEFAULT_AGENT_PROFILES;
}

export function resolveRuntimeChoices(config) {
  const ui = config?.ui || {};
  const realtime = ui.realtime || {};
  const terminal = ui.terminal || {};
  const integrations = ui.integrations || {};
  const aimxs = ui.aimxs || {};
  const theme = ui.theme || {};
  const agentProfiles = normalizeAgentProfiles(integrations.agentProfiles);
  const selectedAgentProfileID = String(integrations.selectedAgentProfileId || "").trim().toLowerCase();
  const hasSelected = agentProfiles.some((profile) => profile.id === selectedAgentProfileID);

  return {
    realtime: {
      mode: normalizeChoice(realtime.mode, ["polling", "sse"], "polling"),
      pollIntervalMs: positiveInt(realtime.pollIntervalMs, 5000)
    },
    terminal: {
      mode: normalizeChoice(
        terminal.mode,
        ["interactive_sandbox_only", "read_only"],
        "interactive_sandbox_only"
      ),
      restrictedHostMode: normalizeChoice(
        terminal.restrictedHostMode,
        ["blocked", "read_only"],
        "blocked"
      )
    },
    theme: {
      mode: normalizeChoice(theme.mode, ["system", "light", "dark"], "system")
    },
    integrations: {
      modelRouting: normalizeChoice(
        integrations.modelRouting,
        ["gateway_first", "direct_first"],
        "gateway_first"
      ),
      gatewayProviderId: String(integrations.gatewayProviderId || "litellm").trim() || "litellm",
      gatewayTokenRef:
        String(
          integrations.gatewayTokenRef ||
            "ref://projects/{projectId}/gateways/litellm/bearer-token"
        ).trim() || "-",
      gatewayMtlsCertRef:
        String(
          integrations.gatewayMtlsCertRef ||
            "ref://projects/{projectId}/gateways/litellm/mtls-cert"
        ).trim() || "-",
      gatewayMtlsKeyRef:
        String(
          integrations.gatewayMtlsKeyRef ||
            "ref://projects/{projectId}/gateways/litellm/mtls-key"
        ).trim() || "-",
      allowDirectProviderFallback: Boolean(
        integrations.allowDirectProviderFallback ?? true
      ),
      agentProfiles,
      selectedAgentProfileId: hasSelected
        ? selectedAgentProfileID
        : (agentProfiles[0]?.id || "codex")
    },
    aimxs: {
      paymentEntitled: Boolean(aimxs.paymentEntitled),
      mode: normalizeChoice(aimxs.mode, ["disabled", "https_external", "in_stack_reserved"], "disabled"),
      endpointRef:
        String(
          aimxs.endpointRef ||
            "ref://projects/{projectId}/providers/aimxs/https-endpoint"
        ).trim() || "-",
      bearerTokenRef:
        String(
          aimxs.bearerTokenRef ||
            "ref://projects/{projectId}/providers/aimxs/bearer-token"
        ).trim() || "-",
      mtlsCertRef:
        String(
          aimxs.mtlsCertRef ||
            "ref://projects/{projectId}/providers/aimxs/mtls-cert"
        ).trim() || "-",
      mtlsKeyRef:
        String(
          aimxs.mtlsKeyRef ||
            "ref://projects/{projectId}/providers/aimxs/mtls-key"
        ).trim() || "-"
    }
  };
}
