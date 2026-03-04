## Summary

- Briefly describe what changed and why.

## Validation

- [ ] `go test ./...`
- [ ] `./platform/ci/bin/qc-preflight.sh` (or equivalent profile gate evidence)

## Governance Checklist

- [ ] If this PR introduces or changes OSS intake usage or new first-party IP, `provenance/ip/intake-register.json` is updated.
- [ ] Any copyleft/source-available dependencies are marked `reference_only` unless explicit approval evidence is included.
- [ ] Required first-party IP review metadata (`review.required`, `review.status`, `review.ticket`) is present for new first-party entries.
- [ ] If pipeline status/structure changed, `PIPELINE_LIVING.txt`, `PIPELINE_LIVING.json`, and `folder_manifest.json` are updated in lockstep.

