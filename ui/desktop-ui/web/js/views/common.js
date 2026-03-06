export function escapeHTML(value) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function chipClassForStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (
    normalized === "ok" ||
    normalized === "pass" ||
    normalized === "ready" ||
    normalized === "allow" ||
    normalized === "completed" ||
    normalized === "true"
  ) {
    return "chip chip-ok";
  }
  if (
    normalized === "warn" ||
    normalized === "unknown" ||
    normalized === "pending" ||
    normalized === "policy_evaluated"
  ) {
    return "chip chip-warn";
  }
  return "chip chip-danger";
}

export function formatTime(value) {
  if (!value) {
    return "-";
  }
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) {
    return value;
  }
  return t.toISOString();
}

export function containsCaseInsensitive(value, needle) {
  const n = String(needle || "").trim().toLowerCase();
  if (!n) {
    return true;
  }
  return String(value || "").toLowerCase().includes(n);
}

export function parseTimeMs(value) {
  const ts = new Date(value || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function parseBound(value) {
  if (!value) {
    return 0;
  }
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function normalizeTimeRange(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "1h" || normalized === "24h" || normalized === "7d" || normalized === "30d") {
    return normalized;
  }
  if (normalized === "custom") {
    return "custom";
  }
  return "";
}

export function resolveTimeBounds(rangeValue, fromValue, toValue, nowMs = Date.now()) {
  const range = normalizeTimeRange(rangeValue);
  let fromMs = 0;
  let toMs = 0;

  if (range === "1h") {
    fromMs = nowMs - 60 * 60 * 1000;
    toMs = nowMs;
  } else if (range === "24h") {
    fromMs = nowMs - 24 * 60 * 60 * 1000;
    toMs = nowMs;
  } else if (range === "7d") {
    fromMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    toMs = nowMs;
  } else if (range === "30d") {
    fromMs = nowMs - 30 * 24 * 60 * 60 * 1000;
    toMs = nowMs;
  } else {
    fromMs = parseBound(fromValue);
    toMs = parseBound(toValue);
  }

  if (!fromMs && !toMs) {
    return null;
  }
  if (fromMs && toMs && fromMs > toMs) {
    return { fromMs: toMs, toMs: fromMs };
  }
  return { fromMs, toMs };
}

export function withinTimeBounds(value, bounds) {
  if (!bounds) {
    return true;
  }
  const ts = parseTimeMs(value);
  if (ts <= 0) {
    return false;
  }
  if (bounds.fromMs && ts < bounds.fromMs) {
    return false;
  }
  if (bounds.toMs && ts > bounds.toMs) {
    return false;
  }
  return true;
}

export function parsePositiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

export function paginateItems(items, pageSize, page) {
  const list = Array.isArray(items) ? items : [];
  const safePageSize = parsePositiveInt(pageSize, 25, 1, 500);
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = parsePositiveInt(page, 1, 1, totalPages);
  const offset = (safePage - 1) * safePageSize;
  return {
    items: list.slice(offset, offset + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages
  };
}
