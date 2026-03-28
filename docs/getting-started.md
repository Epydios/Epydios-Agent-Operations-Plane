# Getting Started

If you want one clean evaluation path for EpydiosOps, use the supported macOS lane first.

## Canonical Evaluation Path

From the repo root:

```bash
./platform/ci/bin/qc-preflight.sh
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh
```

This path proves the repo can package the desktop, launch the supported macOS `live` lane, run one governed Codex request, resolve approval, and hand the run off into audit and evidence.

## Narrower Install Check

If you only want the installed desktop lane without the governed-request harness:

```bash
./ui/desktop-ui/bin/install-m15-macos-beta.sh
./ui/desktop-ui/bin/verify-m15-phase-c.sh
"$HOME/Library/Application Support/EpydiosAgentOpsDesktop/launch-installed.sh"
```

## Other Platform Lanes

- Linux has a proven Ubuntu 24.04 beta installed evaluation lane.
- Windows has a beta installed evaluation lane with native packaging and launch proof.
- Both are real, but neither is the supported OSS lane for first evaluation.
- Windows `live` remains explicitly deferred.

Use the [desktop module guide](../ui/desktop-ui/README.md) if you need those commands.

## What You Are Evaluating

The OSS repo gives you EpydiosOps in its public baseline:

- the installable operator desktop
- the local launcher and localhost gateway
- governed execution with audit, evidence, and receipts
- public provider contracts and OSS baseline providers

Premium AIMXS remains separate and is not required for the OSS path above.

## Read Next

- [OSS quality story](quality-story.md)
- [Desktop module guide](../ui/desktop-ui/README.md)
- [Runtime orchestration service](runtime-orchestration-service.md)
- [Governed action request contract](specs/governed-action-request-contract.md)
- [OSS versus premium policy](oss-premium-policy.md)
