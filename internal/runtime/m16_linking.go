package runtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func (s *APIServer) appendSessionEventBestEffort(ctx context.Context, event *SessionEventRecord) {
	if s == nil || s.store == nil || event == nil {
		return
	}
	_ = s.store.AppendSessionEvent(ctx, event)
}

func (s *APIServer) upsertApprovalCheckpointBestEffort(ctx context.Context, checkpoint *ApprovalCheckpointRecord) {
	if s == nil || s.store == nil || checkpoint == nil {
		return
	}
	_ = s.store.UpsertApprovalCheckpoint(ctx, checkpoint)
}

func (s *APIServer) upsertToolActionBestEffort(ctx context.Context, action *ToolActionRecord) {
	if s == nil || s.store == nil || action == nil {
		return
	}
	_ = s.store.UpsertToolAction(ctx, action)
}

func (s *APIServer) upsertEvidenceRecordBestEffort(ctx context.Context, record *EvidenceRecord) {
	if s == nil || s.store == nil || record == nil {
		return
	}
	_ = s.store.UpsertEvidenceRecord(ctx, record)
}

type invokeExecutionDescriptor struct {
	executionMode      string
	sessionType        string
	sessionSource      string
	workerType         string
	workerAdapterID    string
	workerSource       string
	workerCapabilities []string
	workerTargetEnv    string
	toolActionSource   string
	toolActionType     string
	evidenceKind       string
	outputSummary      string
	startSummary       string
	completedSummary   string
	failedSummary      string
}

func normalizedAgentInvokeExecutionMode(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case AgentInvokeExecutionModeManagedCodexWorker:
		return AgentInvokeExecutionModeManagedCodexWorker
	default:
		return AgentInvokeExecutionModeRawModelInvoke
	}
}

func invokeExecutionDescriptorForRequest(req *AgentInvokeRequest) invokeExecutionDescriptor {
	mode := normalizedAgentInvokeExecutionMode(req.ExecutionMode)
	if mode == AgentInvokeExecutionModeManagedCodexWorker {
		return invokeExecutionDescriptor{
			executionMode:      mode,
			sessionType:        "managed_agent_turn",
			sessionSource:      "v1alpha2.runtime.workers.codex_bridge",
			workerType:         "managed_agent",
			workerAdapterID:    "codex",
			workerSource:       "v1alpha2.runtime.workers.codex_bridge",
			workerCapabilities: []string{"agent_turn", "tool_proposal", "approval_checkpoint", "evidence_capture"},
			workerTargetEnv:    "codex",
			toolActionSource:   "v1alpha2.runtime.workers.codex_bridge",
			toolActionType:     "managed_agent_turn",
			evidenceKind:       "managed_worker_output",
			outputSummary:      "Managed Codex worker bridge emitted governed output text.",
			startSummary:       "Managed Codex worker accepted the governed turn and started processing.",
			completedSummary:   "Managed Codex worker completed the governed turn.",
			failedSummary:      "Managed Codex worker failed while processing the governed turn.",
		}
	}
	return invokeExecutionDescriptor{
		executionMode:      AgentInvokeExecutionModeRawModelInvoke,
		sessionType:        "model_invoke",
		sessionSource:      "v1alpha1.runtime.integrations.invoke",
		workerType:         "model_invoke",
		workerAdapterID:    normalizeStringOrDefault(req.AgentProfileID, "default"),
		workerSource:       "v1alpha1.runtime.integrations.invoke",
		workerCapabilities: []string{"model_invoke"},
		workerTargetEnv:    "agentops-desktop",
		toolActionSource:   "v1alpha1.runtime.integrations.invoke",
		toolActionType:     "model_invoke",
		evidenceKind:       "tool_output",
		outputSummary:      "Model invocation produced output text.",
		startSummary:       "Model invocation started through the runtime route.",
		completedSummary:   "Model invocation completed.",
		failedSummary:      "Model invocation failed.",
	}
}

