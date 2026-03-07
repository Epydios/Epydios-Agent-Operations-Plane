package runtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (s *APIServer) handleTasksV1Alpha2(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleCreateTaskV1Alpha2(w, r.WithContext(ctx))
	case http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleListTasksV1Alpha2(w, r.WithContext(ctx))
	default:
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
	}
}

func (s *APIServer) handleTaskByIDV1Alpha2(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/v1alpha2/runtime/tasks/")
	trimmed = strings.Trim(trimmed, "/")
	if trimmed == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_TASK_ID", "taskId is required", false, nil)
		return
	}
	parts := strings.Split(trimmed, "/")
	taskID := strings.TrimSpace(parts[0])
	if taskID == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_TASK_ID", "taskId is required", false, nil)
		return
	}
	if len(parts) == 2 && parts[1] == "sessions" {
		if r.Method != http.MethodPost {
			writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
			return
		}
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleCreateSessionForTaskV1Alpha2(w, r.WithContext(ctx), taskID)
		return
	}
	if len(parts) != 1 || r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
	if !ok {
		return
	}
	s.handleGetTaskV1Alpha2(w, r.WithContext(ctx), taskID)
}

func (s *APIServer) handleSessionsV1Alpha2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
	if !ok {
		return
	}
	s.handleListSessionsV1Alpha2(w, r.WithContext(ctx))
}

func (s *APIServer) handleSessionByIDV1Alpha2(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/v1alpha2/runtime/sessions/")
	trimmed = strings.Trim(trimmed, "/")
	if trimmed == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_SESSION_ID", "sessionId is required", false, nil)
		return
	}
	parts := strings.Split(trimmed, "/")
	sessionID := strings.TrimSpace(parts[0])
	if sessionID == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_SESSION_ID", "sessionId is required", false, nil)
		return
	}
	switch {
	case len(parts) == 1 && r.Method == http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleGetSessionV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && parts[1] == "timeline" && r.Method == http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleGetSessionTimelineV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && parts[1] == "events" && r.Method == http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleListSessionEventsV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 3 && parts[1] == "events" && parts[2] == "stream" && r.Method == http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleStreamSessionEventsV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && (parts[1] == "approvals" || parts[1] == "approval-checkpoints") && r.Method == http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleListApprovalCheckpointsV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && (parts[1] == "approvals" || parts[1] == "approval-checkpoints") && r.Method == http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleCreateApprovalCheckpointV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 4 && (parts[1] == "approvals" || parts[1] == "approval-checkpoints") && parts[3] == "decision" && r.Method == http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		checkpointID := strings.TrimSpace(parts[2])
		if checkpointID == "" {
			writeAPIError(w, http.StatusBadRequest, "INVALID_CHECKPOINT_ID", "checkpointId is required", false, nil)
			return
		}
		s.handleApprovalCheckpointDecisionV1Alpha2(w, r.WithContext(ctx), sessionID, checkpointID)
		return
	case len(parts) == 2 && parts[1] == "workers" && r.Method == http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleListSessionWorkersV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && parts[1] == "workers" && r.Method == http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleAttachSessionWorkerV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 4 && parts[1] == "workers" && parts[3] == "events" && r.Method == http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		workerID := strings.TrimSpace(parts[2])
		if workerID == "" {
			writeAPIError(w, http.StatusBadRequest, "INVALID_WORKER_ID", "workerId is required", false, nil)
			return
		}
		s.handleCreateSessionWorkerEventV1Alpha2(w, r.WithContext(ctx), sessionID, workerID)
		return
	case len(parts) == 4 && parts[1] == "tool-proposals" && parts[3] == "decision" && r.Method == http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		proposalID := strings.TrimSpace(parts[2])
		if proposalID == "" {
			writeAPIError(w, http.StatusBadRequest, "INVALID_PROPOSAL_ID", "proposalId is required", false, nil)
			return
		}
		s.handleToolProposalDecisionV1Alpha2(w, r.WithContext(ctx), sessionID, proposalID)
		return
	case len(parts) == 2 && parts[1] == "tool-actions" && r.Method == http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleListToolActionsV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && parts[1] == "tool-actions" && r.Method == http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleCreateToolActionV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && parts[1] == "evidence" && r.Method == http.MethodGet:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunRead)
		if !ok {
			return
		}
		s.handleListEvidenceRecordsV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && parts[1] == "evidence" && r.Method == http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleCreateEvidenceRecordV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	case len(parts) == 2 && parts[1] == "close" && r.Method == http.MethodPost:
		ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
		if !ok {
			return
		}
		s.handleCloseSessionV1Alpha2(w, r.WithContext(ctx), sessionID)
		return
	default:
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
	}
}

func (s *APIServer) handleApprovalCheckpointByIDV1Alpha2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAPIError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "method not allowed", false, nil)
		return
	}
	ctx, ok := s.authorizeRequest(w, r, PermissionRunCreate)
	if !ok {
		return
	}
	trimmed := strings.TrimPrefix(r.URL.Path, "/v1alpha2/runtime/approvals/")
	trimmed = strings.Trim(trimmed, "/")
	parts := strings.Split(trimmed, "/")
	if len(parts) != 2 || parts[1] != "decision" || strings.TrimSpace(parts[0]) == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_APPROVAL_PATH", "checkpointId and decision path are required", false, nil)
		return
	}
	checkpointID := strings.TrimSpace(parts[0])
	checkpoints, err := s.store.ListApprovalCheckpoints(ctx, ApprovalCheckpointListQuery{
		CheckpointID: checkpointID,
		Limit:        1,
	})
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch approval checkpoint", true, map[string]interface{}{"error": err.Error(), "checkpointId": checkpointID})
		return
	}
	if len(checkpoints) == 0 {
		writeAPIError(w, http.StatusNotFound, "APPROVAL_CHECKPOINT_NOT_FOUND", "approval checkpoint not found", false, map[string]interface{}{"checkpointId": checkpointID})
		return
	}
	s.handleApprovalCheckpointDecisionV1Alpha2(w, r.WithContext(ctx), checkpoints[0].SessionID, checkpointID)
}

func (s *APIServer) handleCreateTaskV1Alpha2(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()

	var req TaskCreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID == "" || req.Meta.ProjectID == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_SCOPE", "meta.tenantId and meta.projectId are required", false, nil)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, req.Meta.TenantID, req.Meta.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Intent = strings.TrimSpace(req.Intent)
	if req.Title == "" || req.Intent == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_TASK", "title and intent are required", false, nil)
		return
	}
	injectActorIdentity(&req.Meta, r.Context())
	now := time.Now().UTC()
	task := &TaskRecord{
		TaskID:      fmt.Sprintf("task-%d", now.UnixNano()),
		RequestID:   normalizeRequestID(req.Meta.RequestID, "task", now),
		TenantID:    req.Meta.TenantID,
		ProjectID:   req.Meta.ProjectID,
		Source:      normalizeStringOrDefault(req.Source, "operator"),
		Title:       req.Title,
		Intent:      req.Intent,
		RequestedBy: mustMarshalJSONObject(req.Meta.Actor, req.RequestedBy),
		Status:      TaskStatusNew,
		Annotations: mustMarshalJSONObject(nil, req.Annotations),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.store.UpsertTask(r.Context(), task); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist task", true, map[string]interface{}{"error": err.Error()})
		return
	}
	if err := s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		EventID:   fmt.Sprintf("%s-created", task.TaskID),
		SessionID: task.TaskID,
		Sequence:  1,
		EventType: SessionEventType("task.created"),
		Payload:   mustMarshalJSON(map[string]interface{}{"taskId": task.TaskID, "status": task.Status, "source": task.Source}),
		Timestamp: now,
	}); err == nil {
		// task-scoped events will matter later; ignore persistence failure here because tasks do not yet have a dedicated event table
	}
	writeJSON(w, http.StatusCreated, task)
}

func (s *APIServer) handleListTasksV1Alpha2(w http.ResponseWriter, r *http.Request) {
	query, err := parseTaskListQuery(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error(), false, nil)
		return
	}
	items, err := s.store.ListTasks(r.Context(), query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to list tasks", true, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	filtered := make([]TaskRecord, 0, len(items))
	for _, item := range items {
		if err := enforceRunRecordScope(item.TenantID, item.ProjectID, identity); err != nil {
			continue
		}
		if err := s.authorizeScoped(identity, PermissionRunRead, item.TenantID, item.ProjectID); err != nil {
			continue
		}
		filtered = append(filtered, item)
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":  len(filtered),
		"limit":  query.Limit,
		"offset": query.Offset,
		"items":  filtered,
	})
}

func (s *APIServer) handleGetTaskV1Alpha2(w http.ResponseWriter, r *http.Request, taskID string) {
	task, err := s.store.GetTask(r.Context(), taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeAPIError(w, http.StatusNotFound, "TASK_NOT_FOUND", "task not found", false, map[string]interface{}{"taskId": taskID})
			return
		}
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch task", true, map[string]interface{}{"error": err.Error(), "taskId": taskID})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(task.TenantID, task.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, task.TenantID, task.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *APIServer) handleCreateSessionForTaskV1Alpha2(w http.ResponseWriter, r *http.Request, taskID string) {
	defer r.Body.Close()

	task, err := s.store.GetTask(r.Context(), taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeAPIError(w, http.StatusNotFound, "TASK_NOT_FOUND", "task not found", false, map[string]interface{}{"taskId": taskID})
			return
		}
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch task", true, map[string]interface{}{"error": err.Error(), "taskId": taskID})
		return
	}

	var req SessionCreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := enforceRunRecordScope(task.TenantID, task.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, task.TenantID, task.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	now := time.Now().UTC()
	session := &SessionRecord{
		SessionID:   fmt.Sprintf("sess-%d", now.UnixNano()),
		TaskID:      task.TaskID,
		RequestID:   normalizeRequestID(req.Meta.RequestID, "session", now),
		LegacyRunID: strings.TrimSpace(req.LegacyRunID),
		TenantID:    task.TenantID,
		ProjectID:   task.ProjectID,
		SessionType: normalizeStringOrDefault(req.SessionType, "operator_request"),
		Status:      SessionStatusPending,
		Source:      normalizeStringOrDefault(req.Source, "v1alpha2.runtime"),
		Summary:     mustMarshalJSONObject(nil, req.Summary),
		Annotations: mustMarshalJSONObject(nil, req.Annotations),
		CreatedAt:   now,
		StartedAt:   now,
		UpdatedAt:   now,
	}
	if session.LegacyRunID != "" {
		if legacyRun, err := s.store.GetRun(r.Context(), session.LegacyRunID); err == nil {
			if legacyRun.TenantID != task.TenantID || legacyRun.ProjectID != task.ProjectID {
				writeAPIError(w, http.StatusConflict, "LEGACY_RUN_SCOPE_MISMATCH", "legacy run scope must match task scope", false, map[string]interface{}{"taskId": task.TaskID, "legacyRunId": session.LegacyRunID})
				return
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to validate legacy run", true, map[string]interface{}{"error": err.Error(), "legacyRunId": session.LegacyRunID})
			return
		}
	}

	if err := s.store.UpsertSession(r.Context(), session); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist session", true, map[string]interface{}{"error": err.Error(), "taskId": task.TaskID})
		return
	}
	task.LatestSessionID = session.SessionID
	task.Status = TaskStatusInProgress
	task.UpdatedAt = now
	if err := s.store.UpsertTask(r.Context(), task); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update task", true, map[string]interface{}{"error": err.Error(), "taskId": task.TaskID})
		return
	}
	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("session.created"),
		Payload:   mustMarshalJSON(map[string]interface{}{"taskId": task.TaskID, "status": session.Status, "legacyRunId": session.LegacyRunID}),
		Timestamp: now,
	})
	writeJSON(w, http.StatusCreated, session)
}

