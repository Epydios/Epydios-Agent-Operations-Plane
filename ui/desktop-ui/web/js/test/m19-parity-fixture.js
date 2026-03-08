import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(HERE, "../../../../../clients/testdata/m19-cross-surface-parity.json");

function eventTimestamp(sequence) {
  const offset = Number(sequence || 0) || 0;
  return new Date(Date.UTC(2026, 2, 7, 22, 0, offset)).toISOString();
}

export async function loadM19ParityFixture() {
  return JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
}

export function buildSessionViewFromParityFixture(fixture) {
  const session = fixture?.session && typeof fixture.session === "object" ? fixture.session : {};
  const task = fixture?.task && typeof fixture.task === "object" ? fixture.task : {};
  const selectedWorker = fixture?.selectedWorker && typeof fixture.selectedWorker === "object" ? fixture.selectedWorker : {};
  const approvals = Array.isArray(fixture?.pendingApprovals) ? fixture.pendingApprovals : [];
  const events = Array.isArray(fixture?.events) ? fixture.events : [];
  const toolActions = Array.isArray(fixture?.toolActions) ? fixture.toolActions : [];
  const evidenceRecords = Array.isArray(fixture?.evidenceRecords) ? fixture.evidenceRecords : [];
  const normalizedSessionId = String(session.sessionId || "").trim();
  const normalizedTaskId = String(task.taskId || session.taskId || "").trim();
  return {
    sessionId: normalizedSessionId,
    source: "parity-fixture",
    status: "ready",
    message: "Loaded parity fixture state.",
    timeline: {
      session: {
        ...session,
        sessionId: normalizedSessionId,
        taskId: normalizedTaskId
      },
      task: {
        ...task,
        taskId: normalizedTaskId
      },
      selectedWorker,
      openApprovalCount: approvals.length,
      latestEventSequence: events.reduce((maxValue, item) => Math.max(maxValue, Number(item?.sequence || 0) || 0), 0),
      approvalCheckpoints: approvals.map((item, index) => ({
        ...item,
        sessionId: normalizedSessionId,
        createdAt: item.createdAt || eventTimestamp(index + 1)
      })),
      toolActions: toolActions.map((item, index) => ({
        ...item,
        sessionId: normalizedSessionId,
        createdAt: item.createdAt || eventTimestamp(index + 1)
      })),
      evidenceRecords: evidenceRecords.map((item, index) => ({
        evidenceId: item.evidenceId,
        sessionId: normalizedSessionId,
        kind: item.kind,
        uri: item.uri || `ref://evidence/${item.evidenceId || index + 1}`,
        createdAt: item.createdAt || eventTimestamp(index + 1),
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {}
      })),
      events: events.map((item) => ({
        ...item,
        sessionId: normalizedSessionId,
        timestamp: item.timestamp || eventTimestamp(item.sequence)
      }))
    },
    streamItems: []
  };
}

export function buildChatThreadFromParityFixture(fixture) {
  const sessionView = buildSessionViewFromParityFixture(fixture);
  return {
    taskId: fixture?.task?.taskId || fixture?.session?.taskId || "",
    tenantId: "tenant-parity",
    projectId: "project-parity",
    executionMode: "managed_codex_worker",
    agentProfileId: "codex",
    turns: [
      {
        requestId: "req-parity-1",
        prompt: "Inspect the failing checkout flow.",
        createdAt: eventTimestamp(0),
        response: {
          taskId: fixture?.task?.taskId || fixture?.session?.taskId || "",
          sessionId: fixture?.session?.sessionId || "",
          executionMode: "managed_codex_worker"
        },
        sessionView
      }
    ]
  };
}
