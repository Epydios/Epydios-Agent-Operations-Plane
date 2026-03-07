# Post-M15 Enterprise Expansion Plan

## Status

- Planned on 2026-03-07
- Not active until M15 Phase D closes and final launch sign-off is captured, unless explicitly parallelized

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

Begin M16 architecture/spec work in parallel with the blocked M15 Windows-host wait.

Do not:

- fake-close M15
- jump directly into chat or VS Code implementation without a shared control-plane contract
- tie the product boundary to a single worker such as Codex

## Planning rule

All future client and worker work should be traceable back to the M16 session/task/worker contract.
