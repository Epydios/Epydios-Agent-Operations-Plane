# Release Policy

The public OSS release promise is intentionally narrow: the installable macOS desktop in `live` is the supported lane, and the governed-request proof for that lane must stay green.

## Release Bar

A release is credible when these pass on the public baseline:

- `./platform/ci/bin/qc-preflight.sh`
- `./ui/desktop-ui/bin/check-m1.sh`
- `./ui/desktop-ui/bin/verify-m15-phase-c.sh`
- `./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh`

## Platform Posture

- macOS `live` installed desktop is the supported OSS lane
- Linux has a proven Ubuntu 24.04 beta lane
- Windows has a native packaging and launch beta lane

Linux and Windows are real public lanes, but they are not equal to the supported macOS lane unless the release artifacts and public docs are updated to say so.

## Versioning

- OSS releases use semantic version tags
- until `1.0.0`, the repo remains pre-1.0
- patch releases should stay backward-compatible bug or documentation fixes
- minor releases may add significant capability and may still reshape non-frozen internal surfaces

## Frozen Public Contracts

These surfaces are the public compatibility boundary:

- [contracts/extensions/v1alpha1/README.md](../contracts/extensions/v1alpha1/README.md)
- [docs/runtime-orchestration-service.md](runtime-orchestration-service.md)
- [platform/upgrade/README.md](../platform/upgrade/README.md)

Within those boundaries:

- additive changes are allowed inside an existing versioned contract directory
- breaking changes require a new versioned surface
- upgrade evidence must stay aligned with the policy files under [platform/upgrade/](../platform/upgrade/)

## Support Window

- latest released OSS tag: supported
- previous minor OSS line: best-effort for critical fixes and upgrade guidance
- older lines: unsupported unless a release note says otherwise

Security and correctness fixes target the latest line first.

## Premium Boundary

Premium AIMXS is supported through the public provider boundary only:

- `aimxs-https`
- `aimxs-full`

Premium artifacts are not part of the OSS repo contents or the OSS support promise.

## Telemetry Defaults

The documented OSS quality story does not enable product analytics or usage tracking by default.
