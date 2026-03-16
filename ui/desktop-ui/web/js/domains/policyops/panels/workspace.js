import {
  chipClassForStatus,
  displayPolicyProviderLabel,
  escapeHTML,
  formatTime,
  renderPanelStateMetric
} from "../../../views/common.js";
import {
  chipClassForPolicyEffect,
  createPolicyWorkspaceSnapshot
} from "../state.js";
import {
  renderCurrentPolicyContractPanel,
  renderPolicyPackCatalogPanel
} from "./settings.js";

function renderValuePills(items = []) {
  const values = (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const value = String(item?.value || "").trim();
      if (!label || !value) {
        return "";
      }
      return `
        <span class="policyops-value-pill">
          <span class="policyops-value-key">${escapeHTML(label)}</span>
          <span class="policyops-value-text${item?.code ? " policyops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="policyops-empty">not available</span>';
  }
  return `<div class="policyops-value-group">${values.join("")}</div>`;
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
        <div class="policyops-row">
          <div class="policyops-row-label">${escapeHTML(label)}</div>
          <div class="policyops-row-value">${value || '<span class="policyops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function toneChipClass(tone) {
  const normalized = String(tone || "").trim().toLowerCase();
  if (!normalized || normalized === "neutral" || normalized === "idle") {
    return "chip chip-neutral chip-compact";
  }
  return `${chipClassForStatus(normalized)} chip-compact`;
}

function renderActionButtons(actions = []) {
  const buttons = (Array.isArray(actions) ? actions : [])
    .map((action) => {
      const label = String(action?.label || "").trim();
      const command = String(action?.command || "").trim();
      if (!label || !command) {
        return "";
      }
      return `<button class="btn btn-secondary btn-small" type="button" data-policyops-action="${escapeHTML(command)}"${action?.disabled ? " disabled" : ""}>${escapeHTML(label)}</button>`;
    })
    .filter(Boolean);
  if (buttons.length === 0) {
    return "";
  }
  return `<div class="policyops-action-row">${buttons.join("")}</div>`;
}

function renderFeedbackPanel(snapshot) {
  if (!snapshot.feedback?.message) {
    return "";
  }
  const tone = String(snapshot.feedback.tone || "info").trim().toLowerCase();
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
      ? "PolicyOps Action Complete"
      : tone === "error"
        ? "PolicyOps Action Failed"
        : tone === "warn"
          ? "PolicyOps Action Needs Review"
          : "PolicyOps Action";
  return `
    <div class="policyops-feedback-panel">
      ${renderPanelStateMetric(state, title, snapshot.feedback.message)}
    </div>
  `;
}

function renderDecisionExplanationBoard(snapshot) {
  const board = snapshot.decisionExplanation;
  if (!board.available || !board.richness || !board.outcome) {
    return `
      <article class="metric policyops-card" data-domain-root="policyops" data-policyops-panel="decision-explanation">
        <div class="metric-title-row">
          <div class="title">Decision Explanation</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="policyops-kv-list">
          <div class="policyops-row">
            <div class="policyops-row-label">Status</div>
            <div class="policyops-row-value"><span class="policyops-empty">No recorded policy decision is loaded.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const providerLabel = displayPolicyProviderLabel(board.selectedPolicyProvider || board.outcome.provider || "-");
  const rows = [
    {
      label: "Decision Source",
      value: renderValuePills([
        { label: "decision", value: board.richness.decision || "UNSET" },
        { label: "provider", value: providerLabel, code: true },
        { label: "run", value: board.runId || "-", code: true },
        { label: "updated", value: board.updatedAt || "-", code: true }
      ])
    },
    {
      label: "Governed Request",
      value: renderValuePills([
        { label: "contract", value: board.richness.contractId || "-" , code: true},
        { label: "workflow", value: board.richness.workflowKind || "-" },
        { label: "label", value: board.richness.requestLabel || "-" },
        { label: "pack", value: board.activePackId || board.activePackLabel || "-", code: Boolean(board.activePackId) }
      ])
    },
    {
      label: "Rationale",
      value: renderValuePills([
        { label: "boundary", value: board.richness.boundaryClass || "-" },
        { label: "risk", value: board.richness.riskTier || "-" },
        { label: "grants", value: String(board.richness.requiredGrants.length || 0) },
        { label: "reason", value: board.richness.firstReason || "-" }
      ])
    },
    {
      label: "Authority Input",
      value: renderValuePills([
        { label: "subject", value: board.richness.actorSubject || "-", code: true },
        { label: "basis", value: board.richness.authorityBasis || "-" },
        { label: "tenant", value: board.richness.authorityTenantScopes.join(", ") || "-" },
        { label: "project", value: board.richness.authorityProjectScopes.join(", ") || "-" }
      ])
    },
    {
      label: "Governance Linkage",
      value: renderValuePills([
        { label: "operator approval", value: board.richness.operatorApprovalRequired ? "required" : "policy-first" },
        { label: "evidence refs", value: String(board.richness.evidenceRefCount || 0) },
        { label: "audit ref", value: board.richness.auditEventRef || "-", code: true }
      ])
    }
  ];

  return `
    <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="decision-explanation">
      <div class="metric-title-row">
        <div class="title">Decision Explanation</div>
        ${board.outcome.decision ? `<span class="${chipClassForStatus(board.outcome.decision)} chip-compact">${escapeHTML(board.outcome.decision)}</span>` : ""}
      </div>
      ${renderActionButtons([
        {
          label: "Export Decision Explanation",
          command: "export-decision-explanation",
          disabled: !board.exportable
        },
        {
          label: "Copy Stable Policy References",
          command: "copy-stable-policy-references",
          disabled: !snapshot.stableReferences.contractId && !snapshot.stableReferences.runId
        },
        {
          label: "Open Linked Governance",
          command: "open-linked-governance",
          disabled: !board.runId
        }
      ])}
      <div class="${escapeHTML(board.outcome.bannerClass)}">
        <div class="metric-title-row">
          <div class="title">Current Outcome</div>
          <span class="${chipClassForPolicyEffect(board.outcome)}">${escapeHTML(board.outcome.effectLabel)}</span>
        </div>
        <div class="policy-outcome-detail">${escapeHTML(board.outcome.headline)}</div>
        <div class="meta">${escapeHTML(board.outcome.detail)}</div>
      </div>
      <div class="policyops-chip-row">
        <span class="${chipClassForStatus(board.richness.decision || "UNSET")} chip-compact">decision</span>
        <span class="chip chip-neutral chip-compact">provider=${escapeHTML(providerLabel)}</span>
        <span class="chip chip-neutral chip-compact">workflow=${escapeHTML(board.richness.workflowKind || "-")}</span>
        <span class="chip chip-neutral chip-compact">env=${escapeHTML(board.richness.environment || "-")}</span>
      </div>
      <div class="policyops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderPolicyCoverageBoard(snapshot) {
  const board = snapshot.policyCoverage;
  if (!board.available) {
    return `
      <article class="metric policyops-card" data-domain-root="policyops" data-policyops-panel="policy-coverage">
        <div class="metric-title-row">
          <div class="title">Policy Coverage</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="policyops-kv-list">
          <div class="policyops-row">
            <div class="policyops-row-label">Status</div>
            <div class="policyops-row-value"><span class="policyops-empty">No policy catalog or governed decision anchors are loaded.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const rows = [
    {
      label: "Catalog Breadth",
      value: renderValuePills([
        { label: "packs", value: String(board.packCount || 0) },
        { label: "role bundles", value: String(board.roleBundleCount || 0) },
        { label: "decision surfaces", value: String(board.decisionSurfaceCount || 0) },
        { label: "boundaries", value: String(board.boundaryRequirementCount || 0) }
      ])
    },
    {
      label: "Catalog Gaps",
      value: renderValuePills([
        { label: "missing roles", value: String(board.packsMissingRoleBundles || 0) },
        { label: "missing surfaces", value: String(board.packsMissingDecisionSurfaces || 0) },
        { label: "missing boundaries", value: String(board.packsMissingBoundaryRequirements || 0) },
        { label: "total gaps", value: String(board.gapCount || 0) }
      ])
    },
    {
      label: "Recorded Anchors",
      value: renderValuePills([
        { label: "decision", value: board.latestDecisionCaptured ? "captured" : "missing" },
        { label: "contract", value: board.latestContractCaptured ? "captured" : "missing" },
        { label: "rationale", value: board.latestRationaleCaptured ? "captured" : "missing" },
        { label: "evidence", value: board.latestEvidenceCaptured ? "captured" : "missing" }
      ])
    },
    {
      label: "Current Source",
      value: renderValuePills([
        { label: "catalog", value: snapshot.currentContract.catalogSource || "-" },
        { label: "provider", value: snapshot.currentContract.providerLabel || "-", code: true },
        { label: "latest run", value: snapshot.decisionExplanation.runId || "-", code: true }
      ])
    }
  ];

  return `
    <article class="metric policyops-card" data-domain-root="policyops" data-policyops-panel="policy-coverage">
      <div class="metric-title-row">
        <div class="title">Policy Coverage</div>
        <span class="${toneChipClass(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
      </div>
      ${renderActionButtons([
        {
          label: "Copy Stable Policy References",
          command: "copy-stable-policy-references",
          disabled: !snapshot.stableReferences.contractId && !snapshot.stableReferences.runId
        },
        {
          label: "Open ComplianceOps",
          command: "open-complianceops",
          disabled: !board.available
        }
      ])}
      <div class="policyops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderPolicySimulationBoard(snapshot) {
  const board = snapshot.policySimulation;
  if (!board.available) {
    return `
      <article class="metric policyops-card" data-domain-root="policyops" data-policyops-panel="policy-simulation">
        <div class="metric-title-row">
          <div class="title">Policy Simulation</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="policyops-kv-list">
          <div class="policyops-row">
            <div class="policyops-row-label">Status</div>
            <div class="policyops-row-value"><span class="policyops-empty">No latest governed run replay is available.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const rows = [
    {
      label: "Replay Source",
      value: renderValuePills([
        { label: "source", value: board.source || "-" },
        { label: "decision", value: board.decision || "UNSET" },
        { label: "provider", value: board.providerLabel || "-", code: true },
        {
          label: "pack",
          value: board.activePackId || board.activePackLabel || "-",
          code: Boolean(board.activePackId)
        }
      ])
    },
    {
      label: "Inputs",
      value: renderValuePills([
        { label: "environment", value: board.environment || "-" },
        { label: "risk", value: board.riskTier || "-" },
        { label: "boundary", value: board.boundaryClass || "-" },
        { label: "required grants", value: String(board.requiredGrantCount || 0) }
      ])
    },
    {
      label: "Blocking Factors",
      value: renderValuePills([
        { label: "operator approval", value: board.operatorApprovalRequired ? "required" : "not required" },
        { label: "evidence", value: board.evidenceReadiness || "-" },
        { label: "blockers", value: String(board.blockerCount || 0) },
        { label: "expected", value: board.expectedOutcome || "UNSET" }
      ])
    },
    {
      label: "Next Action",
      value: escapeHTML(board.nextAction || "-")
    },
    {
      label: "Refresh Anchor",
      value: board.lastRefreshedAt
        ? escapeHTML(formatTime(board.lastRefreshedAt))
        : '<span class="policyops-empty">Use Refresh Bounded Simulation to re-read the latest governed run replay.</span>'
    }
  ];

  return `
    <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="policy-simulation">
      <div class="metric-title-row">
        <div class="title">Policy Simulation</div>
        <span class="${toneChipClass(board.tone || board.decision)}">${escapeHTML(board.decision || "UNSET")}</span>
      </div>
      ${renderActionButtons([
        {
          label: board.lastRefreshedAt ? "Refresh Bounded Simulation" : "Run Bounded Simulation",
          command: "refresh-bounded-simulation",
          disabled: !board.refreshable
        },
        {
          label: "Open AuditOps",
          command: "open-auditops",
          disabled: !board.available
        },
        {
          label: "Open EvidenceOps",
          command: "open-evidenceops",
          disabled: !board.available
        }
      ])}
      <div class="policyops-chip-row">
        <span class="${toneChipClass(board.tone)}">${escapeHTML(board.tone || "neutral")}</span>
        <span class="chip chip-neutral chip-compact">risk=${escapeHTML(board.riskTier || "-")}</span>
        <span class="chip chip-neutral chip-compact">boundary=${escapeHTML(board.boundaryClass || "-")}</span>
        <span class="chip chip-neutral chip-compact">blockers=${escapeHTML(String(board.blockerCount || 0))}</span>
      </div>
      <div class="policyops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

export function renderPolicyWorkspace(context = {}) {
  const snapshot = createPolicyWorkspaceSnapshot(context);
  return `
    <div class="policyops-workspace" data-domain-root="policyops">
      ${renderFeedbackPanel(snapshot)}
      <div class="policyops-primary-grid">
        ${renderCurrentPolicyContractPanel(snapshot.settings)}
        ${renderDecisionExplanationBoard(snapshot)}
        ${renderPolicyCoverageBoard(snapshot)}
        ${renderPolicySimulationBoard(snapshot)}
        ${renderPolicyPackCatalogPanel(snapshot.settings)}
      </div>
    </div>
  `;
}
