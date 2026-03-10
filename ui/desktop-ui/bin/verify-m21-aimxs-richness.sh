#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${MODULE_ROOT}/../.." && pwd)"
WORKSPACE_ROOT="$(cd "${REPO_ROOT}/.." && pwd)"

NAMESPACE="${NAMESPACE:-epydios-system}"
AIMXS_URL="${AIMXS_URL:-http://127.0.0.1:4271}"
OSS_URL="${OSS_URL:-http://127.0.0.1:18081}"
AIMXS_EXTRACTED_ROOT="${AIMXS_EXTRACTED_ROOT:-${WORKSPACE_ROOT}/AIMXS/AIMXS_CORE_PACK_v74/EXTRACTED}"
SKIP_HANDSHAKE_PROBE=0
OSS_PF_PID=""
TMP_DIR=""
KEEP_TMP_DIR_ON_EXIT=0
VERIFY_STATUS="failed"

usage() {
  cat <<EOF
Usage: verify-m21-aimxs-richness.sh [options]

Proves the operator-visible difference between OSS policy and AIMXS full mode.

Options:
  --aimxs-url URL             AIMXS full provider base URL (default: ${AIMXS_URL})
  --oss-url URL               OSS policy provider base URL (default: ${OSS_URL})
  --namespace NAME            Namespace for OSS provider port-forward (default: ${NAMESPACE})
  --aimxs-extracted-root DIR  AIMXS extracted pack root for handshake probe
                              (default: ${AIMXS_EXTRACTED_ROOT})
  --skip-handshake-probe      Skip the AIMXS-only adapter handshake supplement
  -h, --help                  Show usage

Preconditions:
  - Terminal 2 is running so aimxs-full is live on ${AIMXS_URL}
  - The cluster is reachable so the script can port-forward the OSS provider
EOF
}

require_cmd() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1 || {
    echo "Missing required command: ${cmd}" >&2
    exit 1
  }
}

cleanup() {
  if [[ -n "${OSS_PF_PID}" ]]; then
    kill "${OSS_PF_PID}" >/dev/null 2>&1 || true
    wait "${OSS_PF_PID}" >/dev/null 2>&1 || true
    OSS_PF_PID=""
  fi
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" && "${KEEP_TMP_DIR_ON_EXIT}" -eq 0 && "${VERIFY_STATUS}" == "passed" ]]; then
    rm -rf "${TMP_DIR}"
  elif [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then
    echo "Retained verifier artifacts at ${TMP_DIR}" >&2
  fi
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --aimxs-url)
      AIMXS_URL="${2:-}"
      shift 2
      ;;
    --oss-url)
      OSS_URL="${2:-}"
      shift 2
      ;;
    --namespace)
      NAMESPACE="${2:-}"
      shift 2
      ;;
    --aimxs-extracted-root)
      AIMXS_EXTRACTED_ROOT="${2:-}"
      shift 2
      ;;
    --skip-handshake-probe)
      SKIP_HANDSHAKE_PROBE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_cmd curl
require_cmd jq
require_cmd python3

TMP_DIR="$(mktemp -d "/tmp/aimxs-richness.XXXXXX")"
PAYLOAD_PATH="${TMP_DIR}/richness-probe.json"
AIMXS_CAPS_PATH="${TMP_DIR}/aimxs-capabilities.json"
OSS_CAPS_PATH="${TMP_DIR}/oss-capabilities.json"
AIMXS_EVAL_PATH="${TMP_DIR}/aimxs-evaluate.json"
OSS_EVAL_PATH="${TMP_DIR}/oss-evaluate.json"
HANDSHAKE_PATH="${TMP_DIR}/aimxs-handshake.json"
OSS_PF_LOG="${TMP_DIR}/oss-port-forward.log"

