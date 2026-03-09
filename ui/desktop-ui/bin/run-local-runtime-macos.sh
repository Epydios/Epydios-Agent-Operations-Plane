#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=./lib-m21-paths.sh
source "${SCRIPT_DIR}/lib-m21-paths.sh"

LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
LISTEN_PORT="${LISTEN_PORT:-18080}"
POSTGRES_LOCAL_PORT="${POSTGRES_LOCAL_PORT:-15432}"
NAMESPACE="${NAMESPACE:-epydios-system}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-epydios-postgres-rw}"
POSTGRES_DB="${POSTGRES_DB:-aios_core}"
POSTGRES_SECRET="${POSTGRES_SECRET:-epydios-postgres-app}"
REF_VALUES_PATH="${RUNTIME_REF_VALUES_PATH:-}"
REF_VALUES_JSON="${RUNTIME_REF_VALUES_JSON:-}"
MANAGED_CODEX_MODE="${RUNTIME_MANAGED_CODEX_MODE:-process}"
CODEX_CLI_PATH="${RUNTIME_CODEX_CLI_PATH:-/Applications/Codex.app/Contents/Resources/codex}"
CODEX_WORKDIR="${RUNTIME_CODEX_WORKDIR:-$(cd "${MODULE_ROOT}/../.." && pwd)}"
CODEX_SANDBOX_MODE="${RUNTIME_CODEX_SANDBOX_MODE:-workspace-write}"
CODEX_EXEC_TIMEOUT="${RUNTIME_CODEX_EXEC_TIMEOUT:-45s}"

usage() {
  cat <<'EOF'
Usage: run-local-runtime-macos.sh [options]

Runs the repo runtime locally on macOS so browser live mode can exercise the
current repo contract and the managed Codex process bridge on the same host.

Options:
  --host HOST                 Runtime bind host (default: 127.0.0.1)
  --port PORT                 Runtime bind port (default: 18080)
  --postgres-port PORT        Local Postgres port-forward port (default: 15432)
  --namespace NAME            Kubernetes namespace (default: epydios-system)
  --postgres-service NAME     Postgres service name (default: epydios-postgres-rw)
  --postgres-db NAME          Postgres database (default: aios_core)
  --postgres-secret NAME      Secret with username/password (default: epydios-postgres-app)
  --ref-values-path PATH      JSON file mapping ref:// values to concrete values
  --ref-values-json JSON      Inline JSON object for ref:// resolution
  --managed-codex-mode MODE   legacy|process (default: process)
  --codex-cli-path PATH       Local Codex CLI path (default: /Applications/Codex.app/Contents/Resources/codex)
  --codex-workdir PATH        Managed Codex workdir (default: repo root)
  --codex-sandbox-mode MODE   Sandbox mode (default: workspace-write)
  --codex-exec-timeout DUR    Managed Codex exec timeout (default: 45s)
  -h, --help                  Show usage
EOF
}

require_cmd() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1 || {
    echo "Missing required command: ${cmd}" >&2
    exit 1
  }
}

decode_base64() {
  if base64 --help >/dev/null 2>&1; then
    base64 --decode
    return
  fi
  base64 -D
}

secret_value() {
  local secret_name="$1"
  local key="$2"
  local encoded=""
  encoded="$(kubectl -n "${NAMESPACE}" get secret "${secret_name}" -o "jsonpath={.data.${key}}" 2>/dev/null || true)"
  if [[ -z "${encoded}" ]]; then
    echo "Missing secret value: ${secret_name}.${key}" >&2
    exit 1
  fi
  printf "%s" "${encoded}" | decode_base64
}

wait_for_tcp() {
  local host="$1"
  local port="$2"
  local label="$3"
  for _ in $(seq 1 30); do
    if nc -z "${host}" "${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "${label} did not become ready on ${host}:${port}" >&2
  return 1
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local log_path="$3"
  for _ in $(seq 1 45); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "${label} did not become ready at ${url}" >&2
  if [[ -f "${log_path}" ]]; then
    tail -n 80 "${log_path}" >&2 || true
  fi
  return 1
}

