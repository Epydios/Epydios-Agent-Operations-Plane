# M16 Control-Plane Contract Spec

## Status

- Authored on 2026-03-07
- Architecture/spec work only
- Safe to run in parallel while M15 remains blocked on Windows execution-host proof
- Does not change M15 completion state

## Purpose

Define the first stable control-plane contract that all future user surfaces and worker adapters must use.

This contract is the boundary between:

- clients:
  - desktop chat
  - IDE
  - CLI
  - ticket/workflow ingress
  - chatops ingress
- governed execution:
  - model invoke
  - Codex worker
  - terminal tool execution
  - desktop execution
  - future enterprise workers

## Why this is needed

The current runtime is centered on `run`.

That is enough for:

- orchestration requests
- approval queue
- terminal command requests
- integration settings
- integration invoke

It is not enough for the enterprise multi-surface model because it does not yet provide:

- first-class user task identity
- session identity across multiple worker/tool actions
- worker attachment and worker lifecycle
- a durable event stream for chat and IDE clients
- one common abstraction for approvals, tool actions, evidence, and audit

## Design principles

1. AgentOps remains the control plane.
2. Clients are thin surfaces over a shared contract.
3. Workers are adapters behind that contract.
4. Raw model invocation and managed worker execution stay distinct.
5. Audit and evidence are not side effects; they are first-class records.
6. Existing `run` APIs remain available during migration.

## Scope

This spec defines:

- canonical entities
- state machines
- event model
- worker contract
- API surface
- migration from current `run` model

It does not define:

- final chat UX
- final VS Code UX
- vendor-specific worker internals
- long-term storage schema details beyond required records

## Canonical entities

### Task

User or system intent record.

Purpose:

- capture the top-level request
- provide a durable anchor across sessions
- support retries, escalation, and alternate workers

Required fields:

- `taskId`
- `tenantId`
- `projectId`
- `source`
  - `desktop_chat`
  - `desktop_operator`
  - `vscode`
  - `cli`
  - `ticket_workflow`
  - `chatops`
  - `api`
- `title`
- `intent`
- `requestedBy`
- `createdAt`
- `status`

Optional fields:

- `priority`
- `labels`
- `externalRefs`
- `policyContext`
- `desiredWorkerClass`
- `desiredExecutionMode`

Task states:

- `NEW`
- `READY`
- `BLOCKED`
- `IN_PROGRESS`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

### Session

Governed execution container for one attempt to satisfy a task.

Purpose:

- group worker actions, approvals, evidence, and outputs
- provide a single stream for chat/IDE rendering
- allow multiple sessions per task

Required fields:

- `sessionId`
- `taskId`
- `tenantId`
- `projectId`
- `sessionType`
  - `interactive`
  - `automation`
  - `workflow`
  - `remediation`
- `status`
- `startedAt`
- `updatedAt`

Optional fields:

- `endedAt`
- `parentSessionId`
- `selectedWorkerId`
- `selectedExecutionProfile`
- `restrictedHostAllowed`
- `summary`
- `failureReason`

Session states:

- `PENDING`
- `READY`
- `AWAITING_WORKER`
- `RUNNING`
- `AWAITING_APPROVAL`
- `BLOCKED`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

### Worker

Managed execution adapter attached to a session.

Purpose:

- represent the chosen execution backend
- standardize lifecycle and capability declarations

Required fields:

- `workerId`
- `sessionId`
- `workerType`
  - `model_invoke`
  - `managed_agent`
  - `terminal`
  - `desktop_executor`
  - `ci_runner`
- `adapterId`
  - examples:
    - `codex`
    - `openai_direct`
    - `anthropic_direct`
    - `openfang_linux`
- `status`
- `createdAt`

Optional fields:

- `capabilities`
- `routing`
- `agentProfileId`
- `provider`
- `transport`
- `model`
- `targetEnvironment`

Worker states:

- `ATTACHED`
- `READY`
- `RUNNING`
- `WAITING`
- `BLOCKED`
- `COMPLETED`
- `FAILED`
- `DETACHED`

