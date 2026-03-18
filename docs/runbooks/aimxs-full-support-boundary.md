# AIMXS Customer-Hosted Support Boundary and SLA

Last updated: 2026-03-02

## Purpose

Define ownership boundaries, escalation path, and SLA commitments for aimxs-full AIMXS deployments.

## Support Boundary

### Epydios-Owned

1. Provider contract compatibility (`ExtensionProvider` + runtime integration boundary).
2. Packaging metadata contract (digest/signature/SBOM evidence requirements).
3. Guidance for secure auth modes (`MTLS`, `MTLSAndBearerTokenSecret`).
4. Compatibility and upgrade notes for AIMXS/aimxs-full mode.

### Customer-Owned

1. Cluster operations, namespace policy, and local networking posture.
2. Certificate issuance/rotation and secret lifecycle.
3. Offline registry availability and package import controls.
4. Access control and incident response inside customer environment.

### Shared Responsibility

1. Release promotion approval.
2. Incident triage timeline and postmortem artifacts.
3. Verification evidence capture for staging/prod gates.

## SLA Baseline (Template)

1. Availability target:
   - Customer-AIMXS HTTPS policy endpoint: 99.9% monthly target (or customer contract override).
2. Incident response:
   - P1 security/service-down: initial response <= 1 hour.
   - P2 degraded service: initial response <= 4 hours.
   - P3 normal defect/support: next business day response.
3. Escalation:
   - Dedicated support contact and secondary escalation contact required.
4. Change windows:
   - Production updates only in approved change windows with rollback plan.

## Incident Handling

1. Preserve runtime, provider, and admission logs.
2. Capture affected package digest/signature/SBOM refs.
3. Record tenant/project impact, policy decision path, and timeline.
4. Complete postmortem with corrective action list and owner/date.

## Required Inputs for Packaging Evidence

The aimxs-full packaging verifier requires explicit references for:

1. Primary release identifier.
2. Signed package reference (image digest or artifact digest path).
3. Signature evidence reference.
4. SBOM evidence reference.
5. Air-gapped install/update bundle references.
6. Support boundary and SLA references.

These values are supplied in:

- `~/.epydios/premium/release/aimxs/aimxs-full-release-inputs.vars` by default
- `provenance/aimxs/aimxs-full-release-inputs.vars` as a legacy repo-local compatibility override
- `../EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/aimxs/aimxs-full-release-inputs.vars` as an optional legacy external override

## Local Full Packaging Rule

- The official local install root for premium `aimxs-full` verification is `~/.epydios/premium/aimxs/extracted`.
- `EPYDIOS_AIMXS_EXTRACTED_ROOT` is the supported override.
- Missing premium AIMXS must fail clearly and must never silently fall back to OSS.

## Verification Hook

- `platform/local/bin/verify-m10-aimxs-full-packaging.sh`
- Required in strict profiles through CI gate wiring.
