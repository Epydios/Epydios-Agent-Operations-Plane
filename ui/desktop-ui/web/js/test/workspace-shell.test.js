import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWorkspaceView } from "../shell/layout/workspace.js";

const VIEW_IDS = [
  "homeops",
  "agentops",
  "runtimeops",
  "platformops",
  "identityops",
  "networkops",
  "policyops",
  "guardrailops",
  "governanceops",
  "complianceops",
  "auditops",
  "evidenceops",
  "incidentops",
  "settingsops",
  "developerops"
];

test("workspace shell normalizes legacy workspace tokens into the *Ops left-rail views", () => {
  assert.equal(normalizeWorkspaceView("home", "homeops", VIEW_IDS), "homeops");
  assert.equal(normalizeWorkspaceView("agent", "homeops", VIEW_IDS), "agentops");
  assert.equal(normalizeWorkspaceView("identity", "homeops", VIEW_IDS), "identityops");
  assert.equal(normalizeWorkspaceView("history", "homeops", VIEW_IDS), "runtimeops");
  assert.equal(normalizeWorkspaceView("runs", "homeops", VIEW_IDS), "runtimeops");
  assert.equal(normalizeWorkspaceView("incidents", "homeops", VIEW_IDS), "incidentops");
  assert.equal(normalizeWorkspaceView("settings", "homeops", VIEW_IDS), "settingsops");
  assert.equal(normalizeWorkspaceView("developer", "homeops", VIEW_IDS), "developerops");
  assert.equal(normalizeWorkspaceView("operations", "homeops", VIEW_IDS), "developerops");
});

test("workspace shell keeps direct *Ops tokens stable", () => {
  assert.equal(normalizeWorkspaceView("homeops", "agentops", VIEW_IDS), "homeops");
  assert.equal(normalizeWorkspaceView("runtimeops", "homeops", VIEW_IDS), "runtimeops");
  assert.equal(normalizeWorkspaceView("settingsops", "homeops", VIEW_IDS), "settingsops");
});