func (s *APIServer) ensureInvokeSession(ctx context.Context, req *AgentInvokeRequest, now time.Time) (*TaskRecord, *SessionRecord, error) {
	if s == nil || s.store == nil || req == nil {
		return nil, nil, fmt.Errorf("api server and request are required")
	}
	descriptor := invokeExecutionDescriptorForRequest(req)
	req.Meta.RequestID = normalizeRequestID(req.Meta.RequestID, "invoke", now)
	sessionID := "invoke-" + sanitizeIDFragment(req.Meta.RequestID)
	taskID := strings.TrimSpace(req.TaskID)
	if taskID == "" {
		taskID = "invoke-task-" + sanitizeIDFragment(req.Meta.RequestID)
	}

	task, err := s.store.GetTask(ctx, taskID)
	if err != nil && err != sql.ErrNoRows {
		return nil, nil, err
	}
	if task == nil && strings.TrimSpace(req.TaskID) != "" {
		return nil, nil, fmt.Errorf("task %q not found", taskID)
	}
	if task == nil {
		annotations := map[string]interface{}{
			"agentProfileId": strings.TrimSpace(req.AgentProfileID),
			"systemPrompt":   strings.TrimSpace(req.SystemPrompt),
			"executionMode":  descriptor.executionMode,
		}
		if len(req.GovernanceContext) > 0 {
			annotations["governanceContext"] = req.GovernanceContext
		}
		task = &TaskRecord{
			TaskID:      taskID,
			RequestID:   req.Meta.RequestID,
			TenantID:    req.Meta.TenantID,
			ProjectID:   req.Meta.ProjectID,
			Source:      descriptor.sessionSource,
			Title:       "Integration invoke: " + normalizeStringOrDefault(req.AgentProfileID, "default"),
			Intent:      strings.TrimSpace(req.Prompt),
			RequestedBy: mustMarshalJSONObject(req.Meta.Actor, nil),
			Status:      TaskStatusInProgress,
			CreatedAt:   now,
			UpdatedAt:   now,
			Annotations: mustMarshalJSON(annotations),
		}
	} else {
		if task.TenantID != req.Meta.TenantID || task.ProjectID != req.Meta.ProjectID {
			return nil, nil, fmt.Errorf("task %q scope does not match invoke scope", taskID)
		}
		task.Status = TaskStatusInProgress
		task.UpdatedAt = now
	}
	task.LatestSessionID = sessionID
	if err := s.store.UpsertTask(ctx, task); err != nil {
		return nil, nil, err
	}

	session, err := s.store.GetSession(ctx, sessionID)
	if err != nil && err != sql.ErrNoRows {
		return nil, nil, err
	}
	newSession := false
	if session == nil {
		newSession = true
		summary := map[string]interface{}{
			"agentProfileId":  strings.TrimSpace(req.AgentProfileID),
			"maxOutputTokens": req.MaxOutputTokens,
			"executionMode":   descriptor.executionMode,
		}
		if len(req.GovernanceContext) > 0 {
			summary["governanceContext"] = req.GovernanceContext
		}
		session = &SessionRecord{
			SessionID:   sessionID,
			TaskID:      taskID,
			RequestID:   req.Meta.RequestID,
			TenantID:    req.Meta.TenantID,
			ProjectID:   req.Meta.ProjectID,
			SessionType: descriptor.sessionType,
			Status:      SessionStatusRunning,
			Source:      descriptor.sessionSource,
			Summary:     mustMarshalJSON(summary),
			CreatedAt:   now,
			StartedAt:   now,
			UpdatedAt:   now,
		}
	} else {
		session.SessionType = descriptor.sessionType
		session.Source = descriptor.sessionSource
		session.Status = SessionStatusRunning
		summary := parseRawJSONObject(session.Summary)
		summary["agentProfileId"] = strings.TrimSpace(req.AgentProfileID)
		summary["maxOutputTokens"] = req.MaxOutputTokens
		summary["executionMode"] = descriptor.executionMode
		if len(req.GovernanceContext) > 0 {
			summary["governanceContext"] = req.GovernanceContext
		}
		session.Summary = mustMarshalJSON(summary)
		session.UpdatedAt = now
	}
	if err := s.store.UpsertSession(ctx, session); err != nil {
		return nil, nil, err
	}
	if newSession {
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.created"),
			Payload:   mustMarshalJSON(map[string]interface{}{"taskId": task.TaskID, "sessionType": session.SessionType}),
			Timestamp: now,
		})
	}
	return task, session, nil
}

