const test = require("node:test");
const assert = require("node:assert/strict");
const { AgentOpsRuntimeClient, parseEventStream } = require("../lib/runtimeClient");

test("parseEventStream extracts JSON data events", () => {
  const raw = [
    'event: message',
    'data: {"eventId":"evt-1","sequence":1}',
    '',
    'data: {"eventId":"evt-2","sequence":2}',
    ''
  ].join("\n");
  const items = parseEventStream(raw);
  assert.equal(items.length, 2);
  assert.equal(items[0].eventId, "evt-1");
  assert.equal(items[1].sequence, 2);
});

test("runtime client posts governed turn to integration invoke path", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({ applied: true, sessionId: "sess-1" }),
      text: async () => ""
    };
  };
  try {
    const client = new AgentOpsRuntimeClient(() => ({
      get(key) {
        const map = {
          runtimeApiBaseUrl: "http://127.0.0.1:8080",
          tenantId: "tenant-a",
          projectId: "project-a",
          authToken: "",
          liveFollowWaitSeconds: 12,
          includeLegacySessions: false
        };
        return map[key];
      }
    }));
    await client.invokeAgentTurn({
      taskId: "task-1",
      prompt: "Do the thing",
      executionMode: "managed_codex_worker",
      agentProfileId: "codex"
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:8080/v1alpha1/runtime/integrations/invoke");
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.taskId, "task-1");
    assert.equal(body.executionMode, "managed_codex_worker");
    assert.equal(body.agentProfileId, "codex");
    assert.equal(body.meta.tenantId, "tenant-a");
  } finally {
    global.fetch = originalFetch;
  }
});

test("runtime client checkConnection reports auth required when runtime rejects the token", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: async () => "token rejected"
  });
  try {
    const client = new AgentOpsRuntimeClient(() => ({
      get(key) {
        const map = {
          runtimeApiBaseUrl: "http://127.0.0.1:8080",
          tenantId: "tenant-a",
          projectId: "project-a",
          authToken: "",
          liveFollowWaitSeconds: 12,
          includeLegacySessions: false
        };
        return map[key];
      }
    }));
    const result = await client.checkConnection();
    assert.equal(result.state, "auth_required");
    assert.equal(result.authMode, "none");
  } finally {
    global.fetch = originalFetch;
  }
});

test("runtime client checkConnection reports connected when thread listing succeeds", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ items: [] }),
    text: async () => ""
  });
  try {
    const client = new AgentOpsRuntimeClient(() => ({
      get(key) {
        const map = {
          runtimeApiBaseUrl: "http://127.0.0.1:8080",
          tenantId: "tenant-a",
          projectId: "project-a",
          authToken: "proof-token",
          liveFollowWaitSeconds: 12,
          includeLegacySessions: false
        };
        return map[key];
      }
    }));
    const result = await client.checkConnection();
    assert.equal(result.state, "connected");
    assert.equal(result.authMode, "bearer");
    assert.equal(result.scopeState, "scoped");
  } finally {
    global.fetch = originalFetch;
  }
});
