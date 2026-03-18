#!/usr/bin/env python3
"""Local AIMXS full-mode provider shim for the desktop/runtime stack.

This wrapper exposes the public PolicyProvider contract locally while loading
the premium AIMXS artifact from an official install root or explicit override.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from copy import deepcopy
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple

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
    "governance.current_state",
    "audit.local_sink",
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


def normalize_mapping(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def module_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_state_root() -> Path:
    explicit = os.environ.get("EPYDIOS_M21_STATE_ROOT", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    return module_root() / ".epydios"


def default_premium_root() -> Path:
    explicit = os.environ.get("EPYDIOS_PREMIUM_ROOT", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    home_root = os.environ.get("HOME", "").strip()
    if home_root:
        return Path(home_root).expanduser().resolve() / ".epydios" / "premium"
    return default_state_root() / "premium"


def default_aimxs_install_root() -> Path:
    explicit = os.environ.get("EPYDIOS_AIMXS_INSTALL_ROOT", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    return default_premium_root() / "aimxs"


def resolve_local_aimxs_root() -> Path:
    explicit = os.environ.get("EPYDIOS_AIMXS_LOCAL_ROOT", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    cache_root = os.environ.get("EPYDIOS_M21_CACHE_ROOT", "").strip()
    if cache_root:
        return Path(cache_root).expanduser().resolve() / "local-runtime" / "aimxs-full"
    return default_state_root() / "m21-local-cache" / "local-runtime" / "aimxs-full"


class LocalJsonlAuditSink:
    def __init__(self, root: Path):
        self.root = root
        self.audit_root = root / "audit"
        self.events_path = self.audit_root / "events.jsonl"
        self.latest_path = self.audit_root / "last-event.json"
        self.audit_root.mkdir(parents=True, exist_ok=True)
        self.last_event: Dict[str, Any] = {}
        self.last_event_ref = ""

    def emit_audit_event(self, event: Dict[str, Any]) -> None:
        payload = deepcopy(event if isinstance(event, dict) else {})
        event_hash = canonical_hash(payload)
        event_id = first_non_empty(payload.get("event_id"), f"aimxs-audit-{event_hash[:20]}")
        event_ref = f"aimxs://local-full/audit/{event_id}"
        payload["event_id"] = event_id
        payload["event_ref"] = event_ref
        payload["provider_id"] = AIMXS_PROVIDER_ID
        line = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        with self.events_path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.write("\n")
        self.latest_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        self.last_event = payload
        self.last_event_ref = event_ref

    def flush(self) -> None:
        return None


class AimxsStateStore:
    def __init__(self, root: Path):
        self.root = root
        self.path = root / "state-store.json"
        self.root.mkdir(parents=True, exist_ok=True)

    def _read_all(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        return payload if isinstance(payload, dict) else {}

    def read_state(self, state_id: str) -> Dict[str, Any]:
        entries = self._read_all()
        value = entries.get(state_id)
        return value if isinstance(value, dict) else {}

    def write_state(self, state_id: str, payload: Dict[str, Any]) -> None:
        entries = self._read_all()
        entries[state_id] = payload
        self.path.write_text(json.dumps(entries, indent=2, sort_keys=True), encoding="utf-8")


class AimxsLocalFullRuntime:
    def __init__(self, extracted_root: Path, local_root: Path):
        self.extracted_root = extracted_root
        self.local_root = local_root
        self.local_root.mkdir(parents=True, exist_ok=True)
        self._audit_sink = LocalJsonlAuditSink(local_root)
        self._state_store = AimxsStateStore(local_root)
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
        self._governance_provider = BAAKGovernanceProvider(audit_sink=self._audit_sink)

    def provider_capabilities(self) -> Dict[str, Any]:
        return {
            "providerType": "PolicyProvider",
            "providerId": AIMXS_PROVIDER_ID,
            "contractVersion": AIMXS_CONTRACT_VERSION,
            "providerVersion": AIMXS_PROVIDER_VERSION,
            "capabilities": list(AIMXS_CAPABILITIES),
        }

    def health_payload(self) -> Dict[str, Any]:
        return {
            "status": "ok",
            "providerId": AIMXS_PROVIDER_ID,
            "providerVersion": AIMXS_PROVIDER_VERSION,
            "auditSink": {
                "active": True,
                "eventsPath": str(self._audit_sink.events_path),
                "lastEventRef": self._audit_sink.last_event_ref,
            },
            "stateStore": {
                "active": True,
                "path": str(self._state_store.path),
            },
        }

    def evaluate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        policy = normalize_policy_stratification(payload)
        contract = normalize_governed_action_context(payload)
        deny_response = self._evaluate_standard_deny(payload, policy, contract)
        if deny_response is not None:
            return deny_response
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
        gates = policy.get("gates") if isinstance(policy.get("gates"), dict) else {}
        if gates.get("core18.kernel_state.continuity") is True:
            return True
        return False

    def _current_state(self, payload: Dict[str, Any], proposal_id: str, state_id: str, policy: Dict[str, Any], contract: Dict[str, Any]) -> Dict[str, Any]:
        meta = normalize_mapping(payload.get("meta"))
        subject = normalize_mapping(payload.get("subject"))
        action = normalize_mapping(payload.get("action"))
        resource = normalize_mapping(payload.get("resource"))
        task = normalize_mapping(payload.get("task"))
        context = normalize_mapping(payload.get("context"))
        annotations = normalize_mapping(payload.get("annotations"))
        raw_governed_action = normalize_mapping(context.get("governed_action") or context.get("governedAction"))
        prior_state = self._state_store.read_state(state_id)
        prior_continuity = normalize_mapping(prior_state.get("state_continuity"))
        governed_action = deepcopy(contract)
        finance_order = normalize_mapping(raw_governed_action.get("finance_order") or raw_governed_action.get("financeOrder"))
        if finance_order:
            governed_action["finance_order"] = finance_order
        current_state = {
            "meta": {
                "tenantId": first_non_empty(meta.get("tenantId"), meta.get("tenant_id")),
                "projectId": first_non_empty(meta.get("projectId"), meta.get("project_id")),
                "environment": first_non_empty(meta.get("environment"), "dev"),
                "requestId": first_non_empty(meta.get("requestId"), meta.get("request_id"), proposal_id),
            },
            "subject": subject,
            "action": action,
            "resource": resource,
            "task": task,
            "annotations": annotations,
            "governed_action": governed_action,
            "policy_stratification": deepcopy(policy),
            "runtime_state": {
                "provider_id": AIMXS_PROVIDER_ID,
                "provider_version": AIMXS_PROVIDER_VERSION,
                "proposal_id": proposal_id,
                "state_id": state_id,
                "request_hash": canonical_hash(payload),
            },
            "state_continuity": {
                "prior_event_ref": first_non_empty(prior_continuity.get("audit_event_ref")),
                "prior_kernel_state_out_sha256": first_non_empty(prior_continuity.get("kernel_state_out_sha256")),
            },
        }
        prior_kernel_state = prior_state.get("baak_kernel_state")
        if isinstance(prior_kernel_state, str) and prior_kernel_state.strip():
            current_state["baak_kernel_state"] = prior_kernel_state.strip()
        elif isinstance(prior_kernel_state, dict) and prior_kernel_state:
            current_state["baak_kernel_state"] = deepcopy(prior_kernel_state)
        return current_state

    def _persist_state(self, state_id: str, current_state: Dict[str, Any], provider_meta: Dict[str, Any]) -> None:
        continuity = normalize_mapping(provider_meta.get("state_continuity"))
        last_event = self._audit_sink.last_event
        raw_kernel_state_out = last_event.get("kernel_state_out")
        payload = {
            "current_state_sha256": first_non_empty(
                normalize_mapping(provider_meta.get("current_state")).get("sha256"),
                canonical_hash(current_state),
            ),
            "audit_event_ref": self._audit_sink.last_event_ref,
            "state_continuity": {
                "continuity_enabled": continuity.get("continuity_enabled") is True,
                "kernel_state_in_sha256": first_non_empty(continuity.get("kernel_state_in_sha256")),
                "kernel_state_out_sha256": first_non_empty(continuity.get("kernel_state_out_sha256")),
                "audit_event_ref": self._audit_sink.last_event_ref,
            },
        }
        if isinstance(raw_kernel_state_out, str) and raw_kernel_state_out.strip():
            payload["baak_kernel_state"] = raw_kernel_state_out.strip()
        elif isinstance(raw_kernel_state_out, dict) and raw_kernel_state_out:
            payload["baak_kernel_state"] = deepcopy(raw_kernel_state_out)
        self._state_store.write_state(state_id, payload)

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
        current_state = self._current_state(payload, proposal_id, state_id, requested_change["policy_stratification"], contract)
        proposal = self._transition_proposal(
            proposal_id=proposal_id,
            state_id=state_id,
            requested_change=requested_change,
            reason="AIMXS local full governance evaluation",
            evidence_pointers=[],
        )
        decision, evidence = self._governance_provider.evaluate_transition(proposal, current_state)
        decision_payload = asdict(decision)
        evidence_payload = asdict(evidence)
        provider_meta = normalize_mapping(decision_payload.get("provider_meta"))
        provider_meta["providerId"] = AIMXS_PROVIDER_ID
        provider_meta["providerVersion"] = AIMXS_PROVIDER_VERSION
        provider_meta["decision_path"] = "governance_provider"
        provider_meta["request_contract"] = contract
        provider_meta["audit_sink"] = {
            "active": True,
            "event_ref": self._audit_sink.last_event_ref,
            "events_path": str(self._audit_sink.events_path),
        }
        provider_meta["current_state"] = {
            **normalize_mapping(provider_meta.get("current_state")),
            "present": bool(current_state),
            "sha256": canonical_hash(current_state),
            "keys": sorted(current_state.keys()),
        }
        decision_payload["provider_meta"] = provider_meta
        self._persist_state(state_id, current_state, provider_meta)
        output: Dict[str, Any] = {
            "aimxs": {
                "providerId": AIMXS_PROVIDER_ID,
                "providerVersion": AIMXS_PROVIDER_VERSION,
                "mode": "aimxs-full",
                "providerMeta": provider_meta,
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

    def _standard_deny_reasons(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        meta = normalize_mapping(payload.get("meta"))
        subject = normalize_mapping(payload.get("subject"))
        subject_attrs = normalize_mapping(subject.get("attributes"))
        action = normalize_mapping(payload.get("action"))
        environment = first_non_empty(meta.get("environment"), "dev").lower()
        mode = first_non_empty(payload.get("mode"), "enforce").lower()
        subject_type = first_non_empty(subject.get("type")).lower()
        action_verb = first_non_empty(action.get("verb"), action.get("type")).lower()

        reasons: List[Dict[str, Any]] = []
        if action_verb == "delete":
            reasons.append(
                build_reason(
                    "DELETE_DENIED",
                    "delete verb is denied by AIMXS local full policy."
                )
            )
        if environment == "prod" and mode != "audit" and subject_type == "user" and not bool(subject_attrs.get("approvedForProd")):
            reasons.append(
                build_reason(
                    "PROD_APPROVAL_REQUIRED",
                    "user subject requires approvedForProd=true for prod enforce mode."
                )
            )
        return reasons

    def _evaluate_standard_deny(self, payload: Dict[str, Any], policy: Dict[str, Any], contract: Dict[str, Any]) -> Dict[str, Any] | None:
        reasons = self._standard_deny_reasons(payload)
        if not reasons:
            return None
        proposal_id, state_id = self._request_ids(payload)
        current_state = self._current_state(payload, proposal_id, state_id, policy, contract)
        evidence_hash = canonical_hash(
            {
                "proposalId": proposal_id,
                "stateId": state_id,
                "policy": policy,
                "reasons": reasons,
                "payload": payload,
            }
        )
        provider_meta = {
            "provider": "AIMXS_LOCAL_FULL",
            "providerId": AIMXS_PROVIDER_ID,
            "providerVersion": AIMXS_PROVIDER_VERSION,
            "baak_engaged": True,
            "decision_path": "local_deny",
            "request_contract": contract,
            "audit_sink": {
                "active": True,
                "event_ref": "",
                "events_path": str(self._audit_sink.events_path),
            },
            "current_state": {
                "present": bool(current_state),
                "sha256": canonical_hash(current_state),
                "keys": sorted(current_state.keys()),
            },
            "state_continuity": {
                "continuity_enabled": False,
                "kernel_state_in_sha256": "",
                "kernel_state_out_sha256": "",
                "kernel_state_out_present": False,
            },
            "policy_stratification": {
                "boundary_class": policy["boundary_class"],
                "required_grants": list(policy["required_grants"]),
                "evidence_readiness": policy["evidence_readiness"],
                "action_class": policy["action_class"],
                "risk_tier": policy["risk_tier"],
                "policy_bucket_id": policy["policy_bucket_id"],
            },
        }
        evidence = {
            "evidence_id": f"EVIDENCE_{proposal_id}",
            "proposal_id": proposal_id,
            "decision_id": f"DECISION_{proposal_id}",
            "evidence_hash": evidence_hash,
            "pointers": [
                {
                    "ref": "aimxs://local-full/request",
                    "hash": evidence_hash,
                    "preview": {
                        "proposalId": proposal_id,
                        "stateId": state_id,
                        "reasonCodes": [first_non_empty(item.get("code")) for item in reasons],
                    },
                }
            ],
            "summary": "AIMXS local full deterministic deny envelope.",
        }
        self._audit_sink.emit_audit_event(
            {
                "event_type": "aimxs_local_full_deny",
                "proposal_id": proposal_id,
                "state_id": state_id,
                "decision_id": f"DECISION_{proposal_id}",
                "outcome": "DENY",
                "reason_codes": [first_non_empty(item.get("code")) for item in reasons],
                "policy_stratification": provider_meta["policy_stratification"],
                "current_state_hash": provider_meta["current_state"]["sha256"],
                "current_state_keys": provider_meta["current_state"]["keys"],
            }
        )
        provider_meta["audit_sink"]["event_ref"] = self._audit_sink.last_event_ref
        self._persist_state(state_id, current_state, provider_meta)
        return {
            "decision": "DENY",
            "reasons": reasons,
            "policyBundle": {
                "policyId": "AIMXS_LOCAL_FULL_POLICY",
                "policyVersion": AIMXS_PROVIDER_VERSION,
                "checksum": evidence_hash,
            },
            "evidenceRefs": [evidence["evidence_id"], f"sha256:{evidence_hash}"],
            "output": {
                "aimxs": {
                    "providerId": AIMXS_PROVIDER_ID,
                    "providerVersion": AIMXS_PROVIDER_VERSION,
                    "mode": "aimxs-full",
                    "providerMeta": provider_meta,
                    "requestContract": contract,
                    "policyStratification": provider_meta["policy_stratification"],
                    "evidence": evidence,
                }
            },
        }

    def _evaluate_allow_path(self, payload: Dict[str, Any], policy: Dict[str, Any], contract: Dict[str, Any]) -> Dict[str, Any]:
        proposal_id, state_id = self._request_ids(payload)
        current_state = self._current_state(payload, proposal_id, state_id, policy, contract)
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
            "audit_sink": {
                "active": True,
                "event_ref": "",
                "events_path": str(self._audit_sink.events_path),
            },
            "current_state": {
                "present": bool(current_state),
                "sha256": canonical_hash(current_state),
                "keys": sorted(current_state.keys()),
            },
            "state_continuity": {
                "continuity_enabled": bool(policy.get("gates", {}).get("core18.kernel_state.continuity") is True),
                "kernel_state_in_sha256": "",
                "kernel_state_out_sha256": "",
                "kernel_state_out_present": False,
            },
            "policy_stratification": {
                "boundary_class": policy["boundary_class"],
                "required_grants": list(policy["required_grants"]),
                "evidence_readiness": policy["evidence_readiness"],
                "action_class": policy["action_class"],
                "risk_tier": policy["risk_tier"],
                "policy_bucket_id": policy["policy_bucket_id"],
            },
        }
        self._audit_sink.emit_audit_event(
            {
                "event_type": "aimxs_local_full_allow",
                "proposal_id": proposal_id,
                "state_id": state_id,
                "decision_id": f"DECISION_{proposal_id}",
                "outcome": "ALLOW",
                "policy_stratification": provider_meta["policy_stratification"],
                "current_state_hash": provider_meta["current_state"]["sha256"],
                "current_state_keys": provider_meta["current_state"]["keys"],
                "continuity_enabled": provider_meta["state_continuity"]["continuity_enabled"],
            }
        )
        provider_meta["audit_sink"]["event_ref"] = self._audit_sink.last_event_ref
        self._persist_state(state_id, current_state, provider_meta)
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
    else:
        candidate = default_aimxs_install_root() / "extracted"
    if not candidate.exists():
        default_root = default_aimxs_install_root() / "extracted"
        raise FileNotFoundError(
            "Premium AIMXS artifact not installed for aimxs-full mode. "
            f"Expected extracted pack root at: {candidate}. "
            f"Install the official premium AIMXS artifact under {default_root} "
            "or set EPYDIOS_AIMXS_EXTRACTED_ROOT to the extracted pack root."
        )
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
    try:
        extracted_root = resolve_aimxs_extracted_root()
        local_root = resolve_local_aimxs_root()
        runtime = AimxsLocalFullRuntime(extracted_root, local_root)
    except FileNotFoundError as error:
        print(str(error), file=sys.stderr)
        return 2

    class Handler(AimxsRequestHandler):
        pass

    Handler.runtime = runtime
    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
