#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "${RUN_M14_BROWSER_SMOKE:-0}" != "1" ]; then
  echo "V-M14-UI-011 SKIP: set RUN_M14_BROWSER_SMOKE=1 to run Safari WebDriver browser smoke."
  exit 0
fi

if ! command -v safaridriver >/dev/null 2>&1; then
  echo "V-M14-UI-011 FAIL: safaridriver is not available on this host." >&2
  exit 1
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
WD_PORT="${WD_PORT:-4444}"
APP_URL="http://${HOST}:${PORT}/"
WEBDRIVER_URL="http://${HOST}:${WD_PORT}"

SERVER_LOG="/tmp/verify-m14-ui-011-server.log"
WEBDRIVER_LOG="/tmp/verify-m14-ui-011-webdriver.log"

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


session_id = ""
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
        "document.querySelectorAll('#context-project-select option').length > 1 && "
        "!!document.querySelector('[data-homeops-action=\"open-approvals-pending\"]');",
        timeout=30,
        label="context and HomeOps controls",
    )

    selected_project = exec_js(
        session_id,
        """
const select = document.getElementById('context-project-select');
if (!select) return '';
const option = Array.from(select.options).find((item) => item.value);
if (!option) return '';
select.value = option.value;
select.dispatchEvent(new Event('change', { bubbles: true }));
return option.value;
""",
    )
    if not selected_project:
        raise RuntimeError("Could not pick a non-empty project in context selector.")

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
        [selected_project],
        label="project scope propagation",
    )

    endpoint_id = exec_js(
        session_id,
        """
const badge = document.querySelector('#context-endpoint-badges [data-context-endpoint-id]');
if (!badge) return '';
const endpointId = badge.getAttribute('data-context-endpoint-id') || '';
badge.click();
return endpointId;
""",
    )
    if endpoint_id:
        wait_until(
            session_id,
            """
const endpointId = arguments[0];
const row = document.querySelector(`[data-settings-endpoint-id="${endpointId}"]`);
const integrationBoard = document.getElementById('settingsops-integration-board');
const activeView = document.getElementById('workspace-layout')?.dataset?.workspaceView || '';
return (!!row && row.classList.contains('settings-row-focus')) || (activeView === 'settingsops' && !!integrationBoard);
""",
            [endpoint_id],
            label="endpoint badge settingsops pivot",
        )

    def click_triage(action_id, wait_script, wait_label):
        clicked = exec_js(
            session_id,
            """
const action = arguments[0];
const homeTab = document.querySelector('[data-workspace-tab="homeops"]');
if (homeTab) {
  homeTab.click();
}
const button = document.querySelector(`[data-homeops-action="${action}"]`);
if (!button) return false;
button.click();
return true;
""",
            [action_id],
        )
        if not clicked:
            raise RuntimeError(f"Missing triage action button: {action_id}")
        wait_until(session_id, wait_script, label=wait_label)

    click_triage(
        "open-approvals-pending",
        "return document.getElementById('approvals-status-filter')?.value === 'PENDING';",
        "approvals pending filter",
    )
    click_triage(
        "open-audit-deny",
        "return document.getElementById('audit-decision-filter')?.value === 'DENY';",
        "audit deny filter",
    )
    click_triage(
        "open-incidentops-active",
        "return !!document.querySelector('#incidentops-content [data-domain-root=\"incidentops\"]');",
        "incidentops active board",
    )

    run_id = ""
    try:
        run_id = wait_until(
            session_id,
            """
const openButton = document.querySelector('[data-approval-open-run-id]');
if (!openButton) return '';
const runId = openButton.getAttribute('data-approval-open-run-id') || '';
if (!window.__m14ApprovalRunOpened) {
  window.__m14ApprovalRunOpened = runId;
  openButton.click();
}
return runId;
""",
            timeout=12,
            label="approval queue open-run action",
        )
    except Exception:
        run_id = ""

    if not run_id:
        exec_js(
            session_id,
            """
const status = document.getElementById('approvals-status-filter');
if (status) {
  status.value = '';
  status.dispatchEvent(new Event('change', { bubbles: true }));
}
const apply = document.getElementById('approvals-apply-button');
if (apply) apply.click();
return true;
""",
        )
        try:
            run_id = wait_until(
                session_id,
                """
const openButton = document.querySelector('[data-approval-open-run-id]');
if (!openButton) return '';
const runId = openButton.getAttribute('data-approval-open-run-id') || '';
if (!window.__m14ApprovalRunOpenedAny) {
  window.__m14ApprovalRunOpenedAny = runId;
  openButton.click();
}
return runId;
""",
                timeout=12,
                label="approval queue open-run action (any status)",
            )
        except Exception:
            run_id = ""

    if not run_id:
        run_id = exec_js(
            session_id,
            """
const runButton = document.querySelector('#runs-content [data-run-id]');
if (!runButton) return '';
const runId = runButton.getAttribute('data-run-id') || '';
runButton.click();
return runId;
""",
        )
    if not run_id:
        raise RuntimeError("Could not open run detail from approvals queue or runs list.")

    wait_until(
        session_id,
        """
const runId = arguments[0];
return !!document.querySelector(`[data-open-approval-run-id="${runId}"]`);
""",
        [run_id],
        label="run-detail reverse approval button",
    )
    time.sleep(6.2)
    detail_persisted = exec_js(
        session_id,
        """
const runId = arguments[0];
const selected = document.getElementById('run-detail-content')?.dataset?.selectedRunId || '';
const hasReverse = !!document.querySelector(`[data-open-approval-run-id="${runId}"]`);
const detailText = (document.getElementById('run-detail-content')?.textContent || '').toLowerCase();
const resetToPlaceholder = detailText.includes('select a run to view detail');
return selected === runId && hasReverse && !resetToPlaceholder;
""",
        [run_id],
    )
    if not detail_persisted:
        raise RuntimeError("Run detail collapsed after refresh interval; selected run state did not persist.")
    reverse_clicked = exec_js(
        session_id,
        """
const runId = arguments[0];
const reverseButton = document.querySelector(`[data-open-approval-run-id="${runId}"]`);
if (!reverseButton) return false;
reverseButton.click();
return true;
""",
        [run_id],
    )
    if not reverse_clicked:
        raise RuntimeError("Could not execute run-detail reverse approval jump.")

    wait_until(
        session_id,
        """
const project = arguments[0];
return document.getElementById('approvals-project-filter')?.value === project;
""",
        [selected_project],
        label="reverse approval jump filter sync",
    )

    incident_entry_id = exec_js(
        session_id,
        """
const exportButton = document.getElementById('audit-export-incident-button');
if (!exportButton) return '';
exportButton.click();
return 'clicked';
""",
    )
    if not incident_entry_id:
        raise RuntimeError("Could not trigger incident package export from browser smoke.")

    incident_entry_id = wait_until(
        session_id,
        """
const row = document.querySelector('[data-incident-history-entry-id]');
if (!row) return '';
const status = row.querySelector('[data-incident-history-status]')?.getAttribute('data-incident-history-status') || '';
if (status !== 'drafted') return '';
return row.getAttribute('data-incident-history-entry-id') || '';
""",
        timeout=20,
        label="incident queue entry after export",
    )
    if not incident_entry_id:
        raise RuntimeError("Incident queue entry was not created by export action.")

    def transition_incident(entry_id, next_status):
        clicked = exec_js(
            session_id,
            """
const entryId = arguments[0];
const nextStatus = arguments[1];
const row = Array.from(document.querySelectorAll('[data-incident-history-entry-id]')).find(
  (item) => (item.getAttribute('data-incident-history-entry-id') || '') === entryId
);
if (!row) return false;
const button = Array.from(row.querySelectorAll('[data-incident-history-next-status]')).find(
  (item) => (item.getAttribute('data-incident-history-next-status') || '') === nextStatus
);
if (!button) return false;
button.click();
return true;
""",
            [entry_id, next_status],
        )
        if not clicked:
            raise RuntimeError(f"Missing incident transition button to {next_status} for entry={entry_id}")

        wait_until(
            session_id,
            """
const entryId = arguments[0];
const expected = arguments[1];
const row = Array.from(document.querySelectorAll('[data-incident-history-entry-id]')).find(
  (item) => (item.getAttribute('data-incident-history-entry-id') || '') === entryId
);
if (!row) return false;
const status = row.querySelector('[data-incident-history-status]')?.getAttribute('data-incident-history-status') || '';
return status === expected;
""",
            [entry_id, next_status],
            label=f"incident status -> {next_status}",
        )

    transition_incident(incident_entry_id, "filed")
    transition_incident(incident_entry_id, "closed")
    transition_incident(incident_entry_id, "filed")
    transition_incident(incident_entry_id, "closed")

    print("V-M14-UI-011 PASS: browser smoke validated context scope, HomeOps quick actions, run/approval jumps, endpoint badge jumps, and incident export lifecycle transitions.")
except Exception as err:
    print(f"V-M14-UI-011 FAIL: {err}", file=sys.stderr)
    sys.exit(1)
finally:
    if session_id:
        try:
            wd("DELETE", f"/session/{session_id}")
        except Exception:
            pass
PY
