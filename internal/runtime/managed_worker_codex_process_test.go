package runtime

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestCodexManagedWorkerAdapterProcessModeParsesStructuredTurn(t *testing.T) {
	adapter := codexManagedWorkerAdapter{
		mode:        "process",
		cliPath:     "codex",
		homeDir:     "/tmp/codex-home",
		workdir:     "/tmp",
		sandboxMode: "read-only",
		timeout:     15 * time.Second,
		runProcess: func(_ context.Context, req codexProcessRequest) ([]byte, error) {
			if req.Model != "gpt-5-codex" {
				t.Fatalf("model=%q want gpt-5-codex", req.Model)
			}
			if req.Workdir != "/tmp" {
				t.Fatalf("workdir=%q want /tmp", req.Workdir)
			}
			if req.HomeDir != "/tmp/codex-home" {
				t.Fatalf("homeDir=%q want /tmp/codex-home", req.HomeDir)
			}
			if req.Boundary == nil {
				t.Fatal("boundary should be present in process mode")
			}
			if req.Boundary.ProviderID != "agentops_gateway" {
				t.Fatalf("boundary providerId=%q want agentops_gateway", req.Boundary.ProviderID)
			}
			if req.Boundary.BaseURL != "https://gateway.local/v1" {
				t.Fatalf("boundary baseURL=%q want https://gateway.local/v1", req.Boundary.BaseURL)
			}
			if !strings.Contains(req.Prompt, "summarize") {
				t.Fatalf("prompt=%q did not include operator request", req.Prompt)
			}
			return []byte(strings.Join([]string{
				`{"type":"thread.started","thread_id":"thread-1"}`,
				`{"type":"turn.started"}`,
				`{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Inspecting the workspace before deciding what needs approval."}}`,
				`{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc pwd","aggregated_output":"/tmp\n","exit_code":0,"status":"completed"}}`,
				`{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\"message\":\"Managed Codex summarized the workspace and queued one governed command.\",\"tool_proposals\":[{\"type\":\"terminal_command\",\"summary\":\"Run the runtime tests before proceeding.\",\"command\":\"go test ./internal/runtime\",\"stdin\":\"\",\"cwd\":\"/tmp\",\"timeoutSeconds\":30,\"readOnlyRequested\":true,\"confidence\":\"structured\"}]}"}}`,
				`{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":34}}`,
			}, "\n")), nil
		},
	}

	result, err := adapter.RunTurn(context.Background(), AgentInvokeRequest{
		Prompt:       "summarize the workspace and propose any governed command",
		SystemPrompt: "stay concise",
	}, agentProfileConfig{
		ID:    "codex",
		Model: "gpt-5-codex",
	}, &managedWorkerProviderBoundary{
		RouteName:     "managed_worker_gateway_process",
		ProviderID:    "agentops_gateway",
		ProviderName:  "AgentOps Gateway",
		BaseURL:       "https://gateway.local/v1",
		WireAPI:       "responses",
		EndpointRef:   "ref://gateways/litellm/openai-compatible",
		CredentialRef: "ref://projects/project-a/gateways/litellm/bearer-token",
		TokenEnvVar:   "AGENTOPS_CODEX_GATEWAY_TOKEN",
		TokenValue:    "gateway-token",
	}, nil)
	if err != nil {
		t.Fatalf("RunTurn error: %v", err)
	}
	if result.outputText != "Managed Codex summarized the workspace and queued one governed command." {
		t.Fatalf("outputText=%q", result.outputText)
	}
	if result.finishReason != "managed_worker_process" {
		t.Fatalf("finishReason=%q want managed_worker_process", result.finishReason)
	}
	if len(result.workerOutputChunks) == 0 {
		t.Fatalf("workerOutputChunks should not be empty")
	}
	if len(result.toolProposals) != 1 {
		t.Fatalf("toolProposals=%d want 1", len(result.toolProposals))
	}
	if command := strings.TrimSpace(result.toolProposals[0]["command"].(string)); command != "go test ./internal/runtime" {
		t.Fatalf("proposal command=%q", command)
	}
	if result.usage["output_tokens"] != float64(34) {
		t.Fatalf("usage output_tokens=%v want 34", result.usage["output_tokens"])
	}
	if !strings.Contains(string(result.rawResponse), "command_execution") {
		t.Fatalf("rawResponse missing command_execution: %s", string(result.rawResponse))
	}
}

