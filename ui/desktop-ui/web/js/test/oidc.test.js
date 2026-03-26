import test from "node:test";
import assert from "node:assert/strict";

import { beginLogin, getSession, logout } from "../oidc.js";

function createSessionStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

test.beforeEach(() => {
  globalThis.sessionStorage = createSessionStorage();
  globalThis.window = {
    location: {
      hash: "",
      search: "",
      href: "http://127.0.0.1:4178/",
      assign() {}
    }
  };
  globalThis.history = {
    replaceState() {}
  };
  logout();
});

test.after(() => {
  delete globalThis.sessionStorage;
  delete globalThis.window;
  delete globalThis.history;
});

test("oidc beginLogin uses verifier-scoped mock login when requested", async () => {
  let assignedURL = "";
  globalThis.window.location.assign = (value) => {
    assignedURL = String(value || "");
  };

  await beginLogin({
    mockMode: false,
    auth: {
      enabled: true,
      mockLogin: true
    }
  });

  const session = getSession();
  assert.equal(session.authenticated, true);
  assert.equal(session.token, "mock-token");
  assert.equal(session.claims.tenant_id, "tenant-demo");
  assert.equal(session.claims.project_id, "project-core");
  assert.equal(assignedURL, "");
});
