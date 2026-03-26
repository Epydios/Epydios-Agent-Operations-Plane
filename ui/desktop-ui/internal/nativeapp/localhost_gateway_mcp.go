package nativeapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type gatewayMCPToolDescriptor struct {
	Name        string                 `json:"name"`
	Title       string                 `json:"title,omitempty"`
	Description string                 `json:"description,omitempty"`
	InputSchema map[string]interface{} `json:"inputSchema,omitempty"`
}

type gatewayMCPToolsResponse struct {
	TenantID      string                     `json:"tenantId,omitempty"`
	ProjectID     string                     `json:"projectId,omitempty"`
	EnvironmentID string                     `json:"environmentId,omitempty"`
	ConnectorID   string                     `json:"connectorId,omitempty"`
	Protocol      string                     `json:"protocol,omitempty"`
	Tools         []gatewayMCPToolDescriptor `json:"tools"`
}

type gatewayMCPToolCallRequest struct {
	TenantID         string                 `json:"tenantId"`
	ProjectID        string                 `json:"projectId"`
	EnvironmentID    string                 `json:"environmentId,omitempty"`
	ConnectorID      string                 `json:"connectorId,omitempty"`
	ToolName         string                 `json:"toolName"`
	Arguments        map[string]interface{} `json:"arguments"`
	SessionID        string                 `json:"sessionId,omitempty"`
	ProtocolVersion  string                 `json:"protocolVersion,omitempty"`
	JSONRPCRequestID interface{}            `json:"jsonrpcRequestId,omitempty"`
	IdempotencyKey   string                 `json:"idempotencyKey,omitempty"`
	Reason           string                 `json:"reason,omitempty"`
	Client           gatewayClientIdentity  `json:"client"`
}

type gatewayMCPToolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type gatewayMCPToolResult struct {
	Content           []gatewayMCPToolContent `json:"content"`
	StructuredContent map[string]interface{}  `json:"structuredContent,omitempty"`
	IsError           bool                    `json:"isError,omitempty"`
}

type gatewayMCPToolCallResponse struct {
	GatewayRequestID       string               `json:"gatewayRequestId"`
	InterpositionRequestID string               `json:"interpositionRequestId,omitempty"`
	RunID                  string               `json:"runId,omitempty"`
	ApprovalID             string               `json:"approvalId,omitempty"`
	State                  string               `json:"state"`
	InterpositionState     string               `json:"interpositionState,omitempty"`
	PolicyDecision         string               `json:"policyDecision,omitempty"`
	ApprovalRequired       bool                 `json:"approvalRequired"`
	ReceiptRef             string               `json:"receiptRef,omitempty"`
	StatusURL              string               `json:"statusUrl,omitempty"`
	RunURL                 string               `json:"runUrl,omitempty"`
	ToolResult             gatewayMCPToolResult `json:"toolResult"`
}

type gatewayMCPConnectorSettings struct {
	SelectedConnectorID string                            `json:"selectedConnectorId"`
	Profiles            []gatewayMCPConnectorProfileEntry `json:"profiles"`
}

type gatewayMCPConnectorProfileEntry struct {
	ID             string   `json:"id"`
	Label          string   `json:"label"`
	Driver         string   `json:"driver"`
	RootPath       string   `json:"rootPath,omitempty"`
	EndpointRef    string   `json:"endpointRef,omitempty"`
	CredentialRef  string   `json:"credentialRef,omitempty"`
	AllowedTools   []string `json:"allowedTools"`
	AllowedOwners  []string `json:"allowedOwners,omitempty"`
	AllowedRepos   []string `json:"allowedRepos,omitempty"`
	AllowedOrigins []string `json:"allowedOrigins,omitempty"`
	Enabled        *bool    `json:"enabled,omitempty"`
}

type gatewayMCPApprovedRetry struct {
	ApprovalID          string
	GatewayRequestID    string
	HoldInterpositionID string
}

func NewGatewayHandler(record GatewayServiceRecord, token string, opts LaunchOptions) http.Handler {
	return newGatewayHTTPHandler(&gatewayServiceState{
		record: record,
		token:  token,
		opts:   opts,
	})
}

