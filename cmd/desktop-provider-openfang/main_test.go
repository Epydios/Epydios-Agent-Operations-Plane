package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestApplyDefaults(t *testing.T) {
	var cfg Config
	applyDefaults(&cfg)

	if cfg.ProviderID != "oss-desktop-openfang-linux" {
		t.Fatalf("unexpected provider id: %s", cfg.ProviderID)
	}
	if cfg.TargetOS != "linux" {
		t.Fatalf("unexpected target os: %s", cfg.TargetOS)
	}
	if cfg.Upstream.TimeoutSeconds != 10 {
		t.Fatalf("unexpected timeout: %d", cfg.Upstream.TimeoutSeconds)
	}
	if cfg.Upstream.ObservePath == "" || cfg.Upstream.ActuatePath == "" || cfg.Upstream.VerifyPath == "" {
		t.Fatalf("expected default upstream paths")
	}
}

func TestApplyDefaultsPreservesConfiguredTargetOS(t *testing.T) {
	cfg := Config{TargetOS: "windows", ProviderID: "oss-desktop-openfang-windows"}
	applyDefaults(&cfg)

	if cfg.TargetOS != "windows" {
		t.Fatalf("targetOS = %q, want windows", cfg.TargetOS)
	}
	if cfg.ProviderID != "oss-desktop-openfang-windows" {
		t.Fatalf("providerID = %q, want oss-desktop-openfang-windows", cfg.ProviderID)
	}
}

func TestValidateInboundConfigAllowsNoTLSFallback(t *testing.T) {
	cfg := Config{}
	applyDefaults(&cfg)
	if inboundTLSEnabled(cfg) {
		t.Fatalf("expected inbound TLS to be disabled with empty cert/key")
	}
	if err := validateInboundConfig(cfg); err != nil {
		t.Fatalf("validateInboundConfig() error = %v, want nil", err)
	}
}

