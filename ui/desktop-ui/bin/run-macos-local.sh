#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${MODULE_ROOT}/../.." && pwd)"
# shellcheck source=./lib-m21-paths.sh
source "${SCRIPT_DIR}/lib-m21-paths.sh"
m21_prepare_local_state_layout

MODE="mock"
UI_HOST="${UI_HOST:-127.0.0.1}"
UI_PORT="${UI_PORT:-4173}"
RUNTIME_LOCAL_PORT="${RUNTIME_LOCAL_PORT:-8080}"
REGISTRY_LOCAL_PORT="${REGISTRY_LOCAL_PORT:-8081}"
RUNTIME_BASE_URL_OVERRIDE="${RUNTIME_BASE_URL_OVERRIDE:-}"
AUTO_OPEN="${AUTO_OPEN:-1}"
NAMESPACE="${NAMESPACE:-epydios-system}"
PREMIUM_PROVIDER_LOCAL_HOST="${PREMIUM_PROVIDER_LOCAL_HOST:-${AIMXS_LOCAL_FULL_HOST:-127.0.0.1}}"
PREMIUM_PROVIDER_LOCAL_PORT="${PREMIUM_PROVIDER_LOCAL_PORT:-${AIMXS_LOCAL_FULL_PORT:-4271}}"

usage() {
  cat <<'EOF'
Usage: run-macos-local.sh [options]

Starts Epydios AgentOps Desktop locally on macOS with a generated per-run config.

Options:
  --mode mock|live            Launch mode (default: mock)
  --host HOST                 UI bind host (default: 127.0.0.1)
  --port PORT                 UI bind port (default: 4173)
  --runtime-port PORT         Local runtime API port-forward target (default: 8080)
  --runtime-base-url URL      Use an already-running runtime instead of starting
                              a kubectl port-forward (for example http://127.0.0.1:18080)
  --registry-port PORT        Reserved for future dedicated provider discovery (default: 8081)
  --namespace NAME            Kubernetes namespace for provider-route activation helpers
                              (default: epydios-system)
  --no-open                   Do not auto-open browser
  -h, --help                  Show usage

Modes:
  mock  Uses local mock mode and no cluster runtime dependency.
  live  Disables UI mock mode and starts kubectl port-forward to
        epydios-system/service/orchestration-runtime unless --runtime-base-url
        is provided. Provider discovery falls back to the runtime contract until
        a dedicated discovery API exists.
EOF
}

require_cmd() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1 || {
    echo "Missing required command: ${cmd}" >&2
    exit 1
  }
}

prune_run_root_sessions() {
  local run_root="$1"
  local keep_dir="$2"
  local keep_latest="${3:-2}"
  local sessions=()
  local session=""
  local start=0
  local i=0
  local keep=0

  [[ -d "${run_root}" ]] || return 0
  while IFS= read -r session; do
    [[ -n "${session}" ]] || continue
    sessions+=("${session}")
  done < <(find "${run_root}" -mindepth 1 -maxdepth 1 -type d -print | LC_ALL=C sort)
  if [[ "${#sessions[@]}" -eq 0 ]]; then
    return 0
  fi

  start=$(( ${#sessions[@]} - keep_latest ))
  if (( start < 0 )); then
    start=0
  fi

  for session in "${sessions[@]}"; do
    keep=0
    if [[ "${session}" == "${keep_dir}" ]]; then
      keep=1
    else
      for (( i = start; i < ${#sessions[@]}; i++ )); do
        if [[ "${session}" == "${sessions[$i]}" ]]; then
          keep=1
          break
        fi
      done
    fi
    if (( keep != 0 )); then
      continue
    fi
    rm -rf "${session}"
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --host)
      UI_HOST="${2:-}"
      shift 2
      ;;
    --port)
      UI_PORT="${2:-}"
      shift 2
      ;;
    --runtime-port)
      RUNTIME_LOCAL_PORT="${2:-}"
      shift 2
      ;;
    --runtime-base-url)
      RUNTIME_BASE_URL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --registry-port)
      REGISTRY_LOCAL_PORT="${2:-}"
      shift 2
      ;;
    --namespace)
      NAMESPACE="${2:-}"
      shift 2
      ;;
    --no-open)
      AUTO_OPEN=0
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

MODE="$(echo "${MODE}" | tr '[:upper:]' '[:lower:]')"
if [[ "${MODE}" != "mock" && "${MODE}" != "live" ]]; then
  echo "Invalid mode: ${MODE} (expected mock|live)" >&2
  exit 1
fi

BOOTSTRAP_MODE="${MODE}"
if [[ "${MODE}" == "live" ]]; then
  require_cmd jq
  if [[ -n "${RUNTIME_BASE_URL_OVERRIDE}" ]]; then
    BOOTSTRAP_MODE="mock"
  fi
fi

"${SCRIPT_DIR}/bootstrap-macos-local.sh" --mode "${BOOTSTRAP_MODE}"

RUN_ROOT="$(m21_macos_launch_root)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_DIR="${RUN_ROOT}/${STAMP}"
WEB_ROOT="${MODULE_ROOT}/web"
CONFIG_PATH=""
mkdir -p "${SESSION_DIR}"
prune_run_root_sessions "${RUN_ROOT}" "${SESSION_DIR}" 2

if [[ "${MODE}" == "live" ]]; then
  WEB_ROOT="${SESSION_DIR}/web"
  CONFIG_PATH="${WEB_ROOT}/config/runtime-config.json"
  cp -R "${MODULE_ROOT}/web" "${WEB_ROOT}"
  runtime_proxy_base="${RUNTIME_BASE_URL_OVERRIDE:-http://${UI_HOST}:${RUNTIME_LOCAL_PORT}}"
  runtime_base_url="http://${UI_HOST}:${UI_PORT}"
  registry_base_url="${runtime_base_url}"
  jq \
    --arg runtime_base_url "${runtime_base_url}" \
    --arg registry_base_url "${registry_base_url}" \
    '.mockMode = false
     | .environment = "local-live"
     | .auth.enabled = false
     | .runtimeApiBaseUrl = $runtime_base_url
     | .registryApiBaseUrl = $registry_base_url' \
    "${MODULE_ROOT}/web/config/runtime-config.json" > "${CONFIG_PATH}"
fi

