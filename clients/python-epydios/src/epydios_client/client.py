from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import sys
import time
from typing import Any, Callable, Mapping, MutableMapping, Protocol
from urllib import error, request


JSONDict = dict[str, Any]


class GatewayTransport(Protocol):
    def request(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None,
    ) -> tuple[int, bytes]:
        ...


@dataclass
class ClientIdentity:
    id: str
    name: str
    version: str | None = None


@dataclass
class GovernedActionRequest:
    tenant_id: str
    project_id: str
    environment_id: str
    action_type: str
    target_type: str
    target_ref: str
    input: JSONDict
    client: ClientIdentity | None = None
    idempotency_key: str | None = None
    requested_execution_profile: str | None = None
    requested_authority_ref: str | None = None
    reason: str | None = None

    def to_payload(self, default_client: ClientIdentity) -> JSONDict:
        client = self.client or default_client
        payload: JSONDict = {
            "tenantId": self.tenant_id,
            "projectId": self.project_id,
            "environmentId": self.environment_id,
            "actionType": self.action_type,
            "targetType": self.target_type,
            "targetRef": self.target_ref,
            "input": self.input,
            "client": {
                "id": client.id,
                "name": client.name,
            },
        }
        if client.version:
            payload["client"]["version"] = client.version
        if self.idempotency_key:
            payload["idempotencyKey"] = self.idempotency_key
        if self.requested_execution_profile:
            payload["requestedExecutionProfile"] = self.requested_execution_profile
        if self.requested_authority_ref:
            payload["requestedAuthorityRef"] = self.requested_authority_ref
        if self.reason:
            payload["reason"] = self.reason
        return payload

    def validate(self) -> None:
        required = {
            "tenant_id": self.tenant_id,
            "project_id": self.project_id,
            "environment_id": self.environment_id,
            "action_type": self.action_type,
            "target_type": self.target_type,
            "target_ref": self.target_ref,
        }
        missing = [name for name, value in required.items() if not str(value).strip()]
        if missing:
            raise ValueError(f"missing required governed action fields: {', '.join(sorted(missing))}")
        if not isinstance(self.input, dict) or not self.input:
            raise ValueError("input must be a non-empty dict")


@dataclass
class GovernedActionResult:
    gateway_request_id: str
    run_id: str | None
    state: str
    policy_decision: str
    approval_required: bool
    receipt_ref: str | None
    status_url: str | None
    run_url: str | None

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "GovernedActionResult":
        return cls(
            gateway_request_id=str(payload.get("gatewayRequestId", "")).strip(),
            run_id=_optional_text(payload.get("runId")),
            state=str(payload.get("state", "")).strip(),
            policy_decision=_normalized_decision(payload.get("policyDecision")),
            approval_required=bool(payload.get("approvalRequired", False)),
            receipt_ref=_optional_text(payload.get("receiptRef")),
            status_url=_optional_text(payload.get("statusUrl")),
            run_url=_optional_text(payload.get("runUrl")),
        )


@dataclass
class RunStatusResult:
    gateway_request_id: str | None
    run_id: str
    state: str
    status: str
    policy_decision: str
    approval_required: bool
    receipt_ref: str | None
    run: JSONDict = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "RunStatusResult":
        return cls(
            gateway_request_id=_optional_text(payload.get("gatewayRequestId")),
            run_id=str(payload.get("runId", "")).strip(),
            state=str(payload.get("state", "")).strip(),
            status=str(payload.get("status", "")).strip(),
            policy_decision=_normalized_decision(payload.get("policyDecision")),
            approval_required=bool(payload.get("approvalRequired", False)),
            receipt_ref=_optional_text(payload.get("receiptRef")),
            run=dict(payload.get("run", {}) or {}),
        )


@dataclass
class APIErrorPayload:
    error_code: str
    message: str
    retryable: bool
    details: JSONDict