### ApprovalCheckpoint

First-class approval gate inside a session.

Purpose:

- unify current run approvals and future tool/worker approvals
- support multiple approvals per session instead of one implicit approval per run

Required fields:

- `checkpointId`
- `sessionId`
- `scope`
  - `session`
  - `worker_action`
  - `tool_action`
  - `environment_access`
- `status`
- `reason`
- `createdAt`

Optional fields:

- `expiresAt`
- `reviewedAt`
- `requiredCapabilities`
- `requiredVerifierIds`
- `decisionContext`
- `capabilityGrantPresent`
- `capabilityGrantSha256`

Approval states:

- `PENDING`
- `APPROVED`
- `DENIED`
- `EXPIRED`
- `CANCELLED`

### ToolAction

Governed tool use record within a session.

Purpose:

- normalize terminal, desktop action, API invoke, and future worker tools
- make tool use visible and approvable

Required fields:

- `toolActionId`
- `sessionId`
- `workerId`
- `toolType`
  - `terminal_command`
  - `model_invoke`
  - `desktop_observe`
  - `desktop_actuate`
  - `desktop_verify`
  - `http_call`
  - `file_edit`
  - `ticket_update`
- `status`
- `createdAt`

Optional fields:

- `requestPayload`
- `resultPayload`
- `policyDecision`
- `approvalCheckpointId`
- `auditLink`
- `readOnly`
- `restrictedHostRequest`

ToolAction states:

- `REQUESTED`
- `AUTHORIZED`
- `STARTED`
- `COMPLETED`
- `POLICY_BLOCKED`
- `FAILED`
- `CANCELLED`

### EvidenceRecord

Durable evidence artifact bound to the session lifecycle.

Purpose:

- unify current evidence record/bundle plus future worker/tool artifacts
- make evidence retrieval consistent across clients

Required fields:

- `evidenceId`
- `sessionId`
- `kind`
  - `policy`
  - `approval`
  - `tool_output`
  - `desktop`
  - `audit_export`
  - `incident_package`
  - `worker_summary`
- `createdAt`

Optional fields:

- `toolActionId`
- `checkpointId`
- `uri`
- `checksum`
- `metadata`
- `retentionClass`

### EventStream

Append-only ordered session event feed.

Purpose:

- power chat/IDE live updates
- provide a single timeline abstraction
- avoid per-surface polling hacks

Required fields:

- `eventId`
- `sessionId`
- `sequence`
- `eventType`
- `timestamp`

Optional fields:

- `taskId`
- `workerId`
- `toolActionId`
- `checkpointId`
- `severity`
- `summary`
- `payload`

## Event model

### Core event types

- `task.created`
- `task.status.changed`
- `session.created`
- `session.started`
- `session.status.changed`
- `worker.attached`
- `worker.status.changed`
- `worker.output.delta`
- `approval.requested`
- `approval.status.changed`
- `tool_action.requested`
- `tool_action.authorized`
- `tool_action.started`
- `tool_action.completed`
- `tool_action.blocked`
- `tool_action.failed`
- `evidence.recorded`
- `audit.linked`
- `session.completed`
- `session.failed`
- `session.cancelled`

### Streaming requirements

- events are ordered per `sessionId`
- sequence numbers are monotonic inside a session
- clients must be able to resume from a cursor
- event payloads must be structured JSON, not free-form text blobs only

## Worker contract

Every worker adapter must support:

### Required inputs

- `task`
- `session`
- `actor`
- `scope`
- `policy context`
- `execution profile`
- `worker configuration`

### Required outputs

- worker status changes
- structured progress events
- proposed tool actions
- final result summary
- failure reason when applicable
- evidence links or payloads

### Governance rules

- workers do not bypass approval checkpoints
- workers do not bypass audit emission
- workers do not store raw secrets in task/session payloads
- workers may propose tool actions, but the control plane authorizes them

## API surface

Recommended new route family:

