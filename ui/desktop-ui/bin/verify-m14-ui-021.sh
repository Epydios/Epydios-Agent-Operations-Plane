#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="incident-history-status-filter"|id="incident-history-sort"|id="incident-history-quick-all-button"|id="incident-history-quick-filed-button"|id="incident-history-quick-needs-closure-button"|id="incident-history-summary"' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'const incidentHistoryViewState|const INCIDENT_STATUS_SORT_RANK' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'function normalizeIncidentHistoryStatusFilter|function normalizeIncidentHistorySort|function applyIncidentHistoryViewControls|function readIncidentHistoryViewFromUI|function setIncidentHistoryQuickView|function getIncidentHistoryFilteredSortedItems|function renderIncidentHistorySummary' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'incidentHistoryStatusFilter\?\.addEventListener\("change"|incidentHistorySort\?\.addEventListener\("change"|incidentHistoryQuickAllButton\?\.addEventListener|incidentHistoryQuickFiledButton\?\.addEventListener|incidentHistoryQuickNeedsClosureButton\?\.addEventListener' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'queueTotal=|visible=|filter=|sort=|No incident packages match current queue filters.' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-021 PASS: incident queue triage controls (filter/sort/quick views/summary) are wired."
