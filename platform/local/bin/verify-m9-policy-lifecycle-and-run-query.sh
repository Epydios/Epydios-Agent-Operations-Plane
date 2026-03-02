#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

RUNTIME="${RUNTIME:-kind}" # kind | k3d
CLUSTER_NAME="${CLUSTER_NAME:-epydios-dev}"
NAMESPACE="${NAMESPACE:-epydios-system}"

RUN_M5_BASELINE="${RUN_M5_BASELINE:-1}"
RUN_M5_BOOTSTRAP="${RUN_M5_BOOTSTRAP:-0}"
RUN_M5_IMAGE_PREP="${RUN_M5_IMAGE_PREP:-1}"

LOCAL_PORT="${LOCAL_PORT:-18090}"
CURL_CONNECT_TIMEOUT_SECONDS="${CURL_CONNECT_TIMEOUT_SECONDS:-3}"
CURL_MAX_TIME_SECONDS="${CURL_MAX_TIME_SECONDS:-20}"
CURL_HTTP_RETRIES="${CURL_HTTP_RETRIES:-5}"

PORT_FORWARD_PID=""
RUNTIME_PATCHED="0"
TMPDIR_LOCAL="$(mktemp -d)"
declare -a CURL_TIMEOUT_ARGS
CURL_TIMEOUT_ARGS=(--connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS}" --max-time "${CURL_MAX_TIME_SECONDS}")

dump_diagnostics() {
  echo
  echo "=== M9.6 diagnostics (${NAMESPACE}) ===" >&2
  kubectl -n "${NAMESPACE}" get deploy,svc,pods -o wide >&2 || true
  kubectl -n "${NAMESPACE}" describe deployment/orchestration-runtime >&2 || true
  local pod
  pod="$(kubectl -n "${NAMESPACE}" get pod -l app.kubernetes.io/name=orchestration-runtime -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [ -n "${pod}" ]; then
    echo "--- logs pod/${pod} container=runtime ---" >&2
    kubectl -n "${NAMESPACE}" logs "${pod}" -c runtime --tail=300 >&2 || true
  fi
}

stop_port_forward() {
  if [ -n "${PORT_FORWARD_PID}" ] && kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
    wait "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
  PORT_FORWARD_PID=""
}

restore_runtime_env() {
  if [ "${RUNTIME_PATCHED}" != "1" ]; then
    return 0
  fi
  kubectl -n "${NAMESPACE}" set env deployment/orchestration-runtime \
    POLICY_LIFECYCLE_ENABLED=false \
    POLICY_LIFECYCLE_MODE=observe \
    POLICY_ALLOWED_IDS- \
    POLICY_MIN_VERSION- \
    POLICY_ROLLOUT_PERCENT=100 \
    RETENTION_DEFAULT_CLASS=standard \
    RETENTION_POLICY_JSON- \
    >/dev/null 2>&1 || true
  kubectl -n "${NAMESPACE}" rollout status deployment/orchestration-runtime --timeout=8m >/dev/null 2>&1 || true
  RUNTIME_PATCHED="0"
}

cleanup() {
  stop_port_forward
  restore_runtime_env
  rm -rf "${TMPDIR_LOCAL}"
}
trap cleanup EXIT
trap dump_diagnostics ERR

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

run_m5_if_requested() {
  if [ "${RUN_M5_BASELINE}" != "1" ]; then
    return 0
  fi
  echo "Running M5 baseline before M9.6 policy/query smoke..."
  RUNTIME="${RUNTIME}" \
  CLUSTER_NAME="${CLUSTER_NAME}" \
  NAMESPACE="${NAMESPACE}" \
  RUN_BOOTSTRAP="${RUN_M5_BOOTSTRAP}" \
  RUN_IMAGE_PREP="${RUN_M5_IMAGE_PREP}" \
    "${SCRIPT_DIR}/verify-m5-runtime-orchestration.sh"
}

configure_runtime_for_m9_6() {
  echo "Configuring runtime lifecycle + retention controls for M9.6..."
  kubectl -n "${NAMESPACE}" set env deployment/orchestration-runtime \
    POLICY_LIFECYCLE_ENABLED=true \
    POLICY_LIFECYCLE_MODE=enforce \
    POLICY_ALLOWED_IDS=EPYDIOS_OSS_POLICY_BASELINE,EPYDIOS_MTLS_FIXTURE_POLICY \
    POLICY_MIN_VERSION=v1 \
    POLICY_ROLLOUT_PERCENT=100 \
    RETENTION_DEFAULT_CLASS=standard \
    RETENTION_POLICY_JSON='{"short":"24h","standard":"168h","archive":"720h"}' \
    >/dev/null
  RUNTIME_PATCHED="1"
  kubectl -n "${NAMESPACE}" rollout status deployment/orchestration-runtime --timeout=8m
}

