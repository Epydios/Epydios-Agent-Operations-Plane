package nativeapp

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

const (
	gatewayStateStopped  = "stopped"
	gatewayStateStarting = "starting"
	gatewayStateRunning  = "running"
	gatewayStateDegraded = "degraded"
	gatewayStateFailed   = "failed"

	gatewayHealthUnknown     = "unknown"
	gatewayHealthStarting    = "starting"
	gatewayHealthHealthy     = "healthy"
	gatewayHealthUnreachable = "unreachable"
)

type gatewayClientIdentity struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

type gatewayGovernedActionRequest struct {
	TenantID                  string                 `json:"tenantId"`
	ProjectID                 string                 `json:"projectId"`
	EnvironmentID             string                 `json:"environmentId"`
	ActionType                string                 `json:"actionType"`
	TargetType                string                 `json:"targetType"`
	TargetRef                 string                 `json:"targetRef"`
	Input                     map[string]interface{} `json:"input"`
	Client                    gatewayClientIdentity  `json:"client"`
	IdempotencyKey            string                 `json:"idempotencyKey,omitempty"`
	RequestedExecutionProfile string                 `json:"requestedExecutionProfile,omitempty"`
	RequestedAuthorityRef     string                 `json:"requestedAuthorityRef,omitempty"`
	Reason                    string                 `json:"reason,omitempty"`
}

type gatewayGovernedActionResult struct {
	GatewayRequestID string `json:"gatewayRequestId"`
	RunID            string `json:"runId,omitempty"`
	State            string `json:"state"`
	PolicyDecision   string `json:"policyDecision,omitempty"`
	ApprovalRequired bool   `json:"approvalRequired"`
	ReceiptRef       string `json:"receiptRef,omitempty"`
	StatusURL        string `json:"statusUrl,omitempty"`
	RunURL           string `json:"runUrl,omitempty"`
}

type gatewayRequestRecord struct {
	GatewayRequestID string                       `json:"gatewayRequestId"`
	CreatedAtUTC     string                       `json:"createdAtUtc"`
	UpdatedAtUTC     string                       `json:"updatedAtUtc"`
	TenantID         string                       `json:"tenantId"`
	ProjectID        string                       `json:"projectId"`
	EnvironmentID    string                       `json:"environmentId"`
	Client           gatewayClientIdentity        `json:"client"`
	Request          gatewayGovernedActionRequest `json:"request"`
	Result           gatewayGovernedActionResult  `json:"result"`
}

type gatewayRunStatusResponse struct {
	GatewayRequestID string               `json:"gatewayRequestId,omitempty"`
	RunID            string               `json:"runId"`
	State            string               `json:"state"`
	Status           string               `json:"status"`
	PolicyDecision   string               `json:"policyDecision,omitempty"`
	ApprovalRequired bool                 `json:"approvalRequired"`
	ReceiptRef       string               `json:"receiptRef,omitempty"`
	Run              runtimeapi.RunRecord `json:"run"`
}

var gatewayRequestIDSanitizer = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func EnsureGatewayService(opts LaunchOptions, session *Session) (GatewayServiceRecord, error) {
	record, err := SyncGatewayServiceStatus(opts, session)
	if err != nil {
		return record, err
	}
	if record.State == gatewayStateRunning && record.Health == gatewayHealthHealthy {
		return record, nil
	}
	return StartGatewayService(opts, session)
}

