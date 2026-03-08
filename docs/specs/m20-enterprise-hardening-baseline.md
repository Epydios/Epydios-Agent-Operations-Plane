# M20 Enterprise Hardening Baseline

Date: 2026-03-08
Status: M20 complete, governed run-export disposition and enterprise hardening exit gate passed

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
- Governed enterprise report output now redacts secret-like transcript, evidence, summary, and action-hint content before render in [report_envelope.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/internal/runtimeclient/report_envelope.go), [ui/desktop-ui/web/js/runtime/governance-report.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/web/js/runtime/governance-report.js), and [clients/vscode-agentops/lib/reportEnvelope.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/vscode-agentops/lib/reportEnvelope.js), and surfaces any matches through explicit `DLP findings`.
- Runtime run export now sanitizes secret-like content before JSONL or CSV output in [internal/runtime/export_redaction.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/export_redaction.go) and [internal/runtime/api.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/api.go), resolves governed disposition from the dedicated `run_export` profile, emits `redactionCount` on the audit trail, stamps `X-AgentOps-Export-*` plus `X-AgentOps-Org-Admin-*` headers on the response, and projects persisted org-admin review state from the run-backed session approval boundary.
- Runtime audit export now sanitizes secret-like content before JSONL or JSON output in [internal/runtime/export_redaction.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/export_redaction.go), [internal/runtime/export_disposition.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/export_disposition.go), and [internal/runtime/api.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/api.go), and now stamps the governed export metadata headers plus `X-AgentOps-Export-Redactions` on the response.
- Runtime session evidence export now sanitizes secret-like content before JSONL or JSON output in [internal/runtime/export_redaction.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/export_redaction.go), [internal/runtime/export_disposition.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/export_disposition.go), and [internal/runtime/api_v1alpha2.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/api_v1alpha2.go), and now stamps the governed export metadata headers plus `X-AgentOps-Export-Redactions` on the response.
- Desktop governed export helpers now normalize `exportProfile` and `audience` from the same client-surface and report-type rules used by enterprise report rendering, and the remaining audit and incident export or handoff flows now pass explicit governed export metadata through that shared helper in [ui/desktop-ui/web/js/main.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/web/js/main.js).
- Desktop Chat governed exports now resolve export metadata with `clientSurface=chat` instead of incorrectly inheriting desktop-surface defaults during helper selection in [ui/desktop-ui/web/js/main.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/web/js/main.js).

### Worker capability posture

Current baseline was partially implicit and is now explicit.

- Session workers already persist capability lists in [types_v1alpha2.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/types_v1alpha2.go) and [m16_linking.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/m16_linking.go).
- The first shared capability catalog is now explicit and queryable through [worker_capability_catalog.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/worker_capability_catalog.go) and `GET /v1alpha2/runtime/worker-capabilities` in [api_v1alpha2.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/api_v1alpha2.go).
- The catalog currently covers:
  - managed Codex worker execution
  - direct governed model-invoke profiles for codex, openai, anthropic, google, azure_openai, and bedrock

### Reporting and export posture

Current baseline is now partially normalized for enterprise downstream systems.

- Run export, runtime-native audit export, runtime-native session evidence export, desktop audit/incident export, and governed evidence surfaces now exist in the runtime and desktop UI.
- A shared enterprise reporting envelope now exists in [report_envelope.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/internal/runtimeclient/report_envelope.go).
- Workflow, chatops, CLI, desktop Chat, and VS Code review surfaces now reuse the same governed reporting model instead of inventing client-specific governance packaging.

### Export profile and audience posture

Current baseline is now explicit and queryable.

- The runtime now exposes a governed export-profile catalog through `GET /v1alpha2/runtime/export-profiles`.
- That catalog now also exposes:
  - `defaultRetentionClass`
  - `allowedRetentionClasses`
  - `audienceRetentionClassOverlays`
  - `retentionClass` filtering on the same runtime endpoint
- Desktop Chat and VS Code governed review surfaces now load that catalog and render:
  - export-profile coverage
  - allowed audiences
  - resolved retention class
  - allowed retention classes
  - retention overlays
  - delivery channels
  - redaction modes
- Desktop Chat and VS Code now also expose explicit operator-selectable `exportProfile`, `audience`, and `retentionClass` controls on top of that same runtime catalog for governed review and export actions.
- CLI, workflow, and chatops governed report surfaces now load the same runtime export-profile catalog into the shared Go enterprise-report envelope and render the same retention, delivery, and redaction metadata on the same contract.
- Direct desktop audit and incident export tests now pin governed export metadata, retention overlays, governed disposition summaries, and redaction behavior instead of leaving those paths implied by helper defaults.
- The catalog now includes a dedicated `run_export` profile, and the M20 verifier explicitly pins governed run-export disposition and org-admin header behavior on the runtime boundary.

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

### Runtime export-profile catalog

Endpoint:
- `GET /v1alpha2/runtime/export-profiles`

