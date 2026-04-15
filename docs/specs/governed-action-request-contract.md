# Governed Request Envelope

## Purpose

This document describes the narrow public OSS request envelope used for governed requests that cross the public runtime and provider boundary. 

It is intentionally generic. Rich policy-shaping, entitlement, evidence-readiness, grant, and premium-route semantics are not part of this public contract.

## Public Rules

1. The public request envelope must stay provider-neutral.
2. Public integrators should rely on standard request metadata and resource/action descriptions only.
3. Provider-specific decision shaping belongs behind the provider boundary, not in the public envelope.
4. The public envelope may be used for demos, OSS workflows, or baseline integrations without implying premium semantics.

## Public Request Shape

```json
{
  "meta": {
    "requestId": "governed-request-001",
    "timestamp": "2026-04-14T00:00:00Z",
    "tenantId": "tenant-demo",
    "projectId": "project-demo",
    "environment": "dev",
    "actor": "desktop-operator"
  },
  "subject": {
    "type": "user",
    "id": "operator-001",
    "attributes": {
      "displayName": "Operator"
    }
  },
  "action": {
    "type": "task.execute",
    "verb": "execute",
    "target": "demo-target"
  },
  "resource": {
    "kind": "external-system",
    "namespace": "epydios-system",
    "name": "demo-target",
    "id": "demo-target"
  },
  "context": {
    "request": {
      "schemaVersion": "v1",
      "label": "Governed Request",
      "originSurface": "desktop"
    },
    "notes": [
      "Optional provider-neutral context."
    ]
  },
  "mode": "enforce",
  "dryRun": false
}
```

## Public Scope

- Shared builder: [governed-action-contract.js](../../ui/desktop-ui/web/js/runtime/governed-action-contract.js)
- Public provider boundary: [provider-contracts.openapi.yaml](../../contracts/extensions/v1alpha1/provider-contracts.openapi.yaml)

## Explicit Non-Scope

This public document does not freeze:

- premium policy stratification
- grant-token semantics
- evidence-readiness gating
- private handshake or interposition detail
- internal gate naming
- premium decision-binding or authority-basis modeling
