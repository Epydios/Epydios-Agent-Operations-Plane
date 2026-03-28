#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}"
export GOCACHE="$(m15_go_cache_root)"
export GOMODCACHE="$(m15_go_mod_cache_root)"
mkdir -p "${GOCACHE}" "${GOMODCACHE}"

APP_NAME="epydios-agentops-desktop"
APP_DISPLAY_NAME="Epydios AgentOps Desktop"
STAMP="$(m15_timestamp_utc)"
HOST_OS="$(m15_host_os)"
HOST_ARCH="$(m15_host_arch)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-b)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/package-m15-linux.log"
SUMMARY_PATH="${RUN_ROOT}/package-m15-linux.summary.json"
LATEST_LOG="${PHASE_ROOT}/package-m15-linux-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/package-m15-linux-latest.summary.json"
mkdir -p "${RUN_ROOT}"

write_summary() {
  local status="$1"
  local reason="$2"
  local tarball_path="$3"
  local appimage_path="$4"
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "${status}",
  "artifact_kind": "linux_appimage_with_tarball_fallback",
  "install_contract": "beta_linux_installed_evaluation_lane",
  "release_support_lane": "beta_linux_installed_evaluation_lane",
  "primary_artifact_path": "${appimage_path}",
  "paired_artifact_path": "${tarball_path}",
  "update_posture": "manual_reinstall_from_packaged_artifact",
  "runtime_posture": "beta_cluster_backed_live_lane",
  "host_os": "${HOST_OS}",
  "host_arch": "${HOST_ARCH}",
  "reason": "${reason}",
  "log_path": "${LOG_PATH}",
  "tarball_path": "${tarball_path}",
  "appimage_path": "${appimage_path}"
}
EOF
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
}

if [ "${HOST_OS}" != "linux" ]; then
  (
    cd "${M15_MODULE_ROOT}"
    wails build -platform linux/amd64 -skipbindings -s -dryrun -tags "desktop,m15native,production" -ldflags "-w -s"
  ) >"${LOG_PATH}" 2>&1 || true
  write_summary \
    "blocked_active_host_non_linux" \
    "Linux beta installed evaluation lane packaging requires a Linux build host because Wails crosscompiling is not currently supported on the active host." \
    "" \
    ""
  echo "package-m15-linux: active host is ${HOST_OS}; blocker recorded at ${SUMMARY_PATH}" >&2
  exit 1
fi

STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/epydios-m15-linux-build.XXXXXX")"
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

if ! command -v appimagetool >/dev/null 2>&1; then
  : > "${LOG_PATH}"
  write_summary \
    "failed_missing_appimagetool" \
    "Linux beta installed evaluation lane packaging requires appimagetool on the Linux build host." \
    "" \
    ""
  echo "package-m15-linux: missing appimagetool on Linux host" >&2
  exit 1
fi

export EPYDIOS_STAGE_WEB_DIST="$(m15_frontend_stage_root "phase-b-${STAMP}")"

(
  cd "${STAGE_REPO_ROOT}"
  "${STAGE_MODULE_ROOT}/bin/check-m15-native-toolchain.sh"
  go test ./ui/desktop-ui/internal/nativeapp
  npm --prefix "${STAGE_MODULE_ROOT}/frontend" run build
  go build \
    -buildvcs=false \
    -tags "desktop,m15native,production" \
    -ldflags "-w -s" \
    -o "${STAGE_MODULE_ROOT}/build/bin/${APP_NAME}" \
    ./ui/desktop-ui
) >"${LOG_PATH}" 2>&1 || {
  write_summary \
    "failed_linux_build_or_toolchain" \
    "Linux beta installed evaluation lane packaging failed during toolchain preflight, test, frontend build, or native binary build. See log_path." \
    "" \
    ""
  echo "package-m15-linux: Linux packaging failed before archive creation; see ${LOG_PATH}" >&2
  exit 1
}

ARTIFACT_STAGING="${RUN_ROOT}/linux-amd64"
mkdir -p "${ARTIFACT_STAGING}"
LINUX_BINARY_PATH="${ARTIFACT_STAGING}/${APP_NAME}"
cp "${STAGE_MODULE_ROOT}/build/bin/${APP_NAME}" "${LINUX_BINARY_PATH}"
chmod +x "${LINUX_BINARY_PATH}"

