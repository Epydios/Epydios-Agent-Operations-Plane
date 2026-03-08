# Post-M15 Enterprise Expansion Plan

## Status

- Planned on 2026-03-07
- Not active until M15 Phase D closes and final launch sign-off is captured, unless explicitly parallelized
- Parallelized implementation is now complete through the M19 exit gate (`clients/vscode-agentops`, `clients/cli-agentops`, `clients/workflow-agentops`, `clients/chatops-agentops`, and desktop Chat); the current M20 baseline slices are now landed

## Why this exists

AgentOps now has:

- governed provider invocation
- native packaged desktop app baseline
- audit/evidence/policy foundations

What it does not yet have is the full enterprise-facing multi-surface operating model.

The product should not collapse into a single client or a single worker. For enterprise use, AgentOps should act as the control plane and allow multiple governed ingress surfaces and worker adapters.

## Product stance

- AgentOps is the control plane.
- Chat, IDE, CLI, and ticket/workflow surfaces are clients.
- Codex is a worker adapter, not the product boundary.
- Terminal is a governed tool surface, not the primary UX.
- Raw provider invocation and managed worker execution remain separate concerns.

## Recommended milestone sequence

### M16

Control-plane session/task/worker contract.

Deliverables:

- first-class entities:
  - `task`
  - `session`
  - `worker`
  - `tool_action`
  - `approval_checkpoint`
  - `evidence_record`
  - `event_stream`
- API contract:
  - `create task`
  - `start session`
  - `attach worker`
  - `stream events`
  - `request approval`
  - `approve/deny`
  - `persist evidence`
  - `close session`
- shared authz/scope/audit rules for all future clients and workers

Exit gate:

- one stable control-plane contract exists that both chat and IDE clients can use without special-case behavior

### M17

Operator chat surface.

Deliverables:

- threaded chat UX in desktop UI
- approval prompts inside the conversation
- evidence and tool-action rendering in-chat
- session timeline and state transitions

Exit gate:

- non-technical operators can run governed sessions without terminal or IDE surfaces

### M18

Worker adapter pack.

Deliverables:

- Codex worker adapter first
- managed worker contract distinct from raw model invocation
- worker event capture, approval checkpoints, evidence attachment

Exit gate:

- at least one managed worker can execute tasks through the control-plane session contract with approval, audit, and evidence capture

### M19

IDE and enterprise ingress pack.

Deliverables:

- VS Code client using the same control-plane APIs
- CLI ingress
- ticket/workflow ingress
- chatops ingress

Exit gate:

- developers and non-developers can enter the same governed system through different surfaces with a shared audit/evidence model
- Exit gate status: COMPLETE (validated on 2026-03-07)

Current parallel progress:

