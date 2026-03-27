import { buildAgentWorkspaceMarkup } from "../../../../views/chat.js";
import { renderPanelStateMetric } from "../../../../views/common.js";
import { renderWorkbenchDomainEmptyState } from "../../../../shell/layout/workbench-domain.js";

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
  target.innerHTML = renderWorkbenchDomainEmptyState({
    domainRoot: "agentops",
    shellClass: "agentops-workspace",
    title: options.title || "AgentOps",
    lead:
      "This surface keeps active governed thread work and thread proof together. When no thread is active yet, the domain should still explain what belongs here.",
    content: renderPanelStateMetric(
      options.tone || "info",
      options.title || "AgentOps",
      options.message || "",
      options.detail || ""
    )
  });
}
