# Release Policy

The release baseline starts on the installed macOS desktop in `live`, reviews governed work first in `Companion`, and opens `Workbench` only when the same governed path needs deeper follow-through. That flow and its governed-request proof must stay green.

## Release Bar

A release is credible when these pass on the baseline:

- `./platform/ci/bin/qc-preflight.sh`
- `./ui/desktop-ui/bin/check-m1.sh`
- `./ui/desktop-ui/bin/verify-m15-phase-c.sh`
- `./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh`

## Proof Sequence

The release story should stay in this order:

1. governed work first in `Companion`
2. deeper review in `Workbench` on the same governed path
3. audit and evidence follow-through on that same path

Shell context and setup posture can support that story, but they do not replace the governed-work-first sequence.

## Platform Posture

- macOS `live` installed desktop is the supported lane
- Linux has Ubuntu 24.04 beta install and verification paths
- Windows has beta install and verification paths

Linux and Windows remain beta install paths while their installed-host coverage expands.

## Beta Installed Paths

The current beta install paths include:

- Linux uses an AppImage primary artifact with a tarball fallback plus installed launcher and uninstall helpers
- Windows uses an installer primary artifact with a packaged executable pair plus installed launcher helpers
- both lanes already ship install, launch, uninstall, and verification helpers in-tree
- both lanes keep manual reinstall as the update posture
- stronger Linux or Windows wording waits for broader host validation
- Windows `live` operator parity remains explicitly deferred

## Supported Installed Contract

The current supported contract is one installed macOS lane:

- install the `.app` into `~/Applications`
- keep launcher state and bootstrap state under `~/Library/Application Support/EpydiosAgentOpsDesktop`
- keep session manifests, logs, and crash output under `~/Library/Caches/EpydiosAgentOpsDesktop`
- relaunch through the installed helper or installed app path, not a repo-local dev flow

When that lane degrades, the operator should still be able to find the bootstrap config, session manifest, session event log, UI log, runtime log, and gateway log under the installed support roots without reading terminal output first. LogOps keeps the default surface focused on the artifacts that usually matter first.

## Update Posture

The current update posture is manual and explicit:

- install from the released artifact
- reinstall when you want to move forward
- do not assume a silent background updater or in-app update agent

That remains the supported update model as long as the installed lane stays clear and the release bar stays green.

## Current Runtime Posture

The current installed `live` lane uses a cluster-backed runtime.

That means:

- the launcher-managed desktop is the primary operator surface
- the runtime and gateway contract behind that lane depends on the current cluster-backed path
- future `Desktop Local`, `Desktop Connected`, and `Desktop Cluster-Admin` modes build on the same architecture

## Versioning

- releases use semantic version tags
- until `1.0.0`, the repo remains pre-1.0
- patch releases should stay backward-compatible bug or documentation fixes
- minor releases may add significant capability and may still reshape non-frozen internal surfaces

## Frozen Contracts

These surfaces are the compatibility boundary:

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

## Telemetry Defaults

The documented OSS quality story does not enable product analytics or usage tracking by default.
