import { escapeHTML, formatTime } from "../../../views/common.js";
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
      ${renderControlCoverageBoard(snapshot)}
      ${renderObligationBoard(snapshot)}
      ${renderAttestationBoard(snapshot)}
      ${renderGapExceptionBoard(snapshot)}
      ${renderRetentionDisclosureBoard(snapshot)}
    </section>
  `;
}