func (s *APIServer) handleListSessionsV1Alpha2(w http.ResponseWriter, r *http.Request) {
	query, err := parseSessionListQuery(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error(), false, nil)
		return
	}
	items, err := s.store.ListSessions(r.Context(), query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to list sessions", true, map[string]interface{}{"error": err.Error()})
		return
	}
	if query.IncludeLegacy {
		projected, err := s.projectLegacySessions(r, query)
		if err != nil {
			writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to project legacy sessions", true, map[string]interface{}{"error": err.Error()})
			return
		}
		items = mergeSessionLists(items, projected)
	}

	identity, _ := RuntimeIdentityFromContext(r.Context())
	filtered := make([]SessionRecord, 0, len(items))
	for _, item := range items {
		if err := enforceRunRecordScope(item.TenantID, item.ProjectID, identity); err != nil {
			continue
		}
		if err := s.authorizeScoped(identity, PermissionRunRead, item.TenantID, item.ProjectID); err != nil {
			continue
		}
		filtered = append(filtered, item)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":         len(filtered),
		"limit":         query.Limit,
		"offset":        query.Offset,
		"includeLegacy": query.IncludeLegacy,
		"items":         filtered,
	})
}

func (s *APIServer) handleGetSessionV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	session, err := s.store.GetSession(r.Context(), sessionID)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch session", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
			return
		}
		run, runErr := s.store.GetRun(r.Context(), sessionID)
		if runErr != nil {
			if errors.Is(runErr, sql.ErrNoRows) {
				writeAPIError(w, http.StatusNotFound, "SESSION_NOT_FOUND", "session not found", false, map[string]interface{}{"sessionId": sessionID})
				return
			}
			writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch session", true, map[string]interface{}{"error": runErr.Error(), "sessionId": sessionID})
			return
		}
		projected := projectLegacyRunToSession(run)
		session = &projected
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *APIServer) handleListSessionEventsV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	query, err := parseSessionEventListQuery(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error(), false, nil)
		return
	}
	query.SessionID = sessionID
	session, err := s.getSessionForRead(r.Context(), sessionID)
	if err != nil {
		s.writeSessionLookupError(w, sessionID, err)
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	if requestWantsSessionEventStream(r) {
		s.streamSessionEventsV1Alpha2(w, r, session, query)
		return
	}

	items, err := s.listSessionEventsForRead(r.Context(), session, query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch session events", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":     len(items),
		"sessionId": sessionID,
		"items":     items,
	})
}

func (s *APIServer) handleGetSessionTimelineV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	session, err := s.getSessionForRead(r.Context(), sessionID)
	if err != nil {
		s.writeSessionLookupError(w, sessionID, err)
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	timeline, err := s.buildSessionTimelineV1Alpha2(r.Context(), session)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to build session timeline", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
		return
	}
	writeJSON(w, http.StatusOK, timeline)
}

func (s *APIServer) handleStreamSessionEventsV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	query, err := parseSessionEventListQuery(r)
	if err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_QUERY", err.Error(), false, nil)
		return
	}
	query.SessionID = sessionID
	session, err := s.getSessionForRead(r.Context(), sessionID)
	if err != nil {
		s.writeSessionLookupError(w, sessionID, err)
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}
	s.streamSessionEventsV1Alpha2(w, r, session, query)
}

func (s *APIServer) handleListApprovalCheckpointsV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	query := ApprovalCheckpointListQuery{
		SessionID:     sessionID,
		Limit:         100,
		IncludeLegacy: true,
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "INVALID_LIMIT", "limit must be an integer", false, map[string]interface{}{"limit": raw})
			return
		}
		query.Limit = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("status")); raw != "" {
		query.Status = ApprovalStatus(strings.ToUpper(raw))
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("includeLegacy")); raw != "" {
		query.IncludeLegacy = raw != "false"
	}

	session, err := s.getSessionForRead(r.Context(), sessionID)
	if err != nil {
		s.writeSessionLookupError(w, sessionID, err)
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	items, err := s.listApprovalCheckpointsForRead(r.Context(), session, query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch approval checkpoints", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":     len(items),
		"sessionId": sessionID,
		"items":     items,
	})
}

func (s *APIServer) handleCreateApprovalCheckpointV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	defer r.Body.Close()

	session, err := s.getPersistedSessionForWrite(r.Context(), sessionID)
	if err != nil {
		s.writeSessionWriteLookupError(w, sessionID, err)
		return
	}

	var req ApprovalCheckpointCreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID != "" && req.Meta.TenantID != session.TenantID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.tenantId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if req.Meta.ProjectID != "" && req.Meta.ProjectID != session.ProjectID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.projectId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
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

	now := time.Now().UTC()
	scope := normalizeStringOrDefault(req.Scope, "session")
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "approval requested"
	}
	expiresAt := now.Add(time.Duration(ttlSeconds) * time.Second)
	checkpoint := &ApprovalCheckpointRecord{
		CheckpointID:           fmt.Sprintf("checkpoint-%d", now.UnixNano()),
		SessionID:              session.SessionID,
		RequestID:              normalizeRequestID(req.Meta.RequestID, "approval", now),
		TenantID:               session.TenantID,
		ProjectID:              session.ProjectID,
		Scope:                  scope,
		Tier:                   req.Tier,
		TargetOS:               strings.TrimSpace(req.TargetOS),
		TargetExecutionProfile: strings.TrimSpace(req.TargetExecutionProfile),
		RequestedCapabilities:  normalizeStringList(req.RequestedCapabilities),
		RequiredVerifierIDs:    normalizeStringList(req.RequiredVerifierIDs),
		Status:                 ApprovalStatusPending,
		Reason:                 reason,
		CreatedAt:              now,
		ExpiresAt:              &expiresAt,
		UpdatedAt:              now,
	}
	if err := s.store.UpsertApprovalCheckpoint(r.Context(), checkpoint); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist approval checkpoint", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
		return
	}

	previousStatus := session.Status
	if !isTerminalSessionStatus(session.Status) {
		session.Status = SessionStatusAwaitingApproval
		session.UpdatedAt = now
		if err := s.store.UpsertSession(r.Context(), session); err != nil {
			writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update session status", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
			return
		}
	}

	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("approval.requested"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"checkpointId":           checkpoint.CheckpointID,
			"scope":                  checkpoint.Scope,
			"tier":                   checkpoint.Tier,
			"targetOs":               checkpoint.TargetOS,
			"targetExecutionProfile": checkpoint.TargetExecutionProfile,
			"status":                 checkpoint.Status,
			"reason":                 checkpoint.Reason,
			"requestedCapabilities":  checkpoint.RequestedCapabilities,
			"requiredVerifierIds":    checkpoint.RequiredVerifierIDs,
			"expiresAt":              checkpoint.ExpiresAt,
		}),
		Timestamp: now,
	})
	if previousStatus != session.Status {
		_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"previousStatus": previousStatus,
				"status":         session.Status,
				"checkpointId":   checkpoint.CheckpointID,
			}),
			Timestamp: now,
		})
	}

	writeJSON(w, http.StatusCreated, checkpoint)
}

