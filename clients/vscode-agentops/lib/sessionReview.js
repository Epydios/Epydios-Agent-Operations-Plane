function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function clipText(value, maxLength = 220) {
  const text = normalizedString(value);
  if (!text || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}...`;
}

function firstNormalized(values = [], fallback = "") {
  for (const value of Array.isArray(values) ? values : []) {
    const text = normalizedString(value);
    if (text) {
      return text;
    }
  }
  return fallback;
}

function eventPayloadObject(item) {
  return item?.payload && typeof item.payload === "object" ? item.payload : {};
}

function nestedEventPayload(payload = {}) {
  return payload?.payload && typeof payload.payload === "object" ? payload.payload : {};
}

function sortIsoAscending(a, b) {
  return new Date(a || 0).getTime() - new Date(b || 0).getTime();
}

function isTerminalStatus(value) {
  const status = normalizedString(value).toUpperCase();
  return ["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"].includes(status);
}

function latestKnownSequence(sessionView = {}) {
  const timelineSequence = Number(sessionView?.timeline?.latestEventSequence || 0) || 0;
  const streamSequence = (Array.isArray(sessionView?.streamItems) ? sessionView.streamItems : []).reduce(
    (maxValue, item) => Math.max(maxValue, Number(item?.sequence || 0) || 0),
    0
  );
  return Math.max(timelineSequence, streamSequence);
}

function summarizeEventLabel(eventType) {
  const type = normalizedString(eventType).toLowerCase();
  if (type === "worker.bridge.started") return "Worker Bridge";
  if (type === "worker.output.delta") return "Worker Output";
  if (type === "worker.progress") return "Worker Progress";
  if (type === "worker.heartbeat") return "Worker Heartbeat";
  if (type === "worker.status.changed") return "Worker Status";
  if (type === "tool_proposal.generated") return "Tool Proposal";
  if (type === "tool_proposal.decided") return "Proposal Decision";
  if (type.startsWith("tool_action.")) return "Tool Action";
  if (type === "approval.requested") return "Approval Requested";
  if (type === "approval.status.changed") return "Approval Decision";
  if (type === "evidence.recorded") return "Evidence Recorded";
  if (type.startsWith("session.")) return "Session";
  return normalizedString(eventType, "Session Event");
}

function summarizeEventDetail(item) {
  const payload = eventPayloadObject(item);
  const nested = nestedEventPayload(payload);
  const type = normalizedString(item?.eventType).toLowerCase();
  if (type === "worker.output.delta") {
    return clipText(normalizedString(nested?.delta, normalizedString(payload?.summary, "Worker emitted output.")), 320);
  }
  if (type === "worker.progress") {
    return clipText(normalizedString(payload?.summary, normalizedString(payload?.status, "Worker progress updated.")), 220);
  }
  if (type === "tool_proposal.generated") {
    return clipText(normalizedString(payload?.summary, normalizedString(nested?.command, "Tool proposal generated.")), 320);
  }
  if (type === "tool_proposal.decided") {
    return clipText(normalizedString(payload?.reason, normalizedString(payload?.decision, normalizedString(payload?.status, "Proposal decision"))), 220);
  }
  if (type.startsWith("tool_action.")) {
    return clipText(normalizedString(payload?.summary, normalizedString(payload?.toolType, "Tool action")), 220);
  }
  if (type === "approval.requested" || type === "approval.status.changed") {
    return clipText(normalizedString(payload?.reason, normalizedString(payload?.status, normalizedString(payload?.scope, "Approval event"))), 220);
  }
  if (type === "evidence.recorded") {
    return clipText(normalizedString(payload?.kind, normalizedString(payload?.evidenceId, "Evidence recorded.")), 220);
  }
  return clipText(normalizedString(payload?.summary, normalizedString(payload?.status, normalizedString(payload?.kind, "Event recorded."))), 220);
}

function listSessionEvents(sessionView = {}) {
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

function listToolProposals(sessionView = {}) {
  const proposals = new Map();
  const toolActionsById = new Map(
    (Array.isArray(sessionView?.timeline?.toolActions) ? sessionView.timeline.toolActions : [])
      .filter((item) => item && typeof item === "object")
      .map((item) => [normalizedString(item?.toolActionId), item])
      .filter(([toolActionId]) => Boolean(toolActionId))
  );
  listSessionEvents(sessionView).forEach((item) => {
    const payload = eventPayloadObject(item);
    if (item?.eventType === "tool_proposal.generated") {
      const proposalId = normalizedString(payload?.proposalId);
      if (!proposalId) {
        return;
      }
      const proposalPayload = nestedEventPayload(payload);
      proposals.set(proposalId, {
        proposalId,
        status: "PENDING",
        proposalType: normalizedString(payload?.proposalType),
        summary: normalizedString(payload?.summary),
        command: normalizedString(proposalPayload?.command),
        generatedAt: normalizedString(item?.timestamp),
        payload: proposalPayload
      });
      return;
    }
    if (item?.eventType === "tool_proposal.decided") {
      const proposalId = normalizedString(payload?.proposalId);
      if (!proposalId) {
        return;
      }
      const existing = proposals.get(proposalId) || { proposalId };
      proposals.set(proposalId, {
        ...existing,
        status: normalizedString(payload?.status, "PENDING"),
        decision: normalizedString(payload?.decision),
        reason: normalizedString(payload?.reason),
        toolActionId: normalizedString(payload?.toolActionId),
        reviewedAt: normalizedString(item?.timestamp)
      });
    }
  });
  return Array.from(proposals.values()).map((item) => {
    const action = toolActionsById.get(normalizedString(item?.toolActionId));
    return action
      ? { ...item, actionStatus: normalizedString(action?.status), toolType: normalizedString(action?.toolType) }
      : item;
  });
}

function latestManagedWorkerTranscript(sessionView = {}) {
  const toolActions = Array.isArray(sessionView?.timeline?.toolActions) ? sessionView.timeline.toolActions : [];
  const managedTurn = [...toolActions].reverse().find((item) => normalizedString(item?.toolType).toLowerCase() === "managed_agent_turn");
  if (!managedTurn?.resultPayload || typeof managedTurn.resultPayload !== "object") {
    return null;
  }
  const rawResponse = managedTurn.resultPayload?.rawResponse;
  if (!rawResponse) {
    return null;
  }
  return {
    toolActionId: normalizedString(managedTurn?.toolActionId),
    pretty: JSON.stringify(rawResponse, null, 2)
  };
}

function latestToolActionSummary(timeline = {}) {
  const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
  const latest = [...toolActions].reverse().find((item) => item && typeof item === "object");
  if (!latest) {
    return {
      toolActionId: "",
      toolType: "",
      toolStatus: "",
      toolSource: ""
    };
  }
  const resultPayload = latest?.resultPayload && typeof latest.resultPayload === "object" ? latest.resultPayload : {};
  return {
    toolActionId: normalizedString(latest?.toolActionId),
    toolType: normalizedString(latest?.toolType),
    toolStatus: normalizedString(latest?.status),
    toolSource: firstNormalized([
      latest?.source,
      resultPayload?.source,
      resultPayload?.route,
      resultPayload?.endpointRef
    ])
  };
}

function deriveRunId(timeline = {}, events = []) {
  const session = timeline?.session && typeof timeline.session === "object" ? timeline.session : {};
  const task = timeline?.task && typeof timeline.task === "object" ? timeline.task : {};
  const selectedWorker = timeline?.selectedWorker && typeof timeline.selectedWorker === "object" ? timeline.selectedWorker : {};
  const approvals = Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [];
  const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
  const evidenceRecords = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
  const eventValues = (Array.isArray(events) ? events : []).flatMap((item) => {
    const payload = eventPayloadObject(item);
    const nested = nestedEventPayload(payload);
    return [payload?.runId, nested?.runId];
  });
  const toolActionValues = toolActions.flatMap((item) => {
    const resultPayload = item?.resultPayload && typeof item.resultPayload === "object" ? item.resultPayload : {};
    return [item?.runId, resultPayload?.runId];
  });
  return firstNormalized([
    session?.runId,
    task?.runId,
    task?.latestRunId,
    selectedWorker?.runId,
    ...approvals.map((item) => item?.runId),
    ...toolActionValues,
    ...evidenceRecords.map((item) => item?.runId),
    ...eventValues
  ]);
}

function latestEvidenceRecord(timeline = {}) {
  const evidenceRecords = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
  const latest = [...evidenceRecords].reverse().find((item) => item && typeof item === "object");
  if (!latest) {
    return {
      evidenceId: "",
      evidenceKind: "",
      evidenceSummary: ""
    };
  }
  return {
    evidenceId: normalizedString(latest?.evidenceId),
    evidenceKind: normalizedString(latest?.kind),
    evidenceSummary: normalizedString(latest?.summary)
  };
}

function buildSessionSummary(sessionView = {}) {
  const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
  const session = timeline?.session && typeof timeline.session === "object" ? timeline.session : {};
  const task = timeline?.task && typeof timeline.task === "object" ? timeline.task : {};
  const selectedWorker = timeline?.selectedWorker && typeof timeline.selectedWorker === "object" ? timeline.selectedWorker : {};
  const events = listSessionEvents(sessionView).map((item) => ({
    ...item,
    label: summarizeEventLabel(item?.eventType),
    detail: summarizeEventDetail(item)
  }));
  const latestWorkerEvent = [...events].reverse().find((item) => normalizedString(item?.eventType).startsWith("worker.") || normalizedString(item?.eventType).startsWith("tool_action."));
  const resultPayload = (() => {
    const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
    const managedTurn = [...toolActions].reverse().find((item) => normalizedString(item?.toolType).toLowerCase() === "managed_agent_turn");
    return managedTurn?.resultPayload && typeof managedTurn.resultPayload === "object" ? managedTurn.resultPayload : {};
  })();
  const runId = deriveRunId(timeline, events);
  const latestToolAction = latestToolActionSummary(timeline);
  const latestEvidence = latestEvidenceRecord(timeline);
  return {
    session,
    task,
    selectedWorker,
    approvals: Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [],
    toolActions: Array.isArray(timeline?.toolActions) ? timeline.toolActions : [],
    evidenceRecords: Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [],
    toolProposals: listToolProposals(sessionView),
    events,
    transcript: latestManagedWorkerTranscript(sessionView),
    runId,
    route: normalizedString(resultPayload?.route),
    endpointRef: normalizedString(resultPayload?.endpointRef),
    boundaryProviderId: normalizedString(resultPayload?.boundaryProviderId),
    boundaryBaseUrl: normalizedString(resultPayload?.boundaryBaseUrl),
    latestToolActionId: latestToolAction.toolActionId,
    latestToolType: latestToolAction.toolType,
    latestToolStatus: latestToolAction.toolStatus,
    latestToolSource: latestToolAction.toolSource,
    latestEvidenceId: latestEvidence.evidenceId,
    latestEvidenceKind: latestEvidence.evidenceKind,
    latestEvidenceSummary: latestEvidence.evidenceSummary,
    latestWorkerSummary: normalizedString(latestWorkerEvent?.detail),
    taskStatus: normalizedString(task?.status).toUpperCase(),
    sessionStatus: normalizedString(session?.status).toUpperCase(),
    selectedWorkerStatus: normalizedString(selectedWorker?.status).toUpperCase(),
    executionMode: normalizedString(selectedWorker?.workerType).toLowerCase() === "managed_agent" && normalizedString(selectedWorker?.adapterId).toLowerCase() === "codex"
      ? "managed_codex_worker"
      : "raw_model_invoke",
    progressItems: events.filter((item) => {
      const type = normalizedString(item?.eventType);
      return type.startsWith("worker.") || type.startsWith("tool_action.") || type.startsWith("tool_proposal.") || type.startsWith("approval.") || type.startsWith("session.");
    }).slice(-10)
  };
}

function formatThreadSubtitle(task = {}, latestSession = {}) {
  return [normalizedString(task?.status, "NEW"), normalizedString(latestSession?.status), normalizedString(latestSession?.sessionId)].filter(Boolean).join(" | ");
}

function buildThreadReviewModel(thread = {}, selectedSessionId = "") {
  const sessionViews = Array.isArray(thread?.sessionViews) ? thread.sessionViews : [];
  const sessions = sessionViews.map((item) => ({ session: item?.session || {}, summary: buildSessionSummary(item) }));
  const selected = sessionViews.find((item) => normalizedString(item?.session?.sessionId) === normalizedString(selectedSessionId)) || sessionViews[0] || null;
  const selectedSummary = selected ? buildSessionSummary(selected) : null;
  return {
    task: thread?.task || {},
    sessions,
    sessionViews,
    selectedSession: selected?.session || null,
    selectedSummary,
    selectedActivity: selectedSummary
      ? {
          taskStatus: selectedSummary.taskStatus,
          sessionStatus: selectedSummary.sessionStatus,
          selectedWorkerStatus: selectedSummary.selectedWorkerStatus,
          executionMode: selectedSummary.executionMode,
          latestWorkerSummary: selectedSummary.latestWorkerSummary,
          progressItems: selectedSummary.progressItems
        }
      : null,
    selectedTranscript: selectedSummary?.transcript || null
  };
}

module.exports = {
  buildThreadReviewModel,
  formatThreadSubtitle,
  isTerminalStatus,
  latestKnownSequence,
  listSessionEvents,
  listToolProposals,
  latestManagedWorkerTranscript
};
