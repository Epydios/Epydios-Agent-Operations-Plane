package runtime

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func upsertTestIntegrationSettings(t *testing.T, store *memoryRunStore, tenantID, projectID string, settings map[string]interface{}) {
	t.Helper()
	raw, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}
	if err := store.UpsertIntegrationSettings(context.Background(), &IntegrationSettingsRecord{
		TenantID:  tenantID,
		ProjectID: projectID,
		Settings:  raw,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("upsert integration settings: %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func jsonHTTPResponse(status int, payload map[string]interface{}) (*http.Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &http.Response{
		StatusCode: status,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(string(body))),
	}, nil
}

func newTestAPIServerWithInvoker(t *testing.T, store *memoryRunStore, refValues map[string]interface{}, transport http.RoundTripper) http.Handler {
	t.Helper()
	refJSON, err := json.Marshal(refValues)
	if err != nil {
		t.Fatalf("marshal ref values: %v", err)
	}
	invoker := NewAgentInvoker(store, AgentInvokerConfig{
		RefValuesJSON: string(refJSON),
		HTTPTimeout:   5 * time.Second,
	})
	if transport != nil {
		invoker.httpClient = &http.Client{
			Timeout:   5 * time.Second,
			Transport: transport,
		}
	}
	server := NewAPIServer(store, nil, nil).WithAgentInvoker(invoker)
	return server.Routes()
}

func TestRuntimeIntegrationInvokeOpenAIGateway(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawAuth string
	var sawPath string
	store := newMemoryRunStore()
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://gateways/litellm/openai-compatible":                     "https://gateway.local",
		"ref://projects/project-a/gateways/litellm/bearer-token":       "gateway-token",
		"ref://projects/project-a/providers/openai-compatible/api-key": "unused-direct-key",
	}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		sawAuth = r.Header.Get("Authorization")
		sawPath = r.URL.Path
		return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
			"status":      "completed",
			"output_text": "codex gateway response",
			"usage": map[string]interface{}{
				"output_tokens": 21,
			},
		})
	}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
			"requestId": "req-openai-gateway",
		},
		"agentProfileId":  "codex",
		"prompt":          "Explain the run state.",
		"systemPrompt":    "Be concise.",
		"maxOutputTokens": 128,
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if sawAuth != "Bearer gateway-token" {
		t.Fatalf("Authorization=%q want gateway token", sawAuth)
	}
	if sawPath != "/v1/responses" {
		t.Fatalf("path=%q want /v1/responses", sawPath)
	}

	var response AgentInvokeResponse
	decodeResponseBody(t, rr, &response)
	if response.Route != "gateway" {
		t.Fatalf("route=%q want gateway", response.Route)
	}
	if response.SessionID == "" {
		t.Fatalf("sessionId should be populated for invoke response")
	}
	if response.OutputText != "codex gateway response" {
		t.Fatalf("outputText=%q", response.OutputText)
	}
	events, err := store.ListSessionEvents(context.Background(), SessionEventListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list session events: %v", err)
	}
	if len(events) < 6 {
		t.Fatalf("session events=%d want >=6", len(events))
	}
	sawStatusChanged := false
	sawTerminal := false
	for _, event := range events {
		switch event.EventType {
		case SessionEventType("session.status.changed"):
			sawStatusChanged = true
		case SessionEventType("session.completed"):
			sawTerminal = true
		}
	}
	if !sawStatusChanged {
		t.Fatalf("session events missing session.status.changed: %+v", events)
	}
	if !sawTerminal {
		t.Fatalf("session events missing session.completed: %+v", events)
	}
	actions, err := store.ListToolActions(context.Background(), ToolActionListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list tool actions: %v", err)
	}
	if len(actions) != 1 {
		t.Fatalf("tool actions=%d want 1: %+v", len(actions), actions)
	}
	if actions[0].Status != ToolActionStatusCompleted {
		t.Fatalf("tool action status=%q want %q", actions[0].Status, ToolActionStatusCompleted)
	}
	evidence, err := store.ListEvidenceRecords(context.Background(), EvidenceRecordListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list evidence records: %v", err)
	}
	if len(evidence) != 1 {
		t.Fatalf("evidence records=%d want 1", len(evidence))
	}
	if evidence[0].Kind != "tool_output" {
		t.Fatalf("evidence kind=%q want tool_output", evidence[0].Kind)
	}
}

