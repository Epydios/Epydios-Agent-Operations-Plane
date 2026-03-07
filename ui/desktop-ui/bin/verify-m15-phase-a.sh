#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

NATIVE_BINARY="$(m15_native_binary_path)"
FRONTEND_STAGE_ROOT="$(m15_frontend_stage_root phase-a)"

export PATH="${HOME}/bin:${HOME}/.local/bin:${PATH}"
export GOCACHE="$(m15_go_cache_root)"
export GOMODCACHE="$(m15_go_mod_cache_root)"
mkdir -p "${GOCACHE}" "${GOMODCACHE}" "$(dirname "${NATIVE_BINARY}")"
export CGO_LDFLAGS="${CGO_LDFLAGS:-} -framework UniformTypeIdentifiers"
export EPYDIOS_STAGE_WEB_DIST="${FRONTEND_STAGE_ROOT}"

cd "${M15_REPO_ROOT}"

"${M15_MODULE_ROOT}/bin/check-m15-native-toolchain.sh"
go test ./ui/desktop-ui/internal/nativeapp
npm --prefix "${M15_MODULE_ROOT}/frontend" run build >/dev/null
[ -f "${FRONTEND_STAGE_ROOT}/index.html" ] || {
  echo "verify-m15-phase-a failed: missing staged frontend index.html at ${FRONTEND_STAGE_ROOT}" >&2
  exit 1
}
pushd "${M15_MODULE_ROOT}" >/dev/null
go build \
  -buildvcs=false \
  -tags "desktop,m15native,production,wv2runtime.download" \
  -ldflags "-w -s" \
  -o "${NATIVE_BINARY}" \
  ./ >/dev/null
[ -x "${NATIVE_BINARY}" ] || {
  echo "verify-m15-phase-a failed: missing native binary ${NATIVE_BINARY}" >&2
  exit 1
}
popd >/dev/null

echo "M15 Phase A verifier passed."
