package runtime

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
)

type AgentInvokeRequest struct {
	Meta            ObjectMeta `json:"meta"`
	AgentProfileID  string     `json:"agentProfileId,omitempty"`
	Prompt          string     `json:"prompt"`
	SystemPrompt    string     `json:"systemPrompt,omitempty"`
	MaxOutputTokens int        `json:"maxOutputTokens,omitempty"`
}

type AgentInvokeResponse struct {
	Source          string          `json:"source,omitempty"`
	Applied         bool            `json:"applied"`
	RequestID       string          `json:"requestId,omitempty"`
	TenantID        string          `json:"tenantId,omitempty"`
	ProjectID       string          `json:"projectId,omitempty"`
	AgentProfileID  string          `json:"agentProfileId,omitempty"`
	Provider        string          `json:"provider,omitempty"`
	Transport       string          `json:"transport,omitempty"`
	Model           string          `json:"model,omitempty"`
	Route           string          `json:"route,omitempty"`
	EndpointRef     string          `json:"endpointRef,omitempty"`
	CredentialRef   string          `json:"credentialRef,omitempty"`
	StartedAt       string          `json:"startedAt,omitempty"`
	CompletedAt     string          `json:"completedAt,omitempty"`
	OutputText      string          `json:"outputText,omitempty"`
	FinishReason    string          `json:"finishReason,omitempty"`
	Warning         string          `json:"warning,omitempty"`
	Usage           JSONObject      `json:"usage,omitempty"`
	RawResponse     json.RawMessage `json:"rawResponse,omitempty"`
}

type AgentInvokerConfig struct {
	RefValuesPath string
	RefValuesJSON string
	HTTPTimeout   time.Duration
}

type AgentInvoker struct {
	store      RunStore
	resolver   *runtimeRefResolver
	httpClient *http.Client
	now        func() time.Time
}

type runtimeRefResolver struct {
	path        string
	inlineJSON  string
	mu          sync.Mutex
	inlineCache map[string]json.RawMessage
	fileCache   map[string]json.RawMessage
	fileModTime time.Time
}

type invokeRoute struct {
	name           string
	profile        agentProfileConfig
	endpoint       string
	endpointRef    string
	credentialRef  string
	authMode       string
	authValue      string
	mtlsCertPEM    []byte
	mtlsKeyPEM     []byte
	bedrockAuth    *bedrockCredentialBundle
}

type invokeResult struct {
	outputText    string
	finishReason  string
	usage         JSONObject
	rawResponse   json.RawMessage
}

type bedrockCredentialBundle struct {
	Source          string `json:"source,omitempty"`
	Region          string `json:"region,omitempty"`
	AccessKeyID     string `json:"accessKeyId,omitempty"`
	SecretAccessKey string `json:"secretAccessKey,omitempty"`
	SessionToken    string `json:"sessionToken,omitempty"`
}

func DefaultAgentInvokerConfigFromEnv() AgentInvokerConfig {
	return AgentInvokerConfig{
		RefValuesPath: strings.TrimSpace(os.Getenv("RUNTIME_REF_VALUES_PATH")),
		RefValuesJSON: strings.TrimSpace(os.Getenv("RUNTIME_REF_VALUES_JSON")),
		HTTPTimeout:   45 * time.Second,
	}
}

func NewAgentInvoker(store RunStore, cfg AgentInvokerConfig) *AgentInvoker {
	timeout := cfg.HTTPTimeout
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	return &AgentInvoker{
		store:      store,
		resolver:   &runtimeRefResolver{path: strings.TrimSpace(cfg.RefValuesPath), inlineJSON: strings.TrimSpace(cfg.RefValuesJSON)},
		httpClient: &http.Client{Timeout: timeout},
		now:        time.Now,
	}
}

