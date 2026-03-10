# Post-M15 Enterprise Expansion Plan

## Status

- Planned on 2026-03-07
- Not active until M15 Phase D closes and final launch sign-off is captured, unless explicitly parallelized
- Parallelized implementation is now complete through the M20 exit gate (`clients/vscode-agentops`, `clients/cli-agentops`, `clients/workflow-agentops`, `clients/chatops-agentops`, desktop Chat, and the shared runtime hardening surface); no further post-M15 expansion slice is active

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
- M20 org-admin governed export persistence slice 62 is now complete:
  - runtime-native session evidence export now derives structured org-admin export metadata from persisted approval-checkpoint annotations and stamps that metadata into governed export headers and JSON output on the same runtime export boundary
  - desktop Chat governed tool-action, evidence, and governance-report exports now preserve active org-admin review metadata, including pending review counts and input-key coverage, instead of collapsing back to catalog-only export metadata
  - focused runtime export coverage, desktop governed-export JS coverage, the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice
- M20 org-admin governed update projection slice 63 is now complete:
  - CLI, workflow, and chatops governed update envelopes now project active org-admin review details and action hints directly from persisted approval-checkpoint annotations instead of relying only on pending approval/proposal hints
  - focused CLI, workflow, and chatops update-envelope coverage now pins those org-admin review details and action hints on the shared native contract
  - the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice
- M20 org-admin runtime audit projection slice 64 is now complete:
  - runtime approval-checkpoint org-admin bindings now emit structured runtime audit events on both request and decision paths instead of leaving that state only in approval annotations, session events, and evidence records
  - runtime audit export now derives structured org-admin export metadata and governed export headers from those persisted audit records on the same native export boundary
  - focused runtime approval/audit/export coverage, the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice
- M20 active org-admin governed report projection slice 65 is now complete:
  - the shared Go enterprise report envelope plus the desktop Chat and VS Code governed report and export surfaces now project active org-admin categories, decision actor roles, decision surfaces, boundary requirements, directory-sync mappings, exception profiles, overlay profiles, and normalized input values from persisted approval-checkpoint annotations instead of stopping at catalog-only coverage
  - CLI, workflow, and chatops remain aligned to that same active org-admin review state through the shared governed update and report envelope path, so report surfaces no longer lag update surfaces on the native contract
  - focused Go report-envelope coverage, desktop Chat governed-report JS coverage, VS Code governed-report JS coverage, the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice
- M20 org-admin category-artifact persistence slice 66 is now complete:
  - runtime approval-checkpoint org-admin bindings now emit category-specific session events, evidence records, and runtime audit events for delegated-admin, break-glass, directory-sync, residency/legal-hold exception, and quota/chargeback overlay decisions instead of persisting only generic binding artifacts
  - shared Go, CLI, workflow, and chatops review paths now render those category-specific org-admin artifacts as meaningful operator activity instead of collapsing them back into generic binding blobs
  - focused runtime approval/evidence/audit coverage, shared review coverage, the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice
- M20 org-admin category-artifact governed report/update projection slice 67 is now complete:
  - the shared Go enterprise report/update envelopes plus desktop Chat and VS Code governed review surfaces now project active org-admin artifact events, evidence kinds, and retention classes directly from persisted `org_admin.*` session events and org-admin evidence records instead of stopping at approval-only projection
  - VS Code governed review now renders those org-admin artifact sections on the same native contract, so Chat, VS Code, CLI, workflow, and chatops stay aligned on artifact-state review
  - focused Go and JS coverage, the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice
- M20 governed run-export disposition and org-admin slice 68 is now complete:
  - runtime run export now resolves governed disposition from the dedicated `run_export` profile on the same runtime export boundary used by audit and evidence export
  - runtime run export now stamps structured `X-AgentOps-Org-Admin-*` headers and JSON metadata from projected session approval checkpoints instead of leaving run export behind the rest of the governed export surface
  - focused runtime run-export and export-profile coverage, the dedicated M20 verifier, `go test ./...`, and the full standing desktop/runtime gate suite remained green after the slice
