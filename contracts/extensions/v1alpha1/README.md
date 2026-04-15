# Extension Interfaces (`v1alpha1`)

This package defines the versioned provider boundary for:

- `PolicyProvider`
- `EvidenceProvider`
- `ProfileResolver`
- `DesktopProvider` (`observe`, `actuate`, `verify`)

## Purpose

- preserve a stable integration target
- keep the baseline usable on its own
- allow providers to attach through a generic contract

## Artifacts

- `provider-contracts.openapi.yaml`
  - HTTP/JSON request-response contracts for provider services
- `provider-registration-crd.yaml`
  - Kubernetes registration resource used by runtime and desktop surfaces to discover/select providers

## Compatibility Rules

- `v1alpha1` is additive-only on the boundary
- breaking changes require a new version directory
- providers should tolerate unknown optional fields where practical
- the boundary should remain provider-neutral