func newGatewayHTTPHandler(state *gatewayServiceState) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", state.handleHealthz)
	mux.HandleFunc("/readyz", state.handleReadyz)
	mux.HandleFunc("/responses", state.handleCompatibilityResponsesIngress)
	mux.HandleFunc("/v1/responses", state.handleCompatibilityResponses)
	mux.HandleFunc("/v1/governed-actions", state.handleGovernedActions)
	mux.HandleFunc("/v1/governed-actions/", state.handleGovernedActionByID)
	mux.HandleFunc("/v1/runs/", state.handleRunByID)
	mux.HandleFunc(gatewayMCPLegacyToolsPath, state.handleMCPTools)
	mux.HandleFunc(gatewayMCPLegacyToolCallPath, state.handleMCPToolCall)
	mux.HandleFunc(gatewayMCPProxyToolsPath, state.handleMCPTools)
	mux.HandleFunc(gatewayMCPProxyToolCallPath, state.handleMCPToolCall)
	return mux
}

func (s *gatewayServiceState) handleMCPTools(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeGatewayAPIError(w, http.StatusMethodNotAllowed, "", "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}
	tenantID := strings.TrimSpace(r.URL.Query().Get("tenantId"))
	projectID := strings.TrimSpace(r.URL.Query().Get("projectId"))
	environmentID := firstNonEmpty(strings.TrimSpace(r.URL.Query().Get("environmentId")), "local")
	if tenantID == "" || projectID == "" {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_SCOPE", "tenantId and projectId are required", false, nil)
		return
	}
	settingsResp, statusCode, apiErr := s.fetchRuntimeConnectorSettings(r.Context(), tenantID, projectID)
	if apiErr != nil {
		writeGatewayAPIError(w, statusCode, "", apiErr.ErrorCode, apiErr.Message, apiErr.Retryable, apiErr.Details)
		return
	}
	profile, contract, err := gatewayResolveMCPProxyProfile(settingsResp.Settings, strings.TrimSpace(r.URL.Query().Get("connectorId")))
	if err != nil {
		writeGatewayAPIError(w, http.StatusNotFound, "", "MCP_CONNECTOR_NOT_CONFIGURED", err.Error(), false, map[string]interface{}{
			"tenantId":  tenantID,
			"projectId": projectID,
		})
		return
	}
	writeGatewayJSON(w, http.StatusOK, gatewayMCPToolsResponse{
		TenantID:      tenantID,
		ProjectID:     projectID,
		EnvironmentID: environmentID,
		ConnectorID:   profile.ID,
		Protocol:      "mcp",
		Tools:         gatewayMCPToolDescriptors(profile, contract),
	})
}

func (s *gatewayServiceState) handleMCPToolCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeGatewayAPIError(w, http.StatusMethodNotAllowed, "", "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	if !s.authorize(w, r) {
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_BODY", "failed to read request body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	var req gatewayMCPToolCallRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_JSON", "failed to decode request body", false, map[string]interface{}{"error": err.Error()})
		return
	}

	req.TenantID = strings.TrimSpace(req.TenantID)
	req.ProjectID = strings.TrimSpace(req.ProjectID)
	req.EnvironmentID = firstNonEmpty(strings.TrimSpace(req.EnvironmentID), "local")
	req.ConnectorID = strings.TrimSpace(req.ConnectorID)
	req.ToolName = strings.ToLower(strings.TrimSpace(req.ToolName))
	req.ProtocolVersion = firstNonEmpty(strings.TrimSpace(req.ProtocolVersion), mcpProtocolVersion20250326)
	req.SessionID = strings.TrimSpace(req.SessionID)
	req.IdempotencyKey = firstNonEmpty(strings.TrimSpace(req.IdempotencyKey), gatewayMCPRequestIDString(req.JSONRPCRequestID))
	req.Reason = strings.TrimSpace(req.Reason)
	req.Client.ID = firstNonEmpty(strings.TrimSpace(req.Client.ID), "client-mcp-connector")
	req.Client.Name = firstNonEmpty(strings.TrimSpace(req.Client.Name), "Epydios MCP Connector Shim")
	req.Client.Version = strings.TrimSpace(req.Client.Version)

	if req.TenantID == "" || req.ProjectID == "" {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "INVALID_SCOPE", "tenantId and projectId are required", false, nil)
		return
	}
	settingsResp, statusCode, apiErr := s.fetchRuntimeConnectorSettings(r.Context(), req.TenantID, req.ProjectID)
	if apiErr != nil {
		writeGatewayAPIError(w, statusCode, "", apiErr.ErrorCode, apiErr.Message, apiErr.Retryable, apiErr.Details)
		return
	}
	profile, contract, err := gatewayResolveMCPProxyProfile(settingsResp.Settings, req.ConnectorID)
	if err != nil {
		writeGatewayAPIError(w, http.StatusNotFound, "", "MCP_CONNECTOR_NOT_CONFIGURED", err.Error(), false, map[string]interface{}{
			"tenantId":    req.TenantID,
			"projectId":   req.ProjectID,
			"connectorId": req.ConnectorID,
		})
		return
	}
	toolContract, err := gatewayMCPToolContract(profile, contract, req.ToolName)
	if err != nil {
		writeGatewayAPIError(w, http.StatusBadRequest, "", "MCP_TOOL_NOT_SUPPORTED", err.Error(), false, map[string]interface{}{
			"toolName":    req.ToolName,
			"connectorId": profile.ID,
			"driver":      profile.Driver,
		})
		return
	}
	if toolContract.NormalizeArguments != nil {
		normalizedArguments, err := toolContract.NormalizeArguments(cloneGatewayJSONObject(req.Arguments))
		if err != nil {
			writeGatewayAPIError(w, http.StatusBadRequest, "", "MCP_TOOL_ARGUMENTS_INVALID", err.Error(), false, nil)
			return
		}
		req.Arguments = normalizedArguments
	}

	req.ConnectorID = profile.ID
	if req.Reason == "" {
		req.Reason = fmt.Sprintf("Requested from %s over MCP tools/call", req.Client.Name)
	}

	synthesizeGatewayMCPHeaders(r, req, toolContract.RequestTitle)
	gatewayRequestID := newGatewayRequestID()
	governedReq := gatewayGovernedActionRequest{
		TenantID:      req.TenantID,
		ProjectID:     req.ProjectID,
		EnvironmentID: req.EnvironmentID,
		ActionType:    toolContract.ActionType,
		TargetType:    toolContract.ResourceKind,
		TargetRef:     profile.ID,
		Input: map[string]interface{}{
			"title":            toolContract.RequestTitle,
			"summary":          fmt.Sprintf("%s request", toolContract.RequestTitle),
			"toolName":         req.ToolName,
			"connectorId":      profile.ID,
			"connectorLabel":   profile.Label,
			"arguments":        cloneGatewayJSONObject(req.Arguments),
			"query":            interfaceString(req.Arguments["query"]),
			"path":             interfaceString(req.Arguments["path"]),
			"url":              interfaceString(req.Arguments["url"]),
			"selector":         interfaceString(req.Arguments["selector"]),
			"expectedLabel":    firstNonEmpty(interfaceString(req.Arguments["expected_label"]), interfaceString(req.Arguments["expectedLabel"])),
			"owner":            interfaceString(req.Arguments["owner"]),
			"repo":             interfaceString(req.Arguments["repo"]),
			"pullNumber":       req.Arguments["pull_number"],
			"protocolVersion":  req.ProtocolVersion,
			"sessionId":        req.SessionID,
			"jsonrpcRequestId": req.JSONRPCRequestID,
		},
		Client:         req.Client,
		IdempotencyKey: req.IdempotencyKey,
		Reason:         req.Reason,
	}

	interposition := normalizeGatewayInterpositionEnvelope(governedReq, r, gatewayRequestID, body)
	approvedRetry, hasApprovedRetry := findApprovedMCPRetry(s.record.RequestsRoot, interposition, req, profile, toolContract)
	runReq := buildMCPGatewayRuntimeRunRequest(governedReq, gatewayRequestID, interposition, profile, contract, toolContract, req, hasApprovedRetry, approvedRetry)
	run, statusCode, apiErr := s.createRuntimeRun(r.Context(), runReq)
	if apiErr != nil {
		writeGatewayAPIError(w, statusCode, gatewayRequestID, apiErr.ErrorCode, apiErr.Message, apiErr.Retryable, apiErr.Details)
		return
	}
	if hasApprovedRetry && strings.EqualFold(strings.TrimSpace(run.PolicyDecision), "ALLOW") {
		holdsRoot := gatewayHoldRecordsRoot(s.record.RequestsRoot)
		_, _ = updateGatewayHoldRecordState(holdsRoot, approvedRetry.HoldInterpositionID, "approval_consumed", "", false)
		_, _ = updateGatewayRequestRecordLifecycleState(s.record.RequestsRoot, approvedRetry.GatewayRequestID, "approval_consumed", "ALLOW", false, "approval_consumed")
	}

	result := buildGatewayResult(s.record.BaseURL, gatewayRequestID, interposition.InterpositionRequestID, *run, true)
	interposition.State = gatewayInterpositionStateFromRun(*run, true)
	record := gatewayRequestRecord{
		GatewayRequestID: gatewayRequestID,
		CreatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		UpdatedAtUTC:     time.Now().UTC().Format(time.RFC3339),
		TenantID:         governedReq.TenantID,
		ProjectID:        governedReq.ProjectID,
		EnvironmentID:    governedReq.EnvironmentID,
		Client:           governedReq.Client,
		Request:          governedReq,
		Interposition:    interposition,
		Result:           result,
	}
	if err := writeGatewayRequestRecord(s.record.RequestsRoot, record); err != nil {
		writeGatewayAPIError(w, http.StatusInternalServerError, gatewayRequestID, "GATEWAY_PERSIST_FAILED", "failed to persist MCP tool call record", false, map[string]interface{}{
			"interpositionRequestId": interposition.InterpositionRequestID,
		})
		return
	}

	if result.ApprovalRequired {
		hold := buildGatewayHoldRecord(interposition, governedReq.Client, result, *run)
		if err := writeGatewayHoldRecord(gatewayHoldRecordsRoot(s.record.RequestsRoot), hold); err != nil {
			writeGatewayAPIError(w, http.StatusInternalServerError, gatewayRequestID, "GATEWAY_HOLD_PERSIST_FAILED", "failed to persist MCP approval hold", false, map[string]interface{}{
				"interpositionRequestId": interposition.InterpositionRequestID,
				"runId":                  result.RunID,
			})
			return
		}
	}

	writeGatewayJSON(w, http.StatusOK, buildGatewayMCPToolCallResponse(result, *run, profile, toolContract))
}