- M20 exit-gate validation slice 69 is now complete:
  - the dedicated exit gate now validates the M20 baseline verifier, full repo tests, and the standing desktop/runtime gate suite in one closure path
  - the exit gate passed cleanly, so M20 is now complete and there is no active follow-on hardening slice inside this milestone
  - latest proof is recorded in `platform/local/bin/verify-m20-enterprise-hardening-exit-gate.sh` and the non-repo exit-gate log



Next implementation step:

- M20 is closed.
- No further post-M15 enterprise expansion slice is active until a new milestone is explicitly defined.
- Any future enterprise IT/admin, residency/legal-hold, or org-scale rollout work should start as a new milestone instead of reopening M20 by default.

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

`M21` is active:

- completed slice 1: fixed the browser live-mode topology, added live contract preflight, and made live first-run scope seeding and chat initialization stable enough to render usable operator state
- completed slice 2: moved future local browser-run artifacts out of the repo tree and added explicit cleanup for legacy repo-local desktop cache
- completed slice 3: documented the live operator diagnostics and OpenAI test path, added the turnkey local-Mac runtime launcher plus browser runtime override, and made the live Chat first-run empty state explicit and operator-grade
- completed slice 4: stopped polling refresh from wiping visible panels back to loading placeholders after first hydration, which removed the recurring blink and page-scroll reset during live sync
- completed slice 5: corrected live invoke error mapping so upstream quota failures surface as operator-visible `429` errors instead of generic `502` responses, repaired the missing native session view import that broke local invoke hydration, paused background refresh while operators are actively editing fields, and clarified `System Instructions` versus `Turn Prompt` in Chat and Settings
- completed slice 6: fixed the dark-theme invoke output contrast bug, persisted Settings and Chat disclosure shells across live background rerenders so expanded review panels no longer collapse on sync, and confirmed that the `codex` and `openai` profiles are distinct routes that can intentionally share the same OpenAI key when both local ref values are populated
- completed slice 7: delayed the topbar `Data: refreshing` indicator so fast background polls keep showing the last synced timestamp instead of flashing a transient loading state on every cycle
- completed slice 8: made the local Mac runtime launcher synthesize the required LiteLLM-style gateway refs from the standard OpenAI API-key refs during managed Codex `process` testing, so operators can start the managed worker path without hand-authoring hidden gateway endpoint or bearer-token refs
- completed slice 9: isolated local managed Codex process auth under a per-session `CODEX_HOME`, bootstrapped that home with `codex login --with-api-key`, and forced API-login mode on the Codex boundary config so managed worker turns use the OpenAI API key instead of falling back to the operator's desktop ChatGPT session scopes
- completed slice 10: clamped the managed Codex process boundary to supported reasoning effort levels by forcing `model_reasoning_effort="high"` and `plan_mode_reasoning_effort="high"` so `gpt-5-codex` no longer rejects the local managed-worker path with `unsupported_value` for `reasoning.effort=xhigh`
- completed slice 11: locked the local managed Codex process path to `read-only` sandbox mode at both the Mac runtime launcher and the runtime adapter boundary so the worker can no longer mutate the scratch workspace directly before proposal/approval review
- next batch: continue the local managed-Codex operator verification flow on Mac against the synthesized gateway, API-login, and read-only-sandbox boundary and close any remaining defects exposed by operator testing
- planned follow-on inside M21: add secure Settings-side credential capture using encrypted or keychain-backed local storage so operators do not have to pre-seed local ref-values files for routine Mac testing
- planned follow-on after that is `M22` for aimxs-full AIMXS decision-provider work on the existing policy boundary
- keep Chat, VS Code, CLI, workflow, and chatops on the same native M16/M18 contract

Do not:

- fork a second client contract for IDE actions
- reintroduce legacy run shims into IDE surfaces
- let IDE ingress bypass approval, tool-action, evidence, or worker-event boundaries
- start ticketing or chatops ingress from a different contract than the one now used by desktop chat, VS Code, and CLI

## Planning rule

All future client and worker work should be traceable back to the M16 session/task/worker contract.


### M21

Stabilization and turnkey local operator path. Active.

Completed slices:

- slice 1: browser live-mode stabilization
  - fixed the local live launcher topology so browser traffic proxies to the runtime on one same-origin base URL instead of miswiring provider discovery
  - added live contract preflight so missing runtime routes fail early instead of leaving the UI on indefinite loading
  - seeded tenant and project scope from live runtime data so first-run Settings and Chat resolve to real scope instead of `scope-unavailable`
  - fixed the live chat client initialization bug that left governance catalogs or history refresh stuck on `api`-missing failures
