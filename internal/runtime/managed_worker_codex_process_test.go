package runtime

import (
	"context"
	"encoding/json"
	"os"
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
	if result.operatorMessage != "Managed Codex summarized the workspace and queued one governed command." {
		t.Fatalf("operatorMessage=%q", result.operatorMessage)
	}
	if result.finishReason != "managed_worker_process" {
		t.Fatalf("finishReason=%q want managed_worker_process", result.finishReason)
	}
	if len(result.outputChunks) == 0 {
		t.Fatalf("outputChunks should not be empty")
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

func TestParseCodexProcessTranscriptPreservesManagedWorkerEvents(t *testing.T) {
	result, err := parseCodexProcessTranscript([]byte(strings.Join([]string{
		`{"type":"thread.started","thread_id":"thread-1"}`,
		`{"type":"turn.started"}`,
		`{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Inspecting the workspace before deciding what needs approval."}}`,
		`{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc pwd","aggregated_output":"/tmp\n","exit_code":0,"status":"completed"}}`,
		`{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\"message\":\"Managed Codex summarized the workspace and queued one governed command.\",\"tool_proposals\":[{\"type\":\"terminal_command\",\"summary\":\"Run the runtime tests before proceeding.\",\"command\":\"go test ./internal/runtime\",\"stdin\":\"\",\"cwd\":\"/tmp\",\"timeoutSeconds\":30,\"readOnlyRequested\":true,\"confidence\":\"structured\"}]}"}}`,
		`{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":34}}`,
	}, "\n")))
	if err != nil {
		t.Fatalf("parseCodexProcessTranscript error: %v", err)
	}
	if len(result.events) != 4 {
		t.Fatalf("events=%d want 4", len(result.events))
	}
	if result.events[1].ItemType != "command_execution" {
		t.Fatalf("event[1] itemType=%q want command_execution", result.events[1].ItemType)
	}
	if result.events[1].Command != "/bin/zsh -lc pwd" {
		t.Fatalf("event[1] command=%q want /bin/zsh -lc pwd", result.events[1].Command)
	}
	if got := strings.TrimSpace(result.events[1].Output); got != "/tmp" {
		t.Fatalf("event[1] output=%q want /tmp", got)
	}
	if result.events[3].Type != "turn.completed" {
		t.Fatalf("event[3] type=%q want turn.completed", result.events[3].Type)
	}
	if result.events[3].Usage["output_tokens"] != float64(34) {
		t.Fatalf("event[3] usage output_tokens=%v want 34", result.events[3].Usage["output_tokens"])
	}
}

func TestCodexManagedWorkerAdapterLegacyModeReturnsTypedEnvelope(t *testing.T) {
	adapter := codexManagedWorkerAdapter{mode: "legacy"}
	result, err := adapter.RunTurn(context.Background(), AgentInvokeRequest{
		Prompt: "inspect the workspace and propose one governed command",
	}, agentProfileConfig{
		ID:    "codex",
		Model: "gpt-5-codex",
	}, nil, &invokeResult{
		outputText:   "Managed Codex bridge response.\n\n```bash\ngo test ./internal/runtime\n```",
		finishReason: "stop",
		usage:        JSONObject{"output_tokens": 12},
		rawResponse:  json.RawMessage(`{"output_text":"Managed Codex bridge response."}`),
	})
	if err != nil {
		t.Fatalf("RunTurn error: %v", err)
	}
	if result.sourceMode != "legacy_fallback" {
		t.Fatalf("sourceMode=%q want legacy_fallback", result.sourceMode)
	}
	if result.operatorMessage == "" {
		t.Fatal("operatorMessage should not be empty")
	}
	if len(result.toolProposals) != 1 {
		t.Fatalf("toolProposals=%d want 1", len(result.toolProposals))
	}
	if got := normalizedInterfaceString(result.toolProposals[0]["command"]); got != "go test ./internal/runtime" {
		t.Fatalf("proposal command=%q", got)
	}
	if len(result.events) != 1 || result.events[0].Type != "legacy_output" {
		t.Fatalf("legacy events=%+v", result.events)
	}

	continuation, err := adapter.ContinueTurn(context.Background(), managedWorkerContinuationRequest{
		ExecutionResult: &TerminalExecutionResult{ExitCode: 0, Output: "ok"},
	}, nil)
	if err != nil {
		t.Fatalf("ContinueTurn error: %v", err)
	}
	if continuation.finishReason != "managed_worker_legacy_continuation" {
		t.Fatalf("finishReason=%q want managed_worker_legacy_continuation", continuation.finishReason)
	}
	if len(continuation.events) != 1 || continuation.events[0].Type != "legacy_continuation" {
		t.Fatalf("continuation events=%+v", continuation.events)
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
	if !strings.Contains(prompt, "low-risk allow-shaped finance requests") {
		t.Fatalf("prompt missing allow-shaped finance guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "compliance reports") {
		t.Fatalf("prompt missing advisory/compliance governed guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "high-risk defer-shaped finance requests") {
		t.Fatalf("prompt missing defer-shaped finance guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "clear deny-shaped requests") {
		t.Fatalf("prompt missing deny-shaped finance guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "environment") || !strings.Contains(prompt, "operatorApprovalRequired") {
		t.Fatalf("prompt missing governed-action routing fields: %s", prompt)
	}
	if !strings.Contains(prompt, "return `null` instead of omitting the field") {
		t.Fatalf("prompt missing null guidance: %s", prompt)
	}
}

func TestBuildManagedCodexPromptIncludesDemoGovernanceOverlay(t *testing.T) {
	prompt := buildManagedCodexPrompt(codexProcessRequest{
		Prompt: "Prepare a compliance report request.",
		GovernanceContext: JSONObject{
			"persona": JSONObject{
				"enabled":         true,
				"subjectId":       "demo.operator",
				"clientId":        "desktop-demo",
				"roles":           []string{"compliance.viewer"},
				"approvedForProd": false,
			},
			"policy": JSONObject{
				"enabled":                  true,
				"reviewMode":               "policy_first",
				"handshakeRequired":        true,
				"advisoryAutoShape":        true,
				"financeSupervisorGrant":   true,
				"financeEvidenceReadiness": "PARTIAL",
				"productionDeleteDeny":     true,
				"policyBucketPrefix":       "desktop-demo",
			},
		},
	})
	if !strings.Contains(prompt, "Active local demo governance overlay") {
		t.Fatalf("prompt missing local demo governance overlay section: %s", prompt)
	}
	if !strings.Contains(prompt, "subjectId=\"demo.operator\"") {
		t.Fatalf("prompt missing demo persona subject: %s", prompt)
	}
	if !strings.Contains(prompt, "operatorApprovalRequired=false") {
		t.Fatalf("prompt missing policy-first review guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "policy bucket prefix \"desktop-demo\"") {
		t.Fatalf("prompt missing policy bucket prefix guidance: %s", prompt)
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

func TestNewCodexManagedWorkerAdapterDefaultsToProcessMode(t *testing.T) {
	adapter := newCodexManagedWorkerAdapter(AgentInvokerConfig{})
	if adapter.mode != "process" {
		t.Fatalf("mode=%q want process", adapter.mode)
	}
	if adapter.UsesProviderRoutes() {
		t.Fatal("default adapter should use process mode, not provider routes")
	}
	if adapter.sandboxMode != "read-only" {
		t.Fatalf("sandboxMode=%q want read-only", adapter.sandboxMode)
	}
}

func TestNewCodexManagedWorkerAdapterLegacyModeIsExplicitOptIn(t *testing.T) {
	adapter := newCodexManagedWorkerAdapter(AgentInvokerConfig{
		ManagedCodexMode: "legacy",
		CodexSandboxMode: "workspace-write",
	})
	if adapter.mode != "legacy" {
		t.Fatalf("mode=%q want legacy", adapter.mode)
	}
	if !adapter.UsesProviderRoutes() {
		t.Fatal("explicit legacy mode should keep provider-route behavior")
	}
	if adapter.sandboxMode != "workspace-write" {
		t.Fatalf("sandboxMode=%q want workspace-write", adapter.sandboxMode)
	}
}

func TestBuildManagedCodexContinuationPromptAllowsGovernedMutationProposals(t *testing.T) {
	prompt := buildManagedCodexContinuationPrompt(managedWorkerContinuationRequest{})
	if !strings.Contains(prompt, "return it as a governed `tool_proposals` terminal command") {
		t.Fatalf("continuation prompt missing governed mutation guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "If the next step is a real-world external action or a governed informational request") {
		t.Fatalf("continuation prompt missing governed action continuation guidance: %s", prompt)
	}
	if !strings.Contains(prompt, "return `null` instead of omitting the field") {
		t.Fatalf("continuation prompt missing null guidance: %s", prompt)
	}
}

func TestBuildManagedCodexContinuationPromptOmitsAutogeneratedTaskIntent(t *testing.T) {
	prompt := buildManagedCodexContinuationPrompt(managedWorkerContinuationRequest{
		Task: &TaskRecord{
			Intent: "Start a new governed Codex conversation for 12345.",
			Annotations: mustMarshalJSON(JSONObject{
				"threadIntent": JSONObject{
					"source":        "autogenerated",
					"autogenerated": true,
				},
			}),
		},
	})
	if strings.Contains(prompt, "Original task intent:") {
		t.Fatalf("continuation prompt should omit autogenerated task intent: %s", prompt)
	}
}

func TestWriteCodexOutputSchemaUsesFlatProposalItems(t *testing.T) {
	path, err := writeCodexOutputSchema()
	if err != nil {
		t.Fatalf("writeCodexOutputSchema error: %v", err)
	}
	defer os.Remove(path)
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile error: %v", err)
	}
	text := string(body)
	if strings.Contains(text, `"oneOf"`) {
		t.Fatalf("schema should not contain oneOf: %s", text)
	}
	if !strings.Contains(text, `"governed_action_request"`) {
		t.Fatalf("schema missing governed action type enum: %s", text)
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("schema decode error: %v", err)
	}
	properties := payload["properties"].(map[string]interface{})
	toolProposals := properties["tool_proposals"].(map[string]interface{})
	items := toolProposals["items"].(map[string]interface{})
	assertSchemaRequiresAllProperties(t, items)
	financeOrder := items["properties"].(map[string]interface{})["financeOrder"].(map[string]interface{})
	assertSchemaRequiresAllProperties(t, financeOrder)
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
				`{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\"message\":\"I converted the operator request into a governed trade proposal.\",\"tool_proposals\":[{\"type\":\"governed_action_request\",\"summary\":\"BUY 25 AAPL in paper account paper-main\",\"confidence\":\"structured\",\"requestLabel\":\"Paper Trade Request: AAPL\",\"requestSummary\":\"BUY 25 AAPL in paper account paper-main\",\"demoProfile\":\"finance_paper_trade\",\"actionType\":\"trade.execute\",\"actionClass\":\"execute\",\"actionVerb\":\"execute\",\"actionTarget\":\"paper-broker-order\",\"resourceKind\":\"broker-order\",\"resourceNamespace\":\"epydios-system\",\"resourceName\":\"paper-order-aapl\",\"resourceId\":\"paper-order-aapl\",\"boundaryClass\":\"external_actuator\",\"riskTier\":\"high\",\"requiredGrants\":[\"grant.trading.supervisor\"],\"evidenceReadiness\":\"PARTIAL\",\"handshakeRequired\":true,\"environment\":\"dev\",\"operatorApprovalRequired\":false,\"workflowKind\":\"external_action_request\",\"financeOrder\":{\"symbol\":\"AAPL\",\"side\":\"buy\",\"quantity\":25,\"account\":\"paper-main\"}}]}"}}`,
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
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["environment"])); got != "dev" {
		t.Fatalf("environment=%q", got)
	}
	if got := normalizedInterfaceBool(proposal["operatorApprovalRequired"]); got {
		t.Fatalf("operatorApprovalRequired=%t want false", got)
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

func TestCodexManagedWorkerAdapterProcessModeParsesComplianceGovernedActionProposal(t *testing.T) {
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
				`{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\"message\":\"I converted the operator request into a governed compliance report request.\",\"tool_proposals\":[{\"type\":\"governed_action_request\",\"summary\":\"Request a compliance conflict report for MSFT versus existing AAPL holdings.\",\"confidence\":\"structured\",\"requestLabel\":\"Compliance Conflict Report\",\"requestSummary\":\"Request a compliance report on whether holding MSFT creates a conflict if we already hold AAPL.\",\"demoProfile\":\"compliance_report\",\"workflowKind\":\"advisory_request\",\"actionType\":\"compliance.report.request\",\"actionClass\":\"read\",\"actionVerb\":\"request\",\"actionTarget\":\"compliance-review\",\"resourceKind\":\"compliance-report\",\"resourceNamespace\":\"epydios-system\",\"resourceName\":\"compliance-conflict-report\",\"resourceId\":\"compliance-conflict-report\",\"boundaryClass\":\"model_gateway\",\"riskTier\":\"low\",\"requiredGrants\":[],\"evidenceReadiness\":\"READY\",\"handshakeRequired\":true,\"environment\":\"dev\",\"operatorApprovalRequired\":false}]}"}}`,
				`{"type":"turn.completed","usage":{"input_tokens":18,"output_tokens":40}}`,
			}, "\n")), nil
		},
	}

	result, err := adapter.RunTurn(context.Background(), AgentInvokeRequest{
		Prompt:       "ask compliance for a conflict report about MSFT if we already hold AAPL",
		SystemPrompt: "stay concise",
	}, agentProfileConfig{
		ID:    "codex",
		Model: "gpt-5-codex",
	}, nil, nil)
	if err != nil {
		t.Fatalf("RunTurn error: %v", err)
	}
	proposal := result.toolProposals[0]
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["demoProfile"])); got != governedActionDemoProfileCompliance {
		t.Fatalf("demoProfile=%q want %q", got, governedActionDemoProfileCompliance)
	}
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["workflowKind"])); got != governedActionWorkflowAdvisoryRequest {
		t.Fatalf("workflowKind=%q want %q", got, governedActionWorkflowAdvisoryRequest)
	}
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["actionType"])); got != "compliance.report.request" {
		t.Fatalf("actionType=%q want compliance.report.request", got)
	}
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["boundaryClass"])); got != "model_gateway" {
		t.Fatalf("boundaryClass=%q want model_gateway", got)
	}
	if got := strings.TrimSpace(normalizedInterfaceString(proposal["riskTier"])); got != "low" {
		t.Fatalf("riskTier=%q want low", got)
	}
}