Purpose:
- make governed export-profile choices explicit instead of inferred from client-local defaults
- keep report/export review surfaces on the same native contract while exposing enterprise-facing audience, delivery, and redaction policy
- provide one authoritative export-profile inventory for later retention-class and downstream-governance integration work
- keep runtime-native run export on the same governed export boundary as audit and evidence export instead of leaving it as a special-case legacy path

Current filter surface:
- `exportProfile`
- `reportType`
- `clientSurface`
- `audience`
- `retentionClass`

Current retention metadata:
- `defaultRetentionClass`
- `allowedRetentionClasses`
- `audienceRetentionClassOverlays`

### Shared enterprise reporting envelope

Current implementation:
- [report_envelope.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/internal/runtimeclient/report_envelope.go)
- workflow report surfaces in [clients/workflow-agentops/main.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/workflow-agentops/main.go)
- chatops report surfaces in [clients/chatops-agentops/main.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/chatops-agentops/main.go)
- CLI report surfaces in [clients/cli-agentops/main.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/cli-agentops/main.go)
- desktop Chat report surfaces in [ui/desktop-ui/web/js/views/chat.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/web/js/views/chat.js) and [ui/desktop-ui/web/js/runtime/governance-report.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/ui/desktop-ui/web/js/runtime/governance-report.js)
- VS Code report surfaces in [clients/vscode-agentops/lib/reportEnvelope.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/vscode-agentops/lib/reportEnvelope.js) and [clients/vscode-agentops/extension.js](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/vscode-agentops/extension.js)

Purpose:
- normalize enterprise governance reporting without forking workflow- or chat-vendor-specific outbound logic
- bind reporting to the same native task, session, worker, approval, tool-action, evidence, and event-stream contract
- expose policy packs, role bundles, decision surfaces, worker capability coverage, and boundary requirements in one governed report shape
- carry normalized `exportProfile` and `audience` metadata on the same governed report shape across all reporting consumers
- carry normalized `retentionClass`, allowed-retention, and retention-overlay metadata on the same governed report shape across all reporting consumers
- validate explicit `exportProfile`, `audience`, and `retentionClass` operator selections against the runtime export-profile catalog instead of accepting client-local freeform overrides
- redact secret-like transcript and evidence content before output while surfacing `DLP findings` for operators and downstream systems
- derive governed review and delta-report defaults deterministically by `clientSurface` and `reportType`:
  - Chat, VS Code, and CLI use the operator review or follow profile family
  - workflow uses the workflow review or follow profile family
  - chatops uses the conversation review or follow profile family

### Baseline verifier

Verifier:
- [verify-m20-enterprise-hardening-baseline.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-m20-enterprise-hardening-baseline.sh)

Latest proof log:
- [verify-m20-enterprise-hardening-baseline-latest.log](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m20-enterprise-hardening/verify-m20-enterprise-hardening-baseline-latest.log)

### Exit gate

Verifier:
- [verify-m20-enterprise-hardening-exit-gate.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-m20-enterprise-hardening-exit-gate.sh)

Latest proof log:
- [verify-m20-enterprise-hardening-exit-gate-latest.log](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m20-enterprise-hardening/verify-m20-enterprise-hardening-exit-gate-latest.log)

## Follow-on Enterprise Scope

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
- runtime-native export-time redaction and policy hooks for any future server-side governed export routes beyond the now-covered run, audit, and evidence exports
- policy hooks for vendor-specific credential classes without forking the client contract

### Worker capability matrices

Still needed:
- capability grant classes mapped to worker categories and environments
- required approvals by capability class
- support-tier matrix for managed workers beyond Codex
- verifier coverage for capability policy drift

### Reporting and export integration

Still needed:
- downstream export profiles and sink mappings for SIEM, GRC, and ticket systems beyond the current shared workflow/chatops/CLI/Chat/VS Code report envelope
- stronger contract between audit/evidence exports and external governance sinks
- downstream export-profile sink mappings and server-side governed export routes beyond the current shared run, audit, and evidence export coverage

### Cross-surface export/report parity

Now in place:
- a shared governed-report parity fixture drives Go and JS parity checks across desktop Chat, VS Code, CLI, workflow, and chatops on the same export-profile catalog and DLP/redaction contract
- remaining desktop Chat governed export actions for tool-action review, evidence review, and governance report copy/download now have direct tests that pin governed export metadata and redaction behavior

### Enterprise IT/admin and org-scale operations

Now inventoried:
- org-admin baseline catalog entries for centralized enterprise, federated business-unit, and regulated regional operating models
- delegated admin and break-glass role bundles
- group-to-role mapping inputs for directory-sync or identity-claim driven scope attachment
- residency, legal-hold, network-boundary, fleet-rollout, quota, and chargeback dimensions as first-class runtime inventory

