package nativeapp

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
	"github.com/gorilla/websocket"
	"github.com/klauspost/compress/zstd"
)

type roundTripFunc func(req *http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestGatewayGovernedActionRoundTrip(t *testing.T) {
	requestsRoot := t.TempDir()
	runtimeRun := runtimeapi.RunRecord{
		RunID:          "run-123",
		RequestID:      "gateway-seeded-request",
		Status:         runtimeapi.RunStatusPending,
		PolicyDecision: "ALLOW",
	}
	completedRun := runtimeRun
	completedRun.Status = runtimeapi.RunStatusCompleted

	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			if req.Meta.TenantID != "tenant-demo" {
				t.Fatalf("unexpected tenant id: %q", req.Meta.TenantID)
			}
			if req.Meta.ProjectID != "project-payments" {
				t.Fatalf("unexpected project id: %q", req.Meta.ProjectID)
			}
			if req.Meta.Environment != "env-stage" {
				t.Fatalf("unexpected environment: %q", req.Meta.Environment)
			}
			if req.Action["type"] != "desktop.execute" {
				t.Fatalf("unexpected action type: %#v", req.Action["type"])
			}
			if req.Annotations["gatewayClientId"] != "client-codex" {
				t.Fatalf("missing gateway client annotation: %#v", req.Annotations)
			}
			runtimeRun.RequestID = req.Meta.RequestID
			return &runtimeRun, http.StatusCreated, nil
		},
		fetchRunHook: func(_ context.Context, runID string) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			if runID != "run-123" {
				t.Fatalf("unexpected run lookup id: %q", runID)
			}
			return &completedRun, http.StatusOK, nil
		},
	}

	body := strings.NewReader(`{
  "tenantId": "tenant-demo",
  "projectId": "project-payments",
  "environmentId": "env-stage",
  "actionType": "desktop.execute",
  "targetType": "terminal",
  "targetRef": "kubectl rollout restart deploy/payments",
  "input": {
    "command": "kubectl rollout restart deploy/payments"
  },
  "client": {
    "id": "client-codex",
    "name": "Codex"
  }
}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/governed-actions", body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleGovernedActions(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected accepted response, got %d body=%s", rec.Code, rec.Body.String())
	}

	var created gatewayGovernedActionResult
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode gateway create response: %v", err)
	}
	if created.GatewayRequestID == "" {
		t.Fatal("expected gatewayRequestId in response")
	}
	if created.InterpositionRequestID == "" {
		t.Fatal("expected interpositionRequestId in response")
	}
	if created.RunID != "run-123" {
		t.Fatalf("expected runId=run-123, got %q", created.RunID)
	}
	if created.State != "accepted" {
		t.Fatalf("expected initial state accepted, got %q", created.State)
	}

	recordPath := filepath.Join(requestsRoot, sanitizeGatewayRequestID(created.GatewayRequestID)+".json")
	if _, err := os.Stat(recordPath); err != nil {
		t.Fatalf("expected persisted gateway request record: %v", err)
	}

	statusReq := httptest.NewRequest(http.MethodGet, "/v1/governed-actions/"+created.GatewayRequestID, nil)
	statusReq.Header.Set("Authorization", "Bearer test-token")
	statusRec := httptest.NewRecorder()
	state.handleGovernedActionByID(statusRec, statusReq)
	if statusRec.Code != http.StatusOK {
		t.Fatalf("expected ok status response, got %d body=%s", statusRec.Code, statusRec.Body.String())
	}
	var status gatewayGovernedActionResult
	if err := json.Unmarshal(statusRec.Body.Bytes(), &status); err != nil {
		t.Fatalf("decode gateway status response: %v", err)
	}
	if status.State != "completed" {
		t.Fatalf("expected completed state, got %q", status.State)
	}

	runReq := httptest.NewRequest(http.MethodGet, "/v1/runs/run-123", nil)
	runReq.Header.Set("Authorization", "Bearer test-token")
	runRec := httptest.NewRecorder()
	state.handleRunByID(runRec, runReq)
	if runRec.Code != http.StatusOK {
		t.Fatalf("expected run lookup ok, got %d body=%s", runRec.Code, runRec.Body.String())
	}
	var runResp gatewayRunStatusResponse
	if err := json.Unmarshal(runRec.Body.Bytes(), &runResp); err != nil {
		t.Fatalf("decode run lookup response: %v", err)
	}
	if runResp.State != "completed" {
		t.Fatalf("expected run state completed, got %q", runResp.State)
	}
	if runResp.Run.RunID != "run-123" {
		t.Fatalf("expected nested runId=run-123, got %q", runResp.Run.RunID)
	}
}

func TestCompatibilityWebsocketUpgradeRequestRecognizesCodexPost(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/responses", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-Websocket-Version", "13")
	req.Header.Set("Sec-Websocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")

	if !isCompatibilityWebsocketUpgradeRequest(req) {
		t.Fatal("expected Codex-style POST websocket upgrade to be accepted")
	}
}

func TestCompatibilityWebsocketUpgradeRequestRejectsNonUpgradePost(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/responses", nil)

	if isCompatibilityWebsocketUpgradeRequest(req) {
		t.Fatal("expected plain POST without websocket upgrade headers to be rejected")
	}
}

func TestGatewayPersistsNormalizedInterpositionEnvelope(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			contextGateway, _ := req.Context["gateway"].(runtimeapi.JSONObject)
			if got := strings.TrimSpace(interfaceString(contextGateway["interposition_request_id"])); got == "" {
				t.Fatalf("expected interposition_request_id in runtime context")
			}
			if got := strings.TrimSpace(interfaceString(contextGateway["codex_session_id"])); got != "codex-session-01" {
				t.Fatalf("codex_session_id=%q want codex-session-01", got)
			}
			if got := strings.TrimSpace(interfaceString(contextGateway["client_request_id"])); got != "codex-req-44" {
				t.Fatalf("client_request_id=%q want codex-req-44", got)
			}
			if got := strings.TrimSpace(interfaceString(req.Annotations["clientSurface"])); got != "codex" {
				t.Fatalf("clientSurface annotation=%q want codex", got)
			}
			run := runtimeapi.RunRecord{
				RunID:          "run-interposition",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}
			return &run, http.StatusCreated, nil
		},
	}

	body := strings.NewReader(`{
  "tenantId": "tenant-demo",
  "projectId": "project-core",
  "environmentId": "dev",
  "actionType": "desktop.execute",
  "targetType": "terminal",
  "targetRef": "echo EPYDIOS_GATEWAY_SMOKE_TEST",
  "input": {
    "command": "echo EPYDIOS_GATEWAY_SMOKE_TEST"
  },
  "client": {
    "id": "client-codex",
    "name": "Codex"
  },
  "idempotencyKey": "idem-001"
}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/governed-actions", body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Epydios-Client-Surface", "codex")
	req.Header.Set("X-Epydios-Operation-Class", "tool_action")
	req.Header.Set("X-Epydios-Upstream-Protocol", "compatibility_proxy")
	req.Header.Set("X-Epydios-Actor-Ref", "user:alice@example.com")
	req.Header.Set("X-Epydios-Codex-Session-Id", "codex-session-01")
	req.Header.Set("X-Epydios-Codex-Conversation-Id", "thread-8f1f")
	req.Header.Set("X-Epydios-Client-Request-Id", "codex-req-44")
	req.Header.Set("X-Epydios-Request-Title", "Gateway smoke test")
	rec := httptest.NewRecorder()
	state.handleGovernedActions(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected accepted response, got %d body=%s", rec.Code, rec.Body.String())
	}

	var created gatewayGovernedActionResult
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	record, err := readGatewayRequestRecord(requestsRoot, created.GatewayRequestID)
	if err != nil {
		t.Fatalf("read persisted request record: %v", err)
	}
	if record.Interposition.InterpositionRequestID != created.InterpositionRequestID {
		t.Fatalf("interpositionRequestId=%q want %q", record.Interposition.InterpositionRequestID, created.InterpositionRequestID)
	}
	if record.Interposition.ClientSurface != "codex" {
		t.Fatalf("clientSurface=%q want codex", record.Interposition.ClientSurface)
	}
	if record.Interposition.OperationClass != "tool_action" {
		t.Fatalf("operationClass=%q want tool_action", record.Interposition.OperationClass)
	}
	if record.Interposition.ActorRef != "user:alice@example.com" {
		t.Fatalf("actorRef=%q want user:alice@example.com", record.Interposition.ActorRef)
	}
	if record.Interposition.CodexSessionID != "codex-session-01" {
		t.Fatalf("codexSessionId=%q want codex-session-01", record.Interposition.CodexSessionID)
	}
	if record.Interposition.CodexConversationID != "thread-8f1f" {
		t.Fatalf("codexConversationId=%q want thread-8f1f", record.Interposition.CodexConversationID)
	}
	if record.Interposition.ClientRequestID != "codex-req-44" {
		t.Fatalf("clientRequestId=%q want codex-req-44", record.Interposition.ClientRequestID)
	}
	if record.Interposition.IdempotencyKey != "idem-001" {
		t.Fatalf("idempotencyKey=%q want idem-001", record.Interposition.IdempotencyKey)
	}
	if record.Interposition.GovernanceTarget.TargetRef != "echo EPYDIOS_GATEWAY_SMOKE_TEST" {
		t.Fatalf("targetRef=%q", record.Interposition.GovernanceTarget.TargetRef)
	}
	if record.Interposition.Upstream.Protocol != "compatibility_proxy" {
		t.Fatalf("protocol=%q want compatibility_proxy", record.Interposition.Upstream.Protocol)
	}
	if record.Interposition.Upstream.Path != "/v1/governed-actions" {
		t.Fatalf("path=%q want /v1/governed-actions", record.Interposition.Upstream.Path)
	}
	if !strings.HasPrefix(record.Interposition.Upstream.BodySHA256, "sha256:") {
		t.Fatalf("bodySha256=%q want sha256:*", record.Interposition.Upstream.BodySHA256)
	}
	if _, found := record.Interposition.Upstream.Headers["Authorization"]; found {
		t.Fatalf("authorization header should not be persisted")
	}
}

