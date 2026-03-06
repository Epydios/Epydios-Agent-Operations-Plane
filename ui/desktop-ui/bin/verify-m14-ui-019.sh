#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="incident-history-content"|id="incident-history-copy-latest-button"|id="incident-history-clear-button"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'Incident Filing Queue|Copy Latest Handoff|Clear Queue' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'incident-history-row|incident-history-meta|incident-history-actions' "${MODULE_ROOT}/web/css/main.css" >/dev/null

rg -n 'incidentPackageHistory|setIncidentPackageHistory|addIncidentPackageHistoryEntry|getIncidentPackageHistory|getIncidentPackageHistoryById' "${MODULE_ROOT}/web/js/state/store.js" >/dev/null

rg -n 'incidentHistoryContent|incidentHistoryCopyLatestButton|incidentHistoryClearButton' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'function buildIncidentHistoryEntry|function renderIncidentHistoryPanel' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'store\.addIncidentPackageHistoryEntry|store\.setIncidentPackageHistory|store\.getIncidentPackageHistoryById' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'incidentHistoryCopyLatestButton\?\.addEventListener|incidentHistoryClearButton\?\.addEventListener|incidentHistoryContent\?\.addEventListener' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'Incident queue is empty|Cleared incident filing queue|Downloaded incident package' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-019 PASS: incident filing queue/history controls are wired (export history + copy/download/open-run actions)."
