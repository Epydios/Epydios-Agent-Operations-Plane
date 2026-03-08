package runtime

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type APIServer struct {
	store        RunStore
	orchestrator *Orchestrator
	auth         *AuthEnforcer
	agentInvoker *AgentInvoker
}

func NewAPIServer(store RunStore, orchestrator *Orchestrator, auth *AuthEnforcer) *APIServer {
	initRuntimeMetrics()
	return &APIServer{
		store:        store,
		orchestrator: orchestrator,
		auth:         auth,
	}
}

func (s *APIServer) WithAgentInvoker(invoker *AgentInvoker) *APIServer {
	s.agentInvoker = invoker
	return s
}

const (
	approvalDefaultTTLSeconds  = 900
	approvalMaxTTLSeconds      = 86400
	approvalMaxListLimit       = 500
	terminalRequestMaxBytes    = 1 << 20
	integrationRequestMaxBytes = 1 << 20
	terminalOutputMaxBytes     = 8192
	terminalDefaultTimeoutSec  = 60
	terminalMaxTimeoutSec      = 300
)

var terminalAllowedCommands = map[string]struct{}{
	"cat":      {},
	"date":     {},
	"echo":     {},
	"env":      {},
	"false":    {},
	"head":     {},
	"id":       {},
	"ls":       {},
	"printenv": {},
	"pwd":      {},
	"tail":     {},
	"true":     {},
	"uname":    {},
	"wc":       {},
	"whoami":   {},
}

type approvalListQuery struct {
	Limit     int
	TenantID  string
	ProjectID string
	Status    ApprovalStatus
}

var integrationSecretLikePatterns = []*regexp.Regexp{
	regexp.MustCompile(`sk-[a-zA-Z0-9]{12,}`),
	regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
	regexp.MustCompile(`-----BEGIN`),
	regexp.MustCompile(`AIza[0-9A-Za-z_-]{20,}`),
	regexp.MustCompile(`xox[baprs]-[A-Za-z0-9-]{10,}`),
	regexp.MustCompile(`eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}`),
}

func (s *APIServer) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/v1alpha1/runtime/runs", s.handleRuns)
	mux.HandleFunc("/v1alpha1/runtime/runs/export", s.handleRunExport)
	mux.HandleFunc("/v1alpha1/runtime/runs/retention/prune", s.handleRunRetentionPrune)
	mux.HandleFunc("/v1alpha1/runtime/runs/", s.handleRunByID)
	mux.HandleFunc("/v1alpha1/runtime/approvals", s.handleApprovals)
	mux.HandleFunc("/v1alpha1/runtime/approvals/", s.handleApprovalDecisionByRunID)
	mux.HandleFunc("/v1alpha1/runtime/audit/events", s.handleAuditEvents)
	mux.HandleFunc("/v1alpha1/runtime/terminal/sessions", s.handleTerminalSessions)
	mux.HandleFunc("/v1alpha1/runtime/integrations/settings", s.handleIntegrationSettings)
	mux.HandleFunc("/v1alpha1/runtime/integrations/invoke", s.handleIntegrationInvoke)
	mux.HandleFunc("/v1alpha2/runtime/tasks", s.handleTasksV1Alpha2)
	mux.HandleFunc("/v1alpha2/runtime/tasks/", s.handleTaskByIDV1Alpha2)
	mux.HandleFunc("/v1alpha2/runtime/sessions", s.handleSessionsV1Alpha2)
	mux.HandleFunc("/v1alpha2/runtime/sessions/", s.handleSessionByIDV1Alpha2)
	mux.HandleFunc("/v1alpha2/runtime/approvals/", s.handleApprovalCheckpointByIDV1Alpha2)
	mux.HandleFunc("/v1alpha2/runtime/worker-capabilities", s.handleWorkerCapabilitiesV1Alpha2)
	mux.HandleFunc("/v1alpha2/runtime/policy-packs", s.handlePolicyPacksV1Alpha2)
	return loggingMiddleware(mux)
}

func (s *APIServer) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := s.store.Ping(ctx); err != nil {
		writeAPIError(w, http.StatusServiceUnavailable, "STORE_UNAVAILABLE", "run store unavailable", true, map[string]interface{}{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *APIServer) handleRuns(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleCreateRun(w, r.WithContext(ctx))
	case http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleListRuns(w, r.WithContext(ctx))
	default:
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
	}
}

func (s *APIServer) handleCreateRun(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req RunCreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		emitAuditEvent(r.Context(), "runtime.scope.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"tenantId":   req.Meta.TenantID,
			"projectId":  req.Meta.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, req.Meta.TenantID, req.Meta.ProjectID); err != nil {
		emitAuditEvent(r.Context(), "runtime.authz.policy.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"tenantId":   req.Meta.TenantID,
			"projectId":  req.Meta.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	emitAuditEvent(r.Context(), "runtime.authz.policy.allow", map[string]interface{}{
		"path":       r.URL.Path,
		"method":     r.Method,
		"permission": PermissionRunCreate,
		"tenantId":   req.Meta.TenantID,
		"projectId":  req.Meta.ProjectID,
	})

	injectActorIdentity(&req.Meta, r.Context())
	emitAuditEvent(r.Context(), "runtime.scope.allow", map[string]interface{}{
		"path":       r.URL.Path,
		"method":     r.Method,
		"permission": PermissionRunCreate,
		"tenantId":   req.Meta.TenantID,
		"projectId":  req.Meta.ProjectID,
	})

	run, err := s.orchestrator.ExecuteRun(r.Context(), req)
	if err != nil {
		emitAuditEvent(r.Context(), "runtime.run.create.failed", map[string]interface{}{
			"requestId": req.Meta.RequestID,
			"tenantId":  req.Meta.TenantID,
			"projectId": req.Meta.ProjectID,
			"error":     err.Error(),
		})
		details := map[string]interface{}{"error": err.Error()}
		if run != nil && run.RunID != "" {
			details["runId"] = run.RunID
		}
		writeAPIError(w, http.StatusInternalServerError, "RUN_EXECUTION_FAILED", "run execution failed", true, details)
		return
	}
	emitAuditEvent(r.Context(), "runtime.run.create.accepted", map[string]interface{}{
		"runId":       run.RunID,
		"requestId":   run.RequestID,
		"tenantId":    run.TenantID,
		"projectId":   run.ProjectID,
		"status":      run.Status,
		"policy":      run.PolicyDecision,
		"profileRef":  run.SelectedProfileProvider,
		"policyRef":   run.SelectedPolicyProvider,
		"evidenceRef": run.SelectedEvidenceProvider,
		"desktopRef":  run.SelectedDesktopProvider,
	})
	writeJSON(w, http.StatusCreated, run)
}

func (s *APIServer) handleListRuns(w http.ResponseWriter, r *http.Request) {
	query, err := parseRunListQuery(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error(), false, nil)
		return
	}
	items, err := s.listRunSummariesWithSessionProjection(r.Context(), query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to list runs", true, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	filtered, deniedByAuthz := filterRunSummariesByAuthorization(items, identity, s.auth, PermissionRunRead)
	emitAuditEvent(r.Context(), "runtime.run.list", map[string]interface{}{
		"path":            r.URL.Path,
		"method":          r.Method,
		"requestedLimit":  query.Limit,
		"requestedOffset": query.Offset,
		"filters": map[string]interface{}{
			"tenantId":       query.TenantID,
			"projectId":      query.ProjectID,
			"environment":    query.Environment,
			"status":         query.Status,
			"policyDecision": query.PolicyDecision,
			"providerId":     query.ProviderID,
			"retentionClass": query.RetentionClass,
			"search":         query.Search,
			"includeExpired": query.IncludeExpired,
		},
		"returnedCount":   len(filtered),
		"unfilteredCount": len(items),
		"filteredDenied":  deniedByAuthz,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":          len(filtered),
		"offset":         query.Offset,
		"limit":          query.Limit,
		"includeExpired": query.IncludeExpired,
		"items":          filtered,
	})
}

func (s *APIServer) handleRunExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
	if !ok {
		return
	}
	r = r.WithContext(ctx)

	query, err := parseRunListQuery(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error(), false, nil)
		return
	}

	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "jsonl"
	}
	if format != "jsonl" && format != "csv" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_FORMAT", "format must be one of: jsonl,csv", false, map[string]interface{}{"format": format})
		return
	}

	items, err := s.listRunSummariesWithSessionProjection(r.Context(), query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to list runs for export", true, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	filtered, deniedByAuthz := filterRunSummariesByAuthorization(items, identity, s.auth, PermissionRunRead)

	emitAuditEvent(r.Context(), "runtime.run.export", map[string]interface{}{
		"path":            r.URL.Path,
		"method":          r.Method,
		"format":          format,
		"requestedLimit":  query.Limit,
		"requestedOffset": query.Offset,
		"returnedCount":   len(filtered),
		"unfilteredCount": len(items),
		"filteredDenied":  deniedByAuthz,
	})

	switch format {
	case "jsonl":
		w.Header().Set("Content-Type", "application/x-ndjson")
		for _, item := range filtered {
			b, err := json.Marshal(item)
			if err != nil {
				writeAPIError(w, http.StatusInternalServerError, "EXPORT_ENCODE_FAILED", "failed to encode export record", true, map[string]interface{}{"error": err.Error()})
				return
			}
			_, _ = w.Write(append(b, '\n'))
		}
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		cw := csv.NewWriter(w)
		header := []string{
			"runId", "requestId", "tenantId", "projectId", "environment", "retentionClass", "expiresAt",
			"status", "policyDecision", "policyBundleId", "policyBundleVersion",
			"selectedProfileProvider", "selectedPolicyProvider", "selectedEvidenceProvider", "selectedDesktopProvider",
			"policyGrantTokenPresent", "policyGrantTokenSha256", "createdAt", "updatedAt",
		}
		if err := cw.Write(header); err != nil {
			writeAPIError(w, http.StatusInternalServerError, "EXPORT_ENCODE_FAILED", "failed to write CSV header", true, map[string]interface{}{"error": err.Error()})
			return
		}
		for _, item := range filtered {
			expiresAt := ""
			if item.ExpiresAt != nil {
				expiresAt = item.ExpiresAt.UTC().Format(time.RFC3339)
			}
			row := []string{
				item.RunID,
				item.RequestID,
				item.TenantID,
				item.ProjectID,
				item.Environment,
				item.RetentionClass,
				expiresAt,
				string(item.Status),
				item.PolicyDecision,
				item.PolicyBundleID,
				item.PolicyBundleVersion,
				item.SelectedProfileProvider,
				item.SelectedPolicyProvider,
				item.SelectedEvidenceProvider,
				item.SelectedDesktopProvider,
				strconv.FormatBool(item.PolicyGrantTokenPresent),
				item.PolicyGrantTokenSHA256,
				item.CreatedAt.UTC().Format(time.RFC3339),
				item.UpdatedAt.UTC().Format(time.RFC3339),
			}
			if err := cw.Write(row); err != nil {
				writeAPIError(w, http.StatusInternalServerError, "EXPORT_ENCODE_FAILED", "failed to write CSV row", true, map[string]interface{}{"error": err.Error()})
				return
			}
		}
		cw.Flush()
		if err := cw.Error(); err != nil {
			writeAPIError(w, http.StatusInternalServerError, "EXPORT_ENCODE_FAILED", "failed to flush CSV export", true, map[string]interface{}{"error": err.Error()})
			return
		}
	}
}

