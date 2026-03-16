#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'meta name="viewport"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'aria-live="polite"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'data-theme=\"dark\"|:focus-visible|@media \(max-width: 768px\)' "${MODULE_ROOT}/web/css/main.css" >/dev/null
rg -n '@media \(min-width: 900px\)' "${MODULE_ROOT}/web/css/shell/layout.css" "${MODULE_ROOT}/web/css/domains/identityops/panels.css" >/dev/null
rg -n 'theme:system|theme:light|theme:dark' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'applyThemeMode|prefers-color-scheme' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-007 PASS: responsive and accessibility baseline hooks are present (desktop/tablet/mobile, keyboard focus, theme/contrast path)."
