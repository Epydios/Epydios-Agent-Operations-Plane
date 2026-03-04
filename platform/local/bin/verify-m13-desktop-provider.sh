#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

CONTRACT_PATH="${CONTRACT_PATH:-${REPO_ROOT}/contracts/extensions/v1alpha1/provider-contracts.openapi.yaml}"
CRD_PATH="${CRD_PATH:-${REPO_ROOT}/contracts/extensions/v1alpha1/provider-registration-crd.yaml}"
FIXTURE_DIR="${FIXTURE_DIR:-${REPO_ROOT}/platform/tests/desktop-provider/requests}"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

echo "Running M13 desktop provider verifier (contract + deny-path/no-policy/no-action + evidence completeness)..."
(cd "${REPO_ROOT}" && GOCACHE="${LOCAL_GO_CACHE}" go run ./cmd/desktop-provider-check -repo-root "${REPO_ROOT}" -contract "${CONTRACT_PATH}" -crd "${CRD_PATH}" -fixtures "${FIXTURE_DIR}")
echo "M13 desktop provider verifier passed (V-M13-LNX-001/V-M13-LNX-002/V-M13-LNX-003)."

