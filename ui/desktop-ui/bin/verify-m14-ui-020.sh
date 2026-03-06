#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'const INCIDENT_HISTORY_KEY = "epydios\.agentops\.desktop\.incident\.history\.v1";|const INCIDENT_STATUS_TRANSITIONS = ' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'function normalizeIncidentFilingStatus|function incidentStatusChipClass|function buildIncidentTransitionButtons|function canTransitionIncidentStatus' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'function persistIncidentHistory|function pushIncidentHistory|function clearIncidentHistoryQueue' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'readSavedJSON\(INCIDENT_HISTORY_KEY\)|store\.setIncidentPackageHistory\(incidentHistorySeedItems\)' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'filingStatus|filingUpdatedAt|data-incident-history-transition-id|data-incident-history-next-status' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'store\.updateIncidentPackageHistoryEntry\(transitionId|Updated filing status for|Transition blocked for' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'store\.upsertIncidentPackageHistoryEntry|store\.setIncidentPackageHistory\(\[\]\);' "${MODULE_ROOT}/web/js/main.js" >/dev/null

rg -n 'upsertIncidentPackageHistoryEntry|updateIncidentPackageHistoryEntry' "${MODULE_ROOT}/web/js/state/store.js" >/dev/null

rg -n 'incident-history-state' "${MODULE_ROOT}/web/css/main.css" >/dev/null

echo "V-M14-UI-020 PASS: incident filing queue persistence and explicit drafted/filed/closed transitions are wired."