type retentionPruneRequest struct {
	DryRun         *bool  `json:"dryRun,omitempty"`
	Before         string `json:"before,omitempty"`
	RetentionClass string `json:"retentionClass,omitempty"`
	Limit          int    `json:"limit,omitempty"`
}

func (s *APIServer) handleRunRetentionPrune(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
	if !ok {
		return
	}
	r = r.WithContext(ctx)

	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := s.authorizeScoped(identity, PermissionRunCreate, "", ""); err != nil {
		s.writeAuthError(w, err)
		return
	}

	req := retentionPruneRequest{Limit: 500}
	if r.Body != nil {
		defer r.Body.Close()
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
			return
		}
	}

	dryRun := true
	if req.DryRun != nil {
		dryRun = *req.DryRun
	}
	before := time.Now().UTC()
	if raw := strings.TrimSpace(req.Before); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "INVALID_BEFORE", "before must be RFC3339", false, map[string]interface{}{"before": raw})
			return
		}
		before = parsed.UTC()
	}

	result, err := s.store.PruneRuns(r.Context(), RunPruneQuery{
		Before:         before,
		RetentionClass: strings.TrimSpace(req.RetentionClass),
		Limit:          req.Limit,
		DryRun:         dryRun,
	})
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "RETENTION_PRUNE_FAILED", "failed to prune retention-expired runs", true, map[string]interface{}{"error": err.Error()})
		return
	}
	emitAuditEvent(r.Context(), "runtime.retention.prune", map[string]interface{}{
		"path":           r.URL.Path,
		"method":         r.Method,
		"dryRun":         result.DryRun,
		"before":         result.Before.Format(time.RFC3339),
		"retentionClass": result.RetentionClass,
		"limit":          result.Limit,
		"matched":        result.Matched,
		"deleted":        result.Deleted,
	})
	writeJSON(w, http.StatusOK, result)
}

func (s *APIServer) handleRunByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
	if !ok {
		return
	}
	r = r.WithContext(ctx)

	runID := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/v1alpha1/runtime/runs/"))
	if runID == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_RUN_ID", "runId is required", false, nil)
		return
	}

	run, err := s.getRunRecordWithSessionProjection(r.Context(), runID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeAPIError(w, http.StatusNotFound, "RUN_NOT_FOUND", "run not found", false, map[string]interface{}{"runId": runID})
			return
		}
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch run", true, map[string]interface{}{"error": err.Error(), "runId": runID})
		return
	}

	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(run.TenantID, run.ProjectID, identity); err != nil {
		emitAuditEvent(r.Context(), "runtime.scope.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunRead,
			"runId":      runID,
			"tenantId":   run.TenantID,
			"projectId":  run.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, run.TenantID, run.ProjectID); err != nil {
		emitAuditEvent(r.Context(), "runtime.authz.policy.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunRead,
			"runId":      runID,
			"tenantId":   run.TenantID,
			"projectId":  run.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	emitAuditEvent(r.Context(), "runtime.authz.policy.allow", map[string]interface{}{
		"path":       r.URL.Path,
		"method":     r.Method,
		"permission": PermissionRunRead,
		"runId":      runID,
		"tenantId":   run.TenantID,
		"projectId":  run.ProjectID,
	})

	emitAuditEvent(r.Context(), "runtime.run.read", map[string]interface{}{
		"path":      r.URL.Path,
		"method":    r.Method,
		"runId":     runID,
		"tenantId":  run.TenantID,
		"projectId": run.ProjectID,
		"status":    run.Status,
	})
	writeJSON(w, http.StatusOK, run)
}

func (s *APIServer) handleApprovals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
	if !ok {
		return
	}
	r = r.WithContext(ctx)

	query, err := parseApprovalListQuery(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error(), false, nil)
		return
	}

	runQuery := RunListQuery{
		Limit:          approvalListFetchLimit(query.Limit),
		Offset:         0,
		TenantID:       query.TenantID,
		ProjectID:      query.ProjectID,
		IncludeExpired: true,
	}
	if query.Status == ApprovalStatusDenied {
		runQuery.PolicyDecision = "DENY"
	}

	items, err := s.store.ListRuns(r.Context(), runQuery)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to list runs", true, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	filtered, deniedByAuthz := filterRunSummariesByAuthorization(items, identity, s.auth, PermissionRunRead)

	now := time.Now().UTC()
	records := make([]ApprovalRecord, 0, query.Limit)
	storeLookupErrors := 0
	for _, summary := range filtered {
		run, err := s.store.GetRun(r.Context(), summary.RunID)
		if err != nil {
			storeLookupErrors++
			continue
		}
		record, ok := buildApprovalRecordFromRun(run, now)
		if !ok {
			continue
		}
		if query.Status != "" && record.Status != query.Status {
			continue
		}
		records = append(records, record)
		if len(records) >= query.Limit {
			break
		}
	}

	emitAuditEvent(r.Context(), "runtime.approval.list", map[string]interface{}{
		"path":              r.URL.Path,
		"method":            r.Method,
		"requestedLimit":    query.Limit,
		"tenantFilter":      query.TenantID,
		"projectFilter":     query.ProjectID,
		"statusFilter":      query.Status,
		"returnedCount":     len(records),
		"unfilteredRuns":    len(items),
		"filteredDenied":    deniedByAuthz,
		"storeLookupErrors": storeLookupErrors,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"source":          "runtime-store",
		"count":           len(records),
		"unfilteredCount": len(items),
		"filteredDenied":  deniedByAuthz,
		"items":           records,
	})
}

