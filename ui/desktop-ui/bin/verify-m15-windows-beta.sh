#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_HOST="$(uname -s | tr '[:upper:]' '[:lower:]')"
PHASE_ROOT="${SCRIPT_DIR}/../.epydios/internal-readiness/m15-native-phase-d"
PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-windows-latest.summary.json"

is_windows_host() {
  case "${CURRENT_HOST}" in
    msys*|mingw*|cygwin*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if "${SCRIPT_DIR}/package-m15-windows.sh"; then
  EPYDIOS_KEEP_WINDOWS_BETA_INSTALLED=1 \
  EPYDIOS_WINDOWS_PHASE_D_USE_REAL_USER_HOME=1 \
    "${SCRIPT_DIR}/verify-m15-phase-d.sh"
  exit 0
fi

[ -f "${PACKAGE_SUMMARY}" ] || {
  echo "MISS Windows beta installed evaluation lane package summary: ${PACKAGE_SUMMARY}"
  echo "RESULT: FAIL"
  exit 1
}

package_status="$(jq -r '.status // ""' "${PACKAGE_SUMMARY}")"
install_contract="$(jq -r '.install_contract // ""' "${PACKAGE_SUMMARY}")"
release_support_lane="$(jq -r '.release_support_lane // ""' "${PACKAGE_SUMMARY}")"
update_posture="$(jq -r '.update_posture // ""' "${PACKAGE_SUMMARY}")"
runtime_posture="$(jq -r '.runtime_posture // ""' "${PACKAGE_SUMMARY}")"

if ! is_windows_host && \
  [ "${package_status}" = "blocked_active_host_unsupported_windows_builder" ] && \
  [ "${install_contract}" = "beta_windows_installed_evaluation_lane" ] && \
  [ "${release_support_lane}" = "beta_windows_installed_evaluation_lane" ] && \
  [ "${update_posture}" = "manual_reinstall_from_packaged_artifact" ] && \
  [ "${runtime_posture}" = "beta_cluster_backed_live_lane" ]; then
  echo "OK   Windows beta installed evaluation lane blocker recorded for active non-Windows host"
  echo "RESULT: PASS"
  exit 0
fi

echo "MISS Windows beta installed evaluation lane blocker or contract fields in ${PACKAGE_SUMMARY}"
echo "RESULT: FAIL"
exit 1