func TestRuntimeIntegrationInvokeManagedCodexWorkerBridge(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	store := newMemoryRunStore()
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://gateways/litellm/openai-compatible":                     "https://gateway.local",
		"ref://projects/project-a/gateways/litellm/bearer-token":       "gateway-token",
		"ref://projects/project-a/providers/openai-compatible/api-key": "unused-direct-key",
	}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
			"status":      "completed",
			"output_text": "managed codex bridge response\n\n```bash\ngo test ./...\n```",
			"usage": map[string]interface{}{
				"output_tokens": 34,
			},
		})
	}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
			"requestId": "req-managed-codex-bridge",
		},
		"agentProfileId": "codex",
		"executionMode":  "managed_codex_worker",
		"prompt":         "Summarize the current approval posture.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}

	var response AgentInvokeResponse
	decodeResponseBody(t, rr, &response)
	if response.ExecutionMode != AgentInvokeExecutionModeManagedCodexWorker {
		t.Fatalf("executionMode=%q want %q", response.ExecutionMode, AgentInvokeExecutionModeManagedCodexWorker)
	}
	if response.WorkerType != "managed_agent" {
		t.Fatalf("workerType=%q want managed_agent", response.WorkerType)
	}
	if response.WorkerAdapterID != "codex" {
		t.Fatalf("workerAdapterId=%q want codex", response.WorkerAdapterID)
	}
	if response.SelectedWorkerID == "" {
		t.Fatal("selectedWorkerId should be populated")
	}
	if len(response.WorkerOutputChunks) == 0 {
		t.Fatalf("workerOutputChunks=%v want >=1 chunk", response.WorkerOutputChunks)
	}
	if len(response.ToolProposals) == 0 {
		t.Fatalf("toolProposals=%v want >=1 proposal", response.ToolProposals)
	}
	if got := strings.TrimSpace(response.ToolProposals[0]["command"].(string)); got != "go test ./..." {
		t.Fatalf("tool proposal command=%q want %q", got, "go test ./...")
	}

	workers, err := store.ListSessionWorkers(context.Background(), SessionWorkerListQuery{
		SessionID: response.SessionID,
		TenantID:  tenantID,
		ProjectID: projectID,
		Limit:     10,
	})
	if err != nil {
		t.Fatalf("list session workers: %v", err)
	}
	if len(workers) != 1 {
		t.Fatalf("session workers=%d want 1", len(workers))
	}
	if workers[0].WorkerType != "managed_agent" {
		t.Fatalf("worker type=%q want managed_agent", workers[0].WorkerType)
	}
	if workers[0].AdapterID != "codex" {
		t.Fatalf("worker adapterId=%q want codex", workers[0].AdapterID)
	}

	events, err := store.ListSessionEvents(context.Background(), SessionEventListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list session events: %v", err)
	}
	sawBridgeStarted := false
	sawWorkerProgress := false
	sawWorkerOutput := false
	sawToolProposal := false
	for _, event := range events {
		if event.EventType == SessionEventType("worker.bridge.started") {
			sawBridgeStarted = true
		}
		if event.EventType == SessionEventType("worker.progress") {
			sawWorkerProgress = true
		}
		if event.EventType == SessionEventType("worker.output.delta") {
			sawWorkerOutput = true
		}
		if event.EventType == SessionEventType("tool_proposal.generated") {
			sawToolProposal = true
		}
	}
	if !sawBridgeStarted {
		t.Fatalf("session events missing worker.bridge.started: %+v", events)
	}
	if !sawWorkerProgress {
		t.Fatalf("session events missing worker.progress: %+v", events)
	}
	if !sawWorkerOutput {
		t.Fatalf("session events missing worker.output.delta: %+v", events)
	}
	if !sawToolProposal {
		t.Fatalf("session events missing tool_proposal.generated: %+v", events)
	}

	actions, err := store.ListToolActions(context.Background(), ToolActionListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list tool actions: %v", err)
	}
	if len(actions) != 1 {
		t.Fatalf("tool actions=%d want 1", len(actions))
	}
	if actions[0].ToolType != "managed_agent_turn" {
		t.Fatalf("tool action type=%q want managed_agent_turn", actions[0].ToolType)
	}

	evidence, err := store.ListEvidenceRecords(context.Background(), EvidenceRecordListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list evidence records: %v", err)
	}
	if len(evidence) != 1 {
		t.Fatalf("evidence records=%d want 1", len(evidence))
	}
	if evidence[0].Kind != "managed_worker_output" {
		t.Fatalf("evidence kind=%q want managed_worker_output", evidence[0].Kind)
	}
	var metadata map[string]interface{}
	if err := json.Unmarshal(evidence[0].Metadata, &metadata); err != nil {
		t.Fatalf("unmarshal evidence metadata: %v", err)
	}
	if got := int(metadata["toolProposalCount"].(float64)); got < 1 {
		t.Fatalf("evidence metadata toolProposalCount=%d want >=1", got)
	}
}

