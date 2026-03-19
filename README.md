# Epydios Agent Operations Plane

Kubernetes-first control plane and operator workbench for governed agent and tool execution.

Apply policy, require approval when needed, execute with receipts, and keep audit and evidence readable from one interface.

> _Screenshot placeholder: hero overview of the desktop workbench_

## Why It Exists

Most agent tooling makes actions easy to trigger and hard to govern. Once actions matter, teams need policy decisions, approval paths, receipts, and evidence that operators can actually follow.

Epydios Agent Operations Plane is built for that operational reality. It gives you a governed runtime path and a full desktop workbench for taking requests from submission through policy, approval, execution, review, and follow-through.

## What You Get

- Governed requests with explicit tenant, project, environment, and action scope
- Policy `allow`, `deny`, or `defer` decisions with rationale and grant requirements
- Approval, receipt, and recovery flows for higher-consequence actions
- Audit, evidence, and incident follow-through in the same workbench
- Admin surfaces for controlled change review and lifecycle history
- Full desktop operator workbench for Linux, macOS, and Windows
- Kubernetes-first deployment, verification, and upgrade path
- OSS baseline providers with a clearly bounded premium AIMXS path

## Product Tour

### Governed Request Flow

> _Screenshot placeholder: governed request flow board_

Track a request from submission through policy, approval, execution, and receipt without losing the thread.

### Audit And Evidence

> _Screenshot placeholder: audit and evidence views_

Move from the decision to the receipt to the supporting evidence without exporting logs into a second tool.

### Admin And Review Workflows

> _Screenshot placeholder: admin, review, and history workflows_

Handle higher-risk changes and operator actions through explicit review, apply, rollback, and history stages instead of hidden control paths.

## One Concrete Use Case

A team wants an agent to perform tool actions in a shared environment, but only with explicit policy evaluation, approval where required, and a durable audit and evidence trail.

That is the center of this repo. It is not trying to be a generic “autonomous systems” platform.

## How It Works

For each governed request, the system does this:

1. Accept the request with tenant, project, environment, and action scope.
2. Resolve runtime context through `ProfileResolver`.
3. Evaluate policy through `PolicyProvider`.
4. Require approval when policy defers or grant requirements demand it.
5. Execute the action through the runtime path.
6. Record receipts and evidence for later review in the workbench.

## Quick Start

Use the OSS baseline path first.

```bash
./platform/local/bin/verify-m0.sh
kubectl apply -k platform/modes/oss-only
cd ui/desktop-ui && PORT=4176 ./bin/run-dev.sh
curl -sSf http://127.0.0.1:4176/ >/dev/null && echo READY
```

Then use the operator workbench to inspect governed runs, approvals, audit, evidence, and admin workflows.

For the full expected verification path and PASS criteria, see [docs/quality-story.md](docs/quality-story.md).

## Runtime Modes

| Mode | Meaning | Notes |
| --- | --- | --- |
| `oss-only` | Self-contained OSS baseline providers | No AIMXS dependency |
| `aimxs-https` | Premium AIMXS over the public provider boundary | Secure external-provider path |
| `aimxs-full` | Premium local/full AIMXS integration | Uses the premium artifact when installed and fails clearly if missing |

## Architecture And Contracts

Start here if you want the technical surfaces behind the product flow:

- Docs entry path: [docs/README.md](docs/README.md)
- Release policy: [docs/release-policy.md](docs/release-policy.md)
- OSS vs premium: [docs/oss-premium-policy.md](docs/oss-premium-policy.md)
- Provider boundary: [contracts/extensions/v1alpha1/README.md](contracts/extensions/v1alpha1/README.md)
- Runtime API: [docs/runtime-orchestration-service.md](docs/runtime-orchestration-service.md)
- Governed request contract: [docs/specs/governed-action-request-contract.md](docs/specs/governed-action-request-contract.md)
- Deployment modes: [platform/modes/README.md](platform/modes/README.md)
- Desktop UI: [ui/desktop-ui/README.md](ui/desktop-ui/README.md)

## OSS And Premium

The OSS repo ships the control plane, desktop workbench, public provider contracts, baseline providers, and the governed execution, approval, audit, evidence, incident, and admin workflow surfaces.

Premium AIMXS stays behind the public provider boundary. It is supported by the product model, but it is not bundled into this OSS repo.

## Repo Map

- [cmd/](cmd) — control-plane and provider entrypoints
- [internal/](internal) — runtime, orchestration, and provider routing logic
- [contracts/extensions/v1alpha1/](contracts/extensions/v1alpha1) — public provider contract surface
- [platform/](platform) — deployment modes, local bootstrap, CI gates, upgrade policy
- [ui/desktop-ui/](ui/desktop-ui) — desktop operator workbench
- [examples/](examples) — example provider registration and deployment material

## Quality And Trust

- Quality story: [docs/quality-story.md](docs/quality-story.md)
- Release policy: [docs/release-policy.md](docs/release-policy.md)
- OSS vs premium policy: [docs/oss-premium-policy.md](docs/oss-premium-policy.md)
- License: [LICENSE](LICENSE)
- Security: [SECURITY.md](SECURITY.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Trademark: [TRADEMARK.md](TRADEMARK.md)
- Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Telemetry/defaults:

- the documented OSS quality story does not enable product analytics or usage tracking by default
- local managed Codex worker invocation explicitly disables CLI analytics in its default path
- platform observability components are operator-managed infrastructure, not default third-party product analytics

This is an early `v0.x` public baseline. The goal is governed execution that is concrete, inspectable, and operationally useful.
