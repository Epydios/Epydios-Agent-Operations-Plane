import { renderPanelStateMetric } from "../../views/common.js";
import { renderLogOpsWorkspace } from "./panels/workspace.js";
import { createLogOpsSnapshot } from "./state.js";

export function renderLogOpsPage(ui, context = {}) {
  if (!ui?.logOpsContent) {
    return;
  }
  ui.logOpsContent.innerHTML = renderLogOpsWorkspace(createLogOpsSnapshot(context));
}

export function renderLogOpsEmptyState(ui, options = {}) {
  if (!ui?.logOpsContent) {
    return;
  }
  ui.logOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "LogOps",
    options.message ||
      "LogOps becomes available after the native shell exposes local diagnostics and service paths.",
    options.detail ||
      "Refresh the workspace. If native diagnostics should already be available, verify the installed desktop shell instead of the browser-only path."
  );
}