func (i *AgentInvoker) Invoke(ctx context.Context, req AgentInvokeRequest) (*AgentInvokeResponse, error) {
	if i == nil || i.store == nil || i.resolver == nil {
		return nil, fmt.Errorf("agent invoker is not configured")
	}
	if strings.TrimSpace(req.Meta.TenantID) == "" || strings.TrimSpace(req.Meta.ProjectID) == "" {
		return nil, fmt.Errorf("meta.tenantId and meta.projectId are required")
	}
	if strings.TrimSpace(req.Prompt) == "" {
		return nil, fmt.Errorf("prompt is required")
	}

	settings, err := i.loadAgentIntegrationSettings(ctx, req.Meta.TenantID, req.Meta.ProjectID)
	if err != nil {
		return nil, err
	}
	profile, err := settings.resolveProfile(req.AgentProfileID)
	if err != nil {
		return nil, err
	}
	if !profile.Enabled {
		return nil, fmt.Errorf("agent profile %q is disabled", profile.ID)
	}

	routes, err := i.buildRoutes(ctx, settings, profile, req.Meta.TenantID, req.Meta.ProjectID)
	if err != nil {
		return nil, err
	}
	if len(routes) == 0 {
		return nil, fmt.Errorf("no invocation route available for agent profile %q", profile.ID)
	}

	startedAt := i.now().UTC()
	var routeErrors []string
	for idx, route := range routes {
		result, err := i.invokeRoute(ctx, route, req)
		if err != nil {
			routeErrors = append(routeErrors, fmt.Sprintf("%s: %v", route.name, err))
			continue
		}
		warning := ""
		if idx > 0 && len(routeErrors) > 0 {
			warning = fmt.Sprintf("Invocation succeeded on %s route after fallback. Prior failures: %s", route.name, strings.Join(routeErrors, "; "))
		}
		return &AgentInvokeResponse{
			Source:         "runtime-endpoint",
			Applied:        true,
			RequestID:      strings.TrimSpace(req.Meta.RequestID),
			TenantID:       strings.TrimSpace(req.Meta.TenantID),
			ProjectID:      strings.TrimSpace(req.Meta.ProjectID),
			AgentProfileID: profile.ID,
			Provider:       profile.Provider,
			Transport:      profile.Transport,
			Model:          profile.Model,
			Route:          route.name,
			EndpointRef:    route.endpointRef,
			CredentialRef:  route.credentialRef,
			StartedAt:      startedAt.Format(time.RFC3339),
			CompletedAt:    i.now().UTC().Format(time.RFC3339),
			OutputText:     result.outputText,
			FinishReason:   result.finishReason,
			Warning:        warning,
			Usage:          result.usage,
			RawResponse:    result.rawResponse,
		}, nil
	}

	return nil, fmt.Errorf("invoke agent profile %q failed: %s", profile.ID, strings.Join(routeErrors, "; "))
}

func (i *AgentInvoker) loadAgentIntegrationSettings(ctx context.Context, tenantID, projectID string) (agentIntegrationSettings, error) {
	record, err := i.store.GetIntegrationSettings(ctx, tenantID, projectID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || errors.Is(err, os.ErrNotExist) || strings.Contains(strings.ToLower(err.Error()), "no rows") {
			return defaultAgentIntegrationSettings(), nil
		}
		return agentIntegrationSettings{}, fmt.Errorf("load integration settings: %w", err)
	}
	return parseAgentIntegrationSettings(record.Settings)
}

func (i *AgentInvoker) buildRoutes(ctx context.Context, settings agentIntegrationSettings, profile agentProfileConfig, tenantID, projectID string) ([]invokeRoute, error) {
	gatewayRoute, gatewayErr := i.buildGatewayRoute(ctx, settings, profile, tenantID, projectID)
	directRoute, directErr := i.buildDirectRoute(ctx, profile, tenantID, projectID)

	routes := make([]invokeRoute, 0, 2)
	switch settings.ModelRouting {
	case "direct_first":
		if directErr == nil {
			routes = append(routes, *directRoute)
		}
		if gatewayErr == nil {
			routes = append(routes, *gatewayRoute)
		}
	default:
		if gatewayErr == nil {
			routes = append(routes, *gatewayRoute)
		}
		if settings.AllowDirectProviderFallback && directErr == nil {
			routes = append(routes, *directRoute)
		}
		if len(routes) == 0 && directErr == nil {
			routes = append(routes, *directRoute)
		}
	}

	if len(routes) == 0 {
		switch {
		case gatewayErr != nil && directErr != nil:
			return nil, fmt.Errorf("gateway route unavailable (%v); direct route unavailable (%v)", gatewayErr, directErr)
		case gatewayErr != nil:
			return nil, fmt.Errorf("gateway route unavailable: %w", gatewayErr)
		case directErr != nil:
			return nil, fmt.Errorf("direct route unavailable: %w", directErr)
		default:
			return nil, fmt.Errorf("no invocation routes available")
		}
	}
	return routes, nil
}

