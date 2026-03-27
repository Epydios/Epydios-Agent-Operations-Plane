import { renderPanelStateMetric } from "../../views/common.js";
import { renderWorkbenchDomainEmptyState } from "../../shell/layout/workbench-domain.js";
import { renderAuditWorkspace } from "./panels/workspace.js";

export function renderAuditOpsPage(ui, context = {}) {
  if (!ui?.auditOpsContent) {
    return;
  }
  ui.auditOpsContent.innerHTML = renderAuditWorkspace(context);
}

export function renderAuditOpsEmptyState(ui, options = {}) {
  if (!ui?.auditOpsContent) {
    return;
  }
  ui.auditOpsContent.innerHTML = renderWorkbenchDomainEmptyState({
    domainRoot: "auditops",
    shellClass: "auditops-workspace",
    title: options.title || "AuditOps",
    lead: "Audit ownership appears here once recent run, approval, and review history load.",
    content: renderPanelStateMetric(
      options.tone || "info",
      options.title || "AuditOps",
      options.message || "Audit activity becomes available after recent runs, approvals, and review history load.",
      options.detail ||
        "Refresh the workspace. If audit activity should already be visible, open a recent run or approval and try again."
    )
  });
}
