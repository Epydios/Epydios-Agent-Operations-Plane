#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

cd "${REPO_ROOT}"

EPYDIOS_CONNECTOR_PROOF_DRIVER="mcp_browser" \
GOCACHE="${REPO_ROOT}/.tmp/go-build" \
go run ./ui/desktop-ui/cmd/mcp_sqlite_gateway_acceptance