check_port_available() {
  local port="$1"
  local label="$2"
  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "${label} port ${port} is already in use." >&2
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >&2 || true
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      LISTEN_HOST="${2:-}"
      shift 2
      ;;
    --port)
      LISTEN_PORT="${2:-}"
      shift 2
      ;;
    --postgres-port)
      POSTGRES_LOCAL_PORT="${2:-}"
      shift 2
      ;;
    --namespace)
      NAMESPACE="${2:-}"
      shift 2
      ;;
    --postgres-service)
      POSTGRES_SERVICE="${2:-}"
      shift 2
      ;;
    --postgres-db)
      POSTGRES_DB="${2:-}"
      shift 2
      ;;
    --postgres-secret)
      POSTGRES_SECRET="${2:-}"
      shift 2
      ;;
    --ref-values-path)
      REF_VALUES_PATH="${2:-}"
      shift 2
      ;;
    --ref-values-json)
      REF_VALUES_JSON="${2:-}"
      shift 2
      ;;
    --managed-codex-mode)
      MANAGED_CODEX_MODE="${2:-}"
      shift 2
      ;;
    --codex-cli-path)
      CODEX_CLI_PATH="${2:-}"
      shift 2
      ;;
    --codex-workdir)
      CODEX_WORKDIR="${2:-}"
      shift 2
      ;;
    --codex-sandbox-mode)
      CODEX_SANDBOX_MODE="${2:-}"
      shift 2
      ;;
    --codex-exec-timeout)
      CODEX_EXEC_TIMEOUT="${2:-}"
      shift 2
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

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "run-local-runtime-macos.sh is for macOS hosts only." >&2
  exit 1
fi

require_cmd kubectl
require_cmd go
require_cmd curl
require_cmd nc
require_cmd jq

kubectl config current-context >/dev/null 2>&1 || {
  echo "kubectl context is not configured." >&2
  exit 1
}

kubectl -n "${NAMESPACE}" get svc "${POSTGRES_SERVICE}" >/dev/null 2>&1 || {
  echo "Missing service: ${NAMESPACE}/${POSTGRES_SERVICE}" >&2
  exit 1
}

kubectl -n "${NAMESPACE}" get secret "${POSTGRES_SECRET}" >/dev/null 2>&1 || {
  echo "Missing secret: ${NAMESPACE}/${POSTGRES_SECRET}" >&2
  exit 1
}

if [[ "${MANAGED_CODEX_MODE}" == "process" && ! -x "${CODEX_CLI_PATH}" ]]; then
  echo "Managed Codex process mode requires an executable Codex CLI path." >&2
  echo "missing_path=${CODEX_CLI_PATH}" >&2
  exit 1
fi

check_port_available "${LISTEN_PORT}" "Local runtime"
check_port_available "${POSTGRES_LOCAL_PORT}" "Local Postgres"

SESSION_ROOT="$(m21_local_runtime_session_root)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SESSION_DIR="${SESSION_ROOT}/${STAMP}"
mkdir -p "${SESSION_DIR}" "$(m21_go_cache_root)" "$(m21_go_mod_cache_root)" "$(m21_local_runtime_bin_root)"

POSTGRES_PORT_FORWARD_LOG="${SESSION_DIR}/postgres-port-forward.log"
RUNTIME_LOG="${SESSION_DIR}/runtime.log"
RUNTIME_BINARY="$(m21_local_runtime_binary_path)"
RUNTIME_PID=""
PORT_FORWARD_PID=""
TAIL_PID=""

cleanup() {
  if [[ -n "${TAIL_PID}" ]] && kill -0 "${TAIL_PID}" >/dev/null 2>&1; then
    kill "${TAIL_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${RUNTIME_PID}" ]] && kill -0 "${RUNTIME_PID}" >/dev/null 2>&1; then
    kill "${RUNTIME_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${PORT_FORWARD_PID}" ]] && kill -0 "${PORT_FORWARD_PID}" >/dev/null 2>&1; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

