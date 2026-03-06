#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'Ops Triage|id="triage-content"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'Workspace Context|id="context-project-select"|id="context-agent-profile"|id="context-endpoint-badges"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'renderOpsTriage|data-triage-action|open-approvals-pending|open-runs-attention|open-audit-deny|open-terminal-issues' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'renderContextBar|contextProjectSelect|contextAgentProfile|contextEndpointBadges|applyProjectContext' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'data-open-approval-run-id|Open Related Approval|Approval Linkage' "${MODULE_ROOT}/web/js/views/runs.js" >/dev/null
rg -n 'data-approval-open-run-id|Open Run' "${MODULE_ROOT}/web/js/views/approvals.js" >/dev/null
rg -n 'approvalsSort|runsSort' "${MODULE_ROOT}/web/js/main.js" "${MODULE_ROOT}/web/js/views/approvals.js" "${MODULE_ROOT}/web/js/views/runs.js" >/dev/null

echo "V-M14-UI-008 PASS: workspace context bar, ops triage cards, run/approval bi-directional linking, and sort wiring checks passed."