func (s *gatewayServiceState) fetchRuntimeConnectorSettings(ctx context.Context, tenantID string, projectID string) (*runtimeapi.ConnectorSettingsResponse, int, *runtimeapi.APIError) {
	if s.fetchConnectorSettingsHook != nil {
		return s.fetchConnectorSettingsHook(ctx, tenantID, projectID)
	}
	query := url.Values{}
	query.Set("tenantId", strings.TrimSpace(tenantID))
	query.Set("projectId", strings.TrimSpace(projectID))
	requestURL := fmt.Sprintf("http://127.0.0.1:%d/v1alpha1/runtime/connectors/settings?%s", s.opts.RuntimeLocalPort, query.Encode())
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, http.StatusInternalServerError, &runtimeapi.APIError{
			ErrorCode: "GATEWAY_REQUEST_BUILD_FAILED",
			Message:   "failed to build connector settings request",
			Retryable: false,
			Details:   map[string]interface{}{"error": err.Error()},
		}
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, http.StatusServiceUnavailable, &runtimeapi.APIError{
			ErrorCode: "RUNTIME_UNAVAILABLE",
			Message:   "runtime connector settings are unavailable",
			Retryable: true,
			Details:   map[string]interface{}{"error": err.Error()},
		}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		apiErr := &runtimeapi.APIError{}
		if err := json.NewDecoder(resp.Body).Decode(apiErr); err != nil {
			apiErr = &runtimeapi.APIError{
				ErrorCode: "RUNTIME_ERROR",
				Message:   "runtime returned an error",
				Retryable: resp.StatusCode >= 500,
				Details:   map[string]interface{}{"statusCode": resp.StatusCode},
			}
		}
		return nil, resp.StatusCode, apiErr
	}
	var settings runtimeapi.ConnectorSettingsResponse
	if err := json.NewDecoder(resp.Body).Decode(&settings); err != nil {
		return nil, http.StatusBadGateway, &runtimeapi.APIError{
			ErrorCode: "RUNTIME_DECODE_FAILED",
			Message:   "failed to decode runtime connector settings",
			Retryable: true,
			Details:   map[string]interface{}{"error": err.Error()},
		}
	}
	return &settings, resp.StatusCode, nil
}

