#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

echo "Running M13 Openfang runtime integration verifier (observe -> actuate -> verify + restricted_host deny)..."
(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./internal/runtime -run 'TestExecuteRunOpenfangSandboxPath|TestExecuteRunOpenfangRestrictedHostDenied'
  GOCACHE="${LOCAL_GO_CACHE}" go test ./cmd/desktop-provider-openfang -run 'TestRuntimeExecuteRunThroughOpenfangAdapterSandboxPath|TestRuntimeExecuteRunThroughOpenfangAdapterRestrictedHostDenied'
)

echo "M13 Openfang runtime integration verifier passed (runtime->adapter->upstream sandbox path + restricted_host deny assertion)."
