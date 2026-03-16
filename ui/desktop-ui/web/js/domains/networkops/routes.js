import { renderPanelStateMetric } from "../../views/common.js";
import { renderNetworkWorkspace } from "./panels/workspace.js";

export function renderNetworkOpsPage(ui, context = {}) {
  if (!ui?.networkOpsContent) {
    return;
  }
  ui.networkOpsContent.innerHTML = renderNetworkWorkspace(context);
}

export function renderNetworkOpsEmptyState(ui, options = {}) {
  if (!ui?.networkOpsContent) {
    return;
  }
  ui.networkOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "NetworkOps",
    options.message || "Network posture becomes available after boundary, endpoint, and trust signals load.",
    options.detail ||
      "Refresh the workspace. If network posture should already be present, verify settings endpoint health, provider route state, and AIMXS trust inputs."
  );
}
