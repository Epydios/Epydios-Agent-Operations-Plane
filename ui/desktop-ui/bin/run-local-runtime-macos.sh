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
EFFECTIVE_REF_VALUES_PATH=""
SYNTHESIZED_REF_KEYS=()
SECURE_REF_STORE_JSON="{}"
CODEX_HOME_DIR=""
MANAGED_CODEX_MODE="${RUNTIME_MANAGED_CODEX_MODE:-process}"
CODEX_CLI_PATH="${RUNTIME_CODEX_CLI_PATH:-/Applications/Codex.app/Contents/Resources/codex}"
CODEX_WORKDIR="${RUNTIME_CODEX_WORKDIR:-$(cd "${MODULE_ROOT}/../.." && pwd)}"
CODEX_SANDBOX_MODE="${RUNTIME_CODEX_SANDBOX_MODE:-read-only}"
CODEX_EXEC_TIMEOUT="${RUNTIME_CODEX_EXEC_TIMEOUT:-45s}"
LOCAL_REF_VAULT_SERVICE="$(m21_local_ref_vault_service_name)"
LOCAL_REF_VAULT_INDEX_PATH="$(m21_local_ref_vault_index_path)"
LOCAL_REF_VAULT_EXPORT_PATH="$(m21_local_ref_vault_export_path)"
LOCAL_AIMXS_PROVIDER_OVERRIDE_PATH="$(m21_local_aimxs_provider_override_path)"

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
  --codex-sandbox-mode MODE   Sandbox mode (default: read-only)
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

bootstrap_codex_home() {
  local openai_api_key=""
  if [[ "${MANAGED_CODEX_MODE}" != "process" ]]; then
    return 0
  fi
  openai_api_key="$(jq -r '."ref://projects/{projectId}/providers/openai-compatible/api-key" // ."ref://projects/{projectId}/providers/openai/api-key" // empty' "${EFFECTIVE_REF_VALUES_PATH}")"
  if [[ -z "${openai_api_key}" ]]; then
    echo "Managed Codex process mode requires an OpenAI API key in the ref values." >&2
    exit 1
  fi
  CODEX_HOME_DIR="${SESSION_DIR}/codex-home"
  mkdir -p "${CODEX_HOME_DIR}"
  printf "%s" "${openai_api_key}" | CODEX_HOME="${CODEX_HOME_DIR}" "${CODEX_CLI_PATH}" login -c 'cli_auth_credentials_store="file"' --with-api-key >/dev/null
}

join_by() {
  local delimiter="$1"
  shift
  local first=1
  local item=""
  for item in "$@"; do
    if [[ ${first} -eq 1 ]]; then
      printf "%s" "${item}"
      first=0
    else
      printf "%s%s" "${delimiter}" "${item}"
    fi
  done
}

load_ref_values_json() {
  if [[ -n "${REF_VALUES_PATH}" ]]; then
    jq -c . "${REF_VALUES_PATH}"
    return
  fi
  if [[ -n "${REF_VALUES_JSON}" ]]; then
    printf "%s" "${REF_VALUES_JSON}" | jq -c .
    return
  fi
  printf "{}"
}

load_secure_ref_values_json() {
  local payload="{}"
  local value=""
  local ref=""
  if [[ ! -f "${LOCAL_REF_VAULT_INDEX_PATH}" ]]; then
    printf "{}"
    return
  fi
  if ! command -v security >/dev/null 2>&1; then
    printf "{}"
    return
  fi
  while IFS= read -r ref; do
    [[ -n "${ref}" ]] || continue
    value="$(security find-generic-password -a "${ref}" -s "${LOCAL_REF_VAULT_SERVICE}" -w 2>/dev/null || true)"
    if [[ -z "${value}" ]]; then
      continue
    fi
    payload="$(printf "%s" "${payload}" | jq -c --arg ref "${ref}" --arg value "${value}" '. + {($ref): $value}')"
  done < <(jq -r '.entries[]?.ref // empty' "${LOCAL_REF_VAULT_INDEX_PATH}" 2>/dev/null)
  printf "%s" "${payload}"
}

