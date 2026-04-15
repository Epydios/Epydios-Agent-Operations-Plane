#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/.tmp/governance-decision-matrix}"
INCLUDE_GRANT_ENFORCEMENT="${INCLUDE_GRANT_ENFORCEMENT:-0}"
mkdir -p "${OUTPUT_DIR}"
REPORT_FILE="${OUTPUT_DIR}/report.md"

run_step() {
  local title="$1"
  local verifier="$2"
  local log_path="$3"
  bash "${verifier}" >"${log_path}" 2>&1
}

main() {
  local conformance_log="${OUTPUT_DIR}/provider-conformance.log"
  local approvals_log="${OUTPUT_DIR}/runtime-approvals.log"
  local grant_log="${OUTPUT_DIR}/policy-grant.log"

  run_step "Provider conformance" "${SCRIPT_DIR}/verify-m10-provider-conformance.sh" "${conformance_log}"
  run_step "Runtime approvals" "${SCRIPT_DIR}/verify-m13-runtime-approvals.sh" "${approvals_log}"
  if [[ "${INCLUDE_GRANT_ENFORCEMENT}" == "1" ]]; then
    run_step "Policy grant enforcement" "${SCRIPT_DIR}/verify-m10-policy-grant-enforcement.sh" "${grant_log}"
  fi

  {
    echo "# Governance Decision Matrix"
    echo
    echo "- Lane: \`OSS public boundary\`"
    echo "- Generated: \`$(date -u +"%Y-%m-%dT%H:%M:%SZ")\`"
    echo
    echo "| Surface | Verifier | Log |"
    echo "| --- | --- | --- |"
    echo "| Provider conformance | \`verify-m10-provider-conformance.sh\` | \`${conformance_log}\` |"
    echo "| Runtime approvals | \`verify-m13-runtime-approvals.sh\` | \`${approvals_log}\` |"
    if [[ "${INCLUDE_GRANT_ENFORCEMENT}" == "1" ]]; then
      echo "| Policy grant enforcement | \`verify-m10-policy-grant-enforcement.sh\` | \`${grant_log}\` |"
    fi
  } >"${REPORT_FILE}"

  cat "${REPORT_FILE}"
}

main "$@"
