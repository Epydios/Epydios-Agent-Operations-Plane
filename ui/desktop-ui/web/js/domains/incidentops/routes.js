import { renderPanelStateMetric } from "../../views/common.js";
import { renderIncidentWorkspace } from "./panels/workspace.js";

export function renderIncidentOpsPage(ui, context = {}) {
  if (!ui?.incidentOpsContent) {
    return;
  }
  ui.incidentOpsContent.innerHTML = renderIncidentWorkspace(context);
}

export function renderIncidentOpsEmptyState(ui, options = {}) {
  if (!ui?.incidentOpsContent) {
    return;
  }
  ui.incidentOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "IncidentOps",
    options.message || "Incident posture becomes available after incident packages, linked runs, and audit anchors load.",
    options.detail ||
      "Refresh the workspace. If incident posture should already be present, verify packaged incident history, linked audit events, and governed run anchors."
  );
}
