#!/usr/bin/env bash
set -euo pipefail

APP_INSTALL_NAME="Epydios AgentOps Desktop.AppImage"
CONFIG_HOME_DEFAULT="${XDG_CONFIG_HOME:-${HOME}/.config}"
DATA_HOME_DEFAULT="${XDG_DATA_HOME:-${HOME}/.local/share}"

INSTALL_ROOT="${EPYDIOS_M15_LINUX_INSTALL_ROOT:-${DATA_HOME_DEFAULT}/EpydiosAgentOpsDesktop}"
SUPPORT_ROOT="${EPYDIOS_M15_LINUX_SUPPORT_ROOT:-${CONFIG_HOME_DEFAULT}/EpydiosAgentOpsDesktop}"
INSTALL_PATH="${INSTALL_ROOT}/${APP_INSTALL_NAME}"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCH_HELPER_PATH="${SUPPORT_ROOT}/launch-installed.sh"

if [ -x "${LAUNCH_HELPER_PATH}" ]; then
  exec "${LAUNCH_HELPER_PATH}" "$@"
fi

[ -x "${INSTALL_PATH}" ] || {
  echo "launch-m15-linux-beta failed: installed AppImage missing at ${INSTALL_PATH}" >&2
  exit 1
}
[ -f "${BOOTSTRAP_PATH}" ] || {
  echo "launch-m15-linux-beta failed: bootstrap config missing at ${BOOTSTRAP_PATH}" >&2
  exit 1
}

export APPIMAGE_EXTRACT_AND_RUN=1
export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="${BOOTSTRAP_PATH}"
exec "${INSTALL_PATH}" "$@"
