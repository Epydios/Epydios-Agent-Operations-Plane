import { renderPanelStateMetric } from "../../views/common.js";
import { renderEvidenceWorkspace } from "./panels/workspace.js";

export function renderEvidenceOpsPage(ui, context = {}) {
  if (!ui?.evidenceOpsContent) {
    return;
  }
  ui.evidenceOpsContent.innerHTML = renderEvidenceWorkspace(context);
}

export function renderEvidenceOpsEmptyState(ui, options = {}) {
  if (!ui?.evidenceOpsContent) {
    return;
  }
  ui.evidenceOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "EvidenceOps",
    options.message || "Evidence becomes available after recent runs, screenshots, and proof packages load.",
    options.detail ||
      "Refresh the workspace. If evidence should already be visible, open a recent run or handoff package and try again."
  );
}
