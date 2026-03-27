package nativeapp

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	pathpkg "path"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
	"github.com/gorilla/websocket"
	"github.com/klauspost/compress/zstd"
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
	GatewayRequestID       string `json:"gatewayRequestId"`
	InterpositionRequestID string `json:"interpositionRequestId,omitempty"`
	RunID                  string `json:"runId,omitempty"`
	ApprovalID             string `json:"approvalId,omitempty"`
	State                  string `json:"state"`
	InterpositionState     string `json:"interpositionState,omitempty"`
	PolicyDecision         string `json:"policyDecision,omitempty"`
	ApprovalRequired       bool   `json:"approvalRequired"`
	ReceiptRef             string `json:"receiptRef,omitempty"`
	StatusURL              string `json:"statusUrl,omitempty"`
	RunURL                 string `json:"runUrl,omitempty"`
}

type gatewayGovernanceTarget struct {
	ActionType string `json:"actionType,omitempty"`
	TargetType string `json:"targetType,omitempty"`
	TargetRef  string `json:"targetRef,omitempty"`
}

type gatewayRequestSummary struct {
	Title  string `json:"title,omitempty"`
	Reason string `json:"reason,omitempty"`
}

type gatewayUpstreamDescriptor struct {
	Protocol   string            `json:"protocol,omitempty"`
	Method     string            `json:"method,omitempty"`
	Path       string            `json:"path,omitempty"`
	Headers    map[string]string `json:"headers,omitempty"`
	BodySHA256 string            `json:"bodySha256,omitempty"`
}

type gatewayWebsocketTrace struct {
	RetryKey              string `json:"retryKey,omitempty"`
	MatchStrategy         string `json:"matchStrategy,omitempty"`
	ProxyStartedAtUTC     string `json:"proxyStartedAtUtc,omitempty"`
	ClientInitialAtUTC    string `json:"clientInitialAtUtc,omitempty"`
	ClientClosedAtUTC     string `json:"clientClosedAtUtc,omitempty"`
	UpstreamFirstAtUTC    string `json:"upstreamFirstAtUtc,omitempty"`
	UpstreamSemanticAtUTC string `json:"upstreamSemanticAtUtc,omitempty"`
	UpstreamSemanticType  string `json:"upstreamSemanticType,omitempty"`
	UpstreamTerminalAtUTC string `json:"upstreamTerminalAtUtc,omitempty"`
	UpstreamTerminalType  string `json:"upstreamTerminalType,omitempty"`
	ProxyError            string `json:"proxyError,omitempty"`
	ProxyErrorClass       string `json:"proxyErrorClass,omitempty"`
	RetryObservedAtUTC    string `json:"retryObservedAtUtc,omitempty"`
	RetryReplayCount      int    `json:"retryReplayCount,omitempty"`
	RetryBlockedCount     int    `json:"retryBlockedCount,omitempty"`
	FinalizedAtUTC        string `json:"finalizedAtUtc,omitempty"`
}

type gatewayInterpositionEnvelope struct {
	InterpositionRequestID string                    `json:"interpositionRequestId"`
	State                  string                    `json:"state"`
	ReceivedAtUTC          string                    `json:"receivedAtUtc"`
	ClientSurface          string                    `json:"clientSurface,omitempty"`
	OperationClass         string                    `json:"operationClass,omitempty"`
	TenantID               string                    `json:"tenantId,omitempty"`
	ProjectID              string                    `json:"projectId,omitempty"`
	EnvironmentID          string                    `json:"environmentId,omitempty"`
	ActorRef               string                    `json:"actorRef,omitempty"`
	CodexSessionID         string                    `json:"codexSessionId,omitempty"`
	CodexConversationID    string                    `json:"codexConversationId,omitempty"`
	CodexTurnID            string                    `json:"codexTurnId,omitempty"`
	ClientRequestID        string                    `json:"clientRequestId,omitempty"`
	IdempotencyKey         string                    `json:"idempotencyKey,omitempty"`
	GovernanceTarget       gatewayGovernanceTarget   `json:"governanceTarget"`
	RequestSummary         gatewayRequestSummary     `json:"requestSummary"`
	Upstream               gatewayUpstreamDescriptor `json:"upstream"`
	WebsocketTrace         gatewayWebsocketTrace     `json:"websocketTrace,omitempty"`
	TerminalWebsocketEvent json.RawMessage           `json:"terminalWebsocketEvent,omitempty"`
}

type GatewayHoldRecord struct {
	InterpositionRequestID string                  `json:"interpositionRequestId"`
	GatewayRequestID       string                  `json:"gatewayRequestId"`
	RunID                  string                  `json:"runId"`
	ApprovalID             string                  `json:"approvalId"`
	State                  string                  `json:"state"`
	HoldStartedAtUTC       string                  `json:"holdStartedAtUtc"`
	HoldDeadlineAtUTC      string                  `json:"holdDeadlineAtUtc"`
	HoldReason             string                  `json:"holdReason"`
	ClientSurface          string                  `json:"clientSurface,omitempty"`
	SourceClient           gatewayClientIdentity   `json:"sourceClient"`
	TenantID               string                  `json:"tenantId,omitempty"`
	ProjectID              string                  `json:"projectId,omitempty"`
	EnvironmentID          string                  `json:"environmentId,omitempty"`
	ActorRef               string                  `json:"actorRef,omitempty"`
	CodexSessionID         string                  `json:"codexSessionId,omitempty"`
	CodexConversationID    string                  `json:"codexConversationId,omitempty"`
	GovernanceTarget       gatewayGovernanceTarget `json:"governanceTarget"`
	RequestSummary         gatewayRequestSummary   `json:"requestSummary"`
	Decision               string                  `json:"decision,omitempty"`
	ResolutionReason       string                  `json:"resolutionReason,omitempty"`
	ResolvedAtUTC          string                  `json:"resolvedAtUtc,omitempty"`
	CreatedAtUTC           string                  `json:"createdAtUtc"`
	UpdatedAtUTC           string                  `json:"updatedAtUtc"`
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
	Interposition    gatewayInterpositionEnvelope `json:"interposition"`
	Result           gatewayGovernedActionResult  `json:"result"`
}

type gatewayRunStatusResponse struct {
	GatewayRequestID       string               `json:"gatewayRequestId,omitempty"`
	InterpositionRequestID string               `json:"interpositionRequestId,omitempty"`
	RunID                  string               `json:"runId"`
	ApprovalID             string               `json:"approvalId,omitempty"`
	State                  string               `json:"state"`
	InterpositionState     string               `json:"interpositionState,omitempty"`
	Status                 string               `json:"status"`
	PolicyDecision         string               `json:"policyDecision,omitempty"`
	ApprovalRequired       bool                 `json:"approvalRequired"`
	ReceiptRef             string               `json:"receiptRef,omitempty"`
	Run                    runtimeapi.RunRecord `json:"run"`
}

type compatibilityForwardRequest struct {
	Path        string
	Body        []byte
	Headers     http.Header
	BaseURL     string
	BearerToken string
}

type compatibilityForwardResponse struct {
	StatusCode int
	Headers    http.Header
	Body       []byte
}

type compatibilityUpstreamWebsocketResult struct {
	Completed     bool
	Failed        bool
	SemanticDone  bool
	SemanticEvent []byte
	TerminalEvent []byte
	Trace         gatewayWebsocketTrace
}

var gatewayRequestIDSanitizer = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

var compatibilityHTTPClientFactory = func() *http.Client {
	return &http.Client{Timeout: 60 * time.Second}
}

var gatewayWebsocketUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func isCompatibilityWebsocketUpgradeRequest(r *http.Request) bool {
	if !websocket.IsWebSocketUpgrade(r) {
		return false
	}
	switch r.Method {
	case http.MethodGet, http.MethodPost:
		return true
	default:
		return false
	}
}

