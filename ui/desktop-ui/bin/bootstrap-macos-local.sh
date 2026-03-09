#!/usr/bin/env bash
set -euo pipefail

MODE="mock"

usage() {
  cat <<'EOF'
Usage: bootstrap-macos-local.sh [--mode mock|live]

Checks local prerequisites for running Epydios AgentOps Desktop on macOS.

Modes:
  mock  UI-only path, no cluster/API dependency required (default)
  live  UI + local runtime API path (requires kubectl access to epydios-system)
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

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "bootstrap-macos-local: host is not macOS (continuing anyway)." >&2
fi

require_cmd python3
require_cmd curl

if [[ "${MODE}" == "live" ]]; then
  require_cmd kubectl
  require_cmd jq

  kubectl config current-context >/dev/null 2>&1 || {
    echo "kubectl context is not configured." >&2
    exit 1
  }

  runtime_service="$(kubectl -n epydios-system get svc orchestration-runtime -o name 2>/dev/null || true)"
  [[ -n "${runtime_service}" ]] || {
    echo "Missing service: epydios-system/orchestration-runtime" >&2
    exit 1
  }
fi

echo "bootstrap-macos-local PASS (mode=${MODE})"
