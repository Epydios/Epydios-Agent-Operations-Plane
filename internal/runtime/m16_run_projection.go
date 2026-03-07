package runtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strings"
	"time"
)

func (s *APIServer) listRunSummariesWithSessionProjection(ctx context.Context, query RunListQuery) ([]RunSummary, error) {
	fetchLimit := query.Limit + query.Offset
	if fetchLimit <= 0 {
		fetchLimit = 100
	}
	if fetchLimit < 100 {
		fetchLimit = 100
	}
	if fetchLimit > 1000 {
		fetchLimit = 1000
	}

	runQuery := query
	runQuery.Offset = 0
	runQuery.Limit = fetchLimit
	items, err := s.store.ListRuns(ctx, runQuery)
	if err != nil {
		return nil, err
	}

	sessionItems, err := s.store.ListSessions(ctx, SessionListQuery{
		Limit:         fetchLimit,
		Offset:        0,
		TenantID:      query.TenantID,
		ProjectID:     query.ProjectID,
		IncludeLegacy: false,
	})
	if err != nil {
		return nil, err
	}

	projected := make([]RunSummary, 0, len(sessionItems))
	for _, session := range sessionItems {
		if strings.TrimSpace(session.LegacyRunID) != "" {
			continue
		}
		item, err := s.projectSessionToRunSummary(ctx, &session)
		if err != nil {
			return nil, err
		}
		if !runSummaryMatchesQuery(item, query) {
			continue
		}
		projected = append(projected, item)
	}

	merged := mergeRunSummaryLists(items, projected)
	filtered := make([]RunSummary, 0, len(merged))
	for _, item := range merged {
		if runSummaryMatchesQuery(item, query) {
			filtered = append(filtered, item)
		}
	}
	sort.Slice(filtered, func(i, j int) bool {
		if filtered[i].CreatedAt.Equal(filtered[j].CreatedAt) {
			return filtered[i].RunID < filtered[j].RunID
		}
		return filtered[i].CreatedAt.After(filtered[j].CreatedAt)
	})
	return paginateRunSummaries(filtered, query.Offset, query.Limit), nil
}

func (s *APIServer) getRunRecordWithSessionProjection(ctx context.Context, runID string) (*RunRecord, error) {
	run, err := s.store.GetRun(ctx, runID)
	if err == nil {
		return run, nil
	}
	if !isRunNotFoundError(err) {
		return nil, err
	}
	session, err := s.store.GetSession(ctx, runID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(session.LegacyRunID) != "" {
		return nil, sql.ErrNoRows
	}
	return s.projectSessionToRunRecord(ctx, session)
}

func (s *APIServer) projectSessionToRunSummary(ctx context.Context, session *SessionRecord) (RunSummary, error) {
	workers, approvals, err := s.loadProjectedSessionSupport(ctx, session)
	if err != nil {
		return RunSummary{}, err
	}
	selectedWorker := selectProjectedWorker(session, workers)
	policyDecision, grantPresent, expiresAt := deriveProjectedPolicyState(approvals)
	return RunSummary{
		RunID:                    session.SessionID,
		RequestID:                session.RequestID,
		TenantID:                 session.TenantID,
		ProjectID:                session.ProjectID,
		Environment:              projectedRunEnvironment(selectedWorker),
		RetentionClass:           "",
		ExpiresAt:                expiresAt,
		Status:                   mapSessionToProjectedRunStatus(session, selectedWorker, approvals),
		SelectedProfileProvider:  projectedSelectedProfileProvider(selectedWorker),
		SelectedPolicyProvider:   projectedSelectedPolicyProvider(approvals),
		SelectedEvidenceProvider: projectedSelectedEvidenceProvider(session),
		SelectedDesktopProvider:  projectedSelectedDesktopProvider(selectedWorker),
		PolicyDecision:           policyDecision,
		PolicyBundleID:           "",
		PolicyBundleVersion:      "",
		PolicyGrantTokenPresent:  grantPresent,
		PolicyGrantTokenSHA256:   "",
		CreatedAt:                session.CreatedAt.UTC(),
		UpdatedAt:                session.UpdatedAt.UTC(),
	}, nil
}

func (s *APIServer) projectSessionToRunRecord(ctx context.Context, session *SessionRecord) (*RunRecord, error) {
	task, workers, events, approvals, toolActions, evidenceRecords, err := s.loadProjectedSessionDetail(ctx, session)
	if err != nil {
		return nil, err
	}
	selectedWorker := selectProjectedWorker(session, workers)
	policyDecision, grantPresent, expiresAt := deriveProjectedPolicyState(approvals)
	record := &RunRecord{
		RunID:                    session.SessionID,
		RequestID:                session.RequestID,
		TenantID:                 session.TenantID,
		ProjectID:                session.ProjectID,
		Environment:              projectedRunEnvironment(selectedWorker),
		RetentionClass:           "",
		ExpiresAt:                expiresAt,
		Status:                   mapSessionToProjectedRunStatus(session, selectedWorker, approvals),
		SelectedProfileProvider:  projectedSelectedProfileProvider(selectedWorker),
		SelectedPolicyProvider:   projectedSelectedPolicyProvider(approvals),
		SelectedEvidenceProvider: projectedSelectedEvidenceProvider(session),
		SelectedDesktopProvider:  projectedSelectedDesktopProvider(selectedWorker),
		PolicyDecision:           policyDecision,
		PolicyBundleID:           "",
		PolicyBundleVersion:      "",
		PolicyGrantTokenPresent:  grantPresent,
		PolicyGrantTokenSHA256:   "",
		RequestPayload:           mustMarshalJSON(buildProjectedRunRequestPayload(task, session, selectedWorker, workers, approvals, toolActions, evidenceRecords)),
		ProfileResponse:          mustMarshalOptionalJSON(selectedWorker),
		PolicyResponse:           mustMarshalOptionalJSON(selectLatestApprovalCheckpoint(approvals)),
		ErrorMessage:             projectedRunErrorMessage(session, events),
		CreatedAt:                session.CreatedAt.UTC(),
		UpdatedAt:                session.UpdatedAt.UTC(),
	}
	if latestEvidence := selectLatestEvidenceRecord(evidenceRecords); latestEvidence != nil {
		record.EvidenceRecordResponse = mustMarshalOptionalJSON(latestEvidence)
	}
	if len(events) > 0 || len(toolActions) > 0 || len(evidenceRecords) > 0 {
		record.EvidenceBundleResponse = mustMarshalJSON(map[string]interface{}{
			"sessionId":       session.SessionID,
			"events":          events,
			"toolActions":     toolActions,
			"evidenceRecords": evidenceRecords,
		})
	}
	return record, nil
}

func (s *APIServer) loadProjectedSessionSupport(ctx context.Context, session *SessionRecord) ([]SessionWorkerRecord, []ApprovalCheckpointRecord, error) {
	workers, err := s.store.ListSessionWorkers(ctx, SessionWorkerListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     50,
	})
	if err != nil {
		return nil, nil, err
	}
	approvals, err := s.store.ListApprovalCheckpoints(ctx, ApprovalCheckpointListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     20,
	})
	if err != nil {
		return nil, nil, err
	}
	return workers, approvals, nil
}

