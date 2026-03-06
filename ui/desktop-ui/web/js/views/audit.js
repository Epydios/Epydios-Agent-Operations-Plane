import {
  chipClassForStatus,
  containsCaseInsensitive,
  escapeHTML,
  formatTime,
  paginateItems,
  parsePositiveInt,
  renderPanelStateMetric,
  renderTraceabilityMetric,
  resolveTimeBounds,
  withinTimeBounds
} from "./common.js";

function tableCell(label, content, attrs = "") {
  return `<td data-label="${escapeHTML(label)}"${attrs}>${content}</td>`;
}

export function readAuditFilters(ui) {
  const pageSize = parsePositiveInt(ui.auditPageSize?.value, 25, 1, 500);
  const page = parsePositiveInt(ui.auditPage?.value, 1, 1, 999999);
  return {
    tenant: String(ui.auditTenantFilter.value || "").trim(),
    project: String(ui.auditProjectFilter.value || "").trim(),
    providerId: String(ui.auditProviderFilter.value || "").trim(),
    event: String(ui.auditEventFilter?.value || "").trim(),
    decision: String(ui.auditDecisionFilter.value || "").trim().toUpperCase(),
    timeRange: String(ui.auditTimeRange?.value || "").trim().toLowerCase(),
    timeFrom: String(ui.auditTimeFrom?.value || "").trim(),
    timeTo: String(ui.auditTimeTo?.value || "").trim(),
    page,
    pageSize,
    limit: Math.max(500, pageSize * page)
  };
}

function filterAuditEvents(items, filters) {
  const timeBounds = resolveTimeBounds(filters.timeRange, filters.timeFrom, filters.timeTo);
  return (items || []).filter((item) => {
    if (!containsCaseInsensitive(item.tenantId, filters.tenant)) {
      return false;
    }
    if (!containsCaseInsensitive(item.projectId, filters.project)) {
      return false;
    }
    if (!containsCaseInsensitive(item.providerId, filters.providerId)) {
      return false;
    }
    if (!containsCaseInsensitive(item.event, filters.event)) {
      return false;
    }
    if (filters.decision && String(item.decision || "").toUpperCase() !== filters.decision) {
      return false;
    }
    if (!withinTimeBounds(item?.ts || "", timeBounds)) {
      return false;
    }
    return true;
  });
}

export function getFilteredAuditEvents(auditPayload, filters) {
  return filterAuditEvents(auditPayload?.items || [], filters || {});
}

function summarizeTopValues(items, key, limit = 3) {
  const counts = {};
  for (const item of items || []) {
    const value = String(item?.[key] || "").trim() || "(unknown)";
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildAuditFilingBundle(auditPayload, filters, context = {}) {
  const items = getFilteredAuditEvents(auditPayload, filters).map((item) => ({
    ts: String(item?.ts || "").trim(),
    event: String(item?.event || "").trim(),
    tenantId: String(item?.tenantId || "").trim(),
    projectId: String(item?.projectId || "").trim(),
    providerId: String(item?.providerId || "").trim(),
    decision: String(item?.decision || "").trim().toUpperCase()
  }));

  const allowCount = items.filter((item) => item.decision === "ALLOW").length;
  const denyCount = items.filter((item) => item.decision === "DENY").length;
  const otherCount = items.length - allowCount - denyCount;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      source: String(auditPayload?.source || context.source || "unknown").trim().toLowerCase(),
      warning: String(auditPayload?.warning || "").trim(),
      actor: String(context.actor || "").trim(),
      filters: {
        tenant: String(filters?.tenant || "").trim(),
        project: String(filters?.project || "").trim(),
        providerId: String(filters?.providerId || "").trim(),
        decision: String(filters?.decision || "").trim().toUpperCase(),
        timeRange: String(filters?.timeRange || "").trim().toLowerCase(),
        timeFrom: String(filters?.timeFrom || "").trim(),
        timeTo: String(filters?.timeTo || "").trim()
      },
      matchedCount: items.length
    },
    summary: {
      allowCount,
      denyCount,
      otherCount,
      topEvents: summarizeTopValues(items, "event"),
      topProviders: summarizeTopValues(items, "providerId")
    },
    items
  };
}

export function buildAuditCsv(items) {
  const rows = [
    ["timestamp", "event", "tenantId", "projectId", "providerId", "decision"],
    ...(items || []).map((item) => [
      String(item?.ts || "").trim(),
      String(item?.event || "").trim(),
      String(item?.tenantId || "").trim(),
      String(item?.projectId || "").trim(),
      String(item?.providerId || "").trim(),
      String(item?.decision || "").trim().toUpperCase()
    ])
  ];
  return rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
}

