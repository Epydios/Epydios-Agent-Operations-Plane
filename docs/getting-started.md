# Getting Started

If you want the clearest first run through EpydiosOps, start on the supported macOS path.

## Recommended Evaluation Path

From the repo root:

```bash
./platform/ci/bin/qc-preflight.sh
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh
```

This path packages the desktop, launches the supported macOS `live` app, runs one governed Codex request, resolves approval, and follows the same run into audit and evidence.

## Install-Only macOS Path

If you want to install and open the product before running the governed-request flow:

```bash
./ui/desktop-ui/bin/install-m15-macos-beta.sh
./ui/desktop-ui/bin/verify-m15-phase-c.sh
"$HOME/Library/Application Support/EpydiosAgentOpsDesktop/launch-installed.sh"
```

## Other Platform Paths

- Linux has a public Ubuntu 24.04 beta install path.
- Windows has a public beta install path with native packaging artifacts and launcher helpers.
- Both are real beta paths, but neither is the supported OSS starting point.
- Both beta paths still use manual reinstall for updates.
- Stronger Linux or Windows wording waits for broader installed-host validation.
- Windows `live` remains explicitly deferred.

Use the [desktop module guide](../ui/desktop-ui/README.md) if you need those commands.

## What You Are Evaluating

The OSS repo gives you the public EpydiosOps baseline:

- the installable operator desktop
- the local launcher and localhost gateway
- governed execution with audit, evidence, and receipts
- public provider contracts and OSS baseline providers

Separately delivered premium-provider material remains outside the OSS path above.

## Read Next

- [OSS quality story](quality-story.md)
- [Desktop module guide](../ui/desktop-ui/README.md)
- [Runtime orchestration service](runtime-orchestration-service.md)
- [Governed action request contract](specs/governed-action-request-contract.md)
- [OSS versus premium policy](oss-premium-policy.md)
