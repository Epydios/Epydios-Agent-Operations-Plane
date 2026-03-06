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

function hasValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

function desktopEvidenceStage(run, key, label) {
  const payload = run?.[key];
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const evidence = payload.evidenceBundle || {};
  const windowMetadata = evidence.windowMetadata || {};
  return {
    label,
    decision: payload.decision || "",
    verifierId: payload.verifierId || "",
    reasonCode: payload.reasonCode || "",
    resultCode: evidence.resultCode || "",
    screenshotHash: evidence.screenshotHash || "",
    screenshotUri: evidence.screenshotUri || "",
    windowTitle: windowMetadata.title || ""
  };
}

function buildArtifactEntries(run) {
  const entries = [
    { key: "requestPayload", label: "Request Payload", value: run?.requestPayload },
    { key: "profileResponse", label: "Profile Response", value: run?.profileResponse },
    { key: "policyResponse", label: "Policy Response", value: run?.policyResponse },
    { key: "desktopObserveResponse", label: "Desktop Observe Response", value: run?.desktopObserveResponse },
    { key: "desktopActuateResponse", label: "Desktop Actuate Response", value: run?.desktopActuateResponse },
    { key: "desktopVerifyResponse", label: "Desktop Verify Response", value: run?.desktopVerifyResponse },
    { key: "evidenceRecordResponse", label: "Evidence Record Response", value: run?.evidenceRecordResponse },
    { key: "evidenceBundleResponse", label: "Evidence Bundle Response", value: run?.evidenceBundleResponse },
    { key: "errorMessage", label: "Error Message", value: run?.errorMessage }
  ];
  return entries.filter((entry) => hasValue(entry.value));
}

export function readRunFilters(ui) {
  const parsedLimit = parsePositiveInt(ui.runsLimitFilter?.value, 25, 1, 500);
  const pageSize = parsePositiveInt(ui.runsPageSize?.value, 25, 1, 500);
  const page = parsePositiveInt(ui.runsPage?.value, 1, 1, 999999);
  const timeRange = String(ui.runsTimeRange?.value || "").trim().toLowerCase();
  const timeFrom = String(ui.runsTimeFrom?.value || "").trim();
  const timeTo = String(ui.runsTimeTo?.value || "").trim();
  return {
    runId: String(ui.runsRunIdFilter?.value || "").trim(),
    tenant: String(ui.runsTenantFilter.value || "").trim(),
    project: String(ui.runsProjectFilter.value || "").trim(),
    status: String(ui.runsStatusFilter?.value || "").trim().toUpperCase(),
    decision: String(ui.runsDecisionFilter?.value || "").trim().toUpperCase(),
    sortBy: String(ui.runsSort?.value || "").trim().toLowerCase() || "updated_desc",
    limit: Math.max(parsedLimit, pageSize * page),
    timeRange,
    timeFrom,
    timeTo,
    pageSize,
    page
  };
}

function filterRuns(items, filters) {
  const timeBounds = resolveTimeBounds(filters.timeRange, filters.timeFrom, filters.timeTo);
  const filtered = (items || []).filter((item) => {
    if (!containsCaseInsensitive(item.runId, filters.runId)) {
      return false;
    }
    if (!containsCaseInsensitive(item.tenantId, filters.tenant)) {
      return false;
    }
    if (!containsCaseInsensitive(item.projectId, filters.project)) {
      return false;
    }
    if (filters.status && String(item.status || "").toUpperCase() !== filters.status) {
      return false;
    }
    if (filters.decision && String(item.policyDecision || "").toUpperCase() !== filters.decision) {
      return false;
    }
    const timestamp = item?.updatedAt || item?.createdAt || "";
    if (!withinTimeBounds(timestamp, timeBounds)) {
      return false;
    }
    return true;
  });

  const sortBy = String(filters.sortBy || "updated_desc").trim().toLowerCase();
  const sorted = filtered.slice();
  sorted.sort((a, b) => {
    const aUpdated = new Date(a?.updatedAt || 0).getTime();
    const bUpdated = new Date(b?.updatedAt || 0).getTime();
    const aCreated = new Date(a?.createdAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || 0).getTime();
    const aStatus = String(a?.status || "").toUpperCase();
    const bStatus = String(b?.status || "").toUpperCase();
    switch (sortBy) {
      case "updated_asc":
        return (Number.isFinite(aUpdated) ? aUpdated : 0) - (Number.isFinite(bUpdated) ? bUpdated : 0);
      case "created_desc":
        return (Number.isFinite(bCreated) ? bCreated : 0) - (Number.isFinite(aCreated) ? aCreated : 0);
      case "status":
        return aStatus.localeCompare(bStatus);
      case "updated_desc":
      default:
        return (Number.isFinite(bUpdated) ? bUpdated : 0) - (Number.isFinite(aUpdated) ? aUpdated : 0);
    }
  });
  return sorted;
}

