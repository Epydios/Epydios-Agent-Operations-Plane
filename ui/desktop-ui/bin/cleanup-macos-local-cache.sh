#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib-m21-paths.sh
source "${SCRIPT_DIR}/lib-m21-paths.sh"

DRY_RUN=0
INCLUDE_LAUNCH=0

usage() {
  cat <<'EOF'
Usage: cleanup-macos-local-cache.sh [options]

Removes disposable local browser-run and build cache artifacts for desktop-ui.

Options:
  --dry-run                Show what would be removed without deleting anything
  --include-launch-sessions
                           Also remove the legacy repo-local macos-launch sessions
  -h, --help               Show usage
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --include-launch-sessions)
      INCLUDE_LAUNCH=1
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

legacy_tmp_root="$(m21_legacy_repo_tmp_root)"
legacy_targets=(
  "${legacy_tmp_root}/go-build-cache"
  "${legacy_tmp_root}/gocache"
  "${legacy_tmp_root}/go-build"
  "${legacy_tmp_root}/go-mod-cache"
  "${legacy_tmp_root}/go-tmp"
)

if [[ "${INCLUDE_LAUNCH}" == "1" ]]; then
  legacy_targets+=("${legacy_tmp_root}/macos-launch")
fi

echo "desktop_ui_cache_root=$(m21_local_cache_root)"
echo "legacy_repo_tmp_root=${legacy_tmp_root}"

for target in "${legacy_targets[@]}"; do
  if [[ -e "${target}" ]]; then
    du -sh "${target}" 2>/dev/null || true
    if [[ "${DRY_RUN}" == "0" ]]; then
      rm -rf "${target}"
      echo "removed ${target}"
    fi
  fi
done

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "dry-run complete"
else
  echo "cleanup complete"
fi
