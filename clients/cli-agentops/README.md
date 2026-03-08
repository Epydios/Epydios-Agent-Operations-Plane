# Epydios AgentOps CLI

`Epydios AgentOps CLI` is the first `M19` CLI ingress slice.

Scope of this slice:
- list native M16 tasks as governed threads
- show native task or session review from `task`, `session`, and `timeline` reads
- follow live native session events from `/v1alpha2/runtime/sessions/{sessionId}/events/stream`
- render shared governed `update` and `delta-update` envelopes for review and follow flows
- render enterprise `report` and `delta-report` envelopes for review and follow flows
- approve or deny native approval checkpoints
- approve or deny native tool proposals
- submit a governed turn against an existing `taskId`
- resolve the active session from `taskId` when a raw `sessionId` is not convenient
- auto-select a single pending approval or proposal target from native session state

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
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local threads show --task-id <task-id> --render update
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local threads show --task-id <task-id> --render report
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local threads show --session-id <session-id>
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local sessions follow --task-id <task-id>
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local sessions follow --session-id <session-id> --render delta-update
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local sessions follow --session-id <session-id> --render report
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local sessions follow --session-id <session-id> --render delta-report
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local sessions follow --session-id <session-id>
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local approvals decide --task-id <task-id> --decision APPROVE
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local proposals decide --task-id <task-id> --decision APPROVE
```

```bash
go run ./clients/cli-agentops --tenant-id tenant-local --project-id project-local turns send --session-id <session-id> --prompt "Summarize the current worker state." --execution-mode managed_codex_worker
```

## Enterprise report notes

- `report` and `delta-report` renders include:
  - applicable policy packs
  - role bundles
  - decision surfaces
  - worker capability coverage
  - boundary requirements
- secret-like transcript or evidence content is redacted before output and surfaced as `DLP findings`

## Local Validation

```bash
cd "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO"
go test ./clients/cli-agentops
```
