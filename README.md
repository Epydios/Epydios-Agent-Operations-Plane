# Epydios Agent Operations Plane

Installable operator desktop and local governance plane for agent and tool execution.

Epydios is for teams that want a governed execution path with policy decisions, receipts, audit, evidence, and operator review without hiding the control surface behind a generic agent shell.

![Epydios Companion overview](docs/images/hero-overview.png)

## Current Public Baseline

- `Companion` is the default live surface.
- `Workbench` is the deeper operator console.
- `Interposition OFF / ON` is explicit, not silent.
- The verified installed desktop path today is macOS.
- Linux packaging is verified in Docker.
- Windows packaging exists, but a real Windows host acceptance pass is still pending.
- The OSS baseline covers governed execution, audit, evidence, receipts, and `ALLOW` or `DENY` behavior.
- Premium AIMXS adds the richer `DEFER` and approval-resume path.

## What The OSS Repo Includes

- control-plane source
- desktop UI and native launcher source
- public provider contracts
- baseline OSS providers
- local launcher, background supervisor, and localhost gateway
- governed execution, audit, evidence, incident, and review surfaces

Premium AIMXS stays outside this OSS repo and is governed by the public provider boundary described in [docs/oss-premium-policy.md](docs/oss-premium-policy.md).

## Start Here

- [Getting started](docs/getting-started.md)
- [OSS quality story](docs/quality-story.md)
- [Desktop module guide](ui/desktop-ui/README.md)
- [OSS versus premium policy](docs/oss-premium-policy.md)
- [Release policy](docs/release-policy.md)

## What You Can Evaluate Today

If you want a quick repo-level confidence pass:

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

Codex-in-path interposition exists behind an explicit local switchable gateway path. The proven public baseline today is the local `ALLOW` path. Premium AIMXS remains the richer `DEFER` path.

## Repo Map

- [cmd/](cmd) - control-plane and provider entrypoints
- [internal/](internal) - runtime, orchestration, provider routing, and gateway logic
- [contracts/extensions/v1alpha1/](contracts/extensions/v1alpha1) - public provider contract surface
- [platform/](platform) - deployment modes, local bootstrap, CI gates, and verification
- [ui/desktop-ui/](ui/desktop-ui) - desktop UI, launcher, native packaging, and localhost gateway
- [examples/](examples) - example provider registration and deployment material

## Quality And Trust

- [OSS quality story](docs/quality-story.md)
- [OSS versus premium policy](docs/oss-premium-policy.md)
- [Release policy](docs/release-policy.md)
- [LICENSE](LICENSE)
- [SECURITY.md](SECURITY.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [TRADEMARK.md](TRADEMARK.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

This is still a `v0.x` release line. The goal is not feature sprawl. The goal is governed execution that is concrete, inspectable, and operationally useful.
