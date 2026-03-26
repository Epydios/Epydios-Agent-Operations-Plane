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
    options.message || "Incident packages appear here after a governed run, review decision, and audit trail are ready.",
    options.detail ||
      "Refresh the workspace. If an incident package should already be here, check the linked run, audit activity, and evidence handoff."
  );
}
