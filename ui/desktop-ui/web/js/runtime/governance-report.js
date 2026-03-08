function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function sanitizeLines(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizedString(item))
    .filter(Boolean);
}

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{12,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g
];

function redactStringWithCount(value, count = 0) {
  let redacted = String(value || "");
  let total = count;
  for (const pattern of SENSITIVE_PATTERNS) {
    const matches = redacted.match(pattern);
    if (!matches || matches.length === 0) {
      continue;
    }
    total += matches.length;
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return { value: redacted, count: total };
}

function redactLinesWithCount(lines = [], count = 0) {
  let total = count;
  const items = sanitizeLines(lines).map((line) => {
    const result = redactStringWithCount(line, total);
    total = result.count;
    return result.value;
  });
  return { value: items, count: total };
}

function sanitizeStructuredValue(value, state = { count: 0 }) {
  if (typeof value === "string") {
    const result = redactStringWithCount(value, state.count);
    state.count = result.count;
    return result.value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredValue(item, state));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, sanitizeStructuredValue(entryValue, state)])
    );
  }
  return value;
}

function sortedUnique(items = []) {
  return Array.from(new Set(sanitizeLines(items))).sort((a, b) => a.localeCompare(b));
}

function filterCapabilityItems(catalog = {}, subject = {}) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const filtered = items.filter((item) => {
    const executionMode = normalizedString(subject.executionMode).toLowerCase();
    const workerType = normalizedString(subject.workerType).toLowerCase();
    const adapterId = normalizedString(subject.workerAdapterId).toLowerCase();
    if (executionMode && normalizedString(item?.executionMode).toLowerCase() !== executionMode) {
      return false;
    }
    if (workerType && normalizedString(item?.workerType).toLowerCase() !== workerType) {
      return false;
    }
    if (adapterId && normalizedString(item?.adapterId).toLowerCase() !== adapterId) {
      return false;
    }
    return true;
  });
  return filtered.length > 0 ? filtered : (normalizedString(subject.executionMode) || normalizedString(subject.workerType) || normalizedString(subject.workerAdapterId) ? [] : items);
}

function filterPolicyItems(catalog = {}, subject = {}) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const executionMode = normalizedString(subject.executionMode).toLowerCase();
  const workerType = normalizedString(subject.workerType).toLowerCase();
  const adapterId = normalizedString(subject.workerAdapterId).toLowerCase();
  const clientSurface = normalizedString(subject.clientSurface).toLowerCase();
  const filtered = items.filter((item) => {
    const surfaces = Array.isArray(item?.clientSurfaces) ? item.clientSurfaces.map((entry) => normalizedString(entry).toLowerCase()) : [];
    const executionModes = Array.isArray(item?.applicableExecutionModes) ? item.applicableExecutionModes.map((entry) => normalizedString(entry).toLowerCase()) : [];
    const workerTypes = Array.isArray(item?.applicableWorkerTypes) ? item.applicableWorkerTypes.map((entry) => normalizedString(entry).toLowerCase()) : [];
    const adapterIds = Array.isArray(item?.applicableAdapterIDs) ? item.applicableAdapterIDs.map((entry) => normalizedString(entry).toLowerCase()) : [];
    if (clientSurface && surfaces.length > 0 && !surfaces.includes(clientSurface)) {
      return false;
    }
    if (executionMode && executionModes.length > 0 && !executionModes.includes(executionMode)) {
      return false;
    }
    if (workerType && workerTypes.length > 0 && !workerTypes.includes(workerType)) {
      return false;
    }
    if (adapterId && adapterIds.length > 0 && !adapterIds.includes(adapterId)) {
      return false;
    }
    return true;
  });
  return filtered.length > 0 ? filtered : items.filter((item) => {
    const surfaces = Array.isArray(item?.clientSurfaces) ? item.clientSurfaces.map((entry) => normalizedString(entry).toLowerCase()) : [];
    return !clientSurface || surfaces.length === 0 || surfaces.includes(clientSurface);
  });
}

function filterOrgAdminItems(catalog = {}, subject = {}) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const profileId = normalizedString(subject.orgAdminProfileId).toLowerCase();
  const organizationModel = normalizedString(subject.organizationModel).toLowerCase();
  const roleBundle = normalizedString(subject.orgAdminRoleBundle).toLowerCase();
  const clientSurface = normalizedString(subject.clientSurface).toLowerCase();
  const filtered = items.filter((item) => {
    if (profileId && normalizedString(item?.profileId).toLowerCase() !== profileId) {
      return false;
    }
    if (organizationModel && normalizedString(item?.organizationModel).toLowerCase() !== organizationModel) {
      return false;
    }
    if (roleBundle) {
      const bundles = [
        ...(Array.isArray(item?.adminRoleBundles) ? item.adminRoleBundles : []),
        ...(Array.isArray(item?.delegatedAdminRoleBundles) ? item.delegatedAdminRoleBundles : []),
        ...(Array.isArray(item?.breakGlassRoleBundles) ? item.breakGlassRoleBundles : [])
      ].map((entry) => normalizedString(entry).toLowerCase());
      if (bundles.length > 0 && !bundles.includes(roleBundle)) {
        return false;
      }
    }
    const surfaces = Array.isArray(item?.clientSurfaces) ? item.clientSurfaces.map((entry) => normalizedString(entry).toLowerCase()) : [];
    if (clientSurface && surfaces.length > 0 && !surfaces.includes(clientSurface)) {
      return false;
    }
    return true;
  });
  return filtered.length > 0 ? filtered : items;
}

