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

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-420}"
LOCAL_PORT="${LOCAL_PORT:-18141}"
CURL_CONNECT_TIMEOUT_SECONDS="${CURL_CONNECT_TIMEOUT_SECONDS:-3}"
CURL_MAX_TIME_SECONDS="${CURL_MAX_TIME_SECONDS:-20}"

NO_EGRESS_LABEL_KEY="epydios.ai/no-egress-scope"
NO_EGRESS_LABEL_VALUE="true"
NO_EGRESS_POLICY_NAME="m10-no-egress-runtime"
NO_EGRESS_PROBE_POD="m10-no-egress-probe"

PORT_FORWARD_PID=""
TMPDIR_LOCAL="$(mktemp -d)"
RUNTIME_LABEL_PATCHED="0"
NO_EGRESS_POLICY_APPLIED="0"
NO_EGRESS_PROBE_APPLIED="0"
declare -a CURL_TIMEOUT_ARGS
CURL_TIMEOUT_ARGS=(--connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS}" --max-time "${CURL_MAX_TIME_SECONDS}")

dump_diagnostics() {
  echo
  echo "=== M10.5 diagnostics (${NAMESPACE}) ===" >&2
  kubectl -n "${NAMESPACE}" get extensionprovider,deploy,svc,pods,networkpolicy -o wide >&2 || true
  kubectl -n "${NAMESPACE}" describe deployment/orchestration-runtime >&2 || true
  kubectl -n "${NAMESPACE}" get extensionprovider aimxs-policy-primary -o yaml >&2 || true
  kubectl -n "${NAMESPACE}" get networkpolicy "${NO_EGRESS_POLICY_NAME}" -o yaml >&2 || true
  kubectl -n "${NAMESPACE}" logs deployment/orchestration-runtime -c runtime --tail=120 >&2 || true
}

stop_port_forward() {
  if [ -n "${PORT_FORWARD_PID}" ] && kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
    wait "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
  PORT_FORWARD_PID=""
}

remove_no_egress_probe() {
  if [ "${NO_EGRESS_PROBE_APPLIED}" != "1" ]; then
    return 0
  fi
  kubectl -n "${NAMESPACE}" delete pod "${NO_EGRESS_PROBE_POD}" --ignore-not-found >/dev/null 2>&1 || true
  NO_EGRESS_PROBE_APPLIED="0"
}

remove_no_egress_policy() {
  if [ "${NO_EGRESS_POLICY_APPLIED}" != "1" ]; then
    return 0
  fi
  kubectl -n "${NAMESPACE}" delete networkpolicy "${NO_EGRESS_POLICY_NAME}" --ignore-not-found >/dev/null 2>&1 || true
  NO_EGRESS_POLICY_APPLIED="0"
}

restore_runtime_label_patch() {
  if [ "${RUNTIME_LABEL_PATCHED}" != "1" ]; then
    return 0
  fi
  kubectl -n "${NAMESPACE}" patch deployment orchestration-runtime --type json \
    -p='[{"op":"remove","path":"/spec/template/metadata/labels/epydios.ai~1no-egress-scope"}]' >/dev/null 2>&1 || true
  kubectl -n "${NAMESPACE}" rollout status deployment/orchestration-runtime --timeout=8m >/dev/null 2>&1 || true
  RUNTIME_LABEL_PATCHED="0"
}

restore_oss_mode() {
  kubectl apply -k "${REPO_ROOT}/platform/modes/oss-only" >/dev/null 2>&1 || true
  kubectl -n "${NAMESPACE}" delete extensionprovider aimxs-policy-primary --ignore-not-found >/dev/null 2>&1 || true
}

