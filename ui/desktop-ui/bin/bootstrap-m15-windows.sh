#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_PS1="${SCRIPT_DIR}/bootstrap-m15-windows.ps1"

if [ ! -f "${BOOTSTRAP_PS1}" ]; then
  echo "bootstrap-m15-windows: missing PowerShell bootstrap at ${BOOTSTRAP_PS1}" >&2
  exit 1
fi

BOOTSTRAP_TARGET="${BOOTSTRAP_PS1}"
if command -v cygpath >/dev/null 2>&1; then
  BOOTSTRAP_TARGET="$(cygpath -w "${BOOTSTRAP_PS1}")"
fi

if command -v powershell.exe >/dev/null 2>&1; then
  exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${BOOTSTRAP_TARGET}" "$@"
fi

if command -v powershell >/dev/null 2>&1; then
  exec powershell -NoProfile -ExecutionPolicy Bypass -File "${BOOTSTRAP_TARGET}" "$@"
fi

if command -v pwsh.exe >/dev/null 2>&1; then
  exec pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "${BOOTSTRAP_TARGET}" "$@"
fi

if command -v pwsh >/dev/null 2>&1; then
  exec pwsh -NoProfile -ExecutionPolicy Bypass -File "${BOOTSTRAP_TARGET}" "$@"
fi

echo "bootstrap-m15-windows: PowerShell is required on the Windows host." >&2
exit 1
