#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'const INCIDENT_HISTORY_KEY = "epydios\.agentops\.desktop\.incident\.history\.v1";' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'function parseIncidentHistoryStoragePayload|function syncIncidentHistoryFromStorage' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'store\.setIncidentPackageHistory\(parsed\)|Incident queue synced from' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'window\.addEventListener\("storage"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'event\.key === INCIDENT_HISTORY_KEY' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'syncIncidentHistoryFromStorage\(String\(event\.newValue \|\| ""\), "another-tab"\);' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-025 PASS: incident queue multi-tab local-storage sync wiring is present."