UI_LOG="${SESSION_DIR}/ui-server.log"
PF_LOG="${SESSION_DIR}/runtime-port-forward.log"
LOCAL_PROVIDER_ROUTE_LOG="${SESSION_DIR}/provider-route-local.log"
UI_PID=""
PF_PID=""
LOCAL_PROVIDER_ROUTE_PID=""
LOCAL_REF_VAULT_ROOT="$(m21_local_ref_vault_root)"
LOCAL_REF_VAULT_INDEX_PATH="$(m21_local_ref_vault_index_path)"
LOCAL_REF_VAULT_EXPORT_PATH="$(m21_local_ref_vault_export_path)"
LOCAL_REF_VAULT_SERVICE="$(m21_local_ref_vault_service_name)"
LOCAL_PROVIDER_ROUTE_OVERRIDE_PATH="$(m21_local_aimxs_provider_override_path)"
LOCAL_PROVIDER_ROUTE_STATE_PATH="$(m21_local_aimxs_provider_state_path)"
LOCAL_PROVIDER_ROUTE_ENDPOINT_URL="http://${PREMIUM_PROVIDER_LOCAL_HOST}:${PREMIUM_PROVIDER_LOCAL_PORT}"

check_port_available() {
  local port="$1"
  local label="$2"
  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "${label} port ${port} is already in use. Stop the existing listener before launching this repo UI." >&2
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >&2 || true
    exit 1
  fi
}

wait_for_http_ok() {
  local url="$1"
  local label="$2"
  local log_path="${3:-}"
  local ready=0
  for _ in $(seq 1 30); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "${ready}" -ne 1 ]]; then
    echo "${label} did not become ready at ${url}" >&2
    if [[ -n "${log_path}" && -f "${log_path}" ]]; then
      tail -n 40 "${log_path}" >&2 || true
    fi
    exit 1
  fi
}

http_code_get() {
  local url="$1"
  curl -sS -o /dev/null -w '%{http_code}' "${url}" || echo "000"
}

http_code_post_json() {
  local url="$1"
  local payload="$2"
  curl -sS -o /dev/null -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    --data "${payload}" \
    "${url}" || echo "000"
}

verify_live_contract() {
  local runtime_base_url="$1"
  local failures=()
  local warnings=()
  local code=""

  code="$(http_code_get "${runtime_base_url}/v1alpha1/runtime/runs?limit=1")"
  [[ "${code}" == "200" ]] || failures+=("runtime runs endpoint expected HTTP 200, got ${code}")

  code="$(http_code_get "${runtime_base_url}/v1alpha1/runtime/audit/events?limit=1")"
  [[ "${code}" == "200" ]] || failures+=("runtime audit endpoint expected HTTP 200, got ${code}")

  code="$(http_code_get "${runtime_base_url}/v1alpha1/runtime/approvals?limit=1")"
  [[ "${code}" == "200" ]] || failures+=("runtime approvals endpoint expected HTTP 200, got ${code}")

  code="$(http_code_get "${runtime_base_url}/v1alpha1/runtime/integrations/settings?tenantId=tenant-demo&projectId=project-core")"
  [[ "${code}" == "200" ]] || failures+=("runtime integration settings endpoint expected HTTP 200, got ${code}")

  code="$(http_code_get "${runtime_base_url}/v1alpha1/providers")"
  if [[ "${code}" != "200" ]]; then
    warnings+=("providers discovery endpoint is not exposed by the current local runtime (HTTP ${code}); the desktop UI will fall back to empty provider inventory in live mode")
  fi

  code="$(http_code_get "${runtime_base_url}/v1alpha1/pipeline/status")"
  if [[ "${code}" != "200" ]]; then
    warnings+=("pipeline status endpoint is not exposed by the current local runtime (HTTP ${code}); the desktop UI will surface pipeline status as unavailable")
  fi

  code="$(http_code_post_json "${runtime_base_url}/v1alpha1/runtime/integrations/invoke" '{}')"
  case "${code}" in
    200|400|401|403|422|500)
      ;;
    *)
      failures+=("runtime integration invoke endpoint expected HTTP 200/400/401/403/422/500, got ${code}")
      ;;
  esac

  if [[ "${#failures[@]}" -gt 0 ]]; then
    echo "Local live contract is incomplete for the current desktop UI." >&2
    echo "This usually means the local cluster runtime image is older than the repo contract or a required runtime route is unavailable." >&2
    printf '  - %s\n' "${failures[@]}" >&2
    echo "runtime_port_forward_log=${PF_LOG}" >&2
    exit 1
  fi

  if [[ "${#warnings[@]}" -gt 0 ]]; then
    echo "Local live contract warnings:" >&2
    printf '  - %s\n' "${warnings[@]}" >&2
  fi
}

cleanup() {
  if [[ -n "${UI_PID}" ]] && kill -0 "${UI_PID}" >/dev/null 2>&1; then
    kill "${UI_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${PF_PID}" ]] && kill -0 "${PF_PID}" >/dev/null 2>&1; then
    kill "${PF_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${LOCAL_PROVIDER_ROUTE_PID}" ]] && kill -0 "${LOCAL_PROVIDER_ROUTE_PID}" >/dev/null 2>&1; then
    kill "${LOCAL_PROVIDER_ROUTE_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

check_port_available "${UI_PORT}" "UI"
if [[ "${MODE}" == "live" && -z "${RUNTIME_BASE_URL_OVERRIDE}" ]]; then
  check_port_available "${RUNTIME_LOCAL_PORT}" "Runtime"
fi
if [[ "${MODE}" == "live" ]]; then
  check_port_available "${PREMIUM_PROVIDER_LOCAL_PORT}" "local provider-route proxy"
fi

if [[ "${MODE}" == "live" ]]; then
  python3 "${SCRIPT_DIR}/aimxs-full-provider.py" \
    --host "${PREMIUM_PROVIDER_LOCAL_HOST}" \
    --port "${PREMIUM_PROVIDER_LOCAL_PORT}" > "${LOCAL_PROVIDER_ROUTE_LOG}" 2>&1 &
  LOCAL_PROVIDER_ROUTE_PID="$!"
  wait_for_http_ok "${LOCAL_PROVIDER_ROUTE_ENDPOINT_URL}/healthz" "local provider-route proxy" "${LOCAL_PROVIDER_ROUTE_LOG}"
  if [[ -n "${RUNTIME_BASE_URL_OVERRIDE}" ]]; then
    wait_for_http_ok "${runtime_proxy_base}/healthz" "Runtime endpoint" ""
    verify_live_contract "${runtime_proxy_base}"
  else
    kubectl -n epydios-system port-forward svc/orchestration-runtime "${RUNTIME_LOCAL_PORT}:8080" > "${PF_LOG}" 2>&1 &
    PF_PID="$!"

    wait_for_http_ok "${runtime_proxy_base}/healthz" "Runtime port-forward" "${PF_LOG}"
    verify_live_contract "${runtime_proxy_base}"
  fi
fi