func TestGatewayPersistsHoldRecordForDeferredDecision(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			run := runtimeapi.RunRecord{
				RunID:          "run-defer",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPolicyEvaluated,
				PolicyDecision: "DEFER",
				ErrorMessage:   "supervisor approval required",
			}
			return &run, http.StatusCreated, nil
		},
	}

	body := strings.NewReader(`{
  "tenantId": "tenant-demo",
  "projectId": "project-core",
  "environmentId": "dev",
  "actionType": "desktop.execute",
  "targetType": "terminal",
  "targetRef": "echo EPYDIOS_GATEWAY_SMOKE_TEST",
  "input": {
    "command": "echo EPYDIOS_GATEWAY_SMOKE_TEST"
  },
  "client": {
    "id": "client-codex",
    "name": "Codex"
  }
}`)
	req := httptest.NewRequest(http.MethodPost, "/v1/governed-actions", body)
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Epydios-Client-Surface", "codex")
	rec := httptest.NewRecorder()
	state.handleGovernedActions(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected accepted response, got %d body=%s", rec.Code, rec.Body.String())
	}

	var created gatewayGovernedActionResult
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if !created.ApprovalRequired {
		t.Fatalf("expected approvalRequired=true")
	}
	if created.ApprovalID != "approval-run-defer" {
		t.Fatalf("approvalId=%q want approval-run-defer", created.ApprovalID)
	}
	if created.InterpositionState != "held_pending_approval" {
		t.Fatalf("interpositionState=%q want held_pending_approval", created.InterpositionState)
	}

	record, err := readGatewayRequestRecord(requestsRoot, created.GatewayRequestID)
	if err != nil {
		t.Fatalf("read request record: %v", err)
	}
	hold, err := readGatewayHoldRecord(gatewayHoldRecordsRoot(requestsRoot), record.Interposition.InterpositionRequestID)
	if err != nil {
		t.Fatalf("read hold record: %v", err)
	}
	if hold.GatewayRequestID != created.GatewayRequestID {
		t.Fatalf("gatewayRequestId=%q want %q", hold.GatewayRequestID, created.GatewayRequestID)
	}
	if hold.RunID != "run-defer" {
		t.Fatalf("runId=%q want run-defer", hold.RunID)
	}
	if hold.ApprovalID != "approval-run-defer" {
		t.Fatalf("approvalId=%q want approval-run-defer", hold.ApprovalID)
	}
	if hold.State != "held_pending_approval" {
		t.Fatalf("state=%q want held_pending_approval", hold.State)
	}
	if hold.HoldReason != "supervisor approval required" {
		t.Fatalf("holdReason=%q want supervisor approval required", hold.HoldReason)
	}
	if hold.ClientSurface != "codex" {
		t.Fatalf("clientSurface=%q want codex", hold.ClientSurface)
	}
	if hold.GovernanceTarget.TargetRef != "echo EPYDIOS_GATEWAY_SMOKE_TEST" {
		t.Fatalf("hold targetRef=%q", hold.GovernanceTarget.TargetRef)
	}
	if hold.HoldStartedAtUTC == "" || hold.HoldDeadlineAtUTC == "" {
		t.Fatalf("expected hold timestamps to be populated")
	}
}

