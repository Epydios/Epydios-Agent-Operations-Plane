package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const connectorGitHubDefaultEndpoint = "https://api.github.com"

type githubConnectorExecutionResult struct {
	Owner          string
	Repo           string
	PullNumber     int
	PullTitle      string
	PullState      string
	PullURL        string
	AuthorLogin    string
	Merged         bool
	Draft          bool
	EndpointLabel  string
	EndpointRef    string
	CredentialRef  string
	AllowedByScope string
}

var executeGitHubConnectorPullRequest = executeGitHubConnectorPullRequestReal

func normalizeAndClassifyGitHubConnectorRequest(profile connectorProfileConfig, toolName string, args JSONObject) (JSONObject, JSONObject, error) {
	if toolName != connectorToolGetPullRequest {
		return nil, nil, fmt.Errorf("connector tool %q is not supported", toolName)
	}

	out := cloneJSONObject(args)
	owner := strings.ToLower(strings.TrimSpace(connectorString(out["owner"])))
	repo := strings.ToLower(strings.TrimSpace(connectorString(out["repo"])))
	pullNumber, err := normalizeConnectorInteger(out["pull_number"])
	if err != nil {
		return nil, nil, fmt.Errorf("connector.arguments.pull_number %w", err)
	}
	if owner == "" {
		return nil, nil, fmt.Errorf("connector.arguments.owner is required")
	}
	if repo == "" {
		return nil, nil, fmt.Errorf("connector.arguments.repo is required")
	}
	if pullNumber <= 0 {
		return nil, nil, fmt.Errorf("connector.arguments.pull_number must be >= 1")
	}

	out["owner"] = owner
	out["repo"] = repo
	out["pull_number"] = pullNumber

	scopeAllowed, scopeReason := githubConnectorScopeAllowed(profile, owner, repo)
	statementClass := "api_read"
	if !scopeAllowed {
		statementClass = "repo_out_of_scope"
	}
	return out, JSONObject{
		"statementClass":    statementClass,
		"operation":         "github.pull_request.get",
		"primaryVerb":       "read",
		"readOnlyCandidate": scopeAllowed,
		"readOnly":          scopeAllowed,
		"scopeAllowed":      scopeAllowed,
		"owner":             owner,
		"repo":              repo,
		"repoRef":           owner + "/" + repo,
		"pullNumber":        pullNumber,
		"reason":            scopeReason,
	}, nil
}

func executeMCPGitHubConnector(ctx context.Context, plan *connectorExecutionPlan) (map[string]interface{}, error) {
	if plan.ToolName != connectorToolGetPullRequest {
		return nil, fmt.Errorf("connector tool %q is not supported", plan.ToolName)
	}

	owner, _ := plan.Arguments["owner"].(string)
	repo, _ := plan.Arguments["repo"].(string)
	pullNumber, err := normalizeConnectorInteger(plan.Arguments["pull_number"])
	if err != nil {
		return nil, fmt.Errorf("connector.arguments.pull_number %w", err)
	}
	if owner == "" || repo == "" || pullNumber <= 0 {
		return nil, fmt.Errorf("connector %s requires owner, repo, and pull_number", connectorDriverMCPGitHub)
	}

	scopeAllowed, scopeReason := githubConnectorScopeAllowed(plan.Profile, owner, repo)
	if !scopeAllowed {
		return nil, fmt.Errorf("connector %s denied pull request outside configured scope: %s", connectorDriverMCPGitHub, scopeReason)
	}

	endpoint, endpointRef, err := resolveConnectorEndpointRef(ctx, plan.TenantID, plan.ProjectID, plan.Profile.EndpointRef, connectorGitHubDefaultEndpoint)
	if err != nil {
		return nil, fmt.Errorf("resolve github endpoint ref: %w", err)
	}
	credentialRef := expandScopedRef(plan.Profile.CredentialRef, plan.TenantID, plan.ProjectID)
	token, err := resolveConnectorRuntimeRefString(ctx, plan.TenantID, plan.ProjectID, plan.Profile.CredentialRef)
	if err != nil {
		return nil, fmt.Errorf("resolve github credential ref: %w", err)
	}

	execResult, err := executeGitHubConnectorPullRequest(ctx, endpoint, token, owner, repo, pullNumber)
	if err != nil {
		return nil, err
	}
	execResult.EndpointRef = endpointRef
	execResult.CredentialRef = credentialRef
	execResult.AllowedByScope = scopeReason

	result := map[string]interface{}{
		"driver":         connectorDriverMCPGitHub,
		"toolName":       plan.ToolName,
		"connectorId":    plan.Profile.ID,
		"connectorLabel": plan.Profile.Label,
		"owner":          execResult.Owner,
		"repo":           execResult.Repo,
		"pullNumber":     execResult.PullNumber,
		"pullTitle":      execResult.PullTitle,
		"pullState":      execResult.PullState,
		"pullUrl":        execResult.PullURL,
		"authorLogin":    execResult.AuthorLogin,
		"merged":         execResult.Merged,
		"draft":          execResult.Draft,
		"scopeReason":    execResult.AllowedByScope,
		"resultPreview": map[string]interface{}{
			"title":  execResult.PullTitle,
			"state":  execResult.PullState,
			"url":    execResult.PullURL,
			"author": execResult.AuthorLogin,
		},
	}
	if execResult.EndpointLabel != "" {
		result["endpointLabel"] = execResult.EndpointLabel
	}
	if execResult.EndpointRef != "" {
		result["endpointRef"] = execResult.EndpointRef
	}
	if execResult.CredentialRef != "" {
		result["credentialRef"] = execResult.CredentialRef
	}
	if note := strings.TrimSpace(plan.ApprovalNote); note != "" {
		result["approvalNote"] = note
	}
	return result, nil
}

