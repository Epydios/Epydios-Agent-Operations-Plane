#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-c-governed-request)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
INSTALL_ROOT="${RUN_ROOT}/Applications"
SUPPORT_ROOT="${RUN_ROOT}/install-support"
HOME_OFF="${RUN_ROOT}/home-off"
HOME_ON="${RUN_ROOT}/home-on"
LOG_PATH="${RUN_ROOT}/verify-m15-phase-c-governed-request.log"
SUMMARY_PATH="${RUN_ROOT}/verify-m15-phase-c-governed-request.summary.json"
CHECKLIST_PATH="${RUN_ROOT}/operator-governed-request-checklist.json"
HARNESS_LOG="${RUN_ROOT}/governed-request-harness.log"
HARNESS_STATE_PATH="${RUN_ROOT}/governed-request-harness-state.json"
LATEST_LOG="${PHASE_ROOT}/verify-m15-phase-c-governed-request-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/verify-m15-phase-c-governed-request-latest.summary.json"
OFF_BOOTSTRAP_PATH="${RUN_ROOT}/runtime-bootstrap-off.json"
ON_BOOTSTRAP_PATH="${RUN_ROOT}/runtime-bootstrap-on.json"
mkdir -p "${RUN_ROOT}" "${INSTALL_ROOT}" "${SUPPORT_ROOT}" "${HOME_OFF}" "${HOME_ON}"

pick_ports() {
  python3 - <<'PY'
import socket

ports = []
for _ in range(5):
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    ports.append(str(sock.getsockname()[1]))
    sock.close()
print(" ".join(ports))
PY
}

read -r RUNTIME_PORT UI_PORT UPSTREAM_PORT GATEWAY_PORT_OFF GATEWAY_PORT_ON <<<"$(pick_ports)"
WEBDRIVER_PORT="${M15_WEBDRIVER_PORT:-4445}"
HARNESS_CONTROL_URL="http://127.0.0.1:${UI_PORT}/__verifier/set-web-root"
APP_URL="http://127.0.0.1:${UI_PORT}/"
WEBDRIVER_URL="http://127.0.0.1:${WEBDRIVER_PORT}"
HELPER_MODULE="./ui/desktop-ui/cmd/nativeapp_verifier_helper"
HARNESS_SCRIPT="${M15_MODULE_ROOT}/bin/m15_governed_request_harness.py"
EXECUTABLE_PATH="${INSTALL_ROOT}/Epydios AgentOps Desktop.app/Contents/MacOS/epydios-agentops-desktop"
OFF_MANIFEST_PATH=""
ON_MANIFEST_PATH=""
OFF_EVENT_LOG=""
ON_EVENT_LOG=""
INSTALLED_APP_PATH="${INSTALL_ROOT}/Epydios AgentOps Desktop.app"
APP_PID=""
HARNESS_PID=""
WEBDRIVER_PID=""
WEBDRIVER_MANAGED="0"

stop_manifest_services() {
  local manifest_path="${1:-}"
  local runtime_pid=""
  local gateway_pid=""
  if [ -z "${manifest_path}" ] || [ ! -f "${manifest_path}" ]; then
    return
  fi
  runtime_pid="$(jq -r '.runtimeService.pid // 0' "${manifest_path}")"
  gateway_pid="$(jq -r '.gatewayService.pid // 0' "${manifest_path}")"
  for pid in "${gateway_pid}" "${runtime_pid}"; do
    if [ "${pid}" -gt 0 ] 2>/dev/null && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
  done
}

stop_app() {
  if [ -n "${APP_PID}" ] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
  APP_PID=""
}