func (s *APIServer) ensureInvokeWorker(ctx context.Context, session *SessionRecord, req *AgentInvokeRequest, now time.Time) (*SessionWorkerRecord, error) {
	if s == nil || s.store == nil || session == nil || req == nil {
		return nil, fmt.Errorf("store, session, and request are required")
	}
	descriptor := invokeExecutionDescriptorForRequest(req)
	workerID := fmt.Sprintf("%s-worker-%s", session.SessionID, sanitizeIDFragment(descriptor.workerAdapterID))
	worker := &SessionWorkerRecord{
		WorkerID:          workerID,
		SessionID:         session.SessionID,
		TaskID:            session.TaskID,
		TenantID:          session.TenantID,
		ProjectID:         session.ProjectID,
		WorkerType:        descriptor.workerType,
		AdapterID:         descriptor.workerAdapterID,
		Status:            WorkerStatusRunning,
		Source:            descriptor.workerSource,
		Capabilities:      append([]string(nil), descriptor.workerCapabilities...),
		Routing:           "runtime",
		AgentProfileID:    strings.TrimSpace(req.AgentProfileID),
		TargetEnvironment: descriptor.workerTargetEnv,
		Annotations: mustMarshalJSON(map[string]interface{}{
			"executionMode": descriptor.executionMode,
			"bridgeAdapter": descriptor.workerAdapterID,
		}),
		CreatedAt: now,
		UpdatedAt: now,
	}
	session.SelectedWorkerID = workerID
	session.UpdatedAt = now
	if err := s.store.UpsertSession(sessionContextOrBackground(ctx), session); err != nil {
		return nil, err
	}
	if err := s.store.UpsertSessionWorker(ctx, worker); err != nil {
		return nil, err
	}
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.attached"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"workerId":       worker.WorkerID,
			"workerType":     worker.WorkerType,
			"adapterId":      worker.AdapterID,
			"agentProfileId": worker.AgentProfileID,
			"status":         worker.Status,
			"executionMode":  descriptor.executionMode,
		}),
		Timestamp: now,
	})
	if descriptor.executionMode == AgentInvokeExecutionModeManagedCodexWorker {
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("worker.bridge.started"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"workerId":      worker.WorkerID,
				"workerType":    worker.WorkerType,
				"adapterId":     worker.AdapterID,
				"executionMode": descriptor.executionMode,
				"summary":       "Managed Codex worker bridge attached to the session.",
			}),
			Timestamp: now,
		})
	}
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.status.changed"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"workerId":      worker.WorkerID,
			"status":        worker.Status,
			"executionMode": descriptor.executionMode,
		}),
		Timestamp: now,
	})
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.progress"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"workerId":      worker.WorkerID,
			"status":        worker.Status,
			"executionMode": descriptor.executionMode,
			"summary":       descriptor.startSummary,
			"payload": map[string]interface{}{
				"stage":   "started",
				"percent": 10,
			},
		}),
		Timestamp: now,
	})
	return worker, nil
}

