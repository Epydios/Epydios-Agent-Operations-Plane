package runtimeclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	runtimeapi "github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/runtime"
)

type Config struct {
	RuntimeAPIBaseURL    string
	TenantID             string
	ProjectID            string
	AuthToken            string
	IncludeLegacySession bool
	OutputFormat         string
	LiveFollowWait       int
}

type Client struct {
	baseURL           string
	tenantID          string
	projectID         string
	authToken         string
	includeLegacy     bool
	defaultFollowWait int
	httpClient        *http.Client
}

type TaskListResponse struct {
	Count  int                     `json:"count"`
	Limit  int                     `json:"limit"`
	Offset int                     `json:"offset"`
	Items  []runtimeapi.TaskRecord `json:"items"`
}

type SessionListResponse struct {
	Count         int                        `json:"count"`
	Limit         int                        `json:"limit"`
	Offset        int                        `json:"offset"`
	IncludeLegacy bool                       `json:"includeLegacy"`
	Items         []runtimeapi.SessionRecord `json:"items"`
}

type SessionEventListResponse struct {
	Count     int                             `json:"count"`
	SessionID string                          `json:"sessionId"`
	Items     []runtimeapi.SessionEventRecord `json:"items"`
}

type HTTPStatusError struct {
	StatusCode int    `json:"statusCode"`
	Status     string `json:"status,omitempty"`
	Message    string `json:"message,omitempty"`
}

func (e *HTTPStatusError) Error() string {
	if e == nil {
		return ""
	}
	if strings.TrimSpace(e.Message) == "" {
		return fmt.Sprintf("http %d", e.StatusCode)
	}
	return fmt.Sprintf("http %d: %s", e.StatusCode, strings.TrimSpace(e.Message))
}

type ConnectionStatus struct {
	State             string `json:"state"`
	RuntimeAPIBaseURL string `json:"runtimeApiBaseUrl"`
	TenantID          string `json:"tenantId,omitempty"`
	ProjectID         string `json:"projectId,omitempty"`
	ScopeLabel        string `json:"scopeLabel,omitempty"`
	ScopeReady        bool   `json:"scopeReady"`
	AuthMode          string `json:"authMode,omitempty"`
	AuthReady         bool   `json:"authReady"`
	Message           string `json:"message,omitempty"`
}

func LoadConfigFromEnv() Config {
	includeLegacy := true
	if raw := strings.TrimSpace(os.Getenv("AGENTOPS_INCLUDE_LEGACY_SESSIONS")); raw != "" {
		includeLegacy = !strings.EqualFold(raw, "false")
	}
	liveFollowWait := 12
	if raw := strings.TrimSpace(os.Getenv("AGENTOPS_LIVE_FOLLOW_WAIT_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			liveFollowWait = parsed
		}
	}
	return Config{
		RuntimeAPIBaseURL:    NormalizeStringOrDefault(os.Getenv("AGENTOPS_RUNTIME_API_BASE_URL"), "http://127.0.0.1:8080"),
		TenantID:             strings.TrimSpace(os.Getenv("AGENTOPS_TENANT_ID")),
		ProjectID:            strings.TrimSpace(os.Getenv("AGENTOPS_PROJECT_ID")),
		AuthToken:            strings.TrimSpace(os.Getenv("AGENTOPS_AUTH_TOKEN")),
		IncludeLegacySession: includeLegacy,
		OutputFormat:         NormalizeOutputFormat(os.Getenv("AGENTOPS_OUTPUT_FORMAT")),
		LiveFollowWait:       liveFollowWait,
	}
}

func NewClient(cfg Config) *Client {
	baseURL := strings.TrimSpace(cfg.RuntimeAPIBaseURL)
	if baseURL == "" {
		baseURL = "http://127.0.0.1:8080"
	}
	waitSeconds := cfg.LiveFollowWait
	if waitSeconds <= 0 {
		waitSeconds = 12
	}
	return &Client{
		baseURL:           baseURL,
		tenantID:          strings.TrimSpace(cfg.TenantID),
		projectID:         strings.TrimSpace(cfg.ProjectID),
		authToken:         strings.TrimSpace(cfg.AuthToken),
		includeLegacy:     cfg.IncludeLegacySession,
		defaultFollowWait: waitSeconds,
		httpClient:        &http.Client{Timeout: 60 * time.Second},
	}
}