cleanup() {
  stop_app
  stop_manifest_services "${OFF_MANIFEST_PATH}"
  stop_manifest_services "${ON_MANIFEST_PATH}"
  if [ -n "${HARNESS_PID}" ] && kill -0 "${HARNESS_PID}" 2>/dev/null; then
    kill "${HARNESS_PID}" 2>/dev/null || true
    wait "${HARNESS_PID}" 2>/dev/null || true
  fi
  if [ "${WEBDRIVER_MANAGED}" = "1" ] && [ -n "${WEBDRIVER_PID}" ] && kill -0 "${WEBDRIVER_PID}" 2>/dev/null; then
    kill "${WEBDRIVER_PID}" 2>/dev/null || true
    wait "${WEBDRIVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_session_ready() {
  local home_root="${1}"
  local output_manifest_var="${2}"
  local output_event_var="${3}"
  local manifest=""
  local event_log=""
  local deadline=$((SECONDS + 45))
  while [ "${SECONDS}" -lt "${deadline}" ]; do
    manifest="$(find "${home_root}/Library/Caches/EpydiosAgentOpsDesktop/native-shell" -name session.json -print 2>/dev/null | sort | tail -n1 || true)"
    if [ -n "${manifest}" ] && [ -f "${manifest}" ]; then
      event_log="$(dirname "${manifest}")/logs/session-events.jsonl"
      if [ -f "${event_log}" ] && grep -q '"event":"native_window_dom_ready"' "${event_log}"; then
        printf -v "${output_manifest_var}" '%s' "${manifest}"
        printf -v "${output_event_var}" '%s' "${event_log}"
        return 0
      fi
    fi
    sleep 1
  done
  return 1
}

assert_session_contract() {
  local manifest_path="${1}"
  local bootstrap_path="${2}"
  local expected_enabled="${3}"
  local expected_status="${4}"
  python3 - <<'PY' "${manifest_path}" "${bootstrap_path}" "${expected_enabled}" "${expected_status}"
import json
import pathlib
import sys

manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
bootstrap_path = sys.argv[2]
expected_enabled = sys.argv[3].lower() == "true"
expected_status = sys.argv[4]

assert manifest["mode"] == "live", manifest["mode"]
assert manifest["launcherState"] == "ready", manifest["launcherState"]
assert manifest["runtimeProcessMode"] == "background_supervisor", manifest["runtimeProcessMode"]
assert manifest["runtimeState"] == "service_running", manifest["runtimeState"]
assert manifest["bootstrapConfigState"] == "loaded", manifest["bootstrapConfigState"]
assert manifest["bootstrapConfigPath"] == bootstrap_path, manifest["bootstrapConfigPath"]
assert manifest.get("startupError", "") in ("", None), manifest.get("startupError")
assert manifest["runtimeService"]["state"] == "running", manifest["runtimeService"]["state"]
assert manifest["runtimeService"]["health"] == "healthy", manifest["runtimeService"]["health"]
assert manifest["runtimeService"]["statusPath"] == manifest["paths"]["serviceStatusPath"], manifest["runtimeService"]["statusPath"]
assert manifest["runtimeService"]["runtimeApiBaseUrl"] == manifest["runtimeApiBaseUrl"], manifest["runtimeService"]["runtimeApiBaseUrl"]
assert manifest["gatewayService"]["state"] == "running", manifest["gatewayService"]["state"]
assert manifest["gatewayService"]["health"] == "healthy", manifest["gatewayService"]["health"]
assert manifest["gatewayService"]["statusPath"] == manifest["paths"]["gatewayStatusPath"], manifest["gatewayService"]["statusPath"]
assert manifest["interposition"]["enabled"] is expected_enabled, manifest["interposition"]
assert manifest["interposition"]["status"] == expected_status, manifest["interposition"]
assert manifest["interposition"].get("transitioning") in (False, None), manifest["interposition"]

runtime_config = json.loads(pathlib.Path(manifest["paths"]["webDir"]).joinpath("config", "runtime-config.json").read_text())
auth = runtime_config.get("auth") or {}
assert auth.get("enabled") is True, auth
assert auth.get("mockLogin") is True, auth
native_shell = runtime_config.get("nativeShell") or {}
assert native_shell.get("launcherState") == "ready", native_shell
assert native_shell.get("runtimeState") == "service_running", native_shell
assert native_shell.get("serviceStatusPath") == manifest["paths"]["serviceStatusPath"], native_shell.get("serviceStatusPath")
assert native_shell.get("gatewayStatusPath") == manifest["paths"]["gatewayStatusPath"], native_shell.get("gatewayStatusPath")
assert (native_shell.get("interposition") or {}).get("status") == expected_status, native_shell.get("interposition")
assert (native_shell.get("interposition") or {}).get("transitioning") in (False, None), native_shell.get("interposition")
assert native_shell.get("startupError", "") in ("", None), native_shell.get("startupError")
PY
}

