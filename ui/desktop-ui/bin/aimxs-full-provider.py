#!/usr/bin/env python3
"""Local AIMXS full-mode provider shim for the desktop/runtime stack.

This wrapper keeps private AIMXS logic outside the OSS repo while exposing the
public PolicyProvider contract locally for desktop/runtime testing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Tuple

AIMXS_PROVIDER_ID = "aimxs-full"
AIMXS_PROVIDER_VERSION = "local-v74"
AIMXS_CONTRACT_VERSION = "v1alpha1"
AIMXS_GOVERNED_ACTION_CONTRACT_ID = "epydios.governed-action.v1"
AIMXS_CAPABILITIES = [
    "policy.evaluate",
    "policy.validate_bundle",
    "governance.handshake_validation",
    "evidence.policy_decision_refs",
    "policy.defer",
    "policy.grant_tokens",
]


def first_non_empty(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def normalize_string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    items: List[str] = []
    for item in value:
        text = str(item or "").strip()
        if text:
            items.append(text)
    return items


def canonical_hash(payload: Any) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(body).hexdigest()


def build_reason(code: str, message: str, details: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return payload


def normalize_policy_stratification(payload: Dict[str, Any]) -> Dict[str, Any]:
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
    action = payload.get("action") if isinstance(payload.get("action"), dict) else {}
    resource = payload.get("resource") if isinstance(payload.get("resource"), dict) else {}
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    raw_policy = (
        context.get("policy_stratification")
        or context.get("policyStratification")
        or action.get("policy_stratification")
        or action.get("policyStratification")
        or resource.get("policy_stratification")
        or resource.get("policyStratification")
        or meta.get("policy_stratification")
        or meta.get("policyStratification")
    )
    policy = raw_policy if isinstance(raw_policy, dict) else {}
    return {
        "boundary_class": first_non_empty(
            policy.get("boundary_class"),
            policy.get("boundaryClass"),
            context.get("boundary_class"),
            context.get("boundaryClass"),
            resource.get("boundary_class"),
            resource.get("boundaryClass"),
            resource.get("class"),
            "external_actuator",
        ),
        "required_grants": normalize_string_list(
            policy.get("required_grants")
            or policy.get("requiredGrants")
            or context.get("required_grants")
            or context.get("requiredGrants")
        ),
        "evidence_readiness": first_non_empty(
            policy.get("evidence_readiness"),
            policy.get("evidenceReadiness"),
            context.get("evidence_readiness"),
            context.get("evidenceReadiness"),
            "READY",
        ).upper(),
        "action_class": first_non_empty(
            policy.get("action_class"),
            policy.get("actionClass"),
            context.get("action_class"),
            context.get("actionClass"),
            action.get("class"),
            action.get("type"),
            "execute",
        ),
        "risk_tier": first_non_empty(
            policy.get("risk_tier"),
            policy.get("riskTier"),
            context.get("risk_tier"),
            context.get("riskTier"),
            "moderate",
        ),
        "policy_bucket_id": first_non_empty(
            policy.get("policy_bucket_id"),
            policy.get("policyBucketId"),
            context.get("policy_bucket_id"),
            context.get("policyBucketId"),
            profile.get("id"),
            profile.get("name"),
            "aimxs-full-local",
        ),
        "gates": policy.get("gates") if isinstance(policy.get("gates"), dict) else {},
    }


def normalize_governed_action_context(payload: Dict[str, Any]) -> Dict[str, Any]:
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    raw_contract = (
        context.get("governed_action")
        or context.get("governedAction")
        or meta.get("governed_action")
        or meta.get("governedAction")
    )
    contract = raw_contract if isinstance(raw_contract, dict) else {}
    return {
        "contract_id": first_non_empty(
            contract.get("contract_id"),
            contract.get("contractId"),
            AIMXS_GOVERNED_ACTION_CONTRACT_ID,
        ),
        "workflow_kind": first_non_empty(
            contract.get("workflow_kind"),
            contract.get("workflowKind"),
            "external_action_request",
        ),
        "request_label": first_non_empty(
            contract.get("request_label"),
            contract.get("requestLabel"),
            "Governed Action Request",
        ),
        "demo_profile": first_non_empty(
            contract.get("demo_profile"),
            contract.get("demoProfile"),
        ),
        "origin_surface": first_non_empty(
            contract.get("origin_surface"),
            contract.get("originSurface"),
        ),
    }


class AimxsLocalFullRuntime:
    def __init__(self, extracted_root: Path):
        self.extracted_root = extracted_root
        addon_root = (
            extracted_root
            / "CANONICAL_INPUTS"
            / "AIMXS_INTEGRATION_RUNTIME_ADDON_v1"
        )
        baseline_root = (
            extracted_root
            / "CANONICAL_INPUTS"
            / "AIMX_BASELINE_v7"
            / "baseline_pack_v7"
        )
        for candidate in (addon_root, baseline_root):
            sys.path.insert(0, str(candidate))

        from AIMX_BAAK_GOVERNANCE_PROVIDER_v6 import BAAKGovernanceProvider
        from AIMX_OPERATIONAL_CORE_PROVIDER_INTERFACE_v1 import TransitionProposal

        self._transition_proposal = TransitionProposal
        self._governance_provider = BAAKGovernanceProvider()

    def provider_capabilities(self) -> Dict[str, Any]:
        return {
            "providerType": "PolicyProvider",
            "providerId": AIMXS_PROVIDER_ID,
            "contractVersion": AIMXS_CONTRACT_VERSION,
            "providerVersion": AIMXS_PROVIDER_VERSION,
            "capabilities": list(AIMXS_CAPABILITIES),
        }

    def health_payload(self) -> Dict[str, Any]:
        return {"status": "ok", "providerId": AIMXS_PROVIDER_ID, "providerVersion": AIMXS_PROVIDER_VERSION}

    def evaluate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        policy = normalize_policy_stratification(payload)
        contract = normalize_governed_action_context(payload)
        if self._should_use_governance_path(policy):
            return self._evaluate_with_governance_provider(payload, policy, contract)
        return self._evaluate_allow_path(payload, policy, contract)

    def validate_bundle(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        bundle = payload.get("bundle") if isinstance(payload.get("bundle"), dict) else {}
        discovered = list(AIMXS_CAPABILITIES)
        errors: List[Dict[str, Any]] = []
        warnings: List[Dict[str, Any]] = []
        if not first_non_empty(bundle.get("policyId"), bundle.get("policyVersion"), bundle.get("checksum")):
            warnings.append(build_reason("AIMXS_BUNDLE_METADATA_MINIMAL", "Bundle metadata is minimal; local AIMXS full accepted it for test mode."))
        return {
            "valid": True,
            "errors": errors,
            "warnings": warnings,
            "discoveredCapabilities": discovered,
        }

    def _request_ids(self, payload: Dict[str, Any]) -> Tuple[str, str]:
        meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
        context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
        action = payload.get("action") if isinstance(payload.get("action"), dict) else {}
        seed = canonical_hash(payload)
        proposal_id = first_non_empty(
            meta.get("requestId"),
            meta.get("requestID"),
            action.get("id"),
            f"P_{seed[:16]}",
        )
        state_id = first_non_empty(
            context.get("stateId"),
            context.get("stateID"),
            context.get("threadId"),
            context.get("threadID"),
            f"S_{seed[16:32]}",
        )
        return proposal_id, state_id

    def _should_use_governance_path(self, policy: Dict[str, Any]) -> bool:
        if normalize_string_list(policy.get("required_grants")):
            return True
        if str(policy.get("evidence_readiness") or "READY").upper() != "READY":
            return True
        if isinstance(policy.get("gates"), dict) and policy["gates"]:
            return True
        return False

    def _evaluate_with_governance_provider(self, payload: Dict[str, Any], policy: Dict[str, Any], contract: Dict[str, Any]) -> Dict[str, Any]:
        proposal_id, state_id = self._request_ids(payload)
        requested_change = {
            "policy_stratification": {
                "boundary_class": policy["boundary_class"],
                "required_grants": list(policy["required_grants"]),
                "evidence_readiness": policy["evidence_readiness"],
                "action_class": policy["action_class"],
                "risk_tier": policy["risk_tier"],
                "policy_bucket_id": policy["policy_bucket_id"],
                "gates": policy["gates"],
            }
        }
        proposal = self._transition_proposal(
            proposal_id=proposal_id,
            state_id=state_id,
            requested_change=requested_change,
            reason="AIMXS local full governance evaluation",
            evidence_pointers=[],
        )
        decision, evidence = self._governance_provider.evaluate_transition(proposal, {})
        decision_payload = asdict(decision)
        evidence_payload = asdict(evidence)
        output: Dict[str, Any] = {
            "aimxs": {
                "providerId": AIMXS_PROVIDER_ID,
                "providerVersion": AIMXS_PROVIDER_VERSION,
                "mode": "aimxs-full",
                "providerMeta": decision_payload.get("provider_meta") or {},
                "requestContract": contract,
                "policyStratification": requested_change["policy_stratification"],
                "evidence": evidence_payload,
            }
        }
        if decision.outcome != "DENY":
            output["grantToken"] = f"aimxs-grant-{evidence.evidence_hash[:24]}"
        return {
            "decision": decision.outcome,
            "reasons": [
                build_reason(
                    "AIMXS_LOCAL_FULL_GOVERNANCE",
                    decision.rationale,
                    {"proposalId": proposal_id, "stateId": state_id},
                )
            ],
            "obligations": [
                {
                    "type": "aimxs.policy_stratification",
                    "config": {
                        "boundaryClass": requested_change["policy_stratification"]["boundary_class"],
                        "evidenceReadiness": requested_change["policy_stratification"]["evidence_readiness"],
                        "requiredGrants": requested_change["policy_stratification"]["required_grants"],
                    },
                }
            ],
            "policyBundle": {
                "policyId": "AIMXS_LOCAL_FULL_POLICY",
                "policyVersion": AIMXS_PROVIDER_VERSION,
                "checksum": evidence.evidence_hash,
            },
            "evidenceRefs": [evidence.evidence_id, f"sha256:{evidence.evidence_hash}"],
            "output": output,
        }

    def _evaluate_allow_path(self, payload: Dict[str, Any], policy: Dict[str, Any], contract: Dict[str, Any]) -> Dict[str, Any]:
        proposal_id, state_id = self._request_ids(payload)
        request_hash = canonical_hash({"proposalId": proposal_id, "stateId": state_id, "payload": payload, "policy": policy})
        evidence = {
            "evidence_id": f"EVIDENCE_{proposal_id}",
            "proposal_id": proposal_id,
            "decision_id": f"DECISION_{proposal_id}",
            "evidence_hash": request_hash,
            "pointers": [
                {
                    "ref": "aimxs://local-full/request",
                    "hash": request_hash,
                    "preview": {
                        "proposalId": proposal_id,
                        "stateId": state_id,
                        "actionClass": policy["action_class"],
                        "riskTier": policy["risk_tier"],
                    },
                }
            ],
            "summary": "AIMXS local full deterministic allow envelope.",
        }
        provider_meta = {
            "provider": "AIMXS_LOCAL_FULL",
            "providerId": AIMXS_PROVIDER_ID,
            "providerVersion": AIMXS_PROVIDER_VERSION,
            "baak_engaged": True,
            "decision_path": "local_allow",
            "request_contract": contract,
            "policy_stratification": {
                "boundary_class": policy["boundary_class"],
                "required_grants": list(policy["required_grants"]),
                "evidence_readiness": policy["evidence_readiness"],
                "action_class": policy["action_class"],
                "risk_tier": policy["risk_tier"],
                "policy_bucket_id": policy["policy_bucket_id"],
            },
        }
        return {
            "decision": "ALLOW",
            "reasons": [
                build_reason(
                    "AIMXS_LOCAL_FULL_ALLOW",
                    "AIMXS local full accepted the request on the deterministic allow path.",
                    {"proposalId": proposal_id, "stateId": state_id},
                )
            ],
            "obligations": [
                {
                    "type": "aimxs.audit.envelope",
                    "config": {"evidenceHash": request_hash, "providerId": AIMXS_PROVIDER_ID},
                }
            ],
            "policyBundle": {
                "policyId": "AIMXS_LOCAL_FULL_POLICY",
                "policyVersion": AIMXS_PROVIDER_VERSION,
                "checksum": request_hash,
            },
            "evidenceRefs": [evidence["evidence_id"], f"sha256:{request_hash}"],
            "output": {
                "grantToken": f"aimxs-grant-{request_hash[:24]}",
                "aimxs": {
                    "providerId": AIMXS_PROVIDER_ID,
                    "providerVersion": AIMXS_PROVIDER_VERSION,
                    "mode": "aimxs-full",
                    "providerMeta": provider_meta,
                    "requestContract": contract,
                    "policyStratification": provider_meta["policy_stratification"],
                    "evidence": evidence,
                },
            },
        }


def resolve_aimxs_extracted_root() -> Path:
    explicit = os.environ.get("EPYDIOS_AIMXS_EXTRACTED_ROOT", "").strip()
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"AIMXS extracted root does not exist: {candidate}")
    repo_root = Path(__file__).resolve().parents[3]
    workspace_root = repo_root.parent
    candidate = workspace_root / "AIMXS" / "AIMXS_CORE_PACK_v74" / "EXTRACTED"
    if not candidate.exists():
        raise FileNotFoundError(f"AIMXS extracted root does not exist: {candidate}")
    return candidate


class AimxsRequestHandler(BaseHTTPRequestHandler):
    runtime: AimxsLocalFullRuntime

    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        payload = json.loads(raw.decode("utf-8"))
        return payload if isinstance(payload, dict) else {}

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._send_json(200, self.runtime.health_payload())
            return
        if self.path == "/v1alpha1/capabilities":
            self._send_json(200, self.runtime.provider_capabilities())
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        try:
            if self.path == "/v1alpha1/policy-provider/evaluate":
                payload = self._read_json()
                self._send_json(200, self.runtime.evaluate(payload))
                return
            if self.path == "/v1alpha1/policy-provider/validate-bundle":
                payload = self._read_json()
                self._send_json(200, self.runtime.validate_bundle(payload))
                return
            self._send_json(404, {"error": "not found"})
        except Exception as error:  # pragma: no cover - exercised from launcher smoke
            self._send_json(500, {"error": str(error)})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        message = "%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args)
        sys.stderr.write(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local AIMXS full provider shim.")
    parser.add_argument("--host", default=os.environ.get("AIMXS_LOCAL_FULL_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("AIMXS_LOCAL_FULL_PORT", "4271")))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    extracted_root = resolve_aimxs_extracted_root()
    runtime = AimxsLocalFullRuntime(extracted_root)

    class Handler(AimxsRequestHandler):
        pass

    Handler.runtime = runtime
    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
