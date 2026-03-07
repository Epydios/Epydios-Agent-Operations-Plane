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
				`{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"{\"message\":\"Managed Codex summarized the workspace and queued one governed command.\",\"tool_proposals\":[{\"type\":\"terminal_command\",\"summary\":\"Run the runtime tests before proceeding.\",\"command\":\"go test ./internal/runtime\",\"cwd\":\"/tmp\",\"timeoutSeconds\":30,\"readOnlyRequested\":true,\"confidence\":\"structured\"}]}"}}`,
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
