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

## 4. What This Proves

This path proves that the public OSS repo can:

- pass the repo QC baseline
- pass the desktop module baseline checks
- build and verify the current installable macOS desktop path

Windows also now has a native beta packaging and verification lane from Git Bash, but it is still below the macOS installed-path confidence level until a dedicated real host acceptance pass is complete.

It does not prove premium AIMXS behavior, and it does not claim a fully verified Windows host path.

For premium comparison later, use the separate AIMXS-specific runbooks and local verifier paths.
