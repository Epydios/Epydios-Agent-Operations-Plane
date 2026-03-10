#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

RUNTIME="${RUNTIME:-kind}" # kind | k3d
CLUSTER_NAME="${CLUSTER_NAME:-epydios-dev}"
NAMESPACE="${NAMESPACE:-epydios-system}"

RUN_M5_BASELINE="${RUN_M5_BASELINE:-1}"
RUN_M5_BOOTSTRAP="${RUN_M5_BOOTSTRAP:-0}"
RUN_M5_IMAGE_PREP="${RUN_M5_IMAGE_PREP:-0}"
KEEP_RESOURCES="${KEEP_RESOURCES:-0}"

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-360}"
LOCAL_PORT="${LOCAL_PORT:-18140}"
CURL_CONNECT_TIMEOUT_SECONDS="${CURL_CONNECT_TIMEOUT_SECONDS:-3}"
CURL_MAX_TIME_SECONDS="${CURL_MAX_TIME_SECONDS:-20}"

PORT_FORWARD_PID=""
TMPDIR_LOCAL="$(mktemp -d)"
declare -a CURL_TIMEOUT_ARGS
CURL_TIMEOUT_ARGS=(--connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS}" --max-time "${CURL_MAX_TIME_SECONDS}")

dump_diagnostics() {
  echo
  echo "=== M10.4 diagnostics (${NAMESPACE}) ===" >&2
  kubectl -n "${NAMESPACE}" get extensionprovider,deploy,svc,pods -o wide >&2 || true
  kubectl -n "${NAMESPACE}" describe deployment/orchestration-runtime >&2 || true
  kubectl -n "${NAMESPACE}" get extensionprovider oss-policy-opa -o yaml >&2 || true
  kubectl -n "${NAMESPACE}" get extensionprovider aimxs-policy-primary -o yaml >&2 || true
  kubectl -n "${NAMESPACE}" logs deployment/orchestration-runtime -c runtime --tail=120 >&2 || true
}

stop_port_forward() {
  if [ -n "${PORT_FORWARD_PID}" ] && kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
    wait "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
  PORT_FORWARD_PID=""
}

restore_oss_mode() {
  kubectl apply -k "${REPO_ROOT}/platform/modes/oss-only" >/dev/null 2>&1 || true
  kubectl -n "${NAMESPACE}" delete extensionprovider aimxs-policy-primary --ignore-not-found >/dev/null 2>&1 || true
}

cleanup() {
  stop_port_forward
  if [ "${KEEP_RESOURCES}" != "1" ]; then
    restore_oss_mode
  fi
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

wait_for_deployment() {
  local deploy="$1"
  kubectl -n "${NAMESPACE}" wait --for=condition=Available "deployment/${deploy}" --timeout=8m >/dev/null
}

wait_for_provider_ready() {
  local name="$1"
  local expected_provider_id="${2:-}"
  local start statuses provider_id
  start="$(date +%s)"
  while true; do
    statuses="$(
      kubectl -n "${NAMESPACE}" get extensionprovider "${name}" \
        -o jsonpath='{range .status.conditions[*]}{.type}={.status}{";"}{end}' 2>/dev/null || true
    )"
    provider_id="$(
      kubectl -n "${NAMESPACE}" get extensionprovider "${name}" \
        -o jsonpath='{.status.resolved.providerId}' 2>/dev/null || true
    )"
    if printf '%s' "${statuses}" | grep -q 'Ready=True' && printf '%s' "${statuses}" | grep -q 'Probed=True'; then
      if [ -z "${expected_provider_id}" ] || [ "${provider_id}" = "${expected_provider_id}" ]; then
        return 0
      fi
    fi
    if [ $(( $(date +%s) - start )) -ge "${TIMEOUT_SECONDS}" ]; then
      echo "Timed out waiting for provider ${name} Ready/Probed." >&2
      echo "statuses=${statuses}" >&2
      echo "resolved.providerId=${provider_id}" >&2
      kubectl -n "${NAMESPACE}" get extensionprovider "${name}" -o yaml >&2 || true
      return 1
    fi
    sleep 2
  done
}

