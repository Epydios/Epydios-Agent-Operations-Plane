# Runtime Orchestration Service

## Purpose

The runtime orchestration service is the runtime boundary for governed request handling, provider invocation, and run persistence.

This document describes the shipped runtime role and endpoint categories. It is not a full control-plane map.

## Binary 

- `cmd/control-plane-runtime`

## Runtime Role

The runtime is responsible for:

- accepting governed requests
- selecting compatible providers
- persisting run state
- exposing governed review and follow-through data on the runtime boundary

## Persistence Boundary

The runtime persists run data and supporting configuration in its backing store.

This document does not freeze deeper internal catalogs, export topology, or internal admin modeling.

## API Categories

The runtime currently exposes endpoint groups for:

- health and metrics
- governed run create/read
- approval read/write
- audit read/export
- evidence and export-adjacent follow-through
- integration settings and invocation
- desktop or client follow-through where supported by the shipped OSS surface

## Provider Boundary

The runtime uses the versioned provider boundary documented in:

- [provider-contracts.openapi.yaml](../contracts/extensions/v1alpha1/provider-contracts.openapi.yaml)

Provider selection, policy evaluation, evidence recording, profile resolution, and desktop step handling are expected to occur through that boundary.

## Non-Scope

This document does not define in detail:

- internal admin or org-governance catalogs
- rich export-profile matrices
- worker-bridge internals
- decision-binding or authority-basis semantics