func TestRuntimeIntegrationInvokeMapsQuotaFailureToTooManyRequests(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	store := newMemoryRunStore()
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/openai/api-key": "test-key",
	}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return jsonHTTPResponse(http.StatusTooManyRequests, map[string]interface{}{
			"error": map[string]interface{}{
				"message": "You exceeded your current quota, please check your plan and billing details.",
				"type":    "insufficient_quota",
				"code":    "insufficient_quota",
			},
		})
	}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
			"requestId": "req-openai-quota",
		},
		"agentProfileId": "openai",
		"prompt":         "Reply with exactly: local-runtime-ok",
	})
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}

	var response APIError
	decodeResponseBody(t, rr, &response)
	if response.ErrorCode != "INTEGRATION_INVOKE_QUOTA_EXCEEDED" {
		t.Fatalf("errorCode=%q want %q", response.ErrorCode, "INTEGRATION_INVOKE_QUOTA_EXCEEDED")
	}
	if !strings.Contains(strings.ToLower(response.Details["error"].(string)), "insufficient_quota") {
		t.Fatalf("details.error=%v want insufficient_quota", response.Details["error"])
	}
}

func TestRuntimeIntegrationInvokeManagedCodexWorkerProcessMode(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	store := newMemoryRunStore()
	refJSON, err := json.Marshal(map[string]interface{}{
		"ref://gateways/litellm/openai-compatible":               "https://gateway.local",
		"ref://projects/project-a/gateways/litellm/bearer-token": "gateway-token",
	})
	if err != nil {
		t.Fatalf("marshal ref values: %v", err)
	}
	invoker := NewAgentInvoker(store, AgentInvokerConfig{
		RefValuesJSON:    string(refJSON),
		HTTPTimeout:      5 * time.Second,
		ManagedCodexMode: "process",
		CodexWorkdir:     "/tmp",
	})
	invoker.httpClient = &http.Client{
		Timeout: 5 * time.Second,
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			t.Fatalf("provider route should not be used in managed Codex process mode: %s", r.URL.String())
			return nil, nil
		}),
	}
	invoker.managed["codex"] = codexManagedWorkerAdapter{
		mode:        "process",
		workdir:     "/tmp",
		sandboxMode: "read-only",
		timeout:     15 * time.Second,
		runProcess: func(_ context.Context, req codexProcessRequest) ([]byte, error) {
			if req.Workdir != "/tmp" {
				t.Fatalf("workdir=%q want /tmp", req.Workdir)
			}
			if req.Boundary == nil {
				t.Fatal("boundary should be populated")
			}
			if req.Boundary.BaseURL != "https://gateway.local/v1" {
				t.Fatalf("boundary baseURL=%q want https://gateway.local/v1", req.Boundary.BaseURL)
			}
			if req.Boundary.TokenValue != "gateway-token" {
				t.Fatalf("boundary token=%q want gateway-token", req.Boundary.TokenValue)
			}
			return []byte(strings.Join([]string{
				`{"type":"thread.started","thread_id":"thread-1"}`,
				`{"type":"turn.started"}`,
				`{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\"message\":\"Process-backed managed Codex completed the turn.\",\"tool_proposals\":[{\"type\":\"terminal_command\",\"summary\":\"Run pwd to verify the workspace root.\",\"command\":\"pwd\",\"stdin\":\"\",\"cwd\":\"/tmp\",\"timeoutSeconds\":5,\"readOnlyRequested\":true,\"confidence\":\"structured\"}]}"}}`,
				`{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":20}}`,
			}, "\n")), nil
		},
	}
	handler := NewAPIServer(store, nil, nil).WithAgentInvoker(invoker).Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
			"requestId": "req-managed-codex-process",
		},
		"agentProfileId": "codex",
		"executionMode":  "managed_codex_worker",
		"prompt":         "Summarize the current workspace and propose a safe verification command.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}

	var response AgentInvokeResponse
	decodeResponseBody(t, rr, &response)
	if response.Route != "managed_worker_gateway_process" {
		t.Fatalf("route=%q want managed_worker_gateway_process", response.Route)
	}
	if response.OutputText != "Process-backed managed Codex completed the turn." {
		t.Fatalf("outputText=%q", response.OutputText)
	}
	if response.EndpointRef != "ref://gateways/litellm/openai-compatible" {
		t.Fatalf("endpointRef=%q want gateway ref", response.EndpointRef)
	}
	if response.CredentialRef != "ref://projects/project-a/gateways/litellm/bearer-token" {
		t.Fatalf("credentialRef=%q want gateway token ref", response.CredentialRef)
	}
	if response.BoundaryProviderID != "agentops_gateway" {
		t.Fatalf("boundaryProviderId=%q want agentops_gateway", response.BoundaryProviderID)
	}
	if response.BoundaryBaseURL != "https://gateway.local/v1" {
		t.Fatalf("boundaryBaseUrl=%q want https://gateway.local/v1", response.BoundaryBaseURL)
	}
	if len(response.ToolProposals) != 1 {
		t.Fatalf("toolProposals=%d want 1", len(response.ToolProposals))
	}
	if response.ToolProposals[0]["command"] != "pwd" {
		t.Fatalf("proposal command=%v want pwd", response.ToolProposals[0]["command"])
	}
	if response.WorkerAdapterID != "codex" {
		t.Fatalf("workerAdapterId=%q want codex", response.WorkerAdapterID)
	}
}