func SyncGatewayServiceStatus(opts LaunchOptions, session *Session) (GatewayServiceRecord, error) {
	record := defaultGatewayServiceRecord(opts, session.Manifest.Paths)
	stored, err := readGatewayServiceRecord(session.Manifest.Paths.GatewayStatusPath)
	if err == nil {
		record = mergeGatewayServiceRecord(record, stored)
	}
	if _, err := ensureGatewayToken(record.TokenPath); err != nil {
		return record, err
	}
	pid, _ := readRuntimeServicePID(record.PIDPath)
	if pid > 0 {
		record.PID = pid
	}
	if gatewayHealthy(record.BaseURL) {
		record.State = gatewayStateRunning
		record.Health = gatewayHealthHealthy
		record.LastError = ""
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		if record.StartedAtUTC == "" {
			record.StartedAtUTC = record.UpdatedAtUTC
		}
		if err := writeGatewayServiceRecord(record); err != nil {
			return record, err
		}
		return record, session.UpdateGatewayService(record)
	}
	if record.PID > 0 && processIsRunning(record.PID) {
		record.State = gatewayStateDegraded
		record.Health = gatewayHealthUnreachable
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		if strings.TrimSpace(record.LastError) == "" {
			record.LastError = fmt.Sprintf("gateway health endpoint did not become ready: %s/healthz", strings.TrimRight(record.BaseURL, "/"))
		}
		if err := writeGatewayServiceRecord(record); err != nil {
			return record, err
		}
		return record, session.UpdateGatewayService(record)
	}
	record.PID = 0
	if record.State != gatewayStateFailed {
		record.State = gatewayStateStopped
	}
	if record.Health != gatewayHealthHealthy {
		record.Health = gatewayHealthUnknown
	}
	record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
	if err := writeGatewayServiceRecord(record); err != nil {
		return record, err
	}
	return record, session.UpdateGatewayService(record)
}

func StartGatewayService(opts LaunchOptions, session *Session) (GatewayServiceRecord, error) {
	record, _ := SyncGatewayServiceStatus(opts, session)
	if record.PID > 0 {
		_ = stopRuntimeServiceByPID(record.PID)
		_ = os.Remove(record.PIDPath)
	}
	if _, err := ensureGatewayToken(record.TokenPath); err != nil {
		return record, err
	}

	logFile, err := os.OpenFile(record.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return record, fmt.Errorf("open gateway log: %w", err)
	}
	defer logFile.Close()

	commandPath, err := resolveGatewayLaunchCommand(opts)
	if err != nil {
		return record, err
	}
	args := []string{
		"--gateway-service",
		"--mode", opts.Mode,
		"--runtime-port", fmt.Sprintf("%d", opts.RuntimeLocalPort),
		"--gateway-port", fmt.Sprintf("%d", opts.GatewayLocalPort),
		"--runtime-namespace", opts.RuntimeNamespace,
		"--runtime-service", opts.RuntimeService,
	}
	cmd := exec.Command(commandPath, args...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Env = append(os.Environ(), "EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="+opts.BootstrapConfigPath)
	applyDetachedProcessAttributes(cmd)
	if err := cmd.Start(); err != nil {
		record.State = gatewayStateFailed
		record.Health = gatewayHealthUnreachable
		record.LastError = fmt.Sprintf("start gateway service: %v", err)
		record.PID = 0
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		_ = writeGatewayServiceRecord(record)
		_ = session.UpdateGatewayService(record)
		return record, fmt.Errorf("start gateway service: %w", err)
	}

	pid := cmd.Process.Pid
	_ = cmd.Process.Release()
	record = defaultGatewayServiceRecord(opts, session.Manifest.Paths)
	record.State = gatewayStateStarting
	record.Health = gatewayHealthStarting
	record.PID = pid
	record.StartedAtUTC = time.Now().UTC().Format(time.RFC3339)
	record.UpdatedAtUTC = record.StartedAtUTC
	if err := writeRuntimeServicePID(record.PIDPath, pid); err != nil {
		return record, err
	}
	if err := writeGatewayServiceRecord(record); err != nil {
		return record, err
	}
	if err := session.UpdateGatewayService(record); err != nil {
		return record, err
	}
	if err := waitForGatewayHealth(record.BaseURL + "/healthz"); err != nil {
		_ = stopRuntimeServiceByPID(pid)
		_ = os.Remove(record.PIDPath)
		record.State = gatewayStateFailed
		record.Health = gatewayHealthUnreachable
		record.PID = 0
		record.LastError = err.Error()
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		if err := writeGatewayServiceRecord(record); err != nil {
			return record, err
		}
		if err := session.UpdateGatewayService(record); err != nil {
			return record, err
		}
		return record, err
	}
	record.State = gatewayStateRunning
	record.Health = gatewayHealthHealthy
	record.LastError = ""
	record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
	if err := writeGatewayServiceRecord(record); err != nil {
		return record, err
	}
	if err := session.UpdateGatewayService(record); err != nil {
		return record, err
	}
	return record, nil
}

func StopGatewayService(opts LaunchOptions, session *Session) (GatewayServiceRecord, error) {
	record := defaultGatewayServiceRecord(opts, session.Manifest.Paths)
	current, _ := readGatewayServiceRecord(session.Manifest.Paths.GatewayStatusPath)
	record = mergeGatewayServiceRecord(record, current)
	pid, _ := readRuntimeServicePID(record.PIDPath)
	if pid > 0 {
		record.PID = pid
	}
	if record.PID > 0 {
		if err := stopRuntimeServiceByPID(record.PID); err != nil {
			record.State = gatewayStateDegraded
			record.Health = gatewayHealthUnreachable
			record.LastError = err.Error()
			record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
			_ = writeGatewayServiceRecord(record)
			_ = session.UpdateGatewayService(record)
			return record, err
		}
	}
	_ = os.Remove(record.PIDPath)
	record.PID = 0
	record.State = gatewayStateStopped
	record.Health = gatewayHealthUnknown
	record.LastError = ""
	record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
	if err := writeGatewayServiceRecord(record); err != nil {
		return record, err
	}
	if err := session.UpdateGatewayService(record); err != nil {
		return record, err
	}
	return record, nil
}

func RestartGatewayService(opts LaunchOptions, session *Session) (GatewayServiceRecord, error) {
	if _, err := StopGatewayService(opts, session); err != nil {
		return session.Manifest.GatewayService, err
	}
	return StartGatewayService(opts, session)
}

func RunGatewayService(opts LaunchOptions) error {
	record := defaultGatewayServiceRecord(opts, resolveGatewaySessionPaths(opts))
	token, err := ensureGatewayToken(record.TokenPath)
	if err != nil {
		return err
	}
	record.State = gatewayStateStarting
	record.Health = gatewayHealthStarting
	record.PID = os.Getpid()
	record.StartedAtUTC = time.Now().UTC().Format(time.RFC3339)
	record.UpdatedAtUTC = record.StartedAtUTC
	if err := writeRuntimeServicePID(record.PIDPath, record.PID); err != nil {
		return err
	}
	if err := writeGatewayServiceRecord(record); err != nil {
		return err
	}

	mux := http.NewServeMux()
	state := &gatewayServiceState{record: record, token: token, opts: opts}
	mux.HandleFunc("/healthz", state.handleHealthz)
	mux.HandleFunc("/readyz", state.handleReadyz)
	mux.HandleFunc("/v1/governed-actions", state.handleGovernedActions)
	mux.HandleFunc("/v1/governed-actions/", state.handleGovernedActionByID)
	mux.HandleFunc("/v1/runs/", state.handleRunByID)

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", opts.GatewayLocalPort))
	if err != nil {
		record.State = gatewayStateFailed
		record.Health = gatewayHealthUnreachable
		record.LastError = err.Error()
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		_ = writeGatewayServiceRecord(record)
		return fmt.Errorf("listen localhost gateway: %w", err)
	}

	record.State = gatewayStateRunning
	record.Health = gatewayHealthHealthy
	record.LastError = ""
	record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
	state.record = record
	if err := writeGatewayServiceRecord(record); err != nil {
		return err
	}
	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		record.State = gatewayStateFailed
		record.Health = gatewayHealthUnreachable
		record.LastError = err.Error()
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		_ = writeGatewayServiceRecord(record)
		return err
	}
	return nil
}