func (s *APIServer) loadProjectedSessionDetail(ctx context.Context, session *SessionRecord) (*TaskRecord, []SessionWorkerRecord, []SessionEventRecord, []ApprovalCheckpointRecord, []ToolActionRecord, []EvidenceRecord, error) {
	var task *TaskRecord
	if strings.TrimSpace(session.TaskID) != "" {
		item, err := s.store.GetTask(ctx, session.TaskID)
		if err != nil && !isRunNotFoundError(err) {
			return nil, nil, nil, nil, nil, nil, err
		}
		task = item
	}
	workers, approvals, err := s.loadProjectedSessionSupport(ctx, session)
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	events, err := s.store.ListSessionEvents(ctx, SessionEventListQuery{
		SessionID: session.SessionID,
		Limit:     200,
	})
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	toolActions, err := s.store.ListToolActions(ctx, ToolActionListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     200,
	})
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	evidenceRecords, err := s.store.ListEvidenceRecords(ctx, EvidenceRecordListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     200,
	})
	if err != nil {
		return nil, nil, nil, nil, nil, nil, err
	}
	return task, workers, events, approvals, toolActions, evidenceRecords, nil
}

func selectProjectedWorker(session *SessionRecord, workers []SessionWorkerRecord) *SessionWorkerRecord {
	if session != nil {
		selectedID := strings.TrimSpace(session.SelectedWorkerID)
		if selectedID != "" {
			for i := range workers {
				if workers[i].WorkerID == selectedID {
					return &workers[i]
				}
			}
		}
	}
	if len(workers) == 0 {
		return nil
	}
	return &workers[0]
}

func deriveProjectedPolicyState(checkpoints []ApprovalCheckpointRecord) (string, bool, *time.Time) {
	latest := selectLatestApprovalCheckpoint(checkpoints)
	if latest == nil {
		return "", false, nil
	}
	switch latest.Status {
	case ApprovalStatusDenied:
		return "DENY", false, latest.ExpiresAt
	case ApprovalStatusApproved:
		return "ALLOW", true, latest.ExpiresAt
	case ApprovalStatusPending, ApprovalStatusExpired:
		return "ALLOW", false, latest.ExpiresAt
	default:
		return "", false, latest.ExpiresAt
	}
}