func TestRuntimeIntegrationInvokeManagedCodexWorkerProcessContinuation(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	store := newMemoryRunStore()
	refJSON, err := json.Marshal(map[string]interface{}{
		"ref://gateways/litellm/openai-compatible":               "https://gateway.local",
		"ref://projects/project-a/gateways/litellm/bearer-token": "gateway-token",
	})
	if err != nil {
		t.Fatalf("marshal ref values: %v", err)
	}
	var prompts []string
	invoker := NewAgentInvoker(store, AgentInvokerConfig{
		RefValuesJSON:    string(refJSON),
		HTTPTimeout:      5 * time.Second,
		ManagedCodexMode: "process",
		CodexWorkdir:     "/tmp",
	})
	invoker.managed["codex"] = codexManagedWorkerAdapter{
		mode:        "process",
		workdir:     "/tmp",
		sandboxMode: "read-only",
		timeout:     15 * time.Second,
		runProcess: func(_ context.Context, req codexProcessRequest) ([]byte, error) {
			prompts = append(prompts, req.Prompt)
			if req.Boundary == nil {
				t.Fatal("boundary should be populated")
			}
			if req.Boundary.BaseURL != "https://gateway.local/v1" {
				t.Fatalf("boundary baseURL=%q want https://gateway.local/v1", req.Boundary.BaseURL)
			}
			if strings.Contains(req.Prompt, "Governed tool execution result:") {
				return []byte(strings.Join([]string{
					`{"type":"turn.started"}`,
					`{"type":"item.completed","item":{"id":"item_resume","type":"agent_message","text":"{\"message\":\"Managed Codex resumed after governed execution and the workspace looks correct.\",\"tool_proposals\":[]}"}}`,
					`{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":18}}`,
				}, "\n")), nil
			}
			return []byte(strings.Join([]string{
				`{"type":"thread.started","thread_id":"thread-1"}`,
				`{"type":"turn.started"}`,
				`{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\"message\":\"I need one governed check before I can finish this task.\",\"tool_proposals\":[{\"type\":\"terminal_command\",\"summary\":\"Run pwd to verify the workspace root.\",\"command\":\"pwd\",\"stdin\":\"\",\"cwd\":\"/tmp\",\"timeoutSeconds\":5,\"readOnlyRequested\":true,\"confidence\":\"structured\"}]}"}}`,
				`{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":20}}`,
			}, "\n")), nil
		},
	}
	handler := NewAPIServer(store, nil, nil).WithAgentInvoker(invoker).Routes()

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
			"requestId": "req-managed-codex-process-resume",
		},
		"agentProfileId": "codex",
		"executionMode":  "managed_codex_worker",
		"prompt":         "Verify the workspace and continue only after governed approval.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}

	var response AgentInvokeResponse
	decodeResponseBody(t, rr, &response)
	if len(response.ToolProposals) != 1 {
		t.Fatalf("toolProposals=%d want 1", len(response.ToolProposals))
	}
	proposalID := normalizedInterfaceString(response.ToolProposals[0]["proposalId"])
	if proposalID == "" {
		t.Fatalf("proposalId should be normalized onto the response: %+v", response.ToolProposals)
	}
	session, err := store.GetSession(context.Background(), response.SessionID)
	if err != nil {
		t.Fatalf("get session after initial invoke: %v", err)
	}
	if session.Status != SessionStatusAwaitingApproval {
		t.Fatalf("session status=%q want %q", session.Status, SessionStatusAwaitingApproval)
	}

	rr = requestJSON(t, handler, http.MethodPost, "/v1alpha2/runtime/sessions/"+response.SessionID+"/tool-proposals/"+proposalID+"/decision", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
			"requestId": "proposal-decision-resume-1",
		},
		"decision": "APPROVE",
		"reason":   "approve governed pwd verification",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST tool proposal decision status=%d body=%s", rr.Code, rr.Body.String())
	}
	var decision ToolProposalDecisionResponse
	decodeResponseBody(t, rr, &decision)
	if decision.ActionStatus != ToolActionStatusCompleted {
		t.Fatalf("tool proposal actionStatus=%q want %q", decision.ActionStatus, ToolActionStatusCompleted)
	}

	session, err = store.GetSession(context.Background(), response.SessionID)
	if err != nil {
		t.Fatalf("get session after continuation: %v", err)
	}
	if session.Status != SessionStatusCompleted {
		t.Fatalf("session status=%q want %q", session.Status, SessionStatusCompleted)
	}

	actions, err := store.ListToolActions(context.Background(), ToolActionListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list tool actions: %v", err)
	}
	managedTurns := 0
	for _, action := range actions {
		if action.ToolType == "managed_agent_turn" {
			managedTurns++
		}
	}
	if managedTurns != 2 {
		t.Fatalf("managed agent turns=%d want 2: %+v", managedTurns, actions)
	}

	evidence, err := store.ListEvidenceRecords(context.Background(), EvidenceRecordListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list evidence records: %v", err)
	}
	managedEvidence := 0
	for _, record := range evidence {
		if record.Kind == "managed_worker_output" {
			managedEvidence++
		}
	}
	if managedEvidence != 2 {
		t.Fatalf("managed worker evidence count=%d want 2: %+v", managedEvidence, evidence)
	}

	events, err := store.ListSessionEvents(context.Background(), SessionEventListQuery{SessionID: response.SessionID})
	if err != nil {
		t.Fatalf("list session events: %v", err)
	}
	sawTerminal := false
	sawWorkerOutput := 0
	for _, event := range events {
		if event.EventType == SessionEventType("worker.output.delta") {
			sawWorkerOutput++
		}
		if event.EventType == SessionEventType("session.completed") {
			sawTerminal = true
		}
	}
	if !sawTerminal {
		t.Fatalf("session events missing session.completed: %+v", events)
	}
	if sawWorkerOutput < 2 {
		t.Fatalf("worker output events=%d want >=2: %+v", sawWorkerOutput, events)
	}
	if len(prompts) != 2 {
		t.Fatalf("runProcess prompts=%d want 2", len(prompts))
	}
	if !strings.Contains(prompts[1], "Governed tool execution result:") {
		t.Fatalf("continuation prompt missing governed result section: %s", prompts[1])
	}
}

