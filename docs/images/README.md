# Release Images

Purpose: keep the release-facing image set aligned with the truthful public baseline.

## Current Truth Rules

- screenshots should reflect the supported macOS `live` lane first
- screenshots should not imply Linux or Windows parity beyond the currently documented beta posture
- screenshots should not imply Windows `live` proof
- premium AIMXS behavior should only appear in explicitly premium comparison material

## Current Asset Roles

- `hero-overview.png`
  - broad product overview image for the current `Companion`, `Workbench`, and `Interposition OFF / ON` posture
- `hero-overview small.png`
  - smaller variant of the same overview image
- `governed-request-flow.png`
  - governed workflow illustration for the supported macOS `live` lane
- `audit-evidence.png`
  - proof-continuity illustration for audit and evidence follow-through
- `security-seal.png`
  - seal/brand asset, not a product-proof screenshot

## Audit Status

Audit date: 2026-03-25

- no screenshot binary changes were required in this release-artifact sweep
- the current image set is acceptable as long as surrounding release wording preserves the supported macOS `live` lane and the explicit Linux or Windows beta posture

## Update Rule

Refresh the screenshot set when any of the following become true:

- the supported baseline changes materially
- the visible shell or core governed workflow changes materially
- Linux or Windows posture is promoted
- premium comparison material becomes part of the public release path
