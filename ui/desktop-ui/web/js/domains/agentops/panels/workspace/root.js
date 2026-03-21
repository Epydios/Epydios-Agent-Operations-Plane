import { buildAgentWorkspaceMarkup } from "../../../../views/chat.js";
import { renderPanelStateMetric } from "../../../../views/common.js";

export function renderAgentWorkspace(target, settingsPayload = {}, chatState = {}) {
  if (!(target instanceof HTMLElement)) {
    return;
  }
  target.innerHTML = buildAgentWorkspaceMarkup(settingsPayload, chatState);
}

export function renderAgentWorkspaceState(target, options = {}) {
  if (!(target instanceof HTMLElement)) {
    return;
  }
  target.innerHTML = `
    <div class="workbench-domain-shell agentops-workspace">
      <div class="workbench-domain-shell-header">
        <h2>${options.title || "AgentOps"}</h2>
        <p class="workbench-domain-shell-lead">This surface keeps active governed thread work and thread proof together. When no thread is active yet, the domain should still explain what belongs here.</p>
      </div>
      <div class="workbench-domain-empty-state">
        ${renderPanelStateMetric(
          options.tone || "info",
          options.title || "AgentOps",
          options.message || "",
          options.detail || ""
        )}
      </div>
    </div>
  `;
}