func TestCompatibilityResponsesAllowForwarding(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true
	opts.InterpositionUpstreamBaseURL = "https://upstream.local"
	opts.InterpositionUpstreamBearerToken = "upstream-token"

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			if req.Action["type"] != "model.response" {
				t.Fatalf("action type=%v want model.response", req.Action["type"])
			}
			if req.Resource["kind"] != "model" {
				t.Fatalf("resource kind=%v want model", req.Resource["kind"])
			}
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-allow",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
		forwardCompatibilityHook: func(_ context.Context, req compatibilityForwardRequest) (*compatibilityForwardResponse, error) {
			if req.Path != "/v1/responses" {
				t.Fatalf("path=%q want /v1/responses", req.Path)
			}
			if req.BaseURL != "https://upstream.local" {
				t.Fatalf("baseURL=%q want https://upstream.local", req.BaseURL)
			}
			if req.BearerToken != "upstream-token" {
				t.Fatalf("bearer=%q want upstream-token", req.BearerToken)
			}
			var payload map[string]interface{}
			if err := json.Unmarshal(req.Body, &payload); err != nil {
				t.Fatalf("decode forwarded body: %v", err)
			}
			if payload["model"] != "gpt-5-codex" {
				t.Fatalf("forwarded model=%v want gpt-5-codex", payload["model"])
			}
			return &compatibilityForwardResponse{
				StatusCode: http.StatusOK,
				Headers:    http.Header{"Content-Type": []string{"application/json"}},
				Body:       []byte(`{"id":"resp_123","status":"completed","output_text":"compatibility ok"}`),
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(`{
  "model": "gpt-5-codex",
  "input": "Explain the run state."
}`))
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleCompatibilityResponses(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("compatibility status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"output_text":"compatibility ok"`) {
		t.Fatalf("unexpected compatibility body=%s", rec.Body.String())
	}
	if rec.Header().Get("X-Epydios-Run-Id") != "run-responses-allow" {
		t.Fatalf("run header=%q want run-responses-allow", rec.Header().Get("X-Epydios-Run-Id"))
	}

	entries, err := os.ReadDir(requestsRoot)
	if err != nil || len(entries) == 0 {
		t.Fatalf("expected persisted request record: %v entries=%d", err, len(entries))
	}
	items, err := ListGatewayHoldRecords(gatewayHoldRecordsRoot(requestsRoot))
	if err != nil {
		t.Fatalf("list holds: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("holds=%d want 0", len(items))
	}
}

func TestCompatibilityResponsesIngressPassesThroughAuthorizationWhenNoOverrideIsConfigured(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true
	opts.InterpositionUpstreamBaseURL = "https://api.openai.com"

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "gateway-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-passthrough",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
		forwardCompatibilityHook: func(_ context.Context, req compatibilityForwardRequest) (*compatibilityForwardResponse, error) {
			if got := strings.TrimSpace(req.Headers.Get("Authorization")); got != "Bearer codex-upstream-token" {
				t.Fatalf("authorization=%q want Bearer codex-upstream-token", got)
			}
			if got := strings.TrimSpace(req.BearerToken); got != "" {
				t.Fatalf("bearer override=%q want empty", got)
			}
			return &compatibilityForwardResponse{
				StatusCode: http.StatusOK,
				Headers:    http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       []byte("data: {\"type\":\"response.completed\",\"response\":{\"output_text\":\"compatibility ingress ok\"}}\n\n"),
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/responses", strings.NewReader(`{
  "model": "gpt-5-codex",
  "input": "Return exactly this text and nothing else: compatibility ingress ok"
}`))
	req.Header.Set("Authorization", "Bearer codex-upstream-token")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Originator", "Codex Desktop")
	req.Header.Set("Session_id", "codex-exec-session")
	req.Header.Set("X-Client-Request-Id", "codex-exec-request")
	req.Header.Set("X-Codex-Turn-Metadata", `{"turn_id":"codex-exec-turn","sandbox":"seatbelt"}`)
	req.RemoteAddr = "127.0.0.1:41234"

	rec := httptest.NewRecorder()
	state.handleCompatibilityResponsesIngress(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("compatibility ingress status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestForwardCompatibilityPassesThroughAuthorizationWithoutSavedOverride(t *testing.T) {
	requestsRoot := t.TempDir()
	var observedAuthorization string
	previousClientFactory := compatibilityHTTPClientFactory
	compatibilityHTTPClientFactory = func() *http.Client {
		return &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				observedAuthorization = strings.TrimSpace(req.Header.Get("Authorization"))
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(strings.NewReader(`{"id":"resp_passthrough","status":"completed"}`)),
					Request:    req,
				}, nil
			}),
		}
	}
	defer func() {
		compatibilityHTTPClientFactory = previousClientFactory
	}()

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "gateway-token",
		opts: func() LaunchOptions {
			opts := DefaultLaunchOptions()
			opts.Mode = modeLive
			opts.InterpositionEnabled = true
			opts.InterpositionUpstreamBaseURL = "https://api.openai.com"
			return opts
		}(),
	}

	resp, err := state.forwardCompatibility(context.Background(), compatibilityForwardRequest{
		Path:    "/v1/responses",
		Body:    []byte(`{"model":"gpt-5-codex","input":"hello"}`),
		BaseURL: "https://api.openai.com",
		Headers: http.Header{
			"Authorization": []string{"Bearer codex-upstream-token"},
			"Content-Type":  []string{"application/json"},
		},
	})
	if err != nil {
		t.Fatalf("forward compatibility: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d want %d", resp.StatusCode, http.StatusOK)
	}
	if observedAuthorization != "Bearer codex-upstream-token" {
		t.Fatalf("authorization=%q want Bearer codex-upstream-token", observedAuthorization)
	}
}

func TestBuildCompatibilityGovernedActionRequestDecodesZstdBody(t *testing.T) {
	var encoded bytes.Buffer
	writer, err := zstd.NewWriter(&encoded)
	if err != nil {
		t.Fatalf("new zstd writer: %v", err)
	}
	if _, err := writer.Write([]byte(`{"model":"gpt-5.4","input":"say hello"}`)); err != nil {
		t.Fatalf("write zstd payload: %v", err)
	}
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/responses", nil)
	req.Header.Set("Content-Encoding", "zstd")

	governedReq, operationClass, err := buildCompatibilityGovernedActionRequest(req, encoded.Bytes())
	if err != nil {
		t.Fatalf("buildCompatibilityGovernedActionRequest: %v", err)
	}
	if operationClass != "conversation_turn" {
		t.Fatalf("operationClass=%q want conversation_turn", operationClass)
	}
	if governedReq.TargetRef != "gpt-5.4" {
		t.Fatalf("targetRef=%q want gpt-5.4", governedReq.TargetRef)
	}
}

func TestBuildCompatibilityGovernedActionRequestDecodesGzipBody(t *testing.T) {
	var encoded bytes.Buffer
	writer := gzip.NewWriter(&encoded)
	if _, err := writer.Write([]byte(`{"model":"gpt-5.4","input":"say hello"}`)); err != nil {
		t.Fatalf("write gzip payload: %v", err)
	}
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/responses", nil)
	req.Header.Set("Content-Encoding", "gzip")

	governedReq, _, err := buildCompatibilityGovernedActionRequest(req, encoded.Bytes())
	if err != nil {
		t.Fatalf("buildCompatibilityGovernedActionRequest: %v", err)
	}
	if governedReq.TargetRef != "gpt-5.4" {
		t.Fatalf("targetRef=%q want gpt-5.4", governedReq.TargetRef)
	}
}

func TestCompatibilityResponsesIngressSupportsCodexExecPath(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true
	opts.InterpositionUpstreamBaseURL = "https://upstream.local"

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-ingress",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
		forwardCompatibilityHook: func(_ context.Context, req compatibilityForwardRequest) (*compatibilityForwardResponse, error) {
			if req.Path != "/responses" {
				t.Fatalf("path=%q want /responses", req.Path)
			}
			if got := strings.TrimSpace(req.Headers.Get("Accept")); got != "text/event-stream" {
				t.Fatalf("accept=%q want text/event-stream", got)
			}
			return &compatibilityForwardResponse{
				StatusCode: http.StatusOK,
				Headers:    http.Header{"Content-Type": []string{"text/event-stream"}},
				Body:       []byte("data: {\"type\":\"response.completed\",\"response\":{\"output_text\":\"compatibility ingress ok\"}}\n\n"),
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/responses", strings.NewReader(`{
  "model": "gpt-5-codex",
  "input": "Return exactly this text and nothing else: compatibility ingress ok"
}`))
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Originator", "Codex Desktop")
	req.Header.Set("Session_id", "codex-exec-session")
	req.Header.Set("X-Client-Request-Id", "codex-exec-request")
	req.Header.Set("X-Codex-Turn-Metadata", `{"turn_id":"codex-exec-turn","sandbox":"seatbelt"}`)
	req.RemoteAddr = "127.0.0.1:41234"

	rec := httptest.NewRecorder()
	state.handleCompatibilityResponsesIngress(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("compatibility ingress status=%d body=%s", rec.Code, rec.Body.String())
	}
	if got := strings.TrimSpace(rec.Header().Get("Content-Type")); got != "text/event-stream" {
		t.Fatalf("content-type=%q want text/event-stream", got)
	}
	if !strings.Contains(rec.Body.String(), `"compatibility ingress ok"`) {
		t.Fatalf("unexpected ingress body=%s", rec.Body.String())
	}

	record := waitForSingleGatewayRequestRecordState(t, requestsRoot, "completed")
	if record.Interposition.Upstream.Path != "/responses" {
		t.Fatalf("upstream path=%q want /responses", record.Interposition.Upstream.Path)
	}
	if record.Interposition.ClientRequestID != "codex-exec-request" {
		t.Fatalf("clientRequestId=%q want codex-exec-request", record.Interposition.ClientRequestID)
	}
	if record.Interposition.CodexTurnID != "codex-exec-turn" {
		t.Fatalf("codexTurnId=%q want codex-exec-turn", record.Interposition.CodexTurnID)
	}
}

func TestCompatibilityResponsesIngressMarksUpstreamHTTPFailureAsFailed(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true
	opts.InterpositionUpstreamBaseURL = "https://api.openai.com/v1"

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-http-upstream-failure",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
		forwardCompatibilityHook: func(_ context.Context, req compatibilityForwardRequest) (*compatibilityForwardResponse, error) {
			return &compatibilityForwardResponse{
				StatusCode: http.StatusUnauthorized,
				Headers:    http.Header{"Content-Type": []string{"application/json"}},
				Body:       []byte(`{"error":{"message":"missing scopes"}}`),
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/responses", strings.NewReader(`{"model":"gpt-5-codex","input":"hello"}`))
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Originator", "Codex Desktop")
	req.Header.Set("Session_id", "codex-exec-session")
	req.Header.Set("X-Client-Request-Id", "codex-exec-request")
	req.Header.Set("X-Codex-Turn-Metadata", `{"turn_id":"codex-exec-turn","sandbox":"seatbelt"}`)
	req.RemoteAddr = "127.0.0.1:41234"

	rec := httptest.NewRecorder()
	state.handleCompatibilityResponsesIngress(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want %d body=%s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}

	record := waitForSingleGatewayRequestRecordState(t, requestsRoot, "failed")
	if record.Result.State != "failed" {
		t.Fatalf("result state=%q want failed", record.Result.State)
	}
}

func TestCompatibilityResponsesIngressRejectsMissingTokenForNonLoopback(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true
	opts.InterpositionUpstreamBaseURL = "https://upstream.local"

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
	}

	req := httptest.NewRequest(http.MethodPost, "/responses", strings.NewReader(`{"model":"gpt-5-codex","input":"hello"}`))
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Originator", "Codex Desktop")
	req.Header.Set("Session_id", "codex-exec-session")
	req.Header.Set("X-Client-Request-Id", "codex-exec-request")
	req.RemoteAddr = "203.0.113.10:41234"

	rec := httptest.NewRecorder()
	state.handleCompatibilityResponsesIngress(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want %d body=%s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}

func TestAuthorizeCompatibilityAllowsLoopbackCodexWebsocketWithNonGatewayBearer(t *testing.T) {
	opts := DefaultLaunchOptions()
	state := &gatewayServiceState{token: "gateway-token", opts: opts}

	req := httptest.NewRequest(http.MethodPost, "/responses", nil)
	req.Header.Set("Authorization", "Bearer codex-upstream-token")
	req.Header.Set("Originator", "Codex Desktop")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-Websocket-Version", "13")
	req.Header.Set("Sec-Websocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	req.RemoteAddr = "127.0.0.1:41234"

	rec := httptest.NewRecorder()
	if !state.authorizeCompatibility(rec, req) {
		t.Fatalf("expected trusted loopback Codex websocket to bypass gateway bearer validation, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestTrustedCompatibilityLoopbackCodexRequestRejectsPlainHTTPWithoutIdentityHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/responses", strings.NewReader(`{"model":"gpt-5-codex"}`))
	req.Header.Set("Originator", "Codex Desktop")
	req.RemoteAddr = "127.0.0.1:41234"

	if isTrustedCompatibilityLoopbackCodexRequest(req) {
		t.Fatal("expected plain loopback Codex HTTP request without session/request ids to remain untrusted")
	}
}

func TestCompatibilityResponsesWaitsForApprovalAndResumes(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true
	opts.InterpositionUpstreamBaseURL = "https://upstream.local"
	opts.InterpositionUpstreamBearerToken = "upstream-token"

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-defer",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPolicyEvaluated,
				PolicyDecision: "DEFER",
				ErrorMessage:   "supervisor approval required",
			}, http.StatusCreated, nil
		},
		forwardCompatibilityHook: func(_ context.Context, req compatibilityForwardRequest) (*compatibilityForwardResponse, error) {
			return &compatibilityForwardResponse{
				StatusCode: http.StatusOK,
				Headers:    http.Header{"Content-Type": []string{"application/json"}},
				Body:       []byte(`{"id":"resp_resume","status":"completed","output_text":"resumed after approval"}`),
			}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(`{
  "model": "gpt-5-codex",
  "input": "Restart the payments deployment.",
  "metadata": {
    "tenantId": "tenant-demo",
    "projectId": "project-core"
  }
}`))
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		state.handleCompatibilityResponses(rec, req)
		close(done)
	}()

	holdsRoot := gatewayHoldRecordsRoot(requestsRoot)
	var hold GatewayHoldRecord
	var err error
	for i := 0; i < 20; i++ {
		items, listErr := ListGatewayHoldRecords(holdsRoot)
		if listErr == nil && len(items) > 0 {
			hold = items[0]
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if hold.InterpositionRequestID == "" {
		t.Fatal("expected held compatibility request to be persisted")
	}
	if _, err = ResolveGatewayHoldRecord(holdsRoot, requestsRoot, hold.InterpositionRequestID, "APPROVE", "operator approved"); err != nil {
		t.Fatalf("approve hold: %v", err)
	}

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for compatibility handler to resume")
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("compatibility resumed status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"output_text":"resumed after approval"`) {
		t.Fatalf("unexpected compatibility resume body=%s", rec.Body.String())
	}
	refreshedHold, err := readGatewayHoldRecord(holdsRoot, hold.InterpositionRequestID)
	if err != nil {
		t.Fatalf("read refreshed hold: %v", err)
	}
	if refreshedHold.State != "completed" {
		t.Fatalf("hold state=%q want completed", refreshedHold.State)
	}
	requestRecord, err := readGatewayRequestRecord(requestsRoot, hold.GatewayRequestID)
	if err != nil {
		t.Fatalf("read request record: %v", err)
	}
	if requestRecord.Interposition.State != "completed" {
		t.Fatalf("interposition state=%q want completed", requestRecord.Interposition.State)
	}
	if requestRecord.Result.State != "completed" {
		t.Fatalf("result state=%q want completed", requestRecord.Result.State)
	}
}

func TestCompatibilityResponsesReturnsDeniedWhenApprovalRejected(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true
	opts.InterpositionUpstreamBaseURL = "https://upstream.local"

	forwarded := false
	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-deny",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPolicyEvaluated,
				PolicyDecision: "DEFER",
				ErrorMessage:   "approval required",
			}, http.StatusCreated, nil
		},
		forwardCompatibilityHook: func(_ context.Context, req compatibilityForwardRequest) (*compatibilityForwardResponse, error) {
			forwarded = true
			return &compatibilityForwardResponse{}, nil
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(`{
  "model": "gpt-5-codex",
  "input": "Delete the production namespace."
}`))
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		state.handleCompatibilityResponses(rec, req)
		close(done)
	}()

	holdsRoot := gatewayHoldRecordsRoot(requestsRoot)
	var hold GatewayHoldRecord
	for i := 0; i < 20; i++ {
		items, listErr := ListGatewayHoldRecords(holdsRoot)
		if listErr == nil && len(items) > 0 {
			hold = items[0]
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if hold.InterpositionRequestID == "" {
		t.Fatal("expected denied compatibility request hold to exist")
	}
	if _, err := ResolveGatewayHoldRecord(holdsRoot, requestsRoot, hold.InterpositionRequestID, "DENY", "operator denied"); err != nil {
		t.Fatalf("deny hold: %v", err)
	}

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for compatibility deny response")
	}

	if rec.Code != http.StatusForbidden {
		t.Fatalf("compatibility deny status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"epydios_approval_denied"`) {
		t.Fatalf("unexpected deny body=%s", rec.Body.String())
	}
	if forwarded {
		t.Fatal("compatibility request should not forward upstream after denial")
	}
}

func TestCompatibilityResponsesRejectsWhenInterpositionDisabled(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(`{"model":"gpt-5-codex","input":"hello"}`))
	req.Header.Set("Authorization", "Bearer test-token")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	state.handleCompatibilityResponses(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("compatibility disabled status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"code":"epydios_interposition_disabled"`) {
		t.Fatalf("unexpected disabled body=%s", rec.Body.String())
	}
}

func TestCompatibilityResponsesWebSocketAllowForwarding(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true

	upstreamHeadersCh := make(chan http.Header, 1)
	upstreamMessageCh := make(chan []byte, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := gatewayWebsocketUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade upstream websocket: %v", err)
		}
		defer conn.Close()
		upstreamHeadersCh <- r.Header.Clone()
		messageType, message, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read upstream websocket message: %v", err)
		}
		if messageType != websocket.TextMessage {
			t.Fatalf("messageType=%d want text", messageType)
		}
		upstreamMessageCh <- append([]byte(nil), message...)
		if err := conn.WriteJSON(map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":          "resp_epydios",
				"status":      "completed",
				"output_text": "proxied via epydios",
			},
		}); err != nil {
			t.Fatalf("write upstream websocket completion: %v", err)
		}
	}))
	defer upstream.Close()
	opts.InterpositionUpstreamBaseURL = upstream.URL

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-ws",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/responses", state.handleCompatibilityResponsesWebSocket)
	gatewayServer := httptest.NewServer(mux)
	defer gatewayServer.Close()

	gatewayWSURL := strings.Replace(gatewayServer.URL, "http://", "ws://", 1) + "/responses"
	clientHeaders := http.Header{}
	clientHeaders.Set("Authorization", "Bearer codex-chatgpt-token")
	clientHeaders.Set("Originator", "Codex Desktop")
	clientHeaders.Set("Chatgpt-Account-Id", "acct-demo")
	clientHeaders.Set("Session_id", "codex-session-client-close")
	clientHeaders.Set("X-Client-Request-Id", "client-req-client-close")
	clientHeaders.Set("X-Codex-Turn-Metadata", `{"turn_id":"turn-client-close","sandbox":"seatbelt"}`)
	clientHeaders.Set("Openai-Beta", "responses_websockets=2026-02-06")
	clientHeaders.Set("Originator", "Codex Desktop")
	clientHeaders.Set("Session_id", "codex-session-demo")
	clientHeaders.Set("X-Client-Request-Id", "client-req-demo")

	clientConn, _, err := websocket.DefaultDialer.Dial(gatewayWSURL, clientHeaders)
	if err != nil {
		t.Fatalf("dial gateway websocket: %v", err)
	}
	defer clientConn.Close()

	firstFrame := map[string]interface{}{
		"type":  "response.create",
		"model": "gpt-5.4",
		"input": "Say exactly: proxied via epydios",
	}
	if err := clientConn.WriteJSON(firstFrame); err != nil {
		t.Fatalf("write gateway websocket request: %v", err)
	}

	_, responseMessage, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("read gateway websocket response: %v", err)
	}
	if !strings.Contains(string(responseMessage), `"type":"response.completed"`) {
		t.Fatalf("unexpected websocket response=%s", string(responseMessage))
	}
	if !strings.Contains(string(responseMessage), `"output_text":"proxied via epydios"`) {
		t.Fatalf("unexpected websocket completion body=%s", string(responseMessage))
	}
	_ = clientConn.Close()

	select {
	case upstreamHeaders := <-upstreamHeadersCh:
		if got := upstreamHeaders.Get("Authorization"); got != "Bearer codex-chatgpt-token" {
			t.Fatalf("upstream auth=%q want Bearer codex-chatgpt-token", got)
		}
		if got := upstreamHeaders.Get("Chatgpt-Account-Id"); got != "acct-demo" {
			t.Fatalf("upstream chatgpt account=%q want acct-demo", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for upstream websocket headers")
	}

	select {
	case upstreamMessage := <-upstreamMessageCh:
		if !strings.Contains(string(upstreamMessage), `"type":"response.create"`) {
			t.Fatalf("unexpected upstream frame=%s", string(upstreamMessage))
		}
		if !strings.Contains(string(upstreamMessage), `"model":"gpt-5.4"`) {
			t.Fatalf("unexpected upstream model frame=%s", string(upstreamMessage))
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for upstream websocket frame")
	}

	record := waitForSingleGatewayRequestRecordState(t, requestsRoot, "completed")
	if record.Interposition.Upstream.Path != "/responses" {
		t.Fatalf("upstream path=%q want /responses", record.Interposition.Upstream.Path)
	}
	if record.Interposition.ClientSurface != "codex" {
		t.Fatalf("clientSurface=%q want codex", record.Interposition.ClientSurface)
	}
	if record.Result.RunID != "run-responses-ws" {
		t.Fatalf("runId=%q want run-responses-ws", record.Result.RunID)
	}
	if record.Result.InterpositionState != "completed" {
		t.Fatalf("interpositionState=%q want completed", record.Result.InterpositionState)
	}
}

func TestCompatibilityResponsesWebSocketCompletedWinsAfterAbruptUpstreamClose(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := gatewayWebsocketUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade upstream websocket: %v", err)
		}
		defer conn.Close()
		if _, _, err := conn.ReadMessage(); err != nil {
			t.Fatalf("read upstream websocket message: %v", err)
		}
		if err := conn.WriteJSON(map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":          "resp_epydios_abrupt",
				"status":      "completed",
				"output_text": "completed before abrupt close",
			},
		}); err != nil {
			t.Fatalf("write upstream websocket completion: %v", err)
		}
		_ = conn.UnderlyingConn().Close()
	}))
	defer upstream.Close()
	opts.InterpositionUpstreamBaseURL = upstream.URL

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-ws-abrupt",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/responses", state.handleCompatibilityResponsesWebSocket)
	gatewayServer := httptest.NewServer(mux)
	defer gatewayServer.Close()

	gatewayWSURL := strings.Replace(gatewayServer.URL, "http://", "ws://", 1) + "/responses"
	clientHeaders := http.Header{}
	clientHeaders.Set("Authorization", "Bearer codex-chatgpt-token")
	clientHeaders.Set("Originator", "Codex Desktop")
	clientHeaders.Set("Chatgpt-Account-Id", "acct-demo")

	clientConn, _, err := websocket.DefaultDialer.Dial(gatewayWSURL, clientHeaders)
	if err != nil {
		t.Fatalf("dial gateway websocket: %v", err)
	}
	defer clientConn.Close()

	firstFrame := map[string]interface{}{
		"type":  "response.create",
		"model": "gpt-5.4",
		"input": "Say exactly: completed before abrupt close",
	}
	if err := clientConn.WriteJSON(firstFrame); err != nil {
		t.Fatalf("write gateway websocket request: %v", err)
	}

	_, responseMessage, err := clientConn.ReadMessage()
	if err != nil {
		t.Fatalf("read gateway websocket response: %v", err)
	}
	if !strings.Contains(string(responseMessage), `"type":"response.completed"`) {
		t.Fatalf("unexpected websocket response=%s", string(responseMessage))
	}
	_ = clientConn.Close()

	record := waitForSingleGatewayRequestRecordState(t, requestsRoot, "completed")
	if record.Result.State != "completed" {
		t.Fatalf("result state=%q want completed", record.Result.State)
	}
	if record.Result.InterpositionState != "completed" {
		t.Fatalf("interpositionState=%q want completed", record.Result.InterpositionState)
	}
	if got := strings.TrimSpace(record.Interposition.WebsocketTrace.FinalizedAtUTC); got == "" {
		t.Fatal("expected finalizedAtUtc trace")
	}
}

