#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
WORKSPACE_ROOT="$(cd "${REPO_ROOT}/.." && pwd)"
LOCAL_STATE_ROOT="${EPYDIOS_LOCAL_STATE_ROOT:-${REPO_ROOT}/.epydios}"
DEFAULT_UI_ROOT_INTERNAL="${REPO_ROOT}/ui/desktop-ui"
DEFAULT_UI_ROOT_EXTERNAL="${WORKSPACE_ROOT}/EPYDIOS_AGENTOPS_DESKTOP_UI"
if [ -n "${UI_ROOT:-}" ]; then
  UI_ROOT="${UI_ROOT}"
elif [ -d "${DEFAULT_UI_ROOT_INTERNAL}" ]; then
  UI_ROOT="${DEFAULT_UI_ROOT_INTERNAL}"
else
  UI_ROOT="${DEFAULT_UI_ROOT_EXTERNAL}"
fi
NON_GITHUB_ROOT="${NON_GITHUB_ROOT:-${LOCAL_STATE_ROOT}}"
OUTPUT_DIR="${OUTPUT_DIR:-${NON_GITHUB_ROOT}/provenance/desktop-closeout}"

require_cmd() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1 || {
    echo "M13/M14 closeout bundle failed: missing command '${cmd}'." >&2
    exit 1
  }
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${path}" | awk '{print $1}'
  else
    shasum -a 256 "${path}" | awk '{print $1}'
  fi
}

run_logged() {
  local step_id="$1"
  local log_path="$2"
  shift 2

  echo "Running ${step_id}..."
  if "$@" >"${log_path}" 2>&1; then
    echo "PASS ${step_id} (log=${log_path})"
    return 0
  fi

  local rc=$?
  echo "FAIL ${step_id} (rc=${rc}; log=${log_path})" >&2
  tail -n 80 "${log_path}" >&2 || true
  return "${rc}"
}

require_cmd jq
require_cmd awk
require_cmd date

if [ ! -d "${UI_ROOT}" ]; then
  echo "M13/M14 closeout bundle failed: missing UI module path '${UI_ROOT}'." >&2
  exit 1
fi

if [ ! -x "${UI_ROOT}/bin/verify-m14-ui-daily-loop.sh" ]; then
  echo "M13/M14 closeout bundle failed: UI daily loop script is missing or not executable at '${UI_ROOT}/bin/verify-m14-ui-daily-loop.sh'." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
generated_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
prefix="${OUTPUT_DIR}/m13-m14-closeout-${stamp}"
summary_json="${prefix}.summary.json"
summary_sha="${summary_json}.sha256"
latest_summary="${OUTPUT_DIR}/m13-m14-closeout-latest.summary.json"

log_m13="${prefix}-m13-desktop-daily-loop.log"
log_m14_ui="${prefix}-m14-ui-daily-loop.log"
log_m14_win="${prefix}-m14-win-restricted-readiness.log"
log_m14_mac="${prefix}-m14-mac-restricted-readiness.log"
log_m14_xos="${prefix}-m14-xos-parity.log"
log_m14_openfang_xos="${prefix}-m14-openfang-xos-adapters.log"
log_m14_openfang_enablement="${prefix}-m14-openfang-enablement-gate.log"
log_qc="${prefix}-qc-preflight.log"

run_logged "m13-desktop-daily-loop" "${log_m13}" \
  bash -lc "cd \"${REPO_ROOT}\" && ./platform/local/bin/verify-m13-desktop-daily-loop.sh"
run_logged "m14-ui-daily-loop" "${log_m14_ui}" \
  bash -lc "cd \"${UI_ROOT}\" && ./bin/verify-m14-ui-daily-loop.sh"
run_logged "m14-win-restricted-readiness" "${log_m14_win}" \
  bash -lc "cd \"${REPO_ROOT}\" && ./platform/local/bin/verify-m14-win-restricted-readiness.sh"
run_logged "m14-mac-restricted-readiness" "${log_m14_mac}" \
  bash -lc "cd \"${REPO_ROOT}\" && ./platform/local/bin/verify-m14-mac-restricted-readiness.sh"
run_logged "m14-xos-parity" "${log_m14_xos}" \
  bash -lc "cd \"${REPO_ROOT}\" && ./platform/local/bin/verify-m14-xos-parity.sh"
run_logged "m14-openfang-xos-adapters" "${log_m14_openfang_xos}" \
  bash -lc "cd \"${REPO_ROOT}\" && ./platform/local/bin/verify-m14-openfang-xos-adapters.sh"
run_logged "m14-openfang-enablement-gate" "${log_m14_openfang_enablement}" \
  bash -lc "cd \"${REPO_ROOT}\" && ./platform/local/bin/verify-m14-openfang-enablement-gate.sh"
run_logged "qc-preflight" "${log_qc}" \
  bash -lc "cd \"${REPO_ROOT}\" && ./platform/ci/bin/qc-preflight.sh"

jq -n \
  --arg generated_utc "${generated_utc}" \
  --arg workspace_root "${WORKSPACE_ROOT}" \
  --arg repo_root "${REPO_ROOT}" \
  --arg ui_root "${UI_ROOT}" \
  --arg output_dir "${OUTPUT_DIR}" \
  --arg log_m13 "${log_m13}" \
  --arg log_m14_ui "${log_m14_ui}" \
  --arg log_m14_win "${log_m14_win}" \
  --arg log_m14_mac "${log_m14_mac}" \
  --arg log_m14_xos "${log_m14_xos}" \
  --arg log_m14_openfang_xos "${log_m14_openfang_xos}" \
  --arg log_m14_openfang_enablement "${log_m14_openfang_enablement}" \
  --arg log_qc "${log_qc}" \
  '{
    schema_version: 1,
    generated_at_utc: $generated_utc,
    status: "pass",
    bundle: "M13_M14_CLOSEOUT",
    workspace_root: $workspace_root,
    repo_root: $repo_root,
    ui_root: $ui_root,
    output_dir: $output_dir,
    checks: [
      { id: "M13-DAILY", command: "verify-m13-desktop-daily-loop.sh", status: "pass", log: $log_m13 },
      { id: "M14-UI-DAILY", command: "verify-m14-ui-daily-loop.sh", status: "pass", log: $log_m14_ui },
      { id: "V-M14-WIN-001", command: "verify-m14-win-restricted-readiness.sh", status: "pass", log: $log_m14_win },
      { id: "V-M14-MAC-001", command: "verify-m14-mac-restricted-readiness.sh", status: "pass", log: $log_m14_mac },
      { id: "V-M14-XOS-001", command: "verify-m14-xos-parity.sh", status: "pass", log: $log_m14_xos },
      { id: "V-M14-XOS-002", command: "verify-m14-openfang-xos-adapters.sh", status: "pass", log: $log_m14_openfang_xos },
      { id: "V-M14-XOS-003", command: "verify-m14-openfang-enablement-gate.sh", status: "pass", log: $log_m14_openfang_enablement },
      { id: "QC-PREFLIGHT", command: "qc-preflight.sh", status: "pass", log: $log_qc }
    ]
  }' > "${summary_json}"

cp "${summary_json}" "${latest_summary}"
sha256_file "${summary_json}" > "${summary_sha}"

echo "M13/M14 closeout bundle PASS."
echo "  summary=${summary_json}"
echo "  summary_latest=${latest_summary}"
echo "  summary_sha256=${summary_sha}"
