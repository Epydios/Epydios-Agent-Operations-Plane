package runtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func invokeSessionToolActionID(sessionID, toolType, requestID string) string {
	id := fmt.Sprintf("%s-tool-%s", sessionID, sanitizeIDFragment(toolType))
	if fragment := sanitizeIDFragment(requestID); fragment != "" && fragment != "unknown" {
		return id + "-" + fragment
	}
	return id
}

func parseRawJSONObject(raw json.RawMessage) JSONObject {
	if len(strings.TrimSpace(string(raw))) == 0 {
		return JSONObject{}
	}
	return parseSessionEventPayloadObject(raw)
}

func normalizedInterfaceInt(value interface{}, fallback int) int {
	switch typed := value.(type) {
	case nil:
		return fallback
	case int:
		if typed > 0 {
			return typed
		}
	case int64:
		if typed > 0 {
			return int(typed)
		}
	case float64:
		if typed > 0 {
			return int(typed)
		}
	case json.Number:
		if parsed, err := typed.Int64(); err == nil && parsed > 0 {
			return int(parsed)
		}
	case string:
		if parsed, err := json.Number(strings.TrimSpace(typed)).Int64(); err == nil && parsed > 0 {
			return int(parsed)
		}
	}
	return fallback
}

func copyJSONObject(value JSONObject) JSONObject {
	if len(value) == 0 {
		return JSONObject{}
	}
	clone := make(JSONObject, len(value))
	for key, item := range value {
		clone[key] = item
	}
	return clone
}

func (s *APIServer) findSessionToolActionByID(ctx context.Context, sessionID, toolActionID string) (*ToolActionRecord, error) {
	if s == nil || s.store == nil || strings.TrimSpace(sessionID) == "" || strings.TrimSpace(toolActionID) == "" {
		return nil, nil
	}
	items, err := s.store.ListToolActions(ctx, ToolActionListQuery{
		SessionID: sessionID,
		Limit:     1000,
	})
	if err != nil {
		return nil, err
	}
	for i := range items {
		if items[i].ToolActionID == toolActionID {
			item := items[i]
			return &item, nil
		}
	}
	return nil, nil
}

func (s *APIServer) findLatestManagedTurnToolAction(ctx context.Context, sessionID string) (*ToolActionRecord, error) {
	if s == nil || s.store == nil || strings.TrimSpace(sessionID) == "" {
		return nil, nil
	}
	items, err := s.store.ListToolActions(ctx, ToolActionListQuery{
		SessionID: sessionID,
		Limit:     1000,
	})
	if err != nil {
		return nil, err
	}
	var latest *ToolActionRecord
	for i := range items {
		if !strings.EqualFold(strings.TrimSpace(items[i].ToolType), "managed_agent_turn") {
			continue
		}
		item := items[i]
		if latest == nil || item.UpdatedAt.After(latest.UpdatedAt) || item.CreatedAt.After(latest.CreatedAt) {
			latest = &item
		}
	}
	return latest, nil
}

func (s *APIServer) selectedManagedCodexWorkerForSession(ctx context.Context, session *SessionRecord, workerID string) (*SessionWorkerRecord, error) {
	if s == nil || s.store == nil || session == nil {
		return nil, nil
	}
	items, err := s.store.ListSessionWorkers(ctx, SessionWorkerListQuery{
		SessionID: session.SessionID,
		TenantID:  session.TenantID,
		ProjectID: session.ProjectID,
		Limit:     100,
	})
	if err != nil {
		return nil, err
	}
	candidates := []string{strings.TrimSpace(workerID), strings.TrimSpace(session.SelectedWorkerID)}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		for i := range items {
			item := items[i]
			if item.WorkerID != candidate {
				continue
			}
			if strings.EqualFold(strings.TrimSpace(item.WorkerType), "managed_agent") && strings.EqualFold(strings.TrimSpace(item.AdapterID), "codex") {
				return &item, nil
			}
		}
	}
	for i := range items {
		item := items[i]
		if strings.EqualFold(strings.TrimSpace(item.WorkerType), "managed_agent") && strings.EqualFold(strings.TrimSpace(item.AdapterID), "codex") {
			return &item, nil
		}
	}
	return nil, nil
}

