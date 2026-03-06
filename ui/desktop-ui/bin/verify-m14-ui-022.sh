#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="incident-history-bulk-filed-button"|id="incident-history-bulk-closed-button"|id="incident-history-clear-selection-button"' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'data-incident-history-select-id|data-incident-history-entry-id|data-incident-history-status' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'const incidentHistorySelection = new Set\(\);|function clearIncidentHistorySelection|function applyBulkIncidentStatusTransition' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'Select one or more incident rows before bulk status updates.|Bulk update blocked: no selected rows can transition to|Bulk incident status update complete' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'incidentHistoryBulkFiledButton\?\.addEventListener|incidentHistoryBulkClosedButton\?\.addEventListener|incidentHistoryClearSelectionButton\?\.addEventListener|incidentHistoryContent\?\.addEventListener\(\"change\"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'store\.updateIncidentPackageHistoryEntry\(|persistIncidentHistory\(\);' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-022 PASS: incident bulk selection/actions are wired with transition guardrails and persistence."
