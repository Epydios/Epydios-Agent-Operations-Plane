export function createWorkspaceNavController({
  tabs,
  modes,
  normalizeView,
  normalizeMode,
  activateView,
  activateMode,
  onKeydown
}) {
  const tabNodes = Array.isArray(tabs) ? tabs.filter((tab) => tab instanceof HTMLElement) : [];
  const modeNodes = Array.isArray(modes) ? modes.filter((mode) => mode instanceof HTMLElement) : [];

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
    for (const mode of modeNodes) {
      mode.addEventListener("click", () => {
        const requested = normalizeMode(mode?.dataset?.workspaceMode, "");
        if (requested) {
          activateMode(requested);
        }
      });
      mode.addEventListener("keydown", (event) => {
        onKeydown(
          event,
          modeNodes,
          (node) => normalizeMode(node?.dataset?.workspaceMode, ""),
          (requested) => activateMode(normalizeMode(requested, "companion"))
        );
      });
    }
  }

  function getTabs() {
    return tabNodes.slice();
  }

  function getModes() {
    return modeNodes.slice();
  }

  return {
    bind,
    getTabs,
    getModes
  };
}
