#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

if ! command -v kubectl >/dev/null 2>&1; then
  echo "Missing required command: kubectl" >&2
  exit 1
fi

kubectl kustomize "${REPO_ROOT}/platform/modes/oss-only" >/dev/null

echo "Public deployment-mode verification passed."
echo "The OSS repo verifies the public oss-only mode only."
echo "Separately delivered premium deployment modes are maintained outside the public repo."
