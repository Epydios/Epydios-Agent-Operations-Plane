import {
  chipClassForStatus,
  containsCaseInsensitive,
  escapeHTML,
  formatTime,
  paginateItems,
  parsePositiveInt,
  resolveTimeBounds,
  withinTimeBounds
} from "./common.js";

function ttlInfo(expiresAt) {
  if (!expiresAt) {
    return {
      label: "-",
      chipClass: "chip chip-warn chip-compact",
      expiresAtLabel: "-"
    };
  }
  const ts = new Date(expiresAt).getTime();
  if (!Number.isFinite(ts)) {
    return {
      label: "-",
      chipClass: "chip chip-warn chip-compact",
      expiresAtLabel: "-"
    };
  }
  const deltaMs = ts - Date.now();
  if (deltaMs <= 0) {
    return {
      label: "expired",
      chipClass: "chip chip-danger chip-compact",
      expiresAtLabel: formatTime(expiresAt)
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
    expiresAtLabel: formatTime(expiresAt)
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
  ui.approvalsFeedback.innerHTML = `
    <div class="metric">
      <div class="title">${escapeHTML(title)}</div>
      <div class="meta">${escapeHTML(message || "")}</div>
    </div>
  `;
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
      ? `<div class="metric"><div class="meta">${escapeHTML(approvalPayload.warning)}</div></div>`
      : "";
    ui.approvalsContent.innerHTML = `${warning}<div class="metric"><div class="meta">No approval requests match current filters. Adjust status/time scope and click Apply.</div></div>`;
    if (ui.approvalsDetailContent) {
      ui.approvalsDetailContent.innerHTML = '<div class="metric"><div class="meta">Select an approval row to review requested capabilities and decision controls.</div></div>';
      delete ui.approvalsDetailContent.dataset.selectedRunId;
    }
    return;
  }

  const warning = approvalPayload?.warning
    ? `<div class="metric"><div class="meta">${escapeHTML(approvalPayload.warning)}</div></div>`
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
          class="btn btn-secondary btn-small approval-review-run"
          data-approval-select-run-id="${escapeHTML(item.runId || "")}"
        >${isSelected ? "Hide" : "Review"}</button>
      `;
      const openRunButton = `
        <button
          class="btn btn-secondary btn-small approval-open-run"
          data-approval-open-run-id="${escapeHTML(item.runId || "")}"
        >Open Run</button>
      `;
      const actions = `<div class="approval-actions">${reviewButton}${openRunButton}</div>`;

      return `
        <tr${isSelected ? ' class="settings-row-focus"' : ""}>
          <td>
            <button class="row-action approval-row-action" type="button" data-approval-select-run-id="${escapeHTML(runId)}">
              <span class="approval-row-toggle">${escapeHTML(toggleMarker)}</span>
              <span>${escapeHTML(item.runId || "-")}</span>
            </button>
          </td>
          <td>${escapeHTML(item.tenantId || "-")}</td>
          <td>${escapeHTML(item.projectId || "-")}</td>
          <td>${escapeHTML(String(item.tier || "-"))}</td>
          <td>${escapeHTML(item.targetExecutionProfile || "-")}</td>
          <td>
            <span class="${escapeHTML(ttl.chipClass)}">${escapeHTML(ttl.label)}</span>
            <div class="meta">${escapeHTML(ttl.expiresAtLabel)}</div>
          </td>
          <td><span class="${chipClassForStatus(status)} chip-compact">${escapeHTML(status || "-")}</span></td>
          <td>${escapeHTML(capabilitiesLabel)}</td>
          <td>${actions}</td>
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
    <table class="approvals-table">
      <thead>
        <tr>
          <th>Run ID</th>
          <th>Tenant</th>
          <th>Project</th>
          <th>Tier</th>
          <th>Profile</th>
          <th>TTL</th>
          <th>Status</th>
          <th>Capabilities</th>
          <th>Actions</th>
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
    ui.approvalsDetailContent.innerHTML = '<div class="metric"><div class="meta">Select an approval row to review requested capabilities and decision controls.</div></div>';
    delete ui.approvalsDetailContent.dataset.selectedRunId;
    return;
  }
  const runId = String(approval?.runId || "").trim();
  const status = String(approval?.status || "").trim().toUpperCase();
  const ttl = ttlInfo(approval?.expiresAt);
  const capabilities = Array.isArray(approval?.requestedCapabilities)
    ? approval.requestedCapabilities
    : [];
  const capabilityRows = capabilities.length
    ? capabilities.map((value) => `<li>${escapeHTML(value)}</li>`).join("")
    : "<li>None specified.</li>";
  const statusChip = chipClassForStatus(status);
  const pending = status === "PENDING";
  if (runId) {
    ui.approvalsDetailContent.dataset.selectedRunId = runId;
  }
  ui.approvalsDetailContent.innerHTML = `
    <div class="metric">
      <div class="title">Approval Detail: ${escapeHTML(runId || "-")}</div>
      <div class="meta">tenant=${escapeHTML(approval?.tenantId || "-")}; project=${escapeHTML(approval?.projectId || "-")}; tier=${escapeHTML(String(approval?.tier || "-"))}; profile=${escapeHTML(approval?.targetExecutionProfile || "-")}</div>
      <div class="meta">status=<span class="${statusChip} chip-compact">${escapeHTML(status || "-")}</span>; ttl=<span class="${escapeHTML(ttl.chipClass)}">${escapeHTML(ttl.label)}</span>; expiresAt=${escapeHTML(ttl.expiresAtLabel)}</div>
      <div class="meta">reason=${escapeHTML(String(approval?.reason || "").trim() || "-")}</div>
    </div>
    <div class="metric">
      <div class="title">Requested Capabilities</div>
      <ul class="quickstart-list">${capabilityRows}</ul>
    </div>
    <div class="metric">
      <div class="title">Decision</div>
      <div class="field">
        <span class="label">Decision Reason</span>
        <input id="approval-detail-reason" class="filter-input" type="text" placeholder="required for audit context" />
      </div>
      <div class="approval-actions">
        <button
          class="btn btn-ok btn-small"
          type="button"
          data-approval-detail-run-id="${escapeHTML(runId)}"
          data-approval-detail-decision="APPROVE"
          ${pending ? "" : "disabled"}
        >Approve</button>
        <button
          class="btn btn-danger btn-small"
          type="button"
          data-approval-detail-run-id="${escapeHTML(runId)}"
          data-approval-detail-decision="DENY"
          ${pending ? "" : "disabled"}
        >Deny</button>
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-approval-open-run-id="${escapeHTML(runId)}"
        >Open Run</button>
      </div>
    </div>
  `;
}
