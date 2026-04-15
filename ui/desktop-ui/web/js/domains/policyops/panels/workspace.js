import {
  chipClassForStatus,
  displayPolicyProviderLabel,
  escapeHTML,
  formatTime,
  renderPanelStateMetric
} from "../../../views/common.js";
import { renderAimxsIdentityPostureBlock } from "../../../shared/components/aimxs-identity-posture.js";
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

function normalizePolicyAdminVerification(verification = null) {
  return verification && typeof verification === "object" ? verification : null;
}

function resolvePolicyAdminVerification(item = null, latestVerification = null) {
  const normalizedLatest = normalizePolicyAdminVerification(latestVerification);
  const itemId = String(item?.id || "").trim();
  if (normalizedLatest && String(normalizedLatest.changeId || "").trim() === itemId) {
    return normalizedLatest;
  }
  return normalizePolicyAdminVerification(item?.verification || null);
}

function policyAdminVerificationPassed(verification = null) {
  return Boolean(verification?.passing === true);
}

function verificationChipClass(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) {
    return "chip chip-neutral chip-compact";
  }
  return `${chipClassForStatus(normalized)} chip-compact`;
}

function renderVerificationCases(verification = null) {
  const cases = Array.isArray(verification?.cases) ? verification.cases : [];
  if (cases.length === 0) {
    return '<span class="policyops-empty">Run Verify Gate to capture bounded compile, lint, and golden-case posture.</span>';
  }
  return `
    <div class="policyops-history-list">
      ${cases
        .map(
          (entry) => `
            <div class="policyops-history-item">
              <div class="policyops-history-stage">${escapeHTML(entry.label || "case")}</div>
              <div class="policyops-history-time"><span class="${verificationChipClass(entry.status)}">${escapeHTML(entry.status || "unknown")}</span></div>
              <div class="policyops-history-summary">${escapeHTML(entry.detail || "-")}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
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

function policyAdminStatusChipClass(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "applied" || normalized === "verified") {
    return "chip chip-ok chip-compact";
  }
  if (normalized === "verification_failed") {
    return "chip chip-danger chip-compact";
  }
  if (normalized === "rolled_back") {
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

function renderPolicyAdminActionRow(changeId = "", item = null, latestVerification = null) {
  const attrs = changeId ? ` data-policyops-admin-id="${escapeHTML(changeId)}"` : "";
  const verification = resolvePolicyAdminVerification(item, latestVerification);
  const canRoute = policyAdminVerificationPassed(verification);
  return `
    <div class="policyops-action-row">
      <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="save-draft"${attrs}>Save Draft</button>
      <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="simulate-draft"${attrs}>Run Dry-Run</button>
      <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="verify-draft"${attrs}>Run Verify Gate</button>
      <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="route-draft"${attrs}${canRoute ? "" : " disabled"}>Route To Governance</button>
    </div>
  `;
}

function renderAdminChangeQueueBoard(snapshot) {
  const board = snapshot.admin;
  if (!Array.isArray(board.queueItems) || board.queueItems.length === 0) {
    return `
      <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="admin-change-queue">
        <div class="metric-title-row">
          <div class="title">Admin Change Queue</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="policyops-kv-list">
          <div class="policyops-row">
            <div class="policyops-row-label">Status</div>
            <div class="policyops-row-value"><span class="policyops-empty">No PolicyOps admin proposal is queued yet.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const cards = board.queueItems
    .map((item) => {
      const verification = resolvePolicyAdminVerification(item, board.latestVerification);
      const canRoute = policyAdminVerificationPassed(verification);
      return `
      <article class="policyops-queue-card">
        <div class="metric-title-row">
          <div class="title"><code>${escapeHTML(item.id)}</code></div>
          <span class="${policyAdminStatusChipClass(item.status)}">${escapeHTML(item.status)}</span>
        </div>
        <div class="policyops-chip-row">
          <span class="chip chip-neutral chip-compact">${escapeHTML(item.changeKind || "load")}</span>
          <span class="chip chip-neutral chip-compact">${escapeHTML(item.packId || item.subjectId || "-")}</span>
          <span class="chip chip-neutral chip-compact">${escapeHTML(item.providerId || "-")}</span>
          <span class="${verificationChipClass(verification?.passing ? "pass" : verification ? "fail" : "unknown")}">${escapeHTML(
            verification?.passing ? "verified" : verification ? "verify failed" : "verify pending"
          )}</span>
        </div>
        <div class="policyops-kv-list">
          ${renderKeyValueRows([
            {
              label: "Scope",
              value: renderValuePills([
                { label: item.subjectLabel || "pack", value: item.subjectId || "-", code: true },
                { label: item.targetLabel || "scope", value: item.targetScope || "-", code: true },
                { label: "updated", value: item.updatedAt || "-" },
                { label: "routed", value: item.routedAt || "-" }
              ])
            },
            {
              label: "Summary",
              value: escapeHTML(item.summary || "-")
            },
            {
              label: "Preview",
              value: escapeHTML(item.simulationSummary || "-")
            },
            {
              label: "Verify Gate",
              value: escapeHTML(verification?.summary || "Run Verify Gate before routing this proposal to GovernanceOps.")
            }
          ])}
        </div>
        <div class="policyops-action-row">
          <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="select-queue-item" data-policyops-admin-id="${escapeHTML(item.id)}">Select</button>
          <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="simulate-queue-item" data-policyops-admin-id="${escapeHTML(item.id)}">Run Dry-Run</button>
          <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="verify-queue-item" data-policyops-admin-id="${escapeHTML(item.id)}">Run Verify Gate</button>
          <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="route-queue-item" data-policyops-admin-id="${escapeHTML(item.id)}"${canRoute ? "" : " disabled"}>Route To Governance</button>
          <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="open-governance" data-policyops-admin-id="${escapeHTML(item.id)}">Open GovernanceOps</button>
        </div>
      </article>
    `;
    })
    .join("");

  return `
    <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="admin-change-queue">
      <div class="metric-title-row">
        <div class="title">Admin Change Queue</div>
        <span class="chip chip-neutral chip-compact">total=${escapeHTML(String(board.queueItems.length))}</span>
      </div>
      <div class="policyops-queue-list">${cards}</div>
    </article>
  `;
}

function renderPolicyPackDraftBoard(snapshot) {
  const board = snapshot.admin;
  const draft = board.draft || {};
  const selectedChangeId = String(board.selectedChangeId || "").trim();
  const packOptions = (Array.isArray(snapshot.policyCatalogItems) ? snapshot.policyCatalogItems : [])
    .map((item) => {
      const packId = String(item?.packId || "").trim();
      const label = String(item?.label || "").trim();
      const version = String(item?.version || "").trim();
      if (!packId) {
        return "";
      }
      const optionLabel = [label || packId, version ? `(${version})` : ""].filter(Boolean).join(" ");
      return `<option value="${escapeHTML(packId)}"${packId === draft.packId ? " selected" : ""}>${escapeHTML(optionLabel)}</option>`;
    })
    .filter(Boolean)
    .join("");
  const providerOptions = (Array.isArray(board.currentScope?.providerOptions) ? board.currentScope.providerOptions : [])
    .map((providerId) => `<option value="${escapeHTML(providerId)}"${providerId === draft.providerId ? " selected" : ""}>${escapeHTML(providerId)}</option>`)
    .join("");

  return `
    <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="policy-pack-load-activation-draft">
      <div class="metric-title-row">
        <div class="title">Policy Pack Load And Activation Draft</div>
        <span class="${policyAdminStatusChipClass(board.selectedQueueItem?.status || "draft")}">${escapeHTML(board.selectedQueueItem?.status || "draft")}</span>
      </div>
      ${renderPolicyAdminActionRow(selectedChangeId, board.selectedQueueItem, board.latestVerification)}
      <div class="policyops-admin-form">
        <label class="field">
          <span class="label">Change Kind</span>
          <select class="filter-input" data-policyops-draft-field="changeKind">
            <option value="load"${draft.changeKind === "load" ? " selected" : ""}>Load Pack</option>
            <option value="activate"${draft.changeKind === "activate" ? " selected" : ""}>Activate Pack</option>
          </select>
        </label>
        <label class="field">
          <span class="label">Policy Pack</span>
          <select class="filter-input" data-policyops-draft-field="packId">
            <option value="">Select a loaded pack</option>
            ${packOptions}
          </select>
        </label>
        <label class="field">
          <span class="label">Decision Provider</span>
          <select class="filter-input" data-policyops-draft-field="providerId">
            <option value="">Select a provider</option>
            ${providerOptions}
          </select>
        </label>
        <label class="field">
          <span class="label">Applicability Scope</span>
          <input class="filter-input" type="text" value="${escapeHTML(draft.targetScope || "")}" data-policyops-draft-field="targetScope" placeholder="tenant / project or equivalent bounded scope" />
        </label>
        <label class="field policyops-field-wide">
          <span class="label">Reason</span>
          <textarea class="filter-input policyops-textarea" rows="3" data-policyops-draft-field="reason" placeholder="required; explain why this bounded policy pack change is needed">${escapeHTML(draft.reason || "")}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renderDecisionProviderScopeBoard(snapshot) {
  const board = snapshot.admin;
  const currentScope = board.currentScope || {};
  const draft = board.draft || {};
  const rawMode = String(snapshot.currentContract?.mode || "").trim();
  const decisionMode = rawMode.toLowerCase() === "oss-only" ? "baseline" : rawMode || snapshot.currentContract?.providerLabel || "-";
  const rows = [
    {
      label: "Current Decision Contract",
      value: renderValuePills([
        { label: "mode", value: decisionMode },
        { label: "pack", value: currentScope.currentPackId || currentScope.currentPackLabel || "-", code: true },
        { label: "version", value: currentScope.currentPackVersion || "unversioned", code: true },
        { label: "provider", value: currentScope.currentProviderId || "-", code: true },
        { label: "posture", value: currentScope.currentActivationPosture || "-" },
        { label: "target", value: currentScope.currentActivationTarget || "-", code: true },
        { label: "contract", value: currentScope.contractId || "-", code: true },
        { label: "decision", value: currentScope.latestDecision || "-" }
      ])
    },
    {
      label: "Proposed Target Contract",
      value: renderValuePills([
        { label: "change", value: draft.changeKind || "load" },
        { label: "pack", value: currentScope.targetPackId || draft.packId || "-", code: true },
        { label: "version", value: currentScope.targetPackVersion || "unversioned", code: true },
        { label: "provider", value: draft.providerId || "-", code: true },
        { label: "scope", value: currentScope.targetActivationTarget || draft.targetScope || "-", code: true },
        { label: "schema", value: currentScope.targetSchemaReadiness || "-" },
        { label: "compile", value: currentScope.targetCompileReadiness || "-" }
      ])
    },
    {
      label: "Applicability Signals",
      value: renderValuePills([
        { label: "boundary", value: currentScope.boundaryClass || "-" },
        { label: "risk", value: currentScope.riskTier || "-" },
        { label: "surfaces", value: String(currentScope.decisionSurfaceCount || 0) },
        { label: "requirements", value: String(currentScope.boundaryRequirementCount || 0) }
      ])
    },
    {
      label: "Stable References",
      value: renderValuePills([
        { label: "current stable", value: currentScope.currentPackStableRef || "-", code: true },
        { label: "target stable", value: currentScope.targetPackStableRef || "-", code: true },
        { label: "current source", value: currentScope.currentPackSourceRef || "-", code: true },
        { label: "target source", value: currentScope.targetPackSourceRef || "-", code: true }
      ])
    },
    {
      label: "Catalog Readiness",
      value: renderValuePills([
        { label: "packs", value: String(currentScope.packCount || 0) },
        { label: "source", value: currentScope.catalogSource || "-" },
        { label: "schema ready", value: String(currentScope.schemaReadyCount || 0) },
        { label: "compile ready", value: String(currentScope.compileReadyCount || 0) },
        { label: "missing stable refs", value: String(currentScope.packsMissingStableRefs || 0) },
        { label: "missing versions", value: String(currentScope.packsMissingVersions || 0) },
        { label: "missing surfaces", value: String(currentScope.packsMissingDecisionSurfaces || 0) },
        { label: "missing boundaries", value: String(currentScope.packsMissingBoundaryRequirements || 0) }
      ])
    }
  ];

  return `
    <article class="metric policyops-card" data-domain-root="policyops" data-policyops-panel="decision-provider-scope">
      <div class="metric-title-row">
        <div class="title">Decision Contract And Applicability Scope</div>
        <span class="${toneChipClass(snapshot.policyCoverage?.tone || "neutral")}">${escapeHTML(snapshot.policyCoverage?.tone || "neutral")}</span>
      </div>
      <div class="meta">Baseline decisions stay real here. Verify the proposed contract before routing it into GovernanceOps.</div>
      <div class="policyops-kv-list">${renderKeyValueRows(rows)}</div>
    </article>
  `;
}

function renderSemanticImpactPreviewBoard(snapshot) {
  const board = snapshot.admin;
  const preview = board.latestSimulation;
  const verification = resolvePolicyAdminVerification(board.selectedQueueItem, board.latestVerification);
  if (!preview) {
    return `
      <article class="metric policyops-card" data-domain-root="policyops" data-policyops-panel="semantic-impact-preview">
        <div class="metric-title-row">
          <div class="title">Semantic Impact Preview</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="policyops-kv-list">
          <div class="policyops-row">
            <div class="policyops-row-label">Status</div>
            <div class="policyops-row-value"><span class="policyops-empty">Run a bounded dry-run and verify gate before routing this proposal into deeper governance review.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const findings = Array.isArray(preview.findings) ? preview.findings : [];
  return `
    <article class="metric policyops-card" data-domain-root="policyops" data-policyops-panel="semantic-impact-preview">
      <div class="metric-title-row">
        <div class="title">Semantic Impact Preview</div>
        <span class="${toneChipClass(preview.tone)}">${escapeHTML(preview.tone || "info")}</span>
      </div>
      <div class="policyops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(preview.changeId || "-")}</span>
        <span class="chip chip-neutral chip-compact">updated=${escapeHTML(preview.updatedAt || "-")}</span>
      </div>
      <div class="policyops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Summary",
            value: escapeHTML(preview.summary || "-")
          },
          {
            label: "Preview Facts",
            value: renderValuePills(preview.facts || [])
          },
          {
            label: "Rigor Gate",
            value: renderValuePills([
              { label: "pack", value: board.currentScope?.targetPackId || board.draft?.packId || "-", code: true },
              { label: "version", value: board.currentScope?.targetPackVersion || "unversioned", code: true },
              { label: "schema", value: board.currentScope?.targetSchemaReadiness || "-" },
              { label: "compile", value: board.currentScope?.targetCompileReadiness || "-" },
              { label: "stable ref", value: board.currentScope?.targetPackStableRef || "-", code: true }
            ])
          },
          {
            label: "Verify Gate",
            value: renderValuePills([
              { label: "gate", value: verification?.passing ? "passed" : verification ? "failed" : "pending" },
              { label: "compile", value: verification?.compileStatus || "-" },
              { label: "lint", value: verification?.lintStatus || "-" },
              { label: "golden", value: verification?.goldenStatus || "-" },
              { label: "verified", value: verification?.verifiedAt || "-" }
            ])
          },
          {
            label: "Verify Gate Diff",
            value: escapeHTML(
              verification?.diffSummary ||
                "Run Verify Gate to capture the bounded current-versus-target decision contract diff and golden simulation posture."
            )
          },
          {
            label: "Golden Simulation Set",
            value: renderVerificationCases(verification)
          },
          {
            label: "Findings",
            value:
              findings.length > 0
                ? `<ul class="policyops-finding-list">${findings.map((entry) => `<li>${escapeHTML(entry)}</li>`).join("")}</ul>`
                : '<span class="policyops-empty">No additional bounded findings were produced.</span>'
          }
        ])}
      </div>
      <div class="policyops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="open-governance"${board.selectedChangeId ? ` data-policyops-admin-id="${escapeHTML(board.selectedChangeId)}"` : ""}>Open GovernanceOps</button>
      </div>
    </article>
  `;
}

function renderPolicyGovernanceRouteReceiptBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="governance-route-receipt">
        <div class="metric-title-row">
          <div class="title">Governance Route And Receipt State</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="policyops-kv-list">
          <div class="policyops-row">
            <div class="policyops-row-label">Status</div>
            <div class="policyops-row-value"><span class="policyops-empty">Select or queue a policy admin proposal to review verify gate posture, governance route state, and receipt continuity.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const decision = item.decision || null;
  const execution = item.execution || null;
  const receipt = item.receipt || null;
  const rollback = item.rollback || null;
  const verification = resolvePolicyAdminVerification(item, snapshot?.admin?.latestVerification);
  const status = String(item.status || "").trim().toLowerCase() || "draft";
  const canApply = status === "approved" && Boolean(decision?.approvalReceiptId) && !receipt?.receiptId;
  const rows = [
    {
      label: "Route Posture",
      value: renderValuePills([
        { label: "routed", value: item.routedAt },
        { label: "summary", value: item.summary },
        { label: "simulation", value: item.simulationSummary }
      ])
    },
    {
      label: "Verification",
      value: renderValuePills([
        { label: "gate", value: verification?.passing ? "passed" : verification ? "failed" : "pending" },
        { label: "compile", value: verification?.compileStatus || "-" },
        { label: "lint", value: verification?.lintStatus || "-" },
        { label: "golden", value: verification?.goldenStatus || "-" },
        { label: "verified", value: verification?.verifiedAt || "-" }
      ])
    },
    {
      label: "Verify Gate Diff",
      value: escapeHTML(verification?.diffSummary || "Run Verify Gate before routing this proposal to GovernanceOps.")
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
      value: escapeHTML(String(decision?.reason || item.reason || "").trim() || "-")
    },
    {
      label: "Apply Posture",
      value: renderValuePills([
        { label: "execution", value: execution?.executionId, code: true },
        { label: "status", value: execution?.status },
        { label: "executed", value: execution?.executedAt },
        { label: "actor", value: execution?.actorRef, code: true }
      ])
    },
    {
      label: "Applied Admin Receipt",
      value: renderValuePills([
        { label: "receipt", value: receipt?.receiptId, code: true },
        { label: "issued", value: receipt?.issuedAt },
        { label: "stable ref", value: receipt?.stableRef, code: true },
        { label: "approval receipt", value: receipt?.approvalReceiptId, code: true }
      ])
    },
    {
      label: "Rollback",
      value: renderValuePills([
        { label: "action", value: rollback?.action },
        { label: "status", value: rollback?.status },
        { label: "record", value: rollback?.rollbackId, code: true },
        { label: "at", value: rollback?.rolledBackAt }
      ])
    }
  ];

  return `
    <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="governance-route-receipt">
      <div class="metric-title-row">
        <div class="title">Governance Route And Receipt State</div>
        <span class="${policyAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="policyops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(item.id)}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(item.kind || "policy")}</span>
        <span class="${verificationChipClass(verification?.passing ? "pass" : verification ? "fail" : "unknown")}">${escapeHTML(
          verification?.passing ? "verify passed" : verification ? "verify failed" : "verify pending"
        )}</span>
        ${decision?.approvalReceiptId ? '<span class="chip chip-ok chip-compact">approval receipt</span>' : '<span class="chip chip-neutral chip-compact">decision pending</span>'}
        ${receipt?.receiptId ? '<span class="chip chip-ok chip-compact">admin receipt</span>' : '<span class="chip chip-neutral chip-compact">apply pending</span>'}
        ${rollback?.rollbackId ? `<span class="${policyAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "rollback")}</span>` : '<span class="chip chip-neutral chip-compact">recovery pending</span>'}
      </div>
      <div class="meta">Companion stays the daily operator lane. Use this state to confirm verify gate, governance route, and receipt continuity before any live policy-pack change.</div>
      <div class="policyops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="policyops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="open-governance" data-policyops-admin-id="${escapeHTML(item.id)}">Open GovernanceOps</button>
        <button class="btn btn-ok btn-small" type="button" data-policyops-admin-action="apply-approved-change" data-policyops-admin-id="${escapeHTML(item.id)}"${canApply ? "" : " disabled"}>Apply Approved Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="copy-governance-receipt" data-policyops-admin-id="${escapeHTML(item.id)}"${decision?.approvalReceiptId ? "" : " disabled"}>Copy Governance Receipt</button>
        <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="copy-admin-receipt" data-policyops-admin-id="${escapeHTML(item.id)}"${receipt?.receiptId ? "" : " disabled"}>Copy Admin Receipt</button>
      </div>
    </article>
  `;
}

function renderPolicyRollbackHistoryBoard(snapshot) {
  const item = snapshot?.admin?.selectedQueueItem || null;
  if (!item) {
    return `
      <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="rollback-history">
        <div class="metric-title-row">
          <div class="title">Rollback And History</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="policyops-kv-list">
          <div class="policyops-row">
            <div class="policyops-row-label">Status</div>
            <div class="policyops-row-value"><span class="policyops-empty">Select an applied policy admin proposal to review recovery posture, bounded history, and rollback actions.</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const decision = item.decision || null;
  const execution = item.execution || null;
  const receipt = item.receipt || null;
  const rollback = item.rollback || null;
  const status = String(item.status || "").trim().toLowerCase() || "draft";
  const canRollback = status === "applied" && Boolean(receipt?.receiptId) && !rollback?.rollbackId;
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
    {
      label: "Rollback",
      at: rollback?.rolledBackAt,
      summary: rollback?.summary
    }
  ].filter((entry) => entry.at || entry.summary);
  const historyMarkup =
    historyItems.length > 0
      ? `<div class="policyops-history-list">${historyItems
          .map(
            (entry) => `
              <div class="policyops-history-item">
                <div class="policyops-history-stage">${escapeHTML(entry.label)}</div>
                <div class="policyops-history-time">${escapeHTML(entry.at || "-")}</div>
                <div class="policyops-history-summary">${escapeHTML(entry.summary || "-")}</div>
              </div>
            `
          )
          .join("")}</div>`
      : '<div class="policyops-empty">No bounded policy admin history is available yet.</div>';

  return `
    <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="rollback-history">
      <div class="metric-title-row">
        <div class="title">Rollback And History</div>
        <span class="${policyAdminStatusChipClass(status)}">${escapeHTML(status)}</span>
      </div>
      <div class="policyops-chip-row">
        <span class="chip chip-neutral chip-compact">change=${escapeHTML(item.id)}</span>
        <span class="chip chip-neutral chip-compact">kind=${escapeHTML(item.kind || "policy")}</span>
        ${rollback?.rollbackId ? `<span class="${policyAdminStatusChipClass(rollback.status)}">${escapeHTML(rollback.action || "rollback")}</span>` : `<span class="chip chip-neutral chip-compact">${escapeHTML(canRollback ? "rollback available" : "recovery pending")}</span>`}
      </div>
      <div class="policyops-kv-list">
        ${renderKeyValueRows([
          {
            label: "Recovery Posture",
            value: renderValuePills([
              { label: "state", value: rollback?.status || (canRollback ? "rollback available" : "recovery pending") },
              { label: "action", value: rollback?.action || (canRollback ? "rollback" : "") },
              { label: "record", value: rollback?.rollbackId, code: true },
              { label: "stable ref", value: rollback?.stableRef, code: true }
            ])
          },
          {
            label: "Recovery Reason",
            value: rollback?.reason ? escapeHTML(rollback.reason) : '<span class="policyops-empty">A bounded reason is required before rollback can execute.</span>'
          },
          {
            label: "Stable History",
            value: historyMarkup
          }
        ])}
      </div>
      <label class="field policyops-field-wide">
        <span class="label">Rollback Reason</span>
        <input
          class="filter-input"
          type="text"
          value="${escapeHTML(recoveryReason)}"
          placeholder="required; explain the rollback action"
          data-policyops-admin-recovery-reason
        />
      </label>
      <div class="policyops-action-row">
        <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="rollback-applied-change" data-policyops-admin-id="${escapeHTML(item.id)}"${canRollback ? "" : " disabled"}>Rollback Applied Change</button>
        <button class="btn btn-secondary btn-small" type="button" data-policyops-admin-action="copy-rollback-receipt" data-policyops-admin-id="${escapeHTML(item.id)}"${rollback?.rollbackId ? "" : " disabled"}>Copy Rollback Receipt</button>
      </div>
    </article>
  `;
}

