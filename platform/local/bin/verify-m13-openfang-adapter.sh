#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

DEFAULT_PROVIDER="${REPO_ROOT}/platform/provider-manifests/oss-desktop-openfang/extensionprovider.yaml"
DEFAULT_CONFIGMAP="${REPO_ROOT}/platform/provider-manifests/oss-desktop-openfang/configmap.yaml"
SECURE_EXAMPLE="${REPO_ROOT}/examples/providers/extensionprovider-oss-desktop-openfang-mtls-bearer.yaml"

assert_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! rg -q -U "${pattern}" "${file}"; then
    echo "M13 openfang verifier failed: ${message}" >&2
    echo "  file=${file}" >&2
    exit 1
  fi
}

echo "Running M13 Openfang adapter verifier (linux+sandbox defaults, secure profile template, host restriction)..."

if [ ! -f "${DEFAULT_PROVIDER}" ]; then
  echo "M13 openfang verifier failed: missing provider manifest ${DEFAULT_PROVIDER}" >&2
  exit 1
fi
if [ ! -f "${DEFAULT_CONFIGMAP}" ]; then
  echo "M13 openfang verifier failed: missing configmap ${DEFAULT_CONFIGMAP}" >&2
  exit 1
fi
if [ ! -f "${SECURE_EXAMPLE}" ]; then
  echo "M13 openfang verifier failed: missing secure example ${SECURE_EXAMPLE}" >&2
  exit 1
fi

assert_pattern "${DEFAULT_PROVIDER}" 'providerType:\s+DesktopProvider' "default providerType must be DesktopProvider"
assert_pattern "${DEFAULT_PROVIDER}" 'providerId:\s+oss-desktop-openfang-linux' "default providerId must match openfang Linux adapter"
assert_pattern "${DEFAULT_PROVIDER}" 'mode:\s+None' "default provider auth mode must be None"
assert_pattern "${DEFAULT_PROVIDER}" 'enabled:\s+false' "default provider selection must remain disabled"

assert_pattern "${DEFAULT_CONFIGMAP}" '"targetOS":\s*"linux"' "default config must remain Linux-first"
assert_pattern "${DEFAULT_CONFIGMAP}" '"allowRestrictedHost":\s*false' "restricted host must remain blocked by default"
assert_pattern "${DEFAULT_CONFIGMAP}" '"enabled":\s*false' "upstream forwarding must remain disabled by default"

assert_pattern "${SECURE_EXAMPLE}" 'mode:\s+MTLSAndBearerTokenSecret' "secure example must require MTLSAndBearerTokenSecret"
assert_pattern "${SECURE_EXAMPLE}" 'enabled:\s+false' "secure example must stay disabled by default"
assert_pattern "${SECURE_EXAMPLE}" 'epydios\.ai/desktop-autonomy-profile:\s+sandbox_vm_autonomous' "secure example must declare sandbox profile"
assert_pattern "${SECURE_EXAMPLE}" 'epydios\.ai/restricted-host-policy:\s+blocked-by-default' "secure example must keep restricted_host blocked-by-default"
assert_pattern "${SECURE_EXAMPLE}" 'bearerTokenSecretRef:' "secure example must include bearer token reference block"
assert_pattern "${SECURE_EXAMPLE}" 'name:\s+openfang-desktop-provider-auth' "secure example must include bearer token secret name"
assert_pattern "${SECURE_EXAMPLE}" 'key:\s+token' "secure example must include bearer token secret key"
assert_pattern "${SECURE_EXAMPLE}" 'clientTLSSecretRef:' "secure example must include client TLS reference block"
assert_pattern "${SECURE_EXAMPLE}" 'name:\s+epydios-control-plane-client-tls' "secure example must include client TLS secret name"
assert_pattern "${SECURE_EXAMPLE}" 'caSecretRef:' "secure example must include CA reference block"
assert_pattern "${SECURE_EXAMPLE}" 'name:\s+openfang-desktop-provider-ca' "secure example must include CA secret name"

(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./cmd/desktop-provider-openfang -run 'TestEvaluateStepRestrictedHostBlockedByDefault|TestHandleObserveUpstreamNotConfigured|TestHandleActuateNoAction|TestHandleObserveUpstreamHTTP4xxMappedToRejected|TestHandleObserveUpstreamHTTP5xxMappedToError|TestHandleObserveUpstreamTimeoutMappedToTimeout' >/dev/null
)

echo "M13 Openfang adapter verifier passed (linux-first + sandbox-first + secure-template + restricted-host-blocked)."
