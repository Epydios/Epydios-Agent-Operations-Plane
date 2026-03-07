#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

APP_INSTALL_NAME="Epydios AgentOps Desktop.app"
STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-c)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/uninstall-m15-macos-beta.log"
SUMMARY_PATH="${RUN_ROOT}/uninstall-m15-macos-beta.summary.json"
LATEST_LOG="${PHASE_ROOT}/uninstall-m15-macos-beta-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/uninstall-m15-macos-beta-latest.summary.json"
mkdir -p "${RUN_ROOT}"

INSTALL_ROOT="${EPYDIOS_M15_MACOS_INSTALL_ROOT:-${HOME}/Applications}"
SUPPORT_ROOT="${EPYDIOS_M15_MACOS_SUPPORT_ROOT:-${HOME}/Library/Application Support/EpydiosAgentOpsDesktop}"
INSTALL_PATH="${INSTALL_ROOT}/${APP_INSTALL_NAME}"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCH_HELPER_PATH="${SUPPORT_ROOT}/launch-installed.sh"

{
  echo "Removing ${INSTALL_PATH}"
  rm -rf "${INSTALL_PATH}"
  rm -f "${BOOTSTRAP_PATH}" "${LAUNCH_HELPER_PATH}"
  rmdir "${SUPPORT_ROOT}" 2>/dev/null || true
  rmdir "${INSTALL_ROOT}" 2>/dev/null || true
} >"${LOG_PATH}" 2>&1

cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "uninstalled_macos_beta_bundle",
  "install_root": "${INSTALL_ROOT}",
  "install_path": "${INSTALL_PATH}",
  "support_root": "${SUPPORT_ROOT}",
  "log_path": "${LOG_PATH}"
}
EOF
cp "${LOG_PATH}" "${LATEST_LOG}"
cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"

echo "uninstall-m15-macos-beta: removed bundle from ${INSTALL_PATH}"