cleanup() {
  stop_port_forward
  remove_no_egress_probe
  remove_no_egress_policy
  restore_runtime_label_patch
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
  local provider="$1"
  local expected_provider_id="${2:-}"
  local start statuses provider_id
  start="$(date +%s)"
  while true; do
    statuses="$(
      kubectl -n "${NAMESPACE}" get extensionprovider "${provider}" \
        -o jsonpath='{range .status.conditions[*]}{.type}={.status}{";"}{end}' 2>/dev/null || true
    )"
    provider_id="$(
      kubectl -n "${NAMESPACE}" get extensionprovider "${provider}" \
        -o jsonpath='{.status.resolved.providerId}' 2>/dev/null || true
    )"
    if printf '%s' "${statuses}" | grep -q 'Ready=True' && printf '%s' "${statuses}" | grep -q 'Probed=True'; then
      if [ -z "${expected_provider_id}" ] || [ "${provider_id}" = "${expected_provider_id}" ]; then
        return 0
      fi
    fi
    if [ $(( $(date +%s) - start )) -ge "${TIMEOUT_SECONDS}" ]; then
      echo "Timed out waiting for provider ${provider} Ready/Probed." >&2
      echo "statuses=${statuses}" >&2
      echo "resolved.providerId=${provider_id}" >&2
      kubectl -n "${NAMESPACE}" get extensionprovider "${provider}" -o yaml >&2 || true
      return 1
    fi
    sleep 2
  done
}

