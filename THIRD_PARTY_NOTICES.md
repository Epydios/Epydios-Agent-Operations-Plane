# Third-Party Notices

This project is licensed under the Apache License 2.0.  
This document lists third-party components tracked in `provenance/licenses.lock.yaml`.

## Dependency License Inventory

| Component | Source | Expected License | Required | Verification Status | Notes |
|---|---|---|---|---|---|
| cloudnative-pg | `cloudnative-pg/cloudnative-pg` | Apache-2.0 | yes | verified |  |
| cert-manager | `cert-manager/cert-manager` | Apache-2.0 | yes | verified |  |
| external-secrets | `external-secrets/external-secrets` | Apache-2.0 | yes | verified |  |
| gateway-api | `kubernetes-sigs/gateway-api` | Apache-2.0 | yes | verified |  |
| opentelemetry-operator | `open-telemetry/opentelemetry-operator` | Apache-2.0 | yes | verified |  |
| fluent-bit | `fluent/fluent-bit` | Apache-2.0 | yes | verified |  |
| keda | `kedacore/keda` | Apache-2.0 | yes | verified |  |
| argo-rollouts | `argoproj/argo-rollouts` | Apache-2.0 | no | verified | Optional component |
| argo-events | `argoproj/argo-events` | Apache-2.0 | no | verified | Optional component |
| kserve | `kserve/kserve` | Apache-2.0 | no | verified | Optional component |
| kuberay | `ray-project/kuberay` | Apache-2.0 | no | verified | Optional component |
| kyverno | `kyverno/kyverno` | Apache-2.0 | no | verified | Optional component |
| postgres | `postgresql.org` | PostgreSQL | yes | verified | Runtime database |
| valkey | `valkey-io/valkey` | BSD-3-Clause | no | deferred | Not in current baseline/runtime dependency graph |
| seaweedfs | `seaweedfs/seaweedfs` | Apache-2.0 | no | verified | Optional component |
| cilium | `cilium/cilium` | Apache-2.0 | no | verified | Optional component |

## License Policy

Accepted license families for this repository are:

- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- MIT
- PostgreSQL

For authoritative state, including verification evidence and release-gate policy, see:

- `provenance/licenses.lock.yaml`

