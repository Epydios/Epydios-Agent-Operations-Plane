export function createTopbarController({ titleElement, subtitleElement }) {
  function setBrand({ title = "", subtitle = "" } = {}) {
    if (titleElement instanceof HTMLElement) {
      titleElement.textContent = String(title || "").trim() || "EpydiosOps Desktop";
    }
    if (subtitleElement instanceof HTMLElement) {
      subtitleElement.textContent = String(subtitle || "").trim() || "unknown environment";
    }
  }

  return {
    setBrand
  };
}
