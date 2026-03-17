import { displayPolicyProviderLabel, escapeHTML, formatTime } from "./common.js";
import { buildNativeSessionActivitySummary, deriveOperatorChatThreadState, listNativeToolProposals, latestManagedWorkerTranscript } from "../runtime/session-client.js";
import { buildEnterpriseReportEnvelope, buildGovernedExportSelectionState, renderEnterpriseReportEnvelope } from "../runtime/governance-report.js";
import { createAimxsLegibilityModel } from "../shared/aimxs/legibility.js";
import { renderAimxsLegibilityBlock } from "../shared/components/aimxs-legibility.js";
import { renderAimxsDecisionBindingSpine } from "../shared/components/aimxs-decision-binding-spine.js";

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

function buildAgentThreadSummary({
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
      title: "Ready to start the first governed thread",
      detail: "Set the thread header, then send the first prompt.",
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
      detail: "Start a follow-up thread or reopen only if the same task must continue.",
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
      detail: "Inline approvals or proposals are blocking the next governed step.",
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
      detail: "Continue when the latest reply or inline decisions require operator input.",
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
    detail: "Review the latest reply, then continue the same thread.",
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
        <div class="meta">Start a thread, then send the first prompt to populate the transcript.</div>
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

function renderAgentTranscriptSummary({
  latestReplyText = "",
  latestReplyStatus = "IDLE",
  latestReplySessionId = "",
  latestReplyRoute = "",
  latestReplyBoundary = "",
  latestReplyCompletedAt = "",
  latestReplyFinishReason = "",
  latestPolicyOutcome = null,
  latestActivity = null,
  selectedWorker = {},
  taskId = "",
  threadState = {},
  focusSummary = {},
  executionMode = "",
  historyCount = 0,
  catalogState = {}
} = {}) {
  const activity = latestActivity && typeof latestActivity === "object" ? latestActivity : {};
  const worker = selectedWorker && typeof selectedWorker === "object" ? selectedWorker : {};
  const policyMarkup = latestPolicyOutcome
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
    : `<div class="meta">Latest Policy Outcome: the latest turn has not recorded a governed policy result yet.</div>`;
  return `
    <div class="agentops-transcript-summary-grid">
      <div class="metric agentops-reply-spotlight">
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
              <div class="chat-message chat-message-assistant agentops-reply-box">
                <div class="label">Agent</div>
                <div class="chat-message-text">${escapeHTML(latestReplyText)}</div>
              </div>
            `
            : `<div class="meta">No agent reply yet. Start a thread and send the first prompt to populate the transcript.</div>`
        }
      </div>
      <div class="metric agentops-transcript-context">
        <div class="metric-title-row">
          <div class="title">Current Turn Context</div>
          <span class="${focusSummary.tone || chipClassForSessionStatus(threadState?.sessionStatus)}">${escapeHTML(String(focusSummary.label || "idle"))}</span>
        </div>
        <div class="run-detail-chips">
          <span class="chip chip-neutral chip-compact">task=${escapeHTML(taskId || "-")}</span>
          <span class="chip chip-neutral chip-compact">taskStatus=${escapeHTML(String(threadState?.taskStatus || "-"))}</span>
          <span class="chip chip-neutral chip-compact">sessionStatus=${escapeHTML(String(threadState?.sessionStatus || "-"))}</span>
          <span class="chip chip-neutral chip-compact">workerStatus=${escapeHTML(String(threadState?.latestWorkerStatus || "-"))}</span>
          <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(threadState?.openApprovalCount ?? 0))}</span>
          <span class="chip chip-neutral chip-compact">proposals=${escapeHTML(String(focusSummary.pendingProposalCount ?? 0))}</span>
          <span class="chip chip-neutral chip-compact">history=${escapeHTML(String(historyCount))}</span>
          <span class="chip chip-neutral chip-compact">execution=${escapeHTML(executionModeLabel(executionMode))}</span>
        </div>
        <div class="run-detail-chips">
          <span class="chip chip-neutral chip-compact">workerType=${escapeHTML(String(activity?.selectedWorkerType || worker?.workerType || "-"))}</span>
          <span class="chip chip-neutral chip-compact">workerAdapter=${escapeHTML(String(activity?.selectedWorkerAdapterId || worker?.adapterId || "-"))}</span>
          <span class="chip chip-neutral chip-compact">workerTarget=${escapeHTML(String(activity?.selectedWorkerTargetEnvironment || worker?.targetEnvironment || "-"))}</span>
        </div>
        ${activity?.latestWorkerSummary ? `<div class="meta">${escapeHTML(String(activity.latestWorkerSummary))}</div>` : ""}
        ${policyMarkup}
        ${catalogState?.message ? `<div class="meta">${escapeHTML(String(catalogState.message || ""))}</div>` : ""}
      </div>
    </div>
  `;
}

function renderAgentThreadHistory(history = {}, taskId = "", historyCount = 0, archivedCount = 0, historySummary = "", context = {}) {
  return `
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
          ${renderHistoryItems(history, taskId, context)}
        </div>
      </div>
    </details>
  `;
}

function buildAgentRunArtifactContext(latestTurn = null, latestPolicyOutcome = null) {
  const sessionView = latestTurn?.sessionView || {};
  const timeline = objectValue(sessionView?.timeline);
  const session = objectValue(timeline?.session);
  const selectedWorker = objectValue(timeline?.selectedWorker);
  const approvals = Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [];
  const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
  const evidenceRecords = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
  const proposals = listNativeToolProposals(sessionView);
  let runSnapshot = {};
  for (let index = toolActions.length - 1; index >= 0; index -= 1) {
    const candidate = objectValue(objectValue(toolActions[index]?.resultPayload).governedRun);
    if (Object.keys(candidate).length) {
      runSnapshot = candidate;
      break;
    }
  }
  if (!Object.keys(runSnapshot).length) {
    for (let index = proposals.length - 1; index >= 0; index -= 1) {
      const candidate = objectValue(proposals[index]?.governedRun);
      if (Object.keys(candidate).length) {
        runSnapshot = candidate;
        break;
      }
    }
  }
  const latestEvidence = evidenceRecords.length > 0 ? evidenceRecords[evidenceRecords.length - 1] : null;
  const latestToolAction = toolActions.length > 0 ? toolActions[toolActions.length - 1] : null;
  return {
    sessionId: normalizedString(session?.sessionId, normalizedString(latestTurn?.response?.sessionId)),
    sessionStatus: normalizedString(session?.status).toUpperCase() || "IDLE",
    runId: normalizedString(runSnapshot?.runId, normalizedString(latestPolicyOutcome?.runId)),
    runStatus: normalizedString(runSnapshot?.status).toUpperCase(),
    policyDecision: normalizedString(runSnapshot?.policyDecision, normalizedString(latestPolicyOutcome?.decision)).toUpperCase(),
    policyProvider: normalizedString(runSnapshot?.selectedPolicyProvider, normalizedString(latestPolicyOutcome?.provider)),
    policyGrantTokenPresent: runSnapshot?.policyGrantTokenPresent === true,
    approvalCount: approvals.length,
    proposalCount: proposals.length,
    toolActionCount: toolActions.length,
    evidenceCount: evidenceRecords.length,
    latestEvidenceId: normalizedString(latestEvidence?.evidenceId),
    latestEvidenceKind: normalizedString(latestEvidence?.kind),
    latestToolActionId: normalizedString(latestToolAction?.toolActionId),
    route: normalizedString(latestTurn?.response?.route),
    boundary: normalizedString(latestTurn?.response?.boundaryProviderId),
    workerAdapter: normalizedString(selectedWorker?.adapterId, normalizedString(selectedWorker?.workerId)),
    workerType: normalizedString(selectedWorker?.workerType)
  };
}

function buildAgentAimxsLegibilityContext({
  thread = {},
  runArtifactContext = {},
  decisionPivotContext = {},
  governancePivotContext = {},
  executionMode = "",
  agentProfileId = ""
} = {}) {
  const scopeParts = [
    normalizedString(thread?.tenantId),
    normalizedString(thread?.projectId)
  ].filter(Boolean);
  const approvalRef = normalizedString(decisionPivotContext?.latestApprovalId);
  const proposalRef = normalizedString(decisionPivotContext?.latestProposalId, normalizedString(decisionPivotContext?.requestId));
  return createAimxsLegibilityModel({
    requestRef: proposalRef || normalizedString(runArtifactContext?.runId),
    actorRef: normalizedString(runArtifactContext?.workerAdapter, normalizedString(runArtifactContext?.workerType)),
    subjectRef: normalizedString(runArtifactContext?.sessionId, normalizedString(thread?.taskId)),
    authorityRef: normalizedString(agentProfileId, executionModeLabel(executionMode)),
    grantRef: runArtifactContext?.policyGrantTokenPresent ? "policy_grant_token" : approvalRef,
    posture: normalizedString(
      runArtifactContext?.policyDecision,
      normalizedString(runArtifactContext?.runStatus, normalizedString(governancePivotContext?.latestDecision))
    ),
    scopeRef: scopeParts.join(" / "),
    providerRef: normalizedString(runArtifactContext?.policyProvider),
    routeRef: normalizedString(runArtifactContext?.route),
    boundaryRef: normalizedString(runArtifactContext?.boundary),
    previewRef: normalizedString(proposalRef, normalizedString(governancePivotContext?.latestEventTimestamp)),
    previewSummary: normalizedString(governancePivotContext?.summary),
    decisionRef: normalizedString(approvalRef, proposalRef),
    decisionStatus: normalizedString(governancePivotContext?.latestDecision, normalizedString(runArtifactContext?.policyDecision)),
    executionRef: normalizedString(runArtifactContext?.runId, normalizedString(runArtifactContext?.latestToolActionId)),
    executionStatus: normalizedString(runArtifactContext?.runStatus),
    replayRef: normalizedString(runArtifactContext?.runId),
    evidenceRefs: [normalizedString(runArtifactContext?.latestEvidenceId)].filter(Boolean),
    summary: normalizedString(governancePivotContext?.summary, normalizedString(thread?.intent))
  });
}

function renderAgentProofChip(label, value, tone = "chip chip-neutral chip-compact") {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) {
    return "";
  }
  return `<span class="${tone}">${escapeHTML(`${label}=${normalizedValue}`)}</span>`;
}

function buildAgentDecisionPivotContext(latestTurn = null) {
  const sessionView = latestTurn?.sessionView || {};
  const timeline = objectValue(sessionView?.timeline);
  const session = objectValue(timeline?.session);
  const response = objectValue(latestTurn?.response);
  const approvals = Array.isArray(timeline?.approvalCheckpoints) ? timeline.approvalCheckpoints : [];
  const toolProposals = listNativeToolProposals(sessionView);
  const turnDetailBaseKey = detailKey(
    "chat",
    "turn",
    session?.sessionId || response?.sessionId || latestTurn?.requestId || "unknown"
  );
  const latestApproval = approvals.length > 0 ? objectValue(approvals[approvals.length - 1]) : {};
  const latestProposal = toolProposals.length > 0 ? objectValue(toolProposals[toolProposals.length - 1]) : {};
  return {
    requestId: normalizedString(latestTurn?.requestId),
    sessionId: normalizedString(session?.sessionId, response?.sessionId),
    approvalCount: approvals.length,
    proposalCount: toolProposals.length,
    latestApprovalId: normalizedString(latestApproval?.approvalID, normalizedString(latestApproval?.approvalId)),
    latestProposalId: normalizedString(latestProposal?.proposalId),
    approvalsDetailKey: approvals.length > 0 ? detailKey(turnDetailBaseKey, "approvals") : "",
    proposalsDetailKey: toolProposals.length > 0 ? detailKey(turnDetailBaseKey, "proposals") : ""
  };
}

function buildAgentGovernancePivotContext(latestTurn = null, catalogs = {}, exportSelection = {}) {
  const sessionView = latestTurn?.sessionView || {};
  const timeline = objectValue(sessionView?.timeline);
  const session = objectValue(timeline?.session);
  const response = objectValue(latestTurn?.response);
  const activity = buildNativeSessionActivitySummary(sessionView);
  const streamItems = Array.isArray(activity?.semanticEvents) ? activity.semanticEvents : [];
  const latestEvent = streamItems.length > 0 ? objectValue(streamItems[streamItems.length - 1]) : {};
  const latestEventPayload = objectValue(latestEvent?.payload);
  const governanceReport = buildChatTurnGovernanceReport(latestTurn || {}, catalogs || {}, exportSelection || {});
  const sessionId = normalizedString(session?.sessionId, response?.sessionId);
  const turnDetailBaseKey = detailKey(
    "chat",
    "turn",
    session?.sessionId || response?.sessionId || latestTurn?.requestId || "unknown"
  );
  return {
    exportProfile: normalizedString(governanceReport?.exportProfile),
    audience: normalizedString(governanceReport?.audience),
    summary: normalizedString(governanceReport?.summary),
    orgAdminCount: Array.isArray(governanceReport?.applicableOrgAdmins) ? governanceReport.applicableOrgAdmins.length : 0,
    eventCount: streamItems.length,
    latestEventType: normalizedString(latestEvent?.eventType),
    latestEventTimestamp: normalizedString(latestEvent?.timestamp),
    latestDecision: normalizedString(latestEventPayload?.decision, normalizedString(latestEventPayload?.status)),
    reportDetailKey: sessionId ? detailKey("chat", "governance_report", sessionId) : "",
    eventsDetailKey: streamItems.length > 0 ? detailKey(turnDetailBaseKey, "events") : ""
  };
}

function renderAgentApprovalContextDrawer(
  focusSummary = {},
  threadState = {},
  decisionPivotContext = {},
  governancePivotContext = {}
) {
  const approvalCount = Math.max(0, Number(focusSummary.pendingApprovalCount ?? threadState?.openApprovalCount ?? 0) || 0);
  const proposalCount = Math.max(0, Number(focusSummary.pendingProposalCount ?? 0) || 0);
  const pendingDecisionCount = approvalCount + proposalCount;
  const tone = pendingDecisionCount > 0 ? "chip chip-danger chip-compact" : "chip chip-ok chip-compact";
  const label = pendingDecisionCount > 0 ? "review now" : "clear";
  const detail = pendingDecisionCount > 0
    ? "Pinned review stays here while you continue the active thread."
    : "No active thread decisions are pinned right now.";
  const latestApprovalId = normalizedString(decisionPivotContext?.latestApprovalId);
  const latestProposalId = normalizedString(decisionPivotContext?.latestProposalId);
  const requestId = normalizedString(decisionPivotContext?.requestId);
  const sessionId = normalizedString(decisionPivotContext?.sessionId);
  const approvalsDetailKey = normalizedString(decisionPivotContext?.approvalsDetailKey);
  const proposalsDetailKey = normalizedString(decisionPivotContext?.proposalsDetailKey);
  const exportProfile = normalizedString(governancePivotContext?.exportProfile);
  const audience = normalizedString(governancePivotContext?.audience);
  const latestEventType = normalizedString(governancePivotContext?.latestEventType);
  const latestEventTimestamp = normalizedString(governancePivotContext?.latestEventTimestamp);
  const latestDecision = normalizedString(governancePivotContext?.latestDecision);
  const reportDetailKey = normalizedString(governancePivotContext?.reportDetailKey);
  const eventsDetailKey = normalizedString(governancePivotContext?.eventsDetailKey);
  const eventCount = Math.max(0, Number(governancePivotContext?.eventCount ?? 0) || 0);
  const orgAdminCount = Math.max(0, Number(governancePivotContext?.orgAdminCount ?? 0) || 0);
  return `
    <div class="metric agentops-context-panel">
      <div class="metric-title-row">
        <div class="title">Approval Context Drawer</div>
        <span class="${tone}">${escapeHTML(label)}</span>
      </div>
      <div class="run-detail-chips">
        <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(approvalCount))}</span>
        <span class="chip chip-neutral chip-compact">proposals=${escapeHTML(String(proposalCount))}</span>
        <span class="chip chip-neutral chip-compact">sessionStatus=${escapeHTML(String(threadState?.sessionStatus || "-"))}</span>
        <span class="chip chip-neutral chip-compact">workerStatus=${escapeHTML(String(threadState?.latestWorkerStatus || "-"))}</span>
      </div>
      ${
        requestId || sessionId || latestApprovalId || latestProposalId
          ? `
            <div class="run-detail-chips">
              ${requestId ? `<span class="chip chip-neutral chip-compact">request=${escapeHTML(requestId)}</span>` : ""}
              ${sessionId ? `<span class="chip chip-neutral chip-compact">session=${escapeHTML(sessionId)}</span>` : ""}
              ${latestApprovalId ? `<span class="chip chip-neutral chip-compact">latestApproval=${escapeHTML(latestApprovalId)}</span>` : ""}
              ${latestProposalId ? `<span class="chip chip-neutral chip-compact">latestProposal=${escapeHTML(latestProposalId)}</span>` : ""}
            </div>
          `
          : ""
      }
      ${
        exportProfile || audience || latestEventType || latestDecision || eventCount > 0 || orgAdminCount > 0
          ? `
            <div class="run-detail-chips">
              ${exportProfile ? `<span class="chip chip-neutral chip-compact">export=${escapeHTML(exportProfile)}</span>` : ""}
              ${audience ? `<span class="chip chip-neutral chip-compact">audience=${escapeHTML(audience)}</span>` : ""}
              ${orgAdminCount > 0 ? `<span class="chip chip-neutral chip-compact">orgAdmin=${escapeHTML(String(orgAdminCount))}</span>` : ""}
              ${eventCount > 0 ? `<span class="chip chip-neutral chip-compact">decisionEvents=${escapeHTML(String(eventCount))}</span>` : ""}
              ${latestEventType ? `<span class="chip chip-neutral chip-compact">latestEvent=${escapeHTML(latestEventType)}</span>` : ""}
              ${latestDecision ? `<span class="chip chip-neutral chip-compact">latestDecision=${escapeHTML(latestDecision)}</span>` : ""}
              ${latestEventTimestamp ? `<span class="chip chip-neutral chip-compact">latestAt=${escapeHTML(formatTime(latestEventTimestamp))}</span>` : ""}
            </div>
          `
          : ""
      }
      ${
        approvalsDetailKey || proposalsDetailKey
          ? `
            <div class="filter-row settings-editor-actions">
              <div class="action-hierarchy">
                <div class="action-group action-group-secondary">
                  ${approvalsDetailKey ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="focus-agent-detail" data-chat-detail-key="${escapeHTML(approvalsDetailKey)}">Pin Approval Checkpoints</button>` : ""}
                  ${proposalsDetailKey ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="focus-agent-detail" data-chat-detail-key="${escapeHTML(proposalsDetailKey)}">Pin Tool Proposals</button>` : ""}
                </div>
              </div>
            </div>
          `
          : ""
      }
      ${
        reportDetailKey || eventsDetailKey
          ? `
            <div class="filter-row settings-editor-actions">
              <div class="action-hierarchy">
                <div class="action-group action-group-secondary">
                  ${reportDetailKey ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="focus-agent-detail" data-chat-detail-key="${escapeHTML(reportDetailKey)}">Pin Governance Receipt</button>` : ""}
                  ${eventsDetailKey ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="focus-agent-detail" data-chat-detail-key="${escapeHTML(eventsDetailKey)}">Pin Decision History</button>` : ""}
                </div>
              </div>
            </div>
          `
          : ""
      }
      <div class="meta">${escapeHTML(detail)}</div>
    </div>
    <div class="metric agentops-context-panel" data-agent-approval-review>
      <div class="metric-title-row">
        <div class="title">Pinned Approval Review</div>
        <span class="chip chip-neutral chip-compact">context</span>
      </div>
      <div class="meta">Select an approval or current-thread decision to pin review context here.</div>
    </div>
  `;
}

function buildAgentExecutionProofContext(latestTurn = null, runArtifactContext = {}) {
  const sessionView = latestTurn?.sessionView || {};
  const timeline = objectValue(sessionView?.timeline);
  const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
  const evidenceRecords = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
  const events = Array.isArray(timeline?.events) ? timeline.events : [];
  const transcript = latestManagedWorkerTranscript(sessionView);
  const latestToolAction = toolActions.length > 0 ? objectValue(toolActions[toolActions.length - 1]) : {};
  const latestEvidence = evidenceRecords.length > 0 ? objectValue(evidenceRecords[evidenceRecords.length - 1]) : {};
  const latestEvent = events.length > 0 ? objectValue(events[events.length - 1]) : {};
  const latestEventPayload = objectValue(latestEvent?.payload);
  const anchorCount = [
    runArtifactContext?.runId,
    latestToolAction?.toolActionId || runArtifactContext?.latestToolActionId,
    latestEvidence?.evidenceId || runArtifactContext?.latestEvidenceId,
    transcript?.eventCount ? "transcript" : "",
    latestEvent?.eventType || ""
  ].filter(Boolean).length;
  return {
    anchorCount,
    runId: normalizedString(runArtifactContext?.runId),
    runStatus: normalizedString(runArtifactContext?.runStatus),
    policyProvider: normalizedString(runArtifactContext?.policyProvider),
    policyDecision: normalizedString(runArtifactContext?.policyDecision),
    latestToolActionId: normalizedString(latestToolAction?.toolActionId, normalizedString(runArtifactContext?.latestToolActionId)),
    latestToolType: normalizedString(latestToolAction?.toolType),
    latestToolStatus: normalizedString(latestToolAction?.status).toUpperCase(),
    latestToolSource: normalizedString(latestToolAction?.source),
    latestEvidenceId: normalizedString(latestEvidence?.evidenceId, normalizedString(runArtifactContext?.latestEvidenceId)),
    latestEvidenceKind: normalizedString(latestEvidence?.kind, normalizedString(runArtifactContext?.latestEvidenceKind)),
    latestEvidenceCreatedAt: normalizedString(latestEvidence?.createdAt),
    latestEvidenceRetention: normalizedString(latestEvidence?.retentionClass),
    transcriptEventCount: Number(transcript?.eventCount || 0) || 0,
    transcriptToolActionId: normalizedString(transcript?.toolActionId),
    latestEventType: normalizedString(latestEvent?.eventType),
    latestEventSequence: Number(latestEvent?.sequence || 0) || 0,
    latestEventTimestamp: normalizedString(latestEvent?.timestamp),
    latestEventSummary: normalizedString(latestEventPayload?.summary, normalizedString(latestEventPayload?.reason))
  };
}

function renderAgentRunArtifactContext(context = {}) {
  const statusValue = String(context.runStatus || context.sessionStatus || "IDLE").trim().toUpperCase() || "IDLE";
  const hasContext = Boolean(
    context.sessionId
    || context.runId
    || context.latestEvidenceId
    || context.latestToolActionId
    || context.toolActionCount
    || context.evidenceCount
  );
  return `
    <div class="metric agentops-context-panel">
      <div class="metric-title-row">
        <div class="title">Run And Artifact Context</div>
        <span class="${chipClassForSessionStatus(statusValue)}">${escapeHTML(statusValue)}</span>
      </div>
      ${
        hasContext
          ? `
            <div class="run-detail-chips">
              <span class="chip chip-neutral chip-compact">session=${escapeHTML(context.sessionId || "-")}</span>
              <span class="chip chip-neutral chip-compact">run=${escapeHTML(context.runId || "-")}</span>
              <span class="chip chip-neutral chip-compact">route=${escapeHTML(context.route || "-")}</span>
              <span class="chip chip-neutral chip-compact">boundary=${escapeHTML(context.boundary || "-")}</span>
            </div>
            <div class="run-detail-chips">
              <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(context.approvalCount ?? 0))}</span>
              <span class="chip chip-neutral chip-compact">proposals=${escapeHTML(String(context.proposalCount ?? 0))}</span>
              <span class="chip chip-neutral chip-compact">toolActions=${escapeHTML(String(context.toolActionCount ?? 0))}</span>
              <span class="chip chip-neutral chip-compact">evidence=${escapeHTML(String(context.evidenceCount ?? 0))}</span>
            </div>
            <div class="run-detail-chips">
              <span class="chip chip-neutral chip-compact">worker=${escapeHTML(context.workerAdapter || "-")}</span>
              <span class="chip chip-neutral chip-compact">workerType=${escapeHTML(context.workerType || "-")}</span>
              <span class="chip chip-neutral chip-compact">policyProvider=${escapeHTML(context.policyProvider || "-")}</span>
            </div>
            ${context.latestToolActionId ? `<div class="meta">latestToolAction=${escapeHTML(context.latestToolActionId)}</div>` : ""}
            ${context.latestEvidenceId ? `<div class="meta">latestEvidence=${escapeHTML(context.latestEvidenceId)}${context.latestEvidenceKind ? ` · ${escapeHTML(context.latestEvidenceKind)}` : ""}</div>` : ""}
            ${context.runId ? renderGovernedRunLink(context.runId) : ""}
          `
          : `<div class="meta">The active thread has not produced governed run or artifact anchors yet.</div>`
      }
    </div>
  `;
}

function renderAgentExecutionProofContext(context = {}) {
  const anchorCount = Math.max(0, Number(context.anchorCount ?? 0) || 0);
  const proofTone = anchorCount >= 3
    ? "chip chip-ok chip-compact"
    : anchorCount > 0
      ? "chip chip-warn chip-compact"
      : "chip chip-neutral chip-compact";
  const proofLabel = anchorCount >= 3 ? "anchored" : anchorCount > 0 ? "partial" : "pending";
  const rows = [];
  if (context.runId || context.policyProvider || context.policyDecision) {
    rows.push(`
      <div class="agentops-proof-row">
        <div class="agentops-proof-label">Governed Run</div>
        <div class="run-detail-chips">
          ${renderAgentProofChip("run", context.runId)}
          ${renderAgentProofChip("status", context.runStatus, chipClassForSessionStatus(context.runStatus || "IDLE"))}
          ${renderAgentProofChip("policyProvider", context.policyProvider)}
          ${renderAgentProofChip("decision", context.policyDecision, chipClassForPolicyDecision(context.policyDecision || "UNKNOWN"))}
        </div>
        ${context.runId ? renderGovernedRunLink(context.runId) : ""}
      </div>
    `);
  }
  if (context.latestToolActionId || context.latestToolType || context.latestToolStatus) {
    rows.push(`
      <div class="agentops-proof-row">
        <div class="agentops-proof-label">Latest Tool Action</div>
        <div class="run-detail-chips">
          ${renderAgentProofChip("toolAction", context.latestToolActionId)}
          ${renderAgentProofChip("type", context.latestToolType)}
          ${renderAgentProofChip("status", context.latestToolStatus, chipClassForSessionStatus(context.latestToolStatus || "IDLE"))}
          ${renderAgentProofChip("source", context.latestToolSource)}
        </div>
      </div>
    `);
  }
  if (context.latestEvidenceId || context.latestEvidenceKind) {
    rows.push(`
      <div class="agentops-proof-row">
        <div class="agentops-proof-label">Latest Evidence</div>
        <div class="run-detail-chips">
          ${renderAgentProofChip("evidence", context.latestEvidenceId)}
          ${renderAgentProofChip("kind", context.latestEvidenceKind)}
          ${renderAgentProofChip("retention", context.latestEvidenceRetention)}
          ${renderAgentProofChip("created", context.latestEvidenceCreatedAt ? formatTime(context.latestEvidenceCreatedAt) : "")}
        </div>
      </div>
    `);
  }
  if (context.transcriptEventCount || context.transcriptToolActionId) {
    rows.push(`
      <div class="agentops-proof-row">
        <div class="agentops-proof-label">Worker Transcript</div>
        <div class="run-detail-chips">
          ${renderAgentProofChip("events", context.transcriptEventCount ? String(context.transcriptEventCount) : "")}
          ${renderAgentProofChip("managedTurn", context.transcriptToolActionId)}
        </div>
      </div>
    `);
  }
  if (context.latestEventType || context.latestEventSequence || context.latestEventTimestamp) {
    rows.push(`
      <div class="agentops-proof-row">
        <div class="agentops-proof-label">Latest Event</div>
        <div class="run-detail-chips">
          ${renderAgentProofChip("type", context.latestEventType)}
          ${renderAgentProofChip("sequence", context.latestEventSequence ? String(context.latestEventSequence) : "")}
          ${renderAgentProofChip("at", context.latestEventTimestamp ? formatTime(context.latestEventTimestamp) : "")}
        </div>
        ${context.latestEventSummary ? `<div class="meta">${escapeHTML(context.latestEventSummary)}</div>` : ""}
      </div>
    `);
  }
  return `
    <div class="metric agentops-context-panel">
      <div class="metric-title-row">
        <div class="title">Execution Proof</div>
        <span class="${proofTone}">${escapeHTML(proofLabel)}</span>
      </div>
      ${
        rows.length
          ? `<div class="agentops-proof-grid">${rows.join("")}</div>`
          : `<div class="meta">No execution proof anchors recorded for the active turn.</div>`
      }
    </div>
  `;
}

function renderAgentAimxsLegibilityContext(model = {}) {
  return `
    <div class="metric agentops-context-panel">
      <div class="metric-title-row">
        <div class="title">AIMXS Decision Binding</div>
        <span class="chip chip-neutral chip-compact">shared</span>
      </div>
      ${
        model?.available
          ? renderAimxsLegibilityBlock(model)
          : '<div class="meta">No AIMXS lifecycle or binding anchors are available for the active thread yet.</div>'
      }
    </div>
  `;
}

function renderAgentAimxsDecisionBindingSpine(model = {}) {
  if (!model?.available) {
    return "";
  }
  return `
    <div class="metric agentops-context-panel">
      <div class="metric-title-row">
        <div class="title">Correlated AIMXS Drill-In</div>
        <span class="chip chip-neutral chip-compact">spine</span>
      </div>
      ${renderAimxsDecisionBindingSpine(model)}
    </div>
  `;
}

function resolveAgentWorkflowStage(model = {}) {
  const stages = Array.isArray(model?.lifecycle) ? model.lifecycle : [];
  if (!stages.length) {
    return {
      label: "Governed Ingress",
      stateLabel: "Pending",
      tone: "neutral"
    };
  }
  for (const state of ["blocked", "active", "pending", "recovered"]) {
    const match = stages.find((stage) => String(stage?.state || "").trim().toLowerCase() === state);
    if (match) {
      return match;
    }
  }
  return stages[stages.length - 1] || {
    label: "Governed Ingress",
    stateLabel: "Pending",
    tone: "neutral"
  };
}

function buildAgentWorkflowClarityContext({
  taskId = "",
  threadState = {},
  focusSummary = {},
  latestPolicyOutcome = null,
  runArtifactContext = {},
  decisionPivotContext = {},
  aimxsLegibilityContext = {}
} = {}) {
  const approvalCount = Math.max(0, Number(focusSummary.pendingApprovalCount ?? threadState?.openApprovalCount ?? 0) || 0);
  const proposalCount = Math.max(0, Number(focusSummary.pendingProposalCount ?? 0) || 0);
  const currentStage = resolveAgentWorkflowStage(aimxsLegibilityContext);
  const chips = [
    { label: "currentStage", value: String(currentStage?.label || "").trim() },
    { label: "posture", value: normalizedString(runArtifactContext?.policyDecision, normalizedString(threadState?.sessionStatus)) },
    { label: "provider", value: normalizedString(runArtifactContext?.policyProvider) },
    { label: "route", value: normalizedString(runArtifactContext?.route) },
    { label: "boundary", value: normalizedString(runArtifactContext?.boundary) }
  ].filter((item) => item.value);

  const buttons = [];
  let nextActionTitle = "Continue the current thread";
  let nextActionDetail = "Review the latest reply, then use Anchored Composer for the next governed turn.";
  let nextActionMeta = "No additional review gate is active on the current thread.";
  let tone = "ok";

  if (!taskId) {
    tone = "neutral";
    nextActionTitle = "Start the first governed thread";
    nextActionDetail = "Use Anchored Composer to create the native task, then send the first prompt.";
    nextActionMeta = "No governed thread anchors exist yet.";
  } else if (threadState?.isResolvedThread) {
    tone = "ok";
    nextActionTitle = "Start a follow-up thread";
    nextActionDetail = "The current task is resolved; only reopen if the same governed work must continue.";
    nextActionMeta = normalizedString(threadState?.resolutionMessage, "Recovery is complete for the current thread.");
  } else if (approvalCount > 0) {
    tone = "danger";
    nextActionTitle = `Review ${approvalCount} approval checkpoint${approvalCount === 1 ? "" : "s"}`;
    nextActionDetail = "Governance is the active gate for the next thread transition.";
    nextActionMeta = normalizedString(threadState?.message, "Resolve approval checkpoints before continuing the current governed run.");
    if (decisionPivotContext?.approvalsDetailKey) {
      buttons.push({
        action: "focus-agent-detail",
        detailKey: decisionPivotContext.approvalsDetailKey,
        label: "Pin Approval Checkpoints"
      });
    }
  } else if (proposalCount > 0) {
    tone = "warn";
    nextActionTitle = `Review ${proposalCount} tool proposal${proposalCount === 1 ? "" : "s"}`;
    nextActionDetail = "Proposal review is the active gate for the next governed step.";
    nextActionMeta = "The active thread has pending tool proposals that should be reviewed before more execution.";
    if (decisionPivotContext?.proposalsDetailKey) {
      buttons.push({
        action: "focus-agent-detail",
        detailKey: decisionPivotContext.proposalsDetailKey,
        label: "Pin Tool Proposals"
      });
    }
  } else if (latestPolicyOutcome?.decision === "DENY") {
    tone = "danger";
    nextActionTitle = "Review the blocked run before retrying";
    nextActionDetail = normalizedString(
      latestPolicyOutcome?.outcome?.detail,
      "The latest request is blocked at the policy surface."
    );
    nextActionMeta = `Latest policy outcome is ${latestPolicyOutcome.decision} via ${latestPolicyOutcome.provider || "-"}.`;
    if (latestPolicyOutcome?.runId) {
      buttons.push({
        action: "open-governed-run",
        runId: latestPolicyOutcome.runId,
        label: "Open Run Detail"
      });
    }
  } else if (latestPolicyOutcome?.decision === "DEFER") {
    tone = "warn";
    nextActionTitle = "Review the deferred run and evidence basis";
    nextActionDetail = normalizedString(
      latestPolicyOutcome?.outcome?.detail,
      "The latest request is deferred pending grants, evidence, or other readiness."
    );
    nextActionMeta = `Latest policy outcome is ${latestPolicyOutcome.decision} via ${latestPolicyOutcome.provider || "-"}.`;
    if (latestPolicyOutcome?.runId) {
      buttons.push({
        action: "open-governed-run",
        runId: latestPolicyOutcome.runId,
        label: "Open Run Detail"
      });
    }
  } else if (String(threadState?.sessionStatus || "").trim().toUpperCase() === "AWAITING_WORKER") {
    tone = "warn";
    nextActionTitle = "Wait for worker attachment or inspect run detail";
    nextActionDetail = normalizedString(threadState?.message, "The current turn is approved but still waiting on worker attachment.");
    nextActionMeta = "No additional write surface is needed until the worker posture changes.";
    if (runArtifactContext?.runId) {
      buttons.push({
        action: "open-governed-run",
        runId: runArtifactContext.runId,
        label: "Open Run Detail"
      });
    }
  } else if (String(threadState?.sessionStatus || "").trim().toUpperCase() === "RUNNING") {
    tone = "warn";
    nextActionTitle = "Monitor the active run and latest reply";
    nextActionDetail = normalizedString(
      threadState?.latestWorkerSummary,
      "The managed worker is still active on the current thread."
    );
    nextActionMeta = "Continue only when the latest reply or a review gate requires operator input.";
    if (runArtifactContext?.runId) {
      buttons.push({
        action: "open-governed-run",
        runId: runArtifactContext.runId,
        label: "Open Run Detail"
      });
    }
  }

  return {
    tone,
    currentStage,
    nextActionTitle,
    nextActionDetail,
    nextActionMeta,
    chips,
    buttons,
    stages: Array.isArray(aimxsLegibilityContext?.lifecycle) ? aimxsLegibilityContext.lifecycle : []
  };
}

function renderAgentWorkflowClarityContext(context = {}) {
  const toneClass = chipClassForActivityTone(context?.tone || "neutral");
  const currentStage = context?.currentStage || {};
  const stages = Array.isArray(context?.stages) ? context.stages : [];
  return `
    <div class="agentops-thread-flow">
      <div class="metric-title-row">
        <div class="title">AIMXS Thread Flow</div>
        <span class="${toneClass}">${escapeHTML(String(currentStage?.stateLabel || "Pending"))}</span>
      </div>
      <div class="meta">Current stage: ${escapeHTML(String(currentStage?.label || "Governed Ingress"))}</div>
      ${context?.chips?.length ? `<div class="run-detail-chips">${context.chips.map((item) => `<span class="chip chip-neutral chip-compact">${escapeHTML(`${item.label}=${item.value}`)}</span>`).join("")}</div>` : ""}
      ${
        stages.length
          ? `
            <div class="agentops-flow-ribbon">
              ${stages
                .map(
                  (stage) => `
                    <div class="agentops-flow-stage agentops-flow-stage-${escapeHTML(String(stage?.tone || "neutral"))}">
                      <div class="agentops-flow-stage-label">${escapeHTML(String(stage?.label || "-"))}</div>
                      <div class="agentops-flow-stage-state">${escapeHTML(String(stage?.stateLabel || "Pending"))}</div>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : `<div class="meta">No AIMXS lifecycle anchors are available for the active thread yet.</div>`
      }
      <div class="agentops-workflow-next">
        <div class="agentops-proof-label">Next Truthful Action</div>
        <div class="title">${escapeHTML(String(context?.nextActionTitle || "Review the active thread"))}</div>
        <div class="meta">${escapeHTML(String(context?.nextActionDetail || "Use the active thread surface for the next governed step."))}</div>
        <div class="meta">${escapeHTML(String(context?.nextActionMeta || ""))}</div>
        ${
          Array.isArray(context?.buttons) && context.buttons.length
            ? `
              <div class="filter-row settings-editor-actions">
                <div class="action-hierarchy">
                  <div class="action-group action-group-secondary">
                    ${context.buttons
                      .map((button) => {
                        if (button.action === "focus-agent-detail" && button.detailKey) {
                          return `<button class="btn btn-secondary btn-small" type="button" data-chat-action="focus-agent-detail" data-chat-detail-key="${escapeHTML(button.detailKey)}">${escapeHTML(button.label)}</button>`;
                        }
                        if (button.action === "open-governed-run" && button.runId) {
                          return `<button class="btn btn-secondary btn-small" type="button" data-chat-action="open-governed-run" data-chat-run-id="${escapeHTML(button.runId)}">${escapeHTML(button.label)}</button>`;
                        }
                        return "";
                      })
                      .join("")}
                  </div>
                </div>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function buildAgentArtifactEvidenceDrillInContext(latestTurn = null, runArtifactContext = {}) {
  const sessionView = latestTurn?.sessionView || {};
  const timeline = objectValue(sessionView?.timeline);
  const session = objectValue(timeline?.session);
  const sessionId = normalizedString(session?.sessionId, normalizedString(latestTurn?.response?.sessionId));
  const toolActions = Array.isArray(timeline?.toolActions) ? timeline.toolActions : [];
  const evidenceRecords = Array.isArray(timeline?.evidenceRecords) ? timeline.evidenceRecords : [];
  const transcript = latestManagedWorkerTranscript(sessionView);
  const latestToolAction = toolActions.length > 0 ? objectValue(toolActions[toolActions.length - 1]) : {};
  const latestEvidence = evidenceRecords.length > 0 ? objectValue(evidenceRecords[evidenceRecords.length - 1]) : {};
  const requestPayload = latestToolAction?.requestPayload && typeof latestToolAction.requestPayload === "object"
    ? JSON.stringify(latestToolAction.requestPayload, null, 2)
    : "";
  const resultPayload = latestToolAction?.resultPayload && typeof latestToolAction.resultPayload === "object"
    ? JSON.stringify(latestToolAction.resultPayload, null, 2)
    : "";
  const evidenceMetadata = latestEvidence?.metadata && typeof latestEvidence.metadata === "object"
    ? JSON.stringify(latestEvidence.metadata, null, 2)
    : "";
  return {
    sessionId,
    runId: normalizedString(runArtifactContext?.runId),
    toolAction: {
      toolActionId: normalizedString(latestToolAction?.toolActionId),
      toolType: normalizedString(latestToolAction?.toolType),
      status: normalizedString(latestToolAction?.status).toUpperCase(),
      source: normalizedString(latestToolAction?.source),
      workerId: normalizedString(latestToolAction?.workerId),
      approvalCheckpointId: normalizedString(latestToolAction?.approvalCheckpointId),
      detailKey: normalizedString(latestToolAction?.toolActionId)
        ? detailKey("agent", "drillin", "tool_action", sessionId || "unknown", normalizedString(latestToolAction?.toolActionId))
        : "",
      governedSummaryMarkup: normalizedString(latestToolAction?.toolType).toLowerCase() === "governed_action_request"
        ? renderGovernedActionResultSummary(latestToolAction)
        : "",
      requestPayload,
      resultPayload
    },
    evidence: {
      evidenceId: normalizedString(latestEvidence?.evidenceId),
      kind: normalizedString(latestEvidence?.kind),
      toolActionId: normalizedString(latestEvidence?.toolActionId),
      retentionClass: normalizedString(latestEvidence?.retentionClass),
      createdAt: normalizedString(latestEvidence?.createdAt),
      detailKey: normalizedString(latestEvidence?.evidenceId)
        ? detailKey("agent", "drillin", "evidence", sessionId || "unknown", normalizedString(latestEvidence?.evidenceId))
        : "",
      metadata: evidenceMetadata
    },
    transcript: {
      eventCount: Number(transcript?.eventCount || 0) || 0,
      toolActionId: normalizedString(transcript?.toolActionId),
      detailKey: transcript?.eventCount || normalizedString(transcript?.toolActionId) || normalizedString(transcript?.pretty)
        ? detailKey("agent", "drillin", "transcript", sessionId || "unknown", normalizedString(transcript?.toolActionId, "latest"))
        : "",
      pretty: normalizedString(transcript?.pretty)
    }
  };
}

function renderAgentArtifactEvidenceDrillInContext(context = {}) {
  const sessionId = normalizedString(context?.sessionId);
  const runId = normalizedString(context?.runId);
  const toolAction = objectValue(context?.toolAction);
  const evidence = objectValue(context?.evidence);
  const transcript = objectValue(context?.transcript);
  const hasToolAction = Boolean(toolAction.toolActionId);
  const hasEvidence = Boolean(evidence.evidenceId);
  const hasTranscript = Boolean(transcript.eventCount || transcript.toolActionId || transcript.pretty);
  const drillInCount = [hasToolAction, hasEvidence, hasTranscript].filter(Boolean).length;
  const drillTone = drillInCount >= 2
    ? "chip chip-ok chip-compact"
    : drillInCount > 0
      ? "chip chip-warn chip-compact"
      : "chip chip-neutral chip-compact";
  const drillLabel = drillInCount >= 2 ? "ready" : drillInCount > 0 ? "partial" : "empty";
  const cards = [];

  if (hasToolAction) {
    const toolActionDetailKey = normalizedString(toolAction.detailKey, detailKey("agent", "drillin", "tool_action", sessionId || "unknown", toolAction.toolActionId || "unknown"));
    const requestDetailKey = detailKey(toolActionDetailKey, "request");
    const resultDetailKey = detailKey(toolActionDetailKey, "result");
    cards.push(`
      <details class="details-shell agentops-drillin-shell" data-detail-key="${escapeHTML(toolActionDetailKey)}">
        <summary>Latest Tool Action Drill-In</summary>
        <div class="run-detail-chips">
          ${renderAgentProofChip("toolAction", toolAction.toolActionId)}
          ${renderAgentProofChip("type", toolAction.toolType)}
          ${renderAgentProofChip("status", toolAction.status, chipClassForSessionStatus(toolAction.status || "IDLE"))}
          ${renderAgentProofChip("source", toolAction.source)}
          ${renderAgentProofChip("worker", toolAction.workerId)}
        </div>
        ${toolAction.governedSummaryMarkup || ""}
        <div class="filter-row settings-editor-actions">
          <div class="action-hierarchy">
            <div class="action-group action-group-secondary">
              <button class="btn btn-secondary btn-small" type="button" data-chat-action="copy-tool-action-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-tool-action-id="${escapeHTML(toolAction.toolActionId)}">Copy JSON</button>
              <button class="btn btn-secondary btn-small" type="button" data-chat-action="download-tool-action-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-tool-action-id="${escapeHTML(toolAction.toolActionId)}">Download JSON</button>
            </div>
          </div>
        </div>
        ${toolAction.requestPayload ? `<details class="details-shell" data-detail-key="${escapeHTML(requestDetailKey)}"><summary>Request Payload</summary><pre class="code-block">${escapeHTML(toolAction.requestPayload)}</pre></details>` : `<div class="meta">No request payload captured.</div>`}
        ${toolAction.resultPayload ? `<details class="details-shell" data-detail-key="${escapeHTML(resultDetailKey)}"><summary>Result Payload</summary><pre class="code-block">${escapeHTML(toolAction.resultPayload)}</pre></details>` : `<div class="meta">No result payload captured.</div>`}
      </details>
    `);
  }

  if (hasEvidence) {
    const evidenceDetailKey = normalizedString(evidence.detailKey, detailKey("agent", "drillin", "evidence", sessionId || "unknown", evidence.evidenceId || "unknown"));
    cards.push(`
      <details class="details-shell agentops-drillin-shell" data-detail-key="${escapeHTML(evidenceDetailKey)}">
        <summary>Latest Evidence Drill-In</summary>
        <div class="run-detail-chips">
          ${renderAgentProofChip("evidence", evidence.evidenceId)}
          ${renderAgentProofChip("kind", evidence.kind)}
          ${renderAgentProofChip("toolAction", evidence.toolActionId)}
          ${renderAgentProofChip("retention", evidence.retentionClass)}
          ${renderAgentProofChip("created", evidence.createdAt ? formatTime(evidence.createdAt) : "")}
        </div>
        <div class="filter-row settings-editor-actions">
          <div class="action-hierarchy">
            <div class="action-group action-group-secondary">
              <button class="btn btn-secondary btn-small" type="button" data-chat-action="copy-evidence-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-evidence-id="${escapeHTML(evidence.evidenceId)}">Copy JSON</button>
              <button class="btn btn-secondary btn-small" type="button" data-chat-action="download-evidence-json" data-chat-session-id="${escapeHTML(sessionId)}" data-chat-evidence-id="${escapeHTML(evidence.evidenceId)}">Download JSON</button>
            </div>
          </div>
        </div>
        ${evidence.metadata ? `<pre class="code-block">${escapeHTML(evidence.metadata)}</pre>` : `<div class="meta">No evidence metadata captured.</div>`}
      </details>
    `);
  }

  if (hasTranscript) {
    const transcriptDetailKey = normalizedString(transcript.detailKey, detailKey("agent", "drillin", "transcript", sessionId || "unknown", transcript.toolActionId || "latest"));
    cards.push(`
      <details class="details-shell agentops-drillin-shell" data-detail-key="${escapeHTML(transcriptDetailKey)}">
        <summary>Managed Transcript Anchor</summary>
        <div class="run-detail-chips">
          ${renderAgentProofChip("events", transcript.eventCount ? String(transcript.eventCount) : "")}
          ${renderAgentProofChip("managedTurn", transcript.toolActionId)}
        </div>
        ${transcript.pretty ? `<pre class="code-block">${escapeHTML(transcript.pretty)}</pre>` : `<div class="meta">No worker transcript captured for the active turn.</div>`}
      </details>
    `);
  }

  return `
    <div class="metric agentops-context-panel">
      <div class="metric-title-row">
        <div class="title">Artifact And Evidence Drill-In</div>
        <span class="${drillTone}">${escapeHTML(drillLabel)}</span>
      </div>
      ${
        runId || toolAction.detailKey || evidence.detailKey || transcript.detailKey
          ? `
            <div class="filter-row settings-editor-actions">
              <div class="action-hierarchy">
                <div class="action-group action-group-secondary">
                  ${runId ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="open-governed-run" data-chat-run-id="${escapeHTML(runId)}">Open Active Run</button>` : ""}
                  ${toolAction.detailKey ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="focus-agent-detail" data-chat-detail-key="${escapeHTML(toolAction.detailKey)}">Pin Latest Tool Action</button>` : ""}
                  ${evidence.detailKey ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="focus-agent-detail" data-chat-detail-key="${escapeHTML(evidence.detailKey)}">Pin Latest Evidence</button>` : ""}
                  ${transcript.detailKey ? `<button class="btn btn-secondary btn-small" type="button" data-chat-action="focus-agent-detail" data-chat-detail-key="${escapeHTML(transcript.detailKey)}">Pin Managed Transcript</button>` : ""}
                </div>
              </div>
            </div>
          `
          : ""
      }
      ${
        cards.length
          ? `<div class="agentops-drillin-stack">${cards.join("")}</div>`
          : `<div class="meta">No artifact or evidence drill-ins are available for the active turn yet.</div>`
      }
    </div>
  `;
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
  const startAction = taskId && threadState?.isResolvedThread ? "start-followup-thread" : "start-thread";
  const startLabel = taskId && threadState?.isResolvedThread ? "New Follow-up Thread" : "Start Thread";
  const sendLabel = taskId && threadState?.isResolvedThread ? "Reopen and Send" : "Send Message";
  const executionMode = String(chatState.executionMode || thread?.executionMode || "managed_codex_worker").trim().toLowerCase();
  const selectedWorker = latestTurn?.sessionView?.timeline?.selectedWorker || {};
  const catalogState = chatState?.catalogs && typeof chatState.catalogs === "object" ? chatState.catalogs : {};
  const governedExportSelection = resolveChatGovernedExportSelection(chatState?.exportSelection || {}, catalogState?.exportProfiles || null);
  const managedExecution = executionMode === "managed_codex_worker";
  const historyCount = Number(history?.count ?? 0) || 0;
  const archivedCount = Number(history?.archivedCount ?? 0) || 0;
  const historySummary = String(history?.message || "Resume or archive prior work without losing the current thread.").trim();
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
  const focusSummary = buildAgentThreadSummary({
    taskId,
    threadState,
    latestActivity,
    latestTurn,
    turnCount: turns.length,
    historyCount,
    managedExecution
  });
  const runArtifactContext = buildAgentRunArtifactContext(latestTurn, latestPolicyOutcome);
  const decisionPivotContext = buildAgentDecisionPivotContext(latestTurn);
  const governancePivotContext = buildAgentGovernancePivotContext(latestTurn, catalogState, governedExportSelection);
  const executionProofContext = buildAgentExecutionProofContext(latestTurn, runArtifactContext);
  const aimxsLegibilityContext = buildAgentAimxsLegibilityContext({
    thread,
    runArtifactContext,
    decisionPivotContext,
    governancePivotContext,
    executionMode,
    agentProfileId: selectedProfileId
  });
  const aimxsDecisionBindingSpine = chatState?.aimxsDecisionBindingSpine && typeof chatState.aimxsDecisionBindingSpine === "object"
    ? chatState.aimxsDecisionBindingSpine
    : { available: false };
  const artifactEvidenceDrillInContext = buildAgentArtifactEvidenceDrillInContext(latestTurn, runArtifactContext);
  const workflowClarityContext = buildAgentWorkflowClarityContext({
    taskId,
    threadState,
    focusSummary,
    latestPolicyOutcome,
    runArtifactContext,
    decisionPivotContext,
    aimxsLegibilityContext
  });

  return `
    <div class="stack chat-surface agentops-workspace">
      <div class="panel-heading agentops-panel-heading">
        <h2>AgentOps</h2>
      </div>
      <div class="metric agentops-thread-header">
        <div class="metric-title-row">
          <div class="title">Thread Header</div>
          <span class="${focusSummary.tone}">${escapeHTML(focusSummary.label)}</span>
        </div>
        <div class="agentops-thread-summary">
          <div class="agentops-thread-heading">
            <div class="title">${escapeHTML(String(chatState.title || thread?.title || "New governed thread"))}</div>
            <div class="meta">${escapeHTML(focusSummary.title)}</div>
            <div class="meta">${escapeHTML(message || focusSummary.detail)}</div>
          </div>
          <div class="run-detail-chips">
            <span class="chip chip-neutral chip-compact">task=${escapeHTML(taskId || "-")}</span>
            <span class="chip chip-neutral chip-compact">turns=${escapeHTML(String(focusSummary.turnCount))}</span>
            <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(focusSummary.pendingApprovalCount))}</span>
            <span class="chip chip-neutral chip-compact">proposals=${escapeHTML(String(focusSummary.pendingProposalCount))}</span>
            <span class="chip chip-neutral chip-compact">history=${escapeHTML(String(focusSummary.historyCount))}</span>
            <span class="chip chip-neutral chip-compact">execution=${escapeHTML(executionModeLabel(executionMode))}</span>
          </div>
        </div>
        ${renderAgentWorkflowClarityContext(workflowClarityContext)}
        <div class="agentops-thread-fields">
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
      </div>
      <div class="metric agentops-anchored-composer">
        <div class="metric-title-row">
          <div class="title">Anchored Composer</div>
          <span class="${chipClassForSessionStatus(status)}">${escapeHTML(status.toUpperCase())}</span>
        </div>
        ${message ? `<div class="meta">${escapeHTML(message)}</div>` : ""}
        <div class="agentops-composer-grid">
          <label class="field field-wide">
            <span class="label">System Instructions</span>
            <textarea id="chat-system-prompt" class="filter-input settings-agent-test-textarea" rows="6" data-chat-field="systemPrompt">${escapeHTML(String(chatState.systemPrompt || ""))}</textarea>
          </label>
          <label class="field field-wide agentops-prompt-field">
            <span class="label">Prompt</span>
            <textarea id="chat-prompt" class="filter-input settings-agent-test-textarea" rows="8" data-chat-field="prompt">${escapeHTML(String(chatState.prompt || ""))}</textarea>
          </label>
        </div>
        <div class="filter-row settings-editor-actions agentops-composer-actions">
          <div class="action-hierarchy">
            <div class="action-group action-group-primary">
              <button class="btn btn-primary" type="button" data-chat-action="${startAction}">${startLabel}</button>
              <button class="btn btn-primary" type="button" data-chat-action="send-turn" ${taskId ? "" : "disabled"}>${sendLabel}</button>
            </div>
            <div class="action-group action-group-destructive agentops-clear-action">
              <button class="btn btn-danger" type="button" data-chat-action="reset-thread" ${taskId ? "" : "disabled"}>Clear Current Thread</button>
            </div>
          </div>
        </div>
      </div>
      <div class="metric agentops-transcript-workspace">
        <div class="metric-title-row">
          <div class="title">Transcript Workspace</div>
          <span class="${chipClassForSessionStatus(latestReplyStatus)}">${escapeHTML(latestReplyStatus)}</span>
        </div>
        <div class="agentops-transcript-layout">
          <div class="agentops-transcript-main">
            ${renderAgentTranscriptSummary({
              latestReplyText,
              latestReplyStatus,
              latestReplySessionId,
              latestReplyRoute,
              latestReplyBoundary,
              latestReplyCompletedAt,
              latestReplyFinishReason,
              latestPolicyOutcome,
              latestActivity,
              selectedWorker,
              taskId,
              threadState,
              focusSummary,
              executionMode,
              historyCount,
              catalogState
            })}
            <div class="chat-turns-stack agentops-transcript-feed">
              ${renderTurnCards(turns, catalogState, governedExportSelection)}
            </div>
            ${renderAgentThreadHistory(history, taskId, historyCount, archivedCount, historySummary, {
              tenantId,
              projectId,
              catalogsMessage: catalogState?.message || "",
              mode: settingsPayload?.mockMode ? "mock" : "live"
            })}
          </div>
          <div class="agentops-context-drawer">
            ${renderAgentApprovalContextDrawer(focusSummary, threadState, decisionPivotContext, governancePivotContext)}
            ${renderAgentAimxsLegibilityContext(aimxsLegibilityContext)}
            ${renderAgentAimxsDecisionBindingSpine(aimxsDecisionBindingSpine)}
            ${renderAgentRunArtifactContext(runArtifactContext)}
            ${renderAgentExecutionProofContext(executionProofContext)}
            ${renderAgentArtifactEvidenceDrillInContext(artifactEvidenceDrillInContext)}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderChat(ui, settingsPayload = {}, chatState = {}) {
  if (!ui.chatContent) {
    return;
  }
  ui.chatContent.innerHTML = buildAgentWorkspaceMarkup(settingsPayload, chatState);
}
