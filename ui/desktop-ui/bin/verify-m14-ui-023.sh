#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="incident-history-search-input"|id="incident-history-search-clear-button"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'search runId/packageId|Clear Search' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'search=' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'function normalizeIncidentHistorySearch|function readIncidentHistoryViewFromUI|function getIncidentHistoryFilteredSortedItems' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'incidentHistorySearchInput\?\.addEventListener\("input"|incidentHistorySearchClearButton\?\.addEventListener' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'runId\.includes\(search\)|packageId\.includes\(search\)|No incident packages match current queue filters/search\.' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-023 PASS: incident queue search controls (runId/packageId) are wired."
