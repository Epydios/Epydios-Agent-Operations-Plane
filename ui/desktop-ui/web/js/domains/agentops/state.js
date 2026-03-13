export function buildAgentOpsEmbeddedPanelMarkup(ui = {}) {
  return {
    approvalsOverviewMarkup:
      ui?.approvalsContent instanceof HTMLElement ? ui.approvalsContent.innerHTML : "",
    approvalReviewMarkup:
      ui?.approvalsDetailContent instanceof HTMLElement ? ui.approvalsDetailContent.innerHTML : ""
  };
}
