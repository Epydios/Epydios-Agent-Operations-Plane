import { buildAgentOpsEmbeddedPanelMarkup } from "./state.js";
import {
  renderAgentWorkspace,
  renderAgentWorkspaceState
} from "./panels/workspace/root.js";
import { mountAgentApprovalSlots } from "./panels/thread-review/approval-slots.js";

export function renderAgentOpsPage(ui, settingsPayload = {}, chatState = {}) {
  renderAgentWorkspace(ui?.chatContent, settingsPayload, chatState);
}

export function mountAgentOpsEmbeddedPanels(ui) {
  mountAgentApprovalSlots(
    ui?.chatContent,
    buildAgentOpsEmbeddedPanelMarkup(ui)
  );
}

export function renderAgentOpsEmptyState(ui, options = {}) {
  renderAgentWorkspaceState(ui?.chatContent, options);
}