- first VS Code client slice landed in `clients/vscode-agentops`
- native thread list is sourced from `/v1alpha2/runtime/tasks`
- native thread review loads `/v1alpha2/runtime/sessions`, `/timeline`, and `/events/stream`
- managed-worker review is rendered directly from native approval, tool-action, evidence, and worker-event state
- IDE-native approval and tool-proposal decisions are now wired on the same native session contract
- governed turn submission is now wired from the IDE surface through `POST /v1alpha1/runtime/integrations/invoke` using the current `taskId`
- first CLI ingress slice landed in `clients/cli-agentops`
- CLI thread review composes native `task`, `session`, `timeline`, `approval`, `tool_action`, `evidence`, and `event-stream` state without introducing another orchestration path
- CLI approval decisions, tool-proposal decisions, and governed turn submission are now wired on the same native session contract used by desktop chat and VS Code
- first ticket/workflow ingress slice landed in `clients/workflow-agentops`
- workflow intake creates native governed tasks with reusable workflow annotations and optional first governed turns on the same session contract
- workflow status renders native task/session/timeline/proposal state as text, JSON, or ticket-comment output without introducing a separate orchestration model
- first chatops ingress slice landed in `clients/chatops-agentops`
- chatops intake creates native governed tasks from external conversation context and optionally starts the first governed turn on the same session contract
- chatops status renders native task/session/timeline/proposal state as text, JSON, or thread-ready update output without introducing a separate orchestration model
- chatops approval and tool-proposal decisions are now wired on the same native session contract with thread-ready update output
- chatops follow-up turns and resume are now wired on existing governed tasks through the same native invoke path and return thread-ready updates
- chatops status, reply, and resume can now resolve governed tasks from native conversation context (`threadId`, `messageId`, `sourceSystem`, `channelId`, `channelName`) instead of requiring an explicit `taskId`
- chatops live follow is now wired on native session state through `conversations follow`, using the same M16 event-stream surface already used by desktop chat, VS Code, and CLI
- chatops approval and proposal decisions can now resolve the target session and pending checkpoint or proposal from native conversation context when a single pending item matches the thread, instead of requiring raw `sessionId` and proposal or checkpoint identifiers
- chatops thread-ready update packaging now includes recent activity summaries and explicit action hints, including the IDs to use when multiple pending approvals or proposals still require explicit operator selection
- chatops intake, status, follow, reply, approval, and proposal update modes now share one normalized governed thread-update envelope, and `conversations follow` also supports a lower-noise `delta-update` mode on the same native session contract
- the normalized governed update envelope now lives in the shared Go client layer and workflow or ticket status output reuses that same structure instead of introducing a second ticket-specific outbound status dialect
- workflow/ticket ingress now supports governed follow-up turn submission on existing tasks and native session follow on the same M16 event-stream contract, reusing the shared governed update envelope instead of branching the model
- workflow/ticket ingress now supports native approval and proposal decisions on the same reusable control-plane contract, and those decisions can resolve the target task and session from ticket identifiers instead of requiring only raw task or session ids
- workflow/ticket ingress now uses the same governed update-envelope path for intake, status, follow, reply, approval, and proposal actions, and `tickets follow --render delta-update` now suppresses empty follow windows instead of emitting zero-event noise
- workflow/ticket and chatops now share the same Go client helpers for annotation-based task lookup, pending approval/proposal target resolution, context-hint building, and decision action-hint rendering instead of carrying parallel resolver logic in each ingress client
- CLI convenience flows now reuse the same native resolution model for task/session targeting: `threads show` can resolve from `sessionId`, `sessions follow` can resolve from `taskId`, approval/proposal decisions can auto-select a single pending native target from task context, governed turns can resolve `taskId` from `sessionId`, and thread review renders native action hints instead of leaving the operator to reconstruct command shape manually
- VS Code thread review now uses a dedicated native thread-context resolver that mirrors the same pending-target selection rules, auto-selects a single pending approval or proposal from the selected session when raw ids are unnecessary, and renders native action hints when multiple pending items still require explicit operator choice
- CLI review and follow flows now reuse a shared governed update-envelope substrate, so `threads show --render update` and `sessions follow --render update|delta-update` package operator guidance on the same model already used by workflow and chatops ingress
- VS Code thread review and live follow now package the selected session state through a shared governed update panel, so the IDE surface shows the same core summary, recent activity, and action-hint structure instead of inventing a second review dialect
- a shared M19 parity fixture now validates the same governed thread review and follow semantics across CLI, workflow, chatops, and VS Code from one source instead of relying on separate client-local assumptions
- M19 exit-gate validation is now complete across Chat, VS Code, CLI, workflow, and chatops on the same native contract; the only parity defect found was a desktop Chat worker-summary mismatch, and it was fixed before the gate was closed
- M20 baseline slice 42 is now complete:
  - current multi-tenant policy, RBAC, DLP/secret, worker-capability, and reporting/export posture is now inventoried in [m20-enterprise-hardening-baseline.md](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/docs/specs/m20-enterprise-hardening-baseline.md)
  - the first shared hardening artifact is now live as the runtime worker-capability catalog in [worker_capability_catalog.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/internal/runtime/worker_capability_catalog.go)
  - the runtime exposes `GET /v1alpha2/runtime/worker-capabilities` as the authoritative worker-capability inventory for managed Codex and direct governed model-invoke profiles
- M20 policy-pack, reporting-envelope, and verifier slice 43 is now complete:
  - the runtime now exposes `GET /v1alpha2/runtime/policy-packs` as the first shared role-and-capability policy-pack inventory
  - the shared enterprise reporting envelope is now implemented in [report_envelope.go](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/internal/runtimeclient/report_envelope.go) and reused by workflow and chatops report outputs
  - the dedicated M20 baseline verifier is now live in [verify-m20-enterprise-hardening-baseline.sh](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/platform/local/bin/verify-m20-enterprise-hardening-baseline.sh)
  - the latest verifier proof log is [verify-m20-enterprise-hardening-baseline-latest.log](/Users/maindrive/Dropbox%20(Personal)/1%20chatGPT%20SHARED%20FILES/GITHUB/AGENTOPS%20DESKTOP/EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m20-enterprise-hardening/verify-m20-enterprise-hardening-baseline-latest.log)