func TestCompatibilityResponsesWebSocketCompletesAfterClientClosesEarly(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := gatewayWebsocketUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade upstream websocket: %v", err)
		}
		defer conn.Close()
		if _, _, err := conn.ReadMessage(); err != nil {
			t.Fatalf("read upstream websocket message: %v", err)
		}
		if err := conn.WriteJSON(map[string]interface{}{
			"type":  "response.output_text.delta",
			"delta": "partial",
		}); err != nil {
			t.Fatalf("write upstream websocket delta: %v", err)
		}
		if err := conn.WriteJSON(map[string]interface{}{
			"type":          "response.output_text.done",
			"response_id":   "resp_epydios_client_closed",
			"item_id":       "msg_epydios_client_closed",
			"output_index":  0,
			"content_index": 0,
			"text":          "completed after client close",
		}); err != nil {
			t.Fatalf("write upstream websocket done: %v", err)
		}
		time.Sleep(150 * time.Millisecond)
		if err := conn.WriteJSON(map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":          "resp_epydios_client_closed",
				"status":      "completed",
				"output_text": "completed after client close",
			},
		}); err != nil {
			t.Fatalf("write upstream websocket completion: %v", err)
		}
	}))
	defer upstream.Close()
	opts.InterpositionUpstreamBaseURL = upstream.URL

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-ws-client-closed",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/responses", state.handleCompatibilityResponsesWebSocket)
	gatewayServer := httptest.NewServer(mux)
	defer gatewayServer.Close()

	gatewayWSURL := strings.Replace(gatewayServer.URL, "http://", "ws://", 1) + "/responses"
	clientHeaders := http.Header{}
	clientHeaders.Set("Authorization", "Bearer codex-chatgpt-token")
	clientHeaders.Set("Originator", "Codex Desktop")
	clientHeaders.Set("Chatgpt-Account-Id", "acct-demo")
	clientHeaders.Set("Session_id", "codex-session-client-close")
	clientHeaders.Set("X-Client-Request-Id", "client-req-client-close")
	clientHeaders.Set("X-Codex-Turn-Metadata", `{"turn_id":"turn-client-close","sandbox":"seatbelt"}`)

	clientConn, _, err := websocket.DefaultDialer.Dial(gatewayWSURL, clientHeaders)
	if err != nil {
		t.Fatalf("dial gateway websocket: %v", err)
	}
	firstFrame := map[string]interface{}{
		"type":  "response.create",
		"model": "gpt-5.4",
		"input": "Say exactly: completed after client close",
	}
	if err := clientConn.WriteJSON(firstFrame); err != nil {
		t.Fatalf("write gateway websocket request: %v", err)
	}
	if _, responseMessage, err := clientConn.ReadMessage(); err != nil {
		t.Fatalf("read gateway websocket response: %v", err)
	} else if !strings.Contains(string(responseMessage), `"type":"response.output_text.delta"`) {
		t.Fatalf("unexpected websocket response=%s", string(responseMessage))
	}
	_ = clientConn.Close()

	record := waitForSingleGatewayRequestRecordState(t, requestsRoot, "completed")
	if record.Result.State != "completed" {
		t.Fatalf("result state=%q want completed", record.Result.State)
	}
	if record.Result.InterpositionState != "completed" {
		t.Fatalf("interpositionState=%q want completed", record.Result.InterpositionState)
	}
	if got := strings.TrimSpace(record.Interposition.WebsocketTrace.ClientClosedAtUTC); got == "" {
		t.Fatal("expected clientClosedAtUtc trace")
	}
	if got := strings.TrimSpace(record.Interposition.WebsocketTrace.UpstreamSemanticAtUTC); got == "" {
		t.Fatal("expected upstreamSemanticAtUtc trace")
	}
	if got := strings.TrimSpace(record.Interposition.WebsocketTrace.FinalizedAtUTC); got == "" {
		t.Fatal("expected finalizedAtUtc trace")
	}
	if len(record.Interposition.TerminalWebsocketEvent) == 0 {
		t.Fatal("expected synthesized terminal websocket event")
	}
}

