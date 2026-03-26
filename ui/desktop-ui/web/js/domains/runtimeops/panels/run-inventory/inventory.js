import {
  chipClassForStatus,
  containsCaseInsensitive,
  escapeHTML,
  formatTime,
  paginateItems,
  parsePositiveInt,
  renderPanelStateMetric,
  resolveTimeBounds,
  withinTimeBounds
} from "../../../../views/common.js";
import {
  chipClassForPolicyEffect,
  derivePolicyOutcomePresentation,
  renderRunPolicyRichnessSection
} from "../../../policyops/routes.js";

function tableCell(label, content, attrs = "") {
  return `<td data-label="${escapeHTML(label)}"${attrs}>${content}</td>`;
}

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

function readPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function connectorDriverLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "mcp_sqlite") {
    return "SQLite MCP";
  }
  if (normalized === "mcp_postgres") {
    return "Postgres MCP";
  }
  if (normalized === "mcp_filesystem") {
    return "Filesystem MCP";
  }
  if (normalized === "mcp_github") {
    return "GitHub MCP";
  }
  if (normalized === "mcp_browser") {
    return "Browser MCP";
  }
  return normalized || "-";
}

function renderDetailValuePills(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const value = String(item?.value || "").trim();
      if (!label || !value) {
        return "";
      }
      return `
        <span class="runtimeops-value-pill">
          <span class="runtimeops-value-key">${escapeHTML(label)}</span>
          <span class="runtimeops-value-text${item?.code ? " runtimeops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="runtimeops-empty">not available</span>';
  }
  return `<div class="runtimeops-value-group">${values.join("")}</div>`;
}

function renderDetailKeyValueRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const label = String(row?.label || "").trim();
      const value = String(row?.value || "").trim();
      if (!label) {
        return "";
      }
      return `
        <div class="runtimeops-row">
          <div class="runtimeops-row-label">${escapeHTML(label)}</div>
          <div class="runtimeops-row-value">${value || '<span class="runtimeops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function buildConnectorContinuity(run = {}, approval = null) {
  const requestPayload = readPlainObject(run?.requestPayload);
  const requestContext = readPlainObject(requestPayload?.context);
  const connectorRequest = readPlainObject(requestPayload?.connector);
  const connectorContext = readPlainObject(requestContext?.connector);
  const connectorMcp = readPlainObject(requestContext?.connector_mcp);
  const evidenceRecordResponse = readPlainObject(run?.evidenceRecordResponse);
  const evidencePayload = readPlainObject(evidenceRecordResponse?.payloadEcho);
  const connectorPayload = readPlainObject(evidencePayload?.connector);
  const connectorProfile = readPlainObject(connectorPayload?.connector);
  const connectorClassification = readPlainObject(connectorPayload?.classification);
  const connectorResult = readPlainObject(connectorPayload?.result);
  const annotations = readPlainObject(run?.annotations);

  const driver = String(
    annotations?.connectorDriver ||
      connectorProfile?.driver ||
      connectorRequest?.driver ||
      connectorContext?.driver ||
      ""
  )
    .trim()
    .toLowerCase();
  const toolName = String(
    annotations?.connectorToolName ||
      connectorPayload?.toolName ||
      connectorRequest?.toolName ||
      connectorContext?.toolName ||
      ""
  )
    .trim()
    .toLowerCase();
  const state = String(connectorPayload?.state || "").trim().toLowerCase();
  const connectorId = String(
    connectorProfile?.connectorId ||
      connectorProfile?.id ||
      connectorRequest?.connectorId ||
      connectorContext?.connectorId ||
      connectorMcp?.connectorId ||
      ""
  ).trim();
  const connectorLabel = String(
    connectorProfile?.connectorLabel ||
      connectorProfile?.label ||
      connectorMcp?.connectorLabel ||
      ""
  ).trim();
  const approvalId = String(
    connectorMcp?.approvalId || connectorContext?.approvalId || approval?.approvalId || ""
  ).trim();
  const requestEntries = [
    connectorRequest?.arguments?.query ? { label: "query", value: String(connectorRequest.arguments.query), code: true } : null,
    connectorRequest?.arguments?.path ? { label: "path", value: String(connectorRequest.arguments.path), code: true } : null,
    connectorRequest?.arguments?.url ? { label: "url", value: String(connectorRequest.arguments.url), code: true } : null,
    connectorRequest?.arguments?.owner ? { label: "owner", value: String(connectorRequest.arguments.owner), code: true } : null,
    connectorRequest?.arguments?.repo ? { label: "repo", value: String(connectorRequest.arguments.repo), code: true } : null,
    connectorRequest?.arguments?.pull_number
      ? { label: "pull", value: String(connectorRequest.arguments.pull_number), code: true }
      : null,
    connectorRequest?.arguments?.selector
      ? { label: "selector", value: String(connectorRequest.arguments.selector), code: true }
      : null,
    connectorRequest?.arguments?.expected_label
      ? { label: "label", value: String(connectorRequest.arguments.expected_label) }
      : null
  ].filter(Boolean);
  const resultEntries = [
    connectorResult?.rowCount !== undefined ? { label: "rows", value: String(connectorResult.rowCount), code: true } : null,
    connectorResult?.entryCount !== undefined ? { label: "entries", value: String(connectorResult.entryCount), code: true } : null,
    connectorResult?.bytesRead !== undefined ? { label: "bytes", value: String(connectorResult.bytesRead), code: true } : null,
    connectorResult?.pullTitle ? { label: "pull title", value: String(connectorResult.pullTitle) } : null,
    connectorResult?.pullState ? { label: "pull state", value: String(connectorResult.pullState), code: true } : null,
    connectorResult?.title ? { label: "title", value: String(connectorResult.title) } : null,
    connectorResult?.finalUrl ? { label: "final url", value: String(connectorResult.finalUrl), code: true } : null,
    connectorResult?.textPreview ? { label: "text preview", value: String(connectorResult.textPreview) } : null,
    connectorResult?.resolvedLabel ? { label: "resolved label", value: String(connectorResult.resolvedLabel) } : null
  ].filter(Boolean);

  return {
    available:
      Boolean(driver) ||
      Boolean(toolName) ||
      Boolean(connectorId) ||
      Boolean(connectorPayload?.requested),
    driver,
    driverLabel: connectorDriverLabel(driver),
    toolName: toolName || "-",
    connectorId: connectorId || "-",
    connectorLabel: connectorLabel || "-",
    state: state || "unknown",
    tier: String(connectorPayload?.tier || connectorRequest?.tier || "-").trim() || "-",
    interpositionRequestId: String(connectorPayload?.interpositionRequestId || connectorMcp?.interpositionRequestId || "").trim() || "-",
    clientSurface: String(connectorMcp?.clientSurface || "").trim() || "-",
    protocol: String(connectorMcp?.protocol || annotations?.connectorProtocol || "").trim() || "-",
    transport: String(connectorMcp?.transport || annotations?.connectorTransport || "").trim() || "-",
    approvalId: approvalId || "-",
    approvalGranted:
      connectorMcp?.approvalGranted === true ||
      connectorContext?.humanApprovalGranted === true,
    classification: {
      statementClass: String(connectorClassification?.statementClass || "-").trim() || "-",
      reason: String(connectorClassification?.reason || connectorPayload?.reason || run?.errorMessage || "-").trim() || "-"
    },
    requestEntries,
    resultEntries
  };
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

const WORKSPACE_ARTIFACT_ROOTS = {
  repoProvenance: "EPYDIOS_AGENTOPS_DESKTOP_REPO/provenance/",
  nonRepoProvenance: ".epydios/provenance/",
  nonRepoReadiness: ".epydios/internal-readiness/"
};

function safePathSegment(value, fallback = "item") {
  const normalized = String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized || fallback;
}

function deriveRunDateBucket(run) {
  const timestamp = String(run?.updatedAt || run?.createdAt || "").trim();
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10).replaceAll("-", "");
}

function buildArtifactAccessEntries(run, evidenceStages = []) {
  const dateBucket = deriveRunDateBucket(run);
  const runFolderToken = safePathSegment(run?.runId, "run-id");
  const screenshotURIs = evidenceStages
    .map((stage) => ({
      label: `${stage.label} screenshot URI`,
      path: String(stage?.screenshotUri || "").trim(),
      note: "Captured by the runtime and persisted in the evidence metadata."
    }))
    .filter((entry) => entry.path);
  const entries = [
    {
      label: "Tracked evidence root",
      path: WORKSPACE_ARTIFACT_ROOTS.repoProvenance,
      note: "Repo-safe evidence and provenance that should stay with the workspace."
    },
    {
      label: "Evidence bundle root",
      path: WORKSPACE_ARTIFACT_ROOTS.nonRepoProvenance,
      note: "Larger exported evidence bundles and proof packages kept outside the repo."
    },
    {
      label: "Operator workspace root",
      path: WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness,
      note: "Screenshots, QA notes, smoke evidence, and local operator artifacts."
    }
  ];
  if (dateBucket) {
    entries.push({
      label: "Suggested evidence date folder",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}history/${dateBucket}/`,
      note: "Recommended next folder for new run-specific screenshots, notes, and review exports."
    });
    entries.push({
      label: "Suggested run handoff folder",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}history/${dateBucket}/${runFolderToken}/`,
      note: "Recommended home for run-specific notes, JSON exports, and operator evidence."
    });
    entries.push({
      label: "Suggested screenshots folder",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}history/${dateBucket}/${runFolderToken}/screenshots/`,
      note: "Keep per-run screenshots and visual comparisons under the same handoff folder."
    });
    entries.push({
      label: "Suggested incident handoff folder",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}incidents/${dateBucket}/${runFolderToken}/`,
      note: "Use this when the run turns into durable incident packaging and handoff material."
    });
  }
  return { entries: [...entries, ...screenshotURIs], dateBucket };
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

