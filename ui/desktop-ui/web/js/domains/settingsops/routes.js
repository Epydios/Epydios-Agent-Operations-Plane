import { renderPanelStateMetric } from "../../views/common.js";
import { renderWorkbenchDomainEmptyState } from "../../shell/layout/workbench-domain.js";
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
  ui.settingsContent.innerHTML = renderWorkbenchDomainEmptyState({
    domainRoot: "settingsops",
    shellClass: "settingsops-workspace",
    title: options.title || "Settings",
    lead: "Settings ownership appears here once the current workspace configuration is available.",
    content: renderPanelStateMetric(
      options.tone || "info",
      options.title || "Settings",
      options.message || "Settings become available after Epydios loads the current workspace configuration.",
      options.detail ||
        "Refresh the workspace. If settings should already be available, check launcher status and try again."
    )
  });
}
