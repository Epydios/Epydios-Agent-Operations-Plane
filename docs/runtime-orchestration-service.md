# Runtime Orchestration Service

## Purpose

The runtime orchestration service is the public OSS runtime boundary for governed request handling, provider invocation, and run persistence.

This document intentionally describes only the public runtime role and public endpoint categories. It is not a full control-plane map.

## Binary 

- `cmd/control-plane-runtime`

## Public Runtime Role

The public runtime is responsible for:

- accepting governed requests
- selecting compatible public providers
- persisting run state
- exposing governed review and follow-through data on the public OSS boundary

## Public Persistence Boundary

The runtime persists run data and supporting configuration in its backing store.

This public document does not freeze deeper internal catalogs, entitlement rules, premium-path policy packs, export topology, or internal admin modeling.

## Public API Categories

The public runtime currently exposes endpoint groups for:

- health and metrics
- governed run create/read
- approval read/write
- audit read/export
- evidence and export-adjacent follow-through
- integration settings and invocation
- desktop or client follow-through where supported by the shipped OSS surface

## Public Provider Boundary

The runtime uses the versioned provider boundary documented in:

- [provider-contracts.openapi.yaml](../contracts/extensions/v1alpha1/provider-contracts.openapi.yaml)

Provider selection, policy evaluation, evidence recording, profile resolution, and desktop step handling are expected to occur through that public boundary.

## Public Non-Scope

This document does not define in detail:

- premium entitlement enforcement
- private provider routing posture
- premium policy-pack inventory
- internal admin or org-governance catalogs
- rich export-profile matrices
- private worker bridge or premium execution internals
- premium decision-binding or authority-basis semantics
