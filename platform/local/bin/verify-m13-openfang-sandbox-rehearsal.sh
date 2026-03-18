#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

NAMESPACE="${NAMESPACE:-epydios-system}"
PROVIDER_MANIFEST="${REPO_ROOT}/platform/provider-manifests/oss-desktop-openfang/extensionprovider.yaml"
CONFIGMAP_MANIFEST="${REPO_ROOT}/platform/provider-manifests/oss-desktop-openfang/configmap.yaml"

fail() {
  echo "M13 Openfang sandbox rehearsal failed: $1" >&2
  exit 1
}

for bin in kubectl jq; do
  if ! command -v "${bin}" >/dev/null 2>&1; then
    fail "missing required binary: ${bin}"
  fi
done

context="$(kubectl config current-context 2>/dev/null || true)"
if [ -z "${context}" ]; then
  fail "kubectl current-context is not set"
fi
case "${context}" in
  kind-*|k3d-*)
    ;;
  *)
    fail "context ${context} is not a kind/k3d rehearsal target"
    ;;
esac

echo "Running M13 Openfang sandbox rehearsal on context=${context} namespace=${NAMESPACE}..."

if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  kubectl create namespace "${NAMESPACE}" >/dev/null
fi

kubectl -n "${NAMESPACE}" apply -f "${CONFIGMAP_MANIFEST}" >/dev/null
if ! provider_apply_output="$(kubectl -n "${NAMESPACE}" apply -f "${PROVIDER_MANIFEST}" 2>&1)"; then
  if printf '%s' "${provider_apply_output}" | grep -q 'Unsupported value: "DesktopProvider"'; then
    fail "cluster CRD does not yet support providerType DesktopProvider for ExtensionProvider"
  fi
  fail "provider manifest apply failed: ${provider_apply_output}"
fi

selection_enabled="$(kubectl -n "${NAMESPACE}" get extensionprovider oss-desktop-openfang-linux -o jsonpath='{.spec.selection.enabled}')"
[ "${selection_enabled}" = "false" ] || fail "selection.enabled must remain false"

auth_mode="$(kubectl -n "${NAMESPACE}" get extensionprovider oss-desktop-openfang-linux -o jsonpath='{.spec.auth.mode}')"
[ "${auth_mode}" = "None" ] || fail "auth.mode must remain None for default scaffold"

config_json="$(kubectl -n "${NAMESPACE}" get configmap epydios-oss-desktop-openfang-provider-config -o jsonpath='{.data.config\.json}')"

target_os="$(printf '%s' "${config_json}" | jq -r '.targetOS')"
[ "${target_os}" = "linux" ] || fail "config targetOS must remain linux"

allow_restricted_host="$(printf '%s' "${config_json}" | jq -r '.allowRestrictedHost')"
[ "${allow_restricted_host}" = "false" ] || fail "config allowRestrictedHost must remain false"

upstream_enabled="$(printf '%s' "${config_json}" | jq -r '.upstream.enabled')"
[ "${upstream_enabled}" = "false" ] || fail "config upstream.enabled must remain false"

(
  cd "${REPO_ROOT}"
  GOCACHE="${LOCAL_GO_CACHE}" go test ./cmd/desktop-provider-openfang -run 'TestRuntimeExecuteRunThroughOpenfangAdapterSandboxPath|TestRuntimeExecuteRunThroughOpenfangAdapterRestrictedHostDenied' >/dev/null
)

echo "M13 Openfang sandbox rehearsal passed (kind/k3d manifest guardrails + runtime->adapter integration assertions)."
