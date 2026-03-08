#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

cd "${REPO_ROOT}"

echo "[m20-exit] validating enterprise hardening baseline"
"${SCRIPT_DIR}/verify-m20-enterprise-hardening-baseline.sh"

echo "[m20-exit] validating full repo tests"
GOCACHE="${GOCACHE:-/tmp/go-build}" go test ./...

echo "[m20-exit] validating desktop baseline gates"
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m14-ui-daily-loop.sh
./platform/ci/bin/qc-preflight.sh
./platform/local/bin/verify-m13-m14-closeout-bundle.sh

echo "M20 enterprise hardening exit-gate validation passed."
