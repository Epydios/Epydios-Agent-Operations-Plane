#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

DIGEST_MANIFEST="${DIGEST_MANIFEST:-${REPO_ROOT}/dist/release-image-digests.json}"
PATCH_FILE="${PATCH_FILE:-${REPO_ROOT}/platform/overlays/production/patch-image-digests.yaml}"
OPA_IMAGE_DIGEST="${OPA_IMAGE_DIGEST:-openpolicyagent/opa@sha256:15151b408ff6477e5f6b675e491cab60776be84be4fcbc19ca2d2024cec789bf}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_digest_ref() {
  local component="$1"
  local digest_ref="$2"
  if [[ ! "${digest_ref}" =~ ^ghcr\.io/.+@sha256:[0-9a-f]{64}$ ]]; then
    echo "Invalid or missing digest_ref for component=${component}: ${digest_ref}" >&2
    exit 1
  fi
}

read_digest_ref() {
  local component="$1"
  jq -r --arg component "${component}" '
    map(select(.component == $component)) | last | .digest_ref // ""
  ' "${DIGEST_MANIFEST}"
}

main() {
  require_cmd jq

  [ -f "${DIGEST_MANIFEST}" ] || {
    echo "Digest manifest not found: ${DIGEST_MANIFEST}" >&2
    exit 1
  }

  local runtime_ref
  local controller_ref
  local profile_ref
  local policy_ref
  local evidence_ref

  runtime_ref="$(read_digest_ref "epydios-control-plane-runtime")"
  controller_ref="$(read_digest_ref "epydios-extension-provider-registry-controller")"
  profile_ref="$(read_digest_ref "epydios-oss-profile-static-resolver")"
  policy_ref="$(read_digest_ref "epydios-oss-policy-opa-provider")"
  evidence_ref="$(read_digest_ref "epydios-oss-evidence-memory-provider")"

  require_digest_ref "epydios-control-plane-runtime" "${runtime_ref}"
  require_digest_ref "epydios-extension-provider-registry-controller" "${controller_ref}"
  require_digest_ref "epydios-oss-profile-static-resolver" "${profile_ref}"
  require_digest_ref "epydios-oss-policy-opa-provider" "${policy_ref}"
  require_digest_ref "epydios-oss-evidence-memory-provider" "${evidence_ref}"

  cat >"${PATCH_FILE}" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orchestration-runtime
spec:
  template:
    spec:
      containers:
        - name: runtime
          image: ${runtime_ref}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: extension-provider-registry-controller
spec:
  template:
    spec:
      containers:
        - name: controller
          image: ${controller_ref}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oss-profile-static-resolver
spec:
  template:
    spec:
      containers:
        - name: profile-resolver
          image: ${profile_ref}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: epydios-oss-policy-provider
spec:
  template:
    spec:
      containers:
        - name: policy-provider
          image: ${policy_ref}
        - name: opa
          image: ${OPA_IMAGE_DIGEST}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: epydios-oss-evidence-provider
spec:
  template:
    spec:
      containers:
        - name: evidence-provider
          image: ${evidence_ref}
EOF

  cat <<EOF
Release digest sync summary:
  digest_manifest=${DIGEST_MANIFEST}
  patch_file=${PATCH_FILE}
  runtime=${runtime_ref}
  controller=${controller_ref}
  profile=${profile_ref}
  policy=${policy_ref}
  evidence=${evidence_ref}
EOF
}

main "$@"
