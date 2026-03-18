#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
WORKSPACE_ROOT="$(cd "${REPO_ROOT}/.." && pwd)"
NON_GITHUB_ROOT="${NON_GITHUB_ROOT:-${WORKSPACE_ROOT}/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB}"

ARTIFACT_DIR="${ARTIFACT_DIR:-}"
DIGEST_MANIFEST_BASENAME="${DIGEST_MANIFEST_BASENAME:-release-image-digests.json}"
REQUIRE_PUSHED="${REQUIRE_PUSHED:-1}"
UPDATE_STATUS="${UPDATE_STATUS:-release-synced}"
ARCHIVE_DIR="${ARCHIVE_DIR:-${NON_GITHUB_ROOT}/provenance/releases}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

usage() {
  cat <<EOF
Usage:
  ARTIFACT_DIR=/path/to/release-artifacts ./platform/local/bin/ingest-release-artifacts.sh

Required input:
  - ARTIFACT_DIR containing ${DIGEST_MANIFEST_BASENAME}
    or downloaded per-component release-digest-* artifacts from a failed aggregate run

What this does:
  1) Archives release artifacts to EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/releases/<timestamp>/ by default
  2) Rebuilds ${DIGEST_MANIFEST_BASENAME} from component digest JSON files when needed
  3) Syncs provenance/images.lock.yaml from release digest manifest
  4) Syncs platform/overlays/production/patch-image-digests.yaml from release digest manifest
  5) Runs strict provenance lock verification
EOF
}

rebuild_digest_manifest_if_needed() {
  local digest_manifest="$1"
  local -a digest_jsons
  local path

  if [ -f "${digest_manifest}" ]; then
    return 0
  fi

  digest_jsons=()
  while IFS= read -r path; do
    digest_jsons+=("${path}")
  done < <(find "${ARTIFACT_DIR}" -type f -name '*.json' -print | sort)

  if [ "${#digest_jsons[@]}" -eq 0 ]; then
    echo "Required digest manifest missing: ${digest_manifest}" >&2
    exit 1
  fi

  echo "Rebuilding ${DIGEST_MANIFEST_BASENAME} from component digest artifacts..."
  jq -s '
    map(select(type == "object" and has("component") and has("digest_ref"))) |
    sort_by(.component)
  ' "${digest_jsons[@]}" > "${digest_manifest}"

  jq -e 'type == "array" and length > 0' "${digest_manifest}" >/dev/null || {
    echo "Unable to rebuild ${DIGEST_MANIFEST_BASENAME} from ${ARTIFACT_DIR}" >&2
    exit 1
  }
}

main() {
  require_cmd jq
  require_cmd cp
  require_cmd mkdir
  require_cmd date
  require_cmd go

  if [ -z "${ARTIFACT_DIR}" ]; then
    usage
    echo "ARTIFACT_DIR is required." >&2
    exit 1
  fi

  if [ ! -d "${ARTIFACT_DIR}" ]; then
    echo "Artifact directory does not exist: ${ARTIFACT_DIR}" >&2
    exit 1
  fi

  local digest_manifest
  digest_manifest="${ARTIFACT_DIR}/${DIGEST_MANIFEST_BASENAME}"
  rebuild_digest_manifest_if_needed "${digest_manifest}"

  jq -e 'type == "array" and length > 0' "${digest_manifest}" >/dev/null || {
    echo "Invalid digest manifest format: ${digest_manifest}" >&2
    exit 1
  }

  local ts archive_path
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  archive_path="${ARCHIVE_DIR}/${ts}"
  mkdir -p "${archive_path}"

  echo "Archiving release artifacts to ${archive_path}..."
  cp -R "${ARTIFACT_DIR}/." "${archive_path}/"

  echo "Syncing lockfile from ${digest_manifest}..."
  DIGEST_MANIFEST="${digest_manifest}" \
    LOCKFILE="${REPO_ROOT}/provenance/images.lock.yaml" \
    REQUIRE_PUSHED="${REQUIRE_PUSHED}" \
    UPDATE_STATUS="${UPDATE_STATUS}" \
    "${REPO_ROOT}/platform/ci/bin/sync-release-digests-to-lockfile.sh"

  echo "Syncing production digest patch from ${digest_manifest}..."
  DIGEST_MANIFEST="${digest_manifest}" \
    PATCH_FILE="${REPO_ROOT}/platform/overlays/production/patch-image-digests.yaml" \
    "${REPO_ROOT}/platform/ci/bin/sync-release-digests-to-production-patch.sh"

  echo "Running strict provenance lock verification..."
  (cd "${REPO_ROOT}" && GOCACHE=/tmp/go-build go run ./cmd/provenance-lock-check -strict -repo-root .)

  cat <<EOF
Release artifact ingest completed.
  artifact_dir=${ARTIFACT_DIR}
  digest_manifest=${digest_manifest}
  archive_path=${archive_path}
  lockfile=${REPO_ROOT}/provenance/images.lock.yaml
  production_patch=${REPO_ROOT}/platform/overlays/production/patch-image-digests.yaml
EOF
}

main "$@"