func upgradeCompatibilityWebsocket(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	upgradeReq := r
	if r.Method != http.MethodGet {
		// Codex currently uses POST /responses with websocket upgrade headers.
		// Gorilla's upgrader hard-requires GET, so normalize only the handshake.
		upgradeReq = r.Clone(r.Context())
		upgradeReq.Method = http.MethodGet
	}
	return gatewayWebsocketUpgrader.Upgrade(w, upgradeReq, nil)
}

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
	reachable, ready, detail := gatewayHealthStatus(opts, record.BaseURL)
	if ready {
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
	if reachable || (record.PID > 0 && processIsRunning(record.PID)) {
		record.State = gatewayStateDegraded
		record.Health = gatewayHealthUnreachable
		record.UpdatedAtUTC = time.Now().UTC().Format(time.RFC3339)
		record.LastError = gatewayHealthStatusDetail(record.BaseURL, detail)
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
	if strings.TrimSpace(opts.BootstrapConfigPath) != "" {
		if err := writeBootstrapLaunchOptions(opts.BootstrapConfigPath, bootstrapLaunchOptionsFromLaunchOptions(opts)); err != nil {
			return record, fmt.Errorf("sync gateway bootstrap config: %w", err)
		}
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
	cmd.Env = launchEnvironmentWithInterpositionOverrides(os.Environ(), opts)
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
	if err := waitForGatewayService(opts, record.BaseURL); err != nil {
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

func launchEnvironmentWithInterpositionOverrides(base []string, opts LaunchOptions) []string {
	return mergeEnvironmentOverrides(base, map[string]string{
		"EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH":                      opts.BootstrapConfigPath,
		"EPYDIOS_NATIVEAPP_INTERPOSITION_ENABLED":               strconv.FormatBool(opts.InterpositionEnabled),
		"EPYDIOS_NATIVEAPP_INTERPOSITION_UPSTREAM_BASE_URL":     strings.TrimSpace(opts.InterpositionUpstreamBaseURL),
		"EPYDIOS_NATIVEAPP_INTERPOSITION_UPSTREAM_BEARER_TOKEN": strings.TrimSpace(opts.InterpositionUpstreamBearerToken),
	})
}

func mergeEnvironmentOverrides(base []string, overrides map[string]string) []string {
	if len(overrides) == 0 {
		return append([]string(nil), base...)
	}
	result := make([]string, 0, len(base)+len(overrides))
	for _, entry := range base {
		name, _, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		if _, skip := overrides[name]; skip {
			continue
		}
		result = append(result, entry)
	}
	keys := make([]string, 0, len(overrides))
	for key := range overrides {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		result = append(result, key+"="+overrides[key])
	}
	return result
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

	state := &gatewayServiceState{record: record, token: token, opts: opts}
	mux := newGatewayHTTPHandler(state)

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

	createRunHook              func(ctx context.Context, req runtimeapi.RunCreateRequest) (*runtimeapi.RunRecord, int, *runtimeapi.APIError)
	fetchRunHook               func(ctx context.Context, runID string) (*runtimeapi.RunRecord, int, *runtimeapi.APIError)
	fetchConnectorSettingsHook func(ctx context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError)
	forwardCompatibilityHook   func(ctx context.Context, req compatibilityForwardRequest) (*compatibilityForwardResponse, error)
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

func (s *gatewayServiceState) handleCompatibilityResponsesIngress(w http.ResponseWriter, r *http.Request) {
	if isCompatibilityWebsocketUpgradeRequest(r) {
		s.handleCompatibilityResponsesWebSocket(w, r)
		return
	}
	s.handleCompatibilityResponses(w, r)
}

func (s *gatewayServiceState) handleCompatibilityResponses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeCompatibilityError(w, http.StatusMethodNotAllowed, "invalid_request_error", "epydios_method_not_allowed", fmt.Sprintf("method not allowed for %s", compatibilityForwardPathForRequest(r)), nil)
		return
	}
	if !s.authorizeCompatibility(w, r) {
		return
	}
	if !s.opts.InterpositionEnabled {
		writeCompatibilityError(w, http.StatusServiceUnavailable, "service_unavailable", "epydios_interposition_disabled", "interposition is disabled in the local launcher configuration", map[string]interface{}{
			"gatewayBaseUrl": s.record.BaseURL,
		})
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4<<20))
	if err != nil {
		writeCompatibilityError(w, http.StatusBadRequest, "invalid_request_error", "epydios_invalid_json", "invalid JSON body", map[string]interface{}{"error": err.Error()})
		return
	}
	req, operationClass, err := buildCompatibilityGovernedActionRequest(r, body)
	if err != nil {
		fmt.Fprintf(os.Stderr, "epydios compatibility HTTP decode failed path=%s preview=%q error=%v\n", compatibilityForwardPathForRequest(r), compatibilityBodyPreview(body), err)
		writeCompatibilityError(w, http.StatusBadRequest, "invalid_request_error", "epydios_invalid_interposition_request", err.Error(), nil)
		return
	}

	gatewayRequestID := newGatewayRequestID()
	r.Header.Set("X-Epydios-Upstream-Protocol", "compatibility_proxy")
	r.Header.Set("X-Epydios-Client-Surface", "codex")
	if strings.TrimSpace(operationClass) != "" {
		r.Header.Set("X-Epydios-Operation-Class", operationClass)
	}
	interposition := normalizeGatewayInterpositionEnvelope(req, r, gatewayRequestID, body)
	runReq := buildGatewayRuntimeRunRequest(req, gatewayRequestID, interposition)
	run, statusCode, apiErr := s.createRuntimeRun(r.Context(), runReq)
	if apiErr != nil {
		writeCompatibilityError(w, statusCode, "invalid_request_error", "epydios_runtime_rejected", apiErr.Message, map[string]interface{}{
			"gatewayRequestId":       gatewayRequestID,
			"interpositionRequestId": interposition.InterpositionRequestID,
			"details":                apiErr.Details,
		})
		return
	}

	result := buildGatewayResult(s.record.BaseURL, gatewayRequestID, interposition.InterpositionRequestID, *run, true)
	interposition.State = gatewayInterpositionStateFromRun(*run, true)
	record := gatewayRequestRecord{
		GatewayRequestID: gatewayRequestID,
		CreatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		UpdatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		TenantID:         req.TenantID,
		ProjectID:        req.ProjectID,
		EnvironmentID:    req.EnvironmentID,
		Client:           req.Client,
		Request:          req,
		Interposition:    interposition,
		Result:           result,
	}
	if err := writeGatewayRequestRecord(s.record.RequestsRoot, record); err != nil {
		writeCompatibilityError(w, http.StatusInternalServerError, "server_error", "epydios_persist_failed", "failed to persist interposed request record", map[string]interface{}{
			"gatewayRequestId":       gatewayRequestID,
			"interpositionRequestId": interposition.InterpositionRequestID,
		})
		return
	}

	holdsRoot := gatewayHoldRecordsRoot(s.record.RequestsRoot)
	if result.ApprovalRequired {
		hold := buildGatewayHoldRecord(interposition, req.Client, result, *run)
		if err := writeGatewayHoldRecord(holdsRoot, hold); err != nil {
			writeCompatibilityError(w, http.StatusInternalServerError, "server_error", "epydios_hold_persist_failed", "failed to persist approval hold", map[string]interface{}{
				"gatewayRequestId":       gatewayRequestID,
				"interpositionRequestId": interposition.InterpositionRequestID,
			})
			return
		}
		resolvedHold, waitErr := s.waitForCompatibilityHoldResolution(r.Context(), holdsRoot, record.Interposition.InterpositionRequestID)
		if waitErr != nil {
			if r.Context().Err() != nil {
				return
			}
			writeCompatibilityError(w, http.StatusGatewayTimeout, "request_timeout", "epydios_hold_resolution_failed", waitErr.Error(), map[string]interface{}{
				"gatewayRequestId":       gatewayRequestID,
				"interpositionRequestId": record.Interposition.InterpositionRequestID,
				"runId":                  result.RunID,
				"approvalId":             result.ApprovalID,
			})
			return
		}
		switch strings.ToLower(strings.TrimSpace(resolvedHold.State)) {
		case "approval_denied":
			writeCompatibilityError(w, http.StatusForbidden, "permission_denied", "epydios_approval_denied", firstNonEmpty(resolvedHold.ResolutionReason, "request denied in Epydios Companion"), map[string]interface{}{
				"gatewayRequestId":       gatewayRequestID,
				"interpositionRequestId": resolvedHold.InterpositionRequestID,
				"runId":                  resolvedHold.RunID,
				"approvalId":             resolvedHold.ApprovalID,
			})
			return
		case "timed_out":
			writeCompatibilityError(w, http.StatusRequestTimeout, "request_timeout", "epydios_approval_timeout", firstNonEmpty(resolvedHold.ResolutionReason, "approval window expired before the request could resume"), map[string]interface{}{
				"gatewayRequestId":       gatewayRequestID,
				"interpositionRequestId": resolvedHold.InterpositionRequestID,
				"runId":                  resolvedHold.RunID,
				"approvalId":             resolvedHold.ApprovalID,
			})
			return
		case "approval_granted":
			if _, err := updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "resumed_forwarding", "ALLOW", false, "resumed_forwarding"); err != nil {
				writeCompatibilityError(w, http.StatusInternalServerError, "server_error", "epydios_resume_failed", "failed to resume approved request", map[string]interface{}{
					"gatewayRequestId":       gatewayRequestID,
					"interpositionRequestId": resolvedHold.InterpositionRequestID,
					"runId":                  resolvedHold.RunID,
					"approvalId":             resolvedHold.ApprovalID,
				})
				return
			}
		default:
			writeCompatibilityError(w, http.StatusConflict, "invalid_request_error", "epydios_hold_state_invalid", fmt.Sprintf("hold resolved into unexpected state %q", resolvedHold.State), map[string]interface{}{
				"gatewayRequestId":       gatewayRequestID,
				"interpositionRequestId": resolvedHold.InterpositionRequestID,
				"runId":                  resolvedHold.RunID,
				"approvalId":             resolvedHold.ApprovalID,
			})
			return
		}
	}

	forwarded, err := s.forwardCompatibility(r.Context(), compatibilityForwardRequest{
		Path:        compatibilityForwardPathForRequest(r),
		Body:        body,
		Headers:     cloneCompatibilityRequestHeaders(r.Header),
		BaseURL:     s.opts.InterpositionUpstreamBaseURL,
		BearerToken: s.opts.InterpositionUpstreamBearerToken,
	})
	if err != nil {
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "failed", strings.ToUpper(strings.TrimSpace(result.PolicyDecision)), false, "failed")
		if result.ApprovalRequired {
			_, _ = updateGatewayHoldRecordState(holdsRoot, record.Interposition.InterpositionRequestID, "failed", err.Error(), false)
		}
		writeCompatibilityError(w, http.StatusServiceUnavailable, "service_unavailable", "epydios_interposition_unavailable", err.Error(), map[string]interface{}{
			"gatewayRequestId":       gatewayRequestID,
			"interpositionRequestId": record.Interposition.InterpositionRequestID,
			"runId":                  result.RunID,
			"approvalId":             result.ApprovalID,
		})
		return
	}

	if forwarded.StatusCode >= 400 {
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "failed", strings.ToUpper(strings.TrimSpace(result.PolicyDecision)), false, "failed")
		if result.ApprovalRequired {
			_, _ = updateGatewayHoldRecordState(holdsRoot, record.Interposition.InterpositionRequestID, "failed", fmt.Sprintf("upstream returned status %d", forwarded.StatusCode), false)
		}
	} else {
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "completed", "ALLOW", false, "completed")
		if result.ApprovalRequired {
			_, _ = updateGatewayHoldRecordState(holdsRoot, record.Interposition.InterpositionRequestID, "completed", "", false)
		}
	}
	writeCompatibilityForwardedResponse(w, forwarded, map[string]string{
		"X-Epydios-Gateway-Request-Id":       gatewayRequestID,
		"X-Epydios-Interposition-Request-Id": record.Interposition.InterpositionRequestID,
		"X-Epydios-Run-Id":                   result.RunID,
		"X-Epydios-Approval-Id":              result.ApprovalID,
	})
}

func compatibilityForwardPathForRequest(r *http.Request) string {
	switch strings.TrimSpace(r.URL.Path) {
	case "/responses":
		return "/responses"
	default:
		return "/v1/responses"
	}
}

