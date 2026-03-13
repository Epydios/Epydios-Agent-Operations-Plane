const DEFAULT_LOADING_DELAY_MS = 750;

export function createRefreshStatusController(element, { loadingDelayMs = DEFAULT_LOADING_DELAY_MS } = {}) {
  let loadingTimer = 0;

  function setStatus(tone, detail = "") {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    const state = String(tone || "").trim().toLowerCase();
    let chipClass = "chip chip-neutral chip-compact";
    if (state === "ok") {
      chipClass = "chip chip-ok chip-compact";
    } else if (state === "warn" || state === "loading") {
      chipClass = "chip chip-warn chip-compact";
    } else if (state === "error") {
      chipClass = "chip chip-danger chip-compact";
    }
    const text = String(detail || "").trim();
    element.className = chipClass;
    element.textContent = text ? `Data: ${text}` : "Data: idle";
  }

  function clearLoadingTimer() {
    if (!loadingTimer) {
      return;
    }
    window.clearTimeout(loadingTimer);
    loadingTimer = 0;
  }

  function scheduleLoading(detail = "refreshing", shouldDisplay = true) {
    clearLoadingTimer();
    loadingTimer = window.setTimeout(() => {
      loadingTimer = 0;
      const show = typeof shouldDisplay === "function" ? shouldDisplay() : Boolean(shouldDisplay);
      if (show) {
        setStatus("loading", detail);
      }
    }, loadingDelayMs);
  }

  return {
    setStatus,
    clearLoadingTimer,
    scheduleLoading
  };
}