- slice 2: repo-local cache and run-artifact hygiene
  - moved future local browser session artifacts to `EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/m21-local-cache`
  - added `./bin/cleanup-macos-local-cache.sh` to remove legacy repo-local cache and optional legacy browser launch sessions from `ui/desktop-ui/.tmp`
  - documented the non-repo cache location and cleanup path in the desktop README
- slice 3: live operator diagnostics, local runtime launcher, and first-run chat clarity
  - documented the live operator diagnostics path and OpenAI live-test path for Mac operators in the desktop README
  - added `./bin/run-local-runtime-macos.sh` to run the current repo runtime contract locally against cluster-backed Postgres with managed Codex process defaults
  - added `--runtime-base-url` to `./bin/run-macos-local.sh` so browser live mode can target the local runtime instead of only the cluster port-forwarded runtime
  - made the live Chat empty state explicit and operator-grade when no native M16 tasks exist or when the live runtime contract is incomplete
- slice 4: live polling refresh stability
  - stopped the polling refresh loop from replacing hydrated panels with loading placeholders on every sync cycle
  - preserved the current viewport position across background sync refreshes so operators can keep reading deep panels without being snapped back to the top
  - revalidated the desktop gate stack after the change
- slice 5: invoke error surfacing, edit-safe background sync, and prompt wording clarity
  - mapped upstream quota and related invoke failures to their correct operator-visible HTTP statuses instead of collapsing them into generic `502 Bad Gateway` responses
  - repaired the missing `loadNativeSessionView` import that broke local invoke session hydration in live mode
  - paused background polling while operators are actively editing fields so refresh cycles no longer steal focus or deselect the current input
  - clarified `System Instructions` versus `Turn Prompt` in Chat and Settings to reduce prompt authoring confusion
- slice 6: live disclosure persistence, dark-theme invoke readability, and profile-route clarification
  - fixed the dark-theme invoke output and raw-response surfaces so code-block text remains readable instead of rendering white text on a white panel background
  - persisted Settings and Chat disclosure shells with stable `data-detail-key` values so background sync no longer collapses expanded raw-response, timeline, tool-action, evidence, proposal, and transcript review panels
  - confirmed that the `codex` and `openai` profiles are separate logical routes (`gpt-5-codex` via `openai_compatible` versus `gpt-5` via `openai_responses`) even when both use the same locally supplied OpenAI API key through distinct `ref://...` bindings
- slice 7: refresh-status debounce and secure-credential follow-on tracking
  - delayed the topbar refresh-status transition so fast background sync cycles keep showing the last `synced` timestamp instead of flashing `refreshing` for a fraction of a second on every poll
  - left error and sign-in states immediate while suppressing only the low-value fast-poll flicker
  - recorded secure Settings-side credential capture using encrypted or keychain-backed local storage as planned follow-on M21 work instead of active implementation
- slice 8: local managed-Codex gateway synthesis
  - updated `./bin/run-local-runtime-macos.sh` so local managed Codex `process` mode now writes an effective non-repo ref-values file per session instead of mutating the operator-supplied file
  - when the standard OpenAI key refs are present but the local LiteLLM-style gateway refs are absent, the launcher now synthesizes:
    - `ref://gateways/litellm/openai-compatible`
    - `ref://gateways/litellm/openai`
    - `ref://projects/{projectId}/gateways/litellm/bearer-token`
  - this closes the turnkey gap that previously caused managed Codex worker startup to fail on `ref://gateways/litellm/openai-compatible` missing from runtime ref values during local Mac testing
- slice 9: isolated managed-Codex API-key auth bootstrap
  - updated `./bin/run-local-runtime-macos.sh` so local managed Codex testing now bootstraps a per-session `CODEX_HOME` under the non-repo session directory instead of inheriting the operator's desktop Codex auth state
  - the launcher now runs `codex login --with-api-key` against that isolated home using the OpenAI key from the effective ref-values file, so the managed worker path gets API-backed auth without mutating the operator's normal Codex desktop session
  - the managed Codex process boundary now forces `forced_login_method=\"api\"`, sets `OPENAI_API_KEY` from the resolved boundary token, and passes the isolated `CODEX_HOME` through the runtime so `codex exec` stops failing on missing `api.responses.write` scopes from ChatGPT-session auth