func TestCompatibilityResponsesWebSocketTreatsPrewarmSeparately(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true

	var upstreamHits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits.Add(1)
		conn, err := gatewayWebsocketUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade upstream websocket: %v", err)
		}
		defer conn.Close()
		if _, _, err := conn.ReadMessage(); err != nil {
			t.Fatalf("read upstream websocket message: %v", err)
		}
		if err := conn.WriteJSON(map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":          "resp_epydios_real_turn",
				"status":      "completed",
				"output_text": "real turn ok",
			},
		}); err != nil {
			t.Fatalf("write upstream websocket completion: %v", err)
		}
	}))
	defer upstream.Close()
	opts.InterpositionUpstreamBaseURL = upstream.URL

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-ws-prewarm",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/responses", state.handleCompatibilityResponsesWebSocket)
	gatewayServer := httptest.NewServer(mux)
	defer gatewayServer.Close()

	gatewayWSURL := strings.Replace(gatewayServer.URL, "http://", "ws://", 1) + "/responses"
	clientHeaders := http.Header{}
	clientHeaders.Set("Authorization", "Bearer codex-chatgpt-token")
	clientHeaders.Set("Originator", "Codex Desktop")
	clientHeaders.Set("Chatgpt-Account-Id", "acct-demo")
	clientHeaders.Set("Session_id", "codex-session-demo")
	clientHeaders.Set("X-Client-Request-Id", "client-req-prewarm")

	prewarmConn, _, err := websocket.DefaultDialer.Dial(gatewayWSURL, clientHeaders)
	if err != nil {
		t.Fatalf("dial gateway websocket for prewarm: %v", err)
	}
	if err := prewarmConn.WriteJSON(map[string]interface{}{
		"type":  "response.create",
		"model": "gpt-5.4",
		"input": []interface{}{},
	}); err != nil {
		t.Fatalf("write prewarm request: %v", err)
	}
	_, prewarmCreated, err := prewarmConn.ReadMessage()
	if err != nil {
		t.Fatalf("read prewarm created event: %v", err)
	}
	_, prewarmCompleted, err := prewarmConn.ReadMessage()
	if err != nil {
		t.Fatalf("read prewarm completed event: %v", err)
	}
	_ = prewarmConn.Close()
	if !strings.Contains(string(prewarmCreated), `"type":"response.created"`) {
		t.Fatalf("unexpected prewarm created event=%s", string(prewarmCreated))
	}
	if !strings.Contains(string(prewarmCompleted), `"type":"response.completed"`) {
		t.Fatalf("unexpected prewarm completed event=%s", string(prewarmCompleted))
	}

	actualHeaders := clientHeaders.Clone()
	actualHeaders.Set("X-Codex-Turn-Metadata", `{"turn_id":"turn-real","sandbox":"seatbelt"}`)
	actualConn, _, err := websocket.DefaultDialer.Dial(gatewayWSURL, actualHeaders)
	if err != nil {
		t.Fatalf("dial gateway websocket for actual request: %v", err)
	}
	defer actualConn.Close()
	if err := actualConn.WriteJSON(map[string]interface{}{
		"type":  "response.create",
		"model": "gpt-5.4",
		"input": []interface{}{
			map[string]interface{}{
				"type": "message",
				"role": "user",
				"content": []interface{}{
					map[string]interface{}{
						"type": "input_text",
						"text": "Say exactly: real turn ok",
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("write actual request: %v", err)
	}
	_, actualResponse, err := actualConn.ReadMessage()
	if err != nil {
		t.Fatalf("read actual response: %v", err)
	}
	if !strings.Contains(string(actualResponse), `real turn ok`) {
		t.Fatalf("unexpected actual response=%s", string(actualResponse))
	}

	if got := upstreamHits.Load(); got != 1 {
		t.Fatalf("upstream hits=%d want 1", got)
	}
	record := waitForSingleGatewayRequestRecordState(t, requestsRoot, "completed")
	items, err := listGatewayRequestRecords(requestsRoot)
	if err != nil {
		t.Fatalf("list gateway request records: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("request record count=%d want 1", len(items))
	}
	if record.Result.State != "completed" {
		t.Fatalf("result state=%q want completed", record.Result.State)
	}
}

func TestCompatibilityResponsesWebSocketReplaysCachedTerminalEventForDuplicateRequest(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true

	var upstreamHits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits.Add(1)
		conn, err := gatewayWebsocketUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade upstream websocket: %v", err)
		}
		defer conn.Close()
		if _, _, err := conn.ReadMessage(); err != nil {
			t.Fatalf("read upstream websocket message: %v", err)
		}
		if err := conn.WriteJSON(map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":          "resp_epydios_cached",
				"status":      "completed",
				"output_text": "cached terminal event",
			},
		}); err != nil {
			t.Fatalf("write upstream websocket completion: %v", err)
		}
	}))
	defer upstream.Close()
	opts.InterpositionUpstreamBaseURL = upstream.URL

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-ws-cached",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/responses", state.handleCompatibilityResponsesWebSocket)
	gatewayServer := httptest.NewServer(mux)
	defer gatewayServer.Close()

	gatewayWSURL := strings.Replace(gatewayServer.URL, "http://", "ws://", 1) + "/responses"
	clientHeaders := http.Header{}
	clientHeaders.Set("Authorization", "Bearer codex-chatgpt-token")
	clientHeaders.Set("Originator", "Codex Desktop")
	clientHeaders.Set("Chatgpt-Account-Id", "acct-demo")
	clientHeaders.Set("Session_id", "codex-session-demo")
	clientHeaders.Set("X-Client-Request-Id", "client-req-duplicate")

	send := func(input string) string {
		clientConn, _, err := websocket.DefaultDialer.Dial(gatewayWSURL, clientHeaders)
		if err != nil {
			t.Fatalf("dial gateway websocket: %v", err)
		}
		defer clientConn.Close()
		firstFrame := map[string]interface{}{
			"type":  "response.create",
			"model": "gpt-5.4",
			"input": input,
		}
		if err := clientConn.WriteJSON(firstFrame); err != nil {
			t.Fatalf("write gateway websocket request: %v", err)
		}
		_, responseMessage, err := clientConn.ReadMessage()
		if err != nil {
			t.Fatalf("read gateway websocket response: %v", err)
		}
		return string(responseMessage)
	}

	firstResponse := send("Say exactly: cached terminal event")
	if !strings.Contains(firstResponse, `"output_text":"cached terminal event"`) {
		t.Fatalf("unexpected first response=%s", firstResponse)
	}
	record := waitForSingleGatewayRequestRecordState(t, requestsRoot, "completed")
	if len(record.Interposition.TerminalWebsocketEvent) == 0 {
		t.Fatal("expected cached terminal websocket event")
	}

	secondResponse := send("Say exactly: cached terminal event")
	if !strings.Contains(secondResponse, `"type": "response.completed"`) || !strings.Contains(secondResponse, `cached terminal event`) {
		t.Fatalf("unexpected replayed response=%s", secondResponse)
	}
	if got := upstreamHits.Load(); got != 1 {
		t.Fatalf("upstream hits=%d want 1", got)
	}
	items, err := listGatewayRequestRecords(requestsRoot)
	if err != nil {
		t.Fatalf("list gateway request records: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("request record count=%d want 1", len(items))
	}
}

