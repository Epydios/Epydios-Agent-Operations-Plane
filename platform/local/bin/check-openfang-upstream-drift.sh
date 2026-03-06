#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
PIN_FILE="${PIN_FILE:-${REPO_ROOT}/providers/desktop/openfang/upstream-pin.json}"
FAIL_ON_DRIFT="${FAIL_ON_DRIFT:-0}"

require_cmd() {
  local cmd="$1"
  command -v "${cmd}" >/dev/null 2>&1 || {
    echo "Openfang upstream drift check failed: missing command '${cmd}'." >&2
    exit 1
  }
}

get_tag_commit() {
  local source_url="$1"
  local tag="$2"
  local commit=""
  commit="$(git ls-remote --tags "${source_url}" "refs/tags/${tag}^{}" | awk '{print $1}' | head -n1)"
  if [ -z "${commit}" ]; then
    commit="$(git ls-remote --tags "${source_url}" "refs/tags/${tag}" | awk '{print $1}' | head -n1)"
  fi
  printf "%s" "${commit}"
}

require_cmd jq
require_cmd git
require_cmd awk
require_cmd sort

if [ ! -f "${PIN_FILE}" ]; then
  echo "Openfang upstream drift check failed: pin file not found at '${PIN_FILE}'." >&2
  exit 1
fi

source_url="$(jq -r '.sourceUrl // empty' "${PIN_FILE}")"
tracked_tag="$(jq -r '.trackedTag // empty' "${PIN_FILE}")"
tracked_commit="$(jq -r '.trackedCommit // empty' "${PIN_FILE}")"

if [ -z "${source_url}" ] || [ -z "${tracked_tag}" ] || [ -z "${tracked_commit}" ]; then
  echo "Openfang upstream drift check failed: pin file must include sourceUrl, trackedTag, trackedCommit." >&2
  exit 1
fi

latest_tag="$(git ls-remote --tags "${source_url}" | awk -F/ '/refs\/tags\/v[0-9]+\.[0-9]+\.[0-9]+$/{print $3}' | sort -V | tail -n1)"
if [ -z "${latest_tag}" ]; then
  echo "Openfang upstream drift check failed: could not resolve latest semver tag from ${source_url}." >&2
  exit 1
fi

latest_commit="$(get_tag_commit "${source_url}" "${latest_tag}")"
tracked_remote_commit="$(get_tag_commit "${source_url}" "${tracked_tag}")"

if [ -z "${latest_commit}" ] || [ -z "${tracked_remote_commit}" ]; then
  echo "Openfang upstream drift check failed: unable to resolve remote commit for tracked/latest tags." >&2
  exit 1
fi

drift="false"
reasons=()
if [ "${tracked_tag}" != "${latest_tag}" ]; then
  drift="true"
  reasons+=("tracked_tag(${tracked_tag}) != latest_tag(${latest_tag})")
fi
if [ "${tracked_commit}" != "${tracked_remote_commit}" ]; then
  drift="true"
  reasons+=("tracked_commit(${tracked_commit}) != remote_commit_for_tracked_tag(${tracked_remote_commit})")
fi

echo "Openfang upstream drift check:"
echo "  pin_file=${PIN_FILE}"
echo "  source_url=${source_url}"
echo "  tracked_tag=${tracked_tag}"
echo "  tracked_commit=${tracked_commit}"
echo "  latest_tag=${latest_tag}"
echo "  latest_commit=${latest_commit}"
echo "  drift=${drift}"

if [ "${drift}" = "true" ]; then
  for reason in "${reasons[@]}"; do
    echo "  reason=${reason}"
  done
  if [ "${FAIL_ON_DRIFT}" = "1" ]; then
    exit 1
  fi
  exit 0
fi

echo "Openfang upstream pin is up to date."
