import { buildGovernedExportSelectionState } from "./governance-report.js";

function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

export function buildDesktopGovernedExportOptions(
  exportProfile,
  audience,
  reportType = "export",
  clientSurface = "desktop",
  exportProfileCatalog = null,
  retentionClass = ""
) {
  const normalizedSurface = normalizedString(clientSurface, "desktop");
  const normalizedReportType = normalizedString(reportType, "export");
  if (normalizedSurface.toLowerCase() !== "desktop") {
    return {
      exportProfile: normalizedString(exportProfile),
      audience: normalizedString(audience),
      retentionClass: normalizedString(retentionClass),
      reportType: normalizedReportType,
      clientSurface: normalizedSurface,
      exportProfileCatalog
    };
  }
  const selection = buildGovernedExportSelectionState({
    clientSurface: normalizedSurface,
    reportType: normalizedReportType,
    exportProfileCatalog,
    exportProfile: normalizedString(exportProfile),
    audience: normalizedString(audience),
    retentionClass: normalizedString(retentionClass)
  });
  return {
    exportProfile: normalizedString(selection.exportProfile),
    audience: normalizedString(selection.audience),
    retentionClass: normalizedString(selection.retentionClass),
    reportType: normalizedReportType,
    clientSurface: normalizedSurface,
    exportProfileCatalog
  };
}

export function describeGovernedExportDisposition(result = {}) {
  const exportProfile = normalizedString(result?.exportProfile);
  const audience = normalizedString(result?.audience);
  const retentionClass = normalizedString(result?.retentionClass);
  if (!exportProfile && !audience && !retentionClass) {
    return "";
  }
  const suffix = [];
  const decisionBindings = Array.isArray(result?.decisionBindingLabels) ? result.decisionBindingLabels.length : 0;
  const directorySyncMappings = Array.isArray(result?.directorySyncMappings) ? result.directorySyncMappings.length : 0;
  const exceptionProfiles = Array.isArray(result?.exceptionProfileLabels) ? result.exceptionProfileLabels.length : 0;
  const overlayProfiles = Array.isArray(result?.overlayProfileLabels) ? result.overlayProfileLabels.length : 0;
  if (decisionBindings > 0) {
    suffix.push(`decisionBindings=${decisionBindings}`);
  }
  if (directorySyncMappings > 0) {
    suffix.push(`directoryMappings=${directorySyncMappings}`);
  }
  if (exceptionProfiles > 0) {
    suffix.push(`exceptionProfiles=${exceptionProfiles}`);
  }
  if (overlayProfiles > 0) {
    suffix.push(`overlayProfiles=${overlayProfiles}`);
  }
  return ` Governed disposition profile=${exportProfile || "-"}; audience=${audience || "-"}; retention=${retentionClass || "-"}.${suffix.length > 0 ? ` Org admin overlays ${suffix.join("; ")}.` : ""}`;
}

export function describeGovernedExportRedactions(result = {}, noun = "export") {
  const count = Number(result?.redactionCount || 0) || 0;
  if (count <= 0) {
    return "";
  }
  return ` DLP redactions=${count}; review the governed ${noun} before external sharing.`;
}
