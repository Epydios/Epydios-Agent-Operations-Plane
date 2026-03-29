# EpydiosOps

EpydiosOps is an installable operator desktop for governed AI and tool execution.

Start with the governed item in `Companion`. If it needs deeper runtime, audit, evidence, or incident follow-through, open `Workbench` and keep the same decision and proof path attached.

![Epydios governed request flow](docs/images/governed-request-flow.png)

## Start Here

If you want the clearest way to evaluate EpydiosOps, start with the supported installed macOS path.

From the repo root:

```bash
./platform/ci/bin/qc-preflight.sh
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh
```

This path lets you:

- confirm the baseline checks pass
- package and launch the macOS app
- review governed work first in `Companion`
- open `Workbench` only when deeper review is needed
- see whether `Interposition` is `OFF` or `ON`
- one governed Codex `/responses` request runs end to end
- approval, audit, and evidence continuity stay attached

## Current OSS Posture

- macOS `live` installed desktop is the supported OSS starting point
- Linux is available as a public Ubuntu 24.04 beta install path
- Windows is available as a public beta install path with native packaging artifacts and launcher helpers

## What This Repo Contains

- [ui/desktop-ui/](ui/desktop-ui) - installable operator desktop, launcher, and localhost gateway
- [internal/](internal) and [cmd/](cmd) - governed runtime services and service entrypoints
- [contracts/extensions/v1alpha1/](contracts/extensions/v1alpha1) - public provider boundary
- [platform/](platform) - local bootstrap, CI, and verification
- [clients/](clients) and [examples/](examples) - ingress clients and example integrations

## Read Next

- [Getting started](docs/getting-started.md)
- [OSS quality story](docs/quality-story.md)
- [Desktop module guide](ui/desktop-ui/README.md)
- [Release policy](docs/release-policy.md)
- [OSS versus premium policy](docs/oss-premium-policy.md)

## Trust, Policy, And Contribution

- [LICENSE](LICENSE)
- [SECURITY.md](SECURITY.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [TRADEMARK.md](TRADEMARK.md)