python3 - "${UI_HOST}" "${UI_PORT}" "${WEB_ROOT}" "${MODE}" "${runtime_proxy_base:-http://${UI_HOST}:${RUNTIME_LOCAL_PORT}}" "${LOCAL_REF_VAULT_SERVICE}" "${LOCAL_REF_VAULT_INDEX_PATH}" "${LOCAL_REF_VAULT_EXPORT_PATH}" "${NAMESPACE}" "${REPO_ROOT}" "${LOCAL_PROVIDER_ROUTE_OVERRIDE_PATH}" "${LOCAL_PROVIDER_ROUTE_STATE_PATH}" "${LOCAL_PROVIDER_ROUTE_ENDPOINT_URL}" "${PREMIUM_PROVIDER_LOCAL_HOST}" "${PREMIUM_PROVIDER_LOCAL_PORT}" > "${UI_LOG}" 2>&1 <<'PY' &
import http.server
import json
import os
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

host = sys.argv[1]
port = int(sys.argv[2])
directory = sys.argv[3]
mode = sys.argv[4]
runtime_proxy_base = sys.argv[5]
secure_ref_service = sys.argv[6]
secure_ref_index_path = sys.argv[7]
secure_ref_export_path = sys.argv[8]
namespace = sys.argv[9]
repo_root = sys.argv[10]
provider_override_path = sys.argv[11]
provider_state_path = sys.argv[12]
provider_local_endpoint_url = sys.argv[13]
provider_local_host = sys.argv[14]
provider_local_port = int(sys.argv[15])
secure_ref_prefix = "/__agentops/secure-refs"
provider_activation_prefix = "/__agentops/aimxs/activation"
secure_ref_index_version = 1
premium_primary_provider_name = "premium-policy-primary"
premium_local_provider_name = "premium-provider-local"
oss_policy_provider_name = "oss-policy-opa"
oss_profile_provider_name = "oss-profile-static-resolver"
oss_evidence_provider_name = "oss-evidence-memory"
premium_bearer_secret_name = "policy-provider-token"
premium_client_tls_secret_name = "epydios-provider-client-tls"
premium_ca_secret_name = "epydios-provider-ca"
provider_override_file_version = 1
legacy_local_mode = "aimxs-full"
legacy_secure_mode = "aimxs-https"
local_provider_mode = "provider-local"
secure_provider_mode = "provider-https"


def normalize_provider_mode(value, fallback="unknown"):
    requested = str(value or "").strip().lower().replace("_", "-")
    if requested == legacy_local_mode:
        return local_provider_mode
    if requested == legacy_secure_mode:
        return secure_provider_mode
    if requested in ("oss-only", local_provider_mode, secure_provider_mode, "unknown"):
        return requested
    normalized_fallback = str(fallback or "").strip().lower().replace("_", "-")
    if normalized_fallback in ("oss-only", local_provider_mode, secure_provider_mode, "unknown"):
        return normalized_fallback
    return "unknown"


def provider_mode_label(mode_name):
    normalized = normalize_provider_mode(mode_name, "unknown")
    if normalized == local_provider_mode:
        return "local-provider"
    if normalized == secure_provider_mode:
        return "secure-provider"
    if normalized == "oss-only":
        return "baseline"
    return normalized


