function getFocusableTabCandidates(nodes) {
  return (nodes || []).filter(
    (node) =>
      node instanceof HTMLElement &&
      !node.hidden &&
      node.getAttribute("aria-hidden") !== "true" &&
      !node.classList.contains("advanced-hidden")
  );
}

export function handleHorizontalTabKeydown(event, nodes, readValue, activate) {
  if (!(event.target instanceof HTMLElement)) {
    return false;
  }
  const key = String(event.key || "");
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) {
    return false;
  }
  const tabs = getFocusableTabCandidates(nodes);
  if (tabs.length === 0) {
    return false;
  }
  const currentIndex = Math.max(0, tabs.indexOf(event.target.closest("[role='tab']")));
  let nextIndex = currentIndex;
  if (key === "Home") {
    nextIndex = 0;
  } else if (key === "End") {
    nextIndex = tabs.length - 1;
  } else if (key === "ArrowLeft" || key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (key === "ArrowRight" || key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % tabs.length;
  }
  const nextTab = tabs[nextIndex];
  if (!(nextTab instanceof HTMLElement)) {
    return false;
  }
  event.preventDefault();
  const requested = readValue(nextTab);
  if (requested) {
    activate(requested);
  }
  nextTab.focus({ preventScroll: true });
  return true;
}
