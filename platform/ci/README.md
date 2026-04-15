# CI Gates

This directory contains CI entrypoint scripts invoked by GitHub Actions.

## Current Gate

- `bin/pr-kind-phase03-gate.sh`
  - Always runs mandatory QC preflight first via `bin/qc-preflight.sh`:
    - `go test ./...`
    - `bin/check-ip-intake-register.sh` (`go run ./cmd/ip-intake-check`) against `provenance/ip/intake-register.json`
    - shell syntax checks for `platform/**/*.sh`
    - `kubectl kustomize` render checks for all `platform/**/kustomization.yaml`
  - Ensures a local kind cluster exists
  - Supports `GATE_MODE=full|fast`:
    - `full` (default): strict CI parity with required M7 + hardening + public premium-boundary checks
    - `fast`: quick local iteration (skips heavy phases unless explicitly re-enabled)
  - Runs Phase 00/01 runtime gate:
    - `RUN_PHASE_00_01=1`
    - `RUN_GATEWAY_API=1` (Gateway API CRDs)
    - runtime stack: External Secrets, OTel Operator, Fluent Bit, KEDA
  - Runs Phase 03 verification with:
    - `RUN_PHASE_02=1` (Argo Rollouts + Argo Events install/verify)
    - `RUN_FUNCTIONAL_SMOKE=1` (live `InferenceService` prediction smoke)
    - `USE_LOCAL_SUBSTRATE=0` (pinned remote refs only)
  - Runs Phase 04 verification by default:
    - `RUN_PHASE_04=1` (provider selection + policy decision + evidence bundle handoff over KServe context)
    - `RUN_PHASE_04_SECURE=1` (secure subflow with `MTLS` policy provider + `MTLSAndBearerTokenSecret` evidence provider)
  - Runs M5 runtime orchestration verification by default:
    - `RUN_PHASE_RUNTIME=1` (runtime API create/list/get + ALLOW/DENY execution)
    - `RUN_PHASE_RUNTIME_BOOTSTRAP=1` (ensures CNPG/Postgres substrate before runtime smoke)
    - `RUN_PHASE_RUNTIME_IMAGE_PREP=1` (build/load runtime and provider images before runtime smoke)
  - M9.1 runtime authn/authz skeleton verification:
    - `RUN_M9_AUTHN_AUTHZ=1` in full mode (required)
    - `RUN_M9_AUTHN_AUTHZ=0` default in fast mode
    - runs `platform/local/bin/verify-m9-authn-authz.sh`
    - validates JWT authn/authz behavior (`401`, `403`, and positive role/client-id paths)
  - M9.2/M9.3 tenant/project authz + runtime audit verification:
    - `RUN_M9_AUTHZ_TENANCY=1` in full mode (required)
    - `RUN_M9_AUTHZ_TENANCY=0` default in fast mode
    - runs `platform/local/bin/verify-m9-authz-tenancy.sh`
    - validates cross-tenant/cross-project denials and required audit event emission
  - M9.4 RBAC policy matrix verification:
    - `RUN_M9_RBAC_MATRIX=1` in full mode (required)
    - `RUN_M9_RBAC_MATRIX=0` default in fast mode
    - runs `platform/local/bin/verify-m9-rbac-matrix.sh`
    - validates OIDC role mapping + tenant/project allow/deny policy matrix behavior
  - M9.5 runtime audit-read endpoint verification:
    - `RUN_M9_AUDIT_READ=1` in full mode (required)
    - `RUN_M9_AUDIT_READ=0` default in fast mode
    - runs `platform/local/bin/verify-m9-audit-read.sh`
    - validates authenticated audit endpoint reads, scoped tenant/project filtering, and provider/decision query filters
  - M9.6 policy lifecycle + run query/export + retention controls verification:
    - `RUN_M9_POLICY_LIFECYCLE=1` in full mode (required)
    - `RUN_M9_POLICY_LIFECYCLE=0` default in fast mode
    - runs `platform/local/bin/verify-m9-policy-lifecycle-and-run-query.sh`
    - validates lifecycle mode (`observe|enforce`), run filtering/search, CSV/JSONL export, and retention prune dry-run behavior
  - M10.1 provider conformance verification:
    - `RUN_M10_PROVIDER_CONFORMANCE=1` in full mode (required)
    - `RUN_M10_PROVIDER_CONFORMANCE=0` default in fast mode
    - runs `platform/local/bin/verify-m10-provider-conformance.sh`
    - validates provider contracts across `ProfileResolver`, `PolicyProvider`, `EvidenceProvider`
    - validates auth matrix: `None`, `BearerTokenSecret`, `MTLS`, `MTLSAndBearerTokenSecret`
    - includes negative checks (missing bearer secret, no mTLS client cert, missing bearer on `MTLSAndBearerTokenSecret`)
  - M10.3 policy grant enforcement verification:
    - `RUN_M10_POLICY_GRANT_ENFORCEMENT=1` in full mode (required)
    - `RUN_M10_POLICY_GRANT_ENFORCEMENT=0` default in fast mode
    - runs `platform/local/bin/verify-m10-policy-grant-enforcement.sh`
    - validates non-bypassable runtime gating (`AUTHZ_REQUIRE_POLICY_GRANT=true`):
      - non-DENY decision without grant token fails
      - DENY remains executable without token
      - ALLOW with token succeeds and token is redacted from runtime response payloads
  - M10.4 deployment-mode verification:
    - `RUN_M10_DEPLOYMENT_MODES=1` in full mode (required)
    - `RUN_M10_DEPLOYMENT_MODES=0` default in fast mode
    - runs `platform/local/bin/verify-m10-deployment-modes.sh`
    - validates the shipped `oss-only` mode renders cleanly from the mode pack
  - M10.5 reserved no-egress verification slot:
    - `RUN_M10_NO_EGRESS_LOCAL_AIMXS=1` in full mode (required)
    - `RUN_M10_NO_EGRESS_LOCAL_AIMXS=0` default in fast mode
    - runs `platform/local/bin/verify-m10-no-egress-local-aimxs.sh`
    - reserved gate slot; no additional shipped checks run here
  - M10.6 reserved entitlement verification slot:
    - `RUN_M10_ENTITLEMENT_DENY=1` in full mode (required)
    - `RUN_M10_ENTITLEMENT_DENY=0` default in fast mode
    - runs `platform/local/bin/verify-m10-entitlement-deny.sh`
    - reserved gate slot; no additional shipped checks run here
  - M10.2 reserved release-evidence verification slot:
    - `RUN_M10_AIMXS_PRIVATE_RELEASE=1` in full mode (required)
    - `RUN_M10_AIMXS_PRIVATE_RELEASE=0` default in fast mode
    - runs `platform/local/bin/verify-m10-aimxs-private-release.sh`
    - reserved gate slot; no additional shipped checks run here
  - M10.7 reserved packaging-evidence verification slot:
    - `RUN_M10_CUSTOMER_HOSTED_PACKAGING=1` in full mode (required)
    - `RUN_M10_CUSTOMER_HOSTED_PACKAGING=0` default in fast mode
    - runs `platform/local/bin/verify-m10-provider-route-packaging.sh`
    - reserved gate slot; no additional shipped checks run here
  - M13 desktop execution-plane contract + deny-path verifier:
    - `RUN_M13_DESKTOP_PROVIDER=1` in full mode (required)
    - `RUN_M13_DESKTOP_PROVIDER=0` default in fast mode
    - runs `platform/local/bin/verify-m13-desktop-provider.sh`
    - validates:
      - `DesktopProvider` contract paths (`observe`, `actuate`, `verify`) in `contracts/extensions/v1alpha1/provider-contracts.openapi.yaml`
      - `DesktopProvider` registration support in `contracts/extensions/v1alpha1/provider-registration-crd.yaml`
      - deny/no-policy/no-action fixture assertions and evidence completeness verifier expectations (`V-M13-LNX-001/002/003`)
  - M13 desktop runtime tiering + Linux-first guardrail verifier:
    - `RUN_M13_DESKTOP_RUNTIME=1` in full mode (required)
    - `RUN_M13_DESKTOP_RUNTIME=0` default in fast mode
    - runs `platform/local/bin/verify-m13-desktop-runtime.sh`
    - validates:
      - Tier 1 connector-first skip behavior
      - Linux-first default target enforcement (`DESKTOP_ALLOW_NON_LINUX=false`)
      - restricted-host explicit opt-in requirement
      - Tier 3 human-approval + policy-grant requirements
  - M13 Openfang adapter guardrail verifier:
    - `RUN_M13_OPENFANG_ADAPTER=1` in full mode (required)
    - `RUN_M13_OPENFANG_ADAPTER=0` default in fast mode
    - runs `platform/local/bin/verify-m13-openfang-adapter.sh`
    - validates:
      - Linux-first Openfang provider defaults remain denied-by-default for activation (`selection.enabled=false`)
      - restricted-host posture remains blocked by default (`allowRestrictedHost=false`)
      - secure endpoint template keeps `MTLSAndBearerTokenSecret` and disabled selection until explicit enablement
  - M13 Openfang runtime integration verifier:
    - `RUN_M13_OPENFANG_RUNTIME_INTEGRATION=1` in full mode (required)
    - `RUN_M13_OPENFANG_RUNTIME_INTEGRATION=0` default in fast mode
    - runs `platform/local/bin/verify-m13-openfang-runtime-integration.sh`
    - validates:
      - runtime `observe -> actuate -> verify` path and restricted-host deny behavior
      - runtime -> Openfang adapter -> upstream contract path assertions
  - M13 runtime approvals verifier:
    - `RUN_M13_RUNTIME_APPROVALS=1` in full mode (required)
    - `RUN_M13_RUNTIME_APPROVALS=0` default in fast mode
    - runs `platform/local/bin/verify-m13-runtime-approvals.sh`
    - validates:
      - approval queue contract (`GET /v1alpha1/runtime/approvals`) including status filter behavior
      - approval decision contract (`POST /v1alpha1/runtime/approvals/{runId}/decision`) for approve/deny transitions
      - expired approval rejection behavior (`APPROVAL_EXPIRED`)
  - M13 Openfang sandbox rehearsal verifier:
    - `RUN_M13_OPENFANG_SANDBOX_REHEARSAL=0` default in full and fast modes (optional)
    - runs `platform/local/bin/verify-m13-openfang-sandbox-rehearsal.sh` when enabled
    - validates:
      - kind/k3d rehearsal context manifest posture (`selection.enabled=false`, Linux-first defaults, restricted-host blocked)
      - runtime -> adapter integration assertion path in rehearsal command
  - M14.6 Windows restricted-profile readiness verifier:
    - `RUN_M14_WIN_RESTRICTED_READINESS=0` default in full and fast modes (optional)
    - runs `platform/local/bin/verify-m14-win-restricted-readiness.sh` when enabled
    - validates:
      - windows restricted-profile provider template stays disabled-by-default (`selection.enabled=false`)
      - runtime non-Linux gating remains blocked-by-default unless explicitly enabled
      - Linux adapter deny path rejects windows target requests prior to actuation
  - M14.6 macOS restricted-profile readiness verifier:
    - `RUN_M14_MAC_RESTRICTED_READINESS=0` default in full and fast modes (optional)
    - runs `platform/local/bin/verify-m14-mac-restricted-readiness.sh` when enabled
    - validates:
      - macOS restricted-profile provider template stays disabled-by-default (`selection.enabled=false`)
      - runtime non-Linux gating remains blocked-by-default unless explicitly enabled
      - Linux adapter deny path rejects macOS target requests prior to actuation
  - M14.7 cross-OS parity and closeout evidence verifier:
    - `RUN_M14_XOS_PARITY=0` default in full and fast modes (optional)
    - runs `platform/local/bin/verify-m14-xos-parity.sh` when enabled
    - validates:
      - prerequisite `V-M14-WIN-001` and `V-M14-MAC-001` checks pass in the same run
      - cross-OS template parity for restricted profile contract/auth/capability shape
      - machine-readable M14.7 closeout evidence artifact emission to the repo-local ignored `.epydios` provenance path
  - M12.1 runtime SLO/SLI + error-budget verification:
    - `RUN_M12_SLO_SLI_PACK=1` in full mode (required)
    - `RUN_M12_SLO_SLI_PACK=0` default in fast mode
    - cluster-level assertions controlled by `RUN_M12_SLO_CLUSTER_ASSERTIONS` (`auto|1|0`)
    - runs `platform/local/bin/verify-m12-slo-sli-pack.sh`
    - validates:
      - SLO/SLI policy runbook presence and required sections
      - runtime ServiceMonitor + PrometheusRule manifests in hardening pack
      - runtime SLO alert set (`availability burn`, `latency`, `run success`, `provider error rate`)
      - in-cluster monitor/rule resources when monitoring CRDs are present (or required)
  - M12.2 DR game-day (RPO/RTO) verification:
    - `RUN_M12_DR_GAMEDAY=1` in full mode (required)
    - `RUN_M12_DR_GAMEDAY=0` default in fast mode
    - thresholds:
      - `M12_DR_MAX_RPO_SECONDS` (default `300`)
      - `M12_DR_MAX_RTO_SECONDS` (default `900`)
    - runs `platform/local/bin/verify-m12-dr-gameday.sh`
    - validates:
      - backup/restore integrity after simulated loss
      - explicit RPO/RTO threshold assertions
      - machine-readable evidence artifact output under the repo-local ignored `.epydios` provenance path
  - M12.3 failure-injection + rollback verification:
    - `RUN_M12_FAILURE_INJECTION=1` in full mode (required)
    - `RUN_M12_FAILURE_INJECTION=0` default in fast mode
    - thresholds:
      - `M12_FAILURE_MAX_RUNTIME_RECOVERY_SECONDS` (default `180`)
      - `M12_FAILURE_MAX_POLICY_RECOVERY_SECONDS` (default `180`)
      - `M12_FAILURE_MAX_DB_RECOVERY_SECONDS` (default `300`)
    - runs `platform/local/bin/verify-m12-failure-injection-rollback.sh`
    - validates:
      - runtime deployment outage + rollback recovery
      - policy-provider outage + rollback recovery and provider readiness
      - CNPG pod restart recovery for the control-plane database
      - machine-readable evidence artifact output under the repo-local ignored `.epydios` provenance path
  - M9 runtime authz checks in full mode (required, no skips):
    - `RUN_M9_AUTHN_AUTHZ=1`
    - `RUN_M9_AUTHZ_TENANCY=1`
    - `RUN_M9_RBAC_MATRIX=1`
    - `RUN_M9_AUDIT_READ=1`
    - `RUN_M9_POLICY_LIFECYCLE=1`
    - Full mode enforces all M9 checks and exits if overridden to disabled values.
  - M10 provider conformance check in full mode (required, no skips):
    - `RUN_M10_PROVIDER_CONFORMANCE=1`
    - `RUN_M10_POLICY_GRANT_ENFORCEMENT=1`
    - `RUN_M10_DEPLOYMENT_MODES=1`
    - `RUN_M10_NO_EGRESS_LOCAL_AIMXS=1`
    - `RUN_M10_ENTITLEMENT_DENY=1`
    - `RUN_M10_AIMXS_PRIVATE_RELEASE=1`
    - `RUN_M10_CUSTOMER_HOSTED_PACKAGING=1`
    - Full mode keeps the public placeholders and public boundary checks wired, but detailed premium verification remains outside the OSS repo.
  - M12 operations pack check in full mode (required, no skips):
    - `RUN_M12_SLO_SLI_PACK=1`
    - `RUN_M12_DR_GAMEDAY=1`
    - `RUN_M12_FAILURE_INJECTION=1`
    - Full mode enforces M12.1 + M12.2 + M12.3 verifiers and exits if overridden to disabled values.
  - M13 desktop-provider check in full mode (required, no skips):
    - `RUN_M13_DESKTOP_PROVIDER=1`
    - Full mode enforces the contract + deny-path/no-policy/no-action + evidence completeness verifier and exits if overridden to disabled value.
  - M13 desktop-runtime check in full mode (required, no skips):
    - `RUN_M13_DESKTOP_RUNTIME=1`
    - Full mode enforces runtime tiering + Linux-first/autonomy guardrail verifier and exits if overridden to disabled value.
  - M13 Openfang adapter check in full mode (required, no skips):
    - `RUN_M13_OPENFANG_ADAPTER=1`
    - Full mode enforces Openfang adapter guardrail verifier and exits if overridden to disabled value.
  - M13 Openfang runtime integration check in full mode (required, no skips):
    - `RUN_M13_OPENFANG_RUNTIME_INTEGRATION=1`
    - Full mode enforces Openfang runtime integration verifier and exits if overridden to disabled value.
  - M13 runtime approvals check in full mode (required, no skips):
    - `RUN_M13_RUNTIME_APPROVALS=1`
    - Full mode enforces runtime approvals verifier and exits if overridden to disabled value.
  - M7 reliability suite in full mode (required, no skips):
    - `RUN_M7_INTEGRATION=1` (M0->M5 critical path through `platform/local/bin/verify-m7-integration.sh`)
    - `RUN_M7_BACKUP_RESTORE=1` (M7.2 CNPG backup/restore drill)
    - `RUN_M7_UPGRADE_SAFETY=1` (M7.3 N-1->N upgrade safety)
    - Full mode enforces these checks and exits if overridden to disabled values.
  - In fast mode these remain optional and default to disabled.
  - Optionally runs Phase 05 verification:
    - `RUN_PHASE_05=0` (disabled by default)
    - `RUN_PHASE_05_FUNCTIONAL_SMOKE=1` (server-side `RayCluster` API smoke when Phase 05 is enabled)
  - Runs production placeholder guard in full mode:
    - `RUN_PRODUCTION_PLACEHOLDER_CHECK=1` in full mode (required)
    - `RUN_PRODUCTION_PLACEHOLDER_CHECK=0` default in fast mode
    - runs `platform/ci/bin/check-production-placeholders.sh`
    - fails if production manifests include placeholder markers such as `replace-with-*` or `example.com`
  - Runs provenance lock verification by default:
    - `RUN_PROVENANCE_CHECK=1`
    - `PROVENANCE_STRICT=1` (release-grade blocking mode enabled by default)
  - Runs secret/cert rotation checks by default:
    - `RUN_ROTATION_CHECK=1`
    - `MIN_TLS_VALIDITY_DAYS=30`
    - `FAIL_ON_NO_MTLS_REFS=1` (full mode enforces secure mTLS provider references)
  - Runs production hardening baseline apply/verify by default in full mode:
    - `RUN_HARDENING_BASELINE=1`
    - `APPLY_NETWORK_POLICIES=1`
    - `APPLY_MONITORING_RESOURCES=auto`
    - `REQUIRE_MONITORING_CRDS=0` (set to `1` in staging/prod gates where monitoring stack must exist)
    - `RUN_MONITORING_ALERT_SMOKE=0` (optional heavy check; uses Prometheus/Alertmanager APIs)
    - `AUTO_INSTALL_MONITORING_STACK=0` (local/staging helper; keep disabled in CI unless explicitly needed)
    - `MONITORING_NAMESPACE=monitoring`
    - `MONITORING_RELEASE_NAME=kube-prometheus-stack`
    - `RUN_ADMISSION_ENFORCEMENT_CHECK=1` (required in full mode)
    - `APPLY_SIGNED_IMAGE_POLICY=1` (required in full mode; strict profiles must run signed-image checks)
    - `REQUIRE_SIGNED_IMAGE_POLICY=1` (required in full mode; strict profiles fail if Kyverno/signed-policy path is unavailable)
  - Runs reserved boundary slots by default in full mode:
    - `RUN_AIMXS_BOUNDARY_CHECK=1`
    - preserves gate/profile compatibility for the current verification matrix.