class EpydiosClientError(Exception):
    pass


class EpydiosGatewayError(EpydiosClientError):
    def __init__(self, status_code: int, payload: APIErrorPayload) -> None:
        super().__init__(f"{payload.error_code}: {payload.message}")
        self.status_code = status_code
        self.payload = payload


class StdlibGatewayTransport:
    def __init__(self, timeout_seconds: float = 30.0) -> None:
        self._timeout_seconds = timeout_seconds

    def request(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None,
    ) -> tuple[int, bytes]:
        req = request.Request(url=url, method=method, data=body, headers=dict(headers))
        try:
            with request.urlopen(req, timeout=self._timeout_seconds) as resp:
                return resp.status, resp.read()
        except error.HTTPError as exc:
            return exc.code, exc.read()
        except error.URLError as exc:
            raise EpydiosClientError(f"gateway request failed: {exc.reason}") from exc


class EpydiosClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        token: str | None = None,
        token_path: str | Path | None = None,
        client_id: str = "epydios-python-sdk",
        client_name: str = "Epydios Python SDK",
        client_version: str = "0.3.0",
        transport: GatewayTransport | None = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("EPYDIOS_GATEWAY_BASE_URL") or default_gateway_base_url()).rstrip("/")
        self.token = (token or os.getenv("EPYDIOS_GATEWAY_TOKEN") or "").strip()
        self.token_path = Path(
            token_path
            or os.getenv("EPYDIOS_GATEWAY_TOKEN_PATH")
            or default_gateway_token_path()
        )
        self.identity = ClientIdentity(id=client_id, name=client_name, version=client_version)
        self.transport = transport or StdlibGatewayTransport()

    @classmethod
    def from_environment(cls) -> "EpydiosClient":
        return cls()

    def health(self) -> JSONDict:
        return self._request_json("GET", "/healthz", require_auth=False)

    def ready(self) -> JSONDict:
        return self._request_json("GET", "/readyz", require_auth=False)

    def submit_governed_action(self, action: GovernedActionRequest) -> GovernedActionResult:
        action.validate()
        payload = action.to_payload(self.identity)
        response = self._request_json(
            "POST",
            "/v1/governed-actions",
            payload=payload,
            client_identity=action.client or self.identity,
        )
        return GovernedActionResult.from_payload(response)

    def get_governed_action(self, gateway_request_id: str) -> GovernedActionResult:
        gateway_request_id = str(gateway_request_id).strip()
        if not gateway_request_id:
            raise ValueError("gateway_request_id is required")
        response = self._request_json("GET", f"/v1/governed-actions/{gateway_request_id}")
        return GovernedActionResult.from_payload(response)

    def get_run(self, run_id: str) -> RunStatusResult:
        run_id = str(run_id).strip()
        if not run_id:
            raise ValueError("run_id is required")
        response = self._request_json("GET", f"/v1/runs/{run_id}")
        return RunStatusResult.from_payload(response)

    def wait_for_governed_action(
        self,
        gateway_request_id: str,
        *,
        timeout_seconds: float = 60.0,
        poll_interval_seconds: float = 1.0,
        terminal_states: tuple[str, ...] = ("completed", "failed", "rejected", "deferred"),
    ) -> GovernedActionResult:
        deadline = time.monotonic() + timeout_seconds
        while True:
            result = self.get_governed_action(gateway_request_id)
            if result.state in terminal_states:
                return result
            if time.monotonic() >= deadline:
                raise TimeoutError(f"governed action {gateway_request_id} did not reach a terminal state")
            time.sleep(poll_interval_seconds)

    def wait_for_run(
        self,
        run_id: str,
        *,
        timeout_seconds: float = 60.0,
        poll_interval_seconds: float = 1.0,
        terminal_states: tuple[str, ...] = ("completed", "failed", "rejected", "deferred"),
    ) -> RunStatusResult:
        deadline = time.monotonic() + timeout_seconds
        while True:
            result = self.get_run(run_id)
            if result.state in terminal_states:
                return result
            if time.monotonic() >= deadline:
                raise TimeoutError(f"run {run_id} did not reach a terminal state")
            time.sleep(poll_interval_seconds)

    def submit_and_wait(
        self,
        action: GovernedActionRequest,
        *,
        timeout_seconds: float = 60.0,
        poll_interval_seconds: float = 1.0,
    ) -> RunStatusResult:
        created = self.submit_governed_action(action)
        if not created.run_id:
            raise EpydiosClientError("gateway response did not include a run_id")
        return self.wait_for_run(
            created.run_id,
            timeout_seconds=timeout_seconds,
            poll_interval_seconds=poll_interval_seconds,
        )

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        payload: Mapping[str, Any] | None = None,
        require_auth: bool = True,
        client_identity: ClientIdentity | None = None,
    ) -> JSONDict:
        headers: MutableMapping[str, str] = {
            "Accept": "application/json",
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if require_auth:
            headers["Authorization"] = f"Bearer {self._resolve_token()}"
        if client_identity is not None:
            headers["X-Epydios-Client-Id"] = client_identity.id
            headers["X-Epydios-Client-Name"] = client_identity.name
            if client_identity.version:
                headers["X-Epydios-Client-Version"] = client_identity.version
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        status_code, response_body = self.transport.request(method, self.base_url + path, headers, body)
        try:
            decoded = _decode_json_bytes(response_body)
        except EpydiosClientError:
            if 200 <= status_code < 300:
                raise
            text = response_body.decode("utf-8", errors="replace").strip()
            raise EpydiosGatewayError(
                status_code,
                APIErrorPayload(
                    error_code=f"HTTP_{status_code}",
                    message=text or "gateway request failed",
                    retryable=status_code >= 500,
                    details={},
                ),
            ) from None
        if 200 <= status_code < 300:
            return decoded
        raise EpydiosGatewayError(status_code, _decode_api_error(decoded, status_code))

    def _resolve_token(self) -> str:
        if self.token:
            return self.token
        if self.token_path.is_file():
            token = self.token_path.read_text(encoding="utf-8").strip()
            if token:
                self.token = token
                return token
        raise EpydiosClientError(
            f"gateway token not found; set EPYDIOS_GATEWAY_TOKEN or install the launcher token at {self.token_path}"
        )


def default_gateway_base_url() -> str:
    return "http://127.0.0.1:18765"


def default_gateway_token_path() -> Path:
    if os.name == "nt":
        root = Path(os.getenv("APPDATA", Path.home() / "AppData" / "Roaming"))
        return root / "EpydiosAgentOpsDesktop" / "localhost-gateway" / "gateway-token"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "EpydiosAgentOpsDesktop" / "localhost-gateway" / "gateway-token"
    config_root = Path(os.getenv("XDG_CONFIG_HOME", Path.home() / ".config"))
    return config_root / "EpydiosAgentOpsDesktop" / "localhost-gateway" / "gateway-token"


def _decode_json_bytes(raw: bytes) -> JSONDict:
    text = raw.decode("utf-8").strip()
    if not text:
        return {}
    decoded = json.loads(text)
    if not isinstance(decoded, dict):
        raise EpydiosClientError("gateway response was not a JSON object")
    return decoded


def _decode_api_error(payload: Mapping[str, Any], status_code: int) -> APIErrorPayload:
    return APIErrorPayload(
        error_code=str(payload.get("errorCode", f"HTTP_{status_code}")).strip() or f"HTTP_{status_code}",
        message=str(payload.get("message", "gateway request failed")).strip() or "gateway request failed",
        retryable=bool(payload.get("retryable", status_code >= 500)),
        details=dict(payload.get("details", {}) or {}),
    )


def _normalized_decision(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text or "UNKNOWN"


def _optional_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None
