# AIMXS Premium Release Metadata and Evidence

This page defines where premium AIMXS release metadata and release-evidence artifacts live.

## Purpose

Keep premium AIMXS release-process material out of the OSS `provenance/` tree.

The OSS repo `provenance/` directory is for machine-readable deployment/accountability lockfiles such as:

- `images.lock.yaml`
- `charts.lock.yaml`
- `crds.lock.yaml`
- `licenses.lock.yaml`
- `ip/intake-register.json`

Premium AIMXS release metadata and private release evidence are a different concern and should not be mixed into that tree.

## Default Root

The official default root for premium AIMXS release metadata and generated release evidence is:

```bash
~/.epydios/premium/release/aimxs
```

This root is outside the OSS repo by design.

## Inputs

The premium AIMXS release verifiers use these input files:

- `private-release-inputs.vars`
- `aimxs-full-release-inputs.vars`

## Outputs

The verifiers generate evidence such as:

- `m10-2-private-release-evidence-<timestamp>.json`
- `m10-2-private-release-evidence-<timestamp>.json.sha256`
- `m10-2-private-release-evidence-latest.json`
- `m10-7-aimxs-full-packaging-evidence-<timestamp>.json`
- `m10-7-aimxs-full-packaging-evidence-<timestamp>.json.sha256`
- `m10-7-aimxs-full-packaging-evidence-latest.json`

## Verifiers

- `./platform/local/bin/verify-m10-aimxs-private-release.sh`
- `./platform/local/bin/verify-m10-aimxs-full-packaging.sh`

## Compatibility Notes

Legacy paths may still be accepted as compatibility-only overrides:

- `provenance/aimxs/...`
- `../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/aimxs/...`

Those are not the primary taxonomy anymore and should not be used to describe the repo structure.
