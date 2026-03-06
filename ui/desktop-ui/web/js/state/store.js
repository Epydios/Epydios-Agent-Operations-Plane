function buildRunIndex(items) {
  const index = {};
  for (const item of items || []) {
    if (item?.runId) {
      index[item.runId] = item;
    }
  }
  return index;
}

function buildApprovalIndex(items) {
  const index = {};
  for (const item of items || []) {
    const key = String(item?.runId || item?.approvalId || "").trim();
    if (key) {
      index[key] = item;
    }
  }
  return index;
}

export function createAppStore(seed = {}) {
  let state = {
    runIndex: {},
    approvalIndex: {},
    terminalHistory: [],
    incidentPackageHistory: [],
    runtimeChoices: null,
    ...seed
  };

  const listeners = new Set();

  function emit() {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (_) {
        // Listeners must not break the store update path.
      }
    }
  }

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    patch(patch) {
      state = { ...state, ...(patch || {}) };
      emit();
      return state;
    },
    setRunItems(items) {
      state = { ...state, runIndex: buildRunIndex(items) };
      emit();
      return state.runIndex;
    },
    setApprovalItems(items) {
      state = { ...state, approvalIndex: buildApprovalIndex(items) };
      emit();
      return state.approvalIndex;
    },
    setTerminalHistory(items) {
      const list = Array.isArray(items) ? items.slice(0, 20) : [];
      state = { ...state, terminalHistory: list };
      emit();
      return state.terminalHistory;
    },
    addTerminalHistoryEntry(entry) {
      const next = [entry, ...(Array.isArray(state.terminalHistory) ? state.terminalHistory : [])].slice(0, 20);
      state = { ...state, terminalHistory: next };
      emit();
      return state.terminalHistory;
    },
    getTerminalHistory() {
      return Array.isArray(state.terminalHistory) ? state.terminalHistory : [];
    },
    getTerminalHistoryById(historyId) {
      const id = String(historyId || "").trim();
      if (!id) {
        return null;
      }
      const items = Array.isArray(state.terminalHistory) ? state.terminalHistory : [];
      return items.find((item) => String(item?.id || "").trim() === id) || null;
    },
    setIncidentPackageHistory(items) {
      const list = Array.isArray(items) ? items.slice(0, 20) : [];
      state = { ...state, incidentPackageHistory: list };
      emit();
      return state.incidentPackageHistory;
    },
    addIncidentPackageHistoryEntry(entry) {
      const next = [entry, ...(Array.isArray(state.incidentPackageHistory) ? state.incidentPackageHistory : [])].slice(0, 20);
      state = { ...state, incidentPackageHistory: next };
      emit();
      return state.incidentPackageHistory;
    },
    upsertIncidentPackageHistoryEntry(entry) {
      const candidate = entry && typeof entry === "object" ? entry : null;
      const id = String(candidate?.id || "").trim();
      if (!id) {
        return this.getIncidentPackageHistory();
      }
      const existing = Array.isArray(state.incidentPackageHistory) ? state.incidentPackageHistory : [];
      const filtered = existing.filter((item) => String(item?.id || "").trim() !== id);
      const next = [candidate, ...filtered].slice(0, 20);
      state = { ...state, incidentPackageHistory: next };
      emit();
      return state.incidentPackageHistory;
    },
    updateIncidentPackageHistoryEntry(entryId, patch) {
      const id = String(entryId || "").trim();
      if (!id) {
        return null;
      }
      const updates = patch && typeof patch === "object" ? patch : {};
      const existing = Array.isArray(state.incidentPackageHistory) ? state.incidentPackageHistory : [];
      let updatedEntry = null;
      const next = existing.map((item) => {
        if (String(item?.id || "").trim() !== id) {
          return item;
        }
        updatedEntry = { ...item, ...updates };
        return updatedEntry;
      });
      state = { ...state, incidentPackageHistory: next };
      emit();
      return updatedEntry;
    },
    getIncidentPackageHistory() {
      return Array.isArray(state.incidentPackageHistory) ? state.incidentPackageHistory : [];
    },
    getIncidentPackageHistoryById(entryId) {
      const id = String(entryId || "").trim();
      if (!id) {
        return null;
      }
      const items = Array.isArray(state.incidentPackageHistory) ? state.incidentPackageHistory : [];
      return items.find((item) => String(item?.id || "").trim() === id) || null;
    },
    getRunById(runID) {
      return state.runIndex[runID];
    },
    getApprovalByRunID(runID) {
      return state.approvalIndex[runID];
    }
  };
}
