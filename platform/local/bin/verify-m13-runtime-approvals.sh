#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

echo "Running M13 runtime approvals verifier (queue + decision + expiry semantics)..."
(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./internal/runtime -run 'TestRuntimeApprovalQueueEndpoint|TestRuntimeApprovalDecisionApprove|TestRuntimeApprovalDecisionDeny|TestRuntimeApprovalDecisionExpiredRejected'
)

echo "M13 runtime approvals verifier passed (GET/POST approvals contract + PENDING/APPROVED/DENIED/EXPIRED state handling)."