func TestCompatibilityResponsesWebSocketRetryKeyReplaysCompletedTurn(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true

	var upstreamHits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits.Add(1)
		conn, err := gatewayWebsocketUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade upstream websocket: %v", err)
		}
		defer conn.Close()
		if _, _, err := conn.ReadMessage(); err != nil {
			t.Fatalf("read upstream websocket message: %v", err)
		}
		if err := conn.WriteJSON(map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":          "resp_epydios_turn_retry",
				"status":      "completed",
				"output_text": "turn retry cached result",
			},
		}); err != nil {
			t.Fatalf("write upstream websocket completion: %v", err)
		}
	}))
	defer upstream.Close()
	opts.InterpositionUpstreamBaseURL = upstream.URL

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-ws-turn-retry",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/responses", state.handleCompatibilityResponsesWebSocket)
	gatewayServer := httptest.NewServer(mux)
	defer gatewayServer.Close()

	gatewayWSURL := strings.Replace(gatewayServer.URL, "http://", "ws://", 1) + "/responses"
	send := func(clientRequestID string, input interface{}) string {
		clientHeaders := http.Header{}
		clientHeaders.Set("Authorization", "Bearer codex-chatgpt-token")
		clientHeaders.Set("Originator", "Codex Desktop")
		clientHeaders.Set("Chatgpt-Account-Id", "acct-demo")
		clientHeaders.Set("Session_id", "codex-session-turn-retry")
		clientHeaders.Set("X-Client-Request-Id", clientRequestID)
		clientHeaders.Set("X-Codex-Turn-Metadata", `{"turn_id":"turn-retry-shared","sandbox":"seatbelt"}`)

		clientConn, _, err := websocket.DefaultDialer.Dial(gatewayWSURL, clientHeaders)
		if err != nil {
			t.Fatalf("dial gateway websocket: %v", err)
		}
		defer clientConn.Close()

		firstFrame := map[string]interface{}{
			"type":  "response.create",
			"model": "gpt-5.4",
			"input": input,
		}
		if err := clientConn.WriteJSON(firstFrame); err != nil {
			t.Fatalf("write gateway websocket request: %v", err)
		}
		_, responseMessage, err := clientConn.ReadMessage()
		if err != nil {
			t.Fatalf("read gateway websocket response: %v", err)
		}
		return string(responseMessage)
	}

	firstResponse := send("client-req-turn-retry-1", "Say exactly: turn retry cached result")
	if !strings.Contains(firstResponse, `turn retry cached result`) {
		t.Fatalf("unexpected first response=%s", firstResponse)
	}
	record := waitForSingleGatewayRequestRecordState(t, requestsRoot, "completed")
	if strings.TrimSpace(record.Interposition.WebsocketTrace.RetryKey) == "" {
		t.Fatal("expected retry key on completed request")
	}

	secondResponse := send("client-req-turn-retry-2", []interface{}{
		map[string]interface{}{
			"type": "message",
			"role": "user",
			"content": []interface{}{
				map[string]interface{}{
					"type": "input_text",
					"text": "Say exactly: turn retry cached result",
				},
			},
		},
	})
	if !strings.Contains(secondResponse, `response.completed`) || !strings.Contains(secondResponse, `turn retry cached result`) {
		t.Fatalf("unexpected replayed response=%s", secondResponse)
	}
	if got := upstreamHits.Load(); got != 1 {
		t.Fatalf("upstream hits=%d want 1", got)
	}
	items, err := listGatewayRequestRecords(requestsRoot)
	if err != nil {
		t.Fatalf("list gateway request records: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("request record count=%d want 1", len(items))
	}
	if items[0].Interposition.WebsocketTrace.RetryReplayCount != 1 {
		t.Fatalf("retry replay count=%d want 1", items[0].Interposition.WebsocketTrace.RetryReplayCount)
	}
}