func synthesizeGatewayMCPHeaders(r *http.Request, req gatewayMCPToolCallRequest, requestTitle string) {
	r.Header.Set("X-Epydios-Upstream-Protocol", "mcp_stdio")
	r.Header.Set("X-Epydios-Client-Surface", "mcp")
	r.Header.Set("X-Epydios-Operation-Class", "tool_action")
	r.Header.Set("X-Epydios-Client-Id", req.Client.ID)
	r.Header.Set("X-Epydios-Client-Name", req.Client.Name)
	if strings.TrimSpace(req.Client.Version) != "" {
		r.Header.Set("X-Epydios-Client-Version", strings.TrimSpace(req.Client.Version))
	}
	if requestID := firstNonEmpty(req.IdempotencyKey, gatewayMCPRequestIDString(req.JSONRPCRequestID)); requestID != "" {
		r.Header.Set("X-Epydios-Client-Request-Id", requestID)
	}
	r.Header.Set("X-Epydios-Request-Title", firstNonEmpty(requestTitle, "MCP tool call"))
}

func buildMCPGatewayRuntimeRunRequest(req gatewayGovernedActionRequest, gatewayRequestID string, interposition gatewayInterpositionEnvelope, profile gatewayMCPConnectorProfileEntry, contract gatewayMCPProxyContract, tool gatewayMCPProxyToolContract, callReq gatewayMCPToolCallRequest, approvalGranted bool, approvedRetry gatewayMCPApprovedRetry) runtimeapi.RunCreateRequest {
	runReq := buildGatewayRuntimeRunRequest(req, gatewayRequestID, interposition)
	runReq.Action["class"] = tool.ActionClass
	runReq.Action["verb"] = tool.ActionVerb
	runReq.Resource["kind"] = tool.ResourceKind
	runReq.Resource["id"] = profile.ID
	runReq.Resource["name"] = firstNonEmpty(profile.Label, profile.ID)
	if runReq.Context == nil {
		runReq.Context = runtimeapi.JSONObject{}
	}
	runReq.Context["connector_mcp"] = runtimeapi.JSONObject{
		"protocol":         contract.Protocol,
		"transport":        contract.Transport,
		"method":           "tools/call",
		"toolName":         callReq.ToolName,
		"driver":           profile.Driver,
		"connectorId":      profile.ID,
		"connectorLabel":   profile.Label,
		"sessionId":        callReq.SessionID,
		"protocolVersion":  callReq.ProtocolVersion,
		"jsonrpcRequestId": callReq.JSONRPCRequestID,
	}
	if approvalGranted {
		runReq.Context["connector_mcp"].(runtimeapi.JSONObject)["approvalGranted"] = true
		if strings.TrimSpace(approvedRetry.ApprovalID) != "" {
			runReq.Context["connector_mcp"].(runtimeapi.JSONObject)["approvalId"] = approvedRetry.ApprovalID
		}
	}
	if runReq.Annotations == nil {
		runReq.Annotations = runtimeapi.JSONObject{}
	}
	runReq.Annotations["connectorProtocol"] = contract.Protocol
	runReq.Annotations["connectorTransport"] = contract.Transport
	runReq.Annotations["connectorToolName"] = callReq.ToolName
	runReq.Annotations["connectorId"] = profile.ID
	runReq.Annotations["connectorDriver"] = profile.Driver
	runReq.Connector = &runtimeapi.ConnectorExecutionRequest{
		Enabled:              true,
		Tier:                 1,
		ConnectorID:          profile.ID,
		Driver:               profile.Driver,
		ToolName:             callReq.ToolName,
		Arguments:            runtimeapi.JSONObject(cloneGatewayJSONObject(callReq.Arguments)),
		ApprovalNote:         firstNonEmpty(callReq.Reason, fmt.Sprintf("%s request.", tool.RequestTitle)),
		ApprovalID:           strings.TrimSpace(approvedRetry.ApprovalID),
		HumanApprovalGranted: approvalGranted,
	}
	return runReq
}

