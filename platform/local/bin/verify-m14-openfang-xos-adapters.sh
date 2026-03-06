#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

WINDOWS_CONFIG="${REPO_ROOT}/providers/desktop/openfang/config.windows.example.json"
MACOS_CONFIG="${REPO_ROOT}/providers/desktop/openfang/config.macos.example.json"
WINDOWS_PROVIDER="${REPO_ROOT}/platform/providers/oss-desktop-openfang/extensionprovider-windows-restricted.yaml"
MACOS_PROVIDER="${REPO_ROOT}/platform/providers/oss-desktop-openfang/extensionprovider-macos-restricted.yaml"

assert_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! rg -q -U "${pattern}" "${file}"; then
    echo "M14 Openfang cross-OS adapter verifier failed: ${message}" >&2
    echo "  file=${file}" >&2
    exit 1
  fi
}

echo "Running M14 Openfang cross-OS adapter verifier (V-M14-WIN-002/V-M14-MAC-002/V-M14-XOS-002)..."

[ -f "${WINDOWS_CONFIG}" ] || {
  echo "M14 Openfang cross-OS adapter verifier failed: missing windows config ${WINDOWS_CONFIG}" >&2
  exit 1
}
[ -f "${MACOS_CONFIG}" ] || {
  echo "M14 Openfang cross-OS adapter verifier failed: missing macOS config ${MACOS_CONFIG}" >&2
  exit 1
}
[ -f "${WINDOWS_PROVIDER}" ] || {
  echo "M14 Openfang cross-OS adapter verifier failed: missing windows provider scaffold ${WINDOWS_PROVIDER}" >&2
  exit 1
}
[ -f "${MACOS_PROVIDER}" ] || {
  echo "M14 Openfang cross-OS adapter verifier failed: missing macOS provider scaffold ${MACOS_PROVIDER}" >&2
  exit 1
}

assert_pattern "${WINDOWS_CONFIG}" '"providerId":\s*"oss-desktop-openfang-windows"' "windows providerId must match scaffold"
assert_pattern "${WINDOWS_CONFIG}" '"targetOS":\s*"windows"' "windows targetOS must remain windows"
assert_pattern "${WINDOWS_CONFIG}" '"allowRestrictedHost":\s*false' "windows restricted_host must remain blocked by default"
assert_pattern "${WINDOWS_CONFIG}" '"enabled":\s*false' "windows upstream forwarding must stay disabled by default"

assert_pattern "${MACOS_CONFIG}" '"providerId":\s*"oss-desktop-openfang-macos"' "macOS providerId must match scaffold"
assert_pattern "${MACOS_CONFIG}" '"targetOS":\s*"macos"' "macOS targetOS must remain macos"
assert_pattern "${MACOS_CONFIG}" '"allowRestrictedHost":\s*false' "macOS restricted_host must remain blocked by default"
assert_pattern "${MACOS_CONFIG}" '"enabled":\s*false' "macOS upstream forwarding must stay disabled by default"

assert_pattern "${WINDOWS_PROVIDER}" 'providerType:\s+DesktopProvider' "windows provider scaffold must remain DesktopProvider"
assert_pattern "${WINDOWS_PROVIDER}" 'providerId:\s+oss-desktop-openfang-windows' "windows providerId must remain oss-desktop-openfang-windows"
assert_pattern "${WINDOWS_PROVIDER}" 'mode:\s+MTLSAndBearerTokenSecret' "windows scaffold must require MTLSAndBearerTokenSecret"
assert_pattern "${WINDOWS_PROVIDER}" 'enabled:\s+false' "windows scaffold selection must remain disabled by default"
assert_pattern "${WINDOWS_PROVIDER}" 'epydios\.ai/target-os:\s+windows' "windows scaffold target-os annotation must remain windows"

assert_pattern "${MACOS_PROVIDER}" 'providerType:\s+DesktopProvider' "macOS provider scaffold must remain DesktopProvider"
assert_pattern "${MACOS_PROVIDER}" 'providerId:\s+oss-desktop-openfang-macos' "macOS providerId must remain oss-desktop-openfang-macos"
assert_pattern "${MACOS_PROVIDER}" 'mode:\s+MTLSAndBearerTokenSecret' "macOS scaffold must require MTLSAndBearerTokenSecret"
assert_pattern "${MACOS_PROVIDER}" 'enabled:\s+false' "macOS scaffold selection must remain disabled by default"
assert_pattern "${MACOS_PROVIDER}" 'epydios\.ai/target-os:\s+macos' "macOS scaffold target-os annotation must remain macos"

(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./internal/runtime -run 'TestExecuteRunOpenfangWindowsTargetSelectsWindowsProvider|TestExecuteRunOpenfangMacOSTargetSelectsMacOSProvider' >/dev/null
  GOCACHE="${LOCAL_GO_CACHE}" go test ./cmd/desktop-provider-openfang -run 'TestApplyDefaultsPreservesConfiguredTargetOS|TestEvaluateStepAllowsWindowsTargetOnWindowsAdapter|TestEvaluateStepAllowsMacOSTargetOnMacOSAdapter|TestEvaluateStepRestrictedHostBlockedByDefault' >/dev/null
)

echo "M14 Openfang cross-OS adapter verifier passed (V-M14-WIN-002/V-M14-MAC-002/V-M14-XOS-002)."