func (s *APIServer) handleApprovalCheckpointDecisionV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID, checkpointID string) {
	defer r.Body.Close()

	session, err := s.getPersistedSessionForWrite(r.Context(), sessionID)
	if err != nil {
		s.writeSessionWriteLookupError(w, sessionID, err)
		return
	}

	checkpoints, err := s.store.ListApprovalCheckpoints(r.Context(), ApprovalCheckpointListQuery{
		CheckpointID: checkpointID,
		SessionID:    session.SessionID,
		TenantID:     session.TenantID,
		ProjectID:    session.ProjectID,
		Limit:        1,
	})
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch approval checkpoint", true, map[string]interface{}{"error": err.Error(), "checkpointId": checkpointID})
		return
	}
	if len(checkpoints) == 0 {
		writeAPIError(w, http.StatusNotFound, "APPROVAL_CHECKPOINT_NOT_FOUND", "approval checkpoint not found", false, map[string]interface{}{"checkpointId": checkpointID, "sessionId": sessionID})
		return
	}
	checkpoint := checkpoints[0]

	var req ApprovalCheckpointDecisionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID != "" && req.Meta.TenantID != session.TenantID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.tenantId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if req.Meta.ProjectID != "" && req.Meta.ProjectID != session.ProjectID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.projectId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	decision := strings.ToUpper(strings.TrimSpace(req.Decision))
	if decision != "APPROVE" && decision != "DENY" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_DECISION", "decision must be APPROVE or DENY", false, map[string]interface{}{"decision": req.Decision})
		return
	}
	targetStatus := ApprovalStatusDenied
	if decision == "APPROVE" {
		targetStatus = ApprovalStatusApproved
	}
	now := time.Now().UTC()
	if checkpoint.ExpiresAt != nil && checkpoint.Status == ApprovalStatusPending && checkpoint.ExpiresAt.UTC().Before(now) {
		checkpoint.Status = ApprovalStatusExpired
		checkpoint.UpdatedAt = now
		_ = s.store.UpsertApprovalCheckpoint(r.Context(), &checkpoint)
		writeAPIError(w, http.StatusConflict, "APPROVAL_EXPIRED", "approval checkpoint is expired", false, map[string]interface{}{"checkpointId": checkpointID, "status": checkpoint.Status})
		return
	}
	if checkpoint.Status == targetStatus {
		writeJSON(w, http.StatusOK, ApprovalCheckpointDecisionResponse{
			Applied:      false,
			SessionID:    session.SessionID,
			CheckpointID: checkpoint.CheckpointID,
			Decision:     decision,
			Status:       checkpoint.Status,
			Reason:       strings.TrimSpace(req.Reason),
			ReviewedAt:   now.Format(time.RFC3339),
		})
		return
	}
	if checkpoint.Status == ApprovalStatusApproved || checkpoint.Status == ApprovalStatusDenied || checkpoint.Status == ApprovalStatusExpired || checkpoint.Status == ApprovalStatusCancelled {
		writeAPIError(w, http.StatusConflict, "APPROVAL_ALREADY_RESOLVED", "approval checkpoint is already resolved", false, map[string]interface{}{"checkpointId": checkpointID, "status": checkpoint.Status})
		return
	}

	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		if decision == "APPROVE" {
			reason = "approved by operator"
		} else {
			reason = "denied by operator"
		}
	}
	checkpoint.Status = targetStatus
	checkpoint.Reason = reason
	checkpoint.ReviewedAt = &now
	checkpoint.UpdatedAt = now
	if err := s.store.UpsertApprovalCheckpoint(r.Context(), &checkpoint); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist approval decision", true, map[string]interface{}{"error": err.Error(), "checkpointId": checkpointID})
		return
	}

	previousStatus := session.Status
	switch targetStatus {
	case ApprovalStatusApproved:
		if session.SelectedWorkerID != "" {
			session.Status = SessionStatusReady
		} else {
			session.Status = SessionStatusAwaitingWorker
		}
	case ApprovalStatusDenied:
		session.Status = SessionStatusBlocked
		session.CompletedAt = &now
	}
	session.UpdatedAt = now
	if previousStatus != session.Status {
		if err := s.store.UpsertSession(r.Context(), session); err != nil {
			writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update session status", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
			return
		}
	}

	if strings.TrimSpace(session.TaskID) != "" {
		if task, err := s.store.GetTask(r.Context(), session.TaskID); err == nil {
			switch targetStatus {
			case ApprovalStatusApproved:
				task.Status = TaskStatusInProgress
			case ApprovalStatusDenied:
				task.Status = TaskStatusBlocked
			}
			task.UpdatedAt = now
			_ = s.store.UpsertTask(r.Context(), task)
		}
	}

	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("approval.status.changed"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"checkpointId": checkpoint.CheckpointID,
			"decision":     decision,
			"status":       checkpoint.Status,
			"reason":       checkpoint.Reason,
		}),
		Timestamp: now,
	})
	if previousStatus != session.Status {
		_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"previousStatus": previousStatus,
				"status":         session.Status,
				"checkpointId":   checkpoint.CheckpointID,
			}),
			Timestamp: now,
		})
		if isTerminalSessionStatus(session.Status) {
			_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
				SessionID: session.SessionID,
				EventType: sessionTerminalEventType(session.Status),
				Payload: mustMarshalJSON(map[string]interface{}{
					"status":       session.Status,
					"checkpointId": checkpoint.CheckpointID,
					"reason":       checkpoint.Reason,
				}),
				Timestamp: now,
			})
		}
	}

	writeJSON(w, http.StatusOK, ApprovalCheckpointDecisionResponse{
		Applied:      true,
		SessionID:    session.SessionID,
		CheckpointID: checkpoint.CheckpointID,
		Decision:     decision,
		Status:       checkpoint.Status,
		Reason:       checkpoint.Reason,
		ReviewedAt:   now.Format(time.RFC3339),
	})
}

func (s *APIServer) handleAttachSessionWorkerV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	defer r.Body.Close()

	session, err := s.getPersistedSessionForWrite(r.Context(), sessionID)
	if err != nil {
		s.writeSessionWriteLookupError(w, sessionID, err)
		return
	}

	var req SessionWorkerAttachRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID != "" && req.Meta.TenantID != session.TenantID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.tenantId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if req.Meta.ProjectID != "" && req.Meta.ProjectID != session.ProjectID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.projectId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	req.WorkerType = strings.TrimSpace(req.WorkerType)
	req.AdapterID = strings.TrimSpace(req.AdapterID)
	if req.WorkerType == "" || req.AdapterID == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_WORKER", "workerType and adapterId are required", false, nil)
		return
	}

	injectActorIdentity(&req.Meta, r.Context())
	now := time.Now().UTC()
	worker := &SessionWorkerRecord{
		WorkerID:          fmt.Sprintf("worker-%d", now.UnixNano()),
		SessionID:         session.SessionID,
		TaskID:            session.TaskID,
		TenantID:          session.TenantID,
		ProjectID:         session.ProjectID,
		WorkerType:        req.WorkerType,
		AdapterID:         req.AdapterID,
		Status:            WorkerStatusAttached,
		Source:            normalizeStringOrDefault(req.Source, "v1alpha2.runtime.worker.attach"),
		Capabilities:      append([]string(nil), req.Capabilities...),
		Routing:           strings.TrimSpace(req.Routing),
		AgentProfileID:    strings.TrimSpace(req.AgentProfileID),
		Provider:          strings.TrimSpace(req.Provider),
		Transport:         strings.TrimSpace(req.Transport),
		Model:             strings.TrimSpace(req.Model),
		TargetEnvironment: strings.TrimSpace(req.TargetEnvironment),
		Annotations:       mustMarshalJSONObject(req.Meta.Actor, req.Annotations),
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := s.store.UpsertSessionWorker(r.Context(), worker); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist session worker", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
		return
	}

	previousStatus := session.Status
	session.SelectedWorkerID = worker.WorkerID
	if session.Status == SessionStatusPending || session.Status == SessionStatusAwaitingWorker {
		session.Status = SessionStatusReady
	}
	session.UpdatedAt = now
	if err := s.store.UpsertSession(r.Context(), session); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update session", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
		return
	}

	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.attached"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"workerId":          worker.WorkerID,
			"workerType":        worker.WorkerType,
			"adapterId":         worker.AdapterID,
			"status":            worker.Status,
			"selectedWorkerId":  session.SelectedWorkerID,
			"targetEnvironment": worker.TargetEnvironment,
		}),
		Timestamp: now,
	})
	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.status.changed"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"workerId":   worker.WorkerID,
			"workerType": worker.WorkerType,
			"status":     worker.Status,
		}),
		Timestamp: now,
	})
	if previousStatus != session.Status {
		_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"previousStatus": previousStatus,
				"status":         session.Status,
				"selectedWorker": session.SelectedWorkerID,
			}),
			Timestamp: now,
		})
	}

	writeJSON(w, http.StatusCreated, worker)
}

func (s *APIServer) handleListSessionWorkersV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	session, err := s.getSessionForRead(r.Context(), sessionID)
	if err != nil {
		s.writeSessionLookupError(w, sessionID, err)
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	query := SessionWorkerListQuery{
		SessionID:  sessionID,
		TenantID:   session.TenantID,
		ProjectID:  session.ProjectID,
		Status:     strings.TrimSpace(r.URL.Query().Get("status")),
		WorkerType: strings.TrimSpace(r.URL.Query().Get("workerType")),
		Limit:      100,
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "INVALID_LIMIT", "limit must be an integer", false, map[string]interface{}{"limit": raw})
			return
		}
		query.Limit = parsed
	}
	items, err := s.store.ListSessionWorkers(r.Context(), query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch session workers", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":     len(items),
		"sessionId": sessionID,
		"items":     items,
	})
}

func (s *APIServer) handleCreateSessionWorkerEventV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID, workerID string) {
	defer r.Body.Close()

	session, err := s.getPersistedSessionForWrite(r.Context(), sessionID)
	if err != nil {
		s.writeSessionWriteLookupError(w, sessionID, err)
		return
	}

	var req WorkerEventCreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID != "" && req.Meta.TenantID != session.TenantID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.tenantId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if req.Meta.ProjectID != "" && req.Meta.ProjectID != session.ProjectID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.projectId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	workers, err := s.store.ListSessionWorkers(r.Context(), SessionWorkerListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     100,
	})
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to validate session worker", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID, "workerId": workerID})
		return
	}
	var worker *SessionWorkerRecord
	for i := range workers {
		if workers[i].WorkerID == workerID {
			worker = &workers[i]
			break
		}
	}
	if worker == nil {
		writeAPIError(w, http.StatusConflict, "WORKER_NOT_FOUND", "workerId must belong to the session", false, map[string]interface{}{"sessionId": sessionID, "workerId": workerID})
		return
	}

	eventType := SessionEventType(strings.TrimSpace(req.EventType))
	if eventType == "" {
		if strings.TrimSpace(string(req.Status)) != "" {
			eventType = SessionEventType("worker.status.changed")
		} else {
			writeAPIError(w, http.StatusBadRequest, "INVALID_WORKER_EVENT", "eventType is required when status is not provided", false, nil)
			return
		}
	}

	now := time.Now().UTC()
	previousWorkerStatus := worker.Status
	statusChanged := strings.TrimSpace(string(req.Status)) != "" && req.Status != worker.Status
	if statusChanged {
		worker.Status = req.Status
		worker.UpdatedAt = now
		if err := s.store.UpsertSessionWorker(r.Context(), worker); err != nil {
			writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update session worker", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID, "workerId": workerID})
			return
		}
	}

	eventPayload := map[string]interface{}{
		"workerId":   worker.WorkerID,
		"workerType": worker.WorkerType,
		"adapterId":  worker.AdapterID,
		"eventType":  eventType,
	}
	if summary := strings.TrimSpace(req.Summary); summary != "" {
		eventPayload["summary"] = summary
	}
	if severity := strings.TrimSpace(req.Severity); severity != "" {
		eventPayload["severity"] = severity
	}
	if strings.TrimSpace(string(req.Status)) != "" {
		eventPayload["status"] = req.Status
		eventPayload["previousStatus"] = previousWorkerStatus
	}
	if len(strings.TrimSpace(string(req.Payload))) > 0 {
		eventPayload["payload"] = json.RawMessage(jsonBytesOrEmptyObject(req.Payload))
	}

	if err := s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: eventType,
		Payload:   mustMarshalJSON(eventPayload),
		Timestamp: now,
	}); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to append worker event", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID, "workerId": workerID})
		return
	}

	if statusChanged && eventType != SessionEventType("worker.status.changed") {
		_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("worker.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"workerId":       worker.WorkerID,
				"workerType":     worker.WorkerType,
				"adapterId":      worker.AdapterID,
				"previousStatus": previousWorkerStatus,
				"status":         worker.Status,
			}),
			Timestamp: now,
		})
	}

	previousSessionStatus := session.Status
	nextSessionStatus := sessionStatusForWorkerStatus(req.Status, session.Status)
	sessionChanged := nextSessionStatus != session.Status
	if sessionChanged {
		session.Status = nextSessionStatus
		session.UpdatedAt = now
		if isTerminalSessionStatus(session.Status) {
			session.CompletedAt = &now
		}
		if err := s.store.UpsertSession(r.Context(), session); err != nil {
			writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update session status", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID, "workerId": workerID})
			return
		}
		if task, err := s.store.GetTask(r.Context(), session.TaskID); err == nil {
			task.LatestSessionID = session.SessionID
			task.Status = taskStatusForSessionStatus(session.Status, task.Status)
			task.UpdatedAt = now
			if err := s.store.UpsertTask(r.Context(), task); err != nil {
				writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update task status", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID, "taskId": session.TaskID})
				return
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to load task for session update", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID, "taskId": session.TaskID})
			return
		}
		_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"previousStatus": previousSessionStatus,
				"status":         session.Status,
				"workerId":       worker.WorkerID,
			}),
			Timestamp: now,
		})
		if terminalEventType := terminalEventTypeForSessionStatus(session.Status); terminalEventType != "" {
			_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
				SessionID: session.SessionID,
				EventType: terminalEventType,
				Payload: mustMarshalJSON(map[string]interface{}{
					"status":   session.Status,
					"workerId": worker.WorkerID,
				}),
				Timestamp: now,
			})
		}
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"sessionId":     session.SessionID,
		"workerId":      worker.WorkerID,
		"eventType":     eventType,
		"workerStatus":  worker.Status,
		"sessionStatus": session.Status,
		"recordedAt":    now,
	})
}

