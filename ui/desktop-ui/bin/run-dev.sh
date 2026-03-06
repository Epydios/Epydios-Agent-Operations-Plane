#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PORT="${PORT:-4173}"
HOST="${HOST:-127.0.0.1}"

echo "Serving Epydios AgentOps Desktop on http://${HOST}:${PORT}"
exec python3 -m http.server "${PORT}" --bind "${HOST}" --directory "${MODULE_ROOT}/web"