start_port_forward() {
  kubectl -n "${NAMESPACE}" port-forward svc/orchestration-runtime "${LOCAL_PORT}:8080" >"${TMPDIR_LOCAL}/port-forward.log" 2>&1 &
  PORT_FORWARD_PID=$!

  local start
  start="$(date +%s)"
  while true; do
    if curl -fsS "${CURL_TIMEOUT_ARGS[@]}" "http://127.0.0.1:${LOCAL_PORT}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    if [ $(( $(date +%s) - start )) -ge 30 ]; then
      echo "Timed out waiting for runtime port-forward readiness" >&2
      cat "${TMPDIR_LOCAL}/port-forward.log" >&2 || true
      return 1
    fi
    sleep 1
  done
}

wait_runtime_health() {
  local start
  start="$(date +%s)"
  while true; do
    if curl -fsS "${CURL_TIMEOUT_ARGS[@]}" "http://127.0.0.1:${LOCAL_PORT}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    if [ $(( $(date +%s) - start )) -ge 45 ]; then
      echo "Timed out waiting for runtime health over current port-forward; restarting..." >&2
      stop_port_forward
      start_port_forward
      return 0
    fi
    sleep 1
  done
}

http_json() {
  local method="$1"
  local path="$2"
  local body_file="${3:-}"
  local out_file="$4"
  local attempt=1
  local -a cmd
  cmd=(curl -sS "${CURL_TIMEOUT_ARGS[@]}" -o "${out_file}" -w "%{http_code}" -X "${method}" "http://127.0.0.1:${LOCAL_PORT}${path}")
  if [ -n "${body_file}" ]; then
    cmd+=(-H "Content-Type: application/json" --data-binary @"${body_file}")
  fi
  while true; do
    local http_code
    local rc
    set +e
    http_code="$("${cmd[@]}")"
    rc=$?
    set -e
    if [ "${rc}" -eq 0 ]; then
      printf '%s' "${http_code}"
      return 0
    fi
    if [ "${attempt}" -ge "${CURL_HTTP_RETRIES}" ]; then
      echo "HTTP request failed after ${attempt} attempts: ${method} ${path}" >&2
      return "${rc}"
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
}

assert_status() {
  local got="$1"
  local want="$2"
  local label="$3"
  if [ "${got}" != "${want}" ]; then
    echo "Assertion failed (${label}): status=${got} expected=${want}" >&2
    return 1
  fi
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if ! grep -Eq "${pattern}" "${file}"; then
    echo "Assertion failed (${label}): pattern not found: ${pattern}" >&2
    cat "${file}" >&2
    return 1
  fi
}

