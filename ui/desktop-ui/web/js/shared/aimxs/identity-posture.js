function normalizeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeTone(value, fallback = "neutral") {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (normalized === "ok" || normalized === "warn" || normalized === "danger") {
    return normalized;
  }
  const derived = normalized.replace(/[_\s]+/g, "-");
  if (
    derived.includes("allow") ||
    derived.includes("active") ||
    derived.includes("applied") ||
    derived.includes("authenticated") ||
    derived.includes("current") ||
    derived.includes("ready") ||
    derived.includes("recovered")
  ) {
    return "ok";
  }
  if (
    derived.includes("block") ||
    derived.includes("deny") ||
    derived.includes("error") ||
    derived.includes("failed")
  ) {
    return "danger";
  }
  if (
    derived.includes("constrained") ||
    derived.includes("defer") ||
    derived.includes("pending") ||
    derived.includes("review") ||
    derived.includes("route") ||
    derived.includes("stale") ||
    derived.includes("target") ||
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
      title,
      badge: "",
      tone: "neutral",
      fields: [],
      note: ""
    };
  }
  const badge = normalizeString(section?.badge, "neutral");
  return {
    title,
    badge,
    tone: normalizeTone(section?.tone, normalizeTone(badge)),
    fields,
    note
  };
}

export function createAimxsField(label, value, code = false) {
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

export function inferAimxsAuthorityTierFromRoles(roles = [], fallback = "scoped_operator") {
  const values = (Array.isArray(roles) ? roles : [])
    .map((value) => normalizeString(value).toLowerCase())
    .filter(Boolean);
  if (values.some((value) => value.includes("break_glass"))) {
    return "break_glass_admin";
  }
  if (values.some((value) => value.includes("platform.admin") || value.includes("project_admin") || value.includes("runtime.admin"))) {
    return "project_admin";
  }
  if (values.some((value) => value.includes("supervisor") || value.includes("finance"))) {
    return "approval_gated_supervisor";
  }
  if (values.some((value) => value.includes("operator"))) {
    return "workspace_operator";
  }
  return normalizeString(fallback, "scoped_operator");
}

export function createAimxsIdentityPostureModel(input = {}) {
  const identityFields = normalizeFields(input?.identityFields);
  const identitySectionTitle = normalizeString(input?.identitySectionTitle, "Identity And Authority");
  const currentPosture = normalizeSection(
    input?.currentPosture,
    normalizeString(input?.currentPostureTitle, "Current Posture")
  );
  const targetPosture = normalizeSection(
    input?.targetPosture,
    normalizeString(input?.targetPostureTitle, "Target Posture")
  );
  const rationale = normalizeSection(
    input?.rationale,
    normalizeString(input?.rationaleTitle, "Allowed Or Blocked")
  );
  const summary = normalizeString(input?.summary);
  const surfaceLabel = normalizeString(input?.surfaceLabel);

  return {
    available: Boolean(identityFields.length || currentPosture.fields.length || targetPosture.fields.length || rationale.fields.length || summary),
    summary,
    surfaceLabel,
    identitySectionTitle,
    identityFields,
    currentPosture,
    targetPosture,
    rationale
  };
}
