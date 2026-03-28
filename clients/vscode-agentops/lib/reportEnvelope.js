function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function sanitizeLines(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => normalizedString(item)).filter(Boolean);
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

function sortedUnique(items = []) {
  return Array.from(new Set(sanitizeLines(items))).sort((a, b) => a.localeCompare(b));
}

function filterCapabilityItems(catalog = {}, subject = {}) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const executionMode = normalizedString(subject.executionMode).toLowerCase();
  const workerType = normalizedString(subject.workerType).toLowerCase();
  const adapterId = normalizedString(subject.workerAdapterId).toLowerCase();
  const filtered = items.filter((item) => {
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
  return filtered.length > 0 ? filtered : items;
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
  return filtered.length > 0 ? filtered : items;
}

function defaultExportProfileCatalog() {
  return {
    items: [
      { exportProfile: "operator_review", label: "Operator Review", reportTypes: ["review", "report"], defaultAudience: "operator", allowedAudiences: ["operator", "security_review", "exec_review"], defaultRetentionClass: "standard", allowedRetentionClasses: ["standard", "archive"], audienceRetentionClassOverlays: { security_review: "archive", exec_review: "archive" }, clientSurfaces: ["chat", "vscode", "cli"], deliveryChannels: ["copy", "download", "report"], redactionMode: "structured_and_text" },
      { exportProfile: "operator_follow", label: "Operator Follow", reportTypes: ["delta-report", "follow"], defaultAudience: "operator", allowedAudiences: ["operator", "security_review"], defaultRetentionClass: "short", allowedRetentionClasses: ["short", "standard"], audienceRetentionClassOverlays: { security_review: "standard" }, clientSurfaces: ["chat", "vscode", "cli"], deliveryChannels: ["stream", "report"], redactionMode: "structured_and_text" },
      { exportProfile: "workflow_review", label: "Workflow Review", reportTypes: ["review", "report"], defaultAudience: "workflow_operator", allowedAudiences: ["workflow_operator", "security_review", "ticket_reviewer"], defaultRetentionClass: "standard", allowedRetentionClasses: ["standard", "archive"], audienceRetentionClassOverlays: { security_review: "archive" }, clientSurfaces: ["workflow"], deliveryChannels: ["comment", "update", "report"], redactionMode: "structured_and_text" },
      { exportProfile: "workflow_follow", label: "Workflow Follow", reportTypes: ["delta-report", "follow"], defaultAudience: "workflow_operator", allowedAudiences: ["workflow_operator", "ticket_reviewer"], defaultRetentionClass: "short", allowedRetentionClasses: ["short", "standard"], audienceRetentionClassOverlays: { ticket_reviewer: "standard" }, clientSurfaces: ["workflow"], deliveryChannels: ["update", "comment", "stream"], redactionMode: "structured_and_text" },
      { exportProfile: "conversation_review", label: "Conversation Review", reportTypes: ["review", "report"], defaultAudience: "conversation_operator", allowedAudiences: ["conversation_operator", "security_review", "channel_reviewer"], defaultRetentionClass: "standard", allowedRetentionClasses: ["standard", "archive"], audienceRetentionClassOverlays: { security_review: "archive" }, clientSurfaces: ["chatops"], deliveryChannels: ["update", "thread_reply", "report"], redactionMode: "structured_and_text" },
      { exportProfile: "conversation_follow", label: "Conversation Follow", reportTypes: ["delta-report", "follow"], defaultAudience: "conversation_operator", allowedAudiences: ["conversation_operator", "channel_reviewer"], defaultRetentionClass: "short", allowedRetentionClasses: ["short", "standard"], audienceRetentionClassOverlays: { channel_reviewer: "standard" }, clientSurfaces: ["chatops"], deliveryChannels: ["update", "thread_reply", "stream"], redactionMode: "structured_and_text" },
      { exportProfile: "audit_export", label: "Audit Export", reportTypes: ["export", "handoff"], defaultAudience: "downstream_review", allowedAudiences: ["downstream_review", "security_review", "compliance_review"], defaultRetentionClass: "archive", allowedRetentionClasses: ["standard", "archive"], audienceRetentionClassOverlays: { downstream_review: "standard", security_review: "archive", compliance_review: "archive" }, clientSurfaces: ["desktop"], deliveryChannels: ["download", "copy", "preview"], redactionMode: "structured_and_text" },
      { exportProfile: "audit_handoff", label: "Audit Handoff", reportTypes: ["handoff"], defaultAudience: "downstream_review", allowedAudiences: ["downstream_review", "security_review"], defaultRetentionClass: "short", allowedRetentionClasses: ["short", "standard"], audienceRetentionClassOverlays: { security_review: "standard" }, clientSurfaces: ["desktop"], deliveryChannels: ["copy", "preview"], redactionMode: "text" },
      { exportProfile: "incident_export", label: "Incident Export", reportTypes: ["export", "handoff"], defaultAudience: "incident_response", allowedAudiences: ["incident_response", "security_review", "executive_incident_review"], defaultRetentionClass: "archive", allowedRetentionClasses: ["standard", "archive"], audienceRetentionClassOverlays: { incident_response: "standard", security_review: "archive", executive_incident_review: "archive" }, clientSurfaces: ["desktop"], deliveryChannels: ["download", "copy", "preview"], redactionMode: "structured_and_text" },
      { exportProfile: "incident_handoff", label: "Incident Handoff", reportTypes: ["handoff"], defaultAudience: "incident_response", allowedAudiences: ["incident_response", "security_review"], defaultRetentionClass: "standard", allowedRetentionClasses: ["short", "standard"], audienceRetentionClassOverlays: { security_review: "standard" }, clientSurfaces: ["desktop"], deliveryChannels: ["copy", "preview"], redactionMode: "text" }
    ]
  };
}

function catalogItems(catalog = {}) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  return items.length > 0 ? items : defaultExportProfileCatalog().items;
}

