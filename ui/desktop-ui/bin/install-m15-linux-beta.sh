#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

APP_INSTALL_NAME="Epydios AgentOps Desktop.AppImage"
APP_LAUNCHER_NAME="epydios-agentops-desktop"
STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-b)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/install-m15-linux-beta.log"
SUMMARY_PATH="${RUN_ROOT}/install-m15-linux-beta.summary.json"
LATEST_LOG="${PHASE_ROOT}/install-m15-linux-beta-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/install-m15-linux-beta-latest.summary.json"
mkdir -p "${RUN_ROOT}"

PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-linux-latest.summary.json"
if [ ! -f "${PACKAGE_SUMMARY}" ] || ! grep -q '"status": "packaged_linux_baseline"' "${PACKAGE_SUMMARY}"; then
  "${M15_MODULE_ROOT}/bin/package-m15-linux.sh" >/dev/null
fi
PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-linux-latest.summary.json"
APPIMAGE_SOURCE_PATH="$(jq -r '.appimage_path // ""' "${PACKAGE_SUMMARY}")"
[ -f "${APPIMAGE_SOURCE_PATH}" ] || {
  echo "install-m15-linux-beta failed: missing packaged Linux AppImage ${APPIMAGE_SOURCE_PATH}" >&2
  exit 1
}

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

write_summary() {
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "installed_linux_beta_bundle",
  "install_root": "${INSTALL_ROOT}",
  "install_path": "${INSTALL_PATH}",
  "support_root": "${SUPPORT_ROOT}",
  "bootstrap_path": "${BOOTSTRAP_PATH}",
  "launch_helper_path": "${LAUNCH_HELPER_PATH}",
  "launcher_path": "${LAUNCHER_PATH}",
  "desktop_file_path": "${DESKTOP_FILE_PATH}",
  "icon_path": "${ICON_PATH}",
  "log_path": "${LOG_PATH}",
  "source_appimage_path": "${APPIMAGE_SOURCE_PATH}"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
}

{
  echo "Installing ${APPIMAGE_SOURCE_PATH} -> ${INSTALL_PATH}"
  mkdir -p "${INSTALL_ROOT}" "${BIN_ROOT}" "${SUPPORT_ROOT}" "${APPLICATIONS_ROOT}"
  cp "${APPIMAGE_SOURCE_PATH}" "${INSTALL_PATH}"
  chmod +x "${INSTALL_PATH}"
  cp "${M15_MODULE_ROOT}/web/assets/epydios-logo.png" "${ICON_PATH}"
  cat > "${BOOTSTRAP_PATH}" <<EOF
{
  "mode": "${M15_LINUX_BETA_MODE:-mock}",
  "runtimeLocalPort": ${M15_LINUX_RUNTIME_PORT:-8080},
  "runtimeNamespace": "${M15_LINUX_RUNTIME_NAMESPACE:-epydios-system}",
  "runtimeService": "${M15_LINUX_RUNTIME_SERVICE:-orchestration-runtime}"
}
EOF
  cat > "${LAUNCH_HELPER_PATH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export APPIMAGE_EXTRACT_AND_RUN=1
export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="${BOOTSTRAP_PATH}"
set +e
"${INSTALL_PATH}" "\$@"
status=\$?
set -e

if [ "\${status}" -eq 126 ] && command -v qemu-x86_64-static >/dev/null 2>&1; then
  exec qemu-x86_64-static "${INSTALL_PATH}" "\$@"
fi

exit "\${status}"
EOF
  chmod +x "${LAUNCH_HELPER_PATH}"
  cat > "${LAUNCHER_PATH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "${LAUNCH_HELPER_PATH}" "\$@"
EOF
  chmod +x "${LAUNCHER_PATH}"
  cat > "${DESKTOP_FILE_PATH}" <<EOF
[Desktop Entry]
Type=Application
Name=Epydios AgentOps Desktop
Exec=${LAUNCHER_PATH}
Icon=${ICON_PATH}
Categories=Utility;
Terminal=false
EOF
} >"${LOG_PATH}" 2>&1

write_summary

echo "install-m15-linux-beta: installed bundle at ${INSTALL_PATH}"
