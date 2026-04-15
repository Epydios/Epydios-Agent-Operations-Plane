# Desktop UI M0 Scope for Epydios Agent Operations Plane

## Objective

Ship a secure, operator-focused UI module that can monitor and operate the control plane without adding backend coupling.

## In Scope (M0)

1. Authentication and session bootstrap
- OIDC login flow
- Token handling for runtime API calls
- Tenant/project context picker from JWT claims

2. Platform health screen
- Control-plane component health summary
- Latest staging/prod gate evidence pointers
- Alert status (high-level)

3. Provider operations screen
- List `ExtensionProvider` resources
- Show `Ready/Probed` conditions and key error messages
- Filter by provider type (`ProfileResolver`, `PolicyProvider`, `EvidenceProvider`)

4. Runtime operations screen
- List runs by tenant/project scope
- Run detail panel (status, policy outcome, timestamps)
- Read-only for M0 (no destructive actions)

5. Audit screen
- Structured audit event table
- Filters: tenant, project, decision, providerId, time window

## Out of Scope (M0)

- Policy authoring UI
- Evidence bundle editing
- Provider implementation internals visualization
- Multi-cluster fleet management
- End-user agent prompt UX

## Technical Contract

- API-first: only documented runtime/control-plane endpoints
- No direct DB connectivity
- Deployable independently from backend control-plane rollout

## M0 Acceptance Criteria

1. Authenticated operator can load all four screens with tenant-scoped data.
2. Unauthenticated calls are rejected and surfaced as login-required.
3. Cross-tenant data is not visible when claims are tenant-scoped.
4. UI works against staging environment with `staging-full` gate evidence available.
5. UI module can be deployed/upgraded without backend redeploy.

## Recommended Next Build Steps

1. Create repository/module skeleton for this UI package.
2. Define API client contracts from current runtime endpoints.
3. Implement auth bootstrap + health screen first.
4. Add provider/runtime/audit screens incrementally with fixture-backed tests.
