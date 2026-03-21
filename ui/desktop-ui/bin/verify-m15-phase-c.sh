#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-c)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
HOME_ROOT="${RUN_ROOT}/home"
INSTALL_ROOT="${HOME_ROOT}/Applications"
SUPPORT_ROOT="${HOME_ROOT}/Library/Application Support/EpydiosAgentOpsDesktop"
CACHE_ROOT="${HOME_ROOT}/Library/Caches"
LOG_PATH="${RUN_ROOT}/verify-m15-phase-c.log"
SUMMARY_PATH="${RUN_ROOT}/verify-m15-phase-c.summary.json"
CHECKLIST_PATH="${RUN_ROOT}/operator-beta-checklist.json"
LATEST_LOG="${PHASE_ROOT}/verify-m15-phase-c-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/verify-m15-phase-c-latest.summary.json"
mkdir -p "${RUN_ROOT}" "${HOME_ROOT}" "${CACHE_ROOT}"

cleanup() {
  if [ -n "${APP_PID:-}" ] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

{
  echo "Packaging macOS beta bundle"
  "${M15_MODULE_ROOT}/bin/package-m15-macos.sh"
  echo "Installing macOS beta bundle into ${INSTALL_ROOT}"
  EPYDIOS_M15_MACOS_INSTALL_ROOT="${INSTALL_ROOT}" \
    EPYDIOS_M15_MACOS_SUPPORT_ROOT="${SUPPORT_ROOT}" \
    "${M15_MODULE_ROOT}/bin/install-m15-macos-beta.sh"
} >"${LOG_PATH}" 2>&1

INSTALL_SUMMARY="${PHASE_ROOT}/install-m15-macos-beta-latest.summary.json"
INSTALLED_APP_PATH="$(jq -r '.install_path // ""' "${INSTALL_SUMMARY}")"
BOOTSTRAP_PATH="$(jq -r '.bootstrap_path // ""' "${INSTALL_SUMMARY}")"
EXECUTABLE_PATH="${INSTALLED_APP_PATH}/Contents/MacOS/epydios-agentops-desktop"
[ -x "${EXECUTABLE_PATH}" ] || {
  echo "verify-m15-phase-c failed: installed executable missing at ${EXECUTABLE_PATH}" >&2
  exit 1
}

(
  export HOME="${HOME_ROOT}"
  export XDG_CACHE_HOME="${CACHE_ROOT}"
  export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="${BOOTSTRAP_PATH}"
  "${EXECUTABLE_PATH}"
) >>"${LOG_PATH}" 2>&1 &
APP_PID=$!

SESSION_MANIFEST=""
EVENT_LOG=""
deadline=$((SECONDS + 30))
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
  echo "verify-m15-phase-c failed: session manifest did not appear under ${CACHE_ROOT}" >&2
  exit 1
}
[ -f "${EVENT_LOG}" ] || {
  echo "verify-m15-phase-c failed: session event log missing for ${SESSION_MANIFEST}" >&2
  exit 1
}
grep -q '"event":"native_window_dom_ready"' "${EVENT_LOG}" || {
  echo "verify-m15-phase-c failed: native_window_dom_ready not observed in ${EVENT_LOG}" >&2
  exit 1
}

python3 - <<'PY' "${SESSION_MANIFEST}" "${CHECKLIST_PATH}" "${LOG_PATH}" "${INSTALLED_APP_PATH}" "${BOOTSTRAP_PATH}"
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
checklist_path = pathlib.Path(sys.argv[2])
log_path = sys.argv[3]
installed_app_path = sys.argv[4]
bootstrap_path = sys.argv[5]
manifest = json.loads(manifest_path.read_text())

assert manifest["mode"] == "live", manifest["mode"]
assert manifest["launcherState"] == "ready", manifest["launcherState"]
assert manifest["runtimeProcessMode"] == "background_supervisor", manifest["runtimeProcessMode"]
assert manifest["runtimeState"] == "service_running", manifest["runtimeState"]
assert manifest["targetExecutionProfile"] == "sandbox_vm_autonomous", manifest["targetExecutionProfile"]
assert manifest["allowRestrictedHost"] is False, manifest["allowRestrictedHost"]
assert manifest["bootstrapConfigState"] == "loaded", manifest["bootstrapConfigState"]
assert manifest["bootstrapConfigPath"] == bootstrap_path, manifest["bootstrapConfigPath"]
assert manifest["paths"]["configRoot"].endswith("EpydiosAgentOpsDesktop"), manifest["paths"]["configRoot"]
assert manifest["paths"]["cacheRoot"].endswith("EpydiosAgentOpsDesktop"), manifest["paths"]["cacheRoot"]
assert manifest["paths"]["gatewayRoot"].endswith("localhost-gateway"), manifest["paths"]["gatewayRoot"]
assert manifest["runtimeService"]["state"] == "running", manifest["runtimeService"]["state"]
assert manifest["runtimeService"]["health"] == "healthy", manifest["runtimeService"]["health"]
assert manifest["gatewayService"]["state"] == "running", manifest["gatewayService"]["state"]
assert manifest["gatewayService"]["health"] == "healthy", manifest["gatewayService"]["health"]
assert manifest["gatewayService"]["statusPath"] == manifest["paths"]["gatewayStatusPath"], manifest["gatewayService"]["statusPath"]
assert manifest["interposition"]["enabled"] is False, manifest["interposition"]
assert manifest["interposition"]["status"] == "off", manifest["interposition"]

checklist = {
    "startup_reliability": {
        "status": "pass",
        "evidence": str(manifest_path),
        "notes": "Packaged macOS app launched from installed .app bundle and reached native_window_dom_ready without a browser."
    },
    "approvals_runs_incidents_settings_paths": {
        "status": "covered_by_existing_ui_evidence",
        "evidence": [
            "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/manual-workflow-qa/20260306T211311Z/summary.json",
            "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/v1-perfect-ui-rubric-assessment-latest.json"
        ]
    },
    "incident_export_audit_handoff": {
        "status": "covered_by_existing_ui_evidence",
        "evidence": [
            "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/desktop-closeout/m13-m14-closeout-latest.summary.json"
        ]
    },
    "install_bundle_path": installed_app_path,
    "bootstrap_path": bootstrap_path,
    "verification_log_path": log_path
}
checklist_path.write_text(json.dumps(checklist, indent=2) + "\n")
PY

EPYDIOS_M15_MACOS_INSTALL_ROOT="${INSTALL_ROOT}" \
  EPYDIOS_M15_MACOS_SUPPORT_ROOT="${SUPPORT_ROOT}" \
  "${M15_MODULE_ROOT}/bin/uninstall-m15-macos-beta.sh" >>"${LOG_PATH}" 2>&1

[ ! -e "${INSTALLED_APP_PATH}" ] || {
  echo "verify-m15-phase-c failed: installed app still present after uninstall at ${INSTALLED_APP_PATH}" >&2
  exit 1
}

cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "phase_c_beta_ready",
  "reason": "Packaged macOS .app installed locally, launched without a browser using the bootstrap runtime config, and completed the install/uninstall beta flow with sandbox defaults preserved.",
  "log_path": "${LOG_PATH}",
  "installed_app_path": "${INSTALLED_APP_PATH}",
  "bootstrap_path": "${BOOTSTRAP_PATH}",
  "session_manifest_path": "${SESSION_MANIFEST}",
  "event_log_path": "${EVENT_LOG}",
  "operator_beta_checklist_path": "${CHECKLIST_PATH}"
}
EOF
cp "${LOG_PATH}" "${LATEST_LOG}"
cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"

echo "M15 Phase C verifier passed."
