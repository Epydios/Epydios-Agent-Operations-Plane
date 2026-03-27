import {
  chipClassForStatus,
  escapeHTML,
  formatTime,
  renderPanelStateMetric
} from "../../../views/common.js";
import {
  renderWorkbenchDomainCluster,
  renderWorkbenchDomainShell
} from "../../../shell/layout/workbench-domain.js";
import { renderAimxsLegibilityBlock } from "../../../shared/components/aimxs-legibility.js";
import { renderAimxsDecisionBindingSpine } from "../../../shared/components/aimxs-decision-binding-spine.js";
import { createEvidenceWorkspaceSnapshot } from "../state.js";

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
        <span class="evidenceops-value-pill">
          <span class="evidenceops-value-key">${escapeHTML(label)}</span>
          <span class="evidenceops-value-text${item?.code ? " evidenceops-value-text-code" : ""}">
            ${item?.code ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}
          </span>
        </span>
      `;
    })
    .filter(Boolean);
  if (values.length === 0) {
    return '<span class="evidenceops-empty">not available</span>';
  }
  return `<div class="evidenceops-value-group">${values.join("")}</div>`;
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
        <div class="evidenceops-row">
          <div class="evidenceops-row-label">${escapeHTML(label)}</div>
          <div class="evidenceops-row-value">${value || '<span class="evidenceops-empty">-</span>'}</div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
}

function renderAccessCards(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '<div class="evidenceops-empty">No handoff locations are currently available.</div>';
  }
  return `
    <div class="evidenceops-access-grid">
      ${entries
        .map(
          (entry) => `
            <article class="evidenceops-access-card">
              <div class="metric-title-row">
                <div class="title">${escapeHTML(entry.label || "-")}</div>
              </div>
              <pre class="evidenceops-access-path">${escapeHTML(entry.path || "-")}</pre>
              <div class="meta">${escapeHTML(entry.note || "")}</div>
              <div class="evidenceops-access-actions">
                <button
                  class="btn btn-secondary btn-small"
                  type="button"
                  data-evidenceops-copy-path="${escapeHTML(entry.path || "")}"
                  data-evidenceops-copy-path-label="${escapeHTML(entry.label || "Location")}"
                >Copy Location</button>
              </div>
            </article>
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
      return `<button class="btn btn-secondary btn-small" type="button" data-evidenceops-action="${escapeHTML(command)}"${action?.disabled ? " disabled" : ""}>${escapeHTML(label)}</button>`;
    })
    .filter(Boolean);
  if (buttons.length === 0) {
    return "";
  }
  return `<div class="evidenceops-action-row">${buttons.join("")}</div>`;
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
      ? "EvidenceOps Action Complete"
      : tone === "error"
        ? "EvidenceOps Action Failed"
        : tone === "warn"
          ? "EvidenceOps Action Needs Review"
          : "EvidenceOps Action";
  return `<div class="evidenceops-feedback-panel">${renderPanelStateMetric(state, title, snapshot.feedback.message)}</div>`;
}

function renderEvidenceBundleBoard(snapshot) {
  const board = snapshot.evidenceBundleBoard;
  const rows = [
    {
      label: "Bundle Coverage",
      value: renderValuePills([
        { label: "bundles", value: String(board.bundleCount) },
        { label: "approvals", value: String(board.linkedApprovalCount) },
        { label: "incidents", value: String(board.linkedIncidentCount) },
        { label: "audit rows", value: String(board.auditMatchedCount) }
      ])
    },
    {
      label: "Latest Bundle",
      value: renderValuePills([
        { label: "bundle", value: board.latestBundle.bundleId, code: true },
        { label: "run", value: board.latestBundle.runId, code: true },
        { label: "status", value: board.latestBundle.status || "-" },
        { label: "provider", value: board.latestBundle.evidenceProvider, code: true },
        { label: "updated", value: board.latestBundle.updatedAt ? formatTime(board.latestBundle.updatedAt) : "-" }
      ])
    },
    {
      label: "Package Links",
      value: renderValuePills([
        { label: "approval", value: board.latestBundle.approvalId, code: true },
        { label: "scope", value: board.latestBundle.scope, code: true },
        { label: "audit source", value: board.auditSource, code: true },
        { label: "incident package", value: board.latestIncidentPackage.packageId, code: true }
      ])
    },
    {
      label: "Bundle Material",
      value: renderValuePills([
        { label: "artifacts", value: String(board.artifactCount) },
        { label: "screenshots", value: String(board.screenshotCount) },
        { label: "sealed", value: String(board.sealedCount) },
        { label: "collecting", value: String(board.collectingCount) }
      ])
    }
  ];
  return `
    <article class="metric evidenceops-card" data-domain-root="evidenceops" data-evidenceops-panel="evidence-bundle-board">
      <div class="metric-title-row">
        <div class="title">Evidence Package</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="evidenceops-chip-row">
        <span class="chip chip-neutral chip-compact">bundles=${escapeHTML(String(board.bundleCount))}</span>
        <span class="chip chip-neutral chip-compact">ready=${escapeHTML(String(board.readyCount))}</span>
        <span class="chip chip-neutral chip-compact">sealed=${escapeHTML(String(board.sealedCount))}</span>
        <span class="chip chip-neutral chip-compact">degraded=${escapeHTML(String(board.degradedCount))}</span>
      </div>
      ${renderActionButtons([
        { label: "Download Evidence Package", command: "download-bundle-json", disabled: !board.canExportReview },
        { label: "Open Governed Run", command: "open-bundle-run", disabled: !board.canOpenRun },
        { label: "Open Incident Packages", command: "open-incidentops", disabled: !board.canOpenIncidentOps }
      ])}
      <div class="evidenceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="evidenceops-subsection">
        <div class="evidenceops-subtitle">Active Scopes</div>
        ${renderValuePills((board.topScopes || []).map((item) => ({ label: item.value, value: String(item.count), code: true })))}
      </div>
    </article>
  `;
}

function renderProvenanceBoard(snapshot) {
  const board = snapshot.provenanceBoard;
  const rows = [
    {
      label: "Coverage",
      value: renderValuePills([
        { label: "artifacts", value: String(board.artifactCount) },
        { label: "hashes", value: String(board.hashedCount) },
        { label: "uris", value: String(board.directUriCount) },
        { label: "thread refs", value: String(board.threadArtifactCount) }
      ])
    },
    {
      label: "Latest Provenance",
      value: renderValuePills([
        { label: "artifact", value: board.latestArtifact.artifactId, code: true },
        { label: "kind", value: board.latestArtifact.kind },
        { label: "hash", value: board.latestArtifact.hash, code: true },
        { label: "bundle", value: board.bundleId, code: true },
        { label: "created", value: board.latestArtifact.createdAt ? formatTime(board.latestArtifact.createdAt) : "-" }
      ])
    },
    {
      label: "Bounded References",
      value: renderValuePills([
        { label: "task", value: board.taskId, code: true },
        { label: "run", value: board.latestArtifact.runId, code: true },
        { label: "package", value: board.latestIncidentPackage.packageId, code: true },
        { label: "causal refs", value: String(board.boundedCausalReferenceCount) }
      ])
    },
    {
      label: "Linked Sources",
      value: renderValuePills([
        { label: "audit", value: board.auditSource, code: true },
        { label: "incident packages", value: String(board.incidentPackageCount) },
        { label: "latest package status", value: board.latestIncidentPackage.filingStatus }
      ])
    }
  ];
  return `
    <article class="metric evidenceops-card" data-domain-root="evidenceops" data-evidenceops-panel="provenance-board">
      <div class="metric-title-row">
        <div class="title">Provenance Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="evidenceops-chip-row">
        <span class="chip chip-neutral chip-compact">artifacts=${escapeHTML(String(board.artifactCount))}</span>
        <span class="chip chip-neutral chip-compact">hashes=${escapeHTML(String(board.hashedCount))}</span>
        <span class="chip chip-neutral chip-compact">uris=${escapeHTML(String(board.directUriCount))}</span>
        <span class="chip chip-neutral chip-compact">refs=${escapeHTML(String(board.boundedCausalReferenceCount))}</span>
      </div>
      ${renderActionButtons([
        { label: "Download Provenance JSON", command: "download-provenance-json", disabled: !board.canExportReview },
        { label: "Open AuditOps", command: "open-auditops", disabled: !board.canOpenAuditOps }
      ])}
      <div class="evidenceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="evidenceops-subsection">
        <div class="evidenceops-subtitle">Source Kinds</div>
        ${renderValuePills((board.sourceKinds || []).map((item) => ({ label: item.value, value: String(item.count) })))}
      </div>
    </article>
  `;
}

function renderAimxsDecisionBindingSpineBoard(snapshot) {
  const board = snapshot.aimxsDecisionBindingSpine;
  if (!board?.available) {
    return "";
  }
  return `
    <article class="metric evidenceops-card" data-domain-root="evidenceops" data-evidenceops-panel="aimxs-decision-binding-spine">
      <div class="metric-title-row">
        <div class="title">AIMXS Decision-Binding Spine</div>
        <span class="chip chip-neutral chip-compact">correlated</span>
      </div>
      ${renderAimxsDecisionBindingSpine(board)}
    </article>
  `;
}

function renderAdminChangeProvenanceBoard(snapshot) {
  const board = snapshot.adminChangeProvenanceBoard;
  const latest = board.latestTrace || {};
  const rows = [
    {
      label: "Coverage",
      value: renderValuePills([
        { label: "traces", value: String(board.totalCount) },
        { label: "full lifecycle", value: String(board.fullLifecycleCount) },
        { label: "stable refs", value: String(board.stableRefCount) }
      ])
    },
    {
      label: "Latest Admin Change",
      value: renderValuePills([
        { label: "change", value: latest.id, code: true },
        { label: "owner", value: latest.ownerDomain, code: true },
        { label: "action", value: latest.requestedAction },
        { label: "status", value: latest.status }
      ])
    },
    {
      label: "Proposal And Simulation",
      value: renderValuePills([
        { label: "subject", value: latest.subjectId, code: true },
        { label: "scope", value: latest.targetScope, code: true },
        { label: "simulated", value: latest.simulatedAt ? formatTime(latest.simulatedAt) : "-" },
        { label: "summary", value: latest.simulationSummary || latest.summary }
      ])
    },
    {
      label: "Decision And Execution",
      value: renderValuePills([
        { label: "decision", value: latest.decision?.decisionId, code: true },
        { label: "approval", value: latest.decision?.approvalReceiptId, code: true },
        { label: "execution", value: latest.execution?.executionId, code: true },
        { label: "receipt", value: latest.receipt?.receiptId, code: true }
      ])
    },
    {
      label: "Recovery And Stable Refs",
      value: renderValuePills([
        { label: "recovery", value: latest.recovery?.recoveryId, code: true },
        { label: "action", value: latest.recovery?.action },
        { label: "receipt ref", value: latest.receipt?.stableRef, code: true },
        { label: "recovery ref", value: latest.recovery?.stableRef, code: true }
      ])
    },
    {
      label: "Top Owners",
      value: renderValuePills((board.ownerMix || []).map((item) => ({ label: item.value, value: String(item.count), code: true })))
    }
  ];
  return `
    <article class="metric evidenceops-card" data-domain-root="evidenceops" data-evidenceops-panel="admin-change-provenance-board">
      <div class="metric-title-row">
        <div class="title">Admin Change Provenance</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="evidenceops-chip-row">
        <span class="chip chip-neutral chip-compact">traces=${escapeHTML(String(board.totalCount))}</span>
        <span class="chip chip-neutral chip-compact">full=${escapeHTML(String(board.fullLifecycleCount))}</span>
        <span class="chip chip-neutral chip-compact">stableRefs=${escapeHTML(String(board.stableRefCount))}</span>
      </div>
      <div class="evidenceops-kv-list">${renderKeyValueRows(rows)}</div>
      ${renderAimxsLegibilityBlock(board.aimxsLegibility)}
    </article>
  `;
}

function renderArtifactAccessBoard(snapshot) {
  const board = snapshot.artifactAccessBoard;
  const rows = [
    {
      label: "Handoff Coverage",
      value: renderValuePills([
        { label: "artifacts", value: String(board.artifactCount) },
        { label: "direct uris", value: String(board.directUriCount) },
        { label: "hash only", value: String(board.hashOnlyCount) },
        { label: "runs", value: String(board.linkedRunCount) }
      ])
    },
    {
      label: "Latest Reachable Evidence",
      value: renderValuePills([
        { label: "artifact", value: board.latestArtifact.artifactId, code: true },
        { label: "kind", value: board.latestArtifact.kind },
        { label: "uri", value: board.latestArtifact.uri, code: true },
        { label: "run", value: board.latestArtifact.runId, code: true },
        { label: "task", value: board.latestArtifact.taskId, code: true }
      ])
    },
    {
      label: "Linked Review And Incident Flow",
      value: renderValuePills([
        { label: "bundles", value: board.latestBundle.bundleId, code: true },
        { label: "bundle status", value: board.latestBundle.status },
        { label: "approvals", value: String(board.linkedApprovalCount) },
        { label: "incidents", value: String(board.linkedIncidentCount) }
      ])
    },
    {
      label: "Latest Incident Package",
      value: renderValuePills([
        { label: "package", value: board.latestIncidentPackage.packageId, code: true },
        { label: "file", value: board.latestIncidentPackage.fileName, code: true },
        { label: "status", value: board.latestIncidentPackage.filingStatus },
        { label: "retention", value: board.latestArtifact.retentionClass }
      ])
    }
  ];
  return `
    <article class="metric evidenceops-card" data-domain-root="evidenceops" data-evidenceops-panel="artifact-access-board">
      <div class="metric-title-row">
        <div class="title">Package Handoff Locations</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="evidenceops-chip-row">
        <span class="chip chip-neutral chip-compact">artifacts=${escapeHTML(String(board.artifactCount))}</span>
        <span class="chip chip-neutral chip-compact">direct=${escapeHTML(String(board.directUriCount))}</span>
        <span class="chip chip-neutral chip-compact">hashOnly=${escapeHTML(String(board.hashOnlyCount))}</span>
        <span class="chip chip-neutral chip-compact">paths=${escapeHTML(String((board.accessEntries || []).length))}</span>
      </div>
      ${renderActionButtons([
        { label: "Copy Latest Evidence Location", command: "copy-latest-uri", disabled: !board.canCopyLatestUri },
        { label: "Copy Suggested Package Folder", command: "copy-suggested-run-folder", disabled: !board.canCopySuggestedRunFolder },
        { label: "Open Governed Run", command: "open-artifact-run", disabled: !board.canOpenRun }
      ])}
      <div class="evidenceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="evidenceops-subsection">
        <div class="evidenceops-subtitle">Handoff Locations</div>
        ${renderAccessCards(board.accessEntries)}
      </div>
    </article>
  `;
}

function renderRetentionBoard(snapshot) {
  const board = snapshot.retentionBoard;
  const rows = [
    {
      label: "Retention Defaults",
      value: renderValuePills([
        { label: "audit events", value: `${board.defaults.auditEvents}d` },
        { label: "incident packages", value: `${board.defaults.incidentPackages}d` },
        { label: "terminal history", value: `${board.defaults.terminalHistory}d` },
        { label: "run snapshots", value: `${board.defaults.runSnapshots}d` }
      ])
    },
    {
      label: "Live Retention Classes",
      value: renderValuePills([
        { label: "tagged", value: String(board.taggedCount) },
        { label: "unset", value: String(board.unsetCount) },
        { label: "artifact", value: board.latestArtifact.retentionClass, code: true },
        { label: "bundle", value: board.latestBundle.retentionClass, code: true }
      ])
    },
    {
      label: "Latest Retained Material",
      value: renderValuePills([
        { label: "artifact", value: board.latestArtifact.artifactId, code: true },
        { label: "kind", value: board.latestArtifact.kind },
        { label: "bundle", value: board.latestBundle.bundleId, code: true },
        { label: "package", value: board.latestIncidentPackage.packageId, code: true }
      ])
    },
    {
      label: "Package Queue",
      value: renderValuePills([
        { label: "drafted", value: String(board.queueCounts.drafted || 0) },
        { label: "filed", value: String(board.queueCounts.filed || 0) },
        { label: "closed", value: String(board.queueCounts.closed || 0) },
        { label: "latest status", value: board.latestIncidentPackage.filingStatus }
      ])
    }
  ];
  return `
    <article class="metric evidenceops-card" data-domain-root="evidenceops" data-evidenceops-panel="retention-board">
      <div class="metric-title-row">
        <div class="title">Retention Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="evidenceops-chip-row">
        <span class="chip chip-neutral chip-compact">material=${escapeHTML(String(board.materialCount))}</span>
        <span class="chip chip-neutral chip-compact">tagged=${escapeHTML(String(board.taggedCount))}</span>
        <span class="chip chip-neutral chip-compact">unset=${escapeHTML(String(board.unsetCount))}</span>
      </div>
      <div class="evidenceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="evidenceops-subsection">
        <div class="evidenceops-subtitle">Retention Class Mix</div>
        ${renderValuePills((board.topRetentionClasses || []).map((item) => ({ label: item.value, value: String(item.count), code: true })))}
      </div>
    </article>
  `;
}

function renderControlMappingBoard(snapshot) {
  const board = snapshot.controlMappingBoard;
  const rows = [
    {
      label: "Mapping Coverage",
      value: renderValuePills([
        { label: "mappings", value: String(board.mappingCount) },
        { label: "control classes", value: String(board.controlClassCount) },
        { label: "evidence refs", value: String(board.evidenceRefCount) },
        { label: "approvals", value: String(board.linkedApprovalCount) }
      ])
    },
    {
      label: "Latest Mapping",
      value: renderValuePills([
        { label: "boundary", value: board.latestMapping.boundaryClass, code: true },
        { label: "risk", value: board.latestMapping.riskTier, code: true },
        { label: "decision", value: board.latestMapping.decision },
        { label: "provider", value: board.latestMapping.providerId, code: true },
        { label: "run", value: board.latestMapping.runId, code: true }
      ])
    },
    {
      label: "Readiness And Grants",
      value: renderValuePills([
        { label: "readiness", value: board.latestMapping.evidenceReadiness, code: true },
        { label: "grants", value: String(board.latestMapping.requiredGrantCount) },
        { label: "bundle", value: board.latestMapping.bundleId, code: true },
        { label: "approval", value: board.latestMapping.approvalId, code: true }
      ])
    },
    {
      label: "Bounded Trace",
      value: renderValuePills([
        { label: "scope", value: board.latestMapping.scope, code: true },
        { label: "audit", value: board.auditSource, code: true },
        { label: "incident", value: board.latestIncidentPackage.packageId, code: true },
        { label: "audit hits", value: String(board.latestIncidentPackage.auditMatchedCount) }
      ])
    }
  ];
  return `
    <article class="metric evidenceops-card" data-domain-root="evidenceops" data-evidenceops-panel="control-mapping-board">
      <div class="metric-title-row">
        <div class="title">Evidence To Control Mapping Board</div>
        <span class="${chipClassForTone(board.tone)}">${escapeHTML(board.tone)}</span>
      </div>
      <div class="evidenceops-chip-row">
        <span class="chip chip-neutral chip-compact">mappings=${escapeHTML(String(board.mappingCount))}</span>
        <span class="chip chip-neutral chip-compact">classes=${escapeHTML(String(board.controlClassCount))}</span>
        <span class="chip chip-neutral chip-compact">refs=${escapeHTML(String(board.evidenceRefCount))}</span>
      </div>
      <div class="evidenceops-kv-list">${renderKeyValueRows(rows)}</div>
      <div class="evidenceops-subsection">
        <div class="evidenceops-subtitle">Control Classes</div>
        ${renderValuePills((board.controlClassMix || []).map((item) => ({ label: item.value, value: String(item.count), code: true })))}
      </div>
      <div class="evidenceops-subsection">
        <div class="evidenceops-subtitle">Decision Mix</div>
        ${renderValuePills((board.controlDecisionMix || []).map((item) => ({ label: item.value, value: String(item.count) })))}
      </div>
    </article>
  `;
}

export function renderEvidenceWorkspace(context = {}) {
  const snapshot = createEvidenceWorkspaceSnapshot(context);
  return renderWorkbenchDomainShell({
    domainRoot: "evidenceops",
    shellClass: "evidenceops-workspace",
    title: "EvidenceOps",
    lead:
      "Use the deeper proof console for governed bundles, provenance continuity, artifact access, and control mapping without flattening evidence ownership into one long board.",
    layout: "split",
    prelude: `
      ${renderFeedbackPanel(snapshot)}
      ${renderAimxsDecisionBindingSpineBoard(snapshot)}
    `,
    clusters: [
      renderWorkbenchDomainCluster({
        title: "Bundle And Provenance",
        lead:
          "Keep the active evidence package, provenance trace, and admin change provenance together so proof continuity stays visible at a glance.",
        bodyClass: "stack",
        body: `
          ${renderEvidenceBundleBoard(snapshot)}
          ${renderProvenanceBoard(snapshot)}
          ${renderAdminChangeProvenanceBoard(snapshot)}
        `
      }),
      renderWorkbenchDomainCluster({
        title: "Access And Retention",
        lead:
          "Show artifact handoff paths and retention posture together as the operational evidence access lane rather than scattering them across proof views.",
        bodyClass: "stack",
        body: `
          ${renderArtifactAccessBoard(snapshot)}
          ${renderRetentionBoard(snapshot)}
        `
      }),
      renderWorkbenchDomainCluster({
        title: "Control Mapping",
        lead:
          "Keep control coverage and evidence-to-control traceability visible as the deeper proof-management layer, not just another metrics card.",
        bodyClass: "stack",
        body: `${renderControlMappingBoard(snapshot)}`
      })
    ]
  });
}
