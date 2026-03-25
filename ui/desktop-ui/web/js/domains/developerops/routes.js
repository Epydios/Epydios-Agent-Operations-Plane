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
    options.title || "Diagnostics",
    options.message || "Diagnostics become available after Epydios loads runtime, settings, and inspection context.",
    options.detail ||
      "Refresh the workspace. If diagnostics should already be available, check launcher status, selected project scope, and current inspection inputs."
  );
}