func (s *APIServer) handleApprovalDecisionByRunID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
	if !ok {
		return
	}
	r = r.WithContext(ctx)

	runID, err := parseApprovalDecisionPath(r.URL.Path)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_APPROVAL_PATH", err.Error(), false, nil)
		return
	}

	run, err := s.store.GetRun(r.Context(), runID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeAPIError(w, http.StatusNotFound, "RUN_NOT_FOUND", "run not found", false, map[string]interface{}{"runId": runID})
			return
		}
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch run", true, map[string]interface{}{"error": err.Error(), "runId": runID})
		return
	}

	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(run.TenantID, run.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, run.TenantID, run.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	var req ApprovalDecisionRequest
	if r.Body != nil {
		defer r.Body.Close()
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
			return
		}
	}

	decision := strings.ToUpper(strings.TrimSpace(req.Decision))
	if decision != "APPROVE" && decision != "DENY" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_DECISION", "decision must be APPROVE or DENY", false, map[string]interface{}{"decision": req.Decision})
		return
	}

	ttlSeconds := req.TTLSeconds
	if ttlSeconds <= 0 {
		ttlSeconds = approvalDefaultTTLSeconds
	}
	if ttlSeconds > approvalMaxTTLSeconds {
		writeAPIError(w, http.StatusBadRequest, "INVALID_TTL_SECONDS", fmt.Sprintf("ttlSeconds must be <= %d", approvalMaxTTLSeconds), false, map[string]interface{}{"ttlSeconds": req.TTLSeconds})
		return
	}

	payloadRequest, desktopReq, err := decodeDesktopRequestFromRunPayload(run.RequestPayload)
	if err != nil {
		writeAPIError(w, http.StatusConflict, "RUN_NOT_APPROVAL_ELIGIBLE", err.Error(), false, map[string]interface{}{"runId": runID})
		return
	}
	if normalizeDesktopTier(desktopReq.Tier) < desktopTierHighRisk {
		writeAPIError(w, http.StatusConflict, "RUN_NOT_APPROVAL_ELIGIBLE", "run desktop tier is below approval threshold", false, map[string]interface{}{"runId": runID, "tier": desktopReq.Tier})
		return
	}

	now := time.Now().UTC()
	currentStatus := classifyApprovalStatus(run, desktopReq, now)
	targetStatus := ApprovalStatusDenied
	if decision == "APPROVE" {
		targetStatus = ApprovalStatusApproved
	}
	if currentStatus == ApprovalStatusExpired {
		writeAPIError(w, http.StatusConflict, "APPROVAL_EXPIRED", "approval request is expired", false, map[string]interface{}{"runId": runID, "status": currentStatus})
		return
	}
	if currentStatus == targetStatus {
		writeJSON(w, http.StatusOK, ApprovalDecisionResponse{
			Applied:    false,
			RunID:      runID,
			Decision:   decision,
			Status:     currentStatus,
			Reason:     strings.TrimSpace(req.Reason),
			ReviewedAt: now.Format(time.RFC3339),
		})
		return
	}
	if currentStatus == ApprovalStatusApproved || currentStatus == ApprovalStatusDenied {
		writeAPIError(w, http.StatusConflict, "APPROVAL_ALREADY_RESOLVED", "approval request is already resolved", false, map[string]interface{}{"runId": runID, "status": currentStatus})
		return
	}

	reason := strings.TrimSpace(req.Reason)
	switch decision {
	case "APPROVE":
		grantToken := strings.TrimSpace(req.GrantToken)
		if grantToken == "" {
			grantToken = fmt.Sprintf("manual-approval-%s-%d", runID, now.Unix())
		}
		run.PolicyDecision = "ALLOW"
		run.PolicyGrantTokenPresent = true
		run.PolicyGrantTokenSHA256 = "sha256:" + sha256Hex(grantToken)
		if run.Status == RunStatusFailed {
			run.Status = RunStatusPolicyEvaluated
		}
		run.ErrorMessage = ""
		if run.ExpiresAt == nil {
			t := now.Add(time.Duration(ttlSeconds) * time.Second)
			run.ExpiresAt = &t
		}
		desktopReq.HumanApprovalGranted = true
		if reason == "" {
			reason = "approved by operator"
		}
	case "DENY":
		run.PolicyDecision = "DENY"
		run.PolicyGrantTokenPresent = false
		run.PolicyGrantTokenSHA256 = ""
		run.Status = RunStatusFailed
		desktopReq.HumanApprovalGranted = false
		if reason == "" {
			reason = "denied by operator"
		}
		run.ErrorMessage = reason
		t := now
		run.ExpiresAt = &t
	}

	run.UpdatedAt = now
	payloadRequest.Desktop = desktopReq
	payloadBytes, err := json.Marshal(payloadRequest)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "PAYLOAD_ENCODE_FAILED", "failed to encode updated run payload", true, map[string]interface{}{"error": err.Error(), "runId": runID})
		return
	}
	run.RequestPayload = payloadBytes

	if err := s.store.UpsertRun(r.Context(), run); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist approval decision", true, map[string]interface{}{"error": err.Error(), "runId": runID})
		return
	}
	if checkpoints := projectLegacyRunToApprovalCheckpoints(run); len(checkpoints) > 0 {
		checkpoint := checkpoints[0]
		checkpoint.UpdatedAt = now
		s.upsertApprovalCheckpointBestEffort(r.Context(), &checkpoint)
	}
	s.appendSessionEventBestEffort(r.Context(), &SessionEventRecord{
		SessionID: runID,
		EventType: SessionEventType("approval.status.changed"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"runId":      runID,
			"decision":   decision,
			"status":     targetStatus,
			"reason":     reason,
			"approvalId": "approval-" + runID,
		}),
		Timestamp: now,
	})

	emitAuditEvent(r.Context(), "runtime.approval.decision", map[string]interface{}{
		"path":      r.URL.Path,
		"method":    r.Method,
		"runId":     runID,
		"tenantId":  run.TenantID,
		"projectId": run.ProjectID,
		"decision":  decision,
		"status":    targetStatus,
		"reason":    reason,
	})

	writeJSON(w, http.StatusOK, ApprovalDecisionResponse{
		Applied:    true,
		RunID:      runID,
		Decision:   decision,
		Status:     targetStatus,
		Reason:     reason,
		ReviewedAt: now.Format(time.RFC3339),
	})
}

func (s *APIServer) handleTerminalSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
	if !ok {
		return
	}
	s.handleCreateTerminalSession(w, r.WithContext(ctx))
}

