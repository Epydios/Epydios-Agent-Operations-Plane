# M20 Enterprise Hardening Baseline

Date: 2026-03-07
Status: baseline recorded, policy-pack role-bundle attachment plus CLI report and DLP baseline landed

## Scope

This baseline inventories the current enterprise posture after the M19 ingress pack and defines the first M20 hardening artifact without forking the native M16/M18 contract.

## Current baseline

### Multi-tenant policy and scope posture

Current baseline is already implemented.

- Runtime authn/authz and scoped identity enforcement exist in [internal/runtime/auth.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/auth.go).
- Tenant/project allow or deny matrix verification already exists in [verify-m9-rbac-matrix.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-m9-rbac-matrix.sh) and [verify-m9-authz-tenancy.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-m9-authz-tenancy.sh).
- Runtime contract documentation already captures tenant/project scoping and cross-tenant denial in [runtime-orchestration-service.md](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/docs/runtime-orchestration-service.md).

### RBAC posture

Current baseline is already implemented.

- OIDC/JWKS and HS256 compatibility modes already exist in [internal/runtime/auth.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/auth.go).
- Runtime read/create decision paths already enforce scoped permissions across run, session, approval, and event surfaces.
- Existing local verifiers cover authn/authz, scoped tenancy, audit read, and policy lifecycle.

### DLP and secret-handling posture

Current baseline is implemented for configuration ingress and is now partially extended to governed report output.

- Runtime integration settings remain `ref://`-only and block raw secret-like values in [runtime-orchestration-service.md](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/docs/runtime-orchestration-service.md) and [api.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/api.go).
- Production hardening and secret/cert rotation verifiers already exist in [verify-secret-cert-rotation.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-secret-cert-rotation.sh), [verify-admission-enforcement.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-admission-enforcement.sh), and [verify-prod-hardening-baseline.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-prod-hardening-baseline.sh).
- Governed enterprise report output now redacts secret-like transcript, evidence, and summary content before render in [report_envelope.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/internal/runtimeclient/report_envelope.go), and surfaces any matches through explicit `DLP findings`.

### Worker capability posture

Current baseline was partially implicit and is now explicit.

- Session workers already persist capability lists in [types_v1alpha2.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/types_v1alpha2.go) and [m16_linking.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/m16_linking.go).
- The first shared capability catalog is now explicit and queryable through [worker_capability_catalog.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/worker_capability_catalog.go) and `GET /v1alpha2/runtime/worker-capabilities` in [api_v1alpha2.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/api_v1alpha2.go).
- The catalog currently covers:
  - managed Codex worker execution
  - direct governed model-invoke profiles for codex, openai, anthropic, google, azure_openai, and bedrock

### Reporting and export posture

Current baseline is now partially normalized for enterprise downstream systems.

- Run export, audit export, incident export, and governed evidence surfaces already exist in the runtime and desktop UI.
- A shared enterprise reporting envelope now exists in [report_envelope.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/internal/runtimeclient/report_envelope.go).
- Workflow, chatops, and CLI report outputs now reuse that shared reporting envelope instead of inventing client-specific governance packaging.

## Shared hardening artifacts now landed

### Runtime worker-capability catalog

Endpoint:
- `GET /v1alpha2/runtime/worker-capabilities`

Purpose:
- make worker capabilities explicit instead of inferred from ad hoc client logic
- keep Chat, VS Code, CLI, workflow, and chatops on one native worker/session contract
- give later M20 policy packs one authoritative capability inventory to target

Current filter surface:
- `executionMode`
- `workerType`
- `adapterId`

### Runtime policy-pack catalog

Endpoint:
- `GET /v1alpha2/runtime/policy-packs`

Purpose:
- make the first reusable role-and-capability hardening packs explicit at runtime
- keep policy-pack attachment rules on the same native worker and execution contract used by all ingress surfaces
- provide one authoritative policy-pack inventory for later RBAC and capability-matrix refinement

