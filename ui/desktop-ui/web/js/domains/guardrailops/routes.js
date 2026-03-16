import { renderPanelStateMetric } from "../../views/common.js";
import { renderGuardrailWorkspace } from "./panels/workspace.js";

export function renderGuardrailOpsPage(ui, context = {}) {
  if (!ui?.guardrailOpsContent) {
    return;
  }
  ui.guardrailOpsContent.innerHTML = renderGuardrailWorkspace(context);
}

export function renderGuardrailOpsEmptyState(ui, options = {}) {
  if (!ui?.guardrailOpsContent) {
    return;
  }
  ui.guardrailOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "GuardrailOps",
    options.message || "Guardrail posture becomes available after runtime, policy, and governance signals load.",
    options.detail ||
      "Refresh the workspace. If guardrail posture should be present, verify runtime runs, approval gates, worker capabilities, and guardrail-profile inputs."
  );
}
