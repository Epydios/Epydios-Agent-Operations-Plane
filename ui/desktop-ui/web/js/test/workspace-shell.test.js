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
  "companionops",
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
  "logops",
  "settingsops",
  "developerops"
];

test("workspace shell normalizes legacy workspace tokens into the *Ops left-rail views", () => {
  assert.equal(normalizeWorkspaceView("home", "companionops", VIEW_IDS), "companionops");
  assert.equal(normalizeWorkspaceView("homeops", "companionops", VIEW_IDS), "companionops");
  assert.equal(normalizeWorkspaceView("companion", "companionops", VIEW_IDS), "companionops");
  assert.equal(normalizeWorkspaceView("agent", "companionops", VIEW_IDS), "agentops");
  assert.equal(normalizeWorkspaceView("identity", "companionops", VIEW_IDS), "identityops");
  assert.equal(normalizeWorkspaceView("history", "companionops", VIEW_IDS), "runtimeops");
  assert.equal(normalizeWorkspaceView("runs", "companionops", VIEW_IDS), "runtimeops");
  assert.equal(normalizeWorkspaceView("incidents", "companionops", VIEW_IDS), "incidentops");
  assert.equal(normalizeWorkspaceView("logs", "companionops", VIEW_IDS), "logops");
  assert.equal(normalizeWorkspaceView("settings", "companionops", VIEW_IDS), "settingsops");
  assert.equal(normalizeWorkspaceView("developer", "companionops", VIEW_IDS), "developerops");
  assert.equal(normalizeWorkspaceView("operations", "companionops", VIEW_IDS), "developerops");
});

test("workspace shell keeps direct *Ops tokens stable", () => {
  assert.equal(normalizeWorkspaceView("companionops", "agentops", VIEW_IDS), "companionops");
  assert.equal(normalizeWorkspaceView("runtimeops", "companionops", VIEW_IDS), "runtimeops");
  assert.equal(normalizeWorkspaceView("settingsops", "companionops", VIEW_IDS), "settingsops");
});

test("workspace shell does not leak provider inventory or diagnostics toggle into SettingsOps", () => {
  assert.doesNotMatch(INDEX_HTML, /Provider Contract Inventory/);
  assert.doesNotMatch(INDEX_HTML, /id="settings-advanced-toggle"/);
});

test("workspace shell reserves a native launcher status surface ahead of the workbench", () => {
  assert.match(INDEX_HTML, /id="native-launcher-status"/);
  assert.match(INDEX_HTML, /class="native-launcher-status"/);
  assert.match(INDEX_HTML, /id="companion-handoff-banner"/);
  assert.match(INDEX_HTML, /Companion/);
  assert.match(INDEX_HTML, /data-workspace-mode="companion"/);
  assert.match(INDEX_HTML, /data-workspace-mode="workbench"/);
  assert.match(INDEX_HTML, /data-workspace-tab="companionops"/);
  assert.match(INDEX_HTML, /Workbench depth/);
  assert.match(INDEX_HTML, /Live review/);
  assert.match(INDEX_HTML, /Platform and admin/);
  assert.match(INDEX_HTML, /LogOps/);
  assert.match(INDEX_HTML, /data-workspace-tab="logops"/);
});