Current filter surface:
- `packId`
- `permission`
- `executionMode`
- `workerType`
- `adapterId`
- `clientSurface`

Current baseline packs:
- `read_only_review`
- `governed_model_invoke_operator`
- `managed_codex_worker_operator`

Role-bundle and decision-surface attachment is now explicit in the catalog:
- `read_only_review`
  - role bundles: `enterprise.observer`, `enterprise.reviewer`
  - decision surfaces: `review_only`
- `governed_model_invoke_operator`
  - role bundles: `enterprise.operator`, `enterprise.ai_operator`
  - decision surfaces: `governed_turn_submission`, `approval_checkpoint`
- `managed_codex_worker_operator`
  - role bundles: `enterprise.operator`, `enterprise.ai_operator`, `enterprise.worker_controller`
  - decision surfaces: `managed_worker_launch`, `managed_worker_recovery`, `approval_checkpoint`, `tool_proposal`, `governed_tool_action`

### Shared enterprise reporting envelope

Current implementation:
- [report_envelope.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/internal/runtimeclient/report_envelope.go)
- workflow report surfaces in [clients/workflow-agentops/main.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/workflow-agentops/main.go)
- chatops report surfaces in [clients/chatops-agentops/main.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/chatops-agentops/main.go)
- CLI report surfaces in [clients/cli-agentops/main.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/cli-agentops/main.go)

Purpose:
- normalize enterprise governance reporting without forking workflow- or chat-vendor-specific outbound logic
- bind reporting to the same native task, session, worker, approval, tool-action, evidence, and event-stream contract
- expose policy packs, role bundles, decision surfaces, worker capability coverage, and boundary requirements in one governed report shape
- redact secret-like transcript and evidence content before output while surfacing `DLP findings` for operators and downstream systems

### Baseline verifier

Verifier:
- [verify-m20-enterprise-hardening-baseline.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-m20-enterprise-hardening-baseline.sh)

Latest proof log:
- [verify-m20-enterprise-hardening-baseline-latest.log](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m20-enterprise-hardening/verify-m20-enterprise-hardening-baseline-latest.log)

## Gaps still open for M20

### Multi-tenant policy packs

Still needed:
- packaged, reusable policy bundles for enterprise deployment modes
- clearer client and worker policy-pack attachment rules
- explicit tenant-tier rollout defaults

### RBAC refinement

Still needed:
- role bundles for enterprise operator personas across UI, IDE, CLI, workflow, and chatops on top of the current policy-pack catalog
- tighter permission mapping for worker-specific actions and review surfaces
- clearer separation between read-only review, decision, and execution roles

### DLP and secret policy enforcement

Still needed:
- outbound deny or escalation rules beyond the current governed report redaction pass
- export-time secret scanning and policy hooks on runtime-native audit, incident, and run export paths
- policy hooks for vendor-specific credential classes without forking the client contract

### Worker capability matrices

Still needed:
- capability grant classes mapped to worker categories and environments
- required approvals by capability class
- support-tier matrix for managed workers beyond Codex
- verifier coverage for capability policy drift

### Reporting and export integration

Still needed:
- downstream export profiles and sink mappings for SIEM, GRC, and ticket systems beyond the current shared workflow/chatops/CLI report envelope
- export profile definitions by audience and retention class
- stronger contract between audit/evidence exports and external governance sinks

## Exact next M20 batch

1. Extend the shared enterprise reporting envelope into the remaining enterprise review and export surfaces, starting with VS Code and desktop Chat review/export paths.
2. Add export-profile and audience metadata on top of the governed report envelope without forking the native contract.
3. Add export-time secret scanning hooks to runtime-native audit, incident, run, and governed evidence export paths.
4. Keep Chat, VS Code, CLI, workflow, and chatops on the same native M16/M18 contract while doing it.
5. Do not introduce client-specific hardening branches.
