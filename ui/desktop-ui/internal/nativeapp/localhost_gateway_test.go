package nativeapp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

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