func (i *AgentInvoker) buildGatewayRoute(ctx context.Context, settings agentIntegrationSettings, profile agentProfileConfig, tenantID, projectID string) (*invokeRoute, error) {
	if !isGatewayRef(profile.EndpointRef) {
		return nil, fmt.Errorf("profile endpoint is not a gateway ref")
	}
	endpoint, err := i.resolveRefString(ctx, tenantID, projectID, profile.EndpointRef)
	if err != nil {
		return nil, fmt.Errorf("resolve gateway endpoint ref: %w", err)
	}
	route := &invokeRoute{
		name:          "gateway",
		profile:       profile,
		endpoint:      endpoint,
		endpointRef:   expandScopedRef(profile.EndpointRef, tenantID, projectID),
		credentialRef: expandScopedRef(settings.GatewayTokenRef, tenantID, projectID),
		authMode:      "bearer",
	}
	if strings.TrimSpace(settings.GatewayTokenRef) != "" {
		token, err := i.resolveRefString(ctx, tenantID, projectID, settings.GatewayTokenRef)
		if err != nil {
			return nil, fmt.Errorf("resolve gateway token ref: %w", err)
		}
		route.authValue = token
	}
	if strings.TrimSpace(settings.GatewayMTLSCertRef) != "" && strings.TrimSpace(settings.GatewayMTLSKeyRef) != "" {
		certPEM, certErr := i.resolveRefBytes(ctx, tenantID, projectID, settings.GatewayMTLSCertRef)
		keyPEM, keyErr := i.resolveRefBytes(ctx, tenantID, projectID, settings.GatewayMTLSKeyRef)
		if certErr == nil && keyErr == nil {
			route.mtlsCertPEM = certPEM
			route.mtlsKeyPEM = keyPEM
		}
	}
	return route, nil
}

func (i *AgentInvoker) buildDirectRoute(ctx context.Context, profile agentProfileConfig, tenantID, projectID string) (*invokeRoute, error) {
	endpoint, endpointRef, err := i.resolveDirectEndpoint(ctx, profile, tenantID, projectID)
	if err != nil {
		return nil, err
	}
	route := &invokeRoute{
		name:          "direct",
		profile:       profile,
		endpoint:      endpoint,
		endpointRef:   endpointRef,
		credentialRef: expandScopedRef(profile.CredentialRef, tenantID, projectID),
	}
	switch profile.Provider {
	case "openai_compatible", "openai_responses":
		token, err := i.resolveRefString(ctx, tenantID, projectID, profile.CredentialRef)
		if err != nil {
			return nil, fmt.Errorf("resolve direct credential ref: %w", err)
		}
		route.authMode = "bearer"
		route.authValue = token
	case "anthropic_messages":
		token, err := i.resolveRefString(ctx, tenantID, projectID, profile.CredentialRef)
		if err != nil {
			return nil, fmt.Errorf("resolve direct credential ref: %w", err)
		}
		route.authMode = "anthropic_api_key"
		route.authValue = token
	case "google_gemini":
		token, err := i.resolveRefString(ctx, tenantID, projectID, profile.CredentialRef)
		if err != nil {
			return nil, fmt.Errorf("resolve direct credential ref: %w", err)
		}
		route.authMode = "google_api_key"
		route.authValue = token
	case "azure_openai":
		token, err := i.resolveRefString(ctx, tenantID, projectID, profile.CredentialRef)
		if err != nil {
			return nil, fmt.Errorf("resolve direct credential ref: %w", err)
		}
		route.authMode = "azure_api_key"
		route.authValue = token
	case "aws_bedrock":
		credential, err := i.resolveBedrockCredential(ctx, tenantID, projectID, profile.CredentialRef)
		if err != nil {
			return nil, err
		}
		route.authMode = "bedrock_sigv4"
		route.bedrockAuth = credential
	default:
		return nil, fmt.Errorf("unsupported provider %q", profile.Provider)
	}
	return route, nil
}

