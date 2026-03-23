#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-d)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/uninstall-m15-windows-beta.log"
SUMMARY_PATH="${RUN_ROOT}/uninstall-m15-windows-beta.summary.json"
LATEST_LOG="${PHASE_ROOT}/uninstall-m15-windows-beta-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/uninstall-m15-windows-beta-latest.summary.json"
mkdir -p "${RUN_ROOT}"

LOCAL_APPDATA_ROOT="${LOCALAPPDATA:-${USERPROFILE:-${HOME}}/AppData/Local}"
ROAMING_APPDATA_ROOT="${APPDATA:-${USERPROFILE:-${HOME}}/AppData/Roaming}"

INSTALL_ROOT="${EPYDIOS_M15_WINDOWS_INSTALL_ROOT:-${LOCAL_APPDATA_ROOT}/EpydiosAgentOpsDesktop}"
SUPPORT_ROOT="${EPYDIOS_M15_WINDOWS_SUPPORT_ROOT:-${ROAMING_APPDATA_ROOT}/EpydiosAgentOpsDesktop}"
INSTALL_PATH="${INSTALL_ROOT}/Epydios AgentOps Desktop.exe"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCHER_CMD_PATH="${INSTALL_ROOT}/Launch Epydios AgentOps Desktop.cmd"
LAUNCHER_SH_PATH="${SUPPORT_ROOT}/launch-epydios-agentops-desktop.sh"

{
  echo "Removing ${INSTALL_PATH}"
  rm -f "${INSTALL_PATH}" "${LAUNCHER_CMD_PATH}" "${BOOTSTRAP_PATH}" "${LAUNCHER_SH_PATH}"
  rmdir "${SUPPORT_ROOT}" 2>/dev/null || true
  rmdir "${INSTALL_ROOT}" 2>/dev/null || true
} >"${LOG_PATH}" 2>&1

cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "$(m15_json_escape "${STAMP}")",
  "status": "uninstalled_windows_beta_bundle",
  "install_root": "$(m15_json_escape "${INSTALL_ROOT}")",
  "install_path": "$(m15_json_escape "${INSTALL_PATH}")",
  "support_root": "$(m15_json_escape "${SUPPORT_ROOT}")",
  "launcher_cmd_path": "$(m15_json_escape "${LAUNCHER_CMD_PATH}")",
  "launcher_sh_path": "$(m15_json_escape "${LAUNCHER_SH_PATH}")",
  "log_path": "$(m15_json_escape "${LOG_PATH}")"
}
EOF
cp "${LOG_PATH}" "${LATEST_LOG}"
cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"

echo "uninstall-m15-windows-beta: removed bundle from ${INSTALL_PATH}"
