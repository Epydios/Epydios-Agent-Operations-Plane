#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/package-m15-windows.sh"
EPYDIOS_KEEP_WINDOWS_BETA_INSTALLED=1 \
EPYDIOS_WINDOWS_PHASE_D_USE_REAL_USER_HOME=1 \
  "${SCRIPT_DIR}/verify-m15-phase-d.sh"
