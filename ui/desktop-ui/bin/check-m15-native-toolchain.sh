#!/usr/bin/env bash
set -euo pipefail

fail=0

# Support common user-local install locations so the preflight works in
# controlled environments where PATH startup files are not loaded.
for candidate in "${HOME}/bin" "${HOME}/.local/bin"; do
  if [ -d "${candidate}" ] && [[ ":${PATH}:" != *":${candidate}:"* ]]; then
    PATH="${candidate}:${PATH}"
  fi
done

have() {
  command -v "$1" >/dev/null 2>&1
}

require_cmd() {
  local cmd="$1"
  local label="$2"
  if have "${cmd}"; then
    echo "OK   ${label}: ${cmd}"
  else
    echo "MISS ${label}: ${cmd}"
    fail=1
  fi
}

echo "M15 native app toolchain preflight"
echo "host=$(uname -s) arch=$(uname -m)"

require_cmd go "Go toolchain"
require_cmd node "Node.js runtime"
require_cmd npm "npm package manager"
require_cmd wails "Wails CLI"

host="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "${host}" in
  darwin)
    if xcode-select -p >/dev/null 2>&1; then
      echo "OK   macOS build tools: xcode-select"
    else
      echo "MISS macOS build tools: xcode-select"
      fail=1
    fi
    ;;
  linux)
    require_cmd pkg-config "pkg-config"
    if have pkg-config && pkg-config --exists gtk+-3.0 && { pkg-config --exists webkit2gtk-4.1 || pkg-config --exists webkit2gtk-4.0; }; then
      echo "OK   Linux GTK/WebKit deps: gtk+-3.0 + webkit2gtk-4.0/4.1"
    else
      echo "MISS Linux GTK/WebKit deps: gtk+-3.0 + webkit2gtk-4.0/4.1"
      echo "     install: libgtk-3-dev and libwebkit2gtk-4.0-dev or libwebkit2gtk-4.1-dev (package names vary by distro)"
      fail=1
    fi
    ;;
  msys*|mingw*|cygwin*)
    require_cmd powershell "PowerShell"
    ;;
  *)
    echo "WARN unknown host '${host}'; skipping host-specific checks"
    ;;
esac

if [ "${fail}" -ne 0 ]; then
  echo "RESULT: FAIL (missing native app prerequisites)"
  exit 1
fi

echo "RESULT: PASS (native app prerequisites are present)"
