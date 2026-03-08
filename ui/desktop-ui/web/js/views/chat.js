import { escapeHTML, formatTime } from "./common.js";
import { buildNativeSessionActivitySummary, deriveOperatorChatThreadState, listNativeToolProposals, latestManagedWorkerTranscript } from "../runtime/session-client.js";
import { buildEnterpriseReportEnvelope, buildGovernedExportSelectionState, renderEnterpriseReportEnvelope } from "../runtime/governance-report.js";

function normalizedString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function selectedAttr(current, value) {
  return current === value ? "selected" : "";
}

function chipClassForSessionStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "COMPLETED" || status === "READY" || status === "SUCCESS") {
    return "chip chip-ok chip-compact";
  }
  if (status === "RUNNING" || status === "AWAITING_APPROVAL" || status === "AWAITING_WORKER" || status === "WARN") {
    return "chip chip-warn chip-compact";
  }
  if (status === "FAILED" || status === "BLOCKED" || status === "CANCELLED" || status === "ERROR" || status === "INVALID") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function chipClassForActivityTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  if (tone === "ok") {
    return "chip chip-ok chip-compact";
  }
  if (tone === "warn") {
    return "chip chip-warn chip-compact";
  }
  if (tone === "danger") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function isTerminalThreadStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  return status === "COMPLETED" || status === "FAILED" || status === "BLOCKED" || status === "CANCELLED";
}

function executionModeLabel(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "managed_codex_worker") {
    return "Managed Codex Worker";
  }
  return "Raw Model Invoke";
}

function renderHistoryItems(history = {}, activeTaskId = "") {
  const items = Array.isArray(history?.items) ? history.items : [];
  if (items.length === 0) {
    return `
      <div class="chat-empty-state">
        <div class="title">No native chat threads found</div>
        <div class="meta">Threads will appear here after you start them against the current tenant and project scope.</div>
      </div>
    `;
  }
  return items
    .map((item) => {
      const taskId = String(item?.taskId || "").trim();
      const isActive = taskId && taskId === activeTaskId;
      const archived = Boolean(item?.archived);
      const resolved = isTerminalThreadStatus(item?.status);
      return `
        <div class="chat-thread-list-entry ${archived ? "is-archived" : ""}">
          <button class="chat-thread-list-item ${isActive ? "is-active" : ""}" type="button" data-chat-action="resume-thread" data-chat-task-id="${escapeHTML(taskId)}">
            <span class="chat-thread-list-title">${escapeHTML(String(item?.title || taskId || "Untitled thread"))}</span>
            <span class="chat-thread-list-meta">updated=${escapeHTML(formatTime(item?.updatedAt || item?.createdAt))}; status=${escapeHTML(String(item?.status || "-"))}; sessions=${escapeHTML(String(item?.sessionCount ?? "-"))}</span>
            <span class="chat-thread-list-meta">execution=${escapeHTML(executionModeLabel(item?.executionMode))}; profile=${escapeHTML(String(item?.agentProfileId || "-"))}</span>
            <span class="chat-thread-list-meta">${escapeHTML(String(item?.intent || "").trim() || "No intent recorded.")}</span>
          </button>
          <div class="chat-thread-list-actions">
            ${archived ? `<span class="chip chip-neutral chip-compact">archived</span>` : ""}
            ${
              archived
                ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="restore-archived-thread" data-chat-task-id="${escapeHTML(taskId)}">Restore</button>`
                : resolved
                  ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="archive-thread-from-history" data-chat-task-id="${escapeHTML(taskId)}">Archive</button>`
                  : ""
            }
          </div>
        </div>
      `;
    })
    .join("");
}

