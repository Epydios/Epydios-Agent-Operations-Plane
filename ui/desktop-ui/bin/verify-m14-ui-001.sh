#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

"${MODULE_ROOT}/bin/check-m1.sh" >/dev/null

rg -n 'Run Builder|Approvals Queue|Runtime Runs|Audit Events|Platform Health|Integrations &amp; Settings|Terminal Control' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'id="run-builder-form"|id="approvals-content"|id="runs-content"|id="audit-content"|id="settings-content"|id="terminal-form"|id="terminal-history"|id="terminal-history-run-filter"|id="terminal-history-status-filter"' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'createRuntimeRun\(|getApprovalQueue\(|submitApprovalDecision\(|getSettingsSnapshot\(|createTerminalSession\(' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n 'renderRunBuilder|renderApprovals|renderRuns|renderAudit|renderSettings|renderTerminalFeedback|renderTerminalHistory' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-001 PASS: data-contract and route surface smoke checks passed."
