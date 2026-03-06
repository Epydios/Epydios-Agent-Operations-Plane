#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
WORKSPACE_ROOT="$(cd "${REPO_ROOT}/.." && pwd)"
NON_GITHUB_ROOT="${NON_GITHUB_ROOT:-${WORKSPACE_ROOT}/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB}"
OUTPUT_DIR="${OUTPUT_DIR:-${NON_GITHUB_ROOT}/provenance/desktop-readiness}"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

WINDOWS_EXAMPLE="${REPO_ROOT}/examples/providers/extensionprovider-oss-desktop-openfang-windows-restricted.yaml"
MACOS_EXAMPLE="${REPO_ROOT}/examples/providers/extensionprovider-oss-desktop-openfang-macos-restricted.yaml"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "M14 cross-OS parity verifier failed: missing required command: $1" >&2
    exit 1
  }
}

assert_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! rg -q -U "${pattern}" "${file}"; then
    echo "M14 cross-OS parity verifier failed: ${message}" >&2
    echo "  file=${file}" >&2
    exit 1
  fi
}

extract_capabilities() {
  local file="$1"
  awk '
    /advertisedCapabilities:/ { in_caps=1; next }
    in_caps && /^[[:space:]]*-[[:space:]]*/ {
      sub(/^[[:space:]]*-[[:space:]]*/, "", $0)
      print $0
      next
    }
    in_caps { in_caps=0 }
  ' "${file}" | sort -u
}

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${path}" | awk '{print $1}'
  else
    shasum -a 256 "${path}" | awk '{print $1}'
  fi
}

echo "Running M14 cross-OS parity verifier (V-M14-XOS-001)..."

require_cmd jq
require_cmd rg

[ -f "${WINDOWS_EXAMPLE}" ] || {
  echo "M14 cross-OS parity verifier failed: missing windows example ${WINDOWS_EXAMPLE}" >&2
  exit 1
}
[ -f "${MACOS_EXAMPLE}" ] || {
  echo "M14 cross-OS parity verifier failed: missing macOS example ${MACOS_EXAMPLE}" >&2
  exit 1
}

"${SCRIPT_DIR}/verify-m14-win-restricted-readiness.sh"
"${SCRIPT_DIR}/verify-m14-mac-restricted-readiness.sh"

for file in "${WINDOWS_EXAMPLE}" "${MACOS_EXAMPLE}"; do
  assert_pattern "${file}" 'providerType:\s+DesktopProvider' "providerType must be DesktopProvider for ${file}"
  assert_pattern "${file}" 'contractVersion:\s+v1alpha1' "contractVersion must remain v1alpha1 for ${file}"
  assert_pattern "${file}" 'mode:\s+MTLSAndBearerTokenSecret' "auth mode must remain MTLSAndBearerTokenSecret for ${file}"
  assert_pattern "${file}" 'enabled:\s+false' "selection.enabled must remain false for ${file}"
  assert_pattern "${file}" 'timeoutSeconds:\s+10' "timeoutSeconds must remain 10 for ${file}"
  assert_pattern "${file}" 'healthPath:\s+/healthz' "healthPath must remain /healthz for ${file}"
  assert_pattern "${file}" 'capabilitiesPath:\s+/v1alpha1/capabilities' "capabilitiesPath must remain /v1alpha1/capabilities for ${file}"
  assert_pattern "${file}" 'epydios\.ai/restricted-host-policy:\s+blocked-by-default' "restricted-host policy annotation must remain blocked-by-default for ${file}"
done

windows_caps="$(extract_capabilities "${WINDOWS_EXAMPLE}")"
macos_caps="$(extract_capabilities "${MACOS_EXAMPLE}")"
if [ "${windows_caps}" != "${macos_caps}" ]; then
  echo "M14 cross-OS parity verifier failed: advertisedCapabilities mismatch between windows/macOS templates" >&2
  echo "--- windows capabilities ---" >&2
  printf '%s\n' "${windows_caps}" >&2
  echo "--- macOS capabilities ---" >&2
  printf '%s\n' "${macos_caps}" >&2
  exit 1
fi

(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./internal/runtime -run 'TestDeriveDesktopExecutionPlanAllowsNonLinuxWhenEnabled|TestDeriveDesktopExecutionPlanMacOSVerifierDefaultsWhenEnabled|TestDeriveDesktopExecutionPlanNormalizesWindowsTargetOS|TestDeriveDesktopExecutionPlanNormalizesMacOSTargetOS' >/dev/null
  GOCACHE="${LOCAL_GO_CACHE}" go test ./cmd/desktop-provider-openfang -run 'TestEvaluateStepRejectsWindowsTargetOnLinuxAdapter|TestEvaluateStepRejectsMacOSTargetOnLinuxAdapter' >/dev/null
)

mkdir -p "${OUTPUT_DIR}"
generated_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out_json="${OUTPUT_DIR}/m14-7-cross-os-readiness-${stamp}.json"
out_latest="${OUTPUT_DIR}/m14-7-cross-os-readiness-latest.json"
out_sha="${out_json}.sha256"

windows_sha="$(sha256_file "${WINDOWS_EXAMPLE}")"
macos_sha="$(sha256_file "${MACOS_EXAMPLE}")"

jq -n \
  --arg generated_utc "${generated_utc}" \
  --arg windows_example "${WINDOWS_EXAMPLE}" \
  --arg macos_example "${MACOS_EXAMPLE}" \
  --arg windows_sha "${windows_sha}" \
  --arg macos_sha "${macos_sha}" \
  --arg out_json "${out_json}" \
  --arg out_sha "${out_sha}" \
  '{
    schema_version: 1,
    milestone: "M14.7",
    verifier_ids: ["V-M14-WIN-001", "V-M14-MAC-001", "V-M14-XOS-001"],
    generated_utc: $generated_utc,
    status: "pass",
    posture: {
      linux_primary_autonomous_target: true,
      windows_macos_restricted_readiness_only: true,
      restricted_host_blocked_by_default: true
    },
    parity_assertions: {
      advertised_capabilities_match: true,
      auth_mode_match: true,
      contract_version_match: true,
      endpoint_path_shape_match: true
    },
    artifacts: {
      windows_template: {
        path: $windows_example,
        sha256: $windows_sha
      },
      macos_template: {
        path: $macos_example,
        sha256: $macos_sha
      }
    },
    outputs: {
      evidence_json: $out_json,
      evidence_sha256_file: $out_sha
    }
  }' > "${out_json}"

cp "${out_json}" "${out_latest}"
sha256_file "${out_json}" > "${out_sha}"

echo "M14 cross-OS parity verifier passed (V-M14-XOS-001)."
echo "  evidence=${out_json}"
echo "  evidence_latest=${out_latest}"
echo "  evidence_sha256=${out_sha}"