ensure_m5_baseline_if_requested() {
  if [ "${RUN_M5_BASELINE}" != "1" ]; then
    return 0
  fi
  echo "Running M5 baseline before M10.4 mode switching..."
  RUNTIME="${RUNTIME}" \
  CLUSTER_NAME="${CLUSTER_NAME}" \
  NAMESPACE="${NAMESPACE}" \
  RUN_BOOTSTRAP="${RUN_M5_BOOTSTRAP}" \
  RUN_IMAGE_PREP="${RUN_M5_IMAGE_PREP}" \
    "${SCRIPT_DIR}/verify-m5-runtime-orchestration.sh"
}

cleanup_phase4_secure_fixtures_if_present() {
  # M10 mode checks assume control of policy-provider selection. Clear any secure fixture
  # leftovers (for example from Phase 04) that can carry higher selection priority.
  kubectl delete -k "${REPO_ROOT}/platform/tests/phase4-secure-mtls" --ignore-not-found >/dev/null 2>&1 || true
}

start_port_forward() {
  stop_port_forward
  kubectl -n "${NAMESPACE}" port-forward svc/orchestration-runtime "${LOCAL_PORT}:8080" >"${TMPDIR_LOCAL}/port-forward.log" 2>&1 &
  PORT_FORWARD_PID=$!

  local start
  start="$(date +%s)"
  while true; do
    if curl -fsS "${CURL_TIMEOUT_ARGS[@]}" "http://127.0.0.1:${LOCAL_PORT}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    if [ $(( $(date +%s) - start )) -ge 30 ]; then
      echo "Timed out waiting for runtime port-forward readiness." >&2
      cat "${TMPDIR_LOCAL}/port-forward.log" >&2 || true
      return 1
    fi
    sleep 1
  done
}

write_allow_request() {
  local request_id="$1"
  local out_file="$2"
  cat >"${out_file}" <<JSON
{
  "meta": {
    "requestId": "${request_id}",
    "timestamp": "2026-03-02T00:00:00Z",
    "tenantId": "demo-tenant",
    "projectId": "mlops-dev",
    "environment": "dev"
  },
  "subject": {
    "type": "user",
    "id": "m10-mode-user"
  },
  "action": {
    "verb": "read",
    "target": "inference"
  },
  "task": {
    "kind": "inference",
    "sensitivity": "standard"
  },
  "resource": {
    "kind": "InferenceService",
    "namespace": "kserve-smoke",
    "name": "python-smoke"
  },
  "mode": "enforce"
}
JSON
}

post_json_status() {
  local body_file="$1"
  local out_file="$2"
  curl -sS "${CURL_TIMEOUT_ARGS[@]}" \
    -H "Content-Type: application/json" \
    -X POST \
    -o "${out_file}" \
    -w "%{http_code}" \
    "http://127.0.0.1:${LOCAL_PORT}/v1alpha1/runtime/runs" \
    --data-binary @"${body_file}"
}

assert_aimxs_secure_spec() {
  local mode="$1"
  local expected_url_pattern="$2"
  local auth_mode endpoint_url
  auth_mode="$(kubectl -n "${NAMESPACE}" get extensionprovider aimxs-policy-primary -o jsonpath='{.spec.auth.mode}' 2>/dev/null || true)"
  endpoint_url="$(kubectl -n "${NAMESPACE}" get extensionprovider aimxs-policy-primary -o jsonpath='{.spec.endpoint.url}' 2>/dev/null || true)"

  if [ "${auth_mode}" != "MTLSAndBearerTokenSecret" ]; then
    echo "Mode ${mode} expected secure auth mode MTLSAndBearerTokenSecret, found '${auth_mode}'." >&2
    return 1
  fi
  if ! printf '%s' "${endpoint_url}" | grep -Eq '^https://'; then
    echo "Mode ${mode} expected HTTPS endpoint, found '${endpoint_url}'." >&2
    return 1
  fi
  if ! printf '%s' "${endpoint_url}" | grep -Eq "${expected_url_pattern}"; then
    echo "Mode ${mode} endpoint '${endpoint_url}' did not match expected pattern '${expected_url_pattern}'." >&2
    return 1
  fi
}