func (s *gatewayServiceState) handleCompatibilityResponsesWebSocket(w http.ResponseWriter, r *http.Request) {
	if !isCompatibilityWebsocketUpgradeRequest(r) {
		writeCompatibilityError(w, http.StatusUpgradeRequired, "invalid_request_error", "epydios_websocket_upgrade_required", "websocket upgrade required for /responses", nil)
		return
	}
	if !s.opts.InterpositionEnabled {
		writeCompatibilityError(w, http.StatusServiceUnavailable, "service_unavailable", "epydios_interposition_disabled", "interposition is disabled in the local launcher configuration", map[string]interface{}{
			"gatewayBaseUrl": s.record.BaseURL,
		})
		return
	}
	if !s.authorizeCompatibility(w, r) {
		return
	}

	clientConn, err := upgradeCompatibilityWebsocket(w, r)
	if err != nil {
		return
	}
	defer clientConn.Close()

	messageType, firstMessage, err := clientConn.ReadMessage()
	if err != nil {
		return
	}
	if messageType != websocket.TextMessage {
		writeCompatibilityWebsocketFailure(clientConn, "epydios_invalid_interposition_request", "expected initial text frame on /responses", "invalid_request_error")
		return
	}
	if isCompatibilityWebsocketPrewarmRequest(r, firstMessage) {
		writeCompatibilityWebsocketPrewarmResponse(clientConn)
		return
	}

	req, operationClass, normalizedBody, err := buildCompatibilityGovernedActionRequestFromWebsocketMessage(r, firstMessage)
	if err != nil {
		writeCompatibilityWebsocketFailure(clientConn, "epydios_invalid_interposition_request", err.Error(), "invalid_request_error")
		return
	}

	gatewayRequestID := newGatewayRequestID()
	normalizedReq := cloneCompatibilityRequestContext(r, "/responses", "compatibility_websocket", operationClass)
	interposition := normalizeGatewayInterpositionEnvelope(req, normalizedReq, gatewayRequestID, normalizedBody)
	interposition.WebsocketTrace.ClientInitialAtUTC = time.Now().UTC().Format(time.RFC3339)
	if existing, matchStrategy, ok := findGatewayRequestRecordForInterpositionRetry(s.record.RequestsRoot, interposition); ok {
		_, _ = updateGatewayRequestRecordRetryObservation(s.record.RequestsRoot, existing.GatewayRequestID, matchStrategy, strings.TrimSpace(interposition.WebsocketTrace.RetryKey))
		switch strings.ToLower(strings.TrimSpace(existing.Result.State)) {
		case "completed", "failed", "rejected", "timed_out":
			if event := replayableCompatibilityWebsocketEvent(existing); len(event) > 0 {
				_ = clientConn.WriteMessage(websocket.TextMessage, event)
				_ = clientConn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "replayed cached interposition result"), time.Now().Add(250*time.Millisecond))
				return
			}
			writeCompatibilityWebsocketFailure(clientConn, "epydios_request_already_completed", "matching interposed request already completed but no replay event is available", "server_error")
			return
		default:
			writeCompatibilityWebsocketFailure(clientConn, "epydios_request_in_progress", "matching interposed request is already in progress", "server_error")
			return
		}
	}
	runReq := buildGatewayRuntimeRunRequest(req, gatewayRequestID, interposition)
	run, statusCode, apiErr := s.createRuntimeRun(r.Context(), runReq)
	if apiErr != nil {
		writeCompatibilityWebsocketFailure(clientConn, "epydios_runtime_rejected", apiErr.Message, compatibilityErrorType(statusCode))
		return
	}

	result := buildGatewayResult(s.record.BaseURL, gatewayRequestID, interposition.InterpositionRequestID, *run, true)
	interposition.State = gatewayInterpositionStateFromRun(*run, true)
	record := gatewayRequestRecord{
		GatewayRequestID: gatewayRequestID,
		CreatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		UpdatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		TenantID:         req.TenantID,
		ProjectID:        req.ProjectID,
		EnvironmentID:    req.EnvironmentID,
		Client:           req.Client,
		Request:          req,
		Interposition:    interposition,
		Result:           result,
	}
	if err := writeGatewayRequestRecord(s.record.RequestsRoot, record); err != nil {
		writeCompatibilityWebsocketFailure(clientConn, "epydios_persist_failed", "failed to persist interposed request record", "server_error")
		return
	}

	holdsRoot := gatewayHoldRecordsRoot(s.record.RequestsRoot)
	if result.ApprovalRequired {
		hold := buildGatewayHoldRecord(interposition, req.Client, result, *run)
		if err := writeGatewayHoldRecord(holdsRoot, hold); err != nil {
			writeCompatibilityWebsocketFailure(clientConn, "epydios_hold_persist_failed", "failed to persist approval hold", "server_error")
			return
		}
		resolvedHold, waitErr := s.waitForCompatibilityHoldResolution(r.Context(), holdsRoot, record.Interposition.InterpositionRequestID)
		if waitErr != nil {
			if r.Context().Err() == nil {
				writeCompatibilityWebsocketFailure(clientConn, "epydios_hold_resolution_failed", waitErr.Error(), "request_timeout")
			}
			return
		}
		switch strings.ToLower(strings.TrimSpace(resolvedHold.State)) {
		case "approval_denied":
			writeCompatibilityWebsocketFailure(clientConn, "epydios_approval_denied", firstNonEmpty(resolvedHold.ResolutionReason, "request denied in Epydios Companion"), "permission_denied")
			return
		case "timed_out":
			writeCompatibilityWebsocketFailure(clientConn, "epydios_approval_timeout", firstNonEmpty(resolvedHold.ResolutionReason, "approval window expired before the request could resume"), "request_timeout")
			return
		case "approval_granted":
			if _, err := updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "resumed_forwarding", "ALLOW", false, "resumed_forwarding"); err != nil {
				writeCompatibilityWebsocketFailure(clientConn, "epydios_resume_failed", "failed to resume approved request", "server_error")
				return
			}
		default:
			writeCompatibilityWebsocketFailure(clientConn, "epydios_hold_state_invalid", fmt.Sprintf("hold resolved into unexpected state %q", resolvedHold.State), "invalid_request_error")
			return
		}
	}

	if _, err := updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "forwarding", "ALLOW", false, "forwarding"); err != nil {
		writeCompatibilityWebsocketFailure(clientConn, "epydios_forwarding_state_failed", "failed to persist forwarding state", "server_error")
		return
	}

	upstreamConn, err := s.dialCompatibilityResponsesWebsocket(r.Context(), normalizedReq.Header)
	if err != nil {
		fmt.Fprintf(os.Stderr, "epydios compatibility websocket dial failed request=%s upstream=%s error=%v\n", gatewayRequestID, strings.TrimSpace(s.opts.InterpositionUpstreamBaseURL), err)
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "failed", strings.ToUpper(strings.TrimSpace(result.PolicyDecision)), false, "failed")
		writeCompatibilityWebsocketFailure(clientConn, "epydios_interposition_unavailable", err.Error(), "service_unavailable")
		return
	}
	defer upstreamConn.Close()

	if err := upstreamConn.WriteMessage(websocket.TextMessage, firstMessage); err != nil {
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "failed", strings.ToUpper(strings.TrimSpace(result.PolicyDecision)), false, "failed")
		writeCompatibilityWebsocketFailure(clientConn, "epydios_interposition_unavailable", fmt.Sprintf("forward websocket request: %v", err), "service_unavailable")
		return
	}

	resultState, proxyErr := s.proxyCompatibilityResponsesWebsocket(clientConn, upstreamConn, gatewayRequestID)
	_, _ = updateGatewayRequestRecordWebsocketTrace(s.record.RequestsRoot, gatewayRequestID, resultState.Trace)
	switch {
	case resultState.Completed:
		if event := replayableWebsocketTerminalEvent(resultState); len(event) > 0 {
			_, _ = updateGatewayRequestRecordTerminalWebsocketEvent(s.record.RequestsRoot, gatewayRequestID, event)
		}
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "completed", "ALLOW", false, "completed")
		return
	case resultState.Failed:
		if event := replayableWebsocketTerminalEvent(resultState); len(event) > 0 {
			_, _ = updateGatewayRequestRecordTerminalWebsocketEvent(s.record.RequestsRoot, gatewayRequestID, event)
		}
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "failed", "ALLOW", false, "failed")
		return
	}
	if proxyErr == nil {
		return
	}
	if resultState.SemanticDone && !resultState.Failed {
		if event := replayableWebsocketTerminalEvent(resultState); len(event) > 0 {
			_, _ = updateGatewayRequestRecordTerminalWebsocketEvent(s.record.RequestsRoot, gatewayRequestID, event)
		}
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "completed", "ALLOW", false, "completed")
		return
	}
	if !isCompatibilityWebsocketClosure(proxyErr) {
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, gatewayRequestID, "failed", "ALLOW", false, "failed")
	}
}

func (s *gatewayServiceState) handleGovernedActions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeGatewayAPIError(w, http.StatusMethodNotAllowed, "", "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	var req gatewayGovernedActionRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	if !populateAndValidateGatewayRequest(&req, r) {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_REQUEST", "missing required governed action fields", false, nil)
		return
	}
	gatewayRequestID := newGatewayRequestID()
	interposition := normalizeGatewayInterpositionEnvelope(req, r, gatewayRequestID, body)
	runReq := buildGatewayRuntimeRunRequest(req, gatewayRequestID, interposition)
	run, statusCode, apiErr := s.createRuntimeRun(r.Context(), runReq)
	if apiErr != nil {
		details := cloneGatewayDetails(apiErr.Details)
		details["gatewayRequestId"] = gatewayRequestID
		details["interpositionRequestId"] = interposition.InterpositionRequestID
		writeGatewayAPIError(w, statusCode, gatewayRequestID, apiErr.ErrorCode, apiErr.Message, apiErr.Retryable, details)
		return
	}
	result := buildGatewayResult(s.record.BaseURL, gatewayRequestID, interposition.InterpositionRequestID, *run, true)
	interposition.State = gatewayInterpositionStateFromRun(*run, true)
	record := gatewayRequestRecord{
		GatewayRequestID: gatewayRequestID,
		CreatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		UpdatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		TenantID:         req.TenantID,
		ProjectID:        req.ProjectID,
		EnvironmentID:    req.EnvironmentID,
		Client:           req.Client,
		Request:          req,
		Interposition:    interposition,
		Result:           result,
	}
	if err := writeGatewayRequestRecord(s.record.RequestsRoot, record); err != nil {
		writeGatewayAPIError(w, http.StatusInternalServerError, gatewayRequestID, "GATEWAY_PERSIST_FAILED", "failed to persist gateway request record", true, map[string]interface{}{"error": err.Error()})
		return
	}
	if result.ApprovalRequired {
		hold := buildGatewayHoldRecord(interposition, req.Client, result, *run)
		if err := writeGatewayHoldRecord(gatewayHoldRecordsRoot(s.record.RequestsRoot), hold); err != nil {
			writeGatewayAPIError(w, http.StatusInternalServerError, gatewayRequestID, "GATEWAY_HOLD_PERSIST_FAILED", "failed to persist gateway hold record", true, map[string]interface{}{"error": err.Error()})
			return
		}
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
			record.Interposition.State = gatewayInterpositionStateFromRun(*run, false)
			record.Result = buildGatewayResult(s.record.BaseURL, gatewayRequestID, record.Interposition.InterpositionRequestID, *run, false)
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
		RunID:              run.RunID,
		ApprovalID:         gatewayApprovalID(*run),
		State:              gatewayStateFromRun(*run, false),
		InterpositionState: gatewayInterpositionStateFromRun(*run, false),
		Status:             string(run.Status),
		PolicyDecision:     strings.ToUpper(strings.TrimSpace(run.PolicyDecision)),
		ApprovalRequired:   strings.EqualFold(strings.TrimSpace(run.PolicyDecision), "DEFER"),
		ReceiptRef:         extractGatewayReceiptRef(*run),
		Run:                *run,
	}
	writeGatewayJSON(w, http.StatusOK, resp)
}

func (s *gatewayServiceState) authorizeCompatibility(w http.ResponseWriter, r *http.Request) bool {
	if isTrustedCompatibilityLoopbackCodexRequest(r) {
		return true
	}
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		writeCompatibilityError(w, http.StatusUnauthorized, "authentication_error", "epydios_gateway_auth_required", "missing bearer token", nil)
		return false
	}
	token := strings.TrimSpace(authHeader[len("Bearer "):])
	if token == "" || token != s.token {
		writeCompatibilityError(w, http.StatusUnauthorized, "authentication_error", "epydios_gateway_auth_invalid", "invalid bearer token", nil)
		return false
	}
	return true
}

func isTrustedCompatibilityLoopbackCodexRequest(r *http.Request) bool {
	if !isLoopbackRemoteAddr(r.RemoteAddr) {
		return false
	}
	if !strings.Contains(strings.ToLower(strings.TrimSpace(firstNonEmpty(
		r.Header.Get("Originator"),
		r.Header.Get("User-Agent"),
	))), "codex") {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(r.URL.Path), "/responses") && isCompatibilityWebsocketUpgradeRequest(r) {
		return true
	}
	if strings.TrimSpace(r.Header.Get("Session_id")) == "" {
		return false
	}
	if strings.TrimSpace(r.Header.Get("X-Client-Request-Id")) == "" {
		return false
	}
	return true
}

func isLoopbackRemoteAddr(remoteAddr string) bool {
	addr := strings.TrimSpace(remoteAddr)
	if addr == "" {
		return false
	}
	if host, _, err := net.SplitHostPort(addr); err == nil {
		addr = host
	}
	ip := net.ParseIP(strings.Trim(addr, "[]"))
	return ip != nil && ip.IsLoopback()
}

