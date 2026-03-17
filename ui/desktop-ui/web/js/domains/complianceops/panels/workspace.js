import { escapeHTML, formatTime, renderPanelStateMetric } from "../../../views/common.js";
import { createComplianceWorkspaceSnapshot } from "../state.js";

function chipClassForTone(value) {
  const tone = String(value || "").trim().toLowerCase();
  if (tone === "ok") {
    return "chip chip-ok chip-compact";
  }
  if (tone === "warn") {
    return "chip chip-warn chip-compact";
  }
  if (tone === "danger" || tone === "error") {
    return "chip chip-danger chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function renderValuePills(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const value = String(item?.value || "").trim();
      if (!label || !value) {
        return "";
      }
      return `
        <span class="complianceops-value-pill">
          <span class="complianceops-value-key">${escapeHTML(label)}</span>
          <span class="complianceops-value-text${item?.code ? " complianceops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="complianceops-empty">not available</span>';
  }
  return `<div class="complianceops-value-group">${values.join("")}</div>`;
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
        <div class="complianceops-row">
          <div class="complianceops-row-label">${escapeHTML(label)}</div>
          <div class="complianceops-row-value">${value || '<span class="complianceops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderSelectOptions(options = [], selectedValue = "", placeholder = "") {
  const values = (Array.isArray(options) ? options : [])
    .map((item) => {
      const value = String(item?.value || "").trim();
      const label = String(item?.label || value).trim();
      if (!value) {
        return "";
      }
      return `<option value="${escapeHTML(value)}"${value === selectedValue ? " selected" : ""}>${escapeHTML(label)}</option>`;
    })
    .filter(Boolean)
    .join("");
  return `${placeholder ? `<option value="">${escapeHTML(placeholder)}</option>` : ""}${values}`;
}

function renderFeedbackPanel(snapshot) {
  const feedback = snapshot?.admin?.feedback;
  if (!feedback?.message) {
    return "";
  }
  const tone = String(feedback.tone || "info").trim().toLowerCase();
  const state =
    tone === "ok"
      ? "success"
      : tone === "error"
        ? "error"
        : tone === "warn"
          ? "warn"
          : "info";
  const title =
    tone === "ok"
      ? "ComplianceOps Action Complete"
      : tone === "error"
        ? "ComplianceOps Action Failed"
        : tone === "warn"
          ? "ComplianceOps Action Needs Review"
          : "ComplianceOps Action";
  return `
    <div class="complianceops-feedback-panel">
      ${renderPanelStateMetric(state, title, feedback.message)}
    </div>
  `;
}

function complianceAdminStatusChipClass(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "applied" || normalized === "renewed") {
    return "chip chip-ok chip-compact";
  }
  if (normalized === "rolled_back" || normalized === "expired") {
    return "chip chip-warn chip-compact";
  }
  if (normalized === "denied") {
    return "chip chip-danger chip-compact";
  }
  if (normalized === "deferred" || normalized === "escalated" || normalized === "routed" || normalized === "simulated") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function renderComplianceAdminActionRow(changeId = "") {
  const attrs = changeId ? ` data-complianceops-admin-id="${escapeHTML(changeId)}"` : "";
  return `
    <div class="complianceops-action-row">
      <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="save-draft"${attrs}>Save Draft</button>
      <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="simulate-draft"${attrs}>Run Dry-Run</button>
      <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="route-draft"${attrs}>Route To Governance</button>
    </div>
  `;
}

function renderAdminChangeQueueBoard(snapshot) {
  const admin = snapshot.admin || {};
  const items = Array.isArray(admin.queueItems) ? admin.queueItems : [];
  const selectedChangeId = String(admin.selectedChangeId || "").trim();
  const queueMarkup =
    items.length > 0
      ? items
          .map((item) => {
            const id = String(item?.id || "").trim();
            if (!id) {
              return "";
            }
            const normalizedStatus = String(item?.status || "").trim().toLowerCase();
            const shouldOpenGovernance =
              normalizedStatus === "routed" ||
              normalizedStatus === "approved" ||
              normalizedStatus === "applied" ||
              normalizedStatus === "denied" ||
              normalizedStatus === "deferred" ||
              normalizedStatus === "escalated";
            return `
              <article class="complianceops-queue-card">
                <div class="metric-title-row">
                  <div class="title"><code>${escapeHTML(id)}</code></div>
                  <span class="${complianceAdminStatusChipClass(item?.status)}">${escapeHTML(String(item?.status || "draft").trim() || "draft")}</span>
                </div>
                <div class="complianceops-chip-row">
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.changeKind || "attestation").trim() || "attestation")}</span>
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.subjectId || "-").trim() || "-")}</span>
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.controlBoundary || "-").trim() || "-")}</span>
                </div>
                <div class="complianceops-kv-list">
                  ${renderKeyValueRows([
                    {
                      label: "Draft Scope",
                      value: renderValuePills([
                        { label: item?.subjectLabel || "proposal", value: String(item?.subjectId || "-").trim() || "-", code: true },
                        { label: item?.targetLabel || "scope", value: String(item?.targetScope || "-").trim() || "-", code: true },
                        { label: "boundary", value: String(item?.controlBoundary || "-").trim() || "-" },
                        { label: "updated", value: String(item?.updatedAt || "-").trim() || "-" }
                      ])
                    },
                    {
                      label: "Reason",
                      value: escapeHTML(String(item?.reason || "").trim() || "-")
                    },
                    {
                      label: "Dry-Run",
                      value: escapeHTML(String(item?.simulationSummary || "").trim() || "pending")
                    },
                    {
                      label: "Governance",
                      value: renderValuePills([
                        { label: "decision", value: String(item?.decision?.status || "-").trim() || "-" },
                        {
                          label: "approval receipt",
                          value: String(item?.decision?.approvalReceiptId || "-").trim() || "-",
                          code: true
                        },
                        {
                          label: "admin receipt",
                          value: String(item?.receipt?.receiptId || "-").trim() || "-",
                          code: true
                        }
                      ])
                    }
                  ])}
                </div>
                <div class="complianceops-action-row">
                  <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="select-queue-item" data-complianceops-admin-id="${escapeHTML(id)}">Select Proposal</button>
                  <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="simulate-queue-item" data-complianceops-admin-id="${escapeHTML(id)}">Refresh Dry-Run</button>
                  <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="${shouldOpenGovernance ? "open-governance" : "route-queue-item"}" data-complianceops-admin-id="${escapeHTML(id)}">${shouldOpenGovernance ? "Open GovernanceOps" : "Route To Governance"}</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `
          <div class="complianceops-kv-list">
            <div class="complianceops-row">
              <div class="complianceops-row-label">Status</div>
              <div class="complianceops-row-value"><span class="complianceops-empty">No compliance admin proposal is queued yet.</span></div>
            </div>
          </div>
        `;

  return `
    <article class="metric complianceops-card complianceops-card-wide" data-domain-root="complianceops" data-complianceops-panel="admin-change-queue">
      <div class="metric-title-row">
        <div class="title">Admin Change Queue</div>
        <span class="chip chip-neutral chip-compact">apply-gated</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">queued=${escapeHTML(String(items.length))}</span>
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(selectedChangeId || "none")}</span>
      </div>
      <div class="complianceops-queue-grid">${queueMarkup}</div>
    </article>
  `;
}

