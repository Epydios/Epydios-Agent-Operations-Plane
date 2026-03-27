import importlib.util
import os
import pathlib
import tempfile
import unittest
from contextlib import contextmanager


PROVIDER_PATH = pathlib.Path(__file__).resolve().with_name("aimxs-full-provider.py")


def load_provider_module():
    spec = importlib.util.spec_from_file_location("aimxs_full_provider", str(PROVIDER_PATH))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AimxsFullProviderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_provider_module()

    def build_fake_extracted_root(self, root=None):
        root = pathlib.Path(root or tempfile.mkdtemp(prefix="aimxs-full-pack."))
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
        return root

    @contextmanager
    def environ(self, **updates):
        original = {}
        sentinel = object()
        for key, value in updates.items():
            original[key] = os.environ.get(key, sentinel)
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        try:
            yield
        finally:
            for key, value in original.items():
                if value is sentinel:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def runtime(self):
        root = pathlib.Path(tempfile.mkdtemp(prefix="aimxs-full-provider-test."))
        return self.mod.AimxsLocalFullRuntime(self.build_fake_extracted_root(), root)

    def test_resolve_aimxs_extracted_root_uses_official_premium_install_root(self):
        install_root = pathlib.Path(tempfile.mkdtemp(prefix="aimxs-install-root."))
        extracted_root = self.build_fake_extracted_root(install_root / "extracted")
        state_root = pathlib.Path(tempfile.mkdtemp(prefix="aimxs-state-root."))
        with self.environ(
            EPYDIOS_AIMXS_EXTRACTED_ROOT=None,
            EPYDIOS_AIMXS_INSTALL_ROOT=str(install_root),
            EPYDIOS_PREMIUM_ROOT=None,
            EPYDIOS_M21_STATE_ROOT=str(state_root),
        ):
            resolved = self.mod.resolve_aimxs_extracted_root()
        self.assertEqual(resolved, extracted_root.resolve())

    def test_default_premium_root_lives_under_home_not_repo_state(self):
        fake_home = pathlib.Path(tempfile.mkdtemp(prefix="aimxs-home-root."))
        state_root = pathlib.Path(tempfile.mkdtemp(prefix="aimxs-state-root."))
        with self.environ(
            HOME=str(fake_home),
            EPYDIOS_PREMIUM_ROOT=None,
            EPYDIOS_AIMXS_INSTALL_ROOT=None,
            EPYDIOS_AIMXS_EXTRACTED_ROOT=None,
            EPYDIOS_M21_STATE_ROOT=str(state_root),
        ):
            premium_root = self.mod.default_premium_root()
        self.assertEqual(premium_root, (fake_home / ".epydios" / "premium").resolve())
        self.assertNotEqual(premium_root, (state_root / "premium").resolve())

    def test_resolve_aimxs_extracted_root_fails_clearly_when_missing(self):
        missing_install_root = pathlib.Path(tempfile.mkdtemp(prefix="aimxs-missing-install."))
        with self.environ(
            EPYDIOS_AIMXS_EXTRACTED_ROOT=None,
            EPYDIOS_AIMXS_INSTALL_ROOT=str(missing_install_root),
            EPYDIOS_PREMIUM_ROOT=None,
            EPYDIOS_M21_STATE_ROOT=None,
        ):
            with self.assertRaises(FileNotFoundError) as err:
                self.mod.resolve_aimxs_extracted_root()
        self.assertIn("Premium AIMXS artifact not installed", str(err.exception))
        self.assertIn("EPYDIOS_AIMXS_EXTRACTED_ROOT", str(err.exception))

    def test_compliance_advisory_request_allows(self):
        rt = self.runtime()
        payload = {
            "meta": {
                "requestId": "allow-1",
                "tenantId": "12345",
                "projectId": "12345",
                "environment": "dev",
            },
            "subject": {
                "type": "user",
                "id": "demo.operator.local",
                "attributes": {"approvedForProd": False},
            },
            "action": {
                "type": "compliance.report.request",
                "class": "read",
                "verb": "request",
                "target": "compliance-review",
            },
            "resource": {
                "kind": "compliance-report",
                "class": "model_gateway",
                "namespace": "epydios-system",
                "name": "compliance-conflict-report",
                "id": "compliance-conflict-report",
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
                        "core09.gates.default_off": True,
                        "core09.gates.required_grants_enforced": False,
                        "core09.gates.evidence_readiness_enforced": False,
                        "core14.adapter_present.enforce_handshake": True,
                    },
                },
                "governed_action": {
                    "contract_id": "epydios.governed-action.v1",
                    "workflow_kind": "advisory_request",
                    "request_label": "Compliance Report Request",
                    "demo_profile": "compliance_report",
                },
            },
            "mode": "enforce",
            "dryRun": False,
        }
        result = rt.evaluate(payload)
        self.assertEqual(result["decision"], "ALLOW")

    def test_finance_request_defers_when_grants_and_evidence_block(self):
        rt = self.runtime()
        payload = {
            "meta": {
                "requestId": "defer-1",
                "tenantId": "12345",
                "projectId": "12345",
                "environment": "dev",
            },
            "subject": {
                "type": "user",
                "id": "demo.operator.local",
                "attributes": {"approvedForProd": False},
            },
            "action": {
                "type": "trade.execute",
                "class": "execute",
                "verb": "execute",
                "target": "paper-broker-order",
            },
            "resource": {
                "kind": "broker-order",
                "class": "external_actuator",
                "namespace": "epydios-system",
                "name": "paper-order-aapl",
                "id": "paper-order-aapl",
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
                        "core09.gates.default_off": True,
                        "core09.gates.required_grants_enforced": True,
                        "core09.gates.evidence_readiness_enforced": True,
                        "core14.adapter_present.enforce_handshake": True,
                    },
                },
                "governed_action": {
                    "contract_id": "epydios.governed-action.v1",
                    "workflow_kind": "external_action_request",
                    "request_label": "Paper Trade Request: AAPL",
                    "demo_profile": "finance_paper_trade",
                    "finance_order": {
                        "symbol": "AAPL",
                        "side": "buy",
                        "quantity": 25,
                        "account": "paper-main",
                    },
                },
            },
            "mode": "enforce",
            "dryRun": False,
        }
        result = rt.evaluate(payload)
        self.assertEqual(result["decision"], "DEFER")


if __name__ == "__main__":
    unittest.main()
