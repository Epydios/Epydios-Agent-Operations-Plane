#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/.tmp/governance-decision-matrix}"
INCLUDE_GRANT_ENFORCEMENT="${INCLUDE_GRANT_ENFORCEMENT:-0}"
RUN_FULL_BASELINE="${RUN_FULL_BASELINE:-0}"
RUN_IMAGE_PREP="${RUN_IMAGE_PREP:-0}"
PROVIDER_CONFORMANCE_IMAGE_PREP="${PROVIDER_CONFORMANCE_IMAGE_PREP:-1}"

mkdir -p "${OUTPUT_DIR}"
OUTPUT_DIR="$(
  cd "${OUTPUT_DIR}"
  pwd -P
)"

REPORT_FILE="${OUTPUT_DIR}/report.md"

STEP_COUNT=0
FAILURES=0

STEP_IDS=()
STEP_LANES=()
STEP_TITLES=()
STEP_OUTCOMES=()
STEP_VERIFIERS=()
STEP_STATUSES=()
STEP_LOGS=()
STEP_SECONDS=()

require_file() {
  local file="$1"
  if [ ! -f "${file}" ]; then
    echo "Missing required verifier: ${file}" >&2
    exit 1
  fi
}

record_step() {
  local id="$1"
  local lane="$2"
  local title="$3"
  local outcomes="$4"
  local verifier="$5"
  local status="$6"
  local log_path="$7"
  local seconds="$8"

  STEP_IDS[${STEP_COUNT}]="${id}"
  STEP_LANES[${STEP_COUNT}]="${lane}"
  STEP_TITLES[${STEP_COUNT}]="${title}"
  STEP_OUTCOMES[${STEP_COUNT}]="${outcomes}"
  STEP_VERIFIERS[${STEP_COUNT}]="${verifier}"
  STEP_STATUSES[${STEP_COUNT}]="${status}"
  STEP_LOGS[${STEP_COUNT}]="${log_path}"
  STEP_SECONDS[${STEP_COUNT}]="${seconds}"
  STEP_COUNT=$((STEP_COUNT + 1))
}

run_step() {
  local id="$1"
  local lane="$2"
  local title="$3"
  local outcomes="$4"
  local verifier="$5"

  local log_path="${OUTPUT_DIR}/${id}.log"
  local start_ts
  local end_ts
  local elapsed
  local status
  local exit_code

  require_file "${verifier}"

  echo "[matrix] ${lane}: ${title}"
  start_ts="$(date +%s)"
  set +e
  case "$(basename "${verifier}")" in
    verify-m10-provider-conformance.sh)
      RUN_M5_BASELINE="${RUN_FULL_BASELINE}" \
      RUN_IMAGE_PREP="${PROVIDER_CONFORMANCE_IMAGE_PREP}" \
      bash "${verifier}" >"${log_path}" 2>&1
      exit_code=$?
      ;;
    verify-m10-entitlement-deny.sh)
      RUN_M5_BASELINE="${RUN_FULL_BASELINE}" \
      bash "${verifier}" >"${log_path}" 2>&1
      exit_code=$?
      ;;
    *)
      bash "${verifier}" >"${log_path}" 2>&1
      exit_code=$?
      ;;
  esac
  set -e
  end_ts="$(date +%s)"
  elapsed=$((end_ts - start_ts))

  if [ "${exit_code}" -eq 0 ]; then
    status="PASS"
  else
    status="FAIL"
    FAILURES=$((FAILURES + 1))
  fi

  record_step "${id}" "${lane}" "${title}" "${outcomes}" "${verifier}" "${status}" "${log_path}" "${elapsed}"
  echo "[matrix] ${lane}: ${title} -> ${status} (${elapsed}s)"
}

write_report() {
  local generated_at
  local overall
  local i

  generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [ "${FAILURES}" -eq 0 ]; then
    overall="PASS"
  else
    overall="FAIL"
  fi

  {
    echo "# Governance Decision Matrix"
    echo
    echo "- Generated: \`${generated_at}\`"
    echo "- Output dir: \`${OUTPUT_DIR}\`"
    echo "- Overall: \`${overall}\`"
    echo "- Full baseline rerun: \`${RUN_FULL_BASELINE}\`"
    echo "- Shared image prep rerun: \`${RUN_IMAGE_PREP}\`"
    echo "- Provider conformance image prep: \`${PROVIDER_CONFORMANCE_IMAGE_PREP}\`"
    echo
    echo "This wrapper preserves the intended product boundary:"
    echo
    echo "- OSS lane proves provider allow/deny plus runtime approval queue decisions."
    echo "- AIMXS-full lane proves premium policy allow/defer/deny without turning DEFER into an OSS default."
    echo
    echo "| Lane | Surface | Expected outcomes | Verifier | Status | Log | Duration |"
    echo "| --- | --- | --- | --- | --- | --- | --- |"
    for (( i = 0; i < STEP_COUNT; i++ )); do
      printf '| %s | %s | %s | `%s` | %s | `%s` | %ss |\n' \
        "${STEP_LANES[${i}]}" \
        "${STEP_TITLES[${i}]}" \
        "${STEP_OUTCOMES[${i}]}" \
        "$(basename "${STEP_VERIFIERS[${i}]}")" \
        "${STEP_STATUSES[${i}]}" \
        "${STEP_LOGS[${i}]}" \
        "${STEP_SECONDS[${i}]}"
    done
    echo
    echo "## Expected interpretation"
    echo
    echo "- OSS provider lane: policy \`ALLOW\`, \`DENY\`"
    echo "- OSS approval lane: runtime queue \`APPROVE\`, \`DENY\`, \`EXPIRED\`"
    echo "- AIMXS-full lane: policy \`ALLOW\`, \`DEFER\`, \`DENY\`"
    if [ "${INCLUDE_GRANT_ENFORCEMENT}" = "1" ]; then
      echo "- AIMXS-full grant lane: \`no-token no-execution\`"
    fi
  } >"${REPORT_FILE}"
}

main() {
  run_step \
    "oss-policy-allow-deny" \
    "OSS" \
    "Provider conformance" \
    "ALLOW, DENY" \
    "${SCRIPT_DIR}/verify-m10-provider-conformance.sh"

  run_step \
    "oss-approval-queue" \
    "OSS" \
    "Runtime approval queue" \
    "APPROVE, DENY, EXPIRED" \
    "${SCRIPT_DIR}/verify-m13-runtime-approvals.sh"

  run_step \
    "aimxs-policy-allow-defer" \
    "AIMXS-full" \
    "Boundary-preserving policy path" \
    "ALLOW, DEFER" \
    "${SCRIPT_DIR}/verify-aimxs-boundary.sh"

  run_step \
    "aimxs-policy-deny" \
    "AIMXS-full" \
    "Entitlement deny path" \
    "DENY" \
    "${SCRIPT_DIR}/verify-m10-entitlement-deny.sh"

  if [ "${INCLUDE_GRANT_ENFORCEMENT}" = "1" ]; then
    run_step \
      "aimxs-grant-enforcement" \
      "AIMXS-full" \
      "Grant enforcement" \
      "no-token no-execution" \
      "${SCRIPT_DIR}/verify-m10-policy-grant-enforcement.sh"
  fi

  write_report
  cat "${REPORT_FILE}"

  if [ "${FAILURES}" -ne 0 ]; then
    echo
    echo "Governance decision matrix failed. See report: ${REPORT_FILE}" >&2
    exit 1
  fi

  echo
  echo "Governance decision matrix passed. Report: ${REPORT_FILE}"
}

main "$@"
