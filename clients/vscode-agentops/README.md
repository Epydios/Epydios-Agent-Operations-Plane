# Epydios AgentOps VS Code

`Epydios AgentOps VS Code` is the first M19 IDE-facing client slice.

Scope of this slice:
- list native M16 tasks as governed threads
- resume thread review from VS Code
- follow live native session events via `/v1alpha2/runtime/sessions/{sessionId}/events/stream`
- show managed worker review state from native `timeline`, `approval`, `tool_action`, `evidence`, and `tool_proposal` data
- approve or deny native approval checkpoints and tool proposals from the IDE review surface
- submit a governed turn against the existing task through `POST /v1alpha1/runtime/integrations/invoke`

This slice does not add a second orchestration model. It consumes the same native session contract that powers the desktop `Chat` surface.

## Load In VS Code

1. Open this folder in VS Code:
   - `EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/vscode-agentops`
2. Press `F5` to launch an Extension Development Host.
3. In the development host, open the `AgentOps` activity bar view.

## Extension Settings

- `agentops.runtimeApiBaseUrl`
- `agentops.tenantId`
- `agentops.projectId`
- `agentops.authToken`
- `agentops.liveFollowWaitSeconds`
- `agentops.includeLegacySessions`

## Commands

- `AgentOps: Refresh Threads`
- `AgentOps: Resume Thread Review`
- `AgentOps: Open Thread By Task ID`

## Review Actions

Inside a thread review panel you can now:
- approve or deny pending approval checkpoints
- approve or deny pending tool proposals
- send the next governed turn against the current task with either:
  - `raw_model_invoke`
  - `managed_codex_worker`

The IDE panel remains review-first. It does not bypass native approval, tool-action, evidence, or worker-event boundaries.

## Local Validation

```bash
cd "/Users/maindrive/Dropbox (Personal)/1 chatGPT SHARED FILES/GITHUB/AGENTOPS DESKTOP/EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/vscode-agentops"
node --check extension.js
node --check lib/runtimeClient.js
node --check lib/sessionReview.js
node --test ./test/*.test.js
```