func TestCompatibilityResponsesWebSocketFingerprintIncludesBodyHash(t *testing.T) {
	requestsRoot := t.TempDir()
	opts := DefaultLaunchOptions()
	opts.Mode = modeLive
	opts.RuntimeLocalPort = 18080
	opts.GatewayLocalPort = 18765
	opts.InterpositionEnabled = true

	var upstreamHits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit := upstreamHits.Add(1)
		conn, err := gatewayWebsocketUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade upstream websocket: %v", err)
		}
		defer conn.Close()
		_, message, err := conn.ReadMessage()
		if err != nil {
			t.Fatalf("read upstream websocket message: %v", err)
		}
		if err := conn.WriteJSON(map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":          "resp_epydios_bodyhash",
				"status":      "completed",
				"output_text": string(message) + ":" + string(rune('0'+hit)),
			},
		}); err != nil {
			t.Fatalf("write upstream websocket completion: %v", err)
		}
	}))
	defer upstream.Close()
	opts.InterpositionUpstreamBaseURL = upstream.URL

	state := &gatewayServiceState{
		record: GatewayServiceRecord{
			State:        gatewayStateRunning,
			Health:       gatewayHealthHealthy,
			BaseURL:      "http://127.0.0.1:18765",
			TokenPath:    filepath.Join(requestsRoot, "gateway-token"),
			RequestsRoot: requestsRoot,
		},
		token: "test-token",
		opts:  opts,
		createRunHook: func(_ context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
			return &runtimeapi.RunRecord{
				RunID:          "run-responses-ws-bodyhash",
				RequestID:      req.Meta.RequestID,
				Status:         runtimeapi.RunStatusPending,
				PolicyDecision: "ALLOW",
			}, http.StatusCreated, nil
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/responses", state.handleCompatibilityResponsesWebSocket)
	gatewayServer := httptest.NewServer(mux)
	defer gatewayServer.Close()

	gatewayWSURL := strings.Replace(gatewayServer.URL, "http://", "ws://", 1) + "/responses"
	clientHeaders := http.Header{}
	clientHeaders.Set("Authorization", "Bearer codex-chatgpt-token")
	clientHeaders.Set("Originator", "Codex Desktop")
	clientHeaders.Set("Chatgpt-Account-Id", "acct-demo")
	clientHeaders.Set("Session_id", "codex-session-demo")
	clientHeaders.Set("X-Client-Request-Id", "client-req-shared")

	send := func(input string) {
		clientConn, _, err := websocket.DefaultDialer.Dial(gatewayWSURL, clientHeaders)
		if err != nil {
			t.Fatalf("dial gateway websocket: %v", err)
		}
		defer clientConn.Close()
		firstFrame := map[string]interface{}{
			"type":  "response.create",
			"model": "gpt-5.4",
			"input": input,
		}
		if err := clientConn.WriteJSON(firstFrame); err != nil {
			t.Fatalf("write gateway websocket request: %v", err)
		}
		if _, _, err := clientConn.ReadMessage(); err != nil {
			t.Fatalf("read gateway websocket response: %v", err)
		}
	}

	send("prewarm")
	waitForSingleGatewayRequestRecordState(t, requestsRoot, "completed")
	send("real request")

	if got := upstreamHits.Load(); got != 2 {
		t.Fatalf("upstream hits=%d want 2", got)
	}
	items, err := listGatewayRequestRecords(requestsRoot)
	if err != nil {
		t.Fatalf("list gateway request records: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("request record count=%d want 2", len(items))
	}
	if items[0].Interposition.Upstream.BodySHA256 == items[1].Interposition.Upstream.BodySHA256 {
		t.Fatal("expected distinct body hashes for distinct websocket requests")
	}
}

func waitForSingleGatewayRequestRecordState(t *testing.T, root string, wantState string) gatewayRequestRecord {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	var last gatewayRequestRecord
	var lastFound bool
	for time.Now().Before(deadline) {
		entries, err := os.ReadDir(root)
		if err == nil {
			for _, entry := range entries {
				if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
					continue
				}
				record, readErr := readGatewayRequestRecord(root, strings.TrimSuffix(entry.Name(), ".json"))
				if readErr != nil {
					continue
				}
				last = record
				lastFound = true
				if strings.EqualFold(strings.TrimSpace(record.Result.State), wantState) {
					return record
				}
			}
		}
		time.Sleep(25 * time.Millisecond)
	}
	if !lastFound {
		t.Fatalf("expected persisted gateway request record under %s", root)
	}
	t.Fatalf("gateway request state=%q want %q", last.Result.State, wantState)
	return gatewayRequestRecord{}
}

func TestGatewayRejectsMissingTokenAndInput(t *testing.T) {
	state := &gatewayServiceState{
		record: GatewayServiceRecord{BaseURL: "http://127.0.0.1:18765"},
		token:  "test-token",
		opts:   DefaultLaunchOptions(),
	}

	missingAuthReq := httptest.NewRequest(http.MethodPost, "/v1/governed-actions", strings.NewReader(`{}`))
	missingAuthRec := httptest.NewRecorder()
	state.handleGovernedActions(missingAuthRec, missingAuthReq)
	if missingAuthRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected missing auth to fail with 401, got %d", missingAuthRec.Code)
	}

	badInputReq := httptest.NewRequest(http.MethodPost, "/v1/governed-actions", strings.NewReader(`{
  "tenantId": "tenant-demo",
  "projectId": "project-payments",
  "environmentId": "env-stage",
  "actionType": "desktop.execute",
  "targetType": "terminal",
  "targetRef": "kubectl rollout restart deploy/payments"
}`))
	badInputReq.Header.Set("Authorization", "Bearer test-token")
	badInputReq.Header.Set("X-Epydios-Client-Id", "client-codex")
	badInputReq.Header.Set("X-Epydios-Client-Name", "Codex")
	badInputRec := httptest.NewRecorder()
	state.handleGovernedActions(badInputRec, badInputReq)
	if badInputRec.Code != http.StatusBadRequest {
		t.Fatalf("expected missing input to fail with 400, got %d body=%s", badInputRec.Code, badInputRec.Body.String())
	}
}

