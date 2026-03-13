export function initializeShellLiveRegions({ liveNodes = [], handoffPreview = null } = {}) {
  for (const node of liveNodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", node.getAttribute("aria-live") || "polite");
    node.setAttribute("aria-atomic", "true");
  }
  if (handoffPreview instanceof HTMLElement) {
    handoffPreview.setAttribute("role", "region");
    handoffPreview.setAttribute("aria-label", "Audit and incident handoff preview");
    handoffPreview.setAttribute("aria-live", "polite");
    handoffPreview.setAttribute("aria-atomic", "true");
  }
}
