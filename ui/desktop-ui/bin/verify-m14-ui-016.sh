#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'function chipClassForSyncState|function chipClassForIntegrationSource|function renderIntegrationSyncStatus' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'Integration Sync Status|settings-int-sync-status|settings-int-sync-state|settings-int-sync-source|settings-int-sync-endpoint-state|settings-int-sync-endpoint-detail' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'const integrationSyncStatus = renderIntegrationSyncStatus\(settings, editorState\);' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'source=<span id="settings-int-sync-source"|scopeTenant=|scopeProject=|endpointUpdatedAt=' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null

rg -n 'function buildSettingsEditorState\(|syncStateByProject|source: String\(overrideEntry\?\.source' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'const syncState = String\(syncStateByProject\?\.\[key\] \|\| "unknown"\)|syncState,|scopeTenantId: String\(overrideEntry\?\.tenantId|scopeProjectId: String\(overrideEntry\?\.projectId' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'runtimeIntegrationSyncStateByProject' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-016 PASS: integration sync-status render and state plumbing checks passed."