- M20 role-bundle, CLI-report, and DLP slice 44 is now complete:
  - the runtime policy-pack catalog now attaches concrete `roleBundles` and `decisionSurfaces` to the baseline enterprise policy packs
  - the shared enterprise reporting envelope now extends into CLI review and follow flows through `--render report|delta-report`
  - the enterprise reporting envelope now redacts secret-like transcript, evidence, summary, and hint content before output and surfaces explicit `DLP findings`
  - the dedicated M20 verifier remains green after the slice and the standing desktop/runtime gates stayed green
- M20 Chat, VS Code, and export-redaction slice 45 is now complete:
  - desktop Chat now renders and exports a governed enterprise report on the same reporting shape used by the other ingress surfaces
  - VS Code thread review now loads the worker-capability and policy-pack catalogs, renders the same governed enterprise report, and supports governed report copy on the same native contract
  - governed report metadata now carries `exportProfile` and `audience` across desktop and IDE consumers without forking the contract
  - runtime run export now performs export-time redaction and emits `redactionCount` plus `X-AgentOps-Export-Redactions`
  - the dedicated M20 verifier and standing desktop/runtime gates remained green after the slice
- M20 report-disposition, desktop export-policy, and verifier slice 46 is now complete:
  - governed enterprise report `exportProfile` and `audience` defaults are now normalized by client surface and report type across Chat, VS Code, CLI, workflow, and chatops
  - desktop audit and incident export or handoff paths now run through the same governed export metadata helper instead of carrying standalone option literals
  - the dedicated M20 verifier now exercises desktop Chat JS tests, VS Code report tests, and the shared enterprise report clients together instead of leaving desktop and IDE report coverage outside the hardening gate
  - the dedicated M20 verifier and standing desktop/runtime gates remained green after the slice
- M20 export-profile catalog and desktop export verification slice 47 is now complete:
  - the runtime now exposes `GET /v1alpha2/runtime/export-profiles` as the governed export-profile catalog for review, follow, audit, and incident export surfaces
  - desktop Chat and VS Code governed report surfaces now load and render export-profile coverage, allowed audiences, delivery channels, and redaction modes from that runtime catalog on the same native contract
  - direct desktop audit and incident export tests now pin governed export metadata and redaction behavior instead of leaving those paths implied
  - the dedicated M20 verifier and standing desktop/runtime gates remained green after the slice
- M20 export-profile retention overlay and multi-surface governed export slice 48 is now complete:
  - the runtime export-profile catalog now exposes `defaultRetentionClass`, `allowedRetentionClasses`, and `audienceRetentionClassOverlays`, and `GET /v1alpha2/runtime/export-profiles` now supports `retentionClass` filtering on the same governed contract
  - the shared enterprise report envelope used by CLI, workflow, and chatops now loads the runtime export-profile catalog and renders explicit retention-class, allowed-retention, overlay, delivery-channel, and redaction-mode metadata instead of relying on client-local defaults
  - desktop Chat and VS Code governed report surfaces now render the same retention overlay metadata, and desktop Chat governed exports now resolve export metadata with `clientSurface=chat` instead of incorrectly inheriting desktop-surface defaults
  - the dedicated M20 verifier and standing desktop/runtime gates remained green after the slice
- M20 explicit governed export-profile selection ingress slice 49 is now complete:
  - the shared Go enterprise-report client now exposes one validated selection path for `exportProfile`, `audience`, and `retentionClass`
  - CLI, workflow, and chatops report or follow surfaces now bind explicit operator-selectable export-profile flags and validate those selections against the runtime `GET /v1alpha2/runtime/export-profiles` catalog instead of accepting client-local freeform overrides
  - the dedicated M20 verifier, full `go test ./...`, and standing desktop/runtime gates remained green after the slice
