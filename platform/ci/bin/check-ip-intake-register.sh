#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

REGISTER_PATH="${REGISTER_PATH:-${REPO_ROOT}/provenance/ip/intake-register.json}"
LOCAL_GO_CACHE="${GOCACHE:-${REPO_ROOT}/.tmp/go-build}"
mkdir -p "${LOCAL_GO_CACHE}"

echo "QC: IP intake register policy check"
(cd "${REPO_ROOT}" && GOCACHE="${LOCAL_GO_CACHE}" go run ./cmd/ip-intake-check -repo-root "${REPO_ROOT}" -register "${REGISTER_PATH}")