func buildCompatibilityGovernedActionRequest(httpReq *http.Request, body []byte) (gatewayGovernedActionRequest, string, error) {
	body, err := decodeCompatibilityRequestBody(httpReq.Header, body)
	if err != nil {
		return gatewayGovernedActionRequest{}, "", err
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return gatewayGovernedActionRequest{}, "", fmt.Errorf("decode compatibility request: %w", err)
	}
	metadata := compatibilityMetadata(payload["metadata"])
	model := firstNonEmpty(
		strings.TrimSpace(interfaceString(payload["model"])),
		compatibilityMetadataString(metadata, "model", "profileModel"),
		"gpt-5-codex",
	)
	summary := compatibilityInputSummary(payload["input"])
	instructions := strings.TrimSpace(interfaceString(payload["instructions"]))
	operationClass := firstNonEmpty(
		httpReq.Header.Get("X-Epydios-Operation-Class"),
		compatibilityMetadataString(metadata, "operationClass", "operation_class"),
	)
	if operationClass == "" {
		if len(compatibilityTools(payload["tools"])) > 0 {
			operationClass = "tool_action"
		} else {
			operationClass = "conversation_turn"
		}
	}
	actionType := firstNonEmpty(
		httpReq.Header.Get("X-Epydios-Action-Type"),
		compatibilityMetadataString(metadata, "actionType", "action_type"),
	)
	targetType := firstNonEmpty(
		httpReq.Header.Get("X-Epydios-Target-Type"),
		compatibilityMetadataString(metadata, "targetType", "target_type"),
	)
	targetRef := firstNonEmpty(
		httpReq.Header.Get("X-Epydios-Target-Ref"),
		compatibilityMetadataString(metadata, "targetRef", "target_ref", "command"),
	)
	if actionType == "" {
		actionType = "model.response"
	}
	if targetType == "" {
		targetType = "model"
	}
	if targetRef == "" {
		targetRef = model
	}

	input := map[string]interface{}{
		"model": model,
		"input": payload["input"],
	}
	if instructions != "" {
		input["instructions"] = instructions
	}
	if tools := compatibilityTools(payload["tools"]); len(tools) > 0 {
		input["tools"] = tools
	}
	if len(metadata) > 0 {
		input["metadata"] = metadata
	}
	if summary != "" {
		input["summary"] = summary
		input["title"] = firstNonEmpty(
			compatibilityMetadataString(metadata, "title", "requestTitle"),
			summary,
		)
	}

	req := gatewayGovernedActionRequest{
		TenantID: firstNonEmpty(
			httpReq.Header.Get("X-Epydios-Tenant-Id"),
			compatibilityMetadataString(metadata, "tenantId", "tenant_id"),
			"tenant-local",
		),
		ProjectID: firstNonEmpty(
			httpReq.Header.Get("X-Epydios-Project-Id"),
			compatibilityMetadataString(metadata, "projectId", "project_id"),
			"project-local",
		),
		EnvironmentID: firstNonEmpty(
			httpReq.Header.Get("X-Epydios-Environment-Id"),
			compatibilityMetadataString(metadata, "environmentId", "environment_id"),
			"local",
		),
		ActionType: actionType,
		TargetType: targetType,
		TargetRef:  targetRef,
		Input:      input,
		Client: gatewayClientIdentity{
			ID: firstNonEmpty(
				httpReq.Header.Get("X-Epydios-Client-Id"),
				compatibilityMetadataString(metadata, "clientId", "client_id"),
				"client-codex",
			),
			Name: firstNonEmpty(
				httpReq.Header.Get("X-Epydios-Client-Name"),
				compatibilityMetadataString(metadata, "clientName", "client_name"),
				"Codex",
			),
			Version: firstNonEmpty(
				httpReq.Header.Get("X-Epydios-Client-Version"),
				httpReq.Header.Get("X-Stainless-Package-Version"),
				compatibilityMetadataString(metadata, "clientVersion", "client_version"),
			),
		},
		IdempotencyKey: firstNonEmpty(
			httpReq.Header.Get("Idempotency-Key"),
			compatibilityMetadataString(metadata, "idempotencyKey", "idempotency_key", "clientRequestId", "client_request_id"),
		),
		RequestedExecutionProfile: firstNonEmpty(
			httpReq.Header.Get("X-Epydios-Requested-Execution-Profile"),
			compatibilityMetadataString(metadata, "requestedExecutionProfile", "requested_execution_profile"),
		),
		RequestedAuthorityRef: firstNonEmpty(
			httpReq.Header.Get("X-Epydios-Requested-Authority-Ref"),
			compatibilityMetadataString(metadata, "requestedAuthorityRef", "requested_authority_ref"),
		),
		Reason: firstNonEmpty(
			compatibilityMetadataString(metadata, "reason", "requestReason"),
			instructions,
			"Requested from Codex compatibility flow",
		),
	}
	return req, operationClass, nil
}

func decodeCompatibilityRequestBody(headers http.Header, body []byte) ([]byte, error) {
	decoded := append([]byte(nil), body...)
	encodings := compatibilityContentEncodings(headers.Get("Content-Encoding"))
	if len(encodings) == 0 {
		switch {
		case hasCompatibilityZstdMagic(decoded):
			encodings = []string{"zstd"}
		case hasCompatibilityGzipMagic(decoded):
			encodings = []string{"gzip"}
		}
	}
	for i := len(encodings) - 1; i >= 0; i-- {
		encoding := encodings[i]
		switch encoding {
		case "", "identity":
			continue
		case "zstd":
			reader, err := zstd.NewReader(bytes.NewReader(decoded))
			if err != nil {
				return nil, fmt.Errorf("decode compatibility request body (%s): %w", encoding, err)
			}
			nextBody, err := io.ReadAll(reader)
			reader.Close()
			if err != nil {
				return nil, fmt.Errorf("decode compatibility request body (%s): %w", encoding, err)
			}
			decoded = nextBody
		case "gzip", "x-gzip":
			reader, err := gzip.NewReader(bytes.NewReader(decoded))
			if err != nil {
				return nil, fmt.Errorf("decode compatibility request body (%s): %w", encoding, err)
			}
			nextBody, err := io.ReadAll(reader)
			reader.Close()
			if err != nil {
				return nil, fmt.Errorf("decode compatibility request body (%s): %w", encoding, err)
			}
			decoded = nextBody
		default:
			return nil, fmt.Errorf("decode compatibility request body: unsupported content encoding %q", encoding)
		}
	}
	return decoded, nil
}

func compatibilityContentEncodings(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parts := strings.Split(value, ",")
	encodings := make([]string, 0, len(parts))
	for _, part := range parts {
		encoding := strings.ToLower(strings.TrimSpace(part))
		if encoding == "" {
			continue
		}
		if idx := strings.IndexByte(encoding, ';'); idx >= 0 {
			encoding = strings.TrimSpace(encoding[:idx])
		}
		if encoding != "" {
			encodings = append(encodings, encoding)
		}
	}
	return encodings
}

func hasCompatibilityZstdMagic(body []byte) bool {
	return len(body) >= 4 &&
		body[0] == 0x28 &&
		body[1] == 0xb5 &&
		body[2] == 0x2f &&
		body[3] == 0xfd
}

func hasCompatibilityGzipMagic(body []byte) bool {
	return len(body) >= 2 && body[0] == 0x1f && body[1] == 0x8b
}

func (s *gatewayServiceState) waitForCompatibilityHoldResolution(ctx context.Context, holdsRoot string, interpositionRequestID string) (GatewayHoldRecord, error) {
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for {
		record, err := readGatewayHoldRecord(holdsRoot, interpositionRequestID)
		if err != nil {
			return GatewayHoldRecord{}, err
		}
		state := strings.ToLower(strings.TrimSpace(record.State))
		switch state {
		case "approval_granted", "approval_denied", "timed_out", "completed", "failed":
			return record, nil
		}
		deadline := parseGatewayTime(record.HoldDeadlineAtUTC)
		if !deadline.IsZero() && time.Now().UTC().After(deadline) {
			timedOut, err := markGatewayHoldTimedOut(holdsRoot, s.record.RequestsRoot, interpositionRequestID)
			if err != nil {
				return GatewayHoldRecord{}, err
			}
			return timedOut, nil
		}
		select {
		case <-ctx.Done():
			return GatewayHoldRecord{}, ctx.Err()
		case <-ticker.C:
		}
	}
}

func (s *gatewayServiceState) forwardCompatibility(ctx context.Context, req compatibilityForwardRequest) (*compatibilityForwardResponse, error) {
	if s.forwardCompatibilityHook != nil {
		return s.forwardCompatibilityHook(ctx, req)
	}
	if strings.TrimSpace(req.BaseURL) == "" {
		return nil, fmt.Errorf("interposition upstream is not configured")
	}
	requestURL, err := appendGatewayRequestPath(req.BaseURL, req.Path)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, bytes.NewReader(req.Body))
	if err != nil {
		return nil, fmt.Errorf("build compatibility upstream request: %w", err)
	}
	for key, values := range req.Headers {
		if strings.EqualFold(strings.TrimSpace(key), "Authorization") || strings.EqualFold(strings.TrimSpace(key), "Host") {
			continue
		}
		for _, value := range values {
			httpReq.Header.Add(key, value)
		}
	}
	if strings.TrimSpace(req.BearerToken) != "" {
		httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(req.BearerToken))
	} else if authHeader, err := extractCompatibilityPassthroughAuth(req.Headers); err == nil {
		httpReq.Header.Set("Authorization", authHeader)
	}
	if strings.TrimSpace(httpReq.Header.Get("Content-Type")) == "" {
		httpReq.Header.Set("Content-Type", "application/json")
	}
	resp, err := compatibilityHTTPClientFactory().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("forward compatibility request: %w", err)
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read compatibility upstream response: %w", err)
	}
	return &compatibilityForwardResponse{
		StatusCode: resp.StatusCode,
		Headers:    resp.Header.Clone(),
		Body:       responseBody,
	}, nil
}

func (s *gatewayServiceState) dialCompatibilityResponsesWebsocket(ctx context.Context, headers http.Header) (*websocket.Conn, error) {
	if strings.TrimSpace(s.opts.InterpositionUpstreamBaseURL) == "" {
		return nil, fmt.Errorf("interposition upstream is not configured")
	}
	targetURL, err := appendGatewayWebsocketPath(s.opts.InterpositionUpstreamBaseURL, "/responses")
	if err != nil {
		return nil, err
	}
	requestHeaders := cloneCompatibilityWebsocketHeaders(headers, strings.TrimSpace(s.opts.InterpositionUpstreamBearerToken))
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}
	conn, resp, err := dialer.DialContext(ctx, targetURL, requestHeaders)
	if err != nil {
		if resp == nil {
			return nil, fmt.Errorf("dial compatibility websocket: %w", err)
		}
		return nil, fmt.Errorf("dial compatibility websocket: upstream status %s", resp.Status)
	}
	return conn, nil
}

