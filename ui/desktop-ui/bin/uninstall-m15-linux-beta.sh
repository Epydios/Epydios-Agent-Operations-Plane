#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

APP_INSTALL_NAME="Epydios AgentOps Desktop.AppImage"
APP_LAUNCHER_NAME="epydios-agentops-desktop"
STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-b)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/uninstall-m15-linux-beta.log"
SUMMARY_PATH="${RUN_ROOT}/uninstall-m15-linux-beta.summary.json"
LATEST_LOG="${PHASE_ROOT}/uninstall-m15-linux-beta-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/uninstall-m15-linux-beta-latest.summary.json"
mkdir -p "${RUN_ROOT}"

CONFIG_HOME_DEFAULT="${XDG_CONFIG_HOME:-${HOME}/.config}"
DATA_HOME_DEFAULT="${XDG_DATA_HOME:-${HOME}/.local/share}"
BIN_HOME_DEFAULT="${HOME}/.local/bin"
APPLICATIONS_HOME_DEFAULT="${DATA_HOME_DEFAULT}/applications"

INSTALL_ROOT="${EPYDIOS_M15_LINUX_INSTALL_ROOT:-${DATA_HOME_DEFAULT}/EpydiosAgentOpsDesktop}"
BIN_ROOT="${EPYDIOS_M15_LINUX_BIN_ROOT:-${BIN_HOME_DEFAULT}}"
SUPPORT_ROOT="${EPYDIOS_M15_LINUX_SUPPORT_ROOT:-${CONFIG_HOME_DEFAULT}/EpydiosAgentOpsDesktop}"
APPLICATIONS_ROOT="${EPYDIOS_M15_LINUX_APPLICATIONS_ROOT:-${APPLICATIONS_HOME_DEFAULT}}"
INSTALL_PATH="${INSTALL_ROOT}/${APP_INSTALL_NAME}"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCH_HELPER_PATH="${SUPPORT_ROOT}/launch-installed.sh"
LAUNCHER_PATH="${BIN_ROOT}/${APP_LAUNCHER_NAME}"
DESKTOP_FILE_PATH="${APPLICATIONS_ROOT}/${APP_LAUNCHER_NAME}.desktop"
ICON_PATH="${INSTALL_ROOT}/${APP_LAUNCHER_NAME}.png"

{
  echo "Removing ${INSTALL_PATH}"
  rm -f "${INSTALL_PATH}" "${ICON_PATH}" "${LAUNCHER_PATH}" "${DESKTOP_FILE_PATH}"
  rm -f "${BOOTSTRAP_PATH}" "${LAUNCH_HELPER_PATH}"
  rmdir "${SUPPORT_ROOT}" 2>/dev/null || true
  rmdir "${INSTALL_ROOT}" 2>/dev/null || true
  rmdir "${BIN_ROOT}" 2>/dev/null || true
  rmdir "${APPLICATIONS_ROOT}" 2>/dev/null || true
} >"${LOG_PATH}" 2>&1

cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "uninstalled_linux_beta_bundle",
  "install_root": "${INSTALL_ROOT}",
  "install_path": "${INSTALL_PATH}",
  "support_root": "${SUPPORT_ROOT}",
  "launcher_path": "${LAUNCHER_PATH}",
  "desktop_file_path": "${DESKTOP_FILE_PATH}",
  "log_path": "${LOG_PATH}"
}
EOF
cp "${LOG_PATH}" "${LATEST_LOG}"
cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"

echo "uninstall-m15-linux-beta: removed bundle from ${INSTALL_PATH}"
