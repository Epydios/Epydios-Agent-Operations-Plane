#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="approvals-ttl-seconds"|id="approvals-status-filter"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'approval-action|approval-open-run|Open Run|Approve|Deny|remainingTTL|approval-detail-reason' "${MODULE_ROOT}/web/js/views/approvals.js" >/dev/null
rg -n 'submitApprovalDecision\(|openRunDetail\(|approvalOpenRunId' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'derived-runs|approval queue endpoint is unavailable' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n 'approval.status = "APPROVED"|approval.status = "DENIED"|applied: false' "${MODULE_ROOT}/web/js/api.js" >/dev/null

echo "V-M14-UI-004 PASS: approval queue controls and transition wiring checks passed."
