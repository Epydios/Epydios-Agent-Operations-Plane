# EpydiosOps Workflow Governed Thread Client

`workflow-agentops` is the bounded workflow client for the EpydiosOps governed-thread runtime contract.

Scope of this slice:
- intake external ticket or workflow payloads into governed tasks on the shared runtime contract
- optionally start the first governed turn against the created `taskId`
- support governed follow-up turns and native live follow on existing workflow tasks
- emit native status summaries for ticket/workflow systems without introducing another orchestration model
- emit normalized governed-thread reports from the same runtime contract for reporting and export consumers
- reuse the same governed update-envelope shape already used by chatops, instead of inventing a workflow-specific status dialect
- keep ticket/workflow ingress on the same governed task, session, worker, timeline, event-stream, approval, tool-action, and evidence contract already used by the desktop shell, VS Code, CLI, and chatops clients

## Commands

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets intake --file payload.json
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets intake --file payload.json --render update
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets status --task-id <task-id>
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets status --task-id <task-id> --render comment
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets status --task-id <task-id> --render update
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets status --task-id <task-id> --render report
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets reply --task-id <task-id> --prompt "Continue from the last approved step and summarize the next governed action." --execution-mode managed_codex_worker --render update
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets follow --task-id <task-id> --render delta-update
```

`delta-update` emits only newly observed native events and suppresses empty follow windows.

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets follow --task-id <task-id> --render delta-report
```

`report` and `delta-report` reuse the same governed task, session, worker, approval, proposal, tool-action, and evidence state while adding policy-pack and worker-capability coverage for downstream review consumers.

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local approvals decide --ticket-id OPS-101 --source-system jira --decision APPROVE --render update
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local proposals decide --ticket-id OPS-101 --source-system jira --decision DENY --render update
```

## Intake Payload Shape

```json
{
  "sourceSystem": "jira",
  "ticketId": "OPS-101",
  "ticketUrl": "https://tickets.example/OPS-101",
  "workflowId": "incident-response",
  "workflowUrl": "https://workflow.example/run/incident-response",
  "title": "Investigate repeated timeout errors in checkout flow",
  "intent": "Create a governed task that triages the timeout spike and proposes the next safe remediation step.",
  "requestedBy": {
    "displayName": "Incident Commander"
  },
  "labels": ["incident", "sev2"],
  "annotations": {
    "environment": "prod"
  },
  "initialPrompt": "Summarize the incident and propose the first governed verification step.",
  "executionMode": "managed_codex_worker",
  "agentProfileId": "codex",
  "systemPrompt": "Prefer minimal-risk verification before proposing changes.",
  "maxOutputTokens": 256
}
```

## Local Validation

From the repo root:

```bash
go test ./clients/internal/runtimeclient ./clients/cli-agentops ./clients/workflow-agentops
```