apply_aimxs_local_smoke_override() {
  # Local mode-switch verification override:
  # route aimxs-policy-primary to in-cluster OSS policy endpoint so switching can be validated
  # without requiring private AIMXS runtime in this OSS workspace.
  cat >"${TMPDIR_LOCAL}/aimxs-full-override.yaml" <<'YAML'
apiVersion: controlplane.epydios.ai/v1alpha1
kind: ExtensionProvider
metadata:
  name: aimxs-policy-primary
spec:
  providerType: PolicyProvider
  providerId: aimxs-policy-primary
  contractVersion: v1alpha1
  endpoint:
    url: http://epydios-oss-policy-provider.epydios-system.svc.cluster.local:8080
    healthPath: /healthz
    capabilitiesPath: /v1alpha1/capabilities
    timeoutSeconds: 5
  auth:
    mode: None
  selection:
    enabled: true
    priority: 900
  advertisedCapabilities:
    - policy.evaluate
    - policy.validate_bundle
YAML
  kubectl -n "${NAMESPACE}" apply -f "${TMPDIR_LOCAL}/aimxs-full-override.yaml" >/dev/null
}

assert_runtime_selected_policy_provider() {
  local phase="$1"
  local expected_provider="$2"
  local body_file out_file status attempt
  body_file="${TMPDIR_LOCAL}/run-${phase}.json"
  out_file="${TMPDIR_LOCAL}/run-${phase}.out.json"
  write_allow_request "m10-4-${phase}-$(date +%s)" "${body_file}"

  for attempt in $(seq 1 20); do
    status="$(post_json_status "${body_file}" "${out_file}" || true)"
    if [ "${status}" = "201" ] && grep -Eq "\"selectedPolicyProvider\"[[:space:]]*:[[:space:]]*\"${expected_provider}\"" "${out_file}"; then
      echo "Mode ${phase}: runtime selected policy provider ${expected_provider}."
      return 0
    fi
    sleep 2
  done

  echo "Mode ${phase}: failed to observe expected selectedPolicyProvider=${expected_provider}" >&2
  echo "Last status=${status}" >&2
  cat "${out_file}" >&2 || true
  return 1
}

apply_oss_mode_and_verify() {
  echo "Applying mode: oss-only"
  kubectl apply -k "${REPO_ROOT}/platform/modes/oss-only" >/dev/null
  kubectl -n "${NAMESPACE}" delete extensionprovider aimxs-policy-primary --ignore-not-found >/dev/null 2>&1 || true
  wait_for_provider_ready oss-policy-opa oss-policy-opa
  assert_runtime_selected_policy_provider "oss-only" "oss-policy-opa"
}

apply_aimxs_mode_and_verify() {
  local mode_dir="$1"
  local expected_url_pattern="$2"
  local phase_label="$3"

  echo "Applying mode: ${mode_dir}"
  kubectl apply -k "${REPO_ROOT}/platform/modes/${mode_dir}" >/dev/null
  assert_aimxs_secure_spec "${mode_dir}" "${expected_url_pattern}"
  apply_aimxs_local_smoke_override

  wait_for_provider_ready oss-policy-opa oss-policy-opa
  # Local smoke override points AIMXS contract to OSS policy endpoint, so resolved.providerId
  # reflects the remote OSS provider id while the selected contract id remains aimxs-policy-primary.
  wait_for_provider_ready aimxs-policy-primary
  assert_runtime_selected_policy_provider "${phase_label}" "aimxs-policy-primary"
}

main() {
  require_cmd kubectl
  require_cmd curl
  require_cmd grep
  require_cmd sed

  case "${RUNTIME}" in
    kind) require_cmd kind ;;
    k3d) require_cmd k3d ;;
    *)
      echo "Unsupported RUNTIME='${RUNTIME}' (expected kind|k3d)." >&2
      exit 1
      ;;
  esac

  ensure_m5_baseline_if_requested
  cleanup_phase4_secure_fixtures_if_present
  wait_for_deployment orchestration-runtime
  wait_for_provider_ready oss-policy-opa oss-policy-opa
  start_port_forward

  apply_oss_mode_and_verify
  apply_aimxs_mode_and_verify "aimxs-https" 'aimxs-policy-hosted\.epydios\.com' "aimxs-https"
  apply_aimxs_mode_and_verify "aimxs-full" 'aimxs-policy\.epydios-system\.svc\.cluster\.local' "aimxs-full"

  echo "M10.4 deployment-mode switching passed (oss-only -> aimxs-https -> aimxs-full) under a single contract."
}

main "$@"
