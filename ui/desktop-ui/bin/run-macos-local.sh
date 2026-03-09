#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=./lib-m21-paths.sh
source "${SCRIPT_DIR}/lib-m21-paths.sh"

MODE="mock"
UI_HOST="${UI_HOST:-127.0.0.1}"
UI_PORT="${UI_PORT:-4173}"
RUNTIME_LOCAL_PORT="${RUNTIME_LOCAL_PORT:-8080}"
REGISTRY_LOCAL_PORT="${REGISTRY_LOCAL_PORT:-8081}"
RUNTIME_BASE_URL_OVERRIDE="${RUNTIME_BASE_URL_OVERRIDE:-}"
AUTO_OPEN="${AUTO_OPEN:-1}"

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
UI_PID=""
PF_PID=""

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
}
trap cleanup EXIT INT TERM

check_port_available "${UI_PORT}" "UI"
if [[ "${MODE}" == "live" && -z "${RUNTIME_BASE_URL_OVERRIDE}" ]]; then
  check_port_available "${RUNTIME_LOCAL_PORT}" "Runtime"
fi

if [[ "${MODE}" == "live" ]]; then
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

python3 - "${UI_HOST}" "${UI_PORT}" "${WEB_ROOT}" "${MODE}" "${runtime_proxy_base:-http://${UI_HOST}:${RUNTIME_LOCAL_PORT}}" > "${UI_LOG}" 2>&1 <<'PY' &
import http.server
import json
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request

host = sys.argv[1]
port = int(sys.argv[2])
directory = sys.argv[3]
mode = sys.argv[4]
runtime_proxy_base = sys.argv[5]

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def _should_proxy(self):
        return mode == "live" and runtime_proxy_base and (
            self.path == "/healthz"
            or self.path.startswith("/v1alpha1/")
            or self.path.startswith("/v1alpha2/")
        )

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
        if self._should_proxy():
            self._proxy_request()
            return
        super().do_GET()

    def do_POST(self):
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