POSTGRES_USER="$(secret_value "${POSTGRES_SECRET}" username)"
POSTGRES_PASSWORD="$(secret_value "${POSTGRES_SECRET}" password)"

kubectl -n "${NAMESPACE}" port-forward "svc/${POSTGRES_SERVICE}" "${POSTGRES_LOCAL_PORT}:5432" > "${POSTGRES_PORT_FORWARD_LOG}" 2>&1 &
PORT_FORWARD_PID="$!"
wait_for_tcp "127.0.0.1" "${POSTGRES_LOCAL_PORT}" "Postgres port-forward" || {
  tail -n 80 "${POSTGRES_PORT_FORWARD_LOG}" >&2 || true
  exit 1
}

export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}"
export GOCACHE="$(m21_go_cache_root)"
export GOMODCACHE="$(m21_go_mod_cache_root)"

(
  cd "${M21_REPO_ROOT}"
  go build -buildvcs=false -o "${RUNTIME_BINARY}" ./cmd/control-plane-runtime >/dev/null
)

echo "Starting local runtime with live repo contract"
echo "  runtime_url=http://${LISTEN_HOST}:${LISTEN_PORT}"
echo "  runtime_log=${RUNTIME_LOG}"
echo "  postgres_port_forward_log=${POSTGRES_PORT_FORWARD_LOG}"
echo "  session_dir=${SESSION_DIR}"
echo "  codex_mode=${MANAGED_CODEX_MODE}"
echo "  codex_cli_path=${CODEX_CLI_PATH}"
echo "  codex_workdir=${CODEX_WORKDIR}"

(
  export NAMESPACE="${NAMESPACE}"
  export POSTGRES_HOST="127.0.0.1"
  export POSTGRES_PORT="${POSTGRES_LOCAL_PORT}"
  export POSTGRES_DB="${POSTGRES_DB}"
  export POSTGRES_USER="${POSTGRES_USER}"
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
  export POSTGRES_SSLMODE="disable"
  export RUNTIME_REF_VALUES_PATH="${REF_VALUES_PATH}"
  export RUNTIME_REF_VALUES_JSON="${REF_VALUES_JSON}"
  export RUNTIME_MANAGED_CODEX_MODE="${MANAGED_CODEX_MODE}"
  export RUNTIME_CODEX_CLI_PATH="${CODEX_CLI_PATH}"
  export RUNTIME_CODEX_WORKDIR="${CODEX_WORKDIR}"
  export RUNTIME_CODEX_SANDBOX_MODE="${CODEX_SANDBOX_MODE}"
  export RUNTIME_CODEX_EXEC_TIMEOUT="${CODEX_EXEC_TIMEOUT}"
  exec "${RUNTIME_BINARY}" \
    --listen=":${LISTEN_PORT}" \
    --namespace="${NAMESPACE}" \
    --postgres-host="127.0.0.1" \
    --postgres-port="${POSTGRES_LOCAL_PORT}" \
    --postgres-db="${POSTGRES_DB}" \
    --postgres-user="${POSTGRES_USER}" \
    --postgres-password="${POSTGRES_PASSWORD}" \
    --postgres-sslmode="disable"
) > "${RUNTIME_LOG}" 2>&1 &
RUNTIME_PID="$!"

wait_for_http "http://${LISTEN_HOST}:${LISTEN_PORT}/healthz" "Local runtime" "${RUNTIME_LOG}"

echo
echo "Runtime is ready."
echo "Next in another terminal:"
echo "  cd \"${MODULE_ROOT}\""
echo "  ./bin/run-macos-local.sh --mode live --runtime-base-url \"http://${LISTEN_HOST}:${LISTEN_PORT}\""
echo
echo "Press Ctrl+C to stop the local runtime and Postgres port-forward."

tail -n 40 -f "${RUNTIME_LOG}" &
TAIL_PID="$!"

wait "${RUNTIME_PID}"
