#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "verify-m15-phase-b-exit-gate failed: missing required command '$1'" >&2
    exit 1
  }
}

require_cmd jq
require_cmd python3
require_cmd xvfb-run
require_cmd kubectl

STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-b-exit)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/verify-m15-phase-b-exit-gate.log"
SUMMARY_PATH="${RUN_ROOT}/verify-m15-phase-b-exit-gate.summary.json"
LATEST_LOG="${PHASE_ROOT}/verify-m15-phase-b-exit-gate-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/verify-m15-phase-b-exit-gate-latest.summary.json"
PACKAGE_SUMMARY="${M15_NON_GITHUB_ROOT}/internal-readiness/m15-native-phase-b/package-m15-linux-latest.summary.json"
MODE="${M15_PHASE_B_LAUNCH_MODE:-live}"
RUNTIME_PORT="${M15_PHASE_B_RUNTIME_PORT:-18080}"
ARTIFACT_KIND="${M15_PHASE_B_ARTIFACT:-appimage}"
LAUNCH_PREFIX_RAW="${M15_PHASE_B_LAUNCH_PREFIX:-}"
declare -a LAUNCH_PREFIX=()
if [ -n "${LAUNCH_PREFIX_RAW}" ]; then
  # Intentionally split on shell words so wrappers can inject qemu or similar launch shims.
  read -r -a LAUNCH_PREFIX <<< "${LAUNCH_PREFIX_RAW}"
fi
mkdir -p "${RUN_ROOT}"
: > "${LOG_PATH}"

write_summary() {
  local status="$1"
  local reason="$2"
  local session_root="$3"
  local manifest_path="$4"
  local event_log_path="$5"
  local artifact_path="$6"
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "${status}",
  "reason": "${reason}",
  "mode": "${MODE}",
  "artifact_path": "${artifact_path}",
  "log_path": "${LOG_PATH}",
  "session_root": "${session_root}",
  "manifest_path": "${manifest_path}",
  "event_log_path": "${event_log_path}"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
}

[ -f "${PACKAGE_SUMMARY}" ] || {
  echo "verify-m15-phase-b-exit-gate failed: missing package summary ${PACKAGE_SUMMARY}" >&2
  exit 1
}

PACKAGE_STATUS="$(jq -r '.status // ""' "${PACKAGE_SUMMARY}")"
[ "${PACKAGE_STATUS}" = "packaged_linux_baseline" ] || {
  echo "verify-m15-phase-b-exit-gate failed: latest Linux package summary is '${PACKAGE_STATUS}', expected packaged_linux_baseline" >&2
  exit 1
}

ARTIFACT_PATH=""
case "${ARTIFACT_KIND}" in
  appimage)
    ARTIFACT_PATH="$(jq -r '.appimage_path // ""' "${PACKAGE_SUMMARY}")"
    [ -n "${ARTIFACT_PATH}" ] && [ -f "${ARTIFACT_PATH}" ] || {
      echo "verify-m15-phase-b-exit-gate failed: AppImage artifact missing at ${ARTIFACT_PATH}" >&2
      exit 1
    }
    ;;
  tarball)
    TARBALL_PATH="$(jq -r '.tarball_path // ""' "${PACKAGE_SUMMARY}")"
    [ -n "${TARBALL_PATH}" ] && [ -f "${TARBALL_PATH}" ] || {
      echo "verify-m15-phase-b-exit-gate failed: tarball artifact missing at ${TARBALL_PATH}" >&2
      exit 1
    }
    EXTRACT_ROOT="${RUN_ROOT}/tarball"
    mkdir -p "${EXTRACT_ROOT}"
    tar -C "${EXTRACT_ROOT}" -xzf "${TARBALL_PATH}"
    ARTIFACT_PATH="$(find "${EXTRACT_ROOT}" -type f -name epydios-agentops-desktop -perm -u+x | head -n1)"
    [ -n "${ARTIFACT_PATH}" ] && [ -f "${ARTIFACT_PATH}" ] || {
      echo "verify-m15-phase-b-exit-gate failed: extracted tarball binary not found under ${EXTRACT_ROOT}" >&2
      exit 1
    }
    ;;
  *)
    echo "verify-m15-phase-b-exit-gate failed: unsupported M15_PHASE_B_ARTIFACT=${ARTIFACT_KIND}" >&2
    exit 1
    ;;
