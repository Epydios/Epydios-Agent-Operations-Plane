import { displayPolicyProviderLabel, escapeHTML, formatTime } from "./common.js";
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
  if (status === "COMPLETED" || status === "READY" || status === "SUCCESS" || status === "CLEARED") {
    return "chip chip-ok chip-compact";
  }
  if (status === "RUNNING" || status === "AWAITING_APPROVAL" || status === "AWAITING_WORKER" || status === "WARN" || status === "DEFERRED") {
    return "chip chip-warn chip-compact";
  }
  if (status === "FAILED" || status === "BLOCKED" || status === "CANCELLED" || status === "ERROR" || status === "INVALID" || status === "DENIED") {
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

function chipClassForPolicyDecision(value) {
  const decision = String(value || "").trim().toUpperCase();
  if (decision === "ALLOW" || decision === "APPROVE") {
    return "chip chip-ok chip-compact";
  }
  if (decision === "DEFER" || decision === "WARN") {
    return "chip chip-warn chip-compact";
  }
  if (decision === "DENY" || decision === "ERROR") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function chipClassForPolicyEffect(outcome = {}) {
  return chipClassForPolicyDecision(outcome?.decision);
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

function detailKey(...parts) {
  return parts
    .map((value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_"))
    .filter(Boolean)
    .join(".");
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArrayValue(value) {
  return Array.isArray(value)
    ? value
        .map((item) => normalizedString(item))
        .filter(Boolean)
    : [];
}

function isGovernedActionProposal(item = {}) {
  return normalizedString(item?.proposalType, item?.toolType).toLowerCase() === "governed_action_request";
}

function renderGovernedRunLink(runId) {
  const normalizedRunId = normalizedString(runId);
  if (!normalizedRunId) {
    return "";
  }
  return `
    <div class="action-group action-group-secondary">
      <button
        class="btn btn-secondary btn-small"
        type="button"
        data-chat-action="open-governed-run"
        data-chat-run-id="${escapeHTML(normalizedRunId)}"
      >Open Run Detail</button>
    </div>
  `;
}

function derivePolicyOutcomePresentation(decisionValue, providerValue, reasonValue) {
  const decision = normalizedString(decisionValue).toUpperCase();
  const provider = normalizedString(displayPolicyProviderLabel(providerValue), "-");
  const reason = normalizedString(reasonValue);
  if (decision === "ALLOW") {
    return {
      decision,
      provider,
      effectLabel: "policy cleared",
      bannerClass: "policy-outcome-banner is-allow",
      headline: `${provider || "Policy provider"} cleared the request.`,
      detail: reason || "This request passed policy evaluation and is ready for the next execution stage."
    };
  }
  if (decision === "DEFER") {
    return {
      decision,
      provider,
      effectLabel: "execution deferred",
      bannerClass: "policy-outcome-banner is-defer",
      headline: `${provider || "Policy provider"} deferred the request.`,
      detail: reason || "The request is deferred pending additional grants, evidence, or other governance readiness."
    };
  }
  if (decision === "DENY") {
    return {
      decision,
      provider,
      effectLabel: "policy blocked",
      bannerClass: "policy-outcome-banner is-deny",
      headline: `${provider || "Policy provider"} blocked the request.`,
      detail: reason || "The request failed policy evaluation and should not proceed."
    };
  }
  return {
    decision,
    provider,
    effectLabel: "policy pending",
    bannerClass: "policy-outcome-banner",
    headline: "The provider outcome is still pending.",
    detail: reason || "Review the linked run detail before treating this request as cleared."
  };
}

function latestPolicyOutcomeFromTurns(turns = []) {
  const turnList = Array.isArray(turns) ? turns : [];
  const latestTurn = turnList.length > 0 ? turnList[turnList.length - 1] : null;
  const sessionView = latestTurn?.sessionView;
  const proposals = listNativeToolProposals(sessionView);
  for (let proposalIndex = proposals.length - 1; proposalIndex >= 0; proposalIndex -= 1) {
    const proposal = proposals[proposalIndex];
    const decision = normalizedString(proposal?.policyDecision).toUpperCase();
    if (!decision) {
      continue;
    }
    const provider = normalizedString(displayPolicyProviderLabel(proposal?.selectedPolicyProvider));
    const runId = normalizedString(proposal?.runId);
    const requestLabel = normalizedString(
      proposal?.requestLabel,
      normalizedString(objectValue(proposal?.payload)?.requestLabel, normalizedString(proposal?.summary, "Governed Action Request"))
    );
    const outcome = derivePolicyOutcomePresentation(decision, provider, normalizedString(proposal?.reason));
    return {
      decision,
      provider,
      runId,
      requestLabel,
      outcome
    };
  }
  return null;
}

function renderGovernedProposalSummary(item = {}, options = {}) {
  const payload = objectValue(item?.payload);
  const financeOrder = objectValue(item?.financeOrder && Object.keys(item.financeOrder || {}).length ? item.financeOrder : payload.financeOrder);
  const requiredGrants = stringArrayValue(item?.requiredGrants?.length ? item.requiredGrants : payload.requiredGrants);
  const requestLabel = normalizedString(item?.requestLabel, normalizedString(payload?.requestLabel, "Governed Action Request"));
  const requestSummary = normalizedString(item?.requestSummary, normalizedString(payload?.requestSummary, normalizedString(item?.summary, "No governed request summary captured.")));
  const runSnapshot = objectValue(item?.governedRun);
  const runId = normalizedString(item?.runId, normalizedString(runSnapshot?.runId));
  const runStatus = normalizedString(item?.runStatus, normalizedString(runSnapshot?.status));
  const policyDecision = normalizedString(item?.policyDecision, normalizedString(runSnapshot?.policyDecision)).toUpperCase();
  const selectedPolicyProvider = normalizedString(
    displayPolicyProviderLabel(item?.selectedPolicyProvider),
    normalizedString(displayPolicyProviderLabel(runSnapshot?.selectedPolicyProvider))
  );
  const policyOutcome = derivePolicyOutcomePresentation(policyDecision, selectedPolicyProvider, "");
  const showResult = options.showResult !== false;

  return `
    <div class="chat-governed-proposal">
      <div class="metric-title-row">
        <div class="title">${escapeHTML(requestLabel)}</div>
        ${policyDecision ? `<span class="${chipClassForPolicyDecision(policyDecision)}">${escapeHTML(policyDecision)}</span>` : ""}
      </div>
      <div class="meta">${escapeHTML(requestSummary)}</div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">action=${escapeHTML(normalizedString(item?.actionType, normalizedString(payload?.actionType, "-")))}</span>
        <span class="chip chip-neutral chip-compact">resource=${escapeHTML(normalizedString(item?.resourceKind, normalizedString(payload?.resourceKind, "-")))}/${escapeHTML(normalizedString(item?.resourceName, normalizedString(payload?.resourceName, "-")))}</span>
        <span class="chip chip-neutral chip-compact">boundary=${escapeHTML(normalizedString(item?.boundaryClass, normalizedString(payload?.boundaryClass, "-")))}</span>
        <span class="chip chip-neutral chip-compact">risk=${escapeHTML(normalizedString(item?.riskTier, normalizedString(payload?.riskTier, "-")))}</span>
        <span class="chip chip-neutral chip-compact">evidence=${escapeHTML(normalizedString(item?.evidenceReadiness, normalizedString(payload?.evidenceReadiness, "-")))}</span>
        <span class="chip chip-neutral chip-compact">grants=${escapeHTML(String(requiredGrants.length))}</span>
      </div>
      ${requiredGrants.length ? `<div class="meta">requiredGrants=${escapeHTML(requiredGrants.join(", "))}</div>` : ""}
      ${Object.keys(financeOrder).length ? `<div class="meta">financeOrder=${escapeHTML(JSON.stringify(financeOrder))}</div>` : ""}
      ${
        showResult && (runId || policyDecision || selectedPolicyProvider || runStatus)
          ? `
            <div class="run-detail-chips">
              ${runId ? `<span class="chip chip-neutral chip-compact">run=${escapeHTML(runId)}</span>` : ""}
              ${runStatus ? `<span class="${chipClassForSessionStatus(runStatus)}">${escapeHTML(runStatus)}</span>` : ""}
              ${selectedPolicyProvider ? `<span class="chip chip-neutral chip-compact">provider=${escapeHTML(selectedPolicyProvider)}</span>` : ""}
              ${policyDecision ? `<span class="${chipClassForPolicyEffect(policyOutcome)}">effect=${escapeHTML(policyOutcome.effectLabel)}</span>` : ""}
            </div>
            ${renderGovernedRunLink(runId)}
          `
          : ""
      }
    </div>
  `;
}

function renderGovernedActionResultSummary(item = {}) {
  const requestPayload = objectValue(item?.requestPayload);
  const resultPayload = objectValue(item?.resultPayload);
  const governedRun = objectValue(resultPayload?.governedRun);
  if (!Object.keys(governedRun).length) {
    return "";
  }
  const policyResponse = objectValue(governedRun?.policyResponse);
  const reasons = Array.isArray(policyResponse?.reasons) ? policyResponse.reasons : [];
  const firstReason = objectValue(reasons[0]);
  const runId = normalizedString(governedRun?.runId);
  const runStatus = normalizedString(governedRun?.status);
  const policyDecision = normalizedString(governedRun?.policyDecision).toUpperCase();
  const provider = normalizedString(displayPolicyProviderLabel(governedRun?.selectedPolicyProvider));
  const reviewMode = normalizedString(resultPayload?.reviewMode, normalizedString(requestPayload?.reviewMode));
  const operatorApprovalRequired =
    requestPayload?.operatorApprovalRequired === true
    || reviewMode === "operator_review";
  const operatorGateLabel = operatorApprovalRequired ? "manual review" : "policy-first";
  const outcome = derivePolicyOutcomePresentation(policyDecision, provider, firstReason?.message);
  return `
    <div class="chat-governed-proposal">
      <div class="metric-title-row">
        <div class="title">Governed Run Result</div>
        ${policyDecision ? `<span class="${chipClassForPolicyDecision(policyDecision)}">${escapeHTML(policyDecision)}</span>` : ""}
      </div>
      <div class="${escapeHTML(outcome.bannerClass)}">
        <div class="run-detail-chips">
          <span class="chip chip-neutral chip-compact">operatorGate=${escapeHTML(operatorGateLabel)}</span>
          <span class="chip chip-neutral chip-compact">provider=${escapeHTML(outcome.provider || "-")}</span>
          <span class="${chipClassForPolicyEffect(outcome)}">effect=${escapeHTML(outcome.effectLabel)}</span>
        </div>
        <div class="policy-outcome-detail">${escapeHTML(outcome.headline)}</div>
        <div class="meta">${escapeHTML(outcome.detail)}</div>
      </div>
      <div class="run-detail-chips">
        ${runId ? `<span class="chip chip-neutral chip-compact">run=${escapeHTML(runId)}</span>` : ""}
        ${runStatus ? `<span class="${chipClassForSessionStatus(runStatus)}">${escapeHTML(runStatus)}</span>` : ""}
        ${provider ? `<span class="chip chip-neutral chip-compact">provider=${escapeHTML(provider)}</span>` : ""}
        ${governedRun?.policyGrantTokenPresent ? `<span class="chip chip-ok chip-compact">grantToken=true</span>` : ""}
      </div>
      ${renderGovernedRunLink(runId)}
    </div>
  `;
}

function renderHistoryItems(history = {}, activeTaskId = "", context = {}) {
  const items = Array.isArray(history?.items) ? history.items : [];
  if (items.length === 0) {
    const tenantId = String(context?.tenantId || "").trim();
    const projectId = String(context?.projectId || "").trim();
    const historyMessage = String(history?.message || "").trim()
      || "No native operator chat threads exist yet for the current scope.";
    const catalogsMessage = String(context?.catalogsMessage || "").trim();
    const liveMode = String(context?.mode || "").trim().toLowerCase() === "live";
    const endpointUnavailable =
      String(history?.source || "").trim().toLowerCase() === "endpoint-unavailable"
      || /unavailable|incomplete|updated/i.test(catalogsMessage);
    const scopeSummary = tenantId && projectId
      ? `tenant=${tenantId}; project=${projectId}`
      : "tenant/project scope is still resolving";
    return `
      <div class="chat-empty-state">
        <div class="title">${escapeHTML(endpointUnavailable ? "Live runtime contract is incomplete for Chat history" : "No governed chat threads exist yet")}</div>
        <div class="meta">${escapeHTML(historyMessage)}</div>
        <div class="meta">${escapeHTML(scopeSummary)}</div>
        ${
          catalogsMessage
            ? `<div class="meta">${escapeHTML(catalogsMessage)}</div>`
            : ""
        }
        <ol class="workflow-guide-list chat-empty-state-list">
          <li>${escapeHTML(liveMode ? "This is expected on first live load before the first native task is created." : "This surface stays empty until you create the first native chat task.")}</li>
          <li>Use <strong>Start Thread</strong> to create the governed task for the current scope.</li>
          <li>${escapeHTML(endpointUnavailable ? "If the runtime contract warning persists, use the M21 local-runtime launcher so Chat can read the full repo contract." : "If provider routing is not ready yet, use Settings or Agent Invocation Test to validate the live runtime first.")}</li>
        </ol>
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
                class="btn btn-ok btn-small"
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
          const evidenceDetailKey = detailKey("chat", "evidence", sessionId || "unknown", evidenceId || "unknown");
          const metadata = item?.metadata && typeof item.metadata === "object" ? JSON.stringify(item.metadata, null, 2) : "";
          return `
            <details class="details-shell chat-review-details" data-detail-key="${escapeHTML(evidenceDetailKey)}" open>
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
          const toolActionDetailKey = detailKey("chat", "tool_action", sessionId || "unknown", toolActionId || "unknown");
          const requestDetailKey = detailKey(toolActionDetailKey, "request");
          const resultDetailKey = detailKey(toolActionDetailKey, "result");
          const requestPayload = item?.requestPayload && typeof item.requestPayload === "object"
            ? JSON.stringify(item.requestPayload, null, 2)
            : "";
          const resultPayload = item?.resultPayload && typeof item.resultPayload === "object"
            ? JSON.stringify(item.resultPayload, null, 2)
            : "";
          const governedRunSummary = normalizedString(item?.toolType).toLowerCase() === "governed_action_request"
            ? renderGovernedActionResultSummary(item)
            : "";
          return `
            <details class="details-shell chat-review-details" data-detail-key="${escapeHTML(toolActionDetailKey)}" open>
              <summary>${escapeHTML(String(item?.toolActionId || "-"))} · ${escapeHTML(String(item?.toolType || "-"))} · ${escapeHTML(String(item?.status || "-"))}</summary>
              <div class="run-detail-chips">
                <span class="chip chip-neutral chip-compact">source=${escapeHTML(String(item?.source || "-"))}</span>
                <span class="chip chip-neutral chip-compact">worker=${escapeHTML(String(item?.workerId || "-"))}</span>
                <span class="chip chip-neutral chip-compact">approval=${escapeHTML(String(item?.approvalCheckpointId || "-"))}</span>
              </div>
              ${governedRunSummary}
              <div class="filter-row settings-editor-actions">
                <div class="action-hierarchy">
                  <div class="action-group action-group-secondary">
                    <button class="btn btn-secondary btn-small" type="button" data-chat-action="copy-tool-action-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-tool-action-id="${escapeHTML(toolActionId)}">Copy JSON</button>
                    <button class="btn btn-secondary btn-small" type="button" data-chat-action="download-tool-action-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-tool-action-id="${escapeHTML(toolActionId)}">Download JSON</button>
                  </div>
                </div>
              </div>
              ${requestPayload ? `<details class="details-shell" data-detail-key="${escapeHTML(requestDetailKey)}"><summary>Request Payload</summary><pre class="code-block">${escapeHTML(requestPayload)}</pre></details>` : `<div class="meta">No request payload captured.</div>`}
              ${resultPayload ? `<details class="details-shell" data-detail-key="${escapeHTML(resultDetailKey)}"><summary>Result Payload</summary><pre class="code-block">${escapeHTML(resultPayload)}</pre></details>` : `<div class="meta">No result payload captured.</div>`}
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
          const governed = isGovernedActionProposal(item);
          const proposalDetailKey = detailKey("chat", "tool_proposal", sessionId || "unknown", proposalId || "unknown");
          const resolutionMeta = item?.decision === "AUTO"
            ? `${escapeHTML(item?.reviewedAt ? `policyEvaluated=${formatTime(item.reviewedAt)}` : "policy evaluated")}${item?.reason ? `; reason=${escapeHTML(String(item.reason))}` : ""}`
            : `${escapeHTML(item?.reviewedAt ? `reviewed=${formatTime(item.reviewedAt)}` : "proposal resolved")}${item?.reason ? `; reason=${escapeHTML(String(item.reason))}` : ""}`;
          return `
            <details class="details-shell chat-review-details" data-detail-key="${escapeHTML(proposalDetailKey)}" open data-chat-tool-proposal-row data-chat-session-id="${escapeHTML(sessionId)}" data-chat-proposal-id="${escapeHTML(proposalId)}">
              <summary>${escapeHTML(proposalId || "-")} · ${escapeHTML(String(item?.proposalType || "-"))} · ${escapeHTML(status)}</summary>
              <div class="run-detail-chips">
                <span class="chip chip-neutral chip-compact">worker=${escapeHTML(String(item?.workerId || "-"))}</span>
                <span class="chip chip-neutral chip-compact">confidence=${escapeHTML(String(item?.confidence || "-"))}</span>
                <span class="chip chip-neutral chip-compact">generated=${escapeHTML(formatTime(item?.generatedAt))}</span>
                ${item?.toolActionId ? `<span class="chip chip-ok chip-compact">toolAction=${escapeHTML(String(item.toolActionId))}</span>` : ""}
                ${item?.actionStatus ? `<span class="${chipClassForSessionStatus(item.actionStatus)}">action=${escapeHTML(String(item.actionStatus))}</span>` : ""}
              </div>
              ${
                governed
                  ? renderGovernedProposalSummary(item)
                  : `
                    <div class="meta">${escapeHTML(String(item?.summary || "No proposal summary captured."))}</div>
                    ${command ? `<pre class="code-block">${escapeHTML(command)}</pre>` : `<div class="meta">No command payload captured for this proposal.</div>`}
                  `
              }
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
                          class="btn btn-ok btn-small"
                          type="button"
                          data-chat-action="approve-tool-proposal"
                          data-chat-session-id="${escapeHTML(sessionId)}"
                          data-chat-proposal-id="${escapeHTML(proposalId)}"
                        >${governed ? "Approve Request" : "Approve Proposal"}</button>
                        <button
                          class="btn btn-danger btn-small"
                          type="button"
                          data-chat-action="deny-tool-proposal"
                          data-chat-session-id="${escapeHTML(sessionId)}"
                          data-chat-proposal-id="${escapeHTML(proposalId)}"
                        >${governed ? "Deny Request" : "Deny Proposal"}</button>
                      </div>
                    </div>
                  `
                  : `<div class="meta">${resolutionMeta}</div>`
              }
            </details>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTurnActionInbox(approvalItems = [], proposalItems = []) {
  const pendingApprovals = (Array.isArray(approvalItems) ? approvalItems : []).filter(
    (item) => String(item?.status || "-").trim().toUpperCase() === "PENDING"
  );
  const pendingProposals = (Array.isArray(proposalItems) ? proposalItems : []).filter(
    (item) => String(item?.status || "PENDING").trim().toUpperCase() === "PENDING"
  );
  if (pendingApprovals.length === 0 && pendingProposals.length === 0) {
    return "";
  }
  const approvalCards = pendingApprovals
    .map((item) => {
      const sessionId = String(item?.sessionId || "").trim();
      const checkpointId = String(item?.checkpointId || "").trim();
      return `
        <article class="chat-review-inbox-card" data-chat-approval-row data-chat-session-id="${escapeHTML(sessionId)}" data-chat-checkpoint-id="${escapeHTML(checkpointId)}">
          <div class="metric-title-row">
            <div class="title">Approval Checkpoint</div>
            <span class="${chipClassForSessionStatus(item?.status)}">${escapeHTML(String(item?.status || "PENDING").trim().toUpperCase())}</span>
          </div>
          <div class="meta">checkpoint=${escapeHTML(checkpointId || "-")}; scope=${escapeHTML(String(item?.scope || "-"))}</div>
          <div class="meta">${escapeHTML(String(item?.reason || "No checkpoint reason captured."))}</div>
          <div class="chat-approval-action-group">
            <input
              class="filter-input chat-approval-reason-input"
              type="text"
              placeholder="decision reason"
              data-chat-approval-reason
            />
            <div class="action-group action-group-secondary">
              <button
                class="btn btn-ok"
                type="button"
                data-chat-action="approve-checkpoint"
                data-chat-session-id="${escapeHTML(sessionId)}"
                data-chat-checkpoint-id="${escapeHTML(checkpointId)}"
              >Approve</button>
              <button
                class="btn btn-danger"
                type="button"
                data-chat-action="deny-checkpoint"
                data-chat-session-id="${escapeHTML(sessionId)}"
                data-chat-checkpoint-id="${escapeHTML(checkpointId)}"
              >Deny</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
  const proposalCards = pendingProposals
    .map((item) => {
      const sessionId = String(item?.sessionId || "").trim();
      const proposalId = String(item?.proposalId || "").trim();
      const governed = isGovernedActionProposal(item);
          const proposalLabel = governed
            ? normalizedString(item?.requestLabel, "Governed Action Request")
            : "Tool Proposal";
      const proposalSummary = governed
        ? normalizedString(item?.requestSummary, normalizedString(item?.summary, "No governed request summary captured."))
        : normalizedString(item?.summary, "No proposal summary captured.");
      return `
        <article class="chat-review-inbox-card" data-chat-tool-proposal-row data-chat-session-id="${escapeHTML(sessionId)}" data-chat-proposal-id="${escapeHTML(proposalId)}">
          <div class="metric-title-row">
            <div class="title">${escapeHTML(proposalLabel)}</div>
            <span class="${chipClassForSessionStatus(item?.status || "PENDING")}">${escapeHTML(String(item?.status || "PENDING").trim().toUpperCase())}</span>
          </div>
          <div class="meta">proposal=${escapeHTML(proposalId || "-")}; type=${escapeHTML(String(item?.proposalType || "-"))}; manualReview=${escapeHTML(String(item?.operatorApprovalRequired === true))}</div>
          <div class="meta">${escapeHTML(proposalSummary)}</div>
          <div class="chat-approval-action-group">
            <input
              class="filter-input chat-approval-reason-input"
              type="text"
              placeholder="decision reason"
              data-chat-proposal-reason
            />
            <div class="action-group action-group-secondary">
              <button
                class="btn btn-ok"
                type="button"
                data-chat-action="approve-tool-proposal"
                data-chat-session-id="${escapeHTML(sessionId)}"
                data-chat-proposal-id="${escapeHTML(proposalId)}"
              >${governed ? "Approve Request" : "Approve Proposal"}</button>
              <button
                class="btn btn-danger"
                type="button"
                data-chat-action="deny-tool-proposal"
                data-chat-session-id="${escapeHTML(sessionId)}"
                data-chat-proposal-id="${escapeHTML(proposalId)}"
              >${governed ? "Deny Request" : "Deny Proposal"}</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
  return `
    <div class="chat-review-inbox">
      <div class="metric-title-row">
        <div class="title">Pending Decisions</div>
        <span class="chip chip-danger chip-compact">items=${escapeHTML(String(pendingApprovals.length + pendingProposals.length))}</span>
      </div>
      <div class="meta">Pending approvals and proposals are surfaced here so you do not have to dig into the detailed review sections first.</div>
      <div class="chat-review-inbox-grid">
        ${approvalCards}
        ${proposalCards}
      </div>
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
    sessionEvents: Array.isArray(timeline?.events) ? timeline.events : [],
    evidenceRecords: evidence,
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
  const reportDetailKey = detailKey("chat", "governance_report", sessionId || "unknown");
  const renderedReportDetailKey = detailKey(reportDetailKey, "rendered");
  return `
    <details class="details-shell chat-review-details chat-governance-report" data-detail-key="${escapeHTML(reportDetailKey)}">
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
      ${renderEnvelopeLines("Active org-admin categories", envelope.activeOrgAdminCategories)}
      ${renderEnvelopeLines("Active org-admin decision bindings", envelope.activeOrgAdminDecisionBindings)}
      ${renderEnvelopeLines("Active org-admin decision actor roles", envelope.activeOrgAdminDecisionActorRoles)}
      ${renderEnvelopeLines("Active org-admin decision surfaces", envelope.activeOrgAdminDecisionSurfaces)}
      ${renderEnvelopeLines("Active org-admin boundary requirements", envelope.activeOrgAdminBoundaryRequirements)}
      ${renderEnvelopeLines("Active org-admin input keys", envelope.activeOrgAdminInputKeys)}
      ${renderEnvelopeLines("Active org-admin directory-sync mappings", envelope.activeOrgAdminDirectoryMappings)}
      ${renderEnvelopeLines("Active org-admin exception profiles", envelope.activeOrgAdminExceptionProfiles)}
      ${renderEnvelopeLines("Active org-admin overlay profiles", envelope.activeOrgAdminOverlayProfiles)}
      ${renderEnvelopeLines("Active org-admin input values", envelope.activeOrgAdminInputValues)}
      ${renderEnvelopeLines("Active org-admin artifact events", envelope.activeOrgAdminArtifactEvents)}
      ${renderEnvelopeLines("Active org-admin evidence kinds", envelope.activeOrgAdminArtifactEvidence)}
      ${renderEnvelopeLines("Active org-admin artifact retention classes", envelope.activeOrgAdminArtifactRetention)}
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
      ${envelope.renderedText ? `<details class="details-shell" data-detail-key="${escapeHTML(renderedReportDetailKey)}"><summary>Rendered Report</summary><pre class="code-block">${escapeHTML(String(envelope.renderedText || ""))}</pre></details>` : ""}
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

function buildAgentFocusSummary({
  taskId = "",
  threadState = {},
  latestActivity = {},
  latestTurn = null,
  turnCount = 0,
  historyCount = 0,
  managedExecution = false
} = {}) {
  const pendingApprovalCount = Math.max(0, Number(threadState?.openApprovalCount ?? 0) || 0);
  const pendingProposalCount = listNativeToolProposals(latestTurn?.sessionView || {}).filter(
    (item) => String(item?.status || "PENDING").trim().toUpperCase() === "PENDING"
  ).length;
  const pendingDecisionCount = pendingApprovalCount + pendingProposalCount;
  if (!taskId) {
    return {
      tone: "chip chip-neutral chip-compact",
      label: "setup",
      title: "Start the first governed thread",
      detail: "Set the thread title and prompt, then start the thread and send the first message from Agent.",
      pendingApprovalCount,
      pendingProposalCount,
      turnCount,
      historyCount
    };
  }
  if (threadState?.isResolvedThread) {
    return {
      tone: "chip chip-ok chip-compact",
      label: "resolved",
      title: "Current thread is resolved",
      detail: "Use New Follow-up Thread for successor work or reopen this thread intentionally only when the same task must continue.",
      pendingApprovalCount,
      pendingProposalCount,
      turnCount,
      historyCount
    };
  }
  if (pendingDecisionCount > 0) {
    return {
      tone: "chip chip-danger chip-compact",
      label: "review now",
      title: "Resolve pending decisions first",
      detail: "Use the decision cards and current-turn inbox before asking the worker to continue mutating work.",
      pendingApprovalCount,
      pendingProposalCount,
      turnCount,
      historyCount
    };
  }
  if (managedExecution && String(latestActivity?.latestWorkerStatus || "").trim()) {
    return {
      tone: "chip chip-warn chip-compact",
      label: "worker active",
      title: "Managed worker is active",
      detail: "Watch worker progress and intervene only when approvals, proposals, or follow-up instructions are needed.",
      pendingApprovalCount,
      pendingProposalCount,
      turnCount,
      historyCount
    };
  }
  return {
    tone: "chip chip-ok chip-compact",
    label: "ready",
    title: "Continue the current thread",
    detail: "Send the next message or review the latest reply before continuing the same thread.",
    pendingApprovalCount,
    pendingProposalCount,
    turnCount,
    historyCount
  };
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
      const turnDetailBaseKey = detailKey("chat", "turn", session?.sessionId || response?.sessionId || turn?.requestId || "unknown");
      const transcriptDetailKey = detailKey(turnDetailBaseKey, "transcript");
      const approvalsDetailKey = detailKey(turnDetailBaseKey, "approvals");
      const proposalsDetailKey = detailKey(turnDetailBaseKey, "proposals");
      const actionsDetailKey = detailKey(turnDetailBaseKey, "actions");
      const evidenceDetailKey = detailKey(turnDetailBaseKey, "evidence");
      const eventsDetailKey = detailKey(turnDetailBaseKey, "events");
      const timelineDetailKey = detailKey(turnDetailBaseKey, "timeline_json");
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
          ${renderTurnActionInbox(approvals, toolProposals)}
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
          ${transcript ? `<details class="details-shell" data-detail-key="${escapeHTML(transcriptDetailKey)}"><summary>Raw Worker Transcript (${escapeHTML(String(transcript.eventCount || 0))} events)</summary><div class="meta">managedTurn=${escapeHTML(String(transcript.toolActionId || "-"))}</div><pre class="code-block">${escapeHTML(String(transcript.pretty || ""))}</pre></details>` : ""}
          <details class="details-shell" data-detail-key="${escapeHTML(approvalsDetailKey)}">
            <summary>Approval checkpoints (${approvals.length})</summary>
            ${renderApprovalCheckpoints(approvals)}
          </details>
          <details class="details-shell" data-detail-key="${escapeHTML(proposalsDetailKey)}">
            <summary>Tool proposals (${toolProposals.length})</summary>
            ${renderToolProposals(toolProposals)}
          </details>
          <details class="details-shell" data-detail-key="${escapeHTML(actionsDetailKey)}">
            <summary>Tool actions (${toolActions.length})</summary>
            ${renderToolActions(toolActions)}
          </details>
          <details class="details-shell" data-detail-key="${escapeHTML(evidenceDetailKey)}">
            <summary>Evidence records (${evidence.length})</summary>
            ${renderEvidenceRecords(evidence)}
          </details>
          ${renderGovernanceReport(governanceReport, String(session?.sessionId || response?.sessionId || ""))}
          <details class="details-shell" data-detail-key="${escapeHTML(eventsDetailKey)}">
            <summary>Recent native events (${streamItems.length})</summary>
            ${renderEventRows(streamItems)}
          </details>
          ${rawTimeline ? `<details class="details-shell" data-detail-key="${escapeHTML(timelineDetailKey)}"><summary>Native Session Timeline JSON</summary><pre class="code-block">${escapeHTML(rawTimeline)}</pre></details>` : ""}
        </article>
      `;
    })
    .join("");
}

export function buildAgentWorkspaceMarkup(settingsPayload = {}, chatState = {}) {
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
  const startLabel = taskId && threadState?.isResolvedThread ? "New Follow-up Thread" : "Start Thread";
  const sendLabel = taskId && threadState?.isResolvedThread ? "Reopen and Send" : "Send Message";
  const executionMode = String(chatState.executionMode || thread?.executionMode || "managed_codex_worker").trim().toLowerCase();
  const selectedWorker = latestTurn?.sessionView?.timeline?.selectedWorker || {};
  const catalogState = chatState?.catalogs && typeof chatState.catalogs === "object" ? chatState.catalogs : {};
  const governedExportSelection = resolveChatGovernedExportSelection(chatState?.exportSelection || {}, catalogState?.exportProfiles || null);
  const managedExecution = executionMode === "managed_codex_worker";
  const managedWorkerId = String(latestActivity?.selectedWorkerId || selectedWorker?.workerId || "").trim();
  const managedWorkerReady = managedExecution && Boolean(taskId) && Boolean(managedWorkerId) && !threadState?.isResolvedThread;
  const historyCount = Number(history?.count ?? 0) || 0;
  const archivedCount = Number(history?.archivedCount ?? 0) || 0;
  const historySummary = String(history?.message || "Use Thread History to reopen or archive prior work without burying the current chat.").trim();
  const latestPolicyOutcome = latestPolicyOutcomeFromTurns(turns);
  const latestReplyResponseText = String(latestTurn?.response?.outputText || "").trim();
  const latestReplyActivityText = String(latestActivity?.latestOutputText || "").trim();
  const latestReplyText = latestReplyResponseText.length >= latestReplyActivityText.length
    ? latestReplyResponseText
    : latestReplyActivityText;
  const latestReplySessionId = String(latestTurn?.response?.sessionId || latestTurn?.sessionView?.timeline?.session?.sessionId || "").trim();
  const latestReplyCompletedAt = String(
    latestTurn?.response?.completedAt
      || latestTurn?.sessionView?.timeline?.session?.completedAt
      || latestTurn?.createdAt
      || ""
  ).trim();
  const latestReplyRoute = String(latestTurn?.response?.route || "").trim();
  const latestReplyFinishReason = String(latestTurn?.response?.finishReason || "").trim();
  const latestReplyBoundary = String(latestTurn?.response?.boundaryProviderId || "").trim();
  const latestReplyStatus = String(
    latestTurn?.sessionView?.timeline?.session?.status || latestTurn?.response?.finishReason || status
  )
    .trim()
    .toUpperCase() || "IDLE";
  const focusSummary = buildAgentFocusSummary({
    taskId,
    threadState,
    latestActivity,
    latestTurn,
    turnCount: turns.length,
    historyCount,
    managedExecution
  });

  return `
    <div class="stack chat-surface agent-chat-shell">
      <div class="panel-heading agent-panel-heading">
        <h2>Agent Workspace</h2>
      </div>
      <div class="metric agent-top-section">
        <div class="agent-top-grid">
          <div class="metric agent-focus-card">
            <div class="metric-title-row">
              <div class="title">Thread Overview</div>
              <span class="${focusSummary.tone}">${escapeHTML(focusSummary.label)}</span>
            </div>
            <div class="meta">${escapeHTML(focusSummary.title)}</div>
            <div class="meta">${escapeHTML(focusSummary.detail)}</div>
            <div class="run-detail-chips">
              <span class="chip chip-neutral chip-compact">task=${escapeHTML(taskId || "-")}</span>
              <span class="chip chip-neutral chip-compact">turns=${escapeHTML(String(focusSummary.turnCount))}</span>
              <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(focusSummary.pendingApprovalCount))}</span>
              <span class="chip chip-neutral chip-compact">proposals=${escapeHTML(String(focusSummary.pendingProposalCount))}</span>
              <span class="chip chip-neutral chip-compact">history=${escapeHTML(String(focusSummary.historyCount))}</span>
              <span class="chip chip-neutral chip-compact">execution=${escapeHTML(executionModeLabel(executionMode))}</span>
            </div>
          </div>
          <div class="agent-approval-overview-slot" data-agent-approvals-overview></div>
          <div class="agent-approval-review-slot" data-agent-approval-review></div>
        </div>
      </div>
      <div class="metric agent-chat-composer">
        <div class="metric-title-row">
          <div class="title">Agent Chat</div>
          <span class="${chipClassForSessionStatus(status)}">${escapeHTML(status.toUpperCase())}</span>
        </div>
        ${message ? `<div class="meta">${escapeHTML(message)}</div>` : ""}
        <div class="agent-chat-heading-grid">
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
          <label class="field">
            <span class="label">Thread Intent</span>
            <input id="chat-thread-intent" class="filter-input" type="text" value="${escapeHTML(String(chatState.intent || ""))}" data-chat-field="intent" />
          </label>
        </div>
        <div class="agent-chat-state-grid">
          <div class="metric agent-chat-side-panel">
            <div class="metric-title-row">
              <div class="title">Thread State</div>
              <span class="${chipClassForSessionStatus(status)}">${escapeHTML(status.toUpperCase())}</span>
            </div>
            <div class="run-detail-chips">
              <span class="chip chip-neutral chip-compact">task=${escapeHTML(taskId || "-")}</span>
              <span class="chip chip-neutral chip-compact">session=${escapeHTML(latestReplySessionId || "-")}</span>
              <span class="chip chip-neutral chip-compact">taskStatus=${escapeHTML(String(threadState?.taskStatus || activeHistoryItem?.status || "-"))}</span>
              <span class="chip chip-neutral chip-compact">sessionStatus=${escapeHTML(String(threadState?.sessionStatus || "-"))}</span>
              <span class="chip chip-neutral chip-compact">workerStatus=${escapeHTML(String(threadState?.latestWorkerStatus || "-"))}</span>
              <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(threadState?.openApprovalCount ?? 0))}</span>
            </div>
            ${
              latestPolicyOutcome
                ? `
                  <div class="${escapeHTML(latestPolicyOutcome.outcome.bannerClass)}">
                    <div class="metric-title-row">
                      <div class="title">Latest Policy Outcome</div>
                      <span class="${chipClassForPolicyDecision(latestPolicyOutcome.decision)}">${escapeHTML(latestPolicyOutcome.decision)}</span>
                    </div>
                    <div class="run-detail-chips">
                      <span class="chip chip-neutral chip-compact">provider=${escapeHTML(latestPolicyOutcome.provider || "-")}</span>
                      <span class="${chipClassForPolicyEffect(latestPolicyOutcome.outcome)}">effect=${escapeHTML(latestPolicyOutcome.outcome.effectLabel)}</span>
                      <span class="chip chip-neutral chip-compact">request=${escapeHTML(latestPolicyOutcome.requestLabel || "-")}</span>
                    </div>
                    <div class="policy-outcome-detail">${escapeHTML(latestPolicyOutcome.outcome.headline)}</div>
                    <div class="meta">${escapeHTML(latestPolicyOutcome.outcome.detail)}</div>
                    ${renderGovernedRunLink(latestPolicyOutcome.runId)}
                  </div>
                `
                : `<div class="meta">Latest Policy Outcome: the latest turn has not recorded a governed policy result yet.</div>`
            }
            <div class="run-detail-chips">
              <span class="chip chip-neutral chip-compact">workerType=${escapeHTML(String(latestActivity?.selectedWorkerType || selectedWorker?.workerType || "-"))}</span>
              <span class="chip chip-neutral chip-compact">workerAdapter=${escapeHTML(String(latestActivity?.selectedWorkerAdapterId || selectedWorker?.adapterId || "-"))}</span>
              <span class="chip chip-neutral chip-compact">workerTarget=${escapeHTML(String(latestActivity?.selectedWorkerTargetEnvironment || selectedWorker?.targetEnvironment || "-"))}</span>
            </div>
            ${latestActivity?.latestWorkerSummary ? `<div class="meta">${escapeHTML(String(latestActivity.latestWorkerSummary))}</div>` : ""}
            ${
              managedExecution
                ? `<div class="meta">${escapeHTML(
                  managedWorkerReady
                    ? "Managed worker is attached to the latest thread session."
                    : "Managed worker mode is selected for this thread."
                )}</div>`
                : ""
            }
            ${catalogState?.message ? `<div class="meta">governanceCatalogs=${escapeHTML(String(catalogState.source || "-"))}; ${escapeHTML(String(catalogState.message || ""))}</div>` : ""}
          </div>
          <div class="metric agent-chat-side-panel">
            <label class="field field-wide">
              <span class="label">System Instructions</span>
              <span class="meta">Use this for durable guidance that should stay in effect across the whole thread.</span>
              <textarea id="chat-system-prompt" class="filter-input settings-agent-test-textarea" rows="6" data-chat-field="systemPrompt">${escapeHTML(String(chatState.systemPrompt || ""))}</textarea>
            </label>
          </div>
        </div>
        <label class="field field-wide agent-chat-prompt-field">
          <span class="label">Prompt</span>
          <span class="meta">Use this for the specific request or message you want to send right now.</span>
          <textarea id="chat-prompt" class="filter-input settings-agent-test-textarea" rows="8" data-chat-field="prompt">${escapeHTML(String(chatState.prompt || ""))}</textarea>
        </label>
        <div class="filter-row settings-editor-actions agent-composer-actions">
          <div class="action-hierarchy">
            <div class="action-group action-group-primary">
              <button class="btn btn-primary" type="button" data-chat-action="${startAction}">${startLabel}</button>
              <button class="btn btn-primary" type="button" data-chat-action="send-turn" ${taskId ? "" : "disabled"}>${sendLabel}</button>
            </div>
            <div class="action-group action-group-destructive agent-chat-clear-action">
              <button class="btn btn-danger" type="button" data-chat-action="reset-thread" ${taskId ? "" : "disabled"}>Clear Current Thread</button>
            </div>
          </div>
        </div>
        <div class="agent-chat-reply-panel">
          <div class="metric-title-row">
            <div class="title">Latest Reply</div>
            <span class="${chipClassForSessionStatus(latestReplyStatus)}">${escapeHTML(latestReplyStatus)}</span>
          </div>
          <div class="run-detail-chips">
            <span class="chip chip-neutral chip-compact">session=${escapeHTML(latestReplySessionId || "-")}</span>
            <span class="chip chip-neutral chip-compact">route=${escapeHTML(latestReplyRoute || "-")}</span>
            <span class="chip chip-neutral chip-compact">boundary=${escapeHTML(latestReplyBoundary || "-")}</span>
            <span class="chip chip-neutral chip-compact">completed=${escapeHTML(latestReplyCompletedAt ? formatTime(latestReplyCompletedAt) : "-")}</span>
            <span class="chip chip-neutral chip-compact">finishReason=${escapeHTML(latestReplyFinishReason || "-")}</span>
          </div>
          ${
            latestReplyText
              ? `
                <div class="chat-message chat-message-assistant agent-chat-reply-box">
                  <div class="label">Agent</div>
                  <div class="chat-message-text">${escapeHTML(latestReplyText)}</div>
                </div>
              `
              : `<div class="meta">No agent reply yet. Start a thread and send the first prompt to populate the latest reply.</div>`
          }
        </div>
      </div>
      <div class="chat-turns-stack">
        ${renderTurnCards(turns, catalogState, governedExportSelection)}
      </div>
      <details class="details-shell agent-thread-history-card" data-detail-key="agent.thread_history">
        <summary>Thread History (${escapeHTML(String(historyCount))} visible${archivedCount ? `, ${escapeHTML(String(archivedCount))} archived` : ""})</summary>
        <div class="agent-thread-history-body">
          <div class="meta">${escapeHTML(historySummary)}</div>
          <div class="run-detail-chips">
            <span class="chip chip-neutral chip-compact">visible=${escapeHTML(String(historyCount))}</span>
            <span class="chip chip-neutral chip-compact">archived=${escapeHTML(String(archivedCount))}</span>
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
            ${renderHistoryItems(history, taskId, {
              tenantId,
              projectId,
              catalogsMessage: catalogState?.message || "",
              mode: settingsPayload?.mockMode ? "mock" : "live"
            })}
          </div>
        </div>
      </details>
    </div>
  `;
}

export function renderChat(ui, settingsPayload = {}, chatState = {}) {
  if (!ui.chatContent) {
    return;
  }
  ui.chatContent.innerHTML = buildAgentWorkspaceMarkup(settingsPayload, chatState);
}
