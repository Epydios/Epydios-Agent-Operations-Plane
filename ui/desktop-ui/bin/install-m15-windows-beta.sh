#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

APP_INSTALL_NAME="Epydios AgentOps Desktop.exe"
LAUNCHER_CMD_NAME="Launch Epydios AgentOps Desktop.cmd"
LAUNCHER_SH_NAME="launch-epydios-agentops-desktop.sh"
STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-d)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/install-m15-windows-beta.log"
SUMMARY_PATH="${RUN_ROOT}/install-m15-windows-beta.summary.json"
LATEST_LOG="${PHASE_ROOT}/install-m15-windows-beta-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/install-m15-windows-beta-latest.summary.json"
mkdir -p "${RUN_ROOT}"

PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-windows-latest.summary.json"
[ -f "${PACKAGE_SUMMARY}" ] || {
  echo "install-m15-windows-beta failed: missing package summary ${PACKAGE_SUMMARY}" >&2
  exit 1
}

PACKAGE_STATUS="$(jq -r '.status // ""' "${PACKAGE_SUMMARY}")"
[ "${PACKAGE_STATUS}" = "packaged_windows_installer_baseline" ] || {
  echo "install-m15-windows-beta failed: latest package summary status is ${PACKAGE_STATUS}" >&2
  exit 1
}

WINDOWS_BINARY_PATH="$(jq -r '.binary_path // ""' "${PACKAGE_SUMMARY}")"
WINDOWS_INSTALLER_PATH="$(jq -r '.installer_path // ""' "${PACKAGE_SUMMARY}")"
[ -f "${WINDOWS_BINARY_PATH}" ] || {
  echo "install-m15-windows-beta failed: packaged Windows binary missing at ${WINDOWS_BINARY_PATH}" >&2
  exit 1
}
[ -f "${WINDOWS_INSTALLER_PATH}" ] || {
  echo "install-m15-windows-beta failed: packaged Windows installer missing at ${WINDOWS_INSTALLER_PATH}" >&2
  exit 1
}

windows_path() {
  local candidate="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "${candidate}"
    return
  fi
  printf '%s\n' "${candidate}"
}

LOCAL_APPDATA_ROOT="${LOCALAPPDATA:-${USERPROFILE:-${HOME}}/AppData/Local}"
ROAMING_APPDATA_ROOT="${APPDATA:-${USERPROFILE:-${HOME}}/AppData/Roaming}"

INSTALL_ROOT="${EPYDIOS_M15_WINDOWS_INSTALL_ROOT:-${LOCAL_APPDATA_ROOT}/EpydiosAgentOpsDesktop}"
SUPPORT_ROOT="${EPYDIOS_M15_WINDOWS_SUPPORT_ROOT:-${ROAMING_APPDATA_ROOT}/EpydiosAgentOpsDesktop}"
INSTALL_PATH="${INSTALL_ROOT}/${APP_INSTALL_NAME}"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCHER_CMD_PATH="${INSTALL_ROOT}/${LAUNCHER_CMD_NAME}"
LAUNCHER_SH_PATH="${SUPPORT_ROOT}/${LAUNCHER_SH_NAME}"

INSTALL_PATH_NATIVE="$(windows_path "${INSTALL_PATH}")"
BOOTSTRAP_PATH_NATIVE="$(windows_path "${BOOTSTRAP_PATH}")"

write_summary() {
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "$(m15_json_escape "${STAMP}")",
  "status": "installed_windows_beta_bundle",
  "install_root": "$(m15_json_escape "${INSTALL_ROOT}")",
  "install_path": "$(m15_json_escape "${INSTALL_PATH}")",
  "support_root": "$(m15_json_escape "${SUPPORT_ROOT}")",
  "bootstrap_path": "$(m15_json_escape "${BOOTSTRAP_PATH}")",
  "launcher_cmd_path": "$(m15_json_escape "${LAUNCHER_CMD_PATH}")",
  "launcher_sh_path": "$(m15_json_escape "${LAUNCHER_SH_PATH}")",
  "log_path": "$(m15_json_escape "${LOG_PATH}")",
  "source_binary_path": "$(m15_json_escape "${WINDOWS_BINARY_PATH}")",
  "source_installer_path": "$(m15_json_escape "${WINDOWS_INSTALLER_PATH}")"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
}

{
  echo "Installing ${WINDOWS_BINARY_PATH} -> ${INSTALL_PATH}"
  mkdir -p "${INSTALL_ROOT}" "${SUPPORT_ROOT}"
  cp "${WINDOWS_BINARY_PATH}" "${INSTALL_PATH}"
  cat > "${BOOTSTRAP_PATH}" <<EOF
{
  "mode": "${M15_WINDOWS_BETA_MODE:-live}",
  "runtimeLocalPort": ${M15_WINDOWS_RUNTIME_PORT:-8080},
  "gatewayLocalPort": ${M15_WINDOWS_GATEWAY_PORT:-18765},
  "runtimeNamespace": "${M15_WINDOWS_RUNTIME_NAMESPACE:-epydios-system}",
  "runtimeService": "${M15_WINDOWS_RUNTIME_SERVICE:-orchestration-runtime}",
  "interpositionEnabled": false
}
EOF
  cat > "${LAUNCHER_CMD_PATH}" <<EOF
@echo off
setlocal
set "EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH=${BOOTSTRAP_PATH_NATIVE}"
"${INSTALL_PATH_NATIVE}" %*
EOF
  cat > "${LAUNCHER_SH_PATH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="${BOOTSTRAP_PATH_NATIVE}"
exec "${INSTALL_PATH}" "\$@"
EOF
  chmod +x "${LAUNCHER_SH_PATH}"
} >"${LOG_PATH}" 2>&1

write_summary

echo "install-m15-windows-beta: installed bundle at ${INSTALL_PATH}"