func (i *AgentInvoker) resolveDirectEndpoint(ctx context.Context, profile agentProfileConfig, tenantID, projectID string) (string, string, error) {
	expandedRef := expandScopedRef(profile.EndpointRef, tenantID, projectID)
	if !isGatewayRef(profile.EndpointRef) {
		value, err := i.resolveRefString(ctx, tenantID, projectID, profile.EndpointRef)
		return value, expandedRef, err
	}
	switch profile.Provider {
	case "openai_compatible", "openai_responses":
		return "https://api.openai.com", "direct://api.openai.com", nil
	case "anthropic_messages":
		return "https://api.anthropic.com", "direct://api.anthropic.com", nil
	case "google_gemini":
		return "https://generativelanguage.googleapis.com", "direct://generativelanguage.googleapis.com", nil
	default:
		return "", "", fmt.Errorf("profile %q has gateway-only endpoint ref and no direct default", profile.ID)
	}
}

func (i *AgentInvoker) resolveRefString(ctx context.Context, tenantID, projectID, ref string) (string, error) {
	raw, err := i.resolver.Resolve(ctx, tenantID, projectID, ref)
	if err != nil {
		return "", err
	}
	return rawMessageToString(raw)
}

func (i *AgentInvoker) resolveRefBytes(ctx context.Context, tenantID, projectID, ref string) ([]byte, error) {
	raw, err := i.resolver.Resolve(ctx, tenantID, projectID, ref)
	if err != nil {
		return nil, err
	}
	text, err := rawMessageToString(raw)
	if err != nil {
		return nil, err
	}
	return []byte(text), nil
}

func (i *AgentInvoker) resolveBedrockCredential(ctx context.Context, tenantID, projectID, ref string) (*bedrockCredentialBundle, error) {
	raw, err := i.resolver.Resolve(ctx, tenantID, projectID, ref)
	if err != nil {
		return nil, fmt.Errorf("resolve Bedrock credential ref: %w", err)
	}
	var credential bedrockCredentialBundle
	if err := json.Unmarshal(raw, &credential); err == nil {
		if strings.EqualFold(strings.TrimSpace(credential.Source), "env") {
			credential.AccessKeyID = strings.TrimSpace(os.Getenv("AWS_ACCESS_KEY_ID"))
			credential.SecretAccessKey = strings.TrimSpace(os.Getenv("AWS_SECRET_ACCESS_KEY"))
			credential.SessionToken = strings.TrimSpace(os.Getenv("AWS_SESSION_TOKEN"))
		}
		if credential.Region == "" {
			credential.Region = strings.TrimSpace(os.Getenv("AWS_REGION"))
		}
		if strings.TrimSpace(credential.AccessKeyID) == "" || strings.TrimSpace(credential.SecretAccessKey) == "" {
			return nil, fmt.Errorf("Bedrock credential bundle must include accessKeyId and secretAccessKey or source=env")
		}
		if strings.TrimSpace(credential.Region) == "" {
			return nil, fmt.Errorf("Bedrock credential bundle must include region")
		}
		return &credential, nil
	}
	return nil, fmt.Errorf("Bedrock credential ref must resolve to a JSON credential bundle")
}

func (i *AgentInvoker) invokeRoute(ctx context.Context, route invokeRoute, req AgentInvokeRequest) (*invokeResult, error) {
	switch route.profile.Transport {
	case "responses_api":
		return i.invokeOpenAIResponses(ctx, route, req)
	case "messages_api":
		return i.invokeAnthropicMessages(ctx, route, req)
	case "gemini_api":
		return i.invokeGeminiGenerateContent(ctx, route, req)
	case "chat_completions_api":
		return i.invokeAzureChatCompletions(ctx, route, req)
	case "bedrock_invoke_model":
		return i.invokeBedrockModel(ctx, route, req)
	default:
		return nil, fmt.Errorf("unsupported transport %q", route.profile.Transport)
	}
}