func TestListGatewayHoldRecordsSortsPendingFirstNewestFirst(t *testing.T) {
	root := t.TempDir()
	if err := writeGatewayHoldRecord(root, GatewayHoldRecord{
		InterpositionRequestID: "ixr-approved",
		GatewayRequestID:       "gateway-approved",
		RunID:                  "run-approved",
		ApprovalID:             "approval-approved",
		State:                  "approval_granted",
		CreatedAtUTC:           "2026-03-19T11:00:00Z",
		UpdatedAtUTC:           "2026-03-19T11:05:00Z",
	}); err != nil {
		t.Fatalf("write approved hold: %v", err)
	}
	if err := writeGatewayHoldRecord(root, GatewayHoldRecord{
		InterpositionRequestID: "ixr-old-pending",
		GatewayRequestID:       "gateway-old-pending",
		RunID:                  "run-old-pending",
		ApprovalID:             "approval-old-pending",
		State:                  "held_pending_approval",
		HoldStartedAtUTC:       "2026-03-19T11:10:00Z",
		CreatedAtUTC:           "2026-03-19T11:10:00Z",
		UpdatedAtUTC:           "2026-03-19T11:10:00Z",
	}); err != nil {
		t.Fatalf("write old pending hold: %v", err)
	}
	if err := writeGatewayHoldRecord(root, GatewayHoldRecord{
		InterpositionRequestID: "ixr-new-pending",
		GatewayRequestID:       "gateway-new-pending",
		RunID:                  "run-new-pending",
		ApprovalID:             "approval-new-pending",
		State:                  "held_pending_approval",
		HoldStartedAtUTC:       "2026-03-19T11:20:00Z",
		CreatedAtUTC:           "2026-03-19T11:20:00Z",
		UpdatedAtUTC:           "2026-03-19T11:20:00Z",
	}); err != nil {
		t.Fatalf("write new pending hold: %v", err)
	}

	items, err := ListGatewayHoldRecords(root)
	if err != nil {
		t.Fatalf("list hold records: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("len(items)=%d want 3", len(items))
	}
	if items[0].InterpositionRequestID != "ixr-new-pending" {
		t.Fatalf("items[0]=%q want ixr-new-pending", items[0].InterpositionRequestID)
	}
	if items[1].InterpositionRequestID != "ixr-old-pending" {
		t.Fatalf("items[1]=%q want ixr-old-pending", items[1].InterpositionRequestID)
	}
	if items[2].InterpositionRequestID != "ixr-approved" {
		t.Fatalf("items[2]=%q want ixr-approved", items[2].InterpositionRequestID)
	}
}

func TestResolveGatewayHoldRecordUpdatesHoldAndRequestState(t *testing.T) {
	requestsRoot := t.TempDir()
	holdsRoot := gatewayHoldRecordsRoot(requestsRoot)
	requestRecord := gatewayRequestRecord{
		GatewayRequestID: "gateway-20260319-001",
		Interposition: gatewayInterpositionEnvelope{
			InterpositionRequestID: "ixr-20260319-001",
			State:                  "held_pending_approval",
		},
		Result: gatewayGovernedActionResult{
			GatewayRequestID:       "gateway-20260319-001",
			InterpositionRequestID: "ixr-20260319-001",
			RunID:                  "run-20260319-001",
			ApprovalID:             "approval-20260319-001",
			State:                  "pending",
			InterpositionState:     "held_pending_approval",
			PolicyDecision:         "DEFER",
			ApprovalRequired:       true,
		},
	}
	if err := writeGatewayRequestRecord(requestsRoot, requestRecord); err != nil {
		t.Fatalf("write request record: %v", err)
	}
	if err := writeGatewayHoldRecord(holdsRoot, GatewayHoldRecord{
		InterpositionRequestID: "ixr-20260319-001",
		GatewayRequestID:       "gateway-20260319-001",
		RunID:                  "run-20260319-001",
		ApprovalID:             "approval-20260319-001",
		State:                  "held_pending_approval",
		HoldStartedAtUTC:       "2026-03-19T12:00:00Z",
		HoldDeadlineAtUTC:      "2026-03-19T12:15:00Z",
		CreatedAtUTC:           "2026-03-19T12:00:00Z",
		UpdatedAtUTC:           "2026-03-19T12:00:00Z",
	}); err != nil {
		t.Fatalf("write hold record: %v", err)
	}

	resolved, err := ResolveGatewayHoldRecord(holdsRoot, requestsRoot, "ixr-20260319-001", "APPROVE", "operator approved")
	if err != nil {
		t.Fatalf("resolve hold record: %v", err)
	}
	if resolved.State != "approval_granted" {
		t.Fatalf("resolved.State=%q want approval_granted", resolved.State)
	}
	if resolved.Decision != "APPROVE" {
		t.Fatalf("resolved.Decision=%q want APPROVE", resolved.Decision)
	}
	if resolved.ResolutionReason != "operator approved" {
		t.Fatalf("resolved.ResolutionReason=%q want operator approved", resolved.ResolutionReason)
	}
	if resolved.ResolvedAtUTC == "" {
		t.Fatalf("expected resolved timestamp to be set")
	}

	refreshedHold, err := readGatewayHoldRecord(holdsRoot, "ixr-20260319-001")
	if err != nil {
		t.Fatalf("read resolved hold: %v", err)
	}
	if refreshedHold.State != "approval_granted" {
		t.Fatalf("refreshedHold.State=%q want approval_granted", refreshedHold.State)
	}

	refreshedRequest, err := readGatewayRequestRecord(requestsRoot, "gateway-20260319-001")
	if err != nil {
		t.Fatalf("read refreshed request: %v", err)
	}
	if refreshedRequest.Interposition.State != "approval_granted" {
		t.Fatalf("interposition state=%q want approval_granted", refreshedRequest.Interposition.State)
	}
	if refreshedRequest.Result.InterpositionState != "approval_granted" {
		t.Fatalf("result interposition state=%q want approval_granted", refreshedRequest.Result.InterpositionState)
	}
	if refreshedRequest.Result.PolicyDecision != "ALLOW" {
		t.Fatalf("policyDecision=%q want ALLOW", refreshedRequest.Result.PolicyDecision)
	}
	if refreshedRequest.Result.ApprovalRequired {
		t.Fatalf("expected approvalRequired=false after resolution")
	}
}