func (s *APIServer) handleToolProposalDecisionV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID, proposalID string) {
	defer r.Body.Close()

	session, err := s.getPersistedSessionForWrite(r.Context(), sessionID)
	if err != nil {
		s.writeSessionWriteLookupError(w, sessionID, err)
		return
	}
	if isTerminalSessionStatus(session.Status) {
		writeAPIError(w, http.StatusConflict, "SESSION_NOT_ACTIVE", "tool proposals on terminal sessions are read-only", false, map[string]interface{}{"sessionId": sessionID})
		return
	}

	var req ToolProposalDecisionRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID != "" && req.Meta.TenantID != session.TenantID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.tenantId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if req.Meta.ProjectID != "" && req.Meta.ProjectID != session.ProjectID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.projectId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	decision := strings.ToUpper(strings.TrimSpace(req.Decision))
	if decision != "APPROVE" && decision != "DENY" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_DECISION", "decision must be APPROVE or DENY", false, map[string]interface{}{"decision": req.Decision})
		return
	}

	events, err := s.store.ListSessionEvents(r.Context(), SessionEventListQuery{
		SessionID: session.SessionID,
		Limit:     1000,
	})
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to load tool proposals", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID, "proposalId": proposalID})
		return
	}
	proposal, err := findSessionToolProposal(events, proposalID)
	if err != nil {
		writeAPIError(w, http.StatusNotFound, "TOOL_PROPOSAL_NOT_FOUND", "tool proposal not found", false, map[string]interface{}{"sessionId": sessionID, "proposalId": proposalID})
		return
	}
	if proposal.Decision != "" {
		writeJSON(w, http.StatusOK, ToolProposalDecisionResponse{
			Applied:      false,
			SessionID:    session.SessionID,
			ProposalID:   proposal.ProposalID,
			Decision:     proposal.Decision,
			Status:       proposal.Status,
			Reason:       proposal.Reason,
			ToolActionID: proposal.ToolActionID,
			WorkerID:     proposal.WorkerID,
			ToolType:     proposal.ProposalType,
			ActionStatus: proposal.ActionStatus,
			ReviewedAt:   proposal.ReviewedAt.Format(time.RFC3339),
		})
		return
	}

	now := time.Now().UTC()
	reason := strings.TrimSpace(req.Reason)
	status := "DENIED"
	actionStatus := ToolActionStatus("")
	toolActionID := ""
	if decision == "APPROVE" {
		status = "APPROVED"
		actionStatus = ToolActionStatusAuthorized
		toolActionID = fmt.Sprintf("%s-tool-proposal-%s", session.SessionID, sanitizeIDFragment(proposalID))
		resolvedToolType := resolveToolProposalType(proposal, nil)
		action := &ToolActionRecord{
			ToolActionID: toolActionID,
			SessionID:    session.SessionID,
			WorkerID:     proposal.WorkerID,
			TenantID:     session.TenantID,
			ProjectID:    session.ProjectID,
			ToolType:     normalizeStringOrDefault(resolvedToolType, "tool_proposal"),
			Status:       ToolActionStatusAuthorized,
			Source:       "v1alpha2.runtime.tool-proposal-decision",
			RequestPayload: mustMarshalJSON(map[string]interface{}{
				"proposalId":   proposal.ProposalID,
				"proposalType": resolvedToolType,
				"summary":      proposal.Summary,
				"proposal":     proposal.Payload,
				"decision":     decision,
				"reason":       reason,
			}),
			ResultPayload: mustMarshalJSON(map[string]interface{}{
				"decision":   decision,
				"reviewedAt": now.Format(time.RFC3339),
				"reason":     reason,
			}),
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := s.store.UpsertToolAction(r.Context(), action); err != nil {
			writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist proposal tool action", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID, "proposalId": proposalID})
			return
		}
		previousStatus := session.Status
		if session.Status == SessionStatusPending || session.Status == SessionStatusReady || session.Status == SessionStatusAwaitingWorker || session.Status == SessionStatusAwaitingApproval {
			session.Status = SessionStatusRunning
			session.CompletedAt = nil
			session.UpdatedAt = now
			if err := s.store.UpsertSession(r.Context(), session); err != nil {
				writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update session status", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
				return
			}
			if task, err := s.store.GetTask(r.Context(), session.TaskID); err == nil {
				task.LatestSessionID = session.SessionID
				task.Status = TaskStatusInProgress
				task.UpdatedAt = now
				if err := s.store.UpsertTask(r.Context(), task); err != nil {
					writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update task status", true, map[string]interface{}{"error": err.Error(), "taskId": session.TaskID})
					return
				}
			} else if !errors.Is(err, sql.ErrNoRows) {
				writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to load task for proposal decision", true, map[string]interface{}{"error": err.Error(), "taskId": session.TaskID})
				return
			}
			if previousStatus != session.Status {
				_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
					SessionID: session.SessionID,
					EventType: SessionEventType("session.status.changed"),
					Payload: mustMarshalJSON(map[string]interface{}{
						"previousStatus": previousStatus,
						"status":         session.Status,
						"proposalId":     proposal.ProposalID,
						"toolActionId":   toolActionID,
					}),
					Timestamp: now,
				})
			}
		}
		_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("tool_action.authorized"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"toolActionId": toolActionID,
				"workerId":     proposal.WorkerID,
				"toolType":     normalizeStringOrDefault(resolvedToolType, "tool_proposal"),
				"status":       ToolActionStatusAuthorized,
				"proposalId":   proposal.ProposalID,
				"summary":      "Approved proposal promoted into a governed tool action.",
			}),
			Timestamp: now,
		})
		actionStatus = s.executeApprovedToolProposalAction(r.Context(), session, proposal, action, now)
	}

	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("tool_proposal.decided"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"proposalId":   proposal.ProposalID,
			"proposalType": proposal.ProposalType,
			"workerId":     proposal.WorkerID,
			"decision":     decision,
			"status":       status,
			"reason":       reason,
			"toolActionId": toolActionID,
			"actionStatus": actionStatus,
			"summary": map[string]string{
				"APPROVE": "Tool proposal approved and promoted into a governed tool action.",
				"DENY":    "Tool proposal denied by the operator.",
			}[decision],
		}),
		Timestamp: now,
	})

	writeJSON(w, http.StatusOK, ToolProposalDecisionResponse{
		Applied:      true,
		SessionID:    session.SessionID,
		ProposalID:   proposal.ProposalID,
		Decision:     decision,
		Status:       status,
		Reason:       reason,
		ToolActionID: toolActionID,
		WorkerID:     proposal.WorkerID,
		ToolType:     proposal.ProposalType,
		ActionStatus: actionStatus,
		ReviewedAt:   now.Format(time.RFC3339),
	})
}

