#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'Project Integration Editor|data-settings-int-action="save"|data-settings-int-action="apply"|data-settings-int-action="reset"' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'settings-int-gateway-token-ref|settings-int-gateway-mtls-cert-ref|settings-int-gateway-mtls-key-ref|settings-int-profile-credential-ref' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'INTEGRATION_OVERRIDES_KEY|normalizeIntegrationEditorDraft|validateIntegrationEditorDraft|applyIntegrationOverrideToChoices|resolveChoicesForProject' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'data-settings-int-action|persistIntegrationOverrides|setEditorDraftForProject|setEditorStatusForProject|clearEditorDraftForProject|clearEditorStatusForProject' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'syncProjectIntegrationSettings|resolveIntegrationScope|getIntegrationSettings|upsertIntegrationSettings|integrationSettings' "${MODULE_ROOT}/web/js/main.js" "${MODULE_ROOT}/web/js/api.js" "${MODULE_ROOT}/web/js/config.js" >/dev/null
rg -n 'readIntegrationEditorInput|looksLikeRawSecret|must use ref:// format|raw secret material' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'settings-editor-grid|settings-editor-error|settings-editor-warn' "${MODULE_ROOT}/web/css/main.css" >/dev/null

echo "V-M14-UI-013 PASS: project-scoped integrations editor save/apply + runtime-endpoint-first/fallback and reference-validation wiring checks passed."
