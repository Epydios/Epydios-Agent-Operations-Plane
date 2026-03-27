import { renderPanelStateMetric } from "../../views/common.js";
import { renderWorkbenchDomainEmptyState } from "../../shell/layout/workbench-domain.js";
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
  ui.evidenceOpsContent.innerHTML = renderWorkbenchDomainEmptyState({
    domainRoot: "evidenceops",
    shellClass: "evidenceops-workspace",
    title: options.title || "EvidenceOps",
    lead: "Evidence ownership appears here once recent runs, screenshots, and proof packages load.",
    content: renderPanelStateMetric(
      options.tone || "info",
      options.title || "EvidenceOps",
      options.message || "Evidence becomes available after recent runs, screenshots, and proof packages load.",
      options.detail ||
        "Refresh the workspace. If evidence should already be visible, open a recent run or handoff package and try again."
    )
  });
}
