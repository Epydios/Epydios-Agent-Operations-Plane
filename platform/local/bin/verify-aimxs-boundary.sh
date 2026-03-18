#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

SLOT_FILE="${SLOT_FILE:-${REPO_ROOT}/internal/aimxs/slot.go}"
DOC_FILE="${DOC_FILE:-${REPO_ROOT}/docs/aimxs-plugin-slot.md}"
PUBLICATION_DOC="${PUBLICATION_DOC:-${REPO_ROOT}/docs/runbooks/aimxs-private-sdk-publication.md}"
AIMXS_MANIFEST="${AIMXS_MANIFEST:-${REPO_ROOT}/examples/aimxs/extensionprovider-policy-https.yaml}"
AIMXS_COMPAT_POLICY="${AIMXS_COMPAT_POLICY:-${REPO_ROOT}/platform/upgrade/compatibility-policy-aimxs-decision-api.yaml}"
PRIVATE_RELEASE_VERIFIER="${PRIVATE_RELEASE_VERIFIER:-${REPO_ROOT}/platform/local/bin/verify-m10-aimxs-private-release.sh}"
FULL_PACKAGING_VERIFIER="${FULL_PACKAGING_VERIFIER:-${REPO_ROOT}/platform/local/bin/verify-m10-aimxs-full-packaging.sh}"
AIMXS_PROVIDER_SCRIPT="${AIMXS_PROVIDER_SCRIPT:-${REPO_ROOT}/ui/desktop-ui/bin/aimxs-full-provider.py}"
ALLOWED_LOCAL_IMPORT="github.com/Epydios/Epydios-AgentOps-Control-Plane/internal/aimxs"

TMPDIR_LOCAL=""
PROVIDER_PID=""
failures=0

cleanup() {
  if [[ -n "${PROVIDER_PID}" ]] && kill -0 "${PROVIDER_PID}" >/dev/null 2>&1; then
    kill "${PROVIDER_PID}" >/dev/null 2>&1 || true
    wait "${PROVIDER_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${TMPDIR_LOCAL}" && -d "${TMPDIR_LOCAL}" ]]; then
    rm -rf "${TMPDIR_LOCAL}"
  fi
}
trap cleanup EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

fail_check() {
  echo "FAIL: $1" >&2
  failures=$((failures + 1))
}

pass_check() {
  echo "OK: $1"
}

require_file() {
  local file="$1"
  local label="$2"
  if [[ ! -f "${file}" ]]; then
    fail_check "${label} not found: ${file}"
    return 1
  fi
  pass_check "${label} present: ${file}"
}

assert_json() {
  local file="$1"
  local expr="$2"
  local message="$3"
  if ! jq -e "${expr}" "${file}" >/dev/null; then
    fail_check "${message}"
    jq . "${file}" >&2 || true
  else
    pass_check "${message}"
  fi
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"
  local delay_s="${3:-1}"
  local i=0
  for (( i = 0; i < attempts; i++ )); do
    if curl -sSf "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay_s}"
  done
  return 1
}

pick_free_port() {
  PYTHONPYCACHEPREFIX="${TMPDIR_LOCAL}/pycache-port" python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
}

check_slot_contract() {
  require_file "${SLOT_FILE}" "AIMXS slot contract file" || return 0

  if ! rg -q 'type SlotResolver interface' "${SLOT_FILE}"; then
    fail_check "slot contract missing SlotResolver interface"
  fi
  if ! rg -q 'type SlotRegistry interface' "${SLOT_FILE}"; then
    fail_check "slot contract missing SlotRegistry interface"
  fi
  if ! rg -q 'type Registration struct' "${SLOT_FILE}"; then
    fail_check "slot contract missing Registration struct"
  fi
  if ! rg -q 'EndpointAuthMTLSAndBearerTokenRef' "${SLOT_FILE}"; then
    fail_check "slot contract missing MTLSAndBearerTokenSecret auth enum"
  fi
}