function filterExportProfileItems(catalog = {}, subject = {}, disposition = {}) {
  const items = catalogItems(catalog);
  const exportProfile = normalizedString(disposition.exportProfile || subject.exportProfile).toLowerCase();
  const clientSurface = normalizedString(disposition.clientSurface || subject.clientSurface).toLowerCase();
  const reportType = normalizedString(disposition.reportType || subject.reportType, "review").toLowerCase();
  const audience = normalizedString(disposition.audience || subject.audience).toLowerCase();
  const retentionClass = normalizedString(disposition.retentionClass || subject.retentionClass).toLowerCase();
  const filtered = items.filter((item) => {
    const profile = normalizedString(item?.exportProfile).toLowerCase();
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
    if (exportProfile && profile && profile !== exportProfile) {
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
  return filtered.length > 0 ? filtered : items;
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
  const report = normalizedString(reportType, "review").toLowerCase();
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
  const report = normalizedString(reportType, "review").toLowerCase();
  if (report.includes("export")) {
    return "archive";
  }
  if (report.includes("delta") || report.includes("follow") || report.includes("handoff")) {
    return "short";
  }
  return "standard";
}

function resolveGovernedRetentionClass(options = {}, disposition = {}, exportProfileItems = []) {
  const explicit = normalizedString(options.retentionClass);
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

function resolveGovernedReportDisposition(options = {}) {
  const clientSurface = normalizedString(options.clientSurface, "vscode");
  const reportType = normalizedString(options.reportType, "review");
  return {
    clientSurface,
    reportType,
    exportProfile: normalizedString(options.exportProfile, defaultEnterpriseReportProfile(clientSurface, reportType)),
    audience: normalizedString(options.audience, defaultEnterpriseReportAudience(clientSurface)),
    retentionClass: normalizedString(options.retentionClass, defaultEnterpriseReportRetentionClass(reportType))
  };
}

function buildGovernedReportSelectionState(catalogs = {}, options = {}) {
  const clientSurface = normalizedString(options.clientSurface, "vscode");
  const reportType = normalizedString(options.reportType, "review");
  const selectableItems = filterSelectableExportProfiles(catalogs?.exportProfiles || {}, clientSurface, reportType);
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
    : resolveGovernedRetentionClass(
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
    decisionActorRoles: sortedUnique(binding?.decisionActorRoles || []),
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

function orgAdminEventLabel(eventType = "") {
  switch (normalizedString(eventType).toLowerCase()) {
    case "org_admin.binding.requested":
    case "org_admin.binding.decision.applied":
      return "Org-Admin Binding Review";
    case "org_admin.delegated_admin.requested":
    case "org_admin.delegated_admin.decision.applied":
      return "Delegated Admin Review";
    case "org_admin.break_glass.requested":
    case "org_admin.break_glass.decision.applied":
      return "Break-Glass Review";
    case "org_admin.directory_sync.requested":
    case "org_admin.directory_sync.decision.applied":
      return "Directory Sync Review";
    case "org_admin.residency_exception.requested":
    case "org_admin.residency_exception.decision.applied":
      return "Residency Exception Review";
    case "org_admin.legal_hold_exception.requested":
    case "org_admin.legal_hold_exception.decision.applied":
      return "Legal Hold Review";
    case "org_admin.quota_overlay.requested":
    case "org_admin.quota_overlay.decision.applied":
      return "Quota Overlay Review";
    case "org_admin.chargeback_overlay.requested":
    case "org_admin.chargeback_overlay.decision.applied":
      return "Chargeback Overlay Review";
    default:
      return "";
  }
}

function summarizeOrgAdminEventDetail(eventType = "", payload = {}) {
  if (!normalizedString(eventType).toLowerCase().startsWith("org_admin.")) {
    return "";
  }
  const label = orgAdminEventLabel(eventType);
  const binding = normalizedString(payload?.bindingLabel, normalizedString(payload?.bindingId, label));
  const parts = [];
  if (binding) parts.push(binding);
  if (normalizedString(payload?.category)) parts.push(`category=${normalizedString(payload.category)}`);
  if (normalizedString(payload?.selectedRoleBundle)) parts.push(`roleBundle=${normalizedString(payload.selectedRoleBundle)}`);
  const selectedDirectorySyncs = Array.isArray(payload?.selectedDirectorySyncs) ? payload.selectedDirectorySyncs : (Array.isArray(payload?.selectedMappings) ? payload.selectedMappings : []);
  const selectedExceptions = Array.isArray(payload?.selectedExceptions) ? payload.selectedExceptions : [];
  const selectedOverlays = Array.isArray(payload?.selectedOverlays) ? payload.selectedOverlays : [];
  if (selectedDirectorySyncs.length) parts.push(`directorySync=${selectedDirectorySyncs.map((entry) => normalizedString(entry)).filter(Boolean).join(",")}`);
  if (selectedExceptions.length) parts.push(`exceptions=${selectedExceptions.map((entry) => normalizedString(entry)).filter(Boolean).join(",")}`);
  if (selectedOverlays.length) parts.push(`overlays=${selectedOverlays.map((entry) => normalizedString(entry)).filter(Boolean).join(",")}`);
  if (normalizedString(payload?.decision)) parts.push(`decision=${normalizedString(payload.decision)}`);
  if (normalizedString(payload?.status)) parts.push(`status=${normalizedString(payload.status)}`);
  return parts.join(" | ");
}

function buildOrgAdminReviewProjection(approvals = []) {
  const bindings = (Array.isArray(approvals) ? approvals : []).map((item) => parseOrgAdminDecisionBinding(item)).filter(Boolean);
  if (!bindings.length) {
    return {
      profileId: "",
      profileLabel: "",
      organizationModel: "",
      roleBundle: "",
      categories: [],
      bindingLabels: [],
      inputKeys: [],
      directoryMappings: [],
      exceptionProfiles: [],
      overlayProfiles: [],
      decisionActorRoles: [],
      decisionSurfaces: [],
      boundaryRequirements: [],
      inputValueLines: [],
      pendingCount: 0,
      details: [],
      actionHints: []
    };
  }
  const primary = bindings[0];
  const details = [];
  let pendingCount = 0;
  const categories = new Set();
  const bindingLabels = new Set();
  const inputKeys = new Set();
  const directoryMappings = new Set();
  const exceptionProfiles = new Set();
  const overlayProfiles = new Set();
  const decisionActorRoles = new Set();
  const decisionSurfaces = new Set();
  const boundaryRequirements = new Set();
  const inputValueLines = new Set();
  for (const item of bindings) {
    if (normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING") {
      pendingCount += 1;
    }
    if (normalizedString(item?.category)) categories.add(normalizedString(item.category));
    if (normalizedString(item?.bindingLabel, normalizedString(item?.bindingId))) {
      bindingLabels.add(normalizedString(item?.bindingLabel, normalizedString(item?.bindingId)));
    }
    (item?.requestedInputKeys || []).forEach((entry) => inputKeys.add(normalizedString(entry)));
    (item?.selectedDirectoryMappings || []).forEach((entry) => directoryMappings.add(normalizedString(entry)));
    (item?.selectedExceptionProfiles || []).forEach((entry) => exceptionProfiles.add(normalizedString(entry)));
    (item?.selectedOverlayProfiles || []).forEach((entry) => overlayProfiles.add(normalizedString(entry)));
    (item?.decisionActorRoles || []).forEach((entry) => decisionActorRoles.add(normalizedString(entry)));
    (item?.decisionSurfaces || []).forEach((entry) => decisionSurfaces.add(normalizedString(entry)));
    (item?.boundaryRequirements || []).forEach((entry) => boundaryRequirements.add(normalizedString(entry)));
    Object.entries(item?.inputValues || {}).forEach(([key, value]) => {
      const normalizedKey = normalizedString(key);
      const normalizedValue = normalizedString(value);
      if (normalizedKey && normalizedValue) {
        inputKeys.add(normalizedKey);
        inputValueLines.add(`${normalizedKey}=${normalizedValue}`);
      }
    });
    const parts = [normalizedString(item?.bindingLabel, normalizedString(item?.bindingId, "org-admin-binding"))];
    if (normalizedString(item?.category)) parts.push(`category=${normalizedString(item.category)}`);
    if (normalizedString(item?.bindingMode)) parts.push(`mode=${normalizedString(item.bindingMode)}`);
    parts.push(`status=${normalizedString(item?.status, "PENDING")}`);
    if (normalizedString(item?.checkpointId)) parts.push(`checkpoint=${normalizedString(item.checkpointId)}`);
    details.push(`Org-admin decision binding: ${parts.join(" | ")}`);
    if (normalizedString(item?.reason)) details.push(`Org-admin review reason: ${normalizedString(item.reason)}`);
  }
  if (normalizedString(primary?.profileId) || normalizedString(primary?.profileLabel)) {
    details.push(`Org-admin profile: ${normalizedString(primary?.profileLabel, normalizedString(primary?.profileId, "-"))} (${normalizedString(primary?.profileId, "-")})`);
  }
  if (normalizedString(primary?.selectedRoleBundle)) details.push(`Org-admin role bundle: ${normalizedString(primary.selectedRoleBundle)}`);
  if (primary?.selectedDirectoryMappings?.length) details.push(`Org-admin directory sync mappings: ${primary.selectedDirectoryMappings.join(", ")}`);
  if (primary?.selectedExceptionProfiles?.length) details.push(`Org-admin exception profiles: ${primary.selectedExceptionProfiles.join(", ")}`);
  if (primary?.selectedOverlayProfiles?.length) details.push(`Org-admin overlay profiles: ${primary.selectedOverlayProfiles.join(", ")}`);
  if (primary?.requiredInputs?.length) details.push(`Org-admin required inputs: ${primary.requiredInputs.join(", ")}`);
  if (primary?.requestedInputKeys?.length) details.push(`Org-admin provided inputs: ${primary.requestedInputKeys.join(", ")}`);
  if (Object.keys(primary?.inputValues || {}).length > 0) details.push(`Org-admin input values: ${renderOrgAdminInputValues(primary.inputValues)}`);
  if (primary?.decisionSurfaces?.length) details.push(`Org-admin decision surfaces: ${primary.decisionSurfaces.join(", ")}`);
  if (primary?.boundaryRequirements?.length) details.push(`Org-admin boundary requirements: ${primary.boundaryRequirements.join(", ")}`);
  const actionHints = [];
  if (pendingCount > 0) actionHints.push(`Resolve ${pendingCount} pending org-admin decision reviews before enterprise handoff.`);
  if (normalizedString(primary?.selectedRoleBundle)) actionHints.push(`Org-admin decision is restricted to role bundle ${normalizedString(primary.selectedRoleBundle)}.`);
  if (primary?.requiredInputs?.length) actionHints.push(`Org-admin review requires input coverage for ${primary.requiredInputs.join(", ")}.`);
  actionHints.push(...orgAdminCategoryHints(primary));
  return {
    profileId: normalizedString(primary?.profileId),
    profileLabel: normalizedString(primary?.profileLabel),
    organizationModel: normalizedString(primary?.organizationModel),
    roleBundle: normalizedString(primary?.selectedRoleBundle),
    categories: sortedUnique(Array.from(categories)),
    bindingLabels: sortedUnique(Array.from(bindingLabels)),
    inputKeys: sortedUnique(Array.from(inputKeys)),
    directoryMappings: sortedUnique(Array.from(directoryMappings)),
    exceptionProfiles: sortedUnique(Array.from(exceptionProfiles)),
    overlayProfiles: sortedUnique(Array.from(overlayProfiles)),
    decisionActorRoles: sortedUnique(Array.from(decisionActorRoles)),
    decisionSurfaces: sortedUnique(Array.from(decisionSurfaces)),
    boundaryRequirements: sortedUnique(Array.from(boundaryRequirements)),
    inputValueLines: sortedUnique(Array.from(inputValueLines)),
    pendingCount,
    details: sortedUnique(details),
    actionHints: sortedUnique(actionHints)
  };
}

function buildOrgAdminArtifactProjection(events = [], evidenceRecords = []) {
  const eventLabels = new Set();
  const evidenceKinds = new Set();
  const retentionClasses = new Set();
  const details = [];

  for (const item of Array.isArray(events) ? events : []) {
    const eventType = normalizedString(item?.eventType).toLowerCase();
    if (!eventType.startsWith("org_admin.")) {
      continue;
    }
    const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
    const label = normalizedString(orgAdminEventLabel(eventType), "Org-Admin Review Artifact");
    eventLabels.add(label);
    details.push(`${label}: ${normalizedString(summarizeOrgAdminEventDetail(eventType, payload), "Org-admin event recorded.")}`);
  }

  for (const item of Array.isArray(evidenceRecords) ? evidenceRecords : []) {
    const kind = normalizedString(item?.kind);
    if (!kind.toLowerCase().startsWith("org_admin_")) {
      continue;
    }
    evidenceKinds.add(kind);
    if (normalizedString(item?.retentionClass)) {
      retentionClasses.add(normalizedString(item.retentionClass));
    }
    const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const parts = [normalizedString(metadata?.bindingLabel, kind)];
    if (normalizedString(metadata?.category)) parts.push(`category=${normalizedString(metadata.category)}`);
    if (normalizedString(metadata?.selectedRoleBundle)) parts.push(`roleBundle=${normalizedString(metadata.selectedRoleBundle)}`);
    const selectedDirectoryMappings = Array.isArray(metadata?.selectedDirectoryMappings) ? metadata.selectedDirectoryMappings : [];
    const selectedExceptionProfiles = Array.isArray(metadata?.selectedExceptionProfiles) ? metadata.selectedExceptionProfiles : [];
    const selectedOverlayProfiles = Array.isArray(metadata?.selectedOverlayProfiles) ? metadata.selectedOverlayProfiles : [];
    if (selectedDirectoryMappings.length) parts.push(`directorySync=${selectedDirectoryMappings.map((entry) => normalizedString(entry)).filter(Boolean).join(",")}`);
    if (selectedExceptionProfiles.length) parts.push(`exceptions=${selectedExceptionProfiles.map((entry) => normalizedString(entry)).filter(Boolean).join(",")}`);
    if (selectedOverlayProfiles.length) parts.push(`overlays=${selectedOverlayProfiles.map((entry) => normalizedString(entry)).filter(Boolean).join(",")}`);
    if (normalizedString(metadata?.decision)) parts.push(`decision=${normalizedString(metadata.decision)}`);
    if (normalizedString(metadata?.status)) parts.push(`status=${normalizedString(metadata.status)}`);
    if (normalizedString(item?.retentionClass)) parts.push(`retention=${normalizedString(item.retentionClass)}`);
    details.push(`Org-admin evidence: ${parts.join(" | ")}`);
  }

  return {
    eventLabels: sortedUnique(Array.from(eventLabels)),
    evidenceKinds: sortedUnique(Array.from(evidenceKinds)),
    retentionClasses: sortedUnique(Array.from(retentionClasses)),
    details: sortedUnique(details)
  };
}

function buildGovernedReportEnvelope(model = {}, catalogs = {}, options = {}) {
  const task = model?.task && typeof model.task === "object" ? model.task : {};
  const selectedSession = model?.selectedSession && typeof model.selectedSession === "object" ? model.selectedSession : {};
  const selectedSummary = model?.selectedSummary && typeof model.selectedSummary === "object" ? model.selectedSummary : {};
  const selectedWorker = selectedSummary?.selectedWorker && typeof selectedSummary.selectedWorker === "object" ? selectedSummary.selectedWorker : {};
  const orgAdminReview = buildOrgAdminReviewProjection(selectedSummary?.approvals || []);
  const orgAdminArtifacts = buildOrgAdminArtifactProjection(selectedSummary?.events || [], selectedSummary?.evidenceRecords || []);
  const disposition = resolveGovernedReportDisposition(options);
  const exportProfileItems = filterExportProfileItems(catalogs?.exportProfiles || {}, disposition, disposition);
  const orgAdminItems = filterOrgAdminItems(catalogs?.orgAdminProfiles || {}, {
    orgAdminProfileId: normalizedString(options.orgAdminProfileId, orgAdminReview.profileId),
    organizationModel: normalizedString(options.organizationModel, orgAdminReview.organizationModel),
    orgAdminRoleBundle: normalizedString(options.orgAdminRoleBundle, orgAdminReview.roleBundle),
    clientSurface: disposition.clientSurface
  });
  const capabilityItems = filterCapabilityItems(catalogs?.workerCapabilities || {}, {
    executionMode: selectedSummary?.executionMode,
    workerType: selectedWorker?.workerType,
    workerAdapterId: selectedWorker?.adapterId,
    clientSurface: disposition.clientSurface
  });
  const policyItems = filterPolicyItems(catalogs?.policyPacks || {}, {
    executionMode: selectedSummary?.executionMode,
    workerType: selectedWorker?.workerType,
    workerAdapterId: selectedWorker?.adapterId,
    clientSurface: disposition.clientSurface
  });
  const envelope = {
    header: normalizedString(options.header, "EpydiosOps governed thread report"),
    reportType: disposition.reportType,
    exportProfile: disposition.exportProfile,
    audience: disposition.audience,
    retentionClass: resolveGovernedRetentionClass(options, disposition, exportProfileItems),
    clientSurface: disposition.clientSurface,
    contextLabel: normalizedString(options.contextLabel, "Thread"),
    contextValue: normalizedString(options.contextValue, normalizedString(task?.taskId, "-")),
    subjectLabel: normalizedString(options.subjectLabel, "Session"),
    subjectValue: normalizedString(options.subjectValue, normalizedString(selectedSession?.sessionId, normalizedString(task?.taskId, "-"))),
    taskId: normalizedString(task?.taskId),
    taskStatus: normalizedString(task?.status),
    sessionId: normalizedString(selectedSession?.sessionId),
    sessionStatus: normalizedString(selectedSession?.status),
    workerId: normalizedString(selectedWorker?.workerId),
    workerType: normalizedString(selectedWorker?.workerType),
    workerAdapterId: normalizedString(selectedWorker?.adapterId),
    workerState: normalizedString(selectedWorker?.status),
    executionMode: normalizedString(selectedSummary?.executionMode),
    openApprovals: Number(selectedSummary?.approvals?.filter?.((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length || 0),
    pendingProposalCount: Number(selectedSummary?.toolProposals?.filter?.((item) => normalizedString(item?.status, "PENDING").toUpperCase() === "PENDING").length || 0),
    toolActionCount: Number(selectedSummary?.toolActions?.length || 0),
    evidenceCount: Number(selectedSummary?.evidenceRecords?.length || 0),
    summary: normalizedString(options.summary, normalizedString(selectedSummary?.latestWorkerSummary, "Governed thread state refreshed.")),
    details: sanitizeLines([...(Array.isArray(options?.details) ? options.details : []), ...orgAdminReview.details, ...orgAdminArtifacts.details]),
    applicableOrgAdmins: renderOrgAdminLabels(orgAdminItems),
    exportProfileLabels: renderExportProfileLabels(exportProfileItems),
    applicablePolicyPacks: renderPolicyPackLabels(policyItems),
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
      const surfaces = sortedUnique([
        ...combineCatalogFields(policyItems, "reportingSurfaces"),
        ...combineOrgAdminField(orgAdminItems, "reportingSurfaces"),
        ...combineCatalogFields(exportProfileItems, "deliveryChannels")
      ]);
      return surfaces.length > 0 ? surfaces : ["report"];
    })(),
    activeOrgAdminProfileId: normalizedString(orgAdminReview.profileId),
    activeOrgAdminProfileLabel: normalizedString(orgAdminReview.profileLabel),
    activeOrgAdminOrganizationModel: normalizedString(orgAdminReview.organizationModel),
    activeOrgAdminRoleBundle: normalizedString(orgAdminReview.roleBundle),
    activeOrgAdminCategories: Array.isArray(orgAdminReview.categories) ? orgAdminReview.categories : [],
    activeOrgAdminDecisionBindings: Array.isArray(orgAdminReview.bindingLabels) ? orgAdminReview.bindingLabels : [],
    activeOrgAdminDecisionActorRoles: Array.isArray(orgAdminReview.decisionActorRoles) ? orgAdminReview.decisionActorRoles : [],
    activeOrgAdminDecisionSurfaces: Array.isArray(orgAdminReview.decisionSurfaces) ? orgAdminReview.decisionSurfaces : [],
    activeOrgAdminBoundaryRequirements: Array.isArray(orgAdminReview.boundaryRequirements) ? orgAdminReview.boundaryRequirements : [],
    activeOrgAdminInputKeys: Array.isArray(orgAdminReview.inputKeys) ? orgAdminReview.inputKeys : [],
    activeOrgAdminDirectoryMappings: Array.isArray(orgAdminReview.directoryMappings) ? orgAdminReview.directoryMappings : [],
    activeOrgAdminExceptionProfiles: Array.isArray(orgAdminReview.exceptionProfiles) ? orgAdminReview.exceptionProfiles : [],
    activeOrgAdminOverlayProfiles: Array.isArray(orgAdminReview.overlayProfiles) ? orgAdminReview.overlayProfiles : [],
    activeOrgAdminInputValues: Array.isArray(orgAdminReview.inputValueLines) ? orgAdminReview.inputValueLines : [],
    activeOrgAdminPendingReviews: Number(orgAdminReview.pendingCount || 0) || 0,
    activeOrgAdminArtifactEvents: Array.isArray(orgAdminArtifacts.eventLabels) ? orgAdminArtifacts.eventLabels : [],
    activeOrgAdminArtifactEvidence: Array.isArray(orgAdminArtifacts.evidenceKinds) ? orgAdminArtifacts.evidenceKinds : [],
    activeOrgAdminArtifactRetention: Array.isArray(orgAdminArtifacts.retentionClasses) ? orgAdminArtifacts.retentionClasses : [],
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
    recent: sanitizeLines(options.recent),
    actionHints: sanitizeLines([...(Array.isArray(options?.actionHints) ? options.actionHints : []), ...orgAdminReview.actionHints]),
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
  envelope.renderedText = renderGovernedReportEnvelope(envelope);
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

function renderGovernedReportEnvelope(envelope = {}) {
  const lines = [normalizedString(envelope.header, "EpydiosOps governed thread report")];
  lines.push(`Type: ${normalizedString(envelope.reportType, "review")}`);
  lines.push(`Export profile: ${normalizedString(envelope.exportProfile, "operator_review")}`);
  lines.push(`Audience: ${normalizedString(envelope.audience, "operator")}`);
  lines.push(`Retention class: ${normalizedString(envelope.retentionClass, "standard")}`);
  lines.push(`Surface: ${normalizedString(envelope.clientSurface, "vscode")}`);
  lines.push(`${normalizedString(envelope.contextLabel, "Thread")}: ${normalizedString(envelope.contextValue, "-")}`);
  lines.push(`${normalizedString(envelope.subjectLabel, "Session")}: ${normalizedString(envelope.subjectValue, "-")}`);
  lines.push(`Task: ${normalizedString(envelope.taskId, "-")} (${normalizedString(envelope.taskStatus, "-")})`);
  lines.push(`Session: ${normalizedString(envelope.sessionId, "-")} (${normalizedString(envelope.sessionStatus, "-")})`);
  lines.push(`Worker: ${normalizedString(envelope.workerId, "-")} ${normalizedString(envelope.workerType, "-")} ${normalizedString(envelope.workerAdapterId, "-")} ${normalizedString(envelope.workerState, "-")}`);
  lines.push(`Execution mode: ${normalizedString(envelope.executionMode, "-")}`);
  lines.push(`Open approvals: ${Number(envelope.openApprovals || 0) || 0}`);
  lines.push(`Pending proposals: ${Number(envelope.pendingProposalCount || 0) || 0}`);
  lines.push(`Tool actions: ${Number(envelope.toolActionCount || 0) || 0}`);
  lines.push(`Evidence records: ${Number(envelope.evidenceCount || 0) || 0}`);
  if (normalizedString(envelope.summary)) {
    lines.push(`Summary: ${normalizedString(envelope.summary)}`);
  }
  appendSection(lines, "Details:", envelope.details);
  appendSection(lines, "Applicable org-admin profiles:", envelope.applicableOrgAdmins);
  appendSection(lines, "Export profile coverage:", envelope.exportProfileLabels);
  appendSection(lines, "Applicable policy packs:", envelope.applicablePolicyPacks);
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
  appendSection(lines, "Active org-admin categories:", envelope.activeOrgAdminCategories);
  appendSection(lines, "Active org-admin decision bindings:", envelope.activeOrgAdminDecisionBindings);
  appendSection(lines, "Active org-admin decision actor roles:", envelope.activeOrgAdminDecisionActorRoles);
  appendSection(lines, "Active org-admin decision surfaces:", envelope.activeOrgAdminDecisionSurfaces);
  appendSection(lines, "Active org-admin boundary requirements:", envelope.activeOrgAdminBoundaryRequirements);
  appendSection(lines, "Active org-admin input keys:", envelope.activeOrgAdminInputKeys);
  appendSection(lines, "Active org-admin directory sync mappings:", envelope.activeOrgAdminDirectoryMappings);
  appendSection(lines, "Active org-admin exception profiles:", envelope.activeOrgAdminExceptionProfiles);
  appendSection(lines, "Active org-admin overlay profiles:", envelope.activeOrgAdminOverlayProfiles);
  appendSection(lines, "Active org-admin input values:", envelope.activeOrgAdminInputValues);
  appendSection(lines, "Active org-admin artifact events:", envelope.activeOrgAdminArtifactEvents);
  appendSection(lines, "Active org-admin evidence kinds:", envelope.activeOrgAdminArtifactEvidence);
  appendSection(lines, "Active org-admin artifact retention classes:", envelope.activeOrgAdminArtifactRetention);
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
  appendSection(lines, "Recent activity:", envelope.recent);
  appendSection(lines, "Action hints:", envelope.actionHints);
  appendSection(lines, "DLP findings:", envelope.dlpFindings);
  return `${lines.join("\n")}\n`;
}

module.exports = {
  buildGovernedReportEnvelope,
  buildGovernedReportSelectionState,
  buildOrgAdminArtifactProjection,
  buildOrgAdminReviewProjection,
  renderGovernedReportEnvelope
};
