#!/usr/bin/env python3
"""Thin public provider-route loader/proxy kept at a legacy path.

The OSS repo does not ship separately delivered premium provider logic. This
process only discovers a separately delivered provider endpoint and forwards
the public provider-boundary requests to it.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Tuple

PUBLIC_PROVIDER_ID = "premium-provider-local"
PUBLIC_PROVIDER_VERSION = "public-loader"
PUBLIC_CONTRACT_VERSION = "v1alpha1"
ENDPOINT_MANIFEST_CANDIDATES = (
    "provider-endpoint.json",
    "runtime/provider-endpoint.json",
    "config/provider-endpoint.json",
)


def module_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_state_root() -> Path:
    explicit = os.environ.get("EPYDIOS_M21_STATE_ROOT", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    return module_root() / ".epydios"


def read_env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def default_premium_root() -> Path:
    explicit = read_env("EPYDIOS_PREMIUM_ROOT")
    if explicit:
        return Path(explicit).expanduser().resolve()
    home_root = os.environ.get("HOME", "").strip()
    if home_root:
        return Path(home_root).expanduser().resolve() / ".epydios" / "premium"
    return default_state_root() / "premium"


def default_provider_install_root() -> Path:
    explicit = read_env("EPYDIOS_PREMIUM_PROVIDER_INSTALL_ROOT", "EPYDIOS_AIMXS_INSTALL_ROOT")
    if explicit:
        return Path(explicit).expanduser().resolve()
    return default_premium_root() / "provider-route"


def resolve_provider_payload_root() -> Path:
    explicit = read_env("EPYDIOS_PREMIUM_PROVIDER_EXTRACTED_ROOT", "EPYDIOS_AIMXS_EXTRACTED_ROOT")
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
    else:
        candidate = default_provider_install_root() / "extracted"
    if not candidate.exists():
        default_root = default_provider_install_root() / "extracted"
        raise FileNotFoundError(
            "Separately delivered provider artifact not installed for local-provider mode. "
            f"Expected extracted pack root at: {candidate}. "
            f"Install the official provider artifact under {default_root} "
            "or set EPYDIOS_PREMIUM_PROVIDER_EXTRACTED_ROOT to the extracted pack root."
        )
    return candidate


@dataclass
class EndpointConfig:
    base_url: str
    auth_token: str
    timeout_seconds: float
    source: str


def _normalized_timeout_ms(raw: Any) -> float:
    text = str(raw or "").strip()
    if not text:
        return 10.0
    try:
        value = int(text)
    except ValueError:
        return 10.0
    return max(value, 1000) / 1000.0


def _manifest_config(manifest_path: Path) -> EndpointConfig:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Invalid endpoint manifest at {manifest_path}")
    base_url = str(payload.get("baseUrl") or payload.get("endpointBaseUrl") or "").strip()
    if not base_url:
        raise ValueError(f"Endpoint manifest missing baseUrl: {manifest_path}")
    return EndpointConfig(
        base_url=base_url.rstrip("/"),
        auth_token=str(payload.get("authToken") or payload.get("bearerToken") or "").strip(),
        timeout_seconds=_normalized_timeout_ms(payload.get("timeoutMs")),
        source=str(manifest_path),
    )


def load_endpoint_config() -> EndpointConfig:
    base_url = read_env("EPYDIOS_PREMIUM_PROVIDER_REMOTE_BASE_URL", "EPYDIOS_AIMXS_REMOTE_BASE_URL")
    if base_url:
        return EndpointConfig(
            base_url=base_url.rstrip("/"),
            auth_token=read_env("EPYDIOS_PREMIUM_PROVIDER_REMOTE_AUTH_TOKEN", "EPYDIOS_AIMXS_REMOTE_AUTH_TOKEN"),
            timeout_seconds=_normalized_timeout_ms(
                read_env("EPYDIOS_PREMIUM_PROVIDER_REMOTE_TIMEOUT_MS", "EPYDIOS_AIMXS_REMOTE_TIMEOUT_MS")
            ),
            source="env:EPYDIOS_PREMIUM_PROVIDER_REMOTE_BASE_URL",
        )

    extracted_root = resolve_provider_payload_root()
    for relative_path in ENDPOINT_MANIFEST_CANDIDATES:
        candidate = extracted_root / relative_path
        if candidate.exists():
            return _manifest_config(candidate)

    raise FileNotFoundError(
        "Separately delivered provider endpoint is not configured for local-provider mode. "
        f"Looked for endpoint manifests under {extracted_root} "
        f"({', '.join(ENDPOINT_MANIFEST_CANDIDATES)}) and found none. "
        "Set EPYDIOS_PREMIUM_PROVIDER_REMOTE_BASE_URL or install a provider package that publishes a provider-endpoint manifest."
    )


class ProviderProxyRuntime:
    def __init__(self, endpoint: EndpointConfig):
        self.endpoint = endpoint

    def _request(self, method: str, path: str, payload: Dict[str, Any] | None = None) -> Tuple[int, Dict[str, Any]]:
        body = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if self.endpoint.auth_token:
            headers["Authorization"] = f"Bearer {self.endpoint.auth_token}"

        request = urllib.request.Request(
            f"{self.endpoint.base_url}{path}",
            data=body,
            headers=headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(request, timeout=self.endpoint.timeout_seconds) as response:
                content = response.read()
                if not content:
                    return response.status, {}
                decoded = json.loads(content.decode("utf-8"))
                return response.status, decoded if isinstance(decoded, dict) else {"raw": decoded}
        except urllib.error.HTTPError as error:
            payload = error.read()
            if payload:
                try:
                    decoded = json.loads(payload.decode("utf-8"))
                    if isinstance(decoded, dict):
                        return error.code, decoded
                except Exception:
                    pass
            return error.code, {"error": "upstream_http_error", "message": str(error)}
        except urllib.error.URLError as error:
            return 503, {"error": "upstream_unavailable", "message": str(error.reason)}

    def provider_capabilities(self) -> Dict[str, Any]:
        status, payload = self._request("GET", "/v1alpha1/capabilities")
        if status == 200 and isinstance(payload, dict):
            payload.setdefault("providerId", PUBLIC_PROVIDER_ID)
            payload.setdefault("contractVersion", PUBLIC_CONTRACT_VERSION)
            return payload
        return {
            "providerType": "PolicyProvider",
            "providerId": PUBLIC_PROVIDER_ID,
            "contractVersion": PUBLIC_CONTRACT_VERSION,
            "providerVersion": PUBLIC_PROVIDER_VERSION,
            "capabilities": [],
            "notes": ["Separately delivered provider endpoint configured but capability advertisement was unavailable."],
        }

    def health_payload(self) -> Dict[str, Any]:
        status, payload = self._request("GET", "/healthz")
        return {
            "status": "ok",
            "providerId": PUBLIC_PROVIDER_ID,
            "providerVersion": PUBLIC_PROVIDER_VERSION,
            "mode": "proxy",
            "endpoint": {
                "baseUrl": self.endpoint.base_url,
                "source": self.endpoint.source,
                "reachable": status == 200,
            },
            "upstream": payload if isinstance(payload, dict) else {},
        }

    def evaluate(self, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        return self._request("POST", "/v1alpha1/policy-provider/evaluate", payload)

    def validate_bundle(self, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
        return self._request("POST", "/v1alpha1/policy-provider/validate-bundle", payload)


class ProviderProxyRequestHandler(BaseHTTPRequestHandler):
    runtime: ProviderProxyRuntime

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
        self._send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
            if self.path == "/v1alpha1/policy-provider/evaluate":
                status, response = self.runtime.evaluate(payload)
                self._send_json(status, response)
                return
            if self.path == "/v1alpha1/policy-provider/validate-bundle":
                status, response = self.runtime.validate_bundle(payload)
                self._send_json(status, response)
                return
            self._send_json(404, {"error": "not_found"})
        except Exception as error:  # pragma: no cover - launcher smoke only
            self._send_json(500, {"error": "proxy_failure", "message": str(error)})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        message = "%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args)
        sys.stderr.write(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the public provider-route loader/proxy.")
    parser.add_argument(
        "--host",
        default=read_env("PREMIUM_PROVIDER_LOCAL_HOST", "AIMXS_LOCAL_FULL_HOST") or "127.0.0.1",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(read_env("PREMIUM_PROVIDER_LOCAL_PORT", "AIMXS_LOCAL_FULL_PORT") or "4271"),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        endpoint = load_endpoint_config()
        runtime = ProviderProxyRuntime(endpoint)
    except FileNotFoundError as error:
        print(str(error), file=sys.stderr)
        return 2
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    class Handler(ProviderProxyRequestHandler):
        pass

    Handler.runtime = runtime
    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
