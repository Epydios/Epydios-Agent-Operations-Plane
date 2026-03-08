function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function safeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultThreadTitle(agentProfileId) {
  const label = normalizedString(agentProfileId, "agent");
  return `Operator thread: ${label}`;
}

function normalizeExecutionMode(value) {
  return normalizedString(value).toLowerCase() === "managed_codex_worker"
    ? "managed_codex_worker"
    : "raw_model_invoke";
}

function executionModeFromWorker(selectedWorker = {}, fallback = "") {
  const workerType = normalizedString(selectedWorker?.workerType).toLowerCase();
  const adapterId = normalizedString(selectedWorker?.adapterId).toLowerCase();
  if (workerType === "managed_agent" && adapterId === "codex") {
    return "managed_codex_worker";
  }
  return normalizeExecutionMode(fallback);
}

function latestKnownSessionSequence(sessionView) {
  const timelineSequence = Number(sessionView?.timeline?.latestEventSequence || 0) || 0;
  const streamSequence = (Array.isArray(sessionView?.streamItems) ? sessionView.streamItems : []).reduce(
    (maxValue, item) => Math.max(maxValue, Number(item?.sequence || 0) || 0),
    0
  );
  return Math.max(timelineSequence, streamSequence);
}

function sessionIdForTurn(turn) {
  return normalizedString(turn?.sessionView?.timeline?.session?.sessionId, normalizedString(turn?.response?.sessionId));
}

function isTerminalSessionStatus(value) {
  const status = normalizedString(value).toUpperCase();
  return (
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "BLOCKED" ||
    status === "CANCELLED"
  );
}

function isTerminalTaskStatus(value) {
  const status = normalizedString(value).toUpperCase();
  return (
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "BLOCKED" ||
    status === "CANCELLED"
  );
}

function sortIsoAscending(a, b) {
  return new Date(a || 0).getTime() - new Date(b || 0).getTime();
}

