#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="context-endpoint-badges"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'data-settings-endpoint-id' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'data-context-endpoint-id' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'contextEndpointBadges?.addEventListener("click"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'focusSettingsEndpointRow|settings-row-focus' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n -F 'settingsContent?.scrollIntoView({ behavior: "smooth", block: "start" })' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'context-endpoint-button|settings-row-focus' "${MODULE_ROOT}/web/css/main.css" >/dev/null

echo "V-M14-UI-010 PASS: context endpoint badges are wired to settings endpoint-row highlight and jump behavior."