cat > "${PAYLOAD_PATH}" <<'EOF'
{
  "meta": {
    "requestId": "aimxs-richness-probe-001",
    "timestamp": "2026-03-09T00:00:00Z",
    "tenantId": "demo-tenant",
    "projectId": "demo-project",
    "environment": "dev",
    "actor": "desktop-richness-verifier"
  },
  "subject": {
    "type": "user",
    "id": "alice-richness-probe",
    "attributes": {
      "approvedForProd": false
    }
  },
  "action": {
    "type": "trade.execute",
    "class": "execute",
    "verb": "execute",
    "target": "broker-order"
  },
  "resource": {
    "kind": "broker-order",
    "class": "external_actuator",
    "namespace": "epydios-system",
    "name": "order-probe-001",
    "id": "order-probe-001"
  },
  "context": {
    "governed_action": {
      "contract_id": "epydios.governed-action.v1",
      "workflow_kind": "external_action_request",
      "request_label": "AIMXS Richness Verifier",
      "demo_profile": "finance_paper_trade",
      "origin_surface": "verify-m21-aimxs-richness.sh"
    },
    "policy_stratification": {
      "policy_bucket_id": "richness-trade-probe",
      "action_class": "execute",
      "boundary_class": "external_actuator",
      "risk_tier": "high",
      "required_grants": [
        "grant.trading.supervisor"
      ],
      "evidence_readiness": "PARTIAL",
      "gates": {
        "core09.gates.default_off": true,
        "core09.gates.required_grants_enforced": true,
        "core09.gates.evidence_readiness_enforced": true,
        "core14.adapter_present.enforce_handshake": true
      }
    }
  },
  "mode": "enforce",
  "dryRun": false
}
EOF

wait_for_url() {
  local url="$1"
  local attempts="${2:-20}"
  local delay_s="${3:-1}"
  local i=0
  for (( i = 0; i < attempts; i++ )); do
    if curl -sSf "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay_s}"
  done
  echo "Timed out waiting for ${url}" >&2
  return 1
}

ensure_oss_provider() {
  if curl -sSf "${OSS_URL}/v1alpha1/capabilities" >/dev/null 2>&1; then
    return 0
  fi
  require_cmd kubectl
  kubectl -n "${NAMESPACE}" port-forward svc/epydios-oss-policy-provider 18081:8080 > "${OSS_PF_LOG}" 2>&1 &
  OSS_PF_PID=$!
  wait_for_url "${OSS_URL}/v1alpha1/capabilities" 20 1
}

assert_json() {
  local file="$1"
  local expr="$2"
  local message="$3"
  if ! jq -e "${expr}" "${file}" >/dev/null; then
    echo "Assertion failed: ${message}" >&2
    echo "File: ${file}" >&2
    jq . "${file}" >&2
    exit 1
  fi
}

post_json_capture() {
  local url="$1"
  local body_file="$2"
  local out_file="$3"
  local http_code=""
  http_code="$(
    curl -sS \
      -o "${out_file}" \
      -w "%{http_code}" \
      -H 'Content-Type: application/json' \
      -X POST \
      --data-binary @"${body_file}" \
      "${url}"
  )"
  if [[ "${http_code}" != 2* ]]; then
    KEEP_TMP_DIR_ON_EXIT=1
    echo "Request failed: ${url} (HTTP ${http_code})" >&2
    echo "Response body from ${url}:" >&2
    cat "${out_file}" >&2 || true
    return 1
  fi
}

echo "Preparing providers..."
wait_for_url "${AIMXS_URL}/v1alpha1/capabilities" 10 1
ensure_oss_provider

echo "Capturing capability sets..."
curl -sSf "${AIMXS_URL}/v1alpha1/capabilities" > "${AIMXS_CAPS_PATH}"
curl -sSf "${OSS_URL}/v1alpha1/capabilities" > "${OSS_CAPS_PATH}"

assert_json "${AIMXS_CAPS_PATH}" '.providerId == "aimxs-full"' "aimxs-full provider id"
assert_json "${AIMXS_CAPS_PATH}" '.capabilities | index("governance.handshake_validation") != null' "aimxs handshake capability"
assert_json "${AIMXS_CAPS_PATH}" '.capabilities | index("evidence.policy_decision_refs") != null' "aimxs evidence decision refs capability"
assert_json "${AIMXS_CAPS_PATH}" '.capabilities | index("policy.defer") != null' "aimxs defer capability"

assert_json "${OSS_CAPS_PATH}" '.providerId == "oss-policy-opa"' "oss provider id"
assert_json "${OSS_CAPS_PATH}" '.capabilities | index("governance.handshake_validation") == null' "oss does not advertise handshake validation"
assert_json "${OSS_CAPS_PATH}" '.capabilities | index("evidence.policy_decision_refs") == null' "oss does not advertise evidence decision refs"
assert_json "${OSS_CAPS_PATH}" '.capabilities | index("policy.defer") == null' "oss does not advertise defer"

