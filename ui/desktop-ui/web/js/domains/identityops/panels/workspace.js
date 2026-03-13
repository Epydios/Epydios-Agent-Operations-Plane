import { escapeHTML } from "../../../views/common.js";
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
        ${renderIdentityNetworkBoard(snapshot)}
        ${renderDelegationOverrideBoard(snapshot)}
        ${renderTraceabilityBoard(snapshot)}
      </div>
    </div>
  `;
}
