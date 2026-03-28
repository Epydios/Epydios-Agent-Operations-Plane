#!/usr/bin/env bash
set -euo pipefail

CURRENT_HOST="$(uname -s | tr '[:upper:]' '[:lower:]')"
APP_INSTALL_NAME="Epydios AgentOps Desktop.AppImage"
APP_LAUNCHER_NAME="epydios-agentops-desktop"
CONFIG_HOME_DEFAULT="${XDG_CONFIG_HOME:-${HOME}/.config}"
DATA_HOME_DEFAULT="${XDG_DATA_HOME:-${HOME}/.local/share}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHASE_ROOT="${SCRIPT_DIR}/../.epydios/internal-readiness/m15-native-phase-b"

INSTALL_ROOT="${EPYDIOS_M15_LINUX_INSTALL_ROOT:-${DATA_HOME_DEFAULT}/EpydiosAgentOpsDesktop}"
SUPPORT_ROOT="${EPYDIOS_M15_LINUX_SUPPORT_ROOT:-${CONFIG_HOME_DEFAULT}/EpydiosAgentOpsDesktop}"
BIN_ROOT="${EPYDIOS_M15_LINUX_BIN_ROOT:-${HOME}/.local/bin}"
APPLICATIONS_ROOT="${EPYDIOS_M15_LINUX_APPLICATIONS_ROOT:-${DATA_HOME_DEFAULT}/applications}"

INSTALL_PATH="${INSTALL_ROOT}/${APP_INSTALL_NAME}"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCH_HELPER_PATH="${SUPPORT_ROOT}/launch-installed.sh"
DESKTOP_ENTRY_PATH="${APPLICATIONS_ROOT}/${APP_LAUNCHER_NAME}.desktop"
USER_LAUNCHER_PATH="${BIN_ROOT}/${APP_LAUNCHER_NAME}"

fail=0

if [ "${CURRENT_HOST}" != "linux" ]; then
  PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-linux-latest.summary.json"
  if [ ! -f "${PACKAGE_SUMMARY}" ]; then
    echo "MISS Linux beta installed evaluation lane package summary: ${PACKAGE_SUMMARY}"
    echo "RESULT: FAIL"
    exit 1
  fi

  package_status="$(jq -r '.status // ""' "${PACKAGE_SUMMARY}")"
  install_contract="$(jq -r '.install_contract // ""' "${PACKAGE_SUMMARY}")"
  release_support_lane="$(jq -r '.release_support_lane // ""' "${PACKAGE_SUMMARY}")"
  update_posture="$(jq -r '.update_posture // ""' "${PACKAGE_SUMMARY}")"
  runtime_posture="$(jq -r '.runtime_posture // ""' "${PACKAGE_SUMMARY}")"

  if [ "${package_status}" = "blocked_active_host_non_linux" ] && \
    [ "${install_contract}" = "beta_linux_installed_evaluation_lane" ] && \
    [ "${release_support_lane}" = "beta_linux_installed_evaluation_lane" ] && \
    [ "${update_posture}" = "manual_reinstall_from_packaged_artifact" ] && \
    [ "${runtime_posture}" = "beta_cluster_backed_live_lane" ]; then
    echo "OK   Linux beta installed evaluation lane blocker recorded for active non-Linux host"
    echo "RESULT: PASS"
    exit 0
  fi

  echo "MISS Linux beta installed evaluation lane blocker or contract fields in ${PACKAGE_SUMMARY}"
  echo "RESULT: FAIL"
  exit 1
fi

check_file() {
  local path="$1"
  local label="$2"
  if [ -e "${path}" ]; then
    echo "OK   ${label}: ${path}"
  else
    echo "MISS ${label}: ${path}"
    fail=1
  fi
}

check_exec() {
  local path="$1"
  local label="$2"
  if [ -x "${path}" ]; then
    echo "OK   ${label}: ${path}"
  else
    echo "MISS ${label}: ${path}"
    fail=1
  fi
}

echo "Verifying installed Linux desktop path..."
check_exec "${INSTALL_PATH}" "Installed AppImage"
check_file "${BOOTSTRAP_PATH}" "Bootstrap config"
check_exec "${LAUNCH_HELPER_PATH}" "Launch helper"
check_file "${DESKTOP_ENTRY_PATH}" "Desktop entry"
check_exec "${USER_LAUNCHER_PATH}" "User launcher"

INSTALL_SUMMARY="${PHASE_ROOT}/install-m15-linux-beta-latest.summary.json"
if [ -f "${INSTALL_SUMMARY}" ]; then
  contract_ok=1
  [ "$(jq -r '.install_contract // ""' "${INSTALL_SUMMARY}")" = "beta_linux_installed_evaluation_lane" ] || contract_ok=0
  [ "$(jq -r '.release_support_lane // ""' "${INSTALL_SUMMARY}")" = "beta_linux_installed_evaluation_lane" ] || contract_ok=0
  [ "$(jq -r '.update_posture // ""' "${INSTALL_SUMMARY}")" = "manual_reinstall_from_packaged_artifact" ] || contract_ok=0
  [ "$(jq -r '.runtime_posture // ""' "${INSTALL_SUMMARY}")" = "beta_cluster_backed_live_lane" ] || contract_ok=0
  if [ "${contract_ok}" -eq 1 ]; then
    echo "OK   Installed contract fields: ${INSTALL_SUMMARY}"
  else
    echo "MISS Installed contract fields: ${INSTALL_SUMMARY}"
    fail=1
  fi
fi

if [ "${fail}" -ne 0 ]; then
  echo "RESULT: FAIL"
  exit 1
fi

echo "RESULT: PASS"