func TestValidateInboundConfigRejectsPartialTLSMaterial(t *testing.T) {
	cfg := Config{
		TLSCertFile: "/tmp/fake-cert.pem",
	}
	applyDefaults(&cfg)
	err := validateInboundConfig(cfg)
	if err == nil {
		t.Fatalf("expected validation error")
	}
	if !strings.Contains(err.Error(), "tlsCertFile and tlsKeyFile must both be set") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateInboundConfigRejectsClientCertModeWithoutClientCA(t *testing.T) {
	cfg := Config{
		TLSCertFile:       "/tmp/fake-cert.pem",
		TLSKeyFile:        "/tmp/fake-key.pem",
		RequireClientCert: true,
	}
	applyDefaults(&cfg)
	err := validateInboundConfig(cfg)
	if err == nil {
		t.Fatalf("expected validation error")
	}
	if !strings.Contains(err.Error(), "clientCAFile is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHandleCapabilitiesBearerRequiredDeniedWithoutToken(t *testing.T) {
	cfg := Config{
		TargetOS:        "linux",
		RequireBearer:   true,
		BearerTokenFile: "/tmp/token",
	}
	applyDefaults(&cfg)
	s := &server{
		cfg:           cfg,
		requireBearer: true,
		bearerToken:   "expected-token",
	}

	req := httptest.NewRequest(http.MethodGet, "/v1alpha1/capabilities", nil)
	rec := httptest.NewRecorder()
	s.handleCapabilities(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want 401", rec.Code)
	}
	var resp ProviderError
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v (body=%s)", err, rec.Body.String())
	}
	if resp.ErrorCode != "UNAUTHORIZED" {
		t.Fatalf("errorCode=%s, want UNAUTHORIZED", resp.ErrorCode)
	}
}

func TestHandleCapabilitiesBearerRequiredAllowsValidToken(t *testing.T) {
	cfg := Config{
		TargetOS:        "linux",
		RequireBearer:   true,
		BearerTokenFile: "/tmp/token",
	}
	applyDefaults(&cfg)
	s := &server{
		cfg:           cfg,
		requireBearer: true,
		bearerToken:   "expected-token",
	}

	req := httptest.NewRequest(http.MethodGet, "/v1alpha1/capabilities", nil)
	req.Header.Set("Authorization", "Bearer expected-token")
	rec := httptest.NewRecorder()
	s.handleCapabilities(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200", rec.Code)
	}
}

func TestEvaluateStepRestrictedHostBlockedByDefault(t *testing.T) {
	cfg := Config{TargetOS: "linux"}
	applyDefaults(&cfg)
	s := &server{cfg: cfg}

	step := validStep("restricted_host", []string{"actuate.window_focus"}, []string{"V-M13-LNX-002"})
	deny, ok := s.evaluateStep(step)
	if !ok {
		t.Fatalf("expected deny")
	}
	if deny.ReasonCode != "restricted_host_blocked" {
		t.Fatalf("unexpected reason code: %s", deny.ReasonCode)
	}
}

func TestEvaluateStepRestrictedHostAllowedWhenConfigured(t *testing.T) {
	cfg := Config{TargetOS: "linux", AllowRestrictedHost: true}
	applyDefaults(&cfg)
	s := &server{cfg: cfg}

	step := validStep("restricted_host", []string{"actuate.window_focus"}, []string{"V-M13-LNX-002"})
	_, ok := s.evaluateStep(step)
	if ok {
		t.Fatalf("expected step to pass restricted host check when enabled")
	}
}

func TestEvaluateStepRejectsWindowsTargetOnLinuxAdapter(t *testing.T) {
	cfg := Config{TargetOS: "linux"}
	applyDefaults(&cfg)
	s := &server{cfg: cfg}

	step := validStep("sandbox_vm_autonomous", []string{"observe.window_metadata"}, []string{"V-M14-WIN-001"})
	step.TargetOS = "windows"
	deny, ok := s.evaluateStep(step)
	if !ok {
		t.Fatalf("expected deny")
	}
	if deny.ReasonCode != "capability_not_granted" {
		t.Fatalf("unexpected reason code: %s", deny.ReasonCode)
	}
	if !strings.Contains(deny.ReasonMessage, "targetOS=windows") {
		t.Fatalf("unexpected reason message: %s", deny.ReasonMessage)
	}
}

func TestEvaluateStepRejectsMacOSTargetOnLinuxAdapter(t *testing.T) {
	cfg := Config{TargetOS: "linux"}
	applyDefaults(&cfg)
	s := &server{cfg: cfg}

	step := validStep("sandbox_vm_autonomous", []string{"observe.window_metadata"}, []string{"V-M14-MAC-001"})
	step.TargetOS = "macos"
	deny, ok := s.evaluateStep(step)
	if !ok {
		t.Fatalf("expected deny")
	}
	if deny.ReasonCode != "capability_not_granted" {
		t.Fatalf("unexpected reason code: %s", deny.ReasonCode)
	}
	if !strings.Contains(deny.ReasonMessage, "targetOS=macos") {
		t.Fatalf("unexpected reason message: %s", deny.ReasonMessage)
	}
}

func TestEvaluateStepAllowsWindowsTargetOnWindowsAdapter(t *testing.T) {
	cfg := Config{TargetOS: "windows", ProviderID: "oss-desktop-openfang-windows"}
	applyDefaults(&cfg)
	s := &server{cfg: cfg}

	step := validStep("sandbox_vm_autonomous", []string{"observe.window_metadata"}, []string{"V-M14-WIN-001"})
	step.TargetOS = "windows"
	if _, denied := s.evaluateStep(step); denied {
		t.Fatalf("expected windows step to be allowed on windows adapter")
	}
}

func TestEvaluateStepAllowsMacOSTargetOnMacOSAdapter(t *testing.T) {
	cfg := Config{TargetOS: "macos", ProviderID: "oss-desktop-openfang-macos"}
	applyDefaults(&cfg)
	s := &server{cfg: cfg}

	step := validStep("sandbox_vm_autonomous", []string{"observe.window_metadata"}, []string{"V-M14-MAC-001"})
	step.TargetOS = "macos"
	if _, denied := s.evaluateStep(step); denied {
		t.Fatalf("expected macOS step to be allowed on macOS adapter")
	}
}

func TestHandleObserveUpstreamNotConfigured(t *testing.T) {
	cfg := Config{TargetOS: "linux"}
	applyDefaults(&cfg)
	s := &server{cfg: cfg}

	payload := `{
	  "meta": {"requestId":"req-1","timestamp":"2026-03-04T00:00:00Z"},
	  "step": {
	    "runId":"run-1",
	    "stepId":"step-1",
	    "targetOS":"linux",
	    "targetExecutionProfile":"sandbox_vm_autonomous",
	    "requestedCapabilities":["observe.window_metadata"],
	    "verifierPolicy":{"requiredVerifierIds":["V-M13-LNX-001"]}
	  },
	  "observer": {"mode":"snapshot"}
	}`

	req := httptest.NewRequest(http.MethodPost, "/v1alpha1/desktop-provider/observe", strings.NewReader(payload))
	rec := httptest.NewRecorder()
	s.handleObserve(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp DesktopObserveResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Decision != "DENY" || resp.ReasonCode != "upstream_not_configured" {
		t.Fatalf("unexpected response: decision=%s reason=%s", resp.Decision, resp.ReasonCode)
	}
	if !strings.HasPrefix(resp.EvidenceBundle.ScreenshotHash, "sha256:") {
		t.Fatalf("expected evidence hash, got %s", resp.EvidenceBundle.ScreenshotHash)
	}
}

func TestHandleActuateNoAction(t *testing.T) {
	cfg := Config{TargetOS: "linux"}
	applyDefaults(&cfg)
	s := &server{cfg: cfg}

	payload := `{
	  "meta": {"requestId":"req-1","timestamp":"2026-03-04T00:00:00Z"},
	  "step": {
	    "runId":"run-1",
	    "stepId":"step-1",
	    "targetOS":"linux",
	    "targetExecutionProfile":"sandbox_vm_autonomous",
	    "requestedCapabilities":["actuate.window_focus"],
	    "verifierPolicy":{"requiredVerifierIds":["V-M13-LNX-002"]}
	  },
	  "action": {}
	}`

	req := httptest.NewRequest(http.MethodPost, "/v1alpha1/desktop-provider/actuate", strings.NewReader(payload))
	rec := httptest.NewRecorder()
	s.handleActuate(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp DesktopActuateResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.Decision != "DENY" || resp.ReasonCode != "no_action" {
		t.Fatalf("unexpected response: decision=%s reason=%s", resp.Decision, resp.ReasonCode)
	}
}

func TestAdapterObserveActuateVerifyWithMockUpstream(t *testing.T) {
	var observeCalls int32
	var actuateCalls int32
	var verifyCalls int32

	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.Path {
		case "/v1alpha1/desktop-provider/observe":
			atomic.AddInt32(&observeCalls, 1)
			return jsonHTTPResponse(http.StatusOK, DesktopObserveResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:   "ALLOW",
					VerifierID: "V-M13-LNX-001",
					ReasonCode: "ok",
				},
				EvidenceBundle: evidenceBundleFor(validStep("sandbox_vm_autonomous", []string{"observe.window_metadata"}, []string{"V-M13-LNX-001"}), "observe", "observed"),
			}), nil
		case "/v1alpha1/desktop-provider/actuate":
			atomic.AddInt32(&actuateCalls, 1)
			bundle := evidenceBundleFor(validStep("sandbox_vm_autonomous", []string{"actuate.window_focus"}, []string{"V-M13-LNX-002"}), "actuate", "ok")
			return jsonHTTPResponse(http.StatusOK, DesktopActuateResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:   "ALLOW",
					VerifierID: "V-M13-LNX-002",
					ReasonCode: "ok",
				},
				EvidenceBundle: &bundle,
			}), nil
		case "/v1alpha1/desktop-provider/verify":
			atomic.AddInt32(&verifyCalls, 1)
			return jsonHTTPResponse(http.StatusOK, DesktopVerifyResponse{
				DesktopDecisionResponse: DesktopDecisionResponse{
					Decision:   "ALLOW",
					VerifierID: "V-M13-LNX-003",
					ReasonCode: "ok",
				},
				EvidenceBundle: evidenceBundleFor(validStep("sandbox_vm_autonomous", []string{"verify.post_action_state"}, []string{"V-M13-LNX-003"}), "verify", "verified"),
			}), nil
		default:
			return textHTTPResponse(http.StatusNotFound, "not found"), nil
		}
	})

	cfg := Config{
		TargetOS: "linux",
		Upstream: UpstreamConfig{
			Enabled: true,
			BaseURL: "https://openfang-provider.epydios.local",
		},
	}
	_, handler := newAdapterHandler(t, cfg, transport)

	observeReq := DesktopObserveRequest{
		Meta: ObjectMeta{RequestID: "req-1", Timestamp: "2026-03-04T00:00:00Z"},
		Step: validStep("sandbox_vm_autonomous", []string{"observe.window_metadata"}, []string{"V-M13-LNX-001"}),
		Observer: JSONObject{
			"mode": "snapshot",
		},
	}
	var observeResp DesktopObserveResponse
	status := invokeJSON(t, handler, "/v1alpha1/desktop-provider/observe", observeReq, &observeResp)
	if status != http.StatusOK {
		t.Fatalf("observe status=%d, want 200", status)
	}
	if observeResp.Decision != "ALLOW" || observeResp.ReasonCode != "ok" {
		t.Fatalf("observe decision=%s reason=%s", observeResp.Decision, observeResp.ReasonCode)
	}

	actuateReq := DesktopActuateRequest{
		Meta: ObjectMeta{RequestID: "req-1", Timestamp: "2026-03-04T00:00:00Z"},
		Step: validStep("sandbox_vm_autonomous", []string{"actuate.window_focus"}, []string{"V-M13-LNX-002"}),
		Action: JSONObject{
			"type": "click",
		},
	}
	var actuateResp DesktopActuateResponse
	status = invokeJSON(t, handler, "/v1alpha1/desktop-provider/actuate", actuateReq, &actuateResp)
	if status != http.StatusOK {
		t.Fatalf("actuate status=%d, want 200", status)
	}
	if actuateResp.Decision != "ALLOW" || actuateResp.ReasonCode != "ok" {
		t.Fatalf("actuate decision=%s reason=%s", actuateResp.Decision, actuateResp.ReasonCode)
	}

	verifyReq := DesktopVerifyRequest{
		Meta: ObjectMeta{RequestID: "req-1", Timestamp: "2026-03-04T00:00:00Z"},
		Step: validStep("sandbox_vm_autonomous", []string{"verify.post_action_state"}, []string{"V-M13-LNX-003"}),
		PostAction: JSONObject{
			"verify": "post_action_state",
		},
	}
	var verifyResp DesktopVerifyResponse
	status = invokeJSON(t, handler, "/v1alpha1/desktop-provider/verify", verifyReq, &verifyResp)
	if status != http.StatusOK {
		t.Fatalf("verify status=%d, want 200", status)
	}
	if verifyResp.Decision != "ALLOW" || verifyResp.ReasonCode != "ok" {
		t.Fatalf("verify decision=%s reason=%s", verifyResp.Decision, verifyResp.ReasonCode)
	}

	if atomic.LoadInt32(&observeCalls) != 1 {
		t.Fatalf("observe upstream call count=%d, want 1", observeCalls)
	}
	if atomic.LoadInt32(&actuateCalls) != 1 {
		t.Fatalf("actuate upstream call count=%d, want 1", actuateCalls)
	}
	if atomic.LoadInt32(&verifyCalls) != 1 {
		t.Fatalf("verify upstream call count=%d, want 1", verifyCalls)
	}
}