func executeGitHubConnectorPullRequestReal(ctx context.Context, endpoint, token, owner, repo string, pullNumber int) (githubConnectorExecutionResult, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(endpoint), "/")
	if baseURL == "" {
		baseURL = connectorGitHubDefaultEndpoint
	}
	requestURL := fmt.Sprintf("%s/repos/%s/%s/pulls/%d", baseURL, url.PathEscape(owner), url.PathEscape(repo), pullNumber)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return githubConnectorExecutionResult{}, fmt.Errorf("build github request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if strings.TrimSpace(token) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return githubConnectorExecutionResult{}, fmt.Errorf("execute github pull request read: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return githubConnectorExecutionResult{}, fmt.Errorf("read github response body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return githubConnectorExecutionResult{}, fmt.Errorf("github pull request read failed status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return githubConnectorExecutionResult{}, fmt.Errorf("decode github pull request response: %w", err)
	}
	parsedEndpoint, err := url.Parse(baseURL)
	if err != nil {
		return githubConnectorExecutionResult{}, fmt.Errorf("parse github endpoint: %w", err)
	}
	user, _ := payload["user"].(map[string]interface{})
	return githubConnectorExecutionResult{
		Owner:         owner,
		Repo:          repo,
		PullNumber:    pullNumber,
		PullTitle:     strings.TrimSpace(connectorString(payload["title"])),
		PullState:     strings.TrimSpace(connectorString(payload["state"])),
		PullURL:       strings.TrimSpace(connectorString(payload["html_url"])),
		AuthorLogin:   strings.TrimSpace(connectorString(user["login"])),
		Merged:        connectorBoolean(payload["merged"]),
		Draft:         connectorBoolean(payload["draft"]),
		EndpointLabel: strings.TrimSpace(parsedEndpoint.Host),
	}, nil
}

func githubConnectorScopeAllowed(profile connectorProfileConfig, owner, repo string) (bool, string) {
	owner = strings.ToLower(strings.TrimSpace(owner))
	repo = strings.ToLower(strings.TrimSpace(repo))
	repoRef := owner + "/" + repo
	for _, allowedRepo := range profile.AllowedRepos {
		if strings.ToLower(strings.TrimSpace(allowedRepo)) == repoRef {
			return true, "owner/repo is allowed by the bounded GitHub connector profile"
		}
	}
	for _, allowedOwner := range profile.AllowedOwners {
		if strings.ToLower(strings.TrimSpace(allowedOwner)) == owner {
			return true, "owner is allowed by the bounded GitHub connector profile"
		}
	}
	return false, "requested owner/repo is outside the bounded GitHub connector allowlist"
}

func normalizeConnectorInteger(value interface{}) (int, error) {
	switch typed := value.(type) {
	case int:
		return typed, nil
	case int64:
		return int(typed), nil
	case float64:
		return int(typed), nil
	case float32:
		return int(typed), nil
	case json.Number:
		parsed, err := typed.Int64()
		if err != nil {
			return 0, fmt.Errorf("must be an integer")
		}
		return int(parsed), nil
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err != nil {
			return 0, fmt.Errorf("must be an integer")
		}
		return parsed, nil
	default:
		return 0, fmt.Errorf("must be an integer")
	}
}

func resolveConnectorRuntimeRefString(ctx context.Context, tenantID, projectID, ref string) (string, error) {
	resolver := &runtimeRefResolver{
		path:       strings.TrimSpace(os.Getenv("RUNTIME_REF_VALUES_PATH")),
		inlineJSON: strings.TrimSpace(os.Getenv("RUNTIME_REF_VALUES_JSON")),
	}
	raw, err := resolver.Resolve(ctx, tenantID, projectID, ref)
	if err != nil {
		return "", err
	}
	return rawMessageToString(raw)
}

func resolveConnectorEndpointRef(ctx context.Context, tenantID, projectID, endpointRef, defaultEndpoint string) (string, string, error) {
	if strings.TrimSpace(endpointRef) == "" {
		return strings.TrimSpace(defaultEndpoint), "", nil
	}
	endpoint, err := resolveConnectorRuntimeRefString(ctx, tenantID, projectID, endpointRef)
	if err != nil {
		return "", "", err
	}
	return endpoint, expandScopedRef(endpointRef, tenantID, projectID), nil
}

func connectorBoolean(value interface{}) bool {
	typed, _ := value.(bool)
	return typed
}

func connectorString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return fmt.Sprintf("%v", value)
	}
}
