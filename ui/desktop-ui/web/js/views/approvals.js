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
  const title = tone === "error" ? "Approval decision failed" : tone === "ok" ? "Approval decision submitted" : "Pending Approvals";
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

function isNativeDecision(item) {
  return Boolean(item && typeof item === "object" && String(item?.selectionId || "").trim().startsWith("native:"));
}

function buildNativeDecisionReviewModel(item) {
  const status = String(item?.status || "PENDING").trim().toUpperCase();
  const decisionType = String(item?.decisionType || "checkpoint").trim().toLowerCase();
  const isProposal = decisionType === "proposal";
  const identifierLabel = isProposal ? "proposalId" : "checkpointId";
  const identifierValue = isProposal ? String(item?.proposalId || "").trim() : String(item?.checkpointId || "").trim();
  const summary = String(item?.summary || item?.reason || "").trim();
  const actionable = status === "PENDING";
  return {
    approval: item,
    runId: "",
    status,
    ttl: {
      label: "-",
      chipClass: "chip chip-neutral chip-compact",
      expiresAtLabel: "-",
      expired: false
    },
    capabilities: [],
    rawApprovalRecord: JSON.stringify(item || {}, null, 2),
    capabilityRows: summary ? `<li>${escapeHTML(summary)}</li>` : "<li>No decision summary captured.</li>",
    statusChip: chipClassForStatus(status),
    actionable,
    scopeLabel: `${String(item?.tenantId || "-")}/${String(item?.projectId || "-")}`,
    traceabilityMetric: renderTraceabilityMetric(
      "1A. Decision Traceability",
      [
        { label: "source", value: String(item?.source || "native-session") },
        { label: "thread", value: String(item?.taskId || "-") },
        { label: "session", value: String(item?.sessionId || "-") },
        { label: "recordStatus", value: status || "UNKNOWN", tone: actionable ? "ok" : "warn" }
      ],
      "Use these identifiers when reviewing the current thread from the Agent workspace.",
      [
        `createdAt=${formatTime(item?.createdAt)}`,
        `${identifierLabel}=${identifierValue || "-"}`,
        `reasonOptional=true; operatorDecisionSurface=agent-approval-review`
      ]
    ),
    guardrails: [
      actionable
        ? "Decision controls are active because the current thread still has a pending governed decision."
        : `Decision controls are locked because status=${status || "UNKNOWN"}.`,
      "Decision reason is optional here; if omitted, the review surface submits a default audit note showing the action came from the pinned Agent review.",
      isProposal
        ? "Confirm the proposal summary and command are appropriate before approval."
        : "Confirm the checkpoint reason and scope match the current thread state before approval."
    ],
    detailTitle: isProposal ? "Tool Proposal" : "Approval Checkpoint",
    identifierLabel,
    identifierValue: identifierValue || "-",
    detailSummary: summary || "No decision summary captured.",
    selectionId: String(item?.selectionId || "").trim(),
    decisionType,
    sessionId: String(item?.sessionId || "").trim(),
    proposalId: String(item?.proposalId || "").trim(),
    checkpointId: String(item?.checkpointId || "").trim(),
    hasInlineDecision: true
  };
}

