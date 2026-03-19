#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SDK_SOURCE_ROOT="${SDK_ROOT}/src"
RECREATE_VENV=0

usage() {
  cat <<'EOF'
Usage: install-local.sh [--recreate-venv] [--help]

Creates an isolated local Python environment for the Epydios thin client SDK
without touching the system Python install.

Defaults:
  macOS   -> ~/Library/Application Support/EpydiosAgentOpsDesktop/python-sdk
  Linux   -> ${XDG_CONFIG_HOME:-~/.config}/EpydiosAgentOpsDesktop/python-sdk
  other   -> ~/.epydios/python-sdk

Override:
  EPYDIOS_PYTHON_SDK_HOME=/custom/path ./bin/install-local.sh
EOF
}

default_sdk_home() {
  case "$(uname -s)" in
    Darwin)
      printf "%s/Library/Application Support/EpydiosAgentOpsDesktop/python-sdk" "${HOME}"
      ;;
    Linux)
      printf "%s/EpydiosAgentOpsDesktop/python-sdk" "${XDG_CONFIG_HOME:-${HOME}/.config}"
      ;;
    *)
      printf "%s/.epydios/python-sdk" "${HOME}"
      ;;
  esac
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --recreate-venv)
      RECREATE_VENV=1
      shift
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

command -v python3 >/dev/null 2>&1 || {
  echo "install-local.sh failed: missing required command 'python3'" >&2
  exit 1
}

SDK_HOME="${EPYDIOS_PYTHON_SDK_HOME:-$(default_sdk_home)}"
VENV_PATH="${SDK_HOME}/venv"
BIN_ROOT="${SDK_HOME}/bin"
METADATA_PATH="${SDK_HOME}/install-local.json"

if [[ "${RECREATE_VENV}" -eq 1 ]]; then
  rm -rf "${VENV_PATH}"
fi

mkdir -p "${SDK_HOME}" "${BIN_ROOT}"

if [[ ! -x "${VENV_PATH}/bin/python" ]]; then
  python3 -m venv "${VENV_PATH}"
fi

VENV_PYTHON="${VENV_PATH}/bin/python"
if [[ ! -x "${VENV_PYTHON}" ]]; then
  echo "install-local.sh failed: missing venv python at ${VENV_PYTHON}" >&2
  exit 1
fi

PURELIB="$("${VENV_PYTHON}" -c 'import sysconfig; print(sysconfig.get_path("purelib"))')"
PTH_PATH="${PURELIB}/epydios_client_local_source.pth"
mkdir -p "${PURELIB}"
printf "%s\n" "${SDK_SOURCE_ROOT}" > "${PTH_PATH}"

cat > "${BIN_ROOT}/epydios-python" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "${VENV_PYTHON}" "\$@"
EOF
chmod +x "${BIN_ROOT}/epydios-python"

cat > "${BIN_ROOT}/epydios-python-example" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "${VENV_PYTHON}" "${SDK_ROOT}/examples/submit_and_wait.py" "\$@"
EOF
chmod +x "${BIN_ROOT}/epydios-python-example"

cat > "${METADATA_PATH}" <<EOF
{
  "installMode": "local_source_link",
  "sdkRoot": "${SDK_ROOT}",
  "sdkSourceRoot": "${SDK_SOURCE_ROOT}",
  "sdkHome": "${SDK_HOME}",
  "venvPath": "${VENV_PATH}",
  "pythonPath": "${VENV_PYTHON}",
  "purelibPath": "${PURELIB}",
  "pthPath": "${PTH_PATH}",
  "wrapperPath": "${BIN_ROOT}/epydios-python",
  "exampleWrapperPath": "${BIN_ROOT}/epydios-python-example"
}
EOF

cat <<EOF
Epydios Python SDK local install complete.

SDK home:
  ${SDK_HOME}

Python wrapper:
  ${BIN_ROOT}/epydios-python

Example wrapper:
  ${BIN_ROOT}/epydios-python-example

Quick smoke test:
  "${BIN_ROOT}/epydios-python" -c "from epydios_client import EpydiosClient; print(EpydiosClient().health())"
EOF
