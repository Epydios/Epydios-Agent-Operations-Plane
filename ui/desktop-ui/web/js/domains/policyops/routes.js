import {
  chipClassForPolicyEffect,
  derivePolicyOutcomePresentation,
  presentPolicyCopy
} from "./state.js";
import {
  renderCurrentPolicyContractPanel,
  renderPolicyPackCatalogPanel
} from "./panels/settings.js";
import { renderRunPolicyRichnessSection } from "./panels/history.js";
import { renderPanelStateMetric } from "../../views/common.js";
import { renderPolicyWorkspace } from "./panels/workspace.js";

export { chipClassForPolicyEffect, derivePolicyOutcomePresentation, presentPolicyCopy };

export function renderPolicySettingsPanels(settings = {}) {
  return {
    currentPolicyContractPanel: renderCurrentPolicyContractPanel(settings),
    policyPackCatalogPanel: renderPolicyPackCatalogPanel(settings)
  };
}

export { renderRunPolicyRichnessSection };

export function renderPolicyOpsPage(ui, context = {}) {
  if (!ui?.policyOpsContent) {
    return;
  }
  ui.policyOpsContent.innerHTML = renderPolicyWorkspace(context);
}

export function renderPolicyOpsEmptyState(ui, options = {}) {
  if (!ui?.policyOpsContent) {
    return;
  }
  ui.policyOpsContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "PolicyOps",
    options.message || "Decision contract, verify gate, and governance route posture become available after policy pack and governed-decision signals load.",
    options.detail ||
      "Refresh the workspace. If decision posture should be present, verify settings, the policy catalog, governed run inputs, and routed governance anchors."
  );
}
