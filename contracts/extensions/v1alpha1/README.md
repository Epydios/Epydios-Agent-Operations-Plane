# Extension Interfaces (`v1alpha1`)

This package defines the public OSS provider boundary for:

- `PolicyProvider`
- `EvidenceProvider`
- `ProfileResolver`
- `DesktopProvider` (`observe`, `actuate`, `verify`)

## Purpose

- preserve a stable public integration target
- keep the OSS baseline usable on its own
- allow separately delivered providers to attach through a generic public contract

## Artifacts

- `provider-contracts.openapi.yaml`
  - HTTP/JSON request-response contracts for provider services
- `provider-registration-crd.yaml`
  - Kubernetes registration resource used by runtime and desktop surfaces to discover/select providers

## Compatibility Rules

- `v1alpha1` is additive-only on the public OSS boundary
- breaking changes require a new version directory
- providers should tolerate unknown optional fields where practical
- the public boundary should remain provider-neutral
