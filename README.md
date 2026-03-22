# Epydios Agent Operations Plane

Installable operator desktop and local governance plane for agent and tool execution.

Epydios gives teams a visible control plane for AI and tool execution. It combines an installable desktop operator console, a local launcher and supervisor, a loopback gateway, and a governed runtime path for policy enforcement, receipts, audit, evidence, incident review, and operator action.

![Epydios security seal](docs/images/security-seal.png)

## Why Epydios

- Governed execution with a real operator surface instead of a hidden background policy layer.
- Local request-path control through an explicit desktop launcher and loopback gateway.
- First-class runtime, governance, audit, evidence, incident, and settings surfaces.
- Installable desktop workflow for live operator use, not just a browser demo path.
- Public contracts and OSS baseline providers that remain usable without premium artifacts.

## Open Source Baseline

This repository contains the public control plane, desktop app, native launcher, localhost gateway, public provider contracts, baseline OSS providers, and the operator surfaces required to inspect and govern execution locally.

The desktop product currently opens in a live `Companion` posture for day-to-day operation and includes the deeper `Workbench` surface for review, runtime, audit, evidence, incident, and settings work.

## AIMXS

AIMXS stays outside this OSS repository.

AIMXS is the premium path for teams that want a more mature decision kernel, stronger governance depth, more advanced evidence and approval packs, secure private connector paths for higher-consequence systems, and enterprise distribution and support. The OSS repo keeps the public integration boundary visible, but it does not ship the premium implementation itself.

See [docs/oss-premium-policy.md](docs/oss-premium-policy.md) for the repo boundary.

## Getting Started

- [Getting started](docs/getting-started.md)
- [OSS quality story](docs/quality-story.md)
- [Desktop module guide](ui/desktop-ui/README.md)
- [OSS versus premium policy](docs/oss-premium-policy.md)
- [Release policy](docs/release-policy.md)

## Install And Evaluate

If you want a quick repository-level confidence pass:

```bash
./platform/ci/bin/qc-preflight.sh
./ui/desktop-ui/bin/check-m1.sh
```

If you are on macOS and want the installed desktop path:

```bash
./ui/desktop-ui/bin/install-m15-macos-beta.sh
./ui/desktop-ui/bin/verify-m15-phase-c.sh
open "$HOME/Applications/Epydios AgentOps Desktop.app"
```

The verified installed path today is macOS. Linux packaging is exercised in Docker. Windows packaging exists, but a real Windows host acceptance pass is still pending.

## Screenshots

### Companion

![Epydios Companion overview](docs/images/hero-overview.png)

### Governed Request Flow

![Epydios governed request flow](docs/images/governed-request-flow.png)

### Audit And Evidence

![Epydios audit and evidence](docs/images/audit-evidence.png)

## Product Shape

Epydios currently consists of:

- an installable desktop UI
- a local launcher and background runtime supervisor
- a loopback localhost gateway
- a governed runtime path for requests, runs, receipts, and review
- operator surfaces for runtime, governance, audit, evidence, incident, and settings work

Codex-in-path interposition exists behind an explicit local switchable gateway path. The public OSS baseline focuses on visible, governed execution with auditability and operator control.

## Repository Guide

- [cmd/](cmd) - control-plane and provider entrypoints
- [internal/](internal) - runtime, orchestration, provider routing, and gateway logic
- [contracts/extensions/v1alpha1/](contracts/extensions/v1alpha1) - public provider contract surface
- [platform/](platform) - deployment modes, local bootstrap, CI gates, and verification
- [ui/desktop-ui/](ui/desktop-ui) - desktop UI, launcher, native packaging, and localhost gateway
- [examples/](examples) - example provider registration and deployment material

## Trust, Policy, And Contribution

- [OSS quality story](docs/quality-story.md)
- [OSS versus premium policy](docs/oss-premium-policy.md)
- [Release policy](docs/release-policy.md)
- [LICENSE](LICENSE)
- [SECURITY.md](SECURITY.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [TRADEMARK.md](TRADEMARK.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

This is still a `v0.x` release line. The goal is not feature sprawl. The goal is governed execution that is concrete, inspectable, and operationally useful.
