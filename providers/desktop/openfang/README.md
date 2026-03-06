# OSS Desktop Provider (Openfang Adapter, Linux-first)

This provider is a governed adapter for routing `DesktopProvider` contract calls (`observe`, `actuate`, `verify`) to an external Openfang-style endpoint.

Defaults:
- Linux-only target (`targetOS=linux`)
- `sandbox_vm_autonomous` profile allowed
- `restricted_host` blocked unless `allowRestrictedHost=true`
- upstream forwarding disabled until endpoint + policy are explicitly configured

Binary:
- `cmd/desktop-provider-openfang`

Default config:
- `providers/desktop/openfang/config.example.json`
- `providers/desktop/openfang/config.windows.example.json`
- `providers/desktop/openfang/config.macos.example.json`
- `providers/desktop/openfang/upstream-pin.json`

Notes:
- This repo does not link Openfang code into the OSS build graph.
- Integration is over external HTTPS endpoint(s), with mTLS preferred in deployment manifests.
- Platform-provider restricted scaffolds are staged at `platform/providers/oss-desktop-openfang/extensionprovider-{windows,macos}-restricted.yaml` and remain `selection.enabled=false` by default.
- Secure xOS endpoint workload scaffolds are staged at `platform/providers/oss-desktop-openfang/xos-secure/` and expose `openfang-provider-windows` / `openfang-provider-macos` over `:8443` with mTLS + bearer config.
- Windows/macOS restricted-readiness example manifests are staged in `examples/providers/extensionprovider-oss-desktop-openfang-{windows,macos}-restricted.yaml` with `selection.enabled=false` until M14.7 closeout.
- Run `platform/local/bin/verify-m14-xos-parity.sh` to produce machine-readable M14.7 closeout evidence (`V-M14-WIN-001`, `V-M14-MAC-001`, `V-M14-XOS-001`).
- Run `platform/local/bin/verify-m14-openfang-xos-adapters.sh` to verify Windows/macOS Openfang adapter scaffolds and runtime OS-aware provider selection (`V-M14-WIN-002`, `V-M14-MAC-002`, `V-M14-XOS-002`).
- Run `platform/local/bin/verify-m14-openfang-enablement-gate.sh` to verify secure endpoint enablement gate posture for Windows/macOS manifests (`V-M14-WIN-003`, `V-M14-MAC-003`, `V-M14-XOS-003`).
- Run `platform/local/bin/check-openfang-upstream-drift.sh` to compare the pinned upstream version to latest remote tag.
- Openfang update workflow: `docs/runbooks/openfang-upstream-update.md`.
- Path B (next phase) is selected for macOS/Windows: native non-Linux provider adapters behind the same `DesktopProvider` contract, with restricted profile gating preserved by default.
