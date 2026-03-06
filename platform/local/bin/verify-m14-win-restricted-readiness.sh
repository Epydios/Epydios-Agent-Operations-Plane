#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

WINDOWS_EXAMPLE="${REPO_ROOT}/examples/providers/extensionprovider-oss-desktop-openfang-windows-restricted.yaml"

assert_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! rg -q -U "${pattern}" "${file}"; then
    echo "M14 Windows restricted readiness verifier failed: ${message}" >&2
    echo "  file=${file}" >&2
    exit 1
  fi
}

echo "Running M14 Windows restricted readiness verifier (V-M14-WIN-001)..."

if [ ! -f "${WINDOWS_EXAMPLE}" ]; then
  echo "M14 Windows restricted readiness verifier failed: missing windows restricted example ${WINDOWS_EXAMPLE}" >&2
  exit 1
fi

assert_pattern "${WINDOWS_EXAMPLE}" 'providerType:\s+DesktopProvider' "providerType must be DesktopProvider"
assert_pattern "${WINDOWS_EXAMPLE}" 'providerId:\s+oss-desktop-openfang-windows' "providerId must remain oss-desktop-openfang-windows"
assert_pattern "${WINDOWS_EXAMPLE}" 'mode:\s+MTLSAndBearerTokenSecret' "restricted template must require MTLSAndBearerTokenSecret auth mode"
assert_pattern "${WINDOWS_EXAMPLE}" 'enabled:\s+false' "selection.enabled must remain false for restricted-readiness scaffold"
assert_pattern "${WINDOWS_EXAMPLE}" 'epydios\.ai/target-os:\s+windows' "target-os annotation must remain windows"
assert_pattern "${WINDOWS_EXAMPLE}" 'epydios\.ai/desktop-autonomy-profile:\s+restricted_host_plus_vm_profile' "autonomy profile annotation must remain restricted_host_plus_vm_profile"
assert_pattern "${WINDOWS_EXAMPLE}" 'epydios\.ai/restricted-host-policy:\s+blocked-by-default' "restricted-host policy annotation must remain blocked-by-default"
assert_pattern "${WINDOWS_EXAMPLE}" 'epydios\.ai/activation:\s+m14-restricted-readiness-only' "activation annotation must remain restricted-readiness only"

(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./internal/runtime -run 'TestDeriveDesktopExecutionPlanAllowsNonLinuxWhenEnabled|TestDeriveDesktopExecutionPlanRejectsNonLinuxByDefault|TestDeriveDesktopExecutionPlanRestrictedHostRequiresOptIn' >/dev/null
  GOCACHE="${LOCAL_GO_CACHE}" go test ./cmd/desktop-provider-openfang -run 'TestEvaluateStepRejectsWindowsTargetOnLinuxAdapter|TestEvaluateStepRestrictedHostBlockedByDefault' >/dev/null
)

echo "M14 Windows restricted readiness verifier passed (V-M14-WIN-001)."
