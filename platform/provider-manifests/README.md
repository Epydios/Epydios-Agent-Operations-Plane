# Optional Provider Manifests

This directory contains provider-specific Kubernetes manifests that are not yet part of the baseline `platform/system` bundle.
It is the deployment-manifest side of the provider taxonomy.

These are used for incremental milestones (for example, M1 policy provider validation) without destabilizing the M0 foundation smoke path.

Current optional bundles include:
- `platform/provider-manifests/oss-policy-opa` (`PolicyProvider`)
- `platform/provider-manifests/oss-evidence-memory` (`EvidenceProvider`)
- `platform/provider-manifests/oss-desktop-mock` (`DesktopProvider`, Linux-first M13 mock)
- `platform/provider-manifests/oss-desktop-openfang` (`DesktopProvider`, Linux-first Openfang adapter scaffold, `selection.enabled=false` by default; includes Windows/macOS restricted scaffolds as explicit non-default manifests)

Reference configs and sample provider inputs live separately under `provider-reference/`.