func (s *APIServer) handleCreateTerminalSession(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req TerminalSessionCreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, terminalRequestMaxBytes)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}

	runID := strings.TrimSpace(req.Scope.RunID)
	if runID == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_RUN_ID", "scope.runId is required", false, nil)
		return
	}

	run, err := s.store.GetRun(r.Context(), runID)
	if err != nil {
		if isRunNotFoundError(err) {
			writeAPIError(w, http.StatusNotFound, "RUN_NOT_FOUND", "run not found", false, map[string]interface{}{"runId": runID})
			return
		}
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch run", true, map[string]interface{}{"error": err.Error(), "runId": runID})
		return
	}

	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		emitAuditEvent(r.Context(), "runtime.scope.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"runId":      runID,
			"tenantId":   req.Meta.TenantID,
			"projectId":  req.Meta.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}

	tenantID, projectID, err := resolveTerminalScope(&req, run)
	if err != nil {
		writeAPIError(w, http.StatusConflict, "TERMINAL_SCOPE_MISMATCH", err.Error(), false, map[string]interface{}{"runId": runID})
		return
	}

	if err := enforceRunRecordScope(run.TenantID, run.ProjectID, identity); err != nil {
		emitAuditEvent(r.Context(), "runtime.scope.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"runId":      runID,
			"tenantId":   run.TenantID,
			"projectId":  run.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}

	if err := s.authorizeScoped(identity, PermissionRunCreate, tenantID, projectID); err != nil {
		emitAuditEvent(r.Context(), "runtime.authz.policy.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"runId":      runID,
			"tenantId":   tenantID,
			"projectId":  projectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	emitAuditEvent(r.Context(), "runtime.authz.policy.allow", map[string]interface{}{
		"path":       r.URL.Path,
		"method":     r.Method,
		"permission": PermissionRunCreate,
		"runId":      runID,
		"tenantId":   tenantID,
		"projectId":  projectID,
	})

	injectActorIdentity(&req.Meta, r.Context())
	issuedAt := time.Now().UTC()
	auditLink := normalizeTerminalAuditLink(req.AuditLink, runID)
	toolActionID := fmt.Sprintf("tool-terminal-%d", issuedAt.UnixNano())
	response := TerminalSessionCreateResponse{
		Source:        "runtime-endpoint",
		Applied:       false,
		RequestedAt:   issuedAt.Format(time.RFC3339),
		RunID:         runID,
		ProvenanceTag: strings.TrimSpace(req.Provenance.CommandTag),
		AuditLink:     auditLink,
	}

	if reason := terminalPolicyBlockReason(&req); reason != "" {
		response.Status = "POLICY_BLOCKED"
		response.Warning = reason
		s.upsertToolActionBestEffort(r.Context(), &ToolActionRecord{
			ToolActionID:          toolActionID,
			SessionID:             runID,
			TenantID:              tenantID,
			ProjectID:             projectID,
			ToolType:              "terminal_command",
			Status:                ToolActionStatusPolicyBlocked,
			Source:                "v1alpha1.runtime.terminal",
			RequestPayload:        mustMarshalJSON(map[string]interface{}{"command": req.Command.Text, "cwd": req.Command.CWD, "timeoutSeconds": req.Command.TimeoutSeconds}),
			ResultPayload:         mustMarshalJSON(map[string]interface{}{"reason": reason}),
			PolicyDecision:        "DENY",
			AuditLink:             mustMarshalJSON(auditLink),
			ReadOnly:              req.Command.ReadOnlyRequested,
			RestrictedHostRequest: req.Safety.RestrictedHostRequest,
			CreatedAt:             issuedAt,
			UpdatedAt:             issuedAt,
		})
		s.appendSessionEventBestEffort(r.Context(), &SessionEventRecord{
			SessionID: runID,
			EventType: SessionEventType("tool_action.blocked"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"toolActionId":  toolActionID,
				"toolType":      "terminal_command",
				"command":       req.Command.Text,
				"provenanceTag": response.ProvenanceTag,
				"reason":        reason,
			}),
			Timestamp: issuedAt,
		})
		emitAuditEvent(r.Context(), auditLink.Event, map[string]interface{}{
			"runId":         runID,
			"tenantId":      tenantID,
			"projectId":     projectID,
			"providerId":    auditLink.ProviderID,
			"decision":      "DENY",
			"status":        response.Status,
			"reasonCode":    "policy_blocked",
			"reasonMessage": reason,
			"commandTag":    response.ProvenanceTag,
		})
		writeJSON(w, http.StatusOK, response)
		return
	}

	commandName, commandArgs, err := parseTerminalCommand(req.Command.Text)
	if err != nil {
		response.Status = "POLICY_BLOCKED"
		response.Warning = err.Error()
		s.upsertToolActionBestEffort(r.Context(), &ToolActionRecord{
			ToolActionID:          toolActionID,
			SessionID:             runID,
			TenantID:              tenantID,
			ProjectID:             projectID,
			ToolType:              "terminal_command",
			Status:                ToolActionStatusPolicyBlocked,
			Source:                "v1alpha1.runtime.terminal",
			RequestPayload:        mustMarshalJSON(map[string]interface{}{"command": req.Command.Text, "cwd": req.Command.CWD, "timeoutSeconds": req.Command.TimeoutSeconds}),
			ResultPayload:         mustMarshalJSON(map[string]interface{}{"reason": err.Error()}),
			PolicyDecision:        "DENY",
			AuditLink:             mustMarshalJSON(auditLink),
			ReadOnly:              req.Command.ReadOnlyRequested,
			RestrictedHostRequest: req.Safety.RestrictedHostRequest,
			CreatedAt:             issuedAt,
			UpdatedAt:             issuedAt,
		})
		s.appendSessionEventBestEffort(r.Context(), &SessionEventRecord{
			SessionID: runID,
			EventType: SessionEventType("tool_action.blocked"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"toolActionId":  toolActionID,
				"toolType":      "terminal_command",
				"command":       req.Command.Text,
				"provenanceTag": response.ProvenanceTag,
				"reason":        err.Error(),
			}),
			Timestamp: issuedAt,
		})
		emitAuditEvent(r.Context(), auditLink.Event, map[string]interface{}{
			"runId":         runID,
			"tenantId":      tenantID,
			"projectId":     projectID,
			"providerId":    auditLink.ProviderID,
			"decision":      "DENY",
			"status":        response.Status,
			"reasonCode":    "command_rejected",
			"reasonMessage": err.Error(),
			"commandTag":    response.ProvenanceTag,
		})
		writeJSON(w, http.StatusOK, response)
		return
	}

	execResult, execErr := executeTerminalCommand(r.Context(), commandName, commandArgs, req.Command.CWD, normalizeTerminalTimeoutSeconds(req.Command.TimeoutSeconds))
	response.Applied = true
	response.SessionID = fmt.Sprintf("term-%d", issuedAt.UnixNano())
	response.Result = execResult
	if execErr != nil {
		response.Status = "FAILED"
		response.Warning = execErr.Error()
	} else {
		response.Status = "COMPLETED"
	}
	eventType := SessionEventType("tool_action.completed")
	toolActionStatus := ToolActionStatusCompleted
	if execErr != nil {
		eventType = SessionEventType("tool_action.failed")
		toolActionStatus = ToolActionStatusFailed
	}
	s.upsertToolActionBestEffort(r.Context(), &ToolActionRecord{
		ToolActionID:          toolActionID,
		SessionID:             runID,
		TenantID:              tenantID,
		ProjectID:             projectID,
		ToolType:              "terminal_command",
		Status:                toolActionStatus,
		Source:                "v1alpha1.runtime.terminal",
		RequestPayload:        mustMarshalJSON(map[string]interface{}{"command": commandName, "commandArgs": commandArgs, "cwd": req.Command.CWD, "timeoutSeconds": req.Command.TimeoutSeconds}),
		ResultPayload:         mustMarshalJSON(map[string]interface{}{"status": response.Status, "exitCode": execResult.ExitCode, "timedOut": execResult.TimedOut, "outputSha256": execResult.OutputSHA256, "error": response.Warning}),
		PolicyDecision:        "ALLOW",
		AuditLink:             mustMarshalJSON(auditLink),
		ReadOnly:              req.Command.ReadOnlyRequested,
		RestrictedHostRequest: req.Safety.RestrictedHostRequest,
		CreatedAt:             issuedAt,
		UpdatedAt:             time.Now().UTC(),
	})
	evidenceID := fmt.Sprintf("%s-evidence", toolActionID)
	s.upsertEvidenceRecordBestEffort(r.Context(), &EvidenceRecord{
		EvidenceID:   evidenceID,
		SessionID:    runID,
		ToolActionID: toolActionID,
		TenantID:     tenantID,
		ProjectID:    projectID,
		Kind:         "tool_output",
		Checksum:     execResult.OutputSHA256,
		Metadata:     mustMarshalJSON(map[string]interface{}{"status": response.Status, "exitCode": execResult.ExitCode, "timedOut": execResult.TimedOut, "outputTruncated": execResult.Truncated, "auditEvent": auditLink.Event}),
		CreatedAt:    time.Now().UTC(),
		UpdatedAt:    time.Now().UTC(),
	})
	s.appendSessionEventBestEffort(r.Context(), &SessionEventRecord{
		SessionID: runID,
		EventType: SessionEventType("evidence.recorded"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"evidenceId":   evidenceID,
			"toolActionId": toolActionID,
			"kind":         "tool_output",
			"checksum":     execResult.OutputSHA256,
		}),
		Timestamp: time.Now().UTC(),
	})
	s.appendSessionEventBestEffort(r.Context(), &SessionEventRecord{
		SessionID: runID,
		EventType: eventType,
		Payload: mustMarshalJSON(map[string]interface{}{
			"toolActionId":      toolActionID,
			"toolType":          "terminal_command",
			"terminalSessionId": response.SessionID,
			"command":           commandName,
			"commandArgs":       commandArgs,
			"provenanceTag":     response.ProvenanceTag,
			"status":            response.Status,
			"exitCode":          execResult.ExitCode,
			"timedOut":          execResult.TimedOut,
			"outputSha256":      execResult.OutputSHA256,
		}),
		Timestamp: time.Now().UTC(),
	})

	emitAuditEvent(r.Context(), auditLink.Event, map[string]interface{}{
		"runId":           runID,
		"tenantId":        tenantID,
		"projectId":       projectID,
		"providerId":      auditLink.ProviderID,
		"decision":        "ALLOW",
		"status":          response.Status,
		"command":         commandName,
		"commandArgs":     commandArgs,
		"commandTag":      response.ProvenanceTag,
		"exitCode":        execResult.ExitCode,
		"timedOut":        execResult.TimedOut,
		"outputSha256":    execResult.OutputSHA256,
		"outputTruncated": execResult.Truncated,
	})
	writeJSON(w, http.StatusCreated, response)
}

func (s *APIServer) handleIntegrationSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleGetIntegrationSettings(w, r.WithContext(ctx))
	case http.MethodPut:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleUpsertIntegrationSettings(w, r.WithContext(ctx))
	default:
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
	}
}

func (s *APIServer) handleIntegrationInvoke(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
	if !ok {
		return
	}
	s.handlePostIntegrationInvoke(w, r.WithContext(ctx))
}

