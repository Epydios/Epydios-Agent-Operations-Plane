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
  ui.settingsContent.innerHTML = `
    <div class="workbench-domain-shell settingsops-workspace">
      <div class="workbench-domain-empty-state">
        ${renderPanelStateMetric(
          options.tone || "info",
          options.title || "SettingsOps",
          options.message || "Settings become available after local configuration and runtime scope data load.",
          options.detail ||
            "Refresh the workspace. If settings should already be present, verify scope and runtime endpoint availability."
        )}
      </div>
    </div>
  `;
}