function renderApprovalCheckpoints(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="meta">No approval checkpoints recorded for this turn.</div>`;
  }
  const rows = items
    .map((item) => {
      const sessionId = String(item?.sessionId || "").trim();
      const checkpointId = String(item?.checkpointId || "").trim();
      const status = String(item?.status || "-").trim().toUpperCase();
      const pending = status === "PENDING";
      const reviewedAt = String(item?.reviewedAt || item?.updatedAt || "").trim();
      const actions = pending
        ? `
          <div class="chat-approval-action-group">
            <input
              class="filter-input chat-approval-reason-input"
              type="text"
              placeholder="decision reason"
              data-chat-approval-reason
            />
            <div class="action-group action-group-secondary">
              <button
                class="btn btn-secondary btn-small"
                type="button"
                data-chat-action="approve-checkpoint"
                data-chat-session-id="${escapeHTML(sessionId)}"
                data-chat-checkpoint-id="${escapeHTML(checkpointId)}"
              >Approve</button>
              <button
                class="btn btn-danger btn-small"
                type="button"
                data-chat-action="deny-checkpoint"
                data-chat-session-id="${escapeHTML(sessionId)}"
                data-chat-checkpoint-id="${escapeHTML(checkpointId)}"
              >Deny</button>
            </div>
          </div>
        `
        : `<div class="meta">${escapeHTML(reviewedAt ? `reviewed=${formatTime(reviewedAt)}` : "checkpoint resolved")}</div>`;
      return `
        <tr data-chat-approval-row data-chat-session-id="${escapeHTML(sessionId)}" data-chat-checkpoint-id="${escapeHTML(checkpointId)}">
          <td data-label="Checkpoint">${escapeHTML(String(item?.checkpointId || "-"))}</td>
          <td data-label="Status">${escapeHTML(status || "-")}</td>
          <td data-label="Scope">${escapeHTML(String(item?.scope || "-"))}</td>
          <td data-label="Reason">${escapeHTML(String(item?.reason || "-"))}</td>
          <td data-label="Actions">${actions}</td>
        </tr>
      `;
    })
    .join("");
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th scope="col">Checkpoint</th>
          <th scope="col">Status</th>
          <th scope="col">Scope</th>
          <th scope="col">Reason</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderEvidenceRecords(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="meta">No evidence records recorded for this turn.</div>`;
  }
  return `
    <div class="chat-review-list">
      ${items
        .map((item) => {
          const sessionId = String(item?.sessionId || "").trim();
          const evidenceId = String(item?.evidenceId || "").trim();
          const metadata = item?.metadata && typeof item.metadata === "object" ? JSON.stringify(item.metadata, null, 2) : "";
          return `
            <details class="details-shell chat-review-details" open>
              <summary>${escapeHTML(String(item?.evidenceId || "-"))} · ${escapeHTML(String(item?.kind || "-"))}</summary>
              <div class="run-detail-chips">
                <span class="chip chip-neutral chip-compact">toolAction=${escapeHTML(String(item?.toolActionId || "-"))}</span>
                <span class="chip chip-neutral chip-compact">retention=${escapeHTML(String(item?.retentionClass || "-"))}</span>
                <span class="chip chip-neutral chip-compact">created=${escapeHTML(formatTime(item?.createdAt))}</span>
              </div>
              <div class="filter-row settings-editor-actions">
                <div class="action-hierarchy">
                  <div class="action-group action-group-secondary">
                    <button class="btn btn-secondary btn-small" type="button" data-chat-action="copy-evidence-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-evidence-id="${escapeHTML(evidenceId)}">Copy JSON</button>
                    <button class="btn btn-secondary btn-small" type="button" data-chat-action="download-evidence-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-evidence-id="${escapeHTML(evidenceId)}">Download JSON</button>
                  </div>
                </div>
              </div>
              ${metadata ? `<pre class="code-block">${escapeHTML(metadata)}</pre>` : `<div class="meta">No evidence metadata captured.</div>`}
            </details>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderToolActions(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="meta">No tool actions recorded for this turn.</div>`;
  }
  return `
    <div class="chat-review-list">
      ${items
        .map((item) => {
          const sessionId = String(item?.sessionId || "").trim();
          const toolActionId = String(item?.toolActionId || "").trim();
          const requestPayload = item?.requestPayload && typeof item.requestPayload === "object"
            ? JSON.stringify(item.requestPayload, null, 2)
            : "";
          const resultPayload = item?.resultPayload && typeof item.resultPayload === "object"
            ? JSON.stringify(item.resultPayload, null, 2)
            : "";
          return `
            <details class="details-shell chat-review-details" open>
              <summary>${escapeHTML(String(item?.toolActionId || "-"))} · ${escapeHTML(String(item?.toolType || "-"))} · ${escapeHTML(String(item?.status || "-"))}</summary>
              <div class="run-detail-chips">
                <span class="chip chip-neutral chip-compact">source=${escapeHTML(String(item?.source || "-"))}</span>
                <span class="chip chip-neutral chip-compact">worker=${escapeHTML(String(item?.workerId || "-"))}</span>
                <span class="chip chip-neutral chip-compact">approval=${escapeHTML(String(item?.approvalCheckpointId || "-"))}</span>
              </div>
              <div class="filter-row settings-editor-actions">
                <div class="action-hierarchy">
                  <div class="action-group action-group-secondary">
                    <button class="btn btn-secondary btn-small" type="button" data-chat-action="copy-tool-action-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-tool-action-id="${escapeHTML(toolActionId)}">Copy JSON</button>
                    <button class="btn btn-secondary btn-small" type="button" data-chat-action="download-tool-action-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-tool-action-id="${escapeHTML(toolActionId)}">Download JSON</button>
                  </div>
                </div>
              </div>
              ${requestPayload ? `<details class="details-shell"><summary>Request Payload</summary><pre class="code-block">${escapeHTML(requestPayload)}</pre></details>` : `<div class="meta">No request payload captured.</div>`}
              ${resultPayload ? `<details class="details-shell"><summary>Result Payload</summary><pre class="code-block">${escapeHTML(resultPayload)}</pre></details>` : `<div class="meta">No result payload captured.</div>`}
            </details>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderToolProposals(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="meta">No tool proposals recorded for this turn.</div>`;
  }
  return `
    <div class="chat-review-list">
      ${items
        .map((item) => {
          const proposalId = String(item?.proposalId || "").trim();
          const sessionId = String(item?.sessionId || "").trim();
          const status = String(item?.status || "PENDING").trim().toUpperCase();
          const command = String(item?.command || "").trim();
          const pending = status === "PENDING";
          return `
            <details class="details-shell chat-review-details" open data-chat-tool-proposal-row data-chat-session-id="${escapeHTML(sessionId)}" data-chat-proposal-id="${escapeHTML(proposalId)}">
              <summary>${escapeHTML(proposalId || "-")} · ${escapeHTML(String(item?.proposalType || "-"))} · ${escapeHTML(status)}</summary>
              <div class="run-detail-chips">
                <span class="chip chip-neutral chip-compact">worker=${escapeHTML(String(item?.workerId || "-"))}</span>
                <span class="chip chip-neutral chip-compact">confidence=${escapeHTML(String(item?.confidence || "-"))}</span>
                <span class="chip chip-neutral chip-compact">generated=${escapeHTML(formatTime(item?.generatedAt))}</span>
                ${item?.toolActionId ? `<span class="chip chip-ok chip-compact">toolAction=${escapeHTML(String(item.toolActionId))}</span>` : ""}
                ${item?.actionStatus ? `<span class="${chipClassForSessionStatus(item.actionStatus)}">action=${escapeHTML(String(item.actionStatus))}</span>` : ""}
              </div>
              <div class="meta">${escapeHTML(String(item?.summary || "No proposal summary captured."))}</div>
              ${command ? `<pre class="code-block">${escapeHTML(command)}</pre>` : `<div class="meta">No command payload captured for this proposal.</div>`}
              ${
                pending
                  ? `
                    <div class="chat-approval-action-group">
                      <input
                        class="filter-input chat-approval-reason-input"
                        type="text"
                        placeholder="decision reason"
                        data-chat-proposal-reason
                      />
                      <div class="action-group action-group-secondary">
                        <button
                          class="btn btn-secondary btn-small"
                          type="button"
                          data-chat-action="approve-tool-proposal"
                          data-chat-session-id="${escapeHTML(sessionId)}"
                          data-chat-proposal-id="${escapeHTML(proposalId)}"
                        >Approve Proposal</button>
                        <button
                          class="btn btn-danger btn-small"
                          type="button"
                          data-chat-action="deny-tool-proposal"
                          data-chat-session-id="${escapeHTML(sessionId)}"
                          data-chat-proposal-id="${escapeHTML(proposalId)}"
                        >Deny Proposal</button>
                      </div>
                    </div>
                  `
                  : `<div class="meta">${escapeHTML(item?.reviewedAt ? `reviewed=${formatTime(item.reviewedAt)}` : "proposal resolved")}${item?.reason ? `; reason=${escapeHTML(String(item.reason))}` : ""}</div>`
              }
            </details>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderEventRows(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="meta">No event stream items loaded for this turn.</div>`;
  }
  const rows = items
    .map((item) => {
      const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
      return `
        <tr>
          <td data-label="Sequence">${escapeHTML(String(item?.sequence || "-"))}</td>
          <td data-label="Type">${escapeHTML(String(item?.eventType || "-"))}</td>
          <td data-label="Summary">${escapeHTML(String(payload?.summary || payload?.status || payload?.kind || "-"))}</td>
        </tr>
      `;
    })
    .join("");
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th scope="col">Sequence</th>
          <th scope="col">Type</th>
          <th scope="col">Summary</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderProgressItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<div class="meta">No worker or session progress events were captured for this turn.</div>`;
  }
  return `
    <div class="chat-activity-list">
      ${items
        .map((item) => {
          return `
            <div class="chat-activity-item">
              <div class="chat-activity-item-head">
                <span class="${chipClassForActivityTone(item?.tone)}">${escapeHTML(String(item?.label || "Event"))}</span>
                <span class="meta">#${escapeHTML(String(item?.sequence || "-"))}; ${escapeHTML(formatTime(item?.timestamp))}</span>
              </div>
              <div class="chat-activity-item-detail">${escapeHTML(String(item?.detail || "No detail captured."))}</div>
              <div class="meta">${escapeHTML(String(item?.eventType || "-"))}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderEnvelopeLines(title, items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  return `
    <div class="chat-report-section">
      <div class="meta"><strong>${escapeHTML(title)}</strong></div>
      <ul class="chat-report-list">
        ${items.map((item) => `<li>${escapeHTML(String(item || "").replace(/^[-*]\s+/, ""))}</li>`).join("")}
      </ul>
    </div>
  `;
}

function buildChatTurnReportSubject(turn = {}, activity = {}, response = {}, timeline = {}, exportSelection = {}) {
  const session = timeline?.session || {};
  const task = timeline?.task || {};
  const selectedWorker = timeline?.selectedWorker || {};
  const approvals = Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [];
  const toolProposals = listNativeToolProposals(turn?.sessionView || {});
  const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
  const evidence = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
  const transcript = latestManagedWorkerTranscript(turn?.sessionView || {});
  return {
    header: "AgentOps enterprise governance report",
    reportType: "review",
    clientSurface: "chat",
    exportProfile: normalizedString(exportSelection.exportProfile),
    audience: normalizedString(exportSelection.audience),
    retentionClass: normalizedString(exportSelection.retentionClass),
    contextLabel: "Thread",
    contextValue: normalizedString(task?.taskId, normalizedString(turn?.taskId, "-")),
    subjectLabel: "Turn",
    subjectValue: normalizedString(turn?.requestId, normalizedString(session?.sessionId, "-")),
    taskId: normalizedString(task?.taskId, normalizedString(turn?.taskId)),
    taskStatus: normalizedString(activity?.taskStatus, normalizedString(task?.status)),
    sessionId: normalizedString(session?.sessionId, normalizedString(response?.sessionId)),
    sessionStatus: normalizedString(activity?.sessionStatus, normalizedString(session?.status)),
    workerId: normalizedString(selectedWorker?.workerId),
    workerType: normalizedString(selectedWorker?.workerType),
    workerAdapterId: normalizedString(selectedWorker?.adapterId),
    workerState: normalizedString(activity?.selectedWorkerStatus, normalizedString(selectedWorker?.status)),
    executionMode: normalizedString(activity?.executionMode, normalizedString(response?.executionMode)),
    openApprovals: Number(activity?.openApprovalCount ?? approvals.filter((item) => String(item?.status || "PENDING").trim().toUpperCase() === "PENDING").length),
    pendingProposalCount: Number(activity?.pendingProposalCount ?? toolProposals.filter((item) => String(item?.status || "PENDING").trim().toUpperCase() === "PENDING").length),
    toolActionCount: Number(activity?.toolActionCount ?? toolActions.length),
    evidenceCount: Number(activity?.evidenceCount ?? evidence.length),
    approvalCheckpoints: approvals,
    summary: normalizedString(activity?.latestWorkerSummary, normalizedString(response?.outputText, "Governed thread state refreshed.")),
    details: [
      normalizedString(response?.route) ? `Route: ${normalizedString(response.route)}` : "",
      normalizedString(response?.boundaryProviderId) ? `Boundary provider: ${normalizedString(response.boundaryProviderId)}` : "",
      normalizedString(response?.endpointRef) ? `Endpoint ref: ${normalizedString(response.endpointRef)}` : "",
      normalizedString(transcript?.toolActionId) ? `Transcript tool action: ${normalizedString(transcript.toolActionId)}` : ""
    ],
    recent: Array.isArray(activity?.progressItems)
      ? activity.progressItems.slice(-4).map((item) => `${normalizedString(item?.label, item?.eventType)}: ${normalizedString(item?.detail, "Event recorded.")}`)
      : [],
    actionHints: [
      Number(activity?.openApprovalCount ?? 0) > 0 ? `Resolve ${Number(activity.openApprovalCount)} pending approvals before external handoff.` : "",
      toolProposals.some((item) => String(item?.status || "PENDING").trim().toUpperCase() === "PENDING")
        ? "Review pending tool proposals before approving governed execution."
        : "",
      normalizedString(response?.boundaryProviderId) ? `Provider traffic is pinned to ${normalizedString(response.boundaryProviderId)}.` : ""
    ]
  };
}

export function buildChatTurnGovernanceReport(turn = {}, catalogs = {}, exportSelection = {}) {
  const sessionView = turn?.sessionView || {};
  const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : {};
  const activity = buildNativeSessionActivitySummary(sessionView);
  const response = turn?.response || {};
  const envelope = buildEnterpriseReportEnvelope(
    buildChatTurnReportSubject(turn, activity, response, timeline, exportSelection),
    catalogs?.policyPacks || {},
    catalogs?.workerCapabilities || {},
    catalogs?.exportProfiles || {},
    catalogs?.orgAdminProfiles || {}
  );
  return {
    ...envelope,
    renderedText: renderEnterpriseReportEnvelope(envelope)
  };
}

export function resolveChatGovernedExportSelection(selection = {}, exportProfileCatalog = null) {
  return buildGovernedExportSelectionState({
    clientSurface: "chat",
    reportType: "review",
    exportProfileCatalog,
    exportProfile: normalizedString(selection?.exportProfile),
    audience: normalizedString(selection?.audience),
    retentionClass: normalizedString(selection?.retentionClass)
  });
}

function renderGovernedExportControls(selectionState = {}) {
  const exportProfileOptions = Array.isArray(selectionState?.exportProfileOptions) ? selectionState.exportProfileOptions : [];
  const audienceOptions = Array.isArray(selectionState?.audienceOptions) ? selectionState.audienceOptions : [];
  const retentionClassOptions = Array.isArray(selectionState?.retentionClassOptions) ? selectionState.retentionClassOptions : [];
  if (!exportProfileOptions.length) {
    return `
      <div class="metric settings-metric settings-metric-chat-export">
        <div class="metric-title-row">
          <div class="title">Governed Export Profile</div>
        </div>
        <div class="meta">Export-profile catalog unavailable. Chat exports will continue using the normalized operator review defaults until the runtime catalog is reachable.</div>
      </div>
    `;
  }
  return `
    <div class="metric settings-metric settings-metric-chat-export">
      <div class="metric-title-row">
        <div class="title">Governed Export Profile</div>
        <span class="chip chip-neutral chip-compact">retention=${escapeHTML(String(selectionState?.retentionClass || "-"))}</span>
      </div>
      <div class="meta">These selections apply to Chat governance report, tool-action review, and evidence review exports. Choices are constrained by the runtime export-profile catalog.</div>
      <div class="settings-editor-grid">
        <label class="field">
          <span class="label">Export Profile</span>
          <select class="filter-input" data-chat-export-field="exportProfile">
            ${exportProfileOptions.map((item) => `<option value="${escapeHTML(item.value)}" ${selectedAttr(String(selectionState?.exportProfile || ""), item.value)}>${escapeHTML(item.label || item.value)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Audience</span>
          <select class="filter-input" data-chat-export-field="audience">
            ${audienceOptions.map((item) => `<option value="${escapeHTML(item)}" ${selectedAttr(String(selectionState?.audience || ""), item)}>${escapeHTML(item)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="label">Retention Class</span>
          <select class="filter-input" data-chat-export-field="retentionClass">
            ${retentionClassOptions.map((item) => `<option value="${escapeHTML(item)}" ${selectedAttr(String(selectionState?.retentionClass || ""), item)}>${escapeHTML(item)}</option>`).join("")}
          </select>
        </label>
      </div>
      ${Array.isArray(selectionState?.retentionOverlays) && selectionState.retentionOverlays.length > 0 ? `<div class="meta">overlays=${escapeHTML(selectionState.retentionOverlays.join(", "))}</div>` : ""}
    </div>
  `;
}

function renderGovernanceReport(envelope = {}, sessionId = "") {
  if (!envelope || typeof envelope !== "object") {
    return "";
  }
  return `
    <details class="details-shell chat-review-details chat-governance-report" open>
      <summary>Enterprise Governance Report</summary>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">export=${escapeHTML(String(envelope.exportProfile || "-"))}</span>
        <span class="chip chip-neutral chip-compact">audience=${escapeHTML(String(envelope.audience || "-"))}</span>
        <span class="chip chip-neutral chip-compact">exportCatalog=${escapeHTML(String((envelope.exportProfileLabels || []).length))}</span>
        <span class="chip chip-neutral chip-compact">orgAdmin=${escapeHTML(String((envelope.applicableOrgAdmins || []).length))}</span>
        <span class="chip chip-neutral chip-compact">policyPacks=${escapeHTML(String((envelope.applicablePolicyPacks || []).length))}</span>
        <span class="chip chip-neutral chip-compact">roleBundles=${escapeHTML(String((envelope.roleBundles || []).length))}</span>
        <span class="chip chip-neutral chip-compact">adminBundles=${escapeHTML(String((envelope.adminRoleBundles || []).length))}</span>
        <span class="chip chip-neutral chip-compact">workerCoverage=${escapeHTML(String((envelope.workerCapabilityLabels || []).length))}</span>
        <span class="chip chip-neutral chip-compact">dlpFindings=${escapeHTML(String((envelope.dlpFindings || []).length))}</span>
      </div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary btn-small" type="button" data-chat-action="copy-governance-report" data-chat-session-id="${escapeHTML(sessionId)}">Copy Report</button>
            <button class="btn btn-secondary btn-small" type="button" data-chat-action="download-governance-report" data-chat-session-id="${escapeHTML(sessionId)}">Download Report JSON</button>
          </div>
        </div>
      </div>
      <div class="meta">${escapeHTML(String(envelope.summary || "Enterprise governance report prepared."))}</div>
      ${renderEnvelopeLines("Details", envelope.details)}
      ${renderEnvelopeLines("Applicable org-admin profiles", envelope.applicableOrgAdmins)}
      ${renderEnvelopeLines("Applicable policy packs", envelope.applicablePolicyPacks)}
      ${renderEnvelopeLines("Export profile coverage", envelope.exportProfileLabels)}
      ${renderEnvelopeLines("Role bundles", envelope.roleBundles)}
      ${renderEnvelopeLines("Admin role bundles", envelope.adminRoleBundles)}
      ${renderEnvelopeLines("Delegation models", envelope.delegationModels)}
      ${renderEnvelopeLines("Delegated admin bundles", envelope.delegatedAdminBundles)}
      ${renderEnvelopeLines("Break-glass bundles", envelope.breakGlassBundles)}
      ${renderEnvelopeLines("Worker capability coverage", envelope.workerCapabilityLabels)}
      ${renderEnvelopeLines("Directory-sync inputs", envelope.directorySyncInputs)}
      ${renderEnvelopeLines("Residency profiles", envelope.residencyProfiles)}
      ${renderEnvelopeLines("Residency exceptions", envelope.residencyExceptions)}
      ${renderEnvelopeLines("Legal-hold profiles", envelope.legalHoldProfiles)}
      ${renderEnvelopeLines("Legal-hold exceptions", envelope.legalHoldExceptions)}
      ${renderEnvelopeLines("Network boundary profiles", envelope.networkBoundaryProfiles)}
      ${renderEnvelopeLines("Fleet rollout profiles", envelope.fleetRolloutProfiles)}
      ${renderEnvelopeLines("Quota dimensions", envelope.quotaDimensions)}
      ${renderEnvelopeLines("Quota overlays", envelope.quotaOverlays)}
      ${renderEnvelopeLines("Chargeback dimensions", envelope.chargebackDimensions)}
      ${renderEnvelopeLines("Chargeback overlays", envelope.chargebackOverlays)}
      ${renderEnvelopeLines("Enforcement hooks", envelope.enforcementHooks)}
      ${renderEnvelopeLines("Boundary requirements", envelope.boundaryRequirements)}
      ${renderEnvelopeLines("Decision surfaces", envelope.decisionSurfaces)}
      ${renderEnvelopeLines("Reporting surfaces", envelope.reportingSurfaces)}
      ${renderEnvelopeLines("Allowed audiences", envelope.allowedAudiences)}
      ${renderEnvelopeLines("Delivery channels", envelope.deliveryChannels)}
      ${renderEnvelopeLines("Redaction modes", envelope.redactionModes)}
      ${renderEnvelopeLines("Recent activity", envelope.recent)}
      ${renderEnvelopeLines("Action hints", envelope.actionHints)}
      ${renderEnvelopeLines("DLP findings", envelope.dlpFindings)}
      ${envelope.renderedText ? `<details class="details-shell"><summary>Rendered Report</summary><pre class="code-block">${escapeHTML(String(envelope.renderedText || ""))}</pre></details>` : ""}
    </details>
  `;
}

function renderThreadResolutionPanel(threadState, activitySummary, hasTask) {
  if (!hasTask || !threadState?.isResolvedThread) {
    return "";
  }
  return `
    <div class="chat-resolution-panel">
      <div class="metric-title-row">
        <div class="title">Resolved Thread</div>
        <span class="${chipClassForSessionStatus(threadState?.resolutionStatus || threadState?.sessionStatus)}">${escapeHTML(String(threadState?.resolutionStatus || threadState?.sessionStatus || "RESOLVED"))}</span>
      </div>
      <div class="meta">taskStatus=${escapeHTML(String(threadState?.taskStatus || "-"))}; sessionStatus=${escapeHTML(String(threadState?.sessionStatus || "-"))}; workerStatus=${escapeHTML(String(threadState?.latestWorkerStatus || "-"))}</div>
      <div class="meta">${escapeHTML(String(threadState?.resolutionMessage || "The current thread is resolved."))}</div>
      <div class="meta">${escapeHTML(String(activitySummary?.latestWorkerSummary || "Use a follow-up thread for a clean successor task, or reopen this task intentionally with another turn."))}</div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary" type="button" data-chat-action="start-followup-thread">Start Follow-up Thread</button>
          </div>
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary" type="button" data-chat-action="send-turn">Reopen Thread With Turn</button>
            <button class="btn btn-secondary" type="button" data-chat-action="close-thread-view">Close Thread View</button>
            <button class="btn btn-secondary" type="button" data-chat-action="archive-thread">Archive Thread</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTurnCards(turns = [], catalogs = {}, exportSelection = {}) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return `
      <div class="chat-empty-state">
        <div class="title">No turns yet</div>
        <div class="meta">Start a thread, then send the first operator prompt. Each turn will read back native M16 session state instead of legacy run detail.</div>
      </div>
    `;
  }
  return turns
    .map((turn) => {
      const sessionView = turn?.sessionView || {};
      const timeline = sessionView?.timeline && typeof sessionView.timeline === "object" ? sessionView.timeline : null;
      const session = timeline?.session || {};
      const selectedWorker = timeline?.selectedWorker || {};
      const activity = buildNativeSessionActivitySummary(sessionView);
      const response = turn?.response || {};
      const approvals = Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [];
      const evidence = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
      const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
      const toolProposals = listNativeToolProposals(sessionView);
      const transcript = latestManagedWorkerTranscript(sessionView);
      const streamItems = Array.isArray(activity?.semanticEvents) ? activity.semanticEvents : [];
      const rawTimeline = timeline ? JSON.stringify(timeline, null, 2) : "";
      const governanceReport = buildChatTurnGovernanceReport(turn, catalogs, exportSelection);
      return `
        <article class="chat-turn-card">
          <div class="chat-turn-header">
            <div class="chat-turn-meta">
              <span class="label">Turn</span>
              <span class="meta">${escapeHTML(String(turn?.requestId || "-"))}</span>
            </div>
            <span class="${chipClassForSessionStatus(session?.status)}">${escapeHTML(String(session?.status || "UNKNOWN"))}</span>
          </div>
          <div class="chat-turn-body">
            <div class="chat-message chat-message-user">
              <div class="label">Operator</div>
              <div class="chat-message-text">${escapeHTML(String(turn?.prompt || "").trim() || "-")}</div>
            </div>
            <div class="chat-message chat-message-assistant">
              <div class="label">Agent</div>
              <div class="chat-message-text">${escapeHTML(String(response?.outputText || "").trim() || "No output captured.")}</div>
            </div>
          </div>
          <div class="run-detail-chips">
            <span class="chip chip-neutral chip-compact">task=${escapeHTML(String(session?.taskId || turn?.taskId || "-"))}</span>
            <span class="chip chip-neutral chip-compact">session=${escapeHTML(String(session?.sessionId || response?.sessionId || "-"))}</span>
            <span class="chip chip-neutral chip-compact">execution=${escapeHTML(executionModeLabel(activity?.executionMode || response?.executionMode))}</span>
            <span class="chip chip-neutral chip-compact">workerType=${escapeHTML(String(selectedWorker?.workerType || "-"))}</span>
            <span class="chip chip-neutral chip-compact">worker=${escapeHTML(String(selectedWorker?.adapterId || selectedWorker?.workerId || "-"))}</span>
            <span class="chip chip-neutral chip-compact">route=${escapeHTML(String(response?.route || "-"))}</span>
            <span class="chip chip-neutral chip-compact">boundary=${escapeHTML(String(response?.boundaryProviderId || "-"))}</span>
            <span class="chip chip-neutral chip-compact">events=${escapeHTML(String(Number(timeline?.latestEventSequence || 0) || 0))}</span>
          </div>
          <div class="chat-turn-foot">
            <div class="meta">completed=${escapeHTML(formatTime(response?.completedAt || session?.completedAt || turn?.createdAt))}</div>
            <div class="meta">source=${escapeHTML(String(sessionView?.source || "not-loaded"))}; finishReason=${escapeHTML(String(response?.finishReason || "-"))}; endpointRef=${escapeHTML(String(response?.endpointRef || "-"))}</div>
          </div>
          <div class="chat-activity-panel">
            <div class="metric-title-row">
              <div class="title">Worker Review</div>
              <span class="${chipClassForSessionStatus(activity?.latestWorkerStatus || session?.status)}">${escapeHTML(String(activity?.latestWorkerStatus || session?.status || "UNKNOWN"))}</span>
            </div>
            <div class="meta">taskStatus=${escapeHTML(String(activity?.taskStatus || "-"))}; sessionStatus=${escapeHTML(String(activity?.sessionStatus || "-"))}; approvals=${escapeHTML(String(activity?.openApprovalCount ?? 0))}; evidence=${escapeHTML(String(activity?.evidenceCount ?? 0))}; toolActions=${escapeHTML(String(activity?.toolActionCount ?? 0))}</div>
            <div class="meta">${escapeHTML(String(activity?.latestWorkerSummary || "No worker progress summary recorded yet."))}</div>
            ${activity?.latestOutputText ? `<pre class="code-block chat-output-preview">${escapeHTML(String(activity.latestOutputText))}</pre>` : ""}
            ${renderProgressItems(activity?.progressItems)}
          </div>
          ${transcript ? `<details class="details-shell" open><summary>Raw Worker Transcript (${escapeHTML(String(transcript.eventCount || 0))} events)</summary><div class="meta">managedTurn=${escapeHTML(String(transcript.toolActionId || "-"))}</div><pre class="code-block">${escapeHTML(String(transcript.pretty || ""))}</pre></details>` : ""}
          <details class="details-shell" open>
            <summary>Approval checkpoints (${approvals.length})</summary>
            ${renderApprovalCheckpoints(approvals)}
          </details>
          <details class="details-shell" open>
            <summary>Tool proposals (${toolProposals.length})</summary>
            ${renderToolProposals(toolProposals)}
          </details>
          <details class="details-shell" open>
            <summary>Tool actions (${toolActions.length})</summary>
            ${renderToolActions(toolActions)}
          </details>
          <details class="details-shell" open>
            <summary>Evidence records (${evidence.length})</summary>
            ${renderEvidenceRecords(evidence)}
          </details>
          ${renderGovernanceReport(governanceReport, String(session?.sessionId || response?.sessionId || ""))}
          <details class="details-shell">
            <summary>Recent native events (${streamItems.length})</summary>
            ${renderEventRows(streamItems)}
          </details>
          ${rawTimeline ? `<details class="details-shell"><summary>Native Session Timeline JSON</summary><pre class="code-block">${escapeHTML(rawTimeline)}</pre></details>` : ""}
        </article>
      `;
    })
    .join("");
}

export function renderChat(ui, settingsPayload = {}, chatState = {}) {
  if (!ui.chatContent) {
    return;
  }
  const settings = settingsPayload || {};
  const integrations = settings?.integrations || {};
  const profiles = Array.isArray(integrations.agentProfiles) ? integrations.agentProfiles : [];
  const selectedProfileId = String(
    chatState.agentProfileId || integrations.selectedAgentProfileId || profiles[0]?.id || ""
  )
    .trim()
    .toLowerCase();
  const profileOptions = profiles
    .map((profile) => {
      const id = String(profile?.id || "").trim().toLowerCase();
      const label = String(profile?.label || id || "unknown").trim() || "unknown";
      return `<option value="${escapeHTML(id)}" ${selectedAttr(selectedProfileId, id)}>${escapeHTML(label)}</option>`;
    })
    .join("");
  const thread = chatState?.thread && typeof chatState.thread === "object" ? chatState.thread : null;
  const history = chatState?.history && typeof chatState.history === "object" ? chatState.history : {};
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  const status = String(chatState.status || "idle").trim().toLowerCase() || "idle";
  const message = String(chatState.message || "").trim();
  const taskId = String(thread?.taskId || "").trim();
  const tenantId = String(thread?.tenantId || "").trim();
  const projectId = String(thread?.projectId || "").trim();
  const latestTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const threadState = deriveOperatorChatThreadState(thread || {});
  const latestActivity = latestTurn?.sessionView ? buildNativeSessionActivitySummary(latestTurn.sessionView) : null;
  const activeHistoryItem = (Array.isArray(history?.items) ? history.items : []).find(
    (item) => String(item?.taskId || "").trim() === taskId
  );
  const startAction = taskId && threadState?.isResolvedThread ? "start-followup-thread" : "start-thread";
  const startLabel = taskId && threadState?.isResolvedThread ? "Start Follow-up Thread" : "Start Thread";
  const sendLabel = taskId && threadState?.isResolvedThread ? "Reopen Thread With Turn" : "Send Turn";
  const executionMode = String(chatState.executionMode || thread?.executionMode || "raw_model_invoke").trim().toLowerCase();
  const selectedWorker = latestTurn?.sessionView?.timeline?.selectedWorker || {};
  const catalogState = chatState?.catalogs && typeof chatState.catalogs === "object" ? chatState.catalogs : {};
  const governedExportSelection = resolveChatGovernedExportSelection(chatState?.exportSelection || {}, catalogState?.exportProfiles || null);
  const managedExecution = executionMode === "managed_codex_worker";
  const managedSessionId = String(latestTurn?.sessionView?.timeline?.session?.sessionId || "").trim();
  const managedWorkerId = String(latestActivity?.selectedWorkerId || selectedWorker?.workerId || "").trim();
  const managedWorkerReady = managedExecution && Boolean(taskId) && Boolean(managedWorkerId) && !threadState?.isResolvedThread;
  const canLaunchManagedWorker = managedExecution && Boolean(taskId) && !managedWorkerReady;
  const canReattachManagedWorker = managedExecution && Boolean(taskId) && Boolean(managedSessionId) && !threadState?.isResolvedThread;
  const canRecoverManagedWorker = managedExecution && Boolean(taskId);
  const canCloseManagedWorker = managedExecution && Boolean(managedSessionId) && !threadState?.isResolvedThread;

  ui.chatContent.innerHTML = `
    <div class="stack chat-surface">
      <div class="panel-heading">
        <h2>Operator Chat</h2>
        <p class="panel-lead">Bootstrap governed chat on top of the M16 task and session contract. This surface creates a task once, sends turns against that task, and reads native timeline or event-stream state for each turn.</p>
      </div>
      <div class="metric workflow-guide">
        <div class="title">Chat Workflow</div>
        <div class="meta">Start a thread for the current tenant and project scope, send operator prompts, then inspect the native M16 session record attached to each turn.</div>
        <ol class="workflow-guide-list">
          <li>Confirm tenant and project scope before starting a chat thread.</li>
          <li>Use one agent profile consistently within the thread unless you intentionally want route changes.</li>
          <li>Inspect each turn’s native session timeline before treating the response as authoritative.</li>
        </ol>
      </div>
      <div class="metric settings-metric settings-metric-chat-thread">
        <div class="metric-title-row">
          <div class="title">Thread State</div>
          <span class="${chipClassForSessionStatus(status)}">${escapeHTML(status.toUpperCase())}</span>
        </div>
        <div class="meta">task=${escapeHTML(taskId || "-")}; tenant=${escapeHTML(tenantId || "-")}; project=${escapeHTML(projectId || "-")}</div>
        <div class="run-detail-chips">
          <span class="chip chip-neutral chip-compact">execution=${escapeHTML(executionModeLabel(executionMode))}</span>
          <span class="chip chip-neutral chip-compact">taskStatus=${escapeHTML(String(threadState?.taskStatus || activeHistoryItem?.status || "-"))}</span>
          <span class="chip chip-neutral chip-compact">sessionStatus=${escapeHTML(String(threadState?.sessionStatus || "-"))}</span>
          <span class="chip chip-neutral chip-compact">workerStatus=${escapeHTML(String(threadState?.latestWorkerStatus || "-"))}</span>
          <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(threadState?.openApprovalCount ?? 0))}</span>
        </div>
        <div class="run-detail-chips">
          <span class="chip chip-neutral chip-compact">workerType=${escapeHTML(String(latestActivity?.selectedWorkerType || selectedWorker?.workerType || "-"))}</span>
          <span class="chip chip-neutral chip-compact">workerAdapter=${escapeHTML(String(latestActivity?.selectedWorkerAdapterId || selectedWorker?.adapterId || "-"))}</span>
          <span class="chip chip-neutral chip-compact">workerTarget=${escapeHTML(String(latestActivity?.selectedWorkerTargetEnvironment || selectedWorker?.targetEnvironment || "-"))}</span>
        </div>
        <div class="meta">${escapeHTML(message || "Use Start Thread to create an M16 task, then Send Turn to invoke the selected agent profile against that task.")}</div>
        ${latestActivity?.latestWorkerSummary ? `<div class="meta">${escapeHTML(String(latestActivity.latestWorkerSummary))}</div>` : ""}
        ${
          managedExecution
            ? `<div class="meta">${escapeHTML(managedWorkerReady
              ? "Managed Codex worker controls are active on the latest native session. Reattach if the bridge must bind again, Recover to mint a fresh managed session, or Close to cancel the active managed session cleanly."
              : "Managed Codex worker path selected. Launch to attach the bridge, or Recover to create a fresh managed session if the latest managed thread is already resolved.")}</div>`
            : ""
        }
        ${catalogState?.message ? `<div class="meta">governanceCatalogs=${escapeHTML(String(catalogState.source || "-"))}; ${escapeHTML(String(catalogState.message || ""))}</div>` : ""}
      </div>
      ${renderGovernedExportControls(governedExportSelection)}
      ${renderThreadResolutionPanel(threadState, latestActivity, Boolean(taskId))}
      <div class="chat-history-layout">
        <div class="metric settings-metric settings-metric-chat-history">
          <div class="metric-title-row">
            <div class="title">Native Thread History</div>
            <span class="chip chip-neutral chip-compact">${escapeHTML(String(history?.count ?? 0))} threads</span>
          </div>
          <div class="meta">${escapeHTML(String(history?.message || "Resume a prior chat thread directly from native M16 task/session records."))}</div>
          <div class="run-detail-chips">
            <span class="chip chip-neutral chip-compact">visible=${escapeHTML(String(history?.count ?? 0))}</span>
            <span class="chip chip-neutral chip-compact">archived=${escapeHTML(String(history?.archivedCount ?? 0))}</span>
          </div>
          <div class="filter-row settings-editor-actions">
            <div class="action-hierarchy">
              <div class="action-group action-group-secondary">
                <button class="btn btn-secondary btn-small" type="button" data-chat-action="refresh-threads">Refresh Threads</button>
                <button class="btn btn-secondary btn-small" type="button" data-chat-action="toggle-archived-threads">${history?.showArchived ? "Hide Archived" : "Show Archived"}</button>
              </div>
            </div>
          </div>
          <div class="chat-thread-list">
            ${renderHistoryItems(history, taskId)}
          </div>
        </div>
      </div>
      <div class="settings-editor-grid chat-composer-grid">
        <label class="field">
          <span class="label">Thread Title</span>
          <input id="chat-thread-title" class="filter-input" type="text" value="${escapeHTML(String(chatState.title || ""))}" data-chat-field="title" />
        </label>
        <label class="field">
          <span class="label">Agent Profile</span>
          <select id="chat-agent-profile" class="filter-input" data-chat-field="agentProfileId">${profileOptions}</select>
        </label>
        <label class="field">
          <span class="label">Execution Path</span>
          <select id="chat-execution-mode" class="filter-input" data-chat-field="executionMode">
            <option value="raw_model_invoke" ${selectedAttr(executionMode, "raw_model_invoke")}>Raw Model Invoke</option>
            <option value="managed_codex_worker" ${selectedAttr(executionMode, "managed_codex_worker")}>Managed Codex Worker</option>
          </select>
        </label>
        <label class="field field-wide">
          <span class="label">Thread Intent</span>
          <input id="chat-thread-intent" class="filter-input" type="text" value="${escapeHTML(String(chatState.intent || ""))}" data-chat-field="intent" />
        </label>
        <label class="field field-wide">
          <span class="label">System Prompt</span>
          <textarea id="chat-system-prompt" class="filter-input settings-agent-test-textarea" rows="3" data-chat-field="systemPrompt">${escapeHTML(String(chatState.systemPrompt || ""))}</textarea>
        </label>
        <label class="field field-wide">
          <span class="label">Operator Prompt</span>
          <textarea id="chat-prompt" class="filter-input settings-agent-test-textarea" rows="5" data-chat-field="prompt">${escapeHTML(String(chatState.prompt || ""))}</textarea>
        </label>
      </div>
      <div class="filter-row settings-editor-actions">
        <div class="action-hierarchy">
          <div class="action-group action-group-primary">
            <button class="btn btn-primary" type="button" data-chat-action="${startAction}">${startLabel}</button>
            <button class="btn btn-primary" type="button" data-chat-action="send-turn" ${taskId ? "" : "disabled"}>${sendLabel}</button>
          </div>
          ${
            managedExecution
              ? `
                <div class="action-group action-group-secondary">
                  <button class="btn btn-secondary" type="button" data-chat-action="launch-managed-worker" ${canLaunchManagedWorker ? "" : "disabled"}>Launch Managed Worker</button>
                  <button class="btn btn-secondary" type="button" data-chat-action="reattach-managed-worker" ${canReattachManagedWorker ? "" : "disabled"}>Reattach Worker</button>
                  <button class="btn btn-secondary" type="button" data-chat-action="emit-worker-heartbeat" ${managedWorkerReady ? "" : "disabled"}>Emit Heartbeat</button>
                  <button class="btn btn-secondary" type="button" data-chat-action="recover-managed-worker" ${canRecoverManagedWorker ? "" : "disabled"}>Recover Worker</button>
                  <button class="btn btn-danger" type="button" data-chat-action="close-managed-worker" ${canCloseManagedWorker ? "" : "disabled"}>Close Worker Session</button>
                </div>
              `
              : ""
          }
          <div class="action-group action-group-secondary">
            <button class="btn btn-secondary" type="button" data-chat-action="refresh-last-turn" ${latestTurn?.response?.sessionId ? "" : "disabled"}>Refresh Last Turn</button>
          </div>
          <div class="action-group action-group-destructive">
            <button class="btn btn-danger" type="button" data-chat-action="reset-thread" ${taskId ? "" : "disabled"}>Reset Thread</button>
          </div>
        </div>
      </div>
      <div class="chat-turns-stack">
        ${renderTurnCards(turns, catalogState, governedExportSelection)}
      </div>
    </div>
  `;
}