func (i *AgentInvoker) invokeOpenAIResponses(ctx context.Context, route invokeRoute, req AgentInvokeRequest) (*invokeResult, error) {
	payload := map[string]interface{}{
		"model": route.profile.Model,
		"input": req.Prompt,
	}
	if systemPrompt := strings.TrimSpace(req.SystemPrompt); systemPrompt != "" {
		payload["instructions"] = systemPrompt
	}
	if maxTokens := normalizeInvokeMaxOutputTokens(req.MaxOutputTokens); maxTokens > 0 {
		payload["max_output_tokens"] = maxTokens
	}
	requestURL, err := appendRequestPath(route.endpoint, "/v1/responses")
	if err != nil {
		return nil, err
	}
	var response map[string]interface{}
	if err := i.doJSON(ctx, route, requestURL, payload, &response); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(response)
	return &invokeResult{
		outputText:   extractOpenAIOutputText(response),
		finishReason: invokeStringValue(response["status"]),
		usage:        mapValue(response["usage"]),
		rawResponse:  raw,
	}, nil
}

func (i *AgentInvoker) invokeAnthropicMessages(ctx context.Context, route invokeRoute, req AgentInvokeRequest) (*invokeResult, error) {
	payload := map[string]interface{}{
		"model":      route.profile.Model,
		"max_tokens": normalizeInvokeMaxOutputTokens(req.MaxOutputTokens),
		"messages": []map[string]interface{}{
			{
				"role":    "user",
				"content": req.Prompt,
			},
		},
	}
	if systemPrompt := strings.TrimSpace(req.SystemPrompt); systemPrompt != "" {
		payload["system"] = systemPrompt
	}
	requestURL, err := appendRequestPath(route.endpoint, "/v1/messages")
	if err != nil {
		return nil, err
	}
	var response map[string]interface{}
	if err := i.doJSON(ctx, route, requestURL, payload, &response); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(response)
	return &invokeResult{
		outputText:   extractAnthropicOutputText(response),
		finishReason: invokeStringValue(response["stop_reason"]),
		usage:        mapValue(response["usage"]),
		rawResponse:  raw,
	}, nil
}

func (i *AgentInvoker) invokeGeminiGenerateContent(ctx context.Context, route invokeRoute, req AgentInvokeRequest) (*invokeResult, error) {
	requestURL, err := buildGeminiRequestURL(route.endpoint, route.profile.Model, route.authMode == "google_api_key", route.authValue)
	if err != nil {
		return nil, err
	}
	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"role": "user",
				"parts": []map[string]interface{}{
					{"text": req.Prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"maxOutputTokens": normalizeInvokeMaxOutputTokens(req.MaxOutputTokens),
		},
	}
	if systemPrompt := strings.TrimSpace(req.SystemPrompt); systemPrompt != "" {
		payload["systemInstruction"] = map[string]interface{}{
			"parts": []map[string]interface{}{
				{"text": systemPrompt},
			},
		}
	}
	var response map[string]interface{}
	if err := i.doJSON(ctx, route, requestURL, payload, &response); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(response)
	return &invokeResult{
		outputText:   extractGeminiOutputText(response),
		finishReason: extractGeminiFinishReason(response),
		usage:        mapValue(response["usageMetadata"]),
		rawResponse:  raw,
	}, nil
}

