#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

test -x "${MODULE_ROOT}/bin/bootstrap-macos-local.sh"
test -x "${MODULE_ROOT}/bin/run-macos-local.sh"
test -x "${MODULE_ROOT}/bin/install-macos-launcher.sh"

rg -n "run-macos-local\\.sh|install-macos-launcher\\.sh|bootstrap-macos-local\\.sh" "${MODULE_ROOT}/README.md" >/dev/null

echo "V-M14-UI-026 PASS: macOS bootstrap/launcher scripts and docs are present."