type gatewayServiceState struct {
	record GatewayServiceRecord
	token  string
	opts   LaunchOptions

	createRunHook func(ctx context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError)
	fetchRunHook  func(ctx context.Context, runID string) (*runtimeapi.RunRecord, int, *runtimeapi.APIError)
}

func (s *gatewayServiceState) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeGatewayAPIError(w, http.StatusMethodNotAllowed, "", "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	writeGatewayJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
		"state":  s.record.State,
		"health": s.record.Health,
	})
}

func (s *gatewayServiceState) handleReadyz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeGatewayAPIError(w, http.StatusMethodNotAllowed, "", "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if s.opts.Mode != modeLive {
		writeGatewayJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
			"status": "not_ready",
			"reason": "gateway is running in mock mode and has no live runtime target",
		})
		return
	}
	if !runtimeHealthy(fmt.Sprintf("http://127.0.0.1:%d", s.opts.RuntimeLocalPort)) {
		writeGatewayJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
			"status": "not_ready",
			"reason": "runtime service is not healthy",
		})
		return
	}
	writeGatewayJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ready",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *gatewayServiceState) handleGovernedActions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeGatewayAPIError(w, http.StatusMethodNotAllowed, "", "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	var req gatewayGovernedActionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	if !populateAndValidateGatewayRequest(&req, r) {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_REQUEST", "missing required governed action fields", false, nil)
		return
	}
	gatewayRequestID := newGatewayRequestID()
	runReq := buildGatewayRuntimeRunRequest(req, gatewayRequestID)
	run, statusCode, apiErr := s.createRuntimeRun(r.Context(), runReq)
	if apiErr != nil {
		details := cloneGatewayDetails(apiErr.Details)
		details["gatewayRequestId"] = gatewayRequestID
		writeGatewayAPIError(w, statusCode, gatewayRequestID, apiErr.ErrorCode, apiErr.Message, apiErr.Retryable, details)
		return
	}
	result := buildGatewayResult(s.record.BaseURL, gatewayRequestID, *run, true)
	record := gatewayRequestRecord{
		GatewayRequestID: gatewayRequestID,
		CreatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		UpdatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		TenantID:         req.TenantID,
		ProjectID:        req.ProjectID,
		EnvironmentID:    req.EnvironmentID,
		Client:           req.Client,
		Request:          req,
		Result:           result,
	}
	if err := writeGatewayRequestRecord(s.record.RequestsRoot, record); err != nil {
		writeGatewayAPIError(w, http.StatusInternalServerError, gatewayRequestID, "GATEWAY_PERSIST_FAILED", "failed to persist gateway request record", true, map[string]interface{}{"error": err.Error()})
		return
	}
	writeGatewayJSON(w, http.StatusAccepted, result)
}

