# chatops-agentops

`chatops-agentops` is a thin chatops ingress client for AgentOps. It does not create a separate orchestration layer. Instead, it uses the same native task, session, worker, timeline, approval, tool-action, evidence, and event-stream APIs already used by desktop chat, VS Code, CLI, and workflow ingress.

## Commands

- `conversations intake`
  - create a governed task from external chat context
  - optionally submit the first governed turn against the new task
  - supports `text`, `json`, or normalized thread-ready `update` output
- `conversations status`
  - render governed state for a task as `text`, `json`, `update`, or `report`
  - can resolve by `--task-id` or by chat context such as `--thread-id` plus optional `--source-system`, `--channel-id`, and `--channel-name`
  - `update` is suitable for posting back into a Slack or Teams thread
  - update output now includes recent activity and action hints when pending approvals or proposals need operator action
  - report output adds policy-pack and worker-capability coverage from the same native contract
- `conversations follow`
  - follow native session events for a governed conversation
  - can resolve by `--task-id` or by chat context such as `--thread-id`
  - supports `text`, `json`, normalized `update`, lower-noise `delta-update`, full `report`, or lower-noise `delta-report` output
  - update output refreshes governed thread state with the same recent-activity and action-hint packaging as `conversations status`
  - `update`, `report`, and `delta-report` are suitable for posting back into external conversation systems
- `conversations reply` or `conversations resume`
  - submit a governed follow-up turn against an existing task
  - can resolve by `--task-id` or by chat context such as `--thread-id`
  - supports `text`, `json`, or `update` output for posting back into a conversation
- `approvals decide`
  - approve or deny a native approval checkpoint
  - can resolve the active session and checkpoint from chat context when exactly one pending approval matches the thread
  - supports `text`, `json`, or `update` output for posting back into a conversation
- `proposals decide`
  - approve or deny a native tool proposal
  - can resolve the active session and proposal from chat context when exactly one pending proposal matches the thread
  - supports `text`, `json`, or `update` output for posting back into a conversation

## Environment

- `AGENTOPS_RUNTIME_API_BASE_URL`
- `AGENTOPS_TENANT_ID`
- `AGENTOPS_PROJECT_ID`
- `AGENTOPS_AUTH_TOKEN`
- `AGENTOPS_OUTPUT_FORMAT`
- `AGENTOPS_INCLUDE_LEGACY_SESSIONS`
- `AGENTOPS_LIVE_FOLLOW_WAIT_SECONDS`

## Examples

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  conversations intake \
  --source-system slack \
  --channel-id C123 \
  --channel-name ops-alerts \
  --thread-id 1730.55 \
  --title "Investigate failing deployment" \
  --intent "Triage the deployment failure and propose the next governed step." \
  --initial-prompt "Review the failing deployment and propose the first governed action." \
  --render update
```

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  conversations status \
  --source-system slack \
  --thread-id 1730.55 \
  --render update
```

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  conversations status \
  --source-system slack \
  --thread-id 1730.55 \
  --render report
```

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  conversations reply \
  --thread-id 1730.55 \
  --prompt "Continue from the last approved step and summarize the next governed action." \
  --execution-mode managed_codex_worker \
  --render update
```

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  conversations follow \
  --thread-id 1730.55 \
  --render delta-update
```

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  conversations follow \
  --thread-id 1730.55 \
  --render delta-report
```

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  approvals decide \
  --source-system slack \
  --thread-id 1730.55 \
  --decision APPROVE \
  --reason "Verified by on-call." \
  --render update
```

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  proposals decide \
  --source-system slack \
  --thread-id 1730.55 \
  --decision DENY \
  --reason "Not approved for this thread." \
  --render update
```

If more than one pending approval or proposal matches the resolved thread, rerun with the explicit `--checkpoint-id` or `--proposal-id` shown in `conversations status`. The thread-ready update output now includes those action hints directly.
