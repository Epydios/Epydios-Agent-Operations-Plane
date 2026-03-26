package runtime

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestExecuteMCPGitHubConnectorReadOnly(t *testing.T) {
	t.Setenv("RUNTIME_REF_VALUES_PATH", "")
	t.Setenv("RUNTIME_REF_VALUES_JSON", string(mustMarshalJSON(map[string]interface{}{
		"ref://projects/project-a/providers/github/endpoint": "https://github-proof.local",
		"ref://projects/project-a/providers/github/token":    "github-proof-token",
	})))

	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(githubConnectorSettingsFixture(
		"ref://projects/{projectId}/providers/github/endpoint",
		"ref://projects/{projectId}/providers/github/token",
	)))
	if err != nil {
		t.Fatalf("parse github connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Meta: ObjectMeta{
			TenantID:  "tenant-a",
			ProjectID: "project-a",
		},
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "github-proof",
			Driver:      connectorDriverMCPGitHub,
			ToolName:    connectorToolGetPullRequest,
			Arguments: JSONObject{
				"owner":       "epydios",
				"repo":        "epydios-agentops-control-plane",
				"pull_number": 42,
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}

	restore := stubGitHubConnectorPullRequestExecutor(func(_ context.Context, endpoint, token, owner, repo string, pullNumber int) (githubConnectorExecutionResult, error) {
		if endpoint != "https://github-proof.local" {
			t.Fatalf("endpoint=%q want https://github-proof.local", endpoint)
		}
		if token != "github-proof-token" {
			t.Fatalf("token=%q want github-proof-token", token)
		}
		if owner != "epydios" || repo != "epydios-agentops-control-plane" || pullNumber != 42 {
			t.Fatalf("unexpected GitHub target owner=%q repo=%q pull=%d", owner, repo, pullNumber)
		}
		return githubConnectorExecutionResult{
			Owner:         owner,
			Repo:          repo,
			PullNumber:    pullNumber,
			PullTitle:     "Bounded connector proof",
			PullState:     "open",
			PullURL:       "https://github.local/epydios/epydios-agentops-control-plane/pull/42",
			AuthorLogin:   "proof-user",
			EndpointLabel: "github-proof.local",
		}, nil
	})
	defer restore()

	result, err := executeConnectorPlan(context.Background(), plan)
	if err != nil {
		t.Fatalf("executeConnectorPlan() error = %v", err)
	}
	if got, want := result["driver"], connectorDriverMCPGitHub; got != want {
		t.Fatalf("driver=%v want %v", got, want)
	}
	if got, want := result["pullNumber"].(int), 42; got != want {
		t.Fatalf("pullNumber=%d want %d", got, want)
	}
	if got, want := result["pullTitle"], "Bounded connector proof"; got != want {
		t.Fatalf("pullTitle=%v want %v", got, want)
	}
	if got, want := result["endpointRef"], "ref://projects/project-a/providers/github/endpoint"; got != want {
		t.Fatalf("endpointRef=%v want %v", got, want)
	}
	if got, want := result["credentialRef"], "ref://projects/project-a/providers/github/token"; got != want {
		t.Fatalf("credentialRef=%v want %v", got, want)
	}
}

func TestExecuteMCPGitHubConnectorRejectsOutOfScope(t *testing.T) {
	t.Setenv("RUNTIME_REF_VALUES_PATH", "")
	t.Setenv("RUNTIME_REF_VALUES_JSON", string(mustMarshalJSON(map[string]interface{}{
		"ref://projects/project-a/providers/github/token": "github-proof-token",
	})))

	settings, err := parseConnectorIntegrationSettings(mustMarshalJSON(githubConnectorSettingsFixture(
		"",
		"ref://projects/{projectId}/providers/github/token",
	)))
	if err != nil {
		t.Fatalf("parse github connector settings: %v", err)
	}

	plan, err := deriveConnectorExecutionPlan(RunCreateRequest{
		Meta: ObjectMeta{
			TenantID:  "tenant-a",
			ProjectID: "project-a",
		},
		Connector: &ConnectorExecutionRequest{
			Enabled:     true,
			ConnectorID: "github-proof",
			Driver:      connectorDriverMCPGitHub,
			ToolName:    connectorToolGetPullRequest,
			Arguments: JSONObject{
				"owner":       "outside-org",
				"repo":        "secret-repo",
				"pull_number": 7,
			},
		},
	}, settings)
	if err != nil {
		t.Fatalf("deriveConnectorExecutionPlan() error = %v", err)
	}

	if _, err := executeConnectorPlan(context.Background(), plan); err == nil || !strings.Contains(strings.ToLower(err.Error()), "outside configured scope") {
		t.Fatalf("expected out-of-scope denial, got err=%v", err)
	}
}

