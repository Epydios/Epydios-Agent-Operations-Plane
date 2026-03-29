# EpydiosOps Desktop

This module contains the installable EpydiosOps desktop plus the launcher, local supervisor, and localhost gateway behind the public operator workflow.

## Recommended Product Path

From the repo root:

```bash
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh
```

Use this path to evaluate the product the way the public repo presents it.

It shows:

- the desktop baseline is intact
- the macOS app can be packaged and launched
- `Companion` is the daily lane and `Workbench` is the deeper review surface
- `Interposition` is visibly `OFF` or `ON`
- one governed Codex `/responses` request runs through the local gateway
- approval, audit, and evidence continuity are real

## Install-Only macOS Path

If you want the narrower installed-app lane without the governed-request harness:

```bash
./ui/desktop-ui/bin/install-m15-macos-beta.sh
./ui/desktop-ui/bin/verify-m15-phase-c.sh
"$HOME/Library/Application Support/EpydiosAgentOpsDesktop/launch-installed.sh"
```

## Platform Posture

- macOS `live` installed desktop is the supported OSS starting point
- Linux remains a public Ubuntu 24.04 beta install path
- Windows remains a public beta install path with native packaging artifacts and launcher helpers
- both beta paths still use manual reinstall for updates
- stronger Linux or Windows wording waits for broader installed-host validation
- Windows `live` remains explicitly deferred
- browser `run-dev.sh` remains a development path, not the product front door

Use the platform-specific scripts in [bin/](bin) only if you are intentionally evaluating the beta Linux or Windows lanes.

## Development Browser Path

For fast UI iteration:

```bash
./ui/desktop-ui/bin/check-m1.sh
cd ui/desktop-ui
./bin/run-dev.sh
```

Open:

```text
http://127.0.0.1:4173
```

## Public Limits

- Linux and Windows are still below the supported macOS lane
- premium AIMXS material is not shipped in this repo
- the OSS baseline does not claim silent background interception or premium `DEFER` behavior

## Read Next

- [docs/quality-story.md](../../docs/quality-story.md)
- [docs/getting-started.md](../../docs/getting-started.md)
- [docs/release-policy.md](../../docs/release-policy.md)
