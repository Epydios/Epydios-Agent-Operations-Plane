#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'Command Dashboard|Attention Queue|Domain Pivot Row' "${MODULE_ROOT}/web/js/domains/homeops/panels/dashboard.js" >/dev/null
rg -n 'Workspace Context|id="context-project-select"|id="context-agent-profile"|id="context-endpoint-badges"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'data-homeops-action|data-homeops-view|open-domain|identityops|runtimeops|governanceops|auditops' "${MODULE_ROOT}/web/js/main.js" "${MODULE_ROOT}/web/js/domains/homeops/panels/dashboard.js" "${MODULE_ROOT}/web/js/domains/homeops/state.js" >/dev/null
rg -n 'renderContextBar|contextProjectSelect|contextAgentProfile|contextEndpointBadges|applyProjectContext' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'data-open-approval-run-id|Open Approval Detail|Approval Linkage' "${MODULE_ROOT}/web/js/domains/runtimeops/panels/run-inventory/inventory.js" >/dev/null
rg -n 'data-approval-open-run-id|Open Run Detail' "${MODULE_ROOT}/web/js/domains/governanceops/panels/approval-trace/review.js" >/dev/null
rg -n 'approvalsSort|runsSort' "${MODULE_ROOT}/web/js/main.js" "${MODULE_ROOT}/web/js/views/approvals.js" "${MODULE_ROOT}/web/js/domains/runtimeops/panels/run-inventory/inventory.js" >/dev/null

echo "V-M14-UI-008 PASS: workspace context bar, HomeOps pivots, run/approval bi-directional linking, and sort wiring checks passed."
