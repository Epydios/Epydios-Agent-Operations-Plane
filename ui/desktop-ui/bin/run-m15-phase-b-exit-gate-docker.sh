#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib-m15-paths.sh"

IMAGE_TAG="epydios-agentops-m15-phase-b-builder:local"
DOCKERFILE_PATH="${M15_MODULE_ROOT}/docker/m15-linux-builder/Dockerfile"
BUILD_CONTEXT="${M15_MODULE_ROOT}/docker/m15-linux-builder"
MOUNT_ROOT="/workspace/agentops-desktop"
HOST_KUBECONFIG_DIR="${M15_NON_GITHUB_ROOT}/internal-readiness/m15-native-phase-b-exit"
HOST_KUBECONFIG_PATH="${HOST_KUBECONFIG_DIR}/docker-kind-kubeconfig.yaml"
CONTAINER_KUBECONFIG_PATH="${MOUNT_ROOT}/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/.epydios/internal-readiness/m15-native-phase-b-exit/docker-kind-kubeconfig.yaml"
CONTAINER_CACHE_ROOT="${MOUNT_ROOT}/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/.epydios/m15-cache-linux-docker"

mkdir -p "${HOST_KUBECONFIG_DIR}"

kubectl config view --raw | awk '
  /certificate-authority-data:/ { next }
  /server: https:\/\/127\.0\.0\.1:/ {
    sub("https://127.0.0.1:", "https://host.docker.internal:")
    print
    print "    insecure-skip-tls-verify: true"
    next
  }
  { print }
' > "${HOST_KUBECONFIG_PATH}"

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
  -e KUBECONFIG="${CONTAINER_KUBECONFIG_PATH}" \
  -e M15_PHASE_B_ARTIFACT="tarball" \
  -v "${M15_WORKSPACE_ROOT}:${MOUNT_ROOT}" \
  -w "${MOUNT_ROOT}/EPYDIOS_AGENTOPS_DESKTOP_REPO" \
  "${IMAGE_TAG}" \
  bash -c 'export PATH="/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin"; mkdir -p "$HOME"; ./ui/desktop-ui/bin/verify-m15-phase-b-exit-gate.sh'
