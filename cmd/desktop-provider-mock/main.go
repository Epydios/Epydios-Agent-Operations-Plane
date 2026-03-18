package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type JSONObject map[string]interface{}

type Config struct {
	ProviderID      string   `json:"providerId"`
	ProviderVersion string   `json:"providerVersion"`
	TargetOS        string   `json:"targetOS"`
	Capabilities    []string `json:"capabilities"`
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
	cfg Config
}

func main() {
	var (
		listenAddr = flag.String("listen", ":8080", "HTTP listen address")
		configPath = flag.String("config", "providers/desktop/mock/config.example.json", "path to JSON config")
	)
	flag.Parse()

	cfg, err := loadConfig(*configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	applyDefaults(&cfg)

	s := &server{cfg: cfg}
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

	log.Printf("desktop provider (mock) listening on %s (providerId=%s targetOS=%s)", *listenAddr, cfg.ProviderID, cfg.TargetOS)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
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
		cfg.ProviderID = "oss-desktop-linux"
	}
	if strings.TrimSpace(cfg.ProviderVersion) == "" {
		cfg.ProviderVersion = "0.2.0"
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
}

func (s *server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	writeJSON(w, http.StatusOK, ProviderCapabilitiesResponse{
		ProviderType:    "DesktopProvider",
		ProviderID:      s.cfg.ProviderID,
		ContractVersion: "v1alpha1",
		ProviderVersion: s.cfg.ProviderVersion,
		Capabilities:    append([]string(nil), s.cfg.Capabilities...),
		Status: map[string]interface{}{
			"mode":     "mock-linux-first",
			"targetOS": s.cfg.TargetOS,
		},
	})
}

func (s *server) handleObserve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
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
	writeJSON(w, http.StatusOK, DesktopObserveResponse{
		DesktopDecisionResponse: DesktopDecisionResponse{
			Decision:             "ALLOW",
			VerifierID:           "V-M13-LNX-001",
			ReasonCode:           "ok",
			ObservedCapabilities: append([]string(nil), req.Step.RequestedCapabilities...),
		},
		EvidenceBundle: evidenceBundleFor(req.Step, "observe", "observed"),
	})
}

func (s *server) handleActuate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
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
		deny.VerifierID = "V-M13-LNX-002"
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
				VerifierID:    "V-M13-LNX-002",
				ReasonCode:    "no_action",
				ReasonMessage: "action payload is required",
			},
			EvidenceBundle: &bundle,
		})
		return
	}
	bundle := evidenceBundleFor(req.Step, "actuate", "ok")
	writeJSON(w, http.StatusOK, DesktopActuateResponse{
		DesktopDecisionResponse: DesktopDecisionResponse{
			Decision:             "ALLOW",
			VerifierID:           "V-M13-LNX-001",
			ReasonCode:           "ok",
			ObservedCapabilities: append([]string(nil), req.Step.RequestedCapabilities...),
		},
		EvidenceBundle: &bundle,
	})
}

func (s *server) handleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeProviderError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
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
		deny.VerifierID = "V-M13-LNX-003"
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
				VerifierID:    "V-M13-LNX-003",
				ReasonCode:    "ambiguous_state",
				ReasonMessage: "postAction payload is required",
			},
			EvidenceBundle: evidenceBundleFor(req.Step, "verify", "ambiguous"),
		})
		return
	}
	writeJSON(w, http.StatusOK, DesktopVerifyResponse{
		DesktopDecisionResponse: DesktopDecisionResponse{
			Decision:             "ALLOW",
			VerifierID:           "V-M13-LNX-003",
			ReasonCode:           "ok",
			ObservedCapabilities: append([]string(nil), req.Step.RequestedCapabilities...),
		},
		EvidenceBundle: evidenceBundleFor(req.Step, "verify", "verified"),
	})
}

func (s *server) evaluateStep(step DesktopStepEnvelope) (DesktopDecisionResponse, bool) {
	if strings.ToLower(strings.TrimSpace(step.TargetOS)) != s.cfg.TargetOS {
		return DesktopDecisionResponse{
			Decision:      "DENY",
			VerifierID:    "V-M13-LNX-002",
			ReasonCode:    "capability_not_granted",
			ReasonMessage: fmt.Sprintf("targetOS=%s is not supported by provider targetOS=%s", step.TargetOS, s.cfg.TargetOS),
		}, true
	}
	if len(step.VerifierPolicy.RequiredVerifierIDs) == 0 {
		return DesktopDecisionResponse{
			Decision:      "DENY",
			VerifierID:    "V-M13-LNX-002",
			ReasonCode:    "no_policy",
			ReasonMessage: "verifierPolicy.requiredVerifierIds is required",
		}, true
	}
	if len(step.RequestedCapabilities) == 0 {
		return DesktopDecisionResponse{
			Decision:      "DENY",
			VerifierID:    "V-M13-LNX-002",
			ReasonCode:    "no_action",
			ReasonMessage: "requestedCapabilities is required",
		}, true
	}
	return DesktopDecisionResponse{}, false
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
			"activeWindow":           "epydios-mock-window",
			"stepId":                 step.StepID,
		},
		ScreenshotHash: "sha256:" + hex.EncodeToString(sum[:]),
		ResultCode:     resultCode,
		ScreenshotURI:  fmt.Sprintf("memory://epydios-desktop/%s/%s.png", step.RunID, operation),
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
