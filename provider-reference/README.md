# Provider Reference

This directory is reference material for provider configuration, sample inputs, and upstream pins.
It is not where provider implementations or Kubernetes deployment manifests live.

## What Lives Here

- sample config files for OSS provider binaries
- provider-specific reference notes
- upstream pin metadata where a provider depends on an external project

## What Does Not Live Here

- provider implementations
- Kubernetes deployment manifests

Provider implementations consume these references through the public contracts under `../contracts/extensions/`.
