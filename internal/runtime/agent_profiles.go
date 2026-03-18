package runtime

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	defaultModelRouting               = "gateway_first"
	defaultGatewayProviderID          = "litellm"
	defaultGatewayTokenRef            = "ref://projects/{projectId}/gateways/litellm/bearer-token"
	defaultGatewayMTLSCertRef         = "ref://projects/{projectId}/gateways/litellm/mtls-cert"
	defaultGatewayMTLSKeyRef          = "ref://projects/{projectId}/gateways/litellm/mtls-key"
	defaultSelectedAgentProfileID     = "codex"
	defaultAzureOpenAIAPIVersion      = "2024-10-21"
	defaultInvokeMaxOutputTokens      = 1024
	defaultBedrockAnthropicAPIVersion = "bedrock-2023-05-31"
)

type agentProfileConfig struct {
	ID              string
	Label           string
	Provider        string
	Transport       string
	Model           string
	EndpointRef     string
	CredentialRef   string
	CredentialScope string
	Enabled         bool
}

type agentIntegrationSettings struct {
	ModelRouting                string
	GatewayProviderID           string
	GatewayTokenRef             string
	GatewayMTLSCertRef          string
	GatewayMTLSKeyRef           string
	AllowDirectProviderFallback bool
	SelectedAgentProfileID      string
	Profiles                    []agentProfileConfig
}

type rawAgentProfileConfig struct {
	ID              string `json:"id"`
	Label           string `json:"label"`
	Provider        string `json:"provider"`
	Transport       string `json:"transport"`
	Model           string `json:"model"`
	EndpointRef     string `json:"endpointRef"`
	CredentialRef   string `json:"credentialRef"`
	CredentialScope string `json:"credentialScope"`
	Enabled         *bool  `json:"enabled,omitempty"`
}

type rawAgentIntegrationSettings struct {
	ModelRouting                string                  `json:"modelRouting"`
	GatewayProviderID           string                  `json:"gatewayProviderId"`
	GatewayTokenRef             string                  `json:"gatewayTokenRef"`
	GatewayMTLSCertRef          string                  `json:"gatewayMtlsCertRef"`
	GatewayMTLSKeyRef           string                  `json:"gatewayMtlsKeyRef"`
	AllowDirectProviderFallback *bool                   `json:"allowDirectProviderFallback,omitempty"`
	SelectedAgentProfileID      string                  `json:"selectedAgentProfileId"`
	ProfileTransport            string                  `json:"profileTransport"`
	ProfileModel                string                  `json:"profileModel"`
	ProfileEndpointRef          string                  `json:"profileEndpointRef"`
	ProfileCredentialRef        string                  `json:"profileCredentialRef"`
	ProfileCredentialScope      string                  `json:"profileCredentialScope"`
	ProfileEnabled              *bool                   `json:"profileEnabled,omitempty"`
	AgentProfiles               []rawAgentProfileConfig `json:"agentProfiles"`
}

func defaultAgentProfiles() []agentProfileConfig {
	return []agentProfileConfig{
		{
			ID:              "codex",
			Label:           "OpenAI Codex",
			Provider:        "openai_compatible",
			Transport:       "responses_api",
			Model:           "gpt-5-codex",
			EndpointRef:     "ref://gateways/litellm/openai-compatible",
			CredentialRef:   "ref://projects/{projectId}/providers/openai-compatible/api-key",
			CredentialScope: "project",
			Enabled:         true,
		},
		{
			ID:              "openai",
			Label:           "OpenAI",
			Provider:        "openai_responses",
			Transport:       "responses_api",
			Model:           "gpt-5",
			EndpointRef:     "ref://gateways/litellm/openai",
			CredentialRef:   "ref://projects/{projectId}/providers/openai/api-key",
			CredentialScope: "project",
			Enabled:         true,
		},
		{
			ID:              "anthropic",
			Label:           "Anthropic",
			Provider:        "anthropic_messages",
			Transport:       "messages_api",
			Model:           "claude-sonnet-latest",
			EndpointRef:     "ref://gateways/litellm/anthropic",
			CredentialRef:   "ref://projects/{projectId}/providers/anthropic/api-key",
			CredentialScope: "project",
			Enabled:         true,
		},
		{
			ID:              "google",
			Label:           "Google",
			Provider:        "google_gemini",
			Transport:       "gemini_api",
			Model:           "gemini-2.5-pro",
			EndpointRef:     "ref://gateways/litellm/google",
			CredentialRef:   "ref://projects/{projectId}/providers/google/api-key",
			CredentialScope: "project",
			Enabled:         true,
		},
		{
			ID:              "azure_openai",
			Label:           "Azure OpenAI",
			Provider:        "azure_openai",
			Transport:       "chat_completions_api",
			Model:           "gpt-4.1",
			EndpointRef:     "ref://projects/{projectId}/providers/azure-openai/endpoint",
			CredentialRef:   "ref://projects/{projectId}/providers/azure-openai/api-key",
			CredentialScope: "project",
			Enabled:         true,
		},
		{
			ID:              "bedrock",
			Label:           "AWS Bedrock",
			Provider:        "aws_bedrock",
			Transport:       "bedrock_invoke_model",
			Model:           "anthropic.claude-3-7-sonnet",
			EndpointRef:     "ref://projects/{projectId}/providers/bedrock/region-endpoint",
			CredentialRef:   "ref://projects/{projectId}/providers/bedrock/role-arn",
			CredentialScope: "project",
			Enabled:         true,
		},
	}
}

