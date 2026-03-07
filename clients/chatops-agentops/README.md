# chatops-agentops

`chatops-agentops` is a thin chatops ingress client for AgentOps. It does not create a separate orchestration layer. Instead, it uses the same native task, session, worker, timeline, approval, tool-action, evidence, and event-stream APIs already used by desktop chat, VS Code, CLI, and workflow ingress.

## Commands

- `conversations intake`
  - create a governed task from external chat context
  - optionally submit the first governed turn against the new task
- `conversations status`
  - render governed state for a task as `text`, `json`, or `update`
  - `update` is suitable for posting back into a Slack or Teams thread

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
  --initial-prompt "Review the failing deployment and propose the first governed action."
```

```bash
go run ./clients/chatops-agentops \
  --runtime-api-base-url http://127.0.0.1:8080 \
  --tenant-id tenant-local \
  --project-id project-local \
  conversations status \
  --task-id task_123 \
  --render update
```
