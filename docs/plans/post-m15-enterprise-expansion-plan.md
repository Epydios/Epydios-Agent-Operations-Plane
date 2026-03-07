# Post-M15 Enterprise Expansion Plan

## Status

- Planned on 2026-03-07
- Not active until M15 Phase D closes and final launch sign-off is captured, unless explicitly parallelized
- Parallelized implementation is now in progress through M19 chatops ingress (`clients/vscode-agentops`, `clients/cli-agentops`, `clients/workflow-agentops`, and `clients/chatops-agentops`)

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

Next implementation step:

- deepen chatops on the same client contract by adding native approval and proposal decision actions
- keep the VS Code, CLI, workflow, and chatops surfaces on the same native task, session, worker, timeline, event-stream, tool-action, evidence, and approval contract
- avoid introducing chat-vendor-specific orchestration branches at the ingress layer

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

Continue M19 from the validated VS Code, CLI, workflow, and chatops slices.

Do not:

- fork a second client contract for IDE actions
- reintroduce legacy run shims into IDE surfaces
- let IDE ingress bypass approval, tool-action, evidence, or worker-event boundaries
- start ticketing or chatops ingress from a different contract than the one now used by desktop chat, VS Code, and CLI

## Planning rule

All future client and worker work should be traceable back to the M16 session/task/worker contract.
