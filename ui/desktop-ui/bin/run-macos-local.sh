#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODE="mock"
UI_HOST="${UI_HOST:-127.0.0.1}"
UI_PORT="${UI_PORT:-4173}"
RUNTIME_LOCAL_PORT="${RUNTIME_LOCAL_PORT:-8080}"
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
  --no-open                   Do not auto-open browser
  -h, --help                  Show usage

Modes:
  mock  Uses local mock mode and no cluster runtime dependency.
  live  Disables UI mock mode and starts kubectl port-forward to
        epydios-system/service/orchestration-runtime.
EOF
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

"${SCRIPT_DIR}/bootstrap-macos-local.sh" --mode "${MODE}"

RUN_ROOT="${MODULE_ROOT}/.tmp/macos-launch"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_DIR="${RUN_ROOT}/${STAMP}"
WEB_ROOT="${MODULE_ROOT}/web"
CONFIG_PATH=""
mkdir -p "${SESSION_DIR}"

if [[ "${MODE}" == "live" ]]; then
  WEB_ROOT="${SESSION_DIR}/web"
  CONFIG_PATH="${WEB_ROOT}/config/runtime-config.json"
  cp -R "${MODULE_ROOT}/web" "${WEB_ROOT}"
  runtime_base_url="http://${UI_HOST}:${RUNTIME_LOCAL_PORT}"
  jq \
    --arg runtime_base_url "${runtime_base_url}" \
    '.mockMode = false
     | .environment = "local-live"
     | .auth.enabled = false
     | .runtimeApiBaseUrl = $runtime_base_url
     | .registryApiBaseUrl = $runtime_base_url' \
    "${MODULE_ROOT}/web/config/runtime-config.json" > "${CONFIG_PATH}"
fi

UI_LOG="${SESSION_DIR}/ui-server.log"
PF_LOG="${SESSION_DIR}/runtime-port-forward.log"
UI_PID=""
PF_PID=""

cleanup() {
  if [[ -n "${UI_PID}" ]] && kill -0 "${UI_PID}" >/dev/null 2>&1; then
    kill "${UI_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${PF_PID}" ]] && kill -0 "${PF_PID}" >/dev/null 2>&1; then
    kill "${PF_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "${MODE}" == "live" ]]; then
  kubectl -n epydios-system port-forward svc/orchestration-runtime "${RUNTIME_LOCAL_PORT}:8080" > "${PF_LOG}" 2>&1 &
  PF_PID="$!"

  ready=0
  for _ in $(seq 1 30); do
    if curl -fsS "http://${UI_HOST}:${RUNTIME_LOCAL_PORT}/healthz" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "${ready}" -ne 1 ]]; then
    echo "Runtime port-forward did not become ready on ${UI_HOST}:${RUNTIME_LOCAL_PORT}" >&2
    tail -n 40 "${PF_LOG}" >&2 || true
    exit 1
  fi
fi

python3 -m http.server "${UI_PORT}" --bind "${UI_HOST}" --directory "${WEB_ROOT}" > "${UI_LOG}" 2>&1 &
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
if [[ -n "${PF_PID}" ]]; then
  echo "  runtime_port_forward_log=${PF_LOG}"
fi
echo "Press Ctrl+C to stop."

wait "${UI_PID}"
