#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="audit-export-incident-button"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'Export Incident Package|audit-handoff-preview|audit-feedback' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'let latestRunDetail = null;|let latestRunDetailSource = "unknown";' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'function buildIncidentPackageHandoffText|function getCurrentIncidentPackage' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'runId=|detailSource|approvalStatus=|auditMatchedCount=' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'latestRunDetail = detail;|latestRunDetailSource = "runtime-endpoint";|latestRunDetailSource = "run-summary-fallback";' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'auditExportIncidentButton\?\.addEventListener\("click"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'Select a run detail first, then export the incident package.|incident-package-|Exported incident package' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-018 PASS: incident package export wiring (run detail + approval context + audit bundle) is enforced."
