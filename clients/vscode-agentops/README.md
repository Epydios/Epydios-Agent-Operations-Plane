# EpydiosOps VS Code Governed Thread Client

`vscode-agentops` is the bounded VS Code client for the EpydiosOps governed-thread runtime contract.

Scope of this slice:
- list governed threads from the shared runtime contract
- resume thread review from VS Code
- follow live native session events via `/v1alpha2/runtime/sessions/{sessionId}/events/stream`
- show managed worker review state from native `timeline`, `approval`, `tool_action`, `evidence`, and `tool_proposal` data
- package thread review and live follow into a shared governed update panel so operator guidance stays aligned with the other ingress surfaces
- render the governed thread report against the same worker-capability and policy-pack catalogs used by the other bounded clients
- approve or deny native approval checkpoints and tool proposals from the IDE review surface
- submit a governed turn against the existing task through `POST /v1alpha1/runtime/integrations/invoke`
- auto-select a single pending approval or proposal from the selected session when raw ids are not needed
- show native action hints when multiple pending approvals or proposals still require explicit selection

This client does not add a second orchestration model. It consumes the same governed-thread runtime contract used by the desktop shell and the other bounded clients.

## Load In VS Code

1. Open this folder in VS Code:
   - `EPYDIOS_AGENTOPS_DESKTOP_REPO/clients/vscode-agentops`
2. Press `F5` to launch an Extension Development Host.
3. In the development host, open the `EpydiosOps` activity bar view.

## Extension Settings

- `agentops.runtimeApiBaseUrl`
- `agentops.tenantId`
- `agentops.projectId`
- `agentops.authToken`
- `agentops.liveFollowWaitSeconds`
- `agentops.includeLegacySessions`

## Commands

- `EpydiosOps: Refresh Threads`
- `EpydiosOps: Resume Thread Review`
- `EpydiosOps: Open Thread By Task ID`

## Review Actions

Inside a thread review panel you can now:
- approve or deny pending approval checkpoints
- approve or deny pending tool proposals
- copy the governed enterprise report for the selected native session
- send the next governed turn against the current task with either:
  - `raw_model_invoke`
  - `managed_codex_worker`

The IDE panel remains review-first. It does not bypass native approval, tool-action, evidence, or worker-event boundaries.

## Local Validation

From the module directory:

```bash
cd clients/vscode-agentops
node --check extension.js
node --check lib/runtimeClient.js
node --check lib/sessionReview.js
node --check lib/threadContext.js
node --check lib/updateEnvelope.js
node --check lib/reportEnvelope.js
node --test ./test/*.test.js
```
