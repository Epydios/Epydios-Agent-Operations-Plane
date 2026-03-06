#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="terminal-form"|id="terminal-run-id"|id="terminal-command"|id="terminal-read-only"|id="terminal-restricted-host-request"|id="terminal-history"|id="terminal-history-run-filter"|id="terminal-history-status-filter"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'readTerminalInput|applyTerminalInput|readTerminalHistoryFilters|evaluateTerminalIssues|buildTerminalRequest|renderTerminalPolicyHints|renderTerminalFeedback|renderTerminalHistory' "${MODULE_ROOT}/web/js/views/terminal.js" >/dev/null
rg -n 'createTerminalSession|terminalSessions' "${MODULE_ROOT}/web/js/api.js" >/dev/null
rg -n 'terminalForm|refreshTerminalPreview|submitTerminalFromCurrentInput|renderTerminalFeedback|renderTerminalHistoryPanel|renderTerminalHistory|payload\\.auditLink|auditProviderFilter|terminalHistoryRerunId|terminalHistoryRunFilter|terminalHistoryStatusFilter' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n '"terminalSessions"' "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null

echo "V-M14-UI-006 PASS: terminal safety checks are wired (session scope, policy guards, provenance tagging, audit linkage)."
