# Release Policy

This document defines the public OSS release and support posture for the repository.

## Versioning

- OSS releases use semantic version tags.
- Until `1.0.0`, the repo is still pre-1.0:
  - patch releases are expected to be backward-compatible bug or documentation fixes
  - minor releases may add significant capabilities and may change non-frozen internal surfaces
- Frozen public contract surfaces still follow stricter rules even before `1.0.0`.

## Frozen Public Contracts

These surfaces are treated as the public compatibility boundary:

- [contracts/extensions/v1alpha1/README.md](../contracts/extensions/v1alpha1/README.md)
- [docs/runtime-orchestration-service.md](runtime-orchestration-service.md)
- [platform/upgrade/README.md](../platform/upgrade/README.md)

Rules:

- additive changes only within an existing versioned contract directory
- breaking contract changes require a new versioned contract surface
- upgrade and compatibility evidence must stay aligned with the declared policy files under `platform/upgrade/`

## Supported OSS Window

The OSS support posture is intentionally narrow:

- latest released OSS tag: supported
- previous minor OSS line: best-effort for critical fixes and upgrade guidance
- older lines: unsupported unless explicitly stated otherwise in release notes

Security and correctness fixes target the latest line first.

## Deprecation Policy

- deprecated public behavior must be documented in release notes before removal
- frozen public contract fields or endpoints should not be removed silently
- removals of public contract behavior require a versioned replacement path

## Canonical OSS Install Surfaces

These are the supported OSS entry paths:

- source checkout from this repository
- local platform bring-up through `platform/local/bin/verify-m0.sh`
- OSS mode selection through `platform/modes/oss-only`
- local desktop evaluation through `ui/desktop-ui`

Anything outside those paths may exist, but is not part of the primary OSS support promise.

## Premium Modes

Premium AIMXS is supported through the public provider boundary only:

- `aimxs-https`
- `aimxs-full`

Premium artifacts are not part of the OSS repo contents or OSS support promise.

## Telemetry And Observability Defaults

The documented OSS quality story does not enable product analytics or usage tracking by default.

Notes:

- the managed local Codex worker path explicitly disables CLI analytics in its default invocation path
- observability components in `platform/` are operator-managed infrastructure choices, not default third-party product analytics
- premium deployments may add their own enterprise observability or support requirements, but those are outside the OSS default path