export function buildAuditHandoffText(bundle) {
  const meta = bundle?.meta || {};
  const summary = bundle?.summary || {};
  const topEvents = Array.isArray(summary.topEvents) ? summary.topEvents : [];
  const topProviders = Array.isArray(summary.topProviders) ? summary.topProviders : [];
  const scopeLabel = `${String(meta.filters?.tenant || "").trim() || "-"}/${String(meta.filters?.project || "").trim() || "-"}`;
  const timeRange = String(meta.filters?.timeRange || "").trim() || "any";
  const timeFrom = String(meta.filters?.timeFrom || "").trim() || "-";
  const timeTo = String(meta.filters?.timeTo || "").trim() || "-";

  const eventSummary = topEvents.length
    ? topEvents.map((item) => `${item.value}:${item.count}`).join(", ")
    : "(none)";
  const providerSummary = topProviders.length
    ? topProviders.map((item) => `${item.value}:${item.count}`).join(", ")
    : "(none)";

  return [
    "Epydios AgentOps Desktop Audit Handoff Summary",
    `generatedAt=${String(meta.generatedAt || "").trim() || "-"}`,
    `source=${String(meta.source || "").trim() || "-"}`,
    `actor=${String(meta.actor || "").trim() || "-"}`,
    `scope=${scopeLabel}`,
    `matchedCount=${String(meta.matchedCount ?? 0)}`,
    `filters.tenant=${String(meta.filters?.tenant || "").trim() || "-"}`,
    `filters.project=${String(meta.filters?.project || "").trim() || "-"}`,
    `filters.providerId=${String(meta.filters?.providerId || "").trim() || "-"}`,
    `filters.decision=${String(meta.filters?.decision || "").trim() || "-"}`,
    `filters.timeRange=${timeRange}`,
    `filters.timeFrom=${timeFrom}`,
    `filters.timeTo=${timeTo}`,
    `decisionBreakdown=ALLOW:${String(summary.allowCount ?? 0)};DENY:${String(summary.denyCount ?? 0)};OTHER:${String(summary.otherCount ?? 0)}`,
    `topEvents=${eventSummary}`,
    `topProviders=${providerSummary}`,
    `warning=${String(meta.warning || "").trim() || "-"}`
  ].join("\n");
}

function formatAuditTimeWindow(filters) {
  const range = String(filters?.timeRange || "").trim().toLowerCase();
  if (range) {
    return `range:${range}`;
  }
  const fromValue = String(filters?.timeFrom || "").trim() || "-";
  const toValue = String(filters?.timeTo || "").trim() || "-";
  return fromValue !== "-" || toValue !== "-" ? `${fromValue} -> ${toValue}` : "range:any";
}

export function renderAudit(ui, auditPayload, filters, context = {}) {
  const filteredItems = getFilteredAuditEvents(auditPayload, filters);
  const pageState = paginateItems(filteredItems, filters?.pageSize, filters?.page);
  const items = pageState.items;
  const warning = auditPayload?.warning
    ? renderPanelStateMetric("warn", "Audit Source", auditPayload.warning)
    : "";
  const traceBundle = buildAuditFilingBundle(auditPayload, filters, context);
  const traceabilityMetric = renderTraceabilityMetric(
    "Audit Export Traceability",
    [
      { label: "source", value: traceBundle?.meta?.source || "-" },
      {
        label: "scope",
        value: `${String(traceBundle?.meta?.filters?.tenant || "").trim() || "-"}/${String(traceBundle?.meta?.filters?.project || "").trim() || "-"}`
      },
      { label: "matched", value: String(traceBundle?.meta?.matchedCount ?? 0) },
      { label: "decision", value: String(traceBundle?.meta?.filters?.decision || "").trim() || "ANY" }
    ],
    "Audit export and handoff actions use this scope, source, and actor context when generating evidence.",
    [
      `preparedAt=${formatTime(traceBundle?.meta?.generatedAt)}`,
      `timeWindow=${formatAuditTimeWindow(filters)}`,
      `providerFilter=${String(traceBundle?.meta?.filters?.providerId || "").trim() || "-"}; actor=${String(traceBundle?.meta?.actor || "").trim() || "-"}`
    ]
  );
  if (ui.auditPage) {
    ui.auditPage.value = String(pageState.page);
  }
  if (ui.auditPageSize) {
    ui.auditPageSize.value = String(pageState.pageSize);
  }

  if (filteredItems.length === 0) {
    ui.auditContent.innerHTML = `${warning}${traceabilityMetric}${renderPanelStateMetric(
      "empty",
      "Audit Events",
      "No audit events match current filters.",
      "Clear or adjust scope, provider, event, or decision filters, then click Apply."
    )}`;
    return;
  }

  const rows = items
    .map((item) => {
      const decision = String(item.decision || "").toUpperCase();
      return `
        <tr>
          ${tableCell("Timestamp", escapeHTML(formatTime(item.ts)))}
          ${tableCell("Event", escapeHTML(item.event || "-"))}
          ${tableCell("Tenant", escapeHTML(item.tenantId || "-"))}
          ${tableCell("Project", escapeHTML(item.projectId || "-"))}
          ${tableCell("Provider", escapeHTML(item.providerId || "-"))}
          ${tableCell("Decision", `<span class="${chipClassForStatus(decision || "unknown")}">${escapeHTML(decision || "-")}</span>`)}
        </tr>
      `;
    })
    .join("");

  ui.auditContent.innerHTML = `
    ${warning}
    ${traceabilityMetric}
    <div class="table-meta-row">
      <span class="chip chip-neutral chip-compact">matches=${escapeHTML(String(pageState.totalItems))}</span>
      <span class="chip chip-neutral chip-compact">page=${escapeHTML(String(pageState.page))}/${escapeHTML(String(pageState.totalPages))}</span>
      <button class="btn btn-secondary btn-small" type="button" data-audit-page-action="prev" ${pageState.page <= 1 ? "disabled" : ""}>Prev</button>
      <button class="btn btn-secondary btn-small" type="button" data-audit-page-action="next" ${pageState.page >= pageState.totalPages ? "disabled" : ""}>Next</button>
    </div>
    <table class="data-table audit-table">
      <caption class="sr-only">Audit events table for the current audit filters, including timestamp, event, scope, provider, and decision.</caption>
      <thead>
        <tr>
          <th scope="col">Timestamp</th>
          <th scope="col">Event</th>
          <th scope="col">Tenant</th>
          <th scope="col">Project</th>
          <th scope="col">Provider</th>
          <th scope="col">Decision</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
