#!/usr/bin/env bash

if [ -n "${EPYDIOS_M21_PATHS_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
EPYDIOS_M21_PATHS_LOADED=1

M21_BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
M21_MODULE_ROOT="$(cd "${M21_BIN_DIR}/.." && pwd)"
M21_REPO_ROOT="$(cd "${M21_MODULE_ROOT}/../.." && pwd)"
M21_WORKSPACE_ROOT="$(cd "${M21_REPO_ROOT}/.." && pwd)"
M21_NON_GITHUB_ROOT="${M21_WORKSPACE_ROOT}/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB"
M21_CACHE_ROOT="${EPYDIOS_M21_CACHE_ROOT:-${M21_NON_GITHUB_ROOT}/internal-readiness/m21-local-cache}"

m21_local_cache_root() {
  printf "%s\n" "${M21_CACHE_ROOT}"
}

m21_macos_launch_root() {
  printf "%s/macos-launch\n" "${M21_CACHE_ROOT}"
}

m21_local_runtime_root() {
  printf "%s/local-runtime\n" "${M21_CACHE_ROOT}"
}

m21_local_runtime_bin_root() {
  printf "%s/bin\n" "$(m21_local_runtime_root)"
}

m21_local_runtime_binary_path() {
  printf "%s/control-plane-runtime\n" "$(m21_local_runtime_bin_root)"
}

m21_local_runtime_session_root() {
  printf "%s/sessions\n" "$(m21_local_runtime_root)"
}

m21_local_aimxs_root() {
  printf "%s/aimxs-full\n" "$(m21_local_runtime_root)"
}

m21_local_aimxs_provider_override_path() {
  printf "%s/provider-override.json\n" "$(m21_local_aimxs_root)"
}

m21_local_aimxs_provider_state_path() {
  printf "%s/provider-state.json\n" "$(m21_local_aimxs_root)"
}

m21_local_ref_vault_root() {
  printf "%s/internal-readiness/local-ref-vault\n" "${M21_NON_GITHUB_ROOT}"
}

m21_local_ref_vault_index_path() {
  printf "%s/index.json\n" "$(m21_local_ref_vault_root)"
}

m21_local_ref_vault_export_path() {
  printf "%s/runtime-ref-values.generated.json\n" "$(m21_local_ref_vault_root)"
}

m21_local_ref_vault_service_name() {
  printf "%s\n" "${EPYDIOS_M21_LOCAL_REF_VAULT_SERVICE:-epydios.agentops.desktop.local-ref.v1}"
}

m21_go_cache_root() {
  printf "%s/go-build-cache\n" "${M21_CACHE_ROOT}"
}

m21_go_mod_cache_root() {
  printf "%s/go-mod-cache\n" "${M21_CACHE_ROOT}"
}

m21_legacy_repo_tmp_root() {
  printf "%s/.tmp\n" "${M21_MODULE_ROOT}"
}
