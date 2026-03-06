#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
NAMESPACE="${NAMESPACE:-epydios-system}"

WINDOWS_PROVIDER="${REPO_ROOT}/platform/providers/oss-desktop-openfang/extensionprovider-windows-restricted.yaml"
MACOS_PROVIDER="${REPO_ROOT}/platform/providers/oss-desktop-openfang/extensionprovider-macos-restricted.yaml"
RUNBOOK_PATH="${REPO_ROOT}/docs/runbooks/openfang-secure-endpoint-activation.md"
WINDOWS_XOS_DEPLOYMENT="${REPO_ROOT}/platform/providers/oss-desktop-openfang/xos-secure/deployment-windows.yaml"
MACOS_XOS_DEPLOYMENT="${REPO_ROOT}/platform/providers/oss-desktop-openfang/xos-secure/deployment-macos.yaml"
WINDOWS_XOS_CONFIGMAP="${REPO_ROOT}/platform/providers/oss-desktop-openfang/xos-secure/configmap-windows.yaml"
MACOS_XOS_CONFIGMAP="${REPO_ROOT}/platform/providers/oss-desktop-openfang/xos-secure/configmap-macos.yaml"
XOS_KUSTOMIZATION="${REPO_ROOT}/platform/providers/oss-desktop-openfang/xos-secure/kustomization.yaml"

assert_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! rg -q -U "${pattern}" "${file}"; then
    echo "M14 Openfang enablement gate verifier failed: ${message}" >&2
    echo "  file=${file}" >&2
    exit 1
  fi
}

assert_secret_key_present() {
  local secret_name="$1"
  local key="$2"
  local value
  value="$(kubectl -n "${NAMESPACE}" get secret "${secret_name}" -o "jsonpath={.data.${key}}" 2>/dev/null || true)"
  if [ -z "${value}" ]; then
    echo "M14 Openfang enablement gate verifier failed: missing secret key ${NAMESPACE}/${secret_name}:${key}" >&2
    exit 1
  fi
}

assert_condition_true() {
  local provider="$1"
  local condition_type="$2"
  local value
  value="$(kubectl -n "${NAMESPACE}" get extensionprovider "${provider}" -o "jsonpath={.status.conditions[?(@.type=='${condition_type}')].status}" 2>/dev/null || true)"
  if [ "${value}" != "True" ]; then
    echo "M14 Openfang enablement gate verifier failed: condition ${provider}:${condition_type} expected True (got '${value}')" >&2
    exit 1
  fi
}

echo "Running M14 Openfang secure enablement gate verifier (V-M14-WIN-003/V-M14-MAC-003/V-M14-XOS-003)..."

[ -f "${WINDOWS_PROVIDER}" ] || {
  echo "M14 Openfang enablement gate verifier failed: missing windows provider scaffold ${WINDOWS_PROVIDER}" >&2
  exit 1
}
[ -f "${MACOS_PROVIDER}" ] || {
  echo "M14 Openfang enablement gate verifier failed: missing macOS provider scaffold ${MACOS_PROVIDER}" >&2
  exit 1
}
[ -f "${RUNBOOK_PATH}" ] || {
  echo "M14 Openfang enablement gate verifier failed: missing runbook ${RUNBOOK_PATH}" >&2
  exit 1
}
[ -f "${WINDOWS_XOS_DEPLOYMENT}" ] || {
  echo "M14 Openfang enablement gate verifier failed: missing windows xos deployment ${WINDOWS_XOS_DEPLOYMENT}" >&2
  exit 1
}
[ -f "${MACOS_XOS_DEPLOYMENT}" ] || {
  echo "M14 Openfang enablement gate verifier failed: missing macOS xos deployment ${MACOS_XOS_DEPLOYMENT}" >&2
  exit 1
}
[ -f "${WINDOWS_XOS_CONFIGMAP}" ] || {
  echo "M14 Openfang enablement gate verifier failed: missing windows xos configmap ${WINDOWS_XOS_CONFIGMAP}" >&2
  exit 1
}
[ -f "${MACOS_XOS_CONFIGMAP}" ] || {
  echo "M14 Openfang enablement gate verifier failed: missing macOS xos configmap ${MACOS_XOS_CONFIGMAP}" >&2
  exit 1
}
[ -f "${XOS_KUSTOMIZATION}" ] || {
  echo "M14 Openfang enablement gate verifier failed: missing xos secure kustomization ${XOS_KUSTOMIZATION}" >&2
  exit 1
}

