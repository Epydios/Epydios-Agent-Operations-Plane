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

Next implementation step:

- extend the shared enterprise reporting envelope into the remaining enterprise review and export surfaces, starting with VS Code and desktop Chat review/export paths
- add export-profile and audience metadata on top of the governed report envelope without forking the native contract
- add export-time secret scanning hooks to runtime-native audit, incident, run, and governed evidence export paths
- keep Chat, VS Code, CLI, workflow, and chatops on the same native task, session, worker, timeline, event-stream, tool-action, evidence, and approval contract
- avoid introducing chat-vendor-specific or ticket-vendor-specific orchestration branches at the ingress layer

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

- extend the shared enterprise reporting envelope into the remaining enterprise review and export surfaces, starting with VS Code and desktop Chat review/export paths
- add export-profile and audience metadata on top of the governed report envelope without forking the native contract
- add export-time secret scanning hooks to runtime-native audit, incident, run, and governed evidence export paths

Do not:

- fork a second client contract for IDE actions
- reintroduce legacy run shims into IDE surfaces
- let IDE ingress bypass approval, tool-action, evidence, or worker-event boundaries
- start ticketing or chatops ingress from a different contract than the one now used by desktop chat, VS Code, and CLI

## Planning rule

All future client and worker work should be traceable back to the M16 session/task/worker contract.
