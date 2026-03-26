# OSS Quality Story

This is the public OSS evaluation path for the repo.

It is intentionally narrower than the full product story. It proves the OSS baseline without requiring premium AIMXS material.

## 1. Repo QC

From the repo root:

```bash
./platform/ci/bin/qc-preflight.sh
```

Expected result:

```text
QC preflight passed.
```

## 2. Desktop Module Baseline

From the repo root:

```bash
./ui/desktop-ui/bin/check-m1.sh
```

Expected result:

```text
M1-M4 and M14 baseline UI checks passed.
```

## 3. Installed Desktop Verification On macOS

If you are on macOS:

```bash
./ui/desktop-ui/bin/install-m15-macos-beta.sh
./ui/desktop-ui/bin/verify-m15-phase-c.sh
```

Expected result:

```text
M15 Phase C verifier passed.
```

## 4. Supported Governed Request Proof On macOS

If you want the supported end-to-end governed workflow proof on macOS:

```bash
./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh
```

Expected result:

```text
M15 Phase C governed-request verifier passed.
```

## 5. What This Proves

This path proves that the public OSS repo can:

- pass the repo QC baseline
- pass the desktop module baseline checks
- build and verify the current installable macOS desktop path
- prove sign-in, `Interposition OFF / ON` clarity, one governed Codex `/responses` request, approval resolution, and audit/evidence handoff on the supported macOS `live` lane

Linux also has a proven Ubuntu 24.04 host-acceptance beta path.

Windows also has native packaging and launch proved in beta posture from Git Bash on a real Windows host, but it is still below the macOS installed-path confidence level and does not have a proved `live` operator path yet.

This quality story does not prove premium AIMXS behavior, and it does not claim platform-equal parity outside the supported macOS `live` lane.

For premium comparison later, use the separate AIMXS-specific runbooks and local verifier paths.