func (s *gatewayServiceState) handleGovernedActionByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeGatewayAPIError(w, http.StatusMethodNotAllowed, "", "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	gatewayRequestID := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/v1/governed-actions/"))
	if gatewayRequestID == "" {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_GATEWAY_REQUEST_ID", "gatewayRequestId is required", false, nil)
		return
	}
	record, err := readGatewayRequestRecord(s.record.RequestsRoot, gatewayRequestID)
	if err != nil {
		writeGatewayAPIError(w, http.StatusNotFound, gatewayRequestID, "GATEWAY_REQUEST_NOT_FOUND", "gateway request not found", false, map[string]interface{}{"gatewayRequestId": gatewayRequestID})
		return
	}
	if strings.TrimSpace(record.Result.RunID) != "" {
		run, statusCode, apiErr := s.fetchRuntimeRun(r.Context(), record.Result.RunID)
		if apiErr == nil && run != nil {
			record.Result = buildGatewayResult(s.record.BaseURL, gatewayRequestID, *run, false)
			record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
			_ = writeGatewayRequestRecord(s.record.RequestsRoot, record)
		} else if apiErr != nil && statusCode >= 500 {
			writeGatewayAPIError(w, statusCode, gatewayRequestID, apiErr.ErrorCode, apiErr.Message, apiErr.Retryable, apiErr.Details)
			return
		}
	}
	writeGatewayJSON(w, http.StatusOK, record.Result)
}

func (s *gatewayServiceState) handleRunByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeGatewayAPIError(w, http.StatusMethodNotAllowed, "", "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	runID := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/v1/runs/"))
	if runID == "" {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_RUN_ID", "runId is required", false, nil)
		return
	}
	run, statusCode, apiErr := s.fetchRuntimeRun(r.Context(), runID)
	if apiErr != nil {
		writeGatewayAPIError(w, statusCode, "", apiErr.ErrorCode, apiErr.Message, apiErr.Retryable, apiErr.Details)
		return
	}
	resp := gatewayRunStatusResponse{
		RunID:            run.RunID,
		State:            gatewayStateFromRun(*run, false),
		Status:           string(run.Status),
		PolicyDecision:   strings.ToUpper(strings.TrimSpace(run.PolicyDecision)),
		ApprovalRequired: strings.EqualFold(strings.TrimSpace(run.PolicyDecision), "DEFER"),
		ReceiptRef:       extractGatewayReceiptRef(*run),
		Run:              *run,
	}
	writeGatewayJSON(w, http.StatusOK, resp)
}

