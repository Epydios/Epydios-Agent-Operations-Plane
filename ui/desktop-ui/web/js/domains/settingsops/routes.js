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
          options.title || "Settings",
          options.message || "Settings become available after Epydios loads the current workspace configuration.",
          options.detail ||
            "Refresh the workspace. If settings should already be available, check launcher status and try again."
        )}
      </div>
    </div>
  `;
}
