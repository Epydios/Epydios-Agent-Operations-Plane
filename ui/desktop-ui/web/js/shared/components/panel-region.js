export function initializePanelRegions(root = document) {
  const panels = Array.from(root.querySelectorAll(".panel"));
  let headingCounter = 0;
  for (const panel of panels) {
    if (!(panel instanceof HTMLElement)) {
      continue;
    }
    const heading =
      panel.querySelector(".panel-header h2, .panel-heading h2, h2") ||
      panel.querySelector(".title");
    if (!(heading instanceof HTMLElement)) {
      continue;
    }
    headingCounter += 1;
    heading.id = heading.id || `panel-heading-${headingCounter}`;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-labelledby", heading.id);
  }
}
