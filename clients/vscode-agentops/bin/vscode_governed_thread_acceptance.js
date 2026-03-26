#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");

const { AgentOpsRuntimeClient } = require("../lib/runtimeClient");
const { buildThreadReviewModel, latestKnownSequence } = require("../lib/sessionReview");
const { buildAuditEvidenceHandoff } = require("../lib/handoffSummary");

function stampUtc() {
  const value = new Date();
  const yyyy = value.getUTCFullYear();
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(value.getUTCDate()).padStart(2, "0");
  const hh = String(value.getUTCHours()).padStart(2, "0");
  const mi = String(value.getUTCMinutes()).padStart(2, "0");
  const ss = String(value.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function createConfigGetter(settings) {
  return {
    get(key) {
      return settings[key];
    }
  };
}

function isoNow() {
  return new Date().toISOString();
}

function createRuntimeState() {
  const baseTask = {
    taskId: "task-vscode-proof-1",
    tenantId: "tenant-demo",
    projectId: "project-payments",
    title: "Review governed VS Code request",
    intent: "Validate the first bounded VS Code governed turn path.",
    requestedBy: "operator@example.com",
    source: "vscode",
    status: "IN_PROGRESS",
    createdAt: isoNow(),
    updatedAt: isoNow(),
    latestSessionId: "sess-vscode-baseline"
  };
  const baselineTimeline = {
    session: {
      sessionId: "sess-vscode-baseline",
      taskId: baseTask.taskId,
      tenantId: baseTask.tenantId,
      projectId: baseTask.projectId,
      status: "COMPLETED",
      sessionType: "interactive",
      startedAt: isoNow(),
      updatedAt: isoNow()
    },
    task: baseTask,
    selectedWorker: {
      workerId: "worker-baseline",
      workerType: "managed_agent",
      adapterId: "codex",
      status: "COMPLETED",
      createdAt: isoNow()
    },
    approvalCheckpoints: [],
    toolActions: [
      {
        toolActionId: "tool-baseline-1",
        toolType: "managed_agent_turn",
        status: "COMPLETED",
        resultPayload: {
          route: "managed_worker_gateway_process",
          boundaryProviderId: "agentops_gateway",
          endpointRef: "vscode-proof-endpoint",
          rawResponse: [{ type: "message", text: "Baseline governed thread ready." }]
        }
      }
    ],
    evidenceRecords: [
      {
        evidenceId: "evidence-baseline-1",
        kind: "audit_bundle",
        summary: "Initial governed review bundle is available."
      }
    ],
    events: [
      {
        eventId: "evt-baseline-1",
        sequence: 1,
        timestamp: isoNow(),
        eventType: "session.status.changed",
        payload: {
          status: "COMPLETED",
          summary: "Baseline governed review completed."
        }
      },
      {
        eventId: "evt-baseline-2",
        sequence: 2,
        timestamp: isoNow(),
        eventType: "evidence.recorded",
        payload: {
          kind: "audit_bundle",
          summary: "Initial governed review bundle is available."
        }
      }
    ],
    latestEventSequence: 2
  };
  return {
    task: baseTask,
    sessions: [
      {
        sessionId: baselineTimeline.session.sessionId,
        taskId: baseTask.taskId,
        tenantId: baseTask.tenantId,
        projectId: baseTask.projectId,
        status: baselineTimeline.session.status,
        sessionType: "interactive",
        createdAt: baselineTimeline.session.startedAt,
        updatedAt: baselineTimeline.session.updatedAt
      }
    ],
    timelines: {
      [baselineTimeline.session.sessionId]: baselineTimeline
    }
  };
}

function nextSequence(timeline) {
  const value = Number(timeline.latestEventSequence || 0) || 0;
  timeline.latestEventSequence = value + 1;
  return timeline.latestEventSequence;
}

function pushEvent(timeline, eventType, payload) {
  const sequence = nextSequence(timeline);
  timeline.events.push({
    eventId: `evt-${timeline.session.sessionId}-${sequence}`,
    sequence,
    timestamp: isoNow(),
    eventType,
    payload
  });
  timeline.session.updatedAt = isoNow();
  timeline.task.updatedAt = timeline.session.updatedAt;
}

function ensureGovernedSession(state) {
  const sessionId = "sess-vscode-proof";
  if (!state.timelines[sessionId]) {
    const startedAt = isoNow();
    state.timelines[sessionId] = {
      session: {
        sessionId,
        taskId: state.task.taskId,
        tenantId: state.task.tenantId,
        projectId: state.task.projectId,
        status: "AWAITING_APPROVAL",
        sessionType: "interactive",
        startedAt,
        updatedAt: startedAt
      },
      task: state.task,
      selectedWorker: {
        workerId: "worker-vscode-proof",
        workerType: "managed_agent",
        adapterId: "codex",
        status: "WAITING",
        createdAt: startedAt
      },
      approvalCheckpoints: [
        {
          checkpointId: "approval-vscode-proof-1",
          status: "PENDING",
          reason: "Review the first governed VS Code turn before execution continues."
        }
      ],
      toolActions: [
        {
          toolActionId: "tool-vscode-proof-1",
          toolType: "managed_agent_turn",
          status: "AWAITING_APPROVAL",
          resultPayload: {
            route: "managed_worker_gateway_process",
            boundaryProviderId: "agentops_gateway",
            endpointRef: "vscode-proof-endpoint",
            rawResponse: [{ type: "message", text: "Governed VS Code turn is awaiting review." }]
          }
        }
      ],
      evidenceRecords: [],
      events: [],
      latestEventSequence: 0
    };
    state.sessions.unshift({
      sessionId,
      taskId: state.task.taskId,
      tenantId: state.task.tenantId,
      projectId: state.task.projectId,
      status: "AWAITING_APPROVAL",
      sessionType: "interactive",
      createdAt: startedAt,
      updatedAt: startedAt
    });
    state.task.latestSessionId = sessionId;
    pushEvent(state.timelines[sessionId], "worker.progress", {
      summary: "Governed VS Code turn submitted for review."
    });
    pushEvent(state.timelines[sessionId], "approval.requested", {
      status: "PENDING",
      reason: "Review the first governed VS Code turn before execution continues.",
      scope: "worker_action"
    });
    pushEvent(state.timelines[sessionId], "tool_proposal.generated", {
      proposalId: "proposal-vscode-proof-1",
      proposalType: "terminal_command",
      summary: "Run a safe workspace summary command.",
      payload: {
        command: "pwd"
      }
    });
  }
  return state.timelines[sessionId];
}

function jsonResponse(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function eventStreamResponse(response, items) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  response.end(
    (Array.isArray(items) ? items : []).map((item) => `event: message\ndata: ${JSON.stringify(item)}\n\n`).join("")
  );
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function startMockRuntime(log) {
  const state = createRuntimeState();
  const token = "proof-token";
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const auth = normalizedString(request.headers.authorization);
    if (auth !== `Bearer ${token}`) {
      log(`401 ${request.method} ${url.pathname}`);
      jsonResponse(response, 401, { error: "token rejected" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1alpha2/runtime/tasks") {
      log(`200 ${request.method} ${url.pathname}`);
      jsonResponse(response, 200, { items: [state.task] });
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1alpha2/runtime/sessions") {
      const taskId = normalizedString(url.searchParams.get("taskId"));
      const items = state.sessions.filter((item) => !taskId || item.taskId === taskId);
      log(`200 ${request.method} ${url.pathname}`);
      jsonResponse(response, 200, { items });
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/v1alpha2/runtime/sessions/") && url.pathname.endsWith("/timeline")) {
      const sessionId = decodeURIComponent(url.pathname.split("/")[4] || "");
      const timeline = state.timelines[sessionId];
      if (!timeline) {
        jsonResponse(response, 404, { error: "session not found" });
        return;
      }
      log(`200 ${request.method} ${url.pathname}`);
      jsonResponse(response, 200, timeline);
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/v1alpha2/runtime/sessions/") && url.pathname.endsWith("/events/stream")) {
      const sessionId = decodeURIComponent(url.pathname.split("/")[4] || "");
      const timeline = state.timelines[sessionId];
      if (!timeline) {
        jsonResponse(response, 404, { error: "session not found" });
        return;
      }
      const afterSequence = Number(url.searchParams.get("afterSequence") || 0) || 0;
      const items = timeline.events.filter((item) => Number(item.sequence || 0) > afterSequence);
      log(`200 ${request.method} ${url.pathname}?afterSequence=${afterSequence}`);
      eventStreamResponse(response, items);
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1alpha1/runtime/integrations/invoke") {
      const body = JSON.parse(await readRequestBody(request) || "{}");
      const timeline = ensureGovernedSession(state);
      timeline.task.intent = normalizedString(body?.prompt, timeline.task.intent);
      timeline.task.updatedAt = isoNow();
      state.task.latestSessionId = timeline.session.sessionId;
      log(`200 ${request.method} ${url.pathname}`);
      jsonResponse(response, 200, { applied: true, sessionId: timeline.session.sessionId });
      return;
    }
    if (request.method === "POST" && url.pathname.includes("/approval-checkpoints/") && url.pathname.endsWith("/decision")) {
      const body = JSON.parse(await readRequestBody(request) || "{}");
      const parts = url.pathname.split("/");
      const sessionId = decodeURIComponent(parts[4] || "");
      const checkpointId = decodeURIComponent(parts[6] || "");
      const timeline = state.timelines[sessionId];
      const checkpoint = Array.isArray(timeline?.approvalCheckpoints)
        ? timeline.approvalCheckpoints.find((item) => normalizedString(item?.checkpointId) === checkpointId)
        : null;
      if (!timeline || !checkpoint) {
        jsonResponse(response, 404, { error: "approval not found" });
        return;
      }
      checkpoint.status = normalizedString(body?.decision, "APPROVE").toUpperCase() === "DENY" ? "DENIED" : "APPROVED";
      checkpoint.decision = checkpoint.status === "DENIED" ? "DENY" : "APPROVE";
      checkpoint.reason = normalizedString(body?.reason, checkpoint.reason);
      timeline.session.status = "RUNNING";
      timeline.selectedWorker.status = "RUNNING";
      const sessionRecord = state.sessions.find((item) => item.sessionId === sessionId);
      if (sessionRecord) {
        sessionRecord.status = "RUNNING";
        sessionRecord.updatedAt = isoNow();
      }
      pushEvent(timeline, "approval.status.changed", {
        checkpointId,
        status: checkpoint.status,
        decision: checkpoint.decision,
        reason: checkpoint.reason
      });
      log(`200 ${request.method} ${url.pathname}`);
      jsonResponse(response, 200, { applied: true, checkpointId, decision: checkpoint.decision });
      return;
    }
    if (request.method === "POST" && url.pathname.includes("/tool-proposals/") && url.pathname.endsWith("/decision")) {
      const body = JSON.parse(await readRequestBody(request) || "{}");
      const parts = url.pathname.split("/");
      const sessionId = decodeURIComponent(parts[4] || "");
      const proposalId = decodeURIComponent(parts[6] || "");
      const timeline = state.timelines[sessionId];
      if (!timeline) {
        jsonResponse(response, 404, { error: "proposal not found" });
        return;
      }
      const decision = normalizedString(body?.decision, "APPROVE").toUpperCase() === "DENY" ? "DENY" : "APPROVE";
      pushEvent(timeline, "tool_proposal.decided", {
        proposalId,
        status: decision === "DENY" ? "DENIED" : "APPROVED",
        decision,
        reason: normalizedString(body?.reason, "Operator accepted the proposed workspace summary command."),
        toolActionId: "tool-vscode-proof-1"
      });
      timeline.toolActions[0].status = "COMPLETED";
      timeline.toolActions[0].resultPayload.rawResponse = [{ type: "message", text: "Governed VS Code turn completed with proof available." }];
      timeline.selectedWorker.status = "COMPLETED";
      timeline.session.status = "COMPLETED";
      const sessionRecord = state.sessions.find((item) => item.sessionId === sessionId);
      if (sessionRecord) {
        sessionRecord.status = "COMPLETED";
        sessionRecord.updatedAt = isoNow();
      }
      timeline.evidenceRecords.push({
        evidenceId: "evidence-vscode-proof-1",
        kind: "audit_bundle",
        summary: "Governed VS Code request bundle ready for downstream review."
      });
      pushEvent(timeline, "evidence.recorded", {
        evidenceId: "evidence-vscode-proof-1",
        kind: "audit_bundle",
        summary: "Governed VS Code request bundle ready for downstream review."
      });
      log(`200 ${request.method} ${url.pathname}`);
      jsonResponse(response, 200, { applied: true, proposalId, decision });
      return;
    }
    log(`404 ${request.method} ${url.pathname}`);
    jsonResponse(response, 404, { error: "not found" });
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        state,
        token,
        runtimeApiBaseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

async function main() {
  const stamp = stampUtc();
  const repoRoot = path.resolve(__dirname, "../../..");
  const phaseRoot = path.join(repoRoot, ".epydios", "internal-readiness", "vscode-governed-thread-proof");
  const runRoot = path.join(phaseRoot, stamp);
  fs.mkdirSync(runRoot, { recursive: true });
  fs.mkdirSync(phaseRoot, { recursive: true });
  const logPath = path.join(runRoot, "verify-vscode-governed-thread.log");
  const summaryPath = path.join(runRoot, "verify-vscode-governed-thread.summary.json");
  const checklistPath = path.join(runRoot, "operator-vscode-governed-thread-checklist.json");
  const latestLogPath = path.join(phaseRoot, "verify-vscode-governed-thread-latest.log");
  const latestSummaryPath = path.join(phaseRoot, "verify-vscode-governed-thread-latest.summary.json");
  const eventLog = [];
  const log = (line) => {
    const entry = `[${new Date().toISOString()}] ${line}`;
    eventLog.push(entry);
    fs.appendFileSync(logPath, `${entry}\n`);
  };

  const runtime = await startMockRuntime(log);
  try {
    const unauthenticatedClient = new AgentOpsRuntimeClient(() => createConfigGetter({
      runtimeApiBaseUrl: runtime.runtimeApiBaseUrl,
      tenantId: "tenant-demo",
      projectId: "project-payments",
      authToken: "",
      liveFollowWaitSeconds: 12,
      includeLegacySessions: false
    }));
    const authState = await unauthenticatedClient.checkConnection();
    assert.equal(authState.state, "auth_required");
    log("proved auth-required connection state");

    const client = new AgentOpsRuntimeClient(() => createConfigGetter({
      runtimeApiBaseUrl: runtime.runtimeApiBaseUrl,
      tenantId: "tenant-demo",
      projectId: "project-payments",
      authToken: runtime.token,
      liveFollowWaitSeconds: 12,
      includeLegacySessions: false
    }));
    const connectedState = await client.checkConnection();
    assert.equal(connectedState.state, "connected");
    log("proved connected runtime state");

    const baselineThread = await client.loadThread("task-vscode-proof-1", {
      tenantId: "tenant-demo",
      projectId: "project-payments",
      includeLegacy: false
    });
    assert.equal(normalizedString(baselineThread.task?.taskId), "task-vscode-proof-1");
    log("loaded governed thread into VS Code review client");

    const invoke = await client.invokeAgentTurn({
      meta: {
        tenantId: "tenant-demo",
        projectId: "project-payments",
        requestId: "vscode-proof-turn-1"
      },
      taskId: "task-vscode-proof-1",
      prompt: "Summarize the governed workspace change and stage the next safe command.",
      executionMode: "managed_codex_worker",
      agentProfileId: "codex",
      maxOutputTokens: 256
    });
    assert.equal(normalizedString(invoke?.sessionId), "sess-vscode-proof");
    log("submitted governed VS Code turn");

    const reviewThread = await client.loadThread("task-vscode-proof-1", {
      tenantId: "tenant-demo",
      projectId: "project-payments",
      includeLegacy: false
    });
    const reviewModel = buildThreadReviewModel(reviewThread, "sess-vscode-proof");
    assert.equal(reviewModel.selectedSummary.approvals.length, 1);
    assert.equal(reviewModel.selectedSummary.toolProposals.length, 1);
    log("loaded governed review state with approval and proposal checkpoints");

    await client.submitSessionApprovalDecision("sess-vscode-proof", "approval-vscode-proof-1", "APPROVE", {
      tenantId: "tenant-demo",
      projectId: "project-payments",
      reason: "Review accepted in bounded VS Code proof."
    });
    log("resolved approval checkpoint");

    await client.submitSessionToolProposalDecision("sess-vscode-proof", "proposal-vscode-proof-1", "APPROVE", {
      tenantId: "tenant-demo",
      projectId: "project-payments",
      reason: "Safe workspace summary command approved."
    });
    log("resolved tool proposal");

    const followedSession = reviewThread.sessionViews.find((item) => normalizedString(item?.session?.sessionId) === "sess-vscode-proof");
    const eventStream = await client.getSessionEventStream("sess-vscode-proof", {
      afterSequence: latestKnownSequence(followedSession),
      waitSeconds: 1,
      follow: true
    });
    assert.ok(Array.isArray(eventStream.items));
    assert.ok(eventStream.items.length >= 2);
    log("followed governed session event stream");

    const finalThread = await client.loadThread("task-vscode-proof-1", {
      tenantId: "tenant-demo",
      projectId: "project-payments",
      includeLegacy: false
    });
    const finalModel = buildThreadReviewModel(finalThread, "sess-vscode-proof");
    assert.equal(finalModel.selectedSummary.sessionStatus, "COMPLETED");
    assert.equal(finalModel.selectedSummary.evidenceRecords.length, 1);
    const handoff = buildAuditEvidenceHandoff(finalModel);
    assert.match(handoff.renderedText, /AgentOps Audit and Evidence Handoff/);
    assert.match(handoff.renderedText, /Governed VS Code request bundle ready for downstream review/);
    log("proved audit and evidence handoff output");

    const checklist = {
      generated_at_utc: stamp,
      supported_path_vscode_governed_thread: {
        status: "pass",
        steps: [
          "connection/auth truth reported auth-required and connected states",
          "governed thread review loaded from the shared M16 runtime contract",
          "one governed VS Code turn submitted on the existing task",
          "approval checkpoint resolved through the IDE client contract",
          "tool proposal resolved through the IDE client contract",
          "live follow consumed session event stream updates",
          "audit and evidence handoff rendered explicitly from the same session"
        ],
        runtime_api_base_url: runtime.runtimeApiBaseUrl,
        summary_path: summaryPath,
        log_path: logPath
      }
    };
    const summary = {
      generated_at_utc: stamp,
      status: "vscode_governed_thread_proof_ready",
      reason: "VS Code bounded proof accepted connection/auth truth, one governed turn, approval and proposal resolution, live follow, and audit/evidence handoff on the shared M16 contract.",
      runtime_api_base_url: runtime.runtimeApiBaseUrl,
      log_path: logPath,
      checklist_path: checklistPath
    };
    writeJson(checklistPath, checklist);
    writeJson(summaryPath, summary);
    fs.copyFileSync(logPath, latestLogPath);
    fs.copyFileSync(summaryPath, latestSummaryPath);
    process.stdout.write("VS Code governed thread verifier passed.\n");
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exit(1);
});