func (s *APIServer) executeApprovedToolProposalAction(ctx context.Context, session *SessionRecord, proposal *sessionToolProposal, action *ToolActionRecord, decidedAt time.Time) ToolActionStatus {
	if s == nil || s.store == nil || session == nil || proposal == nil || action == nil {
		return ToolActionStatusAuthorized
	}
	toolType := resolveToolProposalType(proposal, action)
	if !strings.EqualFold(toolType, "terminal_command") {
		return ToolActionStatusAuthorized
	}
	commandText := strings.TrimSpace(fmt.Sprintf("%v", proposalPayloadValue(proposal, "command")))
	if commandText == "" || commandText == "<nil>" {
		var requestPayload map[string]interface{}
		if err := json.Unmarshal(action.RequestPayload, &requestPayload); err == nil {
			if rawProposal, ok := requestPayload["proposal"].(map[string]interface{}); ok {
				commandText = strings.TrimSpace(fmt.Sprintf("%v", rawProposal["command"]))
			}
		}
	}
	commandText = normalizeStringOrDefault(commandText, "")
	if commandText == "" {
		return ToolActionStatusAuthorized
	}

	startedAt := time.Now().UTC()
	commandName, commandArgs, parseErr := parseTerminalCommand(commandText)
	if parseErr == nil {
		action.Status = ToolActionStatusStarted
		action.UpdatedAt = startedAt
		action.ResultPayload = mustMarshalJSON(map[string]interface{}{
			"decision":   "APPROVE",
			"reviewedAt": decidedAt.Format(time.RFC3339),
			"startedAt":  startedAt.Format(time.RFC3339),
		})
		s.upsertToolActionBestEffort(ctx, action)
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("tool_action.started"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"toolActionId": action.ToolActionID,
				"workerId":     proposal.WorkerID,
				"toolType":     action.ToolType,
				"status":       ToolActionStatusStarted,
				"proposalId":   proposal.ProposalID,
				"command":      commandText,
				"summary":      "Approved tool proposal started execution.",
			}),
			Timestamp: startedAt,
		})
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("worker.progress"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"workerId": proposal.WorkerID,
				"status":   WorkerStatusRunning,
				"summary":  "Approved tool action is running.",
				"payload": map[string]interface{}{
					"stage":        "tool_action_started",
					"percent":      70,
					"toolActionId": action.ToolActionID,
					"proposalId":   proposal.ProposalID,
				},
			}),
			Timestamp: startedAt,
		})
	}

	if parseErr != nil {
		failedAt := time.Now().UTC()
		action.Status = ToolActionStatusFailed
		action.UpdatedAt = failedAt
		action.ResultPayload = mustMarshalJSON(map[string]interface{}{
			"decision":   "APPROVE",
			"reviewedAt": decidedAt.Format(time.RFC3339),
			"failedAt":   failedAt.Format(time.RFC3339),
			"error":      parseErr.Error(),
		})
		s.upsertToolActionBestEffort(ctx, action)
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("tool_action.failed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"toolActionId": action.ToolActionID,
				"workerId":     proposal.WorkerID,
				"toolType":     action.ToolType,
				"status":       ToolActionStatusFailed,
				"proposalId":   proposal.ProposalID,
				"command":      commandText,
				"error":        parseErr.Error(),
				"summary":      "Approved tool proposal failed deterministic command validation.",
			}),
			Timestamp: failedAt,
		})
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("worker.progress"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"workerId": proposal.WorkerID,
				"status":   WorkerStatusRunning,
				"summary":  "Approved tool action failed validation before execution.",
				"payload": map[string]interface{}{
					"stage":        "tool_action_failed",
					"percent":      100,
					"toolActionId": action.ToolActionID,
					"proposalId":   proposal.ProposalID,
					"error":        parseErr.Error(),
				},
			}),
			Timestamp: failedAt,
		})
		if !s.continueManagedWorkerAfterToolAction(ctx, session, proposal, action, commandText, "", 0, nil, parseErr, decidedAt) {
			s.transitionSessionAfterStandaloneToolAction(ctx, session, ToolActionStatusFailed, failedAt, proposal, action.ToolActionID)
		}
		return ToolActionStatusFailed
	}

	cwd := strings.TrimSpace(fmt.Sprintf("%v", proposalPayloadValue(proposal, "cwd")))
	timeoutSeconds := normalizeToolProposalTimeoutSeconds(proposalPayloadValue(proposal, "timeoutSeconds"))
	execResult, execErr := executeTerminalCommand(ctx, commandName, commandArgs, cwd, timeoutSeconds)
	finishedAt := time.Now().UTC()
	finalStatus := ToolActionStatusCompleted
	if execErr != nil {
		finalStatus = ToolActionStatusFailed
	}
	action.Status = finalStatus
	action.UpdatedAt = finishedAt
	resultPayload := map[string]interface{}{
		"decision":        "APPROVE",
		"reviewedAt":      decidedAt.Format(time.RFC3339),
		"startedAt":       startedAt.Format(time.RFC3339),
		"completedAt":     finishedAt.Format(time.RFC3339),
		"command":         commandText,
		"commandName":     commandName,
		"commandArgs":     commandArgs,
		"cwd":             cwd,
		"timeoutSeconds":  timeoutSeconds,
		"status":          finalStatus,
		"exitCode":        execResult.ExitCode,
		"timedOut":        execResult.TimedOut,
		"outputSha256":    execResult.OutputSHA256,
		"outputTruncated": execResult.Truncated,
	}
	if strings.TrimSpace(execResult.Output) != "" {
		resultPayload["output"] = execResult.Output
	}
	if execErr != nil {
		resultPayload["error"] = execErr.Error()
	}
	action.ResultPayload = mustMarshalJSON(resultPayload)
	s.upsertToolActionBestEffort(ctx, action)

	if strings.TrimSpace(execResult.OutputSHA256) != "" || strings.TrimSpace(execResult.Output) != "" {
		evidenceID := fmt.Sprintf("%s-execution-evidence", action.ToolActionID)
		s.upsertEvidenceRecordBestEffort(ctx, &EvidenceRecord{
			EvidenceID:   evidenceID,
			SessionID:    session.SessionID,
			ToolActionID: action.ToolActionID,
			TenantID:     session.TenantID,
			ProjectID:    session.ProjectID,
			Kind:         "tool_output",
			Checksum:     execResult.OutputSHA256,
			Metadata: mustMarshalJSON(map[string]interface{}{
				"proposalId":      proposal.ProposalID,
				"toolActionId":    action.ToolActionID,
				"toolType":        action.ToolType,
				"status":          finalStatus,
				"exitCode":        execResult.ExitCode,
				"timedOut":        execResult.TimedOut,
				"outputTruncated": execResult.Truncated,
				"executedCommand": commandText,
				"executedWorkdir": cwd,
				"timeoutSeconds":  timeoutSeconds,
			}),
			CreatedAt: finishedAt,
			UpdatedAt: finishedAt,
		})
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("evidence.recorded"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"evidenceId":   evidenceID,
				"toolActionId": action.ToolActionID,
				"kind":         "tool_output",
				"checksum":     execResult.OutputSHA256,
				"proposalId":   proposal.ProposalID,
			}),
			Timestamp: finishedAt,
		})
	}

	eventType := SessionEventType("tool_action.completed")
	summary := "Approved tool action completed."
	if finalStatus == ToolActionStatusFailed {
		eventType = SessionEventType("tool_action.failed")
		summary = "Approved tool action failed during execution."
	}
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: eventType,
		Payload: mustMarshalJSON(map[string]interface{}{
			"toolActionId": action.ToolActionID,
			"workerId":     proposal.WorkerID,
			"toolType":     action.ToolType,
			"status":       finalStatus,
			"proposalId":   proposal.ProposalID,
			"command":      commandText,
			"exitCode":     execResult.ExitCode,
			"timedOut":     execResult.TimedOut,
			"outputSha256": execResult.OutputSHA256,
			"error":        errorString(execErr),
			"summary":      summary,
		}),
		Timestamp: finishedAt,
	})
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.progress"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"workerId": proposal.WorkerID,
			"status":   WorkerStatusRunning,
			"summary":  summary,
			"payload": map[string]interface{}{
				"stage":        map[bool]string{true: "tool_action_failed", false: "tool_action_completed"}[finalStatus == ToolActionStatusFailed],
				"percent":      100,
				"toolActionId": action.ToolActionID,
				"proposalId":   proposal.ProposalID,
				"exitCode":     execResult.ExitCode,
				"error":        errorString(execErr),
			},
		}),
		Timestamp: finishedAt,
	})
	if !s.continueManagedWorkerAfterToolAction(ctx, session, proposal, action, commandText, cwd, timeoutSeconds, execResult, execErr, decidedAt) {
		s.transitionSessionAfterStandaloneToolAction(ctx, session, finalStatus, finishedAt, proposal, action.ToolActionID)
	}
	return finalStatus
}

func normalizeToolProposalTimeoutSeconds(value interface{}) int {
	switch typed := value.(type) {
	case float64:
		return normalizeTerminalTimeoutSeconds(int(typed))
	case int:
		return normalizeTerminalTimeoutSeconds(typed)
	case int64:
		return normalizeTerminalTimeoutSeconds(int(typed))
	case json.Number:
		if parsed, err := typed.Int64(); err == nil {
			return normalizeTerminalTimeoutSeconds(int(parsed))
		}
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(typed)); err == nil {
			return normalizeTerminalTimeoutSeconds(parsed)
		}
	}
	return normalizeTerminalTimeoutSeconds(0)
}

func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func sessionStatusForWorkerStatus(status WorkerStatus, current SessionStatus) SessionStatus {
	if strings.TrimSpace(string(status)) == "" || isTerminalSessionStatus(current) {
		return current
	}
	switch status {
	case WorkerStatusAttached, WorkerStatusReady:
		if current == SessionStatusAwaitingApproval {
			return current
		}
		return SessionStatusReady
	case WorkerStatusWaiting, WorkerStatusDetached:
		if current == SessionStatusAwaitingApproval {
			return current
		}
		return SessionStatusAwaitingWorker
	case WorkerStatusRunning:
		if current == SessionStatusAwaitingApproval {
			return current
		}
		return SessionStatusRunning
	case WorkerStatusBlocked:
		return SessionStatusBlocked
	case WorkerStatusCompleted:
		return SessionStatusCompleted
	case WorkerStatusFailed:
		return SessionStatusFailed
	default:
		return current
	}
}

func taskStatusForSessionStatus(status SessionStatus, current TaskStatus) TaskStatus {
	switch status {
	case SessionStatusReady, SessionStatusAwaitingWorker, SessionStatusAwaitingApproval, SessionStatusRunning:
		return TaskStatusInProgress
	case SessionStatusCompleted:
		return TaskStatusCompleted
	case SessionStatusFailed:
		return TaskStatusFailed
	case SessionStatusBlocked:
		return TaskStatusBlocked
	case SessionStatusCancelled:
		return TaskStatusCancelled
	default:
		return current
	}
}

func terminalEventTypeForSessionStatus(status SessionStatus) SessionEventType {
	switch status {
	case SessionStatusCompleted:
		return SessionEventType("session.completed")
	case SessionStatusFailed:
		return SessionEventType("session.failed")
	case SessionStatusBlocked:
		return SessionEventType("session.blocked")
	case SessionStatusCancelled:
		return SessionEventType("session.cancelled")
	default:
		return ""
	}
}

func (s *APIServer) handleCreateToolActionV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	defer r.Body.Close()

	session, err := s.getPersistedSessionForWrite(r.Context(), sessionID)
	if err != nil {
		s.writeSessionWriteLookupError(w, sessionID, err)
		return
	}

	var req ToolActionCreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID != "" && req.Meta.TenantID != session.TenantID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.tenantId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if req.Meta.ProjectID != "" && req.Meta.ProjectID != session.ProjectID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.projectId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	req.ToolType = strings.TrimSpace(req.ToolType)
	req.WorkerID = strings.TrimSpace(req.WorkerID)
	req.PolicyDecision = strings.TrimSpace(req.PolicyDecision)
	req.ApprovalCheckpointID = strings.TrimSpace(req.ApprovalCheckpointID)
	if req.ToolType == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_TOOL_ACTION", "toolType is required", false, nil)
		return
	}
	if req.WorkerID != "" {
		workers, err := s.store.ListSessionWorkers(r.Context(), SessionWorkerListQuery{
			SessionID: session.SessionID,
			TenantID:  session.TenantID,
			ProjectID: session.ProjectID,
			Limit:     100,
		})
		if err != nil {
			writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to validate tool action worker", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
			return
		}
		workerFound := false
		for _, worker := range workers {
			if worker.WorkerID == req.WorkerID {
				workerFound = true
				break
			}
		}
		if !workerFound {
			writeAPIError(w, http.StatusConflict, "WORKER_NOT_FOUND", "workerId must belong to the session", false, map[string]interface{}{"sessionId": sessionID, "workerId": req.WorkerID})
			return
		}
	}

	now := time.Now().UTC()
	status := req.Status
	if strings.TrimSpace(string(status)) == "" {
		status = ToolActionStatusRequested
	}
	action := &ToolActionRecord{
		ToolActionID:          fmt.Sprintf("tool-%d", now.UnixNano()),
		SessionID:             session.SessionID,
		WorkerID:              req.WorkerID,
		TenantID:              session.TenantID,
		ProjectID:             session.ProjectID,
		ToolType:              req.ToolType,
		Status:                status,
		Source:                normalizeStringOrDefault(req.Source, "v1alpha2.runtime.tool-action"),
		RequestPayload:        jsonBytesOrEmptyObject(req.RequestPayload),
		ResultPayload:         jsonBytesOrEmptyObject(req.ResultPayload),
		PolicyDecision:        req.PolicyDecision,
		ApprovalCheckpointID:  req.ApprovalCheckpointID,
		AuditLink:             mustMarshalJSONObject(nil, req.AuditLink),
		ReadOnly:              req.ReadOnly,
		RestrictedHostRequest: req.RestrictedHostRequest,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	if err := s.store.UpsertToolAction(r.Context(), action); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist tool action", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
		return
	}

	previousStatus := session.Status
	if session.Status == SessionStatusPending || session.Status == SessionStatusReady || session.Status == SessionStatusAwaitingWorker {
		switch status {
		case ToolActionStatusRequested, ToolActionStatusAuthorized, ToolActionStatusStarted:
			session.Status = SessionStatusRunning
			session.UpdatedAt = now
			if err := s.store.UpsertSession(r.Context(), session); err != nil {
				writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to update session status", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
				return
			}
		}
	}

	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: toolActionStatusToEventType(status),
		Payload: mustMarshalJSON(map[string]interface{}{
			"toolActionId":          action.ToolActionID,
			"workerId":              action.WorkerID,
			"toolType":              action.ToolType,
			"status":                action.Status,
			"policyDecision":        action.PolicyDecision,
			"approvalCheckpointId":  action.ApprovalCheckpointID,
			"readOnly":              action.ReadOnly,
			"restrictedHostRequest": action.RestrictedHostRequest,
		}),
		Timestamp: now,
	})
	if previousStatus != session.Status {
		_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"previousStatus": previousStatus,
				"status":         session.Status,
			}),
			Timestamp: now,
		})
	}
	writeJSON(w, http.StatusCreated, action)
}

