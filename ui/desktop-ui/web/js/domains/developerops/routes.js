import { renderPanelStateMetric } from "../../views/common.js";
import { renderDeveloperWorkspace } from "./panels/workspace.js";

export function renderDeveloperOpsPage(ui, context = {}) {
  if (!ui?.developerOpsContent) {
    return;
  }
  ui.developerOpsContent.innerHTML = renderDeveloperWorkspace(context);
}

export function renderDeveloperOpsEmptyState(ui, options = {}) {
  if (!ui?.developerOpsContent) {
    return;
  }
  ui.developerOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "DeveloperOps",
    options.message || "Developer diagnostics become available after runtime, settings, and advanced preview signals load.",
    options.detail ||
      "Refresh the workspace. If developer tooling should already be present, verify runtime health, selected project scope, and advanced operations inputs."
  );
}