func findApprovedMCPRetry(root string, interposition gatewayInterpositionEnvelope, req gatewayMCPToolCallRequest, profile gatewayMCPConnectorProfileEntry, tool gatewayMCPProxyToolContract) (gatewayMCPApprovedRetry, bool) {
	if strings.ToLower(strings.TrimSpace(req.ToolName)) != gatewayMCPToolClickDestructiveButton {
		return gatewayMCPApprovedRetry{}, false
	}
	incomingRetryKey := strings.TrimSpace(interposition.IdempotencyKey)
	incomingBodySHA := strings.TrimSpace(interposition.Upstream.BodySHA256)
	if incomingRetryKey == "" {
		return gatewayMCPApprovedRetry{}, false
	}
	items, err := listGatewayRequestRecords(root)
	if err != nil {
		return gatewayMCPApprovedRetry{}, false
	}
	for _, item := range items {
		if !strings.EqualFold(strings.TrimSpace(item.TenantID), strings.TrimSpace(req.TenantID)) ||
			!strings.EqualFold(strings.TrimSpace(item.ProjectID), strings.TrimSpace(req.ProjectID)) ||
			!strings.EqualFold(strings.TrimSpace(item.EnvironmentID), strings.TrimSpace(req.EnvironmentID)) {
			continue
		}
		if strings.TrimSpace(item.Request.TargetRef) != profile.ID {
			continue
		}
		if strings.TrimSpace(item.Request.ActionType) != tool.ActionType {
			continue
		}
		if strings.TrimSpace(item.Interposition.IdempotencyKey) != incomingRetryKey {
			continue
		}
		if incomingBodySHA != "" && strings.TrimSpace(item.Interposition.Upstream.BodySHA256) != incomingBodySHA {
			continue
		}
		if !strings.EqualFold(strings.TrimSpace(item.Interposition.State), "approval_granted") {
			continue
		}
		approvalID := strings.TrimSpace(item.Result.ApprovalID)
		if approvalID == "" {
			continue
		}
		return gatewayMCPApprovedRetry{
			ApprovalID:          approvalID,
			GatewayRequestID:    item.GatewayRequestID,
			HoldInterpositionID: item.Interposition.InterpositionRequestID,
		}, true
	}
	return gatewayMCPApprovedRetry{}, false
}

