package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type approvalSeed struct {
	RunID                string
	Tier                 int
	PolicyDecision       string
	PolicyGrantPresent   bool
	Status               RunStatus
	ExpiresAt            *time.Time
	ErrorMessage         string
	TenantID             string
	ProjectID            string
	HumanApprovalGranted bool
}

func seedApprovalRun(t *testing.T, store *memoryRunStore, seed approvalSeed) {
	t.Helper()

	tenantID := seed.TenantID
	if tenantID == "" {
		tenantID = "tenant-a"
	}
	projectID := seed.ProjectID
	if projectID == "" {
		projectID = "project-a"
	}

	request := RunCreateRequest{
		Meta: ObjectMeta{
			RequestID:   "req-" + seed.RunID,
			TenantID:    tenantID,
			ProjectID:   projectID,
			Environment: "dev",
		},
		Subject: JSONObject{
			"type": "operator",
			"id":   "user-approval",
		},
		Action: JSONObject{
			"verb":   "desktop.step",
			"target": "approval-sandbox",
		},
		Desktop: &DesktopExecutionRequest{
			Enabled:                true,
			Tier:                   seed.Tier,
			TargetOS:               "linux",
			TargetExecutionProfile: "sandbox_vm_autonomous",
			RequestedCapabilities: []string{
				"observe.window_metadata",
				"actuate.window_focus",
				"verify.post_action_state",
			},
			RequiredVerifierIDs: []string{
				"V-M13-LNX-001",
				"V-M13-LNX-002",
				"V-M13-LNX-003",
			},
			Observer: JSONObject{
				"mode": "snapshot",
			},
			Actuation: JSONObject{
				"type":     "click",
				"selector": "#approve",
			},
			PostAction: JSONObject{
				"verify": "post_action_state",
			},
			HumanApprovalGranted: seed.HumanApprovalGranted,
		},
	}
	payload, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request payload: %v", err)
	}

	createdAt := time.Now().UTC().Add(-5 * time.Minute)
	updatedAt := createdAt.Add(2 * time.Minute)
	run := &RunRecord{
		RunID:                   seed.RunID,
		RequestID:               request.Meta.RequestID,
		TenantID:                tenantID,
		ProjectID:               projectID,
		Environment:             "dev",
		Status:                  seed.Status,
		PolicyDecision:          seed.PolicyDecision,
		PolicyGrantTokenPresent: seed.PolicyGrantPresent,
		RequestPayload:          payload,
		CreatedAt:               createdAt,
		UpdatedAt:               updatedAt,
		ErrorMessage:            seed.ErrorMessage,
	}
	if seed.PolicyGrantPresent {
		run.PolicyGrantTokenSHA256 = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	}
	if seed.ExpiresAt != nil {
		exp := seed.ExpiresAt.UTC()
		run.ExpiresAt = &exp
	}

	if err := store.UpsertRun(context.Background(), run); err != nil {
		t.Fatalf("seed run %s: %v", seed.RunID, err)
	}
}

