export function readSavedJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value || {}));
  } catch (_) {
    // Local storage is optional.
  }
}

export function readSavedValue(key) {
  try {
    return String(window.localStorage.getItem(key) || "").trim();
  } catch (_) {
    return "";
  }
}

export function saveValue(key, value) {
  try {
    window.localStorage.setItem(key, String(value || "").trim());
  } catch (_) {
    // Local storage is optional.
  }
}