func NewClientWithHTTPClient(cfg Config, httpClient *http.Client) *Client {
	client := NewClient(cfg)
	if httpClient != nil {
		client.httpClient = httpClient
	}
	return client
}

func (c *Client) request(ctx context.Context, method, requestPath string, query url.Values, body interface{}, accept string, target interface{}) error {
	base, err := url.Parse(c.baseURL)
	if err != nil {
		return fmt.Errorf("invalid runtime api base url: %w", err)
	}
	pathURL, err := url.Parse(requestPath)
	if err != nil {
		return err
	}
	resolved := base.ResolveReference(pathURL)
	if query != nil {
		resolved.RawQuery = query.Encode()
	}
	var bodyReader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, resolved.String(), bodyReader)
	if err != nil {
		return err
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	} else {
		req.Header.Set("Accept", "application/json")
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := strings.TrimSpace(string(payload))
		if message == "" {
			message = resp.Status
		}
		return &HTTPStatusError{
			StatusCode: resp.StatusCode,
			Status:     resp.Status,
			Message:    message,
		}
	}
	if target == nil {
		return nil
	}
	switch typed := target.(type) {
	case *[]byte:
		*typed = append((*typed)[:0], payload...)
		return nil
	default:
		if len(bytes.TrimSpace(payload)) == 0 {
			return nil
		}
		return json.Unmarshal(payload, target)
	}
}

func (c *Client) RequireScope() error {
	if c.tenantID == "" || c.projectID == "" {
		return fmt.Errorf("tenantId and projectId are required; set flags or AGENTOPS_TENANT_ID and AGENTOPS_PROJECT_ID")
	}
	return nil
}

func (c *Client) CheckConnection(ctx context.Context) (*ConnectionStatus, error) {
	status := &ConnectionStatus{
		RuntimeAPIBaseURL: NormalizeStringOrDefault(c.baseURL, "http://127.0.0.1:8080"),
		TenantID:          strings.TrimSpace(c.tenantID),
		ProjectID:         strings.TrimSpace(c.projectID),
		ScopeLabel:        buildScopeLabel(c.tenantID, c.projectID),
		ScopeReady:        strings.TrimSpace(c.tenantID) != "" && strings.TrimSpace(c.projectID) != "",
		AuthMode:          "bearer_token",
		AuthReady:         strings.TrimSpace(c.authToken) != "",
	}
	if !status.ScopeReady {
		status.State = "scope_required"
		status.Message = "Set tenantId and projectId before using governed thread commands."
		return status, nil
	}
	_, err := c.ListTasks(ctx, 1, 0, "", "")
	if err == nil {
		status.State = "connected"
		status.Message = "Runtime reachable. Scope and auth are ready."
		return status, nil
	}
	var statusErr *HTTPStatusError
	if errors.As(err, &statusErr) && (statusErr.StatusCode == http.StatusUnauthorized || statusErr.StatusCode == http.StatusForbidden) {
		status.State = "auth_required"
		if status.AuthReady {
			status.Message = "Runtime rejected the configured bearer token."
		} else {
			status.Message = "Set a bearer token to reach the scoped runtime."
		}
		return status, nil
	}
	status.State = "unreachable"
	status.Message = NormalizeStringOrDefault(err.Error(), "Runtime API did not respond.")
	return status, nil
}

func (c *Client) TenantID() string            { return c.tenantID }
func (c *Client) ProjectID() string           { return c.projectID }
func (c *Client) IncludeLegacySessions() bool { return c.includeLegacy }
func (c *Client) DefaultFollowWait() int      { return c.defaultFollowWait }