func TestBuildManagedCodexPromptAllowsGovernedMutationProposals(t *testing.T) {
	prompt := buildManagedCodexPrompt(codexProcessRequest{
		Prompt:       "summarize the workspace and propose any governed command",
		SystemPrompt: "stay concise",
	})
	if !strings.Contains(prompt, "creating or modifying a file") {
		t.Fatalf("prompt missing governed mutation proposal guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "Do not answer with only a sandbox refusal") {
		t.Fatalf("prompt missing governed proposal requirement: %s", prompt)
	}
	if !strings.Contains(prompt, "readOnlyRequested=false") {
		t.Fatalf("prompt missing mutating command approval guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "`command` = `tee <target>` and `stdin` = the exact file contents") {
		t.Fatalf("prompt missing deterministic tee+stdin guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "set `stdin` to the empty string") {
		t.Fatalf("prompt missing empty stdin guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "`governed_action_request`") {
		t.Fatalf("prompt missing governed action proposal guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "paper-trade or finance requests") {
		t.Fatalf("prompt missing finance governed-action guidance: %s", prompt)
	}
}

func TestBuildCodexBoundaryConfigArgsForcesAPILoginAuth(t *testing.T) {
	items := buildCodexBoundaryConfigArgs(&managedWorkerProviderBoundary{
		ProviderID:  "agentops_gateway",
		BaseURL:     "https://gateway.local/v1",
		WireAPI:     "responses",
		TokenEnvVar: "AGENTOPS_CODEX_GATEWAY_TOKEN",
	})
	joined := strings.Join(items, "\n")
	if !strings.Contains(joined, `forced_login_method="api"`) {
		t.Fatalf("missing forced api login config: %s", joined)
	}
	if !strings.Contains(joined, `model_reasoning_effort="high"`) {
		t.Fatalf("missing supported model reasoning config: %s", joined)
	}
	if !strings.Contains(joined, `plan_mode_reasoning_effort="high"`) {
		t.Fatalf("missing supported plan reasoning config: %s", joined)
	}
	if !strings.Contains(joined, `model_providers.agentops_gateway.env_key="OPENAI_API_KEY"`) {
		t.Fatalf("missing provider env_key config: %s", joined)
	}
	if !strings.Contains(joined, `model_providers.agentops_gateway.bearer_token_env_var="AGENTOPS_CODEX_GATEWAY_TOKEN"`) {
		t.Fatalf("missing bearer token env config: %s", joined)
	}
}

func TestNewCodexManagedWorkerAdapterProcessModeForcesReadOnlySandbox(t *testing.T) {
	adapter := newCodexManagedWorkerAdapter(AgentInvokerConfig{
		ManagedCodexMode: "process",
		CodexSandboxMode: "workspace-write",
	})
	if adapter.sandboxMode != "read-only" {
		t.Fatalf("sandboxMode=%q want read-only", adapter.sandboxMode)
	}
}

func TestBuildManagedCodexContinuationPromptAllowsGovernedMutationProposals(t *testing.T) {
	prompt := buildManagedCodexContinuationPrompt(managedWorkerContinuationRequest{})
	if !strings.Contains(prompt, "return it as a governed `tool_proposals` terminal command") {
		t.Fatalf("continuation prompt missing governed mutation guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "If the next step is a real-world external action, return a `governed_action_request` proposal") {
		t.Fatalf("continuation prompt missing governed action continuation guidance: %s", prompt)
	}
}

func TestCodexManagedWorkerAdapterProcessModeParsesGovernedActionProposal(t *testing.T) {
	adapter := codexManagedWorkerAdapter{
		mode:        "process",
		cliPath:     "codex",
		homeDir:     "/tmp/codex-home",
		workdir:     "/tmp",
		sandboxMode: "read-only",
		timeout:     15 * time.Second,
		runProcess: func(_ context.Context, _ codexProcessRequest) ([]byte, error) {
			return []byte(strings.Join([]string{
				`{"type":"thread.started","thread_id":"thread-1"}`,
				`{"type":"turn.started"}`,
				`{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\"message\":\"I converted the operator request into a governed trade proposal.\",\"tool_proposals\":[{\"type\":\"governed_action_request\",\"summary\":\"BUY 25 AAPL in paper account paper-main\",\"confidence\":\"structured\",\"requestLabel\":\"Paper Trade Request: AAPL\",\"requestSummary\":\"BUY 25 AAPL in paper account paper-main\",\"demoProfile\":\"finance_paper_trade\",\"actionType\":\"trade.execute\",\"actionClass\":\"execute\",\"actionVerb\":\"execute\",\"actionTarget\":\"paper-broker-order\",\"resourceKind\":\"broker-order\",\"resourceNamespace\":\"epydios-system\",\"resourceName\":\"paper-order-aapl\",\"resourceId\":\"paper-order-aapl\",\"boundaryClass\":\"external_actuator\",\"riskTier\":\"high\",\"requiredGrants\":[\"grant.trading.supervisor\"],\"evidenceReadiness\":\"PARTIAL\",\"handshakeRequired\":true,\"workflowKind\":\"external_action_request\",\"financeOrder\":{\"symbol\":\"AAPL\",\"side\":\"buy\",\"quantity\":25,\"account\":\"paper-main\"}}]}"}}`,
				`{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":34}}`,
			}, "\n")), nil
		},
	}

	result, err := adapter.RunTurn(context.Background(), AgentInvokeRequest{
		Prompt:       "place a paper trade for 25 AAPL",
		SystemPrompt: "stay concise",
	}, agentProfileConfig{
		ID:    "codex",
		Model: "gpt-5-codex",
	}, nil, nil)
	if err != nil {
		t.Fatalf("RunTurn error: %v", err)
	}
	if len(result.toolProposals) != 1 {
		t.Fatalf("toolProposals=%d want 1", len(result.toolProposals))
	}
	proposal := result.toolProposals[0]
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["type"])); got != governedActionProposalType {
		t.Fatalf("proposal type=%q want %q", got, governedActionProposalType)
	}
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["requestLabel"])); got != "Paper Trade Request: AAPL" {
		t.Fatalf("requestLabel=%q", got)
	}
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["actionType"])); got != "trade.execute" {
		t.Fatalf("actionType=%q", got)
	}
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["riskTier"])); got != "high" {
		t.Fatalf("riskTier=%q", got)
	}
	grants := normalizeGovernedActionStringSlice(proposal["requiredGrants"])
	if len(grants) != 1 || grants[0] != "grant.trading.supervisor" {
		t.Fatalf("requiredGrants=%v", grants)
	}
	financeOrder, ok := proposal["financeOrder"].(JSONObject)
	if !ok {
		t.Fatalf("financeOrder missing or wrong type: %#v", proposal["financeOrder"])
	}
	if got := strings.TrimSpace(normalizedInterfaceString(financeOrder["symbol"])); got != "AAPL" {
		t.Fatalf("finance symbol=%q", got)
	}
}