func TestRuntimeIntegrationInvokeManagedCodexWorkerRequiresCodexProfile(t *testing.T) {
	store := newMemoryRunStore()
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{}, nil)

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  "tenant-a",
			"projectId": "project-a",
		},
		"agentProfileId": "openai",
		"executionMode":  "managed_codex_worker",
		"prompt":         "This should fail.",
	})
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("POST integration invoke code=%d body=%s want %d", rr.Code, rr.Body.String(), http.StatusBadRequest)
	}
}

func TestRuntimeIntegrationInvokeAnthropicDirect(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawAPIKey string
	var sawPath string
	store := newMemoryRunStore()
	upsertTestIntegrationSettings(t, store, tenantID, projectID, map[string]interface{}{
		"selectedAgentProfileId": "anthropic",
		"modelRouting":           "direct_first",
		"profileTransport":       "messages_api",
		"profileModel":           "claude-sonnet-latest",
		"profileEndpointRef":     "ref://projects/project-a/providers/anthropic/endpoint",
		"profileCredentialRef":   "ref://projects/project-a/providers/anthropic/api-key",
		"profileCredentialScope": "project",
		"profileEnabled":         true,
	})
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/anthropic/endpoint": "https://anthropic.local",
		"ref://projects/project-a/providers/anthropic/api-key":  "anthropic-test-key",
	}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		sawAPIKey = r.Header.Get("x-api-key")
		sawPath = r.URL.Path
		return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
			"content": []map[string]interface{}{
				{"type": "text", "text": "anthropic direct response"},
			},
			"stop_reason": "end_turn",
		})
	}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"agentProfileId": "anthropic",
		"prompt":         "Summarize the policy result.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if sawAPIKey != "anthropic-test-key" {
		t.Fatalf("x-api-key=%q want anthropic-test-key", sawAPIKey)
	}
	if sawPath != "/v1/messages" {
		t.Fatalf("path=%q want /v1/messages", sawPath)
	}

	var response AgentInvokeResponse
	decodeResponseBody(t, rr, &response)
	if response.Route != "direct" {
		t.Fatalf("route=%q want direct", response.Route)
	}
	if response.OutputText != "anthropic direct response" {
		t.Fatalf("outputText=%q", response.OutputText)
	}
}

