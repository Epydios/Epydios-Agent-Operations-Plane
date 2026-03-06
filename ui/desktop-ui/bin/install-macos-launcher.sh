#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_DIR="${TARGET_DIR:-${HOME}/Applications}"
LAUNCHER_PATH="${TARGET_DIR}/Epydios AgentOps Desktop.command"
DEFAULT_MODE="${DEFAULT_MODE:-mock}"

usage() {
  cat <<'EOF'
Usage: install-macos-launcher.sh [options]

Installs a double-clickable macOS launcher (.command) for Epydios AgentOps Desktop.

Options:
  --target-dir PATH          Install directory (default: ~/Applications)
  --default-mode mock|live   Launcher run mode default (default: mock)
  -h, --help                 Show usage
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-dir)
      TARGET_DIR="${2:-}"
      LAUNCHER_PATH="${TARGET_DIR}/Epydios AgentOps Desktop.command"
      shift 2
      ;;
    --default-mode)
      DEFAULT_MODE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

DEFAULT_MODE="$(echo "${DEFAULT_MODE}" | tr '[:upper:]' '[:lower:]')"
if [[ "${DEFAULT_MODE}" != "mock" && "${DEFAULT_MODE}" != "live" ]]; then
  echo "Invalid default mode: ${DEFAULT_MODE} (expected mock|live)" >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}"

cat > "${LAUNCHER_PATH}" <<EOF
#!/bin/zsh
set -euo pipefail
cd "${MODULE_ROOT}"
MODE="\${EPYDIOS_DESKTOP_MODE:-${DEFAULT_MODE}}"
exec "${MODULE_ROOT}/bin/run-macos-local.sh" --mode "\${MODE}"
EOF

chmod +x "${LAUNCHER_PATH}"

echo "Installed launcher:"
echo "  ${LAUNCHER_PATH}"
echo "Default mode: ${DEFAULT_MODE} (override with EPYDIOS_DESKTOP_MODE=live|mock)"