func TestAdapterRestrictedHostDeniedBeforeUpstreamCall(t *testing.T) {
	var observeCalls int32

	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/v1alpha1/desktop-provider/observe" {
			atomic.AddInt32(&observeCalls, 1)
		}
		return textHTTPResponse(http.StatusNotFound, "not found"), nil
	})

	cfg := Config{
		TargetOS: "linux",
		Upstream: UpstreamConfig{
			Enabled: true,
			BaseURL: "https://openfang-provider.epydios.local",
		},
	}
	_, handler := newAdapterHandler(t, cfg, transport)

	observeReq := DesktopObserveRequest{
		Meta: ObjectMeta{RequestID: "req-1", Timestamp: "2026-03-04T00:00:00Z"},
		Step: validStep("restricted_host", []string{"observe.window_metadata"}, []string{"V-M13-LNX-002"}),
		Observer: JSONObject{
			"mode": "snapshot",
		},
	}
	var observeResp DesktopObserveResponse
	status := invokeJSON(t, handler, "/v1alpha1/desktop-provider/observe", observeReq, &observeResp)
	if status != http.StatusOK {
		t.Fatalf("observe status=%d, want 200", status)
	}
	if observeResp.Decision != "DENY" || observeResp.ReasonCode != "restricted_host_blocked" {
		t.Fatalf("observe decision=%s reason=%s", observeResp.Decision, observeResp.ReasonCode)
	}
	if atomic.LoadInt32(&observeCalls) != 0 {
		t.Fatalf("observe upstream call count=%d, want 0", observeCalls)
	}
}