ensure_m5_baseline_if_requested() {
  if [ "${RUN_M5_BASELINE}" != "1" ]; then
    return 0
  fi
  echo "Running M5 baseline before M10.5 no-egress verification..."
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
    "id": "m10-no-egress-user"
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

assert_runtime_selected_policy_provider() {
  local phase="$1"
  local expected_provider="$2"
  local body_file out_file status attempt
  body_file="${TMPDIR_LOCAL}/run-${phase}.json"
  out_file="${TMPDIR_LOCAL}/run-${phase}.out.json"
  write_allow_request "m10-5-${phase}-$(date +%s)" "${body_file}"

  for attempt in $(seq 1 20); do
    status="$(post_json_status "${body_file}" "${out_file}" || true)"
    if [ "${status}" = "201" ] && grep -Eq "\"selectedPolicyProvider\"[[:space:]]*:[[:space:]]*\"${expected_provider}\"" "${out_file}"; then
      echo "M10.5 ${phase}: runtime selected ${expected_provider}."
      return 0
    fi
    sleep 2
  done

  echo "M10.5 ${phase}: failed to observe selectedPolicyProvider=${expected_provider}" >&2
  echo "Last status=${status}" >&2
  cat "${out_file}" >&2 || true
  return 1
}

apply_customer_mode_and_override() {
  echo "Applying aimxs-full mode profile..."
  kubectl apply -k "${REPO_ROOT}/platform/modes/aimxs-full" >/dev/null

  local auth_mode endpoint_url
  auth_mode="$(kubectl -n "${NAMESPACE}" get extensionprovider aimxs-policy-primary -o jsonpath='{.spec.auth.mode}' 2>/dev/null || true)"
  endpoint_url="$(kubectl -n "${NAMESPACE}" get extensionprovider aimxs-policy-primary -o jsonpath='{.spec.endpoint.url}' 2>/dev/null || true)"
  if [ "${auth_mode}" != "MTLSAndBearerTokenSecret" ]; then
    echo "Customer-hosted profile expected MTLSAndBearerTokenSecret auth, found '${auth_mode}'." >&2
    return 1
  fi
  if ! printf '%s' "${endpoint_url}" | grep -Eq '^https://aimxs-policy\.epydios-system\.svc\.cluster\.local'; then
    echo "Customer-hosted profile endpoint mismatch: '${endpoint_url}'." >&2
    return 1
  fi

  # Local no-egress proof override:
  # use in-cluster OSS provider endpoint as AIMXS stand-in to validate that policy flow does not
  # require external network egress when AIMXS runs customer-local.
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

  wait_for_provider_ready oss-policy-opa oss-policy-opa
  # Local smoke override points AIMXS contract to OSS policy endpoint, so resolved.providerId
  # reflects the remote OSS provider id while the selected contract id remains aimxs-policy-primary.
  wait_for_provider_ready aimxs-policy-primary
}

patch_runtime_pod_label() {
  echo "Patching runtime pod template label for scoped no-egress policy..."
  kubectl -n "${NAMESPACE}" patch deployment orchestration-runtime --type merge \
    -p "{\"spec\":{\"template\":{\"metadata\":{\"labels\":{\"${NO_EGRESS_LABEL_KEY}\":\"${NO_EGRESS_LABEL_VALUE}\"}}}}}" >/dev/null
  RUNTIME_LABEL_PATCHED="1"
  kubectl -n "${NAMESPACE}" rollout status deployment/orchestration-runtime --timeout=8m >/dev/null
}

apply_no_egress_policy() {
  local api_server_ip
  local api_endpoint_ips
  local api_allow_rules
  api_server_ip="$(kubectl -n default get svc kubernetes -o jsonpath='{.spec.clusterIP}' 2>/dev/null || true)"
  if [ -z "${api_server_ip}" ]; then
    echo "Unable to resolve kubernetes API service ClusterIP for no-egress policy allowlist." >&2
    return 1
  fi
  api_endpoint_ips="$(kubectl -n default get endpoints kubernetes -o jsonpath='{range .subsets[*].addresses[*]}{.ip}{"\n"}{end}' 2>/dev/null | sed '/^$/d' | sort -u)"

  api_allow_rules=$(cat <<YAML
    # Allow Kubernetes API service VIP (ClusterIP path).
    - to:
        - ipBlock:
            cidr: ${api_server_ip}/32
      ports:
        - protocol: TCP
          port: 443
YAML
)

  if [ -n "${api_endpoint_ips}" ]; then
    while IFS= read -r endpoint_ip; do
      api_allow_rules="${api_allow_rules}
    # Allow direct API endpoint used after service translation.
    - to:
        - ipBlock:
            cidr: ${endpoint_ip}/32
      ports:
        - protocol: TCP
          port: 6443"
    done <<< "${api_endpoint_ips}"
  fi

  cat >"${TMPDIR_LOCAL}/no-egress-policy.yaml" <<YAML
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${NO_EGRESS_POLICY_NAME}
  namespace: ${NAMESPACE}
spec:
  podSelector:
    matchLabels:
      ${NO_EGRESS_LABEL_KEY}: "${NO_EGRESS_LABEL_VALUE}"
  policyTypes:
    - Egress
  egress:
${api_allow_rules}
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ${NAMESPACE}
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
YAML
  kubectl -n "${NAMESPACE}" apply -f "${TMPDIR_LOCAL}/no-egress-policy.yaml" >/dev/null
  NO_EGRESS_POLICY_APPLIED="1"
}

apply_no_egress_probe_pod() {
  cat >"${TMPDIR_LOCAL}/no-egress-probe.yaml" <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: ${NO_EGRESS_PROBE_POD}
  namespace: ${NAMESPACE}
  labels:
    ${NO_EGRESS_LABEL_KEY}: "${NO_EGRESS_LABEL_VALUE}"
spec:
  restartPolicy: Never
  containers:
    - name: curl
      image: curlimages/curl:8.12.1
      command: ["sh", "-c", "sleep 3600"]
YAML
  kubectl -n "${NAMESPACE}" apply -f "${TMPDIR_LOCAL}/no-egress-probe.yaml" >/dev/null
  NO_EGRESS_PROBE_APPLIED="1"
  kubectl -n "${NAMESPACE}" wait --for=condition=Ready "pod/${NO_EGRESS_PROBE_POD}" --timeout=5m >/dev/null
}

assert_probe_internal_allowed() {
  kubectl -n "${NAMESPACE}" exec "${NO_EGRESS_PROBE_POD}" -- sh -c \
    'curl -fsS --connect-timeout 5 --max-time 10 http://epydios-oss-policy-provider.epydios-system.svc.cluster.local:8080/healthz >/dev/null'
  echo "No-egress probe: internal service access allowed."
}

assert_probe_external_blocked() {
  if kubectl -n "${NAMESPACE}" exec "${NO_EGRESS_PROBE_POD}" -- sh -c \
    'curl -fsS --connect-timeout 5 --max-time 10 http://example.com >/dev/null'; then
    echo "No-egress probe unexpectedly reached external endpoint http://example.com." >&2
    return 1
  fi
  echo "No-egress probe: external endpoint blocked as expected."
}

main() {
  require_cmd kubectl
  require_cmd curl
  require_cmd grep

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
  apply_customer_mode_and_override

  patch_runtime_pod_label
  apply_no_egress_policy
  apply_no_egress_probe_pod

  assert_probe_internal_allowed
  assert_probe_external_blocked

  start_port_forward
  assert_runtime_selected_policy_provider "no-egress-local-aimxs" "aimxs-policy-primary"

  echo "M10.5 no-egress local AIMXS verification passed (external egress blocked, in-cluster policy path succeeded)."
}

main "$@"
