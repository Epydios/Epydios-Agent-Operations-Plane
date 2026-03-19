#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-b)"
mkdir -p "${PHASE_ROOT}"
CURRENT_HOST="$(uname -s | tr '[:upper:]' '[:lower:]')"
STAMP="$(m15_timestamp_utc)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
HOME_ROOT="${RUN_ROOT}/home"
INSTALL_ROOT="${HOME_ROOT}/.local/share/EpydiosAgentOpsDesktop"
SUPPORT_ROOT="${HOME_ROOT}/.config/EpydiosAgentOpsDesktop"
BIN_ROOT="${HOME_ROOT}/.local/bin"
APPLICATIONS_ROOT="${HOME_ROOT}/.local/share/applications"
CACHE_ROOT="${RUN_ROOT}/cache-home"
LOG_PATH="${RUN_ROOT}/verify-m15-phase-b.log"
SUMMARY_PATH="${RUN_ROOT}/verify-m15-phase-b.summary.json"
CHECKLIST_PATH="${RUN_ROOT}/operator-beta-checklist.json"
LATEST_LOG="${PHASE_ROOT}/verify-m15-phase-b-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/verify-m15-phase-b-latest.summary.json"

write_summary() {
  local status="$1"
  local reason="$2"
  local install_path="$3"
  local launcher_path="$4"
  local manifest_path="$5"
  local event_log_path="$6"
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "${status}",
  "reason": "${reason}",
  "log_path": "${LOG_PATH}",
  "install_path": "${install_path}",
  "launcher_path": "${launcher_path}",
  "session_manifest_path": "${manifest_path}",
  "event_log_path": "${event_log_path}",
  "operator_beta_checklist_path": "${CHECKLIST_PATH}"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
}

if [ "${CURRENT_HOST}" != "linux" ]; then
  if "${M15_MODULE_ROOT}/bin/package-m15-linux.sh"; then
    SUMMARY_PATH="${PHASE_ROOT}/package-m15-linux-latest.summary.json"
    if ! grep -q '"status": "packaged_linux_baseline"' "${SUMMARY_PATH}"; then
      echo "verify-m15-phase-b failed: latest summary does not report packaged_linux_baseline" >&2
      exit 1
    fi
    echo "M15 Phase B verifier passed: Linux baseline packaged."
    exit 0
  fi

  SUMMARY_PATH="${PHASE_ROOT}/package-m15-linux-latest.summary.json"
  [ -f "${SUMMARY_PATH}" ] || {
    echo "verify-m15-phase-b failed: missing latest Phase B summary after packaging attempt" >&2
    exit 1
  }

  if grep -q '"status": "blocked_active_host_non_linux"' "${SUMMARY_PATH}"; then
    SUMMARY_HOST="$(sed -n 's/.*"host_os": "\([^"]*\)".*/\1/p' "${SUMMARY_PATH}" | head -n1)"
    if [ -n "${SUMMARY_HOST}" ] && [ "${SUMMARY_HOST}" != "${CURRENT_HOST}" ]; then
      echo "verify-m15-phase-b failed: blocker summary host (${SUMMARY_HOST}) does not match active host (${CURRENT_HOST})." >&2
      exit 1
    fi
    echo "M15 Phase B verifier recorded the active-host blocker. Linux packaging requires a Linux build host."
    exit 0
  fi

  echo "verify-m15-phase-b failed: Linux packaging did not succeed and no supported-host blocker was recorded." >&2
  exit 1
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "verify-m15-phase-b failed: missing required command '$1'" >&2
    exit 1
  }
}

require_cmd jq
require_cmd python3
require_cmd xvfb-run

mkdir -p "${RUN_ROOT}" "${HOME_ROOT}" "${CACHE_ROOT}"

