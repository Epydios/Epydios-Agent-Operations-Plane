#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running M13/M14 desktop daily loop (provider + openfang guardrails + runtime + approvals + terminal endpoint + cross-OS adapters + enablement-gate + qc)..."
"${SCRIPT_DIR}/verify-m13-desktop-provider.sh"
"${SCRIPT_DIR}/verify-m13-openfang-adapter.sh"
"${SCRIPT_DIR}/verify-m13-openfang-runtime-integration.sh"
"${SCRIPT_DIR}/verify-m13-runtime-approvals.sh"
if [ "${RUN_M13_OPENFANG_SANDBOX_REHEARSAL:-0}" = "1" ]; then
  "${SCRIPT_DIR}/verify-m13-openfang-sandbox-rehearsal.sh"
else
  echo "Skipping M13 Openfang sandbox rehearsal (set RUN_M13_OPENFANG_SANDBOX_REHEARSAL=1 to enable)."
fi
"${SCRIPT_DIR}/verify-m13-desktop-runtime.sh"
"${SCRIPT_DIR}/verify-m14-runtime-terminal-integration.sh"
"${SCRIPT_DIR}/verify-m14-runtime-integration-settings.sh"
if [ "${RUN_M14_WIN_RESTRICTED_READINESS:-0}" = "1" ]; then
  "${SCRIPT_DIR}/verify-m14-win-restricted-readiness.sh"
else
  echo "Skipping M14 Windows restricted readiness verifier (set RUN_M14_WIN_RESTRICTED_READINESS=1 to enable)."
fi
if [ "${RUN_M14_MAC_RESTRICTED_READINESS:-0}" = "1" ]; then
  "${SCRIPT_DIR}/verify-m14-mac-restricted-readiness.sh"
else
  echo "Skipping M14 macOS restricted readiness verifier (set RUN_M14_MAC_RESTRICTED_READINESS=1 to enable)."
fi
if [ "${RUN_M14_XOS_PARITY:-0}" = "1" ]; then
  "${SCRIPT_DIR}/verify-m14-xos-parity.sh"
else
  echo "Skipping M14 cross-OS parity verifier (set RUN_M14_XOS_PARITY=1 to enable)."
fi
"${SCRIPT_DIR}/verify-m14-openfang-xos-adapters.sh"
"${SCRIPT_DIR}/verify-m14-openfang-enablement-gate.sh"
"${SCRIPT_DIR}/../../ci/bin/qc-preflight.sh"

echo "M13/M14 desktop daily loop passed."