func defaultAgentIntegrationSettings() agentIntegrationSettings {
	return agentIntegrationSettings{
		ModelRouting:                defaultModelRouting,
		GatewayProviderID:           defaultGatewayProviderID,
		GatewayTokenRef:             defaultGatewayTokenRef,
		GatewayMTLSCertRef:          defaultGatewayMTLSCertRef,
		GatewayMTLSKeyRef:           defaultGatewayMTLSKeyRef,
		AllowDirectProviderFallback: true,
		SelectedAgentProfileID:      defaultSelectedAgentProfileID,
		Profiles:                    defaultAgentProfiles(),
	}
}

func parseAgentIntegrationSettings(raw json.RawMessage) (agentIntegrationSettings, error) {
	settings := defaultAgentIntegrationSettings()
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "" || strings.TrimSpace(string(raw)) == "{}" {
		return settings, nil
	}

	var decoded rawAgentIntegrationSettings
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return agentIntegrationSettings{}, fmt.Errorf("decode integration settings: %w", err)
	}

	if modelRouting := normalizeModelRouting(decoded.ModelRouting); modelRouting != "" {
		settings.ModelRouting = modelRouting
	}
	if gatewayProviderID := strings.TrimSpace(decoded.GatewayProviderID); gatewayProviderID != "" {
		settings.GatewayProviderID = gatewayProviderID
	}
	if gatewayTokenRef := strings.TrimSpace(decoded.GatewayTokenRef); gatewayTokenRef != "" {
		settings.GatewayTokenRef = gatewayTokenRef
	}
	if gatewayMTLSCertRef := strings.TrimSpace(decoded.GatewayMTLSCertRef); gatewayMTLSCertRef != "" {
		settings.GatewayMTLSCertRef = gatewayMTLSCertRef
	}
	if gatewayMTLSKeyRef := strings.TrimSpace(decoded.GatewayMTLSKeyRef); gatewayMTLSKeyRef != "" {
		settings.GatewayMTLSKeyRef = gatewayMTLSKeyRef
	}
	if decoded.AllowDirectProviderFallback != nil {
		settings.AllowDirectProviderFallback = *decoded.AllowDirectProviderFallback
	}

	profiles := mergeAgentProfileOverrides(settings.Profiles, decoded.AgentProfiles)
	selectedProfileID := strings.ToLower(strings.TrimSpace(decoded.SelectedAgentProfileID))
	if selectedProfileID == "" {
		selectedProfileID = settings.SelectedAgentProfileID
	}
	if selectedProfileID == "" && len(profiles) > 0 {
		selectedProfileID = profiles[0].ID
	}
	if selectedProfileID == "" {
		return agentIntegrationSettings{}, fmt.Errorf("selected agent profile is required")
	}

	profiles = applySelectedProfileOverrides(profiles, selectedProfileID, decoded)
	settings.Profiles = profiles
	settings.SelectedAgentProfileID = selectedProfileID
	return settings, nil
}

func mergeAgentProfileOverrides(base []agentProfileConfig, overrides []rawAgentProfileConfig) []agentProfileConfig {
	if len(base) == 0 && len(overrides) == 0 {
		return nil
	}
	profiles := make([]agentProfileConfig, 0, len(base)+len(overrides))
	indexByID := make(map[string]int, len(base)+len(overrides))
	for _, item := range base {
		normalized := normalizeAgentProfile(item)
		if normalized.ID == "" {
			continue
		}
		indexByID[normalized.ID] = len(profiles)
		profiles = append(profiles, normalized)
	}

	for _, override := range overrides {
		id := strings.ToLower(strings.TrimSpace(override.ID))
		if id == "" {
			continue
		}
		next := normalizeAgentProfile(agentProfileConfig{
			ID:              id,
			Label:           override.Label,
			Provider:        override.Provider,
			Transport:       override.Transport,
			Model:           override.Model,
			EndpointRef:     override.EndpointRef,
			CredentialRef:   override.CredentialRef,
			CredentialScope: override.CredentialScope,
			Enabled:         true,
		})
		if override.Enabled != nil {
			next.Enabled = *override.Enabled
		}
		if idx, ok := indexByID[id]; ok {
			existing := profiles[idx]
			profiles[idx] = overlayAgentProfile(existing, next, override.Enabled)
			continue
		}
		indexByID[id] = len(profiles)
		profiles = append(profiles, next)
	}
	return profiles
}