func TestRuntimeIntegrationInvokeGoogleDirect(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawQueryKey string
	var sawPath string
	store := newMemoryRunStore()
	upsertTestIntegrationSettings(t, store, tenantID, projectID, map[string]interface{}{
		"selectedAgentProfileId": "google",
		"modelRouting":           "direct_first",
		"profileTransport":       "gemini_api",
		"profileModel":           "gemini-2.5-pro",
		"profileEndpointRef":     "ref://projects/project-a/providers/google/endpoint",
		"profileCredentialRef":   "ref://projects/project-a/providers/google/api-key",
		"profileCredentialScope": "project",
		"profileEnabled":         true,
	})
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/google/endpoint": "https://google.local",
		"ref://projects/project-a/providers/google/api-key":  "google-test-key",
	}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		sawQueryKey = r.URL.Query().Get("key")
		sawPath = r.URL.Path
		return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
			"candidates": []map[string]interface{}{
				{
					"finishReason": "STOP",
					"content": map[string]interface{}{
						"parts": []map[string]interface{}{
							{"text": "google direct response"},
						},
					},
				},
			},
		})
	}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"agentProfileId": "google",
		"prompt":         "List the most important events.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if sawQueryKey != "google-test-key" {
		t.Fatalf("query key=%q want google-test-key", sawQueryKey)
	}
	if !strings.HasSuffix(sawPath, "/v1beta/models/gemini-2.5-pro:generateContent") {
		t.Fatalf("path=%q", sawPath)
	}
}

