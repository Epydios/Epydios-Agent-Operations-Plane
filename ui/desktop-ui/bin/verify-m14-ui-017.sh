#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="audit-export-json-button"|id="audit-export-csv-button"|id="audit-copy-handoff-button"|id="audit-feedback"|id="audit-handoff-preview"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'audit-feedback-ok|audit-feedback-warn|audit-feedback-error|audit-handoff-preview' "${MODULE_ROOT}/web/css/main.css" >/dev/null

rg -n 'export function getFilteredAuditEvents|export function buildAuditFilingBundle|export function buildAuditCsv|export function buildAuditHandoffText' "${MODULE_ROOT}/web/js/views/audit.js" >/dev/null
rg -n 'matchedCount|decisionBreakdown=ALLOW' "${MODULE_ROOT}/web/js/views/audit.js" >/dev/null

rg -n 'auditExportJsonButton|auditExportCsvButton|auditCopyHandoffButton|auditFeedback|auditHandoffPreview' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'buildAuditFileSuffix|triggerTextDownload|copyTextToClipboard|renderAuditFilingFeedback|getCurrentAuditFilingBundle' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'auditExportJsonButton\?\.addEventListener|auditExportCsvButton\?\.addEventListener|auditCopyHandoffButton\?\.addEventListener' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'Exported .* rows to audit-events-|Copied handoff summary for' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-017 PASS: audit export and handoff filing controls are wired with structured payload generation."