cleanup() {
  if [ -n "${APP_PID:-}" ] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

{
  echo "Packaging Linux beta bundle"
  "${M15_MODULE_ROOT}/bin/package-m15-linux.sh"
  echo "Installing Linux beta bundle into ${INSTALL_ROOT}"
  HOME="${HOME_ROOT}" \
  XDG_CONFIG_HOME="${HOME_ROOT}/.config" \
  XDG_DATA_HOME="${HOME_ROOT}/.local/share" \
  EPYDIOS_M15_LINUX_INSTALL_ROOT="${INSTALL_ROOT}" \
  EPYDIOS_M15_LINUX_SUPPORT_ROOT="${SUPPORT_ROOT}" \
  EPYDIOS_M15_LINUX_BIN_ROOT="${BIN_ROOT}" \
  EPYDIOS_M15_LINUX_APPLICATIONS_ROOT="${APPLICATIONS_ROOT}" \
  "${M15_MODULE_ROOT}/bin/install-m15-linux-beta.sh"
} >"${LOG_PATH}" 2>&1

INSTALL_SUMMARY="${PHASE_ROOT}/install-m15-linux-beta-latest.summary.json"
INSTALLED_APP_PATH="$(jq -r '.install_path // ""' "${INSTALL_SUMMARY}")"
LAUNCHER_PATH="$(jq -r '.launcher_path // ""' "${INSTALL_SUMMARY}")"
BOOTSTRAP_PATH="$(jq -r '.bootstrap_path // ""' "${INSTALL_SUMMARY}")"
[ -x "${INSTALLED_APP_PATH}" ] || {
  echo "verify-m15-phase-b failed: installed AppImage missing at ${INSTALLED_APP_PATH}" >&2
  exit 1
}
[ -x "${LAUNCHER_PATH}" ] || {
  echo "verify-m15-phase-b failed: installed launcher missing at ${LAUNCHER_PATH}" >&2
  exit 1
}

(
  export HOME="${HOME_ROOT}"
  export XDG_CONFIG_HOME="${HOME_ROOT}/.config"
  export XDG_DATA_HOME="${HOME_ROOT}/.local/share"
  export XDG_CACHE_HOME="${CACHE_ROOT}"
  xvfb-run -a "${LAUNCHER_PATH}"
) >>"${LOG_PATH}" 2>&1 &
APP_PID=$!

SESSION_MANIFEST=""
EVENT_LOG=""
deadline=$((SECONDS + 60))
while [ "${SECONDS}" -lt "${deadline}" ]; do
  SESSION_MANIFEST="$(find "${CACHE_ROOT}/EpydiosAgentOpsDesktop/native-shell" -name session.json -print 2>/dev/null | sort | tail -n1 || true)"
  if [ -n "${SESSION_MANIFEST}" ] && [ -f "${SESSION_MANIFEST}" ]; then
    EVENT_LOG="$(dirname "${SESSION_MANIFEST}")/logs/session-events.jsonl"
    if [ -f "${EVENT_LOG}" ] && grep -q '"event":"native_window_dom_ready"' "${EVENT_LOG}"; then
      break
    fi
  fi
  sleep 1
done

[ -n "${SESSION_MANIFEST}" ] && [ -f "${SESSION_MANIFEST}" ] || {
  write_summary \
    "failed_missing_session_manifest" \
    "Installed Linux launcher did not create a session manifest before timeout or exit." \
    "${INSTALLED_APP_PATH}" \
    "${LAUNCHER_PATH}" \
    "" \
    ""
  echo "verify-m15-phase-b failed: missing session manifest" >&2
  exit 1
}
[ -f "${EVENT_LOG}" ] || {
  write_summary \
    "failed_missing_event_log" \
    "Installed Linux launcher created a session manifest but no event log was found." \
    "${INSTALLED_APP_PATH}" \
    "${LAUNCHER_PATH}" \
    "${SESSION_MANIFEST}" \
    ""
  echo "verify-m15-phase-b failed: missing event log" >&2
  exit 1
}

python3 - <<'PY' "${SESSION_MANIFEST}" "${CHECKLIST_PATH}" "${LOG_PATH}" "${INSTALLED_APP_PATH}" "${BOOTSTRAP_PATH}" "${LAUNCHER_PATH}"
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
checklist_path = pathlib.Path(sys.argv[2])
log_path = sys.argv[3]
installed_app_path = sys.argv[4]
bootstrap_path = sys.argv[5]
launcher_path = sys.argv[6]
manifest = json.loads(manifest_path.read_text())

assert manifest["mode"] == "mock", manifest["mode"]
assert manifest["launcherState"] == "ready", manifest["launcherState"]
assert manifest["runtimeProcessMode"] == "mock_only", manifest["runtimeProcessMode"]
assert manifest["bootstrapConfigState"] == "loaded", manifest["bootstrapConfigState"]
assert manifest["bootstrapConfigPath"] == bootstrap_path, manifest["bootstrapConfigPath"]
assert manifest["paths"]["configRoot"].endswith("EpydiosAgentOpsDesktop"), manifest["paths"]["configRoot"]
assert manifest["paths"]["cacheRoot"].endswith("EpydiosAgentOpsDesktop"), manifest["paths"]["cacheRoot"]

checklist = {
    "startup_reliability": {
        "status": "pass",
        "evidence": str(manifest_path),
        "notes": "Installed Linux AppImage launcher reached native_window_dom_ready without a terminal-first run path."
    },
    "install_path": installed_app_path,
    "launcher_path": launcher_path,
    "bootstrap_path": bootstrap_path,
    "verification_log_path": log_path
}
checklist_path.write_text(json.dumps(checklist, indent=2) + "\n")
PY

HOME="${HOME_ROOT}" \
XDG_CONFIG_HOME="${HOME_ROOT}/.config" \
XDG_DATA_HOME="${HOME_ROOT}/.local/share" \
EPYDIOS_M15_LINUX_INSTALL_ROOT="${INSTALL_ROOT}" \
EPYDIOS_M15_LINUX_SUPPORT_ROOT="${SUPPORT_ROOT}" \
EPYDIOS_M15_LINUX_BIN_ROOT="${BIN_ROOT}" \
EPYDIOS_M15_LINUX_APPLICATIONS_ROOT="${APPLICATIONS_ROOT}" \
  "${M15_MODULE_ROOT}/bin/uninstall-m15-linux-beta.sh" >>"${LOG_PATH}" 2>&1

[ ! -e "${INSTALLED_APP_PATH}" ] || {
  echo "verify-m15-phase-b failed: installed AppImage still present after uninstall at ${INSTALLED_APP_PATH}" >&2
  exit 1
}
[ ! -e "${LAUNCHER_PATH}" ] || {
  echo "verify-m15-phase-b failed: installed launcher still present after uninstall at ${LAUNCHER_PATH}" >&2
  exit 1
}

write_summary \
  "phase_b_beta_ready" \
  "Installed Linux AppImage completed the install, launch, session, and uninstall beta flow with launcher diagnostics and bootstrap config in place." \
  "${INSTALLED_APP_PATH}" \
  "${LAUNCHER_PATH}" \
  "${SESSION_MANIFEST}" \
  "${EVENT_LOG}"

echo "M15 Phase B verifier passed."
