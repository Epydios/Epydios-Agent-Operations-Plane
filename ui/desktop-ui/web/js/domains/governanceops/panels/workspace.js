import { escapeHTML, renderPanelStateMetric } from "../../../views/common.js";
import { renderAimxsLegibilityBlock } from "../../../shared/components/aimxs-legibility.js";
import { renderAimxsDecisionBindingSpine } from "../../../shared/components/aimxs-decision-binding-spine.js";
import {
  createGovernanceWorkspaceSnapshot,
  governanceStatusChipClass,
  governanceToneChipClass
} from "../state.js";

function renderValuePills(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const value = String(item?.value || "").trim();
      if (!label || !value) {
        return "";
      }
      return `
        <span class="governanceops-value-pill">
          <span class="governanceops-value-key">${escapeHTML(label)}</span>
          <span class="governanceops-value-text${item?.code ? " governanceops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="governanceops-empty">not available</span>';
  }
  return `<div class="governanceops-value-group">${values.join("")}</div>`;
}

function renderKeyValueRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const label = String(row?.label || "").trim();
      const value = String(row?.value || "").trim();
      if (!label) {
        return "";
      }
      return `
        <div class="governanceops-row">
          <div class="governanceops-row-label">${escapeHTML(label)}</div>
          <div class="governanceops-row-value">${value || '<span class="governanceops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderOperationalFeedback(snapshot) {
  const feedback = snapshot.operationalFeedback;
  if (!feedback?.available) {
    return "";
  }
  const tone =
    feedback.tone === "error"
      ? "error"
      : feedback.tone === "ok"
        ? "success"
        : feedback.tone === "warn"
          ? "warn"
          : "info";
  const title =
    feedback.tone === "error"
      ? "Governance action failed"
      : feedback.tone === "ok"
        ? "Governance action completed"
        : feedback.tone === "warn"
          ? "Governance handoff required"
          : "Governance update";
  return `
    <div class="governanceops-feedback-shell" data-governanceops-panel="operational-feedback">
      ${renderPanelStateMetric(tone, title, feedback.message)}
    </div>
  `;
}

function renderAimxsDecisionBindingSpineBoard(snapshot) {
  const board = snapshot.aimxsDecisionBindingSpine;
  if (!board?.available) {
    return "";
  }
  return `
    <article class="metric governanceops-card governanceops-card-wide" data-domain-root="governanceops" data-governanceops-panel="aimxs-decision-binding-spine">
      <div class="metric-title-row">
        <div class="title">AIMXS Decision-Binding Spine</div>
        <span class="chip chip-neutral chip-compact">correlated</span>
      </div>
      ${renderAimxsDecisionBindingSpine(board)}
    </article>
  `;
}

function governanceAdminStatusChipClass(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "applied") {
    return "chip chip-ok chip-compact";
  }
  if (normalized === "denied") {
    return "chip chip-danger chip-compact";
  }
  if (normalized === "deferred" || normalized === "escalated" || normalized === "routed") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function ownerDomainLabel(ownerDomain = "") {
  const normalized = String(ownerDomain || "").trim().toLowerCase();
  if (normalized === "complianceops") {
    return "ComplianceOps";
  }
  if (normalized === "platformops") {
    return "PlatformOps";
  }
  if (normalized === "guardrailops") {
    return "GuardrailOps";
  }
  if (normalized === "policyops") {
    return "PolicyOps";
  }
  if (normalized === "networkops") {
    return "NetworkOps";
  }
  if (normalized === "identityops") {
    return "IdentityOps";
  }
  return normalized ? `${normalized}` : "Owner";
}

function renderAdminProposalReviewBoard(snapshot) {
  const board = snapshot.adminProposalReview;
  if (!board?.available) {
    return `
      <article class="metric governanceops-card governanceops-card-wide" data-domain-root="governanceops" data-governanceops-panel="admin-proposal-review">
        <div class="metric-title-row">
          <div class="title">Admin Proposal Review</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="governanceops-kv-list">
          <div class="governanceops-row">
            <div class="governanceops-row-label">Status</div>
            <div class="governanceops-row-value"><span class="governanceops-empty">No routed high-risk admin proposal is currently waiting for governance review.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const rows = [
    {
      label: "Proposal",
      value: renderValuePills([
        { label: "change", value: board.changeId, code: true },
        { label: "kind", value: board.kind },
        { label: "action", value: board.requestedAction },
        { label: "status", value: board.status }
      ])
    },
    {
      label: "Scope",
      value: renderValuePills([
        { label: board.subjectLabel || "subject", value: board.subjectId, code: true },
        { label: board.targetLabel || "target", value: board.targetScope, code: true },
        { label: "routed", value: board.routedAt },
        { label: "updated", value: board.updatedAt }
      ])
    },
    {
      label: "Summary",
      value: escapeHTML(board.summary || "-")
    },
    {
      label: "Simulation",
      value: escapeHTML(board.simulationSummary || "-")
    },
    {
      label: "Decision",
      value: renderValuePills([
        { label: "decision", value: board.decision?.status },
        { label: "decision id", value: board.decision?.decisionId, code: true },
        { label: "approval receipt", value: board.decision?.approvalReceiptId, code: true },
        { label: "decided", value: board.decision?.decidedAt }
      ])
    },
    {
      label: "Decision Reason",
      value: escapeHTML(board.decision?.reason || board.reason || "-")
    },
    {
      label: "Receipt",
      value: renderValuePills([
        { label: "admin receipt", value: board.receipt?.receiptId, code: true },
        { label: "issued", value: board.receipt?.issuedAt },
        { label: "stable ref", value: board.receipt?.stableRef, code: true }
      ])
    }
  ];
  const ownerLabel = ownerDomainLabel(board.ownerDomain);
  const openOwnerButton =
    String(board.ownerDomain || "").trim().toLowerCase() === "identityops"
      ? `
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-governanceops-open-identity-admin-change-id="${escapeHTML(board.changeId)}"
          >Open ${escapeHTML(ownerLabel)}</button>
        `
      : `
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-governanceops-open-admin-owner-domain="${escapeHTML(String(board.ownerDomain || "").trim().toLowerCase())}"
            data-governanceops-open-admin-change-id="${escapeHTML(board.changeId)}"
          >Open ${escapeHTML(ownerLabel)}</button>
        `;

  return `
    <article class="metric governanceops-card governanceops-card-wide" data-domain-root="governanceops" data-governanceops-panel="admin-proposal-review">
      <div class="metric-title-row">
        <div class="title">Admin Proposal Review</div>
        <span class="${governanceAdminStatusChipClass(board.status)}">${escapeHTML(board.status)}</span>
      </div>
      <div class="governanceops-chip-row">
        <span class="chip chip-neutral chip-compact">owner=${escapeHTML(String(board.ownerDomain || "").trim() || "unknown")}</span>
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
        ${board.decision?.approvalReceiptId && board.decision.approvalReceiptId !== "-" ? '<span class="chip chip-ok chip-compact">receipt issued</span>' : '<span class="chip chip-neutral chip-compact">receipt pending</span>'}
      </div>
      <div class="governanceops-kv-list">${renderKeyValueRows(rows)}</div>
      ${renderAimxsLegibilityBlock(board.aimxsLegibility)}
      <div class="governanceops-action-layout">
        <label class="field governanceops-reason-field">
          <span class="label">Admin Decision Reason</span>
          <input
            class="filter-input"
            type="text"
            placeholder="required; explain the governance decision or handoff"
            data-governanceops-admin-decision-reason
          />
        </label>
        <div class="governanceops-action-row">
          <button
            class="btn btn-ok"
            type="button"
            data-governanceops-decision-admin-change-id="${escapeHTML(board.changeId)}"
            data-governanceops-decision="APPROVE"
            ${board.canApproveDeny ? "" : "disabled"}
          >Approve</button>
          <button
            class="btn btn-danger"
            type="button"
            data-governanceops-decision-admin-change-id="${escapeHTML(board.changeId)}"
            data-governanceops-decision="DENY"
            ${board.canApproveDeny ? "" : "disabled"}
          >Deny</button>
          <button
            class="btn btn-secondary"
            type="button"
            data-governanceops-routing-admin-change-id="${escapeHTML(board.changeId)}"
            data-governanceops-routing-action="DEFER"
            ${board.canRoute ? "" : "disabled"}
          >Defer</button>
          <button
            class="btn btn-secondary"
            type="button"
            data-governanceops-routing-admin-change-id="${escapeHTML(board.changeId)}"
            data-governanceops-routing-action="ESCALATE"
            ${board.canRoute ? "" : "disabled"}
          >Escalate</button>
          ${openOwnerButton}
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-governanceops-copy-admin-receipt-change-id="${escapeHTML(board.changeId)}"
            ${board.canCopyReceipt ? "" : "disabled"}
          >Copy Decision Receipt</button>
        </div>
      </div>
    </article>
  `;
}

function renderActionReviewBoard(snapshot) {
  const board = snapshot.actionReview;
  if (!board?.available) {
    return `
      <article class="metric governanceops-card governanceops-card-wide" data-domain-root="governanceops" data-governanceops-panel="action-review">
        <div class="metric-title-row">
          <div class="title">Active Review</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="governanceops-kv-list">
          <div class="governanceops-row">
            <div class="governanceops-row-label">Status</div>
            <div class="governanceops-row-value"><span class="governanceops-empty">No approval is currently selected for live governance review.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const rows = [
    {
      label: "Current Approval",
      value: renderValuePills([
        { label: "approval", value: board.approvalId, code: true },
        { label: "run", value: board.runId, code: true },
        { label: "request", value: board.requestId, code: true },
        { label: "status", value: board.approvalStatus }
      ])
    },
    {
      label: "Scope",
      value: renderValuePills([
        { label: "tenant", value: board.tenantId },
        { label: "project", value: board.projectId },
        { label: "tier", value: board.tierLabel },
        { label: "profile", value: board.targetExecutionProfile }
      ])
    },
    {
      label: "Policy And Receipt",
      value: renderValuePills([
        { label: "policy", value: board.policyDecision },
        { label: "provider", value: board.policyProvider, code: true },
        { label: "grant", value: board.grantTokenPresent ? "present" : "missing" },
        { label: "bundle", value: board.evidenceBundleStatus }
      ])
    },
    {
      label: "Reason And Timing",
      value: renderValuePills([
        { label: "reason", value: board.reason },
        { label: "created", value: board.createdAt, code: true },
        { label: "reviewed", value: board.reviewedAt, code: true },
        { label: "expires", value: board.expiresAt, code: true }
      ])
    },
    {
      label: "Capability Scope",
      value:
        board.requestedCapabilities.length > 0
          ? renderValuePills(
              board.requestedCapabilities.map((value, index) => ({
                label: index === 0 ? "capability" : "capability+",
                value
              }))
            )
          : '<span class="governanceops-empty">not available</span>'
    }
  ];

  return `
    <article class="metric governanceops-card governanceops-card-wide" data-domain-root="governanceops" data-governanceops-panel="action-review">
      <div class="metric-title-row">
        <div class="title">Active Review</div>
        <span class="${governanceStatusChipClass(board.approvalStatus)}">${escapeHTML(board.approvalStatus)}</span>
      </div>
      <div class="governanceops-chip-row">
        <span class="chip chip-neutral chip-compact">live=approve/deny</span>
        <span class="chip chip-neutral chip-compact">route=defer/escalate</span>
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
      </div>
      <div class="governanceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="governanceops-action-layout">
        <label class="field governanceops-reason-field">
          <span class="label">Decision Reason</span>
          <input
            class="filter-input"
            type="text"
            placeholder="required; explain the governance decision or handoff"
            data-governanceops-decision-reason
          />
        </label>
        <div class="governanceops-action-row">
          <button
            class="btn btn-ok"
            type="button"
            data-governanceops-decision-run-id="${escapeHTML(board.runId)}"
            data-governanceops-decision="APPROVE"
            ${board.canApproveDeny ? "" : "disabled"}
          >Approve</button>
          <button
            class="btn btn-danger"
            type="button"
            data-governanceops-decision-run-id="${escapeHTML(board.runId)}"
            data-governanceops-decision="DENY"
            ${board.canApproveDeny ? "" : "disabled"}
          >Deny</button>
          <button
            class="btn btn-secondary"
            type="button"
            data-governanceops-routing-run-id="${escapeHTML(board.runId)}"
            data-governanceops-routing-action="DEFER"
            ${board.canRoute ? "" : "disabled"}
          >Defer</button>
          <button
            class="btn btn-secondary"
            type="button"
            data-governanceops-routing-run-id="${escapeHTML(board.runId)}"
            data-governanceops-routing-action="ESCALATE"
            ${board.canRoute ? "" : "disabled"}
          >Escalate</button>
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-governanceops-open-run-id="${escapeHTML(board.runId)}"
          >Open Run</button>
          <button
            class="btn btn-secondary btn-small"
            type="button"
            data-governanceops-copy-receipt-run-id="${escapeHTML(board.runId)}"
          >Copy Receipt Snapshot</button>
        </div>
      </div>
    </article>
  `;
}

function renderConnectorApprovalsBoard(snapshot) {
  const board = snapshot.connectorApprovalQueue;
  if (!board?.available || !board.selected) {
    return `
      <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="connector-approval-queue">
        <div class="metric-title-row">
          <div class="title">Connector Approvals</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="governanceops-kv-list">
          ${renderKeyValueRows([
            {
              label: "Status",
              value: '<span class="governanceops-empty">No pending connector approval is currently waiting in the local gateway hold lane.</span>'
            },
            {
              label: "Connector Coverage",
              value: renderValuePills([
                { label: "enabled profiles", value: String(board?.enabledProfileCount || 0) },
                { label: "known profiles", value: String(board?.profileCount || 0) },
                { label: "selected", value: board?.selectedConnectorLabel || "-" }
              ])
            }
          ])}
        </div>
      </article>
    `;
  }

  const item = board.selected;
  return `
    <article class="metric governanceops-card governanceops-card-wide" data-domain-root="governanceops" data-governanceops-panel="connector-approval-queue">
      <div class="metric-title-row">
        <div class="title">Connector Approvals</div>
        <span class="chip chip-warn chip-compact">pending</span>
      </div>
      <div class="governanceops-chip-row">
        <span class="chip chip-neutral chip-compact">driver=${escapeHTML(item.driverLabel)}</span>
        <span class="chip chip-neutral chip-compact">tool=${escapeHTML(item.toolName)}</span>
        <span class="chip chip-neutral chip-compact">pending=${escapeHTML(String(board.pendingCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
      </div>
      <div class="governanceops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Current Connector Hold",
            value: renderValuePills([
              { label: "approval", value: item.approvalId, code: true },
              { label: "run", value: item.runId, code: true },
              { label: "request", value: item.interpositionRequestId, code: true },
              { label: "connector", value: item.driverLabel },
              { label: "tool", value: item.toolName, code: true }
            ])
          },
          {
            label: "Governance Target",
            value: renderValuePills([
              { label: "title", value: item.requestTitle },
              { label: "target", value: item.targetRef, code: true },
              { label: "client", value: item.clientLabel },
              { label: "surface", value: item.clientSurface, code: true }
            ])
          },
          {
            label: "Hold Timing",
            value: renderValuePills([
              { label: "started", value: item.holdStartedAt, code: true },
              { label: "deadline", value: item.holdDeadlineAt, code: true },
              { label: "gateway", value: item.gatewayRequestId, code: true },
              { label: "environment", value: item.environmentId, code: true }
            ])
          },
          {
            label: "Reason And Coverage",
            value: `
              ${renderValuePills([
                { label: "reason", value: item.reason },
                { label: "selected profile", value: board.selectedConnectorLabel || "-" },
                { label: "enabled profiles", value: String(board.enabledProfileCount || 0) },
                { label: "known profiles", value: String(board.profileCount || 0) }
              ])}
              <div class="governanceops-action-row">
                <button
                  class="btn btn-primary btn-small"
                  type="button"
                  data-governanceops-open-run-id="${escapeHTML(item.runId)}"
                >Open Run Detail</button>
                <button
                  class="btn btn-secondary btn-small"
                  type="button"
                  data-governanceops-open-view="runtimeops"
                >Open RuntimeOps</button>
                <button
                  class="btn btn-secondary btn-small"
                  type="button"
                  data-governanceops-open-view="settingsops"
                >Open SettingsOps</button>
              </div>
            `
          }
        ])}
      </div>
    </article>
  `;
}

function renderApprovalQueueBoard(snapshot) {
  const board = snapshot.approvalQueue;
  if (!board.available) {
    return `
      <article class="metric governanceops-card governanceops-card-wide" data-domain-root="governanceops" data-governanceops-panel="approval-queue">
        <div class="metric-title-row">
          <div class="title">Approval Queue</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="governanceops-kv-list">
          <div class="governanceops-row">
            <div class="governanceops-row-label">Status</div>
            <div class="governanceops-row-value"><span class="governanceops-empty">No governance approvals are currently loaded.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const queueCards = board.items
    .map(
      (item) => `
        <article class="governanceops-queue-card">
          <div class="metric-title-row">
            <div class="title"><code>${escapeHTML(item.approvalId)}</code></div>
            <span class="${governanceStatusChipClass(item.status)}">${escapeHTML(item.status)}</span>
          </div>
          <div class="governanceops-chip-row">
            <span class="chip chip-neutral chip-compact">${escapeHTML(item.tierLabel)}</span>
            <span class="chip chip-neutral chip-compact">${escapeHTML(item.targetExecutionProfile)}</span>
          </div>
          <div class="governanceops-kv-list">
            ${renderKeyValueRows([
              {
                label: "Context",
                value: renderValuePills([
                  { label: "run", value: item.runId, code: true },
                  { label: "request", value: item.requestId, code: true },
                  { label: "tenant", value: item.tenantId },
                  { label: "project", value: item.projectId }
                ])
              },
              {
                label: "Timing",
                value: renderValuePills([
                  { label: "created", value: item.createdAt, code: true },
                  { label: "reviewed", value: item.reviewedAt, code: true },
                  { label: "expires", value: item.expiresAt, code: true }
                ])
              },
              {
                label: "Reason",
                value: escapeHTML(item.reason || "-")
              }
            ])}
          </div>
          <div class="governanceops-action-row">
            <button
              class="btn btn-secondary btn-small"
              type="button"
              data-governanceops-select-run-id="${escapeHTML(item.runId)}"
            >Review</button>
            <button
              class="btn btn-secondary btn-small"
              type="button"
              data-governanceops-open-run-id="${escapeHTML(item.runId)}"
            >Open Run</button>
          </div>
        </article>
      `
    )
    .join("");

  return `
    <article class="metric governanceops-card governanceops-card-wide" data-domain-root="governanceops" data-governanceops-panel="approval-queue">
      <div class="metric-title-row">
        <div class="title">Approval Queue</div>
        <span class="chip chip-neutral chip-compact">total=${escapeHTML(String(board.counts.total || 0))}</span>
      </div>
      <div class="governanceops-chip-row">
        <span class="chip chip-warn chip-compact">pending=${escapeHTML(String(board.counts.pending || 0))}</span>
        <span class="chip chip-ok chip-compact">approved=${escapeHTML(String(board.counts.approved || 0))}</span>
        <span class="chip chip-danger chip-compact">denied=${escapeHTML(String(board.counts.denied || 0))}</span>
        <span class="chip chip-warn chip-compact">expired=${escapeHTML(String(board.counts.expired || 0))}</span>
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
      </div>
      ${board.warning ? `<div class="meta">${escapeHTML(board.warning)}</div>` : ""}
      <div class="governanceops-queue-list">${queueCards}</div>
    </article>
  `;
}

function renderAuthorityLadderBoard(snapshot) {
  const board = snapshot.authorityLadder;
  if (!board.available) {
    return `
      <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="authority-ladder">
        <div class="metric-title-row">
          <div class="title">Authority Ladder</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="governanceops-kv-list">
          <div class="governanceops-row">
            <div class="governanceops-row-label">Status</div>
            <div class="governanceops-row-value"><span class="governanceops-empty">No actor or approval authority anchors are currently loaded.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const rows = [
    {
      label: "Acting Identity",
      value: renderValuePills([
        { label: "subject", value: board.subject, code: true },
        { label: "client", value: board.clientId, code: true },
        { label: "basis", value: board.authorityBasis }
      ])
    },
    {
      label: "Scope",
      value: renderValuePills([
        { label: "roles", value: String(board.roles.length || 0) },
        { label: "tenants", value: board.tenantIds.join(", ") || "-" },
        { label: "projects", value: board.projectIds.join(", ") || "-" },
        { label: "env", value: board.environment }
      ])
    },
    {
      label: "Current Ladder Position",
      value: renderValuePills([
        { label: "tier", value: board.currentTier },
        { label: "profile", value: board.targetExecutionProfile },
        { label: "decision", value: board.policyDecision || "-" }
      ])
    },
    {
      label: "Linked Context",
      value: renderValuePills([
        { label: "approval", value: board.approvalId, code: true },
        { label: "run", value: board.runId, code: true },
        { label: "request", value: board.requestId, code: true },
        { label: "provider", value: board.policyProvider, code: true }
      ])
    }
  ];

  return `
    <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="authority-ladder">
      <div class="metric-title-row">
        <div class="title">Authority Ladder</div>
        <span class="chip chip-neutral chip-compact">${escapeHTML(board.currentTier)}</span>
      </div>
      <div class="governanceops-chip-row">
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
        <span class="chip chip-neutral chip-compact">roles=${escapeHTML(String(board.roles.length || 0))}</span>
        <span class="chip chip-neutral chip-compact">scope=${escapeHTML(String((board.tenantIds.length || 0) + (board.projectIds.length || 0)))}</span>
      </div>
      <div class="governanceops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderDecisionReceiptBoard(snapshot) {
  const board = snapshot.decisionReceipt;
  if (!board.available) {
    return `
      <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="decision-receipt">
        <div class="metric-title-row">
          <div class="title">Decision Receipt</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="governanceops-kv-list">
          <div class="governanceops-row">
            <div class="governanceops-row-label">Status</div>
            <div class="governanceops-row-value"><span class="governanceops-empty">No recorded governance decision receipt is loaded.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const rows = [
    {
      label: "Receipt Source",
      value: renderValuePills([
        { label: "state", value: board.state.label },
        { label: "source", value: board.source },
        { label: "approval", value: board.approvalId, code: true },
        { label: "run", value: board.runId, code: true }
      ])
    },
    {
      label: "Decision",
      value: renderValuePills([
        { label: "status", value: board.approvalStatus },
        { label: "policy", value: board.policyDecision || "-" },
        { label: "provider", value: board.policyProvider, code: true }
      ])
    },
    {
      label: "Evidence Linkage",
      value: renderValuePills([
        { label: "grant token", value: board.grantTokenPresent ? "present" : "missing" },
        { label: "bundle", value: board.evidenceBundleStatus },
        { label: "record", value: board.evidenceRecordStatus }
      ])
    },
    {
      label: "Timing And Reason",
      value: renderValuePills([
        { label: "reviewed", value: board.reviewedAt, code: true },
        { label: "expires", value: board.expiresAt, code: true },
        { label: "reason", value: board.reason }
      ])
    }
  ];

  return `
    <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="decision-receipt">
      <div class="metric-title-row">
        <div class="title">Decision Receipt</div>
        <span class="${governanceToneChipClass(board.state.tone)}">${escapeHTML(board.state.label)}</span>
      </div>
      <div class="governanceops-chip-row">
        <span class="${governanceStatusChipClass(board.approvalStatus)}">${escapeHTML(board.approvalStatus || "-")}</span>
        <span class="chip chip-neutral chip-compact">grant=${escapeHTML(board.grantTokenPresent ? "present" : "missing")}</span>
        <span class="chip chip-neutral chip-compact">bundle=${escapeHTML(board.evidenceBundleStatus)}</span>
      </div>
      <div class="governanceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="governanceops-action-row">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-governanceops-copy-receipt-run-id="${escapeHTML(board.runId)}"
        >Copy Receipt</button>
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-governanceops-open-view="auditops"
        >Open AuditOps</button>
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-governanceops-open-view="evidenceops"
        >Open EvidenceOps</button>
      </div>
    </article>
  `;
}

function renderDelegationAndEscalationBoard(snapshot) {
  const board = snapshot.delegationEscalation;
  if (!board.available) {
    return `
      <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="delegation-escalation">
        <div class="metric-title-row">
          <div class="title">Delegation And Escalation</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="governanceops-kv-list">
          <div class="governanceops-row">
            <div class="governanceops-row-label">Status</div>
            <div class="governanceops-row-value"><span class="governanceops-empty">No delegation or escalation anchors are currently loaded.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const rows = [
    {
      label: "Current Route",
      value: renderValuePills([
        { label: "state", value: board.routeState },
        { label: "mode", value: board.routeMode },
        { label: "receiver", value: board.receiverClass },
        { label: "tier", value: board.approvalTier }
      ])
    },
    {
      label: "Delegation Inputs",
      value: renderValuePills([
        { label: "basis", value: board.authorityBasis },
        { label: "role-scoped", value: board.roleScoped ? "yes" : "no" },
        { label: "scope-bound", value: board.scopeBound ? "yes" : "no" },
        { label: "roles", value: board.rolePreview.join(", ") || String(board.roleCount || 0) }
      ])
    },
    {
      label: "Escalation Linkage",
      value: renderValuePills([
        { label: "approval", value: board.approvalId, code: true },
        { label: "run", value: board.runId, code: true },
        { label: "request", value: board.requestId, code: true },
        { label: "policy", value: board.policyDecision }
      ])
    },
    {
      label: "Timing And Reason",
      value: renderValuePills([
        { label: "receiver state", value: board.receiverState },
        { label: "reviewed", value: board.reviewedAt, code: true },
        { label: "expires", value: board.expiresAt, code: true },
        { label: "reason", value: board.reason }
      ])
    }
  ];

  return `
    <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="delegation-escalation">
      <div class="metric-title-row">
        <div class="title">Delegation And Escalation</div>
        <span class="${governanceToneChipClass(board.routeTone)}">${escapeHTML(board.routeState)}</span>
      </div>
      <div class="governanceops-chip-row">
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
        <span class="chip chip-neutral chip-compact">receiver=${escapeHTML(board.receiverState)}</span>
        <span class="chip chip-neutral chip-compact">roles=${escapeHTML(String(board.roleCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">scope=${escapeHTML(String((board.tenantCount || 0) + (board.projectCount || 0)))}</span>
      </div>
      <div class="governanceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="governanceops-action-row">
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-governanceops-routing-run-id="${escapeHTML(board.runId)}"
          data-governanceops-routing-action="ESCALATE"
          ${board.approvalId !== "-" ? "" : "disabled"}
        >Escalate</button>
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-governanceops-open-view="policyops"
        >Open PolicyOps</button>
        <button
          class="btn btn-secondary btn-small"
          type="button"
          data-governanceops-open-run-id="${escapeHTML(board.runId)}"
        >Open RuntimeOps</button>
      </div>
    </article>
  `;
}

function renderOverrideAndExceptionPostureBoard(snapshot) {
  const board = snapshot.overrideExceptionPosture;
  if (!board.available) {
    return `
      <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="override-exception-posture">
        <div class="metric-title-row">
          <div class="title">Override And Exception Posture</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="governanceops-kv-list">
          <div class="governanceops-row">
            <div class="governanceops-row-label">Status</div>
            <div class="governanceops-row-value"><span class="governanceops-empty">No override or exception anchors are currently loaded.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const rows = [
    {
      label: "Current Posture",
      value: renderValuePills([
        { label: "state", value: board.postureState },
        { label: "path", value: board.posturePath },
        { label: "approval", value: board.approvalStatus },
        { label: "policy", value: board.policyDecision }
      ])
    },
    {
      label: "Exception Linkage",
      value: renderValuePills([
        { label: "profile", value: board.profileLabel },
        { label: "exception", value: board.latestExceptionLabel },
        { label: "overlay", value: board.latestOverlayLabel },
        { label: "grant token", value: board.grantTokenPresent ? "present" : "missing" }
      ])
    },
    {
      label: "Boundary And Scope",
      value: renderValuePills([
        { label: "role bundle", value: board.roleBundle },
        { label: "boundary", value: board.firstBoundaryRequirement },
        { label: "surface", value: board.firstDecisionSurface },
        { label: "input", value: board.firstRequiredInput }
      ])
    },
    {
      label: "Linked Context",
      value: renderValuePills([
        { label: "approval", value: board.approvalId, code: true },
        { label: "run", value: board.runId, code: true },
        { label: "request", value: board.requestId, code: true },
        { label: "reason", value: board.reason }
      ])
    },
    {
      label: "Timing",
      value: renderValuePills([
        { label: "reviewed", value: board.reviewedAt, code: true },
        { label: "expires", value: board.expiresAt, code: true },
        { label: "break-glass bundles", value: String(board.breakGlassBundleCount || 0) },
        { label: "exception count", value: String(board.exceptionCount || 0) }
      ])
    }
  ];

  return `
    <article class="metric governanceops-card" data-domain-root="governanceops" data-governanceops-panel="override-exception-posture">
      <div class="metric-title-row">
        <div class="title">Override And Exception Posture</div>
        <span class="${governanceToneChipClass(board.postureTone)}">${escapeHTML(board.postureState)}</span>
      </div>
      <div class="governanceops-chip-row">
        <span class="chip chip-neutral chip-compact">source=${escapeHTML(board.source)}</span>
        <span class="chip chip-neutral chip-compact">exceptions=${escapeHTML(String(board.exceptionCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">overlays=${escapeHTML(String(board.overlayCount || 0))}</span>
        <span class="chip chip-neutral chip-compact">grant=${escapeHTML(board.grantTokenPresent ? "present" : "missing")}</span>
      </div>
      <div class="governanceops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

export function renderGovernanceWorkspace(context = {}) {
  const snapshot = createGovernanceWorkspaceSnapshot(context);
  return `
    <section class="governanceops-workspace" data-domain-root="governanceops">
      ${renderOperationalFeedback(snapshot)}
      ${renderAimxsDecisionBindingSpineBoard(snapshot)}
      ${renderAdminProposalReviewBoard(snapshot)}
      ${renderActionReviewBoard(snapshot)}
      <div class="governanceops-primary-grid">
        ${renderConnectorApprovalsBoard(snapshot)}
        ${renderApprovalQueueBoard(snapshot)}
        ${renderAuthorityLadderBoard(snapshot)}
        ${renderDecisionReceiptBoard(snapshot)}
        ${renderDelegationAndEscalationBoard(snapshot)}
        ${renderOverrideAndExceptionPostureBoard(snapshot)}
      </div>
    </section>
  `;
}