- M20 desktop Chat and VS Code export-profile selection slice 50 is now complete:
  - desktop Chat now exposes explicit operator-selectable `exportProfile`, `audience`, and `retentionClass` controls on the governed review/export path and normalizes those selections against the runtime export-profile catalog before copy/download actions run
  - VS Code thread review now exposes a governed report profile picker on the same runtime catalog and uses that normalized selection when rendering or copying governed report output
  - focused desktop Chat and VS Code selection-state tests are now part of the M20 verifier, and the dedicated M20 verifier, full `go test ./...`, and standing desktop/runtime gates remained green after the slice

- M20 runtime-native audit/evidence export hardening slice 51 is now complete:
  - the runtime now exposes `GET /v1alpha1/runtime/audit/events/export` and `GET /v1alpha2/runtime/sessions/{sessionId}/evidence/export` on the governed export boundary
  - those runtime-native export paths now resolve governed export disposition from the runtime export-profile catalog, stamp governed export headers, and redact secret-like content before JSONL/JSON output
  - the dedicated M20 verifier now runs targeted runtime-native export redaction/metadata tests, and the standing desktop/runtime gates remained green after the slice
- M20 desktop export disposition and parity slice 52 is now complete:
  - desktop audit, incident, tool-action, evidence, and governance-report export feedback now surfaces the governed disposition (`exportProfile`, `audience`, `retentionClass`) on the same normalized helper path instead of leaving that metadata implicit in desktop actions
  - dedicated desktop export-governance JS tests now pin audit and incident export disposition resolution and redaction messaging, and the M20 verifier stayed green with the same shared test suite
  - CLI remains inside the M20 verifier so enterprise reporting parity coverage is not silently narrower than the active ingress contract
- M20 direct desktop export action verification slice 53 is now complete:
  - direct desktop audit export, incident bundle export, and incident handoff export actions now have explicit governed-action tests that pin governed disposition (`exportProfile`, `audience`, `retentionClass`) and redaction behavior instead of relying on helper-only coverage
  - the dedicated M20 verifier now explicitly advertises desktop governed export action coverage and remained green with the standing desktop/runtime gates after the slice
- M20 cross-surface governed report/export parity slice 54 is now complete:
  - a shared governed-report parity fixture now drives Go and JS parity checks across desktop Chat, VS Code, CLI, workflow, and chatops on the same export-profile catalog and DLP/redaction contract
  - remaining desktop Chat governed export actions for tool-action review, evidence review, and governance report copy/download now have direct tests that pin governed export metadata and redaction behavior
  - the dedicated M20 verifier now explicitly validates cross-surface governed report/export parity and remained green with the full standing desktop/runtime gate suite after the slice
- M20 org-admin inventory slice 55 is now complete:
  - the runtime now exposes `GET /v1alpha2/runtime/org-admin-profiles` as the first concrete org-scale hardening inventory on the same native contract as the existing worker-capability, policy-pack, and export-profile catalogs
  - that catalog now carries centralized enterprise, federated business-unit, and regulated regional operating models with delegated-admin bundles, break-glass bundles, group-to-role mapping inputs, residency and legal-hold profiles, network and fleet rollout profiles, and org-level quota or chargeback dimensions
  - the dedicated M20 verifier and standing desktop/runtime gates remained green after the slice
- M20 org-admin governed-report projection slice 56 is now complete:
  - desktop Chat and VS Code governed review surfaces now consume the runtime org-admin catalog on the same governed report envelope used across the other ingress surfaces
  - shared enterprise report output now carries delegated-admin, break-glass, directory-sync, residency, legal-hold, network or fleet, quota or chargeback, and enforcement-hook metadata without introducing a second admin-report contract
  - focused desktop Chat and VS Code JS coverage, `go test ./...`, the dedicated M20 verifier, and the standing desktop/runtime gates remained green after the slice
- M20 org-admin enforcement-profile slice 57 is now complete:
  - the runtime org-admin catalog now emits structured enforcement profiles with hook ids, categories, enforcement modes, role bundles, required inputs, decision surfaces, and boundary requirements on the same native contract
  - desktop Chat, VS Code, and the shared Go enterprise report envelope now render enforcement profile coverage without adding a second admin or export contract
  - API coverage, shared report-envelope coverage, JS report tests, the dedicated M20 verifier, and the standing desktop/runtime gates remained green after the slice
