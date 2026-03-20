import {
  chipClassForStatus,
  escapeHTML,
  formatTime,
  renderPanelStateMetric,
  renderTraceabilityMetric
} from "../../../../views/common.js";

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

function isNativeDecision(item) {
  return Boolean(
    item && typeof item === "object" && String(item?.selectionId || "").trim().startsWith("native:")
  );
}

function buildNativeDecisionReviewModel(item) {
  const status = String(item?.status || "PENDING").trim().toUpperCase();
  const decisionType = String(item?.decisionType || "checkpoint").trim().toLowerCase();
  const isProposal = decisionType === "proposal";
  const isGatewayHold = decisionType === "gateway_hold";
  const identifierLabel = isGatewayHold ? "approvalId" : isProposal ? "proposalId" : "checkpointId";
  const identifierValue = isGatewayHold
    ? String(item?.approvalId || "").trim()
    : isProposal
      ? String(item?.proposalId || "").trim()
      : String(item?.checkpointId || "").trim();
  const summary = String(item?.summary || item?.reason || "").trim();
  const actionable = status === "PENDING";
  const ttl = isGatewayHold
    ? ttlInfo(item?.expiresAt)
    : {
        label: "-",
        chipClass: "chip chip-neutral chip-compact",
        expiresAtLabel: "-",
        expired: false
      };
  const sourceClientLabel = String(item?.sourceClient?.name || item?.sourceClient?.id || item?.clientLabel || "-").trim() || "-";
  const createdAt = String(item?.createdAt || "").trim();
  const runId = String(item?.runId || "").trim();
  const sessionId = isGatewayHold
    ? String(item?.codexSessionId || item?.sessionId || "").trim()
    : String(item?.sessionId || "").trim();
  return {
    approval: item,
    runId,
    status,
    ttl,
    capabilities: [],
    rawApprovalRecord: JSON.stringify(item || {}, null, 2),
    capabilityRows: summary
      ? `<li>${escapeHTML(summary)}</li>`
      : "<li>No decision summary captured.</li>",
    statusChip: chipClassForStatus(status),
    actionable,
    scopeLabel: `${String(item?.tenantId || "-")}/${String(item?.projectId || "-")}`,
    traceabilityMetric: renderTraceabilityMetric(
      "1A. Decision Traceability",
      isGatewayHold
        ? [
            { label: "source", value: String(item?.source || "gateway-hold") },
            { label: "client", value: sourceClientLabel },
            { label: "runId", value: runId || "-" },
            { label: "recordStatus", value: status || "UNKNOWN", tone: actionable ? "ok" : "warn" }
          ]
        : [
            { label: "source", value: String(item?.source || "native-session") },
            { label: "thread", value: String(item?.taskId || "-") },
            { label: "session", value: sessionId || "-" },
            { label: "recordStatus", value: status || "UNKNOWN", tone: actionable ? "ok" : "warn" }
          ],
      isGatewayHold
        ? "Use these identifiers when reviewing the interposed request that is paused in the local gateway path."
        : "Use these identifiers when reviewing the current thread from the Agent workspace.",
      isGatewayHold
        ? [
            `createdAt=${formatTime(createdAt)}`,
            `approvalId=${identifierValue || "-"}`,
            `interpositionRequestId=${String(item?.interpositionRequestId || "-")}`,
            `gatewayRequestId=${String(item?.gatewayRequestId || "-")}`,
            `reasonOptional=true; operatorDecisionSurface=companion-governance-review`
          ]
        : [
            `createdAt=${formatTime(createdAt)}`,
            `${identifierLabel}=${identifierValue || "-"}`,
            `reasonOptional=true; operatorDecisionSurface=agent-approval-review`
          ]
    ),
    guardrails: [
      actionable
        ? isGatewayHold
          ? "Decision controls are active because the interposed request is still held pending approval."
          : "Decision controls are active because the current thread still has a pending governed decision."
        : `Decision controls are locked because status=${status || "UNKNOWN"}.`,
      isGatewayHold
        ? "Decision reason is optional here; if omitted, the review surface submits a default audit note showing the action came from the pinned Companion review."
        : "Decision reason is optional here; if omitted, the review surface submits a default audit note showing the action came from the pinned Agent review.",
      isGatewayHold
        ? "Approving resumes the interposed upstream request path; denying closes the held request and preserves the audit chain."
        : isProposal
          ? "Confirm the proposal summary and command are appropriate before approval."
          : "Confirm the checkpoint reason and scope match the current thread state before approval.",
      isGatewayHold
        ? "Review the source client, runId, approvalId, and held target before deciding so the release path matches the intended request."
        : "Keep the pinned review aligned with the active native decision rather than switching to an unrelated queue item."
    ],
    detailTitle: isGatewayHold ? "Interposed Request Hold" : isProposal ? "Tool Proposal" : "Approval Checkpoint",
    identifierLabel,
    identifierValue: identifierValue || "-",
    detailSummary: summary || "No decision summary captured.",
    selectionId: String(item?.selectionId || "").trim(),
    decisionType,
    sessionId,
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
      {
        label: "recordStatus",
        value: status || "UNKNOWN",
        tone: actionable ? "ok" : ttl.expired ? "danger" : "warn"
      }
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

export function renderGovernanceApprovalReview(target, approval) {
  if (!target || typeof target !== "object") {
    return;
  }
  const model = buildApprovalReviewModel(approval);
  if (!model) {
    target.innerHTML = renderPanelStateMetric(
      "info",
      "Approval Review",
      "Select an approval card to keep its decision context pinned in Agent.",
      "Use the pinned review section and run detail from Agent."
    );
    return;
  }
  const selectedRunId = String(model.runId || model.selectionId || "").trim();
  if (selectedRunId && target.dataset) {
    target.dataset.selectedRunId = selectedRunId;
  }
  target.innerHTML = `
    <div class="metric approval-review-selection">
      <div class="metric-title-row">
        <div class="title focus-anchor" tabindex="-1" data-focus-anchor="approval-detail">Pinned Approval Review</div>
        <span class="${model.statusChip} chip-compact">status=${escapeHTML(model.status || "UNKNOWN")}</span>
        <span class="${escapeHTML(model.ttl.chipClass)}">${escapeHTML(`ttl=${model.ttl.label}`)}</span>
        <span class="chip chip-neutral chip-compact">${escapeHTML(model.detailTitle || "Approval")}</span>
      </div>
      <div class="meta metric-note">${escapeHTML(
        model.hasInlineDecision
          ? model.decisionType === "gateway_hold"
            ? "Keep the selected interposed request hold pinned here and approve or deny directly from this review surface."
            : "Keep the selected current-thread decision pinned here and approve or deny directly from this review surface."
          : "Keep the selected approval pinned here and use run detail for the underlying record."
      )}</div>
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

export function renderGovernanceApprovalReviewModal(target, approval) {
  if (!target || typeof target !== "object") {
    return;
  }
  const model = buildApprovalReviewModel(approval);
  if (!model) {
    target.innerHTML = renderPanelStateMetric(
      "info",
      "Approval Review",
      "Select a pending approval from Agent to inspect its detail if the legacy review surface is still present."
    );
    if (target.dataset) {
      delete target.dataset.selectedRunId;
    }
    return;
  }
  if (target.dataset) {
    target.dataset.selectedRunId = model.runId;
  }
  target.innerHTML = `
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
