#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${MODULE_ROOT}"
node "${SCRIPT_DIR}/vscode_governed_thread_acceptance.js"
