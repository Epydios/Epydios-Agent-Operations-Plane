#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

STAMP="$(m15_timestamp_utc)"
PHASE_ROOT="$(m15_phase_artifact_root m15-native-phase-d)"
RUN_ROOT="${PHASE_ROOT}/${STAMP}"
LOG_PATH="${RUN_ROOT}/verify-m15-phase-d.log"
SUMMARY_PATH="${RUN_ROOT}/verify-m15-phase-d.summary.json"
LATEST_LOG="${PHASE_ROOT}/verify-m15-phase-d-latest.log"
LATEST_SUMMARY="${PHASE_ROOT}/verify-m15-phase-d-latest.summary.json"
PACKAGE_SUMMARY="${PHASE_ROOT}/package-m15-windows-latest.summary.json"
mkdir -p "${RUN_ROOT}"

[ -f "${PACKAGE_SUMMARY}" ] || {
  echo "verify-m15-phase-d failed: missing latest Windows package summary at ${PACKAGE_SUMMARY}" >&2
  exit 1
}

PACKAGE_STATUS="$(jq -r '.status // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_REASON="$(jq -r '.reason // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_BINARY="$(jq -r '.binary_path // ""' "${PACKAGE_SUMMARY}")"
PACKAGE_INSTALLER="$(jq -r '.installer_path // ""' "${PACKAGE_SUMMARY}")"

normalize_package_path() {
  local candidate="$1"
  local container_root="/workspace/agentops-desktop"
  if [[ "${candidate}" == "${container_root}"* ]]; then
    printf '%s\n' "${M15_WORKSPACE_ROOT}${candidate#${container_root}}"
    return
  fi
  printf '%s\n' "${candidate}"
}

PACKAGE_BINARY="$(normalize_package_path "${PACKAGE_BINARY}")"
PACKAGE_INSTALLER="$(normalize_package_path "${PACKAGE_INSTALLER}")"

if [[ "${PACKAGE_STATUS}" == blocked_* ]]; then
  cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "phase_d_blocked_before_packaging",
  "reason": "${PACKAGE_REASON}",
  "package_summary_path": "${PACKAGE_SUMMARY}",
  "log_path": "${LOG_PATH}"
}
EOF
  : > "${LOG_PATH}"
  cp "${LOG_PATH}" "${LATEST_LOG}"
  cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"
  echo "M15 Phase D verifier recorded the packaging blocker."
  exit 0
fi

[ "${PACKAGE_STATUS}" = "packaged_windows_installer_baseline" ] || {
  echo "verify-m15-phase-d failed: latest package summary status is ${PACKAGE_STATUS}" >&2
  exit 1
}
[ -f "${PACKAGE_BINARY}" ] || {
  echo "verify-m15-phase-d failed: packaged Windows binary missing at ${PACKAGE_BINARY}" >&2
  exit 1
}
[ -f "${PACKAGE_INSTALLER}" ] || {
  echo "verify-m15-phase-d failed: packaged Windows installer missing at ${PACKAGE_INSTALLER}" >&2
  exit 1
}

(
  cd "${M15_REPO_ROOT}"
  ./platform/local/bin/verify-m14-win-restricted-readiness.sh
  ./platform/local/bin/verify-m14-openfang-xos-adapters.sh
  ./platform/local/bin/verify-m14-openfang-enablement-gate.sh
  ./platform/local/bin/verify-m14-xos-parity.sh
) >"${LOG_PATH}" 2>&1

cat > "${SUMMARY_PATH}" <<EOF
{
  "generated_at_utc": "${STAMP}",
  "status": "phase_d_packaging_baseline_and_verifier_foundation",
  "reason": "Windows installer baseline was packaged and the existing Windows parity verifier foundation passed. A real Windows execution-host proof is still required to close the Phase D exit gate.",
  "package_summary_path": "${PACKAGE_SUMMARY}",
  "binary_path": "${PACKAGE_BINARY}",
  "installer_path": "${PACKAGE_INSTALLER}",
  "log_path": "${LOG_PATH}",
  "verifiers": [
    "platform/local/bin/verify-m14-win-restricted-readiness.sh",
    "platform/local/bin/verify-m14-openfang-xos-adapters.sh",
    "platform/local/bin/verify-m14-openfang-enablement-gate.sh",
    "platform/local/bin/verify-m14-xos-parity.sh"
  ]
}
EOF
cp "${LOG_PATH}" "${LATEST_LOG}"
cp "${SUMMARY_PATH}" "${LATEST_SUMMARY}"

echo "M15 Phase D verifier passed."
