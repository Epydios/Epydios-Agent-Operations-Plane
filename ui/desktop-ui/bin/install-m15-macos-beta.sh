#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

APP_INSTALL_NAME="Epydios AgentOps Desktop.app"
STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-c)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/install-m15-macos-beta.log"
SUMMARY_PATH="${RUN_ROOT}/install-m15-macos-beta.summary.json"
LATEST_LOG="${PHASE_ROOT}/install-m15-macos-beta-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/install-m15-macos-beta-latest.summary.json"
mkdir -p "${RUN_ROOT}"

PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-macos-latest.summary.json"
if [ ! -f "${PACKAGE_SUMMARY}" ] || ! grep -q '"status": "packaged_macos_app"' "${PACKAGE_SUMMARY}"; then
  "${M15_MODULE_ROOT}/bin/package-m15-macos.sh" >/dev/null
fi
PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-macos-latest.summary.json"
APP_SOURCE_PATH="$(jq -r '.app_bundle_path // ""' "${PACKAGE_SUMMARY}")"
[ -d "${APP_SOURCE_PATH}" ] || {
  echo "install-m15-macos-beta failed: missing packaged macOS app bundle ${APP_SOURCE_PATH}" >&2
  exit 1
}

INSTALL_ROOT="${EPYDIOS_M15_MACOS_INSTALL_ROOT:-${HOME}/Applications}"
SUPPORT_ROOT="${EPYDIOS_M15_MACOS_SUPPORT_ROOT:-${HOME}/Library/Application Support/EpydiosAgentOpsDesktop}"
INSTALL_PATH="${INSTALL_ROOT}/${APP_INSTALL_NAME}"
BOOTSTRAP_PATH="${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCH_HELPER_PATH="${SUPPORT_ROOT}/launch-installed.sh"
APP_EXECUTABLE_PATH="${INSTALL_PATH}/Contents/MacOS/epydios-agentops-desktop"

write_summary() {
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "installed_macos_beta_bundle",
  "install_root": "${INSTALL_ROOT}",
  "install_path": "${INSTALL_PATH}",
  "app_executable_path": "${APP_EXECUTABLE_PATH}",
  "support_root": "${SUPPORT_ROOT}",
  "bootstrap_path": "${BOOTSTRAP_PATH}",
  "launch_helper_path": "${LAUNCH_HELPER_PATH}",
  "log_path": "${LOG_PATH}",
  "source_bundle_path": "${APP_SOURCE_PATH}"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
}

{
  echo "Installing ${APP_SOURCE_PATH} -> ${INSTALL_PATH}"
  mkdir -p "${INSTALL_ROOT}" "${SUPPORT_ROOT}"
  rm -rf "${INSTALL_PATH}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${APP_SOURCE_PATH}/" "${INSTALL_PATH}/"
  else
    cp -R "${APP_SOURCE_PATH}" "${INSTALL_PATH}"
  fi
  cat > "${BOOTSTRAP_PATH}" <<EOF
{
  "mode": "${M15_MACOS_BETA_MODE:-mock}",
  "runtimeLocalPort": ${M15_MACOS_RUNTIME_PORT:-8080},
  "gatewayLocalPort": ${M15_MACOS_GATEWAY_PORT:-18765},
  "runtimeNamespace": "${M15_MACOS_RUNTIME_NAMESPACE:-epydios-system}",
  "runtimeService": "${M15_MACOS_RUNTIME_SERVICE:-orchestration-runtime}"
}
EOF
  cat > "${LAUNCH_HELPER_PATH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="${BOOTSTRAP_PATH}"
exec "${INSTALL_PATH}/Contents/MacOS/epydios-agentops-desktop" "\$@"
EOF
  chmod +x "${LAUNCH_HELPER_PATH}"
} >"${LOG_PATH}" 2>&1

write_summary

echo "install-m15-macos-beta: installed bundle at ${INSTALL_PATH}"
