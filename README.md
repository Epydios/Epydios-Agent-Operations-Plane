# Epydios Agent Operations Plane

Governed agent tool execution with approvals and evidence.

Epydios Agent Operations Plane is an open source control plane and operator workbench for running agent and tool actions behind explicit policy, approval, audit, and evidence flows on Kubernetes.

## One Concrete Use Case

Submit a governed action request, evaluate it through policy, require approval when needed, execute it, and keep a readable receipt and evidence chain for later review.

That is the center of this repo. It is not trying to be a generic "autonomous systems" platform.

## Runtime Path

For each governed request, the system does this:

1. Accept the request with tenant, project, environment, and action scope.
2. Resolve context through `ProfileResolver`.
3. Ask `PolicyProvider` for `allow`, `deny`, or `defer`, plus rationale and grant requirements.
4. Record the result through `EvidenceProvider`.
5. Surface the lifecycle in the desktop workbench for approval, audit, export, and incident follow-through.

Key contract and runtime references:

- Docs entry path: [docs/README.md](docs/README.md)
- Release policy: [docs/release-policy.md](docs/release-policy.md)
- OSS vs premium: [docs/oss-premium-policy.md](docs/oss-premium-policy.md)
- Provider boundary: [contracts/extensions/v1alpha1/README.md](contracts/extensions/v1alpha1/README.md)
- Runtime API: [docs/runtime-orchestration-service.md](docs/runtime-orchestration-service.md)
- Governed request contract: [docs/specs/governed-action-request-contract.md](docs/specs/governed-action-request-contract.md)
- Deployment modes: [platform/modes/README.md](platform/modes/README.md)
- Desktop UI: [ui/desktop-ui/README.md](ui/desktop-ui/README.md)

## Modes

The same public provider contract supports three runtime modes:

| Mode | Meaning | Notes |
| --- | --- | --- |
| `oss-only` | Self-contained OSS baseline providers | No AIMXS dependency |
| `aimxs-https` | Premium AIMXS over the public HTTPS provider boundary | Secure external-provider path |
| `aimxs-full` | Premium local/full AIMXS integration | Loads from `~/.epydios/premium/aimxs/extracted` by default and fails clearly if the premium artifact is missing |

## Repo Map

- [cmd/](cmd): control-plane entrypoints
- [internal/](internal): runtime, provider routing, orchestration, and control logic
- [contracts/extensions/v1alpha1/](contracts/extensions/v1alpha1): public provider contract surface
- [platform/](platform): local bootstrap, CI gates, deployment modes, upgrade policy
- [ui/desktop-ui/](ui/desktop-ui): operator workbench
- [examples/](examples): provider registration examples

## Demo Path

Use this as the first OSS path:

```bash
./platform/local/bin/verify-m0.sh
kubectl apply -k platform/modes/oss-only
```

Then move into the operator workbench:

1. Follow [ui/desktop-ui/README.md](ui/desktop-ui/README.md) for the local desktop run.
2. Use the desktop to inspect governed runs, approvals, audit, evidence, and admin workflows.
3. If you need the AIMXS comparison path later, use [docs/runbooks/aimxs-governed-action-demo.md](docs/runbooks/aimxs-governed-action-demo.md).

## Quality Story

Use the canonical OSS quality story:

- [docs/quality-story.md](docs/quality-story.md)

It covers one launch path, one test path, one demo path, and the exact expected PASS results.

The bounded commands are:

```bash
cd ui/desktop-ui && PORT=4176 ./bin/run-dev.sh
curl -sSf http://127.0.0.1:4176/ >/dev/null && echo READY
./platform/ci/bin/qc-preflight.sh
./ui/desktop-ui/bin/verify-m14-ui-daily-loop.sh
```

## OSS And Premium Boundary

The OSS repo includes:

- the control plane
- the desktop workbench
- the public provider contracts
- baseline OSS providers
- governed execution, approvals, receipts, audit, evidence, and incident flows

Premium AIMXS stays behind the public provider boundary:

- `aimxs-https` uses the secure external-provider path
- `aimxs-full` supports premium local/full integration when the premium artifact is installed
- missing premium AIMXS fails clearly
- there is no silent fallback from `aimxs-full` to the OSS baseline

## Trust And Contribution

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
