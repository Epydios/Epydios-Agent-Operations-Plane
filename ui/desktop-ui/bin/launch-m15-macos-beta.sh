#!/usr/bin/env bash
set -euo pipefail

APP_INSTALL_NAME="Epydios AgentOps Desktop.app"
INSTALL_ROOT="${EPYDIOS_M15_MACOS_INSTALL_ROOT:-${HOME}/Applications}"
SUPPORT_ROOT="${EPYDIOS_M15_MACOS_SUPPORT_ROOT:-${HOME}/Library/Application Support/EpydiosAgentOpsDesktop}"
INSTALL_PATH="${INSTALL_ROOT}/${APP_INSTALL_NAME}"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCH_HELPER_PATH="${SUPPORT_ROOT}/launch-installed.sh"
EXECUTABLE_PATH="${INSTALL_PATH}/Contents/MacOS/epydios-agentops-desktop"

if [ -x "${LAUNCH_HELPER_PATH}" ]; then
  exec "${LAUNCH_HELPER_PATH}" "$@"
fi

[ -x "${EXECUTABLE_PATH}" ] || {
  echo "launch-m15-macos-beta failed: installed app executable missing at ${EXECUTABLE_PATH} and no launch helper was found at ${LAUNCH_HELPER_PATH}" >&2
  exit 1
}
[ -f "${BOOTSTRAP_PATH}" ] || {
  echo "launch-m15-macos-beta failed: bootstrap config missing at ${BOOTSTRAP_PATH} and no launch helper was found at ${LAUNCH_HELPER_PATH}" >&2
  exit 1
}

export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="${BOOTSTRAP_PATH}"
exec "${EXECUTABLE_PATH}" "$@"