func TestHandleObserveUpstreamHTTP4xxMappedToRejected(t *testing.T) {
	testObserveErrorMapping(t, http.StatusBadRequest, "upstream_rejected")
}

func TestHandleObserveUpstreamHTTP5xxMappedToError(t *testing.T) {
	testObserveErrorMapping(t, http.StatusServiceUnavailable, "upstream_error")
}

func TestHandleObserveUpstreamTimeoutMappedToTimeout(t *testing.T) {
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return nil, context.DeadlineExceeded
	})

	cfg := Config{
		TargetOS: "linux",
		Upstream: UpstreamConfig{
			Enabled: true,
			BaseURL: "https://openfang-provider.epydios.local",
		},
	}
	_, handler := newAdapterHandler(t, cfg, transport)

	observeReq := DesktopObserveRequest{
		Meta: ObjectMeta{RequestID: "req-1", Timestamp: "2026-03-04T00:00:00Z"},
		Step: validStep("sandbox_vm_autonomous", []string{"observe.window_metadata"}, []string{"V-M13-LNX-001"}),
		Observer: JSONObject{
			"mode": "snapshot",
		},
	}
	var observeResp DesktopObserveResponse
	status := invokeJSON(t, handler, "/v1alpha1/desktop-provider/observe", observeReq, &observeResp)
	if status != http.StatusOK {
		t.Fatalf("observe status=%d, want 200", status)
	}
	if observeResp.ReasonCode != "upstream_timeout" {
		t.Fatalf("reason code=%s, want upstream_timeout", observeResp.ReasonCode)
	}
}