func (s *gatewayServiceState) proxyCompatibilityResponsesWebsocket(clientConn *websocket.Conn, upstreamConn *websocket.Conn, gatewayRequestID string) (compatibilityUpstreamWebsocketResult, error) {
	type upstreamOutcome struct {
		completed     bool
		failed        bool
		semanticDone  bool
		semanticEvent []byte
		terminalEvent []byte
		trace         gatewayWebsocketTrace
		err           error
	}

	upstreamCh := make(chan upstreamOutcome, 1)
	clientCh := make(chan error, 1)
	clientClosedCh := make(chan struct{})
	var traceMu sync.Mutex
	trace := gatewayWebsocketTrace{
		ProxyStartedAtUTC: time.Now().UTC().Format(time.RFC3339),
	}
	signalClientClosed := func() {
		select {
		case <-clientClosedCh:
		default:
			traceMu.Lock()
			trace.ClientClosedAtUTC = time.Now().UTC().Format(time.RFC3339)
			traceMu.Unlock()
			close(clientClosedCh)
		}
	}

	go func() {
		var outcome compatibilityUpstreamWebsocketResult
		clientWritable := true
		for {
			messageType, message, err := upstreamConn.ReadMessage()
			if err != nil {
				traceMu.Lock()
				outcome.Trace = finalizeCompatibilityWebsocketTrace(trace, err)
				traceMu.Unlock()
				upstreamCh <- upstreamOutcome{
					completed:     outcome.Completed,
					failed:        outcome.Failed,
					semanticDone:  outcome.SemanticDone,
					semanticEvent: append([]byte(nil), outcome.SemanticEvent...),
					terminalEvent: append([]byte(nil), outcome.TerminalEvent...),
					trace:         outcome.Trace,
					err:           err,
				}
				return
			}
			traceMu.Lock()
			if trace.UpstreamFirstAtUTC == "" {
				trace.UpstreamFirstAtUTC = time.Now().UTC().Format(time.RFC3339)
			}
			traceMu.Unlock()
			terminalEventSeen := false
			if messageType == websocket.TextMessage {
				completed, failed, semanticDone, eventType := inspectCompatibilityWebsocketEvent(message)
				if completed {
					outcome.Completed = true
					outcome.TerminalEvent = append([]byte(nil), message...)
					traceMu.Lock()
					trace.UpstreamTerminalAtUTC = time.Now().UTC().Format(time.RFC3339)
					trace.UpstreamTerminalType = eventType
					traceMu.Unlock()
					terminalEventSeen = true
				}
				if failed {
					outcome.Failed = true
					outcome.TerminalEvent = append([]byte(nil), message...)
					traceMu.Lock()
					trace.UpstreamTerminalAtUTC = time.Now().UTC().Format(time.RFC3339)
					trace.UpstreamTerminalType = eventType
					traceMu.Unlock()
					terminalEventSeen = true
				}
				if semanticDone {
					outcome.SemanticDone = true
					outcome.SemanticEvent = append([]byte(nil), message...)
					traceMu.Lock()
					trace.UpstreamSemanticAtUTC = time.Now().UTC().Format(time.RFC3339)
					trace.UpstreamSemanticType = eventType
					traceMu.Unlock()
				}
			}
			select {
			case <-clientClosedCh:
				clientWritable = false
			default:
			}
			if clientWritable {
				if err := clientConn.WriteMessage(messageType, message); err != nil {
					if isCompatibilityWebsocketClosure(err) {
						signalClientClosed()
						if terminalEventSeen {
							traceMu.Lock()
							outcome.Trace = finalizeCompatibilityWebsocketTrace(trace, nil)
							traceMu.Unlock()
							upstreamCh <- upstreamOutcome{
								completed:     outcome.Completed,
								failed:        outcome.Failed,
								semanticDone:  outcome.SemanticDone,
								semanticEvent: append([]byte(nil), outcome.SemanticEvent...),
								terminalEvent: append([]byte(nil), outcome.TerminalEvent...),
								trace:         outcome.Trace,
								err:           nil,
							}
							return
						}
						clientWritable = false
						continue
					}
					traceMu.Lock()
					outcome.Trace = finalizeCompatibilityWebsocketTrace(trace, err)
					traceMu.Unlock()
					upstreamCh <- upstreamOutcome{
						completed:     outcome.Completed,
						failed:        outcome.Failed,
						semanticDone:  outcome.SemanticDone,
						semanticEvent: append([]byte(nil), outcome.SemanticEvent...),
						terminalEvent: append([]byte(nil), outcome.TerminalEvent...),
						trace:         outcome.Trace,
						err:           err,
					}
					return
				}
				if terminalEventSeen {
					traceMu.Lock()
					outcome.Trace = finalizeCompatibilityWebsocketTrace(trace, nil)
					traceMu.Unlock()
					upstreamCh <- upstreamOutcome{
						completed:     outcome.Completed,
						failed:        outcome.Failed,
						semanticDone:  outcome.SemanticDone,
						semanticEvent: append([]byte(nil), outcome.SemanticEvent...),
						terminalEvent: append([]byte(nil), outcome.TerminalEvent...),
						trace:         outcome.Trace,
						err:           nil,
					}
					return
				}
			} else if terminalEventSeen {
				traceMu.Lock()
				outcome.Trace = finalizeCompatibilityWebsocketTrace(trace, nil)
				traceMu.Unlock()
				upstreamCh <- upstreamOutcome{
					completed:     outcome.Completed,
					failed:        outcome.Failed,
					semanticDone:  outcome.SemanticDone,
					semanticEvent: append([]byte(nil), outcome.SemanticEvent...),
					terminalEvent: append([]byte(nil), outcome.TerminalEvent...),
					trace:         outcome.Trace,
					err:           nil,
				}
				return
			}
		}
	}()

	go func() {
		for {
			messageType, message, err := clientConn.ReadMessage()
			if err != nil {
				if isCompatibilityWebsocketClosure(err) {
					signalClientClosed()
				}
				clientCh <- err
				return
			}
			if err := upstreamConn.WriteMessage(messageType, message); err != nil {
				clientCh <- err
				return
			}
		}
	}()

	var clientErr error
	for {
		select {
		case outcome := <-upstreamCh:
			return compatibilityUpstreamWebsocketResult{
				Completed:     outcome.completed,
				Failed:        outcome.failed,
				SemanticDone:  outcome.semanticDone,
				SemanticEvent: outcome.semanticEvent,
				TerminalEvent: outcome.terminalEvent,
				Trace:         outcome.trace,
			}, firstNonNilErr(outcome.err, clientErr)
		case err := <-clientCh:
			if err == nil {
				continue
			}
			clientErr = err
			if !isCompatibilityWebsocketClosure(err) {
				return compatibilityUpstreamWebsocketResult{}, err
			}
			outcome := <-upstreamCh
			return compatibilityUpstreamWebsocketResult{
				Completed:     outcome.completed,
				Failed:        outcome.failed,
				SemanticDone:  outcome.semanticDone,
				SemanticEvent: outcome.semanticEvent,
				TerminalEvent: outcome.terminalEvent,
				Trace:         outcome.trace,
			}, firstNonNilErr(outcome.err, clientErr)
		}
	}
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

func normalizeGatewayInterpositionEnvelope(req gatewayGovernedActionRequest, httpReq *http.Request, gatewayRequestID string, body []byte) gatewayInterpositionEnvelope {
	now := time.Now().UTC().Format(time.RFC3339)
	clientSurface := firstNonEmpty(httpReq.Header.Get("X-Epydios-Client-Surface"), inferGatewayClientSurface(req.Client))
	operationClass := firstNonEmpty(httpReq.Header.Get("X-Epydios-Operation-Class"), "tool_action")
	clientRequestID := firstNonEmpty(
		httpReq.Header.Get("X-Epydios-Client-Request-Id"),
		httpReq.Header.Get("X-Client-Request-Id"),
		strings.TrimSpace(req.IdempotencyKey),
		gatewayRequestID,
	)
	interpositionRequestID := firstNonEmpty(httpReq.Header.Get("X-Epydios-Interposition-Request-Id"), newInterpositionRequestID())
	codexTurnID := extractCodexTurnID(httpReq.Header.Get("X-Codex-Turn-Metadata"))
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = fmt.Sprintf("Requested from %s flow", req.Client.Name)
	}
	title := firstNonEmpty(
		httpReq.Header.Get("X-Epydios-Request-Title"),
		strings.TrimSpace(interfaceString(req.Input["title"])),
		strings.TrimSpace(interfaceString(req.Input["summary"])),
		strings.TrimSpace(req.TargetRef),
	)
	envelope := gatewayInterpositionEnvelope{
		InterpositionRequestID: interpositionRequestID,
		State:                  "normalized",
		ReceivedAtUTC:          now,
		ClientSurface:          clientSurface,
		OperationClass:         operationClass,
		TenantID:               req.TenantID,
		ProjectID:              req.ProjectID,
		EnvironmentID:          req.EnvironmentID,
		ActorRef:               firstNonEmpty(httpReq.Header.Get("X-Epydios-Actor-Ref"), "client:"+req.Client.ID),
		CodexSessionID:         strings.TrimSpace(httpReq.Header.Get("X-Epydios-Codex-Session-Id")),
		CodexConversationID:    strings.TrimSpace(httpReq.Header.Get("X-Epydios-Codex-Conversation-Id")),
		CodexTurnID:            codexTurnID,
		ClientRequestID:        clientRequestID,
		IdempotencyKey:         firstNonEmpty(strings.TrimSpace(req.IdempotencyKey), clientRequestID),
		GovernanceTarget: gatewayGovernanceTarget{
			ActionType: req.ActionType,
			TargetType: req.TargetType,
			TargetRef:  req.TargetRef,
		},
		RequestSummary: gatewayRequestSummary{
			Title:  title,
			Reason: reason,
		},
		Upstream: gatewayUpstreamDescriptor{
			Protocol:   firstNonEmpty(httpReq.Header.Get("X-Epydios-Upstream-Protocol"), "localhost_gateway"),
			Method:     strings.TrimSpace(httpReq.Method),
			Path:       strings.TrimSpace(httpReq.URL.Path),
			Headers:    sanitizeGatewayHeaders(httpReq.Header),
			BodySHA256: gatewayBodySHA256(body),
		},
	}
	envelope.WebsocketTrace.RetryKey = gatewayInterpositionRetryKey(envelope)
	return envelope
}

func buildGatewayRuntimeRunRequest(req gatewayGovernedActionRequest, gatewayRequestID string, interposition gatewayInterpositionEnvelope) runtimeapi.RunCreateRequest {
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
			"interposition_request_id":    interposition.InterpositionRequestID,
			"client_surface":              interposition.ClientSurface,
			"operation_class":             interposition.OperationClass,
			"actor_ref":                   interposition.ActorRef,
			"codex_session_id":            interposition.CodexSessionID,
			"codex_conversation_id":       interposition.CodexConversationID,
			"codex_turn_id":               interposition.CodexTurnID,
			"client_request_id":           interposition.ClientRequestID,
			"upstream_protocol":           interposition.Upstream.Protocol,
			"upstream_method":             interposition.Upstream.Method,
			"upstream_path":               interposition.Upstream.Path,
			"upstream_body_sha256":        interposition.Upstream.BodySHA256,
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
			"gatewayRequestId":       gatewayRequestID,
			"gatewayClientId":        req.Client.ID,
			"gatewayClientName":      req.Client.Name,
			"interpositionRequestId": interposition.InterpositionRequestID,
			"clientSurface":          interposition.ClientSurface,
			"operationClass":         interposition.OperationClass,
			"codexTurnId":            interposition.CodexTurnID,
		},
		Mode: "enforce",
	}
}

