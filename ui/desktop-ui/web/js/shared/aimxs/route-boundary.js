function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeTone(value, fallback = "neutral") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (["ok", "warn", "danger", "neutral"].includes(normalized)) {
    return normalized;
  }
  const derived = normalized.replace(/[_\s]+/g, "-");
  if (
    derived.includes("allow") ||
    derived.includes("available") ||
    derived.includes("active") ||
    derived.includes("bounded") ||
    derived.includes("current") ||
    derived.includes("healthy") ||
    derived.includes("primary") ||
    derived.includes("reachable") ||
    derived.includes("ready")
  ) {
    return "ok";
  }
  if (
    derived.includes("block") ||
    derived.includes("deny") ||
    derived.includes("error") ||
    derived.includes("failed") ||
    derived.includes("invalid")
  ) {
    return "danger";
  }
  if (
    derived.includes("approval") ||
    derived.includes("closed") ||
    derived.includes("constrained") ||
    derived.includes("degraded") ||
    derived.includes("limited") ||
    derived.includes("missing") ||
    derived.includes("pending") ||
    derived.includes("review") ||
    derived.includes("watch")
  ) {
    return "warn";
  }
  return fallback;
}

function normalizeFields(fields = []) {
  return (Array.isArray(fields) ? fields : [])
    .map((field) => {
      const label = normalizeString(field?.label);
      const value = normalizeString(field?.value);
      if (!label || !value) {
        return null;
      }
      return {
        label,
        value,
        code: Boolean(field?.code)
      };
    })
    .filter(Boolean);
}

function normalizeSection(section = {}, title = "") {
  const fields = normalizeFields(section?.fields);
  const note = normalizeString(section?.note);
  if (!fields.length && !note) {
    return {
      title: normalizeString(section?.title, title),
      badge: "",
      tone: "neutral",
      fields: [],
      note: ""
    };
  }
  const badge = normalizeString(section?.badge, "neutral");
  return {
    title: normalizeString(section?.title, title),
    badge,
    tone: normalizeTone(section?.tone, normalizeTone(badge)),
    fields,
    note
  };
}

export function createAimxsRouteBoundaryField(label, value, code = false) {
  const normalizedLabel = normalizeString(label);
  const normalizedValue = normalizeString(value);
  if (!normalizedLabel || !normalizedValue) {
    return null;
  }
  return {
    label: normalizedLabel,
    value: normalizedValue,
    code: Boolean(code)
  };
}

export function createAimxsRouteBoundaryModel(input = {}) {
  const routeFields = normalizeFields(input?.routeFields);
  const currentBoundary = normalizeSection(input?.currentBoundary, "Current Boundary");
  const routePosture = normalizeSection(input?.routePosture, "Route Posture");
  const rationale = normalizeSection(input?.rationale, "Allowed Or Constrained");
  const summary = normalizeString(input?.summary);
  const surfaceLabel = normalizeString(input?.surfaceLabel);

  return {
    available: Boolean(
      routeFields.length ||
        currentBoundary.fields.length ||
        routePosture.fields.length ||
        rationale.fields.length ||
        summary
    ),
    summary,
    surfaceLabel,
    routeFields,
    currentBoundary,
    routePosture,
    rationale
  };
}