echo "Running decision-richness probe..."
post_json_capture "${AIMXS_URL}/v1alpha1/policy-provider/evaluate" "${PAYLOAD_PATH}" "${AIMXS_EVAL_PATH}"
post_json_capture "${OSS_URL}/v1alpha1/policy-provider/evaluate" "${PAYLOAD_PATH}" "${OSS_EVAL_PATH}"

assert_json "${AIMXS_EVAL_PATH}" '.decision == "DEFER"' "aimxs richness probe should DEFER"
assert_json "${AIMXS_EVAL_PATH}" '.output.aimxs.providerMeta.baak_engaged == true' "aimxs probe should engage BAAK metadata"
assert_json "${AIMXS_EVAL_PATH}" '.output.aimxs.providerMeta.policy_stratification.boundary_class == "external_actuator"' "aimxs probe should emit policy stratification"
assert_json "${AIMXS_EVAL_PATH}" '(.output.aimxs.evidence.evidence_hash | type) == "string" and (.output.aimxs.evidence.evidence_hash | length) > 0' "aimxs probe should emit deterministic evidence hash"
assert_json "${AIMXS_EVAL_PATH}" '(.evidenceRefs | length) > 0' "aimxs probe should emit evidence refs"

assert_json "${OSS_EVAL_PATH}" '.decision == "ALLOW"' "oss probe should ALLOW the same payload"
assert_json "${OSS_EVAL_PATH}" '.decision != "DEFER"' "oss probe must not DEFER"
assert_json "${OSS_EVAL_PATH}" '.output.engine == "opa"' "oss probe should stay on OPA output"
assert_json "${OSS_EVAL_PATH}" '.output | has("aimxs") | not' "oss probe must not emit AIMXS metadata"

if [[ "${SKIP_HANDSHAKE_PROBE}" -eq 0 ]]; then
  echo "Running AIMXS adapter-handshake supplement..."
  PYTHONPYCACHEPREFIX="${TMP_DIR}/pycache" AIMXS_EXTRACTED_ROOT="${AIMXS_EXTRACTED_ROOT}" python3 - <<'PY' > "${HANDSHAKE_PATH}"
import json
import os
import sys
from pathlib import Path

root = Path(os.environ["AIMXS_EXTRACTED_ROOT"]).expanduser().resolve()
addon = root / "CANONICAL_INPUTS" / "AIMXS_INTEGRATION_RUNTIME_ADDON_v1"
sample_path = addon / "CORE09_CORE14_HOOKS_ONLY_SAMPLE_CALLS_v2.json"
if not sample_path.exists():
    raise SystemExit(f"missing AIMXS sample calls: {sample_path}")
sys.path.insert(0, str(addon))
from ILB_AIMX_GOVERNANCE_PROVIDER_ADAPTER_v25 import GovernanceProviderAdapter

with sample_path.open("r", encoding="utf-8") as handle:
    payload = json.load(handle)

adapter = GovernanceProviderAdapter()
missing_rsp = adapter.handle(payload["on_path_missing_handshake_fails"]["request"])
valid_rsp = adapter.handle(payload["on_path_valid_handshake_passes"]["request"])

print(json.dumps({"missing": missing_rsp, "valid": valid_rsp}))
PY

  assert_json "${HANDSHAKE_PATH}" '.missing.status == "ERROR"' "aimxs missing-handshake sample should error"
  assert_json "${HANDSHAKE_PATH}" '.missing.error_code == "CORE14_HANDSHAKE_INVALID"' "aimxs missing-handshake sample should emit CORE14_HANDSHAKE_INVALID"
  assert_json "${HANDSHAKE_PATH}" '.valid.status == "OK"' "aimxs valid-handshake sample should pass"
fi

echo
echo "AIMXS richness probe PASS"
echo "  aimxs capabilities: ${AIMXS_CAPS_PATH}"
echo "  oss capabilities:   ${OSS_CAPS_PATH}"
echo "  aimxs decision:     ${AIMXS_EVAL_PATH}"
echo "  oss decision:       ${OSS_EVAL_PATH}"
if [[ "${SKIP_HANDSHAKE_PROBE}" -eq 0 ]]; then
  echo "  handshake sample:   ${HANDSHAKE_PATH}"
fi
echo
echo "Observed differentiation:"
echo "  - AIMXS advertises handshake/evidence/defer capabilities that OSS does not."
echo "  - AIMXS DEFERs the high-risk external-actuator probe with grants/evidence gates."
echo "  - OSS ALLOWs the same probe and emits baseline OPA output without AIMXS evidence metadata."
VERIFY_STATUS="passed"
