#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

cd "${REPO_ROOT}"

echo "[m20] validating runtime worker, policy, export, and org-admin catalogs"
GOCACHE="${GOCACHE:-/tmp/go-build}" go test ./internal/runtime

echo "[m20] validating runtime-native governed export redaction and metadata coverage"
GOCACHE="${GOCACHE:-/tmp/go-build}" go test ./internal/runtime -run 'TestRuntimeAuditExportRedactsSensitiveFields|TestRuntimeSessionEvidenceExportRedactsSensitiveFields|TestRuntimeV1Alpha2ExportProfileCatalog'

echo "[m20] validating desktop Chat governed report, governed export actions, and cross-surface parity coverage"
"${HOME}/bin/node" --test ./ui/desktop-ui/web/js/test/*.test.js

echo "[m20] validating VS Code governed report and cross-surface parity coverage"
"${HOME}/bin/node" --test ./clients/vscode-agentops/test/*.test.js

echo "[m20] validating shared enterprise report envelope, parity fixtures, and ingress reporting clients"
GOCACHE="${GOCACHE:-/tmp/go-build}" go test ./clients/internal/runtimeclient ./clients/cli-agentops ./clients/workflow-agentops ./clients/chatops-agentops

echo "M20 enterprise hardening baseline validation passed."
