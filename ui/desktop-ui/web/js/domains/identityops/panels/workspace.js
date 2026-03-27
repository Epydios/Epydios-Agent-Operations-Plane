import { escapeHTML } from "../../../views/common.js";
import { renderAimxsIdentityPostureBlock } from "../../../shared/components/aimxs-identity-posture.js";
import { createIdentityWorkspaceSnapshot } from "../state.js";
import { renderEffectiveIdentityBoard } from "./auth-summary.js";
import { renderAuthorityBoard } from "./authority.js";
import { renderScopeBoard } from "./scope.js";
import { renderGrantEntitlementBoard } from "./grants.js";

function normalizeList(items = []) {
  const values = Array.isArray(items)
    ? items.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return values;
}

function identityAdminStatusChipClass(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "applied") {
    return "chip chip-ok chip-compact";
  }
  if (normalized === "rolled_back" || normalized === "expired") {
    return "chip chip-warn chip-compact";
  }
  if (normalized === "denied") {
    return "chip chip-danger chip-compact";
  }
  if (normalized === "deferred" || normalized === "escalated" || normalized === "routed") {
    return "chip chip-warn chip-compact";
  }
  return "chip chip-neutral chip-compact";
}

function renderValuePills(items = []) {
  const values = Array.isArray(items)
    ? items
        .map((item) => {
          const label = String(item?.label || "").trim();
          const value = String(item?.value || "").trim();
          if (!label || !value) {
            return "";
          }
          return `
            <span class="identityops-value-pill">
              <span class="identityops-value-key">${escapeHTML(label)}</span>
              <span class="identityops-value-text${item?.code ? " identityops-value-text-code" : ""}">
                ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
              </span>
            </span>
          `;
        })
        .filter(Boolean)
    : [];
  if (values.length === 0) {
    return '<span class="identityops-empty">not available</span>';
  }
  return `<div class="identityops-value-group">${values.join("")}</div>`;
}

