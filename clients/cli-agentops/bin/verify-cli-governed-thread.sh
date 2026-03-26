#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

mkdir -p "${MODULE_ROOT}/.tmp/go-build"
export GOCACHE="${MODULE_ROOT}/.tmp/go-build"

cd "${MODULE_ROOT}"
go run ./clients/cli-agentops/bin/cli_governed_thread_acceptance.go
