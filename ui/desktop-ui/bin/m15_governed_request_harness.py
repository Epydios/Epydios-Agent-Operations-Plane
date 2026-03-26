#!/usr/bin/env python3
import argparse
import json
import mimetypes
import os
import posixpath
import socketserver
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def plus_seconds_iso(seconds):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + max(0, int(seconds))))


def read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


class HarnessState:
    def __init__(self, web_root, state_path):
        self._lock = threading.Lock()
        self.web_root = os.path.abspath(web_root)
        self.state_path = os.path.abspath(state_path)
        self.next_run_number = 1
        self.runs_by_id = {}
        self.run_order = []
        self.approvals_by_run_id = {}
        self.audit_events = []
        self.upstream_requests = []
        self.integration_settings = {
            "selectedAgentProfileId": "codex",
            "modelRouting": "gateway_first",
            "agentProfiles": [
                {
                    "id": "codex",
                    "label": "OpenAI Codex",
                    "provider": "openai_compatible",
                    "transport": "responses_api",
                    "model": "gpt-5-codex",
                    "enabled": True,
                }
            ],
        }
        self._persist()

    def _persist(self):
        payload = {
            "generated_at_utc": now_iso(),
            "web_root": self.web_root,
            "runs": list(self.runs_by_id.values()),
            "approvals": list(self.approvals_by_run_id.values()),
            "audit_events": list(self.audit_events),
            "upstream_requests": list(self.upstream_requests),
        }
        os.makedirs(os.path.dirname(self.state_path), exist_ok=True)
        write_json(self.state_path, payload)

    def set_web_root(self, web_root):
        with self._lock:
            self.web_root = os.path.abspath(web_root)
            self._persist()

    def _record_audit_event(self, event, tenant_id, project_id, provider_id, decision=""):
        self.audit_events.insert(
            0,
            {
                "ts": now_iso(),
                "event": str(event or "").strip(),
                "tenantId": str(tenant_id or "").strip(),
                "projectId": str(project_id or "").strip(),
                "providerId": str(provider_id or "").strip(),
                "decision": str(decision or "").strip().upper(),
            },
        )

    def _next_run_id(self):
        run_id = f"run-supported-{self.next_run_number:03d}"
        self.next_run_number += 1
        return run_id

    def create_run(self, payload):
        with self._lock:
            run_id = self._next_run_id()
            created_at = now_iso()
            expires_at = plus_seconds_iso(900)
            tenant_id = str(payload.get("meta", {}).get("tenantId") or "tenant-demo").strip() or "tenant-demo"
            project_id = str(payload.get("meta", {}).get("projectId") or "project-core").strip() or "project-core"
            request_id = str(payload.get("meta", {}).get("requestId") or run_id).strip() or run_id
            request_payload = dict(payload)
            request_payload.setdefault(
                "desktop",
                {
                    "enabled": True,
                    "tier": 3,
                    "targetOS": "macos",
                    "targetExecutionProfile": "sandbox_vm_autonomous",
                    "requestedCapabilities": ["model.responses.create"],
                },
            )
            run = {
                "runId": run_id,
                "requestId": request_id,
                "tenantId": tenant_id,
                "projectId": project_id,
                "environment": str(payload.get("meta", {}).get("environment") or "prod").strip() or "prod",
                "retentionClass": "operator_review",
                "expiresAt": expires_at,
                "status": "POLICY_EVALUATED",
                "selectedProfileProvider": "codex-gateway",
                "selectedPolicyProvider": "oss-policy-opa",
                "selectedEvidenceProvider": "evidence-harness",
                "selectedDesktopProvider": "desktop-verifier",
                "policyDecision": "DEFER",
                "policyBundleId": "policy-bundle-supported",
                "policyBundleVersion": "2026.03.25",
                "policyGrantTokenPresent": False,
                "policyResponse": {
                    "decision": "DEFER",
                    "reasons": [
                        {
                            "code": "approval_required",
                            "message": "Operator approval is required before the governed request can continue.",
                        }
                    ]
                },
                "requestPayload": request_payload,
                "evidenceBundleResponse": {
                    "bundleId": f"bundle-{run_id}",
                    "status": "collecting",
                    "retentionClass": "operator_review",
                },
                "createdAt": created_at,
                "updatedAt": created_at,
            }
            approval = {
                "approvalId": f"approval-{run_id}",
                "runId": run_id,
                "requestId": request_id,
                "tenantId": tenant_id,
                "projectId": project_id,
                "tier": 3,
                "targetOS": "macos",
                "targetExecutionProfile": "sandbox_vm_autonomous",
                "requestedCapabilities": ["model.responses.create"],
                "status": "PENDING",
                "createdAt": created_at,
                "expiresAt": expires_at,
                "reason": "Awaiting operator approval before the governed Codex request can continue.",
            }
            self.runs_by_id[run_id] = run
            self.run_order.insert(0, run_id)
            self.approvals_by_run_id[run_id] = approval
            self._record_audit_event("runtime.policy.decision", tenant_id, project_id, "oss-policy-opa", "DEFER")
            self._record_audit_event(
                "runtime.desktop.approval.pending",
                tenant_id,
                project_id,
                "desktop-verifier",
                "DEFER",
            )
            self._persist()
            return dict(run)

    def list_runs(self):
        with self._lock:
            items = [self.runs_by_id[run_id] for run_id in self.run_order]
            return {"count": len(items), "items": items}

    def get_run(self, run_id):
        with self._lock:
            return dict(self.runs_by_id.get(run_id, {}))

    def list_approvals(self, tenant_id="", project_id="", status=""):
        tenant_filter = str(tenant_id or "").strip()
        project_filter = str(project_id or "").strip()
        status_filter = str(status or "").strip().upper()
        with self._lock:
            items = []
            for approval in self.approvals_by_run_id.values():
                if tenant_filter and str(approval.get("tenantId") or "").strip() != tenant_filter:
                    continue
                if project_filter and str(approval.get("projectId") or "").strip() != project_filter:
                    continue
                if status_filter and str(approval.get("status") or "").strip().upper() != status_filter:
                    continue
                items.append(dict(approval))
            items.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
            return {"count": len(items), "items": items}

    def submit_approval_decision(self, run_id, decision, reason, ttl_seconds):
        with self._lock:
            run = self.runs_by_id.get(run_id)
            approval = self.approvals_by_run_id.get(run_id)
            if not run or not approval:
                return None
            reviewed_at = now_iso()
            normalized_decision = "DENY" if str(decision or "").strip().upper() == "DENY" else "APPROVE"
            normalized_status = "DENIED" if normalized_decision == "DENY" else "APPROVED"
            normalized_reason = str(reason or "").strip() or (
                "Denied by verifier."
                if normalized_decision == "DENY"
                else "Approved by verifier."
            )
            approval["status"] = normalized_status
            approval["reason"] = normalized_reason
            approval["reviewedAt"] = reviewed_at
            if ttl_seconds:
                approval["expiresAt"] = plus_seconds_iso(ttl_seconds)

            if normalized_decision == "DENY":
                run["status"] = "FAILED"
                run["policyDecision"] = "DENY"
                run["policyGrantTokenPresent"] = False
                run["errorMessage"] = normalized_reason
                run["policyResponse"] = {
                    "decision": "DENY",
                    "reasons": [
                        {
                            "code": "operator_denied",
                            "message": normalized_reason,
                        }
                    ]
                }
                run["evidenceBundleResponse"] = {
                    "bundleId": f"bundle-{run_id}",
                    "status": "degraded",
                    "retentionClass": "operator_review",
                    "receiptRef": f"receipt-{run_id}",
                }
                self._record_audit_event("runtime.approval.decision", run["tenantId"], run["projectId"], "runtime-approvals", "DENY")
                self._record_audit_event("runtime.run.denied", run["tenantId"], run["projectId"], "runtime-approvals", "DENY")
            else:
                run["status"] = "COMPLETED"
                run["policyDecision"] = "ALLOW"
                run["policyGrantTokenPresent"] = True
                run["policyGrantTokenSha256"] = f"sha256:{run_id}"
                run["policyResponse"] = {
                    "decision": "ALLOW",
                    "receiptRef": f"receipt-{run_id}",
                    "approvalReceiptRef": f"receipt-{run_id}",
                    "reasons": [
                        {
                            "code": "operator_approved",
                            "message": normalized_reason,
                        }
                    ],
                }
                run["evidenceRecordResponse"] = {
                    "evidenceId": f"evidence-{run_id}",
                    "status": "RECORDED",
                    "uri": f"proof://evidence/{run_id}",
                    "hash": f"sha256:evidence-{run_id}",
                    "retentionClass": "operator_review",
                }
                run["evidenceBundleResponse"] = {
                    "bundleId": f"bundle-{run_id}",
                    "status": "ready",
                    "retentionClass": "operator_review",
                    "receiptRef": f"receipt-{run_id}",
                }
                self._record_audit_event("runtime.approval.decision", run["tenantId"], run["projectId"], "runtime-approvals", "ALLOW")
                self._record_audit_event("runtime.evidence.handoff.ready", run["tenantId"], run["projectId"], "evidence-harness", "ALLOW")
                self._record_audit_event("runtime.run.completed", run["tenantId"], run["projectId"], "evidence-harness", "ALLOW")
            run["updatedAt"] = reviewed_at
            self._persist()
            return {
                "applied": True,
                "runId": run_id,
                "decision": normalized_decision,
                "status": normalized_status,
                "reason": normalized_reason,
                "reviewedAt": reviewed_at,
            }

    def list_audit_events(self, tenant_id="", project_id="", provider_id="", decision=""):
        tenant_filter = str(tenant_id or "").strip()
        project_filter = str(project_id or "").strip()
        provider_filter = str(provider_id or "").strip()
        decision_filter = str(decision or "").strip().upper()
        with self._lock:
            items = []
            for item in self.audit_events:
                if tenant_filter and str(item.get("tenantId") or "").strip() != tenant_filter:
                    continue
                if project_filter and str(item.get("projectId") or "").strip() != project_filter:
                    continue
                if provider_filter and str(item.get("providerId") or "").strip() != provider_filter:
                    continue
                if decision_filter and str(item.get("decision") or "").strip().upper() != decision_filter:
                    continue
                items.append(dict(item))
            return {"count": len(items), "items": items}

    def record_upstream_request(self, method, path, body):
        with self._lock:
            self.upstream_requests.insert(
                0,
                {
                    "capturedAt": now_iso(),
                    "method": str(method or "").strip().upper(),
                    "path": str(path or "").strip(),
                    "body": body,
                },
            )
            self._persist()


class HarnessHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True

    def __init__(self, server_address, handler_class, role, state):
        super().__init__(server_address, handler_class)
        self.role = role
        self.state = state


class HarnessHandler(BaseHTTPRequestHandler):
    server_version = "EpydiosVerifierHarness/1.0"

    @property
    def state(self):
        return self.server.state

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _send_json(self, payload, status=HTTPStatus.OK):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _send_text(self, text, status=HTTPStatus.OK, content_type="text/plain; charset=utf-8"):
        encoded = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _ui_origin(self):
        host, port = self.server.server_address[:2]
        return f"http://{host}:{port}"

    def _looks_like_api_path(self):
        parsed = urllib.parse.urlparse(self.path)
        return parsed.path.startswith("/v1alpha") or parsed.path.startswith("/__agentops")

    def do_GET(self):
        if self.server.role in {"ui", "runtime"} and self.path.startswith("/healthz"):
            self._send_json({"status": "ok", "generatedAt": now_iso()})
            return
        if self.server.role in {"ui", "runtime"} and self._handle_runtime_get():
            return
        if self.server.role == "ui":
            if self._looks_like_api_path():
                self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                return
            self._serve_static()
            return
        self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if self.server.role == "upstream" and self._handle_upstream_post():
            return
        if self.server.role == "ui" and self.path == "/__verifier/set-web-root":
            payload = self._read_json()
            web_root = str(payload.get("webRoot") or "").strip()
            if not web_root:
                self._send_json({"error": "webRoot is required"}, HTTPStatus.BAD_REQUEST)
                return
            self.state.set_web_root(web_root)
            self._send_json({"applied": True, "webRoot": self.state.web_root})
            return
        if self.server.role in {"ui", "runtime"} and self._handle_runtime_post():
            return
        self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        if self.server.role in {"ui", "runtime"} and self._handle_runtime_put():
            return
        self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def _handle_runtime_get(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        if path == "/v1alpha1/providers":
            self._send_json({"items": []})
            return True
        if path == "/v1alpha1/pipeline/status":
            self._send_json(
                {
                    "status": "ready",
                    "latestStagingGate": "verifier",
                    "latestProdGate": "verifier",
                    "detail": "Verifier runtime stub is serving the supported-path governed request flow.",
                }
            )
            return True
        if path == "/v1alpha1/runtime/runs":
            self._send_json(self.state.list_runs())
            return True
        if path.startswith("/v1alpha1/runtime/runs/"):
            run_id = urllib.parse.unquote(path.rsplit("/", 1)[-1])
            record = self.state.get_run(run_id)
            if not record:
                self._send_json({"error": "run not found"}, HTTPStatus.NOT_FOUND)
                return True
            self._send_json(record)
            return True
        if path == "/v1alpha1/runtime/approvals":
            self._send_json(
                self.state.list_approvals(
                    tenant_id=(query.get("tenantId") or [""])[0],
                    project_id=(query.get("projectId") or [""])[0],
                    status=(query.get("status") or [""])[0],
                )
            )
            return True
        if path == "/v1alpha1/runtime/audit/events":
            self._send_json(
                self.state.list_audit_events(
                    tenant_id=(query.get("tenantId") or [""])[0],
                    project_id=(query.get("projectId") or [""])[0],
                    provider_id=(query.get("providerId") or [""])[0],
                    decision=(query.get("decision") or [""])[0],
                )
            )
            return True
        if path == "/v1alpha1/runtime/integrations/settings":
            tenant_id = (query.get("tenantId") or ["tenant-demo"])[0]
            project_id = (query.get("projectId") or ["project-core"])[0]
            self._send_json(
                {
                    "tenantId": tenant_id,
                    "projectId": project_id,
                    "hasSettings": True,
                    "settings": self.state.integration_settings,
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
            )
            return True
        if path == "/v1alpha2/runtime/worker-capabilities":
            self._send_json(
                {
                    "items": [
                        {
                            "workerId": "managed_codex_worker",
                            "adapterId": "codex",
                            "status": "READY",
                            "capabilities": ["responses_api", "approval_handoff"],
                        }
                    ]
                }
            )
            return True
        if path == "/v1alpha2/runtime/sessions":
            self._send_json({"count": 0, "items": []})
            return True
        if path == "/v1alpha2/runtime/identity":
            self._send_json(
                {
                    "source": "verifier-runtime",
                    "authEnabled": True,
                    "authenticated": True,
                    "authorityBasis": "mock_bearer_token_jwt",
                    "policyMatrixRequired": False,
                    "policyRuleCount": 1,
                    "identity": {
                        "subject": "agentops-demo-user",
                        "clientId": "epydios-runtime-prod-client",
                        "roles": ["runtime.admin", "runtime.run.read", "runtime.run.create"],
                        "tenantIds": ["tenant-demo"],
                        "projectIds": ["project-core"],
                        "effectivePermissions": ["runtime.run.create", "runtime.run.read", "runtime.approval.review"],
                        "claimKeys": ["sub", "tenant_id", "project_id", "client_id", "roles"],
                    },
                }
            )
            return True
        if path == "/v1alpha2/runtime/policy-packs":
            self._send_json({"items": [{"id": "oss-baseline", "label": "OSS Baseline", "status": "ready"}]})
            return True
        if path == "/__agentops/secure-refs":
            self._send_json({"message": "helper unavailable"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return True
        if path == "/__agentops/aimxs/activation":
            self._send_json({"message": "helper unavailable"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return True
        return False

    def _handle_runtime_post(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/v1alpha1/runtime/runs":
            payload = self._read_json()
            self._send_json(self.state.create_run(payload), HTTPStatus.CREATED)
            return True
        if path.startswith("/v1alpha1/runtime/approvals/") and path.endswith("/decision"):
            run_id = urllib.parse.unquote(path.split("/v1alpha1/runtime/approvals/", 1)[1].rsplit("/decision", 1)[0])
            payload = self._read_json()
            response = self.state.submit_approval_decision(
                run_id,
                payload.get("decision"),
                payload.get("reason"),
                payload.get("ttlSeconds") or 0,
            )
            if response is None:
                self._send_json({"error": "approval not found"}, HTTPStatus.NOT_FOUND)
                return True
            self._send_json(response, HTTPStatus.OK)
            return True
        return False

    def _handle_runtime_put(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/v1alpha1/runtime/integrations/settings":
            payload = self._read_json()
            settings = payload.get("settings")
            if not isinstance(settings, dict):
                self._send_json({"error": "settings must be an object"}, HTTPStatus.BAD_REQUEST)
                return True
            self.state.integration_settings = settings
            self._send_json(
                {
                    "applied": True,
                    "tenantId": str(payload.get("meta", {}).get("tenantId") or "tenant-demo").strip() or "tenant-demo",
                    "projectId": str(payload.get("meta", {}).get("projectId") or "project-core").strip() or "project-core",
                    "hasSettings": True,
                    "settings": settings,
                    "updatedAt": now_iso(),
                }
            )
            return True
        return False

    def _handle_upstream_post(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/v1/responses":
            return False
        try:
            payload = self._read_json()
        except json.JSONDecodeError:
            self._send_json({"error": "invalid json"}, HTTPStatus.BAD_REQUEST)
            return True
        self.state.record_upstream_request("POST", parsed.path, payload)
        self._send_json(
            {
                "id": "resp-supported-001",
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "governed request completed",
                            }
                        ],
                    }
                ],
                "output_text": "governed request completed",
            },
            HTTPStatus.OK,
        )
        return True

    def _serve_static(self):
        parsed = urllib.parse.urlparse(self.path)
        rel_path = parsed.path or "/"
        if rel_path.endswith("/"):
            rel_path = f"{rel_path}index.html"
        rel_path = posixpath.normpath(rel_path.lstrip("/"))
        root = self.state.web_root
        full_path = os.path.abspath(os.path.join(root, rel_path))
        if not full_path.startswith(root):
            self._send_json({"error": "forbidden"}, HTTPStatus.FORBIDDEN)
            return
        if not os.path.exists(full_path):
            fallback = os.path.join(root, "index.html")
            if not os.path.exists(fallback):
                self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                return
            full_path = fallback
        if os.path.isdir(full_path):
            full_path = os.path.join(full_path, "index.html")
        try:
            if rel_path == "config/runtime-config.json":
                with open(full_path, "r", encoding="utf-8") as handle:
                    payload = json.load(handle)
                payload["runtimeApiBaseUrl"] = self._ui_origin()
                payload["registryApiBaseUrl"] = self._ui_origin()
                auth = payload.get("auth")
                if not isinstance(auth, dict):
                    auth = {}
                auth["redirectUri"] = f"{self._ui_origin()}/"
                payload["auth"] = auth
                data = (json.dumps(payload) + "\n").encode("utf-8")
                content_type = "application/json"
            else:
                with open(full_path, "rb") as handle:
                    data = handle.read()
                content_type = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
        except (OSError, json.JSONDecodeError):
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def run_server(args):
    state = HarnessState(args.web_root, args.state_path)
    servers = []
    threads = []
    try:
        for role, port in (("runtime", args.runtime_port), ("ui", args.ui_port), ("upstream", args.upstream_port)):
            server = HarnessHTTPServer(("127.0.0.1", port), HarnessHandler, role, state)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            servers.append(server)
            threads.append(thread)
        print(
            json.dumps(
                {
                    "status": "ready",
                    "runtime_port": args.runtime_port,
                    "ui_port": args.ui_port,
                    "upstream_port": args.upstream_port,
                    "web_root": state.web_root,
                    "state_path": state.state_path,
                }
            ),
            flush=True,
        )
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()


def run_set_web_root(args):
    request_json(
        "POST",
        f"{args.control_url.rstrip('/')}",
        {"webRoot": args.web_root},
    )


def webdriver_request(base_url, method, path, payload=None, timeout=30):
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{base_url}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"WebDriver HTTP {error.code} {error.reason}: {raw}") from error
    if not raw:
        return {}
    parsed = json.loads(raw)
    return parsed.get("value", parsed)


def exec_js(webdriver_url, session_id, script, args=None):
    return webdriver_request(
        webdriver_url,
        "POST",
        f"/session/{session_id}/execute/sync",
        {"script": script, "args": args or []},
    )


def wait_until(webdriver_url, session_id, script, args=None, timeout=20, label="condition"):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            last = exec_js(webdriver_url, session_id, script, args)
            if bool(last):
                return last
        except Exception as error:
            last = str(error)
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {label}; last={last!r}")


def start_browser_session(webdriver_url):
    created = webdriver_request(
        webdriver_url,
        "POST",
        "/session",
        {
            "capabilities": {
                "alwaysMatch": {
                    "browserName": "safari",
                    "acceptInsecureCerts": True,
                }
            }
        },
        timeout=60,
    )
    session_id = str(created.get("sessionId") or "").strip()
    if not session_id:
        raise RuntimeError(f"WebDriver session did not return sessionId: {created!r}")
    return session_id


def close_browser_session(webdriver_url, session_id):
    if not session_id:
        return
    try:
        webdriver_request(webdriver_url, "DELETE", f"/session/{session_id}")
    except Exception:
        return


def navigate_and_wait_ready(app_url, webdriver_url, session_id):
    webdriver_request(webdriver_url, "POST", f"/session/{session_id}/url", {"url": app_url})
    wait_until(webdriver_url, session_id, "return document.readyState === 'complete';", label="dom ready")
    wait_until(
        webdriver_url,
        session_id,
        "return !!document.getElementById('login-button') && !!document.getElementById('logout-button') && !!document.getElementById('refresh-button') && !!document.getElementById('context-project-select');",
        timeout=30,
        label="core shell controls",
    )


def click_by_id(webdriver_url, session_id, element_id):
    clicked = exec_js(
        webdriver_url,
        session_id,
        """
const id = arguments[0];
const el = document.getElementById(id);
if (!el || el.disabled) return false;
el.click();
return true;
""",
        [element_id],
    )
    if not clicked:
        raise RuntimeError(f"Could not click #{element_id}")


def click_selector(webdriver_url, session_id, selector):
    clicked = exec_js(
        webdriver_url,
        session_id,
        """
const selector = arguments[0];
const el = document.querySelector(selector);
if (!el || el.disabled) return false;
el.click();
return true;
""",
        [selector],
    )
    if not clicked:
        raise RuntimeError(f"Could not click selector {selector!r}")


def set_input_value(webdriver_url, session_id, selector, value):
    updated = exec_js(
        webdriver_url,
        session_id,
        """
const selector = arguments[0];
const value = arguments[1];
const el = document.querySelector(selector);
if (!el || el.disabled) return false;
el.value = value;
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
return true;
""",
        [selector, value],
    )
    if not updated:
        raise RuntimeError(f"Could not set value for selector {selector!r}")


def wait_for_login_and_message(webdriver_url, session_id, expected_phrase):
    click_by_id(webdriver_url, session_id, "login-button")
    wait_until(
        webdriver_url,
        session_id,
        """
return (
  !!sessionStorage.getItem('epydios.agentops.token') &&
  String(document.body?.textContent || '').includes(arguments[0])
);
""",
        [expected_phrase],
        timeout=30,
        label=f"sign-in and {expected_phrase}",
    )


def request_json(method, url, payload=None, timeout=15, headers=None):
    data = None
    request_headers = dict(headers or {})
    if payload is not None:
        request_headers.setdefault("Content-Type", "application/json")
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def wait_for_http_ok(url, timeout=15, label="http endpoint"):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as response:
                if 200 <= int(response.status) < 300:
                    return
                last = f"status={response.status}"
        except Exception as error:
            last = str(error)
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {label}; last={last!r}")


def run_verify_off(args):
    session_id = ""
    try:
        print("verify-off: starting browser session", file=sys.stderr, flush=True)
        session_id = start_browser_session(args.webdriver_url)
        navigate_and_wait_ready(args.app_url, args.webdriver_url, session_id)
        print("verify-off: waiting for mock sign-in and OFF posture", file=sys.stderr, flush=True)
        wait_for_login_and_message(
            args.webdriver_url,
            session_id,
            "Interposition is OFF. Epydios is not governing supported requests.",
        )
        print(
            json.dumps(
                {
                    "status": "pass",
                    "authenticated": True,
                    "interposition": "off",
                }
            )
        )
    finally:
        close_browser_session(args.webdriver_url, session_id)


def helper_go(args, extra_args):
    command = ["go", "run", args.helper_module, *extra_args]
    result = subprocess.run(
        command,
        cwd=args.repo_root,
        capture_output=True,
        text=True,
        check=True,
    )
    output = result.stdout.strip()
    return json.loads(output) if output else {}


def run_verify_on(args):
    manifest = read_json(args.session_manifest)
    gateway = manifest.get("gatewayService") or {}
    paths = manifest.get("paths") or {}
    gateway_base = str(gateway.get("baseUrl") or "").strip()
    gateway_root = str(paths.get("gatewayRoot") or "").strip()
    requests_root = str(paths.get("gatewayRequestsRoot") or "").strip()
    if not gateway_base or not gateway_root or not requests_root:
        raise RuntimeError("session manifest is missing gateway verifier paths")
    holds_root = os.path.join(gateway_root, "holds")

    response_box = {}

    def send_governed_request():
        payload = {
            "model": "gpt-5-codex",
            "input": "Restart the payments deployment.",
            "metadata": {
                "tenantId": "tenant-demo",
                "projectId": "project-core",
            },
        }
        request_headers = {
            "Content-Type": "application/json",
            "Originator": "Codex Verifier",
            "User-Agent": "Codex Verifier",
            "Session_id": "codex-verifier-session",
            "X-Client-Request-Id": f"codex-verifier-{int(time.time() * 1000)}",
        }
        try:
            response_box["response"] = request_json(
                "POST",
                f"{gateway_base.rstrip('/')}/v1/responses",
                payload,
                timeout=60,
                headers=request_headers,
            )
        except Exception as error:
            response_box["error"] = str(error)

    session_id = ""
    try:
        wait_for_http_ok(f"{gateway_base.rstrip('/')}/healthz", timeout=20, label="gateway health")
        print("verify-on: starting browser session", file=sys.stderr, flush=True)
        session_id = start_browser_session(args.webdriver_url)
        navigate_and_wait_ready(args.app_url, args.webdriver_url, session_id)
        print("verify-on: waiting for mock sign-in and ON posture", file=sys.stderr, flush=True)
        wait_for_login_and_message(
            args.webdriver_url,
            session_id,
            "Interposition is ON. Epydios is governing supported requests.",
        )

        print("verify-on: sending governed /v1/responses request", file=sys.stderr, flush=True)
        request_thread = threading.Thread(target=send_governed_request, daemon=True)
        request_thread.start()

        hold = None
        deadline = time.time() + 30
        while time.time() < deadline:
            if response_box.get("error"):
                raise RuntimeError(f"Governed /responses request failed before hold persisted: {response_box['error']}")
            if response_box.get("response"):
                raise RuntimeError(f"Governed /responses request completed before hold persisted: {response_box['response']!r}")
            try:
                items = helper_go(args, ["list-holds", "--holds-root", holds_root])
            except subprocess.CalledProcessError:
                items = []
            if isinstance(items, list) and items:
                hold = items[0]
                break
            time.sleep(0.5)
        if not hold:
            raise RuntimeError("No held request appeared after the governed /responses call.")

        run_id = str(hold.get("runId") or "").strip()
        interposition_request_id = str(hold.get("interpositionRequestId") or "").strip()
        if not run_id or not interposition_request_id:
            raise RuntimeError(f"Hold record is missing runId or interpositionRequestId: {hold!r}")

        print(f"verify-on: hold captured for run {run_id}", file=sys.stderr, flush=True)
        click_by_id(args.webdriver_url, session_id, "refresh-button")
        click_selector(args.webdriver_url, session_id, '[data-workspace-tab="governanceops"]')
        wait_until(
            args.webdriver_url,
            session_id,
            "return !!document.querySelector(arguments[0]);",
            [f'[data-approval-select-run-id="{run_id}"]'],
            timeout=30,
            label="approval queue row",
        )
        approval_response = request_json(
            "POST",
            f"{args.app_url.rstrip('/')}/v1alpha1/runtime/approvals/{urllib.parse.quote(run_id)}/decision",
            {
                "decision": "APPROVE",
                "reason": "Verifier approved the governed Codex request.",
                "ttlSeconds": 900,
            },
        )
        if str(approval_response.get("status") or "").strip().upper() != "APPROVED":
            raise RuntimeError(f"Approval decision did not apply cleanly: {approval_response!r}")
        helper_go(
            args,
            [
                "resolve-hold",
                "--holds-root",
                holds_root,
                "--requests-root",
                requests_root,
                "--interposition-request-id",
                interposition_request_id,
                "--decision",
                "APPROVE",
                "--reason",
                "Verifier approved the governed Codex request.",
            ],
        )
        print(f"verify-on: approval resolved for run {run_id}", file=sys.stderr, flush=True)
        request_thread.join(timeout=30)
        if request_thread.is_alive():
            raise RuntimeError("The governed /responses request did not resume after approval resolution.")
        if response_box.get("error"):
            raise RuntimeError(f"Governed /responses request failed: {response_box['error']}")
        response_payload = response_box.get("response") or {}
        if str(response_payload.get("output_text") or "").strip() != "governed request completed":
            raise RuntimeError(f"Unexpected governed /responses response: {response_payload!r}")

        click_by_id(args.webdriver_url, session_id, "refresh-button")
        click_selector(args.webdriver_url, session_id, '[data-workspace-tab="runtimeops"]')
        wait_until(
            args.webdriver_url,
            session_id,
            "return !!document.querySelector(arguments[0]);",
            [f'[data-run-id="{run_id}"]'],
            timeout=30,
            label="runtime run row",
        )
        click_selector(args.webdriver_url, session_id, f'[data-run-id="{run_id}"]')
        wait_until(
            args.webdriver_url,
            session_id,
            """
const runId = arguments[0];
const detail = document.getElementById('run-detail-content');
if (!detail) return false;
const text = String(detail.textContent || '');
return String(detail.dataset?.selectedRunId || '') === runId && text.includes('Evidence Handoff');
""",
            [run_id],
            timeout=30,
            label="run detail evidence handoff",
        )

        click_selector(args.webdriver_url, session_id, '[data-workspace-tab="auditops"]')
        wait_until(
            args.webdriver_url,
            session_id,
            """
const text = String(document.getElementById('auditops-content')?.textContent || '');
return text.includes('runtime.approval.decision') && text.includes('ALLOW');
""",
            timeout=30,
            label="audit activity",
        )

        click_selector(args.webdriver_url, session_id, '[data-workspace-tab="evidenceops"]')
        wait_until(
            args.webdriver_url,
            session_id,
            """
const text = String(document.getElementById('evidenceops-content')?.textContent || '');
return text.includes(arguments[0]) && text.includes('Evidence Access');
""",
            [f"bundle-{run_id}"],
            timeout=30,
            label="evidence bundle",
        )

        print(
            json.dumps(
                {
                    "status": "pass",
                    "runId": run_id,
                    "interpositionRequestId": interposition_request_id,
                    "response": response_payload,
                }
            )
        )
    finally:
        close_browser_session(args.webdriver_url, session_id)


def build_parser():
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve = subparsers.add_parser("serve")
    serve.add_argument("--runtime-port", type=int, required=True)
    serve.add_argument("--ui-port", type=int, required=True)
    serve.add_argument("--upstream-port", type=int, required=True)
    serve.add_argument("--web-root", required=True)
    serve.add_argument("--state-path", required=True)
    serve.set_defaults(func=run_server)

    set_web_root = subparsers.add_parser("set-web-root")
    set_web_root.add_argument("--control-url", required=True)
    set_web_root.add_argument("--web-root", required=True)
    set_web_root.set_defaults(func=run_set_web_root)

    verify_off = subparsers.add_parser("verify-off")
    verify_off.add_argument("--app-url", required=True)
    verify_off.add_argument("--webdriver-url", required=True)
    verify_off.set_defaults(func=run_verify_off)

    verify_on = subparsers.add_parser("verify-on")
    verify_on.add_argument("--app-url", required=True)
    verify_on.add_argument("--webdriver-url", required=True)
    verify_on.add_argument("--session-manifest", required=True)
    verify_on.add_argument("--repo-root", required=True)
    verify_on.add_argument("--helper-module", required=True)
    verify_on.set_defaults(func=run_verify_on)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
