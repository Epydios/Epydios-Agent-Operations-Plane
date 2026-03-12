#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ "${RUN_M14_BROWSER_SWEEP:-0}" != "1" ]; then
  echo "V-M14-UI-027 SKIP: set RUN_M14_BROWSER_SWEEP=1 to run browser control sweep."
  exit 0
fi

if ! command -v safaridriver >/dev/null 2>&1; then
  echo "V-M14-UI-027 FAIL: safaridriver is not available on this host." >&2
  exit 1
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-4173}"
WD_PORT="${WD_PORT:-4444}"
APP_URL="http://${HOST}:${PORT}/"
WEBDRIVER_URL="http://${HOST}:${WD_PORT}"

SERVER_LOG="/tmp/verify-m14-ui-027-server.log"
WEBDRIVER_LOG="/tmp/verify-m14-ui-027-webdriver.log"

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
curl -sf "${APP_URL}" >/dev/null

safaridriver -p "${WD_PORT}" >"${WEBDRIVER_LOG}" 2>&1 &
webdriver_pid="$!"
for _ in $(seq 1 50); do
  if curl -sf "${WEBDRIVER_URL}/status" >/dev/null; then
    break
  fi
  sleep 0.2
done
curl -sf "${WEBDRIVER_URL}/status" >/dev/null

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
        "return !!document.getElementById('settings-theme-mode') && "
        "!!document.getElementById('approvals-content') && "
        "!!document.getElementById('run-builder-form');",
        timeout=30,
        label="core controls",
    )

    exec_js(
        session_id,
        """
window.__m14SweepErrors = [];
window.addEventListener("error", (event) => {
  window.__m14SweepErrors.push({
    type: "error",
    message: String(event?.message || "unknown"),
    source: String(event?.filename || "")
  });
});
window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  window.__m14SweepErrors.push({
    type: "unhandledrejection",
    message: String(reason && reason.message ? reason.message : reason)
  });
});
return true;
""",
    )

    summary = exec_js(
        session_id,
        """
const summary = {
  buttonsClicked: 0,
  selectsCycled: 0,
  checkboxesToggled: 0,
  textInputsEdited: 0,
  numberInputsEdited: 0,
  localActionErrors: []
};

const safeDispatch = (el, type) => {
  el.dispatchEvent(new Event(type, { bubbles: true }));
};

const isVisible = (el) => {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
};

const skipButtonIds = new Set(["login-button", "logout-button"]);

for (const select of Array.from(document.querySelectorAll("select"))) {
  if (!isVisible(select) || select.disabled) continue;
  try {
    const original = String(select.value || "");
    const choices = Array.from(select.options)
      .map((opt) => String(opt.value || ""))
      .filter((value) => value !== "");
    const next = choices.find((value) => value !== original);
    if (!next) continue;
    select.value = next;
    safeDispatch(select, "change");
    if (original !== next) {
      select.value = original;
      safeDispatch(select, "change");
    }
    summary.selectsCycled += 1;
  } catch (err) {
    summary.localActionErrors.push(`select:${select.id || select.name || "(anon)"}:${String(err)}`);
  }
}

for (const input of Array.from(document.querySelectorAll("input[type='checkbox']"))) {
  if (!isVisible(input) || input.disabled) continue;
  try {
    const original = Boolean(input.checked);
    input.click();
    input.checked = original;
    safeDispatch(input, "change");
    summary.checkboxesToggled += 1;
  } catch (err) {
    summary.localActionErrors.push(`checkbox:${input.id || input.name || "(anon)"}:${String(err)}`);
  }
}

for (const input of Array.from(document.querySelectorAll("input[type='text'],input[type='search']"))) {
  if (!isVisible(input) || input.disabled || input.readOnly) continue;
  try {
    const original = String(input.value || "");
    const probe = original ? `${original}-sweep` : "sweep";
    input.value = probe;
    safeDispatch(input, "input");
    safeDispatch(input, "change");
    input.value = original;
    safeDispatch(input, "input");
    safeDispatch(input, "change");
    summary.textInputsEdited += 1;
  } catch (err) {
    summary.localActionErrors.push(`text:${input.id || input.name || "(anon)"}:${String(err)}`);
  }
}

for (const input of Array.from(document.querySelectorAll("input[type='number']"))) {
  if (!isVisible(input) || input.disabled || input.readOnly) continue;
  try {
    const original = String(input.value || "");
    const min = Number.isFinite(Number(input.min)) ? Number(input.min) : 1;
    input.value = String(min);
    safeDispatch(input, "input");
    safeDispatch(input, "change");
    input.value = original;
    safeDispatch(input, "input");
    safeDispatch(input, "change");
    summary.numberInputsEdited += 1;
  } catch (err) {
    summary.localActionErrors.push(`number:${input.id || input.name || "(anon)"}:${String(err)}`);
  }
}

for (const button of Array.from(document.querySelectorAll("button"))) {
  if (!isVisible(button) || button.disabled) continue;
  if (skipButtonIds.has(button.id)) continue;
  try {
    button.click();
    summary.buttonsClicked += 1;
  } catch (err) {
    summary.localActionErrors.push(`button:${button.id || button.name || "(anon)"}:${String(err)}`);
  }
}

return summary;
""",
    )

    time.sleep(1.6)
    runtime_errors = exec_js(
        session_id,
        "return Array.isArray(window.__m14SweepErrors) ? window.__m14SweepErrors : [];",
    )

    if summary.get("localActionErrors"):
        raise RuntimeError(
            "Control sweep local action errors: "
            + "; ".join(summary["localActionErrors"][:5])
        )
    if runtime_errors:
        clipped = runtime_errors[:5]
        raise RuntimeError(f"Control sweep runtime errors: {clipped!r}")

    core_missing = exec_js(
        session_id,
        """
const required = [
  "governed-action-form",
  "settings-content",
  "run-builder-form",
  "terminal-form",
  "approvals-content",
  "runs-content",
  "audit-content"
];
return required.filter((id) => !document.getElementById(id));
""",
    )
    if core_missing:
        raise RuntimeError(f"Core UI sections missing after sweep: {core_missing!r}")

    print(
        "V-M14-UI-027 PASS: control sweep clicked "
        f"{summary.get('buttonsClicked', 0)} buttons, cycled {summary.get('selectsCycled', 0)} selects, "
        f"toggled {summary.get('checkboxesToggled', 0)} checkboxes, edited "
        f"{summary.get('textInputsEdited', 0)} text + {summary.get('numberInputsEdited', 0)} number inputs "
        "without runtime errors."
    )
except Exception as err:
    print(f"V-M14-UI-027 FAIL: {err}", file=sys.stderr)
    sys.exit(1)
finally:
    if session_id:
        try:
            wd("DELETE", f"/session/{session_id}")
        except Exception:
            pass
PY
