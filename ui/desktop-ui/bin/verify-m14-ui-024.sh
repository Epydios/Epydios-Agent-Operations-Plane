#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="incident-history-export-selected-button"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'Export Selected Bundle' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'function getSelectedIncidentEntries|function buildSelectedIncidentExportBundle' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'incidentHistoryExportSelectedButton\?\.addEventListener\("click"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'Select one or more incident rows before export bundle\.|incident-selected-bundle-|Exported selected incident bundle' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-024 PASS: selected-incident export bundle controls are wired."