func (s *gatewayServiceState) authorize(w http.ResponseWriter, r *http.Request) bool {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		writeGatewayAPIError(w, http.StatusUnauthorized, "", "GATEWAY_AUTH_REQUIRED", "missing bearer token", false, nil)
		return false
	}
	token := strings.TrimSpace(authHeader[len("Bearer "):])
	if token == "" || token != s.token {
		writeGatewayAPIError(w, http.StatusUnauthorized, "", "GATEWAY_AUTH_INVALID", "invalid bearer token", false, nil)
		return false
	}
	return true
}

func (s *gatewayServiceState) createRuntimeRun(ctx context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
	if s.createRunHook != nil {
		return s.createRunHook(ctx, req)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/v1alpha1/runtime/runs", s.opts.RuntimeLocalPort)
	body, err := json.Marshal(req)
	if err != nil {
		return nil, http.StatusInternalServerError, &runtimeapi.APIError{ErrorCode: "GATEWAY_ENCODE_FAILED", Message: "failed to encode runtime request", Retryable: false, Details: map[string]interface{}{"error": err.Error()}}
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, http.StatusInternalServerError, &runtimeapi.APIError{ErrorCode: "GATEWAY_REQUEST_BUILD_FAILED", Message: "failed to build runtime request", Retryable: false, Details: map[string]interface{}{"error": err.Error()}}
	}
	httpReq.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, http.StatusServiceUnavailable, &runtimeapi.APIError{ErrorCode: "RUNTIME_UNAVAILABLE", Message: "runtime service unavailable", Retryable: true, Details: map[string]interface{}{"error": err.Error()}}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		apiErr := &runtimeapi.APIError{}
		if err := json.NewDecoder(resp.Body).Decode(apiErr); err != nil {
			apiErr = &runtimeapi.APIError{ErrorCode: "RUNTIME_ERROR", Message: "runtime returned an error", Retryable: resp.StatusCode >= 500, Details: map[string]interface{}{"statusCode": resp.StatusCode}}
		}
		return nil, resp.StatusCode, apiErr
	}
	var run runtimeapi.RunRecord
	if err := json.NewDecoder(resp.Body).Decode(&run); err != nil {
		return nil, http.StatusBadGateway, &runtimeapi.APIError{ErrorCode: "RUNTIME_DECODE_FAILED", Message: "failed to decode runtime response", Retryable: true, Details: map[string]interface{}{"error": err.Error()}}
	}
	return &run, resp.StatusCode, nil
}

func (s *gatewayServiceState) fetchRuntimeRun(ctx context.Context, runID string) (*runtimeapi.RunRecord, int, *runtimeapi.APIError) {
	if s.fetchRunHook != nil {
		return s.fetchRunHook(ctx, runID)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/v1alpha1/runtime/runs/%s", s.opts.RuntimeLocalPort, runID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, http.StatusInternalServerError, &runtimeapi.APIError{ErrorCode: "GATEWAY_REQUEST_BUILD_FAILED", Message: "failed to build runtime request", Retryable: false, Details: map[string]interface{}{"error": err.Error()}}
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, http.StatusServiceUnavailable, &runtimeapi.APIError{ErrorCode: "RUNTIME_UNAVAILABLE", Message: "runtime service unavailable", Retryable: true, Details: map[string]interface{}{"error": err.Error()}}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		apiErr := &runtimeapi.APIError{}
		if err := json.NewDecoder(resp.Body).Decode(apiErr); err != nil {
			apiErr = &runtimeapi.APIError{ErrorCode: "RUNTIME_ERROR", Message: "runtime returned an error", Retryable: resp.StatusCode >= 500, Details: map[string]interface{}{"statusCode": resp.StatusCode}}
		}
		return nil, resp.StatusCode, apiErr
	}
	var run runtimeapi.RunRecord
	if err := json.NewDecoder(resp.Body).Decode(&run); err != nil {
		return nil, http.StatusBadGateway, &runtimeapi.APIError{ErrorCode: "RUNTIME_DECODE_FAILED", Message: "failed to decode runtime response", Retryable: true, Details: map[string]interface{}{"error": err.Error()}}
	}
	return &run, resp.StatusCode, nil
}

