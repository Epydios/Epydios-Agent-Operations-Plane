export function createWorkspaceNavController({
  tabs,
  normalizeView,
  activateView,
  onKeydown
}) {
  const tabNodes = Array.isArray(tabs) ? tabs.filter((tab) => tab instanceof HTMLElement) : [];

  function bind() {
    for (const tab of tabNodes) {
      tab.addEventListener("click", () => {
        const requested = normalizeView(tab?.dataset?.workspaceTab, "");
        if (requested) {
          activateView(requested);
        }
      });
      tab.addEventListener("keydown", (event) => {
        onKeydown(
          event,
          tabNodes,
          (node) => normalizeView(node?.dataset?.workspaceTab, ""),
          (requested) => activateView(normalizeView(requested, "home"))
        );
      });
    }
  }

  function getTabs() {
    return tabNodes.slice();
  }

  return {
    bind,
    getTabs
  };
}