func testObserveErrorMapping(t *testing.T, upstreamStatus int, expectedReasonCode string) {
	t.Helper()
	transport := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return textHTTPResponse(upstreamStatus, "upstream failure"), nil
	})

	cfg := Config{
		TargetOS: "linux",
		Upstream: UpstreamConfig{
			Enabled: true,
			BaseURL: "https://openfang-provider.epydios.local",
		},
	}
	_, handler := newAdapterHandler(t, cfg, transport)

	observeReq := DesktopObserveRequest{
		Meta: ObjectMeta{RequestID: "req-1", Timestamp: "2026-03-04T00:00:00Z"},
		Step: validStep("sandbox_vm_autonomous", []string{"observe.window_metadata"}, []string{"V-M13-LNX-001"}),
		Observer: JSONObject{
			"mode": "snapshot",
		},
	}
	var observeResp DesktopObserveResponse
	status := invokeJSON(t, handler, "/v1alpha1/desktop-provider/observe", observeReq, &observeResp)
	if status != http.StatusOK {
		t.Fatalf("observe status=%d, want 200", status)
	}
	if observeResp.Decision != "DENY" {
		t.Fatalf("decision=%s, want DENY", observeResp.Decision)
	}
	if observeResp.ReasonCode != expectedReasonCode {
		t.Fatalf("reason code=%s, want %s", observeResp.ReasonCode, expectedReasonCode)
	}
}

func validStep(profile string, requestedCapabilities, requiredVerifierIDs []string) DesktopStepEnvelope {
	return DesktopStepEnvelope{
		RunID:                  "run-1",
		StepID:                 "step-1",
		TargetOS:               "linux",
		TargetExecutionProfile: profile,
		RequestedCapabilities:  requestedCapabilities,
		VerifierPolicy: DesktopVerifierPolicy{
			RequiredVerifierIDs: requiredVerifierIDs,
		},
	}
}

func newAdapterHandler(t *testing.T, cfg Config, rt http.RoundTripper) (*server, http.Handler) {
	t.Helper()
	applyDefaults(&cfg)
	client := &http.Client{Timeout: time.Duration(cfg.Upstream.TimeoutSeconds) * time.Second}
	if rt != nil {
		client.Transport = rt
	}
	s := &server{
		cfg:        cfg,
		httpClient: client,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/v1alpha1/desktop-provider/observe", s.handleObserve)
	mux.HandleFunc("/v1alpha1/desktop-provider/actuate", s.handleActuate)
	mux.HandleFunc("/v1alpha1/desktop-provider/verify", s.handleVerify)
	return s, mux
}

func invokeJSON(t *testing.T, handler http.Handler, path string, in interface{}, out interface{}) int {
	t.Helper()
	body, err := json.Marshal(in)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if out != nil {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("decode response: %v (body=%s)", err, rec.Body.String())
		}
	}
	return rec.Code
}

func jsonHTTPResponse(status int, payload interface{}) *http.Response {
	body, err := json.Marshal(payload)
	if err != nil {
		return textHTTPResponse(http.StatusInternalServerError, fmt.Sprintf("marshal payload: %v", err))
	}
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewReader(body)),
	}
}

func textHTTPResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}
