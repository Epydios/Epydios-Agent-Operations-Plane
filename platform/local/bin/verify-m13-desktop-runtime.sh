#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

echo "Running M13 desktop runtime verifier (Linux-first tiering/autonomy guardrails)..."
(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./internal/runtime -run 'TestDeriveDesktopExecutionPlanDefaults|TestDeriveDesktopExecutionPlanTier1SkipsDesktopPath|TestDeriveDesktopExecutionPlanAllowsNonLinuxWhenEnabled|TestDeriveDesktopExecutionPlanRejectsNonLinuxByDefault|TestDeriveDesktopExecutionPlanRestrictedHostRequiresOptIn|TestDeriveDesktopExecutionPlanRestrictedHostWithOptInPasses|TestDeriveDesktopExecutionPlanTier3RequiresApprovalAndGrant|TestValidateDesktopDecision|TestValidateDesktopEvidence'
)

echo "M13 desktop runtime verifier passed (tiering + Linux-first + restricted-host opt-in + tier3 grant/approval)."