function defaultExportProfileCatalog() {
  return {
    items: [
      {
        exportProfile: "operator_review",
        label: "Operator Review",
        reportTypes: ["review", "report"],
        defaultAudience: "operator",
        allowedAudiences: ["operator", "security_review", "exec_review"],
        defaultRetentionClass: "standard",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: { security_review: "archive", exec_review: "archive" },
        clientSurfaces: ["chat", "vscode", "cli"],
        deliveryChannels: ["copy", "download", "report"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "operator_follow",
        label: "Operator Follow",
        reportTypes: ["delta-report", "follow"],
        defaultAudience: "operator",
        allowedAudiences: ["operator", "security_review"],
        defaultRetentionClass: "short",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { security_review: "standard" },
        clientSurfaces: ["chat", "vscode", "cli"],
        deliveryChannels: ["stream", "report"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "workflow_review",
        label: "Workflow Review",
        reportTypes: ["review", "report"],
        defaultAudience: "workflow_operator",
        allowedAudiences: ["workflow_operator", "security_review", "ticket_reviewer"],
        defaultRetentionClass: "standard",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: { security_review: "archive" },
        clientSurfaces: ["workflow"],
        deliveryChannels: ["comment", "update", "report"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "workflow_follow",
        label: "Workflow Follow",
        reportTypes: ["delta-report", "follow"],
        defaultAudience: "workflow_operator",
        allowedAudiences: ["workflow_operator", "ticket_reviewer"],
        defaultRetentionClass: "short",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { ticket_reviewer: "standard" },
        clientSurfaces: ["workflow"],
        deliveryChannels: ["update", "comment", "stream"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "conversation_review",
        label: "Conversation Review",
        reportTypes: ["review", "report"],
        defaultAudience: "conversation_operator",
        allowedAudiences: ["conversation_operator", "security_review", "channel_reviewer"],
        defaultRetentionClass: "standard",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: { security_review: "archive" },
        clientSurfaces: ["chatops"],
        deliveryChannels: ["update", "thread_reply", "report"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "conversation_follow",
        label: "Conversation Follow",
        reportTypes: ["delta-report", "follow"],
        defaultAudience: "conversation_operator",
        allowedAudiences: ["conversation_operator", "channel_reviewer"],
        defaultRetentionClass: "short",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { channel_reviewer: "standard" },
        clientSurfaces: ["chatops"],
        deliveryChannels: ["update", "thread_reply", "stream"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "audit_export",
        label: "Audit Export",
        reportTypes: ["export", "handoff"],
        defaultAudience: "downstream_review",
        allowedAudiences: ["downstream_review", "security_review", "compliance_review"],
        defaultRetentionClass: "archive",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: {
          downstream_review: "standard",
          security_review: "archive",
          compliance_review: "archive"
        },
        clientSurfaces: ["desktop"],
        deliveryChannels: ["download", "copy", "preview"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "audit_handoff",
        label: "Audit Handoff",
        reportTypes: ["handoff"],
        defaultAudience: "downstream_review",
        allowedAudiences: ["downstream_review", "security_review"],
        defaultRetentionClass: "short",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { security_review: "standard" },
        clientSurfaces: ["desktop"],
        deliveryChannels: ["copy", "preview"],
        redactionMode: "text"
      },
      {
        exportProfile: "incident_export",
        label: "Incident Export",
        reportTypes: ["export", "handoff"],
        defaultAudience: "incident_response",
        allowedAudiences: ["incident_response", "security_review", "executive_incident_review"],
        defaultRetentionClass: "archive",
        allowedRetentionClasses: ["standard", "archive"],
        audienceRetentionClassOverlays: {
          incident_response: "standard",
          security_review: "archive",
          executive_incident_review: "archive"
        },
        clientSurfaces: ["desktop"],
        deliveryChannels: ["download", "copy", "preview"],
        redactionMode: "structured_and_text"
      },
      {
        exportProfile: "incident_handoff",
        label: "Incident Handoff",
        reportTypes: ["handoff"],
        defaultAudience: "incident_response",
        allowedAudiences: ["incident_response", "security_review"],
        defaultRetentionClass: "standard",
        allowedRetentionClasses: ["short", "standard"],
        audienceRetentionClassOverlays: { security_review: "standard" },
        clientSurfaces: ["desktop"],
        deliveryChannels: ["copy", "preview"],
        redactionMode: "text"
      }
    ]
  };
}

function catalogItems(catalog = {}) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  return items.length > 0 ? items : defaultExportProfileCatalog().items;
}

function filterExportProfileItems(catalog = {}, subject = {}, disposition = {}) {
  const items = catalogItems(catalog);
  const clientSurface = normalizedString(disposition.clientSurface || subject.clientSurface).toLowerCase();
  const reportType = normalizedString(disposition.reportType || subject.reportType, "report").toLowerCase();
  const exportProfile = normalizedString(disposition.exportProfile || subject.exportProfile).toLowerCase();
  const audience = normalizedString(disposition.audience || subject.audience).toLowerCase();
  const retentionClass = normalizedString(disposition.retentionClass || subject.retentionClass).toLowerCase();
  const filtered = items.filter((item) => {
    const profiles = normalizedString(item?.exportProfile).toLowerCase();
    const surfaces = Array.isArray(item?.clientSurfaces) ? item.clientSurfaces.map((entry) => normalizedString(entry).toLowerCase()) : [];
    const reportTypes = Array.isArray(item?.reportTypes) ? item.reportTypes.map((entry) => normalizedString(entry).toLowerCase()) : [];
    const allowedAudiences = sortedUnique([
      normalizedString(item?.defaultAudience).toLowerCase(),
      ...(Array.isArray(item?.allowedAudiences) ? item.allowedAudiences.map((entry) => normalizedString(entry).toLowerCase()) : [])
    ]);
    const allowedRetention = sortedUnique([
      normalizedString(item?.defaultRetentionClass).toLowerCase(),
      ...(Array.isArray(item?.allowedRetentionClasses) ? item.allowedRetentionClasses.map((entry) => normalizedString(entry).toLowerCase()) : []),
      ...Object.values(item?.audienceRetentionClassOverlays || {}).map((entry) => normalizedString(entry).toLowerCase())
    ]);
    if (exportProfile && profiles && profiles !== exportProfile) {
      return false;
    }
    if (clientSurface && surfaces.length > 0 && !surfaces.includes(clientSurface)) {
      return false;
    }
    if (reportType && reportTypes.length > 0 && !reportTypes.includes(reportType)) {
      return false;
    }
    if (audience && allowedAudiences.length > 0 && !allowedAudiences.includes(audience)) {
      return false;
    }
    if (retentionClass && allowedRetention.length > 0 && !allowedRetention.includes(retentionClass)) {
      return false;
    }
    return true;
  });
  return filtered.length > 0 ? filtered : items.filter((item) => {
    const surfaces = Array.isArray(item?.clientSurfaces) ? item.clientSurfaces.map((entry) => normalizedString(entry).toLowerCase()) : [];
    return !clientSurface || surfaces.length === 0 || surfaces.includes(clientSurface);
  });
}

function combineCatalogFields(items = [], fieldName) {
  return sortedUnique(items.flatMap((item) => (Array.isArray(item?.[fieldName]) ? item[fieldName] : [])));
}

function renderCapabilityLabels(items = []) {
  return items.map((item) => {
    const label = normalizedString(item?.label, normalizedString(item?.adapterId, normalizedString(item?.workerType, "worker")));
    const detail = [normalizedString(item?.provider), normalizedString(item?.transport), normalizedString(item?.model)]
      .filter(Boolean)
      .join(" | ");
    return detail ? `${label}: ${detail}` : label;
  });
}

function renderPolicyPackLabels(items = []) {
  return items.map((item) => {
    const packId = normalizedString(item?.packId, "policy-pack");
    const label = normalizedString(item?.label, packId);
    return `${packId}: ${label}`;
  });
}

function renderExportProfileLabels(items = []) {
  return items.map((item) => {
    const exportProfile = normalizedString(item?.exportProfile, "export-profile");
    const label = normalizedString(item?.label, exportProfile);
    return `${exportProfile}: ${label}`;
  });
}

function renderOrgAdminLabels(items = []) {
  return items.map((item) => {
    const profileId = normalizedString(item?.profileId, "org-admin-profile");
    const label = normalizedString(item?.label, profileId);
    return `${profileId}: ${label}`;
  });
}

function renderOrgAdminEnforcementProfiles(items = []) {
  return sortedUnique(items.flatMap((item) =>
    (Array.isArray(item?.enforcementProfiles) ? item.enforcementProfiles : []).map((profile) => {
      const parts = [normalizedString(profile?.label, normalizedString(profile?.hookId, "org-admin-enforcement"))];
      if (normalizedString(profile?.category)) {
        parts.push(`category=${normalizedString(profile.category)}`);
      }
      if (normalizedString(profile?.enforcementMode)) {
        parts.push(`mode=${normalizedString(profile.enforcementMode)}`);
      }
      const roleBundles = Array.isArray(profile?.roleBundles) ? sanitizeLines(profile.roleBundles) : [];
      if (roleBundles.length > 0) {
        parts.push(`roles=${roleBundles.join(",")}`);
      }
      const requiredInputs = Array.isArray(profile?.requiredInputs) ? sanitizeLines(profile.requiredInputs) : [];
      if (requiredInputs.length > 0) {
        parts.push(`inputs=${requiredInputs.join(",")}`);
      }
      return parts.join(" | ");
    })
  ));
}

function renderOrgAdminDecisionBindings(items = []) {
  return sortedUnique(items.flatMap((item) =>
    (Array.isArray(item?.decisionBindings) ? item.decisionBindings : []).map((binding) => {
      const parts = [normalizedString(binding?.label, normalizedString(binding?.bindingId, "org-admin-binding"))];
      if (normalizedString(binding?.category)) {
        parts.push(`category=${normalizedString(binding.category)}`);
      }
      if (normalizedString(binding?.bindingMode)) {
        parts.push(`mode=${normalizedString(binding.bindingMode)}`);
      }
      const hookIds = Array.isArray(binding?.hookIds) ? sanitizeLines(binding.hookIds) : [];
      if (hookIds.length > 0) {
        parts.push(`hooks=${hookIds.join(",")}`);
      }
      const mappings = Array.isArray(binding?.directorySyncMappings) ? sanitizeLines(binding.directorySyncMappings) : [];
      if (mappings.length > 0) {
        parts.push(`mappings=${mappings.join(",")}`);
      }
      const exceptions = Array.isArray(binding?.exceptionProfiles) ? sanitizeLines(binding.exceptionProfiles) : [];
      if (exceptions.length > 0) {
        parts.push(`exceptions=${exceptions.join(",")}`);
      }
      const overlays = Array.isArray(binding?.overlayProfiles) ? sanitizeLines(binding.overlayProfiles) : [];
      if (overlays.length > 0) {
        parts.push(`overlays=${overlays.join(",")}`);
      }
      const requiredInputs = Array.isArray(binding?.requiredInputs) ? sanitizeLines(binding.requiredInputs) : [];
      if (requiredInputs.length > 0) {
        parts.push(`inputs=${requiredInputs.join(",")}`);
      }
      return parts.join(" | ");
    })
  ));
}

function renderOrgAdminDirectorySyncMappings(items = []) {
  return sortedUnique(items.flatMap((item) =>
    (Array.isArray(item?.directorySyncMappings) ? item.directorySyncMappings : []).map((mapping) => {
      const parts = [normalizedString(mapping?.label, normalizedString(mapping?.mappingId, "org-admin-directory-sync"))];
      if (normalizedString(mapping?.mappingMode)) {
        parts.push(`mode=${normalizedString(mapping.mappingMode)}`);
      }
      const scopeDimensions = Array.isArray(mapping?.scopeDimensions) ? sanitizeLines(mapping.scopeDimensions) : [];
      if (scopeDimensions.length > 0) {
        parts.push(`scope=${scopeDimensions.join(",")}`);
      }
      const requiredInputs = Array.isArray(mapping?.requiredInputs) ? sanitizeLines(mapping.requiredInputs) : [];
      if (requiredInputs.length > 0) {
        parts.push(`inputs=${requiredInputs.join(",")}`);
      }
      return parts.join(" | ");
    })
  ));
}

function renderOrgAdminExceptionProfiles(items = []) {
  return sortedUnique(items.flatMap((item) =>
    (Array.isArray(item?.exceptionProfiles) ? item.exceptionProfiles : []).map((profile) => {
      const parts = [normalizedString(profile?.label, normalizedString(profile?.profileId, "org-admin-exception"))];
      if (normalizedString(profile?.category)) {
        parts.push(`category=${normalizedString(profile.category)}`);
      }
      if (normalizedString(profile?.exceptionMode)) {
        parts.push(`mode=${normalizedString(profile.exceptionMode)}`);
      }
      const requiredInputs = Array.isArray(profile?.requiredInputs) ? sanitizeLines(profile.requiredInputs) : [];
      if (requiredInputs.length > 0) {
        parts.push(`inputs=${requiredInputs.join(",")}`);
      }
      return parts.join(" | ");
    })
  ));
}

function renderOrgAdminOverlayProfiles(items = []) {
  return sortedUnique(items.flatMap((item) =>
    (Array.isArray(item?.overlayProfiles) ? item.overlayProfiles : []).map((profile) => {
      const parts = [normalizedString(profile?.label, normalizedString(profile?.overlayId, "org-admin-overlay"))];
      if (normalizedString(profile?.category)) {
        parts.push(`category=${normalizedString(profile.category)}`);
      }
      if (normalizedString(profile?.overlayMode)) {
        parts.push(`mode=${normalizedString(profile.overlayMode)}`);
      }
      const dimensions = Array.isArray(profile?.targetDimensions) ? sanitizeLines(profile.targetDimensions) : [];
      if (dimensions.length > 0) {
        parts.push(`dimensions=${dimensions.join(",")}`);
      }
      const requiredInputs = Array.isArray(profile?.requiredInputs) ? sanitizeLines(profile.requiredInputs) : [];
      if (requiredInputs.length > 0) {
        parts.push(`inputs=${requiredInputs.join(",")}`);
      }
      return parts.join(" | ");
    })
  ));
}

function combineOrgAdminRoleBundles(items = []) {
  return sortedUnique(
    items.flatMap((item) => [
      ...(Array.isArray(item?.adminRoleBundles) ? item.adminRoleBundles : []),
      ...(Array.isArray(item?.delegatedAdminRoleBundles) ? item.delegatedAdminRoleBundles : []),
      ...(Array.isArray(item?.breakGlassRoleBundles) ? item.breakGlassRoleBundles : [])
    ])
  );
}

function combineOrgAdminField(items = [], fieldName) {
  return sortedUnique(
    items.flatMap((item) => {
      if (fieldName === "delegationModel") {
        return normalizedString(item?.delegationModel) ? [item.delegationModel] : [];
      }
      return Array.isArray(item?.[fieldName]) ? item[fieldName] : [];
    })
  );
}

function filterSelectableExportProfiles(catalog = {}, clientSurface = "", reportType = "") {
  const items = catalogItems(catalog);
  const surface = normalizedString(clientSurface).toLowerCase();
  const report = normalizedString(reportType, "review").toLowerCase();
  const filtered = items.filter((item) => {
    const surfaces = Array.isArray(item?.clientSurfaces) ? item.clientSurfaces.map((entry) => normalizedString(entry).toLowerCase()) : [];
    const reportTypes = Array.isArray(item?.reportTypes) ? item.reportTypes.map((entry) => normalizedString(entry).toLowerCase()) : [];
    if (surface && surfaces.length > 0 && !surfaces.includes(surface)) {
      return false;
    }
    if (report && reportTypes.length > 0 && !reportTypes.includes(report)) {
      return false;
    }
    return true;
  });
  return filtered.length > 0 ? filtered : items;
}

function allowedAudiencesForItems(items = []) {
  return sortedUnique(
    items.flatMap((item) => [
      normalizedString(item?.defaultAudience),
      ...(Array.isArray(item?.allowedAudiences) ? item.allowedAudiences : [])
    ])
  );
}

function allowedRetentionClassesForItems(items = []) {
  return sortedUnique(
    items.flatMap((item) => [
      normalizedString(item?.defaultRetentionClass),
      ...(Array.isArray(item?.allowedRetentionClasses) ? item.allowedRetentionClasses : []),
      ...Object.values(item?.audienceRetentionClassOverlays || {})
    ])
  );
}

function defaultEnterpriseReportProfile(clientSurface = "", reportType = "") {
  const surface = normalizedString(clientSurface).toLowerCase();
  const report = normalizedString(reportType, "report").toLowerCase();
  switch (surface) {
    case "workflow":
      return report.includes("delta") || report.includes("follow") ? "workflow_follow" : "workflow_review";
    case "chatops":
      return report.includes("delta") || report.includes("follow") ? "conversation_follow" : "conversation_review";
    default:
      return report.includes("delta") || report.includes("follow") ? "operator_follow" : "operator_review";
  }
}

function defaultEnterpriseReportAudience(clientSurface = "") {
  switch (normalizedString(clientSurface).toLowerCase()) {
    case "workflow":
      return "workflow_operator";
    case "chatops":
      return "conversation_operator";
    default:
      return "operator";
  }
}

function defaultEnterpriseReportRetentionClass(reportType = "") {
  const report = normalizedString(reportType, "report").toLowerCase();
  if (report.includes("export")) {
    return "archive";
  }
  if (report.includes("delta") || report.includes("follow") || report.includes("handoff")) {
    return "short";
  }
  return "standard";
}

function resolveEnterpriseReportRetentionClass(subject = {}, disposition = {}, exportProfileItems = []) {
  const explicit = normalizedString(subject.retentionClass);
  if (explicit) {
    return explicit;
  }
  const audience = normalizedString(disposition.audience).toLowerCase();
  for (const item of exportProfileItems) {
    const overlays = item?.audienceRetentionClassOverlays || {};
    for (const [candidateAudience, retentionClass] of Object.entries(overlays)) {
      if (normalizedString(candidateAudience).toLowerCase() === audience && normalizedString(retentionClass)) {
        return normalizedString(retentionClass);
      }
    }
  }
  for (const item of exportProfileItems) {
    if (normalizedString(item?.defaultRetentionClass)) {
      return normalizedString(item.defaultRetentionClass);
    }
  }
  return normalizedString(disposition.retentionClass, "standard");
}

export function resolveEnterpriseReportDisposition(subject = {}) {
  const clientSurface = normalizedString(subject?.clientSurface);
  const reportType = normalizedString(subject?.reportType, "report");
  return {
    exportProfile: normalizedString(subject?.exportProfile, defaultEnterpriseReportProfile(clientSurface, reportType)),
    audience: normalizedString(subject?.audience, defaultEnterpriseReportAudience(clientSurface)),
    retentionClass: normalizedString(subject?.retentionClass, defaultEnterpriseReportRetentionClass(reportType)),
    clientSurface,
    reportType
  };
}

export function buildGovernedExportSelectionState(options = {}) {
  const clientSurface = normalizedString(options.clientSurface, "chat");
  const reportType = normalizedString(options.reportType, "review");
  const selectableItems = filterSelectableExportProfiles(options?.exportProfileCatalog || {}, clientSurface, reportType);
  const exportProfileOptions = selectableItems.map((item) => ({
    value: normalizedString(item?.exportProfile),
    label: normalizedString(item?.label, normalizedString(item?.exportProfile))
  })).filter((item) => item.value);
  const requestedProfile = normalizedString(options.exportProfile, defaultEnterpriseReportProfile(clientSurface, reportType));
  const exportProfile = exportProfileOptions.some((item) => item.value === requestedProfile)
    ? requestedProfile
    : normalizedString(exportProfileOptions[0]?.value, requestedProfile);
  const profileItems = selectableItems.filter((item) => normalizedString(item?.exportProfile) === exportProfile);
  const audienceOptions = allowedAudiencesForItems(profileItems);
  const requestedAudience = normalizedString(options.audience, defaultEnterpriseReportAudience(clientSurface));
  const audience = audienceOptions.includes(requestedAudience)
    ? requestedAudience
    : normalizedString(audienceOptions[0], requestedAudience);
  const retentionClassOptions = allowedRetentionClassesForItems(profileItems);
  const requestedRetention = normalizedString(options.retentionClass);
  const retentionClass = retentionClassOptions.includes(requestedRetention)
    ? requestedRetention
    : resolveEnterpriseReportRetentionClass(
        { ...options, exportProfile, audience, retentionClass: requestedRetention },
        { clientSurface, reportType, exportProfile, audience, retentionClass: requestedRetention },
        profileItems
      );
  return {
    clientSurface,
    reportType,
    exportProfile,
    audience,
    retentionClass,
    exportProfileOptions,
    audienceOptions,
    retentionClassOptions,
    retentionOverlays: sortedUnique(
      profileItems.flatMap((item) =>
        Object.entries(item?.audienceRetentionClassOverlays || {}).map(([audienceName, retention]) =>
          `${normalizedString(audienceName)} => ${normalizedString(retention)}`
        )
      )
    )
  };
}

function parseOrgAdminDecisionBinding(approval = {}) {
  const annotations = approval?.annotations && typeof approval.annotations === "object" ? approval.annotations : {};
  const binding = annotations?.orgAdminDecisionBinding;
  if (!binding || typeof binding !== "object") {
    return null;
  }
  return {
    checkpointId: normalizedString(approval?.checkpointId),
    status: normalizedString(approval?.status),
    reason: normalizedString(approval?.reason),
    profileId: normalizedString(binding?.profileId),
    profileLabel: normalizedString(binding?.profileLabel),
    organizationModel: normalizedString(binding?.organizationModel),
    bindingId: normalizedString(binding?.bindingId),
    bindingLabel: normalizedString(binding?.bindingLabel),
    category: normalizedString(binding?.category),
    bindingMode: normalizedString(binding?.bindingMode),
    selectedRoleBundle: normalizedString(binding?.selectedRoleBundle),
    selectedDirectoryMappings: sortedUnique(binding?.selectedDirectorySyncMappings || []),
    selectedExceptionProfiles: sortedUnique(binding?.selectedExceptionProfiles || []),
    selectedOverlayProfiles: sortedUnique(binding?.selectedOverlayProfiles || []),
    requiredInputs: sortedUnique(binding?.requiredInputs || []),
    requestedInputKeys: sortedUnique(binding?.requestedInputKeys || []),
    inputValues: normalizeOrgAdminInputValues(binding?.inputValues),
    decisionSurfaces: sortedUnique(binding?.decisionSurfaces || []),
    boundaryRequirements: sortedUnique(binding?.boundaryRequirements || [])
  };
}

function normalizeOrgAdminInputValues(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [normalizedString(key), normalizedString(item)])
      .filter(([key, item]) => key && item)
      .sort((a, b) => a[0].localeCompare(b[0]))
  );
}

function renderOrgAdminInputValues(inputValues = {}) {
  const entries = Object.entries(inputValues);
  if (!entries.length) {
    return "";
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

function orgAdminCategoryHints(primary = {}) {
  switch (normalizedString(primary?.category)) {
    case "break_glass":
      return [
        normalizedString(primary?.inputValues?.break_glass_expiry)
          ? `Break-glass access stays time-boxed until ${normalizedString(primary.inputValues.break_glass_expiry)}.`
          : "Break-glass activation must stay explicitly time-boxed and auditable."
      ];
    case "directory_sync":
      return ["Directory-sync reviews change governed group-to-role bindings and should be checked against IdP source data."];
    case "residency":
      return ["Residency exceptions should be reviewed against the requested region and export-profile override path."];
    case "legal_hold":
      return ["Legal-hold exceptions should be verified against hold case data before export or retention changes are allowed."];
    case "quota":
      return ["Quota overlays change governed capacity limits and must stay aligned with metering dimensions."];
    case "chargeback":
      return ["Chargeback overlays change allocation boundaries and should be reviewed against the declared billing dimensions."];
    default:
      return [];
  }
}

function buildOrgAdminReviewProjection(approvals = []) {
  const bindings = (Array.isArray(approvals) ? approvals : [])
    .map((approval) => parseOrgAdminDecisionBinding(approval))
    .filter(Boolean);
  if (!bindings.length) {
    return {
      profileId: "",
      organizationModel: "",
      roleBundle: "",
      details: [],
      actionHints: []
    };
  }
  const primary = bindings[0];
  const details = [];
  let pendingCount = 0;
  for (const item of bindings) {
    if (normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING") {
      pendingCount += 1;
    }
    const parts = [normalizedString(item?.bindingLabel, normalizedString(item?.bindingId, "org-admin-binding"))];
    if (normalizedString(item?.category)) {
      parts.push(`category=${normalizedString(item.category)}`);
    }
    if (normalizedString(item?.bindingMode)) {
      parts.push(`mode=${normalizedString(item.bindingMode)}`);
    }
    parts.push(`status=${normalizedString(item?.status, "PENDING")}`);
    if (normalizedString(item?.checkpointId)) {
      parts.push(`checkpoint=${normalizedString(item.checkpointId)}`);
    }
    details.push(`Org-admin decision binding: ${parts.join(" | ")}`);
    if (normalizedString(item?.reason)) {
      details.push(`Org-admin review reason: ${normalizedString(item.reason)}`);
    }
  }
  if (normalizedString(primary?.profileId) || normalizedString(primary?.profileLabel)) {
    details.push(
      `Org-admin profile: ${normalizedString(primary?.profileLabel, normalizedString(primary?.profileId, "-"))} (${normalizedString(primary?.profileId, "-")})`
    );
  }
  if (normalizedString(primary?.selectedRoleBundle)) {
    details.push(`Org-admin role bundle: ${normalizedString(primary.selectedRoleBundle)}`);
  }
  if (primary?.selectedDirectoryMappings?.length) {
    details.push(`Org-admin directory sync mappings: ${primary.selectedDirectoryMappings.join(", ")}`);
  }
  if (primary?.selectedExceptionProfiles?.length) {
    details.push(`Org-admin exception profiles: ${primary.selectedExceptionProfiles.join(", ")}`);
  }
  if (primary?.selectedOverlayProfiles?.length) {
    details.push(`Org-admin overlay profiles: ${primary.selectedOverlayProfiles.join(", ")}`);
  }
  if (primary?.requiredInputs?.length) {
    details.push(`Org-admin required inputs: ${primary.requiredInputs.join(", ")}`);
  }
  if (primary?.requestedInputKeys?.length) {
    details.push(`Org-admin provided inputs: ${primary.requestedInputKeys.join(", ")}`);
  }
  if (Object.keys(primary?.inputValues || {}).length > 0) {
    details.push(`Org-admin input values: ${renderOrgAdminInputValues(primary.inputValues)}`);
  }
  if (primary?.decisionSurfaces?.length) {
    details.push(`Org-admin decision surfaces: ${primary.decisionSurfaces.join(", ")}`);
  }
  if (primary?.boundaryRequirements?.length) {
    details.push(`Org-admin boundary requirements: ${primary.boundaryRequirements.join(", ")}`);
  }

  const actionHints = [];
  if (pendingCount > 0) {
    actionHints.push(`Resolve ${pendingCount} pending org-admin decision reviews before enterprise handoff.`);
  }
  if (normalizedString(primary?.selectedRoleBundle)) {
    actionHints.push(`Org-admin decision is restricted to role bundle ${normalizedString(primary.selectedRoleBundle)}.`);
  }
  if (primary?.requiredInputs?.length) {
    actionHints.push(`Org-admin review requires input coverage for ${primary.requiredInputs.join(", ")}.`);
  }
  actionHints.push(...orgAdminCategoryHints(primary));
  return {
    profileId: normalizedString(primary?.profileId),
    organizationModel: normalizedString(primary?.organizationModel),
    roleBundle: normalizedString(primary?.selectedRoleBundle),
    details: sortedUnique(details),
    actionHints: sortedUnique(actionHints)
  };
}

export function buildEnterpriseReportEnvelope(subject = {}, policyCatalog = {}, capabilityCatalog = {}, exportProfileCatalog = {}, orgAdminCatalog = {}) {
  const orgAdminReview = buildOrgAdminReviewProjection(subject?.approvalCheckpoints || []);
  const effectiveSubject = {
    ...subject,
    orgAdminProfileId: normalizedString(subject?.orgAdminProfileId, normalizedString(orgAdminReview.profileId)),
    organizationModel: normalizedString(subject?.organizationModel, normalizedString(orgAdminReview.organizationModel)),
    orgAdminRoleBundle: normalizedString(subject?.orgAdminRoleBundle, normalizedString(orgAdminReview.roleBundle))
  };
  const capabilityItems = filterCapabilityItems(capabilityCatalog, effectiveSubject);
  const policyItems = filterPolicyItems(policyCatalog, effectiveSubject);
  const orgAdminItems = filterOrgAdminItems(orgAdminCatalog, effectiveSubject);
  const disposition = resolveEnterpriseReportDisposition(effectiveSubject);
  const exportProfileItems = filterExportProfileItems(exportProfileCatalog, effectiveSubject, disposition);
  const envelope = {
    header: normalizedString(subject.header, "AgentOps enterprise governance report"),
    reportType: disposition.reportType,
    exportProfile: disposition.exportProfile,
    audience: disposition.audience,
    retentionClass: resolveEnterpriseReportRetentionClass(subject, disposition, exportProfileItems),
    clientSurface: disposition.clientSurface,
    contextLabel: normalizedString(subject.contextLabel, "Context"),
    contextValue: normalizedString(subject.contextValue),
    subjectLabel: normalizedString(subject.subjectLabel, "Subject"),
    subjectValue: normalizedString(subject.subjectValue),
    taskId: normalizedString(subject.taskId),
    taskStatus: normalizedString(subject.taskStatus),
    sessionId: normalizedString(subject.sessionId),
    sessionStatus: normalizedString(subject.sessionStatus),
    workerId: normalizedString(subject.workerId),
    workerType: normalizedString(subject.workerType),
    workerAdapterId: normalizedString(subject.workerAdapterId),
    workerState: normalizedString(subject.workerState),
    executionMode: normalizedString(subject.executionMode),
    openApprovals: Number(subject.openApprovals || 0) || 0,
    pendingProposalCount: Number(subject.pendingProposalCount || 0) || 0,
    toolActionCount: Number(subject.toolActionCount || 0) || 0,
    evidenceCount: Number(subject.evidenceCount || 0) || 0,
    summary: normalizedString(subject.summary),
    details: sanitizeLines([...(Array.isArray(subject?.details) ? subject.details : []), ...orgAdminReview.details]),
    applicableOrgAdmins: renderOrgAdminLabels(orgAdminItems),
    applicablePolicyPacks: renderPolicyPackLabels(policyItems),
    exportProfileLabels: renderExportProfileLabels(exportProfileItems),
    roleBundles: combineCatalogFields(policyItems, "roleBundles"),
    adminRoleBundles: combineOrgAdminRoleBundles(orgAdminItems),
    delegationModels: combineOrgAdminField(orgAdminItems, "delegationModel"),
    delegatedAdminBundles: combineOrgAdminField(orgAdminItems, "delegatedAdminRoleBundles"),
    breakGlassBundles: combineOrgAdminField(orgAdminItems, "breakGlassRoleBundles"),
    decisionBindingLabels: renderOrgAdminDecisionBindings(orgAdminItems),
    enforcementProfileLabels: renderOrgAdminEnforcementProfiles(orgAdminItems),
    directorySyncMappings: renderOrgAdminDirectorySyncMappings(orgAdminItems),
    exceptionProfileLabels: renderOrgAdminExceptionProfiles(orgAdminItems),
    overlayProfileLabels: renderOrgAdminOverlayProfiles(orgAdminItems),
    workerCapabilityLabels: renderCapabilityLabels(capabilityItems),
    directorySyncInputs: combineOrgAdminField(orgAdminItems, "directorySyncInputs"),
    residencyProfiles: combineOrgAdminField(orgAdminItems, "residencyProfiles"),
    residencyExceptions: combineOrgAdminField(orgAdminItems, "residencyExceptionInputs"),
    legalHoldProfiles: combineOrgAdminField(orgAdminItems, "legalHoldProfiles"),
    legalHoldExceptions: combineOrgAdminField(orgAdminItems, "legalHoldExceptionInputs"),
    networkBoundaryProfiles: combineOrgAdminField(orgAdminItems, "networkBoundaryProfiles"),
    fleetRolloutProfiles: combineOrgAdminField(orgAdminItems, "fleetRolloutProfiles"),
    quotaDimensions: combineOrgAdminField(orgAdminItems, "quotaDimensions"),
    quotaOverlays: combineOrgAdminField(orgAdminItems, "quotaOverlayInputs"),
    chargebackDimensions: combineOrgAdminField(orgAdminItems, "chargebackDimensions"),
    chargebackOverlays: combineOrgAdminField(orgAdminItems, "chargebackOverlayInputs"),
    enforcementHooks: combineOrgAdminField(orgAdminItems, "enforcementHooks"),
    boundaryRequirements: sortedUnique([
      ...combineCatalogFields(policyItems, "boundaryRequirements"),
      ...combineCatalogFields(capabilityItems, "boundaryRequirements"),
      ...combineOrgAdminField(orgAdminItems, "boundaryRequirements")
    ]),
    decisionSurfaces: combineCatalogFields(policyItems, "decisionSurfaces"),
    reportingSurfaces: (() => {
      const items = sortedUnique([
        ...combineCatalogFields(policyItems, "reportingSurfaces"),
        ...combineOrgAdminField(orgAdminItems, "reportingSurfaces"),
        ...combineCatalogFields(exportProfileItems, "deliveryChannels")
      ]);
      return items.length > 0 ? items : ["report"];
    })(),
    allowedAudiences: sortedUnique(
      exportProfileItems.flatMap((item) => [
        normalizedString(item?.defaultAudience),
        ...(Array.isArray(item?.allowedAudiences) ? item.allowedAudiences : [])
      ])
    ),
    allowedRetentionClasses: sortedUnique(
      exportProfileItems.flatMap((item) => [
        normalizedString(item?.defaultRetentionClass),
        ...(Array.isArray(item?.allowedRetentionClasses) ? item.allowedRetentionClasses : []),
        ...Object.values(item?.audienceRetentionClassOverlays || {})
      ])
    ),
    retentionOverlays: sortedUnique(
      exportProfileItems.flatMap((item) =>
        Object.entries(item?.audienceRetentionClassOverlays || {}).map(([audienceName, retentionClass]) =>
          `${normalizedString(audienceName)} => ${normalizedString(retentionClass)}`
        )
      )
    ),
    deliveryChannels: combineCatalogFields(exportProfileItems, "deliveryChannels"),
    redactionModes: sortedUnique(exportProfileItems.map((item) => normalizedString(item?.redactionMode)).filter(Boolean)),
    recent: sanitizeLines(subject.recent),
    actionHints: sanitizeLines([...(Array.isArray(subject?.actionHints) ? subject.actionHints : []), ...orgAdminReview.actionHints]),
    dlpFindings: [],
    redactionCount: 0
  };

  let result = redactStringWithCount(envelope.contextValue, envelope.redactionCount);
  envelope.contextValue = result.value;
  envelope.redactionCount = result.count;
  result = redactStringWithCount(envelope.subjectValue, envelope.redactionCount);
  envelope.subjectValue = result.value;
  envelope.redactionCount = result.count;
  result = redactStringWithCount(envelope.summary, envelope.redactionCount);
  envelope.summary = result.value;
  envelope.redactionCount = result.count;
  let listResult = redactLinesWithCount(envelope.details, envelope.redactionCount);
  envelope.details = listResult.value;
  envelope.redactionCount = listResult.count;
  listResult = redactLinesWithCount(envelope.recent, envelope.redactionCount);
  envelope.recent = listResult.value;
  envelope.redactionCount = listResult.count;
  listResult = redactLinesWithCount(envelope.actionHints, envelope.redactionCount);
  envelope.actionHints = listResult.value;
  envelope.redactionCount = listResult.count;
  if (envelope.redactionCount > 0) {
    envelope.dlpFindings.push(`Secret-like material was redacted from governed report content before output. matches=${envelope.redactionCount}`);
  }
  return envelope;
}

function appendSection(lines, title, items = []) {
  const normalized = sanitizeLines(items);
  if (normalized.length === 0) {
    return;
  }
  lines.push(title);
  normalized.forEach((item) => {
    lines.push(`- ${String(item).replace(/^[-*]\s+/, "")}`);
  });
}

export function renderEnterpriseReportEnvelope(envelope = {}) {
  const lines = [normalizedString(envelope.header, "AgentOps enterprise governance report")];
  lines.push(`Type: ${normalizedString(envelope.reportType, "report")}`);
  lines.push(`Export profile: ${normalizedString(envelope.exportProfile, "operator_review")}`);
  lines.push(`Audience: ${normalizedString(envelope.audience, "operator")}`);
  lines.push(`Retention class: ${normalizedString(envelope.retentionClass, "standard")}`);
  if (normalizedString(envelope.clientSurface)) {
    lines.push(`Surface: ${normalizedString(envelope.clientSurface)}`);
  }
  if (normalizedString(envelope.contextValue)) {
    lines.push(`${normalizedString(envelope.contextLabel, "Context")}: ${normalizedString(envelope.contextValue)}`);
  }
  if (normalizedString(envelope.subjectValue)) {
    lines.push(`${normalizedString(envelope.subjectLabel, "Subject")}: ${normalizedString(envelope.subjectValue)}`);
  }
  if (normalizedString(envelope.taskId) || normalizedString(envelope.taskStatus)) {
    lines.push(`Task: ${normalizedString(envelope.taskId, "-")} (${normalizedString(envelope.taskStatus, "-")})`);
  }
  if (normalizedString(envelope.sessionId) || normalizedString(envelope.sessionStatus)) {
    lines.push(`Session: ${normalizedString(envelope.sessionId, "-")} (${normalizedString(envelope.sessionStatus, "-")})`);
  }
  if (normalizedString(envelope.workerId) || normalizedString(envelope.workerType) || normalizedString(envelope.workerAdapterId) || normalizedString(envelope.workerState)) {
    lines.push(`Worker: ${normalizedString(envelope.workerId, "-")} ${normalizedString(envelope.workerType, "-")} ${normalizedString(envelope.workerAdapterId, "-")} ${normalizedString(envelope.workerState, "-")}`);
  }
  if (normalizedString(envelope.executionMode)) {
    lines.push(`Execution mode: ${normalizedString(envelope.executionMode)}`);
  }
  lines.push(`Open approvals: ${Number(envelope.openApprovals || 0) || 0}`);
  lines.push(`Pending proposals: ${Number(envelope.pendingProposalCount || 0) || 0}`);
  lines.push(`Tool actions: ${Number(envelope.toolActionCount || 0) || 0}`);
  lines.push(`Evidence records: ${Number(envelope.evidenceCount || 0) || 0}`);
  if (normalizedString(envelope.summary)) {
    lines.push(`Summary: ${normalizedString(envelope.summary)}`);
  }
  appendSection(lines, "Details:", envelope.details);
  appendSection(lines, "Applicable org-admin profiles:", envelope.applicableOrgAdmins);
  appendSection(lines, "Applicable policy packs:", envelope.applicablePolicyPacks);
  appendSection(lines, "Export profile coverage:", envelope.exportProfileLabels);
  appendSection(lines, "Role bundles:", envelope.roleBundles);
  appendSection(lines, "Admin role bundles:", envelope.adminRoleBundles);
  appendSection(lines, "Delegation models:", envelope.delegationModels);
  appendSection(lines, "Delegated admin bundles:", envelope.delegatedAdminBundles);
  appendSection(lines, "Break-glass bundles:", envelope.breakGlassBundles);
  appendSection(lines, "Decision binding coverage:", envelope.decisionBindingLabels);
  appendSection(lines, "Enforcement profile coverage:", envelope.enforcementProfileLabels);
  appendSection(lines, "Directory-sync mapping coverage:", envelope.directorySyncMappings);
  appendSection(lines, "Exception profile coverage:", envelope.exceptionProfileLabels);
  appendSection(lines, "Overlay profile coverage:", envelope.overlayProfileLabels);
  appendSection(lines, "Worker capability coverage:", envelope.workerCapabilityLabels);
  appendSection(lines, "Directory-sync inputs:", envelope.directorySyncInputs);
  appendSection(lines, "Residency profiles:", envelope.residencyProfiles);
  appendSection(lines, "Residency exceptions:", envelope.residencyExceptions);
  appendSection(lines, "Legal-hold profiles:", envelope.legalHoldProfiles);
  appendSection(lines, "Legal-hold exceptions:", envelope.legalHoldExceptions);
  appendSection(lines, "Network boundary profiles:", envelope.networkBoundaryProfiles);
  appendSection(lines, "Fleet rollout profiles:", envelope.fleetRolloutProfiles);
  appendSection(lines, "Quota dimensions:", envelope.quotaDimensions);
  appendSection(lines, "Quota overlays:", envelope.quotaOverlays);
  appendSection(lines, "Chargeback dimensions:", envelope.chargebackDimensions);
  appendSection(lines, "Chargeback overlays:", envelope.chargebackOverlays);
  appendSection(lines, "Enforcement hooks:", envelope.enforcementHooks);
  appendSection(lines, "Boundary requirements:", envelope.boundaryRequirements);
  appendSection(lines, "Decision surfaces:", envelope.decisionSurfaces);
  appendSection(lines, "Reporting surfaces:", envelope.reportingSurfaces);
  appendSection(lines, "Allowed audiences:", envelope.allowedAudiences);
  appendSection(lines, "Allowed retention classes:", envelope.allowedRetentionClasses);
  appendSection(lines, "Retention overlays:", envelope.retentionOverlays);
  appendSection(lines, "Delivery channels:", envelope.deliveryChannels);
  appendSection(lines, "Redaction modes:", envelope.redactionModes);
  appendSection(lines, "DLP findings:", envelope.dlpFindings);
  appendSection(lines, "Recent activity:", envelope.recent);
  appendSection(lines, "Action hints:", envelope.actionHints);
  return `${lines.join("\n")}\n`;
}

export function prepareGovernedJsonExport(payload, options = {}) {
  const disposition = resolveEnterpriseReportDisposition(options);
  const exportProfileItems = filterExportProfileItems(options?.exportProfileCatalog || {}, options, disposition);
  const orgAdminItems = filterOrgAdminItems(options?.orgAdminCatalog || options?.orgAdminProfiles || {}, options);
  const state = { count: 0 };
  const sanitizedPayload = sanitizeStructuredValue(payload, state);
  const findings = state.count > 0
    ? [`Secret-like material was redacted from governed export content before output. matches=${state.count}`]
    : [];
  return {
    payload: sanitizedPayload,
    serialized: JSON.stringify(sanitizedPayload, null, 2),
    redactionCount: state.count,
    dlpFindings: findings,
    exportProfile: disposition.exportProfile,
    audience: disposition.audience,
    retentionClass: resolveEnterpriseReportRetentionClass(options, disposition, exportProfileItems),
    clientSurface: disposition.clientSurface,
    reportType: disposition.reportType,
    exportProfileLabels: renderExportProfileLabels(exportProfileItems),
    applicableOrgAdmins: renderOrgAdminLabels(orgAdminItems),
    decisionBindingLabels: renderOrgAdminDecisionBindings(orgAdminItems),
    enforcementProfileLabels: renderOrgAdminEnforcementProfiles(orgAdminItems),
    directorySyncMappings: renderOrgAdminDirectorySyncMappings(orgAdminItems),
    exceptionProfileLabels: renderOrgAdminExceptionProfiles(orgAdminItems),
    overlayProfileLabels: renderOrgAdminOverlayProfiles(orgAdminItems),
    allowedAudiences: sortedUnique(
      exportProfileItems.flatMap((item) => [
        normalizedString(item?.defaultAudience),
        ...(Array.isArray(item?.allowedAudiences) ? item.allowedAudiences : [])
      ])
    ),
    allowedRetentionClasses: sortedUnique(
      exportProfileItems.flatMap((item) => [
        normalizedString(item?.defaultRetentionClass),
        ...(Array.isArray(item?.allowedRetentionClasses) ? item.allowedRetentionClasses : []),
        ...Object.values(item?.audienceRetentionClassOverlays || {})
      ])
    ),
    retentionOverlays: sortedUnique(
      exportProfileItems.flatMap((item) =>
        Object.entries(item?.audienceRetentionClassOverlays || {}).map(([audienceName, retentionClass]) =>
          `${normalizedString(audienceName)} => ${normalizedString(retentionClass)}`
        )
      )
    ),
    deliveryChannels: combineCatalogFields(exportProfileItems, "deliveryChannels"),
    redactionModes: sortedUnique(exportProfileItems.map((item) => normalizedString(item?.redactionMode)).filter(Boolean))
  };
}

export function prepareGovernedTextExport(text, options = {}) {
  const disposition = resolveEnterpriseReportDisposition(options);
  const exportProfileItems = filterExportProfileItems(options?.exportProfileCatalog || {}, options, disposition);
  const orgAdminItems = filterOrgAdminItems(options?.orgAdminCatalog || options?.orgAdminProfiles || {}, options);
  const result = redactStringWithCount(text, 0);
  return {
    text: result.value,
    redactionCount: result.count,
    dlpFindings: result.count > 0
      ? [`Secret-like material was redacted from governed export content before output. matches=${result.count}`]
      : [],
    exportProfile: disposition.exportProfile,
    audience: disposition.audience,
    retentionClass: resolveEnterpriseReportRetentionClass(options, disposition, exportProfileItems),
    clientSurface: disposition.clientSurface,
    reportType: disposition.reportType,
    exportProfileLabels: renderExportProfileLabels(exportProfileItems),
    applicableOrgAdmins: renderOrgAdminLabels(orgAdminItems),
    decisionBindingLabels: renderOrgAdminDecisionBindings(orgAdminItems),
    enforcementProfileLabels: renderOrgAdminEnforcementProfiles(orgAdminItems),
    directorySyncMappings: renderOrgAdminDirectorySyncMappings(orgAdminItems),
    exceptionProfileLabels: renderOrgAdminExceptionProfiles(orgAdminItems),
    overlayProfileLabels: renderOrgAdminOverlayProfiles(orgAdminItems),
    allowedAudiences: sortedUnique(
      exportProfileItems.flatMap((item) => [
        normalizedString(item?.defaultAudience),
        ...(Array.isArray(item?.allowedAudiences) ? item.allowedAudiences : [])
      ])
    ),
    allowedRetentionClasses: sortedUnique(
      exportProfileItems.flatMap((item) => [
        normalizedString(item?.defaultRetentionClass),
        ...(Array.isArray(item?.allowedRetentionClasses) ? item.allowedRetentionClasses : []),
        ...Object.values(item?.audienceRetentionClassOverlays || {})
      ])
    ),
    retentionOverlays: sortedUnique(
      exportProfileItems.flatMap((item) =>
        Object.entries(item?.audienceRetentionClassOverlays || {}).map(([audienceName, retentionClass]) =>
          `${normalizedString(audienceName)} => ${normalizedString(retentionClass)}`
        )
      )
    ),
    deliveryChannels: combineCatalogFields(exportProfileItems, "deliveryChannels"),
    redactionModes: sortedUnique(exportProfileItems.map((item) => normalizedString(item?.redactionMode)).filter(Boolean))
  };
}