function clipText(value, maxLength = 220) {
  const text = normalizedString(value);
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function eventPayloadObject(item) {
  return item?.payload && typeof item.payload === "object" ? item.payload : {};
}

function nestedEventPayload(payload = {}) {
  return payload?.payload && typeof payload.payload === "object" ? payload.payload : {};
}

function eventTone(eventType, payload = {}) {
  const type = normalizedString(eventType).toLowerCase();
  const severity = normalizedString(payload?.severity).toLowerCase();
  const status = normalizedString(payload?.status).toUpperCase();
  if (severity === "error" || type.endsWith(".failed") || type.endsWith(".blocked") || status === "FAILED" || status === "BLOCKED") {
    return "danger";
  }
  if (severity === "warn" || severity === "warning" || type.includes("approval") || status === "AWAITING_APPROVAL" || status === "AWAITING_WORKER") {
    return "warn";
  }
  if (type === "worker.heartbeat") {
    return "neutral";
  }
  if (type === "tool_proposal.generated") {
    return "warn";
  }
  if (type === "tool_proposal.decided") {
    return status === "DENIED" ? "warn" : "ok";
  }
  if (type.endsWith(".completed") || type.endsWith(".recorded") || type === "worker.output.delta" || status === "COMPLETED" || status === "READY" || status === "RUNNING") {
    return "ok";
  }
  return "neutral";
}

function summarizeEventLabel(eventType) {
  const type = normalizedString(eventType).toLowerCase();
  if (type === "worker.bridge.started") {
    return "Worker Bridge";
  }
  if (type === "worker.output.delta") {
    return "Worker Output";
  }
  if (type === "worker.progress") {
    return "Worker Progress";
  }
  if (type === "worker.heartbeat") {
    return "Worker Heartbeat";
  }
  if (type === "worker.status.changed") {
    return "Worker Status";
  }
  if (type === "tool_proposal.generated") {
    return "Tool Proposal";
  }
  if (type === "tool_proposal.decided") {
    return "Proposal Decision";
  }
  if (type.startsWith("tool_action.")) {
    return "Tool Action";
  }
  if (type === "approval.requested") {
    return "Approval Requested";
  }
  if (type === "approval.status.changed") {
    return "Approval Decision";
  }
  if (type === "evidence.recorded") {
    return "Evidence Recorded";
  }
  if (type === "session.status.changed") {
    return "Session Status";
  }
  if (type === "session.completed") {
    return "Session Completed";
  }
  if (type === "session.failed") {
    return "Session Failed";
  }
  if (type === "session.cancelled") {
    return "Session Cancelled";
  }
  if (type === "session.blocked") {
    return "Session Blocked";
  }
  if (type === "worker.attached") {
    return "Worker Attached";
  }
  return normalizedString(eventType, "Session Event");
}

function summarizeEventDetail(item) {
  const payload = eventPayloadObject(item);
  const nested = nestedEventPayload(payload);
  const type = normalizedString(item?.eventType).toLowerCase();
  if (type === "worker.bridge.started") {
    return clipText(
      normalizedString(payload?.summary, "Managed worker bridge attached."),
      220
    );
  }
  if (type === "worker.output.delta") {
    return clipText(
      normalizedString(nested?.delta, normalizedString(payload?.summary, normalizedString(payload?.status, "Worker emitted output."))),
      320
    );
  }
  if (type === "worker.progress") {
    const stage = normalizedString(nested?.stage, normalizedString(payload?.stage));
    const percent = nested?.percent ?? payload?.percent;
    const progressLabel = [stage, Number.isFinite(Number(percent)) ? `${Number(percent)}%` : ""].filter(Boolean).join(" ");
    return clipText(
      normalizedString(payload?.summary, progressLabel || normalizedString(payload?.status, "Worker progress updated.")),
      220
    );
  }
  if (type === "worker.heartbeat") {
    return clipText(
      normalizedString(payload?.summary, "Worker heartbeat recorded."),
      220
    );
  }
  if (type === "worker.status.changed") {
    const workerStatus = normalizedString(payload?.status);
    return clipText(
      normalizedString(payload?.summary, workerStatus ? `Worker moved to ${workerStatus}.` : "Worker status changed."),
      220
    );
  }
  if (type === "tool_proposal.generated") {
    const proposalPayload = nestedEventPayload(payload);
    const command = normalizedString(proposalPayload?.command);
    return clipText(
      normalizedString(
        payload?.summary,
        command ? `Proposed command: ${command}` : normalizedString(payload?.proposalType, "Tool proposal generated.")
      ),
      320
    );
  }
  if (type === "tool_proposal.decided") {
    const decision = normalizedString(payload?.decision, normalizedString(payload?.status, "DECIDED"));
    const reason = normalizedString(payload?.reason);
    return clipText(reason ? `${decision}: ${reason}` : decision, 220);
  }
  if (type.startsWith("tool_action.")) {
    const toolType = normalizedString(payload?.toolType, normalizedString(payload?.tool_action_id));
    const summary = normalizedString(payload?.summary);
    return clipText(summary || [toolType, normalizedString(payload?.status)].filter(Boolean).join(" "), 220);
  }
  if (type === "approval.requested") {
    return clipText(
      normalizedString(payload?.reason, normalizedString(payload?.scope, "Approval checkpoint requested.")),
      220
    );
  }
  if (type === "approval.status.changed") {
    const decision = normalizedString(payload?.decision, normalizedString(payload?.status));
    const reason = normalizedString(payload?.reason);
    return clipText(reason ? `${decision}: ${reason}` : decision || "Approval checkpoint changed.", 220);
  }
  if (type === "evidence.recorded") {
    return clipText(
      normalizedString(payload?.kind, normalizedString(payload?.evidenceId, "Evidence captured for the session.")),
      220
    );
  }
  if (type === "session.status.changed") {
    return clipText(
      normalizedString(payload?.reason, normalizedString(payload?.status, "Session status changed.")),
      220
    );
  }
  return clipText(
    normalizedString(payload?.summary, normalizedString(payload?.status, normalizedString(payload?.kind, "Event recorded."))),
    220
  );
}

export function listNativeSessionEvents(sessionView = {}) {
  const timelineEvents = Array.isArray(sessionView?.timeline?.events) ? sessionView.timeline.events : [];
  const streamItems = Array.isArray(sessionView?.streamItems) ? sessionView.streamItems : [];
  const merged = new Map();
  [...timelineEvents, ...streamItems].forEach((item) => {
    const sequence = Number(item?.sequence || 0) || 0;
    const key = normalizedString(item?.eventId, sequence > 0 ? `sequence:${sequence}` : JSON.stringify(item || {}));
    merged.set(key, item);
  });
  return Array.from(merged.values()).sort((a, b) => {
    const aSeq = Number(a?.sequence || 0) || 0;
    const bSeq = Number(b?.sequence || 0) || 0;
    if (aSeq !== bSeq) {
      return aSeq - bSeq;
    }
    return sortIsoAscending(a?.timestamp, b?.timestamp);
  });
}

export function buildNativeSessionActivitySummary(sessionView = {}) {
  const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
  const session = timeline?.session && typeof timeline.session === "object" ? timeline.session : {};
  const task = timeline?.task && typeof timeline.task === "object" ? timeline.task : {};
  const selectedWorker = timeline?.selectedWorker && typeof timeline.selectedWorker === "object" ? timeline.selectedWorker : {};
  const proposals = listNativeToolProposals(sessionView);
  const pendingToolProposalCount = proposals.filter((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length;
  const events = listNativeSessionEvents(sessionView);
  const semanticEvents = events.map((item) => {
    const payload = eventPayloadObject(item);
    return {
      sequence: Number(item?.sequence || 0) || 0,
      eventType: normalizedString(item?.eventType),
      timestamp: normalizedString(item?.timestamp),
      label: summarizeEventLabel(item?.eventType),
      detail: summarizeEventDetail(item),
      tone: eventTone(item?.eventType, payload),
      payload
    };
  });
  const latestWorkerEvent = [...semanticEvents].reverse().find((item) => item.eventType.startsWith("worker.") || item.eventType.startsWith("tool_action.") || item.eventType.startsWith("tool_proposal."));
  const latestWorkerStatusEvent = [...semanticEvents].reverse().find((item) => item.eventType === "worker.status.changed");
  const latestOutputEvent = [...semanticEvents].reverse().find((item) => item.eventType === "worker.output.delta");
  const taskStatus = normalizedString(task?.status).toUpperCase();
  const sessionStatus = normalizedString(session?.status).toUpperCase();
  const resolutionStatus = taskStatus || sessionStatus;
  const isResolved = isTerminalTaskStatus(taskStatus) || isTerminalSessionStatus(sessionStatus);
  const resolutionMessage = !isResolved
    ? ""
    : resolutionStatus === "COMPLETED"
      ? `Latest session ${normalizedString(session?.sessionId, "session")} completed. Start a follow-up thread for clean separation, or send another turn only if you intentionally want to reopen this task.`
      : resolutionStatus === "FAILED"
        ? `Latest session ${normalizedString(session?.sessionId, "session")} failed and the thread is resolved. Review worker output and evidence before starting a follow-up thread or reopening the task.`
        : resolutionStatus === "BLOCKED"
          ? `Latest session ${normalizedString(session?.sessionId, "session")} is blocked and the thread is resolved. Review the denial reason and only reopen the task if policy allows it.`
          : `Latest session ${normalizedString(session?.sessionId, "session")} is closed. Use a follow-up thread for a fresh governed task, or reopen this one intentionally with another turn.`;

  return {
    taskStatus,
    sessionStatus,
    selectedWorkerId: normalizedString(selectedWorker?.workerId),
    selectedWorkerType: normalizedString(selectedWorker?.workerType),
    selectedWorkerAdapterId: normalizedString(selectedWorker?.adapterId),
    selectedWorkerSource: normalizedString(selectedWorker?.source),
    selectedWorkerTargetEnvironment: normalizedString(selectedWorker?.targetEnvironment),
    executionMode: executionModeFromWorker(selectedWorker),
    selectedWorkerStatus: normalizedString(selectedWorker?.status).toUpperCase(),
    latestWorkerStatus: normalizedString(
      latestWorkerStatusEvent?.payload?.status,
      normalizedString(selectedWorker?.status, sessionStatus)
    ).toUpperCase(),
    latestWorkerSummary: normalizedString(
      latestWorkerEvent?.detail,
      normalizedString(latestWorkerEvent?.payload?.summary)
    ),
    latestOutputText: normalizedString(
      latestOutputEvent?.payload?.payload?.delta,
      normalizedString(latestOutputEvent?.detail)
    ),
    progressItems: semanticEvents.filter((item) => item.eventType.startsWith("worker.") || item.eventType.startsWith("tool_action.") || item.eventType.startsWith("tool_proposal.") || item.eventType.startsWith("session.") || item.eventType.startsWith("approval.")).slice(-8),
    semanticEvents,
    eventCount: semanticEvents.length,
    openApprovalCount: Number(timeline?.openApprovalCount || 0) || 0,
    pendingToolProposalCount,
    evidenceCount: Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords.length : 0,
    toolActionCount: Array.isArray(timeline?.toolActions) ? timeline.toolActions.length : 0,
    isResolved,
    resolutionStatus,
    resolutionMessage
  };
}

export function latestManagedWorkerTranscript(sessionView = {}) {
  const toolActions = Array.isArray(sessionView?.timeline?.toolActions) ? sessionView.timeline.toolActions : [];
  const managedTurn = [...toolActions]
    .reverse()
    .find((item) => normalizedString(item?.toolType).toLowerCase() === "managed_agent_turn");
  if (!managedTurn?.resultPayload || typeof managedTurn.resultPayload !== "object") {
    return null;
  }
  const rawResponse = managedTurn.resultPayload?.rawResponse;
  if (!rawResponse) {
    return null;
  }
  try {
    return {
      toolActionId: normalizedString(managedTurn?.toolActionId),
      pretty: JSON.stringify(rawResponse, null, 2),
      eventCount: Array.isArray(rawResponse) ? rawResponse.length : 0
    };
  } catch (_error) {
    return {
      toolActionId: normalizedString(managedTurn?.toolActionId),
      pretty: String(rawResponse),
      eventCount: 0
    };
  }
}

export function listNativeToolProposals(sessionView = {}) {
  const proposals = new Map();
  const toolActionsById = new Map(
    (Array.isArray(sessionView?.timeline?.toolActions) ? sessionView.timeline.toolActions : [])
      .filter((item) => item && typeof item === "object")
      .map((item) => [normalizedString(item?.toolActionId), item])
      .filter(([toolActionId]) => Boolean(toolActionId))
  );
  listNativeSessionEvents(sessionView).forEach((item) => {
    const payload = eventPayloadObject(item);
    if (item?.eventType === "tool_proposal.generated") {
      const proposalId = normalizedString(payload?.proposalId);
      if (!proposalId) {
        return;
      }
      const proposalPayload = nestedEventPayload(payload);
      proposals.set(proposalId, {
        proposalId,
        sessionId: normalizedString(item?.sessionId, normalizedString(sessionView?.timeline?.session?.sessionId)),
        workerId: normalizedString(payload?.workerId),
        proposalType: normalizedString(payload?.proposalType),
        summary: normalizedString(payload?.summary),
        command: normalizedString(proposalPayload?.command),
        confidence: normalizedString(proposalPayload?.confidence),
        decision: "",
        status: "PENDING",
        reason: "",
        toolActionId: "",
        reviewedAt: "",
        generatedAt: normalizedString(item?.timestamp),
        sequence: Number(item?.sequence || 0) || 0,
        payload: proposalPayload
      });
      return;
    }
    if (item?.eventType === "tool_proposal.decided") {
      const proposalId = normalizedString(payload?.proposalId);
      if (!proposalId) {
        return;
      }
      const existing = proposals.get(proposalId) || {
        proposalId,
        sessionId: normalizedString(item?.sessionId, normalizedString(sessionView?.timeline?.session?.sessionId)),
        workerId: normalizedString(payload?.workerId),
        proposalType: normalizedString(payload?.proposalType),
        summary: normalizedString(payload?.summary),
        command: "",
        confidence: "",
        generatedAt: "",
        sequence: Number(item?.sequence || 0) || 0,
        payload: {}
      };
      proposals.set(proposalId, {
        ...existing,
        workerId: normalizedString(payload?.workerId, existing.workerId),
        proposalType: normalizedString(payload?.proposalType, existing.proposalType),
        summary: normalizedString(payload?.summary, existing.summary),
        decision: normalizedString(payload?.decision),
        status: normalizedString(payload?.status, "PENDING"),
        reason: normalizedString(payload?.reason),
        toolActionId: normalizedString(payload?.toolActionId),
        actionStatus: normalizedString(payload?.actionStatus, existing.actionStatus),
        reviewedAt: normalizedString(item?.timestamp),
        decisionSequence: Number(item?.sequence || 0) || 0
      });
    }
  });
  return Array.from(proposals.values()).map((item) => {
    const action = toolActionsById.get(normalizedString(item?.toolActionId));
    if (!action) {
      return item;
    }
    return {
      ...item,
      actionStatus: normalizedString(action?.status, item?.actionStatus),
      toolType: normalizedString(action?.toolType, item?.proposalType)
    };
  }).sort((a, b) => {
    const aSeq = Number(a?.sequence || 0) || 0;
    const bSeq = Number(b?.sequence || 0) || 0;
    if (aSeq !== bSeq) {
      return aSeq - bSeq;
    }
    return sortIsoAscending(a?.generatedAt, b?.generatedAt);
  });
}

function summarizeTimelineTurn(timeline, sessionView) {
  const safeTimeline = timeline && typeof timeline === "object" ? timeline : {};
  const toolActions = Array.isArray(safeTimeline.toolActions) ? safeTimeline.toolActions : [];
  const firstAction = toolActions[0] || {};
  const requestPayload =
    firstAction?.requestPayload && typeof firstAction.requestPayload === "object"
      ? firstAction.requestPayload
      : {};
  const resultPayload =
    firstAction?.resultPayload && typeof firstAction.resultPayload === "object"
      ? firstAction.resultPayload
      : {};
  const session = safeTimeline.session || {};
  return {
    requestId: normalizedString(session?.requestId),
    taskId: normalizedString(session?.taskId),
    prompt: normalizedString(requestPayload?.prompt, safeTimeline?.task?.intent || ""),
    systemPrompt: normalizedString(requestPayload?.systemPrompt),
    createdAt: normalizedString(session?.createdAt),
    response: {
      taskId: normalizedString(session?.taskId),
      sessionId: normalizedString(session?.sessionId),
      route: normalizedString(resultPayload?.route),
      endpointRef: normalizedString(resultPayload?.endpointRef),
      credentialRef: normalizedString(resultPayload?.credentialRef),
      boundaryProviderId: normalizedString(resultPayload?.boundaryProviderId),
      boundaryBaseUrl: normalizedString(resultPayload?.boundaryBaseUrl),
      provider: normalizedString(resultPayload?.provider),
      transport: normalizedString(resultPayload?.transport),
      model: normalizedString(resultPayload?.model),
      finishReason: normalizedString(resultPayload?.finishReason),
      outputText: normalizedString(resultPayload?.outputText),
      startedAt: normalizedString(session?.startedAt || session?.createdAt),
      completedAt: normalizedString(session?.completedAt)
    },
    sessionView
  };
}

function isManagedCodexWorker(selectedWorker = {}) {
  return executionModeFromWorker(selectedWorker) === "managed_codex_worker";
}

function buildManagedCodexLaunchTurn(sessionView, options = {}) {
  const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
  const session = timeline?.session && typeof timeline.session === "object" ? timeline.session : {};
  const selectedWorker = timeline?.selectedWorker && typeof timeline.selectedWorker === "object" ? timeline.selectedWorker : {};
  const activity = buildNativeSessionActivitySummary(sessionView);
  const outputText = normalizedString(
    options.outputText,
    activity?.latestWorkerSummary || "Managed Codex worker bridge is active and waiting for the next governed step."
  );
  return {
    requestId: normalizedString(options.requestId, session?.requestId),
    taskId: normalizedString(session?.taskId),
    prompt: normalizedString(options.prompt, "Managed Codex worker launch"),
    systemPrompt: "",
    createdAt: normalizedString(session?.createdAt),
    response: {
      taskId: normalizedString(session?.taskId),
      sessionId: normalizedString(session?.sessionId),
      route: "managed-worker-bridge",
      provider: normalizedString(selectedWorker?.provider, "codex"),
      transport: normalizedString(selectedWorker?.transport, "native_worker_bridge"),
      model: normalizedString(selectedWorker?.model, "codex"),
      finishReason: normalizedString(options.finishReason),
      outputText,
      executionMode: "managed_codex_worker",
      startedAt: normalizedString(session?.startedAt, session?.createdAt),
      completedAt: normalizedString(session?.completedAt),
      workerType: normalizedString(selectedWorker?.workerType),
      workerAdapterId: normalizedString(selectedWorker?.adapterId)
    },
    sessionView
  };
}

function upsertOperatorChatTurn(thread = {}, turn = {}) {
  const sessionId = sessionIdForTurn(turn);
  const turns = Array.isArray(thread?.turns) ? thread.turns.slice() : [];
  if (!sessionId) {
    return {
      ...thread,
      turns: turns.concat(turn)
    };
  }
  const index = turns.findIndex((item) => sessionIdForTurn(item) === sessionId);
  if (index >= 0) {
    const existingTurn = turns[index] || {};
    turns[index] = {
      ...existingTurn,
      ...turn,
      requestId: normalizedString(turn?.requestId, existingTurn?.requestId),
      prompt: normalizedString(turn?.prompt, existingTurn?.prompt),
      createdAt: normalizedString(existingTurn?.createdAt, turn?.createdAt),
      response: {
        ...(existingTurn?.response && typeof existingTurn.response === "object" ? existingTurn.response : {}),
        ...(turn?.response && typeof turn.response === "object" ? turn.response : {})
      }
    };
  } else {
    turns.push(turn);
  }
  turns.sort((a, b) => sortIsoAscending(a?.createdAt, b?.createdAt));
  return {
    ...thread,
    latestSessionId: sessionId,
    turns
  };
}

function activeManagedCodexTurn(thread = {}) {
  const turns = Array.isArray(thread?.turns) ? thread.turns.slice() : [];
  return turns
    .sort((a, b) => sortIsoAscending(b?.createdAt, a?.createdAt))
    .find((turn) => {
      const sessionView = turn?.sessionView || {};
      const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
      const session = timeline?.session && typeof timeline.session === "object" ? timeline.session : {};
      const worker = timeline?.selectedWorker && typeof timeline.selectedWorker === "object" ? timeline.selectedWorker : {};
      return isManagedCodexWorker(worker) && !isTerminalSessionStatus(session?.status);
    }) || null;
}

function latestManagedCodexTurn(thread = {}) {
  const turns = Array.isArray(thread?.turns) ? thread.turns.slice() : [];
  return turns
    .sort((a, b) => sortIsoAscending(b?.createdAt, a?.createdAt))
    .find((turn) => {
      const sessionView = turn?.sessionView || {};
      const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
      const worker = timeline?.selectedWorker && typeof timeline.selectedWorker === "object" ? timeline.selectedWorker : {};
      return isManagedCodexWorker(worker) || normalizeExecutionMode(turn?.response?.executionMode || thread?.executionMode) === "managed_codex_worker";
    }) || null;
}

function managedCodexTurnContext(thread = {}, options = {}) {
  const turn = options.preferLatest
    ? latestManagedCodexTurn(thread)
    : activeManagedCodexTurn(thread) || latestManagedCodexTurn(thread);
  const sessionView = turn?.sessionView || {};
  const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
  const session = timeline?.session && typeof timeline.session === "object" ? timeline.session : {};
  const selectedWorker = timeline?.selectedWorker && typeof timeline.selectedWorker === "object" ? timeline.selectedWorker : {};
  return {
    turn,
    sessionView,
    timeline,
    session,
    selectedWorker,
    sessionId: normalizedString(session?.sessionId),
    workerId: normalizedString(selectedWorker?.workerId),
    sessionStatus: normalizedString(session?.status).toUpperCase(),
    workerStatus: normalizedString(selectedWorker?.status).toUpperCase(),
    isTerminal: isTerminalSessionStatus(session?.status)
  };
}

async function emitManagedCodexBridgeLifecycle(api, meta = {}, sessionId, workerId, options = {}) {
  const normalizedSessionID = normalizedString(sessionId);
  const normalizedWorkerID = normalizedString(workerId);
  const tenantId = normalizedString(meta.tenantId);
  const projectId = normalizedString(meta.projectId);
  if (!normalizedSessionID || !normalizedWorkerID || !tenantId || !projectId) {
    throw new Error("tenantId, projectId, sessionId, and workerId are required");
  }
  const now = Date.now();
  const bridgeSummary = normalizedString(
    options.bridgeSummary,
    "Managed Codex worker bridge attached from chat controls."
  );
  const progressSummary = normalizedString(
    options.progressSummary,
    "Managed Codex worker is attached and waiting for the next governed turn."
  );
  const progressStage = normalizedString(options.progressStage, "waiting_for_turn");
  const progressPercent = Number.isFinite(Number(options.progressPercent))
    ? Number(options.progressPercent)
    : 5;
  const progressStatus = normalizedString(options.progressStatus, "RUNNING").toUpperCase() || "RUNNING";
  const requestIdPrefix = normalizedString(options.requestIdPrefix, "chat-worker");
  await api.createRuntimeSessionWorkerEvent(normalizedSessionID, normalizedWorkerID, {
    meta: {
      tenantId,
      projectId,
      requestId: `${requestIdPrefix}-bridge-${now}`
    },
    eventType: "worker.bridge.started",
    status: "READY",
    severity: "info",
    summary: bridgeSummary,
    payload: {
      executionMode: "managed_codex_worker",
      bridge: "native_m16_session_contract",
      targetEnvironment: normalizedString(options.targetEnvironment, "local-desktop")
    }
  });
  await api.createRuntimeSessionWorkerEvent(normalizedSessionID, normalizedWorkerID, {
    meta: {
      tenantId,
      projectId,
      requestId: `${requestIdPrefix}-progress-${now}`
    },
    eventType: "worker.progress",
    status: progressStatus,
    severity: "info",
    summary: progressSummary,
    payload: {
      stage: progressStage,
      percent: progressPercent,
      executionMode: "managed_codex_worker"
    }
  });
}

async function attachManagedCodexWorker(api, meta = {}, sessionId, draft = {}, options = {}) {
  const normalizedSessionID = normalizedString(sessionId);
  const tenantId = normalizedString(meta.tenantId);
  const projectId = normalizedString(meta.projectId);
  if (!normalizedSessionID || !tenantId || !projectId) {
    throw new Error("tenantId, projectId, and sessionId are required");
  }
  const normalizedDraft = normalizeOperatorChatDraft(draft, "codex");
  const now = Date.now();
  const worker = await api.attachRuntimeSessionWorker(normalizedSessionID, {
    meta: {
      tenantId,
      projectId,
      requestId: normalizedString(options.requestId, `req-chat-worker-attach-${now}`)
    },
    workerType: "managed_agent",
    adapterId: "codex",
    source: normalizedString(options.source, "desktop-ui.operator_chat.managed_worker"),
    routing: "managed_codex_worker",
    agentProfileId: "codex",
    provider: "codex",
    transport: "native_worker_bridge",
    model: normalizedString(normalizedDraft.agentProfileId, "codex"),
    targetEnvironment: normalizedString(options.targetEnvironment, "local-desktop"),
    capabilities: ["agent_turn", "tool_proposal", "approval_checkpoint", "evidence_capture"],
    annotations: {
      surface: "operator_chat",
      executionMode: "managed_codex_worker"
    }
  });
  const workerId = normalizedString(worker?.workerId);
  if (!workerId) {
    throw new Error("managed worker attach did not return a workerId");
  }
  await emitManagedCodexBridgeLifecycle(api, meta, normalizedSessionID, workerId, {
    requestIdPrefix: normalizedString(options.requestIdPrefix, "chat-worker"),
    bridgeSummary: options.bridgeSummary,
    progressSummary: options.progressSummary,
    progressStage: options.progressStage,
    progressPercent: options.progressPercent,
    progressStatus: options.progressStatus,
    targetEnvironment: options.targetEnvironment
  });
  return workerId;
}

async function syncManagedCodexTurn(api, thread = {}, sessionId, options = {}) {
  const normalizedSessionID = normalizedString(sessionId);
  if (!normalizedSessionID) {
    throw new Error("sessionId is required");
  }
  const sessionView = await loadNativeSessionView(api, normalizedSessionID, {
    tailCount: safeInteger(options.tailCount, 8),
    waitSeconds: safeInteger(options.waitSeconds, 1)
  });
  const turn = buildManagedCodexLaunchTurn(sessionView, {
    requestId: options.requestId,
    outputText: options.outputText,
    prompt: options.prompt,
    finishReason: options.finishReason
  });
  const nextThread = upsertOperatorChatTurn({
    ...thread,
    executionMode: "managed_codex_worker",
    agentProfileId: "codex"
  }, turn);
  return {
    thread: nextThread,
    turn,
    sessionView
  };
}

export function normalizeOperatorChatDraft(draft = {}, fallbackProfileId = "") {
  const executionMode = normalizeExecutionMode(draft.executionMode);
  const normalizedAgentProfileId = executionMode === "managed_codex_worker"
    ? "codex"
    : normalizedString(draft.agentProfileId, fallbackProfileId).toLowerCase();
  return {
    title: normalizedString(draft.title, defaultThreadTitle(normalizedAgentProfileId || fallbackProfileId)),
    intent: normalizedString(
      draft.intent,
      "Run an operator-guided governed agent conversation through the M16 session contract."
    ),
    agentProfileId: normalizedAgentProfileId,
    executionMode,
    systemPrompt: normalizedString(draft.systemPrompt),
    prompt: normalizedString(draft.prompt),
    maxOutputTokens: safeInteger(draft.maxOutputTokens, 1024)
  };
}

export async function loadNativeSessionView(api, sessionId, options = {}) {
  const normalizedSessionID = normalizedString(sessionId);
  if (!normalizedSessionID) {
    return null;
  }
  const tailCount = safeInteger(options.tailCount, 6);
  const waitSeconds = safeInteger(options.waitSeconds, 1);
  try {
    const timeline = await api.getRuntimeSessionTimeline(normalizedSessionID);
    const latestEventSequence = Number(timeline?.latestEventSequence || 0) || 0;
    const afterSequence = latestEventSequence > tailCount ? latestEventSequence - tailCount : 0;
    try {
      const stream = await api.getRuntimeSessionEventStream(normalizedSessionID, {
        afterSequence,
        waitSeconds
      });
      return {
        sessionId: normalizedSessionID,
        source: "timeline+stream",
        status: "ready",
        message: "Native M16 session state loaded from timeline and event-stream surfaces.",
        timeline,
        streamItems: Array.isArray(stream?.items) ? stream.items : []
      };
    } catch (error) {
      return {
        sessionId: normalizedSessionID,
        source: "timeline-only",
        status: "warn",
        message: `Native session timeline loaded, but event stream refresh failed: ${error.message}`,
        timeline,
        streamItems: Array.isArray(timeline?.events) ? timeline.events.slice(-tailCount) : []
      };
    }
  } catch (error) {
    return {
      sessionId: normalizedSessionID,
      source: "load-failed",
      status: "error",
      message: `Native session read failed: ${error.message}`,
      timeline: null,
      streamItems: []
    };
  }
}

export function deriveOperatorChatThreadState(thread = {}) {
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const sessionView = latestTurn?.sessionView || null;
  const session = sessionView?.timeline?.session || {};
  const sessionId = normalizedString(session?.sessionId, sessionIdForTurn(latestTurn));
  const activity = buildNativeSessionActivitySummary(sessionView);
  const sessionStatus = activity.sessionStatus;
  const openApprovalCount = activity.openApprovalCount;
  const pendingToolProposalCount = activity.pendingToolProposalCount;

  if (!sessionId) {
    return {
      sessionId: "",
      sessionStatus: "",
      taskStatus: "",
      latestWorkerStatus: "",
      latestWorkerSummary: "",
      latestEventSequence: 0,
      openApprovalCount: 0,
      uiStatus: thread?.taskId ? "ready" : "idle",
      message: thread?.taskId
        ? "Thread is ready for the next operator turn."
        : "Start a thread to create the native M16 task for this conversation.",
      shouldFollow: false,
      isTerminal: false,
      isResolvedThread: false,
      resolutionStatus: "",
      resolutionMessage: ""
    };
  }

  const baseState = {
    sessionId,
    sessionStatus,
    taskStatus: activity.taskStatus,
    latestWorkerStatus: activity.latestWorkerStatus,
    latestWorkerSummary: activity.latestWorkerSummary,
    latestEventSequence: latestKnownSessionSequence(sessionView),
    openApprovalCount,
    isResolvedThread: activity.isResolved,
    resolutionStatus: activity.resolutionStatus,
    resolutionMessage: activity.resolutionMessage
  };

  switch (sessionStatus) {
    case "COMPLETED":
      return {
        ...baseState,
        uiStatus: "success",
        message: activity.resolutionMessage || `Latest turn ${sessionId} completed and the native session is closed.`,
        shouldFollow: false,
        isTerminal: true
      };
    case "FAILED":
      return {
        ...baseState,
        uiStatus: "error",
        message: activity.resolutionMessage || `Latest turn ${sessionId} failed. Inspect the native timeline before retrying.`,
        shouldFollow: false,
        isTerminal: true
      };
    case "BLOCKED":
      return {
        ...baseState,
        uiStatus: "warn",
        message: activity.resolutionMessage || `Latest turn ${sessionId} is blocked. Review the approval decision and start a new turn only if policy allows.`,
        shouldFollow: false,
        isTerminal: true
      };
    case "CANCELLED":
      return {
        ...baseState,
        uiStatus: "warn",
        message: activity.resolutionMessage || `Latest turn ${sessionId} was cancelled and the native session is closed.`,
        shouldFollow: false,
        isTerminal: true
      };
    case "AWAITING_APPROVAL":
      return {
        ...baseState,
        uiStatus: "warn",
        message: openApprovalCount > 0
          ? `Latest turn ${sessionId} is waiting on ${openApprovalCount} approval checkpoint(s).`
          : pendingToolProposalCount > 0
            ? `Latest turn ${sessionId} is waiting on ${pendingToolProposalCount} governed tool proposal review item(s).`
            : `Latest turn ${sessionId} is waiting on governed review before the worker can continue.`,
        shouldFollow: true,
        isTerminal: false
      };
    case "AWAITING_WORKER":
      return {
        ...baseState,
        uiStatus: "warn",
        message: `Latest turn ${sessionId} is approved but still waiting for a worker attachment.`,
        shouldFollow: true,
        isTerminal: false
      };
    case "RUNNING":
      return {
        ...baseState,
        uiStatus: "running",
        message: activity.latestWorkerSummary
          ? `Latest turn ${sessionId} is running. ${activity.latestWorkerSummary}`
          : `Latest turn ${sessionId} is still running; live follow is active on the native event stream.`,
        shouldFollow: true,
        isTerminal: false
      };
    case "READY":
      return {
        ...baseState,
        uiStatus: "ready",
        message: activity.latestWorkerSummary
          ? `Latest turn ${sessionId} is ready. ${activity.latestWorkerSummary}`
          : `Latest turn ${sessionId} is ready for the next governed worker step.`,
        shouldFollow: true,
        isTerminal: false
      };
    default:
      return {
        ...baseState,
        uiStatus: "ready",
        message: activity.latestWorkerSummary
          ? `Latest turn ${sessionId} is loaded from native M16 state. ${activity.latestWorkerSummary}`
          : `Latest turn ${sessionId} is loaded from native M16 state.`,
        shouldFollow: !isTerminalSessionStatus(sessionStatus),
        isTerminal: isTerminalSessionStatus(sessionStatus)
      };
  }
}

export async function refreshOperatorChatThreadSession(api, thread = {}, sessionId, options = {}) {
  const normalizedSessionID = normalizedString(sessionId);
  if (!normalizedSessionID) {
    return {
      changed: false,
      thread,
      turn: null,
      state: deriveOperatorChatThreadState(thread)
    };
  }
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const turnIndex = turns.findIndex((turn) => sessionIdForTurn(turn) === normalizedSessionID);
  if (turnIndex < 0) {
    return {
      changed: false,
      thread,
      turn: null,
      state: deriveOperatorChatThreadState(thread)
    };
  }
  const sessionView = await loadNativeSessionView(api, normalizedSessionID, options);
  const updatedTurn = {
    ...turns[turnIndex],
    sessionView
  };
  const nextTurns = turns.slice();
  nextTurns.splice(turnIndex, 1, updatedTurn);
  const nextThread = {
    ...thread,
    latestSessionId: normalizedString(thread?.latestSessionId, normalizedSessionID),
    turns: nextTurns
  };
  return {
    changed: true,
    thread: nextThread,
    turn: updatedTurn,
    state: deriveOperatorChatThreadState(nextThread)
  };
}

export async function followOperatorChatThread(api, thread = {}, options = {}) {
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const sessionId = sessionIdForTurn(latestTurn);
  const state = deriveOperatorChatThreadState(thread);
  if (!sessionId || !state.shouldFollow) {
    return {
      changed: false,
      thread,
      turn: latestTurn,
      state
    };
  }

  const waitSeconds = safeInteger(options.waitSeconds, 12);
  const tailCount = safeInteger(options.tailCount, 8);
  const stream = await api.getRuntimeSessionEventStream(sessionId, {
    afterSequence: latestKnownSessionSequence(latestTurn?.sessionView),
    waitSeconds,
    follow: true
  });
  if (!Array.isArray(stream?.items) || stream.items.length === 0) {
    return {
      changed: false,
      thread,
      turn: latestTurn,
      state
    };
  }

  const refreshed = await refreshOperatorChatThreadSession(api, thread, sessionId, {
    tailCount,
    waitSeconds: 1
  });
  if (!refreshed.turn) {
    return refreshed;
  }
  refreshed.turn = {
    ...refreshed.turn,
    sessionView: {
      ...refreshed.turn.sessionView,
      source: "timeline+stream-follow",
      message: `Native session follow received ${stream.items.length} new event(s).`,
      streamItems: stream.items.slice(-tailCount)
    }
  };
  const nextTurns = Array.isArray(refreshed.thread?.turns) ? refreshed.thread.turns.slice() : [];
  if (nextTurns.length > 0) {
    nextTurns[nextTurns.length - 1] = refreshed.turn;
  }
  const nextThread = {
    ...refreshed.thread,
    turns: nextTurns
  };
  return {
    changed: true,
    thread: nextThread,
    turn: refreshed.turn,
    state: deriveOperatorChatThreadState(nextThread)
  };
}

export async function createOperatorChatThread(api, scope = {}, draft = {}) {
  const tenantId = normalizedString(scope.tenantId);
  const projectId = normalizedString(scope.projectId);
  if (!tenantId || !projectId) {
    throw new Error("tenantId and projectId are required");
  }
  const normalizedDraft = normalizeOperatorChatDraft(draft, draft.agentProfileId);
  const requestId = normalizedString(
    draft.requestId,
    `req-chat-task-${Date.now()}`
  );
  const task = await api.createRuntimeTask({
    meta: {
      tenantId,
      projectId,
      requestId
    },
    source: "desktop-ui.operator_chat",
    title: normalizedDraft.title,
    intent: normalizedDraft.intent,
    annotations: {
      surface: "operator_chat",
      bootstrap: "m17",
      agentProfileId: normalizedDraft.agentProfileId,
      executionMode: normalizedDraft.executionMode,
      preferredWorkerType: normalizedDraft.executionMode === "managed_codex_worker" ? "managed_agent" : "model_invoke",
      preferredWorkerAdapterId: normalizedDraft.executionMode === "managed_codex_worker"
        ? "codex"
        : normalizedDraft.agentProfileId
    }
  });
  return {
    taskId: normalizedString(task?.taskId),
    title: normalizedString(task?.title, normalizedDraft.title),
    intent: normalizedString(task?.intent, normalizedDraft.intent),
    tenantId,
    projectId,
    createdAt: normalizedString(task?.createdAt),
    source: "task",
    executionMode: normalizedDraft.executionMode
  };
}

export async function listOperatorChatThreads(api, scope = {}, options = {}) {
  const tenantId = normalizedString(scope.tenantId);
  const projectId = normalizedString(scope.projectId);
  if (!tenantId || !projectId) {
    throw new Error("tenantId and projectId are required");
  }
  const limit = safeInteger(options.limit, 12);
  const response = await api.listRuntimeTasks({
    tenantId,
    projectId,
    limit,
    offset: 0
  });
  const baseItems = (Array.isArray(response?.items) ? response.items : [])
    .filter((item) => normalizedString(item?.source) === "desktop-ui.operator_chat")
    .map((item) => ({
      taskId: normalizedString(item?.taskId),
      title: normalizedString(item?.title),
      intent: normalizedString(item?.intent),
      status: normalizedString(item?.status),
      agentProfileId: normalizedString(item?.annotations?.agentProfileId).toLowerCase(),
      executionMode: normalizeExecutionMode(item?.annotations?.executionMode),
      latestSessionId: normalizedString(item?.latestSessionId),
      updatedAt: normalizedString(item?.updatedAt),
      createdAt: normalizedString(item?.createdAt),
      tenantId: normalizedString(item?.tenantId),
      projectId: normalizedString(item?.projectId)
    }))
    .sort((a, b) => sortIsoAscending(b.updatedAt, a.updatedAt));
  const items = await Promise.all(
    baseItems.map(async (item) => {
      try {
        const sessionList = await api.listRuntimeSessions({
          tenantId,
          projectId,
          taskId: item.taskId,
          limit: 1,
          offset: 0
        });
        return {
          ...item,
          sessionCount: Number(sessionList?.count || 0) || 0
        };
      } catch (_) {
        return {
          ...item,
          sessionCount: 0
        };
      }
    })
  );
  return {
    source: normalizedString(response?.source, "runtime"),
    count: items.length,
    items
  };
}

export async function loadOperatorChatThread(api, scope = {}, taskOrId, options = {}) {
  const tenantId = normalizedString(scope.tenantId);
  const projectId = normalizedString(scope.projectId);
  const taskId =
    typeof taskOrId === "string"
      ? normalizedString(taskOrId)
      : normalizedString(taskOrId?.taskId);
  if (!tenantId || !projectId || !taskId) {
    throw new Error("tenantId, projectId, and taskId are required");
  }
  const task = typeof taskOrId === "object" && taskOrId ? taskOrId : {};
  const limit = safeInteger(options.limit, 12);
  const sessionList = await api.listRuntimeSessions({
    tenantId,
    projectId,
    taskId,
    limit,
    offset: 0
  });
  const sessions = Array.isArray(sessionList?.items) ? sessionList.items.slice().sort((a, b) => sortIsoAscending(a?.createdAt, b?.createdAt)) : [];
  const loadedViews = await Promise.all(
    sessions.map((session) => loadNativeSessionView(api, session?.sessionId, { tailCount: 8, waitSeconds: 1 }))
  );
  const turns = loadedViews
    .filter((view) => view?.timeline)
    .map((view) => summarizeTimelineTurn(view.timeline, view));
  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const latestTimeline = latestTurn?.sessionView?.timeline || null;
  const selectedWorker = latestTimeline?.selectedWorker && typeof latestTimeline.selectedWorker === "object"
    ? latestTimeline.selectedWorker
    : {};
  const executionMode = executionModeFromWorker(selectedWorker, task?.executionMode || task?.annotations?.executionMode);
  return {
    taskId,
    title: normalizedString(task?.title, normalizedString(latestTimeline?.task?.title)),
    intent: normalizedString(task?.intent, normalizedString(latestTimeline?.task?.intent)),
    tenantId,
    projectId,
    createdAt: normalizedString(task?.createdAt, normalizedString(sessions[0]?.createdAt)),
    updatedAt: normalizedString(task?.updatedAt, normalizedString(sessions[sessions.length - 1]?.updatedAt)),
    latestSessionId: normalizedString(task?.latestSessionId, normalizedString(sessions[sessions.length - 1]?.sessionId)),
    agentProfileId: normalizedString(
      latestTimeline?.selectedWorker?.agentProfileId,
      normalizedString(latestTimeline?.selectedWorker?.adapterId, normalizedString(task?.agentProfileId))
    ).toLowerCase(),
    executionMode,
    turns
  };
}

export async function invokeOperatorChatTurn(api, scope = {}, thread = {}, draft = {}) {
  const tenantId = normalizedString(scope.tenantId || thread.tenantId);
  const projectId = normalizedString(scope.projectId || thread.projectId);
  const taskId = normalizedString(thread.taskId);
  if (!tenantId || !projectId || !taskId) {
    throw new Error("tenantId, projectId, and taskId are required");
  }
  const normalizedDraft = normalizeOperatorChatDraft(draft, thread.agentProfileId);
  if (!normalizedDraft.agentProfileId) {
    throw new Error("agentProfileId is required");
  }
  if (!normalizedDraft.prompt) {
    throw new Error("prompt is required");
  }

  const requestId = normalizedString(
    draft.requestId,
    `req-chat-turn-${Date.now()}`
  );
  const response = await api.invokeIntegrationAgent({
    meta: {
      tenantId,
      projectId,
      requestId
    },
    taskId,
    agentProfileId: normalizedDraft.agentProfileId,
    executionMode: normalizedDraft.executionMode,
    prompt: normalizedDraft.prompt,
    systemPrompt: normalizedDraft.systemPrompt,
    maxOutputTokens: normalizedDraft.maxOutputTokens
  });
  const sessionView = response?.applied && response?.sessionId
    ? await loadNativeSessionView(api, response.sessionId, { tailCount: 8, waitSeconds: 1 })
    : null;
  return {
    response,
    sessionView
  };
}

export async function launchManagedCodexWorker(api, scope = {}, thread = {}, draft = {}) {
  const tenantId = normalizedString(scope.tenantId || thread.tenantId);
  const projectId = normalizedString(scope.projectId || thread.projectId);
  const taskId = normalizedString(thread.taskId);
  if (!tenantId || !projectId || !taskId) {
    throw new Error("tenantId, projectId, and taskId are required");
  }

  const normalizedDraft = normalizeOperatorChatDraft(draft, thread.agentProfileId);
  const now = Date.now();
  const context = managedCodexTurnContext(thread);
  let sessionId = context.sessionId;
  let workerId = context.workerId;

  if (!sessionId) {
    const session = await api.createRuntimeSessionForTask(taskId, {
      meta: {
        tenantId,
        projectId,
        requestId: `req-chat-worker-session-${now}`
      },
      sessionType: "managed_agent_bridge",
      source: "desktop-ui.operator_chat.managed_worker",
      summary: {
        channel: "chat",
        action: "launch_managed_codex_worker"
      },
      annotations: {
        surface: "operator_chat",
        executionMode: "managed_codex_worker",
        workerAdapterId: "codex",
        agentProfileId: "codex"
      }
    });
    sessionId = normalizedString(session?.sessionId);
    if (!sessionId) {
      throw new Error("managed worker launch did not return a sessionId");
    }
  }

  if (!workerId) {
    workerId = await attachManagedCodexWorker(api, { tenantId, projectId }, sessionId, normalizedDraft, {
      requestId: `req-chat-worker-attach-${now}`,
      requestIdPrefix: "chat-worker",
      source: "desktop-ui.operator_chat.managed_worker",
      bridgeSummary: "Managed Codex worker bridge attached from chat controls.",
      progressSummary: "Managed Codex worker launched and waiting for the first governed turn.",
      progressStage: "waiting_for_turn",
      progressPercent: 5,
      progressStatus: "RUNNING"
    });
  } else {
    await emitManagedCodexBridgeLifecycle(api, { tenantId, projectId }, sessionId, workerId, {
      requestIdPrefix: "chat-worker",
      bridgeSummary: "Managed Codex worker bridge confirmed from chat controls.",
      progressSummary: "Managed Codex worker is still attached and waiting for the next governed turn.",
      progressStage: "waiting_for_turn",
      progressPercent: 5,
      progressStatus: "RUNNING"
    });
  }

  return syncManagedCodexTurn(api, thread, sessionId, {
    requestId: `launch-managed-codex-${now}`,
    outputText: "Managed Codex worker launched and waiting for the next governed turn."
  });
}

export async function emitManagedCodexWorkerHeartbeat(api, scope = {}, thread = {}, options = {}) {
  const tenantId = normalizedString(scope.tenantId || thread.tenantId);
  const projectId = normalizedString(scope.projectId || thread.projectId);
  if (!tenantId || !projectId) {
    throw new Error("tenantId and projectId are required");
  }
  const activeTurn = activeManagedCodexTurn(thread);
  const sessionId = normalizedString(activeTurn?.sessionView?.timeline?.session?.sessionId);
  const workerId = normalizedString(activeTurn?.sessionView?.timeline?.selectedWorker?.workerId);
  if (!sessionId || !workerId) {
    throw new Error("Launch a managed Codex worker first so chat has an active worker session.");
  }
  const now = Date.now();
  const summary = normalizedString(
    options.summary,
    "Managed Codex worker heartbeat recorded from chat controls."
  );
  await api.createRuntimeSessionWorkerEvent(sessionId, workerId, {
    meta: {
      tenantId,
      projectId,
      requestId: `req-chat-worker-heartbeat-${now}`
    },
    eventType: "worker.heartbeat",
    status: "RUNNING",
    severity: "info",
    summary,
    payload: {
      stage: "heartbeat",
      executionMode: "managed_codex_worker"
    }
  });
  const sessionView = await loadNativeSessionView(api, sessionId, { tailCount: 8, waitSeconds: 1 });
  const turn = buildManagedCodexLaunchTurn(sessionView, {
    requestId: `heartbeat-managed-codex-${now}`,
    outputText: summary
  });
  const nextThread = upsertOperatorChatTurn(thread, turn);
  return {
    thread: nextThread,
    turn,
    sessionView
  };
}

export async function reattachManagedCodexWorker(api, scope = {}, thread = {}, draft = {}) {
  const tenantId = normalizedString(scope.tenantId || thread.tenantId);
  const projectId = normalizedString(scope.projectId || thread.projectId);
  if (!tenantId || !projectId) {
    throw new Error("tenantId and projectId are required");
  }
  const context = managedCodexTurnContext(thread);
  if (!context.sessionId || context.isTerminal) {
    throw new Error("An active managed Codex session is required before reattaching the worker.");
  }
  const now = Date.now();
  await attachManagedCodexWorker(api, { tenantId, projectId }, context.sessionId, draft, {
    requestId: `req-chat-worker-reattach-${now}`,
    requestIdPrefix: "chat-worker-reattach",
    source: "desktop-ui.operator_chat.managed_worker.reattach",
    bridgeSummary: "Managed Codex worker bridge reattached from chat controls.",
    progressSummary: "Managed Codex worker reattached and ready for the next governed turn.",
    progressStage: "reattached",
    progressPercent: 15,
    progressStatus: "RUNNING"
  });
  return syncManagedCodexTurn(api, thread, context.sessionId, {
    requestId: `reattach-managed-codex-${now}`,
    outputText: "Managed Codex worker reattached and ready for the next governed turn."
  });
}

export async function recoverManagedCodexWorker(api, scope = {}, thread = {}, draft = {}) {
  const tenantId = normalizedString(scope.tenantId || thread.tenantId);
  const projectId = normalizedString(scope.projectId || thread.projectId);
  const taskId = normalizedString(thread.taskId);
  if (!tenantId || !projectId || !taskId) {
    throw new Error("tenantId, projectId, and taskId are required");
  }
  const now = Date.now();
  const session = await api.createRuntimeSessionForTask(taskId, {
    meta: {
      tenantId,
      projectId,
      requestId: `req-chat-worker-recover-session-${now}`
    },
    sessionType: "managed_agent_bridge",
    source: "desktop-ui.operator_chat.managed_worker.recover",
    summary: {
      channel: "chat",
      action: "recover_managed_codex_worker"
    },
    annotations: {
      surface: "operator_chat",
      executionMode: "managed_codex_worker",
      workerAdapterId: "codex",
      agentProfileId: "codex"
    }
  });
  const sessionId = normalizedString(session?.sessionId);
  if (!sessionId) {
    throw new Error("managed worker recover did not return a sessionId");
  }
  await attachManagedCodexWorker(api, { tenantId, projectId }, sessionId, draft, {
    requestId: `req-chat-worker-recover-attach-${now}`,
    requestIdPrefix: "chat-worker-recover",
    source: "desktop-ui.operator_chat.managed_worker.recover",
    bridgeSummary: "Managed Codex worker recovered onto a fresh managed session.",
    progressSummary: "Managed Codex worker recovery created a fresh session and is ready for the next governed turn.",
    progressStage: "recovered",
    progressPercent: 15,
    progressStatus: "RUNNING"
  });
  return syncManagedCodexTurn(api, thread, sessionId, {
    requestId: `recover-managed-codex-${now}`,
    outputText: "Managed Codex worker recovered onto a fresh managed session and is ready for the next governed turn."
  });
}

export async function closeManagedCodexWorkerSession(api, scope = {}, thread = {}, options = {}) {
  const tenantId = normalizedString(scope.tenantId || thread.tenantId);
  const projectId = normalizedString(scope.projectId || thread.projectId);
  if (!tenantId || !projectId) {
    throw new Error("tenantId and projectId are required");
  }
  const context = managedCodexTurnContext(thread);
  if (!context.sessionId || context.isTerminal) {
    throw new Error("An active managed Codex session is required before it can be closed.");
  }
  const now = Date.now();
  const status = normalizedString(options.status, "CANCELLED").toUpperCase() || "CANCELLED";
  const reason = normalizedString(
    options.reason,
    "Managed Codex worker session closed from chat controls."
  );
  await api.closeRuntimeSession(context.sessionId, {
    meta: {
      tenantId,
      projectId,
      requestId: `req-chat-worker-close-${now}`
    },
    status,
    reason
  });
  return syncManagedCodexTurn(api, thread, context.sessionId, {
    requestId: `close-managed-codex-${now}`,
    outputText: reason,
    finishReason: status.toLowerCase()
  });
}
