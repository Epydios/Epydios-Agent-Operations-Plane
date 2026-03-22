#!/usr/bin/env bash
set -euo pipefail

APP_INSTALL_NAME="Epydios AgentOps Desktop.AppImage"
APP_LAUNCHER_NAME="epydios-agentops-desktop"
CONFIG_HOME_DEFAULT="${XDG_CONFIG_HOME:-${HOME}/.config}"
DATA_HOME_DEFAULT="${XDG_DATA_HOME:-${HOME}/.local/share}"

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

if [ "${fail}" -ne 0 ]; then
  echo "RESULT: FAIL"
  exit 1
fi

echo "RESULT: PASS"