func TestNormalizeCodexStructuredProposalConvertsPrintfRedirectToTee(t *testing.T) {
	proposal := normalizeCodexStructuredProposal(codexStructuredProposal{
		Type:           "terminal_command",
		Summary:        "Create file",
		Command:        `printf 'agentops-managed-worker-ok\n' > agentops_m21_probe.txt`,
		CWD:            "/tmp",
		TimeoutSeconds: 120,
		Confidence:     "medium",
	})
	if proposal.Command != "tee agentops_m21_probe.txt" {
		t.Fatalf("command=%q want tee form", proposal.Command)
	}
	if proposal.Stdin != "agentops-managed-worker-ok\n" {
		t.Fatalf("stdin=%q want normalized file content", proposal.Stdin)
	}
}

func TestNormalizeCodexStructuredProposalConvertsPythonWriteToTee(t *testing.T) {
	proposal := normalizeCodexStructuredProposal(codexStructuredProposal{
		Type:           "terminal_command",
		Summary:        "Create file",
		Command:        `python3 -c "open('agentops_m21_probe.txt','w').write('agentops-managed-worker-ok\n')"`,
		CWD:            "/tmp",
		TimeoutSeconds: 120,
		Confidence:     "high",
	})
	if proposal.Command != "tee agentops_m21_probe.txt" {
		t.Fatalf("command=%q want tee form", proposal.Command)
	}
	if proposal.Stdin != "agentops-managed-worker-ok\n" {
		t.Fatalf("stdin=%q want normalized file content", proposal.Stdin)
	}
}
