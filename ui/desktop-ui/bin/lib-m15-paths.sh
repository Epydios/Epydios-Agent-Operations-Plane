#!/usr/bin/env bash

if [ -n "${EPYDIOS_M15_PATHS_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
EPYDIOS_M15_PATHS_LOADED=1

M15_BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
M15_MODULE_ROOT="$(cd "${M15_BIN_DIR}/.." && pwd)"
M15_REPO_ROOT="$(cd "${M15_MODULE_ROOT}/../.." && pwd)"
M15_WORKSPACE_ROOT="$(cd "${M15_REPO_ROOT}/.." && pwd)"
M15_STATE_ROOT="${EPYDIOS_M15_STATE_ROOT:-${M15_MODULE_ROOT}/.epydios}"
M15_NON_GITHUB_ROOT="${EPYDIOS_NON_GITHUB_ROOT:-${M15_STATE_ROOT}}"
M15_CACHE_ROOT="${EPYDIOS_M15_CACHE_ROOT:-${M15_STATE_ROOT}/m15-cache}"

m15_timestamp_utc() {
  date -u +"%Y%m%dT%H%M%SZ"
}

m15_host_os() {
  uname -s | tr '[:upper:]' '[:lower:]'
}

m15_host_arch() {
  uname -m
}

m15_host_tag() {
  printf "%s-%s\n" "$(m15_host_os)" "$(m15_host_arch)"
}

m15_native_binary_path() {
  printf "%s/native-build/%s/epydios-agentops-desktop\n" "${M15_CACHE_ROOT}" "$(m15_host_tag)"
}

m15_frontend_stage_root() {
  printf "%s/frontend-stage/%s\n" "${M15_CACHE_ROOT}" "${1:-default}"
}

m15_phase_artifact_root() {
  printf "%s/internal-readiness/%s\n" "${M15_NON_GITHUB_ROOT}" "$1"
}

m15_go_cache_root() {
  printf "%s/go-build-cache\n" "${M15_CACHE_ROOT}"
}

m15_go_mod_cache_root() {
  printf "%s/go-mod-cache\n" "${M15_CACHE_ROOT}"
}

m15_json_escape() {
  printf '%s' "${1:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

m15_shell_path() {
  local candidate="${1:-}"
  if [ -z "${candidate}" ]; then
    printf '\n'
    return
  fi
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "${candidate}"
    return
  fi
  printf '%s\n' "${candidate}"
}

m15_windows_path() {
  local candidate="${1:-}"
  if [ -z "${candidate}" ]; then
    printf '\n'
    return
  fi
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "${candidate}"
    return
  fi
  printf '%s\n' "${candidate}"
}
