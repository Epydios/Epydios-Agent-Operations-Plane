# Epydios AgentOps CLI

`Epydios AgentOps CLI` is the first `M19` CLI ingress slice.

Scope of this slice:
- list native M16 tasks as governed threads
- show native task or session review from `task`, `session`, and `timeline` reads
- follow live native session events from `/v1alpha2/runtime/sessions/{sessionId}/events/stream`
- approve or deny native approval checkpoints
- approve or deny native tool proposals
- submit a governed turn against an existing `taskId`

This CLI does not introduce a second orchestration model. It consumes the same native M16/M18 contract used by desktop `Chat` and the VS Code client.

## Global Flags

- `--runtime-api-base-url`
- `--tenant-id`
- `--project-id`
- `--auth-token`
- `--include-legacy-sessions`
- `--output text|json`
- `--live-follow-wait-seconds`

Environment fallbacks:
- `AGENTOPS_RUNTIME_API_BASE_URL`
- `AGENTOPS_TENANT_ID`
- `AGENTOPS_PROJECT_ID`
- `AGENTOPS_AUTH_TOKEN`
- `AGENTOPS_INCLUDE_LEGACY_SESSIONS`
- `AGENTOPS_OUTPUT_FORMAT`
- `AGENTOPS_LIVE_FOLLOW_WAIT_SECONDS`

## Commands

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local threads list
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local threads show --task-id <task-id>
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local sessions follow --session-id <session-id>
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local approvals decide --session-id <session-id> --checkpoint-id <checkpoint-id> --decision APPROVE
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local proposals decide --session-id <session-id> --proposal-id <proposal-id> --decision APPROVE
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local turns send --task-id <task-id> --prompt "Summarize the current worker state." --execution-mode managed_codex_worker
```

## Local Validation

```bash
cd "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO"
go test ./clients/cli-agentops
```