- slice 10: managed-Codex reasoning-effort clamp
  - updated `internal/runtime/managed_worker_codex_process.go` so the managed Codex process boundary now forces `model_reasoning_effort=\"high\"` and `plan_mode_reasoning_effort=\"high\"` in the generated Codex config overrides
  - this prevents local managed-worker turns from inheriting unsupported `xhigh` reasoning defaults that `gpt-5-codex` rejects at the Responses API boundary
- slice 11: managed-Codex read-only sandbox enforcement
  - updated `ui/desktop-ui/bin/run-local-runtime-macos.sh` so the local managed Codex launcher defaults to `--codex-sandbox-mode read-only` instead of `workspace-write`
  - updated `internal/runtime/managed_worker_adapter.go` so process-mode managed Codex turns always clamp the adapter sandbox to `read-only` even if an operator-supplied environment tries to request `workspace-write`
  - this closes the policy gap where the local managed worker could create or modify files directly before the governed proposal or approval path had a chance to intercept the action
- slice 12: managed-Codex governed proposal contract
  - updated `internal/runtime/managed_worker_codex_process.go` so the managed Codex prompt contract explicitly requires governed `tool_proposals` for file creation, modification, deletion, or other environment-changing work instead of replying with only a read-only sandbox refusal
  - made the managed Codex continuation path nil-safe when tool-action context is incomplete so governed resume logic no longer panics on missing tool-action state
  - updated the managed Codex process tests so they validate the built governed prompt contract directly instead of asserting against the raw operator prompt field
- slice 13: approved managed-Codex proposal execution normalization
  - updated `internal/runtime/api_v1alpha2.go` so approved terminal-command proposals are normalized through the same managed-Codex proposal normalizer used on transcript parsing before the governed execution path runs them
  - preserved exact stdin content for normalized `tee`-style executions so approved file-write proposals stop failing on raw shell redirection or python-write variants and no longer recurse into replacement proposals after operator approval
  - added runtime coverage proving approved file-write proposals execute through the governed `tee` path instead of the raw `>` or `python3 -c` forms

Completed deliverables:

- fix the live-mode browser `data: refresh failed` path and related diagnostics
- make the live Chat empty-state explicit when no native M16 tasks or sessions exist
- tighten `ui/desktop-ui/.tmp` cache hygiene and cleanup policy
- document and verify the OpenAI live-test path for Mac operators
- provide a turnkey local-Mac runtime path for the managed Codex process bridge
- make the local managed-Codex browser test path work with the normal OpenAI ref-values file instead of requiring operators to author hidden gateway refs by hand
- make the local managed-Codex browser test path use isolated API-key auth instead of inheriting the desktop Codex ChatGPT session
- stabilize local invoke error surfacing and background editing behavior in live mode
- suppress the topbar refresh-status flicker during fast background polls
- force the managed Codex process path into read-only until approval and require governed proposals for mutating work instead of silent direct filesystem mutation or refusal-only fallbacks
- normalize approved managed-Codex file-write proposals into governed executable commands instead of letting raw redirection or python-write variants fail after operator approval

Remaining deliverable:

- verify the local managed-Codex operator flow end-to-end on Mac on a fresh thread by proving: deny leaves the scratch file absent, approve creates it exactly once, same-thread read resumes correctly, and governed delete removes it cleanly; then close any remaining defects exposed by that operator test

Planned follow-on inside M21:

- add secure Settings-side credential capture using encrypted or keychain-backed local storage instead of requiring pre-seeded local ref-values files for normal Mac operator testing

Exit gate:

- a Mac operator can run the live system cleanly, see stable refresh and chat behavior, and exercise the local managed Codex path with a documented turnkey flow

### M22

Local or aimxs-full AIMXS decision-provider boundary. Planned, not active.

Deliverables:

- decide the aimxs-full AIMXS testing posture on the existing `PolicyProvider` boundary
- add a local AIMXS test harness on the same provider contract
- verify no-egress or local-boundary operation for AIMXS local mode
- document the runtime and operator path for local AIMXS testing

Exit gate:

- AIMXS can be exercised locally on the existing policy-provider boundary without introducing client-specific logic or bypassing the governed contract
