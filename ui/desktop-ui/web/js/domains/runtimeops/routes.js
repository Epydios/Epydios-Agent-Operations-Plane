import { renderPanelStateMetric } from "../../views/common.js";
import { renderWorkbenchDomainEmptyState } from "../../shell/layout/workbench-domain.js";
import {
  readRuntimeRunFilters,
  renderRuntimeRunDetail,
  renderRuntimeRunDetailError,
  renderRuntimeRuns
} from "./panels/run-inventory/inventory.js";
import {
  renderRuntimeError,
  renderRuntimeHealth,
  renderRuntimeHealthCards,
  renderRuntimeHealthError
} from "./panels/health/cards.js";
import { renderRuntimeWorkspace } from "./panels/workspace.js";

export {
  readRuntimeRunFilters,
  renderRuntimeError,
  renderRuntimeHealth,
  renderRuntimeHealthCards,
  renderRuntimeHealthError,
  renderRuntimeRunDetail,
  renderRuntimeRunDetailError,
  renderRuntimeRuns
};

export function renderRuntimeOpsPage(ui, context = {}, session = {}, options = {}) {
  if (!ui?.runtimeOpsContent) {
    return;
  }
  ui.runtimeOpsContent.innerHTML = renderRuntimeWorkspace(context, session, options);
}

export function renderRuntimeOpsEmptyState(ui, options = {}) {
  if (!ui?.runtimeOpsContent) {
    return;
  }
  ui.runtimeOpsContent.innerHTML = renderWorkbenchDomainEmptyState({
    domainRoot: "runtimeops",
    shellClass: "runtimeops-workspace",
    title: options.title || "RuntimeOps",
    lead:
      "Inspect governed runs, follow session continuity, and review runtime posture here when the daily lane is not enough.",
    content: renderPanelStateMetric(
      options.tone || "info",
      options.title || "RuntimeOps",
      options.message || "Runtime state becomes available after health, provider, and run data load.",
      options.detail ||
        "Refresh the workspace. If runtime data should be present, verify runtime health, provider discovery, and run inventory availability."
    )
  });
}
