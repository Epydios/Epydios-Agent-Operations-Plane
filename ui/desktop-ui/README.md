# EpydiosOps Desktop

This module is the installable EpydiosOps desktop, native launcher, local supervisor, and localhost gateway behind the repo's public proof lane.

## Canonical Proof Lane

From the repo root:

```bash
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh
```

This is the desktop path the public repo is centered around.

It proves:

- the desktop module is sane
- the macOS app can be packaged and launched
- `Companion` is the daily surface and `Workbench` remains the deep console
- `Interposition OFF / ON` is explicit
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

- macOS `live` installed desktop is the supported OSS lane
- Linux has a proven Ubuntu 24.04 beta lane
- Windows has a native packaging and launch beta lane
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