func (s *APIServer) handlePostIntegrationInvoke(w http.ResponseWriter, r *http.Request) {
	if s.agentInvoker == nil {
		writeAPIError(
			w,
			http.StatusNotImplemented,
			"INTEGRATION_INVOKE_UNAVAILABLE",
			"runtime integration invocation is not configured",
			false,
			nil,
		)
		return
	}
	defer r.Body.Close()

	var req AgentInvokeRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, integrationRequestMaxBytes)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	req.ExecutionMode = normalizedAgentInvokeExecutionMode(req.ExecutionMode)
	if req.ExecutionMode == AgentInvokeExecutionModeManagedCodexWorker && strings.TrimSpace(strings.ToLower(req.AgentProfileID)) != "codex" {
		writeAPIError(
			w,
			http.StatusBadRequest,
			"INVALID_EXECUTION_MODE",
			"managed_codex_worker requires agentProfileId=codex",
			false,
			map[string]interface{}{"agentProfileId": req.AgentProfileID, "executionMode": req.ExecutionMode},
		)
		return
	}

	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		emitAuditEvent(r.Context(), "runtime.scope.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"tenantId":   req.Meta.TenantID,
			"projectId":  req.Meta.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, req.Meta.TenantID, req.Meta.ProjectID); err != nil {
		emitAuditEvent(r.Context(), "runtime.authz.policy.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"tenantId":   req.Meta.TenantID,
			"projectId":  req.Meta.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	injectActorIdentity(&req.Meta, r.Context())
	invokeStartedAt := time.Now().UTC()
	invokeDescriptor := invokeExecutionDescriptorForRequest(&req)
	task, session, err := s.ensureInvokeSession(r.Context(), &req, invokeStartedAt)
	if err != nil {
		writeAPIError(
			w,
			http.StatusInternalServerError,
			"STORE_UPDATE_FAILED",
			"failed to initialize invoke session",
			true,
			map[string]interface{}{"error": err.Error()},
		)
		return
	}
	worker, err := s.ensureInvokeWorker(r.Context(), session, &req, invokeStartedAt)
	if err != nil {
		writeAPIError(
			w,
			http.StatusInternalServerError,
			"STORE_UPDATE_FAILED",
			"failed to initialize invoke worker",
			true,
			map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID},
		)
		return
	}
	toolActionID := invokeSessionToolActionID(session.SessionID, invokeDescriptor.toolActionType, req.Meta.RequestID)
	s.appendSessionEventBestEffort(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("tool_action.requested"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"toolActionId":   toolActionID,
			"toolType":       invokeDescriptor.toolActionType,
			"requestId":      req.Meta.RequestID,
			"agentProfileId": strings.TrimSpace(req.AgentProfileID),
			"promptPreview":  truncatePromptPreview(req.Prompt),
			"executionMode":  invokeDescriptor.executionMode,
		}),
		Timestamp: invokeStartedAt,
	})
	s.upsertToolActionBestEffort(r.Context(), &ToolActionRecord{
		ToolActionID: toolActionID,
		SessionID:    session.SessionID,
		TenantID:     session.TenantID,
		ProjectID:    session.ProjectID,
		ToolType:     invokeDescriptor.toolActionType,
		Status:       ToolActionStatusRequested,
		Source:       invokeDescriptor.toolActionSource,
		RequestPayload: mustMarshalJSON(map[string]interface{}{
			"requestId":       req.Meta.RequestID,
			"agentProfileId":  strings.TrimSpace(req.AgentProfileID),
			"prompt":          strings.TrimSpace(req.Prompt),
			"promptPreview":   truncatePromptPreview(req.Prompt),
			"systemPrompt":    strings.TrimSpace(req.SystemPrompt),
			"maxOutputTokens": req.MaxOutputTokens,
			"executionMode":   invokeDescriptor.executionMode,
		}),
		CreatedAt: invokeStartedAt,
		UpdatedAt: invokeStartedAt,
	})
	emitAuditEvent(r.Context(), "runtime.authz.policy.allow", map[string]interface{}{
		"path":       r.URL.Path,
		"method":     r.Method,
		"permission": PermissionRunCreate,
		"tenantId":   req.Meta.TenantID,
		"projectId":  req.Meta.ProjectID,
	})

	emitAuditEvent(r.Context(), "runtime.integrations.invoke.started", map[string]interface{}{
		"path":           r.URL.Path,
		"method":         r.Method,
		"tenantId":       req.Meta.TenantID,
		"projectId":      req.Meta.ProjectID,
		"agentProfileId": strings.TrimSpace(req.AgentProfileID),
		"requestId":      strings.TrimSpace(req.Meta.RequestID),
	})
	response, err := s.agentInvoker.Invoke(r.Context(), req)
	if err != nil {
		s.markInvokeSessionResult(r.Context(), task, session, &AgentInvokeResponse{
			RequestID: req.Meta.RequestID,
			TaskID:    task.TaskID,
			SessionID: session.SessionID,
			SelectedWorkerID: func() string {
				if worker == nil {
					return session.SelectedWorkerID
				}
				return worker.WorkerID
			}(),
			TenantID:       req.Meta.TenantID,
			ProjectID:      req.Meta.ProjectID,
			AgentProfileID: strings.TrimSpace(req.AgentProfileID),
			ExecutionMode:  req.ExecutionMode,
			WorkerType: func() string {
				if worker == nil {
					return ""
				}
				return worker.WorkerType
			}(),
			WorkerAdapterID: func() string {
				if worker == nil {
					return ""
				}
				return worker.AdapterID
			}(),
		}, err, time.Now().UTC())
		emitAuditEvent(r.Context(), "runtime.integrations.invoke.failed", map[string]interface{}{
			"path":           r.URL.Path,
			"method":         r.Method,
			"tenantId":       req.Meta.TenantID,
			"projectId":      req.Meta.ProjectID,
			"agentProfileId": strings.TrimSpace(req.AgentProfileID),
			"requestId":      strings.TrimSpace(req.Meta.RequestID),
			"error":          err.Error(),
		})
		writeAPIError(
			w,
			http.StatusBadGateway,
			"INTEGRATION_INVOKE_FAILED",
			"integration invocation failed",
			true,
			map[string]interface{}{"error": err.Error()},
		)
		return
	}
	response.TaskID = task.TaskID
	response.SessionID = session.SessionID
	response.SelectedWorkerID = worker.WorkerID
	response.ExecutionMode = req.ExecutionMode
	response.WorkerType = worker.WorkerType
	response.WorkerAdapterID = worker.AdapterID
	s.markInvokeSessionResult(r.Context(), task, session, response, nil, time.Now().UTC())

	emitAuditEvent(r.Context(), "runtime.integrations.invoke.completed", map[string]interface{}{
		"path":           r.URL.Path,
		"method":         r.Method,
		"tenantId":       response.TenantID,
		"projectId":      response.ProjectID,
		"agentProfileId": response.AgentProfileID,
		"provider":       response.Provider,
		"transport":      response.Transport,
		"model":          response.Model,
		"route":          response.Route,
		"requestId":      response.RequestID,
		"finishReason":   response.FinishReason,
	})
	writeJSON(w, http.StatusOK, response)
}

func truncatePromptPreview(value string) string {
	value = strings.TrimSpace(value)
	if len(value) <= 160 {
		return value
	}
	return value[:160] + "..."
}

func (s *APIServer) handleGetIntegrationSettings(w http.ResponseWriter, r *http.Request) {
	scope := ObjectMeta{
		TenantID:  strings.TrimSpace(r.URL.Query().Get("tenantId")),
		ProjectID: strings.TrimSpace(r.URL.Query().Get("projectId")),
	}

	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&scope, identity); err != nil {
		emitAuditEvent(r.Context(), "runtime.scope.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunRead,
			"tenantId":   scope.TenantID,
			"projectId":  scope.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	if scope.TenantID == "" || scope.ProjectID == "" {
		writeAPIError(
			w,
			http.StatusBadRequest,
			"INVALID_SCOPE",
			"tenantId and projectId are required",
			false,
			map[string]interface{}{"tenantId": scope.TenantID, "projectId": scope.ProjectID},
		)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, scope.TenantID, scope.ProjectID); err != nil {
		emitAuditEvent(r.Context(), "runtime.authz.policy.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunRead,
			"tenantId":   scope.TenantID,
			"projectId":  scope.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	emitAuditEvent(r.Context(), "runtime.authz.policy.allow", map[string]interface{}{
		"path":       r.URL.Path,
		"method":     r.Method,
		"permission": PermissionRunRead,
		"tenantId":   scope.TenantID,
		"projectId":  scope.ProjectID,
	})

	record, err := s.store.GetIntegrationSettings(r.Context(), scope.TenantID, scope.ProjectID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			emitAuditEvent(r.Context(), "runtime.integrations.settings.read", map[string]interface{}{
				"path":        r.URL.Path,
				"method":      r.Method,
				"tenantId":    scope.TenantID,
				"projectId":   scope.ProjectID,
				"hasSettings": false,
			})
			writeJSON(w, http.StatusOK, IntegrationSettingsResponse{
				Source:      "runtime-store",
				TenantID:    scope.TenantID,
				ProjectID:   scope.ProjectID,
				HasSettings: false,
				Settings:    []byte("{}"),
			})
			return
		}
		writeAPIError(
			w,
			http.StatusInternalServerError,
			"STORE_QUERY_FAILED",
			"failed to fetch integration settings",
			true,
			map[string]interface{}{"error": err.Error(), "tenantId": scope.TenantID, "projectId": scope.ProjectID},
		)
		return
	}

	settingsJSON, normalizeErr := normalizeIntegrationSettingsJSON(record.Settings)
	if normalizeErr != nil {
		writeAPIError(
			w,
			http.StatusInternalServerError,
			"SETTINGS_DECODE_FAILED",
			"failed to decode integration settings payload",
			true,
			map[string]interface{}{"error": normalizeErr.Error(), "tenantId": scope.TenantID, "projectId": scope.ProjectID},
		)
		return
	}

	createdAt := record.CreatedAt.UTC()
	updatedAt := record.UpdatedAt.UTC()
	emitAuditEvent(r.Context(), "runtime.integrations.settings.read", map[string]interface{}{
		"path":        r.URL.Path,
		"method":      r.Method,
		"tenantId":    scope.TenantID,
		"projectId":   scope.ProjectID,
		"hasSettings": true,
		"updatedAt":   updatedAt.Format(time.RFC3339),
	})
	writeJSON(w, http.StatusOK, IntegrationSettingsResponse{
		Source:      "runtime-store",
		TenantID:    scope.TenantID,
		ProjectID:   scope.ProjectID,
		HasSettings: true,
		Settings:    settingsJSON,
		CreatedAt:   &createdAt,
		UpdatedAt:   &updatedAt,
	})
}

func (s *APIServer) handleUpsertIntegrationSettings(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req IntegrationSettingsUpsertRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, integrationRequestMaxBytes)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	if len(req.Settings) == 0 {
		writeAPIError(w, http.StatusBadRequest, "INVALID_SETTINGS", "settings object is required", false, nil)
		return
	}

	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		emitAuditEvent(r.Context(), "runtime.scope.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"tenantId":   req.Meta.TenantID,
			"projectId":  req.Meta.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID == "" || req.Meta.ProjectID == "" {
		writeAPIError(
			w,
			http.StatusBadRequest,
			"INVALID_SCOPE",
			"meta.tenantId and meta.projectId are required",
			false,
			map[string]interface{}{"tenantId": req.Meta.TenantID, "projectId": req.Meta.ProjectID},
		)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, req.Meta.TenantID, req.Meta.ProjectID); err != nil {
		emitAuditEvent(r.Context(), "runtime.authz.policy.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": PermissionRunCreate,
			"tenantId":   req.Meta.TenantID,
			"projectId":  req.Meta.ProjectID,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return
	}
	emitAuditEvent(r.Context(), "runtime.authz.policy.allow", map[string]interface{}{
		"path":       r.URL.Path,
		"method":     r.Method,
		"permission": PermissionRunCreate,
		"tenantId":   req.Meta.TenantID,
		"projectId":  req.Meta.ProjectID,
	})

	settingsJSON, normalizeErr := normalizeIntegrationSettingsJSON(req.Settings)
	if normalizeErr != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_SETTINGS", "settings must be a JSON object", false, map[string]interface{}{"error": normalizeErr.Error()})
		return
	}
	validationErrors := validateIntegrationSettingsJSON(settingsJSON)
	if len(validationErrors) > 0 {
		writeAPIError(
			w,
			http.StatusBadRequest,
			"INVALID_SETTINGS",
			"integration settings failed validation",
			false,
			map[string]interface{}{"errors": validationErrors},
		)
		return
	}

	now := time.Now().UTC()
	record := &IntegrationSettingsRecord{
		TenantID:  req.Meta.TenantID,
		ProjectID: req.Meta.ProjectID,
		Settings:  settingsJSON,
		UpdatedAt: now,
	}
	if existing, err := s.store.GetIntegrationSettings(r.Context(), req.Meta.TenantID, req.Meta.ProjectID); err == nil && existing != nil {
		record.CreatedAt = existing.CreatedAt.UTC()
	} else {
		record.CreatedAt = now
	}
	if err := s.store.UpsertIntegrationSettings(r.Context(), record); err != nil {
		writeAPIError(
			w,
			http.StatusInternalServerError,
			"STORE_UPDATE_FAILED",
			"failed to persist integration settings",
			true,
			map[string]interface{}{"error": err.Error(), "tenantId": req.Meta.TenantID, "projectId": req.Meta.ProjectID},
		)
		return
	}

	createdAt := record.CreatedAt.UTC()
	updatedAt := record.UpdatedAt.UTC()
	emitAuditEvent(r.Context(), "runtime.integrations.settings.update", map[string]interface{}{
		"path":         r.URL.Path,
		"method":       r.Method,
		"tenantId":     req.Meta.TenantID,
		"projectId":    req.Meta.ProjectID,
		"settingCount": integrationSettingsKeyCount(settingsJSON),
		"updatedAt":    updatedAt.Format(time.RFC3339),
	})
	writeJSON(w, http.StatusOK, IntegrationSettingsResponse{
		Source:      "runtime-store",
		TenantID:    req.Meta.TenantID,
		ProjectID:   req.Meta.ProjectID,
		HasSettings: true,
		Settings:    settingsJSON,
		CreatedAt:   &createdAt,
		UpdatedAt:   &updatedAt,
	})
}

func parseApprovalListQuery(r *http.Request) (approvalListQuery, error) {
	q := approvalListQuery{
		Limit:     100,
		TenantID:  strings.TrimSpace(r.URL.Query().Get("tenantId")),
		ProjectID: strings.TrimSpace(r.URL.Query().Get("projectId")),
	}

	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return q, fmt.Errorf("limit must be an integer")
		}
		q.Limit = parsed
	}
	if q.Limit <= 0 {
		return q, fmt.Errorf("limit must be >= 1")
	}
	if q.Limit > approvalMaxListLimit {
		return q, fmt.Errorf("limit must be <= %d", approvalMaxListLimit)
	}

	rawStatus := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("status")))
	switch rawStatus {
	case "":
		q.Status = ""
	case string(ApprovalStatusPending):
		q.Status = ApprovalStatusPending
	case string(ApprovalStatusApproved):
		q.Status = ApprovalStatusApproved
	case string(ApprovalStatusDenied):
		q.Status = ApprovalStatusDenied
	case string(ApprovalStatusExpired):
		q.Status = ApprovalStatusExpired
	default:
		return q, fmt.Errorf("status must be one of: PENDING,APPROVED,DENIED,EXPIRED")
	}

	return q, nil
}