func (s *APIServer) continueManagedWorkerAfterToolAction(ctx context.Context, session *SessionRecord, proposal *sessionToolProposal, action *ToolActionRecord, commandText, cwd string, timeoutSeconds int, execResult *TerminalExecutionResult, execErr error, decidedAt time.Time) bool {
	if s == nil || s.store == nil || s.agentInvoker == nil || session == nil || action == nil {
		return false
	}
	task, err := s.store.GetTask(ctx, session.TaskID)
	if err != nil || task == nil {
		return false
	}
	worker, err := s.selectedManagedCodexWorkerForSession(ctx, session, normalizeStringOrDefault(action.WorkerID, proposal.WorkerID))
	if err != nil || worker == nil {
		return false
	}

	settings, err := s.agentInvoker.loadAgentIntegrationSettings(ctx, session.TenantID, session.ProjectID)
	if err != nil {
		return false
	}
	profileID := normalizeStringOrDefault(worker.AgentProfileID, "codex")
	profile, err := settings.resolveProfile(profileID)
	if err != nil {
		return false
	}

	taskAnnotations := parseRawJSONObject(task.Annotations)
	sessionSummary := parseRawJSONObject(session.Summary)
	systemPrompt := normalizedInterfaceString(taskAnnotations["systemPrompt"])
	maxOutputTokens := normalizedInterfaceInt(sessionSummary["maxOutputTokens"], 1024)
	previousTurn, err := s.findLatestManagedTurnToolAction(ctx, session.SessionID)
	if err != nil {
		return false
	}
	previousOutputText := ""
	var previousRawResponse json.RawMessage
	if previousTurn != nil {
		payload := parseRawJSONObject(previousTurn.ResultPayload)
		previousOutputText = normalizedInterfaceString(payload["outputText"])
		switch raw := payload["rawResponse"].(type) {
		case json.RawMessage:
			previousRawResponse = raw
		case []byte:
			previousRawResponse = json.RawMessage(raw)
		case string:
			previousRawResponse = json.RawMessage(raw)
		default:
			previousRawResponse = mustMarshalJSON(raw)
		}
	}

	now := time.Now().UTC()
	continuationRequestID := fmt.Sprintf("resume-%s-%d", sanitizeIDFragment(normalizeStringOrDefault(proposal.ProposalID, action.ToolActionID)), now.UnixNano())
	continuationToolActionID := invokeSessionToolActionID(session.SessionID, "managed_agent_turn", continuationRequestID)
	continuationRequestPayload := mustMarshalJSON(map[string]interface{}{
		"requestId":         continuationRequestID,
		"agentProfileId":    profile.ID,
		"executionMode":     AgentInvokeExecutionModeManagedCodexWorker,
		"continuation":      true,
		"resumeAfterProposalId": normalizeStringOrDefault(proposal.ProposalID, ""),
		"resumeAfterToolActionId": action.ToolActionID,
		"command":           commandText,
		"cwd":               cwd,
		"timeoutSeconds":    timeoutSeconds,
		"toolExecution": map[string]interface{}{
			"status":       action.Status,
			"exitCode":     func() int { if execResult != nil { return execResult.ExitCode }; return -1 }(),
			"timedOut":     execResult != nil && execResult.TimedOut,
			"outputSha256": func() string { if execResult != nil { return execResult.OutputSHA256 }; return "" }(),
			"error":        errorString(execErr),
			"outputPreview": func() string {
				if execResult == nil {
					return ""
				}
				return truncateManagedCodexContinuationText(execResult.Output, 400)
			}(),
		},
	})
	s.upsertToolActionBestEffort(ctx, &ToolActionRecord{
		ToolActionID: continuationToolActionID,
		SessionID:    session.SessionID,
		WorkerID:     worker.WorkerID,
		TenantID:     session.TenantID,
		ProjectID:    session.ProjectID,
		ToolType:     "managed_agent_turn",
		Status:       ToolActionStatusRequested,
		Source:       "v1alpha2.runtime.workers.codex_bridge.resume",
		RequestPayload: continuationRequestPayload,
		CreatedAt:    now,
		UpdatedAt:    now,
	})
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("tool_action.requested"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"toolActionId":   continuationToolActionID,
			"toolType":       "managed_agent_turn",
			"workerId":       worker.WorkerID,
			"requestId":      continuationRequestID,
			"executionMode":  AgentInvokeExecutionModeManagedCodexWorker,
			"proposalId":     normalizeStringOrDefault(proposal.ProposalID, ""),
			"summary":        "Managed Codex worker resumed after governed tool execution.",
		}),
		Timestamp: now,
	})

	previousSessionStatus := session.Status
	session.Status = SessionStatusRunning
	session.CompletedAt = nil
	session.UpdatedAt = now
	task.Status = TaskStatusInProgress
	task.UpdatedAt = now
	_ = s.store.UpsertTask(ctx, task)
	_ = s.store.UpsertSession(ctx, session)
	if previousSessionStatus != session.Status {
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"previousStatus": previousSessionStatus,
				"status":         session.Status,
				"proposalId":     normalizeStringOrDefault(proposal.ProposalID, ""),
				"toolActionId":   continuationToolActionID,
			}),
			Timestamp: now,
		})
	}
	s.upsertSessionWorkerBestEffort(ctx, &SessionWorkerRecord{
		WorkerID:          worker.WorkerID,
		SessionID:         worker.SessionID,
		TaskID:            worker.TaskID,
		TenantID:          worker.TenantID,
		ProjectID:         worker.ProjectID,
		WorkerType:        worker.WorkerType,
		AdapterID:         worker.AdapterID,
		Status:            WorkerStatusRunning,
		Source:            worker.Source,
		Capabilities:      append([]string(nil), worker.Capabilities...),
		Routing:           worker.Routing,
		AgentProfileID:    worker.AgentProfileID,
		Provider:          worker.Provider,
		Transport:         worker.Transport,
		Model:             worker.Model,
		TargetEnvironment: worker.TargetEnvironment,
		Annotations:       worker.Annotations,
		CreatedAt:         worker.CreatedAt,
		UpdatedAt:         now,
	})
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.progress"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"workerId": worker.WorkerID,
			"status":   WorkerStatusRunning,
			"summary":  "Managed Codex worker is resuming after governed tool execution.",
			"payload": map[string]interface{}{
				"stage":        "resuming_after_tool_action",
				"percent":      85,
				"toolActionId": continuationToolActionID,
				"proposalId":   normalizeStringOrDefault(proposal.ProposalID, ""),
			},
		}),
		Timestamp: now,
	})

	response, err := s.agentInvoker.ContinueManagedWorkerTurn(ctx, managedWorkerContinuationRequest{
		Meta:               ObjectMeta{TenantID: session.TenantID, ProjectID: session.ProjectID, RequestID: continuationRequestID},
		Profile:            profile,
		Task:               task,
		Session:            session,
		Worker:             worker,
		Proposal:           proposal,
		ToolAction:         action,
		CommandText:        commandText,
		CommandCWD:         cwd,
		TimeoutSeconds:     timeoutSeconds,
		ExecutionResult:    execResult,
		ExecutionError:     errorString(execErr),
		SystemPrompt:       systemPrompt,
		MaxOutputTokens:    maxOutputTokens,
		PreviousOutputText: previousOutputText,
		PreviousRawResponse: previousRawResponse,
	})
	if err != nil {
		s.markInvokeSessionResult(ctx, task, session, &AgentInvokeResponse{
			RequestID:        continuationRequestID,
			TaskID:           task.TaskID,
			SessionID:        session.SessionID,
			SelectedWorkerID: worker.WorkerID,
			TenantID:         session.TenantID,
			ProjectID:        session.ProjectID,
			AgentProfileID:   profile.ID,
			ExecutionMode:    AgentInvokeExecutionModeManagedCodexWorker,
			WorkerType:       worker.WorkerType,
			WorkerAdapterID:  worker.AdapterID,
			Provider:         profile.Provider,
			Transport:        profile.Transport,
			Model:            profile.Model,
			Route:            "managed_worker_process",
		}, err, time.Now().UTC())
		return true
	}
	response.TaskID = task.TaskID
	response.SessionID = session.SessionID
	response.SelectedWorkerID = worker.WorkerID
	response.ExecutionMode = AgentInvokeExecutionModeManagedCodexWorker
	response.WorkerType = worker.WorkerType
	response.WorkerAdapterID = worker.AdapterID
	s.markInvokeSessionResult(ctx, task, session, response, nil, time.Now().UTC())
	return true
}

