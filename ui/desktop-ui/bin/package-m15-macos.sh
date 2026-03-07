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
APP_BUNDLE_NAME="${APP_NAME}.app"
STAMP="$(m15_timestamp_utc)"
HOST_OS="$(m15_host_os)"
HOST_ARCH="$(m15_host_arch)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-c)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/package-m15-macos.log"
SUMMARY_PATH="${RUN_ROOT}/package-m15-macos.summary.json"
LATEST_LOG="${PHASE_ROOT}/package-m15-macos-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/package-m15-macos-latest.summary.json"
ARTIFACT_APP_PATH="${RUN_ROOT}/${APP_BUNDLE_NAME}"
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
) >"${LOG_PATH}" 2>&1 || {
  write_summary \
    "failed_macos_build_or_toolchain" \
    "macOS packaging failed during toolchain preflight, native tests, or frontend staging. See log_path." \
    ""
  echo "package-m15-macos: packaging failed; see ${LOG_PATH}" >&2
  exit 1
}

APP_CONTENTS_ROOT="${ARTIFACT_APP_PATH}/Contents"
APP_MACOS_ROOT="${APP_CONTENTS_ROOT}/MacOS"
APP_RESOURCES_ROOT="${APP_CONTENTS_ROOT}/Resources"
APP_EXECUTABLE_PATH="${APP_MACOS_ROOT}/${APP_NAME}"
mkdir -p "${APP_MACOS_ROOT}" "${APP_RESOURCES_ROOT}"

(
  cd "${M15_REPO_ROOT}"
  go build \
    -buildvcs=false \
    -tags "desktop,m15native,production,wv2runtime.download" \
    -ldflags "-w -s" \
    -o "${APP_EXECUTABLE_PATH}" \
    ./ui/desktop-ui
) >>"${LOG_PATH}" 2>&1 || {
  write_summary \
    "failed_macos_native_binary_build" \
    "macOS packaging failed while building the native app executable. See log_path." \
    ""
  echo "package-m15-macos: native binary build failed; see ${LOG_PATH}" >&2
  exit 1
}

[ -x "${APP_EXECUTABLE_PATH}" ] || {
  write_summary \
    "failed_missing_macos_executable" \
    "macOS packaging completed without an executable inside the .app bundle." \
    ""
  echo "package-m15-macos: missing executable at ${APP_EXECUTABLE_PATH}" >&2
  exit 1
}

cat > "${APP_CONTENTS_ROOT}/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>com.epydios.agentops.desktop</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Epydios AgentOps Desktop</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.0.0-beta</string>
  <key>CFBundleVersion</key>
  <string>${STAMP}</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

plutil -lint "${APP_CONTENTS_ROOT}/Info.plist" >>"${LOG_PATH}" 2>&1 || {
  write_summary \
    "failed_invalid_info_plist" \
    "Generated Info.plist for the macOS beta bundle did not validate." \
    ""
  echo "package-m15-macos: invalid Info.plist" >&2
  exit 1
}

cat > "${BOOTSTRAP_TEMPLATE_PATH}" <<EOF
{
  "mode": "mock",
  "runtimeLocalPort": 8080,
  "runtimeNamespace": "epydios-system",
  "runtimeService": "orchestration-runtime"
}
EOF

write_summary \
  "packaged_macos_app" \
  "macOS .app bundle produced for beta install and launch tooling." \
  "${ARTIFACT_APP_PATH}"

echo "package-m15-macos: packaged macOS beta bundle at ${RUN_ROOT}"
