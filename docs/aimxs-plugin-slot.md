# AIMXS Plug-in Slot (Provider Boundary)

This document codifies the boundary: AIMXS remains private and external to the OSS build graph.
The stale sibling-folder workspace dependency is not part of that boundary and
is being replaced with an official premium install path for local full mode.

## Design Rule

- OSS control plane exposes versioned provider contracts and `ExtensionProvider` registration.
- AIMXS runs behind the public provider boundary, either as an HTTPS provider or as the Desktop/runtime local full shim.
- OSS must not vendor AIMXS code directly into the build graph.
- Deployment modes stay on one contract surface:
  - OSS-only (`platform/modes/oss-only`)
  - AIMXS HTTPS (`platform/modes/aimxs-https`)
  - AIMXS full local Desktop/runtime shim (`ui/desktop-ui/bin/aimxs-full-provider.py`)

## Slot Interface

The OSS slot boundary is defined in:

- `internal/providerboundary/slot.go`

This package defines:

- `SlotResolver` for capability-to-provider resolution
- `SlotRegistry` for external provider registration lifecycle
- `Registration` and endpoint auth shape (`None`, `BearerTokenSecret`, `MTLS`, `MTLSAndBearerTokenSecret`)

## Endpoint Security Expectations

- Prefer `MTLS` or `MTLSAndBearerTokenSecret` for AIMXS HTTPS providers.
- Use HTTPS endpoint URLs for all mTLS modes.
- Keep AIMXS credentials/material in Kubernetes secrets referenced by `ExtensionProvider` auth fields.

## Full Local Mode

- `aimxs-full` is the local Desktop/runtime AIMXS shim started by `ui/desktop-ui/bin/run-macos-local.sh`.
- It dynamically loads the premium AIMXS artifact at runtime and exposes the public `PolicyProvider` contract locally.
- The default local install root is `~/.epydios/premium/aimxs/extracted`.
- `EPYDIOS_AIMXS_EXTRACTED_ROOT` can override that root when the premium artifact is installed elsewhere.
- The premium artifact should live outside the OSS repo tree by default.
- It does not reuse the OSS placeholder policy provider and it does not require HTTPS, mTLS, or bearer-token refs.

## Deployment Mode Profiles

- Mode manifests are under `platform/modes/`.
- `oss-only` routes to OSS providers and keeps AIMXS out of the execution path.
- `aimxs-https` routes to AIMXS HTTPS endpoint over secure auth.
- `aimxs-full` routes local Desktop/runtime policy evaluation through the AIMXS full shim with no silent OSS fallback.
- Missing premium AIMXS material must fail clearly; `aimxs-full` must never silently degrade to OSS.

## Operational Contract

- AIMXS providers advertise capabilities through `/v1alpha1/capabilities`.
- Health endpoint defaults to `/healthz`.
- Contract compatibility remains tied to `contracts/extensions/v1alpha1`.
- Decision API compatibility policy is tracked in:
  - `platform/upgrade/compatibility-policy-aimxs-decision-api.yaml`
- For non-`DENY` decisions, AIMXS-compatible policy providers should return a grant token (`grantToken` or `output.aimxsGrantToken`) so runtime can enforce non-bypassable execution.
- Runtime can enforce entitlement/SKU boundary for AIMXS provider paths (`AUTHZ_REQUIRE_AIMXS_ENTITLEMENT=true`) before policy provider invocation.
- Entitlement policy is configured via runtime env:
  - `AUTHZ_AIMXS_PROVIDER_PREFIXES`
  - `AUTHZ_AIMXS_ALLOWED_SKUS`
  - `AUTHZ_AIMXS_REQUIRED_FEATURES`
  - `AUTHZ_AIMXS_SKU_FEATURES_JSON`
  - `AUTHZ_AIMXS_ENTITLEMENT_TOKEN_REQUIRED`

## Conformance and Failure Handling

- Conformance checks should prove:
  - provider probe success updates `ExtensionProvider.status.conditions` to `Ready=True` and `Probed=True`
  - endpoint URL is HTTPS and auth mode is `MTLS` or `MTLSAndBearerTokenSecret`
  - AIMXS is only referenced through `internal/providerboundary/slot.go` interfaces
- Failure-handling behavior must stay observable at the CR status boundary:
  - endpoint/network/auth failures must surface as `Ready=False` / `Probed=False`
  - capability or provider-type mismatch must surface as probe failure with explicit status message
  - missing bearer or mTLS secret material must fail probe and never silently downgrade auth mode
- Local boundary verification is provided by:
  - `platform/local/bin/verify-aimxs-boundary.sh`
  - `platform/local/bin/verify-m10-policy-grant-enforcement.sh`
  - `platform/local/bin/verify-m10-entitlement-deny.sh`
  - `platform/local/bin/verify-m10-deployment-modes.sh`
  - `platform/local/bin/verify-m10-no-egress-local-aimxs.sh`
