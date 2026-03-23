#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}"
export GOCACHE="$(m15_go_cache_root)"
export GOMODCACHE="$(m15_go_mod_cache_root)"
mkdir -p "${GOCACHE}" "${GOMODCACHE}"

APP_NAME="epydios-agentops-desktop"
STAMP="$(m15_timestamp_utc)"
HOST_OS="$(m15_host_os)"
HOST_ARCH="$(m15_host_arch)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-d)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/package-m15-windows.log"
SUMMARY_PATH="${RUN_ROOT}/package-m15-windows.summary.json"
LATEST_LOG="${PHASE_ROOT}/package-m15-windows-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/package-m15-windows-latest.summary.json"
mkdir -p "${RUN_ROOT}"

host_visible_path() {
  local candidate="$1"
  local container_root="/workspace/agentops-desktop"
  local host_root="${EPYDIOS_M15_HOST_WORKSPACE_ROOT:-}"
  if [ -n "${host_root}" ] && [[ "${candidate}" == "${container_root}"* ]]; then
    printf '%s\n' "${host_root}${candidate#${container_root}}"
    return
  fi
  printf '%s\n' "${candidate}"
}

write_summary() {
  local status="$1"
  local reason="$2"
  local binary_path="$3"
  local installer_path="$4"
  local host_log_path host_binary_path host_installer_path
  host_log_path="$(host_visible_path "${LOG_PATH}")"
  host_binary_path="$(host_visible_path "${binary_path}")"
  host_installer_path="$(host_visible_path "${installer_path}")"
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "$(m15_json_escape "${STAMP}")",
  "status": "$(m15_json_escape "${status}")",
  "host_os": "$(m15_json_escape "${HOST_OS}")",
  "host_arch": "$(m15_json_escape "${HOST_ARCH}")",
  "reason": "$(m15_json_escape "${reason}")",
  "log_path": "$(m15_json_escape "${host_log_path}")",
  "binary_path": "$(m15_json_escape "${host_binary_path}")",
  "installer_path": "$(m15_json_escape "${host_installer_path}")"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
}