func buildScopeLabel(tenantID, projectID string) string {
	parts := make([]string, 0, 2)
	if trimmed := strings.TrimSpace(tenantID); trimmed != "" {
		parts = append(parts, trimmed)
	}
	if trimmed := strings.TrimSpace(projectID); trimmed != "" {
		parts = append(parts, trimmed)
	}
	return strings.Join(parts, " / ")
}

func (c *Client) CreateTask(ctx context.Context, req runtimeapi.TaskCreateRequest) (*runtimeapi.TaskRecord, error) {
	var task runtimeapi.TaskRecord
	if err := c.request(ctx, http.MethodPost, "/v1alpha2/runtime/tasks", nil, req, "application/json", &task); err != nil {
		return nil, err
	}
	return &task, nil
}

func (c *Client) ListTasks(ctx context.Context, limit, offset int, status, search string) (*TaskListResponse, error) {
	if err := c.RequireScope(); err != nil {
		return nil, err
	}
	query := url.Values{}
	query.Set("tenantId", c.tenantID)
	query.Set("projectId", c.projectID)
	query.Set("limit", strconv.Itoa(limit))
	query.Set("offset", strconv.Itoa(offset))
	if strings.TrimSpace(status) != "" {
		query.Set("status", strings.TrimSpace(status))
	}
	if strings.TrimSpace(search) != "" {
		query.Set("search", strings.TrimSpace(search))
	}
	var response TaskListResponse
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/tasks", query, nil, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) GetTask(ctx context.Context, taskID string) (*runtimeapi.TaskRecord, error) {
	var task runtimeapi.TaskRecord
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/tasks/"+url.PathEscape(strings.TrimSpace(taskID)), nil, nil, "application/json", &task); err != nil {
		return nil, err
	}
	return &task, nil
}

