import { renderPanelStateMetric } from "../../views/common.js";
import { renderPlatformWorkspace } from "./panels/workspace.js";

export function renderPlatformOpsPage(ui, context = {}) {
  if (!ui?.platformOpsContent) {
    return;
  }
  ui.platformOpsContent.innerHTML = renderPlatformWorkspace(context);
}

export function renderPlatformOpsEmptyState(ui, options = {}) {
  if (!ui?.platformOpsContent) {
    return;
  }
  ui.platformOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "PlatformOps",
    options.message || "Platform posture becomes available after environment, deployment, and dependency signals load.",
    options.detail || "Refresh the workspace. If platform posture should be present, verify health, provider, pipeline, and AIMXS activation inputs."
  );
}
