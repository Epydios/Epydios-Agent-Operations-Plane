function replaceAgentSlotWithMarkup(slot, markup) {
  if (!(slot instanceof HTMLElement)) {
    return;
  }
  const template = document.createElement("template");
  template.innerHTML = String(markup || "").trim();
  const nodes = Array.from(template.content.childNodes).filter((node) => {
    return !(node.nodeType === Node.TEXT_NODE && !String(node.textContent || "").trim());
  });
  if (nodes.length === 0) {
    slot.replaceWith();
    return;
  }
  slot.replaceWith(...nodes);
}

export function mountAgentApprovalSlots(root, panelMarkup = {}) {
  if (!(root instanceof HTMLElement)) {
    return;
  }
  const approvalsOverviewSlot = root.querySelector("[data-agent-approvals-overview]");
  const approvalsReviewSlot = root.querySelector("[data-agent-approval-review]");
  if (approvalsOverviewSlot instanceof HTMLElement) {
    replaceAgentSlotWithMarkup(
      approvalsOverviewSlot,
      panelMarkup.approvalsOverviewMarkup || ""
    );
  }
  if (approvalsReviewSlot instanceof HTMLElement) {
    replaceAgentSlotWithMarkup(
      approvalsReviewSlot,
      panelMarkup.approvalReviewMarkup || ""
    );
  }
}
