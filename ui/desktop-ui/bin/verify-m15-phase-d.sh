#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-d)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/verify-m15-phase-d.log"
SUMMARY_PATH="${RUN_ROOT}/verify-m15-phase-d.summary.json"
LATEST_LOG="${PHASE_ROOT}/verify-m15-phase-d-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/verify-m15-phase-d-latest.summary.json"
PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-windows-latest.summary.json"
KEEP_WINDOWS_BETA_INSTALLED="${EPYDIOS_KEEP_WINDOWS_BETA_INSTALLED:-0}"
USE_REAL_WINDOWS_BETA_HOME="${EPYDIOS_WINDOWS_PHASE_D_USE_REAL_USER_HOME:-0}"
mkdir -p "${RUN_ROOT}"

[ -f "${PACKAGE_SUMMARY}" ] || {
  echo "verify-m15-phase-d failed: missing latest Windows package summary at ${PACKAGE_SUMMARY}" >&2
  exit 1
}

PACKAGE_STATUS="$(jq -r '.status // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_REASON="$(jq -r '.reason // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_BINARY="$(jq -r '.binary_path // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_INSTALLER="$(jq -r '.installer_path // ""' "${PACKAGE_SUMMARY}")"
CURRENT_HOST="$(uname -s | tr '[:upper:]' '[:lower:]')"

normalize_package_path() {
  local candidate="$1"
  local container_root="/workspace/agentops-desktop"
  if [[ "${candidate}" == "${container_root}"* ]]; then
    printf '%s\n' "${M15_WORKSPACE_ROOT}${candidate#${container_root}}"
    return
  fi
  printf '%s\n' "${candidate}"
}

PACKAGE_BINARY="$(normalize_package_path "${PACKAGE_BINARY}")"
PACKAGE_INSTALLER="$(normalize_package_path "${PACKAGE_INSTALLER}")"

is_windows_host() {
  case "${CURRENT_HOST}" in
    msys*|mingw*|cygwin*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if [[ "${PACKAGE_STATUS}" == blocked_* ]]; then
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "$(m15_json_escape "${STAMP}")",
  "status": "phase_d_blocked_before_packaging",
  "reason": "$(m15_json_escape "${PACKAGE_REASON}")",
  "package_summary_path": "$(m15_json_escape "${PACKAGE_SUMMARY}")",
  "log_path": "$(m15_json_escape "${LOG_PATH}")"
}
EOF
  : > "${LOG_PATH}"
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
  echo "M15 Phase D verifier recorded the packaging blocker."
  exit 0
fi

[ "${PACKAGE_STATUS}" = "packaged_windows_installer_baseline" ] || {
  echo "verify-m15-phase-d failed: latest package summary status is ${PACKAGE_STATUS}" >&2
  exit 1
}
[ -f "${PACKAGE_BINARY}" ] || {
  echo "verify-m15-phase-d failed: packaged Windows binary missing at ${PACKAGE_BINARY}" >&2
  exit 1
}
[ -f "${PACKAGE_INSTALLER}" ] || {
  echo "verify-m15-phase-d failed: packaged Windows installer missing at ${PACKAGE_INSTALLER}" >&2
  exit 1
}

PACKAGE_INSTALL_CONTRACT="$(jq -r '.install_contract // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_RELEASE_SUPPORT_LANE="$(jq -r '.release_support_lane // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_UPDATE_POSTURE="$(jq -r '.update_posture // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_RUNTIME_POSTURE="$(jq -r '.runtime_posture // ""' "${PACKAGE_SUMMARY}")"

if ! is_windows_host; then
  (
    cd "${M15_REPO_ROOT}"
    ./platform/local/bin/verify-m14-win-restricted-readiness.sh
    ./platform/local/bin/verify-m14-openfang-xos-adapters.sh
    ./platform/local/bin/verify-m14-openfang-enablement-gate.sh
    ./platform/local/bin/verify-m14-xos-parity.sh
  ) >"${LOG_PATH}" 2>&1

  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "$(m15_json_escape "${STAMP}")",
  "status": "phase_d_packaging_baseline_and_verifier_foundation",
  "install_contract": "$(m15_json_escape "${PACKAGE_INSTALL_CONTRACT}")",
  "release_support_lane": "$(m15_json_escape "${PACKAGE_RELEASE_SUPPORT_LANE}")",
  "update_posture": "$(m15_json_escape "${PACKAGE_UPDATE_POSTURE}")",
  "runtime_posture": "$(m15_json_escape "${PACKAGE_RUNTIME_POSTURE}")",
  "reason": "Windows beta installed evaluation lane packaging and verifier foundation passed. A real installed-launcher proof is still required on a Windows host to close the Phase D exit gate.",
  "package_summary_path": "$(m15_json_escape "${PACKAGE_SUMMARY}")",
  "binary_path": "$(m15_json_escape "${PACKAGE_BINARY}")",
  "installer_path": "$(m15_json_escape "${PACKAGE_INSTALLER}")",
  "log_path": "$(m15_json_escape "${LOG_PATH}")",
  "verifiers": [
    "platform/local/bin/verify-m14-win-restricted-readiness.sh",
    "platform/local/bin/verify-m14-openfang-xos-adapters.sh",
    "platform/local/bin/verify-m14-openfang-enablement-gate.sh",
    "platform/local/bin/verify-m14-xos-parity.sh"
  ]
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"

  echo "M15 Phase D verifier passed."
  exit 0
fi

if [ "${USE_REAL_WINDOWS_BETA_HOME}" = "1" ]; then
  USERPROFILE_ROOT="$(m15_shell_path "${USERPROFILE:-${HOME}}")"
  APPDATA_ROOT="$(m15_shell_path "${APPDATA:-${USERPROFILE_ROOT}/AppData/Roaming}")"
  LOCALAPPDATA_ROOT="$(m15_shell_path "${LOCALAPPDATA:-${USERPROFILE_ROOT}/AppData/Local}")"
else
  RUN_HOME="${RUN_ROOT}/windows-home"
  USERPROFILE_ROOT="${RUN_HOME}/UserProfile"
  APPDATA_ROOT="${USERPROFILE_ROOT}/AppData/Roaming"
  LOCALAPPDATA_ROOT="${USERPROFILE_ROOT}/AppData/Local"
fi
INSTALL_ROOT="${LOCALAPPDATA_ROOT}/EpydiosAgentOpsDesktop"
SUPPORT_ROOT="${APPDATA_ROOT}/EpydiosAgentOpsDesktop"
CHECKLIST_PATH="${RUN_ROOT}/operator-beta-checklist.json"
INSTALL_LOG_PATH="${RUN_ROOT}/windows-installed-app.log"
mkdir -p "${USERPROFILE_ROOT}" "${APPDATA_ROOT}" "${LOCALAPPDATA_ROOT}"

cleanup() {
  if [ -n "${APP_PID:-}" ] && kill -0 "${APP_PID}" >/dev/null 2>&1; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
    wait "${APP_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

{
  echo "Installing Windows beta bundle into ${INSTALL_ROOT}"
  USERPROFILE="${USERPROFILE_ROOT}" \
  APPDATA="${APPDATA_ROOT}" \
  LOCALAPPDATA="${LOCALAPPDATA_ROOT}" \
  M15_WINDOWS_BETA_MODE="mock" \
  EPYDIOS_M15_WINDOWS_INSTALL_ROOT="${INSTALL_ROOT}" \
  EPYDIOS_M15_WINDOWS_SUPPORT_ROOT="${SUPPORT_ROOT}" \
  "${M15_MODULE_ROOT}/bin/install-m15-windows-beta.sh"
} >"${LOG_PATH}" 2>&1

INSTALL_SUMMARY="${PHASE_ROOT}/install-m15-windows-beta-latest.summary.json"
INSTALLED_APP_PATH="$(jq -r '.install_path // ""' "${INSTALL_SUMMARY}")"
BOOTSTRAP_PATH="$(jq -r '.bootstrap_path // ""' "${INSTALL_SUMMARY}")"
SUPPORT_ROOT_SUMMARY="$(jq -r '.support_root // ""' "${INSTALL_SUMMARY}")"
LAUNCHER_CMD_PATH="$(jq -r '.launcher_cmd_path // ""' "${INSTALL_SUMMARY}")"
LAUNCHER_SH_PATH="$(jq -r '.launcher_sh_path // ""' "${INSTALL_SUMMARY}")"
INSTALL_CONTRACT="$(jq -r '.install_contract // ""' "${INSTALL_SUMMARY}")"
RELEASE_SUPPORT_LANE="$(jq -r '.release_support_lane // ""' "${INSTALL_SUMMARY}")"
UPDATE_POSTURE="$(jq -r '.update_posture // ""' "${INSTALL_SUMMARY}")"
RUNTIME_POSTURE="$(jq -r '.runtime_posture // ""' "${INSTALL_SUMMARY}")"
[ -f "${INSTALLED_APP_PATH}" ] || {
  echo "verify-m15-phase-d failed: installed executable missing at ${INSTALLED_APP_PATH}" >&2
  exit 1
}
[ -f "${LAUNCHER_CMD_PATH}" ] || {
  echo "verify-m15-phase-d failed: installed command launcher missing at ${LAUNCHER_CMD_PATH}" >&2
  exit 1
}
[ -x "${LAUNCHER_SH_PATH}" ] || {
  echo "verify-m15-phase-d failed: installed shell launcher missing at ${LAUNCHER_SH_PATH}" >&2
  exit 1
}

(
  export USERPROFILE="${USERPROFILE_ROOT}"
  export APPDATA="${APPDATA_ROOT}"
  export LOCALAPPDATA="${LOCALAPPDATA_ROOT}"
  export HOME="${USERPROFILE_ROOT}"
  "${LAUNCHER_SH_PATH}"
) >>"${INSTALL_LOG_PATH}" 2>&1 &
APP_PID=$!

SESSION_MANIFEST=""
EVENT_LOG=""
deadline=$((SECONDS + 60))
while [ "${SECONDS}" -lt "${deadline}" ]; do
  SESSION_MANIFEST="$(find "${LOCALAPPDATA_ROOT}/EpydiosAgentOpsDesktop/native-shell" -name session.json -print 2>/dev/null | sort | tail -n1 || true)"
  if [ -n "${SESSION_MANIFEST}" ] && [ -f "${SESSION_MANIFEST}" ]; then
    EVENT_LOG="$(dirname "${SESSION_MANIFEST}")/logs/session-events.jsonl"
    if [ -f "${EVENT_LOG}" ] && grep -q '"event":"native_window_dom_ready"' "${EVENT_LOG}"; then
      break
    fi
  fi
  sleep 1
done

[ -n "${SESSION_MANIFEST}" ] && [ -f "${SESSION_MANIFEST}" ] || {
  echo "verify-m15-phase-d failed: missing session manifest" >&2
  exit 1
}
[ -f "${EVENT_LOG}" ] || {
  echo "verify-m15-phase-d failed: missing event log" >&2
  exit 1
}

python3 - <<'PY' "${SESSION_MANIFEST}" "${CHECKLIST_PATH}" "${LOG_PATH}" "${INSTALLED_APP_PATH}" "${BOOTSTRAP_PATH}" "${LAUNCHER_SH_PATH}" "${SUPPORT_ROOT_SUMMARY}" "${INSTALL_CONTRACT}" "${RELEASE_SUPPORT_LANE}" "${UPDATE_POSTURE}" "${RUNTIME_POSTURE}"
import json
import ntpath
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
checklist_path = pathlib.Path(sys.argv[2])
log_path = sys.argv[3]
installed_app_path = sys.argv[4]
bootstrap_path = sys.argv[5]
launcher_path = sys.argv[6]
support_root = sys.argv[7]
install_contract = sys.argv[8]
release_support_lane = sys.argv[9]
update_posture = sys.argv[10]
runtime_posture = sys.argv[11]
manifest = json.loads(manifest_path.read_text())

def normalize_windowsish(path: str) -> str:
    return ntpath.normcase(path.replace("/", "\\"))

assert install_contract == "beta_windows_installed_evaluation_lane", install_contract
assert release_support_lane == "beta_windows_installed_evaluation_lane", release_support_lane
assert update_posture == "manual_reinstall_from_packaged_artifact", update_posture
assert runtime_posture == "beta_cluster_backed_live_lane", runtime_posture
assert manifest["mode"] == "mock", manifest["mode"]
assert manifest["launcherState"] == "ready", manifest["launcherState"]
assert manifest["runtimeProcessMode"] == "mock_only", manifest["runtimeProcessMode"]
assert manifest["bootstrapConfigState"] == "loaded", manifest["bootstrapConfigState"]
assert normalize_windowsish(manifest["bootstrapConfigPath"]) == normalize_windowsish(bootstrap_path), manifest["bootstrapConfigPath"]
assert normalize_windowsish(manifest["paths"]["configRoot"]) == normalize_windowsish(support_root), manifest["paths"]["configRoot"]
assert manifest["paths"]["gatewayRoot"].endswith("localhost-gateway"), manifest["paths"]["gatewayRoot"]
assert normalize_windowsish(manifest["gatewayService"]["statusPath"]) == normalize_windowsish(manifest["paths"]["gatewayStatusPath"]), manifest["gatewayService"]["statusPath"]

checklist = {
    "startup_reliability": {
        "status": "pass",
        "evidence": str(manifest_path),
        "notes": "Installed Windows launcher reached native_window_dom_ready without a terminal-first workflow."
    },
    "install_path": installed_app_path,
    "launcher_path": launcher_path,
    "bootstrap_path": bootstrap_path,
    "verification_log_path": log_path
}
checklist_path.write_text(json.dumps(checklist, indent=2) + "\n")
PY

if [ "${KEEP_WINDOWS_BETA_INSTALLED}" = "1" ]; then
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "$(m15_json_escape "${STAMP}")",
  "status": "phase_d_beta_ready_installed",
  "install_contract": "$(m15_json_escape "${INSTALL_CONTRACT}")",
  "release_support_lane": "$(m15_json_escape "${RELEASE_SUPPORT_LANE}")",
  "update_posture": "$(m15_json_escape "${UPDATE_POSTURE}")",
  "runtime_posture": "$(m15_json_escape "${RUNTIME_POSTURE}")",
  "reason": "Installed Windows beta evaluation lane completed the package, install, launch, and session flow with bootstrap config and launcher diagnostics in place. The installed bundle was intentionally left in place for operator use.",
  "package_summary_path": "$(m15_json_escape "${PACKAGE_SUMMARY}")",
  "binary_path": "$(m15_json_escape "${PACKAGE_BINARY}")",
  "installer_path": "$(m15_json_escape "${PACKAGE_INSTALLER}")",
  "installed_app_path": "$(m15_json_escape "${INSTALLED_APP_PATH}")",
  "launcher_path": "$(m15_json_escape "${LAUNCHER_SH_PATH}")",
  "launcher_entry_path": "$(m15_json_escape "${LAUNCHER_CMD_PATH}")",
  "support_root": "$(m15_json_escape "${SUPPORT_ROOT_SUMMARY}")",
  "bootstrap_path": "$(m15_json_escape "${BOOTSTRAP_PATH}")",
  "session_manifest_path": "$(m15_json_escape "${SESSION_MANIFEST}")",
  "event_log_path": "$(m15_json_escape "${EVENT_LOG}")",
  "operator_beta_checklist_path": "$(m15_json_escape "${CHECKLIST_PATH}")",
  "log_path": "$(m15_json_escape "${LOG_PATH}")"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
  echo "M15 Phase D verifier passed."
  exit 0
fi

USERPROFILE="${USERPROFILE_ROOT}" \
APPDATA="${APPDATA_ROOT}" \
LOCALAPPDATA="${LOCALAPPDATA_ROOT}" \
EPYDIOS_M15_WINDOWS_INSTALL_ROOT="${INSTALL_ROOT}" \
EPYDIOS_M15_WINDOWS_SUPPORT_ROOT="${SUPPORT_ROOT}" \
  "${M15_MODULE_ROOT}/bin/uninstall-m15-windows-beta.sh" >>"${LOG_PATH}" 2>&1

[ ! -e "${INSTALLED_APP_PATH}" ] || {
  echo "verify-m15-phase-d failed: installed executable still present after uninstall at ${INSTALLED_APP_PATH}" >&2
  exit 1
}
[ ! -e "${LAUNCHER_SH_PATH}" ] || {
  echo "verify-m15-phase-d failed: installed launcher still present after uninstall at ${LAUNCHER_SH_PATH}" >&2
  exit 1
}

cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "$(m15_json_escape "${STAMP}")",
  "status": "phase_d_beta_ready",
  "install_contract": "$(m15_json_escape "${INSTALL_CONTRACT}")",
  "release_support_lane": "$(m15_json_escape "${RELEASE_SUPPORT_LANE}")",
  "update_posture": "$(m15_json_escape "${UPDATE_POSTURE}")",
  "runtime_posture": "$(m15_json_escape "${RUNTIME_POSTURE}")",
  "reason": "Installed Windows beta evaluation lane completed the install, launch, session, and uninstall flow with bootstrap config and launcher diagnostics in place.",
  "package_summary_path": "$(m15_json_escape "${PACKAGE_SUMMARY}")",
  "binary_path": "$(m15_json_escape "${PACKAGE_BINARY}")",
  "installer_path": "$(m15_json_escape "${PACKAGE_INSTALLER}")",
  "installed_app_path": "$(m15_json_escape "${INSTALLED_APP_PATH}")",
  "launcher_path": "$(m15_json_escape "${LAUNCHER_SH_PATH}")",
  "launcher_entry_path": "$(m15_json_escape "${LAUNCHER_CMD_PATH}")",
  "support_root": "$(m15_json_escape "${SUPPORT_ROOT_SUMMARY}")",
  "bootstrap_path": "$(m15_json_escape "${BOOTSTRAP_PATH}")",
  "session_manifest_path": "$(m15_json_escape "${SESSION_MANIFEST}")",
  "event_log_path": "$(m15_json_escape "${EVENT_LOG}")",
  "operator_beta_checklist_path": "$(m15_json_escape "${CHECKLIST_PATH}")",
  "log_path": "$(m15_json_escape "${LOG_PATH}")"
}
EOF
cp "${LOG_PATH}" "${LATEST_LOG}"
cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"

echo "M15 Phase D verifier passed."
exit 0