is_windows_host() {
  case "${HOST_OS}" in
    msys*|mingw*|cygwin*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if [ "${HOST_OS}" != "linux" ] && ! is_windows_host; then
  : > "${LOG_PATH}"
  write_summary \
    "blocked_active_host_unsupported_windows_builder" \
    "Windows packaging baseline currently supports the Linux Docker builder or a native Windows host toolchain." \
    "" \
    ""
  echo "package-m15-windows: active host is ${HOST_OS}; blocker recorded at ${SUMMARY_PATH}" >&2
  exit 1
fi

missing=()
required_tools=(wails makensis)
if [ "${HOST_OS}" = "linux" ]; then
  required_tools+=(x86_64-w64-mingw32-gcc)
fi
for required in "${required_tools[@]}"; do
  if ! command -v "${required}" >/dev/null 2>&1; then
    missing+=("${required}")
  fi
done
if [ "${#missing[@]}" -ne 0 ]; then
  : > "${LOG_PATH}"
  write_summary \
    "blocked_missing_windows_packaging_toolchain" \
    "Missing Windows packaging toolchain components: ${missing[*]}." \
    "" \
    ""
  echo "package-m15-windows: missing tooling ${missing[*]}" >&2
  exit 1
fi

STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/epydios-m15-windows-build.XXXXXX")"
trap 'rm -rf "${STAGE_ROOT}"' EXIT
STAGE_REPO_ROOT="${STAGE_ROOT}/repo"
STAGE_MODULE_ROOT="${STAGE_REPO_ROOT}/ui/desktop-ui"
mkdir -p "${STAGE_REPO_ROOT}"

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude '.git' \
    --exclude '.tmp' \
    --exclude 'ui/desktop-ui/build' \
    --exclude 'ui/desktop-ui/frontend/dist' \
    --exclude 'ui/desktop-ui/frontend/wailsjs' \
    "${M15_REPO_ROOT}/" \
    "${STAGE_REPO_ROOT}/"
else
  cp -R "${M15_REPO_ROOT}/." "${STAGE_REPO_ROOT}/"
  rm -rf \
    "${STAGE_REPO_ROOT}/.git" \
    "${STAGE_REPO_ROOT}/.tmp" \
    "${STAGE_REPO_ROOT}/ui/desktop-ui/build" \
    "${STAGE_REPO_ROOT}/ui/desktop-ui/frontend/dist" \
    "${STAGE_REPO_ROOT}/ui/desktop-ui/frontend/wailsjs"
fi

export EPYDIOS_STAGE_WEB_DIST="$(m15_frontend_stage_root "phase-d-${STAMP}")"

(
  cd "${STAGE_REPO_ROOT}"
  "${STAGE_MODULE_ROOT}/bin/check-m15-native-toolchain.sh"
  if [ "${HOST_OS}" = "linux" ]; then
    go test ./ui/desktop-ui/internal/nativeapp
  else
    # Compile the Windows-native package tests without running the broader
    # gateway/runtime suite, which includes known non-packaging failures.
    go test -run '^$' ./ui/desktop-ui/internal/nativeapp
  fi
  npm --prefix "${STAGE_MODULE_ROOT}/frontend" run build
  cd "${STAGE_MODULE_ROOT}"
  if [ "${HOST_OS}" = "linux" ]; then
    export CC="x86_64-w64-mingw32-gcc"
    export CXX="x86_64-w64-mingw32-g++"
  else
    unset CC CXX || true
  fi
  wails build \
    -platform windows/amd64 \
    -clean \
    -nsis \
    -tags "desktop,m15native,production" \
    -o "${APP_NAME}.exe" \
    -v 1
) >"${LOG_PATH}" 2>&1 || {
  write_summary \
    "failed_windows_build_or_packaging" \
    "Windows packaging failed during toolchain preflight, tests, frontend staging, or Wails packaging. See log_path." \
    "" \
    ""
  echo "package-m15-windows: packaging failed; see ${LOG_PATH}" >&2
  exit 1
}

APP_EXE_SOURCE="$(find "${STAGE_MODULE_ROOT}/build/bin" -type f -name "${APP_NAME}.exe" | head -n1 || true)"
INSTALLER_SOURCE="$(find "${STAGE_MODULE_ROOT}/build/bin" -type f \( -iname '*.msi' -o -iname '*setup*.exe' -o -iname '*installer*.exe' -o -iname '*nsis*.exe' \) ! -name "${APP_NAME}.exe" | head -n1 || true)"

if [ -z "${APP_EXE_SOURCE}" ] || [ ! -f "${APP_EXE_SOURCE}" ]; then
  write_summary \
    "failed_missing_windows_binary" \
    "Windows packaging completed without the packaged application executable." \
    "" \
    ""
  echo "package-m15-windows: missing packaged application executable" >&2
  exit 1
fi

ARTIFACT_BINARY="${RUN_ROOT}/${APP_NAME}-windows-amd64.exe"
cp "${APP_EXE_SOURCE}" "${ARTIFACT_BINARY}"

if [ -z "${INSTALLER_SOURCE}" ] || [ ! -f "${INSTALLER_SOURCE}" ]; then
  write_summary \
    "packaged_windows_binary_without_installer" \
    "Windows application executable was produced, but no MSI or installer artifact was found." \
    "${ARTIFACT_BINARY}" \
    ""
  echo "package-m15-windows: installer artifact missing after packaging" >&2
  exit 1
fi

INSTALLER_BASENAME="$(basename "${INSTALLER_SOURCE}")"
ARTIFACT_INSTALLER="${RUN_ROOT}/${INSTALLER_BASENAME}"
cp "${INSTALLER_SOURCE}" "${ARTIFACT_INSTALLER}"

write_summary \
  "packaged_windows_installer_baseline" \
  "Windows application executable and installer baseline were produced." \
  "${ARTIFACT_BINARY}" \
  "${ARTIFACT_INSTALLER}"

echo "package-m15-windows: packaged Windows baseline at ${RUN_ROOT}"
