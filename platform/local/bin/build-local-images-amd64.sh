#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${DOCKER_PLATFORM:-}" ]; then
  export DOCKER_PLATFORM="linux/amd64"
fi

exec "${SCRIPT_DIR}/build-local-images.sh" "$@"