func (s *APIServer) handleListToolActionsV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	session, err := s.getSessionForRead(r.Context(), sessionID)
	if err != nil {
		s.writeSessionLookupError(w, sessionID, err)
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	query := ToolActionListQuery{
		SessionID: sessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		WorkerID:  strings.TrimSpace(r.URL.Query().Get("workerId")),
		ToolType:  strings.TrimSpace(r.URL.Query().Get("toolType")),
		Limit:     100,
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "INVALID_LIMIT", "limit must be an integer", false, map[string]interface{}{"limit": raw})
			return
		}
		query.Limit = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("status")); raw != "" {
		query.Status = ToolActionStatus(strings.ToUpper(raw))
	}
	items, err := s.store.ListToolActions(r.Context(), query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch tool actions", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":     len(items),
		"sessionId": sessionID,
		"items":     items,
	})
}

func (s *APIServer) handleCreateEvidenceRecordV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	defer r.Body.Close()

	session, err := s.getPersistedSessionForWrite(r.Context(), sessionID)
	if err != nil {
		s.writeSessionWriteLookupError(w, sessionID, err)
		return
	}

	var req EvidenceRecordCreateRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID != "" && req.Meta.TenantID != session.TenantID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.tenantId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if req.Meta.ProjectID != "" && req.Meta.ProjectID != session.ProjectID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.projectId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	req.Kind = strings.TrimSpace(req.Kind)
	if req.Kind == "" {
		writeAPIError(w, http.StatusBadRequest, "INVALID_EVIDENCE", "kind is required", false, nil)
		return
	}

	now := time.Now().UTC()
	record := &EvidenceRecord{
		EvidenceID:     fmt.Sprintf("evidence-%d", now.UnixNano()),
		SessionID:      session.SessionID,
		ToolActionID:   strings.TrimSpace(req.ToolActionID),
		CheckpointID:   strings.TrimSpace(req.CheckpointID),
		TenantID:       session.TenantID,
		ProjectID:      session.ProjectID,
		Kind:           req.Kind,
		URI:            strings.TrimSpace(req.URI),
		Checksum:       strings.TrimSpace(req.Checksum),
		Metadata:       mustMarshalJSONObject(nil, req.Metadata),
		RetentionClass: strings.TrimSpace(req.RetentionClass),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := s.store.UpsertEvidenceRecord(r.Context(), record); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to persist evidence record", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
		return
	}
	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("evidence.recorded"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"evidenceId":     record.EvidenceID,
			"kind":           record.Kind,
			"toolActionId":   record.ToolActionID,
			"checkpointId":   record.CheckpointID,
			"retentionClass": record.RetentionClass,
			"uri":            record.URI,
			"checksum":       record.Checksum,
		}),
		Timestamp: now,
	})
	writeJSON(w, http.StatusCreated, record)
}

func (s *APIServer) handleListEvidenceRecordsV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	session, err := s.getSessionForRead(r.Context(), sessionID)
	if err != nil {
		s.writeSessionLookupError(w, sessionID, err)
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunRead, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	query := EvidenceRecordListQuery{
		SessionID:      sessionID,
		TenantID:       session.TenantID,
		ProjectID:      session.ProjectID,
		Kind:           strings.TrimSpace(r.URL.Query().Get("kind")),
		RetentionClass: strings.TrimSpace(r.URL.Query().Get("retentionClass")),
		Limit:          100,
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "INVALID_LIMIT", "limit must be an integer", false, map[string]interface{}{"limit": raw})
			return
		}
		query.Limit = parsed
	}
	items, err := s.store.ListEvidenceRecords(r.Context(), query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch evidence records", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"count":     len(items),
		"sessionId": sessionID,
		"items":     items,
	})
}

func (s *APIServer) handleCloseSessionV1Alpha2(w http.ResponseWriter, r *http.Request, sessionID string) {
	defer r.Body.Close()

	session, err := s.getPersistedSessionForWrite(r.Context(), sessionID)
	if err != nil {
		s.writeSessionWriteLookupError(w, sessionID, err)
		return
	}

	var req SessionCloseRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeAPIError(w, http.StatusBadRequest, "INVALID_JSON", "invalid JSON body", false, map[string]interface{}{"error": err.Error()})
		return
	}
	identity, _ := RuntimeIdentityFromContext(r.Context())
	if err := enforceRequestMetaScope(&req.Meta, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if req.Meta.TenantID != "" && req.Meta.TenantID != session.TenantID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.tenantId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if req.Meta.ProjectID != "" && req.Meta.ProjectID != session.ProjectID {
		writeAPIError(w, http.StatusConflict, "SESSION_SCOPE_MISMATCH", "meta.projectId must match session scope", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	if err := enforceRunRecordScope(session.TenantID, session.ProjectID, identity); err != nil {
		s.writeAuthError(w, err)
		return
	}
	if err := s.authorizeScoped(identity, PermissionRunCreate, session.TenantID, session.ProjectID); err != nil {
		s.writeAuthError(w, err)
		return
	}

	targetStatus := req.Status
	if strings.TrimSpace(string(targetStatus)) == "" {
		targetStatus = SessionStatusCompleted
	}
	switch targetStatus {
	case SessionStatusCompleted, SessionStatusFailed, SessionStatusCancelled, SessionStatusBlocked:
	default:
		writeAPIError(w, http.StatusBadRequest, "INVALID_SESSION_STATUS", "status must be one of: COMPLETED,FAILED,CANCELLED,BLOCKED", false, map[string]interface{}{"status": targetStatus})
		return
	}

	now := time.Now().UTC()
	previousStatus := session.Status
	session.Status = targetStatus
	session.UpdatedAt = now
	session.CompletedAt = &now
	if req.Summary != nil {
		session.Summary = mustMarshalJSONObject(nil, req.Summary)
	}
	if req.Annotations != nil {
		session.Annotations = mustMarshalJSONObject(nil, req.Annotations)
	}
	if err := s.store.UpsertSession(r.Context(), session); err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_UPDATE_FAILED", "failed to close session", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
		return
	}

	if strings.TrimSpace(session.TaskID) != "" {
		if task, err := s.store.GetTask(r.Context(), session.TaskID); err == nil {
			switch targetStatus {
			case SessionStatusCompleted:
				task.Status = TaskStatusCompleted
			case SessionStatusFailed:
				task.Status = TaskStatusFailed
			case SessionStatusCancelled:
				task.Status = TaskStatusCancelled
			case SessionStatusBlocked:
				task.Status = TaskStatusBlocked
			}
			task.UpdatedAt = now
			_ = s.store.UpsertTask(r.Context(), task)
		}
	}

	if previousStatus != session.Status {
		_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"previousStatus": previousStatus,
				"status":         session.Status,
				"reason":         strings.TrimSpace(req.Reason),
			}),
			Timestamp: now,
		})
	}
	_ = s.store.AppendSessionEvent(r.Context(), &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: sessionTerminalEventType(targetStatus),
		Payload: mustMarshalJSON(map[string]interface{}{
			"status": session.Status,
			"reason": strings.TrimSpace(req.Reason),
		}),
		Timestamp: now,
	})
	writeJSON(w, http.StatusOK, session)
}

func (s *APIServer) buildSessionTimelineV1Alpha2(ctx context.Context, session *SessionRecord) (*SessionTimelineResponse, error) {
	var task *TaskRecord
	if strings.TrimSpace(session.TaskID) != "" {
		item, err := s.store.GetTask(ctx, session.TaskID)
		if err != nil && !isRunNotFoundError(err) {
			return nil, err
		}
		task = item
	}
	workers, err := s.store.ListSessionWorkers(ctx, SessionWorkerListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     100,
	})
	if err != nil {
		return nil, err
	}
	approvals, err := s.listApprovalCheckpointsForRead(ctx, session, ApprovalCheckpointListQuery{
		SessionID:     session.SessionID,
		TenantID:      session.TenantID,
		ProjectID:     session.ProjectID,
		Limit:         100,
		IncludeLegacy: true,
	})
	if err != nil {
		return nil, err
	}
	toolActions, err := s.store.ListToolActions(ctx, ToolActionListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     200,
	})
	if err != nil {
		return nil, err
	}
	evidenceRecords, err := s.store.ListEvidenceRecords(ctx, EvidenceRecordListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     200,
	})
	if err != nil {
		return nil, err
	}
	events, err := s.listSessionEventsForRead(ctx, session, SessionEventListQuery{
		SessionID: session.SessionID,
		Limit:     500,
	})
	if err != nil {
		return nil, err
	}

	return &SessionTimelineResponse{
		Session:             *session,
		Task:                task,
		SelectedWorker:      selectProjectedWorker(session, workers),
		Workers:             workers,
		ApprovalCheckpoints: approvals,
		ToolActions:         toolActions,
		EvidenceRecords:     evidenceRecords,
		Events:              events,
		OpenApprovalCount:   countOpenApprovalCheckpoints(approvals),
		LatestEventSequence: latestSessionEventSequence(events),
	}, nil
}

func parseSessionEventListQuery(r *http.Request) (SessionEventListQuery, error) {
	query := SessionEventListQuery{
		Limit: 200,
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return query, fmt.Errorf("limit must be an integer")
		}
		query.Limit = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("afterSequence")); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return query, fmt.Errorf("afterSequence must be an integer")
		}
		query.AfterSequence = parsed
	}
	return query, nil
}

func requestWantsSessionEventStream(r *http.Request) bool {
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "event-stream" || format == "sse" {
		return true
	}
	return strings.Contains(strings.ToLower(r.Header.Get("Accept")), "text/event-stream")
}

