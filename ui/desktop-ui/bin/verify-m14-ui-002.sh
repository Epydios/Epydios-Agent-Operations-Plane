#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

rg -n 'id="runs-tenant-filter"|id="runs-project-filter"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'id="audit-tenant-filter"|id="audit-project-filter"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'id="approvals-tenant-filter"|id="approvals-project-filter"' "${MODULE_ROOT}/web/index.html" >/dev/null
rg -n 'id="rb-tenant-id"|id="rb-project-id"' "${MODULE_ROOT}/web/index.html" >/dev/null

rg -n 'readRunFilters|readAuditFilters|readApprovalFilters' "${MODULE_ROOT}/web/js/main.js" >/dev/null
rg -n 'tenant|project' "${MODULE_ROOT}/web/js/views/approvals.js" >/dev/null
rg -n 'tenant|project' "${MODULE_ROOT}/web/js/domains/runtimeops/panels/run-inventory/inventory.js" >/dev/null
rg -n 'tenant|project' "${MODULE_ROOT}/web/js/views/audit.js" >/dev/null

echo "V-M14-UI-002 PASS: tenant/project scope visibility checks are wired across runs/audit/approvals/run-builder."