func buildGatewayResult(baseURL string, gatewayRequestID string, interpositionRequestID string, run runtimeapi.RunRecord, initial bool) gatewayGovernedActionResult {
	return gatewayGovernedActionResult{
		GatewayRequestID:       gatewayRequestID,
		InterpositionRequestID: interpositionRequestID,
		RunID:                  run.RunID,
		ApprovalID:             gatewayApprovalID(run),
		State:                  gatewayStateFromRun(run, initial),
		InterpositionState:     gatewayInterpositionStateFromRun(run, initial),
		PolicyDecision:         strings.ToUpper(strings.TrimSpace(run.PolicyDecision)),
		ApprovalRequired:       strings.EqualFold(strings.TrimSpace(run.PolicyDecision), "DEFER"),
		ReceiptRef:             extractGatewayReceiptRef(run),
		StatusURL:              fmt.Sprintf("%s/v1/governed-actions/%s", strings.TrimRight(baseURL, "/"), gatewayRequestID),
		RunURL:                 fmt.Sprintf("%s/v1/runs/%s", strings.TrimRight(baseURL, "/"), run.RunID),
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

func gatewayInterpositionStateFromRun(run runtimeapi.RunRecord, initial bool) string {
	decision := strings.ToUpper(strings.TrimSpace(run.PolicyDecision))
	switch decision {
	case "DEFER":
		return "held_pending_approval"
	case "DENY":
		return "failed"
	}
	switch run.Status {
	case runtimeapi.RunStatusCompleted:
		return "completed"
	case runtimeapi.RunStatusFailed:
		return "failed"
	default:
		if initial {
			return "allowed_forwarding"
		}
		return "resumed_forwarding"
	}
}

func gatewayApprovalID(run runtimeapi.RunRecord) string {
	if strings.TrimSpace(run.RunID) == "" {
		return ""
	}
	if strings.EqualFold(strings.TrimSpace(run.PolicyDecision), "DEFER") {
		return "approval-" + strings.TrimSpace(run.RunID)
	}
	return ""
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

func waitForGatewayService(opts LaunchOptions, baseURL string) error {
	probePath := "/healthz"
	failureLabel := "gateway health endpoint did not become ready"
	if strings.TrimSpace(opts.Mode) == modeLive {
		probePath = "/readyz"
		failureLabel = "gateway ready endpoint did not become ready"
	}
	url := strings.TrimRight(strings.TrimSpace(baseURL), "/") + probePath
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
	return fmt.Errorf("%s: %s", failureLabel, url)
}

func gatewayHealthStatus(opts LaunchOptions, baseURL string) (bool, bool, string) {
	base := strings.TrimSpace(baseURL)
	if base == "" {
		return false, false, ""
	}
	if _, detail, ok := probeGatewayEndpoint(strings.TrimRight(base, "/") + "/healthz"); !ok {
		return false, false, detail
	}
	if strings.TrimSpace(opts.Mode) != modeLive {
		return true, true, ""
	}
	_, detail, ok := probeGatewayEndpoint(strings.TrimRight(base, "/") + "/readyz")
	return true, ok, detail
}

func probeGatewayEndpoint(url string) (int, string, bool) {
	client := &http.Client{Timeout: 1500 * time.Millisecond}
	resp, err := client.Get(url)
	if err != nil {
		return 0, err.Error(), false
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return resp.StatusCode, "", true
	}
	return resp.StatusCode, extractGatewayProbeReason(body), false
}

func extractGatewayProbeReason(body []byte) string {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return ""
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err == nil {
		if reason := strings.TrimSpace(fmt.Sprint(payload["reason"])); reason != "" && reason != "<nil>" {
			return reason
		}
		if status := strings.TrimSpace(fmt.Sprint(payload["status"])); status != "" && status != "<nil>" {
			return status
		}
	}
	return trimmed
}

func gatewayHealthStatusDetail(baseURL string, detail string) string {
	if strings.TrimSpace(detail) != "" {
		return detail
	}
	return fmt.Sprintf("gateway ready endpoint did not become ready: %s/readyz", strings.TrimRight(baseURL, "/"))
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

func gatewayHoldRecordsRoot(requestsRoot string) string {
	base := strings.TrimSpace(requestsRoot)
	if base == "" {
		return filepath.Join(resolveProductConfigRoot(""), "localhost-gateway", "holds")
	}
	return filepath.Join(filepath.Dir(base), "holds")
}

func buildGatewayHoldRecord(interposition gatewayInterpositionEnvelope, client gatewayClientIdentity, result gatewayGovernedActionResult, run runtimeapi.RunRecord) GatewayHoldRecord {
	now := time.Now().UTC()
	deadline := now.Add(15 * time.Minute)
	if run.ExpiresAt != nil && run.ExpiresAt.UTC().After(now) {
		deadline = run.ExpiresAt.UTC()
	}
	holdReason := strings.TrimSpace(run.ErrorMessage)
	if holdReason == "" {
		decision := strings.ToUpper(strings.TrimSpace(run.PolicyDecision))
		if decision == "" {
			decision = "UNKNOWN"
		}
		holdReason = fmt.Sprintf("policy decision %s requires approval before upstream forwarding", decision)
	}
	return GatewayHoldRecord{
		InterpositionRequestID: interposition.InterpositionRequestID,
		GatewayRequestID:       result.GatewayRequestID,
		RunID:                  result.RunID,
		ApprovalID:             result.ApprovalID,
		State:                  "held_pending_approval",
		HoldStartedAtUTC:       now.Format(time.RFC3339),
		HoldDeadlineAtUTC:      deadline.Format(time.RFC3339),
		HoldReason:             holdReason,
		ClientSurface:          interposition.ClientSurface,
		SourceClient:           client,
		TenantID:               interposition.TenantID,
		ProjectID:              interposition.ProjectID,
		EnvironmentID:          interposition.EnvironmentID,
		ActorRef:               interposition.ActorRef,
		CodexSessionID:         interposition.CodexSessionID,
		CodexConversationID:    interposition.CodexConversationID,
		GovernanceTarget:       interposition.GovernanceTarget,
		RequestSummary:         interposition.RequestSummary,
		CreatedAtUTC:           now.Format(time.RFC3339),
		UpdatedAtUTC:           now.Format(time.RFC3339),
	}
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

func writeGatewayHoldRecord(root string, record GatewayHoldRecord) error {
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
	return os.WriteFile(filepath.Join(root, sanitizeGatewayRequestID(record.InterpositionRequestID)+".json"), append(data, '\n'), 0o644)
}

func readGatewayHoldRecord(root string, interpositionRequestID string) (GatewayHoldRecord, error) {
	content, err := os.ReadFile(filepath.Join(root, sanitizeGatewayRequestID(interpositionRequestID)+".json"))
	if err != nil {
		return GatewayHoldRecord{}, err
	}
	var record GatewayHoldRecord
	if err := json.Unmarshal(content, &record); err != nil {
		return GatewayHoldRecord{}, err
	}
	return record, nil
}

func ListGatewayHoldRecords(root string) ([]GatewayHoldRecord, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return []GatewayHoldRecord{}, nil
		}
		return nil, err
	}
	items := make([]GatewayHoldRecord, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
			continue
		}
		record, err := readGatewayHoldRecord(root, strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
		if err != nil {
			continue
		}
		items = append(items, record)
	}
	sort.Slice(items, func(i, j int) bool {
		leftPending := strings.EqualFold(strings.TrimSpace(items[i].State), "held_pending_approval")
		rightPending := strings.EqualFold(strings.TrimSpace(items[j].State), "held_pending_approval")
		if leftPending != rightPending {
			return leftPending
		}
		leftTs := parseGatewayTime(items[i].UpdatedAtUTC, items[i].CreatedAtUTC, items[i].HoldStartedAtUTC)
		rightTs := parseGatewayTime(items[j].UpdatedAtUTC, items[j].CreatedAtUTC, items[j].HoldStartedAtUTC)
		return rightTs.Before(leftTs)
	})
	return items, nil
}

func ResolveGatewayHoldRecord(root string, requestsRoot string, interpositionRequestID string, decision string, reason string) (GatewayHoldRecord, error) {
	record, err := readGatewayHoldRecord(root, interpositionRequestID)
	if err != nil {
		return GatewayHoldRecord{}, err
	}
	normalizedDecision := strings.ToUpper(strings.TrimSpace(decision))
	if normalizedDecision != "APPROVE" && normalizedDecision != "DENY" {
		return GatewayHoldRecord{}, fmt.Errorf("decision must be APPROVE or DENY")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	record.Decision = normalizedDecision
	record.ResolutionReason = strings.TrimSpace(reason)
	record.ResolvedAtUTC = now
	record.UpdatedAtUTC = now
	if normalizedDecision == "APPROVE" {
		record.State = "approval_granted"
	} else {
		record.State = "approval_denied"
	}
	if err := writeGatewayHoldRecord(root, record); err != nil {
		return GatewayHoldRecord{}, err
	}
	if strings.TrimSpace(record.GatewayRequestID) != "" && strings.TrimSpace(requestsRoot) != "" {
		if requestRecord, readErr := readGatewayRequestRecord(requestsRoot, record.GatewayRequestID); readErr == nil {
			requestRecord.Interposition.State = record.State
			requestRecord.Result.InterpositionState = record.State
			requestRecord.Result.ApprovalRequired = false
			if normalizedDecision == "APPROVE" {
				requestRecord.Result.PolicyDecision = "ALLOW"
			} else {
				requestRecord.Result.PolicyDecision = "DENY"
			}
			_ = writeGatewayRequestRecord(requestsRoot, requestRecord)
		}
	}
	return record, nil
}

func updateGatewayRequestRecordLifecycleState(root string, gatewayRequestID string, interpositionState string, policyDecision string, approvalRequired bool, resultState string) (gatewayRequestRecord, error) {
	record, err := readGatewayRequestRecord(root, gatewayRequestID)
	if err != nil {
		return gatewayRequestRecord{}, err
	}
	if state := strings.TrimSpace(interpositionState); state != "" {
		record.Interposition.State = state
		record.Result.InterpositionState = state
	}
	if decision := strings.TrimSpace(policyDecision); decision != "" {
		record.Result.PolicyDecision = strings.ToUpper(decision)
	}
	record.Result.ApprovalRequired = approvalRequired
	if state := strings.TrimSpace(resultState); state != "" {
		record.Result.State = state
	}
	if err := writeGatewayRequestRecord(root, record); err != nil {
		return gatewayRequestRecord{}, err
	}
	return record, nil
}

func updateGatewayRequestRecordTerminalWebsocketEvent(root string, gatewayRequestID string, event []byte) (gatewayRequestRecord, error) {
	record, err := readGatewayRequestRecord(root, gatewayRequestID)
	if err != nil {
		return gatewayRequestRecord{}, err
	}
	if len(event) > 0 {
		record.Interposition.TerminalWebsocketEvent = append(json.RawMessage(nil), event...)
	}
	if err := writeGatewayRequestRecord(root, record); err != nil {
		return gatewayRequestRecord{}, err
	}
	return record, nil
}

func updateGatewayRequestRecordWebsocketTrace(root string, gatewayRequestID string, trace gatewayWebsocketTrace) (gatewayRequestRecord, error) {
	record, err := readGatewayRequestRecord(root, gatewayRequestID)
	if err != nil {
		return gatewayRequestRecord{}, err
	}
	current := record.Interposition.WebsocketTrace
	mergeGatewayWebsocketTrace(&current, trace)
	record.Interposition.WebsocketTrace = current
	if err := writeGatewayRequestRecord(root, record); err != nil {
		return gatewayRequestRecord{}, err
	}
	return record, nil
}

func updateGatewayRequestRecordRetryObservation(root string, gatewayRequestID string, matchStrategy string, retryKey string) (gatewayRequestRecord, error) {
	record, err := readGatewayRequestRecord(root, gatewayRequestID)
	if err != nil {
		return gatewayRequestRecord{}, err
	}
	trace := record.Interposition.WebsocketTrace
	if trimmed := strings.TrimSpace(retryKey); trimmed != "" {
		trace.RetryKey = trimmed
	}
	trace.MatchStrategy = strings.TrimSpace(matchStrategy)
	trace.RetryObservedAtUTC = time.Now().UTC().Format(time.RFC3339)
	switch strings.ToLower(strings.TrimSpace(record.Result.State)) {
	case "completed", "failed", "rejected", "timed_out":
		trace.RetryReplayCount++
	default:
		trace.RetryBlockedCount++
	}
	record.Interposition.WebsocketTrace = trace
	if err := writeGatewayRequestRecord(root, record); err != nil {
		return gatewayRequestRecord{}, err
	}
	return record, nil
}

func updateGatewayHoldRecordState(root string, interpositionRequestID string, nextState string, reason string, setResolved bool) (GatewayHoldRecord, error) {
	record, err := readGatewayHoldRecord(root, interpositionRequestID)
	if err != nil {
		return GatewayHoldRecord{}, err
	}
	if state := strings.TrimSpace(nextState); state != "" {
		record.State = state
	}
	if trimmedReason := strings.TrimSpace(reason); trimmedReason != "" {
		record.ResolutionReason = trimmedReason
	}
	if setResolved {
		record.ResolvedAtUTC = time.Now().UTC().Format(time.RFC3339)
	}
	if err := writeGatewayHoldRecord(root, record); err != nil {
		return GatewayHoldRecord{}, err
	}
	return record, nil
}

func markGatewayHoldTimedOut(root string, requestsRoot string, interpositionRequestID string) (GatewayHoldRecord, error) {
	record, err := updateGatewayHoldRecordState(root, interpositionRequestID, "timed_out", "approval deadline expired", true)
	if err != nil {
		return GatewayHoldRecord{}, err
	}
	if strings.TrimSpace(record.GatewayRequestID) != "" && strings.TrimSpace(requestsRoot) != "" {
		if _, err := updateGatewayRequestRecordLifecycleState(requestsRoot, record.GatewayRequestID, "timed_out", "DEFER", false, "timed_out"); err != nil {
			return GatewayHoldRecord{}, err
		}
	}
	return record, nil
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

func listGatewayRequestRecords(root string) ([]gatewayRequestRecord, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return []gatewayRequestRecord{}, nil
		}
		return nil, err
	}
	items := make([]gatewayRequestRecord, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
			continue
		}
		record, err := readGatewayRequestRecord(root, strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
		if err != nil {
			continue
		}
		items = append(items, record)
	}
	sort.Slice(items, func(i, j int) bool {
		leftTs := parseGatewayTime(items[i].UpdatedAtUTC, items[i].CreatedAtUTC, items[i].Interposition.ReceivedAtUTC)
		rightTs := parseGatewayTime(items[j].UpdatedAtUTC, items[j].CreatedAtUTC, items[j].Interposition.ReceivedAtUTC)
		return rightTs.Before(leftTs)
	})
	return items, nil
}

func findGatewayRequestRecordByInterpositionFingerprint(root string, interposition gatewayInterpositionEnvelope) (gatewayRequestRecord, bool) {
	if strings.TrimSpace(interposition.ClientRequestID) == "" || strings.TrimSpace(interposition.CodexSessionID) == "" || strings.TrimSpace(interposition.Upstream.BodySHA256) == "" {
		return gatewayRequestRecord{}, false
	}
	items, err := listGatewayRequestRecords(root)
	if err != nil {
		return gatewayRequestRecord{}, false
	}
	fingerprint := gatewayInterpositionFingerprint(interposition)
	for _, item := range items {
		if gatewayInterpositionFingerprint(item.Interposition) == fingerprint {
			return item, true
		}
	}
	return gatewayRequestRecord{}, false
}

func findGatewayRequestRecordForInterpositionRetry(root string, interposition gatewayInterpositionEnvelope) (gatewayRequestRecord, string, bool) {
	if item, ok := findGatewayRequestRecordByInterpositionRetryKey(root, interposition); ok {
		return item, "retry_key", true
	}
	if item, ok := findGatewayRequestRecordByInterpositionFingerprint(root, interposition); ok {
		return item, "fingerprint", true
	}
	return gatewayRequestRecord{}, "", false
}

func findGatewayRequestRecordByInterpositionRetryKey(root string, interposition gatewayInterpositionEnvelope) (gatewayRequestRecord, bool) {
	retryKey := strings.TrimSpace(gatewayInterpositionRetryKey(interposition))
	if retryKey == "" {
		return gatewayRequestRecord{}, false
	}
	incomingBodySHA := strings.TrimSpace(interposition.Upstream.BodySHA256)
	items, err := listGatewayRequestRecords(root)
	if err != nil {
		return gatewayRequestRecord{}, false
	}
	for _, item := range items {
		if strings.TrimSpace(gatewayInterpositionRetryKey(item.Interposition)) != retryKey {
			continue
		}
		existingBodySHA := strings.TrimSpace(item.Interposition.Upstream.BodySHA256)
		if incomingBodySHA != "" && existingBodySHA != "" && incomingBodySHA != existingBodySHA {
			continue
		}
		return item, true
	}
	return gatewayRequestRecord{}, false
}

func gatewayInterpositionFingerprint(interposition gatewayInterpositionEnvelope) string {
	return strings.Join([]string{
		strings.TrimSpace(interposition.ClientSurface),
		strings.TrimSpace(interposition.CodexSessionID),
		strings.TrimSpace(interposition.ClientRequestID),
		strings.TrimSpace(interposition.Upstream.Path),
		strings.TrimSpace(interposition.Upstream.BodySHA256),
	}, "|")
}

func gatewayInterpositionRetryKey(interposition gatewayInterpositionEnvelope) string {
	if strings.TrimSpace(interposition.CodexSessionID) == "" || strings.TrimSpace(interposition.CodexTurnID) == "" || strings.TrimSpace(interposition.Upstream.Path) == "" {
		return ""
	}
	return strings.Join([]string{
		strings.TrimSpace(interposition.ClientSurface),
		strings.TrimSpace(interposition.CodexSessionID),
		strings.TrimSpace(interposition.CodexTurnID),
		strings.TrimSpace(interposition.Upstream.Path),
	}, "|")
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

func newInterpositionRequestID() string {
	random := make([]byte, 6)
	_, _ = rand.Read(random)
	return fmt.Sprintf("ipreq-%s-%s", time.Now().UTC().Format("20060102T150405Z"), hex.EncodeToString(random))
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

func inferGatewayClientSurface(client gatewayClientIdentity) string {
	joined := strings.ToLower(strings.TrimSpace(client.ID + " " + client.Name))
	if strings.Contains(joined, "codex") {
		return "codex"
	}
	return "gateway_client"
}

func sanitizeGatewayHeaders(header http.Header) map[string]string {
	if len(header) == 0 {
		return nil
	}
	out := map[string]string{}
	for key, values := range header {
		if strings.EqualFold(strings.TrimSpace(key), "Authorization") {
			continue
		}
		trimmed := make([]string, 0, len(values))
		for _, value := range values {
			if item := strings.TrimSpace(value); item != "" {
				trimmed = append(trimmed, item)
			}
		}
		if len(trimmed) == 0 {
			continue
		}
		out[key] = strings.Join(trimmed, ", ")
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func gatewayBodySHA256(body []byte) string {
	sum := sha256.Sum256(body)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func parseGatewayTime(values ...string) time.Time {
	for _, value := range values {
		if parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value)); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func interfaceString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func compatibilityMetadata(value interface{}) map[string]interface{} {
	typed, ok := value.(map[string]interface{})
	if !ok || len(typed) == 0 {
		return map[string]interface{}{}
	}
	return typed
}

func compatibilityTools(value interface{}) []interface{} {
	items, ok := value.([]interface{})
	if !ok {
		return nil
	}
	return items
}

func compatibilityMetadataString(metadata map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(interfaceString(metadata[key])); value != "" {
			return value
		}
	}
	return ""
}

func compatibilityInputSummary(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []interface{}:
		for _, item := range typed {
			switch entry := item.(type) {
			case string:
				if trimmed := strings.TrimSpace(entry); trimmed != "" {
					return trimmed
				}
			case map[string]interface{}:
				if trimmed := strings.TrimSpace(firstNonEmpty(
					interfaceString(entry["text"]),
					interfaceString(entry["input_text"]),
					interfaceString(entry["content"]),
					interfaceString(entry["value"]),
				)); trimmed != "" {
					return trimmed
				}
			}
		}
	case map[string]interface{}:
		return strings.TrimSpace(firstNonEmpty(
			interfaceString(typed["text"]),
			interfaceString(typed["input_text"]),
			interfaceString(typed["content"]),
			interfaceString(typed["value"]),
		))
	}
	return ""
}

func cloneCompatibilityRequestHeaders(header http.Header) http.Header {
	if len(header) == 0 {
		return http.Header{}
	}
	cloned := http.Header{}
	for key, values := range header {
		for _, value := range values {
			cloned.Add(key, value)
		}
	}
	return cloned
}

func cloneCompatibilityWebsocketHeaders(header http.Header, bearerOverride string) http.Header {
	cloned := http.Header{}
	for key, values := range header {
		normalized := strings.ToLower(strings.TrimSpace(key))
		switch normalized {
		case "host", "connection", "upgrade", "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions":
			continue
		case "authorization":
			continue
		}
		for _, value := range values {
			cloned.Add(key, value)
		}
	}
	if trimmed := strings.TrimSpace(bearerOverride); trimmed != "" {
		cloned.Set("Authorization", "Bearer "+trimmed)
	} else if authHeader, err := extractCompatibilityPassthroughAuth(header); err == nil {
		cloned.Set("Authorization", authHeader)
	}
	return cloned
}

func appendGatewayRequestPath(baseURL, desiredPath string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse endpoint URL %q: %w", baseURL, err)
	}
	normalizedDesiredPath := strings.TrimSpace(desiredPath)
	normalizedCurrentPath := strings.TrimSuffix(strings.TrimSpace(parsed.Path), "/")
	if normalizedCurrentPath != "" && (normalizedDesiredPath == normalizedCurrentPath || strings.HasPrefix(normalizedDesiredPath, normalizedCurrentPath+"/")) {
		parsed.Path = normalizedDesiredPath
		return parsed.String(), nil
	}
	if strings.Contains(parsed.Path, normalizedDesiredPath) {
		return parsed.String(), nil
	}
	parsed.Path = joinGatewayURLPath(parsed.Path, normalizedDesiredPath)
	return parsed.String(), nil
}

func appendGatewayWebsocketPath(baseURL, desiredPath string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse websocket endpoint URL %q: %w", baseURL, err)
	}
	switch parsed.Scheme {
	case "http":
		parsed.Scheme = "ws"
	case "https":
		parsed.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("unsupported websocket upstream scheme %q", parsed.Scheme)
	}
	if strings.Contains(parsed.Path, strings.TrimSpace(desiredPath)) {
		return parsed.String(), nil
	}
	parsed.Path = joinGatewayURLPath(parsed.Path, desiredPath)
	return parsed.String(), nil
}

func joinGatewayURLPath(currentPath string, desiredPath string) string {
	if strings.TrimSpace(currentPath) == "" {
		return desiredPath
	}
	return pathpkg.Join(currentPath, desiredPath)
}

func writeCompatibilityError(w http.ResponseWriter, statusCode int, errorType string, code string, message string, details map[string]interface{}) {
	payload := map[string]interface{}{
		"error": map[string]interface{}{
			"type":    firstNonEmpty(errorType, "invalid_request_error"),
			"code":    firstNonEmpty(code, "epydios_error"),
			"message": firstNonEmpty(message, "request failed"),
		},
	}
	if len(details) > 0 {
		payload["error"].(map[string]interface{})["details"] = details
	}
	writeGatewayJSON(w, statusCode, payload)
}

func writeCompatibilityWebsocketFailure(conn *websocket.Conn, code string, message string, errorType string) {
	if conn == nil {
		return
	}
	body := buildCompatibilityWebsocketFailurePayload(code, message, errorType)
	_ = conn.WriteMessage(websocket.TextMessage, body)
	_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, firstNonEmpty(message, "request failed")), time.Now().Add(250*time.Millisecond))
}

func buildCompatibilityWebsocketFailurePayload(code string, message string, errorType string) []byte {
	payload := map[string]interface{}{
		"type": "response.failed",
		"error": map[string]interface{}{
			"type":    firstNonEmpty(errorType, "server_error"),
			"code":    firstNonEmpty(code, "epydios_error"),
			"message": firstNonEmpty(message, "request failed"),
		},
	}
	body, _ := json.Marshal(payload)
	return body
}

func writeCompatibilityWebsocketPrewarmResponse(conn *websocket.Conn) {
	if conn == nil {
		return
	}
	responseID := "resp_epydios_prewarm"
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "response.created",
		"response": map[string]interface{}{
			"id":     responseID,
			"object": "response",
			"status": "in_progress",
		},
	})
	_ = conn.WriteJSON(map[string]interface{}{
		"type": "response.completed",
		"response": map[string]interface{}{
			"id":     responseID,
			"object": "response",
			"status": "completed",
			"output": []interface{}{},
		},
	})
	_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "prewarm completed"), time.Now().Add(250*time.Millisecond))
}