run_m9_6_smoke() {
  local status run_id

  cat >"${TMPDIR_LOCAL}/run-short.json" <<'JSON'
{
  "meta": {
    "requestId": "m9-6-short-allow",
    "timestamp": "2026-03-01T00:00:00Z",
    "tenantId": "tenant-alpha",
    "projectId": "project-a",
    "environment": "staging"
  },
  "subject": {"type":"user","id":"alice"},
  "action": {"verb":"read","target":"inference"},
  "task": {"kind":"inference","sensitivity":"standard"},
  "resource": {"kind":"InferenceService","namespace":"kserve-smoke","name":"python-smoke"},
  "mode": "enforce",
  "retentionClass": "short"
}
JSON

  wait_runtime_health
  local create_attempt=1
  while true; do
    status="$(http_json POST "/v1alpha1/runtime/runs" "${TMPDIR_LOCAL}/run-short.json" "${TMPDIR_LOCAL}/run-short.out.json")"
    if [ "${status}" = "201" ]; then
      break
    fi
    echo "create short retention run attempt=${create_attempt} status=${status}" >&2
    cat "${TMPDIR_LOCAL}/run-short.out.json" >&2 || true
    if [ "${create_attempt}" -ge 8 ]; then
      assert_status "${status}" "201" "create short retention run"
    fi
    create_attempt=$((create_attempt + 1))
    sleep 2
  done
  assert_contains "${TMPDIR_LOCAL}/run-short.out.json" '"policyDecision"[[:space:]]*:[[:space:]]*"ALLOW"' "short run allow decision"
  assert_contains "${TMPDIR_LOCAL}/run-short.out.json" '"retentionClass"[[:space:]]*:[[:space:]]*"short"' "short run retention class"
  assert_contains "${TMPDIR_LOCAL}/run-short.out.json" '"policyBundleId"[[:space:]]*:[[:space:]]*"(EPYDIOS_OSS_POLICY_BASELINE|EPYDIOS_MTLS_FIXTURE_POLICY)"' "policy bundle id persisted"
  run_id="$(jq -r '.runId' "${TMPDIR_LOCAL}/run-short.out.json")"

  status="$(http_json GET "/v1alpha1/runtime/runs?limit=20&retentionClass=short&status=COMPLETED&search=m9-6-short" "" "${TMPDIR_LOCAL}/runs-filtered.json")"
  assert_status "${status}" "200" "filtered list query"
  assert_contains "${TMPDIR_LOCAL}/runs-filtered.json" "\"runId\"[[:space:]]*:[[:space:]]*\"${run_id}\"" "filtered list contains run"

  status="$(http_json GET "/v1alpha1/runtime/runs/export?format=csv&limit=10&retentionClass=short" "" "${TMPDIR_LOCAL}/runs-export.csv")"
  assert_status "${status}" "200" "csv export query"
  assert_contains "${TMPDIR_LOCAL}/runs-export.csv" '^runId,requestId,tenantId,projectId,environment,retentionClass,expiresAt,status,policyDecision,policyBundleId,policyBundleVersion' "csv export header"
  assert_contains "${TMPDIR_LOCAL}/runs-export.csv" "${run_id}" "csv export contains run"

  status="$(http_json GET "/v1alpha1/runtime/runs/export?format=jsonl&limit=10&search=m9-6-short-allow" "" "${TMPDIR_LOCAL}/runs-export.jsonl")"
  assert_status "${status}" "200" "jsonl export query"
  assert_contains "${TMPDIR_LOCAL}/runs-export.jsonl" "\"runId\":\"${run_id}\"" "jsonl export contains run"

  cat >"${TMPDIR_LOCAL}/retention-prune-dryrun.json" <<'JSON'
{
  "dryRun": true,
  "before": "2099-01-01T00:00:00Z",
  "retentionClass": "short",
  "limit": 20
}
JSON
  status="$(http_json POST "/v1alpha1/runtime/runs/retention/prune" "${TMPDIR_LOCAL}/retention-prune-dryrun.json" "${TMPDIR_LOCAL}/retention-prune.out.json")"
  assert_status "${status}" "200" "retention prune dry-run"
  assert_contains "${TMPDIR_LOCAL}/retention-prune.out.json" '"dryRun"[[:space:]]*:[[:space:]]*true' "retention dry-run flag"
  assert_contains "${TMPDIR_LOCAL}/retention-prune.out.json" '"matched"[[:space:]]*:[[:space:]]*[1-9][0-9]*' "retention matched count"

  echo "Forcing lifecycle deny path by policy ID mismatch..."
  kubectl -n "${NAMESPACE}" set env deployment/orchestration-runtime POLICY_ALLOWED_IDS=UNEXPECTED_POLICY_ID >/dev/null
  kubectl -n "${NAMESPACE}" rollout status deployment/orchestration-runtime --timeout=8m >/dev/null
  wait_runtime_health

  status="$(http_json POST "/v1alpha1/runtime/runs" "${TMPDIR_LOCAL}/run-short.json" "${TMPDIR_LOCAL}/run-lifecycle-deny.out.json")"
  assert_status "${status}" "500" "lifecycle enforce deny"
  assert_contains "${TMPDIR_LOCAL}/run-lifecycle-deny.out.json" '"errorCode"[[:space:]]*:[[:space:]]*"RUN_EXECUTION_FAILED"' "lifecycle deny error code"
  assert_contains "${TMPDIR_LOCAL}/run-lifecycle-deny.out.json" 'policy lifecycle validation failed' "lifecycle deny reason"

  echo "Restoring lifecycle allowed policy ID..."
  kubectl -n "${NAMESPACE}" set env deployment/orchestration-runtime POLICY_ALLOWED_IDS=EPYDIOS_OSS_POLICY_BASELINE,EPYDIOS_MTLS_FIXTURE_POLICY >/dev/null
  kubectl -n "${NAMESPACE}" rollout status deployment/orchestration-runtime --timeout=8m >/dev/null
  wait_runtime_health
}

main() {
  require_cmd kubectl
  require_cmd curl
  require_cmd jq

  run_m5_if_requested
  configure_runtime_for_m9_6
  start_port_forward
  run_m9_6_smoke

  echo
  echo "M9.6 policy lifecycle + run query/export + retention controls smoke passed."
}

main "$@"
