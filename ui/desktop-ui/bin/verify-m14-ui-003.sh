#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'Run Timeline|Plan|Policy Check|Execute|Verify' "${MODULE_ROOT}/web/js/views/runs.js" >/dev/null
rg -n 'Desktop Evidence Summary|Run Evidence Drill-In|artifact-panel' "${MODULE_ROOT}/web/js/views/runs.js" >/dev/null
rg -n 'renderRunDetail' "${MODULE_ROOT}/web/js/views/runs.js" >/dev/null
rg -n 'desktopObserveResponse|desktopActuateResponse|desktopVerifyResponse|selectedDesktopProvider|policyDecision' "${MODULE_ROOT}/web/js/views/runs.js" >/dev/null

echo "V-M14-UI-003 PASS: run workflow timeline and evidence drill-in rendering hooks are present."
