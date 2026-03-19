from __future__ import annotations

import unittest

from epydios_client import (
    ClientIdentity,
    EpydiosClient,
    EpydiosClientError,
    EpydiosGatewayError,
    GovernedActionRequest,
)


class FakeTransport:
    def __init__(self, responses):
        self._responses = responses
        self.requests = []

    def request(self, method, url, headers, body):
        self.requests.append((method, url, dict(headers), body))
        key = (method, url)
        if key not in self._responses or not self._responses[key]:
            raise AssertionError(f"unexpected request: {key}")
        return self._responses[key].pop(0)


class EpydiosClientTests(unittest.TestCase):
    def test_submit_governed_action_uses_gateway_contract(self):
        transport = FakeTransport(
            {
                (
                    "POST",
                    "http://127.0.0.1:18765/v1/governed-actions",
                ): [
                    (
                        202,
                        b'{"gatewayRequestId":"gateway-123","runId":"run-123","state":"accepted","policyDecision":"ALLOW","approvalRequired":false,"statusUrl":"http://127.0.0.1:18765/v1/governed-actions/gateway-123","runUrl":"http://127.0.0.1:18765/v1/runs/run-123"}',
                    )
                ]
            }
        )
        client = EpydiosClient(token="local-token", transport=transport, client_id="sdk-client", client_name="SDK Client")
        result = client.submit_governed_action(
            GovernedActionRequest(
                tenant_id="tenant-demo",
                project_id="project-core",
                environment_id="dev",
                action_type="desktop.execute",
                target_type="terminal",
                target_ref="echo EPYDIOS_GATEWAY_SMOKE_TEST",
                input={"command": "echo EPYDIOS_GATEWAY_SMOKE_TEST"},
                client=ClientIdentity(id="python-test", name="Python Test"),
                reason="Run a harmless local gateway smoke test",
            )
        )

        self.assertEqual(result.gateway_request_id, "gateway-123")
        self.assertEqual(result.run_id, "run-123")
        self.assertEqual(result.state, "accepted")

        method, url, headers, body = transport.requests[0]
        self.assertEqual(method, "POST")
        self.assertEqual(url, "http://127.0.0.1:18765/v1/governed-actions")
        self.assertEqual(headers["Authorization"], "Bearer local-token")
        self.assertEqual(headers["X-Epydios-Client-Id"], "python-test")
        self.assertEqual(headers["X-Epydios-Client-Name"], "Python Test")
        self.assertIn(b'"tenantId": "tenant-demo"', body)

    def test_wait_for_run_polls_until_completed(self):
        transport = FakeTransport(
            {
                (
                    "GET",
                    "http://127.0.0.1:18765/v1/runs/run-123",
                ): [
                    (
                        200,
                        b'{"runId":"run-123","state":"running","status":"POLICY_EVALUATED","policyDecision":"ALLOW","approvalRequired":false,"run":{"runId":"run-123"}}',
                    ),
                    (
                        200,
                        b'{"runId":"run-123","state":"completed","status":"COMPLETED","policyDecision":"ALLOW","approvalRequired":false,"run":{"runId":"run-123"}}',
                    ),
                ]
            }
        )
        client = EpydiosClient(token="local-token", transport=transport)
        result = client.wait_for_run("run-123", timeout_seconds=1.0, poll_interval_seconds=0.0)
        self.assertEqual(result.state, "completed")
        self.assertEqual(result.status, "COMPLETED")
        self.assertEqual(len(transport.requests), 2)

    def test_gateway_error_is_normalized(self):
        transport = FakeTransport(
            {
                (
                    "GET",
                    "http://127.0.0.1:18765/v1/runs/run-404",
                ): [
                    (
                        404,
                        b'{"errorCode":"GATEWAY_REQUEST_NOT_FOUND","message":"gateway request not found","retryable":false,"details":{"gatewayRequestId":"gateway-404"}}',
                    )
                ]
            }
        )
        client = EpydiosClient(token="local-token", transport=transport)
        with self.assertRaises(EpydiosGatewayError) as ctx:
            client.get_run("run-404")
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.payload.error_code, "GATEWAY_REQUEST_NOT_FOUND")
        self.assertFalse(ctx.exception.payload.retryable)

    def test_missing_gateway_token_raises_clear_error(self):
        client = EpydiosClient(token=None, token_path="/tmp/does-not-exist", transport=FakeTransport({}))
        with self.assertRaises(EpydiosClientError):
            client.get_governed_action("gateway-123")


if __name__ == "__main__":
    unittest.main()
