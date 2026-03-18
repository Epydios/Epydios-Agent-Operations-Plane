package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type JSONObject map[string]interface{}

type UpstreamConfig struct {
	Enabled        bool              `json:"enabled"`
	BaseURL        string            `json:"baseUrl"`
	ObservePath    string            `json:"observePath"`
	ActuatePath    string            `json:"actuatePath"`
	VerifyPath     string            `json:"verifyPath"`
	HealthPath     string            `json:"healthPath"`
	TimeoutSeconds int               `json:"timeoutSeconds"`
	Headers        map[string]string `json:"headers,omitempty"`
}

type Config struct {
	ProviderID          string         `json:"providerId"`
	ProviderVersion     string         `json:"providerVersion"`
	TargetOS            string         `json:"targetOS"`
	AllowRestrictedHost bool           `json:"allowRestrictedHost"`
	Capabilities        []string       `json:"capabilities"`
	TLSCertFile         string         `json:"tlsCertFile,omitempty"`
	TLSKeyFile          string         `json:"tlsKeyFile,omitempty"`
	ClientCAFile        string         `json:"clientCAFile,omitempty"`
	RequireClientCert   bool           `json:"requireClientCert,omitempty"`
	RequireBearer       bool           `json:"requireBearer,omitempty"`
	BearerTokenFile     string         `json:"bearerTokenFile,omitempty"`
	Upstream            UpstreamConfig `json:"upstream"`
}

type ProviderCapabilitiesResponse struct {
	ProviderType    string                 `json:"providerType"`
	ProviderID      string                 `json:"providerId"`
	ContractVersion string                 `json:"contractVersion"`
	ProviderVersion string                 `json:"providerVersion,omitempty"`
	Capabilities    []string               `json:"capabilities"`
	Status          map[string]interface{} `json:"status,omitempty"`
}

