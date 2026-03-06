#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'runtimeIntegrationSyncStateByProject|resolveIntegrationScope|syncProjectIntegrationSettings' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'currentState === "loaded" || currentState === "loaded-empty"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'runtimeIntegrationSyncStateByProject[key] = "scope-unavailable"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'api.getIntegrationSettings(scope)' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'response?.source !== "runtime-endpoint"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'Project integration settings loaded from runtime endpoint.' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'api.upsertIntegrationSettings(runtimePayload)' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'if (result?.applied && result?.source === "runtime-endpoint")' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'result?.source === "endpoint-unavailable"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'Saved draft applied via runtime endpoint and activated for this project scope.' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'Runtime integration settings endpoint is unavailable; applied local fallback for this project scope.' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'Runtime integration settings endpoint is unavailable; baseline defaults were applied locally only.' "${MODULE_ROOT}/web/js/main.js" >/dev/null

rg -n -F 'async getIntegrationSettings(scope = {}) {' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n -F 'async upsertIntegrationSettings(payload = {}) {' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n -F 'this.updateEndpointStatus("integrationSettings"' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n 'source: "runtime-endpoint"|source: "endpoint-unavailable"|source: "scope-unavailable"' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n -F 'id: "integrationSettings"' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n -F 'path: this.config?.endpoints?.integrationSettings || ""' "${MODULE_ROOT}/web/js/api.js" >/dev/null

rg -n 'integrationSettings: "/v1alpha1/runtime/integrations/settings"' "${MODULE_ROOT}/web/js/config.js" "${MODULE_ROOT}/web/config/runtime-config.json" "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null

echo "V-M14-UI-015 PASS: runtime integration-settings endpoint-sync and fallback guardrail checks passed."
