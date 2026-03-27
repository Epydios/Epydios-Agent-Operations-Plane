import { renderPanelStateMetric } from "../../views/common.js";
import { renderWorkbenchDomainEmptyState } from "../../shell/layout/workbench-domain.js";
import { renderGovernanceWorkspace } from "./panels/workspace.js";

export function renderGovernanceOpsPage(ui, context = {}) {
  if (!ui?.governanceOpsContent) {
    return;
  }
  ui.governanceOpsContent.innerHTML = renderGovernanceWorkspace(context);
}

export function renderGovernanceOpsEmptyState(ui, options = {}) {
  if (!ui?.governanceOpsContent) {
    return;
  }
  ui.governanceOpsContent.innerHTML = renderWorkbenchDomainEmptyState({
    domainRoot: "governanceops",
    shellClass: "governanceops-workspace",
    title: options.title || "GovernanceOps",
    lead:
      "Handle deeper governance review, approval structure, and decision receipts here when Companion awareness is not enough.",
    content: renderPanelStateMetric(
      options.tone || "info",
      options.title || "GovernanceOps",
      options.message || "Governance posture becomes available after approval, authority, and decision receipt signals load.",
      options.detail ||
        "Refresh the workspace. If governance posture should be present, verify approval queues, authority inputs, and run decision anchors."
    )
  });
}
