#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

required_files=(
  "${MODULE_ROOT}/web/index.html"
  "${MODULE_ROOT}/web/css/main.css"
  "${MODULE_ROOT}/web/js/config.js"
  "${MODULE_ROOT}/web/js/oidc.js"
  "${MODULE_ROOT}/web/js/api.js"
  "${MODULE_ROOT}/web/js/main.js"
  "${MODULE_ROOT}/web/js/views/run-builder.js"
  "${MODULE_ROOT}/web/js/views/approvals.js"
  "${MODULE_ROOT}/web/js/views/settings.js"
  "${MODULE_ROOT}/web/js/views/terminal.js"
  "${MODULE_ROOT}/web/config/runtime-config.example.json"
  "${MODULE_ROOT}/Dockerfile"
  "${MODULE_ROOT}/deploy/nginx/default.conf"
  "${MODULE_ROOT}/deploy/base/kustomization.yaml"
  "${MODULE_ROOT}/deploy/base/deployment.yaml"
  "${MODULE_ROOT}/deploy/base/service.yaml"
  "${MODULE_ROOT}/deploy/base/configmap-runtime-config.yaml"
  "${MODULE_ROOT}/deploy/overlays/production/kustomization.yaml"
  "${MODULE_ROOT}/deploy/overlays/production/patch-deployment.yaml"
  "${MODULE_ROOT}/deploy/overlays/production/patch-runtime-config.yaml"
  "${MODULE_ROOT}/deploy/overlays/production/httproute.yaml"
  "${MODULE_ROOT}/deploy/README.md"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "Missing required file: ${file}" >&2
    exit 1
  fi
done

jq -e . "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null
jq -e '.endpoints.runs and .endpoints.runByIdPrefix and .auth.usePkce' "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null
jq -e '.endpoints.terminalSessions' "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null
jq -e '.endpoints.approvalsQueue and .endpoints.approvalDecisionPrefix' "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null
jq -e '.ui.realtime.mode and .ui.realtime.pollIntervalMs and .ui.terminal.mode and .ui.integrations.modelRouting' "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null
jq -e '.ui.theme.mode and .ui.integrations.selectedAgentProfileId and (.ui.integrations.agentProfiles | length > 0)' "${MODULE_ROOT}/web/config/runtime-config.example.json" >/dev/null

grep -q 'type="module" src="./js/main.js"' "${MODULE_ROOT}/web/index.html"
grep -q 'id="runs-content"' "${MODULE_ROOT}/web/index.html"
grep -q 'id="run-builder-form"' "${MODULE_ROOT}/web/index.html"
grep -q 'id="governed-action-form"' "${MODULE_ROOT}/web/index.html"
grep -q 'id="approvals-content"' "${MODULE_ROOT}/web/index.html"
grep -q 'id="audit-content"' "${MODULE_ROOT}/web/index.html"
grep -q 'id="settings-content"' "${MODULE_ROOT}/web/index.html"
grep -q 'id="terminal-form"' "${MODULE_ROOT}/web/index.html"
grep -q 'data-workspace-tab="developer"' "${MODULE_ROOT}/web/index.html"

echo "M1-M4 and M14 baseline UI checks passed."
