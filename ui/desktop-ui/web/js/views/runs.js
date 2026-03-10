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
} from "./common.js";

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
  nonRepoProvenance: "EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/provenance/",
  nonRepoReadiness: "EPYDIOS_AI_CONTROL_PLANE_NON_GITHUB/internal-readiness/"
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
      label: "Repo provenance root",
      path: WORKSPACE_ARTIFACT_ROOTS.repoProvenance,
      note: "Git-tracked provenance and repo-safe artifacts."
    },
    {
      label: "Non-repo provenance root",
      path: WORKSPACE_ARTIFACT_ROOTS.nonRepoProvenance,
      note: "Large governed evidence bundles and host-visible proof artifacts."
    },
    {
      label: "Non-repo readiness root",
      path: WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness,
      note: "Screenshots, manual QA, smoke evidence, and local operator artifacts."
    }
  ];
  if (dateBucket) {
    entries.push({
      label: "Suggested date bucket",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}history/${dateBucket}/`,
      note: "Recommended next folder for any new run-specific screenshots or operator notes."
    });
    entries.push({
      label: "Suggested run folder",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}history/${dateBucket}/${runFolderToken}/`,
      note: "Recommended home for run-specific notes, JSON exports, and operator evidence."
    });
    entries.push({
      label: "Suggested screenshots folder",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}history/${dateBucket}/${runFolderToken}/screenshots/`,
      note: "Keep per-run screenshots and visual comparisons under the same date bucket."
    });
    entries.push({
      label: "Suggested incidents folder",
      path: `${WORKSPACE_ARTIFACT_ROOTS.nonRepoReadiness}incidents/${dateBucket}/${runFolderToken}/`,
      note: "Use this when the run graduates into durable incident packaging and handoff artifacts."
    });
  }
  return { entries: [...entries, ...screenshotURIs], dateBucket };
}

function readObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readStringArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
}

function derivePolicyRichness(run) {
  const requestPayload = readObject(run?.requestPayload);
  const requestContext = readObject(requestPayload.context);
  const requestGoverned = readObject(requestContext.governed_action);
  const requestPolicy = readObject(requestContext.policy_stratification);
  const requestTask = readObject(requestPayload.task);
  const policyResponse = readObject(run?.policyResponse);
  const policyOutput = readObject(policyResponse.output);
  const aimxsOutput = readObject(policyOutput.aimxs);
  const providerMeta = readObject(aimxsOutput.providerMeta);
  const providerPolicy = readObject(providerMeta.policy_stratification);
  const requestContract = readObject(providerMeta.request_contract);
  const outputContract = readObject(aimxsOutput.requestContract);
  const evidence = readObject(aimxsOutput.evidence);
  const financeOrder = readObject(requestGoverned.finance_order);
  const reasons = Array.isArray(policyResponse.reasons) ? policyResponse.reasons : [];
  const firstReason = readObject(reasons[0]);
  const requiredGrants = readStringArray(requestPolicy.required_grants);
  const evidenceRefs = readStringArray(policyResponse.evidenceRefs);
  const contractId = String(requestGoverned.contract_id || requestContract.contract_id || outputContract.contract_id || "").trim();
  const providerId = String(
    aimxsOutput.providerId ||
      providerMeta.providerId ||
      policyResponse.source ||
      run?.selectedPolicyProvider ||
      ""
  ).trim();
  const decision = String(policyResponse.decision || run?.policyDecision || "").trim().toUpperCase();
  const decisionPath = String(providerMeta.decision_path || "").trim();
  const evidenceHash = String(evidence.evidence_hash || evidence.evidenceHash || "").trim();
  const policyStratificationPresent = Object.keys(providerPolicy).length > 0 || Object.keys(readObject(aimxsOutput.policyStratification)).length > 0;
  const requestContractEchoPresent = Object.keys(requestContract).length > 0 || Object.keys(outputContract).length > 0;

  return {
    isGovernedAction: Object.keys(requestGoverned).length > 0 || contractId.length > 0,
    contractId,
    workflowKind: String(requestGoverned.workflow_kind || outputContract.workflow_kind || "").trim(),
    requestLabel: String(requestGoverned.request_label || requestTask.requestLabel || "").trim(),
    demoProfile: String(requestGoverned.demo_profile || requestTask.demoProfile || "").trim(),
    requestSummary: String(requestGoverned.request_summary || requestTask.summary || requestTask.intent || "").trim(),
    boundaryClass: String(requestPolicy.boundary_class || providerPolicy.boundary_class || "").trim(),
    riskTier: String(requestPolicy.risk_tier || providerPolicy.risk_tier || "").trim(),
    requiredGrants,
    evidenceReadiness: String(requestPolicy.evidence_readiness || providerPolicy.evidence_readiness || "").trim(),
    handshakeRequired: requestPolicy?.gates?.["core14.adapter_present.enforce_handshake"] === true,
    decision,
    providerId,
    decisionPath,
    baakEngaged: providerMeta.baak_engaged === true,
    grantTokenPresent: run?.policyGrantTokenPresent === true || policyResponse.grantTokenPresent === true,
    policyStratificationPresent,
    requestContractEchoPresent,
    evidenceHash,
    evidenceRefCount: evidenceRefs.length,
    evidenceRefs,
    firstReason: String(firstReason.message || firstReason.code || "").trim(),
    financeOrder
  };
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
    ui.runsContent.innerHTML = renderPanelStateMetric(
      "empty",
      "History",
      "No runtime runs match current filters.",
      "Adjust scope, decision, or time filters, then refresh History."
    );
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
    <div class="metric history-summary-card">
      <div class="metric-title-row">
        <div class="title">History Summary</div>
        <span class="chip chip-neutral chip-compact">matches=${escapeHTML(String(pageState.totalItems))}</span>
      </div>
      <div class="meta">History is for finished or prior work. Review the selected run below before exporting, filing, or copying folder paths.</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">completed=${escapeHTML(String(completedCount))}</span>
        <span class="chip chip-neutral chip-compact">needsAttention=${escapeHTML(String(failedCount))}</span>
        <span class="chip chip-neutral chip-compact">decisionDeny=${escapeHTML(String(deniedCount))}</span>
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(selectedRunID || "-")}</span>
      </div>
      <div class="meta">Use the Artifact Access section in run detail to map the selected run into repo-safe provenance or non-repo date-bucket storage.</div>
    </div>
  `;

  const rows = items
    .map((item) => {
      const decision = String(item.policyDecision || "").toUpperCase();
      const runId = String(item.runId || "").trim();
      const isSelected = selectedRunID && runId === selectedRunID;
      const toggleMarker = isSelected ? "v" : ">";
      return `
        <tr${isSelected ? ' class="settings-row-focus"' : ""}>
          ${tableCell(
            "Run ID",
            `
            <button class="row-action run-row-action" type="button" data-run-id="${escapeHTML(runId)}" aria-controls="run-detail-content">
              <span class="run-row-toggle">${escapeHTML(toggleMarker)}</span>
              <span>${escapeHTML(item.runId || "-")}</span>
            </button>
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
  `;

  if (!hasSelectedRun) {
    ui.runDetailContent.innerHTML = renderPanelStateMetric(
      "info",
      "Run Detail",
      "Select a run row to view detail, evidence, and approval linkage."
    );
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
  const policyRichness = derivePolicyRichness(run);
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
              >Copy Path</button>
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
    <div class="metric">
      <div class="title">2. Policy Richness</div>
      <div class="meta metric-note">This section is sourced from the actual stored governed-action request and provider response. It is the structured comparison surface for <code>oss-only</code> versus <code>aimxs-full</code>.</div>
      ${
        !policyRichness.isGovernedAction
          ? `
            <div class="meta">This run did not use the governed-action request contract.</div>
          `
          : `
            <div class="run-detail-chips">
              <span class="chip chip-neutral chip-compact">decision=${escapeHTML(policyRichness.decision || "UNSET")}</span>
              <span class="chip chip-neutral chip-compact">provider=${escapeHTML(policyRichness.providerId || "-")}</span>
              <span class="chip chip-neutral chip-compact">workflow=${escapeHTML(policyRichness.workflowKind || "-")}</span>
              <span class="chip chip-neutral chip-compact">profile=${escapeHTML(policyRichness.demoProfile || "-")}</span>
              <span class="chip chip-neutral chip-compact">boundary=${escapeHTML(policyRichness.boundaryClass || "-")}</span>
              <span class="chip chip-neutral chip-compact">risk=${escapeHTML(policyRichness.riskTier || "-")}</span>
              <span class="chip chip-neutral chip-compact">grants=${escapeHTML(String(policyRichness.requiredGrants.length))}</span>
              <span class="chip chip-neutral chip-compact">evidenceRefs=${escapeHTML(String(policyRichness.evidenceRefCount))}</span>
            </div>
            <details class="artifact-panel" data-detail-key="runs.policy_richness" open>
              <summary>Show governed request and provider richness</summary>
              <table class="data-table runs-table">
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>${tableCell("Signal", "Request Label")}${tableCell("Value", escapeHTML(policyRichness.requestLabel || "-"))}</tr>
                  <tr>${tableCell("Signal", "Request Summary")}${tableCell("Value", escapeHTML(policyRichness.requestSummary || "-"))}</tr>
                  <tr>${tableCell("Signal", "Contract ID")}${tableCell("Value", escapeHTML(policyRichness.contractId || "-"))}</tr>
                  <tr>${tableCell("Signal", "Required Grants")}${tableCell("Value", escapeHTML(policyRichness.requiredGrants.join(", ") || "-"))}</tr>
                  <tr>${tableCell("Signal", "Evidence Readiness")}${tableCell("Value", escapeHTML(policyRichness.evidenceReadiness || "-"))}</tr>
                  <tr>${tableCell("Signal", "Handshake Required")}${tableCell("Value", escapeHTML(policyRichness.handshakeRequired ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Decision Path")}${tableCell("Value", escapeHTML(policyRichness.decisionPath || "-"))}</tr>
                  <tr>${tableCell("Signal", "BAAK Engaged")}${tableCell("Value", escapeHTML(policyRichness.baakEngaged ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Policy Stratification Present")}${tableCell("Value", escapeHTML(policyRichness.policyStratificationPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Request Contract Echo Present")}${tableCell("Value", escapeHTML(policyRichness.requestContractEchoPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Grant Token Present")}${tableCell("Value", escapeHTML(policyRichness.grantTokenPresent ? "true" : "false"))}</tr>
                  <tr>${tableCell("Signal", "Evidence Hash")}${tableCell("Value", escapeHTML(policyRichness.evidenceHash || "-"))}</tr>
                  <tr>${tableCell("Signal", "Primary Reason")}${tableCell("Value", escapeHTML(policyRichness.firstReason || "-"))}</tr>
                  <tr>${tableCell("Signal", "Finance Order")}${tableCell("Value", escapeHTML(Object.keys(policyRichness.financeOrder).length ? JSON.stringify(policyRichness.financeOrder) : "-"))}</tr>
                </tbody>
              </table>
            </details>
          `
      }
    </div>
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
      <div class="title">5. Artifact Access</div>
      <div class="meta metric-note">Copy the workspace roots you need before leaving History. Repo provenance stays Git-safe; screenshots, run notes, and incident handoff artifacts belong in non-repo folders organized by date bucket and run ID.</div>
      <div class="meta" data-run-path-feedback>Copy a path to send it to the clipboard.</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">dateBucket=${escapeHTML(artifactAccess.dateBucket || "-")}</span>
        <span class="chip chip-neutral chip-compact">pathHints=${escapeHTML(String(artifactAccess.entries.length))}</span>
        <span class="chip chip-neutral chip-compact">runFolder=${escapeHTML(safePathSegment(run?.runId, "run-id"))}</span>
      </div>
      <div class="artifact-path-grid">
        ${artifactAccessCards}
      </div>
    </div>
    <div class="metric" data-advanced-section="runs">
      <div class="title">6. Payload Drill-In</div>
      <div class="meta metric-note">Use payload drill-in only when the structured timeline and evidence summaries are not sufficient.</div>
      <div class="meta">artifactPayloads=${escapeHTML(String(artifactEntries.length))}</div>
      <div class="stack">
        ${artifactPanels || '<div class="meta">No artifact payloads are available.</div>'}
      </div>
    </div>
    <div class="metric" data-advanced-section="runs">
      <div class="title">7. Raw Run Record</div>
      <div class="meta metric-note">Raw record is intentionally last. Review it only after the structured sections above.</div>
      <details class="artifact-panel" data-detail-key="runs.raw_record">
        <summary>Show raw run record</summary>
        <pre class="monospace">${escapeHTML(JSON.stringify(run || {}, null, 2))}</pre>
      </details>
    </div>
  `;
}