def json_response(handler, status_code, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status_code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    if body:
        handler.wfile.write(body)


def ensure_parent_dir(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def read_json_file(path, fallback):
    if not path or not os.path.exists(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, dict):
            return payload
    except Exception:
        return fallback
    return fallback


def write_json_file(path, payload):
    ensure_parent_dir(path)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def remove_file(path):
    try:
        os.remove(path)
    except FileNotFoundError:
        return


def normalize_provider_override_entry(raw):
    if not isinstance(raw, dict):
        return None
    provider_type = str(raw.get("providerType") or "").strip()
    endpoint_url = str(raw.get("endpointUrl") or "").strip()
    if not provider_type or not endpoint_url:
        return None
    capabilities = []
    for item in raw.get("capabilities") or []:
        value = str(item or "").strip()
        if value:
            capabilities.append(value)
    return {
        "active": bool(raw.get("active")),
        "providerType": provider_type,
        "providerId": str(raw.get("providerId") or "").strip(),
        "providerName": str(raw.get("providerName") or "").strip(),
        "endpointUrl": endpoint_url,
        "timeoutSeconds": int(raw.get("timeoutSeconds") or 10),
        "authMode": str(raw.get("authMode") or "None").strip() or "None",
        "capabilities": capabilities,
        "mode": normalize_provider_mode(raw.get("mode"), "unknown"),
        "updatedAt": str(raw.get("updatedAt") or "").strip(),
    }


def read_provider_override_file():
    payload = read_json_file(provider_override_path, {})
    overrides_raw = payload.get("overrides") if isinstance(payload, dict) else None
    overrides = []
    if isinstance(overrides_raw, list):
        for item in overrides_raw:
            normalized = normalize_provider_override_entry(item)
            if normalized:
                overrides.append(normalized)
    else:
        normalized = normalize_provider_override_entry(payload)
        if normalized:
            overrides.append(normalized)
    return {
        "version": provider_override_file_version,
        "overrides": overrides,
    }


def write_provider_override_file(payload):
    write_json_file(
        provider_override_path,
        {
            "version": provider_override_file_version,
            "overrides": payload.get("overrides") or [],
        },
    )


def list_provider_overrides():
    return list(read_provider_override_file().get("overrides") or [])


def write_provider_overrides(overrides):
    write_provider_override_file({"overrides": overrides})


def find_policy_override(mode_name="", active_only=False):
    requested_mode = normalize_provider_mode(mode_name, "")
    for item in list_provider_overrides():
        if str(item.get("providerType") or "").strip() != "PolicyProvider":
            continue
        if active_only and not bool(item.get("active")):
            continue
        current_mode = normalize_provider_mode(item.get("mode"), "")
        if requested_mode and current_mode != requested_mode:
            continue
        return dict(item)
    return {}


def set_policy_override(next_override):
    normalized = normalize_provider_override_entry(next_override)
    if not normalized:
        raise RuntimeError("Policy override payload is invalid.")
    normalized["active"] = True
    normalized["updatedAt"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    target_mode = normalize_provider_mode(normalized.get("mode"), "")
    updated = []
    replaced = False
    for item in list_provider_overrides():
        if str(item.get("providerType") or "").strip() != "PolicyProvider":
            updated.append(item)
            continue
        current_mode = normalize_provider_mode(item.get("mode"), "")
        if target_mode and current_mode == target_mode and not replaced:
            updated.append(dict(normalized))
            replaced = True
            continue
        item = dict(item)
        item["active"] = False
        updated.append(item)
    if not replaced:
        updated.append(dict(normalized))
    write_provider_overrides(updated)
    return normalized


def deactivate_policy_overrides():
    updated = []
    for item in list_provider_overrides():
        if str(item.get("providerType") or "").strip() == "PolicyProvider":
            item = dict(item)
            item["active"] = False
        updated.append(item)
    write_provider_overrides(updated)


def activate_policy_override_mode(mode_name):
    requested_mode = normalize_provider_mode(mode_name, "")
    updated = []
    selected = {}
    for item in list_provider_overrides():
        if str(item.get("providerType") or "").strip() != "PolicyProvider":
            updated.append(item)
            continue
        item = dict(item)
        item["active"] = normalize_provider_mode(item.get("mode"), "") == requested_mode
        if item["active"]:
            item["updatedAt"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
            selected = dict(item)
        updated.append(item)
    if not selected:
        raise RuntimeError(
            f"Local runtime is missing the {requested_mode or 'requested'} policy bridge entry. Restart terminal 1 first."
        )
    write_provider_overrides(updated)
    return selected


def http_json(url, *, method="GET", payload=None, headers=None, timeout=3):
    request = urllib.request.Request(url, method=method)
    for key, value in (headers or {}).items():
        if value is None:
            continue
        request.add_header(str(key), str(value))
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request.add_header("Content-Type", "application/json")
        request.data = body
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        detail = body.strip() or str(error.reason or "").strip() or "request failed"
        raise RuntimeError(f"HTTP {error.code} from {url}: {detail}")


def reserve_local_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def stop_process(process):
    if process is None:
        return
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


def wait_for_http_json(url, timeout_seconds=10):
    deadline = time.time() + timeout_seconds
    last_error = ""
    while time.time() < deadline:
        try:
            return http_json(url, timeout=2)
        except Exception as error:
            last_error = str(error)
            time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for {url}: {last_error or 'endpoint did not become ready'}")


def normalize_ref_entries(items):
    normalized = []
    seen = set()
    for item in items or []:
        if isinstance(item, dict):
            ref_value = item.get("ref")
            updated_at = item.get("updatedAt")
        else:
            ref_value = item
            updated_at = ""
        ref = str(ref_value or "").strip()
        if not ref or ref in seen:
            continue
        seen.add(ref)
        normalized.append(
            {
                "ref": ref,
                "updatedAt": str(updated_at or "").strip(),
            }
        )
    return normalized


def read_secure_ref_index():
    payload = {
        "version": secure_ref_index_version,
        "service": secure_ref_service,
        "entries": [],
        "lastExportedAt": "",
    }
    if not os.path.exists(secure_ref_index_path):
        return payload
    try:
        with open(secure_ref_index_path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except Exception:
        return payload
    payload["version"] = secure_ref_index_version
    payload["service"] = secure_ref_service
    payload["entries"] = normalize_ref_entries(raw.get("entries") if isinstance(raw, dict) else [])
    payload["lastExportedAt"] = str(
        raw.get("lastExportedAt") if isinstance(raw, dict) else ""
    ).strip()
    return payload


def write_secure_ref_index(payload):
    ensure_parent_dir(secure_ref_index_path)
    normalized = {
        "version": secure_ref_index_version,
        "service": secure_ref_service,
        "entries": normalize_ref_entries(payload.get("entries")),
        "lastExportedAt": str(payload.get("lastExportedAt") or "").strip(),
    }
    fd, tmp_path = tempfile.mkstemp(
        prefix="agentops-local-ref-index-",
        suffix=".json",
        dir=os.path.dirname(secure_ref_index_path) or None,
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(normalized, handle, indent=2)
            handle.write("\n")
        os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, secure_ref_index_path)
        os.chmod(secure_ref_index_path, 0o600)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def has_security_cli():
    return sys.platform == "darwin" and shutil.which("security") is not None


def secure_ref_lookup(ref):
    if not has_security_cli():
        return ""
    result = subprocess.run(
        ["security", "find-generic-password", "-a", ref, "-s", secure_ref_service, "-w"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return ""
    return result.stdout


def secure_ref_upsert(ref, value):
    process = subprocess.run(
        ["security", "add-generic-password", "-a", ref, "-s", secure_ref_service, "-U", "-w"],
        input=f"{value}\n",
        capture_output=True,
        text=True,
        check=False,
    )
    if process.returncode != 0:
        raise RuntimeError((process.stderr or process.stdout or "security add failed").strip())


def secure_ref_delete(ref):
    process = subprocess.run(
        ["security", "delete-generic-password", "-a", ref, "-s", secure_ref_service],
        capture_output=True,
        text=True,
        check=False,
    )
    if process.returncode != 0:
        stderr = (process.stderr or process.stdout or "").strip().lower()
        if "could not be found" in stderr or "specified item could not be found" in stderr:
            return False
        raise RuntimeError((process.stderr or process.stdout or "security delete failed").strip())
    return True


def build_secure_ref_status():
    index_payload = read_secure_ref_index()
    entries = []
    stored_count = 0
    available = has_security_cli()
    for item in index_payload["entries"]:
        ref = item["ref"]
        present = available and bool(secure_ref_lookup(ref))
        if present:
            stored_count += 1
        entries.append(
            {
                "ref": ref,
                "present": present,
                "updatedAt": item["updatedAt"],
            }
        )
    message = (
        "Concrete local ref values are stored in macOS Keychain and indexed outside the repo."
        if available
        else "macOS Keychain support is unavailable on this launcher."
    )
    return {
        "available": available,
        "platform": sys.platform,
        "service": secure_ref_service,
        "indexPath": secure_ref_index_path,
        "exportPath": secure_ref_export_path,
        "storedCount": stored_count,
        "entries": entries,
        "lastExportedAt": index_payload["lastExportedAt"],
        "message": message,
    }


def export_secure_refs():
    index_payload = read_secure_ref_index()
    exported = {}
    exported_count = 0
    for item in index_payload["entries"]:
        ref = item["ref"]
        value = secure_ref_lookup(ref)
        if not value:
            continue
        exported[ref] = value
        exported_count += 1
    ensure_parent_dir(secure_ref_export_path)
    fd, tmp_path = tempfile.mkstemp(
        prefix="agentops-runtime-ref-values-",
        suffix=".json",
        dir=os.path.dirname(secure_ref_export_path) or None,
        text=True,
    )
    now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(exported, handle, indent=2)
            handle.write("\n")
        os.chmod(tmp_path, 0o600)
        os.replace(tmp_path, secure_ref_export_path)
        os.chmod(secure_ref_export_path, 0o600)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    index_payload["lastExportedAt"] = now
    write_secure_ref_index(index_payload)
    status = build_secure_ref_status()
    status.update(
        {
            "applied": True,
            "exportedCount": exported_count,
            "lastExportedAt": now,
            "message": "Exported a non-repo runtime ref-values snapshot from the local secure store.",
        }
    )
    return status


def read_json_body(handler):
    length = int(handler.headers.get("Content-Length") or 0)
    raw = handler.rfile.read(length) if length > 0 else b"{}"
    if not raw:
        return {}
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        raise ValueError("Request body must be valid JSON.")
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    return payload


def normalize_ref(value):
    ref = str(value or "").strip()
    if not ref:
        raise ValueError("ref is required.")
    if not ref.startswith("ref://"):
        raise ValueError("ref must use ref:// format.")
    return ref


def normalize_secret_value(value):
    secret = str(value or "")
    if not secret.strip():
        raise ValueError("value is required.")
    return secret


def has_kubectl():
    return shutil.which("kubectl") is not None


def first_non_empty(*values):
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def kubectl_run(args, input_text=None, check=True):
    process = subprocess.run(
        ["kubectl", *args],
        input=input_text,
        capture_output=True,
        text=True,
        check=False,
    )
    if check and process.returncode != 0:
        raise RuntimeError((process.stderr or process.stdout or "kubectl command failed").strip())
    return process


def kubectl_apply_kustomize(path):
    kubectl_run(["apply", "-k", path])


def kubectl_apply_file(path):
    kubectl_run(["apply", "-f", path])


def kubectl_apply_manifest(manifest):
    kubectl_run(["apply", "-f", "-"], input_text=json.dumps(manifest))


def kubectl_patch_provider(name, patch, ignore_missing=False):
    process = kubectl_run(
        ["-n", namespace, "patch", "extensionprovider", name, "--type=merge", "-p", json.dumps(patch)],
        check=False,
    )
    if process.returncode == 0:
        return True
    stderr = (process.stderr or process.stdout or "").strip().lower()
    if ignore_missing and ("not found" in stderr or "no matches for kind" in stderr):
        return False
    raise RuntimeError((process.stderr or process.stdout or f"failed to patch extensionprovider {name}").strip())


def kubectl_secret_present(name):
    if not name:
        return False
    process = kubectl_run(["-n", namespace, "get", "secret", name, "-o", "name"], check=False)
    return process.returncode == 0


def load_kubectl_json(args):
    process = kubectl_run(args)
    try:
        return json.loads(process.stdout or "{}")
    except Exception as error:
        raise RuntimeError(f"Failed to decode kubectl JSON output: {error}") from error


def provider_condition_true(status, cond_type):
    for item in status.get("conditions", []) or []:
        if str(item.get("type") or "").strip() != cond_type:
            continue
        if str(item.get("status") or "").strip().lower() == "true":
            return True
    return False


def provider_capabilities(item):
    status = item.get("status") or {}
    resolved = status.get("resolved") or {}
    capabilities = resolved.get("capabilities")
    if isinstance(capabilities, list) and capabilities:
        return [str(value or "").strip() for value in capabilities if str(value or "").strip()]
    advertised = (item.get("spec") or {}).get("advertisedCapabilities")
    if isinstance(advertised, list):
        return [str(value or "").strip() for value in advertised if str(value or "").strip()]
    return []


def resolve_provider_mode(item):
    metadata = item.get("metadata") or {}
    spec = item.get("spec") or {}
    status = item.get("status") or {}
    labels = metadata.get("labels") or {}
    explicit = normalize_provider_mode(
        first_non_empty(
            labels.get("epydios.ai/deployment-mode"),
            status.get("resolved", {}).get("deploymentMode"),
        ),
        "unknown",
    )
    if explicit in ("oss-only", local_provider_mode, secure_provider_mode):
        return explicit
    provider_name = str(metadata.get("name") or "").strip().lower()
    provider_id = first_non_empty(
        status.get("resolved", {}).get("providerId"),
        spec.get("providerId"),
        provider_name,
    ).lower()
    if provider_name == premium_local_provider_name or provider_id == premium_local_provider_name:
        return local_provider_mode
    if provider_name == oss_policy_provider_name or provider_id == oss_policy_provider_name:
        return "oss-only"
    if provider_name == premium_primary_provider_name or provider_id == premium_primary_provider_name:
        return secure_provider_mode
    return "unknown"


def normalize_policy_provider(item):
    metadata = item.get("metadata") or {}
    spec = item.get("spec") or {}
    status = item.get("status") or {}
    selection = spec.get("selection") or {}
    endpoint = spec.get("endpoint") or {}
    resolved = status.get("resolved") or {}
    name = str(metadata.get("name") or "").strip()
    provider_id = first_non_empty(resolved.get("providerId"), spec.get("providerId"), name)
    enabled = selection.get("enabled")
    if enabled is None:
        enabled = True
    priority = selection.get("priority")
    try:
        priority = int(priority)
    except Exception:
        priority = 100
    return {
        "name": name,
        "providerId": provider_id,
        "mode": resolve_provider_mode(item),
        "enabled": bool(enabled),
        "ready": provider_condition_true(status, "Ready"),
        "probed": provider_condition_true(status, "Probed"),
        "priority": priority,
        "authMode": first_non_empty((spec.get("auth") or {}).get("mode"), "None"),
        "capabilities": provider_capabilities(item),
        "endpoint": str(endpoint.get("url") or "").strip(),
    }


def sort_selectable_providers(items):
    return sorted(items, key=lambda item: (-int(item.get("priority") or 0), item.get("name") or ""))


def resolve_secure_ref_value(ref):
    value = secure_ref_lookup(ref)
    if value:
        return value.strip()
    if os.path.exists(secure_ref_export_path):
        try:
            with open(secure_ref_export_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            exported = str((payload or {}).get(ref) or "").strip()
            if exported:
                return exported
        except Exception:
            return ""
    return ""


def resolve_required_secure_ref(ref_value, label):
    ref = normalize_ref(ref_value)
    value = resolve_secure_ref_value(ref)
    if not value:
        raise RuntimeError(
            f"{label} could not be resolved from Secure Local Credential Capture. Save {ref} first, then retry provider-route activation."
        )
    return ref, value


def resolve_optional_secure_ref(ref_value):
    ref = str(ref_value or "").strip()
    if not ref:
        return "", ""
    normalized_ref = normalize_ref(ref)
    value = resolve_secure_ref_value(normalized_ref)
    if not value:
        return normalized_ref, ""
    return normalized_ref, value


def validate_endpoint_url(raw_value, require_https):
    parsed = urllib.parse.urlparse(str(raw_value or "").strip())
    scheme = str(parsed.scheme or "").strip().lower()
    if require_https and scheme != "https":
        raise RuntimeError("Secure provider mode requires an https endpoint URL.")
    if not require_https and scheme not in ("http", "https"):
        raise RuntimeError("Local provider mode requires an http or https endpoint URL.")
    if not str(parsed.netloc or "").strip():
        raise RuntimeError("Provider endpoint URL must include a host.")
    return parsed.geturl()


def build_secret_manifest(name, secret_type, string_data):
    return {
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {
            "name": name,
            "namespace": namespace,
        },
        "type": secret_type,
        "stringData": string_data,
    }


def build_local_provider_override(endpoint_url=""):
    target_url = str(endpoint_url or provider_local_endpoint_url).strip() or provider_local_endpoint_url
    return {
        "active": True,
        "providerType": "PolicyProvider",
        "providerId": premium_local_provider_name,
        "providerName": premium_local_provider_name,
        "endpointUrl": target_url,
        "timeoutSeconds": 10,
        "authMode": "None",
        "capabilities": [
            "policy.evaluate",
            "policy.validate_bundle",
            "governance.handshake_validation",
            "evidence.policy_decision_refs",
            "policy.defer",
            "policy.grant_tokens",
        ],
        "mode": local_provider_mode,
        "updatedAt": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }


def read_local_provider_override():
    active_override = find_policy_override(local_provider_mode, active_only=True)
    if active_override:
        return active_override
    return find_policy_override(local_provider_mode, active_only=False)


def collect_local_provider_status():
    override = read_local_provider_override()
    active = bool(override.get("active")) and normalize_provider_mode(override.get("mode"), "unknown") == local_provider_mode
    status = {
        "active": active,
        "mode": local_provider_mode if active else "unknown",
        "endpointUrl": str(override.get("endpointUrl") or provider_local_endpoint_url).strip() or provider_local_endpoint_url,
        "providerId": str(override.get("providerId") or premium_local_provider_name).strip() or premium_local_provider_name,
        "providerName": str(override.get("providerName") or premium_local_provider_name).strip() or premium_local_provider_name,
        "ready": False,
        "probed": False,
        "capabilities": [],
        "warnings": [],
    }
    if not active:
        return status
    try:
        health = http_json(f"{status['endpointUrl']}/healthz", timeout=3)
        capabilities = http_json(f"{status['endpointUrl']}/v1alpha1/capabilities", timeout=3)
        status["ready"] = str(health.get("status") or "").strip().lower() == "ok"
        status["probed"] = status["ready"]
        status["capabilities"] = [
            str(item or "").strip()
            for item in (capabilities.get("capabilities") or [])
            if str(item or "").strip()
        ]
    except Exception as error:
        status["warnings"].append(f"Local provider-route probe failed: {error}")
    return status


def load_extensionproviders():
    payload = load_kubectl_json(["-n", namespace, "get", "extensionprovider", "-o", "json"])
    return payload.get("items") or []


def collect_aimxs_activation_status(message="", applied=False, requested_mode=""):
    requested_mode = normalize_provider_mode(requested_mode, "unknown")
    if mode != "live":
        return {
            "available": False,
            "source": "launcher-mode",
            "state": "unavailable",
            "message": "Provider-route activation is only available from the live local launcher.",
            "namespace": namespace,
            "activeMode": "unknown",
            "requestedMode": requested_mode,
            "selectedProviderId": "",
            "selectedProviderName": "",
            "selectedProviderReady": False,
            "selectedProviderProbed": False,
            "capabilities": [],
            "enabledProviders": [],
            "warnings": [],
            "applied": applied,
            "lastAppliedAt": "",
            "secrets": {
                "bearerTokenSecret": {"name": premium_bearer_secret_name, "present": False},
                "clientTlsSecret": {"name": premium_client_tls_secret_name, "present": False},
                "caSecret": {"name": premium_ca_secret_name, "present": False},
            },
        }
    local_provider_status = collect_local_provider_status()
    if local_provider_status["active"]:
        payload = {
            "available": True,
            "source": "launcher-helper",
            "state": "active" if local_provider_status["ready"] and local_provider_status["probed"] else "pending",
            "message": str(
                message
                or (
                    f"Policy selection currently routes through {local_provider_status['providerId']} ({provider_mode_label(local_provider_mode)})."
                    if local_provider_status["ready"] and local_provider_status["probed"]
                    else "Provider-route activation is applied, but the local provider bridge is still pending readiness."
                )
            ).strip(),
            "namespace": namespace,
            "activeMode": local_provider_mode,
            "requestedMode": requested_mode,
            "selectedProviderId": local_provider_status["providerId"],
            "selectedProviderName": local_provider_status["providerName"],
            "selectedProviderReady": local_provider_status["ready"],
            "selectedProviderProbed": local_provider_status["probed"],
            "capabilities": list(local_provider_status["capabilities"]),
            "enabledProviders": [
                {
                    "name": local_provider_status["providerName"],
                    "providerId": local_provider_status["providerId"],
                    "mode": local_provider_mode,
                    "enabled": True,
                    "ready": local_provider_status["ready"],
                    "probed": local_provider_status["probed"],
                    "priority": 1000,
                    "authMode": "None",
                    "capabilities": list(local_provider_status["capabilities"]),
                }
            ],
            "warnings": list(local_provider_status["warnings"]),
            "applied": applied,
            "lastAppliedAt": "",
            "secrets": {
                "bearerTokenSecret": {"name": premium_bearer_secret_name, "present": False},
                "clientTlsSecret": {"name": premium_client_tls_secret_name, "present": False},
                "caSecret": {"name": premium_ca_secret_name, "present": False},
            },
        }
        write_json_file(provider_state_path, payload)
        return payload

    if not has_kubectl():
        return {
            "available": False,
            "source": "kubectl-missing",
            "state": "unavailable",
            "message": "kubectl is required for provider-route activation on the local launcher path.",
            "namespace": namespace,
            "activeMode": "unknown",
            "requestedMode": requested_mode,
            "selectedProviderId": "",
            "selectedProviderName": "",
            "selectedProviderReady": False,
            "selectedProviderProbed": False,
            "capabilities": [],
            "enabledProviders": [],
            "warnings": [],
            "applied": applied,
            "lastAppliedAt": "",
            "secrets": {
                "bearerTokenSecret": {"name": premium_bearer_secret_name, "present": False},
                "clientTlsSecret": {"name": premium_client_tls_secret_name, "present": False},
                "caSecret": {"name": premium_ca_secret_name, "present": False},
            },
        }

    items = load_extensionproviders()
    providers = []
    for item in items:
        spec = item.get("spec") or {}
        if str(spec.get("providerType") or "").strip() != "PolicyProvider":
            continue
        provider = normalize_policy_provider(item)
        if provider["name"] not in (
            premium_primary_provider_name,
            oss_policy_provider_name,
        ):
            continue
        providers.append(provider)

    enabled = [item for item in providers if item["enabled"]]
    selectable = sort_selectable_providers(
        [item for item in enabled if item["ready"] and item["probed"]]
    )
    selected = selectable[0] if selectable else None
    warnings = []
    enabled_premium = [item for item in enabled if item["mode"] in (local_provider_mode, secure_provider_mode)]
    if len(enabled_premium) > 1:
        warnings.append("Multiple separately delivered policy providers are enabled simultaneously; selection may drift until only one remains enabled.")
    if enabled and not selectable:
        warnings.append("A policy provider is enabled but has not reached Ready and Probed yet.")

    if selected:
        state = "active"
        active_mode = selected["mode"]
        default_message = (
            f"Policy selection currently routes through {selected['providerId']} ({selected['mode']})."
        )
    elif enabled:
        state = "pending"
        active_mode = first_non_empty(*(item["mode"] for item in enabled), "unknown")
        default_message = "Provider-route activation has been applied, but the selected policy provider is still pending readiness."
    else:
        state = "degraded"
        active_mode = "unknown"
        default_message = "No enabled policy provider was found in ExtensionProvider state."

    payload = {
        "available": True,
        "source": "launcher-helper",
        "state": state,
        "message": str(message or default_message).strip(),
        "namespace": namespace,
        "activeMode": active_mode,
        "requestedMode": requested_mode,
        "selectedProviderId": selected["providerId"] if selected else "",
        "selectedProviderName": selected["name"] if selected else "",
        "selectedProviderReady": bool(selected and selected["ready"]),
        "selectedProviderProbed": bool(selected and selected["probed"]),
        "capabilities": list(selected["capabilities"]) if selected else [],
        "enabledProviders": providers,
        "warnings": warnings,
        "applied": applied,
        "lastAppliedAt": "",
        "secrets": {
            "bearerTokenSecret": {
                "name": premium_bearer_secret_name,
                "present": kubectl_secret_present(premium_bearer_secret_name),
            },
            "clientTlsSecret": {
                "name": premium_client_tls_secret_name,
                "present": kubectl_secret_present(premium_client_tls_secret_name),
            },
            "caSecret": {
                "name": premium_ca_secret_name,
                "present": kubectl_secret_present(premium_ca_secret_name),
            },
        },
    }
    write_json_file(provider_state_path, payload)
    return payload


def wait_for_aimxs_mode(target_mode, timeout_seconds=25):
    target_mode = normalize_provider_mode(target_mode, "unknown")
    deadline = time.time() + timeout_seconds
    last = collect_aimxs_activation_status(requested_mode=target_mode)
    while time.time() < deadline:
        last = collect_aimxs_activation_status(requested_mode=target_mode)
        if (
            last.get("activeMode") == target_mode
            and last.get("selectedProviderReady")
            and last.get("selectedProviderProbed")
        ):
            return last
        time.sleep(1)
    warnings = list(last.get("warnings") or [])
    warnings.append(f"Requested mode {target_mode} did not reach Ready and Probed before timeout.")
    last["warnings"] = warnings
    if last.get("state") == "active" and last.get("activeMode") != target_mode:
        last["state"] = "pending"
    return last


def apply_oss_only_mode():
    activate_policy_override_mode("oss-only")
    kubectl_apply_kustomize(os.path.join(repo_root, "platform", "modes", "oss-only"))
    kubectl_patch_provider(
        oss_policy_provider_name,
        {"spec": {"selection": {"enabled": True, "priority": 90}}},
        ignore_missing=False,
    )
    kubectl_patch_provider(
        premium_primary_provider_name,
        {"spec": {"selection": {"enabled": False, "priority": 900}}},
        ignore_missing=True,
    )


def apply_full_mode(endpoint_url=""):
    apply_oss_only_mode()
    override = build_local_provider_override(endpoint_url)
    set_policy_override(override)


def apply_secure_mode(requested_mode, endpoint_url, bearer_token, client_tls_cert, client_tls_key, ca_cert):
    deactivate_policy_overrides()
    kubectl_apply_manifest(
        build_secret_manifest(
            premium_bearer_secret_name,
            "Opaque",
            {"token": bearer_token},
        )
    )
    kubectl_apply_manifest(
        build_secret_manifest(
            premium_client_tls_secret_name,
            "kubernetes.io/tls",
            {"tls.crt": client_tls_cert, "tls.key": client_tls_key},
        )
    )
    kubectl_apply_manifest(
        build_secret_manifest(
            premium_ca_secret_name,
            "Opaque",
            {"ca.crt": ca_cert},
        )
    )
    kubectl_apply_kustomize(os.path.join(repo_root, "platform", "modes", requested_mode))
    kubectl_patch_provider(
        premium_primary_provider_name,
        {
            "spec": {
                "endpoint": {
                    "url": endpoint_url,
                    "healthPath": "/healthz",
                    "capabilitiesPath": "/v1alpha1/capabilities",
                    "timeoutSeconds": 10,
                },
                "auth": {
                    "mode": "MTLSAndBearerTokenSecret",
                    "bearerTokenSecretRef": {"name": premium_bearer_secret_name, "key": "token"},
                    "clientTLSSecretRef": {"name": premium_client_tls_secret_name},
                    "caSecretRef": {"name": premium_ca_secret_name},
                },
                "selection": {"enabled": True, "priority": 900},
            }
        },
        ignore_missing=False,
    )
    kubectl_patch_provider(
        oss_policy_provider_name,
        {"spec": {"selection": {"enabled": False, "priority": 90}}},
        ignore_missing=False,
    )


def apply_aimxs_activation(payload):
    if mode != "live":
        raise RuntimeError("Provider-route activation is only available from the live local launcher.")
    if not has_kubectl():
        raise RuntimeError("kubectl is required to activate the provider route on the local launcher path.")

    requested_mode = normalize_provider_mode(payload.get("mode"), "unknown")
    if requested_mode not in ("oss-only", local_provider_mode, secure_provider_mode):
        raise RuntimeError("Provider-route activation requires a valid deployment mode.")

    now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    endpoint_url = ""
    if requested_mode == "oss-only":
        apply_oss_only_mode()
    elif requested_mode == local_provider_mode:
        endpoint_url = provider_local_endpoint_url
        apply_full_mode(endpoint_url)
    else:
        _, endpoint_value = resolve_required_secure_ref(payload.get("endpointRef"), "Provider endpoint ref")
        _, bearer_token = resolve_required_secure_ref(payload.get("bearerTokenRef"), "Provider bearer token ref")
        _, client_tls_cert = resolve_required_secure_ref(payload.get("clientTlsCertRef"), "Provider client TLS cert ref")
        _, client_tls_key = resolve_required_secure_ref(payload.get("clientTlsKeyRef"), "Provider client TLS key ref")
        _, ca_cert = resolve_required_secure_ref(payload.get("caCertRef"), "Provider CA ref")
        endpoint_url = validate_endpoint_url(endpoint_value, require_https=True)
        apply_secure_mode(
            requested_mode,
            endpoint_url,
            bearer_token,
            client_tls_cert,
            client_tls_key,
            ca_cert,
        )

    snapshot = wait_for_aimxs_mode(requested_mode)
    snapshot["applied"] = True
    snapshot["requestedMode"] = requested_mode
    snapshot["lastAppliedAt"] = now
    if snapshot.get("activeMode") == requested_mode and snapshot.get("selectedProviderReady"):
        if requested_mode == local_provider_mode:
            snapshot["message"] = "Provider-route activation switched the live policy-provider path to local-provider using the launcher-side provider bridge."
        else:
            snapshot["message"] = f"Provider-route activation switched the live policy-provider path to {provider_mode_label(requested_mode)}."
    else:
        snapshot["message"] = f"Provider-route activation applied the {provider_mode_label(requested_mode)} contract, but the live provider is still converging."
    return snapshot


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def _is_secure_ref_route(self):
        return self.path == secure_ref_prefix or self.path.startswith(f"{secure_ref_prefix}/")

    def _is_aimxs_route(self):
        return self.path == provider_activation_prefix or self.path.startswith(f"{provider_activation_prefix}/")

    def _should_proxy(self):
        return mode == "live" and runtime_proxy_base and (
            self.path == "/healthz"
            or self.path.startswith("/v1alpha1/")
            or self.path.startswith("/v1alpha2/")
        )

    def _handle_secure_ref_route(self):
        if not has_security_cli():
            json_response(
                self,
                503,
                {
                    "available": False,
                    "message": "macOS Keychain support is unavailable on this launcher.",
                    "service": secure_ref_service,
                    "indexPath": secure_ref_index_path,
                    "exportPath": secure_ref_export_path,
                    "entries": [],
                },
            )
            return

        try:
            parsed = urllib.parse.urlparse(self.path)
            route = parsed.path
            if self.command == "GET" and route == secure_ref_prefix:
                json_response(self, 200, build_secure_ref_status())
                return
            if self.command == "POST" and route == f"{secure_ref_prefix}/upsert":
                payload = read_json_body(self)
                ref = normalize_ref(payload.get("ref"))
                value = normalize_secret_value(payload.get("value"))
                secure_ref_upsert(ref, value)
                index_payload = read_secure_ref_index()
                entries = [item for item in index_payload["entries"] if item["ref"] != ref]
                entries.append(
                    {
                        "ref": ref,
                        "updatedAt": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
                    }
                )
                index_payload["entries"] = entries
                write_secure_ref_index(index_payload)
                response = build_secure_ref_status()
                response.update(
                    {
                        "applied": True,
                        "ref": ref,
                        "message": "Secure local ref value saved. Restart terminal 1 before expecting runtime-side ref resolution to pick it up.",
                    }
                )
                json_response(self, 200, response)
                return
            if self.command == "POST" and route == f"{secure_ref_prefix}/delete":
                payload = read_json_body(self)
                ref = normalize_ref(payload.get("ref"))
                removed = secure_ref_delete(ref)
                index_payload = read_secure_ref_index()
                index_payload["entries"] = [item for item in index_payload["entries"] if item["ref"] != ref]
                write_secure_ref_index(index_payload)
                response = build_secure_ref_status()
                response.update(
                    {
                        "applied": True,
                        "removed": removed,
                        "ref": ref,
                        "message": "Secure local ref value removed from the launcher store.",
                    }
                )
                json_response(self, 200, response)
                return
            if self.command == "POST" and route == f"{secure_ref_prefix}/export":
                json_response(self, 200, export_secure_refs())
                return
            json_response(self, 404, {"message": "Unknown secure-ref route."})
        except ValueError as error:
            json_response(self, 400, {"message": str(error)})
        except RuntimeError as error:
            json_response(self, 500, {"message": str(error)})

    def _handle_aimxs_route(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            route = parsed.path
            if self.command == "GET" and route == provider_activation_prefix:
                json_response(self, 200, collect_aimxs_activation_status())
                return
            if self.command == "POST" and route == f"{provider_activation_prefix}/apply":
                payload = read_json_body(self)
                json_response(self, 200, apply_aimxs_activation(payload))
                return
            json_response(self, 404, {"message": "Unknown provider-route activation route."})
        except ValueError as error:
            json_response(self, 400, {"message": str(error)})
        except RuntimeError as error:
            json_response(self, 500, {"message": str(error)})

    def _proxy_request(self):
        url = urllib.parse.urljoin(runtime_proxy_base, self.path)
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length > 0 else None
        headers = {}
        for key in ("Accept", "Content-Type", "Authorization"):
            value = self.headers.get(key)
            if value:
                headers[key] = value
        request = urllib.request.Request(url, data=body, headers=headers, method=self.command)

        try:
            with urllib.request.urlopen(request) as response:
                payload = response.read()
                self.send_response(response.getcode())
                for key, value in response.headers.items():
                    lower = key.lower()
                    if lower in ("connection", "transfer-encoding", "server", "date"):
                        continue
                    self.send_header(key, value)
                self.end_headers()
                if payload:
                    self.wfile.write(payload)
        except urllib.error.HTTPError as error:
            payload = error.read()
            self.send_response(error.code)
            for key, value in error.headers.items():
                lower = key.lower()
                if lower in ("connection", "transfer-encoding", "server", "date"):
                    continue
                self.send_header(key, value)
            self.end_headers()
            if payload:
                self.wfile.write(payload)
        except Exception as error:
            payload = json.dumps({"error": str(error)}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def do_GET(self):
        if self._is_secure_ref_route():
            self._handle_secure_ref_route()
            return
        if self._is_aimxs_route():
            self._handle_aimxs_route()
            return
        if self._should_proxy():
            self._proxy_request()
            return
        super().do_GET()

    def do_POST(self):
        if self._is_secure_ref_route():
            self._handle_secure_ref_route()
            return
        if self._is_aimxs_route():
            self._handle_aimxs_route()
            return
        if self._should_proxy():
            self._proxy_request()
            return
        super().do_POST()

    def do_PUT(self):
        if self._should_proxy():
            self._proxy_request()
            return
        super().do_PUT()

    def do_DELETE(self):
        if self._should_proxy():
            self._proxy_request()
            return
        super().do_DELETE()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

with ReusableTCPServer((host, port), NoCacheHandler) as httpd:
    httpd.serve_forever()
PY
UI_PID="$!"

ready=0
for _ in $(seq 1 30); do
  if curl -fsS "http://${UI_HOST}:${UI_PORT}/" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "${ready}" -ne 1 ]]; then
  echo "UI server did not become ready on ${UI_HOST}:${UI_PORT}" >&2
  tail -n 40 "${UI_LOG}" >&2 || true
  exit 1
fi

ui_url="http://${UI_HOST}:${UI_PORT}"
if [[ "${AUTO_OPEN}" == "1" ]]; then
  open "${ui_url}" >/dev/null 2>&1 || true
fi

echo "Epydios AgentOps Desktop running"
echo "  mode=${MODE}"
echo "  url=${ui_url}"
echo "  session_dir=${SESSION_DIR}"
echo "  ui_log=${UI_LOG}"
if [[ "${MODE}" == "live" ]]; then
  echo "  runtime_base_url=${runtime_proxy_base}"
fi
if [[ -n "${PF_PID}" ]]; then
  echo "  runtime_port_forward_log=${PF_LOG}"
fi
echo "Press Ctrl+C to stop."

wait "${UI_PID}"