func (i *AgentInvoker) invokeAzureChatCompletions(ctx context.Context, route invokeRoute, req AgentInvokeRequest) (*invokeResult, error) {
	requestURL, err := buildAzureChatCompletionsURL(route.endpoint, route.profile.Model)
	if err != nil {
		return nil, err
	}
	messages := make([]map[string]interface{}, 0, 2)
	if systemPrompt := strings.TrimSpace(req.SystemPrompt); systemPrompt != "" {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": systemPrompt,
		})
	}
	messages = append(messages, map[string]interface{}{
		"role":    "user",
		"content": req.Prompt,
	})
	payload := map[string]interface{}{
		"messages":   messages,
		"max_tokens": normalizeInvokeMaxOutputTokens(req.MaxOutputTokens),
	}
	var response map[string]interface{}
	if err := i.doJSON(ctx, route, requestURL, payload, &response); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(response)
	return &invokeResult{
		outputText:   extractAzureOutputText(response),
		finishReason: extractAzureFinishReason(response),
		usage:        mapValue(response["usage"]),
		rawResponse:  raw,
	}, nil
}

func (i *AgentInvoker) invokeBedrockModel(ctx context.Context, route invokeRoute, req AgentInvokeRequest) (*invokeResult, error) {
	if route.bedrockAuth == nil {
		return nil, fmt.Errorf("missing Bedrock signing credentials")
	}
	if !strings.HasPrefix(strings.ToLower(route.profile.Model), "anthropic.") {
		return nil, fmt.Errorf("Bedrock direct invoke currently supports anthropic.* models only")
	}
	requestURL, err := buildBedrockInvokeURL(route.endpoint, route.profile.Model)
	if err != nil {
		return nil, err
	}
	payload := map[string]interface{}{
		"anthropic_version": defaultBedrockAnthropicAPIVersion,
		"max_tokens":        normalizeInvokeMaxOutputTokens(req.MaxOutputTokens),
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": []map[string]interface{}{
					{"type": "text", "text": req.Prompt},
				},
			},
		},
	}
	if systemPrompt := strings.TrimSpace(req.SystemPrompt); systemPrompt != "" {
		payload["system"] = systemPrompt
	}
	var response map[string]interface{}
	if err := i.doJSON(ctx, route, requestURL, payload, &response); err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(response)
	return &invokeResult{
		outputText:   extractAnthropicOutputText(response),
		finishReason: invokeStringValue(response["stop_reason"]),
		usage:        mapValue(response["usage"]),
		rawResponse:  raw,
	}, nil
}

func (i *AgentInvoker) doJSON(ctx context.Context, route invokeRoute, requestURL string, payload interface{}, out interface{}) error {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal invocation request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	switch route.authMode {
	case "bearer":
		if token := strings.TrimSpace(route.authValue); token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
	case "anthropic_api_key":
		req.Header.Set("x-api-key", route.authValue)
		req.Header.Set("anthropic-version", "2023-06-01")
	case "google_api_key":
		if req.URL.Query().Get("key") == "" {
			req.Header.Set("x-goog-api-key", route.authValue)
		}
	case "azure_api_key":
		req.Header.Set("api-key", route.authValue)
	case "bedrock_sigv4":
		if err := signBedrockRequest(ctx, req, bodyBytes, route.bedrockAuth); err != nil {
			return err
		}
	default:
	}

	clientHTTP := i.httpClient
	if len(route.mtlsCertPEM) > 0 && len(route.mtlsKeyPEM) > 0 {
		certificate, err := tls.X509KeyPair(route.mtlsCertPEM, route.mtlsKeyPEM)
		if err != nil {
			return fmt.Errorf("build mTLS client certificate: %w", err)
		}
		clientHTTP = &http.Client{
			Timeout: i.httpClient.Timeout,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					MinVersion:   tls.VersionTLS12,
					Certificates: []tls.Certificate{certificate},
				},
			},
		}
	}

	resp, err := clientHTTP.Do(req)
	if err != nil {
		return fmt.Errorf("agent invocation request failed: %w", err)
	}
	defer resp.Body.Close()

	responseBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("agent invocation failed status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(responseBytes)))
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(responseBytes, out); err != nil {
		return fmt.Errorf("decode invocation response: %w", err)
	}
	return nil
}