func requestJSON(t *testing.T, handler http.Handler, method, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

func decodeResponseBody(t *testing.T, rr *httptest.ResponseRecorder, out interface{}) {
	t.Helper()
	if err := json.Unmarshal(rr.Body.Bytes(), out); err != nil {
		t.Fatalf("decode response body: %v body=%s", err, rr.Body.String())
	}
}

func TestRuntimeApprovalQueueEndpoint(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	expiredAt := time.Now().UTC().Add(-2 * time.Minute)
	seedApprovalRun(t, store, approvalSeed{RunID: "run-pending", Tier: 3, PolicyDecision: "ALLOW", PolicyGrantPresent: false, Status: RunStatusFailed})
	seedApprovalRun(t, store, approvalSeed{RunID: "run-approved", Tier: 3, PolicyDecision: "ALLOW", PolicyGrantPresent: true, Status: RunStatusPolicyEvaluated})
	seedApprovalRun(t, store, approvalSeed{RunID: "run-denied", Tier: 3, PolicyDecision: "DENY", PolicyGrantPresent: false, Status: RunStatusFailed, ErrorMessage: "policy denied"})
	seedApprovalRun(t, store, approvalSeed{RunID: "run-expired", Tier: 3, PolicyDecision: "ALLOW", PolicyGrantPresent: false, Status: RunStatusFailed, ExpiresAt: &expiredAt})
	seedApprovalRun(t, store, approvalSeed{RunID: "run-tier2", Tier: 2, PolicyDecision: "ALLOW", PolicyGrantPresent: false, Status: RunStatusPolicyEvaluated})

	rr := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/approvals?limit=10", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("GET approvals status=%d body=%s", rr.Code, rr.Body.String())
	}

	var resp struct {
		Count int              `json:"count"`
		Items []ApprovalRecord `json:"items"`
	}
	decodeResponseBody(t, rr, &resp)
	if resp.Count != 4 {
		t.Fatalf("approval count=%d, want 4", resp.Count)
	}

	statusByRun := map[string]ApprovalStatus{}
	for _, item := range resp.Items {
		statusByRun[item.RunID] = item.Status
	}
	if statusByRun["run-pending"] != ApprovalStatusPending {
		t.Fatalf("run-pending status=%q, want %q", statusByRun["run-pending"], ApprovalStatusPending)
	}
	if statusByRun["run-approved"] != ApprovalStatusApproved {
		t.Fatalf("run-approved status=%q, want %q", statusByRun["run-approved"], ApprovalStatusApproved)
	}
	if statusByRun["run-denied"] != ApprovalStatusDenied {
		t.Fatalf("run-denied status=%q, want %q", statusByRun["run-denied"], ApprovalStatusDenied)
	}
	if statusByRun["run-expired"] != ApprovalStatusExpired {
		t.Fatalf("run-expired status=%q, want %q", statusByRun["run-expired"], ApprovalStatusExpired)
	}
	if _, exists := statusByRun["run-tier2"]; exists {
		t.Fatalf("tier-2 run must not appear in approval queue")
	}

	filtered := requestJSON(t, handler, http.MethodGet, "/v1alpha1/runtime/approvals?limit=10&status=PENDING", nil)
	if filtered.Code != http.StatusOK {
		t.Fatalf("GET approvals status filter code=%d body=%s", filtered.Code, filtered.Body.String())
	}
	var filteredResp struct {
		Count int              `json:"count"`
		Items []ApprovalRecord `json:"items"`
	}
	decodeResponseBody(t, filtered, &filteredResp)
	if filteredResp.Count != 1 || filteredResp.Items[0].RunID != "run-pending" {
		t.Fatalf("pending filter mismatch: %#v", filteredResp.Items)
	}
}

func TestRuntimeApprovalDecisionApprove(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	seedApprovalRun(t, store, approvalSeed{
		RunID:              "run-approve",
		Tier:               3,
		PolicyDecision:     "ALLOW",
		PolicyGrantPresent: false,
		Status:             RunStatusFailed,
		ErrorMessage:       "desktop.tier 3 requires desktop.humanApprovalGranted=true",
	})

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/approvals/run-approve/decision", map[string]interface{}{
		"decision":   "APPROVE",
		"reason":     "manual approval",
		"ttlSeconds": 1200,
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST approval approve code=%d body=%s", rr.Code, rr.Body.String())
	}

	var decisionResp ApprovalDecisionResponse
	decodeResponseBody(t, rr, &decisionResp)
	if !decisionResp.Applied {
		t.Fatalf("expected applied=true response: %#v", decisionResp)
	}
	if decisionResp.Status != ApprovalStatusApproved {
		t.Fatalf("decision status=%q, want %q", decisionResp.Status, ApprovalStatusApproved)
	}

	run, err := store.GetRun(context.Background(), "run-approve")
	if err != nil {
		t.Fatalf("get run after approve: %v", err)
	}
	if !run.PolicyGrantTokenPresent {
		t.Fatalf("expected policyGrantTokenPresent=true after approval")
	}
	if !strings.HasPrefix(run.PolicyGrantTokenSHA256, "sha256:") {
		t.Fatalf("expected sha256 grant hash, got %q", run.PolicyGrantTokenSHA256)
	}
	if strings.ToUpper(run.PolicyDecision) != "ALLOW" {
		t.Fatalf("expected policyDecision=ALLOW, got %q", run.PolicyDecision)
	}
	if run.Status != RunStatusPolicyEvaluated {
		t.Fatalf("expected status=%s after approve, got %s", RunStatusPolicyEvaluated, run.Status)
	}

	var payloadReq RunCreateRequest
	if err := json.Unmarshal(run.RequestPayload, &payloadReq); err != nil {
		t.Fatalf("decode updated request payload: %v", err)
	}
	if payloadReq.Desktop == nil || !payloadReq.Desktop.HumanApprovalGranted {
		t.Fatalf("expected desktop.humanApprovalGranted=true after approve")
	}
}