func mapSessionToProjectedRunStatus(session *SessionRecord, selectedWorker *SessionWorkerRecord, approvals []ApprovalCheckpointRecord) RunStatus {
	if latest := selectLatestApprovalCheckpoint(approvals); latest != nil {
		switch latest.Status {
		case ApprovalStatusDenied, ApprovalStatusExpired, ApprovalStatusPending:
			if session.Status != SessionStatusCompleted {
				return RunStatusFailed
			}
		case ApprovalStatusApproved:
			if session.Status != SessionStatusCompleted && session.Status != SessionStatusFailed {
				return RunStatusPolicyEvaluated
			}
		}
	}
	switch session.Status {
	case SessionStatusCompleted:
		return RunStatusCompleted
	case SessionStatusFailed, SessionStatusBlocked, SessionStatusCancelled:
		return RunStatusFailed
	case SessionStatusRunning:
		if selectedWorker != nil || strings.TrimSpace(session.SelectedWorkerID) != "" {
			return RunStatusPolicyEvaluated
		}
		return RunStatusProfileResolved
	case SessionStatusReady, SessionStatusAwaitingApproval:
		if selectedWorker != nil || strings.TrimSpace(session.SelectedWorkerID) != "" {
			return RunStatusPolicyEvaluated
		}
		return RunStatusProfileResolved
	default:
		return RunStatusPending
	}
}

func projectedRunEnvironment(selectedWorker *SessionWorkerRecord) string {
	if selectedWorker == nil {
		return ""
	}
	return strings.TrimSpace(selectedWorker.TargetEnvironment)
}

func projectedSelectedProfileProvider(selectedWorker *SessionWorkerRecord) string {
	if selectedWorker == nil {
		return ""
	}
	if selectedWorker.WorkerType == "desktop_executor" {
		return ""
	}
	if value := strings.TrimSpace(selectedWorker.Provider); value != "" {
		return value
	}
	return strings.TrimSpace(selectedWorker.AdapterID)
}

func projectedSelectedPolicyProvider(approvals []ApprovalCheckpointRecord) string {
	if len(approvals) == 0 {
		return ""
	}
	return "m16.approval_checkpoint"
}

func projectedSelectedEvidenceProvider(session *SessionRecord) string {
	if session == nil {
		return ""
	}
	return "m16.session"
}

func projectedSelectedDesktopProvider(selectedWorker *SessionWorkerRecord) string {
	if selectedWorker == nil {
		return ""
	}
	if selectedWorker.WorkerType != "desktop_executor" {
		return ""
	}
	return strings.TrimSpace(selectedWorker.AdapterID)
}

func selectLatestApprovalCheckpoint(checkpoints []ApprovalCheckpointRecord) *ApprovalCheckpointRecord {
	if len(checkpoints) == 0 {
		return nil
	}
	return &checkpoints[0]
}

func buildProjectedRunRequestPayload(task *TaskRecord, session *SessionRecord, selectedWorker *SessionWorkerRecord, workers []SessionWorkerRecord, approvals []ApprovalCheckpointRecord, toolActions []ToolActionRecord, evidenceRecords []EvidenceRecord) map[string]interface{} {
	payload := map[string]interface{}{
		"meta": map[string]interface{}{
			"requestId": session.RequestID,
			"tenantId":  session.TenantID,
			"projectId": session.ProjectID,
			"source":    session.Source,
		},
		"session": map[string]interface{}{
			"sessionId":        session.SessionID,
			"taskId":           session.TaskID,
			"sessionType":      session.SessionType,
			"status":           session.Status,
			"selectedWorkerId": session.SelectedWorkerID,
			"summary":          json.RawMessage(jsonBytesOrEmptyObject(session.Summary)),
			"annotations":      json.RawMessage(jsonBytesOrEmptyObject(session.Annotations)),
		},
	}
	if task != nil {
		payload["task"] = map[string]interface{}{
			"taskId":          task.TaskID,
			"title":           task.Title,
			"intent":          task.Intent,
			"requestedBy":     json.RawMessage(jsonBytesOrEmptyObject(task.RequestedBy)),
			"annotations":     json.RawMessage(jsonBytesOrEmptyObject(task.Annotations)),
			"latestSessionId": task.LatestSessionID,
		}
	}
	if len(workers) > 0 {
		payload["workers"] = workers
	}
	if selectedWorker != nil {
		payload["worker"] = selectedWorker
	}
	if len(approvals) > 0 {
		payload["approvals"] = approvals
		if latest := selectLatestApprovalCheckpoint(approvals); latest != nil {
			payload["desktop"] = map[string]interface{}{
				"tier":                   latest.Tier,
				"targetOS":               latest.TargetOS,
				"targetExecutionProfile": latest.TargetExecutionProfile,
				"requestedCapabilities":  latest.RequestedCapabilities,
				"requiredVerifierIds":    latest.RequiredVerifierIDs,
				"humanApprovalGranted":   latest.Status == ApprovalStatusApproved,
			}
		}
	}
	if len(toolActions) > 0 {
		payload["toolActions"] = toolActions
	}
	if len(evidenceRecords) > 0 {
		payload["evidenceRecords"] = evidenceRecords
	}
	return payload
}

