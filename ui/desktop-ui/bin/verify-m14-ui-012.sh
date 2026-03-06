#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'gatewayTokenRef|gatewayMtlsCertRef|gatewayMtlsKeyRef|agentProfiles' "${MODULE_ROOT}/web/js/config.js" >/dev/null
rg -n 'gatewayTokenRef|gatewayMtlsCertRef|gatewayMtlsKeyRef|credentialRef|credentialScope|transport|endpointRef' "${MODULE_ROOT}/web/js/runtime/choices.js" >/dev/null
rg -n 'providerContracts|credentialRef|credentialScope|gatewayTokenRef|gatewayMtlsCertRef|gatewayMtlsKeyRef' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n 'Provider Contract Matrix|Gateway Security References|Credential Reference|providerContracts|credentialRef|credentialScope' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'model=' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n '"gatewayTokenRef"|"gatewayMtlsCertRef"|"gatewayMtlsKeyRef"|"credentialRef"|"credentialScope"|"transport"|"endpointRef"' "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null

echo "V-M14-UI-012 PASS: provider-contract matrix and gateway/credential reference wiring checks passed."
