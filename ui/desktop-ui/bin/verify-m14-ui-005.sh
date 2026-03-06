#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="settings-theme-mode"|id="settings-agent-profile"|id="settings-content"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'THEME_PREF_KEY|AGENT_PREF_KEY|applyThemeMode|populateAgentProfileSelect|renderSettings' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'updateEndpointStatus|getEndpointStatusSnapshot|getSettingsSnapshot|summarizeAimxsStatus' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n 'theme|agentProfiles|selectedAgentProfileId' "${MODULE_ROOT}/web/js/runtime/choices.js" >/dev/null
rg -n '"theme"|"selectedAgentProfileId"|"agentProfiles"' "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null
rg -n 'AIMXS Provider Status|Endpoint Contract Matrix|Model Routing \+ Agent Profile' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null

echo "V-M14-UI-005 PASS: integrations/settings contract checks are wired (theme, agent profile, endpoint matrix, AIMXS status)."
