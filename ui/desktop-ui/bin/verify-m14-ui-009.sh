#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'if \(action === "open-approvals-pending"\)' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'approvalsStatusFilter\.value = "PENDING"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'approvalsSort\.value = "ttl_asc"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'governanceOpsContent\?\.scrollIntoView' "${MODULE_ROOT}/web/js/main.js" >/dev/null

rg -n 'if \(action === "open-runs-attention"\)' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'runsSort\.value = "updated_desc"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'await openRunDetail\(runID\)' "${MODULE_ROOT}/web/js/main.js" >/dev/null

rg -n 'if \(action === "open-incidentops-active"\)' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'incidentOpsContent\?\.scrollIntoView' "${MODULE_ROOT}/web/js/main.js" >/dev/null

rg -n 'if \(action === "open-audit-deny"\)' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'auditDecisionFilter\.value = "DENY"' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n '\(ui\.auditOpsContent \|\| ui\.auditContent\)\?\.scrollIntoView' "${MODULE_ROOT}/web/js/main.js" >/dev/null

rg -n 'openApprovalRunID' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'approvalsTenantFilter\.value = String\((approval|run)\.tenantId\)\.trim\(\)' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'approvalsProjectFilter\.value = String\((approval|run)\.projectId\)\.trim\(\)' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-009 PASS: HomeOps quick-action and run-detail approval-jump outcomes are asserted."
