#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

NODE_BIN="${NODE_BIN:-}"
if [ -z "${NODE_BIN}" ]; then
  NODE_BIN="$(command -v node || true)"
fi
if [ -z "${NODE_BIN}" ] && [ -x "${HOME}/bin/node" ]; then
  NODE_BIN="${HOME}/bin/node"
fi
if [ -z "${NODE_BIN}" ]; then
  echo "node is required for M19 exit-gate validation" >&2
  exit 1
fi

cd "${REPO_ROOT}"

echo "[m19] validating VS Code governed review/follow packaging"
"${NODE_BIN}" --test ./clients/vscode-agentops/test/*.test.js

echo "[m19] validating desktop chat native review/follow packaging"
"${NODE_BIN}" --test ./ui/desktop-ui/web/js/test/*.test.js

echo "[m19] validating shared Go ingress clients"
GOCACHE="${GOCACHE:-/tmp/go-build}" go test ./clients/internal/runtimeclient ./clients/cli-agentops ./clients/workflow-agentops ./clients/chatops-agentops

echo "M19 enterprise ingress exit-gate validation passed."