func parseApprovalDecisionPath(path string) (string, error) {
	raw := strings.TrimSpace(strings.TrimPrefix(path, "/v1alpha1/runtime/approvals/"))
	raw = strings.TrimSuffix(raw, "/")
	if !strings.HasSuffix(raw, "/decision") {
		return "", fmt.Errorf("path must end with /decision")
	}
	runID := strings.TrimSuffix(raw, "/decision")
	runID = strings.Trim(runID, "/")
	if runID == "" {
		return "", fmt.Errorf("runId is required")
	}
	if strings.Contains(runID, "/") {
		return "", fmt.Errorf("runId is invalid")
	}
	return runID, nil
}

func approvalListFetchLimit(requested int) int {
	if requested < 100 {
		return 100
	}
	expanded := requested * 4
	if expanded > approvalMaxListLimit {
		return approvalMaxListLimit
	}
	return expanded
}

func isRunNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, sql.ErrNoRows) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "not found")
}

func resolveTerminalScope(req *TerminalSessionCreateRequest, run *RunRecord) (string, string, error) {
	if req == nil {
		return "", "", fmt.Errorf("terminal request is missing")
	}
	tenantID := strings.TrimSpace(req.Scope.TenantID)
	projectID := strings.TrimSpace(req.Scope.ProjectID)
	if tenantID == "" {
		tenantID = strings.TrimSpace(req.Meta.TenantID)
	}
	if projectID == "" {
		projectID = strings.TrimSpace(req.Meta.ProjectID)
	}
	if run != nil {
		if tenantID == "" {
			tenantID = strings.TrimSpace(run.TenantID)
		}
		if projectID == "" {
			projectID = strings.TrimSpace(run.ProjectID)
		}
		if strings.TrimSpace(run.TenantID) != "" && tenantID != "" && tenantID != strings.TrimSpace(run.TenantID) {
			return "", "", fmt.Errorf("tenantId does not match run scope")
		}
		if strings.TrimSpace(run.ProjectID) != "" && projectID != "" && projectID != strings.TrimSpace(run.ProjectID) {
			return "", "", fmt.Errorf("projectId does not match run scope")
		}
	}
	return tenantID, projectID, nil
}

func normalizeTerminalAuditLink(link TerminalAuditLink, runID string) TerminalAuditLink {
	event := strings.TrimSpace(link.Event)
	if event == "" {
		event = "runtime.terminal.command"
	}
	providerID := strings.TrimSpace(link.ProviderID)
	if providerID == "" {
		providerID = "terminal-session"
	}
	scopedRunID := strings.TrimSpace(link.RunID)
	if scopedRunID == "" {
		scopedRunID = strings.TrimSpace(runID)
	}
	return TerminalAuditLink{
		Event:      event,
		RunID:      scopedRunID,
		ProviderID: providerID,
	}
}

func terminalPolicyBlockReason(req *TerminalSessionCreateRequest) string {
	if req == nil {
		return "terminal request payload is required"
	}
	terminalMode := strings.ToLower(strings.TrimSpace(req.Safety.TerminalMode))
	if terminalMode == "" {
		terminalMode = "interactive_sandbox_only"
	}
	if terminalMode != "interactive_sandbox_only" && terminalMode != "read_only" {
		return "unsupported terminal mode; expected interactive_sandbox_only or read_only"
	}

	restrictedHostMode := strings.ToLower(strings.TrimSpace(req.Safety.RestrictedHostMode))
	if restrictedHostMode == "" {
		restrictedHostMode = "blocked"
	}
	if restrictedHostMode != "blocked" {
		return "restricted_host terminal mode is not enabled in runtime endpoint"
	}
	if req.Safety.RestrictedHostRequest {
		return "restricted_host terminal requests are blocked by default policy posture"
	}
	if terminalMode == "read_only" && !req.Command.ReadOnlyRequested {
		return "terminal mode read_only requires command.readOnlyRequested=true"
	}
	return ""
}

func parseTerminalCommand(raw string) (string, []string, error) {
	commandText := strings.TrimSpace(raw)
	if commandText == "" {
		return "", nil, fmt.Errorf("command.text is required")
	}
	if strings.ContainsAny(commandText, "|;&`$><\n\r") {
		return "", nil, fmt.Errorf("command contains unsupported control operators")
	}
	parts := strings.Fields(commandText)
	if len(parts) == 0 {
		return "", nil, fmt.Errorf("command.text is required")
	}
	commandName := strings.TrimSpace(parts[0])
	if commandName == "" {
		return "", nil, fmt.Errorf("command.text is required")
	}
	if strings.Contains(commandName, "/") {
		return "", nil, fmt.Errorf("command path separators are not allowed")
	}
	if _, ok := terminalAllowedCommands[commandName]; !ok {
		return "", nil, fmt.Errorf("command %q is not allowed by deterministic terminal policy", commandName)
	}
	return commandName, parts[1:], nil
}

func normalizeTerminalTimeoutSeconds(value int) int {
	if value <= 0 {
		return terminalDefaultTimeoutSec
	}
	if value > terminalMaxTimeoutSec {
		return terminalMaxTimeoutSec
	}
	return value
}

func executeTerminalCommand(parent context.Context, commandName string, args []string, cwd string, timeoutSeconds int) (*TerminalExecutionResult, error) {
	if parent == nil {
		parent = context.Background()
	}
	timeoutSeconds = normalizeTerminalTimeoutSeconds(timeoutSeconds)
	ctx, cancel := context.WithTimeout(parent, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, commandName, args...)
	if trimmed := strings.TrimSpace(cwd); trimmed != "" {
		cmd.Dir = trimmed
	}
	output, err := cmd.CombinedOutput()

	result := &TerminalExecutionResult{}
	if len(output) > terminalOutputMaxBytes {
		result.Truncated = true
		output = output[:terminalOutputMaxBytes]
	}
	if len(output) > 0 {
		result.Output = string(output)
		result.OutputSHA256 = "sha256:" + sha256Hex(result.Output)
	}

	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		result.TimedOut = true
	}

	if err != nil {
		result.ExitCode = -1
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			result.ExitCode = exitErr.ExitCode()
		}
		if result.TimedOut {
			return result, fmt.Errorf("command timed out after %d seconds", timeoutSeconds)
		}
		return result, fmt.Errorf("command execution failed: %w", err)
	}

	result.ExitCode = 0
	return result, nil
}

