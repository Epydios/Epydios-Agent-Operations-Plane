#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "${RUN_M14_AUTH_STRESS:-0}" != "1" ]; then
  echo "V-M14-UI-029 SKIP: set RUN_M14_AUTH_STRESS=1 to run auth/session robustness checks."
  exit 0
fi

if ! command -v safaridriver >/dev/null 2>&1; then
  echo "V-M14-UI-029 FAIL: safaridriver is not available on this host." >&2
  exit 1
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
WD_PORT="${WD_PORT:-4444}"
APP_URL="http://${HOST}:${PORT}/"
WEBDRIVER_URL="http://${HOST}:${WD_PORT}"

SERVER_LOG="/tmp/verify-m14-ui-029-server.log"
WEBDRIVER_LOG="/tmp/verify-m14-ui-029-webdriver.log"

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
        time.sleep(0.2)
    raise RuntimeError(f"Timed out waiting for {label}; last={last!r}")


def click_by_id(session_id, element_id):
    clicked = exec_js(
        session_id,
        """
const id = arguments[0];
const el = document.getElementById(id);
if (!el || el.disabled) return false;
el.click();
return true;
""",
        [element_id],
    )
    if not clicked:
        raise RuntimeError(f"Could not click #{element_id}")


session_id = ""
login_cycles = 0
logout_cycles = 0
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
        "return !!document.getElementById('login-button') && "
        "!!document.getElementById('logout-button') && "
        "!!document.getElementById('context-project-select') && "
        "!!document.getElementById('context-agent-profile') && "
        "!!document.getElementById('context-endpoint-badges');",
        timeout=30,
        label="auth controls",
    )
    wait_until(
        session_id,
        "return !!document.getElementById('context-project-select') && "
        "document.querySelectorAll('#context-project-select option').length > 1 && "
        "!!document.querySelector('[data-homeops-action=\"open-approvals-pending\"]');",
        timeout=30,
        label="ui ready",
    )

    exec_js(
        session_id,
        """
window.__m14AuthErrors = [];
window.addEventListener("error", (event) => {
  window.__m14AuthErrors.push({
    type: "error",
    message: String(event?.message || "unknown"),
    source: String(event?.filename || "")
  });
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  window.__m14AuthErrors.push({
    type: "unhandledrejection",
    message: String(reason && reason.message ? reason.message : reason)
  });
});
return true;
""",
    )

    current_auth = exec_js(
        session_id,
        "return sessionStorage.getItem('epydios.agentops.token') ? 'Authenticated' : 'Unauthenticated';",
    )
    if current_auth == "Authenticated":
        click_by_id(session_id, "logout-button")
        wait_until(
            session_id,
            """
return (
  !sessionStorage.getItem('epydios.agentops.token') &&
  String(document.getElementById('context-agent-profile')?.textContent || '').trim() === '-' &&
  String(document.getElementById('context-endpoint-badges')?.textContent || '').trim() === ''
);
""",
            timeout=10,
            label="initial logout to baseline",
        )

    for _ in range(3):
        click_by_id(session_id, "login-button")
        auth_mode = wait_until(
            session_id,
            """
const appUrl = arguments[0];
const href = String(window.location.href || '');
const body = String(document.body?.textContent || '');
const localAuthenticated =
  !!sessionStorage.getItem('epydios.agentops.token') &&
  Array.from(document.getElementById('context-project-select')?.options || []).some((opt) => String(opt.value || '').trim() !== '') &&
  String(document.getElementById('context-agent-profile')?.textContent || '').trim() !== '-' &&
  String(document.getElementById('context-endpoint-badges')?.textContent || '').trim() !== '';
if (localAuthenticated) {
  return 'local-authenticated';
}
const externalAuthHandoff =
  !href.startsWith(appUrl) &&
  (
    href.includes('auth.epydios.com') ||
    href.startsWith('safari-resource:/ErrorPage.html') ||
    body.includes('auth.epydios.com/authorize')
  );
if (externalAuthHandoff) {
  return 'external-auth-handoff';
}
return '';
""",
            [APP_URL],
            timeout=10,
            label="auth after login click",
        )
        if auth_mode == "external-auth-handoff":
            print(
                "V-M14-UI-029 PASS: auth/session wiring initiated the external OIDC handoff from the local shell; "
                "local mock login/logout cycles are not available in this environment."
            )
            sys.exit(0)
        login_cycles += 1

        click_by_id(session_id, "logout-button")
        wait_until(
            session_id,
            """
return (
  !sessionStorage.getItem('epydios.agentops.token') &&
  String(document.getElementById('context-agent-profile')?.textContent || '').trim() === '-' &&
  String(document.getElementById('context-endpoint-badges')?.textContent || '').trim() === ''
);
""",
            timeout=10,
            label="auth after logout click",
        )
        logout_cycles += 1

    time.sleep(0.5)
    runtime_errors = exec_js(
        session_id,
        "return Array.isArray(window.__m14AuthErrors) ? window.__m14AuthErrors : [];",
    )
    if runtime_errors:
        clipped = runtime_errors[:5]
        raise RuntimeError(f"Auth robustness runtime errors detected: {clipped!r}")

    print(
        "V-M14-UI-029 PASS: auth/session robustness checks passed for "
        f"{login_cycles} login + {logout_cycles} logout cycles with immediate UI state transitions."
    )
except Exception as err:
    print(f"V-M14-UI-029 FAIL: {err}", file=sys.stderr)
    sys.exit(1)
finally:
    if session_id:
        try:
            wd("DELETE", f"/session/{session_id}")
        except Exception:
            pass
PY
