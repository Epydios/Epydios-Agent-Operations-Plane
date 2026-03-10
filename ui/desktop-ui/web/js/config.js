import { buildDefaultAimxsSettings } from "./aimxs/state.js";

const DEFAULT_CONFIG = {
  appName: "Epydios AgentOps Desktop",
  environment: "local",
  mockMode: true,
  runtimeApiBaseUrl: "http://localhost:8080",
  registryApiBaseUrl: "http://localhost:8080",
  endpoints: {
    health: "/healthz",
    providers: "/v1alpha1/providers",
    pipelineStatus: "/v1alpha1/pipeline/status",
    runs: "/v1alpha1/runtime/runs",
    runByIdPrefix: "/v1alpha1/runtime/runs/",
    tasks: "/v1alpha2/runtime/tasks",
    sessions: "/v1alpha2/runtime/sessions",
    sessionByIdPrefix: "/v1alpha2/runtime/sessions/",
    workerCapabilities: "/v1alpha2/runtime/worker-capabilities",
    policyPacks: "/v1alpha2/runtime/policy-packs",
    exportProfiles: "/v1alpha2/runtime/export-profiles",
    orgAdminProfiles: "/v1alpha2/runtime/org-admin-profiles",
    terminalSessions: "/v1alpha1/runtime/terminal/sessions",
    auditEvents: "/v1alpha1/runtime/audit/events",
    approvalsQueue: "/v1alpha1/runtime/approvals",
    approvalDecisionPrefix: "/v1alpha1/runtime/approvals/",
    integrationSettings: "/v1alpha1/runtime/integrations/settings",
    integrationInvoke: "/v1alpha1/runtime/integrations/invoke"
  },
  ui: {
    realtime: {
      mode: "polling",
      pollIntervalMs: 5000
    },
    theme: {
      mode: "system"
    },
    terminal: {
      mode: "interactive_sandbox_only",
      restrictedHostMode: "blocked"
    },
    integrations: {
      modelRouting: "gateway_first",
      gatewayProviderId: "litellm",
      gatewayTokenRef: "ref://projects/{projectId}/gateways/litellm/bearer-token",
      gatewayMtlsCertRef: "ref://projects/{projectId}/gateways/litellm/mtls-cert",
      gatewayMtlsKeyRef: "ref://projects/{projectId}/gateways/litellm/mtls-key",
      allowDirectProviderFallback: true,
      selectedAgentProfileId: "codex",
      agentProfiles: [
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
      ]
    },
    aimxs: buildDefaultAimxsSettings()
  },
  auth: {
    enabled: true,
    issuer: "https://auth.epydios.com/",
    authorizationEndpoint: "https://auth.epydios.com/authorize",
    tokenEndpoint: "https://auth.epydios.com/oauth/token",
    clientId: "epydios-runtime-prod-client",
    audience: "epydios-runtime",
    scopes: "openid profile email",
    responseType: "code",
    usePkce: true
  }
};

function deepMerge(base, override) {
  if (!override || typeof override !== "object") {
    return base;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && typeof merged[key] === "object") {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export async function loadConfig() {
  let fileConfig = {};
  try {
    const response = await fetch("./config/runtime-config.json", { cache: "no-store" });
    if (response.ok) {
      fileConfig = await response.json();
    }
  } catch (_) {
    // Optional local file; defaults are acceptable when missing.
  }

  const runtimeConfig = window.__AGENTOPS_CONFIG__ || {};
  const merged = deepMerge(deepMerge(DEFAULT_CONFIG, fileConfig), runtimeConfig);

  if (!merged.auth.redirectUri) {
    merged.auth.redirectUri = `${window.location.origin}${window.location.pathname}`;
  }
  return merged;
}
