#!/usr/bin/env bash
set -euo pipefail

echo "Bootstrapping Ubuntu host for the EpydiosOps Desktop Linux beta installed evaluation lane..."

sudo apt update
sudo apt install -y \
  golang-go \
  nodejs \
  npm \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  build-essential \
  perl \
  curl \
  jq \
  rsync \
  file \
  libfuse2t64 \
  wget

if ! command -v wails >/dev/null 2>&1; then
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
fi

mkdir -p "${HOME}/bin"
if [ ! -x "${HOME}/bin/appimagetool" ]; then
  wget \
    https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage \
    -O "${HOME}/bin/appimagetool"
  chmod +x "${HOME}/bin/appimagetool"
fi

add_path_line() {
  local line="$1"
  local rc_path="$2"
  if [ -f "${rc_path}" ] && grep -Fq "${line}" "${rc_path}"; then
    return 0
  fi
  printf '%s\n' "${line}" >> "${rc_path}"
}

add_path_line 'export PATH="$HOME/bin:$PATH"' "${HOME}/.bashrc"
add_path_line 'export PATH="$PATH:$(go env GOPATH)/bin"' "${HOME}/.bashrc"

export PATH="${HOME}/bin:${PATH}:$(go env GOPATH)/bin"

echo
echo "Re-run the native checks with:"
echo "  ./ui/desktop-ui/bin/check-m15-native-toolchain.sh"
echo "  ./ui/desktop-ui/bin/install-m15-linux-beta.sh"
echo "  ./ui/desktop-ui/bin/verify-m15-linux-beta.sh"
