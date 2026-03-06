#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [ -f "${MODULE_ROOT}/../provenance/ip/intake-register.json" ]; then
  REPO_ROOT="$(cd "${MODULE_ROOT}/.." && pwd)"
elif [ -f "${MODULE_ROOT}/../../provenance/ip/intake-register.json" ]; then
  REPO_ROOT="$(cd "${MODULE_ROOT}/../.." && pwd)"
elif [ -f "${MODULE_ROOT}/../EPYDIOS_AGENTOPS_DESKTOP_REPO/provenance/ip/intake-register.json" ]; then
  REPO_ROOT="$(cd "${MODULE_ROOT}/../EPYDIOS_AGENTOPS_DESKTOP_REPO" && pwd)"
else
  echo "V-M14-UI-014 FAIL: unable to locate repository root for IP intake checks." >&2
  exit 1
fi
REGISTER_PATH="${REPO_ROOT}/provenance/ip/intake-register.json"

if [ ! -f "${REGISTER_PATH}" ]; then
  echo "V-M14-UI-014 FAIL: missing IP intake register at ${REGISTER_PATH}" >&2
  exit 1
fi

# Enforce that execution-plane PR gate still runs IP-intake QC.
rg -n 'check-ip-intake-register\.sh' "${REPO_ROOT}/platform/ci/bin/qc-preflight.sh" >/dev/null
rg -n 'qc-preflight\.sh' "${REPO_ROOT}/platform/local/bin/verify-m13-desktop-daily-loop.sh" >/dev/null

# Ensure primary UI runtime entry remains governed with required approval metadata.
jq -e '
  any(.entries[];
    .id == "desktop-ui-governance-runtime"
    and .ip_type == "first_party_new_ip"
    and (
      .source_ref == "EPYDIOS_AGENTOPS_DESKTOP_UI"
      or .source_ref == "EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui"
    )
    and .review.required == true
    and (.review.ticket | type == "string" and length > 0)
    and (.review.evidence | index("PIPELINE_LIVING.txt") != null)
    and (.review.evidence | index("PIPELINE_LIVING.json") != null)
  )
' "${REGISTER_PATH}" >/dev/null

# Ensure project-scoped integration editor surface has explicit new-IP registration.
jq -e '
  any(.entries[];
    .id == "desktop-ui-project-integration-editor"
    and .ip_type == "first_party_new_ip"
    and (
      .source_ref == "EPYDIOS_AGENTOPS_DESKTOP_UI/web/js/views/settings.js"
      or .source_ref == "EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/web/js/views/settings.js"
    )
    and .review.required == true
    and (.review.ticket | type == "string" and length > 0)
    and (.review.evidence | index("PIPELINE_LIVING.txt") != null)
    and (.review.evidence | index("PIPELINE_LIVING.json") != null)
  )
' "${REGISTER_PATH}" >/dev/null

# Ensure UI-side integration editor controls exist and remain reference-only validated.
rg -n 'Project Integration Editor|data-settings-int-action="save"|data-settings-int-action="apply"|data-settings-int-action="reset"' "${MODULE_ROOT}/web/js/views/settings.js" >/dev/null
rg -n 'must use ref:// format|raw secret material; use a ref:// pointer instead|INTEGRATION_OVERRIDES_KEY' "${MODULE_ROOT}/web/js/main.js" >/dev/null

echo "V-M14-UI-014 PASS: IP register/approval metadata alignment checks are enforced for UI and execution-plane gates."
