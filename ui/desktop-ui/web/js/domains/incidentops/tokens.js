export function buildTimestampToken(value = new Date().toISOString()) {
  return String(value || new Date().toISOString())
    .trim()
    .replace(/[-:.]/g, "")
    .replace(/Z$/, "Z");
}