func (s *APIServer) listSessionEventsForRead(ctx context.Context, session *SessionRecord, query SessionEventListQuery) ([]SessionEventRecord, error) {
	items, err := s.store.ListSessionEvents(ctx, query)
	if err != nil {
		return nil, err
	}
	legacyRunID := session.LegacyRunID
	if legacyRunID == "" {
		legacyRunID = session.SessionID
	}
	if run, err := s.store.GetRun(ctx, legacyRunID); err == nil {
		items = mergeSessionEventLists(projectLegacyRunToSessionEvents(run), items)
	}
	if query.AfterSequence > 0 {
		filtered := items[:0]
		for _, item := range items {
			if item.Sequence > query.AfterSequence {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Sequence == items[j].Sequence {
			return items[i].Timestamp.Before(items[j].Timestamp)
		}
		return items[i].Sequence < items[j].Sequence
	})
	if query.Limit > 0 && len(items) > query.Limit {
		items = items[:query.Limit]
	}
	return items, nil
}

func (s *APIServer) listApprovalCheckpointsForRead(ctx context.Context, session *SessionRecord, query ApprovalCheckpointListQuery) ([]ApprovalCheckpointRecord, error) {
	query.SessionID = session.SessionID
	query.TenantID = session.TenantID
	query.ProjectID = session.ProjectID

	items, err := s.store.ListApprovalCheckpoints(ctx, query)
	if err != nil {
		return nil, err
	}
	if !query.IncludeLegacy {
		return items, nil
	}
	if runID := session.LegacyRunID; runID != "" {
		if run, err := s.store.GetRun(ctx, runID); err == nil {
			return mergeApprovalCheckpointLists(items, projectLegacyRunToApprovalCheckpoints(run)), nil
		}
		return items, nil
	}
	if run, err := s.store.GetRun(ctx, session.SessionID); err == nil {
		return mergeApprovalCheckpointLists(items, projectLegacyRunToApprovalCheckpoints(run)), nil
	}
	return items, nil
}

func (s *APIServer) streamSessionEventsV1Alpha2(w http.ResponseWriter, r *http.Request, session *SessionRecord, query SessionEventListQuery) {
	flusher, ok := w.(http.Flusher)
	follow := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("follow")), "true")
	if !ok && follow {
		writeAPIError(w, http.StatusInternalServerError, "STREAM_NOT_SUPPORTED", "response writer does not support streaming", true, nil)
		return
	}
	waitSeconds := 15
	if raw := strings.TrimSpace(r.URL.Query().Get("waitSeconds")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			writeAPIError(w, http.StatusBadRequest, "INVALID_WAIT_SECONDS", "waitSeconds must be an integer", false, map[string]interface{}{"waitSeconds": raw})
			return
		}
		waitSeconds = parsed
	}
	if waitSeconds <= 0 {
		waitSeconds = 15
	}
	if waitSeconds > 60 {
		waitSeconds = 60
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	lastSequence := query.AfterSequence
	writeEvents := func(items []SessionEventRecord) error {
		for _, item := range items {
			if item.Sequence > lastSequence {
				lastSequence = item.Sequence
			}
			payload, err := json.Marshal(item)
			if err != nil {
				return err
			}
			if _, err := fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", item.Sequence, item.EventType, payload); err != nil {
				return err
			}
			if flusher != nil {
				flusher.Flush()
			}
		}
		return nil
	}

	items, err := s.listSessionEventsForRead(r.Context(), session, query)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch session events", true, map[string]interface{}{"error": err.Error(), "sessionId": session.SessionID})
		return
	}
	if err := writeEvents(items); err != nil {
		return
	}
	if !follow {
		return
	}

	deadline := time.Now().UTC().Add(time.Duration(waitSeconds) * time.Second)
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for time.Now().UTC().Before(deadline) {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			items, err := s.listSessionEventsForRead(r.Context(), session, SessionEventListQuery{
				SessionID:     session.SessionID,
				Limit:         query.Limit,
				AfterSequence: lastSequence,
			})
			if err != nil {
				return
			}
			if err := writeEvents(items); err != nil {
				return
			}
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
		}
	}
}

func isTerminalSessionStatus(status SessionStatus) bool {
	switch status {
	case SessionStatusCompleted, SessionStatusFailed, SessionStatusCancelled, SessionStatusBlocked:
		return true
	default:
		return false
	}
}

func (s *APIServer) getSessionForRead(ctx context.Context, sessionID string) (*SessionRecord, error) {
	session, err := s.store.GetSession(ctx, sessionID)
	if err == nil {
		return session, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	run, runErr := s.store.GetRun(ctx, sessionID)
	if runErr != nil {
		if errors.Is(runErr, sql.ErrNoRows) {
			return nil, sql.ErrNoRows
		}
		return nil, runErr
	}
	projected := projectLegacyRunToSession(run)
	return &projected, nil
}

var errLegacySessionReadOnly = errors.New("legacy sessions are read-only")

func (s *APIServer) getPersistedSessionForWrite(ctx context.Context, sessionID string) (*SessionRecord, error) {
	session, err := s.store.GetSession(ctx, sessionID)
	if err == nil {
		return session, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if _, runErr := s.store.GetRun(ctx, sessionID); runErr == nil {
		return nil, errLegacySessionReadOnly
	} else if !errors.Is(runErr, sql.ErrNoRows) {
		return nil, runErr
	}
	return nil, sql.ErrNoRows
}

func (s *APIServer) writeSessionLookupError(w http.ResponseWriter, sessionID string, err error) {
	if errors.Is(err, sql.ErrNoRows) {
		writeAPIError(w, http.StatusNotFound, "SESSION_NOT_FOUND", "session not found", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	writeAPIError(w, http.StatusInternalServerError, "STORE_QUERY_FAILED", "failed to fetch session", true, map[string]interface{}{"error": err.Error(), "sessionId": sessionID})
}

func (s *APIServer) writeSessionWriteLookupError(w http.ResponseWriter, sessionID string, err error) {
	if errors.Is(err, errLegacySessionReadOnly) {
		writeAPIError(w, http.StatusConflict, "LEGACY_SESSION_READ_ONLY", "legacy run-backed sessions are read-only under the M16 write surfaces", false, map[string]interface{}{"sessionId": sessionID})
		return
	}
	s.writeSessionLookupError(w, sessionID, err)
}

func toolActionStatusToEventType(status ToolActionStatus) SessionEventType {
	switch status {
	case ToolActionStatusAuthorized:
		return SessionEventType("tool_action.authorized")
	case ToolActionStatusStarted:
		return SessionEventType("tool_action.started")
	case ToolActionStatusCompleted:
		return SessionEventType("tool_action.completed")
	case ToolActionStatusPolicyBlocked:
		return SessionEventType("tool_action.blocked")
	case ToolActionStatusFailed:
		return SessionEventType("tool_action.failed")
	case ToolActionStatusCancelled:
		return SessionEventType("tool_action.failed")
	default:
		return SessionEventType("tool_action.requested")
	}
}

func sessionTerminalEventType(status SessionStatus) SessionEventType {
	switch status {
	case SessionStatusCompleted:
		return SessionEventType("session.completed")
	case SessionStatusFailed, SessionStatusBlocked:
		return SessionEventType("session.failed")
	case SessionStatusCancelled:
		return SessionEventType("session.cancelled")
	default:
		return SessionEventType("session.status.changed")
	}
}

func countOpenApprovalCheckpoints(items []ApprovalCheckpointRecord) int {
	total := 0
	for _, item := range items {
		if item.Status == ApprovalStatusPending {
			total++
		}
	}
	return total
}

func latestSessionEventSequence(items []SessionEventRecord) int64 {
	var latest int64
	for _, item := range items {
		if item.Sequence > latest {
			latest = item.Sequence
		}
	}
	return latest
}

type sessionToolProposal struct {
	ProposalID   string
	ProposalType string
	Summary      string
	WorkerID     string
	Payload      JSONObject
	Decision     string
	Status       string
	Reason       string
	ToolActionID string
	ActionStatus ToolActionStatus
	ReviewedAt   time.Time
}

func resolveToolProposalType(proposal *sessionToolProposal, action *ToolActionRecord) string {
	if proposal != nil {
		if value := normalizedInterfaceString(proposal.ProposalType); value != "" {
			return value
		}
		if value := normalizedInterfaceString(proposalPayloadValue(proposal, "proposalType")); value != "" {
			return value
		}
	}
	if action != nil {
		if value := normalizedInterfaceString(action.ToolType); value != "" {
			return value
		}
	}
	return "tool_proposal"
}

func proposalPayloadValue(proposal *sessionToolProposal, key string) interface{} {
	if proposal == nil {
		return nil
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}
	if proposal.Payload != nil {
		if value, ok := proposal.Payload[key]; ok {
			return value
		}
	}
	return nil
}

func findSessionToolProposal(events []SessionEventRecord, proposalID string) (*sessionToolProposal, error) {
	targetID := strings.TrimSpace(proposalID)
	if targetID == "" {
		return nil, errors.New("proposalId is required")
	}
	var proposal *sessionToolProposal
	for _, event := range events {
		payload := parseSessionEventPayloadObject(event.Payload)
		nested := extractJSONObjectValue(payload["payload"])
		if len(nested) == 0 {
			nested = extractJSONObjectValue(payload["proposal"])
		}
		switch event.EventType {
		case SessionEventType("tool_proposal.generated"):
			candidateID := normalizedInterfaceString(payload["proposalId"])
			if candidateID == "" {
				candidateID = normalizedInterfaceString(nested["proposalId"])
			}
			if candidateID != targetID {
				continue
			}
			proposal = &sessionToolProposal{
				ProposalID:   targetID,
				ProposalType: normalizeStringOrDefault(normalizedInterfaceString(payload["proposalType"]), normalizedInterfaceString(nested["proposalType"])),
				Summary:      normalizeStringOrDefault(normalizedInterfaceString(payload["summary"]), normalizedInterfaceString(nested["summary"])),
				WorkerID:     normalizedInterfaceString(payload["workerId"]),
				Payload:      nested,
				Status:       "PENDING",
			}
			if proposal.Payload == nil {
				proposal.Payload = JSONObject{}
			}
			for _, key := range []string{"proposalType", "command", "cwd", "timeoutSeconds", "readOnlyRequested", "confidence"} {
				if _, ok := proposal.Payload[key]; ok {
					continue
				}
				if value, ok := payload[key]; ok {
					proposal.Payload[key] = value
				}
			}
		case SessionEventType("tool_proposal.decided"):
			if normalizedInterfaceString(payload["proposalId"]) != targetID {
				continue
			}
			if proposal == nil {
				proposal = &sessionToolProposal{
					ProposalID: targetID,
				}
			}
			proposal.Decision = normalizedInterfaceString(payload["decision"])
			proposal.Status = normalizedInterfaceString(payload["status"])
			proposal.Reason = normalizedInterfaceString(payload["reason"])
			proposal.ToolActionID = normalizedInterfaceString(payload["toolActionId"])
			if statusValue := normalizedInterfaceString(payload["actionStatus"]); statusValue != "" {
				proposal.ActionStatus = ToolActionStatus(statusValue)
			}
			proposal.WorkerID = normalizeStringOrDefault(proposal.WorkerID, normalizedInterfaceString(payload["workerId"]))
			proposal.ProposalType = normalizeStringOrDefault(proposal.ProposalType, normalizedInterfaceString(payload["proposalType"]))
			proposal.Summary = normalizeStringOrDefault(proposal.Summary, normalizedInterfaceString(payload["summary"]))
			proposal.ReviewedAt = event.Timestamp
			if proposal.Decision == "APPROVE" && proposal.ActionStatus == "" {
				proposal.ActionStatus = ToolActionStatusAuthorized
			}
		}
	}
	if proposal == nil {
		return nil, sql.ErrNoRows
	}
	return proposal, nil
}

func extractJSONObjectValue(value interface{}) JSONObject {
	switch typed := value.(type) {
	case nil:
		return JSONObject{}
	case JSONObject:
		return typed
	case map[string]interface{}:
		return JSONObject(typed)
	case json.RawMessage:
		return parseSessionEventPayloadObject(typed)
	case []byte:
		return parseSessionEventPayloadObject(json.RawMessage(typed))
	case string:
		return parseSessionEventPayloadObject(json.RawMessage(typed))
	default:
		return JSONObject{}
	}
}

func normalizedInterfaceString(value interface{}) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		if strings.TrimSpace(typed) == "<nil>" {
			return ""
		}
		return strings.TrimSpace(typed)
	default:
		rendered := strings.TrimSpace(fmt.Sprintf("%v", typed))
		if rendered == "<nil>" {
			return ""
		}
		return rendered
	}
}

func parseSessionEventPayloadObject(raw json.RawMessage) JSONObject {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return JSONObject{}
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return JSONObject{}
	}
	return JSONObject(payload)
}

func (s *APIServer) projectLegacySessions(r *http.Request, query SessionListQuery) ([]SessionRecord, error) {
	runQuery := RunListQuery{
		Limit:          query.Limit,
		Offset:         query.Offset,
		TenantID:       query.TenantID,
		ProjectID:      query.ProjectID,
		Search:         query.Search,
		IncludeExpired: true,
	}
	items, err := s.store.ListRuns(r.Context(), runQuery)
	if err != nil {
		return nil, err
	}
	projected := make([]SessionRecord, 0, len(items))
	for _, item := range items {
		run, err := s.store.GetRun(r.Context(), item.RunID)
		if err != nil {
			continue
		}
		session := projectLegacyRunToSession(run)
		if query.TaskID != "" && session.TaskID != query.TaskID {
			continue
		}
		if query.Status != "" && string(session.Status) != query.Status {
			continue
		}
		if query.SessionType != "" && session.SessionType != query.SessionType {
			continue
		}
		projected = append(projected, session)
	}
	return projected, nil
}

func parseTaskListQuery(r *http.Request) (TaskListQuery, error) {
	query := TaskListQuery{
		Limit:     100,
		TenantID:  strings.TrimSpace(r.URL.Query().Get("tenantId")),
		ProjectID: strings.TrimSpace(r.URL.Query().Get("projectId")),
		Status:    strings.TrimSpace(r.URL.Query().Get("status")),
		Search:    strings.TrimSpace(r.URL.Query().Get("search")),
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return query, fmt.Errorf("limit must be an integer")
		}
		query.Limit = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return query, fmt.Errorf("offset must be an integer")
		}
		query.Offset = parsed
	}
	if query.Limit <= 0 {
		return query, fmt.Errorf("limit must be >= 1")
	}
	if query.Offset < 0 {
		return query, fmt.Errorf("offset must be >= 0")
	}
	return query, nil
}