The default GitHub Actions workflow is:

- `.github/workflows/pr-kind-phase03-gate.yml`

## IP Intake Governance (M13/M14 planning controls)

- `bin/check-ip-intake-register.sh`
  - Validates `provenance/ip/intake-register.json`.
  - Enforces:
    - first-party new IP entries include explicit review metadata/ticket.
    - planned/shipped upstream linkage stays permissive-only.
    - copyleft/source-available entries are `reference_only` unless policy/legal exceptions are explicitly approved.
- Under current contract, `qc-preflight.sh` is the required enforcement point and is invoked unconditionally by the PR gate.

## Gate Profiles

Use profile-driven execution for environment-specific defaults:

- `bin/run-gate-profile.sh`
- profiles in `platform/ci/profiles/*.env`

Profiles:

1. `local-fast` (developer speed path)
2. `staging-full` (strict monitoring required)
3. `prod-full` (strict monitoring required)

Examples:

```bash
PROFILE=local-fast ./platform/ci/bin/run-gate-profile.sh
PROFILE=staging-full ./platform/ci/bin/run-gate-profile.sh
PROFILE=prod-full ./platform/ci/bin/run-gate-profile.sh
```

Monitoring ownership and rollout policy is documented in:

- `docs/runbooks/monitoring-ownership-rollout.md`

