# Epydios AgentOps Control Plane

**Policy-driven control plane for AI and agent workflows on Kubernetes.**

Epydios AgentOps Control Plane gives platform and security teams one place to govern AI runtime behavior, enforce policy, capture evidence, and operate safely across environments.

It is designed as an **enterprise-ready baseline**: strong controls, clear extension contracts, and repeatable promotion gates.

## Why Teams Use It

- **Governed execution**: policy decision + evidence capture are first-class runtime paths.
- **Extensible by contract**: swap providers without changing control-plane internals.
- **Security-first operations**: authn/authz, tenancy scoping, audit trails, signed+pinned image admission.
- **Promotion discipline**: strict staging/prod gates with provenance artifacts.
- **AIMXS-compatible**: private AIMXS integration through HTTPS provider boundary, not OSS code linkage.

## What You Get Today

### Core platform

- Kubernetes-native control-plane components
- Postgres/CNPG-backed runtime state
- Runtime orchestration API with lifecycle/query/export controls
- Delivery/event and model-serving baseline (Argo + KServe path)

### Security and governance

- OIDC/JWT authn/authz for runtime API
- Tenant/project isolation checks
- Structured audit events and scoped audit read endpoint
- Provider auth modes:
  - `None`
  - `BearerTokenSecret`
  - `MTLS`
  - `MTLSAndBearerTokenSecret`
- Policy grant enforcement and entitlement-deny path assertions

### Production hardening

- NetworkPolicy baseline (controller/provider/runtime boundaries)
- ServiceMonitor + PrometheusRule coverage
- Secret/cert rotation checks
- Admission enforcement for immutable/signed images
- DR game day + rollback/failure-injection verification paths

## Deployment Modes (Single Contract Surface)

| Mode | Provider target | Network expectation | Typical buyer |
|---|---|---|---|
| OSS-only | OSS providers in this repo | In-cluster | teams starting quickly |
| AIMXS hosted | external AIMXS HTTPS endpoint | outbound to hosted AIMXS | central managed service model |
| AIMXS customer-hosted | customer AIMXS in customer environment | no internet dependency required | regulated/on-prem buyers |

Mode overlays live under:

- `platform/modes/oss-only`
- `platform/modes/aimxs-hosted`
- `platform/modes/aimxs-customer-hosted`

## AIMXS Boundary (Explicit)

AIMXS is **not** compiled into OSS control-plane code.

- Integration is through `ExtensionProvider` registration and provider contracts.
- Recommended boundary is HTTPS + mTLS (`MTLSAndBearerTokenSecret` for stricter paths).
- Entitlement and deny semantics are enforced in runtime policy flow.

Reference docs:

- `docs/aimxs-plugin-slot.md`
- `docs/runbooks/aimxs-private-sdk-publication.md`

## Quick Start (Local)

Prerequisites:

- Docker + kind
- kubectl
- Helm
- Go toolchain

Run baseline bring-up + smoke:

```bash
./platform/local/bin/verify-m0.sh
```

Run strict profile gates:

```bash
PROFILE=staging-full ./platform/ci/bin/run-gate-profile.sh
PROFILE=prod-full ./platform/ci/bin/run-gate-profile.sh
```

Run preflight QC only:

```bash
./platform/ci/bin/qc-preflight.sh
```

## Architecture At A Glance

- **Control plane**: provider registry controller + runtime orchestration API
- **Providers**: ProfileResolver, PolicyProvider, EvidenceProvider
- **Data plane state**: Postgres (CNPG)
- **Ops controls**: monitoring, admission policy, provenance lock checks, promotion gates

Key paths:

- Contracts: `contracts/extensions/v1alpha1/`
- Runtime: `cmd/control-plane-runtime/`, `internal/runtime/`
- Provider registry controller: `cmd/extension-provider-registry-controller/`, `internal/extensionprovider/`
- CI/gates: `platform/ci/bin/`
- Local verifiers: `platform/local/bin/`
- Provenance lockfiles: `provenance/`

## Enterprise Readiness Signals

This project intentionally avoids vague "enterprise-grade" claims. Instead, readiness is shown by explicit controls and passing gates.

Current signal categories:

- security controls present and enforced
- strict staging/prod profile gates passing
- provenance lock checks strict-pass
- DR + rollback drills captured as machine-readable evidence
- AIMXS boundary validation and private-release evidence path

## Comparison (At A Glance)

| Capability area | Typical API wrapper stack | Model-serving-only stack | Epydios AgentOps Control Plane |
|---|---|---|---|
| Provider contract model | limited/informal | limited | explicit versioned contracts |
| Policy + evidence in runtime path | partial/manual | partial | built-in and test-gated |
| Tenant/project authz | often custom add-on | often custom add-on | built-in runtime checks |
| Admission + supply-chain controls | external bolt-on | external bolt-on | integrated verification path |
| AIMXS private boundary support | custom integration | custom integration | first-class external provider pattern |
| Promotion evidence (staging/prod strict) | inconsistent | inconsistent | profile-driven strict gate artifacts |

## What This Repo Is / Is Not

This repo **is**:

- the backend control plane and provider contract framework

This repo **is not**:

- a bundled end-user desktop UI module
- AIMXS source code

Related UI module (separate):

- `../EPYDIOS_AGENTOPS_DESKTOP`

## Licensing and Commercial Model

- OSS control plane stays open and contract-stable.
- AIMXS remains private and integrates through external provider boundary.
- This supports a single developer contract with OSS and premium deployment options.

## Repo Hygiene Expectations

- Keep runtime artifacts/log bundles outside this repo (use `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB`).
- Keep workspace governance files outside this repo root.
- Keep only source + manifests + runbooks + lockfiles required for reproducible builds and gates.
