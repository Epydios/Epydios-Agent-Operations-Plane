#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-b)"
mkdir -p "${PHASE_ROOT}"
CURRENT_HOST="$(uname -s | tr '[:upper:]' '[:lower:]')"

if "${M15_MODULE_ROOT}/bin/package-m15-linux.sh"; then
  SUMMARY_PATH="${PHASE_ROOT}/package-m15-linux-latest.summary.json"
  if ! grep -q '"status": "packaged_linux_baseline"' "${SUMMARY_PATH}"; then
    echo "verify-m15-phase-b failed: latest summary does not report packaged_linux_baseline" >&2
    exit 1
  fi
  echo "M15 Phase B verifier passed: Linux baseline packaged."
  exit 0
fi

SUMMARY_PATH="${PHASE_ROOT}/package-m15-linux-latest.summary.json"
[ -f "${SUMMARY_PATH}" ] || {
  echo "verify-m15-phase-b failed: missing latest Phase B summary after packaging attempt" >&2
  exit 1
}

if grep -q '"status": "blocked_active_host_non_linux"' "${SUMMARY_PATH}"; then
  SUMMARY_HOST="$(sed -n 's/.*"host_os": "\([^"]*\)".*/\1/p' "${SUMMARY_PATH}" | head -n1)"
  if [ "${CURRENT_HOST}" = "linux" ]; then
    echo "verify-m15-phase-b failed: Linux host received a non-Linux blocker summary; latest summary is stale or incorrect." >&2
    exit 1
  fi
  if [ -n "${SUMMARY_HOST}" ] && [ "${SUMMARY_HOST}" != "${CURRENT_HOST}" ]; then
    echo "verify-m15-phase-b failed: blocker summary host (${SUMMARY_HOST}) does not match active host (${CURRENT_HOST})." >&2
    exit 1
  fi
  echo "M15 Phase B verifier recorded the active-host blocker. Linux packaging requires a Linux build host."
  exit 0
fi

echo "verify-m15-phase-b failed: Linux packaging did not succeed and no supported-host blocker was recorded." >&2
exit 1
