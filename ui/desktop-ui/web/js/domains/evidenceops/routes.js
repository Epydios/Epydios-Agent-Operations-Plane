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
    options.message || "Evidence posture becomes available after governed runs, artifacts, and linked proof material load.",
    options.detail ||
      "Refresh the workspace. If evidence posture should already be present, verify governed run outputs, active thread evidence records, and linked incident packages."
  );
}