func (s *APIServer) transitionSessionAfterStandaloneToolAction(ctx context.Context, session *SessionRecord, finalStatus ToolActionStatus, changedAt time.Time, proposal *sessionToolProposal, toolActionID string) {
	if s == nil || s.store == nil || session == nil || isTerminalSessionStatus(session.Status) {
		return
	}
	nextStatus := SessionStatusReady
	if finalStatus == ToolActionStatusFailed {
		nextStatus = SessionStatusReady
	}
	previousStatus := session.Status
	if previousStatus == nextStatus {
		return
	}
	session.Status = nextStatus
	session.CompletedAt = nil
	session.UpdatedAt = changedAt
	_ = s.store.UpsertSession(ctx, session)
	if task := loadTaskOrNil(ctx, s.store, session.TaskID); task != nil {
		task.LatestSessionID = session.SessionID
		task.Status = TaskStatusInProgress
		task.UpdatedAt = changedAt
		_ = s.store.UpsertTask(ctx, task)
	}
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("session.status.changed"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"previousStatus": previousStatus,
			"status":         session.Status,
			"proposalId":     normalizeStringOrDefault(proposal.ProposalID, ""),
			"toolActionId":   toolActionID,
		}),
		Timestamp: changedAt,
	})
}

func readStringFromJSONRaw(raw json.RawMessage, key string) string {
	return normalizedInterfaceString(parseRawJSONObject(raw)[key])
}