function renderAttestationExceptionDraftBoard(snapshot) {
  const admin = snapshot.admin || {};
  const draft = admin.draft || {};
  const currentScope = admin.currentScope || {};
  const selectedChangeId = String(admin.selectedChangeId || "").trim();
  const isException = String(draft.changeKind || "").trim().toLowerCase() === "exception";
  const subjectOptions = isException ? currentScope.exceptionOptions : currentScope.attestationOptions;
  const subjectLabel = isException ? "Exception Profile" : "Attestation Candidate";

  return `
    <article class="metric complianceops-card complianceops-card-wide" data-domain-root="complianceops" data-complianceops-panel="attestation-exception-draft">
      <div class="metric-title-row">
        <div class="title">Attestation And Exception Draft</div>
        <span class="${complianceAdminStatusChipClass(admin.selectedQueueItem?.status || "draft")}">${escapeHTML(admin.selectedQueueItem?.status || "draft")}</span>
      </div>
      ${renderComplianceAdminActionRow(selectedChangeId)}
      <div class="complianceops-admin-form">
        <label class="field">
          <span class="label">Change Kind</span>
          <select class="filter-input" data-complianceops-draft-field="changeKind">
            <option value="attestation"${draft.changeKind === "attestation" ? " selected" : ""}>Attestation Proposal</option>
            <option value="exception"${draft.changeKind === "exception" ? " selected" : ""}>Exception Proposal</option>
          </select>
        </label>
        <label class="field">
          <span class="label">${escapeHTML(subjectLabel)}</span>
          <select class="filter-input" data-complianceops-draft-field="subjectId">
            ${renderSelectOptions(subjectOptions, draft.subjectId, isException ? "Select a bounded exception profile" : "Select a bounded attestation candidate")}
          </select>
        </label>
        <label class="field">
          <span class="label">Target Scope</span>
          <select class="filter-input" data-complianceops-draft-field="targetScope">
            ${renderSelectOptions(currentScope.targetScopeOptions, draft.targetScope, "Select a loaded compliance scope")}
          </select>
        </label>
        <label class="field">
          <span class="label">Control Boundary</span>
          <select class="filter-input" data-complianceops-draft-field="controlBoundary">
            ${renderSelectOptions(currentScope.controlBoundaryOptions, draft.controlBoundary, "Select a bounded control boundary")}
          </select>
        </label>
        <label class="field complianceops-field-wide">
          <span class="label">Reason</span>
          <textarea class="composer-textarea" rows="3" data-complianceops-draft-field="reason">${escapeHTML(draft.reason || "")}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renderControlScopeBoundaryBoard(snapshot) {
  const admin = snapshot.admin || {};
  const draft = admin.draft || {};
  const currentScope = admin.currentScope || {};
  return `
    <article class="metric complianceops-card" data-domain-root="complianceops" data-complianceops-panel="control-scope-obligation-boundary">
      <div class="metric-title-row">
        <div class="title">Control Scope And Obligation Boundary</div>
        <span class="chip chip-neutral chip-compact">bounded target</span>
      </div>
      <div class="complianceops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Current Scope",
            value: renderValuePills([
              { label: "scope", value: currentScope.targetScope || "-", code: true },
              { label: "boundary", value: currentScope.controlBoundary || "-", code: true },
              { label: "latest run", value: currentScope.latestRunId || "-", code: true },
              { label: "coverage", value: currentScope.latestCoverageStatus || "-" }
            ])
          },
          {
            label: "Draft Boundary",
            value: renderValuePills([
              { label: "change", value: draft.changeKind || "-" },
              { label: "proposal", value: draft.subjectId || "-", code: true },
              { label: "scope", value: draft.targetScope || "-", code: true },
              { label: "boundary", value: draft.controlBoundary || "-", code: true }
            ])
          },
          {
            label: "Control And Obligation Signals",
            value: renderValuePills([
              { label: "covered", value: String(currentScope.coveredCount || 0) },
              { label: "blocked", value: String(currentScope.blockedCount || 0) },
              { label: "gaps", value: String(currentScope.gapCount || 0) },
              { label: "pending approvals", value: String(currentScope.pendingApprovalCount || 0) }
            ])
          },
          {
            label: "Disclosure And Exceptions",
            value: renderValuePills([
              { label: "evidence linked", value: String(currentScope.evidenceLinkedCount || 0) },
              { label: "export profiles", value: String(currentScope.exportProfileCount || 0) },
              { label: "residency", value: String(currentScope.residencyExceptionCount || 0) },
              { label: "legal hold", value: String(currentScope.legalHoldExceptionCount || 0) }
            ])
          },
          {
            label: "Linked Boundaries",
            value: renderValuePills([
              { label: "audience", value: currentScope.firstAudience || "-", code: true },
              { label: "redaction", value: currentScope.firstRedactionMode || "-" },
              { label: "surface", value: currentScope.firstDecisionSurface || "-" },
              { label: "boundary req", value: currentScope.firstBoundaryRequirement || "-" }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

function renderImpactPreviewBoard(snapshot) {
  const simulation = snapshot?.admin?.latestSimulation;
  const selectedChangeId = String(snapshot?.admin?.selectedChangeId || "").trim();
  if (!simulation) {
    return `
      <article class="metric complianceops-card" data-domain-root="complianceops" data-complianceops-panel="impact-preview">
        <div class="metric-title-row">
          <div class="title">Impact Preview</div>
          <span class="chip chip-neutral chip-compact">dry-run pending</span>
        </div>
        <div class="complianceops-kv-list">
          <div class="complianceops-row">
            <div class="complianceops-row-label">Preview</div>
            <div class="complianceops-row-value"><span class="complianceops-empty">Run a bounded dry-run from the active compliance draft before routing it to GovernanceOps.</span></div>
          </div>
        </div>
      </article>
    `;
  }
  const findings = Array.isArray(simulation.findings) ? simulation.findings : [];
  return `
    <article class="metric complianceops-card" data-domain-root="complianceops" data-complianceops-panel="impact-preview">
      <div class="metric-title-row">
        <div class="title">Impact Preview</div>
        <span class="${chipClassForTone(simulation.tone)}">${escapeHTML(simulation.tone || "info")}</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(simulation.kind || "compliance")}</span>
        <span class="chip chip-neutral chip-compact">proposal=${escapeHTML(simulation.changeId || "pending")}</span>
      </div>
      <div class="complianceops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Dry-Run Summary",
            value: escapeHTML(simulation.summary || "-")
          },
          {
            label: "Impact Facts",
            value: renderValuePills(simulation.facts || [])
          },
          {
            label: "Updated",
            value: escapeHTML(String(simulation.updatedAt || "").trim() || "-")
          }
        ])}
      </div>
      <div class="complianceops-subsection">
        <div class="complianceops-subtitle">Findings</div>
        ${
          findings.length > 0
            ? `<ul class="complianceops-findings-list">${findings.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`
            : '<div class="complianceops-empty">No bounded findings were produced.</div>'
        }
      </div>
      <div class="complianceops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="open-governance"${selectedChangeId ? ` data-complianceops-admin-id="${escapeHTML(selectedChangeId)}"` : ""}>Open GovernanceOps</button>
      </div>
    </article>
  `;
}

function renderGovernanceRouteReceiptBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric complianceops-card complianceops-card-wide" data-domain-root="complianceops" data-complianceops-panel="governance-route-receipt">
        <div class="metric-title-row">
          <div class="title">Governance Route And Receipt</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="complianceops-kv-list">
          <div class="complianceops-row">
            <div class="complianceops-row-label">Status</div>
            <div class="complianceops-row-value"><span class="complianceops-empty">Select or queue a compliance admin proposal to review governance status, apply posture, and receipt state.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const decision = item?.decision && typeof item.decision === "object" ? item.decision : null;
  const execution = item?.execution && typeof item.execution === "object" ? item.execution : null;
  const receipt = item?.receipt && typeof item.receipt === "object" ? item.receipt : null;
  const status = String(item?.status || "").trim().toLowerCase() || "draft";
  const canApply = status === "approved" && Boolean(decision?.approvalReceiptId) && !receipt?.receiptId;
  return `
    <article class="metric complianceops-card complianceops-card-wide" data-domain-root="complianceops" data-complianceops-panel="governance-route-receipt">
      <div class="metric-title-row">
        <div class="title">Governance Route And Receipt</div>
        <span class="${complianceAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(String(item?.id || "").trim() || "-")}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(String(item?.kind || "compliance").trim() || "compliance")}</span>
        ${decision?.approvalReceiptId ? '<span class="chip chip-ok chip-compact">approval receipt</span>' : '<span class="chip chip-neutral chip-compact">decision pending</span>'}
        ${receipt?.receiptId ? '<span class="chip chip-ok chip-compact">admin receipt</span>' : '<span class="chip chip-neutral chip-compact">apply pending</span>'}
      </div>
      <div class="complianceops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Route Status",
            value: renderValuePills([
              { label: "routed", value: String(item?.routedAt || "-").trim() || "-" },
              { label: "summary", value: String(item?.summary || "-").trim() || "-" },
              { label: "simulation", value: String(item?.simulationSummary || "-").trim() || "-" }
            ])
          },
          {
            label: "Governance Decision",
            value: renderValuePills([
              { label: "decision", value: String(decision?.status || "-").trim() || "-" },
              { label: "decision id", value: String(decision?.decisionId || "-").trim() || "-", code: true },
              { label: "approval receipt", value: String(decision?.approvalReceiptId || "-").trim() || "-", code: true },
              { label: "decided", value: String(decision?.decidedAt || "-").trim() || "-" }
            ])
          },
          {
            label: "Decision Reason",
            value: escapeHTML(String(decision?.reason || item?.reason || "").trim() || "-")
          },
          {
            label: "Execution",
            value: renderValuePills([
              { label: "execution", value: String(execution?.executionId || "-").trim() || "-", code: true },
              { label: "status", value: String(execution?.status || "-").trim() || "-" },
              { label: "executed", value: String(execution?.executedAt || "-").trim() || "-" },
              { label: "actor", value: String(execution?.actorRef || "-").trim() || "-", code: true }
            ])
          },
          {
            label: "Admin Receipt",
            value: renderValuePills([
              { label: "receipt", value: String(receipt?.receiptId || "-").trim() || "-", code: true },
              { label: "issued", value: String(receipt?.issuedAt || "-").trim() || "-" },
              { label: "stable ref", value: String(receipt?.stableRef || "-").trim() || "-", code: true },
              { label: "approval receipt", value: String(receipt?.approvalReceiptId || "-").trim() || "-", code: true }
            ])
          }
        ])}
      </div>
      <div class="complianceops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="open-governance" data-complianceops-admin-id="${escapeHTML(String(item.id || "").trim())}">Open GovernanceOps</button>
        <button class="btn btn-ok btn-small" type="button" data-complianceops-admin-action="apply-approved-change" data-complianceops-admin-id="${escapeHTML(String(item.id || "").trim())}"${canApply ? "" : " disabled"}>Apply Approved Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="copy-governance-receipt" data-complianceops-admin-id="${escapeHTML(String(item.id || "").trim())}"${decision?.approvalReceiptId ? "" : " disabled"}>Copy Governance Receipt</button>
        <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="copy-admin-receipt" data-complianceops-admin-id="${escapeHTML(String(item.id || "").trim())}"${receipt?.receiptId ? "" : " disabled"}>Copy Admin Receipt</button>
      </div>
    </article>
  `;
}

function renderExpiryHistoryBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric complianceops-card complianceops-card-wide" data-domain-root="complianceops" data-complianceops-panel="expiry-history">
        <div class="metric-title-row">
          <div class="title">Expiry And History</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="complianceops-kv-list">
          <div class="complianceops-row">
            <div class="complianceops-row-label">Status</div>
            <div class="complianceops-row-value"><span class="complianceops-empty">Select an applied compliance admin proposal to review expiry posture, bounded history, and renewal controls.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const decision = item?.decision && typeof item.decision === "object" ? item.decision : null;
  const execution = item?.execution && typeof item.execution === "object" ? item.execution : null;
  const receipt = item?.receipt && typeof item.receipt === "object" ? item.receipt : null;
  const rollback = item?.rollback && typeof item.rollback === "object" ? item.rollback : null;
  const status = String(item?.status || "").trim().toLowerCase() || "draft";
  const canExpire = status === "applied" && Boolean(receipt?.receiptId) && !rollback?.rollbackId;
  const canRenew =
    status === "expired" &&
    Boolean(rollback?.rollbackId) &&
    String(rollback?.action || "").trim().toLowerCase() === "expiry";
  const recoveryReason = String(snapshot?.admin?.recoveryReason || "").trim();
  const historyItems = [
    {
      label: "Proposal",
      at: item.createdAt || item.updatedAt,
      summary: item.summary
    },
    {
      label: "Dry-Run",
      at: item.simulatedAt,
      summary: item.simulationSummary
    },
    {
      label: "Governance Route",
      at: item.routedAt,
      summary: item.routedAt ? "Routed to GovernanceOps." : ""
    },
    {
      label: "Governance Decision",
      at: decision?.decidedAt,
      summary: decision?.status ? `${decision.status}: ${decision.reason || "-"}` : ""
    },
    {
      label: "Execution",
      at: execution?.executedAt,
      summary: execution?.summary
    },
    {
      label: "Admin Receipt",
      at: receipt?.issuedAt,
      summary: receipt?.stableRef
    },
    ...((Array.isArray(item?.history) ? item.history : []).map((entry) => ({
      label: String(entry?.label || "History").trim() || "History",
      at: String(entry?.at || "").trim(),
      summary: String(entry?.summary || "").trim()
    }))),
    ...(!Array.isArray(item?.history) || item.history.length === 0
      ? [
          {
            label:
              String(rollback?.action || "").trim().toLowerCase() === "renew"
                ? "Renewal"
                : String(rollback?.action || "").trim().toLowerCase() === "expiry"
                  ? "Expiry"
                  : "Recovery",
            at: rollback?.rolledBackAt,
            summary: rollback?.summary
          }
        ]
      : [])
  ].filter((entry) => entry.at || entry.summary);
  const historyMarkup =
    historyItems.length > 0
      ? `<div class="complianceops-history-list">${historyItems
          .map(
            (entry) => `
              <div class="complianceops-history-item">
                <div class="complianceops-history-stage">${escapeHTML(entry.label)}</div>
                <div class="complianceops-history-time">${escapeHTML(entry.at || "-")}</div>
                <div class="complianceops-history-summary">${escapeHTML(entry.summary || "-")}</div>
              </div>
            `
          )
          .join("")}</div>`
      : '<div class="complianceops-empty">No bounded compliance history is available yet.</div>';

  return `
    <article class="metric complianceops-card complianceops-card-wide" data-domain-root="complianceops" data-complianceops-panel="expiry-history">
      <div class="metric-title-row">
        <div class="title">Expiry And History</div>
        <span class="${complianceAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(String(item?.id || "").trim() || "-")}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(String(item?.kind || "compliance").trim() || "compliance")}</span>
        ${
          rollback?.rollbackId
            ? `<span class="${complianceAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "recovery")}</span>`
            : `<span class="chip chip-neutral chip-compact">${escapeHTML(canExpire ? "expiry available" : canRenew ? "renewal available" : "recovery pending")}</span>`
        }
      </div>
      <div class="complianceops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Recovery Posture",
            value: renderValuePills([
              { label: "state", value: rollback?.status || (canRenew ? "renewal available" : canExpire ? "expiry available" : "recovery pending") },
              { label: "action", value: rollback?.action || (canRenew ? "renew" : canExpire ? "expiry" : "") },
              { label: "record", value: rollback?.rollbackId, code: true },
              { label: "stable ref", value: rollback?.stableRef, code: true }
            ])
          },
          {
            label: "Recovery Reason",
            value: rollback?.reason ? escapeHTML(rollback.reason) : '<span class="complianceops-empty">A bounded reason is required before expiry or renewal can execute.</span>'
          },
          {
            label: "Stable History",
            value: historyMarkup
          }
        ])}
      </div>
      <label class="field complianceops-field-wide">
        <span class="label">Expiry Or Renewal Reason</span>
        <input
          class="filter-input"
          type="text"
          value="${escapeHTML(recoveryReason)}"
          placeholder="required; explain the expiry or renewal action"
          data-complianceops-admin-recovery-reason
        />
      </label>
      <div class="complianceops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="expire-applied-change" data-complianceops-admin-id="${escapeHTML(String(item?.id || "").trim() || "")}"${canExpire ? "" : " disabled"}>Expire Applied Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="renew-expired-change" data-complianceops-admin-id="${escapeHTML(String(item?.id || "").trim() || "")}"${canRenew ? "" : " disabled"}>Renew Expired Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-complianceops-admin-action="copy-recovery-receipt" data-complianceops-admin-id="${escapeHTML(String(item?.id || "").trim() || "")}"${rollback?.rollbackId ? "" : " disabled"}>Copy Recovery Receipt</button>
      </div>
    </article>
  `;
}

function renderControlCoverageBoard(snapshot) {
  const board = snapshot.controlCoverageBoard;
  const latest = board.latestControl || {};
  const rows = [
    {
      label: "Coverage",
      value: renderValuePills([
        { label: "covered", value: String(board.coveredCount) },
        { label: "partial", value: String(board.partialCount) },
        { label: "blocked", value: String(board.blockedCount) },
        { label: "missing", value: String(board.missingCount) }
      ])
    },
    {
      label: "Latest Control",
      value: renderValuePills([
        { label: "run", value: latest.runId, code: true },
        { label: "boundary", value: latest.boundaryClass },
        { label: "risk", value: latest.riskTier },
        { label: "decision", value: latest.decision || "-" },
        { label: "updated", value: latest.updatedAt ? formatTime(latest.updatedAt) : "-" }
      ])
    },
    {
      label: "Linked Anchors",
      value: renderValuePills([
        { label: "scope", value: latest.scope, code: true },
        { label: "provider", value: latest.providerId, code: true },
        { label: "evidence", value: String(board.evidenceLinkedCount) },
        { label: "approvals", value: String(board.approvalScopedCount) }
      ])
    }
  ];
  return `
    <article class="metric complianceops-card" data-domain-root="complianceops" data-complianceops-panel="control-coverage-board">
      <div class="metric-title-row">
        <div class="title">Control Coverage Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">controls=${escapeHTML(String(board.totalCount))}</span>
        <span class="chip chip-neutral chip-compact">boundaries=${escapeHTML(String(board.boundaryCount))}</span>
        <span class="chip chip-neutral chip-compact">riskTiers=${escapeHTML(String(board.riskTierCount))}</span>
      </div>
      <div class="complianceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="complianceops-subsection">
        <div class="complianceops-subtitle">Top Boundary Classes</div>
        ${renderValuePills((board.topBoundaries || []).map((item) => ({ label: item.value, value: String(item.count) })))}
      </div>
      <div class="complianceops-subsection">
        <div class="complianceops-subtitle">Top Risk Tiers</div>
        ${renderValuePills((board.topRiskTiers || []).map((item) => ({ label: item.value, value: String(item.count) })))}
      </div>
    </article>
  `;
}

function renderObligationBoard(snapshot) {
  const board = snapshot.obligationBoard;
  const latest = board.latestControl || {};
  const rows = [
    {
      label: "Material Obligations",
      value: renderValuePills([
        { label: "grant-scoped", value: String(board.grantScopedCount) },
        { label: "approval-scoped", value: String(board.approvalScopedCount) },
        { label: "pending approvals", value: String(board.pendingApprovalCount) },
        { label: "archived", value: String(board.archivedCount) }
      ])
    },
    {
      label: "Latest Obligation Anchor",
      value: renderValuePills([
        { label: "run", value: latest.runId, code: true },
        { label: "boundary", value: latest.boundaryClass },
        { label: "approval", value: latest.approvalId, code: true },
        { label: "evidence", value: latest.evidenceStatus },
        { label: "review", value: latest.approvalStatus },
        { label: "retention", value: latest.retentionClass }
      ])
    },
    {
      label: "Retention Defaults",
      value: renderValuePills([
        { label: "audit", value: `${board.retentionDefaults.auditEvents}d` },
        { label: "incident", value: `${board.retentionDefaults.incidentPackages}d` },
        { label: "run", value: `${board.retentionDefaults.runSnapshots}d` }
      ])
    }
  ];
  return `
    <article class="metric complianceops-card" data-domain-root="complianceops" data-complianceops-panel="obligation-board">
      <div class="metric-title-row">
        <div class="title">Obligation Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">controls=${escapeHTML(String(board.totalCount))}</span>
        <span class="chip chip-neutral chip-compact">grantScoped=${escapeHTML(String(board.grantScopedCount))}</span>
        <span class="chip chip-neutral chip-compact">approvalScoped=${escapeHTML(String(board.approvalScopedCount))}</span>
      </div>
      <div class="complianceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="complianceops-subsection">
        <div class="complianceops-subtitle">Top Required Grants</div>
        ${renderValuePills((board.topGrants || []).map((item) => ({ label: item.value, value: String(item.count), code: true })))}
      </div>
    </article>
  `;
}

function renderAttestationBoard(snapshot) {
  const board = snapshot.attestationBoard;
  const latest = board.latestControl || {};
  const rows = [
    {
      label: "Readiness",
      value: renderValuePills([
        { label: "ready", value: String(board.readyCount) },
        { label: "partial", value: String(board.partialCount) },
        { label: "blocked", value: String(board.blockedCount) },
        { label: "audit rows", value: String(board.auditEventCount) }
      ])
    },
    {
      label: "Latest Candidate",
      value: renderValuePills([
        { label: "run", value: latest.runId, code: true },
        { label: "scope", value: latest.scope, code: true },
        { label: "decision", value: latest.decision || "-" },
        { label: "provider", value: latest.providerId, code: true },
        { label: "bundle", value: latest.evidenceBundleId, code: true }
      ])
    },
    {
      label: "Environment Posture",
      value: renderValuePills([
        { label: "environment", value: board.environment },
        { label: "pipeline", value: board.pipelineStatus },
        { label: "aimxs", value: board.aimxsState },
        { label: "mode", value: board.activeMode },
        { label: "provider", value: board.selectedProviderId, code: true }
      ])
    },
    {
      label: "Linked Proof",
      value: renderValuePills([
        { label: "approvals", value: String(board.approvalApprovedCount) },
        { label: "evidence", value: String(board.evidenceLinkedCount) },
        { label: "latest audit", value: board.latestAudit.event, code: true },
        { label: "at", value: board.latestAudit.ts ? formatTime(board.latestAudit.ts) : "-" }
      ])
    }
  ];
  return `
    <article class="metric complianceops-card" data-domain-root="complianceops" data-complianceops-panel="attestation-board">
      <div class="metric-title-row">
        <div class="title">Attestation Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">candidates=${escapeHTML(String(board.candidateCount))}</span>
        <span class="chip chip-neutral chip-compact">staging=${escapeHTML(board.latestStagingGate || "-")}</span>
        <span class="chip chip-neutral chip-compact">prod=${escapeHTML(board.latestProdGate || "-")}</span>
      </div>
      <div class="complianceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="complianceops-subsection">
        <div class="complianceops-subtitle">Platform Status</div>
        ${renderValuePills([
          { label: "runtime", value: board.runtimeStatus },
          { label: "providers", value: board.providersStatus },
          { label: "policy", value: board.policyStatus }
        ])}
      </div>
    </article>
  `;
}

function renderGapExceptionBoard(snapshot) {
  const board = snapshot.gapExceptionBoard;
  const latest = board.latestGap || {};
  return `
    <article class="metric complianceops-card" data-domain-root="complianceops" data-complianceops-panel="gap-exception-board">
      <div class="metric-title-row">
        <div class="title">Gap And Exception Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">gaps=${escapeHTML(String(board.gapCount))}</span>
        <span class="chip chip-neutral chip-compact">exceptions=${escapeHTML(String(board.exceptionProfileCount))}</span>
        <span class="chip chip-neutral chip-compact">pending=${escapeHTML(String(board.pendingApprovalCount))}</span>
      </div>
      <div class="complianceops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Gap Posture",
            value: renderValuePills([
              { label: "blocked", value: String(board.blockedCount) },
              { label: "partial", value: String(board.partialCount) },
              { label: "missing", value: String(board.missingCount) },
              { label: "pending approvals", value: String(board.pendingApprovalCount) }
            ])
          },
          {
            label: "Latest Gap Anchor",
            value: renderValuePills([
              { label: "run", value: latest.runId, code: true },
              { label: "boundary", value: latest.boundaryClass },
              { label: "decision", value: latest.decision || "-" },
              { label: "approval", value: latest.approvalStatus },
              { label: "coverage", value: latest.coverageStatus }
            ])
          },
          {
            label: "Latest Exception",
            value: renderValuePills([
              { label: "label", value: board.latestException.label || "-" },
              { label: "category", value: board.latestException.category || "-" },
              { label: "mode", value: board.latestException.exceptionMode || "-" },
              { label: "surface", value: board.firstDecisionSurface }
            ])
          },
          {
            label: "Boundary Inputs",
            value: renderValuePills([
              { label: "requirement", value: board.firstBoundaryRequirement },
              { label: "inputs", value: String(board.requiredInputCount) },
              { label: "first input", value: board.firstRequiredInput, code: true }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

function renderRetentionDisclosureBoard(snapshot) {
  const board = snapshot.retentionDisclosureBoard;
  const latest = board.latestControl || {};
  return `
    <article class="metric complianceops-card" data-domain-root="complianceops" data-complianceops-panel="retention-disclosure-board">
      <div class="metric-title-row">
        <div class="title">Retention And Disclosure Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="complianceops-chip-row">
        <span class="chip chip-neutral chip-compact">profiles=${escapeHTML(String(board.exportProfileCount))}</span>
        <span class="chip chip-neutral chip-compact">audiences=${escapeHTML(String(board.allowedAudienceCount))}</span>
        <span class="chip chip-neutral chip-compact">archiveOverlays=${escapeHTML(String(board.archiveOverlayCount))}</span>
      </div>
      <div class="complianceops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Retention Posture",
            value: renderValuePills([
              { label: "archive", value: String(board.archiveCount) },
              { label: "standard", value: String(board.standardCount) },
              { label: "short", value: String(board.shortCount) },
              { label: "run default", value: `${board.retentionDefaults.runSnapshots}d` }
            ])
          },
          {
            label: "Latest Disclosure Anchor",
            value: renderValuePills([
              { label: "run", value: latest.runId, code: true },
              { label: "scope", value: latest.scope, code: true },
              { label: "retention", value: latest.retentionClass },
              { label: "evidence", value: latest.evidenceStatus },
              { label: "approval", value: latest.approvalStatus }
            ])
          },
          {
            label: "Desktop Export Profiles",
            value: renderValuePills([
              { label: "profile", value: board.firstProfileLabel },
              { label: "audience", value: board.firstAudience, code: true },
              { label: "redaction", value: board.firstRedactionMode },
              { label: "archive overlays", value: String(board.archiveOverlayCount) }
            ])
          },
          {
            label: "Allowed Audiences",
            value: renderValuePills(
              (board.allowedAudiences || []).map((value) => ({
                label: "audience",
                value,
                code: true
              }))
            )
          },
          {
            label: "Disclosure Exceptions",
            value: renderValuePills([
              { label: "residency", value: String(board.residencyExceptionCount) },
              { label: "legal hold", value: String(board.legalHoldExceptionCount) },
              { label: "surface", value: board.firstDecisionSurface },
              { label: "boundary", value: board.firstBoundaryRequirement }
            ])
          }
        ])}
      </div>
    </article>
  `;
}

export function renderComplianceWorkspace(context = {}) {
  const snapshot = createComplianceWorkspaceSnapshot(context);
  return `
    <section class="complianceops-workspace" data-domain-root="complianceops">
      ${renderFeedbackPanel(snapshot)}
      <div class="complianceops-admin-grid">
        ${renderAdminChangeQueueBoard(snapshot)}
        ${renderAttestationExceptionDraftBoard(snapshot)}
        ${renderControlScopeBoundaryBoard(snapshot)}
        ${renderImpactPreviewBoard(snapshot)}
        ${renderGovernanceRouteReceiptBoard(snapshot)}
        ${renderExpiryHistoryBoard(snapshot)}
      </div>
      <div class="complianceops-primary-grid">
        ${renderControlCoverageBoard(snapshot)}
        ${renderObligationBoard(snapshot)}
        ${renderAttestationBoard(snapshot)}
        ${renderGapExceptionBoard(snapshot)}
        ${renderRetentionDisclosureBoard(snapshot)}
      </div>
    </section>
  `;
}
