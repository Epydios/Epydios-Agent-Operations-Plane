#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "${RUN_M14_BROWSER_SMOKE:-0}" != "1" ]; then
  echo "V-M14-UI-031 SKIP: set RUN_M14_BROWSER_SMOKE=1 to run the CompanionOps browser acceptance slice."
  exit 0
fi

if ! command -v safaridriver >/dev/null 2>&1; then
  echo "V-M14-UI-031 FAIL: safaridriver is not available on this host." >&2
  exit 1
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
WD_PORT="${WD_PORT:-4445}"
APP_URL="http://${HOST}:${PORT}/"
WEBDRIVER_URL="http://${HOST}:${WD_PORT}"

SERVER_LOG="/tmp/verify-m14-ui-031-server.log"
WEBDRIVER_LOG="/tmp/verify-m14-ui-031-webdriver.log"

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
        except Exception as err:
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
        """
return (
  document.getElementById('workspace-layout')?.dataset?.workspaceView === 'companionops' &&
  document.querySelector('[data-workspace-tab="companionops"]')?.getAttribute('aria-selected') === 'true' &&
  !!document.querySelector('[data-homeops-action="open-approval-item"]') &&
  !!document.getElementById('companion-handoff-banner')
);
""",
        timeout=30,
        label="CompanionOps default posture",
    )

    handoff = exec_js(
        session_id,
        """
const button = document.querySelector('[data-homeops-action="open-approval-item"]');
if (!button) return null;
return {
  runId: String(button.dataset.homeopsRunId || '').trim(),
  approvalId: String(button.dataset.homeopsApprovalId || '').trim(),
  label: String(button.textContent || '').trim()
};
""",
    )
    if not handoff or not handoff.get("runId"):
        raise RuntimeError(f"CompanionOps did not surface a concrete approval handoff: {handoff!r}")

    clicked = exec_js(
        session_id,
        """
const button = document.querySelector('[data-homeops-action="open-approval-item"]');
if (!button) return false;
button.click();
return true;
""",
    )
    if not clicked:
        raise RuntimeError("Could not click the CompanionOps approval handoff.")

    wait_until(
        session_id,
        """
const expectedRunId = arguments[0];
const expectedApprovalId = arguments[1];
const activeView = document.getElementById('workspace-layout')?.dataset?.workspaceView || '';
const banner = document.getElementById('companion-handoff-banner');
const detail = document.getElementById('approvals-detail-content');
const bannerText = String(banner?.textContent || '');
return (
  activeView === 'governanceops' &&
  !!banner &&
  banner.hidden === false &&
  bannerText.includes('Opened From CompanionOps') &&
  bannerText.includes(`run=${expectedRunId}`) &&
  (!expectedApprovalId || bannerText.includes(`approval=${expectedApprovalId}`)) &&
  detail?.dataset?.selectedRunId === expectedRunId
);
""",
        [handoff["runId"], handoff.get("approvalId", "")],
        timeout=30,
        label="GovernanceOps approval handoff",
    )

    returned = exec_js(
        session_id,
        """
const button = document.querySelector('[data-companion-return-action="return"]');
if (!button) return false;
button.click();
return true;
""",
    )
    if not returned:
        raise RuntimeError("Could not trigger Return To Companion from the handoff banner.")

    wait_until(
        session_id,
        """
const banner = document.getElementById('companion-handoff-banner');
return (
  document.getElementById('workspace-layout')?.dataset?.workspaceView === 'companionops' &&
  document.querySelector('[data-workspace-tab="companionops"]')?.getAttribute('aria-selected') === 'true' &&
  !!document.querySelector('[data-homeops-action="open-approval-item"]') &&
  !!banner &&
  banner.hidden === true
);
""",
        timeout=20,
        label="Return To Companion",
    )

    print(
        "V-M14-UI-031 PASS: CompanionOps is the default posture, a pending approval hands off into GovernanceOps with exact context, and explicit Return To Companion restores the default surface."
    )
finally:
    if session_id:
        wd("DELETE", f"/session/{session_id}")
PY