func TestExecuteRunConnectorGitHubAllowedAndDenied(t *testing.T) {
	t.Setenv("RUNTIME_REF_VALUES_PATH", "")
	t.Setenv("RUNTIME_REF_VALUES_JSON", string(mustMarshalJSON(map[string]interface{}{
		"ref://projects/project-a/providers/github/endpoint": "https://github-proof.local",
		"ref://projects/project-a/providers/github/token":    "github-proof-token",
	})))

	store := newMemoryRunStore()
	if err := store.UpsertConnectorSettings(context.Background(), &ConnectorSettingsRecord{
		TenantID:  "tenant-a",
		ProjectID: "project-a",
		Settings: mustMarshalJSON(githubConnectorSettingsFixture(
			"ref://projects/{projectId}/providers/github/endpoint",
			"ref://projects/{projectId}/providers/github/token",
		)),
	}); err != nil {
		t.Fatalf("seed connector settings: %v", err)
	}

	restore := stubGitHubConnectorPullRequestExecutor(func(_ context.Context, endpoint, token, owner, repo string, pullNumber int) (githubConnectorExecutionResult, error) {
		return githubConnectorExecutionResult{
			Owner:         owner,
			Repo:          repo,
			PullNumber:    pullNumber,
			PullTitle:     "Allowed GitHub proof",
			PullState:     "open",
			PullURL:       fmt.Sprintf("https://github.local/%s/%s/pull/%d", owner, repo, pullNumber),
			AuthorLogin:   "proof-user",
			EndpointLabel: "github-proof.local",
		}, nil
	})
	defer restore()

	providers := newFakeConnectorProviderClient()
	orch := &Orchestrator{
		Namespace:             "epydios-system",
		Store:                 store,
		ProviderRegistry:      providers,
		RetentionDefaultClass: "standard",
	}

	allowRun, err := orch.ExecuteRun(context.Background(), githubConnectorRunRequest("req-github-allow", "epydios", "epydios-agentops-control-plane", 11))
	if err != nil {
		t.Fatalf("allow ExecuteRun() error = %v", err)
	}
	if allowRun.PolicyDecision != "ALLOW" {
		t.Fatalf("allow run policy=%q want ALLOW", allowRun.PolicyDecision)
	}
	allowPayload := evidencePayloadEcho(t, allowRun.EvidenceRecordResponse)
	allowConnectorPayload, _ := allowPayload["connector"].(map[string]interface{})
	if allowConnectorPayload["state"] != "completed" {
		t.Fatalf("allow connector state=%v want completed", allowConnectorPayload["state"])
	}
	allowResult, _ := allowConnectorPayload["result"].(map[string]interface{})
	if allowResult["pullNumber"] != float64(11) {
		t.Fatalf("allow connector pullNumber=%v want 11", allowResult["pullNumber"])
	}

	denyRun, err := orch.ExecuteRun(context.Background(), githubConnectorRunRequest("req-github-deny", "outside-org", "secret-repo", 12))
	if err != nil {
		t.Fatalf("deny ExecuteRun() error = %v", err)
	}
	if denyRun.PolicyDecision != "DENY" {
		t.Fatalf("deny run policy=%q want DENY", denyRun.PolicyDecision)
	}
	denyPayload := evidencePayloadEcho(t, denyRun.EvidenceRecordResponse)
	denyConnectorPayload, _ := denyPayload["connector"].(map[string]interface{})
	if denyConnectorPayload["state"] != "skipped" {
		t.Fatalf("deny connector state=%v want skipped", denyConnectorPayload["state"])
	}
	classification, _ := denyConnectorPayload["classification"].(map[string]interface{})
	if classification["statementClass"] != "repo_out_of_scope" {
		t.Fatalf("deny connector classification=%v want repo_out_of_scope", classification["statementClass"])
	}
}

func githubConnectorRunRequest(requestID, owner, repo string, pullNumber int) RunCreateRequest {
	return RunCreateRequest{
		Meta: ObjectMeta{
			RequestID: requestID,
			TenantID:  "tenant-a",
			ProjectID: "project-a",
		},
		Subject: JSONObject{
			"type": "connector_request",
		},
		Action: JSONObject{
			"type":  "connector.github.get_pull_request",
			"class": "connector_read",
			"verb":  "read",
		},
		Resource: JSONObject{
			"kind": "github-pull-request",
			"name": owner + "/" + repo,
		},
		Context: JSONObject{
			"source": "github-proof",
		},
		Connector: &ConnectorExecutionRequest{
			Enabled:      true,
			Tier:         connectorTierReadOnly,
			ConnectorID:  "github-proof",
			Driver:       connectorDriverMCPGitHub,
			ToolName:     connectorToolGetPullRequest,
			ApprovalNote: "GitHub proof connector request.",
			Arguments: JSONObject{
				"owner":       owner,
				"repo":        repo,
				"pull_number": pullNumber,
			},
		},
	}
}

func stubGitHubConnectorPullRequestExecutor(fn func(context.Context, string, string, string, string, int) (githubConnectorExecutionResult, error)) func() {
	previous := executeGitHubConnectorPullRequest
	executeGitHubConnectorPullRequest = fn
	return func() {
		executeGitHubConnectorPullRequest = previous
	}
}