func readRawResponseFromJSONRaw(raw json.RawMessage) json.RawMessage {
	value := parseRawJSONObject(raw)["rawResponse"]
	switch typed := value.(type) {
	case json.RawMessage:
		return typed
	case []byte:
		return json.RawMessage(typed)
	case string:
		return json.RawMessage(typed)
	case nil:
		return nil
	default:
		return mustMarshalJSON(typed)
	}
}

func isSessionAwaitingToolProposalReview(ctx context.Context, store RunStore, sessionID string) bool {
	if store == nil || strings.TrimSpace(sessionID) == "" {
		return false
	}
	events, err := store.ListSessionEvents(ctx, SessionEventListQuery{
		SessionID: sessionID,
		Limit:     1000,
	})
	if err != nil {
		return false
	}
	proposals := map[string]bool{}
	for _, event := range events {
		payload := parseSessionEventPayloadObject(event.Payload)
		switch event.EventType {
		case SessionEventType("tool_proposal.generated"):
			proposalID := normalizedInterfaceString(payload["proposalId"])
			if proposalID != "" {
				proposals[proposalID] = true
			}
		case SessionEventType("tool_proposal.decided"):
			proposalID := normalizedInterfaceString(payload["proposalId"])
			if proposalID != "" {
				delete(proposals, proposalID)
			}
		}
	}
	return len(proposals) > 0
}

func loadTaskOrNil(ctx context.Context, store RunStore, taskID string) *TaskRecord {
	if store == nil || strings.TrimSpace(taskID) == "" {
		return nil
	}
	task, err := store.GetTask(ctx, taskID)
	if err != nil && err != sql.ErrNoRows {
		return nil
	}
	return task
}