func writeCompatibilityForwardedResponse(w http.ResponseWriter, response *compatibilityForwardResponse, correlationHeaders map[string]string) {
	if response == nil {
		writeCompatibilityError(w, http.StatusBadGateway, "server_error", "epydios_empty_upstream_response", "compatibility upstream returned no response", nil)
		return
	}
	for key, values := range response.Headers {
		if strings.EqualFold(strings.TrimSpace(key), "Content-Length") || strings.EqualFold(strings.TrimSpace(key), "Transfer-Encoding") {
			continue
		}
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}
	for key, value := range correlationHeaders {
		if strings.TrimSpace(value) != "" {
			w.Header().Set(key, value)
		}
	}
	if strings.TrimSpace(w.Header().Get("Content-Type")) == "" {
		w.Header().Set("Content-Type", "application/json")
	}
	w.WriteHeader(response.StatusCode)
	_, _ = w.Write(response.Body)
}

func buildCompatibilityGovernedActionRequestFromWebsocketMessage(httpReq *http.Request, message []byte) (gatewayGovernedActionRequest, string, []byte, error) {
	var payload map[string]interface{}
	if err := json.Unmarshal(message, &payload); err != nil {
		return gatewayGovernedActionRequest{}, "", nil, fmt.Errorf("decode websocket request: %w", err)
	}
	if !strings.EqualFold(strings.TrimSpace(interfaceString(payload["type"])), "response.create") {
		return gatewayGovernedActionRequest{}, "", nil, fmt.Errorf("expected response.create websocket frame")
	}
	delete(payload, "type")
	normalizedBody, err := json.Marshal(payload)
	if err != nil {
		return gatewayGovernedActionRequest{}, "", nil, fmt.Errorf("encode normalized websocket request: %w", err)
	}
	req := cloneCompatibilityRequestContext(httpReq, "/responses", "compatibility_websocket", "")
	governedReq, operationClass, err := buildCompatibilityGovernedActionRequest(req, normalizedBody)
	if err != nil {
		return gatewayGovernedActionRequest{}, "", nil, err
	}
	return governedReq, operationClass, normalizedBody, nil
}

