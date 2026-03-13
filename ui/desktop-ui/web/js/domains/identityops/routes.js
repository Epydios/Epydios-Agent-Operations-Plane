import { createIdentitySettingsSnapshot } from "./state.js";
import { renderIdentityAuthSummaryCard, setIdentityAuthDisplay } from "./panels/auth-summary.js";
import {
  renderCurrentIdentityAuthorityPanel,
  renderRuntimeIdentityContractPanel
} from "./panels/authority.js";
import { renderIdentityWorkspace } from "./panels/workspace.js";
import { renderPanelStateMetric } from "../../views/common.js";

export { createIdentitySettingsSnapshot, renderIdentityAuthSummaryCard, setIdentityAuthDisplay };

export function renderIdentitySettingsPanels(settings = {}) {
  return {
    currentIdentityAuthorityPanel: renderCurrentIdentityAuthorityPanel(settings),
    runtimeIdentityContractPanel: renderRuntimeIdentityContractPanel(settings)
  };
}

export function renderIdentityOpsPage(ui, settingsPayload = {}, session = {}) {
  if (!ui?.identityContent) {
    return;
  }
  ui.identityContent.innerHTML = renderIdentityWorkspace(settingsPayload, session);
}

export function renderIdentityOpsEmptyState(ui, options = {}) {
  if (!ui?.identityContent) {
    return;
  }
  ui.identityContent.innerHTML = renderPanelStateMetric(
    options.tone || "info",
    options.title || "IdentityOps",
    options.message || "Identity state becomes available after configuration and runtime identity load.",
    options.detail || "Refresh the workspace. If identity should be present, verify runtime identity availability and active scope."
  );
}
