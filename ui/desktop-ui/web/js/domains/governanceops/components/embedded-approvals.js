import {
  chipClassForStatus,
  escapeHTML,
  formatTime,
  renderPanelStateMetric
} from "../../../views/common.js";

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

function capabilityCountLabel(item) {
  const capabilities = Array.isArray(item?.requestedCapabilities) ? item.requestedCapabilities : [];
  if (capabilities.length === 0) {
    return "-";
  }
  return `${capabilities.length} capability${capabilities.length === 1 ? "" : "ies"}`;
}

export function renderGovernanceApprovalSummary(
  target,
  approvalPayload,
  filteredItems,
  pageState,
  selectedRunId = "",
  nativeDecisionItems = []
) {
  if (!target || typeof target !== "object") {
    return;
  }
  const pageItems = Array.isArray(pageState?.items) ? pageState.items : [];
  const nativeItems = Array.isArray(nativeDecisionItems) ? nativeDecisionItems : [];
  const pendingCount = filteredItems.filter(
    (item) => String(item?.status || "").trim().toUpperCase() === "PENDING"
  ).length;
  const expiringSoonCount = filteredItems.filter((item) => {
    const expiresAt = String(item?.expiresAt || "").trim();
    if (!expiresAt) {
      return false;
    }
    const deltaMs = new Date(expiresAt).getTime() - Date.now();
    return Number.isFinite(deltaMs) && deltaMs > 0 && deltaMs <= 15 * 60 * 1000;
  }).length;
  const approvalStateSummary = nativeItems.length > 0
    ? "Resolve the pinned decisions first so the current request and any held follow-up work stay aligned."
    : pendingCount > 0
      ? "The current request is clear, but queued approvals still need review in this scope."
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
        <span class="${approvalStateTone}">${escapeHTML(nativeItems.length > 0 ? "pinned review pending" : pendingCount > 0 ? "queue pending" : "clear")}</span>
      </div>
      <div class="meta">${escapeHTML(approvalStateSummary)}</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">pinned=${escapeHTML(String(nativeItems.length))}</span>
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
      const isGatewayHold = String(item?.decisionType || "").trim().toLowerCase() === "gateway_hold";
      const title = isGatewayHold
        ? "Held Request"
        : item?.decisionType === "proposal"
          ? "Current Request Proposal"
          : "Current Request Approval";
      const identifier = isGatewayHold
        ? String(item?.approvalId || "-")
        : item?.decisionType === "proposal"
          ? String(item?.proposalId || "-")
          : String(item?.checkpointId || "-");
      const secondary = isGatewayHold
        ? String(
            item?.summary ||
            item?.reason ||
            item?.governanceTarget?.targetRef ||
            "No held request summary captured."
          )
        : item?.decisionType === "proposal"
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
            <span class="chip chip-neutral chip-compact">${escapeHTML(isGatewayHold ? "client" : "request")}=${escapeHTML(
              isGatewayHold
                ? String(item?.sourceClient?.name || item?.sourceClient?.id || item?.clientLabel || "-")
                : String(item?.taskId || "-")
            )}</span>
            <span class="chip chip-neutral chip-compact">${escapeHTML(isGatewayHold ? "runId" : "session")}=${escapeHTML(
              isGatewayHold ? String(item?.runId || "-") : String(item?.sessionId || "-")
            )}</span>
            <span class="chip chip-neutral chip-compact">${escapeHTML(
              isGatewayHold ? "approvalId" : item?.decisionType === "proposal" ? "proposal" : "checkpoint"
            )}=${escapeHTML(identifier)}</span>
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
          <div class="title">Pinned Decisions</div>
          <span class="chip chip-danger chip-compact">pending=${escapeHTML(String(nativeItems.length))}</span>
        </div>
        <div class="meta">These decisions stay pinned here so review, follow-through, and handoff remain in one place.</div>
        <div class="agent-approval-list">${nativeCards}</div>
      </div>
    `
    : "";

  if (filteredItems.length === 0 && !nativeCards) {
    const warning = approvalPayload?.warning
      ? renderPanelStateMetric("warn", "Approvals Source", approvalPayload.warning)
      : "";
    target.innerHTML = `${approvalStateBlock}${warning}${renderPanelStateMetric(
      "empty",
      "Pending Approvals",
      "No pending approvals match current filters.",
      "Current thread decisions and queue approvals are both clear for this scope."
    )}`;
    return;
  }

  const warning = approvalPayload?.warning
    ? renderPanelStateMetric("warn", "Approvals Source", approvalPayload.warning)
    : "";
  const cards = pageItems
    .map((item) => {
      const status = String(item?.status || "").toUpperCase();
      const ttl = ttlInfo(item?.expiresAt);
      const capabilitiesLabel = capabilityCountLabel(item);
      const runId = String(item?.runId || "").trim();
      const isSelected = selectedRunId && runId === selectedRunId;
      return `
        <article class="agent-approval-card ${isSelected ? "is-selected" : ""}">
          <div class="metric-title-row">
            <div class="title">${escapeHTML(runId || "unknown run")}</div>
            <span class="${escapeHTML(ttl.chipClass)}">${escapeHTML(ttl.label)}</span>
          </div>
          <div class="meta">${escapeHTML(String(item?.tenantId || "-"))} / ${escapeHTML(String(item?.projectId || "-"))}</div>
          <div class="run-detail-chips">
            <span class="${chipClassForStatus(status)} chip-compact">${escapeHTML(status || "-")}</span>
            <span class="chip chip-neutral chip-compact">tier=${escapeHTML(String(item?.tier || "-"))}</span>
            <span class="chip chip-neutral chip-compact">profile=${escapeHTML(String(item?.targetExecutionProfile || "-"))}</span>
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

  target.innerHTML = `${approvalStateBlock}${nativeBlock}${queueBlock}`;
}
