import importlib.util
import pathlib
import tempfile
import unittest


PROVIDER_PATH = pathlib.Path(
    "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/bin/aimxs-full-provider.py"
)


def load_provider_module():
    spec = importlib.util.spec_from_file_location("aimxs_full_provider", str(PROVIDER_PATH))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AimxsFullProviderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_provider_module()

    def runtime(self):
        root = pathlib.Path(tempfile.mkdtemp(prefix="aimxs-full-provider-test."))
        return self.mod.AimxsLocalFullRuntime(self.mod.resolve_aimxs_extracted_root(), root)

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
