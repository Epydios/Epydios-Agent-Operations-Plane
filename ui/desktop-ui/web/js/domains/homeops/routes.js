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
    options.title || "HomeOps",
    options.message ||
      "HomeOps command posture becomes available after runtime, platform, policy, governance, audit, and incident anchors load.",
    options.detail ||
      "Refresh the workspace. If HomeOps should already be populated, verify the current domain anchors before widening Home."
  );
}
