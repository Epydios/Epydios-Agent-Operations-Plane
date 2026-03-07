# Epydios AgentOps Workflow Ingress

`Epydios AgentOps Workflow Ingress` is the first `M19` ticket/workflow ingress slice.

Scope of this slice:
- intake external ticket or workflow payloads into native M16 tasks
- optionally start the first governed turn against the created `taskId`
- emit native status summaries for ticket/workflow systems without introducing another orchestration model
- keep ticket/workflow ingress on the same native task, session, worker, timeline, event-stream, approval, tool-action, and evidence contract already used by desktop Chat, VS Code, and CLI

## Commands

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets intake --file payload.json
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets status --task-id <task-id>
```

```bash
go run ./clients/workflow-agentops --tenant-id tenant-local --project-id project-local tickets status --task-id <task-id> --render comment
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

```bash
cd "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO"
go test ./clients/internal/runtimeclient ./clients/cli-agentops ./clients/workflow-agentops
```