for file in "${WINDOWS_PROVIDER}" "${MACOS_PROVIDER}"; do
  assert_pattern "${file}" 'providerType:\s+DesktopProvider' "providerType must be DesktopProvider"
  assert_pattern "${file}" 'contractVersion:\s+v1alpha1' "contractVersion must remain v1alpha1"
  assert_pattern "${file}" 'mode:\s+MTLSAndBearerTokenSecret' "auth mode must remain MTLSAndBearerTokenSecret"
  assert_pattern "${file}" 'enabled:\s+false' "selection.enabled must remain false until explicit activation"
  assert_pattern "${file}" 'bearerTokenSecretRef:' "bearerTokenSecretRef block is required"
  assert_pattern "${file}" 'name:\s+openfang-desktop-provider-auth' "bearer token secret name must remain openfang-desktop-provider-auth"
  assert_pattern "${file}" 'key:\s+token' "bearer token key must remain token"
  assert_pattern "${file}" 'clientTLSSecretRef:' "clientTLSSecretRef block is required"
  assert_pattern "${file}" 'name:\s+epydios-control-plane-client-tls' "client TLS secret name must remain epydios-control-plane-client-tls"
  assert_pattern "${file}" 'caSecretRef:' "caSecretRef block is required"
  assert_pattern "${file}" 'name:\s+openfang-desktop-provider-ca' "CA secret name must remain openfang-desktop-provider-ca"
  assert_pattern "${file}" 'healthPath:\s+/healthz' "healthPath must remain /healthz"
  assert_pattern "${file}" 'capabilitiesPath:\s+/v1alpha1/capabilities' "capabilitiesPath must remain /v1alpha1/capabilities"
  assert_pattern "${file}" 'epydios\.ai/desktop-autonomy-profile:\s+restricted_host_plus_vm_profile' "desktop autonomy profile must remain restricted_host_plus_vm_profile"
  assert_pattern "${file}" 'epydios\.ai/restricted-host-policy:\s+blocked-by-default' "restricted host must remain blocked-by-default"
  assert_pattern "${file}" 'epydios\.ai/activation:\s+m14-restricted-readiness-only' "activation annotation must remain restricted-readiness-only"
done

assert_pattern "${WINDOWS_PROVIDER}" 'epydios\.ai/target-os:\s+windows' "windows target-os annotation must remain windows"
assert_pattern "${MACOS_PROVIDER}" 'epydios\.ai/target-os:\s+macos' "macOS target-os annotation must remain macos"
assert_pattern "${WINDOWS_PROVIDER}" 'url:\s+https://openfang-provider-windows\.' "windows endpoint URL must remain https openfang-provider-windows"
assert_pattern "${MACOS_PROVIDER}" 'url:\s+https://openfang-provider-macos\.' "macOS endpoint URL must remain https openfang-provider-macos"
assert_pattern "${WINDOWS_XOS_DEPLOYMENT}" 'secretName:\s+openfang-provider-windows-server-tls' "windows deployment must mount windows server TLS secret"
assert_pattern "${MACOS_XOS_DEPLOYMENT}" 'secretName:\s+openfang-provider-macos-server-tls' "macOS deployment must mount macOS server TLS secret"
assert_pattern "${WINDOWS_XOS_DEPLOYMENT}" 'secretName:\s+openfang-desktop-provider-auth' "windows deployment must mount bearer secret"
assert_pattern "${MACOS_XOS_DEPLOYMENT}" 'secretName:\s+openfang-desktop-provider-auth' "macOS deployment must mount bearer secret"
assert_pattern "${WINDOWS_XOS_CONFIGMAP}" '"requireClientCert":\s*true' "windows config must require client cert"
assert_pattern "${WINDOWS_XOS_CONFIGMAP}" '"requireBearer":\s*true' "windows config must require bearer token"
assert_pattern "${MACOS_XOS_CONFIGMAP}" '"requireClientCert":\s*true' "macOS config must require client cert"
assert_pattern "${MACOS_XOS_CONFIGMAP}" '"requireBearer":\s*true' "macOS config must require bearer token"