export function renderRuns(ui, store, runPayload, filters) {
  store.setRunItems(runPayload?.items || []);
  const filteredItems = filterRuns(runPayload?.items || [], filters);
  const pageState = paginateItems(filteredItems, filters?.pageSize, filters?.page);
  const items = pageState.items;
  const selectedRunID = String(ui.runDetailContent?.dataset?.selectedRunId || "").trim();
  const hasSelectedRun = selectedRunID.length > 0;
  if (ui.runsPage) {
    ui.runsPage.value = String(pageState.page);
  }
  if (ui.runsPageSize) {
    ui.runsPageSize.value = String(pageState.pageSize);
  }

  if (filteredItems.length === 0) {
    ui.runsContent.innerHTML = '<div class="metric"><div class="meta">No runtime runs match current filters. Adjust scope/time filters and click Apply.</div></div>';
    if (!hasSelectedRun) {
      ui.runDetailContent.innerHTML = "";
    }
    return;
  }

  const rows = items
    .map((item) => {
      const decision = String(item.policyDecision || "").toUpperCase();
      const runId = String(item.runId || "").trim();
      const isSelected = selectedRunID && runId === selectedRunID;
      const toggleMarker = isSelected ? "v" : ">";
      return `
        <tr${isSelected ? ' class="settings-row-focus"' : ""}>
          <td>
            <button class="row-action run-row-action" type="button" data-run-id="${escapeHTML(runId)}">
              <span class="run-row-toggle">${escapeHTML(toggleMarker)}</span>
              <span>${escapeHTML(item.runId || "-")}</span>
            </button>
          </td>
          <td>${escapeHTML(item.tenantId || "-")}</td>
          <td>${escapeHTML(item.projectId || "-")}</td>
          <td><span class="${chipClassForStatus(item.status)} chip-compact">${escapeHTML(item.status || "-")}</span></td>
          <td><span class="${chipClassForStatus(decision)} chip-compact">${escapeHTML(decision || "-")}</span></td>
          <td>${escapeHTML(formatTime(item.createdAt))}</td>
          <td>${escapeHTML(formatTime(item.updatedAt))}</td>
        </tr>
      `;
    })
    .join("");

  ui.runsContent.innerHTML = `
    <div class="table-meta-row">
      <span class="chip chip-neutral chip-compact">matches=${escapeHTML(String(pageState.totalItems))}</span>
      <span class="chip chip-neutral chip-compact">page=${escapeHTML(String(pageState.page))}/${escapeHTML(String(pageState.totalPages))}</span>
      <button class="btn btn-secondary btn-small" type="button" data-runs-page-action="prev" ${pageState.page <= 1 ? "disabled" : ""}>Prev</button>
      <button class="btn btn-secondary btn-small" type="button" data-runs-page-action="next" ${pageState.page >= pageState.totalPages ? "disabled" : ""}>Next</button>
    </div>
    <table class="runs-table">
      <thead>
        <tr>
          <th>Run ID</th>
          <th>Tenant</th>
          <th>Project</th>
          <th>Status</th>
          <th>Decision</th>
          <th>Created</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  if (!hasSelectedRun) {
    ui.runDetailContent.innerHTML = '<div class="metric"><div class="meta">Select a run row to view detail, evidence, and approval linkage.</div></div>';
  }
}

export function renderRunDetail(ui, run, options = {}) {
  const runID = String(
    options?.selectedRunId || run?.runId || ui.runDetailContent?.dataset?.selectedRunId || ""
  ).trim();
  if (runID) {
    ui.runDetailContent.dataset.selectedRunId = runID;
  } else {
    delete ui.runDetailContent.dataset.selectedRunId;
  }
  const approval = options?.approval || null;
  const timeline = [
    {
      id: "plan",
      label: "Plan",
      state: "complete",
      note: "Run request was accepted by runtime."
    },
    {
      id: "policy_check",
      label: "Policy Check",
      state: run?.policyDecision ? "complete" : "pending",
      note: run?.policyDecision ? `policyDecision=${run.policyDecision}` : "Policy decision pending."
    },
    {
      id: "execute",
      label: "Execute",
      state: run?.selectedDesktopProvider || run?.status === "DESKTOP_VERIFIED" || run?.status === "COMPLETED"
        ? "complete"
        : run?.status === "FAILED"
          ? "failed"
          : "pending",
      note: run?.selectedDesktopProvider
        ? `desktopProvider=${run.selectedDesktopProvider}`
        : "Desktop execution not selected or not required."
    },
    {
      id: "verify",
      label: "Verify",
      state: run?.desktopVerifyResponse || run?.status === "DESKTOP_VERIFIED" || run?.status === "COMPLETED"
        ? "complete"
        : run?.status === "FAILED"
          ? "failed"
          : "pending",
      note: run?.desktopVerifyResponse ? "Desktop verifier response persisted." : "Verifier evidence pending."
    }
  ];

  const timelineRows = timeline
    .map((step) => {
      const status = step.state === "complete" ? "COMPLETED" : step.state === "failed" ? "FAILED" : "PENDING";
      return `
        <tr>
          <td>${escapeHTML(step.label)}</td>
          <td><span class="${chipClassForStatus(status)}">${escapeHTML(status)}</span></td>
          <td>${escapeHTML(step.note)}</td>
        </tr>
      `;
    })
    .join("");

  const evidenceStages = [
    desktopEvidenceStage(run, "desktopObserveResponse", "Observe"),
    desktopEvidenceStage(run, "desktopActuateResponse", "Actuate"),
    desktopEvidenceStage(run, "desktopVerifyResponse", "Verify")
  ].filter(Boolean);

  const evidenceRows =
    evidenceStages.length === 0
      ? `
        <tr>
          <td colspan="8">No desktop evidence responses are currently available for this run.</td>
        </tr>
      `
      : evidenceStages
          .map((stage) => {
            return `
              <tr>
                <td>${escapeHTML(stage.label)}</td>
                <td><span class="${chipClassForStatus(stage.decision || "unknown")}">${escapeHTML(stage.decision || "-")}</span></td>
                <td>${escapeHTML(stage.verifierId || "-")}</td>
                <td>${escapeHTML(stage.reasonCode || "-")}</td>
                <td>${escapeHTML(stage.resultCode || "-")}</td>
                <td>${escapeHTML(stage.screenshotHash || "-")}</td>
                <td>${escapeHTML(stage.windowTitle || "-")}</td>
                <td>${escapeHTML(stage.screenshotUri || "-")}</td>
              </tr>
            `;
          })
          .join("");

  const artifactPanels = buildArtifactEntries(run)
    .map((entry) => {
      const valueText =
        typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value, null, 2);
      return `
        <details class="artifact-panel" data-detail-key="runs.artifact.${escapeHTML(entry.key)}" data-advanced-section="runs">
          <summary>${escapeHTML(entry.label)}</summary>
          <pre class="monospace">${escapeHTML(valueText)}</pre>
        </details>
      `;
    })
    .join("");

  const approvalStatus = String(approval?.status || "").toUpperCase();
  const approvalSummary = approval
    ? `
      <div class="meta">approvalId=${escapeHTML(approval.approvalId || "-")}; status=<span class="${chipClassForStatus(approvalStatus)} chip-compact">${escapeHTML(approvalStatus || "-")}</span>; expiresAt=${escapeHTML(formatTime(approval.expiresAt) || "-")}</div>
    `
    : '<div class="meta">No approval record currently associated with this run in active queue scope.</div>';

  ui.runDetailContent.innerHTML = `
    <div class="metric">
      <div class="title">Run Timeline</div>
      <details class="artifact-panel" data-detail-key="runs.timeline" open>
        <summary>Show timeline details</summary>
        <table class="runs-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>${timelineRows}</tbody>
        </table>
      </details>
    </div>
    <div class="metric">
      <div class="title">Desktop Evidence Summary</div>
      <details class="artifact-panel" data-detail-key="runs.evidence_summary" open>
        <summary>Show evidence summary details</summary>
        <table class="runs-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Decision</th>
              <th>Verifier</th>
              <th>Reason</th>
              <th>Result</th>
              <th>Screenshot Hash</th>
              <th>Window</th>
              <th>Screenshot URI</th>
            </tr>
          </thead>
          <tbody>${evidenceRows}</tbody>
        </table>
      </details>
    </div>
    <div class="metric" data-advanced-section="runs">
      <div class="title">Run Evidence Drill-In</div>
      <div class="stack">
        ${artifactPanels || '<div class="meta">No artifact payloads are available.</div>'}
      </div>
    </div>
    <div class="metric">
      <div class="title">Approval Linkage</div>
      ${approvalSummary}
      <div class="approval-actions">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-open-approval-run-id="${escapeHTML(run?.runId || "")}"
        >Open Related Approval</button>
      </div>
    </div>
    <div class="metric" data-advanced-section="runs">
      <div class="title">Run Detail: ${escapeHTML(run?.runId || "-")}</div>
      <details class="artifact-panel" data-detail-key="runs.raw_record">
        <summary>Show raw run record</summary>
        <pre class="monospace">${escapeHTML(JSON.stringify(run || {}, null, 2))}</pre>
      </details>
    </div>
  `;
}