function renderKeyValueRows(rows = []) {
  return rows
    .map((row) => {
      const label = String(row?.label || "").trim();
      const value = String(row?.value || "").trim();
      if (!label) {
        return "";
      }
      return `
        <div class="identityops-row">
          <div class="identityops-row-label">${escapeHTML(label)}</div>
          <div class="identityops-row-value">${value || '<span class="identityops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderIdentityNetworkBoard(snapshot) {
  const latestRun = snapshot.traceLatestRun || {};
  const latestApproval = snapshot.traceLatestApproval || {};
  const latestAudit = snapshot.traceLatestAudit || {};
  const linkedObjects = new Set(
    [
      latestRun.runId ? `run:${latestRun.runId}` : "",
      latestApproval.approvalId ? `approval:${latestApproval.approvalId}` : "",
      latestAudit.providerId ? `policy:${latestAudit.providerId}` : "",
      latestRun.selectedEvidenceProvider ? `evidence:${latestRun.selectedEvidenceProvider}` : ""
    ].filter(Boolean)
  );
  const relationshipRows = [
    {
      label: "Actor",
      value: renderValuePills([{ label: "subject", value: snapshot.subject, code: true }])
    },
    {
      label: "Workload",
      value: renderValuePills([{ label: "client", value: snapshot.clientId, code: true }])
    },
    {
      label: "Scope Chain",
      value: renderValuePills([
        { label: "tenant", value: normalizeList(snapshot.tenantIds).join(", "), code: true },
        { label: "project", value: normalizeList(snapshot.projectIds).join(", "), code: true },
        { label: "environment", value: snapshot.environment }
      ])
    },
    {
      label: "Current Run",
      value: renderValuePills([
        { label: "run", value: latestRun.runId, code: true },
        { label: "request", value: latestRun.requestId, code: true },
        { label: "project", value: latestRun.projectId, code: true },
        { label: "environment", value: latestRun.environment }
      ])
    },
    {
      label: "Approval Link",
      value: renderValuePills([
        { label: "approval", value: latestApproval.approvalId, code: true },
        { label: "run", value: latestApproval.runId, code: true },
        { label: "status", value: latestApproval.status },
        { label: "target", value: latestApproval.targetExecutionProfile, code: true }
      ])
    },
    {
      label: "Provider Relations",
      value: renderValuePills([
        { label: "policy", value: latestAudit.providerId, code: true },
        { label: "evidence", value: latestRun.selectedEvidenceProvider, code: true },
        { label: "identity", value: snapshot.source, code: true }
      ])
    },
    {
      label: "Claim Basis",
      value: renderValuePills([
        { label: "roles", value: snapshot.roleClaim, code: true },
        { label: "client", value: snapshot.clientIdClaim, code: true },
        { label: "tenant", value: snapshot.tenantClaim, code: true },
        { label: "project", value: snapshot.projectClaim, code: true }
      ])
    }
  ];
  return `
    <article class="metric identityops-card identityops-card-secondary" data-domain-root="identityops" data-identityops-panel="identity-network">
      <div class="metric-title-row">
        <div class="title">Identity Network</div>
        <span class="chip chip-neutral chip-compact">direct relations</span>
      </div>
      <div class="identityops-chip-row">
        <span class="chip chip-neutral chip-compact">roles=${escapeHTML(String(snapshot.roles.length))}</span>
        <span class="chip chip-neutral chip-compact">tenants=${escapeHTML(String(snapshot.tenantIds.length))}</span>
        <span class="chip chip-neutral chip-compact">projects=${escapeHTML(String(snapshot.projectIds.length))}</span>
        <span class="chip chip-neutral chip-compact">links=${escapeHTML(String(linkedObjects.size))}</span>
      </div>
      <div class="identityops-kv-list">
        ${renderKeyValueRows(relationshipRows)}
      </div>
    </article>
  `;
}

function renderDelegationOverrideBoard(snapshot) {
  const latestRun = snapshot.traceLatestRun || {};
  const latestApproval = snapshot.traceLatestApproval || {};
  const postureTone = snapshot.policyMatrixRequired ? "chip chip-warn chip-compact" : "chip chip-neutral chip-compact";
  const postureLabel = snapshot.policyMatrixRequired ? "governance-backed" : "direct grant";
  const approvalActive = Boolean(latestApproval.approvalId || latestApproval.runId);
  const grantIssued = latestRun.policyGrantTokenPresent === true;
  const receiptState = approvalActive
    ? latestApproval.status
      ? String(latestApproval.status).trim().toLowerCase()
      : "linked"
    : grantIssued
      ? "granted"
      : "unavailable";
  const rows = [
    {
      label: "Authority Basis",
      value: renderValuePills([{ label: "basis", value: snapshot.authorityBasis, code: true }])
    },
    {
      label: "Policy Matrix",
      value: renderValuePills([
        {
          label: "required",
          value: snapshot.policyMatrixRequired ? "yes" : "no"
        },
        { label: "rules", value: String(snapshot.policyRuleCount) }
      ])
    },
    {
      label: "Resolved From Claims",
      value: renderValuePills([
        { label: "roles", value: snapshot.roleClaim, code: true },
        { label: "client", value: snapshot.clientIdClaim, code: true },
        { label: "tenant", value: snapshot.tenantClaim, code: true },
        { label: "project", value: snapshot.projectClaim, code: true }
      ])
    },
    {
      label: "Approval Link",
      value: renderValuePills([
        { label: "approval", value: latestApproval.approvalId, code: true },
        { label: "run", value: latestApproval.runId, code: true },
        { label: "status", value: latestApproval.status },
        { label: "tier", value: latestApproval.tier ? String(latestApproval.tier) : "" },
        { label: "target", value: latestApproval.targetExecutionProfile, code: true }
      ])
    },
    {
      label: "Grant Posture",
      value: renderValuePills([
        { label: "run", value: latestRun.runId, code: true },
        {
          label: "grant token",
          value: latestRun.runId ? (latestRun.policyGrantTokenPresent ? "present" : "missing") : ""
        },
        { label: "decision", value: latestRun.policyDecision }
      ])
    },
    {
      label: "Receipt State",
      value: renderValuePills([
        { label: "state", value: receiptState },
        { label: "reviewed", value: latestApproval.reviewedAt },
        { label: "expires", value: latestApproval.expiresAt }
      ])
    }
  ];
  return `
    <article class="metric identityops-card identityops-card-secondary" data-domain-root="identityops" data-identityops-panel="delegation-override-basis">
      <div class="metric-title-row">
        <div class="title">Delegation And Override Basis</div>
        <span class="${postureTone}">${escapeHTML(postureLabel)}</span>
      </div>
      <div class="identityops-chip-row">
        <span class="chip chip-neutral chip-compact">auth=${escapeHTML(String(snapshot.authenticated))}</span>
        <span class="chip chip-neutral chip-compact">claims=${escapeHTML(String(snapshot.claimKeys.length))}</span>
        <span class="chip chip-neutral chip-compact">approval=${escapeHTML(approvalActive ? "linked" : "none")}</span>
        <span class="chip chip-neutral chip-compact">grant=${escapeHTML(grantIssued ? "issued" : "pending")}</span>
      </div>
      <div class="identityops-kv-list">
        ${renderKeyValueRows(rows)}
      </div>
    </article>
  `;
}

function renderAimxsIdentityPostureBoard(snapshot) {
  const aimxsPremiumVisible = Boolean(snapshot?.aimxsPremiumVisible);
  return `
    <article class="metric identityops-card identityops-card-wide" data-domain-root="identityops" data-identityops-panel="aimxs-identity-posture">
      <div class="metric-title-row">
        <div class="title">${escapeHTML(aimxsPremiumVisible ? "AIMXS Identity And Posture" : "Identity And Posture")}</div>
        <span class="chip chip-ok chip-compact">primary</span>
      </div>
      ${renderAimxsIdentityPostureBlock(snapshot.aimxsIdentityPosture)}
    </article>
  `;
}

function renderTraceabilityBoard(snapshot) {
  const latestRun = snapshot.traceLatestRun || {};
  const latestApproval = snapshot.traceLatestApproval || {};
  const latestAudit = snapshot.traceLatestAudit || {};
  const rows = [
    {
      label: "Identity Snapshot",
      value: renderValuePills([
        { label: "source", value: snapshot.source, code: true },
        { label: "generated", value: snapshot.generatedAt }
      ])
    },
    {
      label: "Joined Sources",
      value: renderValuePills([
        { label: "runs", value: snapshot.dataSourceRuns, code: true },
        { label: "approvals", value: snapshot.dataSourceApprovals, code: true },
        { label: "audit", value: snapshot.dataSourceAudit, code: true }
      ])
    },
    {
      label: "Latest Run",
      value: renderValuePills([
        { label: "run", value: latestRun.runId, code: true },
        { label: "status", value: latestRun.status },
        { label: "decision", value: latestRun.policyDecision },
        { label: "updated", value: latestRun.updatedAt }
      ])
    },
    {
      label: "Approval Context",
      value: renderValuePills([
        { label: "approval", value: latestApproval.approvalId, code: true },
        { label: "run", value: latestApproval.runId, code: true },
        { label: "status", value: latestApproval.status },
        { label: "tier", value: latestApproval.tier ? String(latestApproval.tier) : "" }
      ])
    },
    {
      label: "Latest Audit",
      value: renderValuePills([
        { label: "event", value: latestAudit.event, code: true },
        { label: "provider", value: latestAudit.providerId, code: true },
        { label: "decision", value: latestAudit.decision },
        { label: "timestamp", value: latestAudit.ts }
      ])
    },
    {
      label: "Evidence Posture",
      value: renderValuePills([
        { label: "provider", value: latestRun.selectedEvidenceProvider, code: true },
        { label: "record", value: latestRun.evidenceRecordStatus || "summary-only" },
        { label: "bundle", value: latestRun.evidenceBundleStatus || "summary-only" },
        {
          label: "grant token",
          value: latestRun.runId ? (latestRun.policyGrantTokenPresent ? "present" : "missing") : ""
        }
      ])
    }
  ];
  return `
    <article class="metric identityops-card identityops-card-secondary" data-domain-root="identityops" data-identityops-panel="identity-traceability">
      <div class="metric-title-row">
        <div class="title">Identity Traceability</div>
        <span class="chip chip-neutral chip-compact">bounded anchors</span>
      </div>
      <div class="identityops-chip-row">
        <span class="chip chip-neutral chip-compact">claims=${escapeHTML(String(snapshot.claimKeys.length))}</span>
        <span class="chip chip-neutral chip-compact">runs=${escapeHTML(String(snapshot.traceRunCount))}</span>
        <span class="chip chip-neutral chip-compact">approvals=${escapeHTML(String(snapshot.traceApprovalCount))}</span>
        <span class="chip chip-neutral chip-compact">audit=${escapeHTML(String(snapshot.traceAuditCount))}</span>
      </div>
      <div class="identityops-kv-list">
        ${renderKeyValueRows(rows)}
      </div>
    </article>
  `;
}

function renderIdentityAdminFeedback(feedback = null) {
  if (!feedback?.message) {
    return "";
  }
  const tone = String(feedback.tone || "info").trim().toLowerCase() || "info";
  return `
    <div class="identityops-feedback-shell">
      <div class="metric identityops-card identityops-card-secondary identityops-feedback identityops-feedback-${escapeHTML(tone)}">
        <div class="metric-title-row">
          <div class="title">Admin Feedback</div>
          <span class="chip chip-neutral chip-compact">${escapeHTML(tone)}</span>
        </div>
        <p class="identityops-feedback-message">${escapeHTML(feedback.message)}</p>
      </div>
    </div>
  `;
}

function renderIdentityAdminActionRow(kind, options = {}) {
  const normalizedKind = String(kind || "").trim().toLowerCase();
  return `
    <div class="identityops-action-row">
      <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="save-draft" data-identityops-admin-kind="${escapeHTML(normalizedKind)}">Save Draft</button>
      <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="simulate-draft" data-identityops-admin-kind="${escapeHTML(normalizedKind)}">Run Simulation</button>
      <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="route-draft" data-identityops-admin-kind="${escapeHTML(normalizedKind)}"${options.routeDisabled ? " disabled" : ""}>Route To Governance</button>
    </div>
  `;
}

function renderIdentityAdminQueueBoard(snapshot) {
  const admin = snapshot.admin || {};
  const items = Array.isArray(admin.queueItems) ? admin.queueItems : [];
  const selectedChangeId = String(admin.selectedChangeId || "").trim();
  const queueMarkup =
    items.length > 0
      ? items
          .map((item) => {
            const label = String(item?.label || "").trim() || "Queued proposal";
            const id = String(item?.id || "").trim();
            const selected = id && id === selectedChangeId;
            const status = String(item?.status || "draft").trim().toLowerCase() || "draft";
            const decisionStatus = String(item?.decision?.status || "").trim().toLowerCase();
            const rollbackStatus = String(item?.rollback?.status || "").trim().toLowerCase();
            const canRoute = status === "simulated" || status === "routed" || status === "deferred" || status === "escalated";
            const routeActionLabel =
              status === "routed"
                ? "Open GovernanceOps"
                : status === "approved" || status === "applied" || status === "rolled_back" || status === "expired"
                  ? "Governance Linked"
                  : "Route To Governance";
            const routeAction =
              status === "routed" || status === "approved" || status === "applied" || status === "rolled_back" || status === "expired"
                ? "open-governance"
                : "route-queue-item";
            return `
              <article class="identityops-queue-card${selected ? " identityops-queue-card-selected" : ""}" data-identityops-admin-queue-id="${escapeHTML(id)}">
                <div class="metric-title-row">
                  <div class="title">${escapeHTML(label)}</div>
                  <span class="${identityAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
                </div>
                <div class="identityops-chip-row">
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.requestedAction || "").trim() || "proposal")}</span>
                  <span class="chip chip-neutral chip-compact">${escapeHTML(String(item?.kind || "").trim() || "identity")}</span>
                  ${item?.routedAt ? `<span class="chip chip-neutral chip-compact">routed</span>` : ""}
                  ${decisionStatus ? `<span class="${identityAdminStatusChipClass(decisionStatus)}">${escapeHTML(decisionStatus)}</span>` : ""}
                  ${item?.receipt?.receiptId ? '<span class="chip chip-ok chip-compact">receipt</span>' : ""}
                  ${rollbackStatus ? `<span class="${identityAdminStatusChipClass(rollbackStatus)}">${escapeHTML(rollbackStatus)}</span>` : ""}
                </div>
                <div class="identityops-kv-list">
                  ${renderKeyValueRows([
                    {
                      label: "Summary",
                      value: escapeHTML(String(item?.summary || "").trim() || "-")
                    },
                    {
                      label: "Scope",
                      value: renderValuePills([
                        { label: "subject", value: String(item?.subjectId || "").trim(), code: true },
                        { label: "target", value: String(item?.targetScope || "").trim(), code: true }
                      ])
                    },
                    {
                      label: "Reason",
                      value: escapeHTML(String(item?.reason || "").trim() || "-")
                    },
                    {
                      label: "Simulation",
                      value: escapeHTML(String(item?.simulationSummary || "").trim() || "pending")
                    },
                    {
                      label: "Recovery",
                      value: escapeHTML(String(item?.rollback?.summary || "").trim() || "pending")
                    }
                  ])}
                </div>
                <div class="identityops-action-row">
                  <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="select-queue-item" data-identityops-admin-id="${escapeHTML(id)}">Load Draft</button>
                  <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="simulate-queue-item" data-identityops-admin-id="${escapeHTML(id)}">Run Simulation</button>
                  <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="${routeAction}" data-identityops-admin-id="${escapeHTML(id)}"${canRoute || routeAction === "open-governance" ? "" : " disabled"}>${routeActionLabel}</button>
                </div>
              </article>
            `;
          })
          .join("")
      : '<div class="identityops-empty">No identity admin proposals are queued yet.</div>';
  return `
    <article class="metric identityops-card identityops-card-secondary identityops-admin-card" data-domain-root="identityops" data-identityops-panel="admin-change-queue">
      <div class="metric-title-row">
        <div class="title">Admin Change Queue</div>
        <span class="chip chip-neutral chip-compact">proposal only</span>
      </div>
      <div class="identityops-chip-row">
        <span class="chip chip-neutral chip-compact">queued=${escapeHTML(String(items.length))}</span>
        <span class="chip chip-neutral chip-compact">selected=${escapeHTML(selectedChangeId || "none")}</span>
      </div>
      <div class="identityops-queue-list">
        ${queueMarkup}
      </div>
    </article>
  `;
}

function renderAuthorityDraftBoard(snapshot) {
  const draft = snapshot.admin?.authorityDraft || {};
  const routeDisabled = !snapshot.admin?.latestSimulation || snapshot.admin?.latestSimulation?.kind !== "authority";
  return `
    <article class="metric identityops-card identityops-card-secondary identityops-admin-card" data-domain-root="identityops" data-identityops-panel="authority-change-draft">
      <div class="metric-title-row">
        <div class="title">Authority Change Draft</div>
        <span class="chip chip-neutral chip-compact">governed proposal</span>
      </div>
      <div class="identityops-chip-row">
        <span class="chip chip-neutral chip-compact">current subject=${escapeHTML(snapshot.subject)}</span>
        <span class="chip chip-neutral chip-compact">current scope=${escapeHTML(snapshot.tenantIds[0] || snapshot.environment)}</span>
      </div>
      <div class="identityops-form-grid">
        <label class="identityops-field">
          <span class="identityops-field-label">Subject</span>
          <input class="input" type="text" value="${escapeHTML(draft.subjectId || "")}" placeholder="subject or client" data-identityops-draft-kind="authority" data-identityops-draft-field="subjectId" />
        </label>
        <label class="identityops-field">
          <span class="identityops-field-label">Target Scope</span>
          <input class="input" type="text" value="${escapeHTML(draft.targetScope || "")}" placeholder="tenant / project" data-identityops-draft-kind="authority" data-identityops-draft-field="targetScope" />
        </label>
        <label class="identityops-field">
          <span class="identityops-field-label">Authority Tier</span>
          <select class="input" data-identityops-draft-kind="authority" data-identityops-draft-field="authorityTier">
            <option value="workspace_operator"${draft.authorityTier === "workspace_operator" ? " selected" : ""}>workspace_operator</option>
            <option value="project_admin"${draft.authorityTier === "project_admin" ? " selected" : ""}>project_admin</option>
            <option value="tenant_admin"${draft.authorityTier === "tenant_admin" ? " selected" : ""}>tenant_admin</option>
            <option value="approval_reviewer"${draft.authorityTier === "approval_reviewer" ? " selected" : ""}>approval_reviewer</option>
          </select>
        </label>
        <label class="identityops-field identityops-field-wide">
          <span class="identityops-field-label">Reason</span>
          <textarea class="input identityops-textarea" rows="3" data-identityops-draft-kind="authority" data-identityops-draft-field="reason" placeholder="Describe the authority change intent.">${escapeHTML(draft.reason || "")}</textarea>
        </label>
      </div>
      ${renderIdentityAdminActionRow("authority", { routeDisabled })}
    </article>
  `;
}

function renderGrantDraftBoard(snapshot) {
  const draft = snapshot.admin?.grantDraft || {};
  const routeDisabled = !snapshot.admin?.latestSimulation || snapshot.admin?.latestSimulation?.kind !== "grant";
  return `
    <article class="metric identityops-card identityops-card-secondary identityops-admin-card" data-domain-root="identityops" data-identityops-panel="grant-delegation-draft">
      <div class="metric-title-row">
        <div class="title">Grant And Delegation Draft</div>
        <span class="chip chip-neutral chip-compact">governed proposal</span>
      </div>
      <div class="identityops-chip-row">
        <span class="chip chip-neutral chip-compact">permissions=${escapeHTML(String(snapshot.effectivePermissions.length))}</span>
        <span class="chip chip-neutral chip-compact">policy matrix=${escapeHTML(snapshot.policyMatrixRequired ? "required" : "optional")}</span>
      </div>
      <div class="identityops-form-grid">
        <label class="identityops-field">
          <span class="identityops-field-label">Subject</span>
          <input class="input" type="text" value="${escapeHTML(draft.subjectId || "")}" placeholder="subject or client" data-identityops-draft-kind="grant" data-identityops-draft-field="subjectId" />
        </label>
        <label class="identityops-field">
          <span class="identityops-field-label">Target Scope</span>
          <input class="input" type="text" value="${escapeHTML(draft.targetScope || "")}" placeholder="tenant / project" data-identityops-draft-kind="grant" data-identityops-draft-field="targetScope" />
        </label>
        <label class="identityops-field">
          <span class="identityops-field-label">Change Kind</span>
          <select class="input" data-identityops-draft-kind="grant" data-identityops-draft-field="changeKind">
            <option value="issue"${draft.changeKind === "issue" ? " selected" : ""}>issue</option>
            <option value="revoke"${draft.changeKind === "revoke" ? " selected" : ""}>revoke</option>
            <option value="delegation"${draft.changeKind === "delegation" ? " selected" : ""}>delegation</option>
          </select>
        </label>
        <label class="identityops-field">
          <span class="identityops-field-label">Grant Key</span>
          <input class="input" type="text" value="${escapeHTML(draft.grantKey || "")}" placeholder="runtime.run.read" data-identityops-draft-kind="grant" data-identityops-draft-field="grantKey" />
        </label>
        <label class="identityops-field">
          <span class="identityops-field-label">Delegation Mode</span>
          <select class="input" data-identityops-draft-kind="grant" data-identityops-draft-field="delegationMode">
            <option value="governed"${draft.delegationMode === "governed" ? " selected" : ""}>governed</option>
            <option value="direct"${draft.delegationMode === "direct" ? " selected" : ""}>direct</option>
            <option value="approval_chain"${draft.delegationMode === "approval_chain" ? " selected" : ""}>approval_chain</option>
          </select>
        </label>
        <label class="identityops-field identityops-field-wide">
          <span class="identityops-field-label">Reason</span>
          <textarea class="input identityops-textarea" rows="3" data-identityops-draft-kind="grant" data-identityops-draft-field="reason" placeholder="Describe the grant or delegation intent.">${escapeHTML(draft.reason || "")}</textarea>
        </label>
      </div>
      ${renderIdentityAdminActionRow("grant", { routeDisabled })}
    </article>
  `;
}

function renderGovernanceRouteReceiptBoard(snapshot) {
  const item = snapshot.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric identityops-card identityops-card-secondary identityops-admin-card" data-domain-root="identityops" data-identityops-panel="governance-route-receipt">
        <div class="metric-title-row">
          <div class="title">Governance Route And Receipt</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="identityops-empty">Select or queue an identity admin proposal to review governance status, apply posture, and receipt state.</div>
      </article>
    `;
  }

  const decision = item.decision || null;
  const execution = item.execution || null;
  const receipt = item.receipt || null;
  const rollback = item.rollback || null;
  const status = String(item.status || "").trim().toLowerCase() || "draft";
  const canApply = status === "approved" && Boolean(decision?.approvalReceiptId) && !receipt?.receiptId;

  return `
    <article class="metric identityops-card identityops-card-secondary identityops-admin-card" data-domain-root="identityops" data-identityops-panel="governance-route-receipt">
      <div class="metric-title-row">
        <div class="title">Governance Route And Receipt</div>
        <span class="${identityAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="identityops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(item.id)}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(item.kind || "identity")}</span>
        ${decision?.approvalReceiptId ? `<span class="chip chip-ok chip-compact">approval receipt</span>` : '<span class="chip chip-neutral chip-compact">decision pending</span>'}
        ${receipt?.receiptId ? `<span class="chip chip-ok chip-compact">admin receipt</span>` : '<span class="chip chip-neutral chip-compact">apply pending</span>'}
        ${rollback?.rollbackId ? `<span class="${identityAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "recovery")}</span>` : '<span class="chip chip-neutral chip-compact">recovery pending</span>'}
      </div>
      <div class="identityops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Route Status",
            value: renderValuePills([
              { label: "routed", value: item.routedAt },
              { label: "summary", value: item.summary },
              { label: "simulation", value: item.simulationSummary }
            ])
          },
          {
            label: "Governance Decision",
            value: renderValuePills([
              { label: "decision", value: decision?.status },
              { label: "decision id", value: decision?.decisionId, code: true },
              { label: "approval receipt", value: decision?.approvalReceiptId, code: true },
              { label: "decided", value: decision?.decidedAt }
            ])
          },
          {
            label: "Decision Reason",
            value: escapeHTML(String(decision?.reason || "").trim() || "-")
          },
          {
            label: "Execution",
            value: renderValuePills([
              { label: "execution", value: execution?.executionId, code: true },
              { label: "status", value: execution?.status },
              { label: "executed", value: execution?.executedAt },
              { label: "actor", value: execution?.actorRef, code: true }
            ])
          },
          {
            label: "Admin Receipt",
            value: renderValuePills([
              { label: "receipt", value: receipt?.receiptId, code: true },
              { label: "issued", value: receipt?.issuedAt },
              { label: "stable ref", value: receipt?.stableRef, code: true },
              { label: "approval receipt", value: receipt?.approvalReceiptId, code: true }
            ])
          },
          {
            label: "Rollback Or Expiry",
            value: renderValuePills([
              { label: "action", value: rollback?.action },
              { label: "status", value: rollback?.status },
              { label: "record", value: rollback?.rollbackId, code: true },
              { label: "at", value: rollback?.rolledBackAt }
            ])
          }
        ])}
      </div>
      <div class="identityops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="open-governance" data-identityops-admin-id="${escapeHTML(item.id)}">Open GovernanceOps</button>
        <button class="btn btn-ok btn-small" type="button" data-identityops-admin-action="apply-approved-change" data-identityops-admin-id="${escapeHTML(item.id)}"${canApply ? "" : " disabled"}>Apply Approved Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="copy-governance-receipt" data-identityops-admin-id="${escapeHTML(item.id)}"${decision?.approvalReceiptId ? "" : " disabled"}>Copy Governance Receipt</button>
        <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="copy-admin-receipt" data-identityops-admin-id="${escapeHTML(item.id)}"${receipt?.receiptId ? "" : " disabled"}>Copy Admin Receipt</button>
      </div>
    </article>
  `;
}

function renderRollbackExpiryHistoryBoard(snapshot) {
  const item = snapshot.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric identityops-card identityops-card-secondary identityops-admin-card" data-domain-root="identityops" data-identityops-panel="rollback-expiry-history">
        <div class="metric-title-row">
          <div class="title">Rollback And Expiry History</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="identityops-empty">Select an applied identity admin proposal to review recovery posture, bounded history, and rollback or expiry actions.</div>
      </article>
    `;
  }

  const decision = item.decision || null;
  const execution = item.execution || null;
  const receipt = item.receipt || null;
  const rollback = item.rollback || null;
  const status = String(item.status || "").trim().toLowerCase() || "draft";
  const canRollback = status === "applied" && Boolean(receipt?.receiptId) && !rollback?.rollbackId;
  const canExpire = canRollback && String(item.kind || "").trim().toLowerCase() === "grant";
  const recoveryReason = String(snapshot.admin?.recoveryReason || "").trim();
  const historyItems = [
    {
      label: "Proposal",
      at: item.createdAt || item.updatedAt,
      summary: item.summary
    },
    {
      label: "Simulation",
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
    {
      label: rollback?.action === "expiry" ? "Expiry" : "Rollback",
      at: rollback?.rolledBackAt,
      summary: rollback?.summary
    }
  ].filter((entry) => entry.at || entry.summary);

  const historyMarkup =
    historyItems.length > 0
      ? `<div class="identityops-history-list">${historyItems
          .map(
            (entry) => `
              <div class="identityops-history-item">
                <div class="identityops-history-stage">${escapeHTML(entry.label)}</div>
                <div class="identityops-history-time">${escapeHTML(entry.at || "-")}</div>
                <div class="identityops-history-summary">${escapeHTML(entry.summary || "-")}</div>
              </div>
            `
          )
          .join("")}</div>`
      : '<div class="identityops-empty">No bounded admin history is available yet.</div>';

  return `
    <article class="metric identityops-card identityops-card-secondary identityops-admin-card" data-domain-root="identityops" data-identityops-panel="rollback-expiry-history">
      <div class="metric-title-row">
        <div class="title">Rollback And Expiry History</div>
        <span class="${identityAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="identityops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(item.id)}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(item.kind || "identity")}</span>
        ${rollback?.rollbackId ? `<span class="${identityAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "recovery")}</span>` : `<span class="chip chip-neutral chip-compact">${escapeHTML(canRollback ? "recovery available" : "recovery pending")}</span>`}
      </div>
      <div class="identityops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Recovery Posture",
            value: renderValuePills([
              { label: "state", value: rollback?.status || (canRollback ? "rollback available" : "recovery pending") },
              { label: "action", value: rollback?.action || (canExpire ? "rollback or expiry" : canRollback ? "rollback" : "") },
              { label: "record", value: rollback?.rollbackId, code: true },
              { label: "stable ref", value: rollback?.stableRef, code: true }
            ])
          },
          {
            label: "Recovery Reason",
            value: rollback?.reason ? escapeHTML(rollback.reason) : '<span class="identityops-empty">A bounded reason is required before rollback or expiry can execute.</span>'
          },
          {
            label: "Stable History",
            value: historyMarkup
          }
        ])}
      </div>
      <label class="identityops-field identityops-field-wide">
        <span class="identityops-field-label">Rollback Or Expiry Reason</span>
        <input
          class="input"
          type="text"
          value="${escapeHTML(recoveryReason)}"
          placeholder="required; explain the rollback or expiry action"
          data-identityops-admin-recovery-reason
        />
      </label>
      <div class="identityops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="rollback-applied-change" data-identityops-admin-id="${escapeHTML(item.id)}"${canRollback ? "" : " disabled"}>Rollback Applied Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="expire-applied-change" data-identityops-admin-id="${escapeHTML(item.id)}"${canExpire ? "" : " disabled"}>Expire Applied Grant</button>
        <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="copy-rollback-receipt" data-identityops-admin-id="${escapeHTML(item.id)}"${rollback?.rollbackId ? "" : " disabled"}>Copy Rollback Receipt</button>
      </div>
    </article>
  `;
}

function renderSimulationImpactBoard(snapshot) {
  const simulation = snapshot.admin?.latestSimulation || null;
  const content = simulation
    ? `
        <div class="identityops-chip-row">
          <span class="chip chip-neutral chip-compact">${escapeHTML(simulation.kind || "identity")}</span>
          ${simulation.updatedAt ? `<span class="chip chip-neutral chip-compact">${escapeHTML(simulation.updatedAt)}</span>` : ""}
        </div>
        <div class="identityops-kv-list">
          ${renderKeyValueRows([
            {
              label: "Summary",
              value: escapeHTML(simulation.summary || "Simulation ready.")
            },
            {
              label: "Impact Facts",
              value: renderValuePills(simulation.facts || [])
            },
            {
              label: "Findings",
              value:
                Array.isArray(simulation.findings) && simulation.findings.length > 0
                  ? `<ul class="identityops-list">${simulation.findings
                      .map((item) => `<li>${escapeHTML(item)}</li>`)
                      .join("")}</ul>`
                  : '<span class="identityops-empty">No additional findings.</span>'
            }
          ])}
        </div>
        <div class="identityops-action-row">
          ${
            simulation.changeId
              ? `<button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="select-queue-item" data-identityops-admin-id="${escapeHTML(simulation.changeId)}">Load Queued Proposal</button>`
              : ""
          }
          <button class="btn btn-secondary btn-small" type="button" data-identityops-admin-action="open-governance">Open GovernanceOps</button>
        </div>
      `
    : '<div class="identityops-empty">No admin simulation is available yet. Save a draft and run a bounded preview first.</div>';
  return `
    <article class="metric identityops-card identityops-card-secondary identityops-admin-card" data-domain-root="identityops" data-identityops-panel="simulation-impact-preview">
      <div class="metric-title-row">
        <div class="title">Simulation And Impact Preview</div>
        <span class="chip chip-neutral chip-compact">dry run</span>
      </div>
      ${content}
    </article>
  `;
}

export function renderIdentityWorkspace(settings = {}, session = {}) {
  const snapshot = createIdentityWorkspaceSnapshot(settings, session);
  return `
    <div class="identityops-workspace" data-domain-root="identityops">
      <div class="identityops-primary-grid">
        ${renderEffectiveIdentityBoard(settings, session)}
        ${renderAuthorityBoard(settings, session)}
        ${renderScopeBoard(settings, session)}
        ${renderGrantEntitlementBoard(settings, session)}
      </div>
      <div class="identityops-secondary-grid">
        ${renderAimxsIdentityPostureBoard(snapshot)}
        ${renderIdentityNetworkBoard(snapshot)}
        ${renderDelegationOverrideBoard(snapshot)}
        ${renderTraceabilityBoard(snapshot)}
      </div>
      <section class="identityops-admin-section" data-identityops-section="admin">
        <div class="metric-title-row identityops-section-title-row">
          <div class="title">IdentityOps Admin</div>
          <span class="chip chip-neutral chip-compact">proposal -> simulation -> governance -> apply -> receipt -> rollback/expiry</span>
        </div>
        ${renderIdentityAdminFeedback(snapshot.admin?.feedback || null)}
        <div class="identityops-admin-grid">
          ${renderIdentityAdminQueueBoard(snapshot)}
          ${renderAuthorityDraftBoard(snapshot)}
          ${renderGrantDraftBoard(snapshot)}
          ${renderSimulationImpactBoard(snapshot)}
          ${renderGovernanceRouteReceiptBoard(snapshot)}
          ${renderRollbackExpiryHistoryBoard(snapshot)}
        </div>
      </section>
    </div>
  `;
}
