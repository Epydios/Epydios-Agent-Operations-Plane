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
  target.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "Agent Workspace",
    options.message || "",
    options.detail || ""
  );
}
