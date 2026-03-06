#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

echo "Running M14 runtime terminal integration verifier (runtime endpoint + restricted_host deny)..."
(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./internal/runtime -run 'TestRuntimeTerminalSessionCreateExecutesCommand|TestRuntimeTerminalSessionCreateBlocksRestrictedHostRequest|TestRuntimeTerminalSessionCreateRejectsDisallowedCommand|TestRuntimeTerminalSessionCreateRequiresExistingRun'
)

echo "M14 runtime terminal integration verifier passed (runtime endpoint execution + restricted_host deny assertion)."