Now projected into governed report surfaces:
- desktop Chat and VS Code governed reports now consume the runtime org-admin catalog on the same report envelope used across the other ingress surfaces
- delegated-admin, break-glass, directory-sync, residency, legal-hold, network-boundary, fleet-rollout, quota, chargeback, and enforcement-hook metadata now render without introducing a second admin-report contract
- structured enforcement profiles now carry hook ids, categories, enforcement modes, role bundles, required inputs, decision surfaces, and boundary requirements on the same native contract
- structured directory-sync mappings, exception profiles, and overlay profiles now project into the shared Go, desktop Chat, and VS Code governed report and export surfaces without introducing a second admin/export contract
- structured decisionBindings now bind delegated-admin, break-glass, directory-sync, residency/legal-hold exception, and quota/chargeback overlay decisions to concrete governed review objects across the shared Go, desktop Chat, VS Code, and desktop governed export surfaces without creating a second admin/export contract
- runtime approval checkpoints now persist structured org-admin `decisionBindings` in checkpoint annotations, enforce required-input and role-bundle checks at create/decision time for the active binding, and emit org-admin binding request or resolution evidence on the same native approval and evidence contract
- shared Go, desktop Chat, VS Code, CLI, workflow, and chatops governed report surfaces now project active org-admin review details and action hints directly from persisted approval-checkpoint annotations instead of treating decision bindings as catalog-only metadata
- runtime approval checkpoints now also persist normalized org-admin `inputValues` for delegated-admin, break-glass, directory-sync, residency/legal-hold exception, and quota/chargeback overlay decisions, and the shared Go, desktop Chat, and VS Code governed report surfaces now render those persisted inputs plus category-specific action hints directly from approval annotations
- runtime-native session evidence export now stamps structured org-admin export headers and JSON metadata from persisted approval-checkpoint annotations, and desktop Chat governed tool-action, evidence, and governance-report exports now preserve active org-admin review state instead of collapsing back to catalog-only export metadata
- workflow and chatops governed enterprise reports now project full native approval-checkpoint state instead of only the pending subset, so persisted org-admin review bindings, input values, and action hints survive those ingress surfaces on the same shared report contract
- CLI, workflow, and chatops governed update envelopes now also project active org-admin review details and action hints directly from persisted approval-checkpoint annotations instead of relying only on pending approval/proposal hints
- runtime approval-checkpoint org-admin bindings now also emit structured runtime audit events on request and decision paths, and runtime audit export now stamps structured org-admin export headers and JSON metadata from those persisted audit records on the same governed export boundary
- the shared Go enterprise report envelope plus the desktop Chat and VS Code governed report and export surfaces now also project active org-admin categories, decision actor roles, decision surfaces, boundary requirements, directory-sync mappings, exception profiles, overlay profiles, and normalized input values directly from persisted approval-checkpoint annotations instead of stopping at catalog-only projection
- runtime approval-checkpoint org-admin bindings now also emit category-specific session events, evidence records, and runtime audit events for delegated-admin, break-glass, directory-sync, residency/legal-hold exception, and quota/chargeback overlay decisions, and the shared Go, CLI, workflow, and chatops review paths now render those artifacts as meaningful operator activity instead of collapsing them back into generic binding blobs
- the shared Go enterprise report/update envelopes plus desktop Chat and VS Code governed review surfaces now also project active org-admin artifact events, evidence kinds, and retention classes directly from persisted `org_admin.*` session events and org-admin evidence records instead of stopping at approval-only projection

Still needed:
- runtime-side enforcement and persistence beyond the current approval-checkpoint, runtime-audit, category-artifact, and governed run-export paths across the broader admin surface area for delegated-admin, break-glass, directory-sync, residency/legal-hold exception, and quota/chargeback overlay review workflows
- SCIM or directory-sync ingestion and real group-to-role mapping persistence
- data residency, legal hold, eDiscovery, and records-retention exception enforcement for governed exports and evidence
- enterprise network and fleet rollout enforcement such as proxy/TLS inspection posture, private egress, desktop MDM rollout, and regional package distribution
- org-level quota, chargeback, billing, and admin reporting implementation beyond the current inventory catalog

## M20 Closure State

1. M20 is complete.
2. The governed run-export boundary is now on the same enterprise hardening contract as runtime audit and evidence export.
3. The dedicated M20 exit gate passed with the baseline verifier, full repo tests, and the standing desktop/runtime gate suite.
4. No further M20 implementation slice is active.
5. Remaining enterprise IT/admin and org-scale items are follow-on scope only and should not reopen M20 unless a new milestone is explicitly defined.


## Planned follow-on milestones after M20 closure

- `M21` is planned for stabilization and turnkey local operator work: live-mode refresh stabilization, Chat live empty-state clarity, `.tmp` cache hygiene, documented OpenAI live-test flow, and a turnkey Mac-local managed Codex path.
- `M22` is planned after that for local or customer-hosted AIMXS decision-provider work on the existing `PolicyProvider` boundary.