assert_pattern "${RUNBOOK_PATH}" 'Enablement Gate Criteria' "runbook must define enablement gate criteria"
assert_pattern "${RUNBOOK_PATH}" 'selection\.enabled:\s+false' "runbook must enforce default disabled selection state"
assert_pattern "${RUNBOOK_PATH}" 'openfang-desktop-provider-auth' "runbook must include bearer secret reference"
assert_pattern "${RUNBOOK_PATH}" 'epydios-control-plane-client-tls' "runbook must include mTLS client secret reference"
assert_pattern "${RUNBOOK_PATH}" 'openfang-desktop-provider-ca' "runbook must include CA secret reference"

if [ "${RUN_OPENFANG_ENABLEMENT_CLUSTER_CHECK:-0}" = "1" ]; then
  command -v kubectl >/dev/null 2>&1 || {
    echo "M14 Openfang enablement gate verifier failed: kubectl is required when RUN_OPENFANG_ENABLEMENT_CLUSTER_CHECK=1" >&2
    exit 1
  }

  assert_secret_key_present "openfang-desktop-provider-auth" "token"
  assert_secret_key_present "epydios-control-plane-client-tls" "tls\\.crt"
  assert_secret_key_present "epydios-control-plane-client-tls" "tls\\.key"
  assert_secret_key_present "openfang-provider-windows-server-tls" "tls\\.crt"
  assert_secret_key_present "openfang-provider-windows-server-tls" "tls\\.key"
  assert_secret_key_present "openfang-provider-macos-server-tls" "tls\\.crt"
  assert_secret_key_present "openfang-provider-macos-server-tls" "tls\\.key"

  if ! kubectl -n "${NAMESPACE}" get secret openfang-desktop-provider-ca -o jsonpath='{.data.ca\.crt}' >/dev/null 2>&1; then
    assert_secret_key_present "openfang-desktop-provider-ca" "tls\\.crt"
  fi

  kubectl -n "${NAMESPACE}" get deploy openfang-provider-windows >/dev/null 2>&1 || {
    echo "M14 Openfang enablement gate verifier failed: missing deployment ${NAMESPACE}/openfang-provider-windows" >&2
    exit 1
  }
  kubectl -n "${NAMESPACE}" get deploy openfang-provider-macos >/dev/null 2>&1 || {
    echo "M14 Openfang enablement gate verifier failed: missing deployment ${NAMESPACE}/openfang-provider-macos" >&2
    exit 1
  }
  kubectl -n "${NAMESPACE}" get svc openfang-provider-windows >/dev/null 2>&1 || {
    echo "M14 Openfang enablement gate verifier failed: missing service ${NAMESPACE}/openfang-provider-windows" >&2
    exit 1
  }
  kubectl -n "${NAMESPACE}" get svc openfang-provider-macos >/dev/null 2>&1 || {
    echo "M14 Openfang enablement gate verifier failed: missing service ${NAMESPACE}/openfang-provider-macos" >&2
    exit 1
  }

  assert_condition_true "oss-desktop-openfang-windows-restricted" "Ready"
  assert_condition_true "oss-desktop-openfang-windows-restricted" "Probed"
  assert_condition_true "oss-desktop-openfang-macos-restricted" "Ready"
  assert_condition_true "oss-desktop-openfang-macos-restricted" "Probed"
fi

echo "M14 Openfang secure enablement gate verifier passed (V-M14-WIN-003/V-M14-MAC-003/V-M14-XOS-003)."