- M20 org-admin mapping and overlay projection slice 58 is now complete:
  - the runtime org-admin catalog now emits structured directory-sync mappings, exception profiles, and overlay profiles for directory-sync, residency or legal-hold exception handling, and org-level quota or chargeback overlays on the same native contract
  - desktop Chat, VS Code, and the shared Go enterprise report and governed export envelopes now project those mapping and overlay profiles without creating a second admin or export contract
  - focused Go and JS coverage, the dedicated M20 verifier, and the standing desktop/runtime gates remained green after the slice
- M20 org-admin decision-binding projection slice 59 is now complete:
  - the runtime org-admin catalog now emits structured `decisionBindings` that bind delegated-admin, break-glass, directory-sync, residency or legal-hold exception, and quota or chargeback overlay decisions to concrete governed review objects on the same native contract
  - the shared Go, desktop Chat, VS Code, and desktop governed export surfaces now project that decision-binding coverage without creating a second admin or export contract
  - focused Go and JS coverage, the dedicated M20 verifier, and the full standing desktop/runtime gate suite remained green after the slice
- M20 org-admin decision-binding enforcement-and-review slice 60 is now complete:
  - runtime approval checkpoints now persist structured org-admin `decisionBindings` in checkpoint annotations and enforce required-input plus role-bundle checks when delegated-admin review is requested or decided
  - active org-admin review metadata now projects from persisted approval-checkpoint annotations across the shared Go report envelope, desktop Chat, VS Code, CLI, workflow, and chatops without introducing a second admin-report contract
  - focused runtime API coverage, Go report-envelope coverage, desktop Chat and VS Code JS report coverage, the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice
- M20 org-admin category enforcement-and-input projection slice 61 is now complete:
  - runtime approval checkpoints now persist normalized org-admin `inputValues` for delegated-admin, break-glass, directory-sync, residency/legal-hold exception, and quota/chargeback overlay bindings and enforce category-specific selection/input validation on the native approval path
  - org-admin request and decision evidence now carries those normalized input values on the same native approval/evidence contract
  - the shared Go, desktop Chat, and VS Code governed report surfaces now render persisted org-admin input values and category-specific action hints directly from approval annotations without introducing a second admin-report contract
  - focused runtime API coverage, shared report-envelope coverage, desktop Chat and VS Code JS coverage, the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice



Next implementation step:

- Extend runtime-side enforcement and persistence from the current approval-checkpoint org-admin binding path into the broader delegated-admin, break-glass, directory-sync, residency/legal-hold exception, and quota/chargeback overlay admin surfaces.
- Extend org-admin binding, exception, overlay, and normalized input-value metadata into the remaining governed report and export surfaces without forking the native M16/M18 contract.
- Extend parity and verifier coverage for structured org-admin binding and input-state metadata across desktop Chat, VS Code, CLI, workflow, and chatops.
- Keep Chat, VS Code, CLI, workflow, and chatops on the same native M16/M18 contract.
- Do not introduce client-specific hardening branches.

### M20

Enterprise hardening and rollout pack.

Deliverables:

- multi-tenant policy packs
- RBAC refinement
- DLP/secret policy enforcement
- worker capability matrices
- reporting/export integration

Exit gate:

- Fortune 500 deployment posture is supported across UI, IDE, API, and worker surfaces with clear governance boundaries

## Recommended immediate next step

Continue M20 from the now-recorded baseline:

- Extend runtime-side enforcement and persistence from the current approval-checkpoint decision-binding path into the remaining break-glass, directory-sync, residency/legal-hold exception, and quota/chargeback overlay flows.
- Extend org-admin decision-binding, exception, and overlay metadata into the remaining governed report and export surfaces without forking the native M16/M18 contract.
- Extend parity and verifier coverage for structured org-admin binding, exception, overlay, and active-review metadata across desktop Chat, VS Code, CLI, workflow, and chatops.
- Keep Chat, VS Code, CLI, workflow, and chatops on the same native M16/M18 contract.
- Do not introduce client-specific hardening branches.

Do not:

- fork a second client contract for IDE actions
- reintroduce legacy run shims into IDE surfaces
- let IDE ingress bypass approval, tool-action, evidence, or worker-event boundaries
- start ticketing or chatops ingress from a different contract than the one now used by desktop chat, VS Code, and CLI

## Planning rule

All future client and worker work should be traceable back to the M16 session/task/worker contract.
