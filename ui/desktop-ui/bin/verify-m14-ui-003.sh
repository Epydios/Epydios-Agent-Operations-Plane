#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'Timeline Review|Plan|Policy Check|Execute|Verify' "${MODULE_ROOT}/web/js/domains/runtimeops/panels/run-inventory/inventory.js" >/dev/null
rg -n 'Evidence Review|artifact-panel' "${MODULE_ROOT}/web/js/domains/runtimeops/panels/run-inventory/inventory.js" >/dev/null
rg -n 'renderRuntimeRunDetail' "${MODULE_ROOT}/web/js/domains/runtimeops/panels/run-inventory/inventory.js" >/dev/null
rg -n 'desktopObserveResponse|desktopActuateResponse|desktopVerifyResponse|selectedDesktopProvider|policyDecision' "${MODULE_ROOT}/web/js/domains/runtimeops/panels/run-inventory/inventory.js" >/dev/null

echo "V-M14-UI-003 PASS: run workflow timeline and evidence drill-in rendering hooks are present."