func populateAndValidateGatewayRequest(req *gatewayGovernedActionRequest, httpReq *http.Request) bool {
	req.TenantID = strings.TrimSpace(req.TenantID)
	req.ProjectID = strings.TrimSpace(req.ProjectID)
	req.EnvironmentID = strings.TrimSpace(req.EnvironmentID)
	req.ActionType = strings.TrimSpace(req.ActionType)
	req.TargetType = strings.TrimSpace(req.TargetType)
	req.TargetRef = strings.TrimSpace(req.TargetRef)
	req.Client.ID = strings.TrimSpace(firstNonEmpty(req.Client.ID, httpReq.Header.Get("X-Epydios-Client-Id")))
	req.Client.Name = strings.TrimSpace(firstNonEmpty(req.Client.Name, httpReq.Header.Get("X-Epydios-Client-Name")))
	req.Client.Version = strings.TrimSpace(firstNonEmpty(req.Client.Version, httpReq.Header.Get("X-Epydios-Client-Version")))
	hasInput := req.Input != nil
	return req.TenantID != "" &&
		req.ProjectID != "" &&
		req.EnvironmentID != "" &&
		req.ActionType != "" &&
		req.TargetType != "" &&
		req.TargetRef != "" &&
		hasInput &&
		req.Client.ID != "" &&
		req.Client.Name != ""
}

func buildGatewayRuntimeRunRequest(req gatewayGovernedActionRequest, gatewayRequestID string) runtimeapi.RunCreateRequest {
	now := time.Now().UTC()
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = fmt.Sprintf("Gateway request from %s", req.Client.Name)
	}
	contextPayload := runtimeapi.JSONObject{
		"gateway": runtimeapi.JSONObject{
			"gateway_request_id":          gatewayRequestID,
			"client_id":                   req.Client.ID,
			"client_name":                 req.Client.Name,
			"client_version":              req.Client.Version,
			"idempotency_key":             strings.TrimSpace(req.IdempotencyKey),
			"requested_execution_profile": strings.TrimSpace(req.RequestedExecutionProfile),
			"requested_authority_ref":     strings.TrimSpace(req.RequestedAuthorityRef),
			"input":                       req.Input,
		},
	}
	return runtimeapi.RunCreateRequest{
		Meta: runtimeapi.ObjectMeta{
			RequestID:   gatewayRequestID,
			Timestamp:   &now,
			TenantID:    req.TenantID,
			ProjectID:   req.ProjectID,
			Environment: req.EnvironmentID,
			Actor: runtimeapi.JSONObject{
				"type":    "localhost_gateway_client",
				"id":      req.Client.ID,
				"name":    req.Client.Name,
				"version": req.Client.Version,
			},
		},
		Subject: runtimeapi.JSONObject{
			"type": "gateway_client",
			"id":   req.Client.ID,
			"attributes": runtimeapi.JSONObject{
				"name":         req.Client.Name,
				"authorityRef": strings.TrimSpace(req.RequestedAuthorityRef),
			},
		},
		Action: runtimeapi.JSONObject{
			"type":   req.ActionType,
			"class":  "execute",
			"verb":   req.ActionType,
			"target": req.TargetRef,
		},
		Resource: runtimeapi.JSONObject{
			"kind": req.TargetType,
			"id":   req.TargetRef,
			"name": req.TargetRef,
		},
		Task: runtimeapi.JSONObject{
			"intent":  reason,
			"summary": reason,
		},
		Context: contextPayload,
		Annotations: runtimeapi.JSONObject{
			"gatewayRequestId":  gatewayRequestID,
			"gatewayClientId":   req.Client.ID,
			"gatewayClientName": req.Client.Name,
		},
		Mode: "enforce",
	}
}

func buildGatewayResult(baseURL string, gatewayRequestID string, run runtimeapi.RunRecord, initial bool) gatewayGovernedActionResult {
	return gatewayGovernedActionResult{
		GatewayRequestID: gatewayRequestID,
		RunID:            run.RunID,
		State:            gatewayStateFromRun(run, initial),
		PolicyDecision:   strings.ToUpper(strings.TrimSpace(run.PolicyDecision)),
		ApprovalRequired: strings.EqualFold(strings.TrimSpace(run.PolicyDecision), "DEFER"),
		ReceiptRef:       extractGatewayReceiptRef(run),
		StatusURL:        fmt.Sprintf("%s/v1/governed-actions/%s", strings.TrimRight(baseURL, "/"), gatewayRequestID),
		RunURL:           fmt.Sprintf("%s/v1/runs/%s", strings.TrimRight(baseURL, "/"), run.RunID),
	}
}