function buildApprovalReviewModel(approval) {
  if (!approval || typeof approval !== "object") {
    return null;
  }
  if (isNativeDecision(approval)) {
    return buildNativeDecisionReviewModel(approval);
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
      `reasonRequired=true; operatorDecisionSurface=approval-review-inline-or-run-detail`
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
  return {
    approval,
    runId,
    status,
    ttl,
    capabilities,
    rawApprovalRecord,
    capabilityRows,
    statusChip,
    actionable,
    scopeLabel,
    traceabilityMetric,
    guardrails
  };
}

export function renderApprovals(ui, store, approvalPayload, filters, selectedRunId = "", nativeDecisionItems = []) {
  const allItems = Array.isArray(approvalPayload?.items) ? approvalPayload.items : [];
  store.setApprovalItems(allItems);
  const filteredItems = filterApprovals(allItems, filters);
  const pageState = paginateItems(filteredItems, filters?.pageSize, filters?.page);
  const pageItems = pageState.items;
  const nativeItems = Array.isArray(nativeDecisionItems) ? nativeDecisionItems : [];
  if (ui.approvalsPage) {
    ui.approvalsPage.value = String(pageState.page);
  }
  if (ui.approvalsPageSize) {
    ui.approvalsPageSize.value = String(pageState.pageSize);
  }
  const pendingCount = filteredItems.filter((item) => String(item?.status || "").trim().toUpperCase() === "PENDING").length;
  const expiringSoonCount = filteredItems.filter((item) => {
    const expiresAt = String(item?.expiresAt || "").trim();
    if (!expiresAt) {
      return false;
    }
    const deltaMs = new Date(expiresAt).getTime() - Date.now();
    return Number.isFinite(deltaMs) && deltaMs > 0 && deltaMs <= 15 * 60 * 1000;
  }).length;
  const approvalStateSummary = nativeItems.length > 0
    ? "Resolve current-thread decisions first so active Agent work does not drift away from the governing prompt."
    : pendingCount > 0
      ? "Current thread is clear, but approval-queue items still need review in the active scope."
      : "No pending approvals remain in the current scope.";
  const approvalStateTone = nativeItems.length > 0
    ? "chip chip-danger chip-compact"
    : pendingCount > 0
      ? "chip chip-warn chip-compact"
      : "chip chip-ok chip-compact";
  const approvalStateBlock = `
    <div class="metric approval-state-card">
      <div class="metric-title-row">
        <div class="title">Approval State</div>
        <span class="${approvalStateTone}">${escapeHTML(nativeItems.length > 0 ? "current thread blocked" : pendingCount > 0 ? "queue pending" : "clear")}</span>
      </div>
      <div class="meta">${escapeHTML(approvalStateSummary)}</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">currentThread=${escapeHTML(String(nativeItems.length))}</span>
        <span class="chip chip-neutral chip-compact">queuePending=${escapeHTML(String(pendingCount))}</span>
        <span class="chip chip-neutral chip-compact">expiringSoon=${escapeHTML(String(expiringSoonCount))}</span>
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(selectedRunId || "-")}</span>
      </div>
    </div>
  `;

  const nativeCards = nativeItems
    .map((item) => {
      const status = String(item?.status || "PENDING").trim().toUpperCase();
      const selectionId = String(item?.selectionId || "").trim();
      const isSelected = selectedRunId && selectionId === selectedRunId;
      const title = item?.decisionType === "proposal" ? "Current Thread Proposal" : "Current Thread Approval";
      const identifier = item?.decisionType === "proposal"
        ? String(item?.proposalId || "-")
        : String(item?.checkpointId || "-");
      const secondary = item?.decisionType === "proposal"
        ? String(item?.summary || "No proposal summary captured.")
        : String(item?.reason || item?.summary || "No checkpoint reason captured.");
      return `
        <article class="agent-approval-card ${isSelected ? "is-selected" : ""}">
          <div class="metric-title-row">
            <div class="title">${escapeHTML(title)}</div>
            <span class="${chipClassForStatus(status)} chip-compact">${escapeHTML(status)}</span>
          </div>
          <div class="meta">${escapeHTML(String(item?.tenantId || "-"))} / ${escapeHTML(String(item?.projectId || "-"))}</div>
          <div class="run-detail-chips">
            <span class="chip chip-neutral chip-compact">thread=${escapeHTML(String(item?.taskId || "-"))}</span>
            <span class="chip chip-neutral chip-compact">session=${escapeHTML(String(item?.sessionId || "-"))}</span>
            <span class="chip chip-neutral chip-compact">${escapeHTML(item?.decisionType === "proposal" ? "proposal" : "checkpoint")}=${escapeHTML(identifier)}</span>
          </div>
          <div class="meta">${escapeHTML(secondary)}</div>
          <div class="approval-actions action-hierarchy">
            <div class="action-group action-group-primary">
              <button
                class="btn btn-ok btn-small approval-review-run"
                data-approval-select-run-id="${escapeHTML(selectionId)}"
                aria-controls="approvals-detail-content"
                aria-expanded="${isSelected ? "true" : "false"}"
              >${isSelected ? "Hide Review" : "Review"}</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  const nativeBlock = nativeCards
    ? `
      <div class="metric">
      <div class="metric-title-row">
          <div class="title">Current Thread Decisions</div>
          <span class="chip chip-danger chip-compact">pending=${escapeHTML(String(nativeItems.length))}</span>
        </div>
        <div class="meta">These governed decisions come from the active native chat thread and stay surfaced in the Agent workspace.</div>
        <div class="agent-approval-list">${nativeCards}</div>
      </div>
    `
    : "";

  if (filteredItems.length === 0 && !nativeCards) {
    const warning = approvalPayload?.warning
      ? renderPanelStateMetric("warn", "Approvals Source", approvalPayload.warning)
      : "";
    ui.approvalsContent.innerHTML = `${approvalStateBlock}${warning}${renderPanelStateMetric(
      "empty",
      "Pending Approvals",
      "No pending approvals match current filters.",
      "Current thread decisions and queue approvals are both clear for this scope."
    )}`;
    if (ui.approvalsDetailContent) {
      ui.approvalsDetailContent.innerHTML = renderPanelStateMetric(
        "info",
        "Approval Review",
        "Pinned approval review appears here when you select a current-thread decision or queue approval."
      );
      delete ui.approvalsDetailContent.dataset.selectedRunId;
    }
    return;
  }

  const warning = approvalPayload?.warning
    ? renderPanelStateMetric("warn", "Approvals Source", approvalPayload.warning)
    : "";
  const cards = pageItems
    .map((item) => {
      const status = String(item.status || "").toUpperCase();
      const ttl = ttlInfo(item.expiresAt);
      const capabilitiesLabel = capabilityCountLabel(item);
      const runId = String(item.runId || "").trim();
      const isSelected = selectedRunId && runId === selectedRunId;
      return `
        <article class="agent-approval-card ${isSelected ? "is-selected" : ""}">
          <div class="metric-title-row">
            <div class="title">${escapeHTML(runId || "unknown run")}</div>
            <span class="${escapeHTML(ttl.chipClass)}">${escapeHTML(ttl.label)}</span>
          </div>
          <div class="meta">${escapeHTML(String(item.tenantId || "-"))} / ${escapeHTML(String(item.projectId || "-"))}</div>
          <div class="run-detail-chips">
            <span class="${chipClassForStatus(status)} chip-compact">${escapeHTML(status || "-")}</span>
            <span class="chip chip-neutral chip-compact">tier=${escapeHTML(String(item.tier || "-"))}</span>
            <span class="chip chip-neutral chip-compact">profile=${escapeHTML(String(item.targetExecutionProfile || "-"))}</span>
            <span class="chip chip-neutral chip-compact">${escapeHTML(capabilitiesLabel)}</span>
          </div>
          <div class="meta">expires=${escapeHTML(ttl.expiresAtLabel)}</div>
          <div class="approval-actions action-hierarchy">
            <div class="action-group action-group-primary">
              <button
                class="btn btn-ok btn-small approval-review-run"
                data-approval-select-run-id="${escapeHTML(runId)}"
                aria-controls="approvals-detail-content"
                aria-expanded="${isSelected ? "true" : "false"}"
              >${isSelected ? "Hide Review" : "Review"}</button>
            </div>
            <div class="action-group action-group-secondary">
              <button
                class="btn btn-secondary btn-small approval-open-run"
                data-approval-open-run-id="${escapeHTML(runId)}"
              >Run Detail</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  const queueBlock = filteredItems.length === 0
    ? renderPanelStateMetric(
        "empty",
        "Pending Approvals",
        "No approval-queue items match current filters.",
        "The current thread may still have pending governed decisions above."
      )
    : `
      <div class="metric">
        <div class="metric-title-row">
          <div class="title">Pending Approvals</div>
          <span class="chip chip-neutral chip-compact">matches=${escapeHTML(String(pageState.totalItems))}</span>
        </div>
        <div class="meta">Queue approvals remain visible here even when current-thread decisions are clear, so nothing in active scope gets orphaned.</div>
        ${warning}
        <div class="table-meta-row agent-approval-summary-row">
          <span class="chip chip-neutral chip-compact">pending=${escapeHTML(String(pendingCount))}</span>
          <span class="chip chip-neutral chip-compact">expiringSoon=${escapeHTML(String(expiringSoonCount))}</span>
          <span class="chip chip-neutral chip-compact">page=${escapeHTML(String(pageState.page))}/${escapeHTML(String(pageState.totalPages))}</span>
          <button class="btn btn-secondary btn-small" type="button" data-approvals-page-action="prev" ${pageState.page <= 1 ? "disabled" : ""}>Prev</button>
          <button class="btn btn-secondary btn-small" type="button" data-approvals-page-action="next" ${pageState.page >= pageState.totalPages ? "disabled" : ""}>Next</button>
        </div>
        <div class="agent-approval-list">${cards}</div>
      </div>
    `;

  ui.approvalsContent.innerHTML = `${approvalStateBlock}${nativeBlock}${queueBlock}`;
}

export function renderApprovalsDetail(ui, approval) {
  if (!ui.approvalsDetailContent) {
    return;
  }
  const model = buildApprovalReviewModel(approval);
  if (!model) {
    ui.approvalsDetailContent.innerHTML = renderPanelStateMetric(
      "info",
      "Approval Review",
      "Select an approval card to keep its decision context pinned in Agent.",
      "Use the pinned review section and run detail from Agent."
    );
    return;
  }
  const selectedRunId = String(model.runId || model.selectionId || "").trim();
  if (selectedRunId) {
    ui.approvalsDetailContent.dataset.selectedRunId = selectedRunId;
  }
  ui.approvalsDetailContent.innerHTML = `
    <div class="metric approval-review-selection">
      <div class="metric-title-row">
        <div class="title focus-anchor" tabindex="-1" data-focus-anchor="approval-detail">Pinned Approval Review</div>
        <span class="${model.statusChip} chip-compact">status=${escapeHTML(model.status || "UNKNOWN")}</span>
        <span class="${escapeHTML(model.ttl.chipClass)}">${escapeHTML(`ttl=${model.ttl.label}`)}</span>
      </div>
      <div class="meta metric-note">${escapeHTML(model.hasInlineDecision ? "Keep the selected current-thread decision pinned here and approve or deny directly from this review surface." : "Keep the selected approval pinned here and use run detail for the underlying record.")}</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">${escapeHTML(model.runId ? "runId" : "thread")}=${escapeHTML(model.runId || model.approval?.taskId || "-")}</span>
        <span class="chip chip-neutral chip-compact">tenant=${escapeHTML(model.approval?.tenantId || "-")}</span>
        <span class="chip chip-neutral chip-compact">project=${escapeHTML(model.approval?.projectId || "-")}</span>
        <span class="chip chip-neutral chip-compact">${escapeHTML(model.identifierLabel || "tier")}=${escapeHTML(model.identifierValue || String(model.approval?.tier || "-"))}</span>
        <span class="chip chip-neutral chip-compact">session=${escapeHTML(model.sessionId || "-")}</span>
        <span class="chip chip-neutral chip-compact">capabilities=${escapeHTML(String(model.capabilities.length))}</span>
      </div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">scope=${escapeHTML(model.scopeLabel || "-")}</span>
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(String(model.approval?.source || (model.hasInlineDecision ? "native-session" : "approval-queue")))}</span>
        <span class="chip chip-neutral chip-compact">created=${escapeHTML(formatTime(model.approval?.createdAt))}</span>
        <span class="chip chip-neutral chip-compact">expires=${escapeHTML(model.ttl.expiresAtLabel)}</span>
      </div>
      <div class="meta">expiresAt=${escapeHTML(model.ttl.expiresAtLabel)}; createdAt=${escapeHTML(formatTime(model.approval?.createdAt))}</div>
      <div class="meta">reason=${escapeHTML(String(model.detailSummary || model.approval?.reason || "").trim() || "-")}</div>
      <div class="meta">Decision controls are ${escapeHTML(model.hasInlineDecision ? "live directly in this pinned review section" : model.actionable ? "not exposed inline for this approval type" : "locked because the approval is no longer actionable")}.</div>
      <div class="approval-actions action-hierarchy">
        ${
          model.hasInlineDecision
            ? `
              <div class="field approval-inline-reason-field">
                <span class="label">Decision Reason (Optional)</span>
                <input
                  class="filter-input"
                  type="text"
                  placeholder="optional; add context or leave blank to use the default rail note"
                  data-native-decision-reason
                />
              </div>
              <div class="action-group action-group-primary">
                <button
                  class="btn btn-ok"
                  type="button"
                  data-native-decision-action="APPROVE"
                  data-native-decision-key="${escapeHTML(model.selectionId || "")}"
                >Approve</button>
              </div>
              <div class="action-group action-group-destructive">
                <button
                  class="btn btn-danger"
                  type="button"
                  data-native-decision-action="DENY"
                  data-native-decision-key="${escapeHTML(model.selectionId || "")}"
                >Deny</button>
              </div>
            `
            : `
              <div class="action-group action-group-secondary">
                <button
                  class="btn btn-secondary"
                  type="button"
                  data-approval-open-run-id="${escapeHTML(model.runId)}"
                >Open Run Detail</button>
              </div>
            `
        }
      </div>
      <div class="meta"><strong>Review Checklist</strong></div>
      <div class="meta metric-note">Requested capabilities and traceability stay visible here while you review the underlying run record.</div>
      <ul class="workflow-guide-list">${model.guardrails.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
      <ul class="quickstart-list">${model.capabilityRows}</ul>
      ${model.runId && !model.hasInlineDecision ? `<div class="meta">Use Run Detail for the underlying approval record and artifact trail.</div>` : ""}
    </div>
  `;
}

export function renderApprovalReviewModal(ui, approval) {
  if (!ui.approvalReviewModalContent) {
    return;
  }
  const model = buildApprovalReviewModel(approval);
  if (!model) {
    ui.approvalReviewModalContent.innerHTML = renderPanelStateMetric(
      "info",
      "Approval Review",
      "Select a pending approval from Agent to inspect its detail if the legacy review surface is still present."
    );
    delete ui.approvalReviewModalContent.dataset.selectedRunId;
    return;
  }
  ui.approvalReviewModalContent.dataset.selectedRunId = model.runId;
  ui.approvalReviewModalContent.innerHTML = `
    <div class="metric">
      <div class="metric-title-row">
        <div class="title focus-anchor" tabindex="-1" data-focus-anchor="approval-review-modal">1. Decision Context</div>
        <span class="${model.statusChip} chip-compact">status=${escapeHTML(model.status || "UNKNOWN")}</span>
        <span class="${escapeHTML(model.ttl.chipClass)}">${escapeHTML(`ttl=${model.ttl.label}`)}</span>
      </div>
      <div class="meta metric-note">Review operator context first so the decision is tied to the correct run, scope, and expiry window.</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">runId=${escapeHTML(model.runId || "-")}</span>
        <span class="chip chip-neutral chip-compact">tenant=${escapeHTML(model.approval?.tenantId || "-")}</span>
        <span class="chip chip-neutral chip-compact">project=${escapeHTML(model.approval?.projectId || "-")}</span>
        <span class="chip chip-neutral chip-compact">tier=${escapeHTML(String(model.approval?.tier || "-"))}</span>
        <span class="chip chip-neutral chip-compact">profile=${escapeHTML(model.approval?.targetExecutionProfile || "-")}</span>
        <span class="chip chip-neutral chip-compact">capabilities=${escapeHTML(String(model.capabilities.length))}</span>
      </div>
      <div class="meta">expiresAt=${escapeHTML(model.ttl.expiresAtLabel)}; createdAt=${escapeHTML(formatTime(model.approval?.createdAt))}</div>
      <div class="meta">reason=${escapeHTML(String(model.approval?.reason || "").trim() || "-")}</div>
    </div>
    ${model.traceabilityMetric}
    <div class="metric">
      <div class="title">2. Requested Capabilities</div>
      <div class="meta metric-note">Confirm the capability scope matches the requested operation before making a decision.</div>
      <ul class="quickstart-list">${model.capabilityRows}</ul>
    </div>
    <div class="metric">
      <div class="title">3. Decision Guardrails</div>
      <div class="meta metric-note">Guardrails come before actions. If any guardrail fails, stop and review the related run detail.</div>
      <ul class="workflow-guide-list">${model.guardrails.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
      <div class="field">
        <span class="label">Decision Reason</span>
        <input
          class="filter-input"
          type="text"
          placeholder="required; explain why approve or deny is justified"
          data-approval-decision-reason
        />
      </div>
      <div class="approval-actions action-hierarchy">
        <div class="action-group action-group-primary">
          <button
            class="btn btn-ok"
            type="button"
            data-approval-detail-run-id="${escapeHTML(model.runId)}"
            data-approval-detail-decision="APPROVE"
            ${model.actionable ? "" : "disabled"}
          >Approve</button>
        </div>
        <div class="action-group action-group-secondary">
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-approval-open-run-id="${escapeHTML(model.runId)}"
          >Open Run Detail</button>
        </div>
        <div class="action-group action-group-destructive">
          <button
            class="btn btn-danger"
            type="button"
            data-approval-detail-run-id="${escapeHTML(model.runId)}"
            data-approval-detail-decision="DENY"
            ${model.actionable ? "" : "disabled"}
          >Deny</button>
        </div>
      </div>
    </div>
    <div class="metric" data-advanced-section="approvals">
      <div class="title">4. Approval Record</div>
      <div class="meta metric-note">Use the raw approval record only after the context and guardrail sections above.</div>
      <details class="artifact-panel" data-detail-key="approvals.raw_record">
        <summary>Show raw approval record</summary>
        <pre class="monospace">${escapeHTML(model.rawApprovalRecord)}</pre>
      </details>
    </div>
  `;
}
