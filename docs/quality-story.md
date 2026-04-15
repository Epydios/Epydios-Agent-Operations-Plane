# OSS Quality Story

This repo does not ask you to believe the whole roadmap. It asks you to run one narrow proof lane and judge the product on what that lane shows today.

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

This path proves that the public OSS repo can:

- pass the repo baseline checks
- pass the desktop module baseline checks
- package and launch the installable macOS desktop
- keep `Interposition OFF / ON` explicit on the supported lane
- run one governed Codex `/responses` request end to end
- resolve approval and hand the run off into audit and evidence

## Narrower Supporting Guard

If you only want the installable desktop proof without the governed-request harness:

```bash
./ui/desktop-ui/bin/verify-m15-phase-c.sh
```

Expected result:

```text
M15 Phase C verifier passed.
```

## Platform Truth

- macOS `live` installed desktop is the supported OSS lane
- Linux remains a repo-backed Ubuntu 24.04 beta installed evaluation contract
- Windows remains a repo-backed beta installed evaluation contract with native packaging artifacts and launcher helpers
- both beta lanes keep manual reinstall as the update posture
- stronger Linux or Windows wording waits for linked installed-host proof
- Windows `live` remains explicitly deferred

This quality story does not claim platform-equal parity outside the supported macOS lane.