func (c *Client) ListSessions(ctx context.Context, taskID string, limit, offset int, status string) (*SessionListResponse, error) {
	if err := c.RequireScope(); err != nil {
		return nil, err
	}
	query := url.Values{}
	query.Set("tenantId", c.tenantID)
	query.Set("projectId", c.projectID)
	query.Set("taskId", strings.TrimSpace(taskID))
	query.Set("limit", strconv.Itoa(limit))
	query.Set("offset", strconv.Itoa(offset))
	query.Set("includeLegacy", strconv.FormatBool(c.includeLegacy))
	if strings.TrimSpace(status) != "" {
		query.Set("status", strings.TrimSpace(status))
	}
	var response SessionListResponse
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/sessions", query, nil, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) ListWorkerCapabilities(ctx context.Context, executionMode, workerType, adapterID string) (*runtimeapi.WorkerCapabilityCatalogResponse, error) {
	query := url.Values{}
	if strings.TrimSpace(executionMode) != "" {
		query.Set("executionMode", strings.TrimSpace(executionMode))
	}
	if strings.TrimSpace(workerType) != "" {
		query.Set("workerType", strings.TrimSpace(workerType))
	}
	if strings.TrimSpace(adapterID) != "" {
		query.Set("adapterId", strings.TrimSpace(adapterID))
	}
	var response runtimeapi.WorkerCapabilityCatalogResponse
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/worker-capabilities", query, nil, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) ListPolicyPacks(ctx context.Context, permission, executionMode, workerType, adapterID, clientSurface string) (*runtimeapi.PolicyPackCatalogResponse, error) {
	query := url.Values{}
	if strings.TrimSpace(permission) != "" {
		query.Set("permission", strings.TrimSpace(permission))
	}
	if strings.TrimSpace(executionMode) != "" {
		query.Set("executionMode", strings.TrimSpace(executionMode))
	}
	if strings.TrimSpace(workerType) != "" {
		query.Set("workerType", strings.TrimSpace(workerType))
	}
	if strings.TrimSpace(adapterID) != "" {
		query.Set("adapterId", strings.TrimSpace(adapterID))
	}
	if strings.TrimSpace(clientSurface) != "" {
		query.Set("clientSurface", strings.TrimSpace(clientSurface))
	}
	var response runtimeapi.PolicyPackCatalogResponse
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/policy-packs", query, nil, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) ListExportProfiles(ctx context.Context, exportProfile, reportType, clientSurface, audience, retentionClass string) (*runtimeapi.ExportProfileCatalogResponse, error) {
	query := url.Values{}
	if strings.TrimSpace(exportProfile) != "" {
		query.Set("exportProfile", strings.TrimSpace(exportProfile))
	}
	if strings.TrimSpace(reportType) != "" {
		query.Set("reportType", strings.TrimSpace(reportType))
	}
	if strings.TrimSpace(clientSurface) != "" {
		query.Set("clientSurface", strings.TrimSpace(clientSurface))
	}
	if strings.TrimSpace(audience) != "" {
		query.Set("audience", strings.TrimSpace(audience))
	}
	if strings.TrimSpace(retentionClass) != "" {
		query.Set("retentionClass", strings.TrimSpace(retentionClass))
	}
	var response runtimeapi.ExportProfileCatalogResponse
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/export-profiles", query, nil, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) ListOrgAdminProfiles(ctx context.Context, profileID, organizationModel, roleBundle, clientSurface string) (*runtimeapi.OrgAdminCatalogResponse, error) {
	query := url.Values{}
	if strings.TrimSpace(profileID) != "" {
		query.Set("profileId", strings.TrimSpace(profileID))
	}
	if strings.TrimSpace(organizationModel) != "" {
		query.Set("organizationModel", strings.TrimSpace(organizationModel))
	}
	if strings.TrimSpace(roleBundle) != "" {
		query.Set("roleBundle", strings.TrimSpace(roleBundle))
	}
	if strings.TrimSpace(clientSurface) != "" {
		query.Set("clientSurface", strings.TrimSpace(clientSurface))
	}
	var response runtimeapi.OrgAdminCatalogResponse
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/org-admin-profiles", query, nil, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) GetSessionTimeline(ctx context.Context, sessionID string) (*runtimeapi.SessionTimelineResponse, error) {
	var response runtimeapi.SessionTimelineResponse
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/sessions/"+url.PathEscape(strings.TrimSpace(sessionID))+"/timeline", nil, nil, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) GetSessionEvents(ctx context.Context, sessionID string, afterSequence int64, limit int) (*SessionEventListResponse, error) {
	query := url.Values{}
	if afterSequence > 0 {
		query.Set("afterSequence", strconv.FormatInt(afterSequence, 10))
	}
	if limit > 0 {
		query.Set("limit", strconv.Itoa(limit))
	}
	var response SessionEventListResponse
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/sessions/"+url.PathEscape(strings.TrimSpace(sessionID))+"/events", query, nil, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) StreamSessionEvents(ctx context.Context, sessionID string, afterSequence int64, waitSeconds int, follow bool) ([]runtimeapi.SessionEventRecord, error) {
	if waitSeconds <= 0 {
		waitSeconds = c.defaultFollowWait
	}
	query := url.Values{}
	if afterSequence > 0 {
		query.Set("afterSequence", strconv.FormatInt(afterSequence, 10))
	}
	query.Set("waitSeconds", strconv.Itoa(waitSeconds))
	if follow {
		query.Set("follow", "true")
	}
	var raw []byte
	if err := c.request(ctx, http.MethodGet, "/v1alpha2/runtime/sessions/"+url.PathEscape(strings.TrimSpace(sessionID))+"/events/stream", query, nil, "text/event-stream", &raw); err != nil {
		return nil, err
	}
	return ParseEventStream(raw), nil
}

