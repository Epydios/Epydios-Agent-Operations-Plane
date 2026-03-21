import test from "node:test";
import assert from "node:assert/strict";
import { AgentOpsApi } from "../api.js";

function withWindow(origin, run) {
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      origin
    }
  };
  try {
    return run();
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}

test("AgentOpsApi routes native live loopback bases through the desktop origin", () =>
  withWindow("http://desktop.local", () => {
    const api = new AgentOpsApi(
      {
        nativeShell: { mode: "live" },
        runtimeApiBaseUrl: "http://127.0.0.1:8080",
        endpoints: { health: "/healthz" }
      },
      () => ""
    );

    assert.equal(api.resolveBaseUrl("http://127.0.0.1:8080"), "http://desktop.local/");
    assert.equal(api.resolveBaseUrl("http://localhost:8080"), "http://desktop.local/");
  }));

test("AgentOpsApi keeps direct loopback bases outside native live mode", () =>
  withWindow("http://desktop.local", () => {
    const api = new AgentOpsApi(
      {
        nativeShell: { mode: "mock" },
        runtimeApiBaseUrl: "http://127.0.0.1:8080",
        endpoints: { health: "/healthz" }
      },
      () => ""
    );

    assert.equal(api.resolveBaseUrl("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  }));

test("AgentOpsApi getHealth uses same-origin runtime path in native live mode", async () =>
  withWindow("http://desktop.local", async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200
      };
    };

    try {
      const api = new AgentOpsApi(
        {
          mockMode: false,
          nativeShell: { mode: "live" },
          runtimeApiBaseUrl: "http://127.0.0.1:8080",
          endpoints: { health: "/healthz" }
        },
        () => ""
      );

      const health = await api.getHealth();

      assert.equal(calls[0], "http://desktop.local/healthz");
      assert.equal(health.runtime.status, "ok");
    } finally {
      if (originalFetch === undefined) {
        delete globalThis.fetch;
      } else {
        globalThis.fetch = originalFetch;
      }
    }
  }));
