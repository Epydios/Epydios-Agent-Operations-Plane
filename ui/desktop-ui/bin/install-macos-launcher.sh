#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_DIR="${TARGET_DIR:-${HOME}/Applications}"
LAUNCHER_PATH="${TARGET_DIR}/Epydios AgentOps Desktop.command"
DEFAULT_MODE="${DEFAULT_MODE:-mock}"
SUPPORT_ROOT="${SUPPORT_ROOT:-${HOME}/Library/Application Support/EpydiosAgentOpsDesktop}"

usage() {
  cat <<'EOF'
Usage: install-macos-launcher.sh [options]

Installs a double-clickable macOS compatibility launcher (.command) for
Epydios AgentOps Desktop. When an installed .app bundle exists, the launcher
prefers that app-first path and only falls back to the repo-local script.

Options:
  --target-dir PATH          Install directory (default: ~/Applications)
  --default-mode mock|live   Launcher run mode default (default: mock)
  --support-root PATH        Support root that holds runtime-bootstrap.json and launch-installed.sh
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
    --support-root)
      SUPPORT_ROOT="${2:-}"
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
APP_INSTALL_ROOT="\${EPYDIOS_M15_MACOS_INSTALL_ROOT:-\${HOME}/Applications}"
APP_INSTALL_PATH="\${EPYDIOS_M15_MACOS_INSTALL_PATH:-\${APP_INSTALL_ROOT}/Epydios AgentOps Desktop.app}"
SUPPORT_ROOT="\${EPYDIOS_M15_MACOS_SUPPORT_ROOT:-${SUPPORT_ROOT}}"
APP_EXECUTABLE_PATH="\${APP_INSTALL_PATH}/Contents/MacOS/epydios-agentops-desktop"
BOOTSTRAP_PATH="\${SUPPORT_ROOT}/runtime-bootstrap.json"
LAUNCH_HELPER_PATH="\${SUPPORT_ROOT}/launch-installed.sh"

if [[ -x "\${LAUNCH_HELPER_PATH}" ]]; then
  exec "\${LAUNCH_HELPER_PATH}" "\$@"
fi

if [[ -x "\${APP_EXECUTABLE_PATH}" && -f "\${BOOTSTRAP_PATH}" ]]; then
  export EPYDIOS_NATIVEAPP_BOOTSTRAP_PATH="\${BOOTSTRAP_PATH}"
  exec "\${APP_EXECUTABLE_PATH}" "\$@"
fi

exec "${MODULE_ROOT}/bin/run-macos-local.sh" --mode "\${MODE}"
EOF

chmod +x "${LAUNCHER_PATH}"

echo "Installed launcher:"
echo "  ${LAUNCHER_PATH}"
echo "Support root:"
echo "  ${SUPPORT_ROOT}"
echo "Default mode: ${DEFAULT_MODE} (override with EPYDIOS_DESKTOP_MODE=live|mock)"
