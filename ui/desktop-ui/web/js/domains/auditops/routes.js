import { renderPanelStateMetric } from "../../views/common.js";
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
  ui.auditOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "AuditOps",
    options.message || "Audit posture becomes available after audit, run, approval, and identity-linked trace signals load.",
    options.detail ||
      "Refresh the workspace. If audit posture should be present, verify audit source availability, current scope, and linked governance or runtime anchors."
  );
}
