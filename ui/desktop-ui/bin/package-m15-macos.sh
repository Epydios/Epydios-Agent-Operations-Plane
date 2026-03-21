#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

ORIGINAL_HOME="${HOME}"
export PATH="${ORIGINAL_HOME}/bin:${ORIGINAL_HOME}/.local/bin:${PATH}"
export GOCACHE="$(m15_go_cache_root)"
export GOMODCACHE="$(m15_go_mod_cache_root)"
export HOME="${M15_CACHE_ROOT}/macos-build-home"
export XDG_CACHE_HOME="${HOME}/.cache"
export XDG_CONFIG_HOME="${HOME}/.config"
export CGO_LDFLAGS="${CGO_LDFLAGS:-} -framework UniformTypeIdentifiers"
mkdir -p "${GOCACHE}" "${GOMODCACHE}"
mkdir -p "${HOME}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}"

APP_NAME="epydios-agentops-desktop"
STAMP="$(m15_timestamp_utc)"
HOST_OS="$(m15_host_os)"
HOST_ARCH="$(m15_host_arch)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-c)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/package-m15-macos.log"
SUMMARY_PATH="${RUN_ROOT}/package-m15-macos.summary.json"
LATEST_LOG="${PHASE_ROOT}/package-m15-macos-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/package-m15-macos-latest.summary.json"
BOOTSTRAP_TEMPLATE_PATH="${RUN_ROOT}/runtime-bootstrap.template.json"
mkdir -p "${RUN_ROOT}"

write_summary() {
  local status="$1"
  local reason="$2"
  local app_path="$3"
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "${status}",
  "host_os": "${HOST_OS}",
  "host_arch": "${HOST_ARCH}",
  "reason": "${reason}",
  "log_path": "${LOG_PATH}",
  "app_bundle_path": "${app_path}",
  "bootstrap_template_path": "${BOOTSTRAP_TEMPLATE_PATH}"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
}

cleanup_build_artifacts() {
  rm -rf "${M15_MODULE_ROOT}/frontend/dist" \
    "${M15_MODULE_ROOT}/frontend/wailsjs"
}

trap cleanup_build_artifacts EXIT

if [ "${HOST_OS}" != "darwin" ]; then
  : > "${LOG_PATH}"
  write_summary \
    "blocked_active_host_non_darwin" \
    "macOS packaging requires a Darwin host." \
    ""
  echo "package-m15-macos: active host is ${HOST_OS}; blocker recorded at ${SUMMARY_PATH}" >&2
  exit 1
fi

export EPYDIOS_STAGE_WEB_DIST="$(m15_frontend_stage_root "phase-c-${STAMP}")"

(
  cd "${M15_REPO_ROOT}"
  "${M15_MODULE_ROOT}/bin/check-m15-native-toolchain.sh"
  go test ./ui/desktop-ui/internal/nativeapp
  npm --prefix "${M15_MODULE_ROOT}/frontend" run build
  cd "${M15_MODULE_ROOT}"
  wails build \
    -platform "darwin/${HOST_ARCH}" \
    -clean \
    -tags "desktop,m15native,production" \
    -ldflags "-w -s" \
    -o "${APP_NAME}" \
    -v 1
) >"${LOG_PATH}" 2>&1 || {
  write_summary \
    "failed_macos_build_or_packaging" \
    "macOS packaging failed during toolchain preflight, native tests, frontend staging, or Wails packaging. See log_path." \
    ""
  echo "package-m15-macos: packaging failed; see ${LOG_PATH}" >&2
  exit 1
}

APP_SOURCE_PATH="$(find "${M15_MODULE_ROOT}/build/bin" -maxdepth 1 -type d -name '*.app' | head -n1 || true)"
[ -d "${APP_SOURCE_PATH}" ] || {
  write_summary \
    "failed_missing_macos_app_bundle" \
    "Wails packaging completed without a macOS .app bundle in build/bin." \
    ""
  echo "package-m15-macos: missing packaged app bundle in ${M15_MODULE_ROOT}/build/bin" >&2
  exit 1
}

APP_BUNDLE_NAME="$(basename "${APP_SOURCE_PATH}")"
ARTIFACT_APP_PATH="${RUN_ROOT}/${APP_BUNDLE_NAME}"
if command -v rsync >/dev/null 2>&1; then
  rsync -a "${APP_SOURCE_PATH}/" "${ARTIFACT_APP_PATH}/"
else
  cp -R "${APP_SOURCE_PATH}" "${ARTIFACT_APP_PATH}"
fi

cat > "${BOOTSTRAP_TEMPLATE_PATH}" <<EOF
{
  "mode": "live",
  "runtimeLocalPort": 8080,
  "gatewayLocalPort": 18765,
  "runtimeNamespace": "epydios-system",
  "runtimeService": "orchestration-runtime",
  "interpositionEnabled": false
}
EOF

write_summary \
  "packaged_macos_app" \
  "macOS .app bundle produced for beta install and launch tooling." \
  "${ARTIFACT_APP_PATH}"

echo "package-m15-macos: packaged macOS beta bundle at ${RUN_ROOT}"
