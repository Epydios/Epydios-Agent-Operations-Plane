#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

echo "Running M14 runtime integration settings verifier (project-scoped endpoint contract + deny paths)..."
(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./internal/runtime -run 'TestRuntimeIntegrationSettingsPutGetRoundTrip|TestRuntimeIntegrationSettingsPutRejectsInvalidReference|TestRuntimeIntegrationSettingsPutRejectsRawSecretLikeValues|TestRuntimeIntegrationSettingsPutScopeMismatchDenied|TestRuntimeIntegrationSettingsGetRequiresScope'
)

echo "M14 runtime integration settings verifier passed (GET/PUT endpoint + scope/authz/ref-validation deny paths)."