func parseSessionListQuery(r *http.Request) (SessionListQuery, error) {
	query := SessionListQuery{
		Limit:         100,
		TaskID:        strings.TrimSpace(r.URL.Query().Get("taskId")),
		TenantID:      strings.TrimSpace(r.URL.Query().Get("tenantId")),
		ProjectID:     strings.TrimSpace(r.URL.Query().Get("projectId")),
		Status:        strings.TrimSpace(r.URL.Query().Get("status")),
		SessionType:   strings.TrimSpace(r.URL.Query().Get("sessionType")),
		Search:        strings.TrimSpace(r.URL.Query().Get("search")),
		IncludeLegacy: true,
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return query, fmt.Errorf("limit must be an integer")
		}
		query.Limit = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("offset")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return query, fmt.Errorf("offset must be an integer")
		}
		query.Offset = parsed
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("includeLegacy")); raw != "" {
		query.IncludeLegacy = raw != "false"
	}
	if query.Limit <= 0 {
		return query, fmt.Errorf("limit must be >= 1")
	}
	if query.Offset < 0 {
		return query, fmt.Errorf("offset must be >= 0")
	}
	return query, nil
}

func projectLegacyRunToSession(run *RunRecord) SessionRecord {
	session := SessionRecord{
		SessionID:   run.RunID,
		TaskID:      "legacy-task-" + run.RunID,
		RequestID:   run.RequestID,
		LegacyRunID: run.RunID,
		TenantID:    run.TenantID,
		ProjectID:   run.ProjectID,
		SessionType: "legacy_run",
		Status:      mapRunStatusToSessionStatus(run.Status),
		Source:      "v1alpha1.runtime.run",
		Summary: mustMarshalJSON(map[string]interface{}{
			"runId":            run.RunID,
			"policyDecision":   run.PolicyDecision,
			"profileProvider":  run.SelectedProfileProvider,
			"policyProvider":   run.SelectedPolicyProvider,
			"evidenceProvider": run.SelectedEvidenceProvider,
			"desktopProvider":  run.SelectedDesktopProvider,
		}),
		CreatedAt: run.CreatedAt.UTC(),
		StartedAt: run.CreatedAt.UTC(),
		UpdatedAt: run.UpdatedAt.UTC(),
	}
	if run.Status == RunStatusCompleted || run.Status == RunStatusFailed {
		t := run.UpdatedAt.UTC()
		session.CompletedAt = &t
	}
	return session
}

func projectLegacyRunToSessionEvents(run *RunRecord) []SessionEventRecord {
	createdAt := run.CreatedAt.UTC()
	updatedAt := run.UpdatedAt.UTC()
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	if updatedAt.IsZero() {
		updatedAt = createdAt
	}
	return []SessionEventRecord{
		{
			EventID:   fmt.Sprintf("%s-legacy-created", run.RunID),
			SessionID: run.RunID,
			Sequence:  1,
			EventType: SessionEventType("session.created"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"source":    "v1alpha1.runtime.run",
				"runId":     run.RunID,
				"requestId": run.RequestID,
			}),
			Timestamp: createdAt,
		},
		{
			EventID:   fmt.Sprintf("%s-legacy-status", run.RunID),
			SessionID: run.RunID,
			Sequence:  2,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"status":         mapRunStatusToSessionStatus(run.Status),
				"runStatus":      run.Status,
				"policyDecision": run.PolicyDecision,
			}),
			Timestamp: updatedAt,
		},
	}
}

func projectLegacyRunToApprovalCheckpoints(run *RunRecord) []ApprovalCheckpointRecord {
	record, ok := buildApprovalRecordFromRun(run, time.Now().UTC())
	if !ok {
		return nil
	}
	checkpoint := ApprovalCheckpointRecord{
		CheckpointID:           record.ApprovalID,
		SessionID:              run.RunID,
		LegacyRunID:            run.RunID,
		RequestID:              record.RequestID,
		TenantID:               record.TenantID,
		ProjectID:              record.ProjectID,
		Scope:                  "legacy.desktop.approval",
		Tier:                   record.Tier,
		TargetOS:               record.TargetOS,
		TargetExecutionProfile: record.TargetExecutionProfile,
		RequestedCapabilities:  append([]string(nil), record.RequestedCapabilities...),
		RequiredVerifierIDs:    append([]string(nil), record.RequiredVerifierIDs...),
		Status:                 record.Status,
		Reason:                 record.Reason,
		CreatedAt:              record.CreatedAt,
		ExpiresAt:              record.ExpiresAt,
		ReviewedAt:             record.ReviewedAt,
		UpdatedAt:              run.UpdatedAt.UTC(),
	}
	return []ApprovalCheckpointRecord{checkpoint}
}

func mergeSessionLists(primary, projected []SessionRecord) []SessionRecord {
	out := make([]SessionRecord, 0, len(primary)+len(projected))
	seen := make(map[string]struct{}, len(primary)+len(projected))
	for _, item := range primary {
		out = append(out, item)
		seen[item.SessionID] = struct{}{}
	}
	for _, item := range projected {
		if _, ok := seen[item.SessionID]; ok {
			continue
		}
		out = append(out, item)
	}
	return out
}

func mergeApprovalCheckpointLists(primary, projected []ApprovalCheckpointRecord) []ApprovalCheckpointRecord {
	out := make([]ApprovalCheckpointRecord, 0, len(primary)+len(projected))
	seen := make(map[string]struct{}, len(primary)+len(projected))
	for _, item := range primary {
		out = append(out, item)
		seen[item.CheckpointID] = struct{}{}
	}
	for _, item := range projected {
		if _, ok := seen[item.CheckpointID]; ok {
			continue
		}
		out = append(out, item)
	}
	return out
}

func mergeSessionEventLists(primary, secondary []SessionEventRecord) []SessionEventRecord {
	out := make([]SessionEventRecord, 0, len(primary)+len(secondary))
	seen := make(map[string]struct{}, len(primary)+len(secondary))
	for _, item := range primary {
		out = append(out, item)
		seen[item.EventID] = struct{}{}
	}
	for _, item := range secondary {
		if _, ok := seen[item.EventID]; ok {
			continue
		}
		out = append(out, item)
	}
	return out
}

func mapRunStatusToSessionStatus(status RunStatus) SessionStatus {
	switch status {
	case RunStatusPending:
		return SessionStatusPending
	case RunStatusCompleted:
		return SessionStatusCompleted
	case RunStatusFailed:
		return SessionStatusFailed
	default:
		return SessionStatusRunning
	}
}

func mustMarshalJSONObject(primary, fallback JSONObject) json.RawMessage {
	if primary != nil {
		return mustMarshalJSON(primary)
	}
	if fallback != nil {
		return mustMarshalJSON(fallback)
	}
	return []byte("{}")
}

func mustMarshalJSON(v interface{}) json.RawMessage {
	if v == nil {
		return []byte("{}")
	}
	data, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return data
}

func normalizeStringOrDefault(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func normalizeRequestID(value, prefix string, now time.Time) string {
	value = strings.TrimSpace(value)
	if value != "" {
		return value
	}
	return fmt.Sprintf("%s-%d", prefix, now.UnixNano())
}
