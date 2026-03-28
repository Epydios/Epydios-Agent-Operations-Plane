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
    options.title || "Companion",
    options.message ||
      "Companion becomes available after the workspace finishes loading.",
    options.detail ||
      "Refresh the workspace. If Companion should already be available, check launcher status and try again."
  );
}