func gatewayStateFromRun(run runtimeapi.RunRecord, initial bool) string {
	decision := strings.ToUpper(strings.TrimSpace(run.PolicyDecision))
	switch decision {
	case "DENY":
		return "rejected"
	case "DEFER":
		return "deferred"
	}
	switch run.Status {
	case runtimeapi.RunStatusCompleted:
		return "completed"
	case runtimeapi.RunStatusFailed:
		return "failed"
	default:
		if initial {
			return "accepted"
		}
		return "running"
	}
}

func extractGatewayReceiptRef(run runtimeapi.RunRecord) string {
	for _, raw := range []json.RawMessage{run.EvidenceBundleResponse, run.EvidenceRecordResponse, run.PolicyResponse} {
		if len(raw) == 0 {
			continue
		}
		var payload map[string]interface{}
		if err := json.Unmarshal(raw, &payload); err != nil {
			continue
		}
		for _, key := range []string{"receiptRef", "receiptId", "approvalReceiptRef"} {
			value := strings.TrimSpace(interfaceString(payload[key]))
			if value != "" {
				return value
			}
		}
	}
	return ""
}

func ensureGatewayToken(path string) (string, error) {
	if content, err := os.ReadFile(path); err == nil {
		token := strings.TrimSpace(string(content))
		if token != "" {
			return token, nil
		}
	}
	random := make([]byte, 24)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate gateway token: %w", err)
	}
	token := hex.EncodeToString(random)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create gateway token dir: %w", err)
	}
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil {
		return "", fmt.Errorf("write gateway token: %w", err)
	}
	return token, nil
}

func waitForGatewayHealth(url string) error {
	deadline := time.Now().Add(20 * time.Second)
	client := &http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return nil
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("gateway health endpoint did not become ready: %s", url)
}

func gatewayHealthy(baseURL string) bool {
	base := strings.TrimSpace(baseURL)
	if base == "" {
		return false
	}
	client := &http.Client{Timeout: 1500 * time.Millisecond}
	resp, err := client.Get(strings.TrimRight(base, "/") + "/healthz")
	if err != nil {
		return false
	}
	_ = resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func writeGatewayServiceRecord(record GatewayServiceRecord) error {
	if err := os.MkdirAll(filepath.Dir(record.StatusPath), 0o755); err != nil {
		return fmt.Errorf("create gateway status dir: %w", err)
	}
	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal gateway status: %w", err)
	}
	return os.WriteFile(record.StatusPath, append(data, '\n'), 0o644)
}

func readGatewayServiceRecord(path string) (GatewayServiceRecord, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return GatewayServiceRecord{}, err
	}
	var record GatewayServiceRecord
	if err := json.Unmarshal(content, &record); err != nil {
		return GatewayServiceRecord{}, fmt.Errorf("decode gateway status: %w", err)
	}
	return record, nil
}

func mergeGatewayServiceRecord(base GatewayServiceRecord, override GatewayServiceRecord) GatewayServiceRecord {
	record := base
	if strings.TrimSpace(override.State) != "" {
		record.State = override.State
	}
	if strings.TrimSpace(override.Health) != "" {
		record.Health = override.Health
	}
	if override.PID > 0 {
		record.PID = override.PID
	}
	if strings.TrimSpace(override.BaseURL) != "" {
		record.BaseURL = override.BaseURL
	}
	if strings.TrimSpace(override.LogPath) != "" {
		record.LogPath = override.LogPath
	}
	if strings.TrimSpace(override.PIDPath) != "" {
		record.PIDPath = override.PIDPath
	}
	if strings.TrimSpace(override.StatusPath) != "" {
		record.StatusPath = override.StatusPath
	}
	if strings.TrimSpace(override.TokenPath) != "" {
		record.TokenPath = override.TokenPath
	}
	if strings.TrimSpace(override.RequestsRoot) != "" {
		record.RequestsRoot = override.RequestsRoot
	}
	if strings.TrimSpace(override.StartedAtUTC) != "" {
		record.StartedAtUTC = override.StartedAtUTC
	}
	if strings.TrimSpace(override.UpdatedAtUTC) != "" {
		record.UpdatedAtUTC = override.UpdatedAtUTC
	}
	if strings.TrimSpace(override.LastError) != "" {
		record.LastError = override.LastError
	}
	return record
}

