import { renderPanelStateMetric } from "../../views/common.js";
import { renderHomeWorkspace } from "./panels/dashboard.js";
import { createHomeWorkspaceSnapshot } from "./state.js";

export function renderHomeOpsPage(ui, context = {}) {
  if (!ui?.homeOpsContent) {
    return;
  }
  ui.homeOpsContent.innerHTML = renderHomeWorkspace(createHomeWorkspaceSnapshot(context));
}

export function renderHomeOpsEmptyState(ui, options = {}) {
  if (!ui?.homeOpsContent) {
    return;
  }
  ui.homeOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "CompanionOps",
    options.message ||
      "CompanionOps becomes available after runtime, gateway, governance, and current workbench anchors load.",
    options.detail ||
      "Refresh the workspace. If CompanionOps should already be populated, verify the current launcher, gateway, and owning-domain anchors before widening the shell."
  );
}
