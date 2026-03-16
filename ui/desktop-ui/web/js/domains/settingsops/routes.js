import { renderPanelStateMetric } from "../../views/common.js";
import { renderSettingsWorkspace } from "./panels/workspace.js";

export function renderSettingsOpsPage(ui, context = {}) {
  if (!ui?.settingsContent) {
    return;
  }
  ui.settingsContent.innerHTML = renderSettingsWorkspace(context);
}

export function renderSettingsOpsEmptyState(ui, options = {}) {
  if (!ui?.settingsContent) {
    return;
  }
  ui.settingsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "SettingsOps",
    options.message || "Settings become available after local configuration and runtime scope data load.",
    options.detail ||
      "Refresh the workspace. If settings should already be present, verify scope and runtime endpoint availability."
  );
}
