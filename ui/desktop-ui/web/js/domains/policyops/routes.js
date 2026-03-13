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

export { chipClassForPolicyEffect, derivePolicyOutcomePresentation, presentPolicyCopy };

export function renderPolicySettingsPanels(settings = {}) {
  return {
    currentPolicyContractPanel: renderCurrentPolicyContractPanel(settings),
    policyPackCatalogPanel: renderPolicyPackCatalogPanel(settings)
  };
}

export { renderRunPolicyRichnessSection };