func signBedrockRequest(ctx context.Context, req *http.Request, body []byte, credential *bedrockCredentialBundle) error {
	if credential == nil {
		return fmt.Errorf("Bedrock credential bundle is required")
	}
	sum := sha256.Sum256(body)
	payloadHash := hex.EncodeToString(sum[:])
	signer := v4.NewSigner()
	awsCreds := aws.Credentials{
		AccessKeyID:     credential.AccessKeyID,
		SecretAccessKey: credential.SecretAccessKey,
		SessionToken:    credential.SessionToken,
		Source:          "ref-map",
	}
	return signer.SignHTTP(ctx, awsCreds, req, payloadHash, "bedrock", credential.Region, time.Now().UTC())
}

func appendRequestPath(baseURL, desiredPath string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse endpoint URL %q: %w", baseURL, err)
	}
	if strings.Contains(parsed.Path, strings.TrimSpace(desiredPath)) {
		return parsed.String(), nil
	}
	parsed.Path = joinURLPath(parsed.Path, desiredPath)
	return parsed.String(), nil
}

func buildGeminiRequestURL(baseURL, model string, queryAuth bool, apiKey string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse endpoint URL %q: %w", baseURL, err)
	}
	if !strings.Contains(parsed.Path, ":generateContent") {
		parsed.Path = joinURLPath(parsed.Path, path.Join("/v1beta/models", model)+":generateContent")
	}
	if queryAuth && strings.TrimSpace(apiKey) != "" {
		q := parsed.Query()
		q.Set("key", apiKey)
		parsed.RawQuery = q.Encode()
	}
	return parsed.String(), nil
}

func buildAzureChatCompletionsURL(baseURL, model string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse endpoint URL %q: %w", baseURL, err)
	}
	if !strings.Contains(parsed.Path, "/chat/completions") {
		parsed.Path = joinURLPath(parsed.Path, path.Join("/openai/deployments", model, "chat/completions"))
	}
	q := parsed.Query()
	if q.Get("api-version") == "" {
		q.Set("api-version", defaultAzureOpenAIAPIVersion)
	}
	parsed.RawQuery = q.Encode()
	return parsed.String(), nil
}

func buildBedrockInvokeURL(baseURL, model string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse endpoint URL %q: %w", baseURL, err)
	}
	if !strings.Contains(parsed.Path, "/model/") || !strings.Contains(parsed.Path, "/invoke") {
		parsed.Path = joinURLPath(parsed.Path, path.Join("/model", model, "invoke"))
	}
	return parsed.String(), nil
}

func normalizeInvokeMaxOutputTokens(value int) int {
	if value <= 0 {
		return defaultInvokeMaxOutputTokens
	}
	return value
}

func extractOpenAIOutputText(payload map[string]interface{}) string {
	if text := strings.TrimSpace(invokeStringValue(payload["output_text"])); text != "" {
		return text
	}
	output, _ := payload["output"].([]interface{})
	for _, candidate := range output {
		item, _ := candidate.(map[string]interface{})
		content, _ := item["content"].([]interface{})
		for _, contentItem := range content {
			entry, _ := contentItem.(map[string]interface{})
			text := strings.TrimSpace(firstNonEmpty(
				invokeStringValue(entry["text"]),
				invokeStringValue(entry["output_text"]),
			))
			if text != "" {
				return text
			}
		}
	}
	return ""
}

func extractAnthropicOutputText(payload map[string]interface{}) string {
	content, _ := payload["content"].([]interface{})
	for _, candidate := range content {
		item, _ := candidate.(map[string]interface{})
		if strings.EqualFold(invokeStringValue(item["type"]), "text") {
			if text := strings.TrimSpace(invokeStringValue(item["text"])); text != "" {
				return text
			}
		}
	}
	return ""
}

func extractGeminiOutputText(payload map[string]interface{}) string {
	candidates, _ := payload["candidates"].([]interface{})
	for _, candidate := range candidates {
		item, _ := candidate.(map[string]interface{})
		content, _ := item["content"].(map[string]interface{})
		parts, _ := content["parts"].([]interface{})
		for _, part := range parts {
			entry, _ := part.(map[string]interface{})
			if text := strings.TrimSpace(invokeStringValue(entry["text"])); text != "" {
				return text
			}
		}
	}
	return ""
}

