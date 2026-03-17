#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "${RUN_M14_BROWSER_STRESS:-0}" != "1" ]; then
  echo "V-M14-UI-028 SKIP: set RUN_M14_BROWSER_STRESS=1 to run browser stress scenario."
  exit 0
fi

if ! command -v safaridriver >/dev/null 2>&1; then
  echo "V-M14-UI-028 FAIL: safaridriver is not available on this host." >&2
  exit 1
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
WD_PORT="${WD_PORT:-4444}"
APP_URL="http://${HOST}:${PORT}/"
WEBDRIVER_URL="http://${HOST}:${WD_PORT}"

SERVER_LOG="/tmp/verify-m14-ui-028-server.log"
WEBDRIVER_LOG="/tmp/verify-m14-ui-028-webdriver.log"

server_pid=""
webdriver_pid=""
cleanup() {
  if [ -n "${webdriver_pid}" ]; then
    kill "${webdriver_pid}" >/dev/null 2>&1 || true
  fi
  if [ -n "${server_pid}" ]; then
    kill "${server_pid}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

"${MODULE_ROOT}/bin/run-dev.sh" >"${SERVER_LOG}" 2>&1 &
server_pid="$!"
for _ in $(seq 1 50); do
  if curl -sf "${APP_URL}" >/dev/null; then
    break
  fi
  sleep 0.2
done
curl -sSf "${APP_URL}" >/dev/null

safaridriver -p "${WD_PORT}" >"${WEBDRIVER_LOG}" 2>&1 &
webdriver_pid="$!"
for _ in $(seq 1 50); do
  if curl -sf "${WEBDRIVER_URL}/status" >/dev/null; then
    break
  fi
  sleep 0.2
done
curl -sSf "${WEBDRIVER_URL}/status" >/dev/null

APP_URL="${APP_URL}" WEBDRIVER_URL="${WEBDRIVER_URL}" python3 <<'PY'
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

APP_URL = os.environ["APP_URL"]
WEBDRIVER_URL = os.environ["WEBDRIVER_URL"]


def wd(method, path, payload=None, timeout=30):
    body = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{WEBDRIVER_URL}{path}", data=body, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"WebDriver HTTP {err.code} {err.reason}: {raw}") from err
    if not raw:
        return {}
    parsed = json.loads(raw)
    return parsed.get("value", parsed)


def exec_js(session_id, script, args=None):
    return wd(
        "POST",
        f"/session/{session_id}/execute/sync",
        {"script": script, "args": args or []},
    )


def wait_until(session_id, script, args=None, timeout=20, label="condition"):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            last = exec_js(session_id, script, args)
            if bool(last):
                return last
        except Exception as err:  # pragma: no cover - defensive wait loop
            last = str(err)
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {label}; last={last!r}")


def select_value(session_id, select_id, value):
    ok = exec_js(
        session_id,
        """
const id = arguments[0];
const value = arguments[1];
const el = document.getElementById(id);
if (!el || el.tagName !== "SELECT" || el.disabled) return false;
const has = Array.from(el.options).some((opt) => String(opt.value || "") === value);
if (!has) return false;
el.value = value;
el.dispatchEvent(new Event("change", { bubbles: true }));
return true;
""",
        [select_id, value],
    )
    if not ok:
        raise RuntimeError(f"Could not select {value!r} on #{select_id}")


def click_button(session_id, button_id):
    clicked = exec_js(
        session_id,
        """
const id = arguments[0];
const el = document.getElementById(id);
if (!el || el.disabled) return false;
el.click();
return true;
""",
        [button_id],
    )
    if not clicked:
        raise RuntimeError(f"Could not click button #{button_id}")


session_id = ""
summary = {
    "projectSwitches": 0,
    "themeChanges": 0,
    "triageClicks": 0,
    "refreshClicks": 0,
    "runBuilderSubmits": 0,
    "terminalSubmits": 0,
    "incidentExports": 0,
}

try:
    created = wd(
        "POST",
        "/session",
        {
            "capabilities": {
                "alwaysMatch": {
                    "browserName": "safari",
                    "acceptInsecureCerts": True,
                }
            }
        },
        timeout=60,
    )
    session_id = str(created.get("sessionId") or "").strip()
    if not session_id:
        raise RuntimeError(f"WebDriver session did not return sessionId: {created!r}")

    wd("POST", f"/session/{session_id}/url", {"url": APP_URL})
    wait_until(session_id, "return document.readyState === 'complete';", label="dom ready")
    wait_until(
        session_id,
        "return !!document.getElementById('context-project-select') && "
        "!!document.getElementById('settings-theme-mode') && "
        "!!document.getElementById('run-builder-submit-button') && "
        "!!document.getElementById('terminal-submit-button');",
        timeout=30,
        label="core controls",
    )
    wait_until(
        session_id,
        """
const s = document.getElementById('context-project-select');
if (!s) return false;
return Array.from(s.options).some((opt) => String(opt.value || '').trim() !== '');
""",
        timeout=30,
        label="non-empty project options",
    )

    exec_js(
        session_id,
        """
window.__m14StressErrors = [];
window.addEventListener("error", (event) => {
  window.__m14StressErrors.push({
    type: "error",
    message: String(event?.message || "unknown"),
    source: String(event?.filename || "")
  });
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  window.__m14StressErrors.push({
    type: "unhandledrejection",
    message: String(reason && reason.message ? reason.message : reason)
  });
});
return true;
""",
    )

    project_values = exec_js(
        session_id,
        """
const select = document.getElementById("context-project-select");
if (!select) return [];
return Array.from(select.options).map((opt) => String(opt.value || "")).filter(Boolean);
""",
    )
    if not isinstance(project_values, list) or len(project_values) == 0:
        auth_status = exec_js(
            session_id,
            "return String(document.getElementById('auth-status')?.textContent || '').trim();",
        )
        if auth_status != "Authenticated":
            click_button(session_id, "login-button")
            wait_until(
                session_id,
                "return String(document.getElementById('auth-status')?.textContent || '').trim() === 'Authenticated';",
                timeout=10,
                label="auth before stress project selection",
            )
            wait_until(
                session_id,
                """
const select = document.getElementById("context-project-select");
if (!select) return false;
return Array.from(select.options).some((opt) => String(opt.value || "").trim() !== "");
""",
                timeout=20,
                label="project options after login",
            )
            project_values = exec_js(
                session_id,
                """
const select = document.getElementById("context-project-select");
if (!select) return [];
return Array.from(select.options).map((opt) => String(opt.value || "")).filter(Boolean);
""",
            )
    if not isinstance(project_values, list) or len(project_values) == 0:
        raise RuntimeError("No non-empty project values are available in context selector.")

    loops = max(4, min(8, len(project_values) * 3))
    for i in range(loops):
        project = project_values[i % len(project_values)]
        select_value(session_id, "context-project-select", project)
        wait_until(
            session_id,
            """
const project = arguments[0];
return (
  document.getElementById('runs-project-filter')?.value === project &&
  document.getElementById('approvals-project-filter')?.value === project &&
  document.getElementById('audit-project-filter')?.value === project &&
  document.getElementById('rb-project-id')?.value === project
);
""",
            [project],
            timeout=25,
            label=f"project propagation {project}",
        )
        summary["projectSwitches"] += 1

    available_theme_modes = exec_js(
        session_id,
        """
const select = document.getElementById("settings-theme-mode");
if (!select) return [];
return Array.from(select.options).map((opt) => String(opt.value || "").trim().toLowerCase());
""",
    )
    desired_modes = ["light", "dark", "system", "dark", "light", "dark"]
    for mode in desired_modes:
        if mode not in available_theme_modes:
            continue
        select_value(session_id, "settings-theme-mode", mode)
        wait_until(
            session_id,
            "return document.documentElement.getAttribute('data-theme-mode') === arguments[0];",
            [mode],
            timeout=10,
            label=f"theme mode {mode}",
        )
        summary["themeChanges"] += 1

    for _ in range(3):
        click_button(session_id, "refresh-button")
        summary["refreshClicks"] += 1
        time.sleep(0.35)
    wait_until(
        session_id,
        "return !!document.getElementById('homeops-content') && !!document.getElementById('runs-content');",
        timeout=20,
        label="post-refresh render",
    )

    triage_actions = [
        ("open-approvals-pending", "return document.getElementById('approvals-status-filter')?.value === 'PENDING';"),
        ("open-audit-deny", "return document.getElementById('audit-decision-filter')?.value === 'DENY';"),
        ("open-incidentops-active", "return !!document.querySelector('#incidentops-content [data-domain-root=\"incidentops\"]');"),
        ("open-runs-attention", "return document.getElementById('runs-sort')?.value === 'updated_desc';"),
    ]
    for action, check_script in triage_actions:
        clicked = exec_js(
            session_id,
            """
const action = arguments[0];
const homeTab = document.querySelector('[data-workspace-tab="homeops"]');
if (homeTab) {
  homeTab.click();
}
const btn = document.querySelector(`[data-homeops-action="${action}"]`);
if (!btn) return false;
btn.click();
return true;
""",
            [action],
        )
        if clicked:
            wait_until(session_id, check_script, timeout=20, label=f"triage {action}")
            summary["triageClicks"] += 1

    exec_js(
        session_id,
        """
const tenant = (document.getElementById("tenant-value")?.textContent || "").trim() || "tenant-demo";
const project = (document.getElementById("context-project-select")?.value || "").trim() || "project-core";
const reqId = `stress-${Date.now()}-${Math.floor(Math.random()*1000)}`;
const setValue = (id, value) => { const el = document.getElementById(id); if (el) { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); } };
setValue("rb-request-id", reqId);
setValue("rb-tenant-id", tenant);
setValue("rb-project-id", project);
setValue("rb-target-os", "linux");
setValue("rb-target-profile", "sandbox_vm_autonomous");
setValue("rb-tier", "2");
return true;
""",
    )
    click_button(session_id, "run-builder-submit-button")
    wait_until(
        session_id,
        "const node=document.getElementById('run-builder-feedback'); return !!node && (node.textContent || '').trim().length > 0;",
        timeout=30,
        label="run builder feedback",
    )
    summary["runBuilderSubmits"] += 1

    exec_js(
        session_id,
        """
const runButton = document.querySelector('#runs-content [data-run-id]');
const runId = runButton ? String(runButton.getAttribute('data-run-id') || '') : '';
const runInput = document.getElementById('terminal-run-id');
const commandInput = document.getElementById('terminal-command');
const restricted = document.getElementById('terminal-restricted-host-request');
const readOnly = document.getElementById('terminal-read-only');
if (runInput) {
  runInput.value = runId || "run-stress-local";
  runInput.dispatchEvent(new Event("change", { bubbles: true }));
}
if (commandInput) {
  commandInput.value = "echo m14-ui-stress";
  commandInput.dispatchEvent(new Event("change", { bubbles: true }));
}
if (restricted) {
  restricted.checked = false;
  restricted.dispatchEvent(new Event("change", { bubbles: true }));
}
if (readOnly) {
  readOnly.checked = true;
  readOnly.dispatchEvent(new Event("change", { bubbles: true }));
}
return true;
""",
    )
    click_button(session_id, "terminal-submit-button")
    wait_until(
        session_id,
        "const node=document.getElementById('terminal-feedback'); return !!node && (node.textContent || '').trim().length > 0;",
        timeout=30,
        label="terminal feedback",
    )
    summary["terminalSubmits"] += 1

    initial_incident_rows = exec_js(
        session_id,
        """
const clearSearch = document.getElementById('incident-history-search-clear-button');
if (clearSearch && !clearSearch.disabled) {
  clearSearch.click();
}
const status = document.getElementById('incident-history-status-filter');
if (status) {
  status.value = '';
  status.dispatchEvent(new Event('change', { bubbles: true }));
}
const timeRange = document.getElementById('incident-history-time-range');
if (timeRange) {
  timeRange.value = 'any';
  timeRange.dispatchEvent(new Event('change', { bubbles: true }));
}
const timeFrom = document.getElementById('incident-history-time-from');
if (timeFrom) {
  timeFrom.value = '';
  timeFrom.dispatchEvent(new Event('change', { bubbles: true }));
}
const timeTo = document.getElementById('incident-history-time-to');
if (timeTo) {
  timeTo.value = '';
  timeTo.dispatchEvent(new Event('change', { bubbles: true }));
}
const quickAll = document.getElementById('incident-history-quick-all-button');
if (quickAll && !quickAll.disabled) {
  quickAll.click();
}
return document.querySelectorAll('[data-incident-history-entry-id]').length;
""",
    )

    for index in (1, 2):
        selected_run_id = exec_js(
            session_id,
            """
const current = String(document.getElementById('run-detail-content')?.dataset?.selectedRunId || '');
const runButtons = Array.from(document.querySelectorAll('#runs-content [data-run-id]'));
if (!runButtons.length) return '';
const currentButton = runButtons.find((node) => String(node.getAttribute('data-run-id') || '') === current);
const alternateButton = runButtons.find((node) => String(node.getAttribute('data-run-id') || '') !== current);
const target = currentButton || alternateButton || runButtons[0];
const runId = String(target.getAttribute('data-run-id') || '');
if (!runId) return '';
if (runId !== current) {
  target.click();
}
return runId;
""",
        )
        if not selected_run_id:
            raise RuntimeError("Could not open run detail before incident export.")
        wait_until(
            session_id,
            """
const selected = String(document.getElementById('run-detail-content')?.dataset?.selectedRunId || '');
const text = String(document.getElementById('run-detail-content')?.textContent || '');
return selected === arguments[0] && !text.includes('Select a run to view detail.');
""",
            [selected_run_id],
            timeout=20,
            label=f"run detail before incident export {index}",
        )

        click_button(session_id, "audit-export-incident-button")
        try:
            wait_until(
                session_id,
                """
const expectedCount = arguments[0];
return document.querySelectorAll('[data-incident-history-entry-id]').length >= expectedCount;
""",
                [int(initial_incident_rows or 0) + index],
                timeout=20,
                label=f"incident export queue growth {index}",
            )
        except RuntimeError as err:
            queue_debug = exec_js(
                session_id,
                """
return {
  count: document.querySelectorAll('[data-incident-history-entry-id]').length,
  ids: Array.from(document.querySelectorAll('[data-incident-history-entry-id]')).map((node) => String(node.getAttribute('data-incident-history-entry-id') || '')),
  packages: Array.from(document.querySelectorAll('[data-incident-history-entry-id] .title')).map((node) => String(node.textContent || '').trim()),
  statusFilter: String(document.getElementById('incident-history-status-filter')?.value || ''),
  search: String(document.getElementById('incident-history-search-input')?.value || ''),
  timeRange: String(document.getElementById('incident-history-time-range')?.value || ''),
  auditFeedback: String(document.getElementById('audit-feedback')?.textContent || document.getElementById('auditops-feedback')?.textContent || '').trim()
};
""",
            )
            raise RuntimeError(
                f"incident export queue growth {index} failed; debug={queue_debug!r}"
            ) from err
        summary["incidentExports"] += 1
        time.sleep(0.25)

    wait_until(
        session_id,
        "return document.querySelectorAll('[data-incident-history-entry-id]').length >= 1;",
        timeout=20,
        label="incident history rows after exports",
    )

    for button_id in [
        "incident-history-quick-all-button",
        "incident-history-quick-filed-button",
        "incident-history-quick-needs-closure-button",
        "incident-history-search-clear-button",
        "incident-history-clear-selection-button",
    ]:
        click_button(session_id, button_id)
    click_button(session_id, "incident-history-quick-all-button")
    wait_until(
        session_id,
        "return document.querySelectorAll('[data-incident-history-entry-id]').length >= 1;",
        timeout=20,
        label="incident rows visible in all filter",
    )

    time.sleep(1.5)
    runtime_errors = exec_js(
        session_id,
        "return Array.isArray(window.__m14StressErrors) ? window.__m14StressErrors : [];",
    )
    if runtime_errors:
        clipped = runtime_errors[:5]
        raise RuntimeError(f"Browser stress runtime errors detected: {clipped!r}")

    final_checks = exec_js(
        session_id,
        """
const required = [
  "governed-action-form",
  "settings-content",
  "run-builder-form",
  "terminal-form",
  "approvals-content",
  "runs-content",
  "audit-content",
  "incident-history-content"
];
const missing = required.filter((id) => !document.getElementById(id));
const themeMode = String(document.documentElement.getAttribute("data-theme-mode") || "");
const incidentCount = document.querySelectorAll("[data-incident-history-entry-id]").length;
return { missing, themeMode, incidentCount };
""",
    )
    if final_checks.get("missing"):
        raise RuntimeError(f"Missing required UI panels after stress: {final_checks['missing']!r}")
    if final_checks.get("themeMode") not in ("dark", "light", "system"):
        raise RuntimeError(f"Unexpected final theme mode: {final_checks.get('themeMode')!r}")
    if int(final_checks.get("incidentCount", 0)) < 1:
        raise RuntimeError("Expected at least one incident history row after stress exports.")

    print(
        "V-M14-UI-028 PASS: browser stress completed with "
        f"{summary['projectSwitches']} project switches, {summary['themeChanges']} theme flips, "
        f"{summary['triageClicks']} HomeOps actions, {summary['refreshClicks']} refreshes, "
        f"{summary['runBuilderSubmits']} run submit, {summary['terminalSubmits']} terminal submit, "
        f"{summary['incidentExports']} incident exports."
    )
except Exception as err:
    print(f"V-M14-UI-028 FAIL: {err}", file=sys.stderr)
    sys.exit(1)
finally:
    if session_id:
        try:
            wd("DELETE", f"/session/{session_id}")
        except Exception:
            pass
PY
