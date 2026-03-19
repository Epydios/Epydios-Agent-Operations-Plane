import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeWorkspaceView } from "../shell/layout/workspace.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_HTML = fs.readFileSync(
  path.resolve(__dirname, "../../index.html"),
  "utf8"
);

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

test("workspace shell does not leak provider inventory or diagnostics toggle into SettingsOps", () => {
  assert.doesNotMatch(INDEX_HTML, /Provider Contract Inventory/);
  assert.doesNotMatch(INDEX_HTML, /id="settings-advanced-toggle"/);
});

test("workspace shell reserves a native launcher status surface ahead of the workbench", () => {
  assert.match(INDEX_HTML, /id="native-launcher-status"/);
  assert.match(INDEX_HTML, /class="native-launcher-status"/);
});