## Release Workflow (M6.1 + M6.2)

- `.github/workflows/release-images-ghcr.yml`
  - Triggers on tag push (`v*`) and manual dispatch
  - Builds all release-coupled first-party OCI images, including the desktop UI image
  - Pushes to GHCR by default (manual dispatch can disable push for dry-run validation)
  - Signs pushed image digests with keyless cosign (GitHub OIDC)
  - Attests pushed image digests with a release predicate and verifies both signature/attestation
  - Generates SPDX-JSON SBOM per pushed image
  - Runs blocking vulnerability gate (`Trivy`) on pushed digest refs
    - default blocking threshold: `CRITICAL`
    - configurable with workflow inputs (`vuln_fail_severities`, `vuln_ignore_unfixed`)
  - Publishes a per-component digest artifact and an aggregated manifest:
    - `release-image-digests.json`
    - `release-image-digests.md`
  - Auto-syncs `provenance/images.lock.yaml` from aggregated release digests (artifact output):
    - `release-images-lockfile-sync` (contains synced lockfile + diff)
    - `platform/overlays/production/patch-image-digests.yaml`
  - Runs strict provenance validation on the synced lockfile artifact before publish:
    - `go run ./cmd/provenance-lock-check -strict -repo-root dist/repo-root`
    - blocks artifact publication if the sync result violates strict policy
  - Aggregated digest manifest is the lockfile sync input and audit artifact
  - Local artifact-ingest helper (for post-release lock sync in this workspace):
    - `ARTIFACT_DIR=<release-artifact-dir> ./platform/local/bin/ingest-release-artifacts.sh`