func decodeDesktopRequestFromRunPayload(payload json.RawMessage) (RunCreateRequest, *DesktopExecutionRequest, error) {
	var req RunCreateRequest
	if len(payload) == 0 {
		return req, nil, fmt.Errorf("run request payload is missing")
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		return req, nil, fmt.Errorf("run request payload decode failed: %w", err)
	}
	if !desktopRequestEnabled(req.Desktop) {
		return req, nil, fmt.Errorf("run request does not include desktop execution details")
	}
	if req.Desktop == nil {
		return req, nil, fmt.Errorf("run request desktop block is empty")
	}
	return req, req.Desktop, nil
}

func classifyApprovalStatus(run *RunRecord, desktopReq *DesktopExecutionRequest, now time.Time) ApprovalStatus {
	if run == nil || desktopReq == nil {
		return ""
	}
	if normalizeDesktopTier(desktopReq.Tier) < desktopTierHighRisk {
		return ""
	}
	if run.PolicyGrantTokenPresent {
		return ApprovalStatusApproved
	}
	if strings.EqualFold(strings.TrimSpace(run.PolicyDecision), "DENY") {
		return ApprovalStatusDenied
	}
	if run.ExpiresAt != nil && run.ExpiresAt.UTC().Before(now) {
		return ApprovalStatusExpired
	}
	return ApprovalStatusPending
}

func approvalReasonForStatus(status ApprovalStatus, run *RunRecord) string {
	switch status {
	case ApprovalStatusApproved:
		if strings.TrimSpace(run.PolicyGrantTokenSHA256) != "" {
			return "policy grant token recorded"
		}
		return "approved by operator decision"
	case ApprovalStatusDenied:
		if strings.TrimSpace(run.ErrorMessage) != "" {
			return run.ErrorMessage
		}
		return "approval request denied"
	case ApprovalStatusExpired:
		return "approval request expired"
	case ApprovalStatusPending:
		return "awaiting operator approval and policy grant token"
	default:
		return ""
	}
}

func buildApprovalRecordFromRun(run *RunRecord, now time.Time) (ApprovalRecord, bool) {
	if run == nil {
		return ApprovalRecord{}, false
	}

	req, desktopReq, err := decodeDesktopRequestFromRunPayload(run.RequestPayload)
	if err != nil {
		return ApprovalRecord{}, false
	}

	status := classifyApprovalStatus(run, desktopReq, now)
	if status == "" {
		return ApprovalRecord{}, false
	}

	createdAt := run.CreatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = now
	}

	var expiresAt *time.Time
	if run.ExpiresAt != nil {
		exp := run.ExpiresAt.UTC()
		expiresAt = &exp
	} else {
		exp := createdAt.Add(time.Duration(approvalDefaultTTLSeconds) * time.Second)
		expiresAt = &exp
	}

	var reviewedAt *time.Time
	if status == ApprovalStatusApproved || status == ApprovalStatusDenied {
		reviewed := run.UpdatedAt.UTC()
		if reviewed.IsZero() {
			reviewed = now
		}
		reviewedAt = &reviewed
	}

	targetOS := strings.ToLower(strings.TrimSpace(desktopReq.TargetOS))
	if targetOS == "" {
		targetOS = desktopOSLinux
	}
	targetProfile := strings.ToLower(strings.TrimSpace(desktopReq.TargetExecutionProfile))
	if targetProfile == "" {
		targetProfile = desktopProfileSandboxVMAutonomous
	}

	record := ApprovalRecord{
		ApprovalID:             "approval-" + run.RunID,
		RunID:                  run.RunID,
		RequestID:              run.RequestID,
		TenantID:               run.TenantID,
		ProjectID:              run.ProjectID,
		Tier:                   normalizeDesktopTier(desktopReq.Tier),
		TargetOS:               targetOS,
		TargetExecutionProfile: targetProfile,
		RequestedCapabilities:  normalizeStringList(desktopReq.RequestedCapabilities),
		RequiredVerifierIDs:    normalizeStringList(desktopReq.RequiredVerifierIDs),
		Status:                 status,
		Reason:                 approvalReasonForStatus(status, run),
		CreatedAt:              createdAt,
		ExpiresAt:              expiresAt,
		ReviewedAt:             reviewedAt,
	}

	if record.RequestID == "" {
		record.RequestID = req.Meta.RequestID
	}
	return record, true
}

func (s *APIServer) handleAuditEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
	if !ok {
		return
	}
	r = r.WithContext(ctx)

	limit := 100
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "INVALID_LIMIT", "limit must be an integer", false, map[string]interface{}{"limit": raw})
			return
		}
		limit = parsed
	}

	query := RuntimeAuditQuery{
		Limit:      limit,
		TenantID:   strings.TrimSpace(r.URL.Query().Get("tenantId")),
		ProjectID:  strings.TrimSpace(r.URL.Query().Get("projectId")),
		ProviderID: strings.TrimSpace(r.URL.Query().Get("providerId")),
		Decision:   strings.TrimSpace(r.URL.Query().Get("decision")),
		Event:      strings.TrimSpace(r.URL.Query().Get("event")),
	}
	items := ListRuntimeAuditEvents(query)
	identity, _ := RuntimeIdentityFromContext(r.Context())
	filtered, deniedByAuthz := filterAuditEventsByAuthorization(items, identity, s.auth, PermissionRunRead)

	emitAuditEvent(r.Context(), "runtime.audit.list", map[string]interface{}{
		"path":            r.URL.Path,
		"method":          r.Method,
		"requestedLimit":  limit,
		"returnedCount":   len(filtered),
		"unfilteredCount": len(items),
		"filteredDenied":  deniedByAuthz,
		"tenantFilter":    query.TenantID,
		"projectFilter":   query.ProjectID,
		"providerFilter":  query.ProviderID,
		"decisionFilter":  strings.ToUpper(query.Decision),
		"eventFilter":     query.Event,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"source":          "runtime-memory",
		"count":           len(filtered),
		"unfilteredCount": len(items),
		"filteredDenied":  deniedByAuthz,
		"items":           filtered,
	})
}

func (s *APIServer) authorizeRequest(w http.ResponseWriter, r *http.Request, permission string) (context.Context, bool) {
	if s.auth == nil || !s.auth.Enabled() {
		return r.Context(), true
	}

	identity, err := s.auth.AuthenticateRequest(r)
	if err != nil {
		emitAuditEvent(r.Context(), "runtime.authn.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": permission,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return nil, false
	}
	if err := s.auth.Authorize(identity, permission); err != nil {
		ctxWithIdentity := withRuntimeIdentity(r.Context(), identity)
		emitAuditEvent(ctxWithIdentity, "runtime.authz.deny", map[string]interface{}{
			"path":       r.URL.Path,
			"method":     r.Method,
			"permission": permission,
			"error":      err.Error(),
		})
		s.writeAuthError(w, err)
		return nil, false
	}

	ctxWithIdentity := withRuntimeIdentity(r.Context(), identity)
	emitAuditEvent(ctxWithIdentity, "runtime.authz.allow", map[string]interface{}{
		"path":       r.URL.Path,
		"method":     r.Method,
		"permission": permission,
	})
	return ctxWithIdentity, true
}

func (s *APIServer) writeAuthError(w http.ResponseWriter, err error) {
	details := map[string]interface{}{"error": err.Error()}
	switch {
	case errors.Is(err, ErrForbidden):
		writeAPIError(w, http.StatusForbidden, "FORBIDDEN", "request is not authorized for this operation", false, details)
	case errors.Is(err, ErrAuthRequired), errors.Is(err, ErrInvalidToken):
		writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "authentication required", false, details)
	default:
		writeAPIError(w, http.StatusUnauthorized, "UNAUTHORIZED", "authentication failed", false, details)
	}
}

func (s *APIServer) authorizeScoped(identity *RuntimeIdentity, permission, tenantID, projectID string) error {
	if s.auth == nil || !s.auth.Enabled() {
		return nil
	}
	return s.auth.AuthorizeScoped(identity, permission, tenantID, projectID)
}

func injectActorIdentity(meta *ObjectMeta, ctx context.Context) {
	identity, ok := RuntimeIdentityFromContext(ctx)
	if !ok || identity == nil {
		return
	}
	if meta.Actor == nil {
		meta.Actor = JSONObject{}
	}
	if _, exists := meta.Actor["subject"]; !exists {
		meta.Actor["subject"] = identity.Subject
	}
	if identity.ClientID != "" {
		if _, exists := meta.Actor["clientId"]; !exists {
			meta.Actor["clientId"] = identity.ClientID
		}
	}
	if len(identity.Roles) > 0 {
		if _, exists := meta.Actor["roles"]; !exists {
			roles := append([]string(nil), identity.Roles...)
			meta.Actor["roles"] = roles
		}
	}
	if _, exists := meta.Actor["authn"]; !exists {
		meta.Actor["authn"] = "oidc-jwt"
	}
	if len(identity.TenantIDs) > 0 {
		if _, exists := meta.Actor["tenantScopes"]; !exists {
			meta.Actor["tenantScopes"] = append([]string(nil), identity.TenantIDs...)
		}
	}
	if len(identity.ProjectIDs) > 0 {
		if _, exists := meta.Actor["projectScopes"]; !exists {
			meta.Actor["projectScopes"] = append([]string(nil), identity.ProjectIDs...)
		}
	}
}