func (c *Client) SubmitApprovalDecision(ctx context.Context, sessionID, checkpointID, decision, reason string) (*runtimeapi.ApprovalCheckpointDecisionResponse, error) {
	if err := c.RequireScope(); err != nil {
		return nil, err
	}
	body := runtimeapi.ApprovalCheckpointDecisionRequest{
		Meta: runtimeapi.ObjectMeta{
			TenantID:  c.tenantID,
			ProjectID: c.projectID,
			RequestID: fmt.Sprintf("client-approval-%d", time.Now().UTC().UnixNano()),
		},
		Decision: strings.ToUpper(strings.TrimSpace(decision)),
		Reason:   strings.TrimSpace(reason),
	}
	var response runtimeapi.ApprovalCheckpointDecisionResponse
	path := fmt.Sprintf("/v1alpha2/runtime/sessions/%s/approval-checkpoints/%s/decision", url.PathEscape(strings.TrimSpace(sessionID)), url.PathEscape(strings.TrimSpace(checkpointID)))
	if err := c.request(ctx, http.MethodPost, path, nil, body, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) SubmitToolProposalDecision(ctx context.Context, sessionID, proposalID, decision, reason string) (*runtimeapi.ToolProposalDecisionResponse, error) {
	if err := c.RequireScope(); err != nil {
		return nil, err
	}
	body := runtimeapi.ToolProposalDecisionRequest{
		Meta: runtimeapi.ObjectMeta{
			TenantID:  c.tenantID,
			ProjectID: c.projectID,
			RequestID: fmt.Sprintf("client-proposal-%d", time.Now().UTC().UnixNano()),
		},
		Decision: strings.ToUpper(strings.TrimSpace(decision)),
		Reason:   strings.TrimSpace(reason),
	}
	var response runtimeapi.ToolProposalDecisionResponse
	path := fmt.Sprintf("/v1alpha2/runtime/sessions/%s/tool-proposals/%s/decision", url.PathEscape(strings.TrimSpace(sessionID)), url.PathEscape(strings.TrimSpace(proposalID)))
	if err := c.request(ctx, http.MethodPost, path, nil, body, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func (c *Client) InvokeTurn(ctx context.Context, taskID, prompt, executionMode, agentProfileID, systemPrompt string, maxOutputTokens int) (*runtimeapi.AgentInvokeResponse, error) {
	if err := c.RequireScope(); err != nil {
		return nil, err
	}
	body := runtimeapi.AgentInvokeRequest{
		Meta: runtimeapi.ObjectMeta{
			TenantID:  c.tenantID,
			ProjectID: c.projectID,
			RequestID: fmt.Sprintf("client-invoke-%d", time.Now().UTC().UnixNano()),
		},
		TaskID:          strings.TrimSpace(taskID),
		AgentProfileID:  NormalizeStringOrDefault(agentProfileID, "codex"),
		ExecutionMode:   NormalizeStringOrDefault(executionMode, runtimeapi.AgentInvokeExecutionModeRawModelInvoke),
		Prompt:          strings.TrimSpace(prompt),
		SystemPrompt:    strings.TrimSpace(systemPrompt),
		MaxOutputTokens: maxOutputTokens,
	}
	var response runtimeapi.AgentInvokeResponse
	if err := c.request(ctx, http.MethodPost, "/v1alpha1/runtime/integrations/invoke", nil, body, "application/json", &response); err != nil {
		return nil, err
	}
	return &response, nil
}

func NormalizeStringOrDefault(value, fallback string) string {
	text := strings.TrimSpace(value)
	if text == "" {
		return strings.TrimSpace(fallback)
	}
	return text
}

func NormalizeOutputFormat(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), "json") {
		return "json"
	}
	return "text"
}

func ParseEventStream(raw []byte) []runtimeapi.SessionEventRecord {
	chunks := bytes.Split(raw, []byte("\n\n"))
	items := make([]runtimeapi.SessionEventRecord, 0, len(chunks))
	for _, chunk := range chunks {
		lines := bytes.Split(chunk, []byte("\n"))
		dataLines := make([][]byte, 0, len(lines))
		for _, line := range lines {
			trimmed := bytes.TrimSpace(line)
			if bytes.HasPrefix(trimmed, []byte("data:")) {
				dataLines = append(dataLines, bytes.TrimSpace(bytes.TrimPrefix(trimmed, []byte("data:"))))
			}
		}
		if len(dataLines) == 0 {
			continue
		}
		payload := bytes.Join(dataLines, []byte("\n"))
		var item runtimeapi.SessionEventRecord
		if err := json.Unmarshal(payload, &item); err == nil {
			items = append(items, item)
		}
	}
	return items
}
