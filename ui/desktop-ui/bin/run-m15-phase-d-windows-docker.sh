#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

IMAGE_TAG="epydios-agentops-m15-phase-d-builder:local"
DOCKERFILE_PATH="${M15_MODULE_ROOT}/docker/m15-windows-builder/Dockerfile"
BUILD_CONTEXT="${M15_MODULE_ROOT}/docker/m15-windows-builder"
MOUNT_ROOT="/workspace/agentops-desktop"
CONTAINER_CACHE_ROOT="${MOUNT_ROOT}/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m15-cache-windows-docker"

docker build \
  --platform linux/amd64 \
  -t "${IMAGE_TAG}" \
  -f "${DOCKERFILE_PATH}" \
  "${BUILD_CONTEXT}"

docker run \
  --rm \
  --platform linux/amd64 \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp/epydios-home \
  -e EPYDIOS_M15_CACHE_ROOT="${CONTAINER_CACHE_ROOT}" \
  -e EPYDIOS_M15_HOST_WORKSPACE_ROOT="${M15_WORKSPACE_ROOT}" \
  -v "${M15_WORKSPACE_ROOT}:${MOUNT_ROOT}" \
  -w "${MOUNT_ROOT}/EPYDIOS_AGENTOPS_DESKTOP_REPO" \
  "${IMAGE_TAG}" \
  bash -lc 'export PATH="/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin"; mkdir -p "$HOME"; ./ui/desktop-ui/bin/package-m15-windows.sh'
