export function escapeHTML(value) {
  return String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function displayAimxsModeLabel(value) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "oss-only") {
    return "baseline";
  }
  if (normalized === "aimxs-full") {
    return "local-provider";
  }
  if (normalized === "aimxs-https") {
    return "secure-provider";
  }
  return raw || "-";
}

export function displayPolicyProviderLabel(value) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "oss-policy-opa" || normalized === "oss-only") {
    return "baseline";
  }
  if (normalized.includes("aimxs")) {
    return "routed-provider";
  }
  return raw || "-";
}

export function chipClassForStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (
    normalized === "ok" ||
    normalized === "pass" ||
    normalized === "ready" ||
    normalized === "allow" ||
    normalized === "approve" ||
    normalized === "approved" ||
    normalized === "accept" ||
    normalized === "accepted" ||
    normalized === "cleared" ||
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "true"
  ) {
    return "chip chip-ok";
  }
  if (
    normalized === "warn" ||
    normalized === "warning" ||
    normalized === "unknown" ||
    normalized === "pending" ||
    normalized === "policy_evaluated" ||
    normalized === "defer" ||
    normalized === "deferred"
  ) {
    return "chip chip-warn";
  }
  return "chip chip-danger";
}

function normalizePanelStateTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  if (
    tone === "loading" ||
    tone === "empty" ||
    tone === "error" ||
    tone === "success" ||
    tone === "warn" ||
    tone === "info"
  ) {
    return tone;
  }
  return "info";
}

function panelStateLabel(tone) {
  if (tone === "loading") {
    return "Loading";
  }
  if (tone === "empty") {
    return "Empty";
  }
  if (tone === "error") {
    return "Error";
  }
  if (tone === "success") {
    return "Success";
  }
  if (tone === "warn") {
    return "Warning";
  }
  return "Info";
}

function panelStateChipClass(tone) {
  if (tone === "success") {
    return "chip chip-ok chip-compact";
  }
  if (tone === "error") {
    return "chip chip-danger chip-compact";
  }
  if (tone === "loading" || tone === "warn") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function defaultPanelStateNextStep(tone) {
  if (tone === "loading") {
    return "Next step: wait for refresh to finish, then confirm scope, counts, and latest timestamps.";
  }
  if (tone === "empty") {
    return "Next step: widen scope or clear filters. If data should exist, refresh and verify upstream runtime or endpoint health.";
  }
  if (tone === "error") {
    return "Next step: retry once, then verify scope, endpoint health, and upstream runtime state before proceeding.";
  }
  if (tone === "warn") {
    return "Next step: confirm scope and source, then continue only if the warning matches operator intent.";
  }
  return "";
}

export function renderPanelStateMetric(state, title, message, detail = "") {
  const tone = normalizePanelStateTone(state);
  const label = panelStateLabel(tone);
  const chipClass = panelStateChipClass(tone);
  const safeTitle = String(title || "").trim() || "Status";
  const safeMessage = String(message || "").trim() || "-";
  const safeDetail = String(detail || "").trim() || defaultPanelStateNextStep(tone);
  return `
    <div class="metric panel-state panel-state-${escapeHTML(tone)}">
      <div class="title">${escapeHTML(safeTitle)}</div>
      <div class="meta"><span class="${chipClass}">${escapeHTML(label)}</span></div>
      <div class="meta">${escapeHTML(safeMessage)}</div>
      ${safeDetail ? `<div class="meta panel-state-next">${escapeHTML(safeDetail)}</div>` : ""}
    </div>
  `;
}

function traceabilityChipClass(tone) {
  const normalized = String(tone || "").trim().toLowerCase();
  if (normalized === "ok" || normalized === "success") {
    return "chip chip-ok chip-compact";
  }
  if (normalized === "warn" || normalized === "warning") {
    return "chip chip-warn chip-compact";
  }
  if (normalized === "danger" || normalized === "error") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

export function renderTraceabilityChips(entries = []) {
  const items = Array.isArray(entries) ? entries : [];
  return items
    .map((entry) => {
      const label = String(entry?.label || "").trim();
      if (!label) {
        return "";
      }
      const value = String(entry?.value || "").trim() || "-";
      return `<span class="${traceabilityChipClass(entry?.tone)}">${escapeHTML(label)}=${escapeHTML(value)}</span>`;
    })
    .filter(Boolean)
    .join("");
}

export function renderTraceabilityMetric(title, entries = [], note = "", lines = []) {
  const chips = renderTraceabilityChips(entries);
  const safeTitle = String(title || "").trim() || "Traceability";
  const safeNote = String(note || "").trim();
  const extraLines = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  return `
    <div class="metric traceability-metric">
      <div class="title">${escapeHTML(safeTitle)}</div>
      ${safeNote ? `<div class="meta metric-note">${escapeHTML(safeNote)}</div>` : ""}
      ${chips ? `<div class="run-detail-chips">${chips}</div>` : ""}
      ${extraLines.map((line) => `<div class="meta">${escapeHTML(line)}</div>`).join("")}
    </div>
  `;
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