func TestRuntimeApprovalDecisionDeny(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	seedApprovalRun(t, store, approvalSeed{
		RunID:              "run-deny",
		Tier:               3,
		PolicyDecision:     "ALLOW",
		PolicyGrantPresent: false,
		Status:             RunStatusFailed,
	})

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/approvals/run-deny/decision", map[string]interface{}{
		"decision": "DENY",
		"reason":   "manual deny",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("POST approval deny code=%d body=%s", rr.Code, rr.Body.String())
	}

	var decisionResp ApprovalDecisionResponse
	decodeResponseBody(t, rr, &decisionResp)
	if !decisionResp.Applied {
		t.Fatalf("expected applied=true response: %#v", decisionResp)
	}
	if decisionResp.Status != ApprovalStatusDenied {
		t.Fatalf("decision status=%q, want %q", decisionResp.Status, ApprovalStatusDenied)
	}

	run, err := store.GetRun(context.Background(), "run-deny")
	if err != nil {
		t.Fatalf("get run after deny: %v", err)
	}
	if strings.ToUpper(run.PolicyDecision) != "DENY" {
		t.Fatalf("expected policyDecision=DENY, got %q", run.PolicyDecision)
	}
	if run.PolicyGrantTokenPresent {
		t.Fatalf("expected policyGrantTokenPresent=false after deny")
	}
	if run.Status != RunStatusFailed {
		t.Fatalf("expected status=%s after deny, got %s", RunStatusFailed, run.Status)
	}
	if run.ErrorMessage != "manual deny" {
		t.Fatalf("expected error message to persist deny reason, got %q", run.ErrorMessage)
	}
}

func TestRuntimeApprovalDecisionExpiredRejected(t *testing.T) {
	store := newMemoryRunStore()
	server := NewAPIServer(store, nil, nil)
	handler := server.Routes()

	expiredAt := time.Now().UTC().Add(-1 * time.Minute)
	seedApprovalRun(t, store, approvalSeed{
		RunID:              "run-expired-deny",
		Tier:               3,
		PolicyDecision:     "ALLOW",
		PolicyGrantPresent: false,
		Status:             RunStatusFailed,
		ExpiresAt:          &expiredAt,
	})

	rr := requestJSON(t, handler, http.MethodPost, "/v1alpha1/runtime/approvals/run-expired-deny/decision", map[string]interface{}{
		"decision": "APPROVE",
	})
	if rr.Code != http.StatusConflict {
		t.Fatalf("expired approval decision code=%d body=%s", rr.Code, rr.Body.String())
	}

	var apiErr APIError
	decodeResponseBody(t, rr, &apiErr)
	if apiErr.ErrorCode != "APPROVAL_EXPIRED" {
		t.Fatalf("errorCode=%q, want APPROVAL_EXPIRED", apiErr.ErrorCode)
	}
}