write_bootstrap() {
  local path="${1}"
  local gateway_port="${2}"
  local interposition_enabled="${3}"
  local upstream_url="${4:-}"
  cat > "${path}" <<EOF
{
  "mode": "live",
  "runtimeLocalPort": ${RUNTIME_PORT},
  "gatewayLocalPort": ${gateway_port},
  "runtimeNamespace": "epydios-system",
  "runtimeService": "orchestration-runtime",
  "interpositionEnabled": ${interposition_enabled}$(if [ -n "${upstream_url}" ]; then printf ',\n  "interpositionUpstreamBaseUrl": "%s"' "${upstream_url}"; fi)
}
EOF
}

start_harness() {
  : > "${HARNESS_LOG}"
  python3 "${HARNESS_SCRIPT}" serve \
    --runtime-port "${RUNTIME_PORT}" \
    --ui-port "${UI_PORT}" \
    --upstream-port "${UPSTREAM_PORT}" \
    --web-root "${M15_MODULE_ROOT}/web" \
    --state-path "${HARNESS_STATE_PATH}" >>"${HARNESS_LOG}" 2>&1 &
  HARNESS_PID=$!
  local deadline=$((SECONDS + 20))
  while [ "${SECONDS}" -lt "${deadline}" ]; do
    if curl -sSf "http://127.0.0.1:${UI_PORT}/healthz" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "verify-m15-phase-c-governed-request failed: harness did not become ready on ${UI_PORT}" >&2
  return 1
}

ensure_webdriver() {
  if curl -sSf "${WEBDRIVER_URL}/status" >/dev/null 2>&1; then
    WEBDRIVER_MANAGED="0"
    return 0
  fi
  /usr/bin/safaridriver -p "${WEBDRIVER_PORT}" >>"${LOG_PATH}" 2>&1 &
  WEBDRIVER_PID=$!
  WEBDRIVER_MANAGED="1"
  local deadline=$((SECONDS + 20))
  while [ "${SECONDS}" -lt "${deadline}" ]; do
    if curl -sSf "${WEBDRIVER_URL}/status" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "verify-m15-phase-c-governed-request failed: safaridriver did not become ready on ${WEBDRIVER_PORT}" >&2
  return 1
}

launch_phase_app() {
  local home_root="${1}"
  local bootstrap_path="${2}"
  stop_app
  (
    export HOME="${home_root}"
    export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="${bootstrap_path}"
    export EPYDIOS_NATIVEAPP_RUNTIME_MANAGED_EXTERNALLY=true
    export EPYDIOS_NATIVEAPP_AUTH_ENABLED=true
    export EPYDIOS_NATIVEAPP_AUTH_MOCK_LOGIN=true
    "${EXECUTABLE_PATH}"
  ) >>"${LOG_PATH}" 2>&1 &
  APP_PID=$!
}

{
  echo "Packaging macOS beta bundle"
  "${M15_MODULE_ROOT}/bin/package-m15-macos.sh"
  echo "Installing macOS beta bundle into ${INSTALL_ROOT}"
  EPYDIOS_M15_SKIP_REPACKAGE=1 \
  EPYDIOS_M15_MACOS_INSTALL_ROOT="${INSTALL_ROOT}" \
  EPYDIOS_M15_MACOS_SUPPORT_ROOT="${SUPPORT_ROOT}" \
    "${M15_MODULE_ROOT}/bin/install-m15-macos-beta.sh"
} >"${LOG_PATH}" 2>&1

[ -x "${EXECUTABLE_PATH}" ] || {
  echo "verify-m15-phase-c-governed-request failed: installed executable missing at ${EXECUTABLE_PATH}" >&2
  exit 1
}

write_bootstrap "${OFF_BOOTSTRAP_PATH}" "${GATEWAY_PORT_OFF}" false
write_bootstrap "${ON_BOOTSTRAP_PATH}" "${GATEWAY_PORT_ON}" true "http://127.0.0.1:${UPSTREAM_PORT}"

start_harness
ensure_webdriver