esac

if [ "${MODE}" = "live" ] && [ -z "${KUBECONFIG:-}" ]; then
  echo "verify-m15-phase-b-exit-gate failed: KUBECONFIG must be set for live mode" >&2
  exit 1
fi

if [ "${MODE}" = "live" ]; then
  kubectl config current-context >/dev/null
fi

SESSION_CACHE_ROOT="${RUN_ROOT}/cache-home"
HOME_ROOT="${RUN_ROOT}/home"
mkdir -p "${SESSION_CACHE_ROOT}" "${HOME_ROOT}"

APP_STDOUT="${RUN_ROOT}/packaged-app.stdout.log"
EVENT_JSON="${RUN_ROOT}/events.json"
ASSESSMENT_JSON="${RUN_ROOT}/assessment.json"

export HOME="${HOME_ROOT}"
export XDG_CACHE_HOME="${SESSION_CACHE_ROOT}"
export APPIMAGE_EXTRACT_AND_RUN=1

APP_PID=""
cleanup() {
  if [ -n "${APP_PID}" ] && kill -0 "${APP_PID}" >/dev/null 2>&1; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
    wait "${APP_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

(
  printf 'Launching packaged Linux app: %s --mode %s --runtime-port %s\n' "${ARTIFACT_PATH}" "${MODE}" "${RUNTIME_PORT}"
  xvfb-run -a "${LAUNCH_PREFIX[@]}" "${ARTIFACT_PATH}" --mode "${MODE}" --runtime-port "${RUNTIME_PORT}"
) >>"${APP_STDOUT}" 2>&1 &
APP_PID=$!

SESSION_ROOT=""
MANIFEST_PATH=""
EVENT_LOG_PATH=""
deadline=$((SECONDS + 90))
while [ "${SECONDS}" -lt "${deadline}" ]; do
  if [ -z "${MANIFEST_PATH}" ]; then
    MANIFEST_PATH="$(find "${SESSION_CACHE_ROOT}" -path '*/EpydiosAgentOpsDesktop/native-shell/*/session.json' -print | tail -n 1)"
    if [ -n "${MANIFEST_PATH}" ] && [ -f "${MANIFEST_PATH}" ]; then
      SESSION_ROOT="$(dirname "${MANIFEST_PATH}")"
      EVENT_LOG_PATH="${SESSION_ROOT}/logs/session-events.jsonl"
    fi
  fi
  if [ -n "${EVENT_LOG_PATH}" ] && [ -f "${EVENT_LOG_PATH}" ]; then
    if grep -q '"event":"runtime_started"' "${EVENT_LOG_PATH}" && grep -q '"event":"native_window_dom_ready"' "${EVENT_LOG_PATH}"; then
      break
    fi
  fi
  if [ -n "${APP_PID}" ] && ! kill -0 "${APP_PID}" >/dev/null 2>&1; then
    wait "${APP_PID}" || true
    break
  fi
  sleep 1
done

[ -n "${MANIFEST_PATH}" ] && [ -f "${MANIFEST_PATH}" ] || {
  cat "${APP_STDOUT}" >>"${LOG_PATH}" 2>/dev/null || true
  write_summary \
    "failed_missing_session_manifest" \
    "Packaged Linux app did not create a session manifest before timeout or exit." \
    "" \
    "" \
    "" \
    "${ARTIFACT_PATH}"
  echo "verify-m15-phase-b-exit-gate failed: missing session manifest" >&2
  exit 1
}

[ -f "${EVENT_LOG_PATH}" ] || {
  cat "${APP_STDOUT}" >>"${LOG_PATH}" 2>/dev/null || true
  write_summary \
    "failed_missing_event_log" \
    "Packaged Linux app created a session manifest but no session event log was found." \
    "${SESSION_ROOT}" \
    "${MANIFEST_PATH}" \
    "" \
    "${ARTIFACT_PATH}"
  echo "verify-m15-phase-b-exit-gate failed: missing event log" >&2
  exit 1
}

python3 - <<'PY' "${MANIFEST_PATH}" "${EVENT_LOG_PATH}" "${MODE}" "${ASSESSMENT_JSON}" "${EVENT_JSON}" "${ARTIFACT_KIND}"
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
event_log_path = pathlib.Path(sys.argv[2])
mode = sys.argv[3]
assessment_path = pathlib.Path(sys.argv[4])
events_path = pathlib.Path(sys.argv[5])
artifact_kind = sys.argv[6]

manifest = json.loads(manifest_path.read_text())
events = []
with event_log_path.open() as f:
    for line in f:
        line = line.strip()
        if line:
            events.append(json.loads(line))

events_path.write_text(json.dumps(events, indent=2) + "\n")
names = {event.get("event") for event in events}
assessment = {
    "packaged_linux_app_launch": True,
    "artifact_type": artifact_kind,
    "mode": mode,
    "runtime_process_mode": manifest.get("runtimeProcessMode"),
    "runtime_started": "runtime_started" in names,
    "embedded_ui_dom_ready": "native_window_dom_ready" in names,
    "restricted_host_blocked_by_default": manifest.get("AllowRestrictedHost", manifest.get("allowRestrictedHost")) is False,
    "target_execution_profile": manifest.get("targetExecutionProfile"),
    "runtime_state": manifest.get("runtimeState"),
}
assessment_path.write_text(json.dumps(assessment, indent=2) + "\n")
PY

if ! jq -e '.runtime_started and .embedded_ui_dom_ready and .restricted_host_blocked_by_default and (.target_execution_profile == "sandbox_vm_autonomous")' "${ASSESSMENT_JSON}" >/dev/null; then
  {
    echo "--- packaged-app stdout/stderr ---"
    cat "${APP_STDOUT}" 2>/dev/null || true
    echo "--- session manifest ---"
    cat "${MANIFEST_PATH}"
    echo "--- session events ---"
    cat "${EVENT_JSON}"
    echo "--- assessment ---"
    cat "${ASSESSMENT_JSON}"
  } >>"${LOG_PATH}"
  write_summary \
    "failed_exit_gate_assertions" \
    "Packaged Linux app launched, but the runtime-start, DOM-ready, or default safety assertions did not all pass." \
    "${SESSION_ROOT}" \
    "${MANIFEST_PATH}" \
    "${EVENT_LOG_PATH}" \
    "${ARTIFACT_PATH}"
  echo "verify-m15-phase-b-exit-gate failed: exit gate assertions did not all pass" >&2
  exit 1
fi

{
  echo "--- packaged-app stdout/stderr ---"
  cat "${APP_STDOUT}" 2>/dev/null || true
  echo "--- session manifest ---"
  cat "${MANIFEST_PATH}"
  echo "--- session events ---"
  cat "${EVENT_JSON}"
  echo "--- assessment ---"
  cat "${ASSESSMENT_JSON}"
} >>"${LOG_PATH}"

write_summary \
  "phase_b_exit_gate_passed" \
  "Packaged Linux ${ARTIFACT_KIND} artifact launched in live mode, reached runtime_started and native_window_dom_ready, and preserved sandbox_vm_autonomous with restricted host blocked by default." \
  "${SESSION_ROOT}" \
  "${MANIFEST_PATH}" \
  "${EVENT_LOG_PATH}" \
  "${ARTIFACT_PATH}"

echo "M15 Phase B exit gate verifier passed."