export function readRuntimeRunFilters(ui) {
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

export function renderRuntimeRuns(ui, store, runPayload, filters) {
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
    ui.runsContent.innerHTML = `
      <div data-domain-root="runtimeops" data-runtimeops-panel="run-inventory">
        ${renderPanelStateMetric(
          "empty",
          "Run Inventory",
          "No runtime runs match current filters.",
          "Adjust scope, decision, or time filters, then refresh Run Inventory."
        )}
      </div>
    `;
    if (!hasSelectedRun) {
      ui.runDetailContent.innerHTML = "";
    }
    return;
  }

  const completedCount = filteredItems.filter((item) => String(item?.status || "").trim().toUpperCase() === "COMPLETED").length;
  const failedCount = filteredItems.filter((item) => {
    const status = String(item?.status || "").trim().toUpperCase();
    return status === "FAILED" || status === "POLICY_BLOCKED";
  }).length;
  const deniedCount = filteredItems.filter((item) => String(item?.policyDecision || "").trim().toUpperCase() === "DENY").length;
  const historySummary = `
    <div class="metric history-summary-card runtimeops-run-summary" data-domain-root="runtimeops" data-runtimeops-panel="run-summary">
      <div class="metric-title-row">
        <div class="title">Run Inventory Summary</div>
        <span class="chip chip-neutral chip-compact">matches=${escapeHTML(String(pageState.totalItems))}</span>
      </div>
      <div class="meta">Review current and recent governed runs here before opening audit, evidence, or incident packaging surfaces.</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">completed=${escapeHTML(String(completedCount))}</span>
        <span class="chip chip-neutral chip-compact">needsAttention=${escapeHTML(String(failedCount))}</span>
        <span class="chip chip-neutral chip-compact">decisionDeny=${escapeHTML(String(deniedCount))}</span>
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(selectedRunID || "-")}</span>
      </div>
      <div class="meta">Use the Evidence Handoff section in run detail when you need the right location for proof, screenshots, or incident packaging.</div>
    </div>
  `;

  const rows = items
    .map((item) => {
      const decision = String(item.policyDecision || "").toUpperCase();
      const runId = String(item.runId || "").trim();
      const isSelected = selectedRunID && runId === selectedRunID;
      const toggleMarker = isSelected ? "v" : ">";
      const outcome = derivePolicyOutcomePresentation(item);
      return `
        <tr${isSelected ? ' class="settings-row-focus"' : ""}>
          ${tableCell(
            "Run ID",
            `
            <button class="row-action run-row-action" type="button" data-run-id="${escapeHTML(runId)}" aria-controls="run-detail-content">
              <span class="run-row-toggle">${escapeHTML(toggleMarker)}</span>
              <span>${escapeHTML(item.runId || "-")}</span>
            </button>
            <div class="run-row-submeta">
              <span class="chip chip-neutral chip-compact">provider=${escapeHTML(outcome.provider || "-")}</span>
              <span class="${chipClassForPolicyEffect(outcome)}">effect=${escapeHTML(outcome.effectLabel)}</span>
            </div>
          `
          )}
          ${tableCell("Tenant", escapeHTML(item.tenantId || "-"))}
          ${tableCell("Project", escapeHTML(item.projectId || "-"))}
          ${tableCell("Status", `<span class="${chipClassForStatus(item.status)} chip-compact">${escapeHTML(item.status || "-")}</span>`)}
          ${tableCell("Decision", `<span class="${chipClassForStatus(decision)} chip-compact">${escapeHTML(decision || "-")}</span>`)}
          ${tableCell("Created", escapeHTML(formatTime(item.createdAt)))}
          ${tableCell("Updated", escapeHTML(formatTime(item.updatedAt)))}
        </tr>
      `;
    })
    .join("");

  ui.runsContent.innerHTML = `
    <div data-domain-root="runtimeops" data-runtimeops-panel="run-inventory">
      ${historySummary}
      <div class="table-meta-row">
        <span class="chip chip-neutral chip-compact">matches=${escapeHTML(String(pageState.totalItems))}</span>
        <span class="chip chip-neutral chip-compact">page=${escapeHTML(String(pageState.page))}/${escapeHTML(String(pageState.totalPages))}</span>
        <button class="btn btn-secondary btn-small" type="button" data-runs-page-action="prev" ${pageState.page <= 1 ? "disabled" : ""}>Prev</button>
        <button class="btn btn-secondary btn-small" type="button" data-runs-page-action="next" ${pageState.page >= pageState.totalPages ? "disabled" : ""}>Next</button>
      </div>
      <table class="data-table runs-table">
        <caption class="sr-only">Run review queue table for the current run filters, including run identity, scope, status, decision, and timestamps.</caption>
        <thead>
          <tr>
            <th scope="col">Run ID</th>
            <th scope="col">Tenant</th>
            <th scope="col">Project</th>
            <th scope="col">Status</th>
            <th scope="col">Decision</th>
            <th scope="col">Created</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  if (!hasSelectedRun) {
    ui.runDetailContent.innerHTML = `
      <div data-domain-root="runtimeops" data-runtimeops-panel="run-detail-state">
        ${renderPanelStateMetric(
          "info",
          "Run Detail",
          "Select a run row to view detail, evidence, and approval linkage."
        )}
      </div>
    `;
  }
}

export function renderRuntimeRunDetail(ui, run, options = {}) {
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
          ${tableCell("Step", escapeHTML(step.label))}
          ${tableCell("Status", `<span class="${chipClassForStatus(status)}">${escapeHTML(status)}</span>`)}
          ${tableCell("Detail", escapeHTML(step.note))}
        </tr>
      `;
    })
    .join("");

  const evidenceStages = [
    desktopEvidenceStage(run, "desktopObserveResponse", "Observe"),
    desktopEvidenceStage(run, "desktopActuateResponse", "Actuate"),
    desktopEvidenceStage(run, "desktopVerifyResponse", "Verify")
  ].filter(Boolean);
  const artifactEntries = buildArtifactEntries(run);
  const artifactAccess = buildArtifactAccessEntries(run, evidenceStages);
  const connectorContinuity = buildConnectorContinuity(run, approval);
  const runStatus = String(run?.status || "").toUpperCase();
  const runDecision = String(run?.policyDecision || "").toUpperCase();
  const runStatusChipClass = runStatus ? chipClassForStatus(runStatus) : "chip chip-neutral";
  const runDecisionChipClass = runDecision ? chipClassForStatus(runDecision) : "chip chip-neutral";

  const evidenceRows =
    evidenceStages.length === 0
      ? `
        <tr>
          ${tableCell("Status", "No desktop evidence responses are currently available for this run.", ' colspan="8"')}
        </tr>
      `
      : evidenceStages
          .map((stage) => {
            return `
              <tr>
                ${tableCell("Stage", escapeHTML(stage.label))}
                ${tableCell("Decision", `<span class="${chipClassForStatus(stage.decision || "unknown")}">${escapeHTML(stage.decision || "-")}</span>`)}
                ${tableCell("Verifier", escapeHTML(stage.verifierId || "-"))}
                ${tableCell("Reason", escapeHTML(stage.reasonCode || "-"))}
                ${tableCell("Result", escapeHTML(stage.resultCode || "-"))}
                ${tableCell("Screenshot Hash", escapeHTML(stage.screenshotHash || "-"))}
                ${tableCell("Window", escapeHTML(stage.windowTitle || "-"))}
                ${tableCell("Screenshot URI", escapeHTML(stage.screenshotUri || "-"))}
              </tr>
            `;
          })
          .join("");

  const artifactPanels = artifactEntries
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

  const artifactAccessCards = artifactAccess.entries
    .map((entry) => {
      return `
        <article class="artifact-path-card">
          <div class="metric-title-row">
            <div class="title">${escapeHTML(entry.label)}</div>
            ${
              entry.label === "Suggested date bucket"
                ? '<span class="chip chip-warn chip-compact">recommended</span>'
                : ""
            }
          </div>
          <pre class="artifact-path-value">${escapeHTML(entry.path)}</pre>
          <div class="meta">${escapeHTML(entry.note)}</div>
          <div class="approval-actions action-hierarchy">
            <div class="action-group action-group-secondary">
              <button
                class="btn btn-secondary btn-small"
                type="button"
                data-run-copy-path="${escapeHTML(entry.path)}"
                data-run-copy-path-label="${escapeHTML(entry.label)}"
              >Copy Location</button>
            </div>
          </div>
        </article>
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
    <div data-domain-root="runtimeops" data-runtimeops-panel="run-detail">
      <div class="metric">
        <div class="metric-title-row">
          <div class="title focus-anchor" tabindex="-1" data-focus-anchor="run-detail">1. Timeline Review</div>
          <span class="${runStatusChipClass} chip-compact">status=${escapeHTML(runStatus || "UNKNOWN")}</span>
          <span class="${runDecisionChipClass} chip-compact">decision=${escapeHTML(runDecision || "UNSET")}</span>
        </div>
        <div class="meta metric-note">Read this first to confirm request intake, policy evaluation, execution, and verification order for the selected run.</div>
        <div class="run-detail-chips">
          <span class="chip chip-neutral chip-compact">runId=${escapeHTML(run?.runId || "-")}</span>
          <span class="chip chip-neutral chip-compact">tenant=${escapeHTML(run?.tenantId || "-")}</span>
          <span class="chip chip-neutral chip-compact">project=${escapeHTML(run?.projectId || "-")}</span>
          <span class="chip chip-neutral chip-compact">created=${escapeHTML(formatTime(run?.createdAt))}</span>
          <span class="chip chip-neutral chip-compact">updated=${escapeHTML(formatTime(run?.updatedAt))}</span>
        </div>
        <details class="artifact-panel" data-detail-key="runs.timeline" open>
          <summary>Show stage-by-stage progression</summary>
          <table class="data-table runs-table">
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
      ${renderRunPolicyRichnessSection(run)}
      <div class="metric">
        <div class="title">3. Evidence Review</div>
        <div class="meta metric-note">Confirm verifier outputs, reason codes, and screenshot linkage before handing off this run.</div>
        <div class="meta">desktopEvidenceStages=${escapeHTML(String(evidenceStages.length))}</div>
        <details class="artifact-panel" data-detail-key="runs.evidence_summary" open>
          <summary>Show verifier and screenshot evidence</summary>
          <table class="data-table runs-table">
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
      <div class="metric">
        <div class="title">4. Approval Linkage</div>
        <div class="meta metric-note">Check for a related approval record before escalating, exporting, or closing the workflow.</div>
        ${approvalSummary}
        <div class="approval-actions action-hierarchy">
          <div class="action-group action-group-primary">
            <button
              class="btn btn-primary btn-small"
              type="button"
              data-open-approval-run-id="${escapeHTML(run?.runId || "")}"
            >Open Approval Detail</button>
          </div>
        </div>
      </div>
      <div class="metric">
        <div class="title">5. Connector Continuity</div>
        <div class="meta metric-note">Use this only for connector-governed runs. It keeps the connector request, approval linkage, and evidence summary in one place before handoff.</div>
        <div class="run-detail-chips">
          <span class="chip chip-neutral chip-compact">driver=${escapeHTML(connectorContinuity.driverLabel)}</span>
          <span class="chip chip-neutral chip-compact">tool=${escapeHTML(connectorContinuity.toolName)}</span>
          <span class="chip chip-neutral chip-compact">state=${escapeHTML(connectorContinuity.state)}</span>
          <span class="chip chip-neutral chip-compact">approval=${escapeHTML(connectorContinuity.approvalId)}</span>
        </div>
        <div class="runtimeops-kv-list">
          ${
            connectorContinuity.available
              ? renderDetailKeyValueRows([
                  {
                    label: "Connector Profile",
                    value: renderDetailValuePills([
                      { label: "profile", value: connectorContinuity.connectorLabel },
                      { label: "connector id", value: connectorContinuity.connectorId, code: true },
                      { label: "driver", value: connectorContinuity.driverLabel, code: true },
                      { label: "tier", value: connectorContinuity.tier, code: true }
                    ])
                  },
                  {
                    label: "Gateway And Approval",
                    value: renderDetailValuePills([
                      { label: "protocol", value: connectorContinuity.protocol, code: true },
                      { label: "transport", value: connectorContinuity.transport, code: true },
                      { label: "client surface", value: connectorContinuity.clientSurface, code: true },
                      { label: "approval", value: connectorContinuity.approvalId, code: true },
                      {
                        label: "approval granted",
                        value: connectorContinuity.approvalGranted ? "yes" : "no",
                        code: true
                      },
                      {
                        label: "interposition",
                        value: connectorContinuity.interpositionRequestId,
                        code: true
                      }
                    ])
                  },
                  {
                    label: "Bounded Request",
                    value:
                      connectorContinuity.requestEntries.length > 0
                        ? renderDetailValuePills(connectorContinuity.requestEntries)
                        : '<span class="runtimeops-empty">No bounded connector request inputs were echoed into the current evidence record.</span>'
                  },
                  {
                    label: "Classification And Result",
                    value: `
                      ${renderDetailValuePills([
                        { label: "statement class", value: connectorContinuity.classification.statementClass, code: true },
                        { label: "reason", value: connectorContinuity.classification.reason }
                      ])}
                      ${
                        connectorContinuity.resultEntries.length > 0
                          ? renderDetailValuePills(connectorContinuity.resultEntries)
                          : '<div class="meta">Connector result details are not yet available for this run.</div>'
                      }
                    `
                  }
                ])
              : '<div class="meta">No connector-specific continuity is recorded for this run.</div>'
          }
        </div>
      </div>
      <div class="metric">
        <div class="title">6. Evidence Handoff</div>
        <div class="meta metric-note">Copy the location you need before leaving Run Inventory. Keep tracked evidence in the repo-safe root, and use the suggested handoff folders for screenshots, operator notes, and incident packages.</div>
        <div class="meta" data-run-path-feedback>Copy a location to send it to the clipboard.</div>
        <div class="run-detail-chips">
          <span class="chip chip-neutral chip-compact">dateFolder=${escapeHTML(artifactAccess.dateBucket || "-")}</span>
          <span class="chip chip-neutral chip-compact">handoffOptions=${escapeHTML(String(artifactAccess.entries.length))}</span>
          <span class="chip chip-neutral chip-compact">runFolder=${escapeHTML(safePathSegment(run?.runId, "run-id"))}</span>
        </div>
        <div class="artifact-path-grid">
          ${artifactAccessCards}
        </div>
      </div>
      <div class="metric" data-advanced-section="runs">
        <div class="title">7. Payload Drill-In</div>
        <div class="meta metric-note">Use payload drill-in only when the structured timeline and evidence summaries are not sufficient.</div>
        <div class="meta">artifactPayloads=${escapeHTML(String(artifactEntries.length))}</div>
        <div class="stack">
          ${artifactPanels || '<div class="meta">No artifact payloads are available.</div>'}
        </div>
      </div>
      <div class="metric" data-advanced-section="runs">
        <div class="title">8. Raw Run Record</div>
        <div class="meta metric-note">Raw record is intentionally last. Review it only after the structured sections above.</div>
        <details class="artifact-panel" data-detail-key="runs.raw_record">
          <summary>Show raw run record</summary>
          <pre class="monospace">${escapeHTML(JSON.stringify(run || {}, null, 2))}</pre>
        </details>
      </div>
    </div>
  `;
}

export function renderRuntimeRunDetailError(ui, message, options = {}) {
  const runID = String(options?.selectedRunId || ui.runDetailContent?.dataset?.selectedRunId || "").trim();
  if (runID) {
    ui.runDetailContent.dataset.selectedRunId = runID;
  }
  ui.runDetailContent.innerHTML = `
    <div data-domain-root="runtimeops" data-runtimeops-panel="run-detail-state">
      ${renderPanelStateMetric("error", "Run Detail", message || "Run detail failed.")}
    </div>
  `;
}
