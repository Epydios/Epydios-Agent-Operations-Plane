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

function ttlInfo(expiresAt) {
  if (!expiresAt) {
    return {
      label: "-",
      chipClass: "chip chip-warn chip-compact",
      expiresAtLabel: "-",
      expired: false
    };
  }
  const ts = new Date(expiresAt).getTime();
  if (!Number.isFinite(ts)) {
    return {
      label: "-",
      chipClass: "chip chip-warn chip-compact",
      expiresAtLabel: "-",
      expired: false
    };
  }
  const deltaMs = ts - Date.now();
  if (deltaMs <= 0) {
    return {
      label: "expired",
      chipClass: "chip chip-danger chip-compact",
      expiresAtLabel: formatTime(expiresAt),
      expired: true
    };
  }
  const totalSeconds = Math.floor(deltaMs / 1000);
  let label = `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    label = `${hours}h ${remMinutes}m`;
  } else {
    label = `${minutes}m ${seconds}s`;
  }

  let chipClass = "chip chip-ok chip-compact";
  if (totalSeconds <= 300) {
    chipClass = "chip chip-danger chip-compact";
  } else if (totalSeconds <= 900) {
    chipClass = "chip chip-warn chip-compact";
  }

  return {
    label,
    chipClass,
    expiresAtLabel: formatTime(expiresAt),
    expired: false
  };
}

function filterApprovals(items, filters) {
  const timeBounds = resolveTimeBounds(filters.timeRange, filters.timeFrom, filters.timeTo);
  const filtered = (items || []).filter((item) => {
    if (!containsCaseInsensitive(item.tenantId, filters.tenant)) {
      return false;
    }
    if (!containsCaseInsensitive(item.projectId, filters.project)) {
      return false;
    }
    if (filters.status && String(item.status || "").toUpperCase() !== filters.status) {
      return false;
    }
    if (!withinTimeBounds(item?.createdAt || item?.expiresAt || "", timeBounds)) {
      return false;
    }
    return true;
  });

  const sortBy = String(filters.sortBy || "ttl_asc").trim().toLowerCase();
  const sorted = filtered.slice();
  sorted.sort((a, b) => {
    const aExp = new Date(a?.expiresAt || 0).getTime();
    const bExp = new Date(b?.expiresAt || 0).getTime();
    const aCreated = new Date(a?.createdAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || 0).getTime();
    const aStatus = String(a?.status || "").toUpperCase();
    const bStatus = String(b?.status || "").toUpperCase();
    switch (sortBy) {
      case "ttl_desc":
        return (Number.isFinite(bExp) ? bExp : 0) - (Number.isFinite(aExp) ? aExp : 0);
      case "created_desc":
        return (Number.isFinite(bCreated) ? bCreated : 0) - (Number.isFinite(aCreated) ? aCreated : 0);
      case "status":
        return aStatus.localeCompare(bStatus);
      case "ttl_asc":
      default:
        return (Number.isFinite(aExp) ? aExp : 0) - (Number.isFinite(bExp) ? bExp : 0);
    }
  });
  return sorted;
}

export function readApprovalFilters(ui) {
  const parsedTTL = parsePositiveInt(String(ui.approvalsTTLSeconds?.value || ""), 900, 60, 86400);
  const pageSize = parsePositiveInt(ui.approvalsPageSize?.value, 25, 1, 500);
  const page = parsePositiveInt(ui.approvalsPage?.value, 1, 1, 999999);
  return {
    tenant: String(ui.approvalsTenantFilter?.value || "").trim(),
    project: String(ui.approvalsProjectFilter?.value || "").trim(),
    status: String(ui.approvalsStatusFilter?.value || "").trim().toUpperCase(),
    sortBy: String(ui.approvalsSort?.value || "").trim().toLowerCase() || "ttl_asc",
    ttlSeconds: parsedTTL,
    timeRange: String(ui.approvalsTimeRange?.value || "").trim().toLowerCase(),
    timeFrom: String(ui.approvalsTimeFrom?.value || "").trim(),
    timeTo: String(ui.approvalsTimeTo?.value || "").trim(),
    pageSize,
    page,
    limit: Math.max(500, pageSize * page)
  };
}

export function renderApprovalFeedback(ui, tone, message) {
  if (!ui.approvalsFeedback) {
    return;
  }
  const title = tone === "error" ? "Approval decision failed" : tone === "ok" ? "Approval decision submitted" : "Approvals";
  const state = tone === "error" ? "error" : tone === "ok" ? "success" : tone === "warn" ? "warn" : "info";
  ui.approvalsFeedback.innerHTML = renderPanelStateMetric(state, title, message || "");
}

function capabilityCountLabel(item) {
  const capabilities = Array.isArray(item?.requestedCapabilities) ? item.requestedCapabilities : [];
  if (capabilities.length === 0) {
    return "-";
  }
  return `${capabilities.length} capability${capabilities.length === 1 ? "" : "ies"}`;
}

export function renderApprovals(ui, store, approvalPayload, filters, selectedRunId = "") {
  const allItems = Array.isArray(approvalPayload?.items) ? approvalPayload.items : [];
  store.setApprovalItems(allItems);
  const filteredItems = filterApprovals(allItems, filters);
  const pageState = paginateItems(filteredItems, filters?.pageSize, filters?.page);
  const pageItems = pageState.items;
  if (ui.approvalsPage) {
    ui.approvalsPage.value = String(pageState.page);
  }
  if (ui.approvalsPageSize) {
    ui.approvalsPageSize.value = String(pageState.pageSize);
  }

  if (filteredItems.length === 0) {
    const warning = approvalPayload?.warning
      ? renderPanelStateMetric("warn", "Approvals Source", approvalPayload.warning)
      : "";
    ui.approvalsContent.innerHTML = `${warning}${renderPanelStateMetric(
      "empty",
      "Approvals Queue",
      "No approval requests match current filters.",
      "Adjust status, scope, or time filters, then click Apply."
    )}`;
    if (ui.approvalsDetailContent) {
      ui.approvalsDetailContent.innerHTML = renderPanelStateMetric(
        "info",
        "Approval Detail",
        "Select an approval row to review requested capabilities and decision controls."
      );
      delete ui.approvalsDetailContent.dataset.selectedRunId;
    }
    return;
  }

  const warning = approvalPayload?.warning
    ? renderPanelStateMetric("warn", "Approvals Source", approvalPayload.warning)
    : "";

  const rows = pageItems
    .map((item) => {
      const status = String(item.status || "").toUpperCase();
      const ttl = ttlInfo(item.expiresAt);
      const capabilitiesLabel = capabilityCountLabel(item);
      const runId = String(item.runId || "").trim();
      const isSelected = selectedRunId && runId === selectedRunId;
      const toggleMarker = isSelected ? "v" : ">";
      const reviewButton = `
        <button
          class="btn btn-primary btn-small approval-review-run"
          data-approval-select-run-id="${escapeHTML(item.runId || "")}"
          aria-controls="approvals-detail-content"
          aria-expanded="${isSelected ? "true" : "false"}"
        >${isSelected ? "Hide Detail" : "Review Approval"}</button>
      `;
      const openRunButton = `
        <button
          class="btn btn-secondary btn-small approval-open-run"
          data-approval-open-run-id="${escapeHTML(item.runId || "")}"
        >Open Run Detail</button>
      `;
      const actions = `
        <div class="approval-actions action-hierarchy">
          <div class="action-group action-group-primary">${reviewButton}</div>
          <div class="action-group action-group-secondary">${openRunButton}</div>
        </div>
      `;

      return `
        <tr${isSelected ? ' class="settings-row-focus"' : ""}>
          ${tableCell(
            "Run ID",
            `
            <button class="row-action approval-row-action" type="button" data-approval-select-run-id="${escapeHTML(runId)}" aria-controls="approvals-detail-content" aria-expanded="${isSelected ? "true" : "false"}">
              <span class="approval-row-toggle">${escapeHTML(toggleMarker)}</span>
              <span>${escapeHTML(item.runId || "-")}</span>
            </button>
          `
          )}
          ${tableCell("Tenant", escapeHTML(item.tenantId || "-"))}
          ${tableCell("Project", escapeHTML(item.projectId || "-"))}
          ${tableCell("Tier", escapeHTML(String(item.tier || "-")))}
          ${tableCell("Profile", escapeHTML(item.targetExecutionProfile || "-"))}
          ${tableCell(
            "TTL",
            `
            <span class="${escapeHTML(ttl.chipClass)}">${escapeHTML(ttl.label)}</span>
            <div class="meta">${escapeHTML(ttl.expiresAtLabel)}</div>
          `
          )}
          ${tableCell("Status", `<span class="${chipClassForStatus(status)} chip-compact">${escapeHTML(status || "-")}</span>`)}
          ${tableCell("Capabilities", escapeHTML(capabilitiesLabel))}
          ${tableCell("Actions", actions)}
        </tr>
      `;
    })
    .join("");

  ui.approvalsContent.innerHTML = `
    ${warning}
    <div class="table-meta-row">
      <span class="chip chip-neutral chip-compact">matches=${escapeHTML(String(pageState.totalItems))}</span>
      <span class="chip chip-neutral chip-compact">page=${escapeHTML(String(pageState.page))}/${escapeHTML(String(pageState.totalPages))}</span>
      <button class="btn btn-secondary btn-small" type="button" data-approvals-page-action="prev" ${pageState.page <= 1 ? "disabled" : ""}>Prev</button>
      <button class="btn btn-secondary btn-small" type="button" data-approvals-page-action="next" ${pageState.page >= pageState.totalPages ? "disabled" : ""}>Next</button>
    </div>
    <table class="data-table approvals-table">
      <caption class="sr-only">Approval decision queue table for the current approval filters, including run identity, scope, tier, profile, TTL, status, and actions.</caption>
      <thead>
        <tr>
          <th scope="col">Run ID</th>
          <th scope="col">Tenant</th>
          <th scope="col">Project</th>
          <th scope="col">Tier</th>
          <th scope="col">Profile</th>
          <th scope="col">TTL</th>
          <th scope="col">Status</th>
          <th scope="col">Capabilities</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export function renderApprovalsDetail(ui, approval) {
  if (!ui.approvalsDetailContent) {
    return;
  }
  if (!approval || typeof approval !== "object") {
    ui.approvalsDetailContent.innerHTML = renderPanelStateMetric(
      "info",
      "Approval Detail",
      "Select an approval row to review requested capabilities and decision controls."
    );
    delete ui.approvalsDetailContent.dataset.selectedRunId;
    return;
  }
  const runId = String(approval?.runId || "").trim();
  const status = String(approval?.status || "").trim().toUpperCase();
  const ttl = ttlInfo(approval?.expiresAt);
  const capabilities = Array.isArray(approval?.requestedCapabilities)
    ? approval.requestedCapabilities
    : [];
  const rawApprovalRecord = JSON.stringify(approval || {}, null, 2);
  const capabilityRows = capabilities.length
    ? capabilities.map((value) => `<li>${escapeHTML(value)}</li>`).join("")
    : "<li>None specified.</li>";
  const statusChip = chipClassForStatus(status);
  const actionable = status === "PENDING" && !ttl.expired;
  const scopeLabel = `${String(approval?.tenantId || "").trim() || "-"}/${String(approval?.projectId || "").trim() || "-"}`;
  const traceabilityMetric = renderTraceabilityMetric(
    "1A. Decision Traceability",
    [
      { label: "source", value: "approval-queue" },
      { label: "scope", value: scopeLabel },
      { label: "runId", value: runId || "-" },
      { label: "recordStatus", value: status || "UNKNOWN", tone: actionable ? "ok" : ttl.expired ? "danger" : "warn" }
    ],
    "Use these identifiers when handing off or verifying the resulting decision record.",
    [
      `createdAt=${formatTime(approval?.createdAt)}`,
      `expiresAt=${ttl.expiresAtLabel}`,
      `reasonRequired=true; operatorDecisionSurface=approval-detail`
    ]
  );
  const guardrails = [
    actionable
      ? "Decision controls are active because the request is pending and still within TTL."
      : `Decision controls are locked because status=${status || "UNKNOWN"} or the TTL is no longer actionable.`,
    ttl.expired
      ? `Approval expired at ${ttl.expiresAtLabel}; review historical context only.`
      : `Approval expires at ${ttl.expiresAtLabel}; complete the decision before TTL reaches zero.`,
    "Decision reason is required and becomes audit context for approve or deny actions.",
    capabilities.length > 0
      ? `Requested capabilities listed=${capabilities.length}; confirm each one is necessary before approving.`
      : "No requested capabilities were supplied; verify the related run detail before deciding."
  ];
  if (runId) {
    ui.approvalsDetailContent.dataset.selectedRunId = runId;
  }
  ui.approvalsDetailContent.innerHTML = `
    <div class="metric">
      <div class="metric-title-row">
        <div class="title focus-anchor" tabindex="-1" data-focus-anchor="approval-detail">1. Decision Context</div>
        <span class="${statusChip} chip-compact">status=${escapeHTML(status || "UNKNOWN")}</span>
        <span class="${escapeHTML(ttl.chipClass)}">${escapeHTML(`ttl=${ttl.label}`)}</span>
      </div>
      <div class="meta metric-note">Review operator context first so the decision is tied to the correct run, scope, and expiry window.</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">runId=${escapeHTML(runId || "-")}</span>
        <span class="chip chip-neutral chip-compact">tenant=${escapeHTML(approval?.tenantId || "-")}</span>
        <span class="chip chip-neutral chip-compact">project=${escapeHTML(approval?.projectId || "-")}</span>
        <span class="chip chip-neutral chip-compact">tier=${escapeHTML(String(approval?.tier || "-"))}</span>
        <span class="chip chip-neutral chip-compact">profile=${escapeHTML(approval?.targetExecutionProfile || "-")}</span>
        <span class="chip chip-neutral chip-compact">capabilities=${escapeHTML(String(capabilities.length))}</span>
      </div>
      <div class="meta">expiresAt=${escapeHTML(ttl.expiresAtLabel)}; createdAt=${escapeHTML(formatTime(approval?.createdAt))}</div>
      <div class="meta">reason=${escapeHTML(String(approval?.reason || "").trim() || "-")}</div>
    </div>
    ${traceabilityMetric}
    <div class="metric">
      <div class="title">2. Requested Capabilities</div>
      <div class="meta metric-note">Confirm the capability scope matches the requested operation before making a decision.</div>
      <ul class="quickstart-list">${capabilityRows}</ul>
    </div>
    <div class="metric">
      <div class="title">3. Decision Guardrails</div>
      <div class="meta metric-note">Guardrails come before actions. If any guardrail fails, stop and review the related run detail.</div>
      <ul class="workflow-guide-list">${guardrails.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
      <div class="field">
        <span class="label">Decision Reason</span>
        <input id="approval-detail-reason" class="filter-input" type="text" placeholder="required; explain why approve or deny is justified" />
      </div>
      <div class="approval-actions action-hierarchy">
        <div class="action-group action-group-primary">
          <button
            class="btn btn-ok btn-small"
            type="button"
            data-approval-detail-run-id="${escapeHTML(runId)}"
            data-approval-detail-decision="APPROVE"
            ${actionable ? "" : "disabled"}
          >Approve</button>
        </div>
        <div class="action-group action-group-secondary">
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-approval-open-run-id="${escapeHTML(runId)}"
          >Open Run Detail</button>
        </div>
        <div class="action-group action-group-destructive">
          <button
            class="btn btn-danger btn-small"
            type="button"
            data-approval-detail-run-id="${escapeHTML(runId)}"
            data-approval-detail-decision="DENY"
            ${actionable ? "" : "disabled"}
          >Deny</button>
        </div>
      </div>
    </div>
    <div class="metric" data-advanced-section="approvals">
      <div class="title">4. Approval Record</div>
      <div class="meta metric-note">Use the raw approval record only after the context and guardrail sections above.</div>
      <details class="artifact-panel" data-detail-key="approvals.raw_record">
        <summary>Show raw approval record</summary>
        <pre class="monospace">${escapeHTML(rawApprovalRecord)}</pre>
      </details>
    </div>
  `;
}