func resolveGatewayLaunchCommand(opts LaunchOptions) (string, error) {
	if helper := gatewayLaunchHelperPath(opts); helper != "" {
		return helper, nil
	}
	path, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("resolve gateway executable: %w", err)
	}
	return path, nil
}

func gatewayLaunchHelperPath(opts LaunchOptions) string {
	root := strings.TrimSpace(filepath.Dir(opts.BootstrapConfigPath))
	if root == "." || root == "" {
		return ""
	}
	path := filepath.Join(root, "launch-installed.sh")
	if info, err := os.Stat(path); err == nil && info.Mode().Perm()&0o111 != 0 {
		return path
	}
	return ""
}

func resolveGatewaySessionPaths(opts LaunchOptions) SessionPaths {
	configRoot := resolveProductConfigRoot(opts.BootstrapConfigPath)
	return SessionPaths{
		ConfigRoot:          configRoot,
		ServiceRoot:         filepath.Join(configRoot, "runtime-service"),
		GatewayRoot:         filepath.Join(configRoot, "localhost-gateway"),
		ServicePIDPath:      filepath.Join(configRoot, "runtime-service", "runtime-service.pid"),
		ServiceLogPath:      filepath.Join(configRoot, "runtime-service", "runtime-service.log"),
		ServiceStatusPath:   filepath.Join(configRoot, "runtime-service", "runtime-service.json"),
		GatewayPIDPath:      filepath.Join(configRoot, "localhost-gateway", "gateway-service.pid"),
		GatewayLogPath:      filepath.Join(configRoot, "localhost-gateway", "gateway-service.log"),
		GatewayStatusPath:   filepath.Join(configRoot, "localhost-gateway", "gateway-service.json"),
		GatewayTokenPath:    filepath.Join(configRoot, "localhost-gateway", "gateway-token"),
		GatewayRequestsRoot: filepath.Join(configRoot, "localhost-gateway", "requests"),
	}
}

func resolveProductConfigRoot(bootstrapPath string) string {
	if trimmed := strings.TrimSpace(bootstrapPath); trimmed != "" {
		return filepath.Dir(trimmed)
	}
	configRoot, err := os.UserConfigDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "EpydiosAgentOpsDesktop")
	}
	return filepath.Join(configRoot, "EpydiosAgentOpsDesktop")
}

func writeGatewayRequestRecord(root string, record gatewayRequestRecord) error {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
	if strings.TrimSpace(record.CreatedAtUTC) == "" {
		record.CreatedAtUTC = record.UpdatedAtUTC
	}
	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, sanitizeGatewayRequestID(record.GatewayRequestID)+".json"), append(data, '\n'), 0o644)
}

func readGatewayRequestRecord(root string, gatewayRequestID string) (gatewayRequestRecord, error) {
	content, err := os.ReadFile(filepath.Join(root, sanitizeGatewayRequestID(gatewayRequestID)+".json"))
	if err != nil {
		return gatewayRequestRecord{}, err
	}
	var record gatewayRequestRecord
	if err := json.Unmarshal(content, &record); err != nil {
		return gatewayRequestRecord{}, err
	}
	return record, nil
}

func sanitizeGatewayRequestID(value string) string {
	sanitized := gatewayRequestIDSanitizer.ReplaceAllString(strings.TrimSpace(value), "_")
	if sanitized == "" {
		return "gateway_request"
	}
	return sanitized
}

func newGatewayRequestID() string {
	random := make([]byte, 6)
	_, _ = rand.Read(random)
	return fmt.Sprintf("gateway-%s-%s", time.Now().UTC().Format("20060102T150405Z"), hex.EncodeToString(random))
}

func writeGatewayJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeGatewayAPIError(w http.ResponseWriter, status int, gatewayRequestID, code, message string, retryable bool, details map[string]interface{}) {
	if details == nil {
		details = map[string]interface{}{}
	}
	if strings.TrimSpace(gatewayRequestID) != "" {
		details["gatewayRequestId"] = gatewayRequestID
	}
	writeGatewayJSON(w, status, runtimeapi.APIError{
		ErrorCode: code,
		Message:   message,
		Retryable: retryable,
		Details:   details,
	})
}

func cloneGatewayDetails(details map[string]interface{}) map[string]interface{} {
	if len(details) == 0 {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(details))
	for key, value := range details {
		out[key] = value
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func interfaceString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return ""
	}
}