prepare_effective_ref_values() {
  local source_json=""
  local secure_json=""
  local merged_json=""
  local openai_api_key=""
  source_json="$(load_ref_values_json)"
  secure_json="$(load_secure_ref_values_json)"
  SECURE_REF_STORE_JSON="${secure_json}"
  merged_json="$(jq -cn --argjson source "${source_json}" --argjson secure "${secure_json}" '$source * $secure')"
  SYNTHESIZED_REF_KEYS=()

  if [[ "${MANAGED_CODEX_MODE}" == "process" ]]; then
    openai_api_key="$(printf "%s" "${source_json}" | jq -r '."ref://projects/{projectId}/providers/openai-compatible/api-key" // ."ref://projects/{projectId}/providers/openai/api-key" // empty')"
    if [[ -n "${openai_api_key}" ]]; then
      if [[ "$(printf "%s" "${merged_json}" | jq -r '."ref://gateways/litellm/openai-compatible" // empty')" == "" ]]; then
        SYNTHESIZED_REF_KEYS+=("ref://gateways/litellm/openai-compatible")
      fi
      if [[ "$(printf "%s" "${merged_json}" | jq -r '."ref://gateways/litellm/openai" // empty')" == "" ]]; then
        SYNTHESIZED_REF_KEYS+=("ref://gateways/litellm/openai")
      fi
      if [[ "$(printf "%s" "${merged_json}" | jq -r '."ref://projects/{projectId}/gateways/litellm/bearer-token" // empty')" == "" ]]; then
        SYNTHESIZED_REF_KEYS+=("ref://projects/{projectId}/gateways/litellm/bearer-token")
      fi
      merged_json="$(printf "%s" "${merged_json}" | jq -c --arg openai_base_url "https://api.openai.com" --arg openai_key "${openai_api_key}" '
        if has("ref://gateways/litellm/openai-compatible") then . else . + {"ref://gateways/litellm/openai-compatible": $openai_base_url} end
        | if has("ref://gateways/litellm/openai") then . else . + {"ref://gateways/litellm/openai": $openai_base_url} end
        | if has("ref://projects/{projectId}/gateways/litellm/bearer-token") then . else . + {"ref://projects/{projectId}/gateways/litellm/bearer-token": $openai_key} end
      ')"
    fi
  fi

  EFFECTIVE_REF_VALUES_PATH="${SESSION_DIR}/effective-ref-values.json"
  printf "%s\n" "${merged_json}" > "${EFFECTIVE_REF_VALUES_PATH}"
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
mkdir -p "$(m21_local_ref_vault_root)"
mkdir -p "$(m21_local_aimxs_root)"

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

prepare_effective_ref_values

bootstrap_codex_home

(
  cd "${M21_REPO_ROOT}"
  go build -buildvcs=false -o "${RUNTIME_BINARY}" ./cmd/control-plane-runtime >/dev/null
)

echo "Starting local runtime with live repo contract"
echo "  runtime_url=http://${LISTEN_HOST}:${LISTEN_PORT}"
echo "  runtime_log=${RUNTIME_LOG}"
echo "  postgres_port_forward_log=${POSTGRES_PORT_FORWARD_LOG}"
echo "  session_dir=${SESSION_DIR}"
echo "  effective_ref_values=${EFFECTIVE_REF_VALUES_PATH}"
echo "  secure_ref_vault_index=${LOCAL_REF_VAULT_INDEX_PATH}"
echo "  secure_ref_vault_export=${LOCAL_REF_VAULT_EXPORT_PATH}"
echo "  local_policy_provider_override=${LOCAL_AIMXS_PROVIDER_OVERRIDE_PATH}"
echo "  codex_mode=${MANAGED_CODEX_MODE}"
echo "  codex_cli_path=${CODEX_CLI_PATH}"
if [[ -n "${CODEX_HOME_DIR}" ]]; then
  echo "  codex_home=${CODEX_HOME_DIR}"
fi
echo "  codex_workdir=${CODEX_WORKDIR}"
if [[ ${#SYNTHESIZED_REF_KEYS[@]} -gt 0 ]]; then
  echo "  synthesized_ref_values=$(join_by ', ' "${SYNTHESIZED_REF_KEYS[@]}")"
fi

(
  export NAMESPACE="${NAMESPACE}"
  export POSTGRES_HOST="127.0.0.1"
  export POSTGRES_PORT="${POSTGRES_LOCAL_PORT}"
  export POSTGRES_DB="${POSTGRES_DB}"
  export POSTGRES_USER="${POSTGRES_USER}"
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
  export POSTGRES_SSLMODE="disable"
  export RUNTIME_REF_VALUES_PATH="${EFFECTIVE_REF_VALUES_PATH}"
  export RUNTIME_REF_VALUES_JSON=""
  export RUNTIME_POLICY_PROVIDER_OVERRIDE_PATH="${LOCAL_AIMXS_PROVIDER_OVERRIDE_PATH}"
  export RUNTIME_MANAGED_CODEX_MODE="${MANAGED_CODEX_MODE}"
  export RUNTIME_CODEX_CLI_PATH="${CODEX_CLI_PATH}"
  export RUNTIME_CODEX_HOME="${CODEX_HOME_DIR}"
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
    --postgres-sslmode="disable" \
    --runtime-policy-provider-override-path="${LOCAL_AIMXS_PROVIDER_OVERRIDE_PATH}"
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
