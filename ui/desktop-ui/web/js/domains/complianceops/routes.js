import { renderPanelStateMetric } from "../../views/common.js";
import { renderComplianceWorkspace } from "./panels/workspace.js";

export function renderComplianceOpsPage(ui, context = {}) {
  if (!ui?.complianceOpsContent) {
    return;
  }
  ui.complianceOpsContent.innerHTML = renderComplianceWorkspace(context);
}

export function renderComplianceOpsEmptyState(ui, options = {}) {
  if (!ui?.complianceOpsContent) {
    return;
  }
  ui.complianceOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "ComplianceOps",
    options.message ||
      "Compliance posture becomes available after policy, governance, evidence, audit, and platform signals load.",
    options.detail ||
      "Refresh the workspace. If compliance posture should already be present, verify governed run policy metadata, linked approvals, evidence bundles, audit events, and platform readiness."
  );
}
