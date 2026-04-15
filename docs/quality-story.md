# OSS Quality Story

This repo gives you one end-to-end evaluation path you can run today and inspect directly.

## Canonical Proof Lane

From the repo root:

```bash
./platform/ci/bin/qc-preflight.sh
./ui/desktop-ui/bin/check-m1.sh
./ui/desktop-ui/bin/verify-m15-phase-c-governed-request.sh
```

Expected result:

```text
QC preflight passed.
M1-M4 and M14 baseline UI checks passed.
M15 Phase C governed-request verifier passed.
```

## What That Proves

This path proves that the repo can:

- pass the repo baseline checks
- pass the desktop module baseline checks
- package and launch the installable macOS desktop
- keep `Interposition OFF / ON` explicit on the supported lane
- run one governed Codex `/responses` request end to end
- resolve approval and hand the run off into audit and evidence

## Desktop-Only Supporting Guard

If you only want the installable desktop proof without the governed-request harness:

```bash
./ui/desktop-ui/bin/verify-m15-phase-c.sh
```

Expected result:

```text
M15 Phase C verifier passed.
```

## Platform Truth

- macOS `live` installed desktop is the supported lane
- Linux remains a repo-backed Ubuntu 24.04 beta install path
- Windows remains a repo-backed beta install path with native packaging artifacts and launcher helpers
- both beta paths keep manual reinstall as the update posture
- broader Linux or Windows positioning follows installed-host proof
- Windows `live` remains explicitly deferred
