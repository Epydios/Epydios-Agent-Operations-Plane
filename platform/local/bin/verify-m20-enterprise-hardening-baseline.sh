#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

cd "${REPO_ROOT}"

echo "[m20] validating runtime policy-pack and worker-capability catalogs"
GOCACHE="${GOCACHE:-/tmp/go-build}" go test ./internal/runtime

echo "[m20] validating shared enterprise report envelope and ingress reporting clients"
GOCACHE="${GOCACHE:-/tmp/go-build}" go test ./clients/internal/runtimeclient ./clients/workflow-agentops ./clients/chatops-agentops

echo "M20 enterprise hardening baseline validation passed."