func buildGatewayMCPToolCallResponse(result gatewayGovernedActionResult, run runtimeapi.RunRecord, profile gatewayMCPConnectorProfileEntry, tool gatewayMCPProxyToolContract) gatewayMCPToolCallResponse {
	return gatewayMCPToolCallResponse{
		GatewayRequestID:       result.GatewayRequestID,
		InterpositionRequestID: result.InterpositionRequestID,
		RunID:                  result.RunID,
		ApprovalID:             result.ApprovalID,
		State:                  result.State,
		InterpositionState:     result.InterpositionState,
		PolicyDecision:         result.PolicyDecision,
		ApprovalRequired:       result.ApprovalRequired,
		ReceiptRef:             result.ReceiptRef,
		StatusURL:              result.StatusURL,
		RunURL:                 result.RunURL,
		ToolResult:             tool.BuildToolResult(result, run, profile),
	}
}

func gatewayEvidencePayloadEcho(raw json.RawMessage) map[string]interface{} {
	if len(raw) == 0 {
		return nil
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil
	}
	echo, _ := payload["payloadEcho"].(map[string]interface{})
	return echo
}

func gatewayMCPRequestIDString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case fmt.Stringer:
		return strings.TrimSpace(typed.String())
	case json.Number:
		return strings.TrimSpace(typed.String())
	case float64:
		return strings.TrimSpace(fmt.Sprintf("%.0f", typed))
	case float32:
		return strings.TrimSpace(fmt.Sprintf("%.0f", typed))
	case int:
		return fmt.Sprintf("%d", typed)
	case int64:
		return fmt.Sprintf("%d", typed)
	case int32:
		return fmt.Sprintf("%d", typed)
	case uint64:
		return fmt.Sprintf("%d", typed)
	case uint32:
		return fmt.Sprintf("%d", typed)
	case uint:
		return fmt.Sprintf("%d", typed)
	default:
		return strings.TrimSpace(interfaceString(value))
	}
}

func cloneGatewayJSONObject(in map[string]interface{}) map[string]interface{} {
	if len(in) == 0 {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

func numericGatewayValue(value interface{}) (int, bool) {
	switch typed := value.(type) {
	case float64:
		return int(typed), true
	case float32:
		return int(typed), true
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed), true
		}
	}
	return 0, false
}

func encodeGatewayJSON(value interface{}) []byte {
	encoded, _ := json.Marshal(value)
	return encoded
}

func mustGatewayDecode(raw []byte, out interface{}) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	return decoder.Decode(out)
}