function renderDecisionExplanationBoard(snapshot) {
  const board = snapshot.decisionExplanation;
  const premiumDecisionVisible = Boolean(snapshot?.aimxsPremiumVisible);
  const boardTitle = premiumDecisionVisible ? "Routed Decision Explanation" : "Decision Explanation";
  const outcomeTitle = premiumDecisionVisible ? "Current Routed Outcome" : "Current Outcome";
  if (!board.available || !board.richness || !board.outcome) {
    return `
      <article class="metric policyops-card" data-domain-root="policyops" data-policyops-panel="decision-explanation">
        <div class="metric-title-row">
          <div class="title">${boardTitle}</div>
          <span class="chip chip-neutral chip-compact">idle</span>
        </div>
        <div class="policyops-kv-list">
          <div class="policyops-row">
            <div class="policyops-row-label">Status</div>
            <div class="policyops-row-value"><span class="policyops-empty">${escapeHTML(premiumDecisionVisible ? "No recorded routed decision explanation is loaded." : "No recorded policy decision is loaded.")}</span></div>
          </div>
        </div>
      </article>
    `;
  }

  const providerLabel = displayPolicyProviderLabel(board.selectedPolicyProvider || board.outcome.provider || "-");
  const rows = [
    {
      label: premiumDecisionVisible ? "Decision Route" : "Decision Source",
      value: renderValuePills([
        { label: "decision", value: board.richness.decision || "UNSET" },
        { label: "provider", value: providerLabel, code: true },
        { label: "run", value: board.runId || "-", code: true },
        { label: "updated", value: board.updatedAt || "-", code: true }
      ])
    },
    {
      label: premiumDecisionVisible ? "Governed Contract" : "Governed Request",
      value: renderValuePills([
        { label: "contract", value: board.richness.contractId || "-" , code: true},
        { label: "workflow", value: board.richness.workflowKind || "-" },
        { label: "label", value: board.richness.requestLabel || "-" },
        { label: "pack", value: board.activePackId || board.activePackLabel || "-", code: Boolean(board.activePackId) }
      ])
    },
    {
      label: premiumDecisionVisible ? "Decision Context" : "Rationale",
      value: renderValuePills([
        { label: "boundary", value: board.richness.boundaryClass || "-" },
        { label: "risk", value: board.richness.riskTier || "-" },
        { label: "grants", value: String(board.richness.requiredGrants.length || 0) },
        { label: "reason", value: board.richness.firstReason || "-" }
      ])
    },
    {
      label: premiumDecisionVisible ? "Authority Context" : "Authority Input",
      value: renderValuePills([
        { label: "subject", value: board.richness.actorSubject || "-", code: true },
        { label: "basis", value: board.richness.authorityBasis || "-" },
        { label: "tenant", value: board.richness.authorityTenantScopes.join(", ") || "-" },
        { label: "project", value: board.richness.authorityProjectScopes.join(", ") || "-" }
      ])
    },
    {
      label: premiumDecisionVisible ? "Follow-Through" : "Governance Linkage",
      value: renderValuePills([
        { label: "operator approval", value: board.richness.operatorApprovalRequired ? "required" : "baseline decision lane" },
        { label: "evidence refs", value: String(board.richness.evidenceRefCount || 0) },
        { label: "audit ref", value: board.richness.auditEventRef || "-", code: true }
      ])
    }
  ];

  return `
    <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="decision-explanation">
      <div class="metric-title-row">
        <div class="title">${boardTitle}</div>
        ${board.outcome.decision ? `<span class="${chipClassForStatus(board.outcome.decision)} chip-compact">${escapeHTML(board.outcome.decision)}</span>` : ""}
      </div>
      ${renderActionButtons([
        {
          label: premiumDecisionVisible ? "Export Routed Decision Explanation" : "Export Decision Explanation",
          command: "export-decision-explanation",
          disabled: !board.exportable
        },
        {
          label: "Copy Stable Policy References",
          command: "copy-stable-policy-references",
          disabled: !snapshot.stableReferences.contractId && !snapshot.stableReferences.runId
        },
        {
          label: premiumDecisionVisible ? "Open Routed Governance" : "Open Linked Governance",
          command: "open-linked-governance",
          disabled: !board.runId
        }
      ])}
      <div class="${escapeHTML(board.outcome.bannerClass)}">
        <div class="metric-title-row">
          <div class="title">${outcomeTitle}</div>
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
        ${premiumDecisionVisible ? `<span class="chip chip-neutral chip-compact">authority=${escapeHTML(board.richness.authorityBasis || "-")}</span>` : ""}
        ${premiumDecisionVisible ? `<span class="chip chip-neutral chip-compact">path=${escapeHTML(board.richness.decisionPath || "-")}</span>` : ""}
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

function renderAimxsIdentityPostureEchoBoard(snapshot) {
  const aimxsPremiumVisible = Boolean(snapshot?.aimxsPremiumVisible);
  return `
    <article class="metric policyops-card policyops-card-wide" data-domain-root="policyops" data-policyops-panel="aimxs-identity-posture-echo">
      <div class="metric-title-row">
        <div class="title">${escapeHTML(aimxsPremiumVisible ? "Routed Identity And Posture" : "Identity And Posture Echo")}</div>
        <span class="chip chip-neutral chip-compact">read-only</span>
      </div>
      ${renderAimxsIdentityPostureBlock(snapshot.aimxsIdentityPosture)}
    </article>
  `;
}

export function renderPolicyWorkspace(context = {}) {
  const snapshot = createPolicyWorkspaceSnapshot(context);
  return `
    <div class="policyops-workspace" data-domain-root="policyops">
      ${renderFeedbackPanel(snapshot)}
      <div class="policyops-admin-grid">
        ${renderAdminChangeQueueBoard(snapshot)}
        ${renderPolicyPackDraftBoard(snapshot)}
        ${renderDecisionProviderScopeBoard(snapshot)}
        ${renderSemanticImpactPreviewBoard(snapshot)}
        ${renderPolicyGovernanceRouteReceiptBoard(snapshot)}
        ${renderPolicyRollbackHistoryBoard(snapshot)}
      </div>
      <div class="policyops-primary-grid">
        ${renderCurrentPolicyContractPanel(snapshot.settings)}
        ${renderDecisionExplanationBoard(snapshot)}
        ${renderAimxsIdentityPostureEchoBoard(snapshot)}
        ${renderPolicyCoverageBoard(snapshot)}
        ${renderPolicySimulationBoard(snapshot)}
        ${renderPolicyPackCatalogPanel(snapshot.settings)}
      </div>
    </div>
  `;
}
