#!/usr/bin/env bash
set -euo pipefail

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
INSTALL_PATH="${INSTALL_ROOT}/Epydios AgentOps Desktop.exe"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCHER_SH_PATH="${SUPPORT_ROOT}/launch-epydios-agentops-desktop.sh"

if [ -x "${LAUNCHER_SH_PATH}" ]; then
  exec "${LAUNCHER_SH_PATH}" "$@"
fi

[ -f "${INSTALL_PATH}" ] || {
  echo "launch-m15-windows-beta failed: installed executable missing at ${INSTALL_PATH}" >&2
  exit 1
}
[ -f "${BOOTSTRAP_PATH}" ] || {
  echo "launch-m15-windows-beta failed: bootstrap config missing at ${BOOTSTRAP_PATH}" >&2
  exit 1
}

export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="$(windows_path "${BOOTSTRAP_PATH}")"
exec "${INSTALL_PATH}" "$@"