check_import_boundary() {
  local import_lines import_path allowed_refs disallowed_refs line
  allowed_refs=0
  disallowed_refs=0

  import_lines="$(rg -n '^[[:space:]]*"[^"]*aimxs[^"]*"[[:space:]]*$' "${REPO_ROOT}" --glob '*.go' || true)"
  if [[ -z "${import_lines}" ]]; then
    pass_check "no go import paths reference aimxs directly"
    return 0
  fi

  while IFS= read -r line; do
    [[ -n "${line}" ]] || continue
    import_path="$(printf '%s\n' "${line}" | sed -E 's/^[^:]+:[0-9]+:[[:space:]]*"([^"]+)".*/\1/')"
    if [[ -z "${import_path}" ]]; then
      continue
    fi
    if [[ "${import_path}" == "${ALLOWED_LOCAL_IMPORT}" ]]; then
      allowed_refs=$((allowed_refs + 1))
      continue
    fi
    disallowed_refs=$((disallowed_refs + 1))
    fail_check "disallowed aimxs import path '${import_path}' (${line})"
  done <<<"${import_lines}"

  if [[ "${disallowed_refs}" -eq 0 ]]; then
    pass_check "aimxs imports restricted to local slot boundary (${allowed_refs} allowed refs)"
  fi
}

check_module_boundary() {
  local module_files=()
  [[ -f "${REPO_ROOT}/go.mod" ]] && module_files+=("${REPO_ROOT}/go.mod")
  [[ -f "${REPO_ROOT}/go.sum" ]] && module_files+=("${REPO_ROOT}/go.sum")

  if [[ "${#module_files[@]}" -eq 0 ]]; then
    fail_check "go.mod/go.sum not found for module boundary check"
    return 0
  fi

  if rg -n 'aimxs' "${module_files[@]}" >/dev/null 2>&1; then
    fail_check "module files reference aimxs; AIMXS must stay out of the OSS dependency graph"
    return 0
  fi

  pass_check "module graph contains no direct aimxs references"
}

check_manifest_auth_and_https() {
  local url mode provider_id

  require_file "${AIMXS_MANIFEST}" "AIMXS provider example manifest" || return 0

  url="$(awk '/^[[:space:]]*url:[[:space:]]*/ {print $2; exit}' "${AIMXS_MANIFEST}")"
  mode="$(awk '/^[[:space:]]*mode:[[:space:]]*/ {print $2; exit}' "${AIMXS_MANIFEST}")"
  provider_id="$(awk '/^[[:space:]]*providerId:[[:space:]]*/ {print $2; exit}' "${AIMXS_MANIFEST}")"

  if [[ -z "${url}" || "${url}" != https://* ]]; then
    fail_check "AIMXS endpoint url must be HTTPS (found '${url:-<empty>}')"
  else
    pass_check "AIMXS endpoint url is HTTPS (${url})"
  fi

  case "${mode}" in
    MTLS|MTLSAndBearerTokenSecret)
      pass_check "AIMXS auth mode is secure (${mode})"
      ;;
    "")
      fail_check "AIMXS auth mode missing in example manifest"
      ;;
    *)
      fail_check "AIMXS auth mode must be MTLS or MTLSAndBearerTokenSecret (found ${mode})"
      ;;
  esac

  if [[ -z "${provider_id}" || "${provider_id}" != aimxs-* ]]; then
    fail_check "AIMXS providerId should be namespaced with 'aimxs-' (found '${provider_id:-<empty>}')"
  else
    pass_check "AIMXS providerId namespace check passed (${provider_id})"
  fi
}

check_boundary_doc() {
  require_file "${DOC_FILE}" "AIMXS boundary documentation" || return 0

  if ! rg -q 'AIMXS remains private and external to the OSS build graph' "${DOC_FILE}"; then
    fail_check "AIMXS boundary doc missing explicit private/external boundary statement"
  fi
  if ! rg -q 'default local install root is `~/.epydios/premium/aimxs/extracted`' "${DOC_FILE}"; then
    fail_check "AIMXS boundary doc missing official local premium install root"
  fi
  if ! rg -q 'EPYDIOS_AIMXS_EXTRACTED_ROOT' "${DOC_FILE}"; then
    fail_check "AIMXS boundary doc missing explicit extracted-root override"
  fi
  if ! rg -q 'outside the OSS repo tree by default' "${DOC_FILE}"; then
    fail_check "AIMXS boundary doc missing explicit outside-the-repo premium-install rule"
  fi
  if ! rg -q 'must never silently degrade to OSS' "${DOC_FILE}"; then
    fail_check "AIMXS boundary doc missing no-silent-fallback rule"
  fi
}

check_publication_doc() {
  require_file "${PUBLICATION_DOC}" "AIMXS private publication runbook" || return 0

  if ! rg -q '^# AIMXS Private SDK Publication' "${PUBLICATION_DOC}"; then
    fail_check "AIMXS publication runbook missing title"
  fi
  if ! rg -q 'verify-aimxs-boundary.sh' "${PUBLICATION_DOC}"; then
    fail_check "AIMXS publication runbook must require premium-path verification"
  fi
  if ! rg -q 'verify-m10-policy-grant-enforcement.sh' "${PUBLICATION_DOC}"; then
    fail_check "AIMXS publication runbook must require policy-grant enforcement proof"
  fi
  if ! rg -q 'verify-m10-entitlement-deny.sh' "${PUBLICATION_DOC}"; then
    fail_check "AIMXS publication runbook must require entitlement proof"
  fi
}

check_compatibility_policy() {
  require_file "${AIMXS_COMPAT_POLICY}" "AIMXS compatibility policy" || return 0

  if ! rg -q '^component:[[:space:]]*aimxs-decision-api' "${AIMXS_COMPAT_POLICY}"; then
    fail_check "AIMXS compatibility policy missing aimxs-decision-api component marker"
  fi
  if ! rg -q '/v1/decide' "${AIMXS_COMPAT_POLICY}"; then
    fail_check "AIMXS compatibility policy missing /v1/decide endpoint requirement"
  fi
  if ! rg -q '^grant_token_policy:' "${AIMXS_COMPAT_POLICY}"; then
    fail_check "AIMXS compatibility policy missing grant_token_policy section"
  fi
  if ! rg -q 'output\.aimxsGrantToken' "${AIMXS_COMPAT_POLICY}"; then
    fail_check "AIMXS compatibility policy missing output.aimxsGrantToken accepted path"
  fi
  if ! rg -q 'AUTHZ_REQUIRE_POLICY_GRANT' "${AIMXS_COMPAT_POLICY}"; then
    fail_check "AIMXS compatibility policy should reference AUTHZ_REQUIRE_POLICY_GRANT"
  fi
  if ! rg -q 'AUTHZ_REQUIRE_AIMXS_ENTITLEMENT' "${AIMXS_COMPAT_POLICY}"; then
    fail_check "AIMXS compatibility policy should reference AUTHZ_REQUIRE_AIMXS_ENTITLEMENT"
  fi
}

check_release_verifier_hooks() {
  require_file "${PRIVATE_RELEASE_VERIFIER}" "AIMXS private release verifier" || return 0
  require_file "${FULL_PACKAGING_VERIFIER}" "AIMXS full packaging verifier" || return 0

  if ! rg -q 'verify-aimxs-boundary.sh' "${PRIVATE_RELEASE_VERIFIER}"; then
    fail_check "private release verifier must invoke premium-path verification"
  fi
  if ! rg -q 'M10.3 gate' "${PRIVATE_RELEASE_VERIFIER}"; then
    fail_check "private release verifier must require policy-grant proof markers"
  fi
  if ! rg -q 'M10.6 gate' "${PRIVATE_RELEASE_VERIFIER}"; then
    fail_check "private release verifier must require entitlement proof markers"
  fi
}

build_fake_aimxs_artifact() {
  local extracted_root="$1"
  PYTHONPYCACHEPREFIX="${TMPDIR_LOCAL}/pycache-build" python3 - "${extracted_root}" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
addon_root = root / "CANONICAL_INPUTS" / "AIMXS_INTEGRATION_RUNTIME_ADDON_v1"
baseline_root = root / "CANONICAL_INPUTS" / "AIMX_BASELINE_v7" / "baseline_pack_v7"
addon_root.mkdir(parents=True, exist_ok=True)
baseline_root.mkdir(parents=True, exist_ok=True)

(baseline_root / "AIMX_OPERATIONAL_CORE_PROVIDER_INTERFACE_v1.py").write_text(
    "\n".join(
        [
            "from dataclasses import dataclass",
            "",
            "@dataclass",
            "class TransitionProposal:",
            "    proposal_id: str",
            "    state_id: str",
            "    requested_change: dict",
            "    reason: str",
            "    evidence_pointers: list",
            "",
        ]
    ),
    encoding="utf-8",
)

(addon_root / "AIMX_BAAK_GOVERNANCE_PROVIDER_v6.py").write_text(
    "\n".join(
        [
            "from dataclasses import dataclass",
            "",
            "@dataclass",
            "class Decision:",
            "    outcome: str",
            "    rationale: str",
            "    provider_meta: dict",
            "",
            "@dataclass",
            "class Evidence:",
            "    evidence_id: str",
            "    evidence_hash: str",
            "",
            "class BAAKGovernanceProvider:",
            "    def __init__(self, audit_sink=None):",
            "        self.audit_sink = audit_sink",
            "",
            "    def evaluate_transition(self, proposal, current_state):",
            "        policy = proposal.requested_change.get('policy_stratification', {})",
            "        if policy.get('required_grants') or str(policy.get('evidence_readiness', '')).upper() != 'READY':",
            "            outcome = 'DEFER'",
            "            rationale = 'Deferred pending AIMXS grant/evidence requirements.'",
            "        else:",
            "            outcome = 'ALLOW'",
            "            rationale = 'Allowed by AIMXS local full test provider.'",
            "        decision = Decision(",
            "            outcome=outcome,",
            "            rationale=rationale,",
            "            provider_meta={'state_continuity': {'continuity_enabled': True}}",
            "        )",
            "        evidence = Evidence(",
            "            evidence_id=f\"evidence-{proposal.proposal_id}\",",
            "            evidence_hash=f\"hash-{proposal.proposal_id}\"",
            "        )",
            "        return decision, evidence",
            "",
        ]
    ),
    encoding="utf-8",
)
PY
}

write_smoke_payloads() {
  local allow_payload="$1"
  local defer_payload="$2"
  cat > "${allow_payload}" <<'EOF'
{
  "meta": {
    "requestId": "allow-smoke-001",
    "tenantId": "demo-tenant",
    "projectId": "demo-project",
    "environment": "dev"
  },
  "subject": {
    "type": "user",
    "id": "demo.operator.local",
    "attributes": {
      "approvedForProd": false
    }
  },
  "action": {
    "type": "compliance.report.request",
    "class": "read",
    "verb": "request",
    "target": "compliance-review"
  },
  "resource": {
    "kind": "compliance-report",
    "class": "model_gateway",
    "namespace": "epydios-system",
    "name": "compliance-conflict-report",
    "id": "compliance-conflict-report"
  },
  "context": {
    "policy_stratification": {
      "policy_bucket_id": "desktop-demo-compliance-report",
      "action_class": "read",
      "boundary_class": "model_gateway",
      "risk_tier": "low",
      "required_grants": [],
      "evidence_readiness": "READY",
      "gates": {
        "core09.gates.default_off": true,
        "core09.gates.required_grants_enforced": false,
        "core09.gates.evidence_readiness_enforced": false,
        "core14.adapter_present.enforce_handshake": true
      }
    },
    "governed_action": {
      "contract_id": "epydios.governed-action.v1",
      "workflow_kind": "advisory_request",
      "request_label": "Compliance Report Request",
      "demo_profile": "compliance_report"
    }
  },
  "mode": "enforce",
  "dryRun": false
}
EOF

  cat > "${defer_payload}" <<'EOF'
{
  "meta": {
    "requestId": "defer-smoke-001",
    "tenantId": "demo-tenant",
    "projectId": "demo-project",
    "environment": "dev"
  },
  "subject": {
    "type": "user",
    "id": "demo.operator.local",
    "attributes": {
      "approvedForProd": false
    }
  },
  "action": {
    "type": "trade.execute",
    "class": "execute",
    "verb": "execute",
    "target": "paper-broker-order"
  },
  "resource": {
    "kind": "broker-order",
    "class": "external_actuator",
    "namespace": "epydios-system",
    "name": "paper-order-aapl",
    "id": "paper-order-aapl"
  },
  "context": {
    "policy_stratification": {
      "policy_bucket_id": "desktop-demo-finance-paper-trade",
      "action_class": "execute",
      "boundary_class": "external_actuator",
      "risk_tier": "high",
      "required_grants": ["grant.trading.supervisor"],
      "evidence_readiness": "PARTIAL",
      "gates": {
        "core09.gates.default_off": true,
        "core09.gates.required_grants_enforced": true,
        "core09.gates.evidence_readiness_enforced": true,
        "core14.adapter_present.enforce_handshake": true
      }
    },
    "governed_action": {
      "contract_id": "epydios.governed-action.v1",
      "workflow_kind": "external_action_request",
      "request_label": "Paper Trade Request: AAPL",
      "demo_profile": "finance_paper_trade"
    }
  },
  "mode": "enforce",
  "dryRun": false
}
EOF
}

check_self_contained_provider_startup() {
  local premium_root extracted_root provider_port provider_log
  local caps_json allow_payload defer_payload allow_json defer_json
  premium_root="${TMPDIR_LOCAL}/premium/aimxs"
  extracted_root="${premium_root}/extracted"
  provider_port="$(pick_free_port)"
  provider_log="${TMPDIR_LOCAL}/aimxs-provider.log"
  caps_json="${TMPDIR_LOCAL}/capabilities.json"
  allow_payload="${TMPDIR_LOCAL}/allow.json"
  defer_payload="${TMPDIR_LOCAL}/defer.json"
  allow_json="${TMPDIR_LOCAL}/allow-result.json"
  defer_json="${TMPDIR_LOCAL}/defer-result.json"

  build_fake_aimxs_artifact "${extracted_root}"
  write_smoke_payloads "${allow_payload}" "${defer_payload}"

  PYTHONPYCACHEPREFIX="${TMPDIR_LOCAL}/pycache" \
  EPYDIOS_AIMXS_INSTALL_ROOT="${premium_root}" \
    python3 "${AIMXS_PROVIDER_SCRIPT}" --host 127.0.0.1 --port "${provider_port}" > "${provider_log}" 2>&1 &
  PROVIDER_PID="$!"

  if ! wait_for_http "http://127.0.0.1:${provider_port}/healthz" 30 1; then
    fail_check "self-contained aimxs-full provider did not become ready"
    [[ -f "${provider_log}" ]] && cat "${provider_log}" >&2
    return 0
  fi

  curl -sSf "http://127.0.0.1:${provider_port}/v1alpha1/capabilities" > "${caps_json}"
  curl -sSf -H 'Content-Type: application/json' \
    -X POST --data-binary @"${allow_payload}" \
    "http://127.0.0.1:${provider_port}/v1alpha1/policy-provider/evaluate" > "${allow_json}"
  curl -sSf -H 'Content-Type: application/json' \
    -X POST --data-binary @"${defer_payload}" \
    "http://127.0.0.1:${provider_port}/v1alpha1/policy-provider/evaluate" > "${defer_json}"

  assert_json "${caps_json}" '.providerId == "aimxs-full"' "self-contained startup resolves aimxs-full provider"
  assert_json "${caps_json}" '.capabilities | index("policy.grant_tokens") != null' "self-contained startup advertises grant-token capability"
  assert_json "${caps_json}" '.capabilities | index("governance.handshake_validation") != null' "self-contained startup advertises handshake capability"
  assert_json "${allow_json}" '.decision == "ALLOW"' "self-contained startup preserves allow path"
  assert_json "${allow_json}" '.output.grantToken | startswith("aimxs-grant-")' "self-contained startup returns grant token on allow path"
  assert_json "${allow_json}" '.output.aimxs.providerId == "aimxs-full"' "self-contained startup does not silently use OSS on allow path"
  assert_json "${defer_json}" '.decision == "DEFER"' "self-contained startup preserves governed defer path"
  assert_json "${defer_json}" '.reasons[0].code == "AIMXS_LOCAL_FULL_GOVERNANCE"' "self-contained startup preserves AIMXS governance rationale"
  assert_json "${defer_json}" '.output.aimxs.providerId == "aimxs-full"' "self-contained startup does not silently use OSS on defer path"

  if grep -q 'oss-policy-opa' "${allow_json}" "${defer_json}" >/dev/null 2>&1; then
    fail_check "self-contained startup leaked OSS provider identity into AIMXS responses"
  else
    pass_check "self-contained startup shows no hidden OSS fallback"
  fi

  kill "${PROVIDER_PID}" >/dev/null 2>&1 || true
  wait "${PROVIDER_PID}" >/dev/null 2>&1 || true
  PROVIDER_PID=""
}

check_missing_artifact_failure() {
  local missing_root stderr_file stdout_file status
  missing_root="${TMPDIR_LOCAL}/missing-premium/aimxs"
  stdout_file="${TMPDIR_LOCAL}/missing-stdout.txt"
  stderr_file="${TMPDIR_LOCAL}/missing-stderr.txt"

  set +e
  PYTHONPYCACHEPREFIX="${TMPDIR_LOCAL}/pycache-missing" \
  EPYDIOS_AIMXS_INSTALL_ROOT="${missing_root}" \
    python3 "${AIMXS_PROVIDER_SCRIPT}" --host 127.0.0.1 --port 0 > "${stdout_file}" 2> "${stderr_file}"
  status=$?
  set -e

  if [[ "${status}" -ne 2 ]]; then
    fail_check "missing premium artifact should exit aimxs-full provider with status 2 (got ${status})"
  else
    pass_check "missing premium artifact exits aimxs-full provider with status 2"
  fi

  if ! grep -q 'Premium AIMXS artifact not installed' "${stderr_file}"; then
    fail_check "missing premium artifact should emit the actionable install error"
  else
    pass_check "missing premium artifact emits actionable install error"
  fi

  if ! grep -q 'EPYDIOS_AIMXS_EXTRACTED_ROOT' "${stderr_file}"; then
    fail_check "missing premium artifact error should mention EPYDIOS_AIMXS_EXTRACTED_ROOT override"
  else
    pass_check "missing premium artifact error mentions extracted-root override"
  fi

  if grep -q 'Traceback' "${stderr_file}"; then
    fail_check "missing premium artifact should not emit a Python traceback"
  else
    pass_check "missing premium artifact fails cleanly without traceback"
  fi
}

main() {
  require_cmd rg
  require_cmd awk
  require_cmd sed
  require_cmd jq
  require_cmd curl
  require_cmd python3

  TMPDIR_LOCAL="$(mktemp -d "/tmp/aimxs-boundary.XXXXXX")"

  check_slot_contract
  check_import_boundary
  check_module_boundary
  check_manifest_auth_and_https
  check_boundary_doc
  check_publication_doc
  check_compatibility_policy
  check_release_verifier_hooks
  check_self_contained_provider_startup
  check_missing_artifact_failure

  if [[ "${failures}" -gt 0 ]]; then
    echo "AIMXS premium-path verification failed with ${failures} issue(s)." >&2
    exit 1
  fi

  echo "AIMXS premium-path verification passed."
  echo "  slot_file=${SLOT_FILE}"
  echo "  doc_file=${DOC_FILE}"
  echo "  publication_doc=${PUBLICATION_DOC}"
  echo "  manifest=${AIMXS_MANIFEST}"
  echo "  compatibility_policy=${AIMXS_COMPAT_POLICY}"
  echo "  provider_script=${AIMXS_PROVIDER_SCRIPT}"
}

main "$@"