func TestCodexManagedWorkerAdapterProcessModeRejectsInvalidProposal(t *testing.T) {
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
				`{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\"message\":\"I tried to return a malformed proposal.\",\"tool_proposals\":[{\"type\":\"terminal_command\",\"summary\":\"Missing command\",\"confidence\":\"structured\"}]}"}}`,
				`{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":34}}`,
			}, "\n")), nil
		},
	}

	_, err := adapter.RunTurn(context.Background(), AgentInvokeRequest{
		Prompt:       "return malformed governed proposal",
		SystemPrompt: "stay concise",
	}, agentProfileConfig{
		ID:    "codex",
		Model: "gpt-5-codex",
	}, nil, nil)
	if err == nil {
		t.Fatal("RunTurn error should reject invalid proposal")
	}
	if !strings.Contains(err.Error(), "invalid proposal") {
		t.Fatalf("RunTurn error=%v want invalid proposal", err)
	}
}

func assertSchemaRequiresAllProperties(t *testing.T, schema map[string]interface{}) {
	t.Helper()
	properties, ok := schema["properties"].(map[string]interface{})
	if !ok {
		t.Fatalf("schema missing properties: %#v", schema)
	}
	requiredValues, ok := schema["required"].([]interface{})
	if !ok {
		t.Fatalf("schema missing required array: %#v", schema)
	}
	required := make(map[string]struct{}, len(requiredValues))
	for _, value := range requiredValues {
		name, ok := value.(string)
		if !ok {
			t.Fatalf("required value has unexpected type: %#v", value)
		}
		required[strings.TrimSpace(name)] = struct{}{}
	}
	if len(required) != len(properties) {
		t.Fatalf("required count=%d properties count=%d", len(required), len(properties))
	}
	for key := range properties {
		if _, ok := required[key]; !ok {
			t.Fatalf("required missing property %q", key)
		}
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
