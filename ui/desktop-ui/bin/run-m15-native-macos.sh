#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "run-m15-native-macos.sh is for Darwin hosts only." >&2
  exit 1
fi

NATIVE_BINARY="$(m15_native_binary_path)"

export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}"
export GOCACHE="$(m15_go_cache_root)"
export GOMODCACHE="$(m15_go_mod_cache_root)"
export CGO_LDFLAGS="${CGO_LDFLAGS:-} -framework UniformTypeIdentifiers"
mkdir -p "${GOCACHE}" "${GOMODCACHE}" "$(dirname "${NATIVE_BINARY}")"

if [ ! -x "${NATIVE_BINARY}" ]; then
  cd "${M15_MODULE_ROOT}"
  go build \
    -buildvcs=false \
    -tags "desktop,m15native,production,wv2runtime.download" \
    -ldflags "-w -s" \
    -o "${NATIVE_BINARY}" \
    ./ >/dev/null
fi

exec "${NATIVE_BINARY}" "$@"