- `POST /v1alpha2/runtime/tasks`
- `GET /v1alpha2/runtime/tasks/{taskId}`
- `GET /v1alpha2/runtime/tasks`
- `POST /v1alpha2/runtime/tasks/{taskId}/sessions`
- `GET /v1alpha2/runtime/sessions/{sessionId}`
- `GET /v1alpha2/runtime/sessions`
- `GET /v1alpha2/runtime/sessions/{sessionId}/timeline`
- `POST /v1alpha2/runtime/sessions/{sessionId}/workers`
- `GET /v1alpha2/runtime/sessions/{sessionId}/workers`
- `POST /v1alpha2/runtime/sessions/{sessionId}/workers/{workerId}/events`
- `GET /v1alpha2/runtime/sessions/{sessionId}/events`
- `GET /v1alpha2/runtime/sessions/{sessionId}/events/stream`
- `POST /v1alpha2/runtime/sessions/{sessionId}/approvals`
- `GET /v1alpha2/runtime/sessions/{sessionId}/approval-checkpoints`
- `POST /v1alpha2/runtime/sessions/{sessionId}/approval-checkpoints`
- `POST /v1alpha2/runtime/sessions/{sessionId}/approval-checkpoints/{checkpointId}/decision`
- `POST /v1alpha2/runtime/approvals/{checkpointId}/decision`
- `POST /v1alpha2/runtime/sessions/{sessionId}/tool-actions`
- `GET /v1alpha2/runtime/sessions/{sessionId}/tool-actions`
- `POST /v1alpha2/runtime/sessions/{sessionId}/evidence`
- `GET /v1alpha2/runtime/sessions/{sessionId}/evidence`
- `POST /v1alpha2/runtime/sessions/{sessionId}/close`

Event-stream consumption notes:

- `GET /v1alpha2/runtime/sessions/{sessionId}/events` remains the cursor-based JSON list surface.
- `GET /v1alpha2/runtime/sessions/{sessionId}/events/stream` is the explicit event-stream surface for chat and IDE clients.
- `Accept: text/event-stream` or `format=event-stream` on the session events route is also valid.
- `GET /v1alpha2/runtime/sessions/{sessionId}/timeline` is the first native aggregated read model for future chat and IDE clients.
- `POST /v1alpha2/runtime/sessions/{sessionId}/workers/{workerId}/events` is the first worker-scoped write surface for native progress emission such as `worker.output.delta`.

## Backward-compatibility mapping

Current model to M16 model:

- `RunRecord` -> primary legacy-compatible `Session`
- `RunCreateRequest` -> `Task + Session bootstrap request`
- `ApprovalRecord` -> `ApprovalCheckpoint`
- `POST /runtime/terminal/sessions` -> `ToolAction(toolType=terminal_command)`
- `POST /runtime/integrations/invoke` -> `ToolAction(toolType=model_invoke)` or `Worker(model_invoke)` depending on path
- `EvidenceRecordResponse` / `EvidenceBundleResponse` -> `EvidenceRecord`
- runtime audit feed -> session-linked event/audit projection

## Migration sequence

### Step 1

Add read/write records for:

- tasks
- sessions
- session_events
- session_workers
- approval_checkpoints
- tool_actions
- evidence_records

Keep current `orchestration_runs` intact.

### Step 2

Create compatibility mapping so:

- new sessions can still expose current run summaries
- old run views can continue working during migration

### Step 3

Move current approval, terminal, and integration-invoke actions to emit session events and tool-action records.

### Step 4

Build chat surface on top of session/event streams, not directly on `run`.

### Step 5

Build Codex worker adapter against the worker contract.

### Step 6

Build VS Code client against the same session/task contract.

## First implementation target

The first implementation slice should be:

1. `Task`
2. `Session`
3. `EventStream`
4. `ApprovalCheckpoint`
5. compatibility projection back into existing `run` views

Do not start by building chat or VS Code first.

## Exit gate for M16

M16 is complete when:

- task/session/worker/event entities are real runtime records
- APIs exist for task creation, session start, worker attach, event stream, approval decision, evidence write, and session close
- current approval, terminal, and invoke flows can emit session-linked events
- one chat client and one IDE client could use the same contract without special-case backend behavior