func projectedRunErrorMessage(session *SessionRecord, events []SessionEventRecord) string {
	if session == nil {
		return ""
	}
	for i := len(events) - 1; i >= 0; i-- {
		payload := parseSessionEventPayload(events[i].Payload)
		if text := mapStringField(payload, "error"); text != "" {
			return text
		}
		if text := mapStringField(payload, "reason"); text != "" {
			return text
		}
	}
	return ""
}

func selectLatestEvidenceRecord(items []EvidenceRecord) *EvidenceRecord {
	if len(items) == 0 {
		return nil
	}
	return &items[len(items)-1]
}

func parseSessionEventPayload(raw json.RawMessage) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil || payload == nil {
		return map[string]interface{}{}
	}
	return payload
}

func mapStringField(payload map[string]interface{}, key string) string {
	if payload == nil {
		return ""
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(strings.TrimSpace(toString(value)))
}

func toString(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		b, err := json.Marshal(typed)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func runSummaryMatchesQuery(item RunSummary, query RunListQuery) bool {
	if query.TenantID != "" && item.TenantID != query.TenantID {
		return false
	}
	if query.ProjectID != "" && item.ProjectID != query.ProjectID {
		return false
	}
	if query.Environment != "" && item.Environment != query.Environment {
		return false
	}
	if query.Status != "" && string(item.Status) != query.Status {
		return false
	}
	if query.PolicyDecision != "" && strings.ToUpper(strings.TrimSpace(item.PolicyDecision)) != query.PolicyDecision {
		return false
	}
	if query.ProviderID != "" {
		providerID := strings.TrimSpace(query.ProviderID)
		if item.SelectedProfileProvider != providerID &&
			item.SelectedPolicyProvider != providerID &&
			item.SelectedEvidenceProvider != providerID &&
			item.SelectedDesktopProvider != providerID {
			return false
		}
	}
	if query.RetentionClass != "" && item.RetentionClass != query.RetentionClass {
		return false
	}
	if query.CreatedAfter != nil && item.CreatedAt.UTC().Before(query.CreatedAfter.UTC()) {
		return false
	}
	if query.CreatedBefore != nil && item.CreatedAt.UTC().After(query.CreatedBefore.UTC()) {
		return false
	}
	if !query.IncludeExpired && item.ExpiresAt != nil && !item.ExpiresAt.After(time.Now().UTC()) {
		return false
	}
	if query.Search != "" {
		search := strings.ToLower(strings.TrimSpace(query.Search))
		if !containsProjectedSearch(item, search) {
			return false
		}
	}
	return true
}

func containsProjectedSearch(item RunSummary, search string) bool {
	fields := []string{
		item.RunID,
		item.RequestID,
		item.TenantID,
		item.ProjectID,
		item.SelectedProfileProvider,
		item.SelectedPolicyProvider,
		item.SelectedEvidenceProvider,
		item.SelectedDesktopProvider,
		item.PolicyDecision,
		item.Environment,
	}
	for _, field := range fields {
		if strings.Contains(strings.ToLower(strings.TrimSpace(field)), search) {
			return true
		}
	}
	return false
}

func mergeRunSummaryLists(primary, projected []RunSummary) []RunSummary {
	out := make([]RunSummary, 0, len(primary)+len(projected))
	seen := make(map[string]struct{}, len(primary)+len(projected))
	for _, item := range primary {
		out = append(out, item)
		seen[item.RunID] = struct{}{}
	}
	for _, item := range projected {
		if _, ok := seen[item.RunID]; ok {
			continue
		}
		out = append(out, item)
	}
	return out
}

func paginateRunSummaries(items []RunSummary, offset, limit int) []RunSummary {
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 {
		limit = 100
	}
	if offset >= len(items) {
		return []RunSummary{}
	}
	end := offset + limit
	if end > len(items) {
		end = len(items)
	}
	return items[offset:end]
}

func mustMarshalOptionalJSON(v interface{}) json.RawMessage {
	if v == nil {
		return nil
	}
	return mustMarshalJSON(v)
}
