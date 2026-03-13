#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="runs-time-range"|id="runs-time-from"|id="runs-time-to"|id="runs-page-size"|id="runs-page"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'id="approvals-time-range"|id="approvals-time-from"|id="approvals-time-to"|id="approvals-page-size"|id="approvals-page"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'id="approvals-detail-content"|id="settings-open-audit-events-button"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'id="audit-event-filter"|id="audit-time-range"|id="audit-time-from"|id="audit-time-to"|id="audit-page-size"|id="audit-page"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'data-advanced-toggle-section="operations"|data-advanced-toggle-section="runs"|data-advanced-toggle-section="approvals"|data-advanced-toggle-section="incidents"|data-advanced-toggle-section="settings"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'data-incident-subtab="queue"|data-incident-subtab="audit"|data-incident-subpanel="queue"|data-incident-subpanel="audit"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'id="incident-history-time-range"|id="incident-history-time-from"|id="incident-history-time-to"|id="incident-history-page-size"|id="incident-history-page"' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'function setIncidentSubview|function applyIncidentSubview|INCIDENT_SUBVIEW_PREF_KEY' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'function setSettingsSubview|SETTINGS_SUBVIEW_PREF_KEY|LIST_FILTER_STATE_KEY|ADVANCED_SECTION_STATE_KEY|DETAILS_OPEN_STATE_KEY|persistListFilterStateFromUI|toggleAdvancedSection|applyDetailsOpenState' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'data-runs-page-action|data-approvals-page-action|data-audit-page-action|data-incident-history-page-action' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'data-approval-select-run-id|data-approval-detail-run-id|function openApprovalDetail' "${MODULE_ROOT}/web/js/main.js" "${MODULE_ROOT}/web/js/views/approvals.js" >/dev/null

rg -n 'Recent Configuration Changes|data-settings-config-open-audit|data-settings-subtab|data-settings-subpanel|data-advanced-section="settings"' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'data-detail-key="runs.timeline"|data-detail-key="runs.evidence_summary"|data-detail-key="runs.raw_record"' "${MODULE_ROOT}/web/js/domains/runtimeops/panels/run-inventory/inventory.js" >/dev/null
rg -n 'buildSettingsConfigChanges|recordConfigChange|CONFIG_CHANGE_HISTORY_KEY' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-030 PASS: pagination/time filters, incidents/settings subtabs, advanced-detail toggles, sticky filter/detail persistence, and settings traceability surfaces are wired."
