#!/usr/bin/env bash

if [ -n "${EPYDIOS_M21_PATHS_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
EPYDIOS_M21_PATHS_LOADED=1

M21_BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
M21_MODULE_ROOT="$(cd "${M21_BIN_DIR}/.." && pwd)"
M21_REPO_ROOT="$(cd "${M21_MODULE_ROOT}/../.." && pwd)"
M21_WORKSPACE_ROOT="$(cd "${M21_REPO_ROOT}/.." && pwd)"
M21_STATE_ROOT="${EPYDIOS_M21_STATE_ROOT:-${M21_MODULE_ROOT}/.epydios}"
M21_HOME_ROOT="${HOME:-${M21_STATE_ROOT}}"
M21_PREMIUM_ROOT="${EPYDIOS_PREMIUM_ROOT:-${M21_HOME_ROOT}/.epydios/premium}"
M21_AIMXS_INSTALL_ROOT="${EPYDIOS_AIMXS_INSTALL_ROOT:-${M21_PREMIUM_ROOT}/aimxs}"
M21_AIMXS_EXTRACTED_ROOT="${EPYDIOS_AIMXS_EXTRACTED_ROOT:-${M21_AIMXS_INSTALL_ROOT}/extracted}"
M21_NON_GITHUB_ROOT="${EPYDIOS_NON_GITHUB_ROOT:-}"
M21_CACHE_ROOT="${EPYDIOS_M21_CACHE_ROOT:-${M21_STATE_ROOT}/m21-local-cache}"

m21_state_root() {
  printf "%s\n" "${M21_STATE_ROOT}"
}

m21_premium_root() {
  printf "%s\n" "${M21_PREMIUM_ROOT}"
}

m21_official_aimxs_install_root() {
  printf "%s\n" "${M21_AIMXS_INSTALL_ROOT}"
}

m21_official_aimxs_extracted_root() {
  printf "%s\n" "${M21_AIMXS_EXTRACTED_ROOT}"
}

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
  printf "%s\n" "${EPYDIOS_M21_LOCAL_REF_VAULT_ROOT:-${M21_STATE_ROOT}/local-ref-vault}"
}

m21_legacy_cache_root() {
  [ -n "${M21_NON_GITHUB_ROOT}" ] || return 0
  printf "%s/internal-readiness/m21-local-cache\n" "${M21_NON_GITHUB_ROOT}"
}

m21_legacy_local_ref_vault_root() {
  [ -n "${M21_NON_GITHUB_ROOT}" ] || return 0
  printf "%s/internal-readiness/local-ref-vault\n" "${M21_NON_GITHUB_ROOT}"
}

m21_legacy_local_aimxs_root() {
  local legacy_cache_root
  legacy_cache_root="$(m21_legacy_cache_root)"
  [ -n "${legacy_cache_root}" ] || return 0
  printf "%s/local-runtime/aimxs-full\n" "${legacy_cache_root}"
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

m21_migrate_file_if_needed() {
  local src="$1"
  local dst="$2"
  if [[ ! -f "${src}" || -f "${dst}" ]]; then
    return 0
  fi
  mkdir -p "$(dirname "${dst}")"
  cp "${src}" "${dst}"
}

m21_migrate_dir_if_needed() {
  local src="$1"
  local dst="$2"
  if [[ ! -d "${src}" || -e "${dst}" ]]; then
    return 0
  fi
  mkdir -p "$(dirname "${dst}")"
  cp -R "${src}" "${dst}"
}

m21_prepare_local_state_layout() {
  mkdir -p "$(m21_state_root)"
  mkdir -p "$(m21_local_cache_root)"
  mkdir -p "$(m21_local_ref_vault_root)"
  mkdir -p "$(m21_local_aimxs_root)"
  m21_migrate_file_if_needed \
    "$(m21_legacy_local_ref_vault_root)/index.json" \
    "$(m21_local_ref_vault_index_path)"
  m21_migrate_file_if_needed \
    "$(m21_legacy_local_ref_vault_root)/runtime-ref-values.generated.json" \
    "$(m21_local_ref_vault_export_path)"
  m21_migrate_file_if_needed \
    "$(m21_legacy_local_aimxs_root)/provider-override.json" \
    "$(m21_local_aimxs_provider_override_path)"
  m21_migrate_file_if_needed \
    "$(m21_legacy_local_aimxs_root)/provider-state.json" \
    "$(m21_local_aimxs_provider_state_path)"
  m21_migrate_file_if_needed \
    "$(m21_legacy_local_aimxs_root)/state-store.json" \
    "$(m21_local_aimxs_root)/state-store.json"
  m21_migrate_dir_if_needed \
    "$(m21_legacy_local_aimxs_root)/audit" \
    "$(m21_local_aimxs_root)/audit"
}