func (s *APIServer) markInvokeSessionResult(ctx context.Context, task *TaskRecord, session *SessionRecord, response *AgentInvokeResponse, invokeErr error, now time.Time) {
	if task == nil || session == nil {
		return
	}
	if response == nil {
		response = &AgentInvokeResponse{}
	}
	previousStatus := session.Status
	req := &AgentInvokeRequest{
		AgentProfileID: response.AgentProfileID,
		ExecutionMode:  response.ExecutionMode,
	}
	descriptor := invokeExecutionDescriptorForRequest(req)
	pendingToolProposalReview := false
	autoGovernedProposalCount := 0
	if invokeErr == nil && descriptor.executionMode == AgentInvokeExecutionModeManagedCodexWorker {
		for _, proposal := range response.ToolProposals {
			if strings.EqualFold(normalizedInterfaceString(proposal["type"]), governedActionProposalType) &&
				!normalizedInterfaceBool(proposal["operatorApprovalRequired"]) {
				autoGovernedProposalCount++
				continue
			}
			pendingToolProposalReview = true
		}
	}
	if invokeErr != nil {
		task.Status = TaskStatusFailed
		session.Status = SessionStatusFailed
		session.CompletedAt = &now
	} else if pendingToolProposalReview {
		task.Status = TaskStatusInProgress
		session.Status = SessionStatusAwaitingApproval
		session.CompletedAt = nil
	} else if autoGovernedProposalCount > 0 {
		task.Status = TaskStatusInProgress
		session.Status = SessionStatusRunning
		session.CompletedAt = nil
	} else {
		task.Status = TaskStatusCompleted
		session.Status = SessionStatusCompleted
		session.CompletedAt = &now
	}
	task.UpdatedAt = now
	session.UpdatedAt = now
	_ = s.store.UpsertTask(ctx, task)
	_ = s.store.UpsertSession(ctx, session)
	workerID := strings.TrimSpace(session.SelectedWorkerID)
	if workerID == "" {
		workerID = fmt.Sprintf("%s-worker-%s", session.SessionID, sanitizeIDFragment(descriptor.workerAdapterID))
	}

	payload := map[string]interface{}{
		"toolType":        descriptor.toolActionType,
		"requestId":       task.RequestID,
		"agentProfileId":  response.AgentProfileID,
		"executionMode":   descriptor.executionMode,
		"workerType":      descriptor.workerType,
		"workerAdapterId": descriptor.workerAdapterID,
	}
	toolActionID := invokeSessionToolActionID(session.SessionID, descriptor.toolActionType, response.RequestID)
	existingAction, _ := s.findSessionToolActionByID(ctx, session.SessionID, toolActionID)
	requestPayload := mustMarshalJSON(map[string]interface{}{
		"requestId":      task.RequestID,
		"agentProfileId": response.AgentProfileID,
		"executionMode":  descriptor.executionMode,
		"prompt":         task.Intent,
	})
	createdAt := now
	if startedAt := strings.TrimSpace(response.StartedAt); startedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, startedAt); err == nil {
			createdAt = parsed.UTC()
		}
	}
	if existingAction != nil {
		if len(existingAction.RequestPayload) > 0 {
			requestPayload = existingAction.RequestPayload
		}
		if !existingAction.CreatedAt.IsZero() {
			createdAt = existingAction.CreatedAt
		}
	}
	toolAction := &ToolActionRecord{
		ToolActionID:   toolActionID,
		SessionID:      session.SessionID,
		WorkerID:       workerID,
		TenantID:       session.TenantID,
		ProjectID:      session.ProjectID,
		ToolType:       descriptor.toolActionType,
		Status:         ToolActionStatusCompleted,
		Source:         descriptor.toolActionSource,
		RequestPayload: requestPayload,
		CreatedAt:      createdAt,
		UpdatedAt:      now,
	}
	eventType := SessionEventType("tool_action.completed")
	workerStatus := WorkerStatusCompleted
	if invokeErr != nil {
		eventType = SessionEventType("tool_action.failed")
		workerStatus = WorkerStatusFailed
		payload["error"] = invokeErr.Error()
		toolAction.Status = ToolActionStatusFailed
		toolAction.ResultPayload = mustMarshalJSON(map[string]interface{}{
			"error": invokeErr.Error(),
		})
	} else {
		payload["provider"] = response.Provider
		payload["transport"] = response.Transport
		payload["model"] = response.Model
		payload["route"] = response.Route
		payload["finishReason"] = response.FinishReason
		payload["summary"] = descriptor.completedSummary
		if pendingToolProposalReview {
			workerStatus = WorkerStatusWaiting
			payload["summary"] = "Managed Codex worker completed the turn and is waiting for governed tool proposal review."
		} else if autoGovernedProposalCount > 0 {
			workerStatus = WorkerStatusRunning
			payload["summary"] = "Managed Codex worker completed the turn and auto-routed governed action proposals through the runtime policy boundary."
		}
		toolAction.ResultPayload = mustMarshalJSON(map[string]interface{}{
			"provider":           response.Provider,
			"transport":          response.Transport,
			"model":              response.Model,
			"route":              response.Route,
			"endpointRef":        response.EndpointRef,
			"credentialRef":      response.CredentialRef,
			"boundaryProviderId": response.BoundaryProviderID,
			"boundaryBaseUrl":    response.BoundaryBaseURL,
			"finishReason":       response.FinishReason,
			"outputText":         response.OutputText,
			"workerOutputChunks": append([]string(nil), response.WorkerOutputChunks...),
			"toolProposals":      append([]JSONObject(nil), response.ToolProposals...),
			"usage":              response.Usage,
			"executionMode":      descriptor.executionMode,
			"rawResponse":        json.RawMessage(jsonBytesOrEmptyObject(response.RawResponse)),
		})
	}
	s.upsertSessionWorkerBestEffort(ctx, &SessionWorkerRecord{
		WorkerID:          workerID,
		SessionID:         session.SessionID,
		TaskID:            session.TaskID,
		TenantID:          session.TenantID,
		ProjectID:         session.ProjectID,
		WorkerType:        descriptor.workerType,
		AdapterID:         descriptor.workerAdapterID,
		Status:            workerStatus,
		Source:            descriptor.workerSource,
		Capabilities:      append([]string(nil), descriptor.workerCapabilities...),
		Routing:           normalizeStringOrDefault(response.Route, "runtime"),
		AgentProfileID:    response.AgentProfileID,
		Provider:          response.Provider,
		Transport:         response.Transport,
		Model:             response.Model,
		TargetEnvironment: descriptor.workerTargetEnv,
		Annotations: mustMarshalJSON(map[string]interface{}{
			"executionMode":      descriptor.executionMode,
			"bridgeAdapter":      descriptor.workerAdapterID,
			"endpointRef":        response.EndpointRef,
			"credentialRef":      response.CredentialRef,
			"boundaryProviderId": response.BoundaryProviderID,
			"boundaryBaseUrl":    response.BoundaryBaseURL,
		}),
		CreatedAt: session.CreatedAt,
		UpdatedAt: now,
	})
	s.upsertToolActionBestEffort(ctx, toolAction)
	progressStage := "completed"
	progressSummary := descriptor.completedSummary
	autoGovernedProposals := make([]*sessionToolProposal, 0, autoGovernedProposalCount)
	if invokeErr == nil {
		outputChunks := append([]string(nil), response.WorkerOutputChunks...)
		if len(outputChunks) == 0 {
			if text := strings.TrimSpace(response.OutputText); text != "" {
				outputChunks = []string{text}
			}
		}
		evidenceID := fmt.Sprintf("%s-evidence", toolAction.ToolActionID)
		s.upsertEvidenceRecordBestEffort(ctx, &EvidenceRecord{
			EvidenceID:   evidenceID,
			SessionID:    session.SessionID,
			ToolActionID: toolAction.ToolActionID,
			TenantID:     session.TenantID,
			ProjectID:    session.ProjectID,
			Kind:         descriptor.evidenceKind,
			Metadata: mustMarshalJSON(map[string]interface{}{
				"provider":           response.Provider,
				"transport":          response.Transport,
				"model":              response.Model,
				"route":              response.Route,
				"endpointRef":        response.EndpointRef,
				"credentialRef":      response.CredentialRef,
				"boundaryProviderId": response.BoundaryProviderID,
				"boundaryBaseUrl":    response.BoundaryBaseURL,
				"finishReason":       response.FinishReason,
				"requestId":          response.RequestID,
				"chunkCount":         len(outputChunks),
				"toolProposalCount":  len(response.ToolProposals),
			}),
			CreatedAt: now,
			UpdatedAt: now,
		})
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("evidence.recorded"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"evidenceId":   evidenceID,
				"toolActionId": toolAction.ToolActionID,
				"kind":         descriptor.evidenceKind,
				"requestId":    response.RequestID,
			}),
			Timestamp: now,
		})
		for idx, chunk := range outputChunks {
			if strings.TrimSpace(chunk) == "" {
				continue
			}
			s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
				SessionID: session.SessionID,
				EventType: SessionEventType("worker.output.delta"),
				Payload: mustMarshalJSON(map[string]interface{}{
					"workerId":      workerID,
					"summary":       descriptor.outputSummary,
					"executionMode": descriptor.executionMode,
					"payload": map[string]interface{}{
						"delta":      chunk,
						"chunkIndex": idx + 1,
						"chunkCount": len(outputChunks),
					},
				}),
				Timestamp: now,
			})
		}
		for idx, proposal := range response.ToolProposals {
			proposalID := strings.TrimSpace(fmt.Sprintf("%v", proposal["proposalId"]))
			if proposalID == "" || proposalID == "<nil>" {
				proposalID = fmt.Sprintf("proposal-%d", now.UnixNano())
			}
			proposalID = fmt.Sprintf("%s-%s", sanitizeIDFragment(normalizeStringOrDefault(response.RequestID, task.RequestID)), sanitizeIDFragment(proposalID))
			proposalType := strings.TrimSpace(fmt.Sprintf("%v", proposal["type"]))
			if proposalType == "" || proposalType == "<nil>" {
				proposalType = "tool_proposal"
			}
			proposalSummary := strings.TrimSpace(fmt.Sprintf("%v", proposal["summary"]))
			if proposalSummary == "" || proposalSummary == "<nil>" {
				proposalSummary = "Managed worker proposed a governed tool action."
			}
			proposalPayload := copyJSONObject(proposal)
			proposalPayload["proposalId"] = proposalID
			proposalPayload["proposalType"] = normalizeStringOrDefault(proposalType, "tool_proposal")
			response.ToolProposals[idx] = proposalPayload
			s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
				SessionID: session.SessionID,
				EventType: SessionEventType("tool_proposal.generated"),
				Payload: mustMarshalJSON(map[string]interface{}{
					"workerId":      workerID,
					"proposalId":    proposalID,
					"proposalType":  proposalType,
					"summary":       proposalSummary,
					"executionMode": descriptor.executionMode,
					"payload":       proposalPayload,
				}),
				Timestamp: now,
			})
			if strings.EqualFold(proposalType, governedActionProposalType) && !normalizedInterfaceBool(proposalPayload["operatorApprovalRequired"]) {
				autoGovernedProposals = append(autoGovernedProposals, &sessionToolProposal{
					ProposalID:   proposalID,
					ProposalType: normalizeStringOrDefault(proposalType, governedActionProposalType),
					Summary:      proposalSummary,
					WorkerID:     workerID,
					Payload:      proposalPayload,
					Status:       "PENDING",
				})
			}
		}
	} else {
		progressStage = "failed"
		progressSummary = descriptor.failedSummary
	}
	if pendingToolProposalReview {
		progressStage = "awaiting_tool_review"
		progressSummary = "Managed Codex worker is waiting for governed tool proposal review."
	} else if autoGovernedProposalCount > 0 {
		progressStage = "policy_first_governed_action"
		progressSummary = "Managed Codex worker is routing governed action proposals directly into the runtime policy boundary."
	}
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.status.changed"),
		Payload: mustMarshalJSON(map[string]interface{}{
			"workerId":      workerID,
			"status":        workerStatus,
			"route":         response.Route,
			"executionMode": descriptor.executionMode,
		}),
		Timestamp: now,
	})
	workerProgressPayload := map[string]interface{}{
		"workerId":      workerID,
		"status":        workerStatus,
		"executionMode": descriptor.executionMode,
		"summary":       progressSummary,
		"payload": map[string]interface{}{
			"stage":   progressStage,
			"percent": 100,
		},
	}
	if invokeErr != nil {
		workerProgressPayload["payload"].(map[string]interface{})["error"] = invokeErr.Error()
	}
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: SessionEventType("worker.progress"),
		Payload:   mustMarshalJSON(workerProgressPayload),
		Timestamp: now,
	})
	s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
		SessionID: session.SessionID,
		EventType: eventType,
		Payload:   mustMarshalJSON(payload),
		Timestamp: now,
	})
	if previousStatus != session.Status {
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: SessionEventType("session.status.changed"),
			Payload: mustMarshalJSON(map[string]interface{}{
				"previousStatus": previousStatus,
				"status":         session.Status,
			}),
			Timestamp: now,
		})
	}
	if terminalEventType := sessionTerminalEventType(session.Status); terminalEventType != "" {
		s.appendSessionEventBestEffort(ctx, &SessionEventRecord{
			SessionID: session.SessionID,
			EventType: terminalEventType,
			Payload: mustMarshalJSON(map[string]interface{}{
				"status": session.Status,
				"route":  response.Route,
			}),
			Timestamp: now,
		})
	}
	for _, proposal := range autoGovernedProposals {
		s.autoExecuteGovernedActionProposal(ctx, session, proposal, now)
	}
}

func (s *APIServer) upsertSessionWorkerBestEffort(ctx context.Context, worker *SessionWorkerRecord) {
	if s == nil || s.store == nil || worker == nil {
		return
	}
	_ = s.store.UpsertSessionWorker(ctx, worker)
}

func sessionContextOrBackground(ctx context.Context) context.Context {
	if ctx != nil {
		return ctx
	}
	return context.Background()
}

func sanitizeIDFragment(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return "unknown"
	}
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "unknown"
	}
	return out
}