TARBALL_ROOT="${RUN_ROOT}/${APP_NAME}-linux-amd64"
mkdir -p "${TARBALL_ROOT}"
cp "${LINUX_BINARY_PATH}" "${TARBALL_ROOT}/${APP_NAME}"
cp "${M15_MODULE_ROOT}/README.md" "${TARBALL_ROOT}/README.md"
cp "${M15_MODULE_ROOT}/web/assets/epydios-logo.png" "${TARBALL_ROOT}/${APP_NAME}.png"
cat > "${TARBALL_ROOT}/run-mock.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
exec "\${DIR}/${APP_NAME}" --mode mock "\$@"
EOF
cat > "${TARBALL_ROOT}/run-live.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
exec "\${DIR}/${APP_NAME}" --mode live "\$@"
EOF
chmod +x "${TARBALL_ROOT}/run-mock.sh" "${TARBALL_ROOT}/run-live.sh"
TARBALL_PATH="${RUN_ROOT}/${APP_NAME}-linux-amd64.tar.gz"
tar -C "${RUN_ROOT}" -czf "${TARBALL_PATH}" "$(basename "${TARBALL_ROOT}")"

APPDIR="${STAGE_ROOT}/AppDir"
mkdir -p "${APPDIR}/usr/bin" "${APPDIR}/usr/share/icons/hicolor/256x256/apps"
cp "${LINUX_BINARY_PATH}" "${APPDIR}/usr/bin/${APP_NAME}"
chmod +x "${APPDIR}/usr/bin/${APP_NAME}"
cp "${M15_MODULE_ROOT}/web/assets/epydios-logo.png" "${APPDIR}/${APP_NAME}.png"
cp "${M15_MODULE_ROOT}/web/assets/epydios-logo.png" "${APPDIR}/.DirIcon"
cp "${M15_MODULE_ROOT}/web/assets/epydios-logo.png" "${APPDIR}/usr/share/icons/hicolor/256x256/apps/${APP_NAME}.png"
cat > "${APPDIR}/${APP_NAME}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${APP_DISPLAY_NAME}
Exec=${APP_NAME}
Icon=${APP_NAME}
Categories=Utility;
Terminal=false
EOF
cat > "${APPDIR}/AppRun" <<EOF
#!/usr/bin/env bash
set -euo pipefail
HERE="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
exec "\${HERE}/usr/bin/${APP_NAME}" "\$@"
EOF
chmod +x "${APPDIR}/AppRun"
APPIMAGE_PATH="${RUN_ROOT}/${APP_NAME}-linux-amd64.AppImage"
APPIMAGE_TMP="${STAGE_ROOT}/${APP_NAME}-linux-amd64.AppImage"
APPIMAGE_TMP_QUOTED="${APPIMAGE_TMP}\""
(
  export ARCH=x86_64
  appimagetool --no-appstream "${APPDIR}" "${APPIMAGE_TMP}"
) >>"${LOG_PATH}" 2>&1 || {
  write_summary \
    "failed_appimage_packaging" \
    "appimagetool failed while creating the Linux beta installed evaluation lane AppImage baseline. See log_path." \
    "${TARBALL_PATH}" \
    "${APPIMAGE_PATH}"
  echo "package-m15-linux: appimagetool failed; see ${LOG_PATH}" >&2
  exit 1
}

if [ -f "${APPIMAGE_TMP}" ]; then
  mv "${APPIMAGE_TMP}" "${APPIMAGE_PATH}"
elif [ -f "${APPIMAGE_TMP_QUOTED}" ]; then
  mv "${APPIMAGE_TMP_QUOTED}" "${APPIMAGE_PATH}"
fi

if [ ! -f "${TARBALL_PATH}" ] || [ ! -f "${APPIMAGE_PATH}" ]; then
  write_summary \
    "failed_missing_linux_artifacts" \
    "Linux beta installed evaluation lane packaging did not produce both the tarball fallback and AppImage primary artifact." \
    "${TARBALL_PATH}" \
    "${APPIMAGE_PATH}"
  echo "package-m15-linux: missing packaged Linux artifacts" >&2
  exit 1
fi

write_summary \
  "packaged_linux_baseline" \
  "Linux beta installed evaluation lane AppImage primary artifact and tarball fallback were produced." \
  "${TARBALL_PATH}" \
  "${APPIMAGE_PATH}"

echo "package-m15-linux: packaged Linux baseline at ${RUN_ROOT}"
