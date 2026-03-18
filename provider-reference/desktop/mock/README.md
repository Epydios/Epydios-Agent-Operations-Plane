# OSS Desktop Provider (Mock, Linux-first)

This provider implements the `DesktopProvider` contract (`observe`, `actuate`, `verify`) for controlled local/runtime verification.

It is a deterministic mock used for M13 runtime integration gates:
- Linux-first target (`targetOS=linux`)
- Returns structured verifier decisions (`V-M13-LNX-001/002/003`)
- Emits evidence bundles with `windowMetadata`, `screenshotHash`, and `resultCode`

Binary:
- `cmd/desktop-provider-mock`

Default config:
- `provider-reference/desktop/mock/config.example.json`