func isCompatibilityWebsocketPrewarmRequest(httpReq *http.Request, message []byte) bool {
	var payload map[string]interface{}
	if err := json.Unmarshal(message, &payload); err != nil {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(interfaceString(payload["type"])), "response.create") {
		return false
	}
	inputItems, ok := payload["input"].([]interface{})
	if !ok || len(inputItems) != 0 {
		return false
	}
	turnMetadata := map[string]interface{}{}
	if raw := strings.TrimSpace(httpReq.Header.Get("X-Codex-Turn-Metadata")); raw != "" {
		_ = json.Unmarshal([]byte(raw), &turnMetadata)
	}
	return strings.TrimSpace(interfaceString(turnMetadata["turn_id"])) == ""
}

func cloneCompatibilityRequestContext(httpReq *http.Request, path string, protocol string, operationClass string) *http.Request {
	cloned := httpReq.Clone(httpReq.Context())
	cloned.Method = http.MethodPost
	cloned.URL = &url.URL{Path: path}
	cloned.Header = cloneCompatibilityRequestHeaders(httpReq.Header)
	if strings.TrimSpace(protocol) != "" {
		cloned.Header.Set("X-Epydios-Upstream-Protocol", protocol)
	}
	cloned.Header.Set("X-Epydios-Client-Surface", "codex")
	if strings.TrimSpace(operationClass) != "" {
		cloned.Header.Set("X-Epydios-Operation-Class", operationClass)
	}
	cloned.Header.Set("X-Epydios-Codex-Session-Id", firstNonEmpty(
		cloned.Header.Get("X-Epydios-Codex-Session-Id"),
		httpReq.Header.Get("Session_id"),
	))
	cloned.Header.Set("X-Epydios-Client-Request-Id", firstNonEmpty(
		cloned.Header.Get("X-Epydios-Client-Request-Id"),
		httpReq.Header.Get("X-Client-Request-Id"),
	))
	return cloned
}

func extractCompatibilityPassthroughAuth(header http.Header) (string, error) {
	authHeader := strings.TrimSpace(header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return "", fmt.Errorf("missing bearer token")
	}
	token := strings.TrimSpace(authHeader[len("Bearer "):])
	if token == "" {
		return "", fmt.Errorf("missing bearer token")
	}
	return "Bearer " + token, nil
}

func compatibilityBodyPreview(body []byte) string {
	if len(body) == 0 {
		return ""
	}
	trimmed := strings.TrimSpace(string(slices.Clone(body)))
	const limit = 160
	if len(trimmed) <= limit {
		return trimmed
	}
	return trimmed[:limit] + "..."
}

func extractCodexTurnID(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(interfaceString(payload["turn_id"]))
}

func replayableWebsocketTerminalEvent(result compatibilityUpstreamWebsocketResult) []byte {
	if len(result.TerminalEvent) > 0 {
		return append([]byte(nil), result.TerminalEvent...)
	}
	if len(result.SemanticEvent) > 0 {
		if synthesized := synthesizeCompatibilityCompletedEvent(result.SemanticEvent); len(synthesized) > 0 {
			return synthesized
		}
		return append([]byte(nil), result.SemanticEvent...)
	}
	return nil
}

func replayableCompatibilityWebsocketEvent(record gatewayRequestRecord) []byte {
	if len(record.Interposition.TerminalWebsocketEvent) > 0 {
		return append([]byte(nil), record.Interposition.TerminalWebsocketEvent...)
	}
	return nil
}

func synthesizeCompatibilityCompletedEvent(message []byte) []byte {
	var payload map[string]interface{}
	if err := json.Unmarshal(message, &payload); err != nil {
		return nil
	}
	eventType := strings.TrimSpace(interfaceString(payload["type"]))
	switch eventType {
	case "response.completed", "response.failed":
		return append([]byte(nil), message...)
	case "response.output_text.done":
		responseID := firstNonEmpty(strings.TrimSpace(interfaceString(payload["response_id"])), strings.TrimSpace(interfaceString(payload["responseId"])))
		text := strings.TrimSpace(interfaceString(payload["text"]))
		body, err := json.Marshal(map[string]interface{}{
			"type": "response.completed",
			"response": map[string]interface{}{
				"id":          responseID,
				"status":      "completed",
				"output_text": text,
			},
		})
		if err != nil {
			return nil
		}
		return body
	default:
		return nil
	}
}

func mergeGatewayWebsocketTrace(dst *gatewayWebsocketTrace, src gatewayWebsocketTrace) {
	if dst == nil {
		return
	}
	if strings.TrimSpace(src.RetryKey) != "" {
		dst.RetryKey = src.RetryKey
	}
	if strings.TrimSpace(src.MatchStrategy) != "" {
		dst.MatchStrategy = src.MatchStrategy
	}
	for _, field := range []struct {
		src string
		dst *string
	}{
		{src.ProxyStartedAtUTC, &dst.ProxyStartedAtUTC},
		{src.ClientInitialAtUTC, &dst.ClientInitialAtUTC},
		{src.ClientClosedAtUTC, &dst.ClientClosedAtUTC},
		{src.UpstreamFirstAtUTC, &dst.UpstreamFirstAtUTC},
		{src.UpstreamSemanticAtUTC, &dst.UpstreamSemanticAtUTC},
		{src.UpstreamSemanticType, &dst.UpstreamSemanticType},
		{src.UpstreamTerminalAtUTC, &dst.UpstreamTerminalAtUTC},
		{src.UpstreamTerminalType, &dst.UpstreamTerminalType},
		{src.ProxyError, &dst.ProxyError},
		{src.ProxyErrorClass, &dst.ProxyErrorClass},
		{src.RetryObservedAtUTC, &dst.RetryObservedAtUTC},
		{src.FinalizedAtUTC, &dst.FinalizedAtUTC},
	} {
		if strings.TrimSpace(field.src) != "" {
			*field.dst = field.src
		}
	}
	if src.RetryReplayCount > 0 {
		dst.RetryReplayCount = src.RetryReplayCount
	}
	if src.RetryBlockedCount > 0 {
		dst.RetryBlockedCount = src.RetryBlockedCount
	}
}

func finalizeCompatibilityWebsocketTrace(trace gatewayWebsocketTrace, err error) gatewayWebsocketTrace {
	trace.ProxyError = ""
	trace.ProxyErrorClass = ""
	if err != nil {
		trace.ProxyError = err.Error()
		trace.ProxyErrorClass = classifyCompatibilityWebsocketError(err)
	}
	trace.FinalizedAtUTC = time.Now().UTC().Format(time.RFC3339)
	return trace
}

func classifyCompatibilityWebsocketError(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, websocket.ErrCloseSent):
		return "close_sent"
	case errors.Is(err, syscall.ECONNRESET):
		return "connection_reset"
	case errors.Is(err, net.ErrClosed):
		return "connection_closed"
	case errors.Is(err, io.EOF):
		return "eof"
	case websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseNoStatusReceived):
		return "close_frame"
	default:
		return "transport_error"
	}
}

func inspectCompatibilityWebsocketEvent(message []byte) (bool, bool, bool, string) {
	var payload map[string]interface{}
	if err := json.Unmarshal(message, &payload); err != nil {
		return false, false, false, ""
	}
	eventType := strings.TrimSpace(interfaceString(payload["type"]))
	switch eventType {
	case "response.completed":
		return true, false, true, eventType
	case "response.failed":
		return false, true, false, eventType
	case "response.output_text.done", "response.output_item.done":
		return false, false, true, eventType
	default:
		return false, false, false, eventType
	}
}

func compatibilityErrorType(statusCode int) string {
	switch {
	case statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden:
		return "permission_denied"
	case statusCode == http.StatusBadRequest:
		return "invalid_request_error"
	case statusCode == http.StatusGatewayTimeout || statusCode == http.StatusRequestTimeout:
		return "request_timeout"
	default:
		return "server_error"
	}
}

func isCompatibilityWebsocketClosure(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, websocket.ErrCloseSent) || errors.Is(err, syscall.ECONNRESET) || errors.Is(err, net.ErrClosed) || errors.Is(err, io.EOF) {
		return true
	}
	lower := strings.ToLower(err.Error())
	if strings.Contains(lower, "connection reset by peer") || strings.Contains(lower, "unexpected eof") || strings.Contains(lower, "broken pipe") {
		return true
	}
	return websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway, websocket.CloseNoStatusReceived, websocket.CloseAbnormalClosure)
}

func firstNonNilErr(values ...error) error {
	for _, err := range values {
		if err != nil {
			return err
		}
	}
	return nil
}