type ProviderError struct {
	ErrorCode string                 `json:"errorCode"`
	Message   string                 `json:"message"`
	Retryable bool                   `json:"retryable"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

type ObjectMeta struct {
	RequestID string `json:"requestId"`
	Timestamp string `json:"timestamp"`
}

type DesktopVerifierPolicy struct {
	RequiredVerifierIDs []string `json:"requiredVerifierIds"`
}

type DesktopGrantEnvelope struct {
	CapabilityGrantToken string     `json:"capabilityGrantToken"`
	CapabilityScope      JSONObject `json:"capabilityScope,omitempty"`
	GrantExpiresAt       string     `json:"grantExpiresAt,omitempty"`
}

type DesktopStepEnvelope struct {
	RunID                  string                `json:"runId"`
	StepID                 string                `json:"stepId"`
	TargetOS               string                `json:"targetOS"`
	TargetExecutionProfile string                `json:"targetExecutionProfile"`
	RequestedCapabilities  []string              `json:"requestedCapabilities"`
	VerifierPolicy         DesktopVerifierPolicy `json:"verifierPolicy"`
	Grant                  *DesktopGrantEnvelope `json:"grant,omitempty"`
}

type DesktopEvidenceBundle struct {
	WindowMetadata JSONObject `json:"windowMetadata"`
	ScreenshotHash string     `json:"screenshotHash"`
	ResultCode     string     `json:"resultCode"`
	ScreenshotURI  string     `json:"screenshotUri,omitempty"`
}

type DesktopDecisionResponse struct {
	Decision             string   `json:"decision"`
	VerifierID           string   `json:"verifierId"`
	ReasonCode           string   `json:"reasonCode"`
	ReasonMessage        string   `json:"reasonMessage,omitempty"`
	ObservedCapabilities []string `json:"observedCapabilities,omitempty"`
}

type DesktopObserveRequest struct {
	Meta     ObjectMeta          `json:"meta"`
	Step     DesktopStepEnvelope `json:"step"`
	Observer JSONObject          `json:"observer"`
}

type DesktopObserveResponse struct {
	DesktopDecisionResponse
	EvidenceBundle DesktopEvidenceBundle `json:"evidenceBundle"`
}

type DesktopActuateRequest struct {
	Meta   ObjectMeta          `json:"meta"`
	Step   DesktopStepEnvelope `json:"step"`
	Action JSONObject          `json:"action"`
}

type DesktopActuateResponse struct {
	DesktopDecisionResponse
	EvidenceBundle *DesktopEvidenceBundle `json:"evidenceBundle,omitempty"`
}

type DesktopVerifyRequest struct {
	Meta       ObjectMeta          `json:"meta"`
	Step       DesktopStepEnvelope `json:"step"`
	PostAction JSONObject          `json:"postAction"`
}

type DesktopVerifyResponse struct {
	DesktopDecisionResponse
	EvidenceBundle DesktopEvidenceBundle `json:"evidenceBundle"`
}

type server struct {
	cfg               Config
	httpClient        *http.Client
	requireBearer     bool
	bearerToken       string
	requireClientCert bool
}

type upstreamErrorKind string

const (
	upstreamErrorKindUnavailable upstreamErrorKind = "unavailable"
	upstreamErrorKindTimeout     upstreamErrorKind = "timeout"
	upstreamErrorKindHTTP4xx     upstreamErrorKind = "http_4xx"
	upstreamErrorKindHTTP5xx     upstreamErrorKind = "http_5xx"
)

type upstreamCallError struct {
	Kind       upstreamErrorKind
	StatusCode int
	Message    string
}

func (e *upstreamCallError) Error() string {
	if e == nil {
		return ""
	}
	return strings.TrimSpace(e.Message)
}

func main() {
	var (
		listenAddr = flag.String("listen", ":8080", "HTTP listen address")
		configPath = flag.String("config", "provider-reference/desktop/openfang/config.example.json", "path to JSON config")
	)
	flag.Parse()

	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	applyDefaults(&cfg)
	if err := validateInboundConfig(cfg); err != nil {
		log.Fatalf("validate inbound config: %v", err)
	}

	bearerToken, err := loadBearerToken(cfg.RequireBearer, cfg.BearerTokenFile)
	if err != nil {
		log.Fatalf("load bearer token: %v", err)
	}

	s := &server{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.Upstream.TimeoutSeconds) * time.Second,
		},
		requireBearer:     cfg.RequireBearer,
		bearerToken:       bearerToken,
		requireClientCert: cfg.RequireClientCert,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/v1alpha1/capabilities", s.handleCapabilities)
	mux.HandleFunc("/v1alpha1/desktop-provider/observe", s.handleObserve)
	mux.HandleFunc("/v1alpha1/desktop-provider/actuate", s.handleActuate)
	mux.HandleFunc("/v1alpha1/desktop-provider/verify", s.handleVerify)

	httpServer := &http.Server{
		Addr:              *listenAddr,
		Handler:           loggingMiddleware(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	var listenErr error
	usingTLS := inboundTLSEnabled(cfg)
	if usingTLS {
		tlsCfg, err := buildInboundTLSConfig(cfg)
		if err != nil {
			log.Fatalf("build inbound TLS config: %v", err)
		}
		httpServer.TLSConfig = tlsCfg
	}

	log.Printf(
		"desktop provider (openfang adapter) listening on %s (providerId=%s targetOS=%s upstreamEnabled=%t allowRestrictedHost=%t inboundTLS=%t requireClientCert=%t requireBearer=%t)",
		*listenAddr,
		cfg.ProviderID,
		cfg.TargetOS,
		cfg.Upstream.Enabled,
		cfg.AllowRestrictedHost,
		usingTLS,
		cfg.RequireClientCert,
		cfg.RequireBearer,
	)
	if usingTLS {
		listenErr = httpServer.ListenAndServeTLS("", "")
	} else {
		listenErr = httpServer.ListenAndServe()
	}
	if listenErr != nil && !errors.Is(listenErr, http.ErrServerClosed) {
		log.Fatalf("listen: %v", listenErr)
	}
}

func loadConfig(path string) (Config, error) {
	var cfg Config
	b, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(b, &cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func applyDefaults(cfg *Config) {
	if strings.TrimSpace(cfg.ProviderID) == "" {
		cfg.ProviderID = "oss-desktop-openfang-linux"
	}
	if strings.TrimSpace(cfg.ProviderVersion) == "" {
		cfg.ProviderVersion = "0.3.0"
	}
	cfg.TargetOS = strings.ToLower(strings.TrimSpace(cfg.TargetOS))
	if cfg.TargetOS == "" {
		cfg.TargetOS = "linux"
	}
	if len(cfg.Capabilities) == 0 {
		cfg.Capabilities = []string{
			"observe.window_metadata",
			"observe.screenshot_hash",
			"actuate.window_focus",
			"actuate.input.type_click",
			"verify.post_action_state",
		}
	}
	if cfg.Upstream.TimeoutSeconds <= 0 {
		cfg.Upstream.TimeoutSeconds = 10
	}
	if strings.TrimSpace(cfg.Upstream.ObservePath) == "" {
		cfg.Upstream.ObservePath = "/v1alpha1/desktop-provider/observe"
	}
	if strings.TrimSpace(cfg.Upstream.ActuatePath) == "" {
		cfg.Upstream.ActuatePath = "/v1alpha1/desktop-provider/actuate"
	}
	if strings.TrimSpace(cfg.Upstream.VerifyPath) == "" {
		cfg.Upstream.VerifyPath = "/v1alpha1/desktop-provider/verify"
	}
	if strings.TrimSpace(cfg.Upstream.HealthPath) == "" {
		cfg.Upstream.HealthPath = "/healthz"
	}
	cfg.Upstream.BaseURL = strings.TrimSpace(strings.TrimRight(cfg.Upstream.BaseURL, "/"))
}

func inboundTLSEnabled(cfg Config) bool {
	return strings.TrimSpace(cfg.TLSCertFile) != "" && strings.TrimSpace(cfg.TLSKeyFile) != ""
}

func validateInboundConfig(cfg Config) error {
	tlsCert := strings.TrimSpace(cfg.TLSCertFile)
	tlsKey := strings.TrimSpace(cfg.TLSKeyFile)
	clientCA := strings.TrimSpace(cfg.ClientCAFile)
	bearerTokenFile := strings.TrimSpace(cfg.BearerTokenFile)

	if (tlsCert == "") != (tlsKey == "") {
		return fmt.Errorf("tlsCertFile and tlsKeyFile must both be set when enabling inbound TLS")
	}
	if cfg.RequireClientCert && (tlsCert == "" || tlsKey == "") {
		return fmt.Errorf("tlsCertFile and tlsKeyFile are required when requireClientCert=true")
	}
	if cfg.RequireClientCert && clientCA == "" {
		return fmt.Errorf("clientCAFile is required when requireClientCert=true")
	}
	if cfg.RequireBearer && bearerTokenFile == "" {
		return fmt.Errorf("bearerTokenFile is required when requireBearer=true")
	}
	return nil
}

func loadBearerToken(required bool, path string) (string, error) {
	if !required {
		return "", nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	token := strings.TrimSpace(string(raw))
	if token == "" {
		return "", fmt.Errorf("bearer token file %q is empty", path)
	}
	return token, nil
}

func buildInboundTLSConfig(cfg Config) (*tls.Config, error) {
	cert, err := tls.LoadX509KeyPair(cfg.TLSCertFile, cfg.TLSKeyFile)
	if err != nil {
		return nil, err
	}

	tlsCfg := &tls.Config{
		MinVersion:   tls.VersionTLS12,
		Certificates: []tls.Certificate{cert},
	}
	if !cfg.RequireClientCert {
		return tlsCfg, nil
	}

	caPEM, err := os.ReadFile(cfg.ClientCAFile)
	if err != nil {
		return nil, err
	}
	caPool := x509.NewCertPool()
	if ok := caPool.AppendCertsFromPEM(caPEM); !ok {
		return nil, fmt.Errorf("failed to parse client CA PEM from %q", cfg.ClientCAFile)
	}
	tlsCfg.ClientAuth = tls.RequireAndVerifyClientCert
	tlsCfg.ClientCAs = caPool
	return tlsCfg, nil
}

func (s *server) authorize(w http.ResponseWriter, r *http.Request) bool {
	if s.requireClientCert && (r.TLS == nil || len(r.TLS.PeerCertificates) == 0) {
		writeProviderError(w, http.StatusUnauthorized, "UNAUTHORIZED", "client certificate required", false, nil)
		return false
	}
	if !s.requireBearer {
		return true
	}
	got := strings.TrimSpace(r.Header.Get("Authorization"))
	want := "Bearer " + s.bearerToken
	if got != want {
		writeProviderError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid bearer token", false, nil)
		return false
	}
	return true
}

func (s *server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	if s.cfg.Upstream.Enabled {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := s.checkUpstreamHealth(ctx); err != nil {
			writeProviderError(
				w,
				http.StatusServiceUnavailable,
				"UPSTREAM_UNAVAILABLE",
				"upstream health check failed",
				true,
				map[string]interface{}{"error": err.Error()},
			)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	writeJSON(w, http.StatusOK, ProviderCapabilitiesResponse{
		ProviderType:    "DesktopProvider",
		ProviderID:      s.cfg.ProviderID,
		ContractVersion: "v1alpha1",
		ProviderVersion: s.cfg.ProviderVersion,
		Capabilities:    append([]string(nil), s.cfg.Capabilities...),
		Status: map[string]interface{}{
			"mode":                "openfang-adapter-linux",
			"targetOS":            s.cfg.TargetOS,
			"upstreamEnabled":     s.cfg.Upstream.Enabled,
			"allowRestrictedHost": s.cfg.AllowRestrictedHost,
		},
	})
}

func (s *server) handleObserve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}

	var req DesktopObserveRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		return
	}
	if err := validateMeta(req.Meta); err != nil {
		writeProviderError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), false, nil)
		return
	}
	if err := validateStepEnvelope(req.Step); err != nil {
		writeProviderError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), false, nil)
		return
	}
	if deny, ok := s.evaluateStep(req.Step); ok {
		writeJSON(w, http.StatusOK, DesktopObserveResponse{
			DesktopDecisionResponse: deny,
			EvidenceBundle:          evidenceBundleFor(req.Step, "observe", "denied"),
		})
		return
	}
	if !s.cfg.Upstream.Enabled {
		writeJSON(w, http.StatusOK, DesktopObserveResponse{
			DesktopDecisionResponse: DesktopDecisionResponse{
				Decision:      "DENY",
				VerifierID:    verifierForOperation("observe"),
				ReasonCode:    "upstream_not_configured",
				ReasonMessage: "upstream.enabled=false; Openfang endpoint is not configured",
			},
			EvidenceBundle: evidenceBundleFor(req.Step, "observe", "upstream_not_configured"),
		})
		return
	}

	resp, err := s.forwardObserve(r.Context(), req)
	if err != nil {
		deny := decisionForUpstreamError("observe", err)
		writeJSON(w, http.StatusOK, DesktopObserveResponse{
			DesktopDecisionResponse: deny,
			EvidenceBundle:          evidenceBundleFor(req.Step, "observe", "upstream_unavailable"),
		})
		return
	}

	normalizeDecision("observe", req.Step.RequestedCapabilities, &resp.DesktopDecisionResponse)
	if !evidenceComplete(resp.EvidenceBundle) {
		resp.EvidenceBundle = evidenceBundleFor(req.Step, "observe", "upstream_incomplete_evidence")
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleActuate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}

	var req DesktopActuateRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		return
	}
	if err := validateMeta(req.Meta); err != nil {
		writeProviderError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), false, nil)
		return
	}
	if err := validateStepEnvelope(req.Step); err != nil {
		writeProviderError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), false, nil)
		return
	}
	if deny, ok := s.evaluateStep(req.Step); ok {
		bundle := evidenceBundleFor(req.Step, "actuate", "denied")
		writeJSON(w, http.StatusOK, DesktopActuateResponse{
			DesktopDecisionResponse: deny,
			EvidenceBundle:          &bundle,
		})
		return
	}
	if len(req.Action) == 0 {
		bundle := evidenceBundleFor(req.Step, "actuate", "no_action")
		writeJSON(w, http.StatusOK, DesktopActuateResponse{
			DesktopDecisionResponse: DesktopDecisionResponse{
				Decision:      "DENY",
				VerifierID:    verifierForOperation("actuate"),
				ReasonCode:    "no_action",
				ReasonMessage: "action payload is required",
			},
			EvidenceBundle: &bundle,
		})
		return
	}
	if !s.cfg.Upstream.Enabled {
		bundle := evidenceBundleFor(req.Step, "actuate", "upstream_not_configured")
		writeJSON(w, http.StatusOK, DesktopActuateResponse{
			DesktopDecisionResponse: DesktopDecisionResponse{
				Decision:      "DENY",
				VerifierID:    verifierForOperation("actuate"),
				ReasonCode:    "upstream_not_configured",
				ReasonMessage: "upstream.enabled=false; Openfang endpoint is not configured",
			},
			EvidenceBundle: &bundle,
		})
		return
	}

	resp, err := s.forwardActuate(r.Context(), req)
	if err != nil {
		deny := decisionForUpstreamError("actuate", err)
		bundle := evidenceBundleFor(req.Step, "actuate", "upstream_unavailable")
		writeJSON(w, http.StatusOK, DesktopActuateResponse{
			DesktopDecisionResponse: deny,
			EvidenceBundle:          &bundle,
		})
		return
	}

	normalizeDecision("actuate", req.Step.RequestedCapabilities, &resp.DesktopDecisionResponse)
	if resp.EvidenceBundle != nil && !evidenceComplete(*resp.EvidenceBundle) {
		bundle := evidenceBundleFor(req.Step, "actuate", "upstream_incomplete_evidence")
		resp.EvidenceBundle = &bundle
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}

	var req DesktopVerifyRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		return
	}
	if err := validateMeta(req.Meta); err != nil {
		writeProviderError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), false, nil)
		return
	}
	if err := validateStepEnvelope(req.Step); err != nil {
		writeProviderError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), false, nil)
		return
	}
	if deny, ok := s.evaluateStep(req.Step); ok {
		deny.VerifierID = verifierForOperation("verify")
		writeJSON(w, http.StatusOK, DesktopVerifyResponse{
			DesktopDecisionResponse: deny,
			EvidenceBundle:          evidenceBundleFor(req.Step, "verify", "denied"),
		})
		return
	}
	if len(req.PostAction) == 0 {
		writeJSON(w, http.StatusOK, DesktopVerifyResponse{
			DesktopDecisionResponse: DesktopDecisionResponse{
				Decision:      "DENY",
				VerifierID:    verifierForOperation("verify"),
				ReasonCode:    "ambiguous_state",
				ReasonMessage: "postAction payload is required",
			},
			EvidenceBundle: evidenceBundleFor(req.Step, "verify", "ambiguous"),
		})
		return
	}
	if !s.cfg.Upstream.Enabled {
		writeJSON(w, http.StatusOK, DesktopVerifyResponse{
			DesktopDecisionResponse: DesktopDecisionResponse{
				Decision:      "DENY",
				VerifierID:    verifierForOperation("verify"),
				ReasonCode:    "upstream_not_configured",
				ReasonMessage: "upstream.enabled=false; Openfang endpoint is not configured",
			},
			EvidenceBundle: evidenceBundleFor(req.Step, "verify", "upstream_not_configured"),
		})
		return
	}

	resp, err := s.forwardVerify(r.Context(), req)
	if err != nil {
		deny := decisionForUpstreamError("verify", err)
		writeJSON(w, http.StatusOK, DesktopVerifyResponse{
			DesktopDecisionResponse: deny,
			EvidenceBundle:          evidenceBundleFor(req.Step, "verify", "upstream_unavailable"),
		})
		return
	}

	normalizeDecision("verify", req.Step.RequestedCapabilities, &resp.DesktopDecisionResponse)
	if !evidenceComplete(resp.EvidenceBundle) {
		resp.EvidenceBundle = evidenceBundleFor(req.Step, "verify", "upstream_incomplete_evidence")
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) evaluateStep(step DesktopStepEnvelope) (DesktopDecisionResponse, bool) {
	if strings.ToLower(strings.TrimSpace(step.TargetOS)) != s.cfg.TargetOS {
		return DesktopDecisionResponse{
			Decision:      "DENY",
			VerifierID:    verifierForOperation("actuate"),
			ReasonCode:    "capability_not_granted",
			ReasonMessage: fmt.Sprintf("targetOS=%s is not supported by provider targetOS=%s", step.TargetOS, s.cfg.TargetOS),
		}, true
	}

	profile := strings.ToLower(strings.TrimSpace(step.TargetExecutionProfile))
	switch profile {
	case "sandbox_vm_autonomous":
	case "restricted_host":
		if !s.cfg.AllowRestrictedHost {
			return DesktopDecisionResponse{
				Decision:      "DENY",
				VerifierID:    verifierForOperation("actuate"),
				ReasonCode:    "restricted_host_blocked",
				ReasonMessage: "restricted_host is blocked by provider policy; sandbox_vm_autonomous is required",
			}, true
		}
	default:
		return DesktopDecisionResponse{
			Decision:      "DENY",
			VerifierID:    verifierForOperation("actuate"),
			ReasonCode:    "invalid_profile",
			ReasonMessage: fmt.Sprintf("targetExecutionProfile=%s is invalid", step.TargetExecutionProfile),
		}, true
	}

	if len(step.VerifierPolicy.RequiredVerifierIDs) == 0 {
		return DesktopDecisionResponse{
			Decision:      "DENY",
			VerifierID:    verifierForOperation("actuate"),
			ReasonCode:    "no_policy",
			ReasonMessage: "verifierPolicy.requiredVerifierIds is required",
		}, true
	}
	if len(step.RequestedCapabilities) == 0 {
		return DesktopDecisionResponse{
			Decision:      "DENY",
			VerifierID:    verifierForOperation("actuate"),
			ReasonCode:    "no_action",
			ReasonMessage: "requestedCapabilities is required",
		}, true
	}
	return DesktopDecisionResponse{}, false
}

func (s *server) checkUpstreamHealth(ctx context.Context) error {
	if strings.TrimSpace(s.cfg.Upstream.BaseURL) == "" {
		return fmt.Errorf("upstream.baseUrl is required when upstream.enabled=true")
	}
	u, err := resolveURL(s.cfg.Upstream.BaseURL, s.cfg.Upstream.HealthPath)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	for k, v := range s.cfg.Upstream.Headers {
		if strings.TrimSpace(k) == "" {
			continue
		}
		req.Header.Set(k, v)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("upstream health status=%d", resp.StatusCode)
	}
	return nil
}

func (s *server) forwardObserve(ctx context.Context, req DesktopObserveRequest) (DesktopObserveResponse, error) {
	var out DesktopObserveResponse
	if err := s.forwardJSON(ctx, s.cfg.Upstream.ObservePath, req, &out); err != nil {
		return DesktopObserveResponse{}, err
	}
	return out, nil
}

func (s *server) forwardActuate(ctx context.Context, req DesktopActuateRequest) (DesktopActuateResponse, error) {
	var out DesktopActuateResponse
	if err := s.forwardJSON(ctx, s.cfg.Upstream.ActuatePath, req, &out); err != nil {
		return DesktopActuateResponse{}, err
	}
	return out, nil
}

func (s *server) forwardVerify(ctx context.Context, req DesktopVerifyRequest) (DesktopVerifyResponse, error) {
	var out DesktopVerifyResponse
	if err := s.forwardJSON(ctx, s.cfg.Upstream.VerifyPath, req, &out); err != nil {
		return DesktopVerifyResponse{}, err
	}
	return out, nil
}

func (s *server) forwardJSON(ctx context.Context, path string, in interface{}, out interface{}) error {
	if strings.TrimSpace(s.cfg.Upstream.BaseURL) == "" {
		return &upstreamCallError{
			Kind:    upstreamErrorKindUnavailable,
			Message: "upstream.baseUrl is required when upstream.enabled=true",
		}
	}
	u, err := resolveURL(s.cfg.Upstream.BaseURL, path)
	if err != nil {
		return &upstreamCallError{
			Kind:    upstreamErrorKindUnavailable,
			Message: err.Error(),
		}
	}

	payload, err := json.Marshal(in)
	if err != nil {
		return &upstreamCallError{
			Kind:    upstreamErrorKindUnavailable,
			Message: fmt.Sprintf("marshal upstream request: %v", err),
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(payload))
	if err != nil {
		return &upstreamCallError{
			Kind:    upstreamErrorKindUnavailable,
			Message: fmt.Sprintf("build upstream request: %v", err),
		}
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range s.cfg.Upstream.Headers {
		if strings.TrimSpace(k) == "" {
			continue
		}
		req.Header.Set(k, v)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return classifyUpstreamRequestError(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return &upstreamCallError{
			Kind:    upstreamErrorKindUnavailable,
			Message: fmt.Sprintf("read upstream response: %v", err),
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		kind := upstreamErrorKindUnavailable
		switch {
		case resp.StatusCode >= 400 && resp.StatusCode < 500:
			kind = upstreamErrorKindHTTP4xx
		case resp.StatusCode >= 500:
			kind = upstreamErrorKindHTTP5xx
		}
		return &upstreamCallError{
			Kind:       kind,
			StatusCode: resp.StatusCode,
			Message:    fmt.Sprintf("upstream status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body))),
		}
	}
	if err := json.Unmarshal(body, out); err != nil {
		return &upstreamCallError{
			Kind:    upstreamErrorKindUnavailable,
			Message: fmt.Sprintf("decode upstream response: %v", err),
		}
	}
	return nil
}

func classifyUpstreamRequestError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return &upstreamCallError{
			Kind:    upstreamErrorKindTimeout,
			Message: fmt.Sprintf("upstream timeout: %v", err),
		}
	}
	type timeoutError interface {
		Timeout() bool
	}
	var toErr timeoutError
	if errors.As(err, &toErr) && toErr.Timeout() {
		return &upstreamCallError{
			Kind:    upstreamErrorKindTimeout,
			Message: fmt.Sprintf("upstream timeout: %v", err),
		}
	}
	return &upstreamCallError{
		Kind:    upstreamErrorKindUnavailable,
		Message: fmt.Sprintf("upstream request failed: %v", err),
	}
}

func resolveURL(baseURL, endpointPath string) (string, error) {
	base, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("invalid upstream.baseUrl: %w", err)
	}
	if base.Scheme == "" || base.Host == "" {
		return "", fmt.Errorf("invalid upstream.baseUrl: must include scheme and host")
	}
	path := strings.TrimSpace(endpointPath)
	if path == "" {
		path = "/"
	}
	rel, err := url.Parse(path)
	if err != nil {
		return "", fmt.Errorf("invalid upstream path %q: %w", path, err)
	}
	return base.ResolveReference(rel).String(), nil
}

func normalizeDecision(operation string, requestedCaps []string, resp *DesktopDecisionResponse) {
	op := strings.ToLower(strings.TrimSpace(operation))
	if strings.TrimSpace(resp.Decision) == "" {
		resp.Decision = "DENY"
	}
	resp.Decision = strings.ToUpper(strings.TrimSpace(resp.Decision))
	if resp.Decision != "ALLOW" && resp.Decision != "DENY" {
		resp.Decision = "DENY"
	}
	if strings.TrimSpace(resp.VerifierID) == "" {
		resp.VerifierID = verifierForOperation(op)
	}
	if strings.TrimSpace(resp.ReasonCode) == "" {
		if resp.Decision == "ALLOW" {
			resp.ReasonCode = "ok"
		} else {
			resp.ReasonCode = "denied"
		}
	}
	if resp.Decision == "ALLOW" && len(resp.ObservedCapabilities) == 0 {
		resp.ObservedCapabilities = append([]string(nil), requestedCaps...)
	}
}

func decisionForUpstreamError(operation string, err error) DesktopDecisionResponse {
	reasonCode := "upstream_unavailable"
	reasonMessage := strings.TrimSpace(err.Error())
	var upstreamErr *upstreamCallError
	if errors.As(err, &upstreamErr) {
		switch upstreamErr.Kind {
		case upstreamErrorKindHTTP4xx:
			reasonCode = "upstream_rejected"
		case upstreamErrorKindHTTP5xx:
			reasonCode = "upstream_error"
		case upstreamErrorKindTimeout:
			reasonCode = "upstream_timeout"
		default:
			reasonCode = "upstream_unavailable"
		}
		if msg := strings.TrimSpace(upstreamErr.Message); msg != "" {
			reasonMessage = msg
		}
	}
	if reasonMessage == "" {
		reasonMessage = reasonCode
	}
	return DesktopDecisionResponse{
		Decision:      "DENY",
		VerifierID:    verifierForOperation(operation),
		ReasonCode:    reasonCode,
		ReasonMessage: reasonMessage,
	}
}

func verifierForOperation(operation string) string {
	switch strings.ToLower(strings.TrimSpace(operation)) {
	case "observe":
		return "V-M13-LNX-001"
	case "verify":
		return "V-M13-LNX-003"
	default:
		return "V-M13-LNX-002"
	}
}

func validateMeta(meta ObjectMeta) error {
	if strings.TrimSpace(meta.RequestID) == "" {
		return fmt.Errorf("meta.requestId is required")
	}
	if strings.TrimSpace(meta.Timestamp) == "" {
		return fmt.Errorf("meta.timestamp is required")
	}
	return nil
}

func validateStepEnvelope(step DesktopStepEnvelope) error {
	if strings.TrimSpace(step.RunID) == "" {
		return fmt.Errorf("step.runId is required")
	}
	if strings.TrimSpace(step.StepID) == "" {
		return fmt.Errorf("step.stepId is required")
	}
	if strings.TrimSpace(step.TargetOS) == "" {
		return fmt.Errorf("step.targetOS is required")
	}
	if strings.TrimSpace(step.TargetExecutionProfile) == "" {
		return fmt.Errorf("step.targetExecutionProfile is required")
	}
	return nil
}

func evidenceComplete(bundle DesktopEvidenceBundle) bool {
	if len(bundle.WindowMetadata) == 0 {
		return false
	}
	if !isSHA256DigestRef(bundle.ScreenshotHash) {
		return false
	}
	if strings.TrimSpace(bundle.ResultCode) == "" {
		return false
	}
	return true
}

func isSHA256DigestRef(value string) bool {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, "sha256:") {
		return false
	}
	hexPart := strings.TrimPrefix(value, "sha256:")
	if len(hexPart) != 64 {
		return false
	}
	for _, ch := range hexPart {
		switch {
		case ch >= '0' && ch <= '9':
		case ch >= 'a' && ch <= 'f':
		default:
			return false
		}
	}
	return true
}

func evidenceBundleFor(step DesktopStepEnvelope, operation, resultCode string) DesktopEvidenceBundle {
	base := strings.Join([]string{
		strings.TrimSpace(step.RunID),
		strings.TrimSpace(step.StepID),
		strings.TrimSpace(operation),
		strings.TrimSpace(step.TargetOS),
		strings.TrimSpace(step.TargetExecutionProfile),
		strings.Join(step.RequestedCapabilities, ","),
	}, "|")
	sum := sha256.Sum256([]byte(base))
	return DesktopEvidenceBundle{
		WindowMetadata: JSONObject{
			"operation":              operation,
			"targetOS":               step.TargetOS,
			"targetExecutionProfile": step.TargetExecutionProfile,
			"activeWindow":           "epydios-openfang-adapter",
			"stepId":                 step.StepID,
		},
		ScreenshotHash: "sha256:" + hex.EncodeToString(sum[:]),
		ResultCode:     resultCode,
		ScreenshotURI:  fmt.Sprintf("memory://epydios-desktop-openfang/%s/%s.png", step.RunID, operation),
	}
}

func decodeJSONBody(w http.ResponseWriter, r *http.Request, out interface{}) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 2<<20))
	if err := dec.Decode(out); err != nil {
		writeProviderError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return err
	}
	return nil
}

func writeProviderError(w http.ResponseWriter, code int, errCode, msg string, retryable bool, details map[string]interface{}) {
	writeJSON(w, code, ProviderError{
		ErrorCode: errCode,
		Message:   msg,
		Retryable: retryable,
		Details:   details,
	})
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s remote=%s dur=%s", r.Method, r.URL.Path, r.RemoteAddr, time.Since(start).Round(time.Millisecond))
	})
}