launch_phase_app "${HOME_OFF}" "${OFF_BOOTSTRAP_PATH}"
wait_for_session_ready "${HOME_OFF}" OFF_MANIFEST_PATH OFF_EVENT_LOG || {
  echo "verify-m15-phase-c-governed-request failed: OFF session did not become ready" >&2
  exit 1
}
assert_session_contract "${OFF_MANIFEST_PATH}" "${OFF_BOOTSTRAP_PATH}" false off
OFF_WEB_ROOT="$(jq -r '.paths.webDir // ""' "${OFF_MANIFEST_PATH}")"
python3 "${HARNESS_SCRIPT}" set-web-root --control-url "${HARNESS_CONTROL_URL}" --web-root "${OFF_WEB_ROOT}" >>"${LOG_PATH}" 2>&1
python3 "${HARNESS_SCRIPT}" verify-off --app-url "${APP_URL}" --webdriver-url "${WEBDRIVER_URL}" >>"${LOG_PATH}" 2>&1
stop_app
stop_manifest_services "${OFF_MANIFEST_PATH}"

launch_phase_app "${HOME_ON}" "${ON_BOOTSTRAP_PATH}"
wait_for_session_ready "${HOME_ON}" ON_MANIFEST_PATH ON_EVENT_LOG || {
  echo "verify-m15-phase-c-governed-request failed: ON session did not become ready" >&2
  exit 1
}
assert_session_contract "${ON_MANIFEST_PATH}" "${ON_BOOTSTRAP_PATH}" true on
ON_WEB_ROOT="$(jq -r '.paths.webDir // ""' "${ON_MANIFEST_PATH}")"
python3 "${HARNESS_SCRIPT}" set-web-root --control-url "${HARNESS_CONTROL_URL}" --web-root "${ON_WEB_ROOT}" >>"${LOG_PATH}" 2>&1
python3 "${HARNESS_SCRIPT}" verify-on \
  --app-url "${APP_URL}" \
  --webdriver-url "${WEBDRIVER_URL}" \
  --session-manifest "${ON_MANIFEST_PATH}" \
  --repo-root "${M15_REPO_ROOT}" \
  --helper-module "${HELPER_MODULE}" >>"${LOG_PATH}" 2>&1

stop_app
stop_manifest_services "${ON_MANIFEST_PATH}"

EPYDIOS_M15_MACOS_INSTALL_ROOT="${INSTALL_ROOT}" \
EPYDIOS_M15_MACOS_SUPPORT_ROOT="${SUPPORT_ROOT}" \
  "${M15_MODULE_ROOT}/bin/uninstall-m15-macos-beta.sh" >>"${LOG_PATH}" 2>&1

[ ! -e "${INSTALLED_APP_PATH}" ] || {
  echo "verify-m15-phase-c-governed-request failed: installed app still present after uninstall at ${INSTALLED_APP_PATH}" >&2
  exit 1
}

cat > "${CHECKLIST_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "supported_path_macos_live_governed_request": {
    "status": "pass",
    "steps": [
      "installed macOS live app launched",
      "mock sign-in proved with live auth enabled",
      "interposition OFF clarity proved",
      "interposition ON clarity proved",
      "governed Codex /responses request held and approved",
      "run detail showed Evidence Handoff",
      "audit activity showed approval allow decision",
      "evidence workspace showed ready bundle access"
    ],
    "off_session_manifest_path": "$(m15_json_escape "${OFF_MANIFEST_PATH}")",
    "on_session_manifest_path": "$(m15_json_escape "${ON_MANIFEST_PATH}")",
    "harness_state_path": "$(m15_json_escape "${HARNESS_STATE_PATH}")",
    "log_path": "$(m15_json_escape "${LOG_PATH}")"
  }
}
EOF

cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "phase_c_governed_request_ready",
  "reason": "Supported-path macOS live install proved sign-in, interposition OFF/ON clarity, one real governed Codex /responses request, approval resolution, and audit/evidence handoff end to end.",
  "log_path": "$(m15_json_escape "${LOG_PATH}")",
  "installed_app_path": "$(m15_json_escape "${INSTALLED_APP_PATH}")",
  "off_session_manifest_path": "$(m15_json_escape "${OFF_MANIFEST_PATH}")",
  "on_session_manifest_path": "$(m15_json_escape "${ON_MANIFEST_PATH}")",
  "harness_state_path": "$(m15_json_escape "${HARNESS_STATE_PATH}")",
  "operator_checklist_path": "$(m15_json_escape "${CHECKLIST_PATH}")"
}
EOF

cp "${LOG_PATH}" "${LATEST_LOG}"
cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"

echo "M15 Phase C governed-request verifier passed."
