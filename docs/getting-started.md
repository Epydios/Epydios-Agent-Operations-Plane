# Getting Started

Use this path if you want to evaluate the public OSS baseline without digging through the full docs tree.

## What You Are Running

The OSS repo gives you:

- the control plane
- the desktop UI and launcher source
- the localhost gateway path
- governed execution with audit, evidence, and receipts
- an OSS baseline with `ALLOW` and `DENY`

Premium AIMXS remains separate and is not required for the OSS baseline.

## Fast Repo Check

From the repo root:

```bash
./platform/ci/bin/qc-preflight.sh
./ui/desktop-ui/bin/check-m1.sh
```

That gives you the quickest confidence pass that the repo and desktop module are in a sane state.

## Installed Desktop Check On macOS

If you are on macOS, use the installed desktop path next:

```bash
./ui/desktop-ui/bin/install-m15-macos-beta.sh
./ui/desktop-ui/bin/verify-m15-phase-c.sh
open "$HOME/Applications/Epydios AgentOps Desktop.app"
```

This is the current verified operator path for the installable desktop app.

## Installed Desktop Check On Linux

If you are on Ubuntu and want to evaluate the beta installed desktop path:

```bash
./ui/desktop-ui/bin/bootstrap-m15-linux-ubuntu.sh
./ui/desktop-ui/bin/check-m15-native-toolchain.sh
./ui/desktop-ui/bin/install-m15-linux-beta.sh
./ui/desktop-ui/bin/verify-m15-linux-beta.sh
./ui/desktop-ui/bin/launch-m15-linux-beta.sh
```

Ubuntu 24.04 x86_64 now has a proven host-acceptance path for native preflight, packaging and install, and launcher startup. Linux should still be treated as beta until broader host coverage is in place.

## What To Read Next

- [OSS quality story](quality-story.md)
- [Desktop module guide](../ui/desktop-ui/README.md)
- [Runtime orchestration service](runtime-orchestration-service.md)
- [Governed action request contract](specs/governed-action-request-contract.md)
- [OSS versus premium policy](oss-premium-policy.md)

## Optional Premium Comparison

If premium AIMXS is installed later and you want to compare the richer premium path against the OSS baseline, use the dedicated runbooks instead of treating that as the default OSS story.
