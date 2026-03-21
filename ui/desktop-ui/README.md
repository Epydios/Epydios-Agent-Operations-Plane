# Epydios AgentOps Desktop

This module contains the desktop UI, native launcher shell, local background supervisor, and localhost gateway for Epydios Agent Operations Plane.

## Current Public Posture

- `Companion` is the default live surface.
- `Workbench` is the deeper operator console.
- `Interposition OFF / ON` is explicit.
- The verified installed operator path today is macOS.
- Browser `run-dev.sh` remains a development path, not the primary end-user story.

## What Is In This Module

- `web/` - desktop UI assets
- `main.go` and `app.go` - native Wails entrypoint and bindings
- `internal/nativeapp/` - session, launcher, supervisor, gateway, and native helpers
- `bin/` - packaging, install, verify, and local run scripts

## Verified macOS Installed Path

From the repo root:

```bash
./ui/desktop-ui/bin/install-m15-macos-beta.sh
./ui/desktop-ui/bin/verify-m15-phase-c.sh
open "$HOME/Applications/Epydios AgentOps Desktop.app"
```

What this proves:

- the app bundle builds and installs
- the launcher comes up in `live`
- the background runtime supervisor is wired
- the localhost gateway is healthy
- the installed macOS path is working on the current commit

## Development Browser Path

For UI iteration and browser-backed verification:

```bash
./ui/desktop-ui/bin/check-m1.sh
cd ui/desktop-ui
./bin/run-dev.sh
```

Open:

```text
http://127.0.0.1:4173
```

This path is useful for fast UI work, but it is not the public product posture.

## Interposition And Codex

The desktop app can run a local loopback gateway and an explicit interposition path.

Current verified baseline:

- local gateway path is real
- installed macOS app can drive the interposition switch
- Codex-through-Epydios `ALLOW` path has been proven on the local `/v1/responses` path

Current non-goals for the OSS baseline:

- silent background interception with no visible switch
- shipping premium AIMXS material in this repo
- claiming premium `DEFER` behavior as part of the OSS baseline

## Known Public Limits

- Linux packaging is verified in Docker, but the primary verified installed operator path is still macOS.
- Windows packaging exists, but a real Windows host acceptance pass is still pending.
- The installed app currently degrades AIMXS activation and secure-ref helper actions rather than presenting them as a full native-first workflow.
- Some Workbench density and visual shaping work is intentionally deferred until after release.

## Quality Gates

Useful commands:

```bash
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m15-phase-c.sh
```

For the broader repo-level confidence path, use:

- [docs/quality-story.md](../docs/quality-story.md)
- [docs/getting-started.md](../docs/getting-started.md)