func extractGeminiFinishReason(payload map[string]interface{}) string {
	candidates, _ := payload["candidates"].([]interface{})
	if len(candidates) == 0 {
		return ""
	}
	first, _ := candidates[0].(map[string]interface{})
	return invokeStringValue(first["finishReason"])
}

func extractAzureOutputText(payload map[string]interface{}) string {
	choices, _ := payload["choices"].([]interface{})
	for _, candidate := range choices {
		item, _ := candidate.(map[string]interface{})
		message, _ := item["message"].(map[string]interface{})
		if text := strings.TrimSpace(invokeStringValue(message["content"])); text != "" {
			return text
		}
	}
	return ""
}

func extractAzureFinishReason(payload map[string]interface{}) string {
	choices, _ := payload["choices"].([]interface{})
	if len(choices) == 0 {
		return ""
	}
	first, _ := choices[0].(map[string]interface{})
	return invokeStringValue(first["finish_reason"])
}

func mapValue(value interface{}) JSONObject {
	if value == nil {
		return nil
	}
	if mapped, ok := value.(map[string]interface{}); ok {
		return mapped
	}
	return nil
}

func invokeStringValue(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return ""
	}
}

func expandScopedRef(ref, tenantID, projectID string) string {
	replacer := strings.NewReplacer(
		"{tenantId}", strings.TrimSpace(tenantID),
		"{projectId}", strings.TrimSpace(projectID),
	)
	return replacer.Replace(strings.TrimSpace(ref))
}

func rawMessageToString(raw json.RawMessage) (string, error) {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		text = strings.TrimSpace(text)
		if text == "" {
			return "", fmt.Errorf("resolved ref value is empty")
		}
		return text, nil
	}
	return "", fmt.Errorf("resolved ref value must be a JSON string")
}

func (r *runtimeRefResolver) Resolve(_ context.Context, tenantID, projectID, ref string) (json.RawMessage, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return nil, fmt.Errorf("ref value is required")
	}
	expanded := expandScopedRef(ref, tenantID, projectID)

	r.mu.Lock()
	defer r.mu.Unlock()

	values, err := r.loadLocked()
	if err != nil {
		return nil, err
	}
	if value, ok := values[expanded]; ok {
		return cloneRawMessage(value), nil
	}
	if value, ok := values[ref]; ok {
		return cloneRawMessage(value), nil
	}
	return nil, fmt.Errorf("ref %q is not present in runtime ref values", expanded)
}

func (r *runtimeRefResolver) loadLocked() (map[string]json.RawMessage, error) {
	if r.inlineJSON != "" {
		if r.inlineCache != nil {
			return r.inlineCache, nil
		}
		values, err := decodeRefValues([]byte(r.inlineJSON))
		if err != nil {
			return nil, err
		}
		r.inlineCache = values
		return r.inlineCache, nil
	}
	if r.path == "" {
		return map[string]json.RawMessage{}, nil
	}
	info, err := os.Stat(r.path)
	if err != nil {
		return nil, fmt.Errorf("stat runtime ref values path: %w", err)
	}
	if r.fileCache != nil && info.ModTime().Equal(r.fileModTime) {
		return r.fileCache, nil
	}
	content, err := os.ReadFile(r.path)
	if err != nil {
		return nil, fmt.Errorf("read runtime ref values path: %w", err)
	}
	values, err := decodeRefValues(content)
	if err != nil {
		return nil, err
	}
	r.fileCache = values
	r.fileModTime = info.ModTime()
	return r.fileCache, nil
}

func decodeRefValues(content []byte) (map[string]json.RawMessage, error) {
	decoded := make(map[string]json.RawMessage)
	if err := json.Unmarshal(content, &decoded); err != nil {
		return nil, fmt.Errorf("decode runtime ref values: %w", err)
	}
	return decoded, nil
}

func cloneRawMessage(raw json.RawMessage) json.RawMessage {
	if raw == nil {
		return nil
	}
	out := make([]byte, len(raw))
	copy(out, raw)
	return out
}