func applySelectedProfileOverrides(profiles []agentProfileConfig, selectedProfileID string, raw rawAgentIntegrationSettings) []agentProfileConfig {
	for idx := range profiles {
		if profiles[idx].ID != selectedProfileID {
			continue
		}
		if transport := strings.TrimSpace(raw.ProfileTransport); transport != "" {
			profiles[idx].Transport = transport
		}
		if model := strings.TrimSpace(raw.ProfileModel); model != "" {
			profiles[idx].Model = model
		}
		if endpointRef := strings.TrimSpace(raw.ProfileEndpointRef); endpointRef != "" {
			profiles[idx].EndpointRef = endpointRef
		}
		if credentialRef := strings.TrimSpace(raw.ProfileCredentialRef); credentialRef != "" {
			profiles[idx].CredentialRef = credentialRef
		}
		if credentialScope := strings.TrimSpace(raw.ProfileCredentialScope); credentialScope != "" {
			profiles[idx].CredentialScope = strings.ToLower(credentialScope)
		}
		if raw.ProfileEnabled != nil {
			profiles[idx].Enabled = *raw.ProfileEnabled
		}
		return profiles
	}

	profiles = append(profiles, normalizeAgentProfile(agentProfileConfig{
		ID:              selectedProfileID,
		Label:           selectedProfileID,
		Transport:       raw.ProfileTransport,
		Model:           raw.ProfileModel,
		EndpointRef:     raw.ProfileEndpointRef,
		CredentialRef:   raw.ProfileCredentialRef,
		CredentialScope: raw.ProfileCredentialScope,
		Enabled:         raw.ProfileEnabled == nil || *raw.ProfileEnabled,
	}))
	return profiles
}

func overlayAgentProfile(base, override agentProfileConfig, enabledOverride *bool) agentProfileConfig {
	out := normalizeAgentProfile(base)
	if label := strings.TrimSpace(override.Label); label != "" {
		out.Label = label
	}
	if provider := strings.TrimSpace(override.Provider); provider != "" {
		out.Provider = provider
	}
	if transport := strings.TrimSpace(override.Transport); transport != "" {
		out.Transport = transport
	}
	if model := strings.TrimSpace(override.Model); model != "" {
		out.Model = model
	}
	if endpointRef := strings.TrimSpace(override.EndpointRef); endpointRef != "" {
		out.EndpointRef = endpointRef
	}
	if credentialRef := strings.TrimSpace(override.CredentialRef); credentialRef != "" {
		out.CredentialRef = credentialRef
	}
	if credentialScope := strings.TrimSpace(override.CredentialScope); credentialScope != "" {
		out.CredentialScope = strings.ToLower(credentialScope)
	}
	if enabledOverride != nil {
		out.Enabled = *enabledOverride
	}
	return out
}

func normalizeAgentProfile(profile agentProfileConfig) agentProfileConfig {
	profile.ID = strings.ToLower(strings.TrimSpace(profile.ID))
	profile.Label = strings.TrimSpace(profile.Label)
	if profile.Label == "" {
		profile.Label = profile.ID
	}
	profile.Provider = strings.TrimSpace(profile.Provider)
	profile.Transport = strings.TrimSpace(profile.Transport)
	profile.Model = strings.TrimSpace(profile.Model)
	profile.EndpointRef = strings.TrimSpace(profile.EndpointRef)
	profile.CredentialRef = strings.TrimSpace(profile.CredentialRef)
	scope := strings.ToLower(strings.TrimSpace(profile.CredentialScope))
	switch scope {
	case "tenant", "workspace":
		profile.CredentialScope = scope
	default:
		profile.CredentialScope = "project"
	}
	return profile
}

func normalizeModelRouting(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "direct_first":
		return "direct_first"
	case "gateway_first":
		return "gateway_first"
	default:
		return ""
	}
}

func (s agentIntegrationSettings) resolveProfile(profileID string) (agentProfileConfig, error) {
	target := strings.ToLower(strings.TrimSpace(profileID))
	if target == "" {
		target = s.SelectedAgentProfileID
	}
	if target == "" && len(s.Profiles) > 0 {
		target = s.Profiles[0].ID
	}
	for _, profile := range s.Profiles {
		if profile.ID == target {
			return profile, nil
		}
	}
	return agentProfileConfig{}, fmt.Errorf("agent profile %q is not configured", target)
}

func isGatewayRef(value string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(value)), "ref://gateways/")
}
