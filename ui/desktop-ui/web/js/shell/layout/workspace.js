import {
  activeElementWithin,
  focusElement,
  setSubtreeInert
} from "../../shared/utils/dom.js";

const WORKSPACE_VIEW_ALIASES = {
  home: "companionops",
  homeops: "companionops",
  companion: "companionops",
  agent: "agentops",
  chat: "agentops",
  approvals: "agentops",
  identity: "identityops",
  history: "runtimeops",
  runs: "runtimeops",
  incidents: "incidentops",
  log: "logops",
  logs: "logops",
  settings: "settingsops",
  developer: "developerops",
  operations: "developerops"
};

function normalizeAllowedViewSet(viewIds) {
  const source =
    viewIds instanceof Set
      ? Array.from(viewIds)
      : Array.isArray(viewIds)
        ? viewIds
        : [];
  const normalized = source
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return new Set(normalized.length > 0 ? normalized : ["companionops"]);
}

function normalizeViewToken(value) {
  const requested = String(value || "").trim().toLowerCase();
  return WORKSPACE_VIEW_ALIASES[requested] || requested;
}

export function normalizeWorkspaceView(value, fallback = "companionops", viewIds = []) {
  const allowedViews = normalizeAllowedViewSet(viewIds);
  const requested = normalizeViewToken(value);
  if (allowedViews.has(requested)) {
    return requested;
  }
  const fallbackView = normalizeViewToken(fallback);
  if (allowedViews.has(fallbackView)) {
    return fallbackView;
  }
  return allowedViews.values().next().value || "companionops";
}

export function createWorkspaceLayoutController({ layout, viewIds }) {
  const allowedViews = normalizeAllowedViewSet(viewIds);
  let panels = [];

  function normalizeView(value, fallback = "companionops") {
    return normalizeWorkspaceView(value, fallback, allowedViews);
  }

  function initializePanels() {
    if (!(layout instanceof HTMLElement)) {
      panels = [];
      return panels;
    }
    const existingPanels = Array.from(layout.querySelectorAll(":scope > [data-workspace-panel]"));
    if (existingPanels.length > 0) {
      panels = existingPanels;
      return panels;
    }
    const sectionNodes = Array.from(layout.querySelectorAll(":scope > [data-workspace-section]"));
    const wrappers = new Map();
    for (const view of allowedViews) {
      const panel = document.createElement("section");
      panel.className = "workspace-panel";
      panel.dataset.workspacePanel = view;
      panel.hidden = true;
      wrappers.set(view, panel);
    }
    for (const section of sectionNodes) {
      const view = normalizeView(section?.dataset?.workspaceSection, "");
      const panel = wrappers.get(view);
      if (panel) {
        panel.appendChild(section);
      }
    }
    for (const view of allowedViews) {
      const panel = wrappers.get(view);
      if (panel instanceof HTMLElement) {
        layout.appendChild(panel);
      }
    }
    panels = Array.from(layout.querySelectorAll(":scope > [data-workspace-panel]"));
    return panels;
  }

  function getPanels() {
    return panels.slice();
  }

  function getPanelForView(view) {
    const normalizedView = normalizeView(view, "");
    return panels.find(
      (panel) => normalizeView(panel?.dataset?.workspacePanel, "") === normalizedView
    ) || null;
  }

  function applyView(view, { tabs = [] } = {}) {
    const selectedView = normalizeView(view, "companionops");
    if (layout instanceof HTMLElement) {
      layout.setAttribute("data-workspace-view", selectedView);
    }
    let recoverFocus = false;
    let activeTab = null;
    for (const tab of tabs) {
      if (!(tab instanceof HTMLElement)) {
        continue;
      }
      const tabView = normalizeView(tab?.dataset?.workspaceTab, "");
      const isActive = tabView === selectedView;
      const panel = getPanelForView(tabView);
      if (tabView) {
        tab.id = tab.id || `workspace-tab-${tabView}`;
      }
      if (panel && tabView) {
        panel.id = panel.id || `workspace-panel-${tabView}`;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        tab.setAttribute("aria-controls", panel.id);
      }
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
      if (isActive) {
        activeTab = tab;
      }
    }
    for (const panel of panels) {
      const panelView = normalizeView(panel?.dataset?.workspacePanel, "");
      const isActive = panelView === selectedView;
      if (!isActive && activeElementWithin(panel)) {
        recoverFocus = true;
      }
      panel.hidden = !isActive;
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
      setSubtreeInert(panel, !isActive);
    }
    if (recoverFocus && activeTab instanceof HTMLElement) {
      focusElement(activeTab, { scroll: false });
    }
    return selectedView;
  }

  return {
    normalizeView,
    initializePanels,
    applyView,
    getPanels,
    getPanelForView
  };
}