func enforceRequestMetaScope(meta *ObjectMeta, identity *RuntimeIdentity) error {
	if identity == nil || meta == nil {
		return nil
	}

	meta.TenantID = strings.TrimSpace(meta.TenantID)
	meta.ProjectID = strings.TrimSpace(meta.ProjectID)

	if meta.TenantID == "" && len(identity.TenantIDs) == 1 {
		meta.TenantID = identity.TenantIDs[0]
	}
	if meta.ProjectID == "" && len(identity.ProjectIDs) == 1 {
		meta.ProjectID = identity.ProjectIDs[0]
	}

	return enforceRunRecordScope(meta.TenantID, meta.ProjectID, identity)
}

func enforceRunRecordScope(tenantID, projectID string, identity *RuntimeIdentity) error {
	if identity == nil {
		return nil
	}
	tenantID = strings.TrimSpace(tenantID)
	projectID = strings.TrimSpace(projectID)

	if len(identity.TenantIDs) > 0 {
		if tenantID == "" {
			return fmt.Errorf("%w: tenant scope is required", ErrForbidden)
		}
		if !identity.AllowsTenant(tenantID) {
			return fmt.Errorf("%w: tenantId %q is outside token scope", ErrForbidden, tenantID)
		}
	}
	if len(identity.ProjectIDs) > 0 {
		if projectID == "" {
			return fmt.Errorf("%w: project scope is required", ErrForbidden)
		}
		if !identity.AllowsProject(projectID) {
			return fmt.Errorf("%w: projectId %q is outside token scope", ErrForbidden, projectID)
		}
	}
	return nil
}

func filterRunSummariesByAuthorization(items []RunSummary, identity *RuntimeIdentity, auth *AuthEnforcer, permission string) ([]RunSummary, int) {
	out := make([]RunSummary, 0, len(items))
	denied := 0
	for _, item := range items {
		if err := enforceRunRecordScope(item.TenantID, item.ProjectID, identity); err != nil {
			denied++
			continue
		}
		if auth != nil && auth.Enabled() {
			if err := auth.AuthorizeScoped(identity, permission, item.TenantID, item.ProjectID); err != nil {
				denied++
				continue
			}
		}
		out = append(out, item)
	}
	return out, denied
}

func filterAuditEventsByAuthorization(items []map[string]interface{}, identity *RuntimeIdentity, auth *AuthEnforcer, permission string) ([]map[string]interface{}, int) {
	out := make([]map[string]interface{}, 0, len(items))
	denied := 0
	for _, item := range items {
		tenantID := runtimeAuditRecordString(item, "tenantId")
		projectID := runtimeAuditRecordString(item, "projectId")

		if err := enforceRunRecordScope(tenantID, projectID, identity); err != nil {
			denied++
			continue
		}
		if auth != nil && auth.Enabled() {
			if err := auth.AuthorizeScoped(identity, permission, tenantID, projectID); err != nil {
				denied++
				continue
			}
		}
		out = append(out, cloneInterfaceMap(item))
	}
	return out, denied
}

func normalizeIntegrationSettingsJSON(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return []byte("{}"), nil
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}
	normalized, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return normalized, nil
}

func validateIntegrationSettingsJSON(raw json.RawMessage) []string {
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return []string{"settings must be a valid JSON object"}
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}
	errs := make([]string, 0, 8)
	validateIntegrationSettingsNode(payload, "settings", &errs)
	return errs
}

func validateIntegrationSettingsNode(value interface{}, path string, errs *[]string) {
	switch typed := value.(type) {
	case map[string]interface{}:
		for key, child := range typed {
			normalizedKey := strings.ToLower(strings.TrimSpace(key))
			childPath := path + "." + key
			validateIntegrationSettingsScalar(normalizedKey, childPath, child, errs)
			validateIntegrationSettingsNode(child, childPath, errs)
		}
	case []interface{}:
		for i, child := range typed {
			childPath := fmt.Sprintf("%s[%d]", path, i)
			validateIntegrationSettingsNode(child, childPath, errs)
		}
	}
}

func validateIntegrationSettingsScalar(key, path string, value interface{}, errs *[]string) {
	switch key {
	case "modelrouting":
		text, ok := value.(string)
		if !ok {
			*errs = append(*errs, path+" must be a string value.")
			return
		}
		normalized := strings.ToLower(strings.TrimSpace(text))
		if normalized != "gateway_first" && normalized != "direct_first" {
			*errs = append(*errs, path+" must be gateway_first or direct_first.")
		}
	case "profilecredentialscope", "credentialscope":
		text, ok := value.(string)
		if !ok {
			*errs = append(*errs, path+" must be a string value.")
			return
		}
		normalized := strings.ToLower(strings.TrimSpace(text))
		if normalized != "project" && normalized != "tenant" && normalized != "workspace" {
			*errs = append(*errs, path+" must be project, tenant, or workspace.")
		}
	case "allowdirectproviderfallback", "enabled", "profileenabled":
		if _, ok := value.(bool); !ok {
			*errs = append(*errs, path+" must be a boolean value.")
		}
	}

	text, ok := value.(string)
	if !ok {
		return
	}
	trimmed := strings.TrimSpace(text)
	if looksLikeRawIntegrationSecret(trimmed) {
		*errs = append(*errs, path+" looks like raw secret material; use a ref:// pointer instead.")
	}
	if strings.HasSuffix(key, "ref") {
		if trimmed == "" {
			*errs = append(*errs, path+" is required.")
			return
		}
		if !strings.HasPrefix(trimmed, "ref://") {
			*errs = append(*errs, path+" must use ref:// format.")
		}
	}
}

func looksLikeRawIntegrationSecret(value string) bool {
	text := strings.TrimSpace(value)
	if text == "" {
		return false
	}
	for _, pattern := range integrationSecretLikePatterns {
		if pattern.MatchString(text) {
			return true
		}
	}
	return false
}

func integrationSettingsKeyCount(raw json.RawMessage) int {
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return 0
	}
	return len(payload)
}

func parseRunListQuery(r *http.Request) (RunListQuery, error) {
	q := RunListQuery{
		Limit:          100,
		Offset:         0,
		IncludeExpired: true,
		TenantID:       strings.TrimSpace(r.URL.Query().Get("tenantId")),
		ProjectID:      strings.TrimSpace(r.URL.Query().Get("projectId")),
		Environment:    strings.TrimSpace(r.URL.Query().Get("environment")),
		Status:         strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("status"))),
		PolicyDecision: strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("policyDecision"))),
		ProviderID:     strings.TrimSpace(r.URL.Query().Get("providerId")),
		RetentionClass: strings.TrimSpace(r.URL.Query().Get("retentionClass")),
		Search:         strings.TrimSpace(r.URL.Query().Get("search")),
	}

	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return q, fmt.Errorf("limit must be an integer")
		}
		q.Limit = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return q, fmt.Errorf("offset must be an integer")
		}
		q.Offset = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("includeExpired")); raw != "" {
		parsed, err := strconv.ParseBool(raw)
		if err != nil {
			return q, fmt.Errorf("includeExpired must be boolean")
		}
		q.IncludeExpired = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("createdAfter")); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return q, fmt.Errorf("createdAfter must be RFC3339")
		}
		t := parsed.UTC()
		q.CreatedAfter = &t
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("createdBefore")); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return q, fmt.Errorf("createdBefore must be RFC3339")
		}
		t := parsed.UTC()
		q.CreatedBefore = &t
	}
	if q.CreatedAfter != nil && q.CreatedBefore != nil && q.CreatedAfter.After(*q.CreatedBefore) {
		return q, fmt.Errorf("createdAfter must be <= createdBefore")
	}
	return q, nil
}

func writeAPIError(w http.ResponseWriter, code int, errorCode, msg string, retryable bool, details map[string]interface{}) {
	writeJSON(w, code, APIError{
		ErrorCode: errorCode,
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
		recorder := &responseRecorder{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}
		next.ServeHTTP(recorder, r)
		duration := time.Since(start)
		observeRuntimeHTTPRequest(r.Method, r.URL.Path, recorder.statusCode, duration)
		log.Printf(
			"%s %s remote=%s status=%d dur=%s",
			r.Method,
			r.URL.Path,
			r.RemoteAddr,
			recorder.statusCode,
			duration.Round(time.Millisecond),
		)
	})
}

type responseRecorder struct {
	http.ResponseWriter
	statusCode int
}

func (r *responseRecorder) WriteHeader(statusCode int) {
	r.statusCode = statusCode
	r.ResponseWriter.WriteHeader(statusCode)
}

type ServerConfig struct {
	ListenAddr string
}

func StartHTTPServer(ctx context.Context, cfg ServerConfig, handler http.Handler) error {
	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- fmt.Errorf("listen: %w", err)
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
		return ctx.Err()
	case err := <-errCh:
		return err
	}
}