func TestRuntimeIntegrationInvokeAzureDirect(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawAPIKey string
	var sawQueryVersion string
	store := newMemoryRunStore()
	upsertTestIntegrationSettings(t, store, tenantID, projectID, map[string]interface{}{
		"selectedAgentProfileId": "azure_openai",
		"modelRouting":           "direct_first",
		"profileTransport":       "chat_completions_api",
		"profileModel":           "gpt-4.1",
		"profileEndpointRef":     "ref://projects/project-a/providers/azure-openai/endpoint",
		"profileCredentialRef":   "ref://projects/project-a/providers/azure-openai/api-key",
		"profileCredentialScope": "project",
		"profileEnabled":         true,
	})
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/azure-openai/endpoint": "https://azure.local",
		"ref://projects/project-a/providers/azure-openai/api-key":  "azure-test-key",
	}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		sawAPIKey = r.Header.Get("api-key")
		sawQueryVersion = r.URL.Query().Get("api-version")
		return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
			"choices": []map[string]interface{}{
				{
					"finish_reason": "stop",
					"message": map[string]interface{}{
						"content": "azure direct response",
					},
				},
			},
		})
	}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"agentProfileId": "azure_openai",
		"prompt":         "Summarize desktop verification.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if sawAPIKey != "azure-test-key" {
		t.Fatalf("api-key=%q want azure-test-key", sawAPIKey)
	}
	if sawQueryVersion != defaultAzureOpenAIAPIVersion {
		t.Fatalf("api-version=%q want %q", sawQueryVersion, defaultAzureOpenAIAPIVersion)
	}
}

func TestRuntimeIntegrationInvokeBedrockDirect(t *testing.T) {
	const (
		tenantID  = "tenant-a"
		projectID = "project-a"
	)
	var sawAuth string
	var sawXAmzDate string
	var sawSecurityToken string
	store := newMemoryRunStore()
	upsertTestIntegrationSettings(t, store, tenantID, projectID, map[string]interface{}{
		"selectedAgentProfileId": "bedrock",
		"modelRouting":           "direct_first",
		"profileTransport":       "bedrock_invoke_model",
		"profileModel":           "anthropic.claude-3-7-sonnet",
		"profileEndpointRef":     "ref://projects/project-a/providers/bedrock/region-endpoint",
		"profileCredentialRef":   "ref://projects/project-a/providers/bedrock/role-arn",
		"profileCredentialScope": "project",
		"profileEnabled":         true,
	})
	handler := newTestAPIServerWithInvoker(t, store, map[string]interface{}{
		"ref://projects/project-a/providers/bedrock/region-endpoint": "https://bedrock.local",
		"ref://projects/project-a/providers/bedrock/role-arn": map[string]interface{}{
			"region":          "us-east-1",
			"accessKeyId":     "AKIATESTKEY123456",
			"secretAccessKey": "secret-test-key",
			"sessionToken":    "session-token",
		},
	}, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		sawAuth = r.Header.Get("Authorization")
		sawXAmzDate = r.Header.Get("X-Amz-Date")
		sawSecurityToken = r.Header.Get("X-Amz-Security-Token")
		return jsonHTTPResponse(http.StatusOK, map[string]interface{}{
			"content": []map[string]interface{}{
				{"type": "text", "text": "bedrock direct response"},
			},
			"stop_reason": "end_turn",
		})
	}))

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", map[string]interface{}{
		"meta": map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		},
		"agentProfileId": "bedrock",
		"prompt":         "Explain the evidence bundle.",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST integration invoke code=%d body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(sawAuth, "AWS4-HMAC-SHA256") {
		t.Fatalf("Authorization=%q want SigV4", sawAuth)
	}
	if sawXAmzDate == "" {
		t.Fatal("expected X-Amz-Date header")
	}
	if sawSecurityToken != "session-token" {
		t.Fatalf("X-Amz-Security-Token=%q", sawSecurityToken)
	}
}
